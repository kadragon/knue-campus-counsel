# KV 기반 사용자별 레이트 리밋 구현 계획

## 프로젝트 개요

현재 in-memory 기반의 휘발성 레이트 리밋을 Cloudflare KV를 활용한 영속적이고 확장 가능한 시스템으로 개선

### 현재 문제점
- ✗ Worker 재시작 시 레이트 리밋 데이터 손실
- ✗ 다중 인스턴스 간 일관성 부족  
- ✗ 메모리 누수 가능성
- ✗ 모니터링 및 추적 불가

### 목표
- ✓ 99.9% 데이터 영속성 보장
- ✓ <5ms 응답 시간 유지
- ✓ 다중 인스턴스 환경 지원
- ✓ 자동 정리 및 모니터링

---

## Phase 1: 인프라 준비 (Week 1)

### 1.1 KV 네임스페이스 설정
- [ ] KV 네임스페이스 생성
  ```bash
  wrangler kv:namespace create "RATE_LIMIT_KV"
  wrangler kv:namespace create "RATE_LIMIT_KV" --preview
  ```
- [ ] `wrangler.toml` 업데이트
  ```toml
  kv_namespaces = [
    { binding = "RATE_LIMIT_KV", id = "your_kv_namespace_id", preview_id = "your_preview_id" }
  ]
  ```

### 1.2 환경 변수 설정
- [ ] 필수 환경 변수 등록
  ```bash
  wrangler secret put RATE_LIMIT_KV_ENABLED  # true
  ```
- [ ] 선택적 환경 변수 추가
  - `RATE_LIMIT_MEMORY_CACHE_SIZE` (기본: 1000)
  - `RATE_LIMIT_MEMORY_CACHE_TTL` (기본: 300000)
  - `RATE_LIMIT_CLEANUP_THRESHOLD` (기본: 3600000)
  - `RATE_LIMIT_CLEANUP_INTERVAL` (기본: 3600000)
  - `RATE_LIMIT_ADAPTIVE_ENABLED` (기본: false)

---

## Phase 2: 핵심 구현 (Week 2-3)

### 2.1 파일 구조 생성
- [ ] `src/rate-limit/` 디렉토리 생성
- [ ] 타입 정의 (`src/rate-limit/types.ts`)
  ```typescript
  interface RateLimitRecord {
    timestamps: number[];
    windowMs: number;
    maxRequests: number;
    lastAccess: number;
    metadata?: {
      userAgent?: string;
      endpoint?: string;
      flags?: string[];
      escalationLevel?: number;
    };
  }

  interface RateLimitResult {
    allowed: boolean;
    retryAfterSec: number;
    remaining: number;
    resetTime: number;
    metadata?: {
      source: 'cache' | 'kv' | 'new';
      kvEnabled: boolean;
      escalated?: boolean;
    };
  }
  ```

### 2.2 KV Store 추상화 레이어
- [ ] `src/rate-limit/kv-store.ts` 구현
  - KVStore 인터페이스 정의
  - CloudflareKVStore 구현
  - 에러 처리 및 fallback 로직
  - 메타데이터 지원

### 2.3 메모리 캐시 구현
- [ ] `src/rate-limit/memory-cache.ts` 구현
  - LRU 캐시 로직
  - TTL 지원
  - 크기 제한 관리
  - 성능 최적화

### 2.4 하이브리드 레이트 리미터
- [ ] `src/rate-limit/hybrid-limiter.ts` 구현
  - L1 (메모리) + L2 (KV) 캐싱 전략
  - Write-through 패턴
  - 동시성 처리
  - 자동 정리 기능

### 2.5 설정 관리
- [ ] `src/config.ts` 업데이트
  - RateLimitConfig 타입 추가
  - 환경 변수 로딩 로직
  - 기본값 설정

### 2.6 메인 인터페이스
- [ ] `src/rate-limit/index.ts` 구현
  - 통합 API 제공
  - 기존 `allowRequest` 함수와 호환성 유지
  - 초기화 및 정리 로직

---

## Phase 3: 통합 및 리팩토링 (Week 3)

### 3.1 기존 코드 교체
- [ ] `src/handler.ts` 업데이트
  - 새로운 레이트 리미터 사용
  - 에러 처리 개선
  - 로깅 추가

### 3.2 유틸리티 정리
- [ ] `src/utils.ts` 정리
  - 기존 `allowRequest` 함수 deprecated 마킹
  - 새 함수로 점진적 마이그레이션

### 3.3 타입 업데이트
- [ ] `src/types.ts` 업데이트
  - 새로운 레이트 리밋 관련 타입 추가
  - Env 인터페이스에 RATE_LIMIT_KV 바인딩 추가

---

## Phase 4: 테스트 구현 (Week 4)

### 4.1 단위 테스트
- [ ] `tests/rate-limit/memory-cache.test.ts`
  - LRU 로직 검증
  - TTL 동작 확인
  - 크기 제한 테스트

- [ ] `tests/rate-limit/kv-store.test.ts`
  - KV 작업 성공/실패 시나리오
  - 메타데이터 저장/로드
  - 에러 처리

- [ ] `tests/rate-limit/hybrid-limiter.test.ts`
  - 메모리 우선 로직
  - KV fallback 동작
  - 동시성 테스트
  - 정리 작업 검증

### 4.2 통합 테스트
- [ ] `tests/rate-limit/integration.test.ts`
  - 전체 플로우 검증
  - Worker 재시작 시뮬레이션
  - 고부하 테스트
  - 다중 사용자 시나리오

### 4.3 성능 테스트
- [ ] `tests/rate-limit/performance.test.ts`
  - 응답 시간 측정 (<5ms 목표)
  - 동시 요청 처리 (1000 req/s)
  - 메모리 사용량 모니터링

### 4.4 기존 테스트 업데이트
- [ ] `tests/handler_pipeline.test.ts` 수정
  - 새 레이트 리밋 로직 반영
  - KV 모킹 추가

---

## Phase 5: 점진적 배포 (Week 5)

### 5.1 Feature Flag 구현
- [ ] 단계적 활성화 로직
  ```typescript
  const ROLLOUT_CONFIG = {
    phase1: { kvEnabled: false, percentage: 0 },    // 기존 로직
    phase2: { kvEnabled: true, percentage: 10 },    // 10% 트래픽
    phase3: { kvEnabled: true, percentage: 50 },    // 50% 트래픽
    phase4: { kvEnabled: true, percentage: 100 }    // 전체 트래픽
  };
  ```

### 5.2 배포 단계
- [ ] **Phase 5.1**: 코드 배포 (KV 비활성화)
- [ ] **Phase 5.2**: 10% 트래픽 테스트
- [ ] **Phase 5.3**: 50% 트래픽 확대
- [ ] **Phase 5.4**: 100% 전환
- [ ] **Phase 5.5**: 기존 코드 제거

### 5.3 모니터링 설정
- [ ] 메트릭 수집 로직 구현
- [ ] 알림 임계값 설정
- [ ] 대시보드 구성

---

## Phase 6: 모니터링 및 최적화 (Week 6)

### 6.1 메트릭 구현
- [ ] 성능 지표
  - 응답 시간 (P50, P95, P99)
  - KV 작업 성공률
  - 메모리 캐시 히트율

- [ ] 비즈니스 지표
  - 시간당 요청 수
  - 레이트 리밋 적용률
  - 사용자별 요청 패턴

- [ ] 운영 지표
  - KV 스토리지 사용량
  - 정리 작업 효율성
  - 에러율 및 유형

### 6.2 알림 시스템
- [ ] 임계값 기반 알림 설정
  ```typescript
  const ALERT_THRESHOLDS = {
    kvErrorRate: 5,      // 5% 이상 KV 에러 시
    responseTime: 100,   // 100ms 이상 응답 시간
    blockRate: 50,       // 50% 이상 요청 차단 시
    memoryUsage: 80      // 80% 이상 메모리 사용 시
  };
  ```

### 6.3 성능 최적화
- [ ] 캐시 히트율 분석 및 개선
- [ ] KV 작업 배치 처리 최적화
- [ ] 메모리 사용량 최적화

---

## 고급 기능 (Optional - Week 7+)

### 7.1 적응형 레이트 리밋
- [ ] 의심스러운 활동 감지
- [ ] 동적 제한 조정
- [ ] 사용자 신뢰도 기반 제한

### 7.2 분석 기능
- [ ] 사용 패턴 분석
- [ ] 남용 패턴 감지
- [ ] 리포트 생성

### 7.3 관리 API
- [ ] 레이트 리밋 상태 조회
- [ ] 수동 제한 해제
- [ ] 사용자별 제한 설정

---

## 성공 지표

### 기술적 목표
- [ ] 99.9% 업타임 달성
- [ ] <5ms 평균 응답 시간
- [ ] >95% 메모리 캐시 히트율
- [ ] <1% KV 에러율

### 비즈니스 목표  
- [ ] 사용자 경험 개선 (응답성)
- [ ] 시스템 안정성 향상
- [ ] 운영 비용 최적화
- [ ] 확장성 확보

---

## 위험 요소 및 대응 방안

### 기술적 위험
- **KV 장애**: Graceful degradation으로 메모리 전용 모드 동작
- **성능 저하**: 캐시 최적화 및 배치 처리로 대응
- **데이터 일관성**: Write-through 패턴으로 일관성 보장

### 운영적 위험
- **배포 실패**: 점진적 롤아웃으로 위험 최소화
- **비용 증가**: 사용량 모니터링 및 최적화
- **복잡성 증가**: 충분한 테스트 및 문서화

---

## 예상 비용

### KV 사용량 (월간)
- 활성 사용자: 1,000명
- 사용자당 평균 요청: 100회
- KV 작업 수: 200,000회 (Read + Write)
- 스토리지: ~10MB
- **예상 비용**: $2-5/월

### 개발 리소스
- 개발 시간: 6주 (1명)
- 테스트 및 검증: 추가 1주
- 총 개발 비용: ~7주

### ROI
- 시스템 안정성 향상
- 사용자 경험 개선  
- 운영 효율성 증대
- 향후 확장성 확보