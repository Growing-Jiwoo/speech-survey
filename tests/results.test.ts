import { describe, it, expect } from 'vitest'
import {
  maskEmail, evaluateSession, scoreInputFor, buildChildren, latestSession, childVerdict,
  summarize, sheetsFileName, latestScored, type ResultsSessionRow,
} from '@/lib/results'

/** G1 세션 행 골격. 채점 행은 테스트마다 채운다. */
function row(over: Partial<ResultsSessionRow> & { id: string; child_no: number }): ResultsSessionRow {
  return {
    child_name: `아이${over.child_no}`, gender: '여', grade: 1, birth_ymd: '190312', checklist: [],
    started_at: '2026-09-22T01:00:00.000Z', submitted_at: '2026-09-22T01:20:00.000Z',
    recordings: [], reading_marks: [], sentence_scores: [], writing_answers: [],
    ...over,
  }
}
/** 낱말 14 O/X + 문장 4 어절 = 읽기 두 과제 채점 완료. 쓰기는 비움. */
const READ_SCORED = {
  reading_marks: Array.from({ length: 14 }, (_, i) => ({ item_code: `rw${String(i + 1).padStart(2, '0')}`, correct: i < 10 })),
  sentence_scores: [{ item_code: 'rs01', words: 7 }, { item_code: 'rs02', words: 7 }, { item_code: 'rs03', words: 8 }, { item_code: 'rs04', words: 14 }],
}
const WRITE_SCORED = {
  writing_answers: Array.from({ length: 10 }, (_, i) => ({ item_code: `ww${String(i + 1).padStart(2, '0')}`, can_write: i < 8 })),
}
/** 세 과제 모두 채점됐고 쓰기가 기준 미달 = 판정이 실제로 나오는 Fail. A안에서 Fail은
 *  **채점이 끝난 세션에서만** 나오므로, 정렬·집계 픽스처는 쓰기까지 채워야 한다. */
const ALL_SCORED_FAIL = {
  ...READ_SCORED,
  writing_answers: WRITE_SCORED.writing_answers.map((w, i) => ({ ...w, can_write: i < 3 })),
}

describe('maskEmail — 시작 화면에 주소를 통째로 내지 않는다', () => {
  it('로컬 첫 글자 + *** @ 도메인 앞 3글자 + *** . TLD', () => {
    expect(maskEmail('kim@school.kr')).toBe('k***@sch***.kr')
    expect(maskEmail('jiwoo.frontdev@gmail.com')).toBe('j***@gma***.com')
  })
  it('짧은 도메인·다단계 TLD도 깨지지 않는다', () => {
    expect(maskEmail('a@b.co.kr')).toBe('a***@b***.kr')
    expect(maskEmail('x@yz.io')).toBe('x***@yz***.io')
  })
})

describe('evaluateSession — 상태·점수·판정 (관리자 sheetPdfGate와 같은 기준, 사용자 확정 A안)', () => {
  it('미제출은 unsubmitted, 점수·판정 없음', () => {
    const r = evaluateSession(row({ id: 's', child_no: 1, submitted_at: null, ...READ_SCORED }))
    expect(r).toEqual({ status: 'unsubmitted', scores: null, verdict: null, complete: null })
  })
  it('제출됐지만 낱말 채점이 비면 scoring', () => {
    const r = evaluateSession(row({ id: 's', child_no: 1, sentence_scores: READ_SCORED.sentence_scores,
      recordings: [{ item_code: 'p_rw_meaning' }, { item_code: 'p_rw_nonsense' }] }))
    expect(r.status).toBe('scoring')
    expect(r.scores).toBeNull()
  })
  it('읽기 두 과제가 채점되면 쓰기가 비어도 scored — 쓰기는 관리자가 채울 수 없어 막으면 영원히 못 받는다', () => {
    const r = evaluateSession(row({ id: 's', child_no: 1, ...READ_SCORED }))
    expect(r.status).toBe('scored')
    expect(r.scores).toEqual({ wordReading: 10, sentenceReading: 36, writing: 0 })
  })
  // 이 0은 「0점을 받았다」가 아니라 「아직 채점 전」이다. 관리자 결과지가 채점 전 과제의 판정을
  // 감추는 것과 같아야 한다 — 두 화면이 같은 아이를 다르게 말하면 안 된다(사용자 확정 2026-09-22 A안).
  it('[REGRESSION] 쓰기가 채점 전이면 판정을 보류한다 — 미채점 0점으로 아동을 낙제시키지 않는다', () => {
    const r = evaluateSession(row({ id: 's', child_no: 1, ...READ_SCORED }))
    expect(r.complete).toEqual({ wordReading: true, sentenceReading: true, writing: false })
    expect(r.verdict).toBeNull()
  })
  it('세 과제가 모두 채점되면 complete가 전부 true이고 판정이 나온다', () => {
    const r = evaluateSession(row({ id: 's', child_no: 1, ...READ_SCORED, ...WRITE_SCORED }))
    expect(r.complete).toEqual({ wordReading: true, sentenceReading: true, writing: true })
    expect(r.verdict).toBe('pass')
  })
  it('[REGRESSION] 녹음 없는 페이지는 X·0점으로 채워져 채점 완료로 본다(사용자 확정 2026-08-12) — 채점 행이 하나도 없어도 녹음이 없으면 scored', () => {
    const r = evaluateSession(row({ id: 's', child_no: 1, recordings: [] }))
    expect(r.status).toBe('scored')
    expect(r.scores).toEqual({ wordReading: 0, sentenceReading: 0, writing: 0 })
    // 미녹음 기본값은 **녹음 페이지(읽기)에만** 적용된다 — 쓰기는 녹음이 없어 기본값이 없다.
    // 그래서 아무것도 안 한 세션도 쓰기는 채점 전이고, A안에 따라 판정을 보류한다.
    expect(r.complete).toEqual({ wordReading: true, sentenceReading: true, writing: false })
    expect(r.verdict).toBeNull()
  })
  it('판정: 세 과제 모두 pass여야 pass, 하나라도 fail이면 fail (G1 임시 기준 9/23/6)', () => {
    const pass = evaluateSession(row({ id: 's', child_no: 1, ...READ_SCORED, ...WRITE_SCORED }))
    expect(pass.verdict).toBe('pass')
    const failWriting = evaluateSession(row({ id: 's', child_no: 1, ...READ_SCORED,
      writing_answers: WRITE_SCORED.writing_answers.map((w, i) => ({ ...w, can_write: i < 3 })) }))
    expect(failWriting.verdict).toBe('fail')
  })
})

describe('scoreInputFor — PDF가 관리자와 같은 입력을 쓴다', () => {
  it('제출된 세션은 미녹음 기본값이 적용되고 form은 학년 양식', () => {
    const { form, input } = scoreInputFor(row({ id: 's', child_no: 1, recordings: [] }))
    expect(form.id).toBe('KODYS-G1')
    expect(input.marks.rw01).toBe(false)
    expect(input.sentences.rs01).toBe(0)
  })
  it('미제출 세션은 기본값을 적용하지 않는다 — 아직 안 한 것이지 오반응이 아니다', () => {
    const { input } = scoreInputFor(row({ id: 's', child_no: 1, submitted_at: null, recordings: [] }))
    expect(input.marks.rw01).toBeUndefined()
  })
})

describe('buildChildren — 명단 ∪ 세션, 아이당 한 줄', () => {
  const roster = [
    { child_no: 1, child_name: '김가나', gender: '여' as const },
    { child_no: 2, child_name: '김가나', gender: '남' as const },
    { child_no: 5, child_name: '정도윤', gender: '남' as const },
  ]
  it('명단에만 있으면 sessions가 빈 행(미실시)', () => {
    const c = buildChildren(roster, [])
    expect(c.map(x => x.childNo)).toEqual([1, 2, 5])
    expect(c[0].sessions).toEqual([])
    expect(c[0].name).toBe('김가나')
  })
  it('명단에 없는 번호의 세션도 행이 된다(직접 입력 아동) — 이름은 세션 값', () => {
    const c = buildChildren(roster, [row({ id: 's9', child_no: 9, child_name: '전학생' })])
    expect(c.find(x => x.childNo === 9)?.name).toBe('전학생')
  })
  it('명단 없는 학급(관리자 직접 발급)은 세션만으로 표를 만든다', () => {
    const c = buildChildren([], [row({ id: 'a', child_no: 3 }), row({ id: 'b', child_no: 1 })])
    expect(c.map(x => x.childNo)).toEqual([1, 3])
  })
  it('재검사: started_at 오름차순으로 attemptNo 1,2,3… — 이름은 최신 세션 값', () => {
    const c = buildChildren(roster, [
      row({ id: 'late', child_no: 1, child_name: '김가나(수정)', started_at: '2026-09-22T03:00:00.000Z' }),
      row({ id: 'early', child_no: 1, started_at: '2026-09-22T01:00:00.000Z' }),
    ])
    const k = c.find(x => x.childNo === 1)!
    expect(k.sessions.map(s => [s.id, s.attemptNo])).toEqual([['early', 1], ['late', 2]])
    expect(k.name).toBe('김가나(수정)')
  })
  it('정렬: 최신 세션이 Fail인 아이가 먼저, 그 안에서 번호순', () => {
    const c = buildChildren(roster, [
      row({ id: 'p', child_no: 1, ...READ_SCORED, ...WRITE_SCORED }),   // pass
      row({ id: 'f', child_no: 5, ...ALL_SCORED_FAIL }),                 // fail
    ])
    expect(c.map(x => x.childNo)).toEqual([5, 1, 2])
  })
})

describe('latestSession · childVerdict', () => {
  it('세션이 없으면 둘 다 null', () => {
    const [c] = buildChildren([{ child_no: 1, child_name: '가', gender: '여' }], [])
    expect(latestSession(c)).toBeNull()
    expect(childVerdict(c)).toBeNull()
  })
  it('최신 세션이 scored가 아니면 판정 null — 채점 중인 재검사가 옛 판정을 가리지 않는다', () => {
    const [c] = buildChildren([], [
      row({ id: 'old', child_no: 1, recordings: [], started_at: '2026-09-22T01:00:00.000Z' }),
      row({ id: 'new', child_no: 1, submitted_at: null, started_at: '2026-09-22T02:00:00.000Z' }),
    ])
    expect(latestSession(c)?.id).toBe('new')
    expect(childVerdict(c)).toBeNull()
  })
})

describe('latestScored — 받을 수 있는 것 중 최신 (전수 점검 2026-09-22)', () => {
  it('[REGRESSION] 최신이 중단된 재검사여도 채점이 끝난 앞 차수를 돌려준다 — 그 아이를 통째로 빼면 결과지를 영영 못 받는다', () => {
    const [c] = buildChildren([], [
      row({ id: 'a1', child_no: 1, started_at: '2026-09-21T01:00:00.000Z', ...READ_SCORED, ...WRITE_SCORED }),
      row({ id: 'a2', child_no: 1, started_at: '2026-09-22T01:00:00.000Z', submitted_at: null }),
    ])
    expect(latestSession(c)?.id).toBe('a2')
    expect(latestScored(c)?.id).toBe('a1')
    // 판정 표시는 여전히 최신 세션만 본다 — 채점 중인 재검사가 옛 판정을 가리지 않는다(별개 규칙)
    expect(childVerdict(c)).toBeNull()
  })
  it('채점 완료가 하나도 없으면 null', () => {
    const [c] = buildChildren([], [row({ id: 's', child_no: 1, submitted_at: null })])
    expect(latestScored(c)).toBeNull()
  })
  it('채점 완료가 여럿이면 마지막 것', () => {
    const [c] = buildChildren([], [
      row({ id: 'a1', child_no: 1, started_at: '2026-09-21T01:00:00.000Z', ...ALL_SCORED_FAIL }),
      row({ id: 'a2', child_no: 1, started_at: '2026-09-22T01:00:00.000Z', ...READ_SCORED, ...WRITE_SCORED }),
    ])
    expect(latestScored(c)?.id).toBe('a2')
  })
})

describe('summarize — 상단 한 줄', () => {
  it('검사·채점 완료·Fail·채점 중·미제출·미실시를 센다', () => {
    const c = buildChildren(
      [{ child_no: 1, child_name: 'a', gender: '여' }, { child_no: 2, child_name: 'b', gender: '남' }, { child_no: 3, child_name: 'c', gender: '남' }],
      [
        row({ id: 's1', child_no: 1, ...READ_SCORED, ...WRITE_SCORED }),          // scored pass
        row({ id: 's2', child_no: 2, ...ALL_SCORED_FAIL }),                         // scored fail
        row({ id: 's4', child_no: 4, submitted_at: null }),                         // unsubmitted (명단 밖)
        row({ id: 's5', child_no: 5, sentence_scores: READ_SCORED.sentence_scores,  // scoring
          recordings: [{ item_code: 'p_rw_meaning' }] }),
      ])
    expect(summarize(c)).toEqual({ tested: 4, scored: 2, fail: 1, scoring: 1, unsubmitted: 1, untested: 1 })
  })
  it('[REGRESSION] 중단된 재검사가 있어도 「채점 완료」로 센다 — 버튼이 내려받는 것과 같은 기준', () => {
    const c = buildChildren([], [
      row({ id: 'a1', child_no: 1, started_at: '2026-09-21T01:00:00.000Z', ...ALL_SCORED_FAIL }),
      row({ id: 'a2', child_no: 1, started_at: '2026-09-22T01:00:00.000Z', submitted_at: null }),
    ])
    // 칸은 겹치지 않는다 — 이 아이는 「채점 완료」에만 센다(미제출로 두 번 세지 않는다)
    expect(summarize(c)).toEqual({ tested: 1, scored: 1, fail: 0, scoring: 0, unsubmitted: 0, untested: 0 })
  })
})

describe('sheetsFileName — 관리자 규약 계승', () => {
  const base = { grade: 1, classNo: 2, date: '2026-09-22' }
  it('전체', () => {
    expect(sheetsFileName({ ...base, all: true, picked: [] })).toBe('1-2_결과지_전체_2026-09-22.pdf')
  })
  it('여럿', () => {
    expect(sheetsFileName({ ...base, all: false, picked: [
      { childNo: 1, name: 'a', attemptNo: 1, attemptCount: 1, startedDate: '2026-09-22' },
      { childNo: 3, name: 'b', attemptNo: 1, attemptCount: 1, startedDate: '2026-09-22' },
    ] })).toBe('1-2_결과지_2명_2026-09-22.pdf')
  })
  it('한 장 — 두 자리 번호_이름_검사일(관리자 규약)', () => {
    expect(sheetsFileName({ ...base, all: false, picked: [
      { childNo: 3, name: '박서준', attemptNo: 1, attemptCount: 1, startedDate: '2026-09-21' },
    ] })).toBe('03_박서준_2026-09-21.pdf')
  })
  it('[REGRESSION] 한 장인데 그 아이에 재검사가 있으면 차수를 붙인다 — 같은 이름으로 덮어써지지 않게', () => {
    expect(sheetsFileName({ ...base, all: false, picked: [
      { childNo: 3, name: '박서준', attemptNo: 2, attemptCount: 3, startedDate: '2026-09-21' },
    ] })).toBe('03_박서준_2차_2026-09-21.pdf')
  })
  it('단일학급(반 0)은 학년만', () => {
    expect(sheetsFileName({ grade: 2, classNo: 0, date: '2026-09-22', all: true, picked: [] })).toBe('2학년_결과지_전체_2026-09-22.pdf')
  })
})
