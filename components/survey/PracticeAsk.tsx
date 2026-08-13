// components/survey/PracticeAsk.tsx — 연습 실시 여부 선택(마이크 확인 다음, 본 검사 진입 전).
// 같은 아동이 여러 번 검사할 수 있어 매번 연습을 강요하지 않는다(사용자 확정 2026-08-12).
// 검사자가 고르는 화면이므로 아동 화면과 톤을 달리해 blue 표식을 쓴다.
'use client'
import { Blip } from '@/components/Blip'

// 연습 낱말을 미리 보여주지 않는다(사용자 확정 2026-08-12) — 이 화면은 아동도 함께 보므로
// 곧 읽을 낱말을 미리 노출하면 연습의 의미가 준다.
export function PracticeAsk({ onChoose }: { onChoose: (practice: boolean) => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10 lg:max-w-2xl lg:justify-center lg:pt-6">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <p className="mt-12 text-xs font-bold text-blue lg:mt-8 lg:text-sm">검사자 확인</p>
      <h1 className="mt-1 text-2xl font-bold lg:text-3xl">연습을 먼저 할까요?</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        연습은 <b>점수에 들어가지 않아요.</b> 녹음 버튼 사용법을 익히는 단계예요.<br />
        이미 해 본 아동이라면 바로 시작해도 괜찮아요.
      </p>
      <div className="mt-auto flex w-full flex-col gap-2.5 pb-2 pt-10 lg:mt-10 lg:max-w-md lg:pb-0">
        <button type="button" onClick={() => onChoose(true)} className="cta">
          연습부터 하기
        </button>
        <button type="button" onClick={() => onChoose(false)} className="btn-ghost h-[52px] w-full">
          연습 없이 바로 검사 시작
        </button>
      </div>
    </main>
  )
}
