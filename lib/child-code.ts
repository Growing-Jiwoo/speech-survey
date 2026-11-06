// lib/child-code.ts — 아동 코드(`017-03` = 신청 순번 17번 학급의 출석 번호 3번 아이).
//
// 출처: 형식(신청 순번 + 출석 번호, 예 `017-03`, 한 해 1·2학기까지 이어짐)은 담당자 확정(2026-11-06 — 답장의 이 형식에
// 「오케이!!」). 6자리 학급 코드를 앞자리로 쓰지 않는 판단은 사용자 확정(2026-11-05) — 담당자 회신 아님. 6자리 학급 코드를 앞자리로 쓰지 않는 이유: 그 코드는 시작 화면에서 반 명단(아동 실명)을 여는 열쇠라
// 내보낸 파일에 실리면 안 된다 — 그래서 신청 순번(`class_codes.apply_seq`, migration 010)을 쓴다.
//
// 저장하지 않는다 — 순번과 출석 번호로 그때그때 만든다(엑셀 내보내기에서 쓸 예정). 같은 학급 코드로 1·2학기를 이어
// 하면 같은 아이는 같은 코드다. 자리는 순번 3자리·번호 2자리로 맞추고, 넘치면 자르지 않고 그대로 늘린다(`1234-03`).
// 화면의 `#017`(관리자 학급 코드 화면)도 같은 3자리 규칙이다 — 둘이 갈리면 화면에서 본 번호로 파일을 찾지 못한다.

const pad = (n: number, width: number) => String(n).padStart(width, '0')

/** 신청 순번 표기 — 관리자 화면의 `#017`. */
export function applySeqLabel(applySeq: number): string {
  return `#${pad(applySeq, 3)}`
}

/** 아동 코드 — `childCode(17, 3)` → `017-03`. */
export function childCode(applySeq: number, childNo: number): string {
  return `${pad(applySeq, 3)}-${pad(childNo, 2)}`
}
