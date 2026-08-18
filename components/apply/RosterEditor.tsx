// components/apply/RosterEditor.tsx — 명단 업로드 → 고정 4칸 표 → 수정.
// 파일은 여기(브라우저)서 파싱한다 — 서버로 보내지 않는다(명렬표에 주민등록번호가
// 들어 있어도 서버에 도달하지 않게).
// 열 역할 지정 UI가 없다: lib/roster가 알려진 머리글 이름으로만 찾고, 못 찾으면 양식을 안내한다.
// (값 모양으로 추론하면 "반 번호 2"를 성별로 오인한다 — 프로토타입에서 확인.)
'use client'
import { useRef, useState } from 'react'
import { normBirth, toYymmdd } from '@/lib/birth'
import { cutText, parseRosterGrid, type RosterChild } from '@/lib/roster'
import { validChildNo, validName } from '@/lib/validate'
import { readXlsx } from '@/lib/xlsx'

/** 읽을 수 없는 파일 전부에 같은 문구를 쓴다 — 확장자가 틀린 경우와 내용이 깨진 경우를
 *  나눠 안내해도 교사가 할 일은 하나뿐이다(엑셀로 다시 저장). Numbers·한셀 같은 앱별
 *  판별은 넣지 않는다(사용자 확정 2026-08-18: 교사 현장은 윈도우). */
const FILE_ERR = '엑셀 파일(.xlsx)로 저장해서 올려 주세요.'

const cellCls = 'h-10 w-full rounded-lg border-[1.5px] bg-well px-2.5 text-[14px] outline-none transition focus:bg-white'
const okCls = 'border-line focus:border-blue'
const badCls = 'border-rec bg-rec/5 focus:border-rec'

/** 표 한 줄. **문자열로 들고 있는다** — 편집 중간값("2019-05-0", "1"만 친 상태)도 그대로
 *  보여야 하고, 숫자·날짜로 미리 바꾸면 교사가 무엇을 쳤는지 화면에서 사라진다. */
interface Row { id: number; no: string; name: string; gender: string; birth: string }

let seq = 0
const newRow = (r: Partial<Row> = {}): Row =>
  ({ id: seq++, no: '', name: '', gender: '', birth: '', ...r })

const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ')

/** 아직 못 채운 칸 — 라벨은 lib/roster의 `RosterProblem.missing`과 같은 말을 쓴다
 *  (파일에서 온 문제 줄과 화면에서 만든 문제 줄이 다른 말로 불리지 않게). */
function badFields(r: Row): string[] {
  const bad: string[] = []
  if (!validChildNo(Number(r.no)) || r.no.trim() === '') bad.push('번호')
  if (!validName(cleanName(r.name))) bad.push('이름')
  if (r.gender !== '남' && r.gender !== '여') bad.push('성별')
  if (normBirth(r.birth) === null) bad.push('생년월일')
  return bad
}

/** 전부 깨끗할 때만 확정 명단. 한 줄이라도 문제가 있거나 빈 표면 null — 부모의 제출 버튼이
 *  이 값 하나로 잠긴다(명단의 유효성은 이 컴포넌트가 전부 소유한다). */
function confirmOf(rows: Row[]): RosterChild[] | null {
  if (rows.length === 0) return null
  const out: RosterChild[] = []
  for (const r of rows) {
    const iso = normBirth(r.birth)
    if (iso === null || badFields(r).length > 0) return null
    out.push({
      childNo: Number(r.no), name: cleanName(r.name),
      gender: r.gender as '남' | '여', birthYmd: toYymmdd(iso),
    })
  }
  return out
}

export function RosterEditor({ onChange }: {
  /** 오류 없는 확정 명단(제출 가능 상태)일 때만 배열, 아니면 null */
  onChange: (roster: RosterChild[] | null) => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [notice, setNotice] = useState<{ rrnSeen: boolean; missingCols: string[] }>(
    { rrnSeen: false, missingCols: [] })
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /**
   * 표를 바꾸는 **모든** 경로가 이 함수를 지난다 — 그래서 부모 통보를 여기서 한 번 하면 된다.
   * useEffect로 보고하지 않는 이유: onChange는 부모가 매 렌더 새로 만드는 함수일 수 있어
   * 의존성에 넣으면 setState→렌더→effect→setState 루프가 되고, 빼면 lint가 막거나 stale
   * 클로저가 남는다. 직렬화 키로 우회할 수도 있지만 그건 "언제 다시 알릴지"를 손으로
   * 관리하는 일이다. 변경 지점이 한 곳뿐인 상태에서는 그 장치가 전부 불필요하다.
   */
  function commit(next: Row[]) {
    setRows(next)
    onChange(confirmOf(next))
  }

  const patch = (id: number, part: Partial<Row>) =>
    commit(rows.map(r => (r.id === id ? { ...r, ...part } : r)))

  async function load(file: File) {
    setErr('')
    const name = file.name.toLowerCase()
    try {
      const grid = name.endsWith('.xlsx') ? await readXlsx(await file.arrayBuffer())
        : name.endsWith('.csv') ? cutText(await file.text())
          : null
      if (!grid) { setErr(FILE_ERR); return }
      const parsed = parseRosterGrid(grid)
      if ('error' in parsed) { setErr(parsed.error); return }
      setNotice({ rrnSeen: parsed.rrnSeen, missingCols: parsed.missingCols })
      // 문제 줄은 표 아래쪽에 모은다 — 고칠 것이 한 덩어리로 보인다.
      // ⚠️ RosterProblem은 번호·이름만 들고 오므로(lib/roster) 성별·생년월일 칸이 하나라도
      // 잘못된 줄은 그 줄의 **나머지 두 칸도 빈칸으로** 다시 채워야 한다. 파일의 원문
      // 값을 화면에 남기려면 lib/roster가 원문을 함께 돌려줘야 한다.
      commit([
        ...parsed.children.map(c => newRow({
          no: String(c.childNo), name: c.name, gender: c.gender,
          birth: normBirth(c.birthYmd) ?? '',
        })),
        ...parsed.problems.map(p => newRow({
          no: p.childNo === null ? '' : String(p.childNo), name: p.name,
        })),
      ])
    } catch {
      setErr(FILE_ERR)
    }
  }

  const ready = rows.filter(r => badFields(r).length === 0).length
  const broken = rows.length - ready

  return (
    <div>
      {/* 업로드 상자 — 클릭·드래그 둘 다 받는다(교사 PC는 파일 탐색기에서 끌어오는 쪽이 빠르다) */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault(); setDrag(false)
          const f = e.dataTransfer.files[0]
          if (f) void load(f)
        }}
        className={`rounded-xl border-[1.5px] border-dashed p-5 text-center transition ${
          drag ? 'border-blue bg-blue/5' : 'border-line bg-well'}`}>
        <p className="text-[13px] font-bold text-ink-soft">명단 파일을 올려 주세요</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">
          나이스 명렬표나 배포된 양식(.xlsx)을 그대로 올리시면 돼요.<br />
          파일은 이 화면에서만 읽고 서버로 보내지 않아요.
        </p>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = '' }} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="btn-ghost mx-auto mt-3 h-9 px-4 text-[13px]">
          파일 선택
        </button>
      </div>

      {err && <p role="alert" className="mt-3 text-sm text-rec-deep">{err}</p>}

      {notice.rrnSeen && (
        <p className="mt-3 rounded-lg border border-mint/40 bg-mint/5 px-3 py-2 text-[12.5px] text-mint">
          주민등록번호는 저장하지 않았습니다.
        </p>
      )}
      {notice.missingCols.length > 0 && (
        <p className="mt-2 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-[12.5px] text-amber">
          {notice.missingCols.join('·')}이 파일에 없어 직접 채워 주세요.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-bold text-ink-soft">
              {ready}명 준비됨
              {broken > 0 && <span className="text-rec-deep"> · {broken}줄 확인 필요</span>}
            </p>
            <button type="button" onClick={() => { setNotice({ rrnSeen: false, missingCols: [] }); setErr(''); commit([]) }}
              className="btn-ghost ml-auto h-8 px-3 text-xs">
              전부 비우기
            </button>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-mute">
                  {['번호', '이름', '성별', '생년월일', ''].map(h => (
                    <th key={h} scope="col" className="whitespace-nowrap px-1 py-1.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const bad = badFields(r)
                  const has = (f: string) => bad.includes(f)
                  // 생년월일 칸은 값이 정규화될 때만 type="date"다. type="date"는 형식이 어긋난
                  // 값을 아예 표시하지 못하므로(브라우저가 빈칸으로 만든다), 파일에서 온 잘못된
                  // 값을 date로 넣으면 조용히 사라져 교사가 무엇이 틀렸는지 볼 수 없다.
                  // 그래서 못 읽는 동안은 text로 보여주고, 읽히는 순간 date로 되돌린다.
                  const iso = normBirth(r.birth)
                  return (
                    <tr key={r.id} className="border-t border-line/60">
                      <td className="px-1 py-1">
                        <input value={r.no} maxLength={2} inputMode="numeric" aria-label={`${i + 1}번째 줄 번호`}
                          aria-invalid={has('번호')}
                          onChange={e => patch(r.id, { no: e.target.value.replace(/\D/g, '') })}
                          className={`${cellCls} w-14 ${has('번호') ? badCls : okCls}`} />
                      </td>
                      <td className="px-1 py-1">
                        <input value={r.name} maxLength={30} aria-label={`${i + 1}번째 줄 이름`}
                          aria-invalid={has('이름')}
                          onChange={e => patch(r.id, { name: e.target.value })}
                          className={`${cellCls} w-28 ${has('이름') ? badCls : okCls}`} />
                      </td>
                      <td className="px-1 py-1">
                        {/* 성별은 select — 잘못된 값을 타이핑할 길 자체를 없앤다 */}
                        <select value={r.gender} aria-label={`${i + 1}번째 줄 성별`} aria-invalid={has('성별')}
                          onChange={e => patch(r.id, { gender: e.target.value })}
                          className={`${cellCls} w-20 ${has('성별') ? badCls : okCls}`}>
                          <option value="">—</option>
                          <option value="남">남</option>
                          <option value="여">여</option>
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <input type={iso ? 'date' : 'text'} value={iso ?? r.birth}
                          aria-label={`${i + 1}번째 줄 생년월일`} aria-invalid={has('생년월일')}
                          placeholder="2019-05-09"
                          onChange={e => {
                            // 읽히는 즉시 YYYY-MM-DD로 바꿔 담는다 — date로 전환된 칸이
                            // "19-5-9" 같은 원문을 들고 있으면 빈칸으로 보인다.
                            const v = e.target.value
                            patch(r.id, { birth: normBirth(v) ?? v })
                          }}
                          className={`${cellCls} w-36 ${has('생년월일') ? badCls : okCls}`} />
                      </td>
                      <td className="px-1 py-1 text-right">
                        <button type="button" aria-label={`${i + 1}번째 줄 삭제`}
                          onClick={() => commit(rows.filter(x => x.id !== r.id))}
                          className="rounded-lg border-[1.5px] border-line bg-white px-2.5 py-1 text-xs font-bold text-ink-mute transition hover:border-rec hover:text-rec-deep">
                          삭제
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {broken > 0 && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-rec-deep">
              붉게 표시된 칸을 채워 주세요. 파일에서 읽지 못한 줄은 표 아래쪽에 모여 있어요.
            </p>
          )}
        </>
      )}

      <button type="button" onClick={() => commit([...rows, newRow()])}
        className="btn-ghost mt-3 h-9 px-4 text-[13px]">
        줄 추가
      </button>
    </div>
  )
}
