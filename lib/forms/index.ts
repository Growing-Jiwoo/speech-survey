// lib/forms/index.ts — 학년·학기별 검사지 정의 레지스트리.
// 검사지가 학년과 학기마다 다르므로, 문항·배점·머리글을 양식 데이터로 두고
// 검사 진행·채점·결과지·인쇄가 모두 이 정의로부터 만들어진다.
// 새 양식 = 양식 파일(g*.ts, 가짜 문항) + 실제 문항(private/forms.json → `npm run forms:seal`) + FORMS 등록.
// 양식은 **세션을 만들 때 정해 세션 행에 적는다**(`sessions.form_id`, migration 008) — 이미 끝난 검사는
// 그 뒤에 양식이 늘거나 학기 규칙이 바뀌어도 검사 당시 양식으로 다시 그려진다(`formOfSession`).
//
// **실제 문항은 암호문으로만 커밋한다**(sealed.ts — 저장소가 공개라서, 사용자 확정 2026-10-20). 키 FORMS_KEY가 있으면
// 모듈을 읽을 때 한 번 풀어 양식의 문항 네 칸(`RealContent`)을 갈아 끼우고, 없으면 g*.ts의 가짜 문항으로 돈다
// (공개 저장소를 받은 사람·테스트). **Vercel에서는 키가 없으면 던진다** — 아이가 가짜 낱말로 검사받느니 빌드·배포가
// 실패하는 편이 낫다(빌드 끝의 scripts/check-client-bundle.ts가 이 모듈을 읽으므로 키가 빠진 배포는 빌드에서 멈춘다).
import { G1 } from './g1'
import { G2 } from './g2'
import { G1S2 } from './g1s2'
import { G2S2 } from './g2s2'
import { unseal } from './seal'
import { SEALED } from './sealed'

/**
 * 결과보고서 PDF에서 **학년마다 다른 것**. 담당자가 배포한 `KODYS_G1/G2_결과보고서_양식.docx`
 * (2026-09-28)를 1:1로 옮긴 값이라, 두 양식 사이의 서식 불일치(줄 간격·빈 줄 수·문장 부호)도
 * 그대로 데이터로 둔다 — 정답본과 다르게 "정리"하지 말 것(사용자 확정 2026-09-28).
 * 공통 서식은 lib/pdf/report.ts가 갖는다.
 */
export interface ReportStyle {
  /** 머리글 띠·소제목 색 (hex) */
  accent: string
  /** 머리글 부제 색 (hex) */
  accentTint: string
  /** 체크리스트 셋째 열 머리글 */
  observationHeader: string
  /** 체크리스트 안내문 끝의 마침표 유무 */
  notePeriod: boolean
  /** 결과 해석 문단의 줄 간격 배수 (Word `line=276 auto` = 1.15) */
  interpretationLine: number
  /** 결과 해석 표와 체크리스트 표 사이의 빈 문단 수 */
  gapAfterInterpretation: number
}

/**
 * 쓰기 과제. **학년마다 과제의 종류 자체가 다르다.**
 * - `word`(G1 낱말 쓰기): 낱말을 받아쓰고 낱말당 1점 — 문항 결과가 O/X다.
 * - `sentence`(G2 문장 쓰기): 문장을 받아쓰고 어절당 1점 — 문항 결과가 0~어절 수의 정수다.
 *
 * 판별 유니온으로 두는 이유: 세 번째 종류가 생기면 처리하지 않은 화면·저장·인쇄가
 * 전부 컴파일 오류로 드러난다. boolean 하나로 뭉개면 조용히 빠진 곳이 생긴다.
 */
export type WritingTask =
  | { kind: 'word'; meaning: string[]; nonsense: string[] }
  | { kind: 'sentence'; sentences: string[] }

/**
 * 과제 하나의 판정 기준. 담당자 기준표의 표기 그대로 **「이 값 이하면」**이다(경계값 자체가 해당 판정).
 * - `caution` = 영역별 Fail(Youden) → **주의**
 * - `risk` = 완전 Fail(−1SD) → **위험**
 * 이하가 아니면 양호. 판정 규칙은 lib/scoring `verdictOf`·`finalVerdict`.
 */
export interface Cutoff { caution: number; risk: number }

export interface SurveyForm {
  /** 결과지에 표기되는 양식 식별자 — 어떤 검사지로 채점했는지 기록에 남긴다. **세션 행(`form_id`)에 저장되므로
   *  한 번 쓴 id는 바꾸지 말 것**(바꾸면 그 id로 검사한 세션이 양식을 잃는다) */
  id: string
  /** 결과지 머리글 큰 제목 (예: 'KODYS - G1') */
  title: string
  /** 머리글 작은 제목 (예: 'Korean Dyslexia Screening Test') */
  subtitle: string
  /** 이 양식이 담당하는 학년 */
  grades: number[]
  /** 이 양식이 담당하는 학기 — 새 세션은 검사일의 학기(lib/format `semesterOf`)로 고른다 */
  semester: 1 | 2
  readMeaning: string[]
  readNonsense: string[]
  sentences: string[]
  writing: WritingTask
  /** 검사지 제한 시간(초) — 채점 기준 */
  /** 문장 읽기의 제한 시간은 **문장마다**다(`sentenceSec[i]` = i번 문장, 길이는 `sentences`와 같다) — 2학기는 1·2번 20초, 3·4번
   *  30초(담당자 확정 2026-10-20). 낱말은 의미·무의미 페이지 모두 `wordSec`. */
  limits: { wordSec: number; sentenceSec: readonly number[] }
  /**
   * 과제별 판정 기준(`Cutoff`). 개수형은 점수, 문장 읽기유창성은 어절/10초(lib/scoring `FLUENCY_UNIT`).
   * 기준표가 학년·학기마다 달라 양식 데이터로 둔다. 값의 출처는 양식 파일마다 적는다.
   */
  cutoff: { wordReading: Cutoff; sentenceReading: Cutoff; writing: Cutoff }
  /**
   * 기준이 **개발 판단으로 정한 임시값**인지. true면 관리자·교사 화면에 「임시 기준 · 확정 전」이 붙는다
   * (결과보고서 PDF는 담당자 양식이라 싣지 않는다). 담당 학년이 아닌 세션(3~6학년 폴백)도 임시로 본다 —
   * lib/scoring `criteriaProvisional`.
   */
  provisional: boolean
  /** 결과보고서 PDF에서 학년마다 다른 서식 */
  report: ReportStyle
}

/** 암호문 안의 실제 문항 — 양식에서 이 네 칸만 갈아 끼운다(배점·제한 시간·기준·서식은 공개 양식 그대로). */
export type RealContent = Pick<SurveyForm, 'readMeaning' | 'readNonsense' | 'sentences' | 'writing'>

/** 평문 private/forms.json의 모양. `sheet`는 검사지를 따로 옮겨 적은 대조값(tests/forms-sealed.test.ts) — 앱은 쓰지 않는다. */
export interface SealedPayload { forms: Record<string, RealContent>; sheet: Record<string, Record<string, readonly string[]>> }

export function openSealed(key: string): SealedPayload {
  return JSON.parse(unseal(SEALED, key)) as SealedPayload
}

function realContents(): Record<string, RealContent> | null {
  const key = process.env.FORMS_KEY
  if (key) return openSealed(key).forms
  if (process.env.VERCEL) throw new Error('FORMS_KEY가 없다 — Vercel 환경 변수에 넣을 것. 가짜 문항으로는 검사할 수 없다')
  return null
}

const shapeOf = (c: RealContent) => [c.readMeaning.length, c.readNonsense.length, c.sentences.length, c.writing.kind,
  ...(c.writing.kind === 'word' ? [c.writing.meaning.length, c.writing.nonsense.length] : [c.writing.sentences.length])].join('·')

/** 실제 문항으로 갈아 끼운 양식. 문항 개수가 공개 양식과 다르면 던진다 — 페이지·분모·배점이 공개 양식의 모양에서 나온다. */
function withReal(f: SurveyForm, real: Record<string, RealContent> | null): SurveyForm {
  if (!real) return f
  const c = real[f.id]
  if (!c) throw new Error(`문항 암호문에 ${f.id}가 없다`)
  if (shapeOf(c) !== shapeOf(f)) throw new Error(`${f.id}: 암호문 문항의 개수(${shapeOf(c)})가 양식(${shapeOf(f)})과 다르다`)
  return { ...f, readMeaning: c.readMeaning, readNonsense: c.readNonsense, sentences: c.sentences, writing: c.writing }
}

const REAL = realContents()

export const FORMS: SurveyForm[] = [G1, G2, G1S2, G2S2].map(f => withReal(f, REAL))

/** 실제 문항으로 돌고 있는지(키가 있는지). false면 가짜 문항이다 — 공개 저장소·테스트 */
export const REAL_FORMS = REAL !== null

const byId = (id: string): SurveyForm => FORMS.find(f => f.id === id)!

/** 담당 양식이 없는 학년의 폴백(학년만으로 고르던 때의 규칙). */
export const DEFAULT_FORM = byId(G1.id)

/**
 * **학년만으로 고르던 옛 규칙** — `form_id`가 없는 세션(migration 008 이전에 만든 검사)을 읽을 때만 쓴다.
 * 새 세션의 양식은 `formFor(학년, 학기)`가 정한다. 담당 양식이 없는 학년(3~6)은 DEFAULT_FORM이었다.
 */
export function formForGrade(grade: number): SurveyForm {
  return [byId(G1.id), byId(G2.id)].find(f => f.grades.includes(grade)) ?? DEFAULT_FORM
}

/**
 * 새 세션의 양식 — 학년과 검사일의 학기로 고른다(학기 경계 3~8월 1학기·9~2월 2학기는 담당자 확정 2026-10-20).
 * 담당 양식이 없는 학년(3~6)은 **같은 학기의 1학년 양식**으로 폴백한다 — 그 학년 검사지를 아직 받지 못했다.
 * 그 세션의 판정은 1학년 기준이라 임시로 표시한다(lib/scoring `criteriaProvisional`).
 */
export function formFor(grade: number, semester: 1 | 2): SurveyForm {
  const of = (g: number) => FORMS.find(f => f.semester === semester && f.grades.includes(g))
  return of(grade) ?? of(1) ?? DEFAULT_FORM
}

/**
 * 쓰기 문항 — 불러 주는 순서 = 기록지 칸 번호 순서(`lib/items`의 쓰기 문항과 같은 순서: 낱말은 의미 → 무의미).
 * 승인 안내가 싣는다(담당자 요청 2026-10-20 — 스캔본으로 하는 선생님이 문항을 미리 알아야 한다). **실제 문항이 나오므로
 * 서버에서만 부를 것** — 화면 코드가 이 모듈을 import하면 문항이 공개 번들에 실린다(빌드 끝의 check-client-bundle이 막는다).
 */
export function writingPrompts(f: SurveyForm): string[] {
  return f.writing.kind === 'word' ? [...f.writing.meaning, ...f.writing.nonsense] : [...f.writing.sentences]
}

/**
 * 세션의 양식 — 세션 행에 적힌 `form_id` 그대로다. 없으면(migration 008 이전 세션) 옛 규칙으로 읽는다.
 * 모르는 id는 던진다 — 다른 양식으로 그려 다른 낱말·기준으로 판정하느니 결과지를 못 여는 편이 낫다.
 */
export function formOfSession(s: { grade: number; form_id?: string | null }): SurveyForm {
  if (s.form_id == null) return formForGrade(s.grade)
  const f = FORMS.find(x => x.id === s.form_id)
  if (!f) throw new Error(`알 수 없는 양식: ${s.form_id}`)
  return f
}
