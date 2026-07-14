import { sb } from './supabase'

export interface Question { id: number; order_no: number; text: string; difficulty: string }

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export async function listQuestions(): Promise<Question[]> {
  const { data, error } = await sb().from('questions').select('*').order('order_no')
  fail(error)
  return data!
}

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
