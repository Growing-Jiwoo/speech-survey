// components/admin/sheet/Subtotal.tsx — 검사지의 소계 행.
// 종이 검사지와 같이 연한 배경 띠 위에 '의미 __/7 · 무의미 __/7 · 총 __/14'를 둔다.
// 채점 결과가 잘 안 보인다는 피드백에 따라 숫자를 본문보다 크게, 총점은 색으로 강조한다.
import { Badge } from '@/components/Badge'
import type { Verdict } from '@/lib/scoring'

interface Cell {
  label: string; value: number; max: number
  /** 중단 규칙으로 실시하지 않은 부분 — 숫자 대신 '미실시'. 0점으로 보이면 안 된다 */
  na?: boolean
}

export function Subtotal({ cells, total, verdict, complete = true, discontinued = false }: {
  /** 의미/무의미 같은 부분 점수. 없으면(문장) 총점만 표시한다 */
  cells?: Cell[]
  total: Cell
  verdict?: Verdict
  /** 채점이 끝났는지. false면 숫자를 확정값으로 보이지 않게 하고 판정을 감춘다. */
  complete?: boolean
  /** 중단 규칙이 걸린 과제 — Pass/Fail 대신 '중단'. passMark는 전체 실시 전제라
   *  부분 실시 점수에 들이대면 판정 근거가 성립하지 않는다(스펙 참고). */
  discontinued?: boolean
}) {
  // amber는 경고 전용 — 소계 띠는 중립 배경으로(색이 신호 구실을 하게)
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 border-y border-line bg-well px-4 py-2.5">
      {/* 채점 전에는 부분 점수도 확정값처럼 보이면 안 된다. 총점만 비워 두면 옆의
          '무의미 점수 0 / 7'이 "0점을 받았다"로 읽히는데, 실제로는 아직 채점하지 않은 것이다
          — 이 화면이 가장 경계하는 오독이다. 숫자를 흐리고 '현재'를 붙여 진행 중임을 밝힌다. */}
      {cells?.map(c => c.na ? (
        <span key={c.label} className="text-[13px] text-ink-mute">
          {c.label} <b className="text-[14px]">미실시</b>
        </span>
      ) : (
        <span key={c.label} className={`text-[13px] ${complete ? 'text-ink-soft' : 'text-ink-mute'}`}>
          {!complete && '현재 '}{c.label}{' '}
          <b className={`text-[16px] tabular-nums ${complete ? 'text-ink' : 'text-ink-mute'}`}>{c.value}</b>
          <span className="text-ink-mute"> / {c.max}</span>
        </span>
      ))}
      <span className="text-[14px] font-bold text-ink-soft">
        {total.label}{' '}
        {/* 미채점일 때 '— / 36'처럼 작대기를 세우면 값이 있는 것처럼 읽히고 모양도 어수선하다.
            숫자 자리를 비우고 척도만 알려 준다 — 판정은 옆 배지가 한다. */}
        {complete ? (
          <>
            <b className="text-[20px] tabular-nums text-blue">{total.value}</b>
            <span className="text-ink-mute"> / {total.max}</span>
          </>
        ) : (
          <span className="font-normal text-ink-mute">{total.max}점 만점</span>
        )}
      </span>
      {/* 배지 우선순위: 중단 → 채점 전 → Pass/Fail (스펙 "낱말 해독 — …" 절) */}
      {discontinued
        ? <Badge tone="mute" size="lg">중단</Badge>
        : !complete
          ? <Badge tone="mute" size="lg">채점 전</Badge>
          : verdict && (verdict === 'pass'
            ? <Badge tone="mint" size="lg">Pass</Badge>
            : <Badge tone="rec" size="lg">Fail</Badge>)}
    </div>
  )
}
