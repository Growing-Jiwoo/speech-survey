// lib/session-progress.ts — 관리자 목록 행의 진행률(녹음·쓰기 몇 개가 들어왔나).
// **서버 전용이다** — 학년별 문항 코드가 필요해 lib/forms를 import한다. 목록 화면(lib/adminStats)에
// 두면 검사지 문항이 공개 JS 청크에 실리므로, listSessions가 계산해 행(`progress`)에 싣는다.
import { itemsFor, type FormItems, type Totals } from './items'
import { formForGrade } from './forms'
import { scoreInputFrom } from './scoring'
import type { SessionListRow } from './db'

export interface SessionProgress {
  recorded: number; written: number; expected: Totals; incomplete: boolean
  /** 스캔본 방식이면 담당자가 채점할 차례인지(`uploaded` — 스캔본이 올라왔거나 종이로 채점을 시작함) 선생님을
   *  기다리는지(`wait`), 화면 방식이면 null. 스캔본 방식의 쓰기는
   *  검사 중에 비는 것이 정상이다(담당자가 스캔본으로 채점) — 목록은 빨간 0/10 대신 이 상태로 보인다 */
  scan: 'wait' | 'uploaded' | null
}

type ProgressInput = Pick<SessionListRow, 'grade' | 'recordings' | 'writing_answers' | 'sentence_scores'>
  & Partial<Pick<SessionListRow, 'writing_mode' | 'writing_scans'>>

/** 목록 행의 쓰기 답(itemCode → 어절 수). 쓰기 답이 두 테이블에 나뉘어 있는 사실은
 *  scoreInputFrom만 안다 — 목록 행도 같은 경로로 읽는다. */
function writingOf(
  f: FormItems, s: Pick<ProgressInput, 'writing_answers' | 'sentence_scores'>,
): Partial<Record<string, number>> {
  return scoreInputFrom(f, { marks: [], sentences: s.sentence_scores, times: [], writing: s.writing_answers }).writing
}

/** 세션 1건의 진행률 — 재녹음(같은 item_code 복수 attempt)은 1문항으로 센다.
 *  쓰기 답은 과제 종류에 따라 저장 위치가 다르다(낱말 쓰기 → writing_answers,
 *  문장 쓰기 → sentence_scores). 양식의 문항 코드로 걸러 어느 쪽이든 같은 수를 센다. */
export function sessionProgress(s: ProgressInput): SessionProgress {
  const f = itemsFor(formForGrade(s.grade))
  const writing = writingOf(f, s)
  // 녹음도 **이 양식의 페이지 코드만** 센다. 걸러내지 않으면 페이지 모델 도입(2026-08-07) 이전에
  // 문항 단위로 올라간 옛 녹음(rw01…rs04 = 18건)이 그대로 세어져 분자가 분모를 넘는다
  // ("녹음 18/6"). 실제로 운영 DB에 그런 세션이 남아 있다.
  const recCodes = new Set(f.recordingPages.map(p => p.code))
  const recorded = new Set(s.recordings.map(r => r.item_code).filter(c => recCodes.has(c))).size
  const written = f.writingItems.filter(i => writing[i.code] !== undefined).length
  const expected = f.totals
  const hasScan = Array.isArray(s.writing_scans) ? s.writing_scans.length > 0 : !!s.writing_scans
  // 스캔본 없이 쓰기를 넣기 시작했으면(종이로 채점) 선생님은 더 올릴 수 없다(lib/scan-mapping 「채점됨」) —
  // 기다리는 상태가 아니라 담당자가 채점할 차례로 본다
  const scan = s.writing_mode === 'scan' ? (hasScan || written > 0 ? 'uploaded' : 'wait') : null
  // 「제출 · 미완료 있음」은 **검사 중에 빠뜨린 것**을 알리는 배지다 — 스캔본 방식의 빈 쓰기는 빠뜨린 것이 아니다.
  return { recorded, written, expected, scan, incomplete: recorded < expected.rec || (!scan && written < expected.write) }
}
