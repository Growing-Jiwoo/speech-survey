# CLAUDE.md — 작업 규칙

아동 읽기 **선별검사** 앱. 실제 아동의 임상 기록을 만들어 인쇄물로 내보낸다 —
점수 한 칸이 곧 검사 결과 문서다. 편의를 위해 점수 표시 규칙을 임의로 바꾸지 말 것.

## 먼저 읽을 것

이 저장소는 **폴더마다 README를 두고 실제로 유지한다.** 코드를 읽기 전에 그 폴더 README부터.

| 알고 싶은 것 | 어디 |
|---|---|
| 검사 구성·중단 규칙 폐기·미녹음 표기·결과보고서 PDF·셋업·배포·PII | [README.md](README.md) |
| 로직 계층 파일별 역할 | [lib/README.md](lib/README.md) |
| 테스트 관례(node 환경·모킹 경계) | [tests/README.md](tests/README.md) |
| 왜 그렇게 만들었나(작성 시점 스냅샷) | [docs/README.md](docs/README.md) |

## 1. 임상 규칙 주석에는 출처를 적는다

검사 절차·채점 규칙 주석은 **누가 정했는지**로 세 가지를 구분한다. 뭉뚱그리면 되돌릴 때
"담당자에게 다시 물어야 할 것"과 "그냥 바꿔도 될 것"을 구별할 수 없다.

| 표기 | 뜻 |
|---|---|
| `담당자 확정(날짜)` | 임상 담당자 회신 원문이 근거. **바꾸려면 다시 물어야 한다** |
| `사용자 확정(날짜)` | 개발 판단. 담당자 회신이 **아님**을 명시할 것 |
| `⚠️ 담당자 확인 대기 — 확정 아님` | 임시값. 무엇을 물어야 하는지까지 적는다 |

근거 없이 `담당자 확정`을 붙이지 말 것 — 3곳이 그렇게 잘못 붙어 교정 커밋(`92047ce`)이 나갔다.

## 2. 검사지 PDF가 절대 기준 — 단 시행 절차와 문장 읽기유창성 총점은 예외

검사지(담당자 배포 PDF — 저장소 밖 `private/forms/`)가 문항·배점의 절대 기준이다(1·2학년 **2학기**는 PDF 없이 담당자 docx `1학년, 2학년
2학기 예비 문항.docx`(2026-10-19, 역시 `private/forms/`)가 원본)(출력물 양식은 아니다 — 내려받는 PDF는 담당자가 따로 준 결과보고서 양식, README「결과보고서 PDF」절). **시행 절차만은 담당자 회신이 인쇄 문구를
이긴다** — `lib/survey-flow.ts`가 검사지와 달라 보이는 것은 버그가 아니다. 현재: 페이지당 제한 시간
**20초**(담당자 확정 2026-09-21 — 검사지의 30·40초는 한 화면에 다 제시할 때의 값, `lib/forms/g*.ts`
`limits`), 단 **2학기 문장 3·4번은 30초**(담당자 확정 2026-10-20 — 문장마다 `sentenceSec[i]`)와 중단 규칙 전체 미적용. ①(연속 오반응)은 담당자 회신이 근거이고, **②(쓰기 중단)는 담당자 확정(2026-08-22)**
이다 — 2026-08-13에는 사용자 확정이었고 담당자 재확인이 없어 재확인 대상이었으나, 담당자가
「즉시 중단 기능 제거」가 ②를 포함한다고 확정했다. 근거 스펙
`docs/superpowers/specs/2026-08-13-admin-only-scoring-and-class-codes-design.md`.
되돌리기 전에 README.md "문항 구성" 절을 읽을 것.

채점 쪽 예외는 하나다 — **문장 읽기유창성 총점**은 인쇄 문구(「정확하게 읽은 어절 수로 채점」, /36)가
아니라 **정확 어절 합 ÷ 읽은 시간 합 × 10(10초당 어절)**이다(담당자 확정 2026-09-29, × 10은 2026-10-20,
`lib/scoring.ts`). 문장별 어절 배점은 여전히 검사지를 따른다. 소수 둘째 자리 반올림·미녹음 문장 = 그 문장의 제한 시간·0어절도 담당자 확정(2026-09-29 — 그때는 모든 문장이 20초였다.
2학기 3·4번을 30초로 치는 것은 그 원문을 문장별 제한 시간으로 읽은 것이다, README 「미녹음의 표기」).
판정은 **양호·주의·위험**이고 2학기 기준표는 담당자 확정(2026-10-19, 최종본 2026-10-20 — 1학년 읽기유창성 주의는 8.12로
정정, 2학년은 8.04). 1학기 기준표는 새 1학기 문항과 함께 대기다(`lib/forms/g*.ts` 주석).

**양식은 세션마다 정해 행에 남는다**(`sessions.form_id`, migration 008) — 새 1학기 문항이 오면 기존 양식(`g1.ts`·`g2.ts`)을
고치지 말고 새 id로 추가할 것. 고치면 그 id로 검사한 아이의 기록이 다른 낱말로 다시 그려진다.

**실제 문항은 평문으로 커밋하지 않는다** — 저장소가 공개다. 문항은 `lib/forms/sealed.ts`(암호문)로만 커밋하고
`lib/forms/g*.ts`에는 가짜 문항을 둔다(README 「문항 구성」 🔒). 테스트·문서·주석·커밋 메시지에도 실제 낱말을 적지 말 것.

## 3. 코드를 고치면 그 폴더 README·주석도 같은 커밋에서 고친다

규칙이 바뀌었는데 문서가 남아 교정 전용 커밋이 두 번 나갔다(`3f5b1f1`, `92047ce`).

## 4. 커밋 전 네 가지 전부 통과

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`build`만으로는 타입 에러를 못 잡는다 — 빌드 속도 때문에 Next 내장 타입체크를 꺼두었다
(`next.config.ts`의 `typescript.ignoreBuildErrors`). `typecheck`를 반드시 따로 돌릴 것.

`next-env.d.ts`는 추적 파일이지만 `next build`/`dev`가 다시 쓴다 — 변경분이 생기면 커밋하지 말고
`git checkout next-env.d.ts`로 되돌린다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
