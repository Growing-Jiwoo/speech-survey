import { describe, it, expect, vi, beforeEach } from 'vitest'

// 라우트 테스트는 lib/db를 통째로 모킹하므로, 여기서는 supabase 클라이언트만 스텁해
// db.ts의 분기 로직(제출 상태 구분·업로드 재시도·삭제 페이지네이션·잠금 판정)을 실제로 실행한다.
//
// 스텁 설계: from(테이블) 호출마다 큐에 넣어 둔 응답을 순서대로 소비하는 체이너블(thenable) 프록시.
// 어떤 체인(.update().eq().is().select() / .select().maybeSingle() …)이든 await 시점에 준비된
// 응답이 나온다 — 쿼리 문법이 아니라 "결과에 따른 분기"를 검증하는 것이 목적.

const tableQueues = new Map<string, unknown[]>()
const fromCalls: string[] = []
const storage = {
  list: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
}

function chain(result: unknown) {
  const target = () => {}
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then')
        return (resolve: (v: unknown) => void) => resolve(result)
      return () => proxy
    },
    apply() { return proxy },
  })
  return proxy
}

vi.mock('@/lib/supabase', () => ({
  sb: () => ({
    from(table: string) {
      fromCalls.push(table)
      const queue = tableQueues.get(table)
      const result = queue && queue.length > 0 ? queue.shift() : { data: null, error: null }
      return chain(result)
    },
    storage: { from: () => storage },
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

import {
  countSessionRecordings, deleteSession, isLoginLocked, sessionSubmitState, submitSession, uploadRecording,
} from '@/lib/db'

const SID = '11111111-1111-4111-8111-111111111111'
const enqueue = (table: string, result: unknown) => {
  const q = tableQueues.get(table) ?? []
  q.push(result)
  tableQueues.set(table, q)
}

beforeEach(() => {
  tableQueues.clear()
  fromCalls.length = 0
  vi.clearAllMocks()
  storage.upload.mockResolvedValue({ error: null })
  storage.remove.mockResolvedValue({ error: null })
  storage.list.mockResolvedValue({ data: [], error: null })
})

describe('submitSession — 미제출 세션만 갱신하고 결과를 구분한다', () => {
  it('업데이트 성공 + 낱말쓰기 있음 → writing_answers upsert 후 ok', async () => {
    enqueue('sessions', { data: [{ id: SID }], error: null })
    enqueue('writing_answers', { error: null })
    const result = await submitSession(SID, [{ itemCode: 'ww01', canWrite: true }], ['none'])
    expect(result).toBe('ok')
    expect(fromCalls).toEqual(['sessions', 'writing_answers'])
  })

  it('낱말쓰기가 비어 있으면 writing_answers를 건드리지 않는다', async () => {
    enqueue('sessions', { data: [{ id: SID }], error: null })
    const result = await submitSession(SID, [], [])
    expect(result).toBe('ok')
    expect(fromCalls).toEqual(['sessions'])
  })

  it('업데이트 0건 + 세션이 이미 제출됨 → already_submitted (409 신호)', async () => {
    enqueue('sessions', { data: [], error: null })                                  // update … is('submitted_at', null)
    enqueue('sessions', { data: { submitted_at: '2026-07-15T00:00:00Z' }, error: null }) // 상태 재조회
    expect(await submitSession(SID, [], [])).toBe('already_submitted')
  })

  it('업데이트 0건 + 세션 미존재 → not_found (404 신호)', async () => {
    enqueue('sessions', { data: [], error: null })
    enqueue('sessions', { data: null, error: null })
    expect(await submitSession(SID, [], [])).toBe('not_found')
  })

  it('낱말쓰기 upsert 실패는 예외로 전파된다', async () => {
    enqueue('sessions', { data: [{ id: SID }], error: null })
    enqueue('writing_answers', { error: { message: 'duplicate key' } })
    await expect(submitSession(SID, [{ itemCode: 'ww01', canWrite: false }], [])).rejects.toThrow('duplicate key')
  })
})

describe('sessionSubmitState', () => {
  it('행 없음 → missing', async () => {
    enqueue('sessions', { data: null, error: null })
    expect(await sessionSubmitState(SID)).toBe('missing')
  })
  it('submitted_at null → open', async () => {
    enqueue('sessions', { data: { submitted_at: null }, error: null })
    expect(await sessionSubmitState(SID)).toBe('open')
  })
  it('submitted_at 존재 → submitted', async () => {
    enqueue('sessions', { data: { submitted_at: '2026-07-15T00:00:00Z' }, error: null })
    expect(await sessionSubmitState(SID)).toBe('submitted')
  })
})

describe('uploadRecording — 스토리지 업로드 1회 자동 재시도', () => {
  it('1차 실패 후 재시도 성공 → 예외 없이 완료(업로드 2회 호출)', async () => {
    storage.upload
      .mockResolvedValueOnce({ error: { message: 'timeout' } })
      .mockResolvedValueOnce({ error: null })
    await uploadRecording('p/a.webm', Buffer.from([1]), 'audio/webm')
    expect(storage.upload).toHaveBeenCalledTimes(2)
  })

  it('2회 연속 실패 → "녹음 업로드 실패" 예외', async () => {
    storage.upload.mockResolvedValue({ error: { message: 'boom' } })
    await expect(uploadRecording('p/a.webm', Buffer.from([1]), 'audio/webm'))
      .rejects.toThrow(/녹음 업로드 실패/)
    expect(storage.upload).toHaveBeenCalledTimes(2)
  })
})

describe('deleteSession — PII 파기는 스토리지 전체 페이지네이션 후 행 삭제', () => {
  const obj = (name: string) => ({ name })

  it('[REGRESSION] 100개 초과 녹음도 전부 수집해 한 번에 제거한다 (list 기본 상한 100 함정)', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => obj(`a${i}.webm`))
    const page2 = Array.from({ length: 40 }, (_, i) => obj(`b${i}.webm`))
    storage.list
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null })
    enqueue('sessions', { data: null, error: null }) // delete().eq()

    await deleteSession(SID)

    expect(storage.list).toHaveBeenCalledTimes(2)
    expect(storage.list).toHaveBeenNthCalledWith(1, SID, { limit: 100, offset: 0 })
    expect(storage.list).toHaveBeenNthCalledWith(2, SID, { limit: 100, offset: 100 })
    expect(storage.remove).toHaveBeenCalledTimes(1)
    expect(storage.remove.mock.calls[0][0]).toHaveLength(140)
    expect(storage.remove.mock.calls[0][0][0]).toBe(`${SID}/a0.webm`)
    expect(fromCalls).toEqual(['sessions'])
  })

  it('녹음이 없으면 remove 없이 행만 삭제', async () => {
    storage.list.mockResolvedValueOnce({ data: [], error: null })
    enqueue('sessions', { data: null, error: null })
    await deleteSession(SID)
    expect(storage.remove).not.toHaveBeenCalled()
    expect(fromCalls).toEqual(['sessions'])
  })

  it('스토리지 목록 조회 실패 시 행 삭제로 진행하지 않는다 (고아 오디오 방지)', async () => {
    storage.list.mockResolvedValueOnce({ data: null, error: { message: 'storage down' } })
    await expect(deleteSession(SID)).rejects.toThrow('storage down')
    expect(fromCalls).toEqual([]) // sessions delete 미도달 → 관리자가 재시도 가능
  })
})

describe('isLoginLocked — 임계 도달 + 잠금 시각 이내일 때만 true', () => {
  const future = new Date(Date.now() + 60_000).toISOString()
  const past = new Date(Date.now() - 60_000).toISOString()

  it('기록 없음 → false', async () => {
    enqueue('login_attempts', { data: null, error: null })
    expect(await isLoginLocked('1.2.3.4', 5)).toBe(false)
  })
  it('실패 수 임계 미달 → false', async () => {
    enqueue('login_attempts', { data: { fail_count: 4, locked_until: future }, error: null })
    expect(await isLoginLocked('1.2.3.4', 5)).toBe(false)
  })
  it('임계 도달했지만 잠금 만료 → false', async () => {
    enqueue('login_attempts', { data: { fail_count: 9, locked_until: past }, error: null })
    expect(await isLoginLocked('1.2.3.4', 5)).toBe(false)
  })
  it('임계 도달 + 잠금 유효 → true', async () => {
    enqueue('login_attempts', { data: { fail_count: 5, locked_until: future }, error: null })
    expect(await isLoginLocked('1.2.3.4', 5)).toBe(true)
  })
})

describe('countSessionRecordings', () => {
  it('count 값 그대로, null이면 0', async () => {
    enqueue('recordings', { count: 7, error: null })
    expect(await countSessionRecordings(SID)).toBe(7)
    enqueue('recordings', { count: null, error: null })
    expect(await countSessionRecordings(SID)).toBe(0)
  })
})
