// lib/forms/g2s2.ts — KODYS-G2 (초등 2학년 2학기) 검사지 정의.
//
// ⚠️ **여기 낱말·문장은 가짜 문항이다** — 실제 문항은 암호문 `sealed.ts`. 모양은 실제와 같다(낱말 7·7, 문장 어절 8·9·11·17 —
// 3·4번은 두 문장, 문장 쓰기 2어절 × 5). 원본·대조 방식은 g1s2.ts 머리 주석과 같다 — 실제 무의미 낱말은 낯선 겹받침이 많다.
//
// 문장 번호: docx에는 3번이 비어 있는데 번호를 잘못 매긴 것이다(담당자 2026-10-20, g1s2.ts 주석).
// 문장 쓰기 끝의 마침표는 docx 서식일 뿐이다 — 검사지(kodys-g2.pdf)도 어절만 칸에 인쇄하고 마침표가 없다.
import type { SurveyForm } from './index'
import { G2 } from './g2'

export const G2S2: SurveyForm = {
  id: 'KODYS-G2-S2',
  title: 'KODYS - G2 (2학기)',
  subtitle: 'Korean Dyslexia Screening Test',
  grades: [2],
  semester: 2,
  // 가짜 문항(머리 주석) — 실제 문항은 sealed.ts
  readMeaning: ['가위', '노을', '다리', '머리', '바늘', '사탕', '저녁'],
  readNonsense: ['고밀', '너팍', '도섭', '러곤', '모찬', '버핍', '서랑'],
  sentences: [
    '선생님과 함께 매일 교실 화분에 물을 주고 관찰했습니다.',
    '운동회 날에 친구들과 힘을 모아 줄다리기를 하고 이어달리기도 했습니다.',
    '미술 시간에 가을 풍경을 그렸습니다.\n붉은 단풍잎과 노란 은행잎을 정성껏 색칠했습니다.',
    '어제 저녁에 할머니 댁에 가서 맛있는 송편을 함께 빚었어요.\n신기하게도 송편 속에는 깨와 꿀이 들어 있다고 해요.',
  ],
  writing: {
    kind: 'sentence',
    sentences: ['창문을 열어요', '신발을 신어요', '그림을 그려요', '노래를 불러요', '의자에 앉아요'],
  },
  // ⚠️ 담당자 확인 대기 — 문장당 20초 유지 여부(2026-10-20), g1s2.ts 주석과 같다.
  limits: { wordSec: 20, sentenceSec: 20 },
  // 담당자 확정(2026-10-19 docx) — 표기 그대로 「이하」. 읽기유창성은 10초당 정확 어절 수(담당자 확정 2026-10-20).
  // ⚠️ 담당자 확인 대기 — 읽기유창성 주의 8.04가 1학년과 같은 값이라 다시 확인 중이다(2026-10-20).
  cutoff: {
    wordReading: { caution: 7, risk: 6 },
    sentenceReading: { caution: 8.04, risk: 7.10 },
    writing: { caution: 5, risk: 4 },
  },
  provisional: false,
  // 결과보고서 서식은 2학년 양식 그대로다(담당자 2026-10-20 「이전에 줬던 템플릿으로 해도 돼」).
  report: G2.report,
}
