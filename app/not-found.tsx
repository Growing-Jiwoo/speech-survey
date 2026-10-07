// app/not-found.tsx — 없는 주소. Next 기본 화면은 영어(「This page could not be found.」)에 OS 다크 모드를
// 따라 검게 떠, 이 앱의 다른 화면과 전혀 달랐다(2026-10-08 야간 점검). 주소를 잘못 친 경우가 대부분이라
// 처음 화면으로 보낸다 — 종료 화면(app/done)과 같은 모양.
import Link from 'next/link'
import { Blip } from '@/components/Blip'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-28 w-[118px] lg:h-36 lg:w-[152px]" />
      <h1 className="mt-2 text-2xl font-bold lg:text-3xl">페이지를 찾을 수 없어요</h1>
      <p className="text-sm leading-relaxed text-ink-soft lg:text-base">
        주소가 바뀌었거나 잘못 입력됐어요.
      </p>
      <Link href="/" className="cta mt-6 max-w-60">처음 화면으로</Link>
    </main>
  )
}
