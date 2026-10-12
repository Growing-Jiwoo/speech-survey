// next.config.ts — 옛 주소 308(2026-10-12 점검 X16, 사용자 확정 2026-10-13). host 조건은 Next가 `^값$` 정규식으로
// 맞춘다(next/dist/shared/lib/router/utils/prepare-destination의 matchHas) — 정식 도메인·Preview 주소까지 넘기면
// 점검·시험 배포가 운영으로 튕기므로 맞는 호스트를 핀한다.
import { describe, expect, it } from 'vitest'
import nextConfig from '@/next.config'

const rules = async () => (await nextConfig.redirects?.()) ?? []

describe('옛 주소 리다이렉트', () => {
  it('speech-survey.vercel.app의 모든 경로를 lidislab.com의 같은 경로로 308', async () => {
    const all = await rules()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ source: '/:path*', destination: 'https://lidislab.com/:path*', permanent: true })
  })

  it('옛 주소만 맞는다 — 정식 도메인·Preview·로컬은 그대로', async () => {
    const host = (await rules())[0].has?.find(h => h.type === 'host')
    const re = new RegExp(`^${host?.value}$`)
    expect(re.test('speech-survey.vercel.app')).toBe(true)
    for (const h of ['lidislab.com', 'www.lidislab.com', 'speech-survey-git-main-kids-survey.vercel.app',
      'speech-survey-a1b2c3d4e-kids-survey.vercel.app', 'localhost'])
      expect(re.test(h), h).toBe(false)
  })
})
