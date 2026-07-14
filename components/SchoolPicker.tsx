'use client'
import { useEffect, useState } from 'react'
import type { RegionInfo, School } from '@/lib/schools'

export interface SelectedSchool { region: string; schoolId: string; schoolName: string }

const MAX_SHOWN = 30

/** 지역(교육청) 선택 → 해당 지역 학교를 키 입력마다 필터링해 선택 */
export function SchoolPicker({ value, onSelect }: {
  value: SelectedSchool | null
  onSelect: (s: SelectedSchool | null) => void
}) {
  const [regions, setRegions] = useState<(RegionInfo & { count: number })[]>([])
  const [slug, setSlug] = useState('')
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/schools/index.json').then(r => r.json()).then(setRegions)
      .catch(() => setErr('학교 목록을 불러오지 못했어요. 새로고침해 주세요.'))
  }, [])

  useEffect(() => {
    if (!slug) return
    setLoading(true); setSchools([]); setQ(''); setErr('')
    fetch(`/schools/${slug}.json`).then(r => r.json()).then(setSchools)
      .catch(() => setErr('학교 목록을 불러오지 못했어요. 지역을 다시 선택해 주세요.'))
      .finally(() => setLoading(false))
  }, [slug])

  const region = regions.find(r => r.slug === slug)

  if (value) return (
    <div className="mt-1.5 flex h-[50px] items-center justify-between rounded-xl border-[1.5px] border-blue bg-blue/5 px-4">
      <span className="text-[15px] font-bold text-blue">{value.schoolName}</span>
      <button type="button" className="text-xs text-ink-mute underline"
        onClick={() => { onSelect(null); setQ('') }}>
        다시 선택
      </button>
    </div>
  )

  const keyword = q.trim()
  const filtered = keyword ? schools.filter(s => s.name.includes(keyword)) : schools
  const shown = filtered.slice(0, MAX_SHOWN)

  return (
    <div className="mt-1.5">
      <select aria-label="지역 선택" value={slug} onChange={e => setSlug(e.target.value)}
        className="h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-3 text-base outline-none focus:border-blue">
        <option value="">지역을 선택해 주세요</option>
        {regions.map(r => <option key={r.slug} value={r.slug}>{r.short} ({r.count}개교)</option>)}
      </select>

      {slug && (
        <div className="mt-2">
          <input aria-label="학교 검색" value={q} onChange={e => setQ(e.target.value)}
            placeholder="학교 이름을 입력해 주세요"
            className="h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none focus:border-blue" />
          {loading && <p className="mt-2 text-xs text-ink-mute">불러오는 중…</p>}
          {!loading && schools.length > 0 && (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line">
              {shown.map(s => (
                <li key={s.id}>
                  <button type="button"
                    onClick={() => region && onSelect({ region: region.name, schoolId: s.id, schoolName: s.name })}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-well">
                    <span className="font-bold">{s.name}</span>
                    <span className="text-xs text-ink-mute">{s.addr}</span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-4 py-3 text-sm text-ink-mute">검색 결과가 없어요.</li>}
              {filtered.length > MAX_SHOWN &&
                <li className="px-4 py-2 text-xs text-ink-mute">{filtered.length - MAX_SHOWN}개 더 있어요 — 이름을 더 입력해 주세요.</li>}
            </ul>
          )}
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-sm text-rec-deep">{err}</p>}
    </div>
  )
}
