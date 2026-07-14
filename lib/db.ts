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

/**
 * 최종 제출: 세션을 먼저 업데이트해 존재 여부를 확정하고, 존재할 때만 낱말쓰기를 upsert한다.
 * 반환값은 업데이트된 세션 행수(0이면 미존재 → 라우트에서 404 처리).
 */
export async function submitSession(
  sessionId: string, writing: WritingAnswer[], checklist: string[],
): Promise<number> {
  const { data, error } = await sb().from('sessions')
    .update({ checklist, submitted_at: new Date().toISOString() })
    .eq('id', sessionId).select('id')
  fail(error)
  const affected = (data ?? []).length
  if (affected === 0) return 0
  if (writing.length > 0) {
    const rows = writing.map(w => ({ session_id: sessionId, item_code: w.itemCode, can_write: w.canWrite }))
    const { error: e2 } = await sb().from('writing_answers').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(e2)
  }
  return affected
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

/** 관리자 세션 삭제: 스토리지 {id}/ 프리픽스 객체 전체 제거 후 행 삭제(FK CASCADE로 recordings·writing_answers 정리). */
export async function deleteSession(id: string): Promise<void> {
  const { data: objs, error: listErr } = await sb().storage.from('recordings').list(id)
  fail(listErr)
  if (objs && objs.length) {
    const { error: rmErr } = await sb().storage.from('recordings').remove(objs.map(o => `${id}/${o.name}`))
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
