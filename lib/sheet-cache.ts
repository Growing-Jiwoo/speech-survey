// lib/sheet-cache.ts — 관리자 결과지 저장이 성공한 뒤, 화면이 들고 있는 상세 캐시(react-query)를 **서버가 방금
// 저장한 모양 그대로** 고친다. 순수 함수 — 화면(AdminDetailView)이 부르고 node 테스트가 본다.
//
// 왜: 결과지는 처음 받은 상세로 채점 상태를 한 번만 초기화한다(ResultSheet). 저장 뒤 캐시를 그대로 두면, 목록을
// 다녀와 같은 아이를 다시 열었을 때(캐시 보관 30분) 옛 값으로 화면이 초기화되고, 다음 자동 저장이 그 옛 값으로
// 방금 저장한 채점을 덮는다(문장 점수·읽은 시간·쓰기는 「보낸 것이 전부」라 지워진다). 다시 받아 오면(invalidate)
// 서명 URL이 바뀌어 듣던 녹음과 보던 스캔본이 다시 불러와진다 — 그래서 받지 않고 고친다.
//
// 서버 저장 규칙(lib/db saveScores·saveWriting)과 같게: 낱말 O/X는 upsert(보낸 칸만 바뀐다), 문장 읽기 어절 수와
// 읽은 시간은 문장 읽기 코드 안에서 교체, 쓰기는 보냈을 때만 쓰기 코드 안에서 교체.

interface Rows {
  marks: { item_code: string; correct: boolean }[]
  sentences: { item_code: string; words: number }[]
  times: { item_code: string; seconds: number }[]
  writing: { item_code: string; can_write: boolean }[]
}

export interface SavedScores {
  marks: Partial<Record<string, boolean>>
  sentences: Partial<Record<string, number>>
  times: Partial<Record<string, number>>
  /** 쓰기를 보냈을 때만(스캔본 방식) */
  writing?: Partial<Record<string, number>>
}

const entries = <V,>(r: Partial<Record<string, V>>) =>
  Object.entries(r).filter((e): e is [string, V] => e[1] !== undefined)

export function patchDetail<T extends Rows>(old: T, saved: SavedScores, f: {
  sentenceItems: readonly { code: string }[]
  writingItems: readonly { code: string }[]
  writingSection: string
}): T {
  const readCodes = new Set(f.sentenceItems.map(i => i.code))
  const writeCodes = new Set(f.writingItems.map(i => i.code))
  const sentMarks = new Map(entries(saved.marks))
  const marks = [
    ...old.marks.filter(m => !sentMarks.has(m.item_code)),
    ...[...sentMarks].map(([item_code, correct]) => ({ item_code, correct })),
  ]
  let sentences = [
    ...old.sentences.filter(x => !readCodes.has(x.item_code)),
    ...entries(saved.sentences).map(([item_code, words]) => ({ item_code, words })),
  ]
  const times = [
    ...old.times.filter(x => !readCodes.has(x.item_code)),
    ...entries(saved.times).map(([item_code, seconds]) => ({ item_code, seconds })),
  ]
  let writing = old.writing
  if (saved.writing) {
    const w = entries(saved.writing)
    if (f.writingSection === 'word_writing')
      writing = [...old.writing.filter(x => !writeCodes.has(x.item_code)), ...w.map(([item_code, v]) => ({ item_code, can_write: v >= 1 }))]
    else
      sentences = [...sentences.filter(x => !writeCodes.has(x.item_code)), ...w.map(([item_code, words]) => ({ item_code, words }))]
  }
  return { ...old, marks, sentences, times, writing }
}
