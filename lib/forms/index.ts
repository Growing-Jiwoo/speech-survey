// lib/forms/index.ts — 학년별 검사지 정의 레지스트리.
// 검사지(종이)가 학년마다 다르므로, 문항·배점·머리글을 양식 데이터로 두고
// 검사 진행·채점·결과지·인쇄가 모두 이 정의로부터 만들어진다.
// 새 학년 = 양식 파일(g*.ts) + 좌표(g*-layout.ts) + 원본 PDF 추가 + FORMS 등록.
import { G1 } from './g1'
import { G2 } from './g2'
import type { SheetLayout } from './layout'

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
   * 숫자는 만점의 약 65%로 잡은 개발 판단이다(사용자 확정 2026-08-11).
   * 양식마다 만점이 다르므로(문장 읽기 G1 36 / G2 35) 양식 데이터로 둔다.
   * `PROVISIONAL_CRITERIA`가 true인 동안 화면·인쇄물에 "임시 기준 · 확정 전"이 붙는다.
   */
  passMark: { wordReading: number; sentenceReading: number; writing: number }
  /** 공식 검사지 PDF 출력용 좌표 */
  layout: SheetLayout
}

export const FORMS: SurveyForm[] = [G1, G2]

/** 담당 양식이 없는 학년의 폴백. */
export const DEFAULT_FORM = G1

/**
 * 학년에 해당하는 검사지를 돌려준다.
 * 담당 양식이 없는 학년(3~6)은 DEFAULT_FORM으로 폴백한다 — 그 학년 검사지를 아직 받지
 * 못했기 때문이다. 결과지·인쇄물에 form.id가 찍혀 어떤 양식으로 검사·채점했는지 드러난다.
 */
export function formForGrade(grade: number): SurveyForm {
  return FORMS.find(f => f.grades.includes(grade)) ?? DEFAULT_FORM
}
