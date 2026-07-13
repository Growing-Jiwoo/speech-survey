import Link from 'next/link'

export default function DonePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="text-6xl">🎉🐻</div>
      <h1 className="text-3xl">설문이 끝났어요!</h1>
      <p className="text-ink/70">끝까지 열심히 읽어 줘서 고마워요.<br />수고했어요!</p>
      <Link href="/" className="rounded-full bg-mint px-8 py-3 text-lg shadow-md">처음으로</Link>
    </main>
  )
}
