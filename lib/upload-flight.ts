// lib/upload-flight.ts — 이 탭에서 지금 올리고 있는 녹음(`세션:페이지:시도`).
//
// 모듈 범위라 검사 ↔ 검토 화면을 오가도 남고, 새로고침이면 비어 있다 — 저장 상태의 「올리는 중」
// (`lib/survey-state` pendingUploads) 가운데 여기 없는 것이 끊긴 업로드다(`settleLostUploads`).
// 검토 화면도 이것을 본다: 마지막 녹음 직후 검토로 넘어와 바로 제출하면, 그사이 끝난 업로드는 녹음 라우트가
// 「이미 제출된 검사」(409)로 거부해 녹음이 조용히 사라지고 담당자 화면에서 X·0점으로 고정된다(2026-10-07).
// 그래서 검토 화면은 올리는 중인 것이 있으면 제출을 막고, 끝날 때마다(`subscribeUploads`) 저장 상태를 다시 읽는다.

const flights = new Set<string>()
const listeners = new Set<() => void>()

const keyOf = (sessionId: string, code: string, attemptNo: number) => `${sessionId}:${code}:${attemptNo}`

/** 올리기 시작 — 「녹음 완료」 표시(저장 상태의 올리는 중 표시)보다 **먼저** 부른다. 거꾸로면 그 사이 다른 화면이
 *  열려 저장 상태를 읽을 때 이 시도를 끊긴 업로드로 거둔다. */
export function beginUpload(sessionId: string, code: string, attemptNo: number): void {
  flights.add(keyOf(sessionId, code, attemptNo))
  notify()
}

/** 올리기 끝(성공이든 실패든) — 저장 상태를 **다 고친 뒤에** 부른다. 알림을 받은 화면이 곧바로 저장 상태를 다시 읽기 때문이다. */
export function endUpload(sessionId: string, code: string, attemptNo: number): void {
  if (flights.delete(keyOf(sessionId, code, attemptNo))) notify()
}

export function isUploading(sessionId: string, code: string, attemptNo: number): boolean {
  return flights.has(keyOf(sessionId, code, attemptNo))
}

/** 그 세션에서 올리고 있는 녹음 수 */
export function uploadsInFlight(sessionId: string): number {
  const prefix = `${sessionId}:`
  let n = 0
  for (const k of flights) if (k.startsWith(prefix)) n++
  return n
}

/** 올리기가 시작·끝날 때마다 부른다. 돌려준 함수로 해지한다. */
export function subscribeUploads(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function notify() {
  for (const fn of [...listeners]) fn()
}
