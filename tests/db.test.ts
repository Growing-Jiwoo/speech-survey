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

// insert() 인자 캡처: 테이블별로 넘어온 insert payload를 그대로 쌓아 둔다.
// (createSession처럼 "어느 필드가 어느 컬럼으로 가는지"를 검증해야 하는 테스트가 읽는다.)
const insertCallsByTable = new Map<string, unknown[]>()
/** update() 인자 캡처. insert와 같은 이유다 — updateSessionIdentity처럼 "어느 값이 어느
 *  컬럼으로 가는지"와 "원본을 덮어쓰지 않는지"는 결과가 아니라 **인자**로만 검증된다. */
const updateCallsByTable = new Map<string, unknown[]>()

function chain(result: unknown, capture?: (kind: 'insert' | 'update', arg: unknown) => void) {
  const target = () => {}
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then')
        return (resolve: (v: unknown) => void) => resolve(result)
      if ((prop === 'insert' || prop === 'update') && capture)
        return (arg: unknown) => { capture(prop, arg); return proxy }
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
      return chain(result, (kind, arg) => {
        const bucket = kind === 'insert' ? insertCallsByTable : updateCallsByTable
        const calls = bucket.get(table) ?? []
        calls.push(arg)
        bucket.set(table, calls)
      })
    },
    storage: { from: () => storage },
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

import {
  childTestState, countSessionRecordings, createSession, deleteClassCode, deleteSession, insertApplication, insertClassCode, isLoginLocked, saveScores, sessionDetail, sessionState, submitSession, updateSessionIdentity, uploadRecording,
  type ClassCodeRow,
} from '@/lib/db'

const SID = '11111111-1111-4111-8111-111111111111'
/** submitSession 호출 헬퍼 — 테스트가 신경 쓰는 필드만 넘긴다 */
const submit = (over: Partial<Parameters<typeof submitSession>[0]> = {}) => submitSession({
  sessionId: SID, writing: [], sentenceWriting: [], checklist: [],
  ...over,
})

const enqueue = (table: string, result: unknown) => {
  const q = tableQueues.get(table) ?? []
  q.push(result)
  tableQueues.set(table, q)
}

beforeEach(() => {
  tableQueues.clear()
  fromCalls.length = 0
  insertCallsByTable.clear()
  updateCallsByTable.clear()
  vi.clearAllMocks()
  storage.upload.mockResolvedValue({ error: null })
  storage.remove.mockResolvedValue({ error: null })
  storage.list.mockResolvedValue({ data: [], error: null })
})

describe('submitSession — 미제출 세션만 갱신하고 결과를 구분한다', () => {
  it('업데이트 성공 + 낱말쓰기 있음 → writing_answers upsert 후 ok', async () => {
    enqueue('sessions', { data: [{ id: SID }], error: null })
    enqueue('writing_answers', { error: null })
    const result = await submit({ writing: [{ itemCode: 'ww01', canWrite: true }], checklist: ['none'] })
    expect(result).toBe('ok')
    expect(fromCalls).toEqual(['sessions', 'writing_answers'])
  })

  it('낱말쓰기가 비어 있으면 writing_answers를 건드리지 않는다', async () => {
    enqueue('sessions', { data: [{ id: SID }], error: null })
    const result = await submit({})
    expect(result).toBe('ok')
    expect(fromCalls).toEqual(['sessions'])
  })

  it('업데이트 0건 + 세션이 이미 제출됨 → already_submitted (409 신호)', async () => {
    enqueue('sessions', { data: [], error: null })                                  // update … is('submitted_at', null)
    enqueue('sessions', { data: { submitted_at: '2026-07-15T00:00:00Z' }, error: null }) // 상태 재조회
    expect(await submit({})).toBe('already_submitted')
  })

  it('업데이트 0건 + 세션 미존재 → not_found (404 신호)', async () => {
    enqueue('sessions', { data: [], error: null })
    enqueue('sessions', { data: null, error: null })
    expect(await submit({})).toBe('not_found')
  })

  it('낱말쓰기 upsert 실패는 예외로 전파된다', async () => {
    enqueue('sessions', { data: [{ id: SID }], error: null })
    enqueue('writing_answers', { error: { message: 'duplicate key' } })
    await expect(submit({ writing: [{ itemCode: 'ww01', canWrite: false }] })).rejects.toThrow('duplicate key')
  })
})

describe('sessionDetail — 5개 병렬 조회 결과가 각자 올바른 필드로 배선된다', () => {
  it('sessions/recordings/writing_answers/reading_marks/sentence_scores 응답이 교차되지 않고 그대로 매핑된다', async () => {
    enqueue('sessions', { data: { id: SID, child_name: '세션전용이름' }, error: null })
    enqueue('recordings', { data: [{ item_code: 'rc01', attempt_no: 1, audio_path: 'p/rc01-1.webm', duration_sec: 3, created_at: '2026-08-01T00:00:00Z' }], error: null })
    enqueue('writing_answers', { data: [{ item_code: 'ww01', can_write: true }], error: null })
    enqueue('reading_marks', { data: [{ item_code: 'rw01', correct: true }, { item_code: 'rw02', correct: false }], error: null })
    enqueue('sentence_scores', { data: [{ item_code: 'rs01', words: 7 }], error: null })

    const result = await sessionDetail(SID)

    expect(fromCalls).toEqual(['sessions', 'recordings', 'writing_answers', 'reading_marks', 'sentence_scores'])
    expect(result.session).toEqual({ id: SID, child_name: '세션전용이름' })
    expect(result.recordings).toEqual([{ item_code: 'rc01', attempt_no: 1, audio_path: 'p/rc01-1.webm', duration_sec: 3, created_at: '2026-08-01T00:00:00Z' }])
    expect(result.writing).toEqual([{ item_code: 'ww01', can_write: true }])
    expect(result.marks).toEqual([{ item_code: 'rw01', correct: true }, { item_code: 'rw02', correct: false }])
    expect(result.sentences).toEqual([{ item_code: 'rs01', words: 7 }])
  })
})

describe('sessionState', () => {
  it('행 없음 → missing', async () => {
    enqueue('sessions', { data: null, error: null })
    expect((await sessionState(SID)).state).toBe('missing')
  })
  it('submitted_at null → open', async () => {
    enqueue('sessions', { data: { submitted_at: null, grade: 1 }, error: null })
    expect((await sessionState(SID)).state).toBe('open')
  })
  it('submitted_at 존재 → submitted', async () => {
    enqueue('sessions', { data: { submitted_at: '2026-07-15T00:00:00Z', grade: 2 }, error: null })
    expect((await sessionState(SID)).state).toBe('submitted')
  })
  it('학년을 함께 돌려준다 — 라우트가 세션의 검사지로 문항 코드를 검증한다', async () => {
    enqueue('sessions', { data: { submitted_at: null, grade: 2 }, error: null })
    expect((await sessionState(SID)).grade).toBe(2)
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

/** insertClassCode 유효 픽스처(NewClassCodeInput 형태) */
const NEW_CODE_INPUT = {
  code: 'ABCDEF',
  schoolRegion: '서울특별시교육청', schoolId: 'S001', schoolName: '테스트초등학교',
  grade: 1, classNo: 2,
  teacherName: '김교사', teacherPhone: '01012345678', teacherEmail: null,
}

describe('class_codes', () => {
  it('insertClassCode: unique 충돌(23505)이면 duplicate를 돌려준다 (던지지 않는다)', async () => {
    enqueue('class_codes', { data: null, error: { message: 'dup', code: '23505' } })
    expect(await insertClassCode(NEW_CODE_INPUT)).toBe('duplicate')
  })
  it('deleteClassCode: FK 위반(23503)이면 in_use', async () => {
    enqueue('class_codes', { data: null, error: { message: 'fk', code: '23503' } })
    expect(await deleteClassCode('11111111-1111-1111-1111-111111111111')).toBe('in_use')
  })
  it('childTestState: 제출본이 있으면 submitted가 미제출보다 우선', async () => {
    enqueue('sessions', { data: [{ submitted_at: null }, { submitted_at: '2026-08-13T00:00:00Z' }], error: null })
    expect(await childTestState('cc-1', 3)).toBe('submitted')
  })
  it('childTestState: 미제출만 있으면 inProgress', async () => {
    enqueue('sessions', { data: [{ submitted_at: null }], error: null })
    expect(await childTestState('cc-1', 3)).toBe('inProgress')
  })
  it('childTestState: 행이 없으면 null', async () => {
    enqueue('sessions', { data: [], error: null })
    expect(await childTestState('cc-1', 3)).toBeNull()
  })
})

// 필드마다 값을 다르게 둔다 — 같은 값을 쓰면 컬럼이 뒤바뀌어도 단언이 통과해버려 못 잡는다.
// 특히 grade(3)↔class_no(5), school_region↔school_id처럼 "타입이 같아 뒤바뀌어도 안 들키는 쌍"을
// 서로 다른 값으로 채워 명시적으로 구분한다.
const CLASS_CODE: ClassCodeRow = {
  id: 'cc-1111-aaaa', code: 'K7M2P9',
  school_region: '서울특별시교육청', school_id: 'S001', school_name: '테스트초등학교',
  grade: 3, class_no: 5,
  teacher_name: '김담임', teacher_phone: '01011112222', teacher_email: 'teacher@test.kr',
  created_at: '2026-01-01T00:00:00Z',
  status: 'active', applied_at: null,
}

describe('insertApplication — pending 코드 + 명단', () => {
  const ROSTER = [{ childNo: 1, name: '김서아', gender: '여' as const, birthYmd: '190304' }]

  it('pending 코드와 명단을 함께 넣는다', async () => {
    enqueue('class_codes', { data: CLASS_CODE, error: null })
    enqueue('class_roster', { error: null })

    const row = await insertApplication(NEW_CODE_INPUT, ROSTER)

    expect(row).toEqual(CLASS_CODE)
    // 명단 행은 방금 만든 코드 행의 id를 참조해야 한다 — 여기가 틀리면 승인 화면이 빈 학급을 본다.
    expect(insertCallsByTable.get('class_roster')).toEqual([[{
      class_code_id: CLASS_CODE.id, child_no: 1, child_name: '김서아',
      gender: '여', birth_ymd: '190304',
    }]])
    const code = (insertCallsByTable.get('class_codes') as Record<string, unknown>[])[0]
    // 신청은 반드시 pending으로 들어가야 한다 — active로 새면 승인 없이 검사가 시작된다.
    expect(code.status).toBe('pending')
    expect(code.applied_at).toEqual(expect.any(String))
  })

  it('[REGRESSION] 명단 삽입이 실패하면 코드 행을 지운다 — 명단 없는 pending이 남으면 안 된다', async () => {
    enqueue('class_codes', { data: CLASS_CODE, error: null })
    enqueue('class_roster', { data: null, error: { message: 'boom' } })

    await expect(insertApplication(NEW_CODE_INPUT, ROSTER)).rejects.toThrow('boom')
    // 이 스텁의 체인 프록시는 .delete().eq() 인자를 삼킨다 — 관찰 가능한 신호는
    // "class_roster 실패 뒤 class_codes를 한 번 더 건드렸다"는 from() 호출 순서뿐이다.
    expect(fromCalls).toEqual(['class_codes', 'class_roster', 'class_codes'])
  })

  it('[REGRESSION] 롤백 삭제까지 실패하면 수동 정리가 필요함을 에러에 남긴다', async () => {
    enqueue('class_codes', { data: CLASS_CODE, error: null })
    enqueue('class_roster', { data: null, error: { message: 'boom' } })
    enqueue('class_codes', { error: { message: 'delete failed' } })

    // 남은 pending 코드를 사람이 찾을 수 있어야 한다 — 자동 정리 경로가 없다.
    await expect(insertApplication(NEW_CODE_INPUT, ROSTER)).rejects.toThrow(/boom.*K7M2P9/)
  })

  it('코드 unique 충돌은 duplicate를 돌려준다 (호출부가 재시도)', async () => {
    enqueue('class_codes', { data: null, error: { message: 'dup', code: '23505' } })

    expect(await insertApplication(NEW_CODE_INPUT, ROSTER)).toBe('duplicate')
    // 코드가 없으면 참조할 FK도 없다 — 명단을 건드려선 안 된다.
    expect(fromCalls).toEqual(['class_codes'])
  })
})

describe('createSession — 학급 코드 필드가 sessions 컬럼에 올바르게 배선된다', () => {
  it('코드 행의 각 필드가 올바른 컬럼으로 가고, 아동 정보·guardian_consented_at도 함께 기록된다', async () => {
    enqueue('sessions', { data: { id: SID }, error: null })
    const before = Date.now()

    const id = await createSession({
      classCode: CLASS_CODE, childNo: 7,
      birthYmd: '180101', gender: '여', childName: '아무개',
    })

    expect(id).toBe(SID)
    const inserted = insertCallsByTable.get('sessions')
    expect(inserted).toHaveLength(1)
    const row = inserted![0] as Record<string, unknown>

    // grade ↔ class_no: 둘 다 int라 뒤바뀌어도 타입 에러가 안 난다 — 값으로 구분해야 잡힌다.
    expect(row.grade).toBe(3)
    expect(row.class_no).toBe(5)
    // school_id ↔ school_region: 둘 다 string이라 마찬가지.
    expect(row.school_region).toBe('서울특별시교육청')
    expect(row.school_id).toBe('S001')
    expect(row.school_name).toBe('테스트초등학교')

    expect(row.teacher_name).toBe('김담임')
    expect(row.teacher_phone).toBe('01011112222')
    expect(row.teacher_email).toBe('teacher@test.kr')

    expect(row.class_code_id).toBe('cc-1111-aaaa')
    expect(row.child_no).toBe(7)
    expect(row.birth_ymd).toBe('180101')
    expect(row.gender).toBe('여')
    expect(row.child_name).toBe('아무개')

    // 법정대리인 동의 확인 시각(제22조의2) — 세션 생성 시점에 기록되는지 직접 확인.
    expect(typeof row.guardian_consented_at).toBe('string')
    const consentedAt = new Date(row.guardian_consented_at as string).getTime()
    expect(consentedAt).toBeGreaterThanOrEqual(before)
    expect(consentedAt).toBeLessThanOrEqual(Date.now())
  })
})

const RS = ['rs01', 'rs02', 'rs03', 'rs04']

describe('saveScores — 관리자 채점 저장', () => {
  it('낱말 O/X는 reading_marks에, 문장 어절 수는 sentence_scores에 upsert한다', async () => {
    enqueue('reading_marks', { error: null })
    enqueue('sentence_scores', { error: null })
    await saveScores(SID,
      [{ itemCode: 'rw01', correct: true }, { itemCode: 'rw08', correct: false }],
      [{ itemCode: 'rs01', words: 7 }], RS)
    expect(fromCalls).toContain('reading_marks')
    expect(fromCalls).toContain('sentence_scores')
  })

  it('낱말이 빈 배열이면 reading_marks를 건드리지 않는다', async () => {
    enqueue('sentence_scores', { error: null })
    await saveScores(SID, [], [{ itemCode: 'rs01', words: 7 }], RS)
    expect(fromCalls).not.toContain('reading_marks')
  })

  it('문장 점수는 통째로 교체한다 — 빈 배열이면 기존 행을 지우기만 한다', async () => {
    // 채점자가 화면에서 지운 칸의 옛 값이 DB에 남지 않아야 한다(화면·저장값 불일치 방지).
    enqueue('reading_marks', { error: null })
    enqueue('sentence_scores', { error: null })   // delete
    await saveScores(SID, [{ itemCode: 'rw01', correct: true }], [], RS)
    expect(fromCalls.filter(t => t === 'sentence_scores')).toHaveLength(1)
  })

  it('문장 점수가 있으면 삭제 후 삽입한다 (sentence_scores 두 번 접근)', async () => {
    enqueue('sentence_scores', { error: null })   // delete
    enqueue('sentence_scores', { error: null })   // insert
    await saveScores(SID, [], [{ itemCode: 'rs01', words: 7 }], RS)
    expect(fromCalls.filter(t => t === 'sentence_scores')).toHaveLength(2)
  })

  it('저장 실패는 삼키지 않고 throw한다 (채점 결과의 조용한 손실 방지)', async () => {
    enqueue('reading_marks', { error: { message: 'boom' } })
    await expect(saveScores(SID, [{ itemCode: 'rw01', correct: true }], [], RS))
      .rejects.toThrow('boom')
  })
})

// 검사자가 아동 번호를 잘못 입력한 세션을 바로잡는 경로.
// 여기서 검증하는 것은 결과가 아니라 **update에 실린 값**이다 — 원본 보존 로직은
// 반환값에 드러나지 않아 인자를 보지 않으면 조용히 망가진다.
describe('updateSessionIdentity', () => {
  const cur = {
    id: SID, child_no: 13, child_name: '김지우', gender: '남', birth_ymd: '190303',
    edited_at: null, original_identity: null,
  }
  const NEXT = { childNo: 3, name: '김지우', gender: '남', birthYmd: '190303' }
  const lastUpdate = () => {
    const calls = updateCallsByTable.get('sessions') ?? []
    return calls[calls.length - 1] as Record<string, unknown>
  }

  it('없는 세션은 null — 호출부가 404와 500을 구분할 수 있어야 한다', async () => {
    enqueue('sessions', { data: null, error: null })
    expect(await updateSessionIdentity(SID, NEXT)).toBeNull()
    // 존재를 확인하기 전에는 쓰지 않는다
    expect(updateCallsByTable.get('sessions') ?? []).toHaveLength(0)
  })

  it('첫 수정이면 수정 직전 값을 original_identity에 남긴다', async () => {
    enqueue('sessions', { data: cur, error: null })          // 현재 값 조회
    enqueue('sessions', { data: { ...cur, child_no: 3 }, error: null }) // update 결과
    await updateSessionIdentity(SID, NEXT)
    const u = lastUpdate()
    expect(u.child_no).toBe(3)
    expect(u.original_identity).toEqual({
      child_no: 13, child_name: '김지우', gender: '남', birth_ymd: '190303',
    })
    expect(u.edited_at).toEqual(expect.any(String))
  })

  // 두 번째 수정에서 덮어쓰면 "처음 들어온 값"을 잃어, 잘못 고친 것을 되돌릴 근거가 사라진다.
  it('[REGRESSION] 두 번째 수정은 original_identity·edited_at을 덮어쓰지 않는다', async () => {
    const already = {
      ...cur, child_no: 3, edited_at: '2026-08-15T00:00:00.000Z',
      original_identity: { child_no: 13, child_name: '김지우', gender: '남', birth_ymd: '190303' },
    }
    enqueue('sessions', { data: already, error: null })
    enqueue('sessions', { data: { ...already, child_no: 5 }, error: null })
    await updateSessionIdentity(SID, { ...NEXT, childNo: 5 })
    const u = lastUpdate()
    expect(u.child_no).toBe(5)
    expect(u.original_identity).toEqual(already.original_identity)
    expect(u.edited_at).toBe('2026-08-15T00:00:00.000Z')
  })

  // 학년·학급을 건드리면 저장된 점수가 다른 양식의 문항을 가리키게 된다.
  it('[REGRESSION] 학년·학급·학교 컬럼은 update에 실리지 않는다', async () => {
    enqueue('sessions', { data: cur, error: null })
    enqueue('sessions', { data: cur, error: null })
    await updateSessionIdentity(SID, NEXT)
    for (const col of ['grade', 'class_no', 'school_name', 'class_code_id', 'teacher_name'])
      expect(lastUpdate()).not.toHaveProperty(col)
  })
})
