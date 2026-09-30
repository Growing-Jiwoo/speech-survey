// components/survey/WritingMode.tsx — 쓰기 단계의 방식 고르기(화면에서 바로 표시 / 스캔본으로 올리기)와
// 스캔본 방식의 안내 카드. 담당자 확정(2026-09-30 — 과정만, 회신은 사용자 전달): 아이가 기록지에 쓰고, 반 전체
// 검사가 끝난 뒤 선생님이 교사 결과지 화면에서 스캔본을 올리면 담당자가 스캔본을 보고 채점한다.
// 화면 모양(토글·안내 카드)과 기본값(이 기기에서 같은 학급의 마지막 선택 — lib/survey-state resolveWritingMode)은
// 사용자 확정(2026-09-30).
'use client'
import type { SurveyItem } from '@/lib/items'
import { sheetBoxNo } from '@/lib/writing-sheet'
import type { WritingMode } from '@/lib/survey-state'

/** 방식 고르기 — 쓰기 카드 맨 위에 둔다. 고르기 전 값은 상위가 정해 넘긴다(resolveWritingMode). */
export function WritingModeToggle({ mode, onChange }: { mode: WritingMode; onChange: (m: WritingMode) => void }) {
  // 라디오 묶음 관례 — 화살표로 옮긴다(탭 한 번에 묶음 전체, 고른 것에만 초점)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const next = mode === 'screen' ? 'scan' : 'screen'
    onChange(next)
    ;(e.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus()
  }
  const opt = (m: WritingMode, label: string) => (
    <button type="button" role="radio" aria-checked={mode === m} onClick={() => onChange(m)}
      data-mode={m} tabIndex={mode === m ? 0 : -1}
      className={`h-10 flex-1 rounded-[10px] px-2 text-[13px] font-bold transition lg:text-sm ${
        mode === m ? 'bg-white text-blue shadow-sm ring-[1.5px] ring-blue' : 'text-ink-mute hover:text-ink-soft'}`}>
      {label}
    </button>
  )
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex-none text-[12px] font-bold text-ink-mute">쓰기 방식</span>
      <div role="radiogroup" aria-label="쓰기 방식" onKeyDown={onKey} className="flex flex-1 gap-1 rounded-xl border-[1.5px] border-line bg-well p-1">
        {opt('screen', '화면에서 바로 표시')}
        {opt('scan', '스캔본으로 올리기')}
      </div>
    </div>
  )
}

/**
 * 「스캔본으로 올리기」를 골랐을 때의 카드 — 예/아니오(0·1·2) 대신 안내와 불러 줄 목록을 보인다.
 * ⚠️ 담당자 확인 대기 — 확정 아님: 선생님이 **이 화면의 목록을 보고 불러 줘도 되는지**(아이가 화면을 보면
 * 베낄 수 있다 — 2026-08-07 계획서부터 남은 질문). 지금은 화면 입력 방식과 같게 목록을 보여 준다.
 */
export function ScanWritingPanel({ toggle, items, kind, childNo, childName, screenMarks = 0 }: {
  toggle: React.ReactNode
  items: SurveyItem[]
  kind: 'word' | 'sentence'
  childNo: number
  childName: string
  /** 화면 방식에서 이미 표시한 칸 수 — 스캔본 방식으로 제출하면 저장되지 않는다고 알린다 */
  screenMarks?: number
}) {
  // 번호는 기록지 칸 번호다(검사지 전체 순번 orderNo가 아니다 — lib/writing-sheet sheetBoxNo)
  const no = sheetBoxNo(items)
  return (
    <div className="card mx-auto w-full max-w-2xl p-5 lg:p-7">
      {toggle}
      <div className="mt-4 rounded-xl border-[1.5px] border-blue/25 bg-blue/[0.05] px-4 py-3.5">
        <p className="text-sm font-bold text-blue lg:text-base">이 학생은 기록지 스캔본으로 채점해요</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink-soft lg:text-sm">
          <li>아이는 인쇄한 기록지(<b className="text-ink">{childNo}번 {childName}</b>)에 씁니다.</li>
          <li>반 전체 검사가 끝나면 <b className="text-ink">결과지 화면</b>에서 스캔본을 올려 주세요.</li>
          <li>스캔본을 보고 <b className="text-ink">담당자가 채점</b>합니다.</li>
        </ul>
      </div>
      {screenMarks > 0 && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-amber">
          화면에서 표시한 {screenMarks}개는 스캔본 방식으로 제출하면 저장되지 않아요(「화면에서 바로 표시」로 돌아가면 그대로 있어요).
        </p>
      )}
      <p className="mt-4 text-[12px] font-bold text-ink-mute">불러 줄 {kind === 'word' ? '낱말' : '문장'}</p>
      {/* 낱말은 두 열(왼쪽 의미·오른쪽 무의미 순서가 위→아래로 이어지게 열 방향으로 채운다), 문장은 한 열 */}
      <ol className="mt-1.5 grid gap-1.5" style={kind === 'word'
        ? { gridAutoFlow: 'column', gridTemplateRows: `repeat(${Math.ceil(items.length / 2)}, auto)`, gridTemplateColumns: '1fr 1fr' }
        : undefined}>
        {items.map(i => (
          <li key={i.code} className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-1.5">
            <span className="w-5 flex-none text-xs font-bold text-ink-mute">{no.get(i.code)}</span>
            <span className="font-read min-w-0 flex-1 text-[18px] font-bold lg:text-[20px]">{i.text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
