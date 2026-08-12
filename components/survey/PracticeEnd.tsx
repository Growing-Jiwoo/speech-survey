// components/survey/PracticeEnd.tsx — 연습 종료 안내(연습 페이지에서 [다음]을 누른 직후).
// 연습과 본 검사의 경계를 화면으로 분명히 한다 — 연습이 끝난 것도, 이제부터가 채점 대상인
// 것도 보이지 않는다는 피드백(2026-08-12)에 대한 화면이다. 다음 버튼은 상위 페이지가 담당한다.
'use client'
import { Blip } from '@/components/Blip'

export function PracticeEnd() {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="rounded-full bg-mint/15 px-4 py-1.5 text-sm font-bold text-mint lg:text-base">
        연습 끝
      </span>
      <Blip variant="idle" className="mt-6 h-24 w-[100px] lg:h-32 lg:w-[136px]" />
      <h2 className="mt-6 text-3xl font-bold lg:text-5xl">연습이 끝났어요</h2>
      <p className="mt-3 text-base leading-relaxed text-ink-soft lg:text-xl">
        이제 진짜 검사를 시작해요.<br />준비되면 아래 버튼을 눌러 주세요.
      </p>
    </div>
  )
}
