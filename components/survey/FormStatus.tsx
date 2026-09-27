// components/survey/FormStatus.tsx — 검사지를 받는 동안(로딩)·받지 못했을 때(오류)의 화면.
// 검사·검토 화면이 hooks/useSurveyForm의 결과를 그대로 넘긴다.
'use client'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/Spinner'
import { clearState } from '@/lib/survey-state'
import { SurveyFormError, isFatalFormError } from '@/hooks/useSurveyForm'

const FATAL_MSG: Record<number, string> = {
  401: '검사를 시작한 지 오래되어 이어서 할 수 없어요.',
  404: '이 검사 기록을 찾을 수 없어요.',
  409: '이미 제출된 검사예요.',
}

export function FormStatus({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const router = useRouter()
  if (!error) return (
    <main className="grid min-h-dvh place-items-center text-blue">
      <Spinner className="h-8 w-8" />
    </main>
  )
  const fatal = isFatalFormError(error)
  const status = error instanceof SurveyFormError ? error.status : 0
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm leading-relaxed text-ink-soft">
        {fatal ? <>{FATAL_MSG[status]}<br />처음 화면에서 새로 시작해 주세요.</> : '검사 문항을 불러오지 못했어요.'}
      </p>
      {/* 재시도해도 같은 결과인 경우는 저장된 진행 상태를 지우고 처음으로 보낸다 — 남겨 두면
          첫 화면이 「이어서 하기」를 다시 권해 같은 오류로 되돌아온다. */}
      {fatal
        ? <button type="button" className="btn-primary h-[52px] w-full" onClick={() => { clearState(); router.replace('/') }}>처음 화면으로</button>
        : <button type="button" className="btn-primary h-[52px] w-full" onClick={onRetry}>다시 시도</button>}
    </main>
  )
}
