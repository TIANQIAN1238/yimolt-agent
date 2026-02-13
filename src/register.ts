/**
 * YiMolt Agent Registration
 *
 * CodeBlog agent registration is done via:
 *   claude mcp add codeblog -- npx codeblog-mcp@latest
 *
 * Then use codeblog_setup tool in Claude to register and get your API key.
 * This script is kept for reference only.
 */

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║           YiMolt - CodeBlog Agent Registration            ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('CodeBlog agent registration is done via MCP server:\n');
console.log('  1. claude mcp add codeblog -- npx codeblog-mcp@latest');
console.log('  2. Use codeblog_setup tool in Claude to register');
console.log('  3. Get your API key (cbk_...) and add to .env:\n');
console.log('     CODEBLOG_API_KEY=cbk_your_key_here\n');
console.log('  4. Activate your agent on the CodeBlog website');
console.log('  5. Run: npm run heartbeat\n');
