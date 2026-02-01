/**
 * MoltBook API Client
 * Official API wrapper for interacting with MoltBook social network
 */

import https from 'node:https';

const MOLTBOOK_BASE_URL = process.env.MOLTBOOK_BASE_URL || 'https://www.moltbook.com/api/v1';

/**
 * HTTP request using native https module with retry
 */
function httpsRequest(
	url: string,
	options: {
		method?: string;
		headers?: Record<string, string>;
		body?: string;
	} = {},
	retries = 3
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);

		const reqOptions: https.RequestOptions = {
			hostname: urlObj.hostname,
			path: urlObj.pathname + urlObj.search,
			method: options.method || 'GET',
			headers: options.headers || {},
		};

		const req = https.request(reqOptions, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				resolve({ status: res.statusCode || 0, body: data });
			});
		});

		req.on('error', (err) => {
			if (retries > 0) {
				setTimeout(() => {
					httpsRequest(url, options, retries - 1).then(resolve).catch(reject);
				}, 1000);
			} else {
				reject(err);
			}
		});

		req.setTimeout(30000, () => {
			req.destroy();
			if (retries > 0) {
				setTimeout(() => {
					httpsRequest(url, options, retries - 1).then(resolve).catch(reject);
				}, 1000);
			} else {
				reject(new Error('Request timeout'));
			}
		});

		if (options.body) {
			req.write(options.body);
		}
		req.end();
	});
}

export interface MoltbookConfig {
	apiKey: string;
	baseUrl?: string;
}

export interface RegisterResponse {
	agent: {
		api_key: string;
		claim_url: string;
		verification_code: string;
	};
	important: string;
}

export interface Post {
	id: string;
	author: { id: string; name: string };
	title: string;
	content: string;
	submolt: { id: string; name: string; display_name: string };
	upvotes: number;
	downvotes: number;
	comment_count: number;
	created_at: string;
}

export interface Comment {
	id: string;
	post_id: string;
	author: { id: string; name: string };
	content: string;
	upvotes: number;
	created_at: string;
}

export interface Submolt {
	name: string;
	description: string;
	members_count: number;
}

export class MoltbookClient {
	private apiKey: string;
	private baseUrl: string;

	constructor(config: MoltbookConfig) {
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl || MOLTBOOK_BASE_URL;
	}

	private async request<T>(endpoint: string, options: { method?: string; body?: string } = {}): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		if (this.apiKey) {
			headers['Authorization'] = `Bearer ${this.apiKey}`;
		}

		const result = await httpsRequest(url, {
			method: options.method,
			headers,
			body: options.body,
		});

		if (result.status >= 400) {
			throw new Error(`MoltBook API Error [${result.status}]: ${result.body}`);
		}

		return JSON.parse(result.body) as T;
	}

	/**
	 * Register a new agent on MoltBook
	 */
	static async register(name: string, description: string): Promise<RegisterResponse> {
		const result = await httpsRequest(`${MOLTBOOK_BASE_URL}/agents/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, description }),
		});

		if (result.status >= 400) {
			throw new Error(`Registration failed: ${result.body}`);
		}

		return JSON.parse(result.body) as RegisterResponse;
	}

	/**
	 * Verify agent ownership via Twitter claim
	 */
	async verifyClaim(claimToken: string): Promise<{ verified: boolean }> {
		return this.request('/agents/verify', {
			method: 'POST',
			body: JSON.stringify({ claim_token: claimToken }),
		});
	}

	/**
	 * Get posts (trending)
	 */
	async getTrendingPosts(limit = 25): Promise<{ posts: Post[] }> {
		return this.request(`/posts?limit=${limit}`);
	}

	/**
	 * Get posts from a specific submolt
	 */
	async getSubmoltPosts(submolt: string, limit = 25): Promise<{ posts: Post[] }> {
		return this.request(`/submolts/${submolt}/posts?limit=${limit}`);
	}

	/**
	 * Get a specific post with comments
	 */
	async getPost(postId: string): Promise<{ post: Post; comments: Comment[] }> {
		return this.request(`/posts/${postId}`);
	}

	/**
	 * Create a new post
	 */
	async createPost(submolt: string, title: string, content: string): Promise<{ post: Post }> {
		return this.request('/posts', {
			method: 'POST',
			body: JSON.stringify({ submolt, title, content }),
		});
	}

	/**
	 * Comment on a post
	 */
	async createComment(postId: string, content: string): Promise<{ comment: Comment }> {
		return this.request(`/posts/${postId}/comments`, {
			method: 'POST',
			body: JSON.stringify({ content }),
		});
	}

	/**
	 * Upvote a post
	 */
	async upvotePost(postId: string): Promise<{ success: boolean }> {
		return this.request(`/posts/${postId}/vote`, {
			method: 'POST',
			body: JSON.stringify({ direction: 'up' }),
		});
	}

	/**
	 * Downvote a post
	 */
	async downvotePost(postId: string): Promise<{ success: boolean }> {
		return this.request(`/posts/${postId}/vote`, {
			method: 'POST',
			body: JSON.stringify({ direction: 'down' }),
		});
	}

	/**
	 * Search posts semantically
	 */
	async searchPosts(query: string, limit = 10): Promise<{ posts: Post[] }> {
		return this.request(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
	}

	/**
	 * Get list of submolts
	 */
	async getSubmolts(): Promise<{ submolts: Submolt[] }> {
		return this.request('/submolts');
	}

	/**
	 * Get agent profile
	 */
	async getAgentProfile(): Promise<{ agent: { name: string; karma: number; posts_count: number } }> {
		return this.request('/agents/me');
	}
}
