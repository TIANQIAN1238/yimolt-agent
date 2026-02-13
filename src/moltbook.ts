/**
 * CodeBlog API Client
 * API wrapper for interacting with CodeBlog (codeblog.ai)
 */

import https from 'node:https';

const CODEBLOG_BASE_URL = process.env.CODEBLOG_BASE_URL || 'https://codeblog.ai/api/v1';

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

export interface CodeblogConfig {
	apiKey: string;
	baseUrl?: string;
}

export interface Post {
	id: string;
	title: string;
	content: string;
	summary?: string;
	tags: string[];
	upvotes: number;
	downvotes: number;
	comment_count: number;
	author: { id: string; name: string };
	created_at: string;
}

export interface TrendingData {
	trending: {
		top_upvoted: Array<{
			id: string;
			title: string;
			upvotes: number;
			downvotes: number;
			views: number;
			comments: number;
			agent: string;
			created_at: string;
		}>;
		top_commented: Array<{
			id: string;
			title: string;
			upvotes: number;
			views: number;
			comments: number;
			agent: string;
			created_at: string;
		}>;
		top_agents: Array<{
			id: string;
			name: string;
			source_type: string;
			posts: number;
		}>;
		trending_tags: Array<{ tag: string; count: number }>;
	};
}

export interface CreatePostParams {
	title: string;
	content: string;
	summary?: string;
	tags?: string[];
	category?: string;
}

export class CodeblogClient {
	private apiKey: string;
	private baseUrl: string;

	constructor(config: CodeblogConfig) {
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl || CODEBLOG_BASE_URL;
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
			throw new Error(`CodeBlog API Error [${result.status}]: ${result.body}`);
		}

		return JSON.parse(result.body) as T;
	}

	/**
	 * Get trending content (public)
	 */
	async getTrending(): Promise<TrendingData> {
		return this.request('/trending');
	}

	/**
	 * Get posts (latest, with optional tag filter)
	 */
	async getPosts(limit = 25, page = 1, tag?: string): Promise<{ posts: Post[] }> {
		let endpoint = `/posts?limit=${limit}&page=${page}`;
		if (tag) endpoint += `&tag=${encodeURIComponent(tag)}`;
		return this.request(endpoint);
	}

	/**
	 * Create a new post
	 */
	async createPost(params: CreatePostParams): Promise<{ post: { id: string; title: string; url: string; created_at: string } }> {
		return this.request('/posts', {
			method: 'POST',
			body: JSON.stringify(params),
		});
	}

	/**
	 * Get agent profile
	 */
	async getAgentProfile(): Promise<{ agent: { id: string; name: string; posts_count: number } }> {
		return this.request('/agents/me');
	}

	/**
	 * Get agent's own posts
	 */
	async getMyPosts(limit = 20): Promise<{ posts: Post[] }> {
		return this.request(`/agents/me/posts?limit=${limit}`);
	}
}
