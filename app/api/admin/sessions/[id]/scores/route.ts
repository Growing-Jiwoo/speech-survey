// PUT /api/admin/sessions/[id]/scores — 관리자 채점 저장(낱말 O/X · 문장 읽기유창성 어절 수·읽은 시간).
// 인증은 proxy가 /api/admin/* 전체에 걸어 둔다(다른 admin 라우트와 동일).
//
// 유효한 문항 코드·배점은 **세션의 학년(검사지)** 이 정한다. 문장 쓰기 점수(sw..)는 검사 중
// 수집돼 같은 테이블에 들어 있지만 이 라우트가 건드리지 않는다 — 소유 범위를 명시해 넘긴다.
//
// `times`(읽은 시간)는 **선택 필드**다. 없으면 시간을 건드리지 않는다 — 시간 칸이 생기기 전의 화면이
// 이 필드 없이 자동 저장하므로, 그것을 「시간 전부 지움」으로 읽으면 배포 순간 열려 있던 탭 하나가
// 채점자가 넣은 시간을 지운다(lib/db saveScores 주석).
import { NextResponse } from 'next/server'
import { saveScores, sessionState, type ReadingMark, type SentenceScore, type SentenceTime } from '@/lib/db'
import { formForGrade } from '@/lib/forms'
import { itemsFor } from '@/lib/items'
import { isValidReadSec, itemMaxWords, readSecMax } from '@/lib/scoring'
import { UUID_RE, jsonError } from '@/lib/request'

export const runtime = 'nodejs'

const bad = (msg: string) => jsonError('채점 형식 오류: ' + msg, 400)

/** 본문의 객체형 필드(코드 → 값)를 안전하게 꺼낸다. 배열·null은 객체가 아니므로 null. */
function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 세션 id입니다.', 400)

  const b = await req.json().catch(() => ({}))
  const rawMarks = asRecord(b.marks)
  const rawSentences = asRecord(b.sentences)
  const rawTimes = b.times === undefined ? undefined : asRecord(b.times)
  if (!rawMarks || !rawSentences || rawTimes === null) return jsonError('채점 형식 오류', 400)

  let grade: number
  try {
    const s = await sessionState(id)
    if (s.state === 'missing') return jsonError('세션을 찾을 수 없습니다.', 404)
    grade = s.grade
  } catch (e) {
    console.error('[admin/scores] 세션 조회 실패', e)
    return jsonError('채점 저장에 실패했습니다.', 502)
  }

  const form = formForGrade(grade)
  const f = itemsFor(form)
  const readCodes = new Set(f.readItems.map(i => i.code))
  const sentenceCodes = f.sentenceItems.map(i => i.code)

  const marks: ReadingMark[] = []
  for (const [itemCode, correct] of Object.entries(rawMarks)) {
    if (!readCodes.has(itemCode) || typeof correct !== 'boolean') return bad('낱말')
    marks.push({ itemCode, correct })
  }

  const sentences: SentenceScore[] = []
  for (const [itemCode, words] of Object.entries(rawSentences)) {
    const item = sentenceCodes.includes(itemCode) ? f.byCode.get(itemCode) : undefined
    if (!item || typeof words !== 'number' || !Number.isInteger(words)
      || words < 0 || words > itemMaxWords(item))
      return bad('문장')
    sentences.push({ itemCode, words })
  }

  let times: SentenceTime[] | undefined
  if (rawTimes) {
    const max = readSecMax(form)
    times = []
    for (const [itemCode, seconds] of Object.entries(rawTimes)) {
      if (!sentenceCodes.includes(itemCode) || !isValidReadSec(seconds, max)) return bad('시간')
      // 0.1초 단위 판정을 통과한 값이라 반올림은 부동소수 꼬리(0.30000000000000004 → 0.3)만 정리한다.
      times.push({ itemCode, seconds: Math.round(seconds * 10) / 10 })
    }
  }

  try {
    await saveScores(id, marks, sentences, sentenceCodes, times)
  } catch (e) {
    console.error('[admin/scores] 저장 실패', e)
    return jsonError('채점 저장에 실패했습니다.', 502)
  }
  return NextResponse.json({ ok: true })
}
