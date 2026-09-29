import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { DUP_LABELS, dupLabels, placeLabel, renderReport, schoolLabel } from '@/lib/pdf/report'
import { FORMS, formForGrade, type SurveyForm } from '@/lib/forms'
import { itemsFor } from '@/lib/items'
import { finalVerdict } from '@/lib/scoring'

/** PDF 1쪽의 글자 조각(빈 조각은 버린다 — pdfjs가 글자 사이에 폭 0짜리 조각을 끼운다). */
async function textItems(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
  const { items } = await (await doc.getPage(1)).getTextContent()
  return items.flatMap(i => ('str' in i && i.str !== '' ? [{ str: i.str, x: i.transform[4], y: i.transform[5] }] : []))
}
const textOf = async (bytes: Uint8Array) => (await textItems(bytes)).map(i => i.str).join('')
/** 결과 요약 값 행의 PASS/FAIL — 왼쪽부터. 머리글 행(해독…)보다 아래(y가 작은) 조각만. */
async function verdictRow(bytes: Uint8Array) {
  return (await textItems(bytes)).filter(i => i.str === 'PASS' || i.str === 'FAIL')
    .sort((a, b) => a.x - b.x).map(i => i.str)
}

const baseSession = {
  school_region: '강원특별자치도교육청', school_id: 'B000004824', school_name: '교동초등학교',
  gender: '남', child_name: '김가나', birth_ymd: '190315', started_at: '2026-09-19T01:00:00.000Z',
  checklist: ['none'],
}
const sessionFor = (form: SurveyForm) => ({ ...baseSession, grade: form.grades[0] })
const blank = { marks: {}, sentences: {}, times: {}, writing: {} }
/** 세 과제를 전부 채점한 입력. ok면 만점, 아니면 0점. 문장은 문장마다 1초 —
 *  만점이면 어절/초가 기준보다 훨씬 크고(G1 36 ÷ 4 = 9.00), 0어절이면 0.00이다. */
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

  it('Letter 한 장이다 (담당자 양식 docx가 Letter다 — A4로 바꾸지 말 것)', async () => {
    const out = await PDFDocument.load(await renderReport({ form, session, ...blank }))
    expect(out.getPageCount()).toBe(1)
    const { width, height } = out.getPages()[0].getSize()
    expect([Math.round(width), Math.round(height)]).toEqual([612, 792])
  })

  it('머리글에 학년 식별자·인적사항이 양식 표기대로 찍힌다', async () => {
    const text = await textOf(await renderReport({ form, session, ...blank }))
    expect(text).toContain('한국 난독 선별 검사')
    expect(text).toContain(`KODYS – ${form.id.replace('KODYS-', '')} · Korean Dyslexia Screening Test`)
    expect(text).toContain('춘천 교동초등학교')       // 학교 목록의 소재지(춘천시 → 춘천) + 학교명
    expect(text).toContain(`${form.grades[0]}학년 2학기`) // 9월 검사 → 2학기
    expect(text).toContain('김가나')
    expect(text).toContain('남')
    expect(text).toContain('2019. 03. 15.')
    expect(text).toContain('2026. 09. 19.')
  })

  it('세 과제가 다 채점되면 과제별 판정과 최종결과가 PASS/FAIL로 찍힌다', async () => {
    const all = await verdictRow(await renderReport({ form, session, ...scored(form, { read: true, sentence: true, write: true }) }))
    expect(all).toEqual(['PASS', 'PASS', 'PASS', 'PASS'])
    // 담당자 확정(2026-09-29): FAIL 2개 이상이어야 최종 FAIL — 쓰기 하나만 FAIL이면 최종 PASS(docx 예시와 같다)
    const oneFail = await verdictRow(await renderReport({ form, session, ...scored(form, { read: true, sentence: true, write: false }) }))
    expect(oneFail).toEqual(['PASS', 'PASS', 'FAIL', 'PASS'])
    const twoFail = await verdictRow(await renderReport({ form, session, ...scored(form, { read: false, sentence: false, write: true }) }))
    expect(twoFail).toEqual(['FAIL', 'FAIL', 'PASS', 'FAIL'])
  })

  it('[REGRESSION] 읽기유창성 판정은 어절 수가 아니라 어절/초로 한다 — 다 맞게 읽어도 오래 걸리면 FAIL', async () => {
    // 기준을 1.0으로 고정한 양식 사본 — 임시 기준(passMark)이 바뀌어도 이 테스트의 뜻은 그대로다.
    const at1 = { ...form, passMark: { ...form.passMark, sentenceReading: 1 } }
    const all = scored(at1, { read: true, sentence: true, write: true })
    const slow = { ...all, times: Object.fromEntries(Object.keys(all.times).map(c => [c, 20])) }  // 만점 ÷ 80초 < 0.5
    expect(await verdictRow(await renderReport({ form: at1, session, ...slow }))).toEqual(['PASS', 'FAIL', 'PASS', 'PASS'])
  })

  it('[REGRESSION] 채점이 끝나지 않은 과제의 판정 칸은 비고, 최종결과·해석 문단도 비운다 — 미채점은 FAIL이 아니다', async () => {
    const half = scored(form, { read: true, sentence: true, write: true })
    const bytes = await renderReport({ form, session, marks: half.marks, sentences: half.sentences, times: half.times, writing: {} })
    expect(await verdictRow(bytes)).toEqual(['PASS', 'PASS'])
    const text = await textOf(bytes)
    expect(text).not.toContain('통과하였습니다')
    expect(text).not.toContain('미통과')
  })

  it('결과 해석 문구는 최종결과에 따라 담당자 문장 그대로다', async () => {
    const pass = await textOf(await renderReport({ form, session, ...scored(form, { read: true, sentence: true, write: true }) }))
    expect(pass).toContain('본 아동은 한국 난독 선별 검사 결과, 통과하였습니다.')
    const fail = await textOf(await renderReport({ form, session, ...scored(form, { read: false, sentence: false, write: false }) }))
    expect(fail).toContain('또래보다 느린 수준으로 나타나 미통과하였습니다.')
    expect(fail).toContain('전문 기관에서의 심화 검사를 권고드립니다.')
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

describe('finalVerdict — 담당자 확정(2026-09-29) 「3개 중에 2개 이상이 fail이면 최종 fail」', () => {
  it('fail이 2개 이상일 때만 fail — 하나만 fail이면 pass', () => {
    expect(finalVerdict({ wordReading: 'pass', sentenceReading: 'pass', writing: 'pass' })).toBe('pass')
    expect(finalVerdict({ wordReading: 'pass', sentenceReading: 'pass', writing: 'fail' })).toBe('pass')
    expect(finalVerdict({ wordReading: 'fail', sentenceReading: 'fail', writing: 'pass' })).toBe('fail')
    expect(finalVerdict({ wordReading: 'fail', sentenceReading: 'fail', writing: 'fail' })).toBe('fail')
  })
})
