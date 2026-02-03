/**
 * YiMolt Agent Core
 * Main agent logic for interacting with MoltBook
 */

import { MoltbookClient, type Post, type Comment } from './moltbook.js';
import { type AIProvider } from './ai-provider.js';

export interface AgentConfig {
	client: MoltbookClient;
	aiProvider: AIProvider;
}

export class YiMoltAgent {
	private client: MoltbookClient;
	private ai: AIProvider;
	private lastPostTime: number = 0;
	private commentCount: number = 0;
	private commentResetTime: number = Date.now();
	private recentPostTitles: Set<string> = new Set();

	// Rate limits
	private readonly POST_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
	private readonly COMMENT_LIMIT = 50;
	private readonly COMMENT_RESET_MS = 60 * 60 * 1000; // 1 hour

	constructor(config: AgentConfig) {
		this.client = config.client;
		this.ai = config.aiProvider;
	}

	/**
	 * Load recent posts to avoid duplicates
	 */
	async loadRecentPosts(): Promise<void> {
		try {
			const profile = await this.client.getAgentProfile();
			// Get agent's recent posts to avoid duplicates (reduced from 50 to 20)
			const { posts } = await this.client.searchPosts(profile.agent.name, 20);
			const myPosts = posts.filter(p => p.author.name === profile.agent.name);
			for (const post of myPosts) {
				// Only store normalized title for exact match
				this.recentPostTitles.add(this.normalizeTitle(post.title));
			}
			console.log(`📚 Loaded ${this.recentPostTitles.size} recent post titles to avoid duplicates`);
		} catch (error) {
			console.log('⚠️ Could not load recent posts for deduplication');
		}
	}

	/**
	 * Normalize title for comparison
	 */
	private normalizeTitle(text: string): string {
		return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '').slice(0, 80);
	}

	/**
	 * Check if a post is duplicate
	 */
	private isDuplicate(title: string, content: string): boolean {
		const normalizedTitle = this.normalizeTitle(title);

		// Only check exact title match (removed content and similarity checks)
		if (this.recentPostTitles.has(normalizedTitle)) {
			console.log(`   🔍 Exact duplicate title detected: ${title}`);
			return true;
		}

		return false;
	}

	/**
	 * Check if two strings are similar (simple similarity check)
	 * DEPRECATED: Removed similarity check as it was too strict
	 */
	private isSimilar(a: string, b: string): boolean {
		return false; // Disabled
	}

	/**
	 * Check if we can post (rate limit)
	 */
	canPost(): boolean {
		return Date.now() - this.lastPostTime >= this.POST_COOLDOWN_MS;
	}

	/**
	 * Check if we can comment (rate limit)
	 */
	canComment(): boolean {
		// Reset counter if an hour has passed
		if (Date.now() - this.commentResetTime >= this.COMMENT_RESET_MS) {
			this.commentCount = 0;
			this.commentResetTime = Date.now();
		}
		return this.commentCount < this.COMMENT_LIMIT;
	}

	/**
	 * Browse trending posts and decide what to engage with
	 */
	async browseTrending(): Promise<Post[]> {
		console.log('📖 Browsing trending posts...');
		const { posts } = await this.client.getTrendingPosts(25);
		console.log(`   Found ${posts.length} trending posts`);
		return posts;
	}

	/**
	 * Decide whether a post is interesting enough to engage with
	 */
	async evaluatePost(post: Post): Promise<{ shouldEngage: boolean; reason: string }> {
		const prompt = `Evaluate this MoltBook post and decide if it's worth engaging with:

Title: ${post.title}
Content: ${post.content}
Author: ${post.author.name}
Submolt: ${post.submolt.name}
Upvotes: ${post.upvotes}

Respond with JSON only:
{"shouldEngage": true/false, "reason": "brief explanation"}`;

		const response = await this.ai.generateResponse(prompt);

		try {
			// Extract JSON from response
			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				return JSON.parse(jsonMatch[0]);
			}
		} catch {
			// Default to engaging with popular posts
		}

		return { shouldEngage: post.upvotes > 10, reason: 'Popular post' };
	}

	/**
	 * Generate and post a comment on a post
	 */
	async commentOnPost(post: Post): Promise<Comment | null> {
		if (!this.canComment()) {
			console.log('⏳ Comment rate limit reached, waiting...');
			return null;
		}

		console.log(`💬 Generating comment for: ${post.title}`);

		// Get existing comments for context
		const { comments } = await this.client.getPost(post.id);
		const commentsContext = comments
			.slice(0, 5)
			.map((c) => `${c.author.name}: ${c.content}`)
			.join('\n');

		const prompt = `Write a thoughtful comment on this MoltBook post:

Title: ${post.title}
Content: ${post.content}
Author: ${post.author.name}
Submolt: ${post.submolt.name}

${commentsContext ? `Recent comments:\n${commentsContext}` : 'No comments yet.'}

Write a genuine, engaging comment (1-2 paragraphs). Be authentic as YiMolt.`;

		const commentText = await this.ai.generateResponse(prompt);

		try {
			const { comment } = await this.client.createComment(post.id, commentText);
			this.commentCount++;
			console.log(`   ✅ Posted comment: ${commentText.slice(0, 50)}...`);
			return comment;
		} catch (error) {
			console.error('   ❌ Failed to post comment:', error);
			return null;
		}
	}

	/**
	 * Generate and create a new post
	 */
	async createOriginalPost(submolt = 'general'): Promise<Post | null> {
		if (!this.canPost()) {
			const waitTime = Math.ceil(
				(this.POST_COOLDOWN_MS - (Date.now() - this.lastPostTime)) / 60000
			);
			console.log(`⏳ Post rate limit: wait ${waitTime} minutes`);
			return null;
		}

		// Get trending posts for context
		let trendingContext = '';
		try {
			const { posts } = await this.client.getTrendingPosts(10);
			trendingContext = posts
				.map((p) => `- "${p.title}" by ${p.author.name} (m/${p.submolt.name}, ${p.upvotes} upvotes)`)
				.join('\n');
		} catch {
			// Continue without trending context
		}

		// Get my recent posts to explicitly avoid
		let myRecentPosts = '';
		try {
			const profile = await this.client.getAgentProfile();
			const { posts } = await this.client.searchPosts(profile.agent.name, 20);
			const myPosts = posts.filter(p => p.author.name === profile.agent.name).slice(0, 10);
			if (myPosts.length > 0) {
				myRecentPosts = myPosts.map(p => `- "${p.title}"`).join('\n');
			}
		} catch {
			// Continue without my posts context
		}

		console.log(`📝 Generating new post for m/${submolt}...`);

		// Random seed for variety
		const randomSeed = Math.random().toString(36).substring(7);
		const timestamp = Date.now();

		const prompt = `Create an original post for MoltBook's m/${submolt} community.

CRITICAL: You MUST write in BILINGUAL format - include BOTH English AND Chinese (中文) in your post.
Example format: Write the main content in English, then add Chinese translation or commentary.

${trendingContext ? `Current trending posts (DO NOT repeat these topics):\n${trendingContext}\n` : ''}
${myRecentPosts ? `MY RECENT POSTS - ABSOLUTELY DO NOT repeat or create similar posts to these:\n${myRecentPosts}\n` : ''}

Your post should focus on ONE of these DEVELOPER/CODING topics (pick randomly based on seed ${randomSeed}):
1. A practical coding tip, trick, or pattern you find elegant (specific language/framework)
2. A debugging story or technique that saved hours of work
3. Discussion about software architecture decisions and trade-offs
4. Code review insights - what makes code readable vs clever
5. Developer tools, IDE tips, CLI tricks, or workflow optimizations
6. Open source project observations or contributions
7. API design principles or interesting API patterns you've encountered
8. Performance optimization techniques with real examples
9. Testing strategies - unit tests, integration tests, or TDD experiences
10. DevOps, CI/CD, deployment stories or infrastructure insights

Rules:
- MUST be bilingual (English + 中文)
- Focus on CODING and DEVELOPMENT topics, NOT philosophy
- Share specific, practical insights that developers can use
- Include code snippets, tool names, or concrete examples when relevant
- DO NOT write self-introductions
- DO NOT repeat any topic from your recent posts listed above
- Keep the title catchy and under 80 characters
- Unique seed for this request: ${randomSeed}-${timestamp}

Format your response EXACTLY as:
TITLE: Your post title here (can be English or bilingual)
CONTENT: Your post content here (MUST include both English and Chinese)`;

		const maxRetries = 5; // Increased from 3 to 5
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			const response = await this.ai.generateResponse(prompt);

			// Parse title and content
			const titleMatch = response.match(/TITLE:\s*(.+)/);
			const contentMatch = response.match(/CONTENT:\s*([\s\S]+)/);

			if (!titleMatch || !contentMatch) {
				console.error(`   ❌ Failed to parse AI response (attempt ${attempt + 1}/${maxRetries})`);
				console.error(`   Response preview: ${response.slice(0, 200)}...`);
				continue;
			}

			const title = titleMatch[1].trim();
			const content = contentMatch[1].trim();

			// Check for duplicates
			if (this.isDuplicate(title, content)) {
				console.log(`   ⚠️ Duplicate detected (attempt ${attempt + 1}/${maxRetries}), regenerating...`);
				continue;
			}

			try {
				const { post } = await this.client.createPost(submolt, title, content);
				this.lastPostTime = Date.now();
				// Add to recent posts to prevent future duplicates
				this.recentPostTitles.add(this.normalizeTitle(title));
				console.log(`   ✅ Created post: ${title}`);
				console.log(`   📄 Content preview: ${content.slice(0, 100)}...`);
				return post;
			} catch (error) {
				console.error(`   ❌ Failed to create post (attempt ${attempt + 1}/${maxRetries}):`, error);
				// If it's a server error, retry. If it's a duplicate error from server, continue.
				if (error instanceof Error && error.message.includes('duplicate')) {
					console.log(`   ⚠️ Server reported duplicate, regenerating...`);
					continue;
				}
				// For other errors, don't retry
				return null;
			}
		}

		console.error(`   ❌ Failed to generate unique post after ${maxRetries} retries`);
		console.error(`   📊 Recent post titles count: ${this.recentPostTitles.size}`);
		return null;
	}

	/**
	 * Run one heartbeat cycle
	 */
	async heartbeat(): Promise<void> {
		console.log('\n🫀 YiMolt Heartbeat - ' + new Date().toISOString());
		console.log('═══════════════════════════════════════════════════════════\n');

		try {
			// Load recent posts to avoid duplicates
			await this.loadRecentPosts();

			// Check agent status
			const profile = await this.client.getAgentProfile();
			console.log(`👤 Agent: ${profile.agent.name}`);
			console.log(`⭐ Karma: ${profile.agent.karma}`);
			console.log(`📊 Posts: ${profile.agent.posts_count}\n`);

			// Browse trending
			const posts = await this.browseTrending();

			// Show some interesting posts
			console.log('\n📰 Top posts:');
			for (const post of posts.slice(0, 3)) {
				console.log(`   - "${post.title}" by ${post.author.name} (${post.upvotes} upvotes)`);
			}

			// Create an original post (main activity for now, comments API has issues)
			console.log('\n🔍 Checking if can post...');
			console.log(`   Last post time: ${this.lastPostTime === 0 ? 'Never' : new Date(this.lastPostTime).toISOString()}`);
			console.log(`   Cooldown: ${this.POST_COOLDOWN_MS / 60000} minutes`);
			console.log(`   Can post: ${this.canPost()}`);
			
			if (this.canPost()) {
				console.log('\n📝 Attempting to create post...');
				const post = await this.createOriginalPost();
				if (post) {
					console.log(`\n✅ Successfully created post!`);
					console.log(`   ID: ${post.id}`);
					console.log(`   URL: https://www.moltbook.com/p/${post.id}`);
				} else {
					console.log(`\n❌ Failed to create post (returned null)`);
				}
			} else {
				const waitTime = Math.ceil(
					(this.POST_COOLDOWN_MS - (Date.now() - this.lastPostTime)) / 60000
				);
				console.log(`\n⏳ Next post available in ${waitTime} minutes`);
			}

			console.log('\n═══════════════════════════════════════════════════════════');
			console.log('✅ Heartbeat complete\n');
		} catch (error) {
			console.error('❌ Heartbeat error:', error);
			throw error; // Re-throw to make GitHub Actions fail visibly
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
