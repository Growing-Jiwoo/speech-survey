// lib/login-policy.ts — 관리자 로그인 레이트리밋 정책 상수·계산(순수 함수는 node 테스트 가능).
export const GLOBAL_KEY = '__global__'   // IP 무관 누적 실패 버킷(IP 로테이션 공격 완화용 카운터)

// per-IP 하드 잠금: 특정 IP가 임계 실패에 도달하면 잠금창 동안 429. 대상형이라 정상 관리자에 영향 없음.
export const IP_MAX_FAILS = 5
export const LOCK_MS = 10 * 60_000

// 글로벌 백오프: 전역 실패 누적이 START 이상이면 요청마다 점증 지연을 준다(하드 잠금 대신).
// IP를 돌려가며 시도하는 공격에 마찰을 주되, 정상 관리자의 로그인을 완전히 봉쇄하지 않는다(가용성 우선).
// per-IP 잠금이 5회라, 전역 30에 도달하려면 최소 6개 IP가 필요 — 정상 단일 관리자는 절대 트리거하지 않는다.
export const GLOBAL_BACKOFF_START = 30
export const GLOBAL_BACKOFF_STEP_MS = 300
export const GLOBAL_BACKOFF_MAX_MS = 2000

/** 전역 실패 수 → 로그인 처리 전 지연(ms). START 미만은 0, 이후 선형 증가하되 MAX에서 상한. */
export function globalBackoffMs(globalFails: number): number {
  if (globalFails < GLOBAL_BACKOFF_START) return 0
  return Math.min((globalFails - GLOBAL_BACKOFF_START + 1) * GLOBAL_BACKOFF_STEP_MS, GLOBAL_BACKOFF_MAX_MS)
}
