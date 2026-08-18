// lib/roster.ts — 업로드된 명단(그리드)을 검증된 아동 목록으로 바꾼다. 순수 함수만 둔다.
// 열 역할을 짐작하지 않는다 — 알려진 머리글 이름만 찾고, 못 찾으면 거부한다.
// (값 모양으로 추론하는 방식은 "반 번호 2"를 성별로 오인했다 — 프로토타입에서 확인.
//  자유도를 열면 실패 케이스마다 배포가 필요해진다. 스펙 "고정 4칸" 절.)
import { normBirth, toYymmdd } from './birth'
import { NAME_RE } from './schema'

export interface RosterChild {
  childNo: number
  name: string
  gender: '남' | '여'
  birthYmd: string          // YYMMDD — sessions.birth_ymd와 같은 형식
}

/** 읽었지만 완성되지 못한 행 — 화면이 붉게 표시하고 교사가 채운다. */
export interface RosterProblem {
  childNo: number | null
  name: string
  missing: string[]         // '번호' | '이름' | '성별' | '생년월일'
}

export interface ParsedRoster {
  children: RosterChild[]
  problems: RosterProblem[]
  /** 파일 어딘가에 주민등록번호가 있었다 — 저장은 안 했지만 안내는 띄운다 */
  rrnSeen: boolean
  /** 파일에 아예 없던 열 — "직접 채워 주세요" 안내용 */
  missingCols: string[]
}

const COL_LABEL = { childNo: '번호', name: '이름', gender: '성별', birthYmd: '생년월일' } as const

/** 알려진 머리글 이름. 나이스 명렬표(반·번호·성명·성별·생년월일·비고)와 배포 양식이 이 이름을 쓴다. */
const HEADERS: Record<keyof typeof COL_LABEL, string[]> = {
  childNo: ['번호', '출석번호', 'no', 'no.'],
  name: ['성명', '이름', '학생명'],
  gender: ['성별'],
  birthYmd: ['생년월일', '생일'],
}
const BANNED = ['주민등록번호', '주민번호', '외국인등록번호']
const RRN = /\d{6}\s*[-–]\s*\d{7}/
const HEAD_SCAN_ROWS = 8    // 제목·안내 문구가 이 안에 있다(나이스 1줄·배포 양식 5줄)

const key = (s: string) => s.trim().toLowerCase().replace(/\s|\(.*?\)|\./g, '')

const toGender = (v: string): '남' | '여' | null => {
  if (/^(남|남자|m|male|1)$/i.test(v.trim())) return '남'
  if (/^(여|여자|f|female|2)$/i.test(v.trim())) return '여'
  return null
}
const toNo = (v: string): number | null => {
  const d = v.replace(/\D/g, '')
  if (!d) return null
  const n = Number(d)
  return n >= 1 && n <= 99 ? n : null
}

export function parseRosterGrid(grid: string[][]): ParsedRoster | { error: string } {
  // 머리글 행 찾기 — 번호·이름 열이 둘 다 있는 첫 줄
  let headRow = -1
  const col: Partial<Record<keyof typeof COL_LABEL, number>> = {}
  for (let i = 0; i < Math.min(grid.length, HEAD_SCAN_ROWS); i++) {
    const cells = grid[i].map(key)
    const found: typeof col = {}
    for (const [field, names] of Object.entries(HEADERS) as [keyof typeof COL_LABEL, string[]][]) {
      const at = cells.findIndex(c => names.includes(c))
      if (at >= 0) found[field] = at
    }
    if (found.childNo !== undefined && found.name !== undefined) {
      headRow = i
      Object.assign(col, found)
      break
    }
  }
  if (headRow < 0)
    return { error: '번호·이름 머리글을 찾지 못했어요. 나이스 명렬표나 배포된 양식 파일인지 확인해 주세요.' }

  // 금지 열(주민번호)은 머리글 이름으로 아예 읽지 않는다 — 1차 차단
  const bannedCols = new Set(
    grid[headRow].map((c, i) => (BANNED.some(b => key(c).includes(key(b))) ? i : -1)).filter(i => i >= 0))

  const missingCols = (['gender', 'birthYmd'] as const)
    .filter(f => col[f] === undefined).map(f => COL_LABEL[f])

  const children: RosterChild[] = []
  const problems: RosterProblem[] = []
  let rrnSeen = bannedCols.size > 0

  for (const line of grid.slice(headRow + 1)) {
    if (line.some(c => RRN.test(c))) rrnSeen = true
    // 값 칸의 주민번호는 그 칸만 버린다 — 2차 차단(다른 칸은 살린다)
    const pick = (f: keyof typeof COL_LABEL): string => {
      const i = col[f]
      if (i === undefined || bannedCols.has(i)) return ''
      const v = (line[i] ?? '').trim()
      return RRN.test(v) ? '' : v
    }
    const rawNo = pick('childNo'), rawName = pick('name')
    if (!rawNo && !rawName) continue                    // 완전히 빈 줄

    const childNo = toNo(rawNo)
    const name = rawName.replace(/\s+/g, ' ')
    const gender = toGender(pick('gender'))
    const birthIso = normBirth(pick('birthYmd'))

    const missing: string[] = []
    if (childNo === null) missing.push('번호')
    if (!NAME_RE.test(name)) missing.push('이름')
    if (gender === null) missing.push('성별')
    if (birthIso === null) missing.push('생년월일')

    if (missing.length > 0) problems.push({ childNo, name, missing })
    else children.push({ childNo: childNo!, name, gender: gender!, birthYmd: toYymmdd(birthIso!) })
  }
  return { children, problems, rrnSeen, missingCols }
}

/** CSV·붙여넣기 텍스트 → 그리드. 엑셀 복사는 탭, CSV는 콤마 — 탭이 있으면 탭이 우선. */
export function cutText(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '')
  if (lines.some(l => l.includes('\t'))) return lines.map(l => l.split('\t').map(c => c.trim()))
  return lines.map(l => l.split(',').map(c => c.trim()))
}
