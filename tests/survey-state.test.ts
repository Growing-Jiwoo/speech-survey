import { describe, it, expect, beforeEach } from 'vitest'
import { newState, saveState, loadState, clearState, saveClassCode, loadClassCode } from '@/lib/survey-state'

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
  it('newState는 pageIdx=0, phase=mic로 시작한다', () => {
    const s = newState('sid-1', '홍길동', 'tok', 1)
    expect(s.v).toBe(7)
    expect(s.pageIdx).toBe(0)
    expect(s.phase).toBe('mic')
    expect(s.micDone).toBe(false)
  })

  it('연습은 기본으로 실시한다 — 선택 화면에서 검사자가 끄기 전까지', () => {
    expect(newState('sid-1', '홍길동', 'tok', 1).practice).toBe(true)
  })

  it('연습 실시 여부도 save→load로 복원된다 (새로고침 후 다시 묻지 않는다)', () => {
    const s = newState('sid-1', '홍길동', 'tok', 1)
    saveState({ ...s, practice: false, phase: 'page' })
    expect(loadState()?.practice).toBe(false)
  })

  it('구버전(v5) 상태는 로드하지 않는다 — practice 필드가 없어 연습 실시 여부가 미정이다', () => {
    localStorage.setItem('kodys-survey:last', 'v5')
    localStorage.setItem('kodys-survey:v5', JSON.stringify({ v: 5, sessionId: 'v5', pageIdx: 2 }))
    expect(loadState()).toBeNull()
  })

  it('save→load 왕복으로 pageIdx·phase·childName 복원', () => {
    const s = newState('sid-1', '홍길동', 'tok', 1)
    saveState({ ...s, pageIdx: 3, phase: 'page', micDone: true })
    const loaded = loadState()
    expect(loaded?.sessionId).toBe('sid-1')
    expect(loaded?.pageIdx).toBe(3)
    expect(loaded?.phase).toBe('page')
    expect(loaded?.sessionToken).toBe('tok')
    expect(loaded?.childName).toBe('홍길동')
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

  it('[REGRESSION] 구버전(v=6, marks 있던 스키마) 상태는 로드하지 않는다', () => {
    const stale = { ...newState('sid', '아이', 'tok', 1), v: 6, marks: {} }
    localStorage.setItem('kodys-survey:sid', JSON.stringify(stale))
    localStorage.setItem('kodys-survey:last', 'sid')
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

describe('학급 코드 기억 (연속 검사 — 스펙 2026-08-13)', () => {
  it('[REGRESSION] clearState는 학급 코드를 지우지 않는다 — 진행 상태(아동 정보 포함)만 지운다', () => {
    saveState(newState('sid', '이하늘', 'tok', 1))
    saveClassCode('K7M2P9')
    clearState()
    expect(loadClassCode()).toBe('K7M2P9')
    expect(loadState()).toBeNull()
    expect(localStorage.getItem('kodys-survey:sid')).toBeNull()
    expect(localStorage.getItem('kodys-survey:last')).toBeNull()
  })
  it('새 코드가 이전 코드를 덮어쓴다 (코드는 하나만 유지)', () => {
    saveClassCode('AAAAAA')
    saveClassCode('BBBBBB')
    expect(loadClassCode()).toBe('BBBBBB')
  })

  // 전 키 순회(진행 상태 키 제외)로 확인 — 코드 키만 보는 것보다 강한 보장이라 이쪽을 골랐다.
  // saveClassCode(code, childNo)처럼 호출부가 조용히 확장돼도, 결과로 생긴 값이 아동 이름을
  // 담고 있으면 이 핀이 걸린다(호출 시그니처 자체를 컴파일 타임에 막지는 못하므로).
  it('[REGRESSION] saveClassCode 이후 진행 상태 키를 제외한 모든 localStorage 키에 아동 정보가 없다', () => {
    saveState(newState('sid', '이하늘', 'tok', 1))
    saveClassCode('K7M2P9')
    // 진행 상태 키(세션 본체·last 포인터)는 아동 이름을 의도적으로 담는 별개 경로 —
    // clearState가 지우며, 이미 다른 테스트에서 그 경로를 핀했다. 이 테스트의 대상이 아니다.
    const progressKeys = new Set(['kodys-survey:sid', 'kodys-survey:last'])
    let sawCodeKey = false
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!
      if (progressKeys.has(key)) continue
      const value = localStorage.getItem(key) ?? ''
      expect(key).not.toContain('이하늘')
      expect(value).not.toContain('이하늘')
      if (key === 'kodys-survey:classCode') { sawCodeKey = true; expect(value).toBe('K7M2P9') }
    }
    expect(sawCodeKey).toBe(true)
  })
})
