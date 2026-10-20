// tests/forms-sealed.test.ts — 실제 검사 문항(암호문 lib/forms/sealed.ts) 대조. **키(FORMS_KEY)가 있을 때만 돈다.**
//
// 키는 환경 변수, 없으면 .env.local에서 읽는다. 공개 저장소를 받은 사람·키 없는 CI에서는 건너뛴다 — 실제 문항이 없으니
// 대조할 것도 없다. 문항을 고친 뒤에는 반드시 키가 있는 곳에서 `npm test`를 돌릴 것.
//
// 무엇을 보나: 암호문의 문항(`forms`)이 검사지를 따로 옮겨 적은 대조값(`sheet`)과 **글자 단위로** 같은지. 무의미 낱말은
// 뜻이 없어 오타가 리뷰로 걸리지 않는다 — 실제로 한 음절이 비슷한 다른 음절로 들어가 있던 적이 있다(2026-08-10 교정).
// 그리고 실제 문항의 어절 수가 공개 양식(가짜 문항)과 같은지 — 키 없는 테스트가 실제와 같은 배점 구조로 돌게 하는 약속이다.
import { existsSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { FORMS, openSealed } from '@/lib/forms'

if (!process.env.FORMS_KEY && existsSync('.env.local')) process.loadEnvFile('.env.local')
const KEY = process.env.FORMS_KEY

describe.skipIf(!KEY)('실제 문항(암호문) — 검사지와 글자 단위 대조', () => {
  const sealed = KEY ? openSealed(KEY) : null
  const words = (s: string) => s.trim().split(/\s+/).length

  for (const form of FORMS) {
    describe(form.id, () => {
      it('문항이 검사지 대조값과 글자 단위로 같다', () => {
        const real = sealed!.forms[form.id], sheet = sealed!.sheet[form.id]
        expect(real.readMeaning).toEqual(sheet.readMeaning)
        expect(real.readNonsense).toEqual(sheet.readNonsense)
        expect(real.sentences).toEqual(sheet.sentences)
        if (real.writing.kind === 'word') {
          expect(real.writing.meaning).toEqual(sheet.writeMeaning)
          expect(real.writing.nonsense).toEqual(sheet.writeNonsense)
        } else expect(real.writing.sentences).toEqual(sheet.writeSentences)
      })
      it('어절 수가 공개 양식(가짜 문항)과 같다 — 키 없는 테스트도 같은 배점 구조', () => {
        const real = sealed!.forms[form.id]
        expect(real.sentences.map(words)).toEqual(form.sentences.map(words))
        if (real.writing.kind === 'sentence' && form.writing.kind === 'sentence')
          expect(real.writing.sentences.map(words)).toEqual(form.writing.sentences.map(words))
      })
    })
  }
})
