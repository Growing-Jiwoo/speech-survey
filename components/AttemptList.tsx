'use client'
import { useState } from 'react'

export interface AttemptView { id: string; attemptNo: number; sttText: string; url: string; isFinal: boolean }

export function AttemptList({ attempts }: { attempts: AttemptView[] }) {
  const [open, setOpen] = useState(false)
  const final_ = attempts.find(a => a.isFinal) ?? attempts[attempts.length - 1]
  const history = attempts.filter(a => a !== final_)
  if (!final_) return null
  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="font-sans">{final_.sttText || <span className="text-berry">(인식 실패)</span>}</p>
        <audio controls src={final_.url} preload="none" className="h-8" />
      </div>
      {history.length > 0 && (
        <button onClick={() => setOpen(o => !o)} className="mt-1 text-xs text-ink/50 underline">
          이전 시도 {history.length}개 {open ? '접기' : '보기'}
        </button>
      )}
      {open && history.map(a => (
        <div key={a.id} className="mt-1 flex items-center gap-3 pl-3 text-sm text-ink/60">
          <span>#{a.attemptNo}</span>
          <p className="font-sans">{a.sttText || '(인식 실패)'}</p>
          <audio controls src={a.url} preload="none" className="h-8" />
        </div>
      ))}
    </div>
  )
}
