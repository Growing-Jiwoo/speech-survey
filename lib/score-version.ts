// lib/score-version.ts — 관리자 결과지 채점의 「판」(version). **서버 전용**(node:crypto) — 화면은 서버가 준 판을 들고만 있다.
//
// 왜(2026-10-12 점검 X8): 결과지는 화면이 들고 있는 채점을 통째로 보낸다(문장 어절·읽은 시간·스캔본 쓰기는 「보낸 것이
// 전부」). 오래 열어 둔 탭은 그사이 다른 탭이 저장한 칸을 모른 채 보내 그 칸을 지우거나(3·4번 문장) 되돌렸다(X → O).
// 그래서 화면은 자기가 본 판을 함께 보내고, 채점 라우트는 지금 저장된 행으로 만든 판과 다르면 저장하지 않는다.
//
// 판은 **저장된 행 자체**에서 만든다 — 판 컬럼(마이그레이션)이 없어도 되고, 제출·연결 해제처럼 채점 라우트가 아닌
// 경로가 바꾼 행도 똑같이 잡힌다. 결과지 상세 GET과 채점 PUT이 같은 함수로 만들어야 한다(다르면 매번 충돌한다).
import { createHash } from 'node:crypto'

/** 판의 재료 — 결과지 상세·채점 라우트가 읽는 채점 네 표의 행 그대로(lib/db scoreRows·sessionDetail) */
export interface ScoreRows {
  marks: { item_code: string; correct: boolean }[]
  /** 문장 읽기(rs..)와 문장 쓰기(sw..)가 섞여 있다 — 둘 다 판에 든다 */
  sentences: { item_code: string; words: number }[]
  times: { item_code: string; seconds: number }[]
  writing: { item_code: string; can_write: boolean }[]
}

/**
 * 채점 행 → 판(16자리 16진수). 행 순서와 숫자 표기(`5`·`5.0`·`"5"`)에는 흔들리지 않고, 칸 하나라도 바뀌면(값·추가·삭제)
 * 달라진다. 보안용 서명이 아니라 「그사이 바뀌었나」를 가리는 지문이다.
 */
export function scoresVersion(r: ScoreRows): string {
  // 표마다 「코드=값」을 정렬해 잇는다 — 코드는 한 표 안에서 하나뿐이라(session_id, item_code unique) 정렬이 곧 코드순이다
  const part = (tag: string, cells: string[]) => `${tag}:${[...cells].sort().join(',')}`
  const text = [
    part('m', r.marks.map(x => `${x.item_code}=${x.correct ? 1 : 0}`)),
    part('s', r.sentences.map(x => `${x.item_code}=${Number(x.words)}`)),
    part('t', r.times.map(x => `${x.item_code}=${Number(x.seconds)}`)),
    part('w', r.writing.map(x => `${x.item_code}=${x.can_write ? 1 : 0}`)),
  ].join('|')
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}
