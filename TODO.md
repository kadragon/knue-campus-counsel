# TODO: 한국교원대학교 규정/지침 RAG 기반 Telegram 챗봇

이 문서는 제공된 PRD를 기반으로 MVP를 출시하기 위한 실행형 체크리스트입니다. 각 항목은 PRD의 기능/비기능 요구사항과 배포 전략을 충족하도록 구성되었습니다.

---

## 0) 사전 준비 / 접근 권한
- [ ] Cloudflare 계정 및 Workers 무료 플랜 활성화
- [ ] `wrangler` 설치 및 로그인 (`npm i -g wrangler`, `wrangler login`)
- [ ] Telegram Bot 생성 (BotFather) 및 `TELEGRAM_BOT_TOKEN` 확보
- [ ] Telegram Webhook 시크릿 토큰 결정 (`TELEGRAM_WEBHOOK_SECRET_TOKEN`)
- [ ] Qdrant Cloud 클러스터 생성, `QDRANT_URL`, `QDRANT_API_KEY` 확보
- [ ] OpenAI API 키 확보 (`OPENAI_API_KEY`)
- [ ] GitHub 리포지토리/Actions 사용할 경우 권한/시크릿 설정 준비
- [ ] 운영/개발 환경 구분: `dev` / `production` 네이밍 합의

## 1) 리포지토리 초기화 및 구조 ✅
- [x] Cloudflare Workers TypeScript 프로젝트 부트스트랩 (`wrangler init --type=typescript`)
- [x] 디렉터리 구조 정의
  - [x] `src/handler.ts` (메인 fetch 핸들러, 라우팅)
  - [x] `src/telegram.ts` (Webhook 파서, 응답 전송 유틸)
  - [x] `src/rag.ts` (오케스트레이션: 임베딩 → 검색 → LLM → 포맷)
  - [x] `src/qdrant.ts` (Qdrant 검색 클라이언트)
  - [x] `src/openai.ts` (임베딩/LLM 호출 래퍼)
  - [x] `src/utils.ts` (메시지 분할, 포맷, 에러/재시도 등)
  - [x] `src/config.ts` (환경변수 로딩/검증)
  - [x] `src/types.ts` (타입 정의: Telegram Update, RAG 결과 등)
- [x] `tsconfig.json` 조정 (Workers 타겟, 모듈 해석, noEmit 등)
- [x] 최소 종속성만 채택 (추가 라이브러리 지양, `undici` 불필요: Workers `fetch` 사용)

## 2) 설정/시크릿/스토리지
- [x] `wrangler.toml` 작성
  - [x] `name`, `main`, `compatibility_date`
  - [x] `routes` 또는 `workers.dev` 서브도메인 사용 결정
  - [ ] `kv_namespaces` (선택: 로그/레이트리밋 용도) 정의
  - [x] 환경 분리 `[[env.dev]]`, `[[env.production]]`
- [ ] Secrets 등록 (`wrangler secret put ...`)
  - [ ] `OPENAI_API_KEY`
  - [ ] `TELEGRAM_BOT_TOKEN`
  - [ ] `TELEGRAM_WEBHOOK_SECRET_TOKEN`
  - [ ] `QDRANT_API_KEY`
- [x] Vars/환경변수 정의 (wrangler `vars` 또는 코드에서 상수)
  - [x] `QDRANT_URL`, `QDRANT_COLLECTION` (knue_policies)
  - [x] `ALLOWED_USER_IDS` (쉼표 구분 화이트리스트)
  - [x] `LOG_LEVEL` (`info|debug|error`)
  - [x] `OPENAI_CHAT_MODEL` (gpt-4o)
  - [ ] (선택) `SENTRY_DSN` 또는 외부 로깅 엔드포인트
- [ ] (선택) KV 네임스페이스 생성: `LOGS`, `RATELIMIT`

## 3) Telegram Webhook 엔드포인트 ✅
- [x] `fetch` 핸들러에서 `POST /telegram/webhook` 라우팅
- [x] `X-Telegram-Bot-Api-Secret-Token` 검증 (시크릿 토큰 일치 확인)
- [x] Update 파싱: `message.text` 지원 (기타 타입은 무시/확장 여지)
- [x] 화이트리스트 검사: `ALLOWED_USER_IDS` 불일치 시 응답 거절
- [x] 기본 커맨드 처리: `/start`, `/help`
- [x] 그룹/채널 메시지 처리 정책 결정 (초기엔 1:1 DM만 허용)
- [x] 에러 응답 기본 메시지 정의 (장애 시 사용자 공지)

## 4) RAG 파이프라인 (경량 구현)
- [ ] 쿼리 전처리: 트리밍, 정규화, 길이 제한
- [ ] 임베딩 호출 (OpenAI Embeddings)
  - [ ] 모델 선택 확인 (예: `text-embedding-3-large` 또는 최신 권장)
  - [ ] 타임아웃/재시도(지수 백오프) 구현
- [ ] Qdrant 벡터 검색
  - [ ] `top_k` 결정 (예: 5~8)
  - [ ] 스코어 임계값 설정 (근거 없음 판정 기준)
  - [ ] 메타데이터 필터(예: `effective_date`, `is_active`) 지원 여지
  - [ ] 결과 Payload: `doc_id`, `title`, `article_no`, `effective_date`, `url`, `chunk_text`
- [ ] 프롬프트 구성
  - [ ] “규정/지침 근거 기반으로만 답변”, “출처 필수”, “추측 금지” 포함
  - [ ] 컨텍스트로 상위 N개 청크와 메타데이터 전달
  - [ ] 한국어 톤/포맷 가이드 포함
- [ ] LLM 호출 (OpenAI Chat)
  - [ ] 모델 가용성 확인 (PRD: GPT-5 → 실제 사용 모델 결정 필요)
  - [ ] 토큰 한도/비용 고려, 타임아웃/재시도
- [ ] 응답 후처리
  - [ ] 출처 집계/중복 제거 (문서 단위, 조문 표시)
  - [ ] 텍스트 길이 제한 대응 (4096자 분할 전송 대상)
  - [ ] “근거 없음” 조건 처리 (스코어 미달 또는 검색 결과 0건)

## 5) 메시지 전송/포맷
- [ ] Telegram `sendMessage` 래퍼 구현
  - [ ] `parse_mode`는 `HTML` 사용 (이스케이프 수고 최소화)
  - [ ] `disable_web_page_preview` 기본 활성화
  - [ ] 4096자 분할 유틸: `splitTelegramMessage(text, 4096)`
- [ ] 답변 포맷 정책
  - [ ] 본문 → 구분선 → “참조” 섹션 링크/조문 목록
  - [ ] 다수 메시지 분할 시 번호/연결감 부여
- [ ] (확장) “요약 보기” 인라인 버튼 제공 및 콜백 처리

## 6) 오류 처리/신뢰성/레이트리밋
- [ ] 외부 API 호출 공통 재시도 유틸 (HTTP 429/5xx, 네트워크 오류)
- [ ] 하드 타임아웃(예: 12s) + 취소 전파
- [ ] 사용자 친화적 에러 메시지 (“현재 근거 조회에 장애가 있어요…”)
- [ ] 사용자별 레이트리밋(선택, KV 카운터 기반)
- [ ] 장애 시 로깅(필수) + 알림(선택: Sentry/Webhook)

## 7) 로깅/감사/보존
- [ ] 구조화 로그 스키마 정의: `ts`, `user_id`, `query`, `refs`, `latency`, `err`
- [ ] Workers 콘솔 로그 + (선택) KV/Analytics Engine 기록
- [ ] 개인정보 최소 수집/보존 정책 반영 (보존 기간 설정)
- [ ] 관리자 조회 스크립트/엔드포인트 (선택, 인증 필요)

## 8) Qdrant 컬렉션 설계/검증
- [ ] 컬렉션 생성/설정 문서화 (차원, 거리함수, HNSW/IVF 설정)
- [ ] 메타데이터 스키마 합의: `doc_id`, `title`, `article_no`, `effective_date`, `url`
- [ ] 인덱싱/업서트 스크립트 별도 리포/파이프라인으로 관리 (PRD 범위 외)
- [ ] 검색 품질 스모크 테스트 (대표 쿼리 10개)

## 9) CI/CD & 배포
- [ ] GitHub Actions 워크플로우 작성
  - [ ] PR: 타입체크/빌드, 프리뷰 배포 (`wrangler publish --env dev`)
  - [ ] main: 프로덕션 배포 (`wrangler publish --env production`)
  - [ ] 필요 시 환경별 Secrets 매핑
- [ ] 배포 파이프라인 수동 롤백 가이드 정리
- [ ] 릴리스 태깅 규칙 정의 (`v0.1.0` 등)

## 10) Webhook 세팅/런북
- [ ] 개발: `wrangler dev --remote` URL 확보
- [ ] Telegram Webhook 설정 스크립트 작성
  - [ ] `setWebhook`(url, secret_token) 호출
  - [ ] `deleteWebhook`/재설정 스크립트 포함
- [ ] 운영: 커스텀 도메인 또는 `workers.dev` 최종 URL 반영
- [ ] 헬스체크 엔드포인트(예: `GET /healthz`) 구현

## 11) 테스트 전략
- [ ] 단위 테스트: `utils`, 메시지 분할, 포맷터
- [ ] 통합 테스트: RAG 파이프라인(모의 OpenAI/Qdrant 어댑터)
- [ ] E2E 테스트: 로컬/스테이징에서 Telegram 실제 전송 스모크
- [ ] 장애/시간초과/429 재시도 시나리오 테스트

## 12) 보안/컴플라이언스
- [ ] Secrets는 Workers Secrets로만 관리 (Git 미포함)
- [ ] Telegram Webhook 시크릿 헤더 필수 검증
- [ ] 사용자 화이트리스트(옵션) 활성화
- [ ] 로그 내 민감정보 마스킹/부분 저장
- [ ] 의존성 점검 (가능 시 `pnpm audit`/`npm audit`)

## 13) 문서화
- [ ] `README.md` (아키텍처, 환경변수, 배포, 로컬 실행, 제한사항)
- [ ] `RUNBOOK.md` (장애 대응, 롤백, Webhook 재설정)
- [ ] `SECURITY.md` (비밀관리, 접근통제, 로그 보존)
- [ ] `ARCHITECTURE.md` (데이터 플로우, 시퀀스 다이어그램 간단히)

## 14) MVP 완료 기준 (DoD)
- [ ] Telegram에서 임의 질의 시 규정 근거 포함 응답 제공 (F1, F2)
- [ ] 문서 근거 부재 시 “근거 없음” 처리 (F3)
- [ ] 4096자 초과 응답 분할 전송 확인 (F4)
- [ ] 평균 응답 3~8초 내 (네트워크 상태 하에서) (NFR)
- [ ] 비정상 응답/장애 로깅 및 관리자 확인 가능 (A2)
- [ ] 배포 자동화/롤백 가능한 상태 (CI/CD)

## 15) 모델/정책 관련 오픈 이슈
- [ ] GPT-5 가용성 확인 및 대체 모델 결정 (예: `gpt-4.1`, `gpt-4o`) 
- [ ] 임베딩 모델 최종 확정 (`text-embedding-3-large` 등)
- [ ] 검색 스코어 임계값/Top-K/프롬프트 튜닝 기준 수립
- [ ] “요약 보기” 버튼 UX 정의 및 우선순위 결정 (F5 확장)
- [ ] 규정 버전/시행일 필터링 정책 정교화 (최신/과거 비교)

---

### 참고: 환경변수 요약
- `OPENAI_API_KEY`: OpenAI API 키
- `QDRANT_URL`: Qdrant Cloud HTTP URL (예: https://xxxxxxxxxxx.qdrant.cloud)
- `QDRANT_API_KEY`: Qdrant API 키
- `QDRANT_COLLECTION`: 컬렉션 이름 (예: `knue-regs`)
- `TELEGRAM_BOT_TOKEN`: 텔레그램 봇 토큰
- `TELEGRAM_WEBHOOK_SECRET_TOKEN`: Webhook 검증 시크릿
- `ALLOWED_USER_IDS`: 화이트리스트 사용자 ID(쉼표 구분), 비어있으면 비활성화
- `LOG_LEVEL`: `info|debug|error`

### 참고: 포맷 가이드(초안)
- 답변: 핵심 결론 → 근거 요약 → 유의사항(있다면)
- 참조: `• 제목 – 제X조(항/호) | 링크` 형식으로 하단 표기
- 불확실: “문서에서 해당 근거를 찾지 못했습니다.”로 명시

### 참고: 로컬/스테이징 실행 흐름
1) `wrangler dev --remote`로 임시 URL 발급
2) 해당 URL로 Telegram `setWebhook`(secret_token 포함)
3) DM으로 질의 전송 → 응답 및 로그 확인

