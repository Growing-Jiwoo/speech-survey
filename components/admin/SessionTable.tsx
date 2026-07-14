'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { SessionListRow } from '@/lib/db'

type Status = 'all' | 'submitted' | 'inProgress'
const STATUS_TABS: { key: Status; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'submitted', label: '제출' },
  { key: 'inProgress', label: '진행 중' },
]

/** 관리자 세션 목록 — 이름/학교 검색 + 제출 상태 필터 (클라이언트 필터링) */
export function SessionTable({ sessions, totalRec, totalWrite }: {
  sessions: SessionListRow[]; totalRec: number; totalWrite: number
}) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status>('all')

  const keyword = q.trim()
  const filtered = sessions.filter(s => {
    if (status === 'submitted' && !s.submitted_at) return false
    if (status === 'inProgress' && s.submitted_at) return false
    if (keyword && !s.child_name.includes(keyword) && !s.school_name.includes(keyword)) return false
    return true
  })

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 또는 학교 검색"
          className="h-10 w-56 rounded-xl border-[1.5px] border-line bg-well px-3.5 text-sm outline-none transition focus:border-blue" />
        <div className="flex gap-1.5">
          {STATUS_TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setStatus(t.key)} aria-pressed={status === t.key}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                status === t.key ? 'bg-blue text-white' : 'bg-well text-ink-soft'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {(keyword || status !== 'all') && (
          <span className="ml-auto text-xs text-ink-mute">{filtered.length}건 표시</span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-mute">
            <th scope="col" className="px-5 py-3 font-medium">이름</th>
            <th scope="col" className="font-medium">학교</th>
            <th scope="col" className="font-medium">학년/반</th>
            <th scope="col" className="font-medium">생년월일</th>
            <th scope="col" className="font-medium">시작</th>
            <th scope="col" className="font-medium">녹음</th>
            <th scope="col" className="font-medium">쓰기</th>
            <th scope="col" className="font-medium">체크</th>
            <th scope="col" className="pr-5 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(s => {
            const recorded = new Set(s.recordings.map(r => r.item_code)).size
            const written = s.writing_answers.length
            const incomplete = recorded < totalRec || written < totalWrite
            return (
              <tr key={s.id} className="border-t border-line/60 hover:bg-well">
                <td className="px-5 py-3">
                  <Link href={`/admin/${s.id}`} className="font-bold text-blue">{s.child_name}</Link>
                </td>
                <td>{s.school_name}</td>
                <td>{s.grade}-{s.class_no}</td>
                <td className="text-ink-soft">{s.birth_ymd}</td>
                <td className="text-ink-soft">{new Date(s.started_at).toLocaleString('ko-KR')}</td>
                <td className={`font-read ${recorded < totalRec ? 'font-bold text-rec-deep' : ''}`}>
                  {recorded} / {totalRec}
                </td>
                <td className={`font-read ${written < totalWrite ? 'font-bold text-rec-deep' : ''}`}>
                  {written} / {totalWrite}
                </td>
                <td>
                  {s.checklist.length > 0
                    ? <span className="rounded-full bg-amber/10 px-2.5 py-0.5 text-xs font-bold text-amber">{s.checklist.length}개 영역</span>
                    : <span className="text-xs text-ink-mute">—</span>}
                </td>
                <td className="pr-5">
                  {s.submitted_at
                    ? <span className="whitespace-nowrap rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint">제출{incomplete ? ' · 미완료 있음' : ''}</span>
                    : <span className="whitespace-nowrap rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">진행 중</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {filtered.length === 0 && (
        <p className="p-8 text-center text-sm text-ink-mute">
          {sessions.length === 0 ? '아직 참여한 세션이 없습니다.' : '조건에 맞는 세션이 없습니다.'}
        </p>
      )}
    </>
  )
}
