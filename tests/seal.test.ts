import { afterEach, describe, it, expect, vi } from 'vitest'
import { seal, unseal } from '@/lib/forms/seal'

const KEY = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

describe('seal / unseal — AES-256-GCM', () => {
  it('되돌리면 같은 글이다(한글 포함)', () => {
    expect(unseal(seal('{"x":"가나다"}', KEY), KEY)).toBe('{"x":"가나다"}')
  })
  it('같은 글이어도 암호문은 매번 다르다(iv) — 같은 문항인지 암호문으로는 알 수 없다', () => {
    expect(seal('같다', KEY)).not.toBe(seal('같다', KEY))
  })
  it('키가 틀리거나 암호문이 한 글자라도 바뀌면 풀리지 않는다', () => {
    const s = seal('문항', KEY)
    expect(() => unseal(s, OTHER)).toThrow()
    const [v, iv, tag, body] = s.split('.')
    const flipped = Buffer.from(body, 'base64'); flipped[0] ^= 1
    expect(() => unseal([v, iv, tag, flipped.toString('base64')].join('.'), KEY)).toThrow()
  })
  it('키 형식이 64자리 16진수가 아니면 거부한다', () => {
    expect(() => seal('x', 'short')).toThrow(/64자리/)
  })
})

describe('lib/forms — 키에 따라 실제 문항 · 가짜 문항', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock('@/lib/forms/sealed') })

  /** 가짜 문항과 모양이 같은 「실제」 문항을 암호문으로 넣고 lib/forms를 새로 읽는다 */
  async function load(content: (f: { id: string; sentences: string[] }) => object) {
    const { G1 } = await import('@/lib/forms/g1')
    const { G2 } = await import('@/lib/forms/g2')
    const forms = Object.fromEntries([G1, G2].map(f => [f.id, { ...f, ...content(f) }]))
    const sealed = seal(JSON.stringify({ forms, sheet: {} }), KEY)
    vi.doMock('@/lib/forms/sealed', () => ({ SEALED: sealed }))
    return import('@/lib/forms')
  }

  it('키가 없으면 가짜 문항으로 돈다(공개 저장소·테스트)', async () => {
    vi.stubEnv('FORMS_KEY', ''); vi.stubEnv('VERCEL', '')
    const m = await import('@/lib/forms')
    expect(m.REAL_FORMS).toBe(false)
  })
  it('키가 있으면 암호문의 문항으로 갈아 끼운다', async () => {
    vi.stubEnv('FORMS_KEY', KEY)
    const m = await load(f => ({ sentences: f.sentences.map(s => `실제 ${s}`) }))
    expect(m.REAL_FORMS).toBe(true)
    expect(m.formForGrade(1).sentences[0].startsWith('실제 ')).toBe(true)
  })
  it('[안전] Vercel에서 키가 없으면 가짜 문항으로 물러나지 않고 던진다 — 아이가 가짜 낱말로 검사받지 않게', async () => {
    vi.stubEnv('FORMS_KEY', ''); vi.stubEnv('VERCEL', '1')
    await expect(import('@/lib/forms')).rejects.toThrow(/FORMS_KEY/)
  })
  it('[안전] 실제 문항의 개수가 양식과 다르면 던진다 — 페이지·분모·배점이 어긋난다', async () => {
    vi.stubEnv('FORMS_KEY', KEY)
    await expect(load(f => ({ sentences: f.sentences.slice(0, 3) }))).rejects.toThrow(/개수/)
  })
})
