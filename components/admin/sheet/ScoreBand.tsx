// components/admin/sheet/ScoreBand.tsx — 결과지 상단 총평 밴드.
// 과제별 점수·Pass/Fail을 큰 숫자로 한 줄에 모아, 스크롤 없이 결론이 보이게 한다.
import {
  FLUENCY_UNIT, TASK_KEYS, fluencyLabel, readSecLabel, scoringFor,
  type FormScoring, type ScoreResult, type TaskKey,
} from '@/lib/scoring'
import { SECTION_LABEL, itemsFor } from '@/lib/items'
import type { SurveyForm } from '@/lib/forms'

/** 과제 한 칸의 표기. 개수형은 「12 / 14」, 문장 읽기유창성은 만점이 없는 비율이라 「2.12 어절/초」다
 *  (lib/scoring `CountTaskKey` 주석) — 척도가 섞여 「2.12 / 36」이 찍히지 않게 여기서 갈라 둔다. */
function display(key: TaskKey, r: ScoreResult, sc: FormScoring) {
  if (key === 'sentenceReading') return {
    value: fluencyLabel(r.sentenceReading),
    unit: FLUENCY_UNIT,
    /** 채점 전 칸의 척도 자리 */
    scale: FLUENCY_UNIT,
    criterion: `기준 ${fluencyLabel(sc.passMark.sentenceReading)} ${FLUENCY_UNIT} 이상`,
    started: r.sentenceWords > 0 || r.sentenceSec > 0,
    progress: `현재 ${r.sentenceWords}어절 · ${readSecLabel(r.sentenceSec)}초 · 남은 문장 채점 필요`,
  }
  const value = key === 'wordReading' ? r.wordReading : r.writing
  return {
    value: String(value),
    unit: `/ ${sc.taskMax[key]}`,
    scale: `${sc.taskMax[key]}점 만점`,
    criterion: `기준 ${sc.passMark[key]}점 이상`,
    started: value > 0,
    progress: `현재 ${value}점 · 남은 문항 채점 필요`,
  }
}

export function ScoreBand({ form, result }: { form: SurveyForm; result: ScoreResult }) {
  const sc = scoringFor(form)
  // 쓰기 과제의 이름은 학년마다 다르다(낱말 쓰기 / 문장 쓰기).
  const label: Record<TaskKey, string> = {
    wordReading: SECTION_LABEL.word_reading,
    sentenceReading: SECTION_LABEL.sentence_reading,
    writing: SECTION_LABEL[itemsFor(form).writingSection],
  }
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-3">
      {TASK_KEYS.map(key => {
        const d = display(key, result, sc)
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
              <span className="ml-auto text-[13px] text-ink-mute">{d.scale}</span>
            </p>
            <p className="mt-1.5 text-[12px] text-ink-mute">
              {d.started ? d.progress : '아직 채점하지 않았습니다'}
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
                {d.value}
              </b>
              <span className="text-[15px] text-ink-mute">{d.unit}</span>
              <span className={`ml-auto text-[13px] font-bold ${pass ? 'text-mint' : 'text-rec-deep'}`}>
                {pass ? 'Pass' : 'Fail'}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-ink-mute">{d.criterion}</p>
          </div>
        )
      })}
    </div>
  )
}
