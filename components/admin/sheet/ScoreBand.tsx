// components/admin/sheet/ScoreBand.tsx — 결과지 상단 총평 밴드.
// 과제별 점수·Pass/Fail을 큰 숫자로 한 줄에 모아, 스크롤 없이 결론이 보이게 한다.
import { TASK_KEYS, scoringFor, type ScoreResult, type TaskKey } from '@/lib/scoring'
import { SECTION_LABEL, itemsFor } from '@/lib/items'
import type { SurveyForm } from '@/lib/forms'

const VALUE: Record<TaskKey, (r: ScoreResult) => number> = {
  wordReading: r => r.wordReading,
  sentenceReading: r => r.sentenceReading,
  writing: r => r.writing,
}

export function ScoreBand({ form, result }: { form: SurveyForm; result: ScoreResult }) {
  const { taskMax, passMark } = scoringFor(form)
  // 쓰기 과제의 이름은 학년마다 다르다(낱말 쓰기 / 문장 쓰기).
  const label: Record<TaskKey, string> = {
    wordReading: SECTION_LABEL.word_reading,
    sentenceReading: SECTION_LABEL.sentence_reading,
    writing: SECTION_LABEL[itemsFor(form).writingSection],
  }
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-3">
      {TASK_KEYS.map(key => {
        const value = VALUE[key](result)
        const done = result.complete[key]
        const pass = result.verdict[key] === 'pass'
        // 채점이 끝나지 않은 과제는 판정을 내지 않는다 — 아직 채점 전인 과제까지
        // 0점 Fail로 보이면, 치르지도 않은 과제에서 낙제한 것처럼 읽힌다.
        if (!done) return (
          <div key={key} className="rounded-xl border-[1.5px] border-line bg-well px-4 py-3">
            <p className="text-[13px] font-bold text-ink-mute">{label[key]}</p>
            {/* 큰 '—'는 값이 있는 것처럼 읽히고 모양도 어수선하다 — 상태를 글자로 쓴다. */}
            <p className="mt-1 flex items-baseline gap-2">
              <b className="text-[22px] leading-none text-ink-mute">채점 전</b>
              <span className="ml-auto text-[13px] text-ink-mute">{taskMax[key]}점 만점</span>
            </p>
            <p className="mt-1.5 text-[12px] text-ink-mute">
              {value > 0 ? `현재 ${value}점 · 남은 문항 채점 필요` : '아직 채점하지 않았습니다'}
            </p>
          </div>
        )
        return (
          <div key={key}
            className={`rounded-xl border-[1.5px] px-4 py-3 ${
              pass ? 'border-mint/50 bg-mint/5' : 'border-rec/50 bg-rec/5'}`}>
            <p className="text-[13px] font-bold text-ink-mute">{label[key]}</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <b className={`text-[30px] leading-none tabular-nums ${pass ? 'text-mint' : 'text-rec-deep'}`}>
                {value}
              </b>
              <span className="text-[15px] text-ink-mute">/ {taskMax[key]}</span>
              <span className={`ml-auto text-[13px] font-bold ${pass ? 'text-mint' : 'text-rec-deep'}`}>
                {pass ? 'Pass' : 'Fail'}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-ink-mute">기준 {passMark[key]}점 이상</p>
          </div>
        )
      })}
    </div>
  )
}
