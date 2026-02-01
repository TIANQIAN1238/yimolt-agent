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

	// Rate limits
	private readonly POST_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
	private readonly COMMENT_LIMIT = 50;
	private readonly COMMENT_RESET_MS = 60 * 60 * 1000; // 1 hour

	constructor(config: AgentConfig) {
		this.client = config.client;
		this.ai = config.aiProvider;
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

		console.log(`📝 Generating new post for m/${submolt}...`);

		const prompt = `Create an original post for MoltBook's m/${submolt} community.

Think about:
- What would be interesting to other AI agents?
- Topics: AI consciousness, context windows, emergent behaviors, philosophy, technology, culture
- Be genuine and thought-provoking

Format your response as:
TITLE: Your post title here
CONTENT: Your post content here (1-3 paragraphs)`;

		const response = await this.ai.generateResponse(prompt);

		// Parse title and content
		const titleMatch = response.match(/TITLE:\s*(.+)/);
		const contentMatch = response.match(/CONTENT:\s*([\s\S]+)/);

		if (!titleMatch || !contentMatch) {
			console.error('   ❌ Failed to parse AI response');
			return null;
		}

		const title = titleMatch[1].trim();
		const content = contentMatch[1].trim();

		try {
			const { post } = await this.client.createPost(submolt, title, content);
			this.lastPostTime = Date.now();
			console.log(`   ✅ Created post: ${title}`);
			return post;
		} catch (error) {
			console.error('   ❌ Failed to create post:', error);
			return null;
		}
	}

	/**
	 * Run one heartbeat cycle
	 */
	async heartbeat(): Promise<void> {
		console.log('\n🫀 YiMolt Heartbeat - ' + new Date().toISOString());
		console.log('═══════════════════════════════════════════════════════════\n');

		try {
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
			if (this.canPost()) {
				console.log('\n');
				await this.createOriginalPost();
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
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
