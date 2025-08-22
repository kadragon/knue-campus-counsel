# Repository Guidelines

## Project Structure & Module Organization

### Source Code Structure
- `src/core/` — Core application logic (`handler.ts` entry point, `config.ts` environment loading, `types.ts` TypeScript definitions)
- `src/services/` — External service integrations (`openai.ts` embedding/chat, `qdrant.ts` vector search, `telegram.ts` bot API)
- `src/rag/` — RAG pipeline orchestration with Markdown context formatting
- `src/metrics/` — Metrics collection system (`metrics.ts`, `metrics-registry.ts`)
- `src/validation/` — Data validation logic (`env-validation.ts` comprehensive environment validation)
- `src/utils/` — Utility functions (`http.ts` retry/timeout, `utils.ts` logging/formatting/system prompt)
- `src/rate-limit/` — KV-based rate limiting system (hybrid memory+KV, sliding window, per-user limits)

### Tests & Configuration
- Tests: `tests/**/*.test.ts` (Vitest, 225+ tests including comprehensive validation tests)
- Scripts: `scripts/webhook.mjs` (Telegram webhook management)
- Config: `wrangler.toml` (deployment/env), `tsconfig.json`, `vitest.config.js`, `.env.example`

## Build, Test, and Development Commands

- `npm run typecheck`: TypeScript strict type check.
- `npm test` or `npm run test:watch`: Run tests (Vitest) once or in watch mode.
- `npm run check`: Typecheck + tests.
- `wrangler dev --remote`: Run the Worker against Cloudflare (local dev).
- `wrangler deploy`: Deploy to production.
- `npm run webhook:set -- https://<host>/telegram`: Set Telegram webhook (uses `WEBHOOK_SECRET_TOKEN`). Also `webhook:delete`, `webhook:info`.

## API Endpoints

- `GET /healthz`: Health check endpoint
- `POST /telegram`: Telegram bot webhook (requires `X-Telegram-Bot-Api-Secret-Token`)
- `POST /ask`: RAG API endpoint for external integrations (requires `X-Webhook-Secret-Token`)

## Coding Style & Naming Conventions

- TypeScript (ESM) with strict mode; 2‑space indentation.
- Filenames: lowercase, concise (e.g., `rag.ts`, `http.ts`). Tests end with `*.test.ts` under `tests/`.
- Prefer small, pure functions; avoid side effects in modules. Use `renderMarkdownToTelegramHTML` for safe HTML rendering.

## Testing Guidelines

- Framework: Vitest. Include files: `**/*.test.ts` (see `vitest.config.js`).
- **Comprehensive Test Coverage**: 225+ tests across all modules
  - Unit tests for utils/adapters and service integrations
  - Integration tests for RAG pipeline (mock `fetch`)
  - Rate limiting performance and edge case tests
  - **Validation tests**: 36 comprehensive tests for environment validation
  - Error scenarios: retry, timeout, 429 errors
- **Test Structure**: Mirrors `src/` organization (`tests/core/`, `tests/services/`, etc.)
- Run locally with `npm test`; CI enforces `npm run typecheck` and `npm test`.

## Commit & Pull Request Guidelines

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, or with scope (e.g., `feat(rag): raise score threshold`).
- PRs must include: clear description, linked issue (if any), test updates for behavior changes, and logs/screenshots for webhook flows.
- Keep changes focused; update `README.md` or config examples when behavior or envs change.

## Security & Configuration Tips

- Secrets via Wrangler: `wrangler secret put OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET_TOKEN`, `QDRANT_API_KEY`. Do not commit secrets; use `.env.example` as template.
- Vars in `wrangler.toml`: `QDRANT_*`, `OPENAI_CHAT_MODEL`, `LOG_LEVEL`, `ALLOWED_USER_IDS`, `BOARD_COLLECTION`, `RATE_LIMIT_*`.
- Webhook validation: `/telegram` uses `X-Telegram-Bot-Api-Secret-Token`, `/ask` uses `X-Webhook-Secret-Token`.
- Rate limiting: configurable per-user throttling with `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`.

## Environment Variables

### Required Secrets (Wrangler)

- `OPENAI_API_KEY`: OpenAI API key
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `WEBHOOK_SECRET_TOKEN`: Secret token for webhook authentication
- `QDRANT_API_KEY`: Qdrant API key

### Optional Variables

- `QDRANT_CLOUD_URL`: Qdrant endpoint (or `QDRANT_URL`)
- `QDRANT_COLLECTION`: Main policy collection (or `COLLECTION_NAME`)
- `BOARD_COLLECTION`: Board data collection (default: `www-board-data`)
- `OPENAI_CHAT_MODEL`: Chat model (default: `gpt-4.1-mini`)
- `ALLOWED_USER_IDS`: Comma-separated user whitelist
- `LOG_LEVEL`: Logging verbosity (`debug|info|error`)
- `BOARD_COLLECTION_TOP_K`: Board search results (default: 2)
- `POLICY_COLLECTION_TOP_K`: Policy search results (default: 3)

### KV Rate Limiting Configuration

- `RATE_LIMIT_WINDOW_MS`: Rate limit window in ms (default: 5000)
- `RATE_LIMIT_MAX`: Max requests per window (default: 1)
- `RATE_LIMIT_KV_ENABLED`: Enable KV-based rate limiting (default: true)
- `RATE_LIMIT_KV_MEMORY_CACHE_SIZE`: L1 cache size (default: 1000)
- `RATE_LIMIT_KV_MEMORY_CACHE_TTL`: Cache TTL in ms (default: 300000)
- `RATE_LIMIT_KV_ADAPTIVE_ENABLED`: Adaptive features (default: false)
- `RATE_LIMIT_KV_CLEANUP_INTERVAL`: Cleanup interval in ms (default: 300000)
- `RATE_LIMIT_KV_CLEANUP_THRESHOLD`: Cleanup age threshold in ms (default: 3600000)

## KV-Based Rate Limiting System

### Architecture Overview

The application uses a hybrid rate limiting system with two-tier caching:
- **L1 Cache**: In-memory LRU cache for ultra-fast lookups (sub-millisecond)
- **L2 Storage**: Cloudflare KV for persistent, distributed rate limiting

### Features

- **Sliding Window**: Accurate rate limiting with sliding time windows
- **Per-User Limits**: Independent rate limiting per Telegram user/chat
- **Graceful Degradation**: Falls back to memory-only if KV fails
- **High Performance**: 100k+ req/s throughput with <1ms latency
- **Auto-Cleanup**: Periodic cleanup of expired rate limit records
- **Production Ready**: Comprehensive error handling and logging

### KV Namespace Setup

Required KV namespace in `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

### Key Configuration Settings

**Production Settings (Current)**:
- Window: 5 seconds, Max: 1 request per user
- Memory cache: 1000 entries, 5-minute TTL
- Cleanup: Every 5 minutes for records older than 1 hour
- KV enabled, adaptive features disabled for stability

**Performance Tuning**:
- Increase `MEMORY_CACHE_SIZE` for higher user volumes
- Adjust `CLEANUP_INTERVAL` based on traffic patterns  
- Tune `CACHE_TTL` for balance between memory and KV lookups

### Monitoring

The system provides detailed logging for:
- Rate limit decisions (allowed/denied)
- Cache hit/miss rates
- KV operation success/failures
- Cleanup operations and statistics
- Performance metrics (latency, throughput)

### Deployment Notes

1. **KV Namespace**: Create KV namespace before first deployment
2. **Configuration**: Update `wrangler.toml` with KV namespace IDs
3. **Testing**: Run full test suite to verify KV integration
4. **Monitoring**: Enable debug logging initially to verify behavior
5. **Scaling**: Monitor memory usage and adjust cache size as needed
