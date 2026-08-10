// components/admin/sheet/ScoreBand.tsx — 결과지 상단 총평 밴드.
// 과제별 점수·Pass/Fail을 큰 숫자로 한 줄에 모아, 스크롤 없이 결론이 보이게 한다.
import { PASS_MARK, TASK_MAX, type ScoreResult, type TaskKey } from '@/lib/scoring'

const TASKS: { key: TaskKey; label: string; get: (r: ScoreResult) => number }[] = [
  { key: 'wordReading', label: '낱말 해독', get: r => r.wordReading },
  { key: 'sentenceReading', label: '문장 읽기유창성', get: r => r.sentenceReading },
  { key: 'wordWriting', label: '낱말 쓰기', get: r => r.wordWriting },
]

export function ScoreBand({ result }: { result: ScoreResult }) {
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-3">
      {TASKS.map(t => {
        const value = t.get(result)
        const done = result.complete[t.key]
        const pass = result.verdict[t.key] === 'pass'
        // 채점이 끝나지 않은 과제는 판정을 내지 않는다 — 실시하지 않았거나 채점 전인 과제까지
        // 0점 Fail로 보이면, 치르지도 않은 과제에서 낙제한 것처럼 읽힌다.
        if (!done) return (
          <div key={t.key} className="rounded-xl border-[1.5px] border-line bg-well px-4 py-3">
            <p className="text-[11.5px] font-bold text-ink-mute">{t.label}</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <b className="text-[30px] leading-none text-ink-mute">—</b>
              <span className="text-[15px] text-ink-mute">/ {TASK_MAX[t.key]}</span>
              <span className="ml-auto text-[13px] font-bold text-ink-mute">채점 전</span>
            </p>
            <p className="mt-1 text-[10.5px] text-ink-mute">
              {value > 0 ? `현재 ${value}점 · 남은 문항 채점 필요` : '실시하지 않았거나 채점 전'}
            </p>
          </div>
        )
        return (
          <div key={t.key}
            className={`rounded-xl border-[1.5px] px-4 py-3 ${
              pass ? 'border-mint/50 bg-mint/5' : 'border-rec/50 bg-rec/5'}`}>
            <p className="text-[11.5px] font-bold text-ink-mute">{t.label}</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <b className={`text-[30px] leading-none tabular-nums ${pass ? 'text-mint' : 'text-rec-deep'}`}>
                {value}
              </b>
              <span className="text-[15px] text-ink-mute">/ {TASK_MAX[t.key]}</span>
              <span className={`ml-auto text-[13px] font-bold ${pass ? 'text-mint' : 'text-rec-deep'}`}>
                {pass ? 'Pass' : 'Fail'}
              </span>
            </p>
            <p className="mt-1 text-[10.5px] text-ink-mute">기준 {PASS_MARK[t.key]}점 이상</p>
          </div>
        )
      })}
    </div>
  )
}
