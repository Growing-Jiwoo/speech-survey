import { sb } from './supabase'

export interface Question { id: number; order_no: number; text: string; difficulty: string }

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export async function listQuestions(): Promise<Question[]> {
  const { data, error } = await sb().from('questions').select('*').order('order_no')
  fail(error)
  return data!
}

export async function createSession(name: string, age: number): Promise<string> {
  const { data, error } = await sb().from('sessions')
    .insert({ child_name: name, child_age: age }).select('id').single()
  fail(error)
  return data!.id
}

export async function completeSession(sessionId: string): Promise<void> {
  const { error } = await sb().from('sessions')
    .update({ completed_at: new Date().toISOString() }).eq('id', sessionId)
  fail(error)
}

/** 응답 행이 없으면 in_progress로 생성하고 id 반환 */
export async function getOrCreateResponse(sessionId: string, questionId: number): Promise<string> {
  const { data } = await sb().from('responses').select('id')
    .eq('session_id', sessionId).eq('question_id', questionId).maybeSingle()
  if (data) return data.id
  const { data: ins, error } = await sb().from('responses')
    .insert({ session_id: sessionId, question_id: questionId, status: 'in_progress' })
    .select('id').single()
  fail(error)
  return ins!.id
}

export async function insertAttempt(a: {
  responseId: string; attemptNo: number; sttText: string; audioPath: string; durationSec: number
}): Promise<string> {
  const { data, error } = await sb().from('attempts').upsert({
    response_id: a.responseId, attempt_no: a.attemptNo, stt_text: a.sttText,
    audio_path: a.audioPath, duration_sec: a.durationSec,
  }, { onConflict: 'response_id,attempt_no' }).select('id').single()
  fail(error)
  const patch: Record<string, unknown> = { retry_count: a.attemptNo }
  if (a.sttText.trim()) { patch.status = 'completed'; patch.final_attempt_id = data!.id }
  const { error: e2 } = await sb().from('responses').update(patch).eq('id', a.responseId)
  fail(e2)
  return data!.id
}

export async function markSkipped(sessionId: string, questionId: number): Promise<void> {
  const id = await getOrCreateResponse(sessionId, questionId)
  const { error } = await sb().from('responses')
    .update({ status: 'skipped', final_attempt_id: null }).eq('id', id)
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

// ---------- 관리자 조회 ----------

export interface SessionRow {
  id: string; child_name: string; child_age: number
  started_at: string; completed_at: string | null
  responses: { status: string }[]
}

export async function listSessions(): Promise<SessionRow[]> {
  const { data, error } = await sb().from('sessions')
    .select('id, child_name, child_age, started_at, completed_at, responses(status)')
    .order('started_at', { ascending: false })
  fail(error)
  return data as unknown as SessionRow[]
}

export interface AttemptRow { id: string; attempt_no: number; stt_text: string; audio_path: string; duration_sec: number | null; created_at: string }
export interface DetailRow {
  question: Question
  status: 'none' | 'in_progress' | 'completed' | 'skipped'
  retryCount: number
  finalAttemptId: string | null
  attempts: AttemptRow[]
}

export async function sessionDetail(sessionId: string): Promise<{ session: SessionRow; rows: DetailRow[] }> {
  const [{ data: s, error: e1 }, questions, { data: resps, error: e2 }] = await Promise.all([
    sb().from('sessions').select('*').eq('id', sessionId).single(),
    listQuestions(),
    sb().from('responses')
      .select('id, question_id, status, retry_count, final_attempt_id, attempts(id, attempt_no, stt_text, audio_path, duration_sec, created_at)')
      .eq('session_id', sessionId),
  ])
  fail(e1); fail(e2)
  const byQ = new Map((resps ?? []).map(r => [r.question_id, r]))
  const rows: DetailRow[] = questions.map(question => {
    const r = byQ.get(question.id)
    return {
      question,
      status: (r?.status ?? 'none') as DetailRow['status'],
      retryCount: r?.retry_count ?? 0,
      finalAttemptId: r?.final_attempt_id ?? null,
      attempts: ((r?.attempts ?? []) as AttemptRow[]).sort((a, b) => a.attempt_no - b.attempt_no),
    }
  })
  return { session: s as unknown as SessionRow, rows }
}

/** CSV용: 응답 기준 조회 (시도 0건인 건너뜀/진행중 응답도 포함, 세션 시작시각→문항순번 정렬) */
export async function exportRows() {
  const { data, error } = await sb().from('responses')
    .select(`status, retry_count,
      sessions!inner(child_name, child_age, started_at),
      questions!inner(order_no, difficulty, text),
      attempts(attempt_no, stt_text, audio_path, duration_sec, created_at)`)
    .order('started_at', { ascending: true, referencedTable: 'sessions' })
    .order('order_no', { ascending: true, referencedTable: 'questions' })
  fail(error)
  return data!
}
