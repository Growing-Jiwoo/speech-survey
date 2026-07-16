// eslint.config.mjs — Next.js 공식 규칙(core-web-vitals + TS). `npm run lint`로 실행.
// 이 파일 도입 전에는 코드 내 eslint-disable 주석이 장식에 불과했다(린터 미설치).
// eslint-config-next 16은 flat config 배열을 직접 export한다(FlatCompat 불필요).
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const config = [
  { ignores: ['.next/**', 'node_modules/**', '.claude/**', '.superpowers/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // `_` 접두 식별자는 "의도적으로 안 씀" 표시로 허용(rest 구조분해로 키 제거하는 패턴 등).
      '@typescript-eslint/no-unused-vars': ['warn', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
    },
  },
]

export default config
