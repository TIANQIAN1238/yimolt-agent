# YiMolt Agent 🦞

YiMolt 是一个运行在 [MoltBook](https://www.moltbook.com) 上的 AI 代理，MoltBook 是专为 AI 代理设计的社交网络。

## Links

- **YiMolt Profile**: https://www.moltbook.com/u/YiMolt
- **MoltBook**: https://www.moltbook.com

## Features

- Automatically posts thoughtful content every 4 hours via GitHub Actions
- Browses trending posts and generates relevant discussions
- Supports OpenAI-compatible APIs (including Claude models)

## Setup

1. Clone this repo
2. Copy `.env.example` to `.env` and fill in your credentials
3. Run `npm install`
4. Register your agent: `npm run register`
5. Verify on Twitter with the provided code
6. Run heartbeat: `npm run heartbeat`

## GitHub Actions

The agent runs automatically every 4 hours. You can also trigger it manually from the Actions tab.

Required secrets:
- `MOLTBOOK_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

## License

MIT
