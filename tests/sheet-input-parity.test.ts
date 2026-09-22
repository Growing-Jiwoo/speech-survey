// 교사 결과지와 관리자 검사지가 **같은 문서**인지 대조하는 계약 테스트.
//
// 두 라우트는 각자 자기 동작만 고정해 왔다. 그래서 한쪽의 입력 출처가 바뀌어도 양쪽 테스트가
// 모두 초록으로 남고, 같은 아이의 같은 검사에 서로 다른 공식 검사지 두 장이 생긴다 —
// 그 사실은 종이가 학교로 나간 뒤에야 드러난다. 이 파일이 그 한 가지만 본다:
// **같은 검사를 두 경로로 뽑으면 `stampSheet`에 넘어가는 값이 같은가.**
//
// 지금 코드는 통과한다. 고칠 것을 찾는 테스트가 아니라 앞으로 갈리는 순간 알려 주는 테스트다.
// 오늘 알려진 유일한 취약점은 학교명·반이다 — 교사 쪽은 학급 코드 행에서, 관리자 쪽은 검사에
// 복사된 사본에서 읽는다. 학급 정보를 고치는 기능이 생기면 그 순간 갈린다(아래 마지막 테스트).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  findClassCodeById: vi.fn(),
  classResults: vi.fn(),
  sessionDetail: vi.fn(),
}))
vi.mock('@/lib/pdf/stamp-sheet', () => ({ stampSheet: vi.fn() }))
// 교사 라우트만 pdf-lib으로 병합한다 — 스탬핑을 모킹했으므로 병합도 흉내만 낸다.
vi.mock('pdf-lib', () => {
  const doc = {
    copyPages: vi.fn(async (_s: unknown, idx: number[]) => idx.map(i => ({ i }))),
    addPage: vi.fn(),
    getPageIndices: vi.fn(() => [0]),
    save: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  }
  return { PDFDocument: { create: vi.fn(async () => doc), load: vi.fn(async () => doc) } }
})
vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))

import { GET as teacherSheets } from '@/app/api/results/[token]/sheets.pdf/route'
import { GET as adminSheet } from '@/app/api/admin/sessions/[id]/sheet.pdf/route'
import { createResultsToken } from '@/lib/auth'
import * as db from '@/lib/db'
import * as pdf from '@/lib/pdf/stamp-sheet'
import type { StampInput } from '@/lib/pdf/stamp-sheet'

const CID = '755316e7-fe7c-43f9-a5c5-5c2d39da59d7'
const SID = '9a1b2c3d-4e5f-4a6b-8c7d-1e2f3a4b5c6d'

/** 학급 코드 행. 검사 생성 시 이 값들이 세션으로 복사된다(lib/db의 createSession). */
const CODE_ROW = {
  id: CID, code: 'TEST24',
  school_region: 'daegu', school_id: 'B000002944', school_name: '대구가창초등학교',
  grade: 1, class_no: 2, teacher_name: '김서연',
  teacher_phone: null, teacher_email: 'kim@school.kr',
  created_at: '2026-09-21T00:00:00.000Z', status: 'active' as const, applied_at: null,
}

/** 채점이 절반쯤 된 검사 — 낱말은 O/X가 일부만, 문장은 전부, 쓰기도 전부.
 *  미녹음 기본값이 걸리는 페이지(녹음 없는 낱말 페이지)를 일부러 남겨 둔다. */
const MARKS = [
  { item_code: 'rw01', correct: true }, { item_code: 'rw02', correct: false },
  { item_code: 'rw03', correct: true }, { item_code: 'rw04', correct: true },
  { item_code: 'rw05', correct: false }, { item_code: 'rw06', correct: true },
  { item_code: 'rw07', correct: true },
]
const SENTENCES = [
  { item_code: 'rs01', words: 7 }, { item_code: 'rs02', words: 5 },
  { item_code: 'rs03', words: 8 }, { item_code: 'rs04', words: 11 },
]
const WRITING = Array.from({ length: 10 }, (_, i) => ({
  item_code: `ww${String(i + 1).padStart(2, '0')}`, can_write: i < 6,
}))
const RECORDINGS = [{ item_code: 'p_rw_meaning' }, { item_code: 'p_rs01' }]

/** 검사 행(세션). 학급 정보는 생성 시점 사본이라 기본값은 CODE_ROW와 같다. */
function sessionRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: SID, class_code_id: CID, child_no: 3,
    school_region: CODE_ROW.school_region, school_id: CODE_ROW.school_id,
    school_name: CODE_ROW.school_name, grade: CODE_ROW.grade, class_no: CODE_ROW.class_no,
    birth_ymd: '190312', gender: '여', child_name: '김가나',
    teacher_name: CODE_ROW.teacher_name, teacher_phone: null, teacher_email: CODE_ROW.teacher_email,
    checklist: ['language'],
    started_at: '2026-09-22T01:00:00.000Z', submitted_at: '2026-09-22T01:20:00.000Z',
    guardian_consented_at: '2026-09-22T00:59:00.000Z', edited_at: null,
    ...over,
  }
}

/**
 * `stampSheet`가 실제로 인쇄에 쓰는 값만 뽑는다. 두 라우트가 넘기는 객체는 모양이 다르다 —
 * 관리자는 세션 행을 통째로 넘기고(안 쓰는 컬럼까지 들어 있다) 교사는 필요한 7개만 조립한다.
 * 그래서 객체를 통으로 비교하지 않고 **StampInput이 선언한 값**만 비교한다.
 */
function stamped(call: StampInput) {
  const s = call.session
  return {
    formId: call.form.id,
    marks: call.marks, sentences: call.sentences, writing: call.writing,
    session: {
      school_name: s.school_name, grade: s.grade, class_no: s.class_no,
      child_name: s.child_name, birth_ymd: s.birth_ymd,
      started_at: s.started_at, checklist: s.checklist,
    },
  }
}

/** 두 경로를 한 번씩 태우고 각자 `stampSheet`에 넘긴 값을 돌려준다. */
async function bothRoutes(session = sessionRow(), codeRow: Record<string, unknown> = CODE_ROW) {
  vi.mocked(db.findClassCodeById).mockResolvedValue(codeRow as never)
  vi.mocked(db.classResults).mockResolvedValue([{
    id: session.id, child_no: session.child_no, child_name: session.child_name,
    gender: session.gender, grade: session.grade, birth_ymd: session.birth_ymd,
    checklist: session.checklist, started_at: session.started_at, submitted_at: session.submitted_at,
    recordings: RECORDINGS, reading_marks: MARKS, sentence_scores: SENTENCES, writing_answers: WRITING,
  }] as never)
  vi.mocked(db.sessionDetail).mockResolvedValue({
    session, recordings: RECORDINGS, writing: WRITING, marks: MARKS, sentences: SENTENCES,
  } as never)
  vi.mocked(pdf.stampSheet).mockResolvedValue(new Uint8Array([1]))

  const token = await createResultsToken(CID, 'test-secret')
  const t = await teacherSheets(
    new Request(`http://x/api/results/${token}/sheets.pdf?ids=${session.id}`),
    { params: Promise.resolve({ token }) })
  const a = await adminSheet(
    new Request(`http://x/api/admin/sessions/${session.id}/sheet.pdf`),
    { params: Promise.resolve({ id: session.id }) })

  const calls = vi.mocked(pdf.stampSheet).mock.calls
  return { teacherStatus: t.status, adminStatus: a.status, teacher: calls[0][0], admin: calls[1][0] }
}

describe('교사 결과지 ↔ 관리자 검사지 — 인쇄 입력 대조', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[REGRESSION] 같은 검사를 두 경로로 뽑으면 stampSheet 입력이 같다 — 같은 아이의 공식 문서는 하나여야 한다', async () => {
    const { teacherStatus, adminStatus, teacher, admin } = await bothRoutes()
    expect(teacherStatus).toBe(200)
    expect(adminStatus).toBe(200)
    expect(stamped(teacher)).toEqual(stamped(admin))
  })

  it('[REGRESSION] 미녹음 기본값(X·0점)이 양쪽에 똑같이 걸린다 — 한쪽만 빈 칸으로 나가면 안 된다', async () => {
    const { teacher, admin } = await bothRoutes()
    // 녹음이 없는 낱말 페이지는 O/X가 저장돼 있지 않아도 false로 채워진다
    expect(teacher.marks.rw08).toBe(false)
    expect(admin.marks.rw08).toBe(false)
    // 녹음이 있는 페이지는 저장된 값 그대로
    expect(teacher.marks.rw01).toBe(true)
    expect(admin.marks.rw01).toBe(true)
  })

  // 두 경로가 **다르게 동작하는 유일한 지점**이고, 그것이 의도다: 관리자는 진행 중인 검사도
  // 열어 봐야 하지만(채점 전 상태 확인), 교사에게는 채점이 끝난 것만 나간다. 그래서 여기서
  // 비교할 「두 문서」 자체가 생기지 않는다 — 갈리는 게 아니라 한쪽이 아예 없다.
  it('[REGRESSION] 제출 전 검사는 교사 경로가 막고 관리자만 뽑는다 — 빈 결과지가 교사에게 나가지 않는다', async () => {
    vi.mocked(db.findClassCodeById).mockResolvedValue(CODE_ROW as never)
    const session = sessionRow({ submitted_at: null })
    vi.mocked(db.classResults).mockResolvedValue([{
      id: session.id, child_no: session.child_no, child_name: session.child_name,
      gender: session.gender, grade: session.grade, birth_ymd: session.birth_ymd,
      checklist: session.checklist, started_at: session.started_at, submitted_at: null,
      recordings: RECORDINGS, reading_marks: MARKS, sentence_scores: SENTENCES, writing_answers: WRITING,
    }] as never)
    vi.mocked(db.sessionDetail).mockResolvedValue({
      session, recordings: RECORDINGS, writing: WRITING, marks: MARKS, sentences: SENTENCES,
    } as never)
    vi.mocked(pdf.stampSheet).mockResolvedValue(new Uint8Array([1]))

    const token = await createResultsToken(CID, 'test-secret')
    const t = await teacherSheets(
      new Request(`http://x/api/results/${token}/sheets.pdf?ids=${session.id}`),
      { params: Promise.resolve({ token }) })
    expect(t.status).toBe(400)
    expect(pdf.stampSheet).not.toHaveBeenCalled()

    const a = await adminSheet(
      new Request(`http://x/api/admin/sessions/${session.id}/sheet.pdf`),
      { params: Promise.resolve({ id: session.id }) })
    expect(a.status).toBe(200)
    // 관리자 쪽은 기본값을 걸지 않는다 — 아직 안 한 것이지 오반응이 아니다
    expect(vi.mocked(pdf.stampSheet).mock.calls[0][0].marks.rw08).toBeUndefined()
  })

  // 학년은 **양식을 고르는 값**이라 출처가 갈리면 만점과 문항 배열이 통째로 달라진다.
  // 두 라우트 모두 검사에 복사된 학년을 써야 한다 — 학급 명부의 학년은 쓰지 않는다.
  // 학급과 검사의 학년을 일부러 다르게 둬야만 이 교체가 잡힌다(둘이 같으면 어느 쪽을 읽든 통과한다).
  it('[REGRESSION] 양식은 학급 명부가 아니라 검사의 학년으로 고른다 — 양쪽 모두', async () => {
    const { teacher, admin } = await bothRoutes(
      sessionRow({ grade: 1 }), { ...CODE_ROW, grade: 2 })
    expect(teacher.form.id).toBe('KODYS-G1')
    expect(admin.form.id).toBe('KODYS-G1')
    expect(teacher.session.grade).toBe(1)
    expect(admin.session.grade).toBe(1)
  })

  // 오늘 유일하게 출처가 다른 값이다. 학급 정보를 고치는 기능은 아직 없어서 갈릴 수 없지만,
  // 그 기능이 생기는 순간 이 테스트가 빨간불을 켠다 — 그때 교사 쪽도 세션 사본을 읽게 바꾸면 된다.
  // (docs/qa/2026-09-22-teacher-results-e2e.md의 실행 기록 참고)
  it('[REGRESSION] 학급 명부의 학교명·반이 검사 사본과 달라지면 두 문서가 갈린다 — 이 경우가 실제로 생기면 출처를 세션으로 맞출 것', async () => {
    const { teacher, admin } = await bothRoutes(
      sessionRow(), { ...CODE_ROW, school_name: '이름이바뀐초등학교', class_no: 7 })
    // 지금 동작을 있는 그대로 고정한다 — 교사 쪽만 새 이름을 따라간다
    expect(teacher.session.school_name).toBe('이름이바뀐초등학교')
    expect(admin.session.school_name).toBe('대구가창초등학교')
    expect(stamped(teacher)).not.toEqual(stamped(admin))
  })
})
