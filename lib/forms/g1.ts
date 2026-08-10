// lib/forms/g1.ts — KODYS-G1 (초등 1학년) 검사지 정의.
//
// 원본: assets/forms/kodys-g1.pdf (담당자 배포본)
// ── 이 파일은 원본 검사지를 옮겨 적은 사본일 뿐이다. ─────────────────────────
// 코드와 검사지가 다르면 **언제나 검사지가 옳다.** 코드에 맞춰 검사지를 해석하지 말고,
// 검사지에 맞춰 코드를 고친다. 아동은 검사지의 낱말을 읽는 것이 아니라 이 배열의 낱말을
// 읽게 되므로, 여기가 틀리면 검사 자체가 다른 검사가 된다.
// 실제로 rw14가 '봉밥'(U+BD09)으로 잘못 들어가 있던 것을 검사지의 '붕밥'(U+BD95)으로
// 바로잡았다(2026-08-10). 무의미 낱말은 뜻이 없어 오타가 눈에 띄지 않으니 특히 주의할 것.
// 대조는 tests/forms.test.ts의 SHEET_G1이 글자 단위로 자동 검증한다.
import type { SurveyForm } from './index'
import { G1_LAYOUT } from './g1-layout'

export const G1: SurveyForm = {
  id: 'KODYS-G1',
  title: 'KODYS - G1',
  subtitle: 'Korean Dyslexia Screening Test',
  grades: [1],
  readMeaning: ['어디', '바지', '양보', '그늘', '설탕', '장갑', '방법'],
  readNonsense: ['아로', '부림', '영추', '주곡', '구말', '솔텅', '붕밥'],
  sentences: [
    '아이가 아빠와 우유 사러 가서 고기도 사요.',
    '스라소니가 피리 가져오고 개구리가 해바라기 가지고 와요.',
    '다람쥐가 두꺼비를 보고 도망가요 그래서 부엉이가 다람쥐를 숨겨줘요.',
    '쉬는시간에 친구가 나에게 장난을 계속 쳐서 다투었어요.\n학교가 끝난 후에 친구가 다가와서 사과를 했어요.',
  ],
  writeMeaning: ['우비', '까치', '수박', '동상', '생각'],
  writeNonsense: ['오거', '끼추', '소벅', '당송', '갈먹'],
  limits: { wordSec: 30, sentenceSec: 40 },
  layout: G1_LAYOUT,
}
