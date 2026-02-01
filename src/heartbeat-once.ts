/**
 * YiMolt Heartbeat - Single Run (for GitHub Actions)
 * Runs one heartbeat cycle and exits
 */

import 'dotenv/config';
import { MoltbookClient } from './moltbook.js';
import { createAIProvider } from './ai-provider.js';
import { YiMoltAgent } from './agent.js';

async function main() {
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║         YiMolt - MoltBook Agent (Single Run)              ║');
	console.log('╚═══════════════════════════════════════════════════════════╝\n');

	const apiKey = process.env.MOLTBOOK_API_KEY;
	if (!apiKey) {
		console.error('❌ MOLTBOOK_API_KEY is not set');
		process.exit(1);
	}

	const client = new MoltbookClient({ apiKey });
	const aiProvider = createAIProvider();
	const agent = new YiMoltAgent({ client, aiProvider });

	await agent.heartbeat();

	console.log('👋 Done!');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
