// lib/forms/layout.ts — 검사지 PDF 위에 점수를 얹기 위한 좌표 스키마.
// PDF 사용자 공간(pt) 기준이며 원점은 페이지 좌하단이다(CSS와 y 방향이 반대).
// 학년마다 검사지가 다르므로 좌표도 양식별 데이터로 둔다 — 레이아웃 코드를 늘리지 않기 위함.

/** 낱말 격자 — 셀이 등간격이라 시작점·간격·크기만으로 전 셀을 만든다 */
export interface WordGridLayout {
  /** 첫 칸 왼쪽 x */
  x0: number
  /** 칸 간격 */
  dx: number
  /** 칸 너비·높이 */
  w: number
  h: number
  /** 행 아래쪽 y — [의미 낱말 행, 무의미 낱말 행] */
  rows: [number, number]
  /** 한 행의 칸 수 */
  perRow: number
  /** 칸 아래쪽에서 낱말 베이스라인까지의 거리.
   *  O/X를 이 베이스라인에 맞춰야 낱말과 같은 줄에 앉는다 — 칸 중앙에 찍으면 낱말보다 떠 보인다. */
  baselineDy: number
}

/** 점수 빈칸 — '/' 왼쪽에 오른쪽 정렬로 찍는다 */
export interface ScoreSlot {
  /** '/' 글리프의 x */
  slashX: number
  /** 숫자 베이스라인 y */
  baselineY: number
}

/** 머리글 인적사항 칸 — 열 경계 안에서 가운데 정렬 */
export interface HeaderCol {
  lo: number
  hi: number
}

export interface SheetLayout {
  /** 스탬핑 배경이 되는 원본 PDF (assets 기준 상대 경로) */
  pdf: string
  /** 원본 페이지 크기(pt) — 추출값과 실제가 다르면 좌표가 전부 어긋나므로 런타임에 검증한다 */
  pageWidth: number
  pageHeight: number

  header: {
    baselineY: number
    school: HeaderCol
    grade: HeaderCol
    childName: HeaderCol
    birth: HeaderCol
    testedAt: HeaderCol
    /** 검사자 구분: 해당 낱말에 타원을 그린다 */
    examiner: { teacher: { cx: number; rx: number }; expert: { cx: number; rx: number }; cy: number }
  }

  wordReading: WordGridLayout
  wordWriting: WordGridLayout

  /** 낱말 해독 소계 — 의미/무의미/총점 */
  readScores: { meaning: ScoreSlot; nonsense: ScoreSlot; total: ScoreSlot }
  /** 낱말 쓰기 소계 */
  writeScores: { meaning: ScoreSlot; nonsense: ScoreSlot; total: ScoreSlot }
  /** 문장 4개 점수 + 총점 */
  sentenceScores: ScoreSlot[]
  sentenceTotal: ScoreSlot

  /** 검사지 본문 글자 크기(pt). 스탬프도 같은 크기로 찍어야 이질감이 없다. */
  fontSize: number

  /**
   * 체크리스트 확인란(□). rows는 영역 코드 → 그 행 텍스트의 베이스라인 y.
   * 네모의 실제 범위는 600dpi 렌더링으로 실측했다(글리프 박스 ≠ 글자 진행 폭):
   * 가로 중심 boxCx, 세로는 baseline+boxDy를 중심으로 한 변 boxSize인 정사각형.
   * 체크는 반드시 이 사각형 안에 들어가야 한다.
   */
  checklist: {
    boxCx: number
    boxDy: number
    boxSize: number
    rows: Record<string, number>
  }
}
