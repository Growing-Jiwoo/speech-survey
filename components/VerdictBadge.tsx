// components/VerdictBadge.tsx — 판정(양호·주의·위험) 배지. 관리자 결과지와 교사 결과지가 같은 색을 쓴다
// (양호=mint · 주의=amber · 위험=rec — 결과보고서 PDF의 초록·주황·빨강과 같은 차례).
import { Badge, type BadgeTone } from '@/components/Badge'
import { VERDICT_LABEL, type Verdict } from '@/lib/scoring'

export const VERDICT_TONE: Record<Verdict, BadgeTone> = { good: 'mint', caution: 'amber', risk: 'rec' }

export function VerdictBadge({ v, size }: { v: Verdict; size?: 'sm' | 'md' | 'lg' }) {
  return <Badge tone={VERDICT_TONE[v]} size={size}>{VERDICT_LABEL[v]}</Badge>
}
