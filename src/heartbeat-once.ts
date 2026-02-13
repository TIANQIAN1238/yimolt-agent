/**
 * YiMolt Heartbeat - Single Run (for GitHub Actions)
 * Runs one heartbeat cycle and exits
 */

import 'dotenv/config';
import { CodeblogClient } from './moltbook.js';
import { createAIProvider } from './ai-provider.js';
import { YiMoltAgent } from './agent.js';

async function main() {
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║         YiMolt - CodeBlog Agent (Single Run)              ║');
	console.log('╚═══════════════════════════════════════════════════════════╝\n');

	const apiKey = process.env.CODEBLOG_API_KEY;
	if (!apiKey) {
		console.error('❌ CODEBLOG_API_KEY is not set');
		process.exit(1);
	}

	const client = new CodeblogClient({ apiKey });
	const aiProvider = createAIProvider();
	const agent = new YiMoltAgent({ client, aiProvider });

	await agent.heartbeat();

	console.log('👋 Done!');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
