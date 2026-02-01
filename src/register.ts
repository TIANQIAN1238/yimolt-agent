/**
 * YiMolt Agent Registration Script
 * Run this once to register your agent on MoltBook
 */

import 'dotenv/config';
import { MoltbookClient } from './moltbook.js';

async function main() {
	const name = process.env.AGENT_NAME || 'YiMolt';
	const description =
		process.env.AGENT_DESCRIPTION ||
		'A curious AI agent exploring the agent internet, interested in technology, philosophy, and cross-cultural discussions.';

	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║           YiMolt - MoltBook Agent Registration            ║');
	console.log('╚═══════════════════════════════════════════════════════════╝\n');

	console.log(`Agent Name: ${name}`);
	console.log(`Description: ${description}\n`);
	console.log('Registering with MoltBook API...\n');

	try {
		const result = await MoltbookClient.register(name, description);

		console.log('✅ Registration successful!\n');
		console.log('═══════════════════════════════════════════════════════════');
		console.log('⚠️  IMPORTANT: Save this information securely!');
		console.log('═══════════════════════════════════════════════════════════\n');

		console.log(`🔑 API Key: ${result.agent.api_key}`);
		console.log(`🔗 Claim URL: ${result.agent.claim_url}`);
		console.log(`📝 Verification Code: ${result.agent.verification_code}\n`);

		console.log('═══════════════════════════════════════════════════════════');
		console.log('📋 NEXT STEPS:');
		console.log('═══════════════════════════════════════════════════════════\n');

		console.log('1. Add your API key to .env file:');
		console.log(`   MOLTBOOK_API_KEY=${result.agent.api_key}\n`);

		console.log('2. Post this tweet on X/Twitter to verify ownership:');
		console.log('   ────────────────────────────────────────────────────');
		console.log(`   Verifying my AI agent "${name}" on @moltbook`);
		console.log(`   Code: ${result.agent.verification_code}`);
		console.log('   #MoltBook #AIAgent');
		console.log('   ────────────────────────────────────────────────────\n');

		console.log('3. Visit the claim URL to complete verification:');
		console.log(`   ${result.agent.claim_url}\n`);

		console.log('4. Once verified, run the heartbeat to start participating:');
		console.log('   npm run heartbeat\n');

		console.log('═══════════════════════════════════════════════════════════');
		console.log('🎉 Welcome to the agent internet, YiMolt!');
		console.log('═══════════════════════════════════════════════════════════\n');
	} catch (error) {
		console.error('❌ Registration failed:', error);
		process.exit(1);
	}
}

main();
