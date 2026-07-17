// components/ConfirmDialog.tsx — 확인 모달 공용 컴포넌트.
// 검토 페이지(제출 확인)와 관리자 결과지(세션 삭제)가 같은 구조를 복제하던 것을 통합.
'use client'
import { useCallback, useEffect, useId } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/**
 * 접근성·안전장치 내장: 포커스 트랩(초기 포커스는 취소 버튼) · Esc/오버레이 클릭 닫기 ·
 * busy 중 닫기 방지 · 열려 있는 동안 배경 스크롤 잠금.
 */
export function ConfirmDialog({
  open, title, children, error, busy = false, danger = false,
  confirmLabel, cancelLabel = '취소', onConfirm, onClose,
}: {
  open: boolean
  /** 모달 제목(질문). 줄바꿈이 필요하면 ReactNode로 전달 */
  title: React.ReactNode
  /** 본문(부가 설명·경고 등) — 여백은 호출부에서 mt-3 등으로 관리 */
  children?: React.ReactNode
  /** 확인 동작 실패 문구(있을 때만 role="alert"로 표시) */
  error?: string
  /** 진행 중 여부 — true면 닫기·버튼 모두 잠긴다 */
  busy?: boolean
  /** 파괴적 동작(삭제 등)이면 확인 버튼을 경고색으로 */
  danger?: boolean
  confirmLabel: React.ReactNode
  cancelLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  const titleId = useId()
  const close = useCallback(() => { if (!busy) onClose() }, [busy, onClose])
  const trapRef = useFocusTrap(open, close)

  // 모달이 떠 있는 동안 배경 스크롤 잠금(모바일에서 뒷배경이 딸려 움직이는 것 방지).
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={close}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="w-full max-w-sm overscroll-contain rounded-[20px] bg-white p-6 shadow-xl"
        onClick={e => e.stopPropagation()}>
        <h2 id={titleId} className="text-center text-lg font-bold leading-relaxed">{title}</h2>
        {children}
        {error && <p role="alert" className="mt-3 text-center text-sm text-rec-deep">{error}</p>}
        <div className="mt-5 flex gap-2.5">
          {/* 취소가 첫 포커스 대상(실수로 Enter를 눌러도 파괴적 동작이 실행되지 않도록) */}
          <button onClick={close} disabled={busy} className="btn-ghost h-[50px] flex-1">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={busy}
            className={`${danger ? 'btn-danger' : 'btn-primary'} h-[50px] flex-1`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
