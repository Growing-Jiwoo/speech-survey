// components/admin/StatusBadge.tsx — 검사 상태 표시 3단계. 검사 목록(SessionTable)과 결과지 머리글(ResultSheet)이
// 같이 쓴다 — 같은 검사를 두 화면이 다르게 말하지 않게 한 곳에 둔다.
// 설명 문장도 여기 한 벌이다 — 말풍선과 목록 범례가 같은 문장을 읽는다(한쪽만 고쳐 말이 갈리지 않게).
//
// 색은 「제출 · 미완료 있음」(amber)에만 쓴다. 「제출 완료」·「진행 중」은 회색 알약이다(사용자 확정 2026-10-27) —
// 「제출 완료」가 초록이던 때는 거의 모든 행에서 바로 옆 「양호」 알약과 같은 색으로 줄마다 서서, 정작 봐야 할
// 「위험」·「미완료」가 묻혔다. 초록·주황·빨강은 판정(양호·주의·위험)과 손볼 것에만 남긴다.
import { Badge } from '@/components/Badge'
import { Tip } from '@/components/Tip'

const STATUS = {
  progress: { label: '진행 중', help: '아직 제출하지 않은 검사예요.' },
  incomplete: { label: '제출 · 미완료 있음', help: '제출했지만 녹음이나 쓰기가 비어 있어요.' },
  complete: { label: '제출 완료', help: '받아야 할 녹음·쓰기를 다 받았어요.' },
} as const

type StatusKey = keyof typeof STATUS

const mark = (k: StatusKey) => <Badge tone={k === 'incomplete' ? 'amber' : 'mute'}>{STATUS[k].label}</Badge>

/** 범례 항목(표시 + 설명) — 범례의 표시에는 말풍선을 달지 않는다(설명이 바로 옆에 있다) */
export const STATUS_LEGEND = (['progress', 'incomplete', 'complete'] as const)
  .map(k => ({ badge: mark(k), desc: STATUS[k].help }))

/** 제출 · 미완료 있음(amber 알약) / 제출 완료·진행 중(회색 알약). 마우스를 올리면 뜻을 말풍선으로 보인다 */
export function StatusBadge({ submitted, incomplete, tabbable }: {
  submitted: boolean; incomplete: boolean
  /** 목록 행 안에서는 Tab 정지를 끈다(Tip 주석) */
  tabbable?: boolean
}) {
  const k: StatusKey = !submitted ? 'progress' : incomplete ? 'incomplete' : 'complete'
  return <Tip tip={STATUS[k].help} tabbable={tabbable}>{mark(k)}</Tip>
}
