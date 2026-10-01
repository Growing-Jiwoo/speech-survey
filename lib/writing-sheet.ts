// lib/writing-sheet.ts — 쓰기 기록지(아이가 글씨를 쓰는 종이)의 「기계용 이름표」와 인쇄 목록.
//
// 쓰기를 「스캔본으로 올리기」 방식으로 하면(담당자 확정 2026-09-30 — 두 방식 중 고르는 과정만. 회신은 사용자 전달,
// 원문은 저장소에 없다. 화면·세부 흐름은 사용자 확정) 선생님이 반 전체
// 기록지를 한 번에 스캔해 올린다. 그 파일의 쪽마다 **어느 아이 것인지** 시스템이 알아야 하는데,
// 종이에 찍힌 이름 글자는 기계가 잘 못 읽고, 아이들이 낸 순서는 번호순이 아니다 — 쪽 순서로 맞추면
// 한 장만 빠져도 그 뒤가 전부 다른 아이 기록에 붙는다. 그래서 기록지마다 QR을 찍고 쪽마다 따로 읽는다.
//
// QR에 싣는 것: `SHEET-W:<반 표시 8자리>:<번호 2자리>`. 이름·학급 코드·인터넷 주소는 **싣지 않는다**
// (사용자 확정 2026-09-30) — 학급 코드는 그 반 명단의 비밀번호라(README 「운영 · 개인정보」) 종이 25장에
// 뿌리면 안 되고, 주소를 넣으면 휴대폰으로 찍은 사람이 사이트로 들어온다. 반 표시는 학급 id의 해시
// 앞자리라 거꾸로 무엇도 알 수 없고, 비밀이 아니다 — 다른 반 종이가 섞였는지 가르는 데만 쓴다.
// 머리말은 검사 이름(KODYS)을 쓰지 않는다(사용자 확정 2026-10-01) — 휴대폰으로 찍으면 글자가 그대로 보이고, 신청
// 화면이 그 이름을 난독 선별검사로 풀어 쓴다. 아이 종이에는 평가를 드러내는 말을 싣지 않는다(「난독」 표기 금지와 같은 이유).
//
// 이 파일은 화면(시작 화면 인쇄·결과지 업로드)이 값으로 import한다 — 검사지 문항을 가져오지 않는다.

export const SHEET_QR_PREFIX = 'SHEET-W'

/** 반 표시 — 학급 id의 SHA-256 앞 8자리(16진수). 서버가 만들어 화면에 내려준다. */
export async function classSheetTag(classCodeId: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`kodys-writing-sheet:${classCodeId}`))
  return [...new Uint8Array(buf).slice(0, 4)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** QR에 싣는 글자열. 번호는 두 자리(1~99 — sessions.child_no 제약과 같다). */
export function sheetQrText(tag: string, childNo: number): string {
  return `${SHEET_QR_PREFIX}:${tag}:${String(childNo).padStart(2, '0')}`
}

const QR_RE = /^SHEET-W:([0-9a-f]{8}):(\d{2})$/

/** 판독한 QR 글자열 → 반 표시·번호. 우리 기록지가 아니면 null. */
export function parseSheetQr(text: string): { tag: string; childNo: number } | null {
  const m = QR_RE.exec(text.trim())
  if (!m) return null
  const childNo = Number(m[2])
  return childNo >= 1 && childNo <= 99 ? { tag: m[1], childNo } : null
}

/**
 * 기록지 모양 — 쓰는 칸의 종류와 개수만 담는다. **목표 낱말·문장은 담지 않는다**(받아쓰기라 종이에
 * 인쇄하지 않고, 화면이 문항을 받으면 공개 JS에 실린다). 서버가 양식에서 계산해 내려준다.
 */
export interface SheetLayout { kind: 'word' | 'sentence'; count: number }

/** 인쇄할 기록지 한 장. `name`이 없으면 번호만 찍힌 기록지(이름은 손으로 쓴다). */
export interface SheetEntry { childNo: number; name: string | null }

/**
 * 인쇄 목록 — 고른 명단 학생(번호순) + 번호만 찍힌 기록지(번호순, 명단 학생과 번호가 겹치면 이름 있는
 * 쪽을 남긴다). 같은 번호 두 장이 나오면 스캔본이 한 아이에게 두 번 붙으므로 겹치지 않게 한다.
 */
export function sheetEntries(
  picked: { childNo: number; name: string }[], numberOnly: number[],
): SheetEntry[] {
  const byNo = new Map<number, SheetEntry>()
  for (const n of numberOnly) if (Number.isInteger(n) && n >= 1 && n <= 99) byNo.set(n, { childNo: n, name: null })
  for (const p of picked) byNo.set(p.childNo, { childNo: p.childNo, name: p.name })
  return [...byNo.values()].sort((a, b) => a.childNo - b.childNo)
}

/** 1~to번 목록(99에서 자른다, to가 1보다 작거나 정수가 아니면 빈 목록). 명단 없는 학급이 「1번~N번」을 한 번에 뽑을 때 쓴다. */
export function numberRange(to: number): number[] {
  if (!Number.isInteger(to) || to < 1) return []
  return Array.from({ length: Math.min(99, to) }, (_, i) => i + 1)
}

/**
 * 기록지 **칸 번호** — 쓰기 문항 순서(양식 순서) 그대로 1부터. 받아쓰기 목록(검사 화면)·기록지 칸·담당자 채점
 * 행이 이 번호 하나를 쓴다 — 선생님이 「3번」을 부르면 아이가 3번 칸에 쓰고, 담당자가 3번 칸을 3번 문항으로
 * 채점해야 한다. 검사지 전체 순번(`orderNo` — G1 쓰기는 19~28)과 다르다: 그 번호를 부르면 아이가 칸을 못 찾는다.
 */
export function sheetBoxNo(writingItems: readonly { code: string }[]): Map<string, number> {
  return new Map(writingItems.map((i, k) => [i.code, k + 1]))
}
