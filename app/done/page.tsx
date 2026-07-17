// app/done/page.tsx — 검사 종료 화면.
'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { Blip } from '@/components/Blip'
import { clearState } from '@/lib/survey-state'

export default function DonePage() {
  // 제출 성공 시 review에서 이미 지우지만, 여기서 한 번 더 파기해
  // 공용 기기에 진행 상태(세션 id·토큰)가 남는 경로를 차단한다.
  useEffect(() => { clearState() }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-28 w-[118px]" />
      <h1 className="mt-2 text-2xl font-bold">검사가 끝났어요</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        참여해 주셔서 감사합니다.
      </p>
      <Link href="/" className="cta mt-6 max-w-60">처음 화면으로</Link>
    </main>
  )
}
