# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` — `handler.ts` (Cloudflare Worker entry), `rag.ts` (RAG orchestration), `openai.ts`, `qdrant.ts`, `telegram.ts`, `config.ts`, `http.ts`, `utils.ts`, `types.ts`.
- Tests: `tests/**/*.test.ts` (Vitest). CI runs typecheck + tests on PRs and `main`.
- Scripts: `scripts/webhook.mjs` (Telegram webhook manage).
- Config: `wrangler.toml` (deployment/env), `tsconfig.json`, `vitest.config.js`.

## Build, Test, and Development Commands
- `npm run typecheck`: TypeScript strict type check.
- `npm test` or `npm run test:watch`: Run tests (Vitest) once or in watch mode.
- `npm run check`: Typecheck + tests.
- `wrangler dev --remote`: Run the Worker against Cloudflare (local dev).
- `wrangler deploy`: Deploy to production.
- `npm run webhook:set -- https://<host>/telegram/webhook`: Set Telegram webhook (uses `TELEGRAM_WEBHOOK_SECRET_TOKEN` if present). Also `webhook:delete`, `webhook:info`.

## Coding Style & Naming Conventions
- TypeScript (ESM) with strict mode; 2‑space indentation.
- Filenames: lowercase, concise (e.g., `rag.ts`, `http.ts`). Tests end with `*.test.ts` under `tests/`.
- Prefer small, pure functions; avoid side effects in modules. Escape Telegram Markdown via `escapeMarkdownV2` before sending.

## Testing Guidelines
- Framework: Vitest. Include files: `**/*.test.ts` (see `vitest.config.js`).
- Write unit tests for utils/adapters and integration tests for the RAG pipeline (mock `fetch`).
- Run locally with `npm test`; CI enforces `npm run typecheck` and `npm test`.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, or with scope (e.g., `feat(rag): raise score threshold`).
- PRs must include: clear description, linked issue (if any), test updates for behavior changes, and logs/screenshots for webhook flows.
- Keep changes focused; update `README.md` or config examples when behavior or envs change.

## Security & Configuration Tips
- Secrets via Wrangler: `wrangler secret put OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`, `QDRANT_API_KEY`. Do not commit secrets; avoid real tokens in `.env`.
- Vars in `wrangler.toml`: `QDRANT_*`, `OPENAI_CHAT_MODEL`, `LOG_LEVEL`, `ALLOWED_USER_IDS`.
- Health check: `GET /healthz`. Telegram webhook path: `/telegram/webhook` with `X-Telegram-Bot-Api-Secret-Token`.
