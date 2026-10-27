// components/admin/sheet/Subtotal.tsx — 검사지의 소계 행.
// 종이 검사지와 같이 연한 배경 띠 위에 '의미 __/7 · 무의미 __/7 · 총 __/14'를 둔다.
// 채점 결과가 잘 안 보인다는 피드백에 따라 숫자를 본문보다 크게, 총점은 색으로 강조한다.
import type { ReactNode } from 'react'
import { Badge } from '@/components/Badge'
import { Tip } from '@/components/Tip'
import { VERDICT_LABEL, type Verdict } from '@/lib/scoring'

/** 소계 줄의 판정은 알약이 아니라 색 글자다(사용자 확정 2026-10-27, A안) — 같은 판정이 맨 위 점수 띠(ScoreBand)에 이미
 *  색 상자로 있어, 과제마다 알약을 또 세우면 한 화면에 판정 배지가 여섯이 된다. 색은 VerdictBadge·ScoreBand와 같은 차례다 */
const VERDICT_INK: Record<Verdict, string> = { good: 'text-mint', caution: 'text-amber', risk: 'text-rec-deep' }
const VerdictText = ({ v }: { v: Verdict }) =>
  <span className={`text-[15px] font-bold ${VERDICT_INK[v]}`}>{VERDICT_LABEL[v]}</span>

/** 「채점 전」 설명 — 배지 말풍선과 결과지 범례(ResultSheet)가 같은 문장을 읽는다 */
export const UNSCORED_HELP: ReactNode = <>아직 채점하지 않은 과제예요. <b className="text-rec-deep">0점이 아니에요</b>.
  결과보고서 PDF에도 판정 칸이 비어 나가요.</>

/** 척도는 둘 중 하나다 — 만점이 있는 점수(`12 / 14`), 또는 만점 없이 단위만 있는 값
 *  (문장 읽기유창성의 `17 초`·`21.20 어절/10초`). 둘을 섞어 `2.12 / 36`이 찍히지 않게 유니온으로 둔다. */
type Cell = { label: string; value: number | string } & ({ max: number; unit?: never } | { unit: string; max?: never })

const scaleOf = (c: Cell) => (c.max !== undefined ? ` / ${c.max}` : ` ${c.unit}`)

export function Subtotal({ cells, total, verdict, criterion, complete = true }: {
  /** 의미/무의미·정확 어절/읽은 시간 같은 부분 값. 없으면(문장 쓰기) 총점만 표시한다 */
  cells?: Cell[]
  total: Cell
  verdict?: Verdict
  /** 판정 배지 말풍선에 적을 이 과제의 기준(예: 「주의 12점 이하 · 위험 9점 이하」) */
  criterion?: string
  /** 채점이 끝났는지. false면 숫자를 확정값으로 보이지 않게 하고 판정을 감춘다. */
  complete?: boolean
}) {
  // amber는 경고 전용 — 소계 띠는 중립 배경으로(색이 신호 구실을 하게)
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 border-y border-line bg-well px-4 py-2.5">
      {/* 채점 전에는 부분 점수도 확정값처럼 보이면 안 된다. 총점만 비워 두면 옆의
          '무의미 점수 0 / 7'이 "0점을 받았다"로 읽히는데, 실제로는 아직 채점하지 않은 것이다
          — 이 화면이 가장 경계하는 오독이다. 숫자를 흐리고 '현재'를 붙여 진행 중임을 밝힌다. */}
      {cells?.map(c => (
        <span key={c.label} className={`text-[13px] ${complete ? 'text-ink-soft' : 'text-ink-mute'}`}>
          {!complete && '현재 '}{c.label}{' '}
          <b className={`text-[16px] tabular-nums ${complete ? 'text-ink' : 'text-ink-mute'}`}>{c.value}</b>
          <span className="text-ink-mute">{scaleOf(c)}</span>
        </span>
      ))}
      <span className="text-[14px] font-bold text-ink-soft">
        {total.label}{' '}
        {/* 미채점일 때 '— / 36'처럼 작대기를 세우면 값이 있는 것처럼 읽히고 모양도 어수선하다.
            숫자 자리를 비우고 척도만 알려 준다(만점 또는 단위) — 판정은 옆 배지가 한다. */}
        {complete ? (
          <>
            <b className="text-[20px] tabular-nums text-blue">{total.value}</b>
            <span className="text-ink-mute">{scaleOf(total)}</span>
          </>
        ) : (
          <span className="font-normal text-ink-mute">{total.max !== undefined ? `${total.max}점 만점` : total.unit}</span>
        )}
      </span>
      {/* 배지 우선순위: 채점 전 → 양호·주의·위험 (스펙 "낱말 해독 — …" 절) */}
      {!complete
        ? <Tip tip={UNSCORED_HELP}><Badge tone="mute" size="lg">채점 전</Badge></Tip>
        : verdict && (criterion
          ? <Tip tip={`이 과제의 기준은 ${criterion}예요.`}><VerdictText v={verdict} /></Tip>
          : <VerdictText v={verdict} />)}
    </div>
  )
}
