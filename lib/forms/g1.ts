// lib/forms/g1.ts — KODYS-G1 (초등 1학년) 검사지 정의.
// 출처: [최종] 초등 1학년 선별검사지.pdf
import type { SurveyForm } from './index'

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
}
