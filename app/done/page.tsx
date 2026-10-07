// app/done/page.tsx — 검사 종료 화면.
'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { Blip } from '@/components/Blip'
import { clearSessionState, takeSubmitted } from '@/lib/survey-state'

export default function DonePage() {
  // 제출 성공 시 review에서 이미 지운다. 여기서는 **방금 제출한 그 세션**의 흔적만 한 번 더 치운다 — 전체를 지우면
  // 뒤로가기로 이 화면이 다시 열렸을 때 그 사이 시작한 다음 아이의 진행·토큰이 지워졌다(2026-10-08 야간 점검).
  useEffect(() => { const id = takeSubmitted(); if (id) clearSessionState(id) }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-28 w-[118px] lg:h-36 lg:w-[152px]" />
      <h1 className="mt-2 text-2xl font-bold lg:text-3xl">검사가 끝났어요</h1>
      <p className="text-sm leading-relaxed text-ink-soft lg:text-base">
        참여해 주셔서 감사합니다.
      </p>
      {/* 코드는 남아 있어(saveClassCode) 다음 학생은 아동 정보만 입력한다 */}
      <Link href="/" className="cta mt-6 max-w-60">다음 학생 검사하기</Link>
    </main>
  )
}
