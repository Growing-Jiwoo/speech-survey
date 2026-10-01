// components/admin/StatusBadge.tsx — 검사 상태 배지 3단계. 검사 목록(SessionTable)과 결과지 머리글(ResultSheet)이
// 같이 쓴다 — 같은 검사를 두 화면이 다르게 말하지 않게 한 곳에 둔다.
import { Badge } from '@/components/Badge'

/** 제출 완료(mint) / 제출·미완료 있음(amber) / 진행 중(회색) */
export function StatusBadge({ submitted, incomplete }: { submitted: boolean; incomplete: boolean }) {
  if (!submitted) return <Badge tone="mute">진행 중</Badge>
  if (incomplete) return <Badge tone="amber">제출 · 미완료 있음</Badge>
  return <Badge tone="mint">제출 완료</Badge>
}
