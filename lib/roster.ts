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
  /** 번호 중복 여부는 여기서 검사하지 않는다 — 학급 코드 발급과 마찬가지로 `applySchema`(서버)의
   *  몫이다. 이 배열이 이미 유일하다고 가정하지 말 것. */
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
// 대시가 있으면 애매하지 않다 — 그대로 주민번호로 본다.
const RRN_DASHED = /\d{6}\s*[-–]\s*\d{7}/
/**
 * 값 하나에 주민등록번호가 들어 있는지. 대시 없는 13자리 숫자는 그 자체로는 학번
 * (`2026010112345`처럼) 같은 일반 숫자와 모양이 같아 구분이 안 된다 — 앞 6자리가 실제
 * 날짜(YYMMDD)일 때만 주민번호로 본다. 날짜 판정은 새로 만들지 않고 `normBirth`를 그대로
 * 쓴다(YYMMDD 6자리를 이미 검증한다).
 */
function isRrn(v: string): boolean {
  if (RRN_DASHED.test(v)) return true
  const m = v.match(/\d{13}/)
  return m !== null && normBirth(m[0].slice(0, 6)) !== null
}
const HEAD_SCAN_ROWS = 8    // 제목·안내 문구가 이 안에 있다(나이스 1줄·배포 양식 5줄)

/** 머리글 비교용 정규화. "생일(양력)"·"생일."처럼 괄호 부연·마침표가 붙어도 별칭과 매치되게 한다. */
const key = (s: string) => s.trim().toLowerCase().replace(/\s|\(.*?\)|\./g, '')

/** 나이스 내려받기가 성별을 숫자(1=남·2=여)로 주는 경우가 있어 그대로 받는다 — 학교 표기 관례. */
const toGender = (v: string): '남' | '여' | null => {
  if (/^(남|남자|m|male|1)$/i.test(v.trim())) return '남'
  if (/^(여|여자|f|female|2)$/i.test(v.trim())) return '여'
  return null
}
/** 번호 칸에 "2-1"(2반 1번)이나 "1.0"(CSV 숫자 서식)이 흔히 온다. 숫자만 뽑아 붙이면
 *  "2-1"이 21이 되어 **다른 아이의 번호**가 조용히 기록된다 — 임상 기록이므로 애매한
 *  표기는 받지 않고 교사가 고치게 한다(lib/birth.ts의 5/9/2019 거부와 같은 원칙).
 *  받는 것: 1 · 01 · 1번 · 1 번(접미사 앞 공백) · 1명 · 1.0(숫자 서식의 소수점 꼬리) ·
 *  １(한글 IME가 잘 만드는 전각 숫자). 이 정도는 애매함이 없어 문제 행으로 돌려보내면
 *  교사가 안 고쳐도 되는 수정을 억지로 시키는 셈이라 여기서 받는다. */
const toNo = (v: string): number | null => {
  const s = v.trim()
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))  // 전각 숫자
    .replace(/\s*(번|명)$/, '')
    .replace(/\.0+$/, '')
  if (!/^\d{1,2}$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= 99 ? n : null
}

export function parseRosterGrid(grid: string[][]): ParsedRoster | { error: string } {
  // 머리글 행 찾기 — 번호·이름 열이 둘 다 있는 첫 줄
  let headRow = -1
  const col: Partial<Record<keyof typeof COL_LABEL, number>> = {}
  for (let i = 0; i < Math.min(grid.length, HEAD_SCAN_ROWS); i++) {
    const cells = grid[i].map(key)
    const found: typeof col = {}
    // 별칭이 같은 행에 두 번 나오면(예: "출석번호"와 "번호"가 둘 다 있는 표) 별칭 우선순위가
    // 아니라 **왼쪽 열이 이긴다** — findIndex가 앞에서부터 훑기 때문. 의도한 동작은 아니고
    // 그런 표가 실제로 없어 지금은 문제되지 않는다.
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

  // 금지 열(주민번호) 표시 — 지금은 값을 실제로 막는 효과가 없다: 열 역할은 별칭과 완전
  // 일치로만 정해지므로(HEADERS), 금지 이름을 가진 열이 childNo/name/gender/birthYmd로
  // 동시에 읽히는 일 자체가 없다. 그래도 남겨 두는 이유는 나중에 별칭 매칭이 느슨해질 때를
  // 대비한 방어선이기 때문 — 지금 이 열이 실제로 막는 것은 rrnSeen 안내뿐이다.
  const bannedCols = new Set(
    grid[headRow].map((c, i) => (BANNED.some(b => key(c).includes(key(b))) ? i : -1)).filter(i => i >= 0))

  const missingCols = (['gender', 'birthYmd'] as const)
    .filter(f => col[f] === undefined).map(f => COL_LABEL[f])

  const children: RosterChild[] = []
  const problems: RosterProblem[] = []
  let rrnSeen = bannedCols.size > 0

  for (const line of grid.slice(headRow + 1)) {
    if (line.some(c => isRrn(c))) rrnSeen = true
    // 값 칸의 주민번호는 그 칸만 버린다 — 실제로 새는 것을 막는 유일한 층(위 bannedCols는
    // 열 이름 매칭이라 값 자체는 안 막는다). 이름·생년월일 칸에 주민번호가 섞여 들어와도
    // 이 칸만 빈 값으로 취급해 problems로 보낸다.
    const pick = (f: keyof typeof COL_LABEL): string => {
      const i = col[f]
      if (i === undefined || bannedCols.has(i)) return ''
      const v = (line[i] ?? '').trim()
      return isRrn(v) ? '' : v
    }
    const rawNo = pick('childNo'), rawName = pick('name')
    // 성별·생년월일 값이 있는데 번호·이름이 둘 다 빈 줄은 건너뛰지 않는다 — 병합 셀이나
    // 밀린 붙여넣기로 번호·이름만 빠진 실제 아동 행을 조용히 통째로 잃는 사고를 막는다
    // (각주 행처럼 네 칸이 전부 빈 진짜 빈 줄만 건너뛴다).
    // 이 때문에 나이스 "계 5명" 같은 합계 행도 문제 행으로 걸러진다 — 의도한 트레이드오프다.
    // 실물 나이스 파일이 없어 그 행 모양을 짐작해 특별 취급하면 스펙 "고정 4칸" 절이 금지한
    // 값-모양 추론이 된다. 교사가 지우면 되는 눈에 보이는 군더더기 행이, 조용히 사라지는
    // 아이보다 훨씬 싸다 — 실물을 구하기 전까지 이대로 둔다.
    if (!rawNo && !rawName && !pick('gender') && !pick('birthYmd')) continue

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
