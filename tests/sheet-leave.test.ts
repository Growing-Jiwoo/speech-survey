import { describe, expect, it, vi } from 'vitest'
import { saveThenLeave } from '@/lib/sheet-leave'

// 「저장하고 이동」 — 저장이 실패하면 떠나지 않는다(떠나면 keepalive가 실패를 삼켜 채점이 알림 없이 사라졌다).
describe('saveThenLeave', () => {
  it('[REGRESSION] 저장이 실패하면(로그인 만료 401) 이동하지 않고 실패 문구를 돌려준다', async () => {
    const leave = vi.fn()
    const err = await saveThenLeave(async () => '로그인이 끝났어요.', leave)
    expect(err).toBe('로그인이 끝났어요.')
    expect(leave).not.toHaveBeenCalled()
  })

  it('저장이 끝난 뒤에야 이동한다', async () => {
    const order: string[] = []
    await saveThenLeave(async () => { await Promise.resolve(); order.push('save'); return null }, () => order.push('leave'))
    expect(order).toEqual(['save', 'leave'])
  })

  it('결과지가 없으면(save 없음) 바로 이동한다', async () => {
    const leave = vi.fn()
    expect(await saveThenLeave(null, leave)).toBeNull()
    expect(leave).toHaveBeenCalledOnce()
  })
})
