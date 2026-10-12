// lib/upload-flight.ts — 이 탭에서 지금 올리고 있는 녹음(`세션:페이지:시도`).
//
// 모듈 범위라 검사 ↔ 검토 화면을 오가도 남고, 새로고침이면 비어 있다 — 저장 상태의 「올리는 중」
// (`lib/survey-state` pendingUploads) 가운데 여기 없는 것이 끊긴 업로드다(`settleLostUploads`).
// 검토 화면도 이것을 본다: 마지막 녹음 직후 검토로 넘어와 바로 제출하면, 그사이 끝난 업로드는 녹음 라우트가
// 「이미 제출된 검사」(409)로 거부해 녹음이 조용히 사라지고 담당자 화면에서 X·0점으로 고정된다(2026-10-07).
// 그래서 검토 화면은 올리는 중인 것이 있으면 제출을 막고, 끝날 때마다(`subscribeUploads`) 저장 상태를 다시 읽는다.

import type { Recording } from '@/hooks/useRecorder'

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

// ── 다시 보낼 녹음(저장 실패) ──────────────────────────────────────────────────────────────────────────
// 올리기에 실패해(연결 끊김·5xx) [다시 저장]을 기다리는 녹음. 종전에는 검사 화면의 상태라, 검토 화면을 오가거나
// [저장하고 나가기] → [이어서 하기]만 해도 녹음 파일이 경고 없이 사라지고 그 화면이 다시 「모르겠어요」가 됐다
// (2026-10-12 점검). 모듈 범위라 같은 탭이면 화면을 옮겨도 남는다. 새로고침·탭 닫기는 경고로 막는다(검사·검토 화면).
// 시도 번호를 함께 들고 있어야 한다 — 다시 보낼 때 새로 매기면 그사이 저장된 다른 시도를 덮는다.

export interface FailedUpload { rec: Recording; attemptNo: number }

const failed = new Map<string, Record<string, FailedUpload>>()
const EMPTY: Record<string, FailedUpload> = Object.freeze({}) as Record<string, FailedUpload>

/** 그 세션의 다시 보낼 녹음(페이지 코드 → 녹음). 바뀌지 않으면 같은 객체를 돌려준다(useSyncExternalStore 스냅숏). */
export function failedUploads(sessionId: string): Record<string, FailedUpload> {
  return failed.get(sessionId) ?? EMPTY
}

export function setFailedUpload(sessionId: string, code: string, f: FailedUpload): void {
  failed.set(sessionId, { ...failedUploads(sessionId), [code]: f })
  notify()
}

export function clearFailedUpload(sessionId: string, code: string): void {
  const cur = failedUploads(sessionId)
  if (!(code in cur)) return
  const { [code]: _removed, ...rest } = cur
  if (Object.keys(rest).length === 0) failed.delete(sessionId)
  else failed.set(sessionId, rest)
  notify()
}

// ── 페이지가 닫히는 중 ──────────────────────────────────────────────────────────────────────────────────
// 올리는 도중 새로고침·탭 닫기를 하면 브라우저가 요청을 끊고, 그 끊김이 「올리기 실패」로 돌아와 저장 상태의 「올리는 중」
// 표시와 「녹음 완료」를 지워 버렸다 — 다시 열면 「화면이 닫혔어요」 안내 없이 그 화면이 「모르겠어요」가 됐다(2026-10-12 점검,
// 실제 네트워크에서만 재현). 닫히는 중의 실패는 처리하지 않고 두어, 다음에 열 때 끊긴 업로드로 거두게 한다(settleLostUploads).
let unloading = false
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { unloading = true })
  window.addEventListener('pageshow', () => { unloading = false })   // 뒤로가기 캐시에서 돌아온 경우
}

/** 이 페이지가 닫히는 중인가 — 올리기 실패를 처리하기 전에 본다 */
export const pageUnloading = () => unloading
