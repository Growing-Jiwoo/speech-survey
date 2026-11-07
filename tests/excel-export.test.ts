// 엑셀 내보내기의 표 만들기(lib/excel-export) — 가짜 문항으로 돈다(tests/README). 실제 낱말을 적지 않는다:
// 문항 수·어절 수는 양식 배열에서 꺼내 쓴다.
import { describe, expect, it } from 'vitest'
import { FORMS } from '@/lib/forms'
import { itemsFor } from '@/lib/items'
import { scoreSession } from '@/lib/scoring'
import { scoreInputFor } from '@/lib/results'
import { buildExportSheets, exportColumns, exportFileName, latestPerTerm, type ExportSessionRow } from '@/lib/excel-export'
import { termOf } from '@/lib/format'

const formById = (id: string) => FORMS.find(f => f.id === id)!
const G1S2 = formById('KODYS-G1-S2')
const G2S2 = formById('KODYS-G2-S2')
const p2 = (n: number) => String(n).padStart(2, '0')

/** 2학기 1학년 세션 골격 — 녹음은 전부 있고 채점은 비어 있다. */
function row(over: Partial<ExportSessionRow> & { id: string; child_no: number }): ExportSessionRow {
  return {
    class_code_id: 'C1', apply_seq: 17, gender: '여', grade: 1, form_id: 'KODYS-G1-S2', checklist: [],
    started_at: '2026-10-05T01:00:00.000Z', submitted_at: '2026-10-05T01:20:00.000Z',
    recordings: ['p_rw_meaning', 'p_rw_nonsense', 'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04'].map(item_code => ({ item_code })),
    reading_marks: [], sentence_scores: [], sentence_times: [], writing_answers: [],
    ...over,
  }
}

/** 1학년 2학기 양식 세 과제 전부 채점 — 낱말 앞 10개 O, 문장 만점·시간 10초씩, 쓰기 앞 8개 O */
const f1 = itemsFor(G1S2)
const SCORED: Partial<ExportSessionRow> = {
  reading_marks: f1.readItems.map((it, i) => ({ item_code: it.code, correct: i < 10 })),
  sentence_scores: f1.sentenceItems.map(it => ({ item_code: it.code, words: it.text.trim().split(/\s+/).length })),
  sentence_times: f1.sentenceItems.map(it => ({ item_code: it.code, seconds: 10 })),
  writing_answers: f1.writingItems.map((it, i) => ({ item_code: it.code, can_write: i < 8 })),
}

/** 시트의 한 줄을 머리글 → 값 객체로 */
/** 머리글 → 값. 문항 열 머리글은 「번호 · 문항」이라 번호(` · ` 앞)로 찾는다 */
const asRecord = (sheet: { rows: unknown[][] }, i: number) =>
  Object.fromEntries((sheet.rows[0] as string[]).map((h, k) => [h.split(' · ')[0], sheet.rows[i][k] ?? null]))

describe('학기 열은 lib/format termOf — 학년도·학기(KST)', () => {
  it('3~8월 1학기 · 9~2월 2학기 · 1·2월은 앞 해 학년도', () => {
    expect(termOf('2026-03-02T00:00:00Z')).toEqual({ year: 2026, semester: 1 })
    expect(termOf('2026-09-01T00:00:00Z')).toEqual({ year: 2026, semester: 2 })
    expect(termOf('2027-02-10T00:00:00Z')).toEqual({ year: 2026, semester: 2 })
  })
  it('KST로 자른다 — 2월 28일 23시(UTC) = 3월 1일 아침(KST)은 새 학년도 1학기', () => {
    expect(termOf('2027-02-28T23:00:00Z')).toEqual({ year: 2027, semester: 1 })
  })
})

describe('latestPerTerm — 아이·학기마다 마지막 제출 검사(담당자 확정 2026-11-06)', () => {
  it('같은 학기에 재검사하면 마지막 검사만', () => {
    const rows = [
      row({ id: 'a1', child_no: 3, started_at: '2026-10-05T01:00:00Z' }),
      row({ id: 'a2', child_no: 3, started_at: '2026-10-20T01:00:00Z' }),
    ]
    expect(latestPerTerm(rows).map(r => r.id)).toEqual(['a2'])
  })
  it('제출되지 않은 검사는 더 늦어도 빼고 제출된 마지막 것을 쓴다', () => {
    const rows = [
      row({ id: 'done', child_no: 3, started_at: '2026-10-05T01:00:00Z' }),
      row({ id: 'open', child_no: 3, started_at: '2026-10-20T01:00:00Z', submitted_at: null }),
    ]
    expect(latestPerTerm(rows).map(r => r.id)).toEqual(['done'])
  })
  it('학기가 다르면 다른 줄 · 1월 검사는 앞 해 2학기와 같은 학기 · 다른 학급의 같은 번호는 다른 아이', () => {
    const rows = [
      row({ id: 's1', child_no: 3, started_at: '2026-05-01T01:00:00Z', form_id: 'KODYS-G1' }),
      row({ id: 's2a', child_no: 3, started_at: '2026-10-01T01:00:00Z' }),
      row({ id: 's2b', child_no: 3, started_at: '2027-01-10T01:00:00Z' }),
      row({ id: 'other', child_no: 3, class_code_id: 'C2', apply_seq: 18 }),
    ]
    expect(latestPerTerm(rows).map(r => r.id).sort()).toEqual(['other', 's1', 's2b'])
  })
})

describe('exportColumns — 머리글', () => {
  it('아동 코드만(이름·생년월일·학교 없음) · 「임시 기준」 열 없음 · 원점수는 문장마다와 전체 · 체크리스트는 영역마다', () => {
    const h = exportColumns(G1S2).map(c => c.header)
    expect(h.slice(0, 6)).toEqual(['아동 코드', '학년', '학기', '성별', '검사일', '양식'])
    expect(h).not.toContain('이름')
    expect(h).not.toContain('임시 기준')
    expect(h).toContain(`문장${f1.sentenceItems.length} 초`)
    expect(h.filter(x => /^문장\d 원점수/.test(x))).toHaveLength(f1.sentenceItems.length)
    expect(h).not.toContain('문장 정확 어절 합')   // 묻지 않은 합계 열은 두지 않는다(담당자 확정 2026-11-07의 네 가지만)
    expect(h.filter(x => /^쓰기\d\d · /.test(x))).toHaveLength(f1.writingItems.length)
    expect(h).toEqual(expect.arrayContaining([
      '낱말 해독 합', '낱말 해독 판정', '문장 읽기유창성 원점수(어절/10초)',
      '문장 읽기유창성 판정', '쓰기 합', '쓰기 판정', '최종 판정', '체크리스트 특이사항 없음', '체크리스트 주의력',
    ]))
  })
  // 사용자 확정(2026-11-06): 번호만 두면 담당자가 매번 검사지를 펴 맞춰 봐야 한다 — 문항을 양식에서 읽어 번호 뒤에 붙인다
  it('문항 열 머리글은 「번호 · 문항」 — 문항은 양식에서 읽는다(낱말·문장·쓰기)', () => {
    for (const form of FORMS) {
      const f = itemsFor(form)
      const h = exportColumns(form).map(c => c.header)
      expect(h.filter(x => /^낱말\d\d · /.test(x))).toEqual(f.readItems.map((it, i) => `낱말${p2(i + 1)} · ${it.text}`))
      expect(h.filter(x => /^문장\d 어절 · /.test(x))).toEqual(f.sentenceItems.map((it, i) => `문장${i + 1} 어절 · ${it.text}`))
      expect(h.filter(x => /^쓰기\d\d · /.test(x))).toEqual(f.writingItems.map((it, i) => `쓰기${p2(i + 1)} · ${it.text}`))
    }
  })

})

describe('buildExportSheets — 값', () => {
  it('세 과제 채점 완료: 문항 O/X·어절·초, 합계·판정·최종 판정이 채점 사슬(scoreSession)과 같다', () => {
    const r = row({ id: 's', child_no: 3, gender: '남', checklist: ['language', 'attention'], ...SCORED })
    const [sheet] = buildExportSheets([r])
    expect(sheet.name).toBe('KODYS-G1-S2')
    const v = asRecord(sheet, 1)
    expect(v).toMatchObject({ '아동 코드': '017-03', 학년: 1, 학기: '2026-2학기', 성별: '남', 검사일: '2026-10-05', 양식: 'KODYS-G1-S2' })
    expect(v['낱말01']).toBe('O')
    expect(v[`낱말${p2(f1.readItems.length)}`]).toBe('X')
    expect(v['문장1 어절']).toBe(f1.sentenceItems[0].text.trim().split(/\s+/).length)
    expect(v['문장1 초']).toBe(10)
    // 문장 원점수 = 그 문장의 정확 어절 ÷ 초 × 10, 소수 둘째 자리(담당자 확정 2026-11-07 「정확어절수÷시간×10」)
    const w1 = f1.sentenceItems[0].text.trim().split(/\s+/).length
    expect(v['문장1 원점수(어절/10초)']).toBe(Math.round((w1 / 10) * 10 * 100) / 100)
    expect(v['쓰기01']).toBe('O')
    expect(v[`쓰기${p2(f1.writingItems.length)}`]).toBe('X')

    const { form, input } = scoreInputFor(r)
    const res = scoreSession(form, input)
    expect(v).toMatchObject({
      '낱말 해독 합': 10, '문장 읽기유창성 원점수(어절/10초)': res.sentenceReading, '쓰기 합': 8,
    })
    expect(v['최종 판정']).toMatch(/^(양호|주의|위험)$/)
    expect(v['체크리스트 언어 (이해/표현)']).toBe(1)
    expect(v['체크리스트 주의력']).toBe(1)
    expect(v['체크리스트 인지']).toBeNull()
  })

  it('채점하지 않은 문항은 빈 칸(0이 아니다) · 끝나지 않은 과제의 합·판정과 최종 판정도 빈 칸', () => {
    const r = row({ id: 's', child_no: 3, reading_marks: [{ item_code: 'rw01', correct: true }] })
    const v = asRecord(buildExportSheets([r])[0], 1)
    expect(v['낱말01']).toBe('O')
    expect(v['낱말02']).toBeNull()
    expect(v['문장1 어절']).toBeNull()
    expect(v['문장1 초']).toBeNull()
    expect(v['문장1 원점수(어절/10초)']).toBeNull()
    expect(v['쓰기01']).toBeNull()
    for (const k of ['낱말 해독 합', '낱말 해독 판정', '문장 읽기유창성 원점수(어절/10초)', '쓰기 합', '쓰기 판정', '최종 판정'])
      expect(v[k], k).toBeNull()
  })

  it('읽기만 채점되고 쓰기가 남으면 읽기 합·판정은 채우고 최종 판정은 비운다', () => {
    const r = row({ id: 's', child_no: 3, ...SCORED, writing_answers: [] })
    const v = asRecord(buildExportSheets([r])[0], 1)
    expect(v['낱말 해독 합']).toBe(10)
    expect(v['낱말 해독 판정']).toMatch(/^(양호|주의|위험)$/)
    expect(v['쓰기 합']).toBeNull()
    expect(v['최종 판정']).toBeNull()
  })

  it('[REGRESSION] 미녹음 문항은 결과보고서와 같은 고정값 — 낱말 X, 문장은 그 문장의 제한 시간·0어절(저장값이 있어도)', () => {
    const r = row({ id: 's', child_no: 3, ...SCORED,
      recordings: [{ item_code: 'p_rw_meaning' }, { item_code: 'p_rs01' }, { item_code: 'p_rs02' }, { item_code: 'p_rs03' }] })
    const v = asRecord(buildExportSheets([r])[0], 1)
    const firstNonsense = f1.meaningReadCodes.length + 1
    expect(v[`낱말${p2(firstNonsense)}`]).toBe('X')
    expect(v['문장4 어절']).toBe(0)
    expect(v['문장4 초']).toBe(G1S2.limits.sentenceSec[3])
    expect(v['문장4 원점수(어절/10초)']).toBe(0)   // 미녹음 문장의 원점수는 0어절 ÷ 제한 시간 = 0
    expect(v['문장3 초']).toBe(10)   // 녹음이 있는 문장은 넣은 값 그대로
  })

  it('2학년 문장 쓰기는 문항 점수(0·1·2)를 숫자로', () => {
    const f2 = itemsFor(G2S2)
    const r = row({ id: 's', child_no: 1, grade: 2, form_id: 'KODYS-G2-S2',
      sentence_scores: f2.writingItems.map((it, i) => ({ item_code: it.code, words: i % 3 })) })
    const sheet = buildExportSheets([r])[0]
    expect(sheet.name).toBe('KODYS-G2-S2')
    const v = asRecord(sheet, 1)
    expect(f2.writingItems.map((_, i) => v[`쓰기${p2(i + 1)}`])).toEqual(f2.writingItems.map((_, i) => i % 3))
  })

  it('양식마다 시트 하나(레지스트리 순서) · 줄은 아동 코드 순 · 줄 없는 양식은 시트가 없다', () => {
    const sheets = buildExportSheets([
      row({ id: 'g2', child_no: 1, grade: 2, form_id: 'KODYS-G2-S2' }),
      row({ id: 'b', child_no: 5, apply_seq: 3, class_code_id: 'C3' }),
      row({ id: 'a', child_no: 12 }),
      row({ id: 'c', child_no: 2 }),
    ])
    expect(sheets.map(s => s.name)).toEqual(FORMS.map(f => f.id).filter(id => id === 'KODYS-G1-S2' || id === 'KODYS-G2-S2'))
    expect(sheets[0].rows.slice(1).map(r => r[0])).toEqual(['003-05', '017-02', '017-12'])
  })

  it('제출된 검사가 없으면 시트가 없다', () => {
    expect(buildExportSheets([])).toEqual([])
    expect(buildExportSheets([row({ id: 'x', child_no: 1, submitted_at: null })])).toEqual([])
  })
})

describe('exportFileName', () => {
  it('날짜를 붙인다', () => expect(exportFileName('2026-11-06')).toBe('읽기검사_전체데이터_2026-11-06.xlsx'))
})
