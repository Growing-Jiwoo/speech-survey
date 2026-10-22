// components/survey/ReadingPage.tsx — 낱말/문장 읽기 페이지(페이지 전체 = 1녹음).
// 검사지대로 한 페이지의 문항 전체를 제한 시간 안에 읽는다. 버튼을 누르면 곧바로 녹음이
// 시작되고(3·2·1 카운트다운은 2026-08-12에 제거 — 연습 단계가 그 역할을 대신한다),
// 제한 시간(limitSec)에 도달하면 "여기까지예요" 안내가 뜨며 여유 시간(GRACE_SEC) 뒤 자동 종료된다.
//
// 저장은 이 컴포넌트가 하지 않는다 — 녹음이 끝나면 onRecorded로 넘기고, 업로드는 상위
// 진행 화면이 백그라운드로 처리한다(낙관적 완료 표시). 그래서 여기에는 "저장 중" 대기 UI가 없다.
'use client'
import { useEffect, useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { MIC_MIN_PEAK, classifyRecorderError, type RecorderErrorKind } from '@/lib/audio'
import { maxRecSec, type SurveyPage } from '@/lib/items'
import { micPermissionHintHere } from '@/lib/platform'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'

export function ReadingPage({ page, attemptCount, onRecorded, onRecordingChange, stopRef, fitEm }: {
  page: SurveyPage
  /** 문장 페이지만 — 이 양식 문장 가운데 가장 긴 줄의 폭(em, lib/items `sentenceFitEm`). 넓은 배치에서 글자 크기를 그 줄이 한 줄에
   *  들게 맞춘다(아래 문장 주석). 양식 전체의 값이라 네 문장이 같은 크기다 */
  fitEm?: number
  /** 이 페이지에서 이미 완료된 녹음 수(상위 진행 상태) */
  attemptCount: number
  /** 녹음 완료 — 상위가 완료 표시와 업로드를 맡는다(연습 페이지는 업로드하지 않는다) */
  onRecorded: (rec: Recording) => void
  /** 녹음 중 여부를 부모에 알려 [다음] 버튼을 잠근다 */
  onRecordingChange?: (busy: boolean) => void
  /**
   * 녹음을 밖에서 멈출 손잡이 — 녹음 중일 때만 채워지고, 아니면 `null`이다.
   * 진행 화면 헤더의 [일시정지]가 쓴다: 오버레이로 화면을 덮기 **전에** 녹음을 끊어야
   * 아이가 그만둔 뒤의 침묵이 그 시도에 담기지 않는다(멈추지 않으면 제한 시간까지
   * 계속 녹음되다가 자동 저장된다). 멈추면 그때까지 읽은 소리는 평소처럼 저장된다 —
   * 아이가 녹음 버튼을 다시 눌러 멈출 때와 같은 규칙이다.
   * 신청 화면 안내 「일시정지 버튼을 눌러 언제든 멈출 수 있습니다」는 담당자 확정(2026-09-21)이고,
   * 그 문구대로 녹음 중에도 실제로 멈출 수 있게 한 동작은 사용자 확정(2026-09-22 — 담당자 회신 아님)이다.
   */
  stopRef?: React.RefObject<(() => void) | null>
}) {
  // 마지막 녹음의 소리 크기 판정 — 목소리가 담기지 않았으면 다시 하도록 권한다.
  const [lowVolume, setLowVolume] = useState(false)
  const [micErr, setMicErr] = useState<RecorderErrorKind | null>(null)
  const words = page.section === 'word_reading'
  // 한 줄이 안 차는 낱말 페이지(연습 3개) — 아래 격자 주석
  const partialRow = words && page.items.length < 4
  const hardStopSec = maxRecSec(page)

  const recorder = useRecorder(hardStopSec, (rec: Recording) => {
    setLowVolume(rec.peak < MIC_MIN_PEAK)
    onRecorded(rec)
  })
  const recording = recorder.state === 'recording'
  // 마이크를 여는 중도 「녹음 중」처럼 다룬다 — [다음]·[이전]·헤더 링크를 잠그고, 일시정지가 그 시작을 취소할 수 있게
  const busy = recording || recorder.starting
  // 제한 시간을 넘겨 여유 구간에 들어섰는지 — 채점은 limitSec까지만이므로 아동에게 종료를 알린다.
  const pastLimit = recording && recorder.elapsedMs / 1000 >= page.limitSec

  useEffect(() => {
    onRecordingChange?.(busy)
    return () => onRecordingChange?.(false)
  }, [busy, onRecordingChange])

  // 녹음 중에만 손잡이를 내준다 — 녹음이 아닐 때 부모가 부르면 아무 일도 없어야 한다.
  useEffect(() => {
    if (!stopRef) return
    stopRef.current = busy ? recorder.stopForPause : null
    return () => { stopRef.current = null }
  }, [stopRef, busy, recorder.stopForPause])

  async function begin() {
    setMicErr(null)
    try { await recorder.start() }
    catch (e) { setMicErr(classifyRecorderError(e)) }
  }

  const saved = attemptCount > 0
  const savedMessage = lowVolume
    // 두 문장이라 좁은 배지 폭에서 어중간하게 접혔다 — `\n`으로 나누고 아래 배지가
    // pre-line으로 살린다(sr-only 라이브 리전은 줄바꿈에 영향받지 않는다).
    ? '목소리가 잘 안 담긴 것 같아요.\n한 번 더 해 볼까요?'
    : page.practice ? '잘했어요! 이제 진짜로 해 볼게요.' : '녹음이 완료됐어요.'

  return (
    <>
      {/* 안내 문장은 읽기판(카드) **밖, 위에 연한 글씨로** 둔다 — 카드 안에는 읽을 낱말·문장만 있다.
          담당자 제안(2026-09-30, 교수 논의) 「아이들이 읽는 읽기판(하얀 부분)은 목표 단어만」이 근거이고,
          제안된 두 안(연한 글자 / 읽기판 위에 기재) 중 그 원칙을 온전히 지키는 쪽을 고른 것은
          사용자 확정(2026-09-30)이다 — 연한 글자로만 바꾸면 여전히 카드 안에 남는다.
          아이가 안내문까지 소리 내어 읽으면 녹음과 읽은 시간에 섞인다(문장 페이지는 안내문도 문장이다).
          같은 말은 과제 시작 전 안내 화면(SectionIntro)이 이미 크게 보여 주므로 잃는 정보는 없다. */}
      <p className={`mb-2 px-1 text-xs font-bold tab:text-sm ${page.practice ? 'text-amber/80' : 'text-ink-mute'}`}>
        {page.practice ? '연습이에요. 아래 낱말을 소리 내어 읽어 주세요'
          : words ? '아래 낱말을 모두 소리 내어 읽어 주세요'
            : '아래 문장을 소리 내어 읽어 주세요'}
      </p>
      {/* 연습 페이지는 카드 테두리부터 다르게 둔다 — 본 검사와 같은 모양이면 "지금이 연습"이
          화면에 드러나지 않는다(사용자 피드백 2026-08-12).
          `!`(important)가 필요한 이유: .card는 globals.css의 레이어 없는 규칙이라 같은
          특이도의 Tailwind 유틸리티(레이어 안)보다 나중에 적용된다 — 없으면 흰 카드로 남는다. */}
      <div className={`card p-5 tab:p-6 short:py-4 ${page.practice ? 'border-amber/50! bg-amber/[0.06]!' : ''}`}>
        {/* 낱말 페이지는 검사지처럼 두 줄 격자(4+3)로 배치하고, 문장은 원문 그대로 보인다.
            제시어는 길게 눌러도 선택·iOS 콜아웃이 뜨지 않게 한다(아동 오터치 방지). */}
        {/* 최소 높이는 "낱말 페이지와 문장 페이지의 카드 높이를 비슷하게 맞춰 녹음 버튼이 위아래로
            움직이지 않게" 하는 장치다. 실제로 필요한 높이는 낱말 격자 138px · 가장 긴 문장 85px이라
            넓은 배치(tab 이상)의 220px은 과했고, 그 여유분이 가운데 밴드를 밀어 불필요한 스크롤을 만들었다(176px로 조정). */}
        {/* 화면 높이가 낮으면(short — app/globals.css) 최소 높이·낱말 크기·줄 간격을 줄인다 — 녹음 뒤 알림이 화면 안에 남게 */}
        {/* 낱말 크기: 휴대폰 26px · 태블릿 폭(tab, 700~1023px) 38px · 그 이상 44px(높이가 낮으면 38px). 태블릿은 **세로든 가로든 38px**이다 —
            가로 태블릿은 높이가 낮아(short) 38px이라, 세로를 44px로 두면 검사 도중 돌릴 때마다 크기가 바뀌었다. 실제 낱말은 38px에서
            가장 긴 것이 66px로 가장 좁은 태블릿 열(145px)에 넉넉히 든다(사용자 확정 2026-10-21 — 태블릿 점검, 담당자 회신 아님) */}
        {/* 한 줄이 안 차는 연습 페이지(3개)는 본 검사와 **같은 칸 너비**로 가운데에 모은다 — 4칸 격자에 왼쪽부터 채우면 오른쪽 한 칸이
            비어 낱말이 한쪽으로 쏠려 보였다(사용자 확정 2026-10-21 — 태블릿 점검, 담당자 회신 아님). 본 검사(7개)는 검사지처럼 4+3 그대로다.
            칸 너비 = (폭 − 칸 사이 3개 × gap-x-2) ÷ 4 — gap-x-2를 바꾸면 1.5rem도 같이 바꿀 것 */}
        <div className="@container flex min-h-[152px] items-center justify-center tab:min-h-[176px] short:min-h-[120px] tab:short:min-h-[124px]">
          {words ? (
            <div className={`grid w-full gap-x-2 gap-y-4 tab:gap-y-7 tab:short:gap-y-4 ${partialRow ? 'justify-center' : 'grid-cols-4'}`}
              style={partialRow ? { gridTemplateColumns: `repeat(${page.items.length}, calc((100% - 1.5rem) / 4))` } : undefined}>
              {page.items.map(i => (
                <span key={i.code}
                  className="no-select-callout font-read break-keep text-center text-[26px] font-medium leading-tight tab:text-[38px] lg:text-[44px] lg:short:text-[38px]">
                  {i.text}
                </span>
              ))}
            </div>
          ) : (
            // 넓은 배치(tab)에서는 글자 크기를 이 양식의 가장 긴 줄이 한 줄에 드는 크기로 둔다(최대 26px — 칸 폭의 97%를 그 줄의 폭(em)으로
            // 나눈다. 3%는 반올림·글꼴 차이의 여유). 담당자 테스트(2026-10-22): 26px에서 2학년 2학기 4번 둘째 줄(약 830px)이 PC 화면의 칸
            // (800px)보다 길어 마지막 어절만 셋째 줄로 넘어갔다 — 원문 「한 문장이 한 줄에는 들어오면 좋겠는데」. 맞춘 크기는 양식마다 다르다
            // (2학년 2학기 PC 약 24px·세로 태블릿 20~22px, 1학년 2학기 PC 26px 그대로·세로 태블릿 21~24px). 휴대폰(tab 미만)은 22px
            // 그대로 접힌다 — 한 줄에 넣으면 9px 안팎이 된다.
            // 줄 하나의 폭은 글꼴 실측으로 계산한다(lib/items `sentenceFitEm`) — cqi는 이 칸(@container)의 폭이다
            <p className="no-select-callout font-read whitespace-pre-line break-keep text-center text-[22px] font-medium leading-relaxed tab:[font-size:min(26px,calc(97cqi/var(--fit-em,1)))]"
              style={{ '--fit-em': fitEm } as React.CSSProperties}>
              {page.items[0].text}
            </p>
          )}
        </div>
      </div>

      {/* 항상 마운트된 단일 라이브 리전 — 조건부로 갈아끼우면 스크린리더 낭독이 보장되지 않는다 */}
      <p className="sr-only" aria-live="polite">
        {saved && !recording ? savedMessage : ''}
      </p>

      <div className="mt-6 flex flex-col items-center gap-5 short:mt-3 short:gap-3">
        <RecordButton state={recorder.state} onStart={begin} onStop={recorder.stopByTap} disabled={recorder.starting}
          maxSec={page.limitSec} elapsedMs={recorder.elapsedMs} />
        <p className="text-sm font-bold text-ink-soft">
          {recording ? '다 읽었으면 버튼을 눌러 주세요'
            : saved ? '다 읽었으면 [다음]을, 다시 읽으려면 녹음 버튼을 눌러 주세요' : '버튼을 누르고 읽어 주세요'}
        </p>

        {/* 상태 표시는 버튼 아래 이 고정 높이 슬롯 한 곳에만 나타난다 — 상태가 바뀌어도 버튼이 밀리지 않도록 */}
        <div className="flex min-h-[92px] w-full flex-col items-center justify-start gap-2.5 short:min-h-[64px]">
          {recording ? (
            <>
              <LevelMeter level={recorder.level} />
              <div className="flex items-center gap-2">
                <span className="blip-antpulse motion-reduce:animate-none inline-block h-2 w-2 rounded-full bg-rec" />
                {pastLimit
                  ? <span className="text-[13px] font-bold text-amber">여기까지예요! 버튼을 눌러 주세요</span>
                  : <span className="text-[13px] font-bold text-ink-soft">읽는 중이에요</span>}
              </div>
            </>
          ) : micErr ? (
            <p className="text-center text-sm leading-relaxed text-ink-soft">
              {micErr === 'unsupported'
                ? '이 브라우저에서는 녹음을 지원하지 않아요. Safari나 Chrome 최신 버전에서 다시 시도해 주세요.'
                : micErr === 'denied'
                  ? micPermissionHintHere()
                  : '마이크를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'}
            </p>
          ) : saved && lowVolume ? (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-amber/40 bg-amber/10 px-4 py-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-amber/20 text-amber">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 7v6" /><path d="M12 17h.01" />
                </svg>
              </span>
              <p className="whitespace-pre-line text-sm font-bold text-amber">{savedMessage}</p>
            </div>
          ) : saved ? (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-line bg-well px-4 py-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue/10 text-blue">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 12l5 5L20 6" />
                </svg>
              </span>
              <p className="text-sm text-ink-soft">{savedMessage}</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
