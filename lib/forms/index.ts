// lib/forms/index.ts — 학년별 검사지 정의 레지스트리.
// 검사지(종이)가 학년마다 다르므로, 문항·배점·머리글을 양식 데이터로 두고
// 결과지 화면이 이 정의로부터 렌더링한다. 새 학년 = 양식 파일 추가 + FORMS 등록.
import { G1 } from './g1'
import type { SheetLayout } from './layout'

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
  writeMeaning: string[]
  writeNonsense: string[]
  /** 검사지 제한 시간(초) — 채점 기준 */
  limits: { wordSec: number; sentenceSec: number }
  /** 공식 검사지 PDF 출력용 좌표. 없으면 그 학년은 PDF 출력을 제공하지 않는다. */
  layout: SheetLayout
}

export const FORMS: SurveyForm[] = [G1]

/** 기본 양식 — 담당 양식이 없는 학년의 폴백이자, 검사 진행 흐름이 쓰는 현재 양식. */
export const DEFAULT_FORM = G1

/**
 * 학년에 해당하는 검사지를 돌려준다.
 * 담당 양식이 없으면 DEFAULT_FORM으로 폴백한다 — 검사 진행 흐름이 아직 단일 양식이라,
 * 2~6학년으로 시작한 세션도 실제로는 G1 문항으로 검사받았기 때문이다.
 * (그래서 결과지에 form.id를 표기해 어떤 양식으로 채점했는지 드러낸다.)
 */
export function formForGrade(grade: number): SurveyForm {
  return FORMS.find(f => f.grades.includes(grade)) ?? DEFAULT_FORM
}
