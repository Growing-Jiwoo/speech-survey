// lib/login-policy.ts — 관리자 로그인 레이트리밋 정책 상수·계산(순수 함수는 node 테스트 가능).
export const GLOBAL_KEY = '__global__'   // IP 무관 누적 실패 버킷(IP 로테이션 공격 완화용 카운터)

// per-IP 하드 잠금: 특정 IP가 임계 실패에 도달하면 잠금창 동안 429. 대상형이라 정상 관리자에 영향 없음.
export const IP_MAX_FAILS = 5
export const LOCK_MS = 10 * 60_000

/** 잠겼을 때 문구 — 「잠시 후」뿐이라 언제 다시 해 볼지 알 수 없었다(2026-10-12 점검). 분은 LOCK_MS에서 계산한다 —
 *  글자에 숫자를 따로 적으면 잠금 시간을 바꿀 때 글자만 남는다. 잠금은 마지막 실패부터라 실제로는 이보다 짧을 수 있다. */
export const LOCKED_MSG = `시도가 너무 많아요. ${Math.ceil(LOCK_MS / 60_000)}분 뒤에 다시 시도해 주세요.`

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
