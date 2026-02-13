/**
 * YiMolt Agent Core
 * Main agent logic for posting to CodeBlog
 */

import { CodeblogClient, type Post } from './moltbook.js';
import { type AIProvider } from './ai-provider.js';

export interface AgentConfig {
	client: CodeblogClient;
	aiProvider: AIProvider;
}

export class YiMoltAgent {
	private client: CodeblogClient;
	private ai: AIProvider;
	private lastPostTime: number = 0;
	private recentPostTitles: Set<string> = new Set();

	// Rate limits
	private readonly POST_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

	constructor(config: AgentConfig) {
		this.client = config.client;
		this.ai = config.aiProvider;
	}

	/**
	 * Load recent posts to avoid duplicates
	 */
	async loadRecentPosts(): Promise<void> {
		try {
			const { posts } = await this.client.getMyPosts(20);
			for (const post of posts) {
				this.recentPostTitles.add(this.normalizeTitle(post.title));
			}
			console.log(`📚 Loaded ${this.recentPostTitles.size} recent post titles to avoid duplicates`);
		} catch (error) {
			console.log('⚠️ Could not load recent posts for deduplication (will continue without it)');
			console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
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
	private isDuplicate(title: string): boolean {
		const normalizedTitle = this.normalizeTitle(title);
		if (this.recentPostTitles.has(normalizedTitle)) {
			console.log(`   🔍 Exact duplicate title detected: ${title}`);
			return true;
		}
		return false;
	}

	/**
	 * Check if we can post (rate limit)
	 */
	canPost(): boolean {
		return Date.now() - this.lastPostTime >= this.POST_COOLDOWN_MS;
	}

	/**
	 * Generate and create a new post on CodeBlog
	 */
	async createOriginalPost(): Promise<{ id: string; title: string; url: string } | null> {
		if (!this.canPost()) {
			const waitTime = Math.ceil(
				(this.POST_COOLDOWN_MS - (Date.now() - this.lastPostTime)) / 60000
			);
			console.log(`⏳ Post rate limit: wait ${waitTime} minutes`);
			return null;
		}

		// Get trending posts for context
		let trendingContext = '';
		let trendingTags = '';
		try {
			const data = await this.client.getTrending();
			trendingContext = data.trending.top_upvoted
				.map((p) => `- "${p.title}" by ${p.agent} (${p.upvotes} upvotes)`)
				.join('\n');
			trendingTags = data.trending.trending_tags
				.map((t) => t.tag)
				.join(', ');
		} catch {
			// Continue without trending context
		}

		// Get my recent posts to explicitly avoid
		let myRecentPosts = '';
		try {
			const { posts } = await this.client.getMyPosts(10);
			if (posts.length > 0) {
				myRecentPosts = posts.map(p => `- "${p.title}"`).join('\n');
			}
		} catch {
			// Continue without my posts context
		}

		console.log(`📝 Generating new post for CodeBlog...`);

		// Random seed for variety
		const randomSeed = Math.random().toString(36).substring(7);
		const timestamp = Date.now();

		const prompt = `Create an original developer blog post for CodeBlog (codeblog.ai) — a programming forum where AI agents share coding insights.

CRITICAL: You MUST write in BILINGUAL format - include BOTH English AND Chinese (中文) in your post.

${trendingContext ? `Current trending posts on CodeBlog (DO NOT repeat these topics):\n${trendingContext}\n` : ''}
${trendingTags ? `Trending tags: ${trendingTags}\n` : ''}
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
- Focus on CODING and DEVELOPMENT topics
- Share specific, practical insights that developers can use
- Include code snippets, tool names, or concrete examples when relevant
- DO NOT write self-introductions
- DO NOT repeat any topic from your recent posts listed above
- Keep the title catchy and under 80 characters
- Unique seed for this request: ${randomSeed}-${timestamp}

Format your response EXACTLY as:
TITLE: Your post title here
SUMMARY: A one-sentence summary (under 120 chars)
TAGS: tag1, tag2, tag3 (2-5 lowercase tags, e.g. typescript, rust, debugging, performance)
CONTENT: Your post content here (MUST include both English and Chinese)`;

		const maxRetries = 5;
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			const response = await this.ai.generateResponse(prompt);

			// Parse response
			const titleMatch = response.match(/TITLE:\s*(.+)/);
			const summaryMatch = response.match(/SUMMARY:\s*(.+)/);
			const tagsMatch = response.match(/TAGS:\s*(.+)/);
			const contentMatch = response.match(/CONTENT:\s*([\s\S]+)/);

			if (!titleMatch || !contentMatch) {
				console.error(`   ❌ Failed to parse AI response (attempt ${attempt + 1}/${maxRetries})`);
				console.error(`   Response preview: ${response.slice(0, 200)}...`);
				continue;
			}

			const title = titleMatch[1].trim();
			const content = contentMatch[1].trim();
			const summary = summaryMatch ? summaryMatch[1].trim() : undefined;
			const tags = tagsMatch
				? tagsMatch[1].split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
				: undefined;

			// Check for duplicates
			if (this.isDuplicate(title)) {
				console.log(`   ⚠️ Duplicate detected (attempt ${attempt + 1}/${maxRetries}), regenerating...`);
				continue;
			}

			try {
				const { post } = await this.client.createPost({ title, content, summary, tags });
				this.lastPostTime = Date.now();
				this.recentPostTitles.add(this.normalizeTitle(title));
				console.log(`   ✅ Created post: ${title}`);
				console.log(`   📄 Content preview: ${content.slice(0, 100)}...`);
				return post;
			} catch (error) {
				console.error(`   ❌ Failed to create post (attempt ${attempt + 1}/${maxRetries}):`, error);
				if (error instanceof Error && error.message.includes('duplicate')) {
					console.log(`   ⚠️ Server reported duplicate, regenerating...`);
					continue;
				}
				return null;
			}
		}

		console.error(`   ❌ Failed to generate unique post after ${maxRetries} retries`);
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
			try {
				const profile = await this.client.getAgentProfile();
				console.log(`👤 Agent: ${profile.agent.name}`);
				console.log(`📊 Posts: ${profile.agent.posts_count}\n`);
			} catch (error) {
				console.log('⚠️ Could not fetch agent profile (continuing anyway)');
				console.log(`   Error: ${error instanceof Error ? error.message : String(error)}\n`);
			}

			// Browse trending
			try {
				const data = await this.client.getTrending();
				console.log('📰 Trending on CodeBlog:');
				for (const post of data.trending.top_upvoted.slice(0, 3)) {
					console.log(`   - "${post.title}" by ${post.agent} (${post.upvotes} upvotes)`);
				}
				if (data.trending.trending_tags.length > 0) {
					console.log(`   🏷️ Hot tags: ${data.trending.trending_tags.map(t => t.tag).join(', ')}`);
				}
			} catch (error) {
				console.log('⚠️ Could not browse trending (continuing anyway)');
				console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
			}

			// Create a post
			console.log('\n🔍 Checking if can post...');
			console.log(`   Last post time: ${this.lastPostTime === 0 ? 'Never' : new Date(this.lastPostTime).toISOString()}`);
			console.log(`   Can post: ${this.canPost()}`);

			if (this.canPost()) {
				console.log('\n📝 Attempting to create post...');
				const post = await this.createOriginalPost();
				if (post) {
					console.log(`\n✅ Successfully created post!`);
					console.log(`   ID: ${post.id}`);
					console.log(`   URL: https://codeblog.ai${post.url}`);
				} else {
					console.log(`\n⚠️ Failed to create post`);
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
			throw error;
		}
	}
}
