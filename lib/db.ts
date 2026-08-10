import { sb } from './supabase'

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export interface NewSessionInput {
  schoolRegion: string; schoolId: string; schoolName: string
  birthYmd: string; grade: number; classNo: number; gender: '남' | '여'
  childName: string; teacherName: string
  /** 전화·이메일 중 하나는 반드시 non-null (스키마가 보장). 미입력 칸은 null로 저장한다. */
  teacherPhone: string | null; teacherEmail: string | null
  examinerType: 'teacher' | 'expert'
}

export async function createSession(s: NewSessionInput): Promise<string> {
  const { data, error } = await sb().from('sessions').insert({
    school_region: s.schoolRegion, school_id: s.schoolId, school_name: s.schoolName,
    birth_ymd: s.birthYmd, grade: s.grade, class_no: s.classNo, gender: s.gender,
    child_name: s.childName, teacher_name: s.teacherName,
    teacher_phone: s.teacherPhone, teacher_email: s.teacherEmail,
    examiner_type: s.examinerType,
    // 법정대리인 동의 확인 시각(감사 증적) — 라우트가 guardianConsent 검증을 통과한 요청만
    // 여기 도달하므로, 세션 생성 = 동의 확인 완료를 의미한다(제22조의2 확인 의무의 기록).
    guardian_consented_at: new Date().toISOString(),
  }).select('id').single()
  fail(error)
  return data!.id
}

export async function insertRecording(r: {
  sessionId: string; itemCode: string; attemptNo: number; audioPath: string; durationSec: number
}): Promise<void> {
  const { error } = await sb().from('recordings').upsert({
    session_id: r.sessionId, item_code: r.itemCode, attempt_no: r.attemptNo,
    audio_path: r.audioPath, duration_sec: r.durationSec,
  }, { onConflict: 'session_id,item_code,attempt_no' })
  fail(error)
}

export interface WritingAnswer { itemCode: string; canWrite: boolean }

/** 낱말 해독 의미 낱말의 검사자 현장 채점 */
export interface ReadingMark { itemCode: string; correct: boolean }

/** 문장 읽기유창성 채점 — 제한 시간 내 정확히 읽은 어절 수 */
export interface SentenceScore { itemCode: string; words: number }

export type SubmitResult = 'ok' | 'not_found' | 'already_submitted'

/**
 * 최종 제출: 미제출 세션만 업데이트하고(제출 후 재제출·변조 차단), 성공했을 때만
 * 낱말쓰기·현장 채점을 upsert한다.
 * 업데이트 0건이면 미존재/기제출을 구분해 반환(라우트에서 404/409 처리).
 */
export async function submitSession(
  sessionId: string, writing: WritingAnswer[], checklist: string[], marks: ReadingMark[] = [],
  /** 중단 규칙 ①로 문장·낱말 쓰기를 실시하지 않았는지 — 검사 당시의 사실이므로 제출 시점에 굳힌다.
   *  나중에 reading_marks로 다시 판정하면 관리자가 채점을 고칠 때 값이 뒤집힌다. */
  discontinued = false,
): Promise<SubmitResult> {
  const now = new Date().toISOString()
  const { data, error } = await sb().from('sessions')
    .update({ checklist, submitted_at: now, discontinued_at: discontinued ? now : null })
    .eq('id', sessionId).is('submitted_at', null).select('id')
  fail(error)
  if ((data ?? []).length === 0) {
    const state = await sessionSubmitState(sessionId)
    return state === 'submitted' ? 'already_submitted' : 'not_found'
  }
  if (writing.length > 0) {
    const rows = writing.map(w => ({ session_id: sessionId, item_code: w.itemCode, can_write: w.canWrite }))
    const { error: e2 } = await sb().from('writing_answers').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(e2)
  }
  if (marks.length > 0) {
    const rows = marks.map(m => ({ session_id: sessionId, item_code: m.itemCode, correct: m.correct }))
    const { error: e3 } = await sb().from('reading_marks').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(e3)
  }
  return 'ok'
}

/**
 * 관리자 채점 저장. 낱말 O/X는 reading_marks(현장 채점과 같은 테이블 — 관리자가 확정값으로 덮어쓴다),
 * 문장 어절 수는 sentence_scores에 upsert한다. 제출 여부와 무관하게 언제든 다시 채점할 수 있다.
 */
export async function saveScores(
  sessionId: string, marks: ReadingMark[], sentences: SentenceScore[],
): Promise<void> {
  if (marks.length > 0) {
    const rows = marks.map(m => ({ session_id: sessionId, item_code: m.itemCode, correct: m.correct }))
    const { error } = await sb().from('reading_marks').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(error)
  }
  // 문장 점수는 "보낸 것이 전부"(PUT 의미)로 취급해 세션의 문장 점수를 교체한다.
  // upsert만 하면 채점자가 화면에서 지운 칸의 옛 값이 DB에 남아, 화면 총점과 저장된 총점이
  // 어긋난 채로 결과지가 나간다.
  // 순서가 중요하다: 먼저 지우고 넣으면, 넣기가 실패했을 때(네트워크·제약 위반) 이미 지워진
  // 기존 점수가 복구되지 않는다 — 채점자의 작업이 통째로 사라진다. 그래서 넣기를 먼저 하고
  // 이번에 보내지 않은 행만 지운다. 중간에 실패해도 기존 값은 남는다.
  // (낱말 O/X는 화면에 "해제" 동작이 없어 이런 삭제 경로가 필요 없다 — 그래서 위는 upsert만 한다.)
  if (sentences.length > 0) {
    const rows = sentences.map(s => ({ session_id: sessionId, item_code: s.itemCode, words: s.words }))
    const { error } = await sb().from('sentence_scores').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(error)
  }
  const keep = sentences.map(s => s.itemCode)
  const stale = sb().from('sentence_scores').delete().eq('session_id', sessionId)
  const { error: delErr } = await (keep.length > 0
    ? stale.not('item_code', 'in', `(${keep.join(',')})`)
    : stale)
  fail(delErr)
}

/** 세션 존재·제출 상태 조회(업로드/제출 가드용). */
export async function sessionSubmitState(sessionId: string): Promise<'missing' | 'open' | 'submitted'> {
  const { data, error } = await sb().from('sessions')
    .select('submitted_at').eq('id', sessionId).maybeSingle()
  fail(error)
  if (!data) return 'missing'
  return data.submitted_at ? 'submitted' : 'open'
}

/** 세션당 녹음 행 수(업로드 총량 상한 검사용). */
export async function countSessionRecordings(sessionId: string): Promise<number> {
  const { count, error } = await sb().from('recordings')
    .select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  fail(error)
  return count ?? 0
}

/** 스토리지 객체 1건 제거(업로드 후 DB insert 실패 시 보상 정리). */
export async function removeStorageObject(path: string): Promise<void> {
  const { error } = await sb().storage.from('recordings').remove([path])
  fail(error)
}

/** storage list() 페이지 크기. supabase-js 기본값도 100이지만, 아래 페이지네이션 루프가
 *  "기본값이 곧 전부"라고 오해하지 않도록 명시한다. */
const STORAGE_LIST_PAGE = 100

/**
 * 관리자 세션 삭제(PII 파기): 스토리지 {id}/ 프리픽스 객체 전체 제거 후 행 삭제
 * (FK CASCADE로 recordings·writing_answers 정리).
 * - list()는 기본 100개까지만 반환하므로 반드시 페이지네이션으로 전부 수집한다
 *   (세션당 녹음 상한 200개 — 한 페이지만 지우면 음성 파일이 고아로 잔존한다).
 * - 스토리지 → 행 순서 유지: 중간 실패 시 세션 행이 남아 관리자가 재시도할 수 있다.
 */
export async function deleteSession(id: string): Promise<void> {
  const paths: string[] = []
  for (let offset = 0; ; offset += STORAGE_LIST_PAGE) {
    const { data: objs, error: listErr } = await sb().storage.from('recordings')
      .list(id, { limit: STORAGE_LIST_PAGE, offset })
    fail(listErr)
    if (!objs || objs.length === 0) break
    paths.push(...objs.map(o => `${id}/${o.name}`))
    if (objs.length < STORAGE_LIST_PAGE) break
  }
  if (paths.length > 0) {
    const { error: rmErr } = await sb().storage.from('recordings').remove(paths)
    fail(rmErr)
  }
  const { error } = await sb().from('sessions').delete().eq('id', id)
  fail(error)
}

export async function uploadRecording(path: string, bytes: Buffer, mime: string): Promise<void> {
  const doUpload = () => sb().storage.from('recordings')
    .upload(path, bytes, { contentType: mime, upsert: true })
  let { error } = await doUpload()
  if (error) ({ error } = await doUpload()) // 1회 자동 재시도
  if (error) throw new Error(`녹음 업로드 실패: ${error.message}`)
}

export async function signedAudioUrl(path: string): Promise<string> {
  const { data, error } = await sb().storage.from('recordings').createSignedUrl(path, 3600)
  fail(error)
  return data!.signedUrl
}

// ---------- 관리자 로그인 레이트리밋 (DB 공유 저장소 — 서버리스에서도 유효) ----------

/** 해당 IP가 현재 잠금 상태인지 (실패 임계 도달 + 잠금시각 이내) */
export async function isLoginLocked(ip: string, maxFails: number): Promise<boolean> {
  const { data, error } = await sb().from('login_attempts')
    .select('fail_count, locked_until').eq('ip', ip).maybeSingle()
  fail(error)
  if (!data) return false
  return data.fail_count >= maxFails && !!data.locked_until && new Date(data.locked_until) > new Date()
}

/** 해당 키(IP 또는 글로벌 버킷)의 현재 누적 실패 수(없으면 0). 글로벌 백오프 지연 계산용. */
export async function loginFailureCount(ip: string): Promise<number> {
  const { data, error } = await sb().from('login_attempts')
    .select('fail_count').eq('ip', ip).maybeSingle()
  fail(error)
  return data?.fail_count ?? 0
}

/** 로그인 실패 1건 기록 (fail_count 원자적 증가, 잠금시각 갱신). read-then-write 경쟁조건을 피하기 위해 RPC로 위임. */
export async function recordLoginFailure(ip: string, lockMs: number): Promise<void> {
  const { error } = await sb().rpc('record_login_failure', { p_ip: ip, p_lock_ms: lockMs })
  fail(error)
}

/** 로그인 성공 시 해당 IP 실패 기록 제거 */
export async function clearLoginFailures(ip: string): Promise<void> {
  const { error } = await sb().from('login_attempts').delete().eq('ip', ip)
  fail(error)
}

// ---------- 관리자 조회 ----------

export interface SessionRow {
  id: string
  school_region: string; school_id: string; school_name: string
  birth_ymd: string; grade: number; class_no: number; gender: string
  child_name: string; teacher_name: string
  /** 010 이전 수집분은 teacher_contact에만 값이 있다(관리자 화면이 contactLabel로 폴백 표시) */
  teacher_phone: string | null; teacher_email: string | null; teacher_contact: string | null
  checklist: string[]
  started_at: string; submitted_at: string | null
  guardian_consented_at: string | null // 법정대리인 동의 확인 시각(도입 전 수집분은 null)
  /** 검사지 헤더의 "교사 / 전문가" 구분. 도입 전(011 이전) 수집분은 null */
  examiner_type: 'teacher' | 'expert' | null
  /** 중단 규칙 ①로 문장·낱말 쓰기를 실시하지 않은 시각(012). 제출 시점에 확정된다 */
  discontinued_at: string | null
}

export interface RecordingRow {
  item_code: string; attempt_no: number; audio_path: string
  duration_sec: number | null; created_at: string
}

export interface WritingRow { item_code: string; can_write: boolean }

const SESSION_COLS = 'id, school_region, school_id, school_name, birth_ymd, grade, class_no, gender, child_name, teacher_name, teacher_phone, teacher_email, teacher_contact, checklist, started_at, submitted_at, guardian_consented_at, examiner_type, discontinued_at'

export type SessionListRow = SessionRow & {
  recordings: { item_code: string }[]
  writing_answers: { item_code: string }[]
}

const MAX_LIST_ROWS = 5000

export async function listSessions(): Promise<SessionListRow[]> {
  const { data, error } = await sb().from('sessions')
    .select(`${SESSION_COLS}, recordings(item_code), writing_answers(item_code)`)
    .order('started_at', { ascending: false })
    .limit(MAX_LIST_ROWS)
  fail(error)
  const rows = (data ?? []) as unknown as SessionListRow[]
  if (rows.length >= MAX_LIST_ROWS)
    console.warn(`[listSessions] 상한(${MAX_LIST_ROWS}) 도달 — 서버 페이지네이션 도입 검토 필요`)
  return rows
}

export interface MarkRow { item_code: string; correct: boolean }

export interface SentenceScoreRow { item_code: string; words: number }

export async function sessionDetail(sessionId: string): Promise<{
  session: SessionRow; recordings: RecordingRow[]; writing: WritingRow[]
  marks: MarkRow[]; sentences: SentenceScoreRow[]
}> {
  const [{ data: s, error: e1 }, { data: recs, error: e2 }, { data: ans, error: e3 },
    { data: mk, error: e4 }, { data: ss, error: e5 }] = await Promise.all([
      sb().from('sessions').select(SESSION_COLS).eq('id', sessionId).single(),
      sb().from('recordings').select('item_code, attempt_no, audio_path, duration_sec, created_at')
        .eq('session_id', sessionId).order('item_code').order('attempt_no'),
      sb().from('writing_answers').select('item_code, can_write').eq('session_id', sessionId),
      sb().from('reading_marks').select('item_code, correct').eq('session_id', sessionId),
      sb().from('sentence_scores').select('item_code, words').eq('session_id', sessionId),
    ])
  fail(e1); fail(e2); fail(e3); fail(e4); fail(e5)
  return {
    session: s as unknown as SessionRow,
    recordings: (recs ?? []) as RecordingRow[],
    writing: (ans ?? []) as WritingRow[],
    marks: (mk ?? []) as MarkRow[],
    sentences: (ss ?? []) as SentenceScoreRow[],
  }
}
