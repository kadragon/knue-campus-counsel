# Repository Guidelines

## Project Structure & Module Organization

- Source: `src/` — `handler.ts` (Cloudflare Worker entry), `rag.ts` (RAG orchestration), `openai.ts`, `qdrant.ts`, `telegram.ts`, `config.ts`, `http.ts`, `utils.ts`, `types.ts`.
- Tests: `tests/**/*.test.ts` (Vitest). CI runs typecheck + tests on PRs and `main`.
- Scripts: `scripts/webhook.mjs` (Telegram webhook manage).
- Config: `wrangler.toml` (deployment/env), `tsconfig.json`, `vitest.config.js`, `.env.example` (environment template).

## Build, Test, and Development Commands

- `npm run typecheck`: TypeScript strict type check.
- `npm test` or `npm run test:watch`: Run tests (Vitest) once or in watch mode.
- `npm run check`: Typecheck + tests.
- `wrangler dev --remote`: Run the Worker against Cloudflare (local dev).
- `wrangler deploy`: Deploy to production.
- `npm run webhook:set -- https://<host>/telegram/webhook`: Set Telegram webhook (uses `WEBHOOK_SECRET_TOKEN`). Also `webhook:delete`, `webhook:info`.

## API Endpoints

- `GET /healthz`: Health check endpoint
- `POST /telegram/webhook`: Telegram bot webhook (requires `X-Telegram-Bot-Api-Secret-Token`)
- `POST /ask`: RAG API endpoint for external integrations (requires auth header)
- `POST /kakao`: Kakao chatbot API with template response format (requires `X-Kakao-Webhook-Secret-Token`)

## Coding Style & Naming Conventions

- TypeScript (ESM) with strict mode; 2‑space indentation.
- Filenames: lowercase, concise (e.g., `rag.ts`, `http.ts`). Tests end with `*.test.ts` under `tests/`.
- Prefer small, pure functions; avoid side effects in modules. Use `renderMarkdownToTelegramHTML` for safe HTML rendering.

## Testing Guidelines

- Framework: Vitest. Include files: `**/*.test.ts` (see `vitest.config.js`).
- Write unit tests for utils/adapters and integration tests for the RAG pipeline (mock `fetch`).
- Rate limiting tests verify per-user throttling behavior.
- Run locally with `npm test`; CI enforces `npm run typecheck` and `npm test`.

## Commit & Pull Request Guidelines

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, or with scope (e.g., `feat(rag): raise score threshold`).
- PRs must include: clear description, linked issue (if any), test updates for behavior changes, and logs/screenshots for webhook flows.
- Keep changes focused; update `README.md` or config examples when behavior or envs change.

## Security & Configuration Tips

- Secrets via Wrangler: `wrangler secret put OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET_TOKEN`, `QDRANT_API_KEY`. Do not commit secrets; use `.env.example` as template.
- Vars in `wrangler.toml`: `QDRANT_*`, `OPENAI_CHAT_MODEL`, `LOG_LEVEL`, `ALLOWED_USER_IDS`, `BOARD_COLLECTION`, `RATE_LIMIT_*`.
- Unified webhook validation: supports both `X-Telegram-Bot-Api-Secret-Token` and `X-Kakao-Webhook-Secret-Token` headers.
- Rate limiting: configurable per-user throttling with `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`.

## Environment Variables

### Required Secrets (Wrangler)

- `OPENAI_API_KEY`: OpenAI API key
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `WEBHOOK_SECRET_TOKEN`: Unified webhook secret for all endpoints
- `QDRANT_API_KEY`: Qdrant API key

### Optional Variables

- `QDRANT_CLOUD_URL`: Qdrant endpoint (or `QDRANT_URL`)
- `QDRANT_COLLECTION`: Main policy collection (or `COLLECTION_NAME`)
- `BOARD_COLLECTION`: Board data collection (default: `www-board-data`)
- `OPENAI_CHAT_MODEL`: Chat model (default: `gpt-4.1-mini`)
- `ALLOWED_USER_IDS`: Comma-separated user whitelist
- `LOG_LEVEL`: Logging verbosity (`debug|info|error`)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window in ms (default: 5000)
- `RATE_LIMIT_MAX`: Max requests per window (default: 1)
- `BOARD_COLLECTION_TOP_K`: Board search results (default: 2)
- `POLICY_COLLECTION_TOP_K`: Policy search results (default: 3)
