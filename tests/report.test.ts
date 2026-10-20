import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { DUP_LABELS, atomsOf, dupLabels, interpretation, placeLabel, renderReport, schoolLabel } from '@/lib/pdf/report'
import { FORMS, formForGrade, type SurveyForm } from '@/lib/forms'
import { itemsFor } from '@/lib/items'
import { finalVerdict, type TaskKey, type Verdict } from '@/lib/scoring'

/** PDF 1쪽의 글자 조각(빈 조각은 버린다 — pdfjs가 글자 사이에 폭 0짜리 조각을 끼운다). */
async function textItems(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
  const { items } = await (await doc.getPage(1)).getTextContent()
  return items.flatMap(i => ('str' in i && i.str !== '' ? [{ str: i.str, x: i.transform[4], y: i.transform[5] }] : []))
}
const textOf = async (bytes: Uint8Array) => (await textItems(bytes)).map(i => i.str).join('')
/** 결과 요약 값 행의 판정 — 왼쪽부터. 판정 칸은 「양호」 한 조각이라 해석 문장(긴 한 조각)과 섞이지 않는다. */
async function verdictRow(bytes: Uint8Array) {
  return (await textItems(bytes)).filter(i => i.str === '양호' || i.str === '주의' || i.str === '위험')
    .sort((a, b) => a.x - b.x).map(i => i.str)
}

const baseSession = {
  school_region: '강원특별자치도교육청', school_id: 'B000004824', school_name: '교동초등학교',
  gender: '남', child_name: '김가나', birth_ymd: '190315', started_at: '2026-09-19T01:00:00.000Z',
  checklist: ['none'],
}
const sessionFor = (form: SurveyForm) => ({ ...baseSession, grade: form.grades[0] })
/** 기준을 고정한 양식 사본 — 양식의 기준표가 바뀌어도 판정 테스트의 뜻은 그대로다(1학년 2학기 기준표 값). */
const withCut = (form: SurveyForm): SurveyForm => ({ ...form, cutoff: {
  wordReading: { caution: 12, risk: 9 }, sentenceReading: { caution: 8.04, risk: 5.43 }, writing: { caution: 7, risk: 4 },
} })
/** 낱말 해독을 n개만 맞힌 O/X */
const marksN = (form: SurveyForm, n: number) => Object.fromEntries(itemsFor(form).readItems.map((i, k) => [i.code, k < n]))
/** 쓰기를 n점 받은 입력 — 앞 문항부터 문항 만점까지 채운다(낱말 쓰기 1점 · 문장 쓰기 2점) */
function writingN(form: SurveyForm, n: number) {
  const out: Record<string, number> = {}
  for (const i of itemsFor(form).writingItems) {
    const max = i.text.trim().split(/\s+/).length
    out[i.code] = Math.min(max, n); n -= out[i.code]
  }
  return out
}
const blank = { marks: {}, sentences: {}, times: {}, writing: {} }
/** 세 과제를 전부 채점한 입력. ok면 만점, 아니면 0점. 문장은 문장마다 1초 —
 *  만점이면 10초당 어절이 기준보다 훨씬 크고(G1 36 ÷ 4 × 10 = 90.00), 0어절이면 0.00이다. */
function scored(form: SurveyForm, ok: { read: boolean; sentence: boolean; write: boolean }) {
  const f = itemsFor(form)
  return {
    marks: Object.fromEntries(f.readItems.map(i => [i.code, ok.read])),
    sentences: Object.fromEntries(f.sentenceItems.map(i => [i.code, ok.sentence ? 99 : 0])),
    times: Object.fromEntries(f.sentenceItems.map(i => [i.code, 1])),
    writing: Object.fromEntries(f.writingItems.map(i => [i.code, ok.write ? 99 : 0])),
  }
}

describe.each(FORMS.map(f => [f.id, f] as const))('renderReport — %s', (_id, form: SurveyForm) => {
  const session = sessionFor(form)

  it('채점 전 결과보고서도 아래 배치가 채점 완료본과 같다 — 빈 판정 칸·빈 해석 상자가 줄 높이를 떨어뜨리지 않는다', async () => {
    // 한 반을 한 파일로 받으면 채점 전 아이와 완료 아이가 섞인다 — 쪽마다 세로 배치가 다르면 같은 양식으로 보이지 않는다.
    const headingY = async (bytes: Uint8Array) =>
      Math.min(...(await textItems(bytes)).filter(i => i.str.includes('추가 관찰')).map(i => i.y))
    const pass = await headingY(await renderReport({ form, session, ...scored(form, { read: true, sentence: true, write: true }) }))
    const pending = await headingY(await renderReport({ form, session, ...scored(form, { read: true, sentence: true, write: true }), writing: {} }))
    const none = await headingY(await renderReport({ form, session, ...blank }))
    expect(pending).toBeCloseTo(pass, 1)
    expect(none).toBeCloseTo(pass, 1)
  })

  it('Letter 한 장이다 (담당자 양식 docx가 Letter다 — A4로 바꾸지 말 것)', async () => {
    const out = await PDFDocument.load(await renderReport({ form, session, ...blank }))
    expect(out.getPageCount()).toBe(1)
    const { width, height } = out.getPages()[0].getSize()
    expect([Math.round(width), Math.round(height)]).toEqual([612, 792])
  })

  it('머리글에 학년 식별자·인적사항이 양식 표기대로 찍힌다', async () => {
    const text = await textOf(await renderReport({ form, session, ...blank }))
    expect(text).toContain('한국 난독 선별 검사')
    // 학기는 머리글이 아니라 「학년 / 학기」 칸이 말한다 — KODYS-G1-S2도 「G1」
    expect(text).toContain(`KODYS – G${form.grades[0]} · Korean Dyslexia Screening Test`)
    expect(text).toContain('춘천 교동초등학교')       // 학교 목록의 소재지(춘천시 → 춘천) + 학교명
    expect(text).toContain(`${form.grades[0]}학년 2학기`) // 9월 검사 → 2학기
    expect(text).toContain('김가나')
    expect(text).toContain('남')
    expect(text).toContain('2019. 03. 15.')
    expect(text).toContain('2026. 09. 19.')
  })

  it('세 과제가 다 채점되면 과제별 판정과 최종결과가 양호·주의·위험으로 찍힌다', async () => {
    const cut = withCut(form)
    const all = scored(cut, { read: true, sentence: true, write: true })
    const row = async (x: typeof all) => verdictRow(await renderReport({ form: cut, session, ...x }))
    expect(await row(all)).toEqual(['양호', '양호', '양호', '양호'])
    // 담당자 확정(2026-10-19): 주의 1개 → 최종 주의
    expect(await row({ ...all, marks: marksN(cut, 10) })).toEqual(['주의', '양호', '양호', '주의'])
    // 주의 2개 → 최종 위험(종전 「FAIL 2개 → FAIL」)
    expect(await row({ ...all, marks: marksN(cut, 10), writing: writingN(cut, 6) })).toEqual(['주의', '양호', '주의', '위험'])
    // 위험 1개 → 최종 위험. 경계값 자체가 그 판정이다(쓰기 4점 = 「4점 이하」 위험)
    expect(await row({ ...all, writing: writingN(cut, 4) })).toEqual(['양호', '양호', '위험', '위험'])
    expect(await row({ ...all, marks: marksN(cut, 12) })).toEqual(['주의', '양호', '양호', '주의'])
    expect(await row({ ...all, marks: marksN(cut, 13) })).toEqual(['양호', '양호', '양호', '양호'])
  })

  it('[REGRESSION] 읽기유창성 판정은 어절 수가 아니라 10초당 어절로 한다 — 다 맞게 읽어도 오래 걸리면 위험', async () => {
    const cut = withCut(form)
    const all = scored(cut, { read: true, sentence: true, write: true })
    // 문장마다 25초 — 만점 어절(35~48) ÷ 100초 × 10 = 3.5~4.8 ≤ 5.43
    const slow = { ...all, times: Object.fromEntries(Object.keys(all.times).map(c => [c, 25])) }
    expect(await verdictRow(await renderReport({ form: cut, session, ...slow }))).toEqual(['양호', '위험', '양호', '위험'])
  })

  it('[REGRESSION] 채점이 끝나지 않은 과제의 판정 칸은 비고, 최종결과·해석 문단도 비운다 — 미채점은 위험이 아니다', async () => {
    const half = scored(form, { read: true, sentence: true, write: true })
    const bytes = await renderReport({ form, session, marks: half.marks, sentences: half.sentences, times: half.times, writing: {} })
    expect(await verdictRow(bytes)).toEqual(['양호', '양호'])
    const text = await textOf(bytes)
    expect(text).not.toContain('통과하였습니다')
    expect(text).not.toContain('나타났습니다')
  })

  it('결과 해석 문구가 최종결과에 맞게 찍힌다', async () => {
    const cut = withCut(form)
    const all = scored(cut, { read: true, sentence: true, write: true })
    const good = await textOf(await renderReport({ form: cut, session, ...all }))
    expect(good).toContain('본 아동은 한국 난독 선별 검사 결과, 통과하였습니다.')
    const risk = await textOf(await renderReport({ form: cut, session, ...all, writing: writingN(cut, 0) }))
    expect(risk).toContain(`'해독, 읽기유창성' 영역에서 '양호', '쓰기' 영역에서 '위험'으로 확인되어 최종결과 '위험'으로 나타났습니다.`)
    expect(risk).toContain('전문기관에서의 심화 검사를 권고드립니다.')
  })

  it('체크리스트 다섯 영역이 양식 문구로 전부 찍힌다', async () => {
    const text = await textOf(await renderReport({ form, session, ...blank }))
    for (const s of ['추가 관찰 정보', '특이사항 없음', '인지', '언어 (이해 / 표현)', '말 (조음 / 유창성)', '주의력',
      '또래에 비해 전반적인 이해나 과제 수행에 어려움을 보임', form.report.observationHeader]) {
      expect(text).toContain(s)
    }
  })

  it('한글 긴 학교명·이름이 있어도 실패하지 않는다 (폰트 임베딩·줄바꿈)', async () => {
    const bytes = await renderReport({
      form, session: { ...session, school_name: '서울대학교사범대학부설초등학교', child_name: '남궁민수' }, ...blank,
    })
    expect(await textOf(bytes)).toContain('서울대학교사범대학부설초등학교')
  })

  it('지역 표기: 도는 시·군 이름(시·군 제거), 특별·광역시·세종은 도시 이름', () => {
    expect(placeLabel('강원', '춘천시')).toBe('춘천')
    expect(placeLabel('강원', '철원군')).toBe('철원')
    expect(placeLabel('경기', '수원시')).toBe('수원')
    expect(placeLabel('부산', '동구')).toBe('부산')
    expect(placeLabel('세종', '연서면')).toBe('세종')
    expect(placeLabel('서울', '송파구')).toBe('서울')
    expect(placeLabel('강원', undefined)).toBe('강원')
    // 도의 시·군 이름이 광역시 약칭과 같으면 시도를 붙인다 — 경기 광주시 ≠ 광주광역시
    expect(placeLabel('경기', '광주시')).toBe('경기 광주')
    expect(schoolLabel('경기', '광주시', '광주초등학교')).toBe('경기 광주 광주초등학교')
    // 학교 이름에 지역이 이미 들어 있으면 겹쳐 적지 않는다
    expect(schoolLabel('대구', '달서구', '대구성지초등학교')).toBe('대구성지초등학교')
    expect(schoolLabel('전북', '전주시', '전주서일초등학교')).toBe('전주서일초등학교')
    expect(schoolLabel('부산', '남구', '운산초등학교')).toBe('부산 운산초등학교')
    expect(schoolLabel('강원', undefined, '교동초등학교')).toBe('강원 교동초등학교')
    // 다른 학교와 표기가 겹치면 한 단계 더 붙인다 — 도는 시도, 광역시는 구
    expect(schoolLabel('부산', '해운대구', '송정초등학교')).toBe('부산 해운대구 송정초등학교')
    expect(schoolLabel('강원', '고성군', '동광초등학교')).toBe('강원 고성 동광초등학교')
    expect(schoolLabel('경남', '고성군', '동광초등학교')).toBe('경남 고성 동광초등학교')
    expect(schoolLabel('강원', '춘천시', '교동초등학교')).toBe('춘천 교동초등학교')
  })

  it('DUP_LABELS는 전국 학교 목록에서 실제로 겹치는 표기와 같다 — 목록이 바뀌면 상수도 고칠 것', async () => {
    const { REGIONS } = await import('@/lib/schools')
    const { readFile } = await import('node:fs/promises')
    const all = await Promise.all(REGIONS.map(async r => ({
      short: r.short, schools: JSON.parse(await readFile(`public/schools/${r.slug}.json`, 'utf8')) })))
    expect([...dupLabels(all)].sort()).toEqual([...DUP_LABELS].sort())
  })

  it('겹치는 학교는 보고서 머리글에도 넓힌 표기로 찍힌다', async () => {
    const text = await textOf(await renderReport({ form,
      session: { ...session, school_region: '강원특별자치도교육청', school_id: 'B000005223', school_name: '동광초등학교' }, ...blank }))
    expect(text).toContain('강원 고성 동광초등학교')
  })

  it('글꼴에 없는 글자는 사라지지 않고 「?」로 드러난다', async () => {
    const text = await textOf(await renderReport({ form, session: { ...session, child_name: '金가나' }, ...blank }))
    expect(text).toContain('?가나')
  })

  it('학교 목록에 없는 학교는 시도 약칭으로 물러난다', async () => {
    const text = await textOf(await renderReport({ form, session: { ...session, school_id: 'X-없음' }, ...blank }))
    expect(text).toContain('강원 교동초등학교')
  })

  // 체크 표시는 선이라 글자로 뽑히지 않는다 — 체크 유무가 바이트에 반영되는지만 본다.
  it('체크한 영역이 다르면 출력이 다르다', async () => {
    const a = await renderReport({ form, session: { ...session, checklist: ['none'] }, ...blank })
    const b = await renderReport({ form, session: { ...session, checklist: ['cognition', 'attention'] }, ...blank })
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0)
  })
})

describe('renderReport — 학년별 서식 차이는 담당자 파일 그대로다', () => {
  it('G1은 「관찰 내용 (참고용)」·안내문 마침표, G2는 「주요 관찰 지표 (참고용)」·마침표 없음', async () => {
    const g1 = await textOf(await renderReport({ form: formForGrade(1), session: sessionFor(formForGrade(1)), ...blank }))
    const g2 = await textOf(await renderReport({ form: formForGrade(2), session: sessionFor(formForGrade(2)), ...blank }))
    expect(g1).toContain('관찰 내용 (참고용)')
    expect(g1).toContain('참고 자료입니다.')
    expect(g2).toContain('주요 관찰 지표 (참고용)')
    expect(g2).toContain('참고 자료입니다')
    expect(g2).not.toContain('참고 자료입니다.')
  })
})

describe('renderReport — 같은 입력이면 언제 만들어도 같은 바이트다 (재현 가능성)', () => {
  // pdf-lib는 생성 시각·서브셋 글꼴 이름을 호출마다 새로 만든다. 임상 문서는 같은 채점이면 같은 파일이어야
  // 하므로 둘 다 고정했다. 1초 넘게 벌려 초 경계를 강제로 넘겨 그 조건에서도 같은지 고정한다.
  it('1초 넘게 벌려 두 번 만들어도 바이트가 같다', async () => {
    const form = formForGrade(1)
    const session = sessionFor(form)
    const a = await renderReport({ form, session, ...blank })
    await new Promise(r => setTimeout(r, 1100))
    const b = await renderReport({ form, session, ...blank })
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0)
  }, 20_000)
})

describe('finalVerdict — 담당자 확정(2026-10-19 docx)', () => {
  const v = (wordReading: Verdict, sentenceReading: Verdict, writing: Verdict) => ({ wordReading, sentenceReading, writing })
  it('위험이 하나라도 있거나 주의가 2개 이상이면 위험, 주의 1개면 주의, 나머지는 양호', () => {
    expect(finalVerdict(v('good', 'good', 'good'))).toBe('good')
    expect(finalVerdict(v('good', 'caution', 'good'))).toBe('caution')
    expect(finalVerdict(v('caution', 'good', 'caution'))).toBe('risk')
    expect(finalVerdict(v('good', 'good', 'risk'))).toBe('risk')
    expect(finalVerdict(v('caution', 'caution', 'caution'))).toBe('risk')
  })
})

/** 담당자 docx(2026-10-19) 「결과 해석 및 권고」 예시 문장 원문 — 글자 하나까지 같아야 한다. */
const TAIL_COMMON = '선별 검사는 아동의 대략적인 발달 수준을 확인하는 것을 목적으로 하며, 이 결과만으로 아동의 읽기·쓰기 어려움을 진단하는 것은 아닙니다. '
const DOCX = {
  caution: `본 아동은 한국 난독 선별 검사 결과, '해독, 쓰기' 영역에서 '양호', '읽기유창성' 영역에서 '주의'로 확인되어 최종결과 '주의'로 나타났습니다. ${TAIL_COMMON}가정과 학급에서 아동의 읽기·쓰기 발달 상황을 지속적으로 관찰하고, 추후 재선별을 실시할 것을 권고드립니다.`,
  riskTwoCautions: `본 아동은 한국 난독 선별 검사 결과, '해독' 영역에서 '양호', '읽기유창성, 쓰기' 영역에서 '주의'로 확인되어 최종결과 '위험'으로 나타났습니다. ${TAIL_COMMON}아동의 정확한 읽기·쓰기 능력을 확인하기 위해 전문기관에서의 심화 검사를 권고드립니다.`,
  riskOne: `본 아동은 한국 난독 선별 검사 결과, '해독, 쓰기' 영역에서 '양호', '읽기유창성' 영역에서 '위험'으로 확인되어 최종결과 '위험'으로 나타났습니다. ${TAIL_COMMON}아동의 정확한 읽기·쓰기 능력을 확인하기 위해 전문기관에서의 심화 검사를 권고드립니다.`,
}

describe('interpretation — 담당자 docx 예시 세 개와 글자까지 같다', () => {
  const run = (v: Record<TaskKey, Verdict>) => interpretation(v, finalVerdict(v)).map(r => r.t).join('')
  it('주의 1개 · 주의 2개 · 위험 1개', () => {
    expect(run({ wordReading: 'good', sentenceReading: 'caution', writing: 'good' })).toBe(DOCX.caution)
    expect(run({ wordReading: 'good', sentenceReading: 'caution', writing: 'caution' })).toBe(DOCX.riskTwoCautions)
    expect(run({ wordReading: 'good', sentenceReading: 'risk', writing: 'good' })).toBe(DOCX.riskOne)
  })
  it('예시에 없는 조합도 같은 규칙 — 없는 묶음은 빼고 양호 → 주의 → 위험 순', () => {
    expect(run({ wordReading: 'caution', sentenceReading: 'caution', writing: 'caution' }))
      .toContain(`결과, '해독, 읽기유창성, 쓰기' 영역에서 '주의'로 확인되어 최종결과 '위험'으로`)
    expect(run({ wordReading: 'risk', sentenceReading: 'caution', writing: 'good' }))
      .toContain(`결과, '쓰기' 영역에서 '양호', '읽기유창성' 영역에서 '주의', '해독' 영역에서 '위험'으로 확인되어`)
  })
  it('27가지 판정 조합 전부 — 과제별 판정과 최종결과가 칸에 맞게 찍히고, 줄 끝에 여는 따옴표만 남지 않는다', async () => {
    const form = formForGrade(1)
    const levels: Verdict[] = ['good', 'caution', 'risk']
    const marks = { good: 14, caution: 10, risk: 0 }, write = { good: 10, caution: 6, risk: 0 }, sec = { good: 1, caution: 13, risk: 25 }   // 36어절 ÷ 52초 × 10 = 6.92
    const cut = withCut(form)
    for (const a of levels) for (const b of levels) for (const c of levels) {
      const all = scored(cut, { read: true, sentence: true, write: true })
      const bytes = await renderReport({ form: cut, session: sessionFor(form), ...all, marks: marksN(cut, marks[a]),
        times: Object.fromEntries(Object.keys(all.times).map(k => [k, sec[b]])), writing: writingN(cut, write[c]) })
      expect(await verdictRow(bytes), `${a}·${b}·${c}`).toEqual([a, b, c, finalVerdict({ wordReading: a, sentenceReading: b, writing: c })]
        .map(v => ({ good: '양호', caution: '주의', risk: '위험' })[v]))
      for (const it of await textItems(bytes)) expect(it.str.trimEnd(), `${a}·${b}·${c}`).not.toMatch(/(^|\s)'$/)
    }
  }, 60_000)
  it('[REGRESSION] 줄 나눔 단위 — 여는 따옴표는 뒤 글자와 붙고, 닫는 따옴표는 홀로 남아 줄 머리에 오지 않는다', () => {
    expect(atomsOf(`'위험'으로`)).toEqual([`'위`, '험', `'`, '으', '로'])
    expect(atomsOf(`영역에서 '주의'`)).toEqual(['영', '역', '에', '서', ' ', `'주`, '의', `'`])
    expect(atomsOf('KODYS G1')).toEqual(['KODYS', ' ', 'G1'])
  })
  it('양호는 종전 PASS 문장 그대로이고 「통과」만 굵다', () => {
    const runs = interpretation({ wordReading: 'good', sentenceReading: 'good', writing: 'good' }, 'good')
    expect(runs.map(r => r.t).join('')).toBe('본 아동은 한국 난독 선별 검사 결과, 통과하였습니다. 다만 본 검사는 아동의 발달 수준을 대략적으로 확인하는 선별 검사이므로, 이후에도 가정과 학급에서 읽기·쓰기 발달 상황을 꾸준히 살펴봐 주시기 바랍니다.')
    expect(runs.filter(r => r.bold).map(r => r.t)).toEqual(['통과'])
  })
})
