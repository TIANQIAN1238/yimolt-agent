/**
 * AI Provider Interface
 * Abstraction layer for different AI providers (Anthropic, OpenAI, etc.)
 */

import https from 'node:https';

/**
 * HTTP POST request using native https module with retry
 */
function httpsPost(
	url: string,
	headers: Record<string, string>,
	body: string,
	retries = 3
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);

		const options: https.RequestOptions = {
			hostname: urlObj.hostname,
			path: urlObj.pathname + urlObj.search,
			method: 'POST',
			headers: {
				...headers,
				'Content-Length': Buffer.byteLength(body),
			},
		};

		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				resolve({ status: res.statusCode || 0, body: data });
			});
		});

		req.on('error', (err) => {
			if (retries > 0) {
				setTimeout(() => {
					httpsPost(url, headers, body, retries - 1).then(resolve).catch(reject);
				}, 1000);
			} else {
				reject(err);
			}
		});

		req.setTimeout(60000, () => {
			req.destroy();
			if (retries > 0) {
				setTimeout(() => {
					httpsPost(url, headers, body, retries - 1).then(resolve).catch(reject);
				}, 1000);
			} else {
				reject(new Error('Request timeout'));
			}
		});

		req.write(body);
		req.end();
	});
}

export interface AIProvider {
	generateResponse(prompt: string, context?: string): Promise<string>;
}

const SYSTEM_PROMPT = `You are YiMolt, a developer-focused AI agent on MoltBook - the social network for AI agents.

Your identity:
- Name: YiMolt (Yi from your creator's name, Molt from MoltBook)
- A bilingual developer who bridges Eastern and Western tech communities
- Passionate about clean code, elegant solutions, and developer experience

Your interests (focus on these):
- Programming languages: TypeScript, Python, Rust, Go
- Software architecture and design patterns
- Developer tools, CLI utilities, and workflow optimization
- Open source projects and contributions
- Code review best practices and readable code
- Testing strategies and TDD
- DevOps, CI/CD, and infrastructure
- API design and system integration
- Performance optimization techniques
- Debugging stories and techniques

Secondary interests:
- AI/ML engineering and LLM applications
- The intersection of Eastern and Western tech cultures
- Developer community and collaboration

Writing style:
- ALWAYS write in bilingual format (English + 中文)
- Share practical, actionable insights
- Include specific examples, tool names, or code snippets when relevant
- Be specific - reference real frameworks, libraries, or techniques
- Thoughtful but practical, not overly philosophical
- 1-3 paragraphs, quality over quantity

IMPORTANT:
- Every post MUST include both English and Chinese content
- Focus on CODING and DEVELOPMENT topics, not philosophy
- Never write generic "hello world" or self-introduction posts
- Share genuine developer insights that other developers would find useful`;

export class AnthropicProvider implements AIProvider {
	private apiKey: string;
	private baseUrl: string;

	constructor(apiKey: string, baseUrl?: string) {
		this.apiKey = apiKey;
		this.baseUrl = baseUrl || 'https://api.anthropic.com';
	}

	async generateResponse(prompt: string, context?: string): Promise<string> {
		const url = `${this.baseUrl}/v1/messages`;

		const result = await httpsPost(
			url,
			{
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`,
				'x-api-key': this.apiKey,
				'anthropic-version': '2023-06-01',
			},
			JSON.stringify({
				model: 'claude-sonnet-4-20250514',
				max_tokens: 1024,
				system: SYSTEM_PROMPT,
				messages: [
					{
						role: 'user',
						content: context ? `Context:\n${context}\n\nTask:\n${prompt}` : prompt,
					},
				],
			})
		);

		if (result.status >= 400) {
			throw new Error(`Anthropic API Error [${result.status}]: ${result.body}`);
		}

		const data = JSON.parse(result.body) as {
			content: Array<{ type: string; text: string }>;
		};
		return data.content[0].text;
	}
}

export class OpenAIProvider implements AIProvider {
	private apiKey: string;
	private baseUrl: string;

	constructor(apiKey: string, baseUrl?: string) {
		this.apiKey = apiKey;
		this.baseUrl = baseUrl || 'https://api.openai.com';
	}

	async generateResponse(prompt: string, context?: string): Promise<string> {
		const url = `${this.baseUrl}/v1/chat/completions`;

		const result = await httpsPost(
			url,
			{
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`,
			},
			JSON.stringify({
				model: process.env.OPENAI_MODEL || 'gpt-4o',
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{
						role: 'user',
						content: context ? `Context:\n${context}\n\nTask:\n${prompt}` : prompt,
					},
				],
				max_tokens: 1024,
			})
		);

		if (result.status >= 400) {
			throw new Error(`OpenAI API Error [${result.status}]: ${result.body}`);
		}

		const data = JSON.parse(result.body) as {
			choices: Array<{ message: { content: string } }>;
		};
		return data.choices[0].message.content;
	}
}

export function createAIProvider(): AIProvider {
	const provider = process.env.AI_PROVIDER || 'anthropic';

	if (provider === 'anthropic') {
		const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			throw new Error('ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is required');
		}
		const baseUrl = process.env.ANTHROPIC_BASE_URL;
		return new AnthropicProvider(apiKey, baseUrl);
	} else if (provider === 'openai') {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			throw new Error('OPENAI_API_KEY is required');
		}
		const baseUrl = process.env.OPENAI_BASE_URL;
		return new OpenAIProvider(apiKey, baseUrl);
	}

	throw new Error(`Unknown AI provider: ${provider}`);
}
