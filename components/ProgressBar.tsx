// components/ProgressBar.tsx — 검사 진행률 표시.
//
// 세는 단위는 **페이지**이고 화면 문구는 "문항 N / M"이다 — 이 불일치는 의도된 것이다
// (사용자 확정 2026-08-22). 여기서 "문항"은 채점 문항이 아니라 **시행 단위**를 뜻한다:
// 검사지가 낱말 7개를 한 장에 인쇄해 통째로 읽히므로 한 페이지가 녹음 한 개이고 제한시간
// 한 개다. 아이가 "7개 중 3번째"에 있다는 것을 알 방법이 애초에 없다(녹음을 낱말별로 쪼갤
// 수 없다) — 그래서 셀 수 있는 최소 단위가 페이지다.
//
// 숫자가 채점 문항 수와 다르다는 것은 알고 둔다: G1은 8페이지인데 채점 문항이 28개다
// (낱말 7+7 · 문장 4 · 쓰기 10 · 체크리스트 0). "문항 8"을 채점 문항 수로 오해하지 말 것.
// 채점은 페이지가 아니라 낱말 하나하나로 한다(관리자 결과지).
//
// ⚠️ 그러므로 이 숫자를 "정확하게" 고치려 들지 말 것 — 28로 바꾸면 중간 진행도를 셀 수
// 없어 진행률 바가 페이지 경계에서만 뛰고, "페이지"로 바꾸면 현장에서 쓰지 않는 말이 된다.
export function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full">
      <p className="mb-1.5 text-xs text-ink-mute">
        문항 <b className="font-read font-semibold text-ink-soft">{current} / {total}</b>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E7ECF8]">
        <div className="h-full rounded-full bg-blue transition-all motion-reduce:transition-none"
          style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  )
}
