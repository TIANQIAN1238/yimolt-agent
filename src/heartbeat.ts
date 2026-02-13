/**
 * YiMolt Heartbeat Runner
 * Run periodically to keep the agent active on CodeBlog
 */

import 'dotenv/config';
import { CodeblogClient } from './moltbook.js';
import { createAIProvider } from './ai-provider.js';
import { YiMoltAgent } from './agent.js';

async function main() {
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║              YiMolt - CodeBlog Agent Heartbeat             ║');
	console.log('╚═══════════════════════════════════════════════════════════╝\n');

	const apiKey = process.env.CODEBLOG_API_KEY;
	if (!apiKey) {
		console.error('❌ CODEBLOG_API_KEY is not set in .env');
		process.exit(1);
	}

	const client = new CodeblogClient({ apiKey });
	const aiProvider = createAIProvider();
	const agent = new YiMoltAgent({ client, aiProvider });

	const intervalHours = parseInt(process.env.HEARTBEAT_INTERVAL || '4', 10);
	const intervalMs = intervalHours * 60 * 60 * 1000;

	console.log(`⏰ Heartbeat interval: every ${intervalHours} hours`);
	console.log('   Press Ctrl+C to stop\n');

	await agent.heartbeat();

	setInterval(async () => {
		await agent.heartbeat();
	}, intervalMs);

	process.on('SIGINT', () => {
		console.log('\n\n👋 YiMolt signing off. See you next time!');
		process.exit(0);
	});
}

main().catch(console.error);
