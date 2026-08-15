// components/ProgressBar.tsx — 검사 진행률 표시.
// 세는 단위는 **페이지**다(호출부가 넘기는 값이 연습을 뺀 페이지 수다) — 검사지는 한 페이지에
// 문항 전체를 두고 통째로 읽는 방식이라, 화면·녹음·제한시간의 단위가 문항이 아니다(lib/items.ts).
// ⚠️ 화면 문구는 아직 "문항 N / M"이다. 아이·검사자에게 "페이지"보다 "문항"이 통하는지는
//    담당자 확인이 필요한 표현 문제라 문구는 그대로 두고, 여기 단위만 사실대로 적는다.
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
