// POST /api/sessions/submit — 최종 제출(쓰기 답 + 체크리스트 저장, submitted_at 확정).
// 제출 이후에는 같은 세션의 재제출·녹음 업로드가 모두 거부된다(검사 증적 보호).
//
// 유효한 문항 코드와 배점은 **세션의 학년(검사지)** 이 정한다 — G1은 낱말 쓰기(ww.., 0~1),
// G2는 문장 쓰기(sw.., 0~어절 수). 클라이언트가 보낸 코드를 그대로 믿으면 다른 학년의 문항이
// 섞여 저장된다.
import { NextResponse } from 'next/server'
import {
  sessionState, submitSession,
  type ReadingMark, type SentenceScore, type WritingAnswer,
} from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { formForGrade } from '@/lib/forms'
import { AREA_CODES, itemsFor } from '@/lib/items'
import { itemMaxWords } from '@/lib/scoring'
import { keepImplementedWriting, readingCeilingHit } from '@/lib/survey-flow'
import { jsonError } from '@/lib/request'

export const runtime = 'nodejs'

const bad = (msg: string) => jsonError(msg, 400)
const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  if (typeof b.sessionId !== 'string' || !b.sessionId) return bad('세션 정보가 없습니다.')

  const rawWriting = asRecord(b.writing)
  if (!rawWriting) return bad('쓰기 답 형식 오류')
  if (!Array.isArray(b.checklist) || b.checklist.some((c: unknown) => typeof c !== 'string' || !AREA_CODES.includes(c)))
    return bad('체크리스트 형식 오류')
  const checklist = [...new Set(b.checklist as string[])]
  const rawMarks = b.marks === undefined ? {} : asRecord(b.marks)
  if (!rawMarks) return bad('현장 채점 형식 오류')

  const invalidToken = () => jsonError('유효하지 않은 세션입니다.', 401)
  if (typeof b.sessionToken !== 'string') return invalidToken()
  if (!(await verifySessionToken(b.sessionId, b.sessionToken, env('SESSION_SECRET'))))
    return invalidToken()

  // 학년을 알아야 어떤 문항 코드·배점이 유효한지 판정할 수 있다.
  let grade: number
  try {
    const s = await sessionState(b.sessionId)
    if (s.state === 'missing') return jsonError('세션을 찾을 수 없습니다.', 404)
    if (s.state === 'submitted') return jsonError('이미 제출된 검사입니다.', 409)
    grade = s.grade
  } catch (e) {
    console.error('[submit] 세션 조회 실패', e)
    return jsonError('제출에 실패했습니다.', 502)
  }

  const f = itemsFor(formForGrade(grade))

  // 쓰기 답: 값은 "정확히 쓴 어절 수". 낱말 쓰기는 문항 만점이 1이라 0/1만 유효하다.
  const validWriting: Record<string, number> = {}
  for (const [itemCode, words] of Object.entries(rawWriting)) {
    const item = f.byCode.get(itemCode)
    if (!item || item.section !== f.writingSection) return bad('쓰기 답 형식 오류')
    if (typeof words !== 'number' || !Number.isInteger(words) || words < 0 || words > itemMaxWords(item))
      return bad('쓰기 답 형식 오류')
    validWriting[itemCode] = words
  }

  // 중단 규칙 ②가 성립하면 **실시하지 않은 문항의 답은 저장하지 않는다.**
  // 검사자가 2번 이후를 먼저 채점하고 1번을 마지막에 오반응으로 찍으면 화면은 중단으로
  // 넘어가는데 앞서 입력한 값이 그대로 올라와, 관리자 결과지가 실시하지 않은 문항의 점수를
  // 보여줬다(사용자 보고 2026-08-12 항목 10). 화면에서도 확인 시점에 버리지만, 확인 없이
  // 이동한 경로가 남아 있어 서버가 마지막으로 한 번 더 절삭한다.
  const writingMap = keepImplementedWriting(f, validWriting)
  const writing: WritingAnswer[] = []
  const sentenceWriting: SentenceScore[] = []
  for (const [itemCode, words] of Object.entries(writingMap)) {
    if (f.writingSection === 'word_writing') writing.push({ itemCode, canWrite: words >= 1 })
    else sentenceWriting.push({ itemCode, words })
  }

  // 낱말 해독 의미 낱말의 검사자 현장 채점(중단 규칙 판정 근거). 없어도 제출은 통과시킨다.
  const markCodes = new Set(f.meaningReadCodes)
  const marks: ReadingMark[] = []
  for (const [itemCode, correct] of Object.entries(rawMarks)) {
    if (!markCodes.has(itemCode) || typeof correct !== 'boolean') return bad('현장 채점 형식 오류')
    marks.push({ itemCode, correct })
  }

  try {
    // 중단 규칙 ①은 현장 채점(의미 낱말 O/X)만으로 판정된다. 검사 당시의 사실이므로
    // 여기서 한 번 굳혀 저장한다 — 나중에 관리자가 채점을 고쳐도 뒤집히지 않아야 한다.
    const discontinued = readingCeilingHit(f, Object.fromEntries(marks.map(m => [m.itemCode, m.correct])))
    const result = await submitSession({
      sessionId: b.sessionId, writing, sentenceWriting, checklist, marks, discontinued,
    })
    if (result === 'not_found')
      return jsonError('세션을 찾을 수 없습니다.', 404)
    if (result === 'already_submitted')
      return jsonError('이미 제출된 검사입니다.', 409)
  } catch (e) {
    console.error('[submit] 제출 실패', e)
    return jsonError('제출에 실패했습니다.', 502)
  }
  return NextResponse.json({ ok: true })
}
