import Link from 'next/link'
import { Blip } from '@/components/Blip'

export default function DonePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-28 w-[118px]" />
      <h1 className="mt-2 text-2xl font-bold">설문이 끝났어요</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        참여해 줘서 고마워요.<br />이제 화면을 선생님께 보여 주세요.
      </p>
      <Link href="/" className="cta mt-6 max-w-60">처음 화면으로</Link>
    </main>
  )
}
