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
    const s = newState('sid-1', '김도연')
    expect(s.idx).toBe(0)
    expect(s.phase).toBe('mic')
    expect(s.micDone).toBe(false)
  })

  it('save→load 왕복으로 idx·phase 복원', () => {
    const s = newState('sid-1', '김도연')
    saveState({ ...s, idx: 12, phase: 'item', micDone: true })
    const loaded = loadState()
    expect(loaded?.sessionId).toBe('sid-1')
    expect(loaded?.idx).toBe(12)
    expect(loaded?.phase).toBe('item')
  })

  it('세션별 키 분리 + last 포인터가 최신 세션을 가리킴', () => {
    saveState({ ...newState('sid-1', 'A'), idx: 3 })
    saveState({ ...newState('sid-2', 'B'), idx: 7 })
    expect(loadState()?.sessionId).toBe('sid-2')
    expect(loadState()?.idx).toBe(7)
  })

  it('clearState는 현재 세션과 포인터를 제거해 load가 null', () => {
    saveState({ ...newState('sid-1', 'A'), idx: 3 })
    clearState()
    expect(loadState()).toBeNull()
  })

  it('포인터·데이터 없으면 null', () => {
    expect(loadState()).toBeNull()
  })
})
