// lib/birth.ts — 생년월일 문자열 정규화. 순수 함수만 둔다.
// 교사가 신청 폼에 명단 파일을 올릴 때, 생년월일이 사람마다 제각각으로 적혀 온다
// (엑셀 기본 표시가 "2019. 5. 9."이고, 자릿수를 안 맞춰 "19-5-9"로 적기도 한다).
// 형식 때문에 되돌려보내는 대신 여기서 한 가지로 모은다 — 테스트가 실제 사례 29개를 고정한다.
//
// 저장 형식은 sessions.birth_ymd(char(6), YYMMDD)이므로 toYymmdd로 줄여 넣는다.
// 화면·검사지에는 YYYY-MM-DD가 필요하므로 이 모듈은 YYYY-MM-DD를 정본으로 돌려준다.

/** 두 자리 연도 해석의 기준 시각. 테스트가 고정할 수 있도록 인자로 뺀다. */
const thisYear = () => new Date().getFullYear()

/** 두 자리 연도 → 네 자리. **생일은 미래일 수 없다**로 푼다 —
 *  19는 2019, 96은 2096이 아니라 1996. 고정 기준값(예: 40 이상이면 19xx)을 쓰지 않아
 *  해가 바뀌어도 규칙을 손볼 필요가 없다. */
function fourDigitYear(yy: number, now = thisYear()): number {
  return 2000 + yy > now ? 1900 + yy : 2000 + yy
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`

/** 달력에 실제로 있는 날인지까지 본다 — 2019-02-30 같은 값을 거른다. */
function isRealDate(y: number, m: number, d: number, now = thisYear()): boolean {
  if (!(y >= 1900 && y <= now && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** 엑셀이 날짜 셀을 저장하는 일련번호(1900 날짜 체계)의 현실적 범위 — 1941~2064년. */
const SERIAL_MIN = 15000
const SERIAL_MAX = 60000

/**
 * 어떤 표기로 적혀 있든 `YYYY-MM-DD`로. 읽을 수 없으면 `null`.
 *
 * 받는 형태:
 *  · 구분자 있음 — `2019-05-09` `2019.5.9` `2019. 5. 9.` `2019/5/9` `2019년 5월 9일` `19-5-9`
 *  · 구분자 없음 — `20190509`(8자리) `190509`(6자리)
 *  · 엑셀 날짜 일련번호 — `43528`
 *
 * 거부하는 형태(조용히 틀린 값을 만드는 대신 교사가 고치게 한다):
 *  · `5/9/2019` — 월·일 순서를 알 수 없다
 *  · `2019-02-30` — 달력에 없는 날 / `2030-01-01` — 미래
 */
export function normBirth(v: unknown, now = thisYear()): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null

  if (/^\d{5}$/.test(s) && +s >= SERIAL_MIN && +s <= SERIAL_MAX) {
    const t = new Date(Date.UTC(1899, 11, 30) + +s * 86400000)
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
  }

  // 한글 구분자를 기호와 같게 만든 뒤 숫자 조각만 남긴다
  const parts = s.replace(/[년월]/g, '-').replace(/일/g, '').split(/[^0-9]+/).filter(Boolean)
  let y: number, m: number, d: number

  if (parts.length === 3) {
    if (parts[0].length === 4) [y, m, d] = parts.map(Number)
    else if (parts[2].length === 4) return null   // 5/9/2019 — 월·일 순서 불명
    else { [y, m, d] = parts.map(Number); y = fourDigitYear(y, now) }
  } else if (parts.length === 1) {
    const t = parts[0]
    if (t.length === 8) { y = +t.slice(0, 4); m = +t.slice(4, 6); d = +t.slice(6, 8) }
    else if (t.length === 6) { y = fourDigitYear(+t.slice(0, 2), now); m = +t.slice(2, 4); d = +t.slice(4, 6) }
    else return null
  } else return null

  return isRealDate(y, m, d, now) ? iso(y, m, d) : null
}

/** `YYYY-MM-DD` → DB 저장 형식 `YYMMDD`. 정규화에 실패한 값은 넣지 않는다. */
export function toYymmdd(isoDate: string): string {
  return isoDate.slice(2).replace(/-/g, '')
}
