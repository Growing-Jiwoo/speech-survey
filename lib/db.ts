import { sb } from './supabase'

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export interface NewSessionInput {
  schoolRegion: string; schoolId: string; schoolName: string
  birthYmd: string; grade: number; classNo: number; gender: '남' | '여'
  childName: string; teacherName: string; teacherContact: string
}

export async function createSession(s: NewSessionInput): Promise<string> {
  const { data, error } = await sb().from('sessions').insert({
    school_region: s.schoolRegion, school_id: s.schoolId, school_name: s.schoolName,
    birth_ymd: s.birthYmd, grade: s.grade, class_no: s.classNo, gender: s.gender,
    child_name: s.childName, teacher_name: s.teacherName, teacher_contact: s.teacherContact,
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

/** 최종 제출: 낱말쓰기 답 upsert + 체크리스트·submitted_at 기록 */
export async function submitSession(
  sessionId: string, writing: WritingAnswer[], checklist: string[],
): Promise<void> {
  if (writing.length > 0) {
    const rows = writing.map(w => ({ session_id: sessionId, item_code: w.itemCode, can_write: w.canWrite }))
    const { error } = await sb().from('writing_answers').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(error)
  }
  const { error } = await sb().from('sessions')
    .update({ checklist, submitted_at: new Date().toISOString() }).eq('id', sessionId)
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

/** 로그인 실패 1건 기록 (fail_count 증가, 잠금시각 갱신) */
export async function recordLoginFailure(ip: string, lockMs: number): Promise<void> {
  const { data } = await sb().from('login_attempts').select('fail_count').eq('ip', ip).maybeSingle()
  const nextCount = (data?.fail_count ?? 0) + 1
  const { error } = await sb().from('login_attempts').upsert({
    ip, fail_count: nextCount,
    locked_until: new Date(Date.now() + lockMs).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'ip' })
  fail(error)
}

/** 로그인 성공 시 해당 IP 실패 기록 제거 */
export async function clearLoginFailures(ip: string): Promise<void> {
  const { error } = await sb().from('login_attempts').delete().eq('ip', ip)
  fail(error)
}

// ---------- 공개 엔드포인트 레이트리밋 (세션 생성·녹음 업로드 남용 방지) ----------

/** 고정 윈도우 레이트리밋. 윈도우 경과 시 카운트 리셋, 초과 시 false.
 *  동시 요청 간 경합은 감수한다(login_attempts와 동일한 수준의 best-effort). */
export async function checkRateLimit(bucket: string, maxCount: number, windowMs: number): Promise<boolean> {
  const now = new Date()
  const { data, error } = await sb().from('rate_limits')
    .select('window_start, count').eq('bucket', bucket).maybeSingle()
  fail(error)
  const withinWindow = !!data && now.getTime() - new Date(data.window_start).getTime() < windowMs
  if (withinWindow && data!.count >= maxCount) return false
  const nextCount = withinWindow ? data!.count + 1 : 1
  const windowStart = withinWindow ? data!.window_start : now.toISOString()
  const { error: upErr } = await sb().from('rate_limits')
    .upsert({ bucket, window_start: windowStart, count: nextCount }, { onConflict: 'bucket' })
  fail(upErr)
  return true
}

// ---------- 관리자 조회 ----------

export interface SessionRow {
  id: string
  school_region: string; school_id: string; school_name: string
  birth_ymd: string; grade: number; class_no: number; gender: string
  child_name: string; teacher_name: string; teacher_contact: string
  checklist: string[]
  started_at: string; submitted_at: string | null
}

export interface RecordingRow {
  item_code: string; attempt_no: number; audio_path: string
  duration_sec: number | null; created_at: string
}

export interface WritingRow { item_code: string; can_write: boolean }

const SESSION_COLS = 'id, school_region, school_id, school_name, birth_ymd, grade, class_no, gender, child_name, teacher_name, teacher_contact, checklist, started_at, submitted_at'

export type SessionListRow = SessionRow & {
  recordings: { item_code: string }[]
  writing_answers: { item_code: string }[]
}

export async function listSessions(): Promise<SessionListRow[]> {
  const { data, error } = await sb().from('sessions')
    .select(`${SESSION_COLS}, recordings(item_code), writing_answers(item_code)`)
    .order('started_at', { ascending: false })
  fail(error)
  return data as unknown as SessionListRow[]
}

export async function sessionDetail(sessionId: string): Promise<{
  session: SessionRow; recordings: RecordingRow[]; writing: WritingRow[]
}> {
  const [{ data: s, error: e1 }, { data: recs, error: e2 }, { data: ans, error: e3 }] = await Promise.all([
    sb().from('sessions').select(SESSION_COLS).eq('id', sessionId).single(),
    sb().from('recordings').select('item_code, attempt_no, audio_path, duration_sec, created_at')
      .eq('session_id', sessionId).order('item_code').order('attempt_no'),
    sb().from('writing_answers').select('item_code, can_write').eq('session_id', sessionId),
  ])
  fail(e1); fail(e2); fail(e3)
  return {
    session: s as unknown as SessionRow,
    recordings: (recs ?? []) as RecordingRow[],
    writing: (ans ?? []) as WritingRow[],
  }
}
