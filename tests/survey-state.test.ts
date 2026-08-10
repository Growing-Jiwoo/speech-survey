import { describe, it, expect, beforeEach } from 'vitest'
import { newState, saveState, loadState, clearState } from '@/lib/survey-state'

// node 환경에는 localStorage가 없으므로 Map 기반 스텁을 주입한다.
beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
})

describe('survey-state', () => {
  it('newState는 pageIdx=0, phase=mic로 시작하고 marks가 비어 있다', () => {
    const s = newState('sid-1', '홍길동', 'tok', 1)
    expect(s.v).toBe(5)
    expect(s.pageIdx).toBe(0)
    expect(s.phase).toBe('mic')
    expect(s.micDone).toBe(false)
    expect(s.marks).toEqual({})
  })

  it('save→load 왕복으로 pageIdx·phase·childName·marks 복원', () => {
    const s = newState('sid-1', '홍길동', 'tok', 1)
    saveState({ ...s, pageIdx: 3, phase: 'page', micDone: true, marks: { rw01: true, rw02: false } })
    const loaded = loadState()
    expect(loaded?.sessionId).toBe('sid-1')
    expect(loaded?.pageIdx).toBe(3)
    expect(loaded?.phase).toBe('page')
    expect(loaded?.sessionToken).toBe('tok')
    expect(loaded?.childName).toBe('홍길동')
    expect(loaded?.marks).toEqual({ rw01: true, rw02: false })
  })

  it('세션별 키 분리 + last 포인터가 최신 세션을 가리킴', () => {
    saveState({ ...newState('sid-1', '홍길동', 'tok', 1), pageIdx: 1 })
    saveState({ ...newState('sid-2', '김철수', 'tok', 2), pageIdx: 2 })
    expect(loadState()?.sessionId).toBe('sid-2')
    expect(loadState()?.pageIdx).toBe(2)
  })

  it('구버전(v3) 상태는 로드하지 않는다 — 필드 구조가 달라 재개 위치가 어긋난다', () => {
    localStorage.setItem('kodys-survey:last', 'old')
    localStorage.setItem('kodys-survey:old', JSON.stringify({ v: 3, sessionId: 'old', idx: 12 }))
    expect(loadState()).toBeNull()
  })

  it('clearState는 진행 상태를 파기한다', () => {
    saveState({ ...newState('sid-1', '홍길동', 'tok', 1), pageIdx: 2 })
    clearState()
    expect(loadState()).toBeNull()
  })
})

describe('survey-state — 손상·구버전 데이터 방어', () => {
  it('저장값이 JSON이 아니면 null (throw 없이)', () => {
    localStorage.setItem('kodys-survey:last', 'sid-1')
    localStorage.setItem('kodys-survey:sid-1', 'not-json{{{')
    expect(loadState()).toBeNull()
  })

  it('sessionId 타입이 잘못된 상태는 null', () => {
    localStorage.setItem('kodys-survey:last', 'sid-1')
    localStorage.setItem('kodys-survey:sid-1', JSON.stringify({ v: 3, sessionId: 42 }))
    expect(loadState()).toBeNull()
  })

  it('last 포인터만 있고 본체가 없으면 null', () => {
    localStorage.setItem('kodys-survey:last', 'sid-ghost')
    expect(loadState()).toBeNull()
  })

  it('[REGRESSION] 스키마 버전(v) 없는 구버전 상태는 로드하지 않는다 — 새로 시작', () => {
    localStorage.setItem('kodys-survey:last', 'sid-old')
    localStorage.setItem('kodys-survey:sid-old',
      JSON.stringify({ sessionId: 'sid-old', sessionToken: 't', idx: 5, recorded: {}, writing: {}, checklist: [] }))
    expect(loadState()).toBeNull()
  })

  it('saveState는 저장 실패(쿼터 초과 등) 시 예외를 전파하지 않는다', () => {
    const broken = { ...localStorage, setItem: () => { throw new Error('QuotaExceededError') } }
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = broken as Storage
    expect(() => saveState(newState('sid-1', '홍길동', 'tok', 1))).not.toThrow()
  })

  it('clearState는 localStorage 접근 실패 시에도 예외를 전파하지 않는다', () => {
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: () => { throw new Error('SecurityError') },
    } as unknown as Storage
    expect(() => clearState()).not.toThrow()
  })
})
