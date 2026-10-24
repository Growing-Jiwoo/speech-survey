// components/admin/ClassSheets.tsx — 학교를 고르면 그 학교의 학급마다 결과보고서 PDF를 한 파일로 받는 줄(담당자 요청 2026-10-24
// 「관리자도 학교, 학급별로 전체 기록지 다운」). 받는 파일은 교사 결과지의 [전체 PDF 다운로드]와 같다. 아이당 받을 수 있는
// 최신 1장, 번호순(lib/pdf/class-sheets). 학교 전체를 한 파일로 묶지 않는 것은 응답 크기 상한 때문이다(같은 파일 주석).
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { fetchFile, saveBlobAs } from '@/lib/download'
import { gradeClassLabel } from '@/lib/format'
import type { ClassCodeItem } from '@/hooks/useAdminQueries'

export function ClassSheets({ school, classes, loginHref }: {
  school: string
  /** 그 학교의 검사가 있는 학급(학년·반 순) */
  classes: ClassCodeItem[]
  loginHref: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<{ label: string; text: string; login: boolean } | null>(null)
  if (classes.length === 0) return null

  const label = (c: ClassCodeItem) => `${gradeClassLabel(c.grade, c.class_no)} ${c.teacher_name}`
  // 결과지 화면의 한 장 받기와 같은 방식(lib/download). 로그인이 끝났으면 서버 문구와 [다시 로그인]을 띄운다
  async function download(c: ClassCodeItem) {
    setBusy(c.id); setErr(null)
    const res = await fetchFile(`/api/admin/codes/${c.id}/sheets.pdf`, 'sheets.pdf', '결과지를 받지 못했어요. 다시 시도해 주세요.')
    setBusy(null)
    if (!res.ok) { setErr({ label: label(c), text: res.error, login: res.status === 401 }); return }
    saveBlobAs(res.blob, res.name)
  }

  return (
    <div className="border-b border-line px-5 py-3">
      <p className="text-[13px] font-bold text-ink-soft">{school} 학급별 결과지 받기</p>
      {/* 한 번에 한 학급만 만든다. 결과지 생성은 서버 CPU 일이라 겹쳐 눌러도 빨라지지 않는다 */}
      <div className="mt-2 flex flex-wrap gap-2">
        {classes.map(c => (
          <button key={c.id} type="button" onClick={() => void download(c)} disabled={busy !== null}
            className="rounded-lg border-[1.5px] border-line bg-well px-3 py-2 text-xs font-bold text-ink-soft transition hover:border-blue disabled:opacity-50">
            {busy === c.id ? `${label(c)} 만드는 중…` : label(c)}
          </button>
        ))}
      </div>
      {err && (
        <p role="alert" className="mt-2 text-[13px] text-rec-deep">
          {err.label}: {err.text}
          {err.login && <>{' '}<Link href={loginHref} className="font-bold text-blue underline">다시 로그인</Link></>}
        </p>
      )}
      <p className="mt-2 text-[12px] leading-relaxed text-ink-mute">
        선생님이 받는 「전체 PDF」와 같은 파일이에요. 읽기 채점이 끝난 아이마다 가장 최근 검사 한 장이 번호순으로 들어가요. 쓰기 채점 전인 아이는 쓰기·최종결과 칸이 비어 나가요.
      </p>
    </div>
  )
}
