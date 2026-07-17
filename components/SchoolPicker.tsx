'use client'
import { useEffect, useState } from 'react'
import { Select } from '@/components/Select'
import { Spinner } from '@/components/Spinner'
import { fetchJson } from '@/lib/http'
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
    let ignore = false
    fetchJson<(RegionInfo & { count: number })[]>('/schools/index.json')
      .then(data => { if (!ignore) setRegions(data) })
      .catch(() => { if (!ignore) setErr('학교 목록을 불러오지 못했어요. 새로고침해 주세요.') })
    return () => { ignore = true }
  }, [])

  // 지역 변경 시 검색어·목록 리셋은 selectRegion(이벤트 핸들러)에서 수행하고,
  // 이 effect는 해당 지역 학교 목록 fetch만 담당한다(경쟁 상태는 ignore 플래그로 차단).
  useEffect(() => {
    if (!slug) return
    let ignore = false
    fetchJson<School[]>(`/schools/${slug}.json`)
      .then(data => { if (!ignore) setSchools(data) })
      .catch(() => { if (!ignore) setErr('학교 목록을 불러오지 못했어요. 지역을 다시 선택해 주세요.') })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [slug])

  function selectRegion(nextSlug: string) {
    if (nextSlug === slug) return // 같은 지역 재선택: fetch effect가 재실행되지 않으므로 리셋도 하지 않는다
    setSlug(nextSlug)
    setLoading(true); setSchools([]); setQ(''); setErr('')
  }

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
      <Select ariaLabel="지역 선택" placeholder="지역을 선택해 주세요" value={slug} onChange={selectRegion}
        options={regions.map(r => ({ value: r.slug, label: `${r.short} (${r.count}개교)` }))} />

      {slug && (
        <div className="mt-2">
          <input aria-label="학교 검색" value={q} onChange={e => setQ(e.target.value)}
            placeholder="학교 이름을 입력해 주세요"
            className="h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none focus:border-blue" />
          {/* 학교 목록 로딩은 목록 영역 인라인 스피너로 표시(전체 화면 dim은 과한 피드백) */}
          {loading && (
            <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-line py-6 text-sm text-ink-mute">
              <Spinner className="h-4 w-4" /> 학교 목록을 불러오는 중…
            </div>
          )}
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
