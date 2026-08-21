import type { RosterChild } from './roster'
import { sb } from './supabase'

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export interface NewSessionInput {
  /** 학급 정보의 원본 — 세션 행에 비정규화 복사한다(스펙 "DB" 절). 코드를 나중에 고쳐도
   *  이미 만든 세션은 검사 당시 값을 유지한다(임상 기록 관점). */
  classCode: ClassCodeRow
  childNo: number
  birthYmd: string; gender: '남' | '여'; childName: string
}

export async function createSession(s: NewSessionInput): Promise<string> {
  const c = s.classCode
  const { data, error } = await sb().from('sessions').insert({
    class_code_id: c.id, child_no: s.childNo,
    school_region: c.school_region, school_id: c.school_id, school_name: c.school_name,
    grade: c.grade, class_no: c.class_no,
    teacher_name: c.teacher_name, teacher_phone: c.teacher_phone, teacher_email: c.teacher_email,
    birth_ymd: s.birthYmd, gender: s.gender, child_name: s.childName,
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

/** 낱말 쓰기(G1) 답 — 문항 만점이 1이라 boolean으로 담는다 */
export interface WritingAnswer { itemCode: string; canWrite: boolean }

/** 낱말 해독 O/X — 관리자 채점(saveScores)이 쓴다 */
export interface ReadingMark { itemCode: string; correct: boolean }

/** 어절 수 점수 — 문장 읽기유창성(rs..)과 문장 쓰기(sw..)가 같은 테이블을 쓴다 */
export interface SentenceScore { itemCode: string; words: number }

export type SubmitResult = 'ok' | 'not_found' | 'already_submitted'

export interface SubmitInput {
  sessionId: string
  /** 낱말 쓰기 양식(G1)에서만 채워진다 */
  writing: WritingAnswer[]
  /** 문장 쓰기 양식(G2)에서만 채워진다 */
  sentenceWriting: SentenceScore[]
  checklist: string[]
}

/**
 * 최종 제출: 쓰기 답을 먼저 저장하고 **`submitted_at`을 마지막에** 확정한다.
 * 업데이트 0건이면 미존재/기제출을 구분해 반환(라우트에서 404/409 처리).
 *
 * ⚠️ 순서를 되돌리지 말 것. 예전에는 `submitted_at`을 먼저 확정하고 쓰기 답을 나중에
 * 넣었는데, 그 사이에 일시 장애가 끼면 **쓰기 점수가 영구히 사라졌다**: 함수가 던져
 * 라우트가 502를 주고, 검사자가 다시 [제출]을 누르면 세션이 이미 제출 상태라 409로
 * 막힌다. 쓰기 채점(낱말 쓰기·문장 쓰기)은 녹음이 없어 **검사 중 검사자 입력이 유일한
 * 채점 경로**이므로(README "문항 구성") 관리자 결과지에서 채울 수도 없다 — 10점 만점
 * 과제가 기록에서 통째로 빈다. 검사자는 "제출 실패"와 "이미 제출됨"이 모순돼 갇힌다.
 *
 * 지금 순서에서는 확정이 실패해도 세션이 미제출로 남아 **재시도가 그대로 통과한다.**
 * 쓰기 답 upsert는 `(session_id, item_code)` 멱등이라 두 번 들어가도 같은 결과다.
 * (사용자 확정 2026-08-21 — 임상 규칙 아님, 실패 모드 비교에 따른 개발 판단)
 */
export async function submitSession(input: SubmitInput): Promise<SubmitResult> {
  const { sessionId, writing, sentenceWriting, checklist } = input

  // 쓰기 답보다 먼저 상태를 본다: 미존재 세션에 답을 넣으면 FK 위반으로 던져
  // 404·409를 구분할 수 없고, 제출된 세션은 애초에 잠겨 있어야 한다.
  // 라우트도 같은 조회를 한다(학년으로 문항 코드를 검증해야 하므로) — 중복이지만
  // 한쪽을 지우지 말 것: 라우트 것은 검증용이고 이것은 쓰기 순서의 전제다.
  const before = await sessionState(sessionId)
  if (before.state === 'missing') return 'not_found'
  if (before.state === 'submitted') return 'already_submitted'

  if (writing.length > 0) {
    const rows = writing.map(w => ({ session_id: sessionId, item_code: w.itemCode, can_write: w.canWrite }))
    const { error: e2 } = await sb().from('writing_answers').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(e2)
  }
  if (sentenceWriting.length > 0) {
    const rows = sentenceWriting.map(s => ({ session_id: sessionId, item_code: s.itemCode, words: s.words }))
    const { error: e4 } = await sb().from('sentence_scores').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(e4)
  }

  // `.is('submitted_at', null)`은 여기 남겨 둔다 — 위 상태 확인과 이 업데이트 사이에
  // 다른 기기가 제출했을 때 재제출을 막는 것은 이 조건뿐이다(경쟁 조건의 최종 방어).
  const { data, error } = await sb().from('sessions')
    .update({ checklist, submitted_at: new Date().toISOString() })
    .eq('id', sessionId).is('submitted_at', null).select('id')
  fail(error)
  if ((data ?? []).length === 0) {
    const after = await sessionState(sessionId)
    return after.state === 'submitted' ? 'already_submitted' : 'not_found'
  }
  return 'ok'
}

/**
 * 관리자 채점 저장. 낱말 O/X는 reading_marks에, 문장 어절 수는 sentence_scores에 upsert한다.
 * reading_marks는 원래 검사자 현장 채점의 착지점이자 관리자 최종 채점의 저장소로 공유됐으나,
 * 현장 채점 자체가 폐기되어(담당자 확정 2026-08-13) 이제 이 함수만 쓴다.
 * 제출 여부와 무관하게 언제든 다시 채점할 수 있다.
 */
export async function saveScores(
  sessionId: string, marks: ReadingMark[], sentences: SentenceScore[],
  /** 관리자 채점이 소유하는 문장 코드(rs..). 아래 "안 보낸 것 삭제"의 범위를 이 집합으로 제한한다 —
   *  같은 테이블에 검사 중 수집된 문장 쓰기 점수(sw..)가 함께 들어 있어, 범위를 두지 않으면
   *  관리자가 채점을 저장할 때마다 아동의 문장 쓰기 점수가 통째로 지워진다. */
  ownedCodes: string[],
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
  const stale = sb().from('sentence_scores').delete()
    .eq('session_id', sessionId)
    .in('item_code', ownedCodes)
  const { error: delErr } = await (keep.length > 0
    ? stale.not('item_code', 'in', `(${keep.join(',')})`)
    : stale)
  fail(delErr)
}

/** 세션 존재·제출 상태 + 학년 조회(업로드/제출 가드용).
 *  학년을 함께 돌려주는 이유: 어떤 문항 코드가 유효한지는 학년(검사지)에 따라 다르므로
 *  라우트가 세션의 양식으로 검증해야 한다. 어차피 같은 행을 읽으니 질의는 늘지 않는다. */
export async function sessionState(sessionId: string): Promise<{
  state: 'missing' | 'open' | 'submitted'; grade: number
}> {
  const { data, error } = await sb().from('sessions')
    .select('submitted_at, grade').eq('id', sessionId).maybeSingle()
  fail(error)
  if (!data) return { state: 'missing', grade: 0 }
  return { state: data.submitted_at ? 'submitted' : 'open', grade: data.grade as number }
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

/**
 * 아동 식별값(번호·이름·성별·생년월일)을 고친다. 세션이 없으면 `null`을 돌려준다 —
 * 호출부가 404와 500(장애)을 구분할 수 있게(`sessionDetail`과 같은 규약).
 *
 * **점수는 건드리지 않는다.** 녹음도 옮기지 않는다 — 저장 경로가
 * `{sessionId}/{itemCode}_{attemptNo}`라 아동 번호·이름이 들어가지 않기 때문이다.
 * 번호를 고쳐도 파일이 고아가 되지 않는 것이 이 기능을 안전하게 만드는 전제다.
 *
 * `original_identity`는 **처음 고칠 때만** 채운다(`?? 현재값`). 두 번째 수정에서 덮어쓰면
 * "처음 들어온 값"을 잃어, 잘못 고친 것을 되돌릴 근거가 사라진다.
 */
export async function updateSessionIdentity(
  id: string,
  v: { childNo: number; name: string; gender: string; birthYmd: string },
): Promise<SessionRow | null> {
  // 원본 보존 여부를 판단하려면 현재 값을 먼저 읽어야 한다. 읽기와 쓰기 사이에 다른
  // 관리자가 같은 세션을 고치면 나중 쓰기가 이긴다 — 관리자는 소수라 낙관적으로 둔다.
  const { data: cur, error: readErr } = await sb()
    .from('sessions').select(SESSION_COLS).eq('id', id).maybeSingle()
  fail(readErr)
  if (!cur) return null
  const prev = cur as unknown as SessionRow

  const { data, error } = await sb().from('sessions').update({
    child_no: v.childNo, child_name: v.name, gender: v.gender, birth_ymd: v.birthYmd,
    edited_at: prev.edited_at ?? new Date().toISOString(),
    original_identity: prev.original_identity ?? {
      child_no: prev.child_no, child_name: prev.child_name,
      gender: prev.gender, birth_ymd: prev.birth_ymd,
    },
  }).eq('id', id).select(SESSION_COLS).maybeSingle()
  fail(error)
  return (data as unknown as SessionRow) ?? null
}

export async function uploadRecording(path: string, bytes: Buffer, mime: string): Promise<void> {
  const doUpload = () => sb().storage.from('recordings')
    .upload(path, bytes, { contentType: mime, upsert: true })
  let { error } = await doUpload()
  // 스토리지 일시 오류는 즉시 한 번 더 쏘면 대부분 넘어간다. 1회로 끊는 이유: 검사 화면은
  // 녹음을 낙관적으로 "완료"로 표시하고 뒤에서 올리므로, 여기서 오래 끌수록 실패가 재시도
  // 배너에 늦게 뜬다 — 아이는 이미 다음 문항으로 넘어간 뒤다.
  if (error) ({ error } = await doUpload())
  if (error) throw new Error(`녹음 업로드 실패: ${error.message}`)
}

export async function signedAudioUrl(path: string): Promise<string> {
  const { data, error } = await sb().storage.from('recordings').createSignedUrl(path, 3600)
  fail(error)
  return data!.signedUrl
}

// ---------- 학급 코드 (스펙 2026-08-13 — 관리자 발급, 세션 생성이 비정규화 복사) ----------

export interface ClassCodeRow {
  id: string
  code: string
  school_region: string; school_id: string; school_name: string
  grade: number; class_no: number
  teacher_name: string; teacher_phone: string | null; teacher_email: string | null
  created_at: string
  /** 'pending' = 교사 신청 접수만 된 상태(관리자 승인 전) — 검사 시작에 쓸 수 없다 */
  status: 'pending' | 'active'
  /** 신청 접수 시각. 관리자 직접 발급분은 null(승인 절차를 거치지 않았다) */
  applied_at: string | null
}

const CLASS_CODE_COLS = 'id, code, school_region, school_id, school_name, grade, class_no, teacher_name, teacher_phone, teacher_email, created_at, status, applied_at'

export interface NewClassCodeInput {
  code: string
  schoolRegion: string; schoolId: string; schoolName: string
  grade: number; classNo: number
  teacherName: string
  /** 전화·이메일 중 하나는 non-null(스키마가 보장). 전화는 하이픈 없는 숫자만 */
  teacherPhone: string | null; teacherEmail: string | null
}

/** unique 충돌이면 'duplicate' — 라우트가 새 코드로 재시도한다(23505 = unique_violation). */
export async function insertClassCode(c: NewClassCodeInput): Promise<ClassCodeRow | 'duplicate'> {
  const { data, error } = await sb().from('class_codes').insert({
    code: c.code,
    school_region: c.schoolRegion, school_id: c.schoolId, school_name: c.schoolName,
    grade: c.grade, class_no: c.classNo,
    teacher_name: c.teacherName, teacher_phone: c.teacherPhone, teacher_email: c.teacherEmail,
  }).select(CLASS_CODE_COLS).single()
  if ((error as { code?: string } | null)?.code === '23505') return 'duplicate'
  fail(error)
  return data as unknown as ClassCodeRow
}

/**
 * 교사 신청 접수: pending 코드 + 명단을 넣는다.
 * supabase 클라이언트에는 트랜잭션이 없어, 명단 삽입이 실패하면 코드 행을 지워 되돌린다 —
 * 명단 없는 pending이 남으면 승인 화면에 빈 학급이 떠서 관리자가 판단할 수 없다.
 * (cascade가 있으므로 코드 행 삭제로 부분 삽입된 명단도 함께 정리된다.)
 *
 * 빈 명단은 막지 않는다 — 최소 1명 규칙은 `applySchema`(schema.ts)가 단일 소스로 갖는다.
 * 여기서 한 번 더 세면 규칙이 두 곳으로 갈라져, 고칠 때 한쪽만 고치게 된다.
 */
export async function insertApplication(
  c: NewClassCodeInput, roster: RosterChild[],
): Promise<ClassCodeRow | 'duplicate'> {
  const { data, error } = await sb().from('class_codes').insert({
    code: c.code,
    school_region: c.schoolRegion, school_id: c.schoolId, school_name: c.schoolName,
    grade: c.grade, class_no: c.classNo,
    teacher_name: c.teacherName, teacher_phone: c.teacherPhone, teacher_email: c.teacherEmail,
    status: 'pending', applied_at: new Date().toISOString(),
  }).select(CLASS_CODE_COLS).single()
  if ((error as { code?: string } | null)?.code === '23505') return 'duplicate'
  fail(error)
  const row = data as unknown as ClassCodeRow

  const { error: e2 } = await sb().from('class_roster').insert(roster.map(r => ({
    class_code_id: row.id, child_no: r.childNo, child_name: r.name,
    gender: r.gender, birth_ymd: r.birthYmd,
  })))
  if (e2) {
    const { error: rollbackErr } = await sb().from('class_codes').delete().eq('id', row.id)
    // 롤백까지 실패하면 명단 없는 pending이 그대로 남는다. 자동 정리 경로가 없으므로
    // 코드를 에러 문구에 실어, 로그를 본 사람이 무엇을 지워야 하는지 알 수 있게 한다.
    if (rollbackErr) throw new Error(`${e2.message} (pending 코드 ${row.code} 롤백 실패 — 수동 삭제 필요)`)
    fail(e2)
  }
  return row
}

/**
 * 승인: pending → active. 멱등 — 이미 active면 already:true로 알려 라우트가 승인 메일을
 * 다시 보내지 않게 한다(더블클릭·새로고침 재전송 방지).
 *
 * 가드를 여기 두는 이유: `.eq('status','pending')`이 붙은 **업데이트 한 방**만이 경쟁 없이
 * "내가 pending을 active로 바꾼 첫 호출인지"를 판정한다. 라우트가 먼저 조회해 확인하면
 * 조회~업데이트 사이에 다른 탭이 승인해도 둘 다 "내가 했다"로 보고 메일이 두 번 나간다.
 *
 * 업데이트 0건인데 행이 여전히 pending이면 던진다. **정상 경로로는 일어날 수 없다** —
 * service role 클라이언트라 RLS가 걸릴 일도 없고, 같은 행을 겨냥한 두 승인 중 하나는 반드시
 * active를 본다. 즉 이 분기는 원인을 아는 복구 로직이 아니라 이상 감지기다(공짜이고
 * fail-closed라 남겨 둔다). 그래도 already:true로 뭉개면 안 되는 이유는 분명하다 —
 * 라우트가 메일을 건너뛰어 교사는 코드를 못 받고 관리자는 보냈다고 생각한다.
 */
export async function approveClassCode(
  id: string,
): Promise<{ row: ClassCodeRow; already: boolean } | null> {
  const { data, error } = await sb().from('class_codes')
    .update({ status: 'active' }).eq('id', id).eq('status', 'pending')
    .select(CLASS_CODE_COLS)
  fail(error)
  if ((data ?? []).length > 0) return { row: data![0] as unknown as ClassCodeRow, already: false }
  const { data: cur, error: e2 } = await sb().from('class_codes')
    .select(CLASS_CODE_COLS).eq('id', id).maybeSingle()
  fail(e2)
  if (!cur) return null
  const row = cur as unknown as ClassCodeRow
  if (row.status !== 'active') throw new Error(`승인이 반영되지 않았습니다(코드 ${row.code}) — 다시 시도해 주세요.`)
  return { row, already: true }
}

/** 승인 화면이 검토하는 신청 명단 1줄. 읽기 전용 — 이 앱에서 명단을 고치는 경로는 없다
 *  (교사가 올린 원문 그대로 관리자가 확인하고, 틀렸으면 반려 = 삭제 후 재신청이다). */
export interface RosterRow {
  child_no: number; child_name: string; gender: '남' | '여'; birth_ymd: string
}

/** 학급 신청 명단 조회. **번호 순**으로 고정한다 — 관리자는 이 표를 교사가 보낸 명렬표와
 *  줄을 맞춰 보며 검토하므로, 순서가 흔들리면 같은 명단인지 눈으로 확인할 수 없다. */
export async function listRoster(classCodeId: string): Promise<RosterRow[]> {
  const { data, error } = await sb().from('class_roster')
    .select('child_no, child_name, gender, birth_ymd')
    .eq('class_code_id', classCodeId).order('child_no')
  fail(error)
  return (data ?? []) as unknown as RosterRow[]
}

/** 명단 + 각 아동의 검사 상태. 드롭다운이 "검사함"을 표시하기 위한 것 —
 *  학급 세션을 한 번에 읽어 childTestState와 같은 판정을 번호별로 만든다.
 *  (verify-code의 옛 방침 "번호 목록을 만들지 않는다"는 명단 도입으로 뒤집혔다:
 *   코드 소지 = 학급 접근이라는 전제에서, 명단을 주면서 검사 여부만 숨기는 것은 무의미하다.)
 *  참고(advisory, 실제 고치지는 않음): 직접 입력 모드로 만든 세션의 child_no가 우연히 명단의
 *  번호와 같으면, 그 세션이 명단에 없는 아이 것이라도 이 함수는 명단의 그 번호를 "검사함"으로
 *  표시한다 — child_no만으로 매칭하고 명단 소속 여부까지 확인하지 않기 때문이다. */
export async function rosterWithTested(classCodeId: string): Promise<{
  childNo: number; name: string; gender: '남' | '여'; birthYmd: string
  tested: 'submitted' | 'inProgress' | null
}[]> {
  const roster = await listRoster(classCodeId)
  const { data, error } = await sb().from('sessions').select('child_no, submitted_at')
    .eq('class_code_id', classCodeId)
  fail(error)
  const state = new Map<number, 'submitted' | 'inProgress'>()
  for (const s of data ?? []) {
    const cur = state.get(s.child_no)
    if (s.submitted_at) state.set(s.child_no, 'submitted')
    else if (cur !== 'submitted') state.set(s.child_no, 'inProgress')
  }
  return roster.map(r => ({
    childNo: r.child_no, name: r.child_name, gender: r.gender, birthYmd: r.birth_ymd,
    tested: state.get(r.child_no) ?? null,
  }))
}

export type ClassCodeListRow = ClassCodeRow & {
  sessions: { count: number }[]
  /** 신청 명단 인원 수. 목록에서 "몇 명 신청인지"를 보여줘 관리자가 명단을 펼칠지 판단한다
   *  (관리자 직접 발급분은 명단이 없어 0이다). */
  class_roster: { count: number }[]
}

export async function listClassCodes(): Promise<ClassCodeListRow[]> {
  const { data, error } = await sb().from('class_codes')
    .select(`${CLASS_CODE_COLS}, sessions(count), class_roster(count)`)
    .order('created_at', { ascending: false })
  fail(error)
  return (data ?? []) as unknown as ClassCodeListRow[]
}

/** 세션이 참조 중이면 'in_use'(23503 = foreign_key_violation — FK restrict가 최종 방어). */
export async function deleteClassCode(id: string): Promise<'ok' | 'in_use'> {
  const { error } = await sb().from('class_codes').delete().eq('id', id)
  if ((error as { code?: string } | null)?.code === '23503') return 'in_use'
  fail(error)
  return 'ok'
}

export async function findClassCode(code: string): Promise<ClassCodeRow | null> {
  const { data, error } = await sb().from('class_codes')
    .select(CLASS_CODE_COLS).eq('code', code).maybeSingle()
  fail(error)
  return (data as unknown as ClassCodeRow) ?? null
}

/** 같은 학급·같은 아동 번호의 기존 검사 상태 — 중복 검사 경고용.
 *  제출본이 하나라도 있으면 'submitted', 미제출만 있으면 'inProgress', 없으면 null.
 *  ⚠️ 번호 목록을 만들지 않는다 — 물어본 번호 하나에 대해서만 답한다(스펙 "중복 검사 경고"). */
export async function childTestState(
  classCodeId: string, childNo: number,
): Promise<'submitted' | 'inProgress' | null> {
  const { data, error } = await sb().from('sessions').select('submitted_at')
    .eq('class_code_id', classCodeId).eq('child_no', childNo)
  fail(error)
  if (!data || data.length === 0) return null
  return data.some(r => r.submitted_at) ? 'submitted' : 'inProgress'
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
  /** 발급된 학급 코드 참조. 학급 정보는 생성 시점에 아래 컬럼들로 복사돼 있다 */
  class_code_id: string
  /** 학급 내 출석 번호(1~99). 같은 번호의 재검사가 있을 수 있다 */
  child_no: number
  school_region: string; school_id: string; school_name: string
  birth_ymd: string; grade: number; class_no: number; gender: string
  child_name: string; teacher_name: string
  teacher_phone: string | null; teacher_email: string | null
  checklist: string[]
  started_at: string; submitted_at: string | null
  guardian_consented_at: string | null // 법정대리인 동의 확인 시각(도입 전 수집분은 null)
  /** 아동 식별값을 관리자가 고친 시각. null이면 한 번도 고치지 않았다 */
  edited_at: string | null
  /** 최초 수정 직전의 아동 식별값. 두 번째 수정부터는 덮어쓰지 않는다 —
   *  알고 싶은 것은 "처음 들어온 값"이지 중간 단계가 아니다 */
  original_identity: OriginalIdentity | null
}

/** 수정 전 아동 식별값 스냅샷(jsonb). 표시 전용이라 읽기만 한다. */
export interface OriginalIdentity {
  child_no: number; child_name: string; gender: string; birth_ymd: string
}

export interface RecordingRow {
  item_code: string; attempt_no: number; audio_path: string
  duration_sec: number | null; created_at: string
}

export interface WritingRow { item_code: string; can_write: boolean }

const SESSION_COLS = 'id, class_code_id, child_no, school_region, school_id, school_name, birth_ymd, grade, class_no, gender, child_name, teacher_name, teacher_phone, teacher_email, checklist, started_at, submitted_at, guardian_consented_at, edited_at, original_identity'

export type SessionListRow = SessionRow & {
  recordings: { item_code: string }[]
  /** 진행률 분자(응답 존재 여부)에 값이 필요해 can_write까지 싣는다 */
  writing_answers: { item_code: string; can_write: boolean }[]
  /** 문장 읽기유창성(rs..)과 문장 쓰기(sw..)가 섞여 있다 — 진행률은 쓰기 코드만 센다 */
  sentence_scores: { item_code: string; words: number }[]
}

const MAX_LIST_ROWS = 5000

export async function listSessions(): Promise<SessionListRow[]> {
  const { data, error } = await sb().from('sessions')
    .select(`${SESSION_COLS}, recordings(item_code), writing_answers(item_code, can_write), sentence_scores(item_code, words)`)
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

/** 세션이 없으면 `session`이 null이다 — 호출부가 404와 500(장애)을 구분할 수 있게 한다.
 *  `.single()`을 쓰면 행이 0개일 때 throw해서 삭제된 세션이 장애와 같은 500으로 뭉뚱그려진다
 *  (실제로 그랬다 — E2E 2026-08-14에서 확인). 조회 계열은 `.maybeSingle()`로 통일한다. */
export async function sessionDetail(sessionId: string): Promise<{
  session: SessionRow | null; recordings: RecordingRow[]; writing: WritingRow[]
  marks: MarkRow[]; sentences: SentenceScoreRow[]
}> {
  const [{ data: s, error: e1 }, { data: recs, error: e2 }, { data: ans, error: e3 },
    { data: mk, error: e4 }, { data: ss, error: e5 }] = await Promise.all([
      sb().from('sessions').select(SESSION_COLS).eq('id', sessionId).maybeSingle(),
      sb().from('recordings').select('item_code, attempt_no, audio_path, duration_sec, created_at')
        .eq('session_id', sessionId).order('item_code').order('attempt_no'),
      sb().from('writing_answers').select('item_code, can_write').eq('session_id', sessionId),
      sb().from('reading_marks').select('item_code, correct').eq('session_id', sessionId),
      sb().from('sentence_scores').select('item_code, words').eq('session_id', sessionId),
    ])
  fail(e1); fail(e2); fail(e3); fail(e4); fail(e5)
  return {
    session: (s as unknown as SessionRow) ?? null,
    recordings: (recs ?? []) as RecordingRow[],
    writing: (ans ?? []) as WritingRow[],
    marks: (mk ?? []) as MarkRow[],
    sentences: (ss ?? []) as SentenceScoreRow[],
  }
}
