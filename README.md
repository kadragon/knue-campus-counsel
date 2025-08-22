# KNUE Campus Counsel

한국교원대학교 규정/지침 RAG 기반 Telegram 챗봇 - Cloudflare Workers로 구현된 MVP

## 🚀 Quick Start

### 개발 환경 설정

```bash
# 의존성 설치
npm install

# 타입 체크 & 테스트
npm run check

# 개발 서버 실행 (로컬)
wrangler dev --remote
```

### 배포

```bash
# 프로덕션 배포
wrangler deploy
```

## 📋 환경 변수

### Workers Secrets (민감 정보)

다음 명령어로 등록:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put WEBHOOK_SECRET_TOKEN
wrangler secret put QDRANT_API_KEY
```

### Workers Vars (비민감 정보)

`wrangler.toml`에 설정됨:

- `QDRANT_CLOUD_URL`: Qdrant Cloud 엔드포인트 URL
- `QDRANT_COLLECTION`: 컬렉션 이름 (기본: `knue_policies`)
- `OPENAI_CHAT_MODEL`: 채팅 모델 (기본: `gpt-4.1-mini`)
- `ALLOWED_USER_IDS`: 허용된 사용자 ID 목록 (쉼표 구분, 선택)
- `LOG_LEVEL`: 로그 레벨 (`debug|info|error`)
- `RATE_LIMIT_WINDOW_MS`: 사용자별 윈도우 (ms, 기본 5000)
- `RATE_LIMIT_MAX`: 윈도우 내 허용 요청 수 (기본 1)

### KV Rate Limiting 설정

고성능 KV 기반 속도 제한 시스템:

- `RATE_LIMIT_KV_ENABLED`: KV 기반 속도 제한 활성화 (기본: true)
- `RATE_LIMIT_KV_MEMORY_CACHE_SIZE`: L1 캐시 크기 (기본: 1000)
- `RATE_LIMIT_KV_MEMORY_CACHE_TTL`: 캐시 TTL (ms, 기본: 300000)
- `RATE_LIMIT_KV_ADAPTIVE_ENABLED`: 적응형 기능 (기본: false)
- `RATE_LIMIT_KV_CLEANUP_INTERVAL`: 정리 간격 (ms, 기본: 300000)
- `RATE_LIMIT_KV_CLEANUP_THRESHOLD`: 정리 임계값 (ms, 기본: 3600000)

## 🔗 Webhook 설정

```bash
# Webhook 등록
npm run webhook:set -- https://knue-campus-counsel.kangdongouk.workers.dev/telegram

# Webhook 삭제
npm run webhook:delete

# Webhook 정보 확인
npm run webhook:info
```

주의: 중복 호출 방지

- 스크립트는 기본적으로 `allowed_updates: ['message']`만 구독해, 봇이 보낸 메시지나 편집 이벤트(edited_message)로 인한 불필요한 웹훅 호출을 줄입니다.
- 서버 측에서도 `from.is_bot` 메시지는 무시되어, 봇 자체 메시지로 인한 재귀 호출이 발생하지 않습니다.

## 📡 API 엔드포인트

### `/ask` - RAG 질의응답 API

답변만 반환하는 API 엔드포인트입니다. Telegram 메시지 전송 없이 RAG 기반 답변을 받을 수 있습니다.

#### 요청

```bash
POST /ask
Content-Type: application/json
X-Webhook-Secret-Token: {WEBHOOK_SECRET_TOKEN}

{
  "question": "질문 내용"
}
```

#### 응답

**성공 (200)**:

```json
{
  "answer": "RAG 기반 답변 내용",
  "references": [
    {
      "title": "참고 문서 제목"
    }
  ]
}
```

**오류 응답**:

- `401 Unauthorized`: 잘못된 시크릿 토큰
- `400 Bad Request`: 질문 누락
- `500 Internal Server Error`: 서버 오류

#### 사용 예시

```bash
curl -X POST https://knue-campus-counsel.kangdongouk.workers.dev/ask \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret-Token: your_webhook_secret" \
  -d '{"question": "졸업 요건이 궁금합니다"}'
```

## 🏗️ 아키텍처

### 디렉터리 구조

```
src/
├── core/              # 핵심 애플리케이션 로직
│   ├── handler.ts     # 메인 fetch 핸들러, 라우팅
│   ├── config.ts      # 환경변수 로딩/검증
│   └── types.ts       # TypeScript 타입 정의
├── services/          # 외부 서비스 연동
│   ├── openai.ts      # OpenAI API 클라이언트 (임베딩, 채팅)
│   ├── qdrant.ts      # Qdrant 벡터 검색 클라이언트
│   └── telegram.ts    # Telegram API 래퍼 (메시지 전송, webhook 관리)
├── rag/              # RAG 시스템
│   └── rag.ts        # RAG 파이프라인 오케스트레이션 (Markdown 컨텍스트 포맷)
├── metrics/          # 메트릭 수집 시스템
│   ├── metrics.ts
│   └── metrics-registry.ts
├── validation/       # 데이터 검증
│   └── env-validation.ts  # 환경변수 검증 로직
├── utils/            # 유틸리티 함수
│   ├── http.ts       # HTTP 유틸리티 (재시도, 타임아웃)
│   └── utils.ts      # 공통 유틸리티 (로깅, 메시지 분할, 시스템 프롬프트)
└── rate-limit/       # KV 기반 속도 제한 시스템
    ├── hybrid-limiter.ts   # 하이브리드 속도 제한기 (메모리 + KV)
    ├── kv-store.ts         # Cloudflare KV 스토어 구현
    ├── memory-cache.ts     # LRU 메모리 캐시
    ├── index.ts            # 모듈 진입점
    └── types.ts            # 속도 제한 타입 정의

tests/
├── core/             # 핵심 로직 테스트
├── services/         # 서비스 연동 테스트
├── rag/             # RAG 시스템 테스트
├── metrics/         # 메트릭 테스트
├── validation/      # 검증 로직 테스트 (36개 테스트)
├── utils/           # 유틸리티 테스트
└── rate-limit/      # 속도 제한 시스템 테스트
```

### 데이터 플로우

#### Telegram 봇 플로우

1. **Telegram Webhook** → `POST /telegram`
2. **요청 검증** → `X-Telegram-Bot-Api-Secret-Token` 헤더 확인, 사용자 화이트리스트
3. **RAG 파이프라인**:
   - 쿼리 전처리 (트리밍, 길이 제한)
   - OpenAI 임베딩 생성 (`text-embedding-3-large`)
   - 병렬 벡터 검색 (규정 + 게시판 컬렉션)
   - Markdown 형식 컨텍스트 생성 (구조화된 문서 정보)
   - OpenAI 채팅 완성 (컨텍스트 포함)
   - 응답 후처리 (출처 집계, 메시지 분할)
4. **응답 전송** → Telegram `sendMessage`

#### Ask API 플로우

1. **외부 시스템** → `POST /ask`
2. **요청 검증** → `X-Webhook-Secret-Token` 헤더 확인
3. **RAG 파이프라인** (위와 동일)
4. **JSON 응답** → `{ answer, references }`

## 🧪 테스트

```bash
# 전체 테스트 실행
npm test

# 타입 체크
npm run typecheck

# 테스트 + 타입 체크
npm run check

# 테스트 감시 모드
npm run test:watch
```

### 테스트 전략

- **단위 테스트**: 유틸리티 함수, 메시지 포맷팅
- **통합 테스트**: RAG 파이프라인 (모의 OpenAI/Qdrant)
- **E2E 테스트**: Webhook 엔드포인트 테스트
- **에러 시나리오**: 재시도, 타임아웃, 429 오류

## 🚀 배포

### CI/CD 파이프라인

GitHub Actions를 통한 자동 배포:

- **main merge**: 자동 배포

### 수동 배포

```bash
# 프로덕션 배포
wrangler deploy
```

## 📊 모니터링

### 헬스체크

```bash
curl https://knue-campus-counsel.kangdongouk.workers.dev/healthz
```

### 로그 모니터링

```bash
# 실시간 로그 확인
wrangler tail --format pretty
```

## 🔧 설정

### Qdrant 컬렉션 정보

- **컬렉션**: `knue_policies`
- **벡터 차원**: 3072 (text-embedding-3-large)
- **거리 함수**: Cosine
- **문서 수**: 723개

### OpenAI 모델

- **임베딩**: `text-embedding-3-large`
- **채팅**: `gpt-4.1-mini`

### 컬렉션 설정

- `QDRANT_COLLECTION`: 정책/규정 컬렉션
- `BOARD_COLLECTION`: 게시판 컬렉션 (기본: `www-board-data`)

## 🔒 보안

- **비밀 관리**: Cloudflare Workers Secrets 사용
- **Webhook 검증**: `WEBHOOK_SECRET_TOKEN` 사용
  - Telegram: `X-Telegram-Bot-Api-Secret-Token` 헤더
  - Ask API: `X-Webhook-Secret-Token` 헤더
- **사용자 제한**: `ALLOWED_USER_IDS` 화이트리스트 (선택)
- **로그 마스킹**: 민감 정보 자동 마스킹
- 로컬 개발 시 `.env`에는 실제 키를 보관하지 말고 예제로 제공된 `.env.example`를 참고하세요. 실제 배포 키는 Wrangler Secrets로만 관리합니다.

## ⚠️ 제한사항

- Telegram 메시지 최대 4096자 (자동 분할 처리)
- OpenAI API 비용 고려 필요
- Qdrant Cloud 무료 플랜 제한

## 🚀 주요 기능

### KV 기반 고성능 속도 제한
- **하이브리드 캐싱**: L1 메모리 캐시 + L2 KV 스토어
- **슬라이딩 윈도우**: 정확한 시간 윈도우 기반 제한
- **사용자별 제한**: Telegram 사용자/채팅별 독립 제한
- **우아한 성능 저하**: KV 실패 시 메모리 전용 모드로 폴백
- **고성능**: 100k+ req/s 처리량, <1ms 지연시간

### 환경변수 검증 시스템
- **포괄적 검증**: 필수 필드, 숫자 범위, 타입 확인
- **명확한 오류 메시지**: 구체적인 검증 오류 안내
- **경고 시스템**: 누락된 권장 설정 알림
