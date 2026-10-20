// lib/forms/index.ts — 학년별 검사지 정의 레지스트리.
// 검사지(종이)가 학년마다 다르므로, 문항·배점·머리글을 양식 데이터로 두고
// 검사 진행·채점·결과지·인쇄가 모두 이 정의로부터 만들어진다.
// 새 학년 = 양식 파일(g*.ts, 가짜 문항) + 실제 문항(private/forms.json → `npm run forms:seal`) + FORMS 등록.
//
// **실제 문항은 암호문으로만 커밋한다**(sealed.ts — 저장소가 공개라서, 사용자 확정 2026-10-20). 키 FORMS_KEY가 있으면
// 모듈을 읽을 때 한 번 풀어 양식의 문항 네 칸(`RealContent`)을 갈아 끼우고, 없으면 g*.ts의 가짜 문항으로 돈다
// (공개 저장소를 받은 사람·테스트). **Vercel에서는 키가 없으면 던진다** — 아이가 가짜 낱말로 검사받느니 빌드·배포가
// 실패하는 편이 낫다(빌드 끝의 scripts/check-client-bundle.ts가 이 모듈을 읽으므로 키가 빠진 배포는 빌드에서 멈춘다).
import { G1 } from './g1'
import { G2 } from './g2'
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

export interface SurveyForm {
  /** 결과지에 표기되는 양식 식별자 — 어떤 검사지로 채점했는지 기록에 남긴다 */
  id: string
  /** 결과지 머리글 큰 제목 (예: 'KODYS - G1') */
  title: string
  /** 머리글 작은 제목 (예: 'Korean Dyslexia Screening Test') */
  subtitle: string
  /** 이 양식이 담당하는 학년 */
  grades: number[]
  readMeaning: string[]
  readNonsense: string[]
  sentences: string[]
  writing: WritingTask
  /** 검사지 제한 시간(초) — 채점 기준 */
  limits: { wordSec: number; sentenceSec: number }
  /**
   * ⚠️ 담당자 확인 대기 — 확정 아님. 담당자에게 실제 Pass 기준표를 받기 전까지 쓰는 값이며,
   * 숫자는 만점의 약 65%로 잡은 개발 판단이다(사용자 확정 2026-08-11). 문장 읽기유창성만 단위가
   * 어절/초이고 만점이 없어 임시값 1.0을 따로 정했다(사용자 확정 2026-09-29).
   * 기준표가 학년마다 다를 수 있어 양식 데이터로 둔다.
   * `PROVISIONAL_CRITERIA`가 true인 동안 관리자 화면에 "임시 기준 · 확정 전"이 붙는다.
   */
  passMark: { wordReading: number; sentenceReading: number; writing: number }
  /** 결과보고서 PDF에서 학년마다 다른 서식 */
  report: ReportStyle
}

/** 암호문 안의 실제 문항 — 양식에서 이 네 칸만 갈아 끼운다(배점·제한 시간·서식은 공개 양식 그대로). */
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

export const FORMS: SurveyForm[] = [G1, G2].map(f => withReal(f, REAL))

/** 실제 문항으로 돌고 있는지(키가 있는지). false면 가짜 문항이다 — 공개 저장소·테스트 */
export const REAL_FORMS = REAL !== null

/** 담당 양식이 없는 학년의 폴백. */
export const DEFAULT_FORM = FORMS[0]

/**
 * 학년에 해당하는 검사지를 돌려준다.
 * 담당 양식이 없는 학년(3~6)은 DEFAULT_FORM으로 폴백한다 — 그 학년 검사지를 아직 받지
 * 못했기 때문이다. 결과지·인쇄물에 form.id가 찍혀 어떤 양식으로 검사·채점했는지 드러난다.
 */
export function formForGrade(grade: number): SurveyForm {
  return FORMS.find(f => f.grades.includes(grade)) ?? DEFAULT_FORM
}
