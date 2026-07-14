import { describe, it, expect } from 'vitest'
import { QUESTIONS } from '@/supabase/seed/questions'

describe('questions seed', () => {
  it('30문항, order_no 1..30 유일', () => {
    expect(QUESTIONS).toHaveLength(30)
    expect(new Set(QUESTIONS.map(q => q.orderNo)).size).toBe(30)
    expect(Math.min(...QUESTIONS.map(q => q.orderNo))).toBe(1)
    expect(Math.max(...QUESTIONS.map(q => q.orderNo))).toBe(30)
  })
  it('난이도 10/10/10, 배치 easy→medium→hard', () => {
    const d = (lo: number, hi: number) => QUESTIONS.filter(q => q.orderNo >= lo && q.orderNo <= hi)
    expect(d(1, 10).every(q => q.difficulty === 'easy')).toBe(true)
    expect(d(11, 20).every(q => q.difficulty === 'medium')).toBe(true)
    expect(d(21, 30).every(q => q.difficulty === 'hard')).toBe(true)
  })
  it('빈 문장 없음', () => {
    expect(QUESTIONS.every(q => q.text.trim().length >= 3)).toBe(true)
  })
})
