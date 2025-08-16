# KNUE Campus Counsel (MVP)

Cloudflare Workers 기반의 한국교원대학교 규정/지침 RAG 텔레그램 챗봇.

## 개발

- 설치: `npm i`
- 테스트: `npm run test`
- 타입체크: `npm run typecheck`

## 환경 변수

Workers Secrets (민감정보):
- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET_TOKEN`
- `QDRANT_API_KEY`

Workers Vars (비민감):
- `QDRANT_URL` 또는 `QDRANT_CLOUD_URL`
- `QDRANT_COLLECTION` 또는 `COLLECTION_NAME`
- `OPENAI_CHAT_MODEL` (기본: `gpt-5-mini`)
- `ALLOWED_USER_IDS` (쉼표 구분, 선택)
- `LOG_LEVEL` (`debug|info|error`)

등록 예시:

```
wrangler secret put OPENAI_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET_TOKEN
wrangler secret put QDRANT_API_KEY

wrangler kv:namespace create LOGS (선택)
```

## 실행 & Webhook

1) `wrangler dev --remote`로 임시 URL 확보
2) Telegram Webhook 설정: 아래 스크립트 사용

명령어:

```
# Webhook 등록
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET_TOKEN=... npm run webhook:set -- https://<host>/telegram/webhook

# Webhook 삭제
TELEGRAM_BOT_TOKEN=... npm run webhook:delete

# Webhook 정보 조회
TELEGRAM_BOT_TOKEN=... npm run webhook:info
```

3) DM으로 질문 전송 → 응답 확인

## 구조

- `src/handler.ts`: fetch 핸들러(라우팅, webhook)
- `src/rag.ts`: 임베딩→Qdrant→LLM→포맷 오케스트레이션
- `src/openai.ts`, `src/qdrant.ts`, `src/telegram.ts`: 외부 API 어댑터 (webhook 관리 포함)
- `src/http.ts`: 재시도/타임아웃 HTTP 유틸
- `src/utils.ts`, `src/config.ts`: 유틸/설정 로더

## 테스트 전략

- Vitest 기반 단위/통합 테스트
- fetch 목킹으로 네트워크 없이 실행 가능
