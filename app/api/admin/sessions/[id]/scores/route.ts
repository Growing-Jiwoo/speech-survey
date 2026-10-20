// PUT /api/admin/sessions/[id]/scores — 관리자 채점 저장(낱말 O/X · 문장 읽기유창성 어절 수·읽은 시간
// · 스캔본 방식 검사의 쓰기).
// 인증은 proxy가 /api/admin/* 전체에 걸어 둔다(다른 admin 라우트와 동일).
//
// 유효한 문항 코드·배점은 **세션의 학년(검사지)** 이 정한다. 문장 쓰기 점수(sw..)는 검사 중
// 수집돼 같은 테이블에 들어 있지만 읽기 저장은 그것을 건드리지 않는다 — 소유 범위를 명시해 넘긴다.
//
// `writing`(쓰기)은 **선택 필드이고 스캔본 방식 검사만** 받는다(사용자 확정 2026-09-30) — 담당자가
// 스캔본을 보고 채점한다. 화면에서 표시한 검사는 409로 거부한다 — 그 쓰기는 「녹음이 없어 검사자 입력이
// 유일한 채점 경로」(사용자 확정 2026-08-13, docs/superpowers/specs/2026-08-13-…-design.md)라 결과지에서
// 고치지 않는다는 종전 규칙이 화면 방식에 그대로 남는다.
// 스캔본이 없어도 받는다 — 판독이 어려워 담당자가 종이를 따로 받아 채점하는 경우의 길이다.
// 쓰기를 실을 때는 화면이 본 스캔본의 올린 시각(`scanUploadedAt`, 없었으면 null)도 싣는다 — 담당자가 결과지를 연
// 사이 선생님이 스캔본을 바꿨으면 409로 막는다(옛 그림을 보고 넣은 점수가 새 그림과 짝지어 남지 않게).
//
// `times`(읽은 시간)는 **선택 필드**다. 없으면 시간을 건드리지 않는다 — 시간 칸이 생기기 전의 화면이
// 이 필드 없이 자동 저장하므로, 그것을 「시간 전부 지움」으로 읽으면 배포 순간 열려 있던 탭 하나가
// 채점자가 넣은 시간을 지운다(lib/db saveScores 주석).
//
// `baseVersion`(판)도 **선택 필드**다(2026-10-12 점검 X8) — 화면이 마지막으로 받은·저장한 채점의 판(lib/score-version).
// 있으면 지금 저장된 행으로 만든 판과 대조해, 다르면 저장하지 않고 409(`conflict: 'scores'`)와 지금 판·행을 돌려준다.
// 그사이 다른 탭이 저장한 칸을 오래 열어 둔 탭이 「보낸 것이 전부」로 지우거나 되돌리던 것을 막는다 — 화면은 자기가 바꾼
// 칸만 지금 값 위에 얹어 한 번 다시 보낸다(lib/sheet-save). 없으면 종전대로 저장한다(배포 전에 열린 탭과의 호환).
// 저장에 성공하면 저장 뒤 행으로 만든 새 판을 돌려준다(`version`). 스캔본 409는 `conflict: 'scan'`으로 구별한다.
// ⚠️ 대조와 저장은 한 트랜잭션이 아니다 — 두 탭이 같은 판으로 수십 ms 안에 동시에 저장하는 창은 남는다(supabase 클라이언트에
// 트랜잭션이 없다). 막으려는 것은 몇 분·몇 시간 묵은 화면이 덮어쓰는 경우다.
import { NextResponse } from 'next/server'
import {
  saveScores, saveWriting, scanUploadedAt, scoreRows, sessionState, type ReadingMark, type SentenceScore, type SentenceTime,
} from '@/lib/db'
import { formOfSession, type SurveyForm } from '@/lib/forms'
import { itemsFor } from '@/lib/items'
import { isValidReadSec, itemMaxWords, readSecMax } from '@/lib/scoring'
import { scoresVersion } from '@/lib/score-version'
import { UUID_RE, jsonError } from '@/lib/request'

export const runtime = 'nodejs'

const bad = (msg: string) => jsonError(`${msg} 채점 형식이 올바르지 않아요.`, 400)

/** 본문의 객체형 필드(코드 → 값)를 안전하게 꺼낸다. 배열·null은 객체가 아니므로 null. */
function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('검사 정보가 올바르지 않아요.', 400)

  const b = await req.json().catch(() => ({}))
  const rawMarks = asRecord(b.marks)
  const rawSentences = asRecord(b.sentences)
  const rawTimes = b.times === undefined ? undefined : asRecord(b.times)
  const rawWriting = b.writing === undefined ? undefined : asRecord(b.writing)
  if (!rawMarks || !rawSentences || rawTimes === null || rawWriting === null) return jsonError('채점 형식이 올바르지 않아요.', 400)

  let form: SurveyForm
  try {
    const s = await sessionState(id)
    if (s.state === 'missing') return jsonError('검사 기록이 없어요.', 404)
    if (rawWriting && s.writingMode !== 'scan') return jsonError('화면에서 표시한 쓰기는 고칠 수 없어요.', 409)
    form = formOfSession(s)
  } catch (e) {
    console.error('[admin/scores] 세션 조회 실패', e)
    return jsonError('채점을 저장하지 못했어요.', 502)
  }

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

  // 쓰기 값은 제출 라우트와 같은 뜻 — 「정확히 쓴 어절 수」. 낱말 쓰기(G1)는 문항 만점이 1이라 0/1만 유효하다.
  let writing: SentenceScore[] | undefined
  if (rawWriting) {
    writing = []
    for (const [itemCode, words] of Object.entries(rawWriting)) {
      const item = f.byCode.get(itemCode)
      if (!item || item.section !== f.writingSection || typeof words !== 'number' || !Number.isInteger(words)
        || words < 0 || words > itemMaxWords(item))
        return bad('쓰기')
      writing.push({ itemCode, words })
    }
  }

  // 문자열이 아닌 판은 없는 것으로 본다(대조 없이 종전대로) — 판을 모르는 화면은 이 필드를 싣지 않는다
  const baseVersion = typeof b.baseVersion === 'string' ? b.baseVersion : undefined
  const seen = typeof b.scanUploadedAt === 'string' ? b.scanUploadedAt : null
  try {
    // 스캔본 시각과 지금 채점 행을 함께 읽는다 — 따로 읽으면 대조와 쓰기 저장 사이가 벌어진다(아래 「쓰기를 먼저」와 같은 이유)
    const [scanAt, current] = await Promise.all([
      writing ? scanUploadedAt(id) : null,
      baseVersion !== undefined ? scoreRows(id) : null,
    ])
    // 문자열이 아니라 **시각**으로 비교한다 — 한쪽이 날짜 형식을 바꾸면(toISOString 등) 모든 쓰기 저장이 409가 된다
    // 날짜로 읽히지 않는 값은 글자 그대로 비교한다(NaN끼리는 같지 않다)
    const asTime = (v: string | null) => { if (v === null) return null; const t = Date.parse(v); return Number.isNaN(t) ? v : t }
    // 스캔본이 먼저다 — 그 쓰기는 판과 무관하게 버려야 하고(옛 그림의 점수), 읽기는 다음 저장이 판 대조를 거쳐 다시 보낸다
    if (writing && asTime(scanAt) !== asTime(seen))
      return NextResponse.json({ error: '그사이 선생님이 스캔본을 올리거나 바꿨어요. 결과지를 새로 열어 주세요.', conflict: 'scan' }, { status: 409 })
    if (current) {
      const now = scoresVersion(current)
      // 지금 행을 함께 준다 — 화면이 상세를 다시 받지 않고 바로 병합한다(다시 받으면 서명 URL이 바뀌어 듣던 녹음이 다시
      // 불러와지고, 떠날 때 보낸 저장(keepalive)은 화면 없이 응답만으로 병합해야 한다)
      if (now !== baseVersion)
        return NextResponse.json({ error: '그사이 다른 화면에서 채점이 저장됐어요.', conflict: 'scores', version: now, rows: current }, { status: 409 })
    }
  } catch (e) {
    console.error('[admin/scores] 저장 전 대조 실패(스캔본·채점 판)', e)
    return jsonError('채점을 저장하지 못했어요.', 502)
  }

  try {
    // 쓰기를 먼저 — 위 대조와 쓰기 저장 사이가 짧을수록 그사이 선생님이 스캔본을 바꾸는 창이 좁다
    // (끼어들어도 다음 쓰기 저장이 409로 드러낸다)
    if (writing)
      await saveWriting(id, f.writingSection === 'word_writing' ? 'word' : 'sentence', writing, f.writingItems.map(i => i.code))
    await saveScores(id, marks, sentences, sentenceCodes, times)
  } catch (e) {
    console.error('[admin/scores] 저장 실패', e)
    return jsonError('채점을 저장하지 못했어요.', 502)
  }
  // 새 판 — 저장한 뒤의 행으로 만든다(화면이 다음 저장에 싣는다). 못 읽어도 저장은 이미 끝났으니 실패로 알리지 않는다:
  // 판이 null이면 화면은 갖고 있던 판을 그대로 쓰고, 다음 저장이 한 번 409를 거쳐 병합으로 맞춰진다.
  let version: string | null = null
  try { version = scoresVersion(await scoreRows(id)) } catch (e) { console.error('[admin/scores] 저장 뒤 판 계산 실패', e) }
  return NextResponse.json({ ok: true, version })
}
