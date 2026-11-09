// lib/excel-export.ts — 관리자 [전체 데이터 받기](GET /api/admin/export.xlsx)의 표를 만든다. DB·HTTP를 모른다(행 모양만 받는다).
//
// 담당자 요청(2026-11-05) 원문 「전체데이터 파일을 엑셀파일로 받을 수 있는 방법이 있을지. 학년, 학기, 아동코드, 성별, 각 검사
// 점수, 체크리스트에 대한 데이터.」 — 무엇을 담을지는 **담당자 확정(2026-11-06, 사용자 전달)** 회신 원문 그대로다:
// - 「엑셀에서는 아동 코드만 있어야 할 것 같아!」 → 이름·생년월일·학교·담임을 싣지 않는다. 아동 코드는 lib/child-code `childCode`
//   (신청 순번 + 출석 번호, `017-03`). 이름·생년월일은 DB에서 읽지도 않는다(lib/db `exportSessions`).
// - 「문항별 OX가 필요해요! 그리고 유창성은 문항별 정확하게 읽은 어절 수, 초, 원점수!」 → 낱말 해독·낱말 쓰기는 문항마다 O/X,
//   문장 읽기유창성은 문장마다 정확 어절 수와 읽은 시간(초).
// - 「원점수」가 무엇인지 물었더니(2026-11-07 회신 원문) 「1. 각 문항별 정확하게 읽은 어절 수, 2. 각 문항별 시간, 3. 각 문항별 원점수
//   (예: 1번 문항에서 정확어절수÷시간×10) 4.그리고 5개 문항에 대한 원점수(너가 말한 거에서 2번)」 → 문장마다 어절·초·원점수(그 문장의
//   10초당 어절)와 전체 원점수(문장 읽기유창성 총점, 10초당 어절)를 싣는다. **담당자 확정(2026-11-07).** 원문의 「5개 문항」은 문장
//   읽기유창성의 문장 전부(양식마다 4문장)다 — 담당자 확정(2026-11-07, 다시 물었더니 4개가 맞다고 했다, 사용자 전달).
// - (재검사한 아이는 마지막 검사만?) 「응응 그렇게 하자! 재검사한 경우에는 내가 미리 채점할 때 최종버전만 남겨두고 다 삭제하려고!」
//   → 같은 아이(학급 + 출석 번호)의 **같은 학기** 제출 검사 가운데 마지막 것 한 줄(`latestPerTerm`).
//
// 아래는 **개발 판단(2026-11-06) — 담당자 회신 아님**:
// - **양식마다 시트 하나**(탭 이름 = 양식 id). 학년·학기마다 문항 수와 문장의 어절 수가 달라 한 시트에 섞으면 같은 열이 다른
//   문항을 가리킨다.
//
// 사용자 확정(2026-11-06) — 담당자 회신 아님:
// - 문항 열 머리글은 **문항 번호 + 실제 문항**(`낱말01 · <낱말>`·`문장1 어절 · <문장>`·`쓰기01 · <낱말·문장>`)이다. 번호만 두면
//   담당자가 매번 검사지를 다시 펴 맞춰 봐야 한다(사용자 지시). 문항은 실행 때 양식(`lib/forms` — 운영은 FORMS_KEY로 연 실제 문항)에서
//   읽는다 — 이 파일·테스트에는 실제 낱말이 없다(CLAUDE.md §2). 받은 파일은 문항이 담긴 자료라 관리자만 받는다.
// - 「임시 기준」 열은 두지 않는다 — 3~6학년은 아직 검사하지 않아 기준표도 문항도 없다(사용자 지시).
// - 과제 합계·판정은 **그 과제의 채점이 다 끝났을 때만** 채운다(미채점을 0점·위험으로 찍지 않는다 — 결과보고서 PDF와 같은 규칙).
//   최종 판정은 세 과제가 다 끝나야 채운다(lib/results `evaluateSession`과 같다). 채점하지 않은 문항 칸은 비운다(0이 아니다).
//
// 문항 값은 관리자 결과지·교사 결과지·결과보고서 PDF와 **같은 채점 사슬**에서 꺼낸다(lib/results `scoreInputFor` → 제출된 검사의
// 미녹음 고정 `withUnrecordedFixed` → lib/scoring `scoreSession`). 그래서 미녹음 문항은 결과보고서와 같이 낱말 X, 문장은 그 문장의
// 제한 시간·0어절로 나온다. 여기서 채점 규칙을 새로 만들지 않는다.
import { FORMS, type SurveyForm } from './forms'
import { CHECKLIST_AREAS, itemsFor } from './items'
import { pad2, termKeyOf, termLabel, termOf } from './format'
import { kstDateKey } from './adminStats'
import { childCode } from './child-code'
import {
  TASK_KEYS, VERDICT_LABEL, clampWords, finalVerdict, fluencyOf, scoreSession, type ScoreInput, type ScoreResult, type TaskKey,
} from './scoring'
import { scoreInputFor, type ScoreSource } from './results'
import type { Cell, SheetData } from './xlsx-write'

/** 내보내기 한 줄의 재료 — lib/db `exportSessions`가 돌려준다. 이름·생년월일·학교는 **없다**(아동 코드만). */
export interface ExportSessionRow extends ScoreSource {
  id: string
  class_code_id: string
  /** 학급 신청 순번(`class_codes.apply_seq`, migration 010) — 아동 코드 앞자리 */
  apply_seq: number
  child_no: number
  gender: string
  checklist: string[]
  started_at: string
}


/**
 * 아이(학급 + 출석 번호)·학기마다 **마지막 제출 검사** 하나. 담당자 확정(2026-11-06) 「응응 그렇게 하자!」(재검사는 마지막 검사만).
 * 마지막 = 시작 시각이 가장 늦은 것(재검사 차수를 세는 순서 — lib/adminStats `retestOrdinals`와 같다). 제출되지 않은 검사는 뺀다.
 * 같은 아이라도 학기가 다르면 다른 줄이다 — 같은 학급 코드로 1·2학기를 이어 하면 아동 코드가 같고 학기 열이 다르다.
 */
export function latestPerTerm(rows: ExportSessionRow[]): ExportSessionRow[] {
  const last = new Map<string, ExportSessionRow>()
  for (const r of rows) {
    if (!r.submitted_at) continue
    // 학기는 lib/format termOf(KST 학년도 + semesterOf) — 교사 결과지·관리자 목록과 같은 학기
    const key = `${r.class_code_id}:${r.child_no}:${termKeyOf(r.started_at)}`
    const prev = last.get(key)
    if (!prev || r.started_at > prev.started_at || (r.started_at === prev.started_at && r.id > prev.id)) last.set(key, r)
  }
  return [...last.values()]
}

/** 한 줄을 만들 때 열마다 넘기는 값 */
interface Ctx {
  row: ExportSessionRow
  form: SurveyForm
  input: ScoreInput
  result: ScoreResult
}

interface Column { header: string; value: (c: Ctx) => Cell }

const ox = (v: boolean | undefined): Cell => (v === undefined ? null : v ? 'O' : 'X')
/** 채점이 끝난 과제만 값을 낸다 — 끝나지 않은 과제의 합은 0점 기반이라 점수가 아니다(lib/scoring `ScoreResult.complete`) */
const whenDone = (k: TaskKey, v: (c: Ctx) => Cell) => (c: Ctx): Cell => (c.result.complete[k] ? v(c) : null)
const verdictCol = (k: TaskKey) => whenDone(k, c => VERDICT_LABEL[c.result.verdict[k]])

/** 양식 한 장의 열 — 머리글과 값을 한 목록에서 만들어 둘이 어긋나지 않게 한다. */
/** 머리글에 붙이는 문항은 한 줄로 — 두 문장짜리 문항(2학기 문장 3·4번)은 문항 안에 줄바꿈이 있어, 그대로 넣으면 Excel 머리글 칸이
 *  두 줄이 되고 칸 높이가 들쭉날쭉했다(2026-11-07 운영 파일 점검, 사용자 확정 — 담당자 회신 아님). 문항 글자는 바꾸지 않고 줄바꿈만 띄어쓰기로 */
export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

export function exportColumns(form: SurveyForm): Column[] {
  const f = itemsFor(form)
  return [
    // 아동 코드만 — 담당자 확정(2026-11-06) 「엑셀에서는 아동 코드만 있어야 할 것 같아!」
    { header: '아동 코드', value: c => childCode(c.row.apply_seq, c.row.child_no) },
    { header: '학년', value: c => c.row.grade },
    { header: '학기', value: c => termLabel(termOf(c.row.started_at), { short: true }) },
    { header: '성별', value: c => c.row.gender },
    { header: '검사일', value: c => kstDateKey(new Date(c.row.started_at)) },
    { header: '양식', value: c => c.form.id },

    // 문항별 O/X — 담당자 확정(2026-11-06) 「문항별 OX가 필요해요!」. 머리글은 번호 + 실제 문항(사용자 확정 2026-11-06, 머리 주석)
    ...f.readItems.map((it, i): Column => ({ header: `낱말${pad2(i + 1)} · ${oneLine(it.text)}`, value: c => ox(c.input.marks[it.code]) })),

    // 유창성은 문장마다 정확 어절 수·초·원점수 — 담당자 확정(2026-11-06 「유창성은 문항별 정확하게 읽은 어절 수, 초, 원점수!」,
    // 원점수의 뜻은 2026-11-07 「각 문항별 원점수(예: 1번 문항에서 정확어절수÷시간×10)」)
    ...f.sentenceItems.flatMap((it, i): Column[] => {
      const words = (c: Ctx) => {
        const v = c.input.sentences[it.code]
        return v === undefined ? null : clampWords(f, it.code, v)
      }
      // 0초·음수·NaN은 입력이 없는 것(lib/scoring scoreSession의 tenthsOf와 같은 규칙) · 0.1초 단위 정수로 맞춘다
      const tenths = (c: Ctx) => {
        const v = c.input.times[it.code]
        return v !== undefined && Number.isFinite(v) && v > 0 ? Math.round(v * 10) : null
      }
      return [
        { header: `문장${i + 1} 어절 · ${oneLine(it.text)}`, value: words },
        { header: `문장${i + 1} 초`, value: c => { const t = tenths(c); return t === null ? null : t / 10 } },
        // 문장 원점수 = 그 문장의 정확 어절 ÷ 시간 × 10 — 총점과 같은 함수·같은 자리 반올림(lib/scoring fluencyOf). 어절·초가 다 있어야 낸다
        { header: `문장${i + 1} 원점수(어절/10초)`, value: c => {
          const w = words(c), t = tenths(c)
          return w === null || t === null ? null : fluencyOf(w, t)
        } },
      ]
    }),

    // 쓰기 — 1학년 낱말 쓰기는 낱말마다 O/X. 2학년 문장 쓰기는 **어절마다 O/X + 문장 합**(담당자 확정 2026-11-09 — 어느 어절이 틀렸는지
    // 보려고. 열 모양은 시안을 보고 정했다). 어절별 기록이 없는 옛 문장(화면 방식의 1점 문장)은 어절 칸을 비우고 합만 싣는다.
    ...f.writingItems.flatMap((it, i): Column[] => {
      const n = pad2(i + 1)
      if (form.writing.kind === 'word') return [{
        header: `쓰기${n} · ${oneLine(it.text)}`,
        value: c => { const v = c.input.writing[it.code]; return v === undefined ? null : ox(Number(v) > 0) },
      }]
      return [
        ...it.text.trim().split(/\s+/).map((w, k): Column => ({
          header: `쓰기${n}-${k + 1} · ${w}`,
          value: c => { const v = c.input.writing[it.code]; return typeof v === 'string' ? ox(v[k] === 'O') : null },
        })),
        { header: `쓰기${n} 합`, value: c => { const v = c.input.writing[it.code]; return v === undefined ? null : clampWords(f, it.code, v) } },
      ]
    }),

    { header: '낱말 해독 합', value: whenDone('wordReading', c => c.result.wordReading) },
    { header: '낱말 해독 판정', value: verdictCol('wordReading') },
    // 전체 원점수 = 문장 읽기유창성 총점(정확 어절 합 ÷ 읽은 시간 합 × 10 — 담당자 확정 2026-09-29·2026-10-20). 「원점수」가 이 값이라는 것은
    // 담당자 확정(2026-11-07 「5개 문항에 대한 원점수(너가 말한 거에서 2번)」). 정확 어절 합·시간 합 열은 묻지 않아 두지 않는다
    { header: '문장 읽기유창성 원점수(어절/10초)', value: whenDone('sentenceReading', c => c.result.sentenceReading) },
    { header: '문장 읽기유창성 판정', value: verdictCol('sentenceReading') },
    { header: '쓰기 합', value: whenDone('writing', c => c.result.writing) },
    { header: '쓰기 판정', value: verdictCol('writing') },
    // 세 과제가 다 끝나야 최종 판정 — lib/results evaluateSession과 같다(미채점을 위험으로 찍지 않는다)
    { header: '최종 판정', value: c =>
      (TASK_KEYS.every(k => c.result.complete[k]) ? VERDICT_LABEL[finalVerdict(c.result.verdict)] : null) },

    // 체크리스트 — 영역마다 한 열, 체크했으면 1(담당자 요청 2026-11-05 「체크리스트에 대한 데이터」)
    ...CHECKLIST_AREAS.map((a): Column => ({
      header: `체크리스트 ${a.label}`, value: c => ((c.row.checklist ?? []).includes(a.code) ? 1 : null),
    })),
  ]
}

/**
 * 세션 행들 → 시트들. 양식마다 한 시트(레지스트리 순서), 줄은 아동 코드 → 학기 순. 줄이 없는 양식은 시트를 만들지 않는다.
 * 모르는 양식 id는 lib/forms `formOfSession`이 던진다 — 다른 양식으로 그려 다른 문항 번호에 싣느니 파일을 못 만드는 편이 낫다.
 */
export function buildExportSheets(rows: ExportSessionRow[]): SheetData[] {
  const byForm = new Map<SurveyForm, Ctx[]>()
  for (const row of latestPerTerm(rows)) {
    const { form, input } = scoreInputFor(row)
    const list = byForm.get(form) ?? []
    list.push({ row, form, input, result: scoreSession(form, input) })
    byForm.set(form, list)
  }
  const termSort = (r: ExportSessionRow) => { const t = termOf(r.started_at); return t.year * 10 + t.semester }
  return FORMS.filter(form => byForm.has(form)).map(form => {
    const cols = exportColumns(form)
    const ctxs = byForm.get(form)!.sort((a, b) =>
      a.row.apply_seq - b.row.apply_seq || a.row.child_no - b.row.child_no || termSort(a.row) - termSort(b.row))
    return { name: form.id, rows: [cols.map(c => c.header), ...ctxs.map(ctx => cols.map(c => c.value(ctx)))] }
  })
}

/** 받는 파일 이름 — `읽기검사_전체데이터_2026-11-06.xlsx`(날짜는 KST 오늘) */
export const exportFileName = (date: string) => `읽기검사_전체데이터_${date}.xlsx`
