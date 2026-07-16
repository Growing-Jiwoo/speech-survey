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
  it('newState는 idx=0, phase=mic로 시작', () => {
    const s = newState('sid-1', 'tok')
    expect(s.idx).toBe(0)
    expect(s.phase).toBe('mic')
    expect(s.micDone).toBe(false)
  })

  it('save→load 왕복으로 idx·phase 복원', () => {
    const s = newState('sid-1', 'tok')
    saveState({ ...s, idx: 12, phase: 'item', micDone: true })
    const loaded = loadState()
    expect(loaded?.sessionId).toBe('sid-1')
    expect(loaded?.idx).toBe(12)
    expect(loaded?.phase).toBe('item')
    expect(loaded?.sessionToken).toBe('tok')
  })

  it('세션별 키 분리 + last 포인터가 최신 세션을 가리킴', () => {
    saveState({ ...newState('sid-1', 'tok'), idx: 3 })
    saveState({ ...newState('sid-2', 'tok'), idx: 7 })
    expect(loadState()?.sessionId).toBe('sid-2')
    expect(loadState()?.idx).toBe(7)
  })

  it('clearState는 현재 세션과 포인터를 제거해 load가 null', () => {
    saveState({ ...newState('sid-1', 'tok'), idx: 3 })
    clearState()
    expect(loadState()).toBeNull()
  })

  it('포인터·데이터 없으면 null', () => {
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
    localStorage.setItem('kodys-survey:sid-1', JSON.stringify({ v: 1, sessionId: 42 }))
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
    expect(() => saveState(newState('sid-1', 'tok'))).not.toThrow()
  })

  it('clearState는 localStorage 접근 실패 시에도 예외를 전파하지 않는다', () => {
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: () => { throw new Error('SecurityError') },
    } as unknown as Storage
    expect(() => clearState()).not.toThrow()
  })
})
