// lib/hangul-keys.ts — 한글 자판으로 친 글자를 같은 자리의 영문 자판 글자로 되돌린다(두벌식). 순수 함수.
//
// 학급 코드는 영문 대문자·숫자로만 되어 있다(lib/schema CODE_ALPHABET). 코드 칸에 한글이 들어왔다면 자판을 한글로 둔 채 친 것이다 —
// 한국어로 쓰는 아이패드는 코드 칸을 누르면 한글 키보드가 먼저 뜨고, PC도 한/영 키가 한글이면 같다. 그대로 두면 「K7RM4Q」가
// 「ㅏ7그4ㅂ」로 들어가 「6자리 학급 코드를 입력해 주세요」에 막혔다(iPad 시뮬레이터, 2026-10-21 태블릿 점검).
// 입력기는 자모를 음절로 합치므로(ㄱ+ㅡ → 그) 음절을 자모로 풀어 자판 자리로 옮긴다. 겹받침·겹모음은 누른 두 자리로 푼다.

const JAMO_KEY: Record<string, string> = {
  ㅂ: 'q', ㅈ: 'w', ㄷ: 'e', ㄱ: 'r', ㅅ: 't', ㅛ: 'y', ㅕ: 'u', ㅑ: 'i', ㅐ: 'o', ㅔ: 'p',
  ㅁ: 'a', ㄴ: 's', ㅇ: 'd', ㄹ: 'f', ㅎ: 'g', ㅗ: 'h', ㅓ: 'j', ㅏ: 'k', ㅣ: 'l',
  ㅋ: 'z', ㅌ: 'x', ㅊ: 'c', ㅍ: 'v', ㅠ: 'b', ㅜ: 'n', ㅡ: 'm',
  // Shift로 치는 자모 — 같은 자리의 대문자다(코드는 어차피 대문자로 읽는다)
  ㅃ: 'Q', ㅉ: 'W', ㄸ: 'E', ㄲ: 'R', ㅆ: 'T', ㅒ: 'O', ㅖ: 'P',
  // 겹모음·겹받침 — 누른 두 자리
  ㅘ: 'hk', ㅙ: 'ho', ㅚ: 'hl', ㅝ: 'nj', ㅞ: 'np', ㅟ: 'nl', ㅢ: 'ml',
  ㄳ: 'rt', ㄵ: 'sw', ㄶ: 'sg', ㄺ: 'fr', ㄻ: 'fa', ㄼ: 'fq', ㄽ: 'ft', ㄾ: 'fx', ㄿ: 'fv', ㅀ: 'fg', ㅄ: 'qt',
}
const INITIAL = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const MEDIAL = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const FINAL = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']

/** 한글 음절·자모를 두벌식 자판 자리의 영문으로 바꾼다. 한글이 아닌 글자는 그대로 둔다. */
export function qwertyFromHangul(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c >= 0xac00 && c <= 0xd7a3) {
      const i = c - 0xac00
      out += JAMO_KEY[INITIAL[Math.floor(i / 588)]] + JAMO_KEY[MEDIAL[Math.floor((i % 588) / 28)]] + (JAMO_KEY[FINAL[i % 28]] ?? '')
    } else out += JAMO_KEY[ch] ?? ch
  }
  return out
}

export const hasHangul = (s: string) => /[ㄱ-ㆎ가-힣]/.test(s)
