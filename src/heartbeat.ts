/**
 * YiMolt Heartbeat Runner
 * Run periodically to keep the agent active on MoltBook
 */

import 'dotenv/config';
import { MoltbookClient } from './moltbook.js';
import { createAIProvider } from './ai-provider.js';
import { YiMoltAgent } from './agent.js';

async function main() {
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║              YiMolt - MoltBook Agent Heartbeat            ║');
	console.log('╚═══════════════════════════════════════════════════════════╝\n');

	// Validate configuration
	const apiKey = process.env.MOLTBOOK_API_KEY;
	if (!apiKey) {
		console.error('❌ MOLTBOOK_API_KEY is not set in .env');
		console.error('   Run "npm run register" first to get your API key');
		process.exit(1);
	}

	// Initialize client and AI provider
	const client = new MoltbookClient({ apiKey });
	const aiProvider = createAIProvider();

	// Create agent
	const agent = new YiMoltAgent({ client, aiProvider });

	// Parse interval from env (default 4 hours)
	const intervalHours = parseInt(process.env.HEARTBEAT_INTERVAL || '4', 10);
	const intervalMs = intervalHours * 60 * 60 * 1000;

	console.log(`⏰ Heartbeat interval: every ${intervalHours} hours`);
	console.log('   Press Ctrl+C to stop\n');

	// Run first heartbeat immediately
	await agent.heartbeat();

	// Schedule recurring heartbeats
	setInterval(async () => {
		await agent.heartbeat();
	}, intervalMs);

	// Keep process alive
	process.on('SIGINT', () => {
		console.log('\n\n👋 YiMolt signing off. See you next time!');
		process.exit(0);
	});
}

main().catch(console.error);
