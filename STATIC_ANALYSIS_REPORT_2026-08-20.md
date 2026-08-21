# 전체 리뷰 리포트 — kids-speech-survey (2026-08-20)

- 분석일: 2026-08-20 · 기준 커밋: `16e7183` (main)
- 분석 방식: 전 소스(약 9,600줄) 수동 정독 + 자동 검증 3종 + 성능 규칙 대조(vercel-react-best-practices) + UI 가이드라인 대조(web-interface-guidelines)
- 비교 기준: [STATIC_ANALYSIS_REPORT.md](STATIC_ANALYSIS_REPORT.md) (2026-07-16, 이후 251커밋)
- 코드 수정 없음 — 리포트만.

## 처리 결과 (2026-08-22 갱신)

리포트 작성 후 전체 E2E(124항목)를 돌리고 지적을 브랜치별로 처리해 `main`에 머지했다.
**이 절만 사후 추가이며 아래 본문은 작성 시점(`16e7183`) 그대로다** — 본문의 "현재 코드는
…" 서술은 지금의 main이 아니라 그때를 가리킨다.

| 항목 | 상태 | 반영 |
|---|---|---|
| [G-01] 제출 순서 | ✅ 수정 | #52 |
| [G-02] 업로드 롤백 수명 | ✅ 수정 | #52 |
| [G-03] 재시도 attemptNo | ✅ 수정 | #52 |
| [G-04] 의존성 취약점 | ✅ 해소(audit 0건) | #49 · #50 |
| [G-05] /apply 이탈 보호 | ✅ 수정 | #54 |
| [G-06] 결과지 뒤로가기 | ✅ 자동 저장으로 해결 | #54 |
| [G-07] 「새로 시작」 확인 | ✅ 수정 | #54 |
| [G-08] sticky 바 포커스 가림 | ✅ 수정(바 높이 실측 `scroll-margin`) | #53 |
| [G-10] 목록 전량 로드 | ⏸ 미조치 — 문서화된 한계 승계 | — |
| [검증 필요] SessionEditDialog `key` | ✅ 방어 적용 | #48 |
| [검증 필요] Vercel 실환경 | ⏸ 여전히 미확인 | — |
| [검증 필요] 어드바이저리 발동 조건 | ⏸ 대조 안 함 — 상향으로 무의미 | #49 |

리포트 밖에서 나온 것: E2E 3.17(세션 생성 서버측 멱등 가드) → #56, UI 지적 9건·「세션」→
「검사」·포커스 링 → #51, 학급 명단 양식(.xlsx) 부재 → #57.

**담당자 질문 6건은 아직 미해결** — 본문 해당 절 참고.

## 0. 자동 검증 결과 (분석 전 실행)

| 검사 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 에러 0 |
| `npm run lint` | ✅ 에러 0 |
| `npm test` | ✅ **645/645 통과** (38파일, 구 리포트 시점 148개 → 4.4배) |
| `npm audit` | ⚠️ **6건 (high 5 · moderate 1)** — 구 리포트 0건에서 악화 → [G-04] |

---

## 1. Executive Summary

**전체 코드 건강도: 매우 우수(Very Good).** 구 리포트의 F-01~F-14 중 **11건 해결·2건 부분 해결·1건 의도적 수용**이며, 그 사이 규모가 2.7배(3,600→9,600줄)로 커졌는데도 관례(lib 추출·node 테스트·폴더 README·출처 표기)가 흔들림 없이 유지됐다. 신뢰 경계(RLS 전면 차단 + service role), 업로드 다층 방어, nonce CSP, 접근성(포커스 트랩·라이브 리전·listbox 패턴)이 모두 실측 근거 주석과 함께 구현돼 있다.

이번에 새로 찾은 이슈는 **제출·업로드의 실패 경로에서 쓰기 점수·녹음이 조용히 유실될 수 있는 순서/수명 문제 2건**이 핵심이고, 나머지는 의존성 업그레이드와 이탈 보호 수준이다.

| 심각도 | 개수 |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 4 |
| Info | 2 |

영역별: 정확성/데이터 유실 3 · 보안/의존성 1 · UX/접근성 4 · 성능 1 · 유지보수성 0 (+ 검증 필요 1)

**Top 3**

1. **[G-01]** 최종 제출이 `submitted_at`을 먼저 확정하고 쓰기 답을 나중에 저장 — 중간 실패 시 재시도가 409로 막혀 **쓰기 점수(유일한 채점 경로)가 영구 유실**
2. **[G-02]** 녹음 업로드 실패의 낙관적 표시 되돌리기가 **화면 이탈 후에는 실행되지 않음** — localStorage에 "완료"가 남아 무음 유실이 검토·제출을 통과
3. **[G-04]** `npm audit` high 5건 — next 16.2.10에 미들웨어 우회 등 9건 어드바이저리, `next@16.3.1`로 해소 가능

---

## 2. 상세 Findings

### [G-01] 최종 제출: submitted_at 확정 → 쓰기 답 저장 순서 — 중간 실패 시 쓰기 점수 영구 유실
- 심각도: **Medium** (발현 확률 낮음 · 발현 시 임상 기록 복구 불가) / 신뢰도: High / 분류: 정확성 — 데이터 유실
- 위치: [lib/db.ts:65-87](lib/db.ts#L65) (`submitSession`), [app/api/sessions/submit/route.ts:71-80](app/api/sessions/submit/route.ts#L71), [app/review/page.tsx:102-113](app/review/page.tsx#L102)
- 설명: `submitSession`은 ① `sessions.submitted_at`을 먼저 확정하고(`.is('submitted_at', null)` 가드) ② 그다음 `writing_answers`/`sentence_scores`를 upsert한다. ①과 ② 사이에 일시 장애(네트워크·Supabase 순단)가 끼면 함수가 throw → 라우트 502 → 검토 화면이 재시도를 안내하지만, **세션은 이미 제출 상태라 재시도는 409("이미 제출된 검사입니다")로 거부된다.**
- 시나리오: G2 아동이 문장 쓰기 5문항을 마치고 [제출] → ① 성공, ② 실패 → 502. 검사자가 다시 [제출] → 409. 문장 쓰기 점수(10점 만점 과제 전체)는 검사 중 검사자 입력이 **유일한 채점 경로**(README "쓰기 채점은 예외")라 관리자 결과지에서 채울 수 없고, 세션은 제출 잠금이라 재제출도 안 된다 — 기록에서 영구히 빈다. 검사자는 409 문구와 눈앞의 "제출 실패" 상황이 모순돼 갇힌다(진행 경로 없음).
- 근거: 주석은 "성공했을 때만 쓰기 답을 upsert한다"를 의도로 밝히지만, 실패 모드 비교에서 역순이 우월하다 — 쓰기 답 upsert는 `(session_id, item_code)` 멱등이라 미제출 세션에 먼저 넣어도 무해하고, 재시도가 자연히 동작한다.
- 수정 방향: 순서를 뒤집는다 — 쓰기 답·문장 점수 upsert를 먼저, `submitted_at` 확정을 마지막에. 확정 실패 시 세션이 미제출로 남아 재시도가 통과한다. (추가로 review 화면의 409 분기를 "이미 제출됨 → /done 이동"으로 처리하면 이중 방어가 된다.)

### [G-02] 업로드 실패 롤백(undoSaved)이 화면 이탈 후에는 실행되지 않음 — 무음 유실이 "완료"로 통과
- 심각도: **Medium** / 신뢰도: Medium (메커니즘은 확실, 발현 창이 좁음) / 분류: 정확성 — 상태 수명
- 위치: [app/survey/page.tsx:100-124](app/survey/page.tsx#L100) (`patch`·`undoSaved`), [app/survey/page.tsx:162-171](app/survey/page.tsx#L162) (`handleRecorded`)
- 설명: 녹음은 낙관적으로 "완료" 표시 후 백그라운드 업로드되고, 실패 시 `undoSaved`가 표시를 되돌린다. 그런데 되돌리기가 `setSt(prev => { …saveState(merged)… })` — **setState 업데이터 안의 부수효과**다. 검사자가 `저장하고 나가기`(router.push `/`)나 검토 화면으로 이동해 `SurveyInner`가 언마운트된 뒤 업로드 실패가 도착하면, 언마운트된 컴포넌트의 setState는 무시되어 업데이터가 실행되지 않고 **localStorage 롤백도 일어나지 않는다.**
- 시나리오: 마지막 문장 녹음 → [다음] → 쓰기·체크리스트 진행 중 wifi 순단으로 업로드가 30초+ 걸려 실패 → 그 사이 검토 화면으로 이동(언마운트) → 실패가 무시됨 → 검토 화면은 localStorage 기준 "녹음 완료" 표시 → 제출. 서버에는 그 페이지 녹음이 없고, `withUnrecordedDefaults`가 **오반응(X·0점)으로 기본 채점**한다 — README가 경계하는 "무음 녹음처럼 조용히 실패하는 부류"가 정확히 이 경로다.
- 수정 방향: (a) 롤백을 업데이터 밖으로 — 실패 시 `loadState()`→수정→`saveState()`를 직접 수행(컴포넌트 생존과 무관), (b) `uploading > 0`인 동안 `저장하고 나가기`·검토 이동을 잠그거나 확인을 받는다(beforeunload는 SPA 내 이동을 못 막는다). (a)가 근본 수정.

### [G-03] 실패 재시도의 attemptNo 재계산 — 재녹음과 겹치면 최신 녹음을 옛 소리로 덮어씀
- 심각도: Low / 신뢰도: Medium / 분류: 정확성 — 경합
- 위치: [app/survey/page.tsx:184-190](app/survey/page.tsx#L184) (`retryUpload`)
- 설명: 재시도는 attemptNo를 저장 시점 값이 아니라 **현재 `recorded[code]+1`로 재계산**한다. ① 녹음 A(attempt 1) 업로드 중 → ② 재녹음 B(attempt 2) 업로드 성공 → ③ A 실패로 `undoSaved`(recorded 2→1) → ④ 재시도가 attemptNo 2로 A를 업로드 → 스토리지 `{id}/{code}_2` **upsert가 B를 A로 덮어쓴다.** 나중 시도가 옛 소리로 바뀌고 B는 소실된다. (같은 페이지의 두 실패가 겹치면 `pendingRetries`가 코드 키 하나라 앞선 blob도 유실된다.)
- 수정 방향: 실패 시점의 attemptNo를 blob과 함께 보관(`pendingRetries[code] = { rec, attemptNo }`)하고 재시도는 그 값을 그대로 쓴다.

### [G-04] 의존성 취약점 6건 (high 5) — next 16.2.10 어드바이저리 9건 포함
- 심각도: Medium / 신뢰도: High / 분류: 보안 — 공급망
- 위치: [package.json:23](package.json#L23) (`next 16.2.10`), lockfile
- 설명: `npm audit` 기준 — **next 16.2.10**: Middleware/Proxy bypass(GHSA-6gpp-xcg3-4w24, Turbopack+단일 로케일 조건), Server Actions DoS/SSRF, 캐시 혼동 등 9건. 이 앱은 **middleware가 `/admin`·`/api/admin/*` 인증의 전부**라(라우트에 인증 코드 없음) 미들웨어 우회 계열은 조건이 맞으면 관리자 인증 우회로 직결된다 — Server Actions는 미사용이라 그쪽 3건은 비해당. 그 외 brace-expansion·js-yaml·nanoid(개발 도구 트리, `npm audit fix`로 해소)와 next 전이 의존 postcss·sharp.
- 수정 방향: ① `npm audit fix`(개발 트리 3건, 무해), ② **next 16.3.1로 상향**(`npm audit fix --force`가 제안하는 버전 — 마이너 범위) 후 검증 4종 + 수동 E2E 핵심 항목 재확인. 임상 데이터 서비스라 검사 시간대를 피해 배포할 것(README 배포 절의 세션 무효화 주의와 동일).

### [G-05] /apply 신청 폼에 이탈 보호 없음 — 명단 수십 줄 작성분이 조용히 증발
- 심각도: Low / 신뢰도: High / 분류: UX — 데이터 입력 보호
- 위치: [app/apply/page.tsx](app/apply/page.tsx), [components/apply/RosterEditor.tsx](components/apply/RosterEditor.tsx) (`beforeunload` 0건)
- 설명: 교사가 명단 30줄을 붙여넣고 칸을 손보다 탭을 닫거나 뒤로가기를 누르면 전부 사라진다. 검사 화면(`busy·uploading` 조건)과 결과지(`dirty` 조건)에는 beforeunload 보호가 있는데 이 폼만 없다 — 저장소에서 가장 긴 입력 세션이 가장 보호가 약하다.
- 수정 방향: `rows.length > 0 && !done`일 때 beforeunload 경고 — 결과지와 같은 패턴 6줄.

### [G-06] 결과지 미저장 채점이 브라우저 뒤로가기에는 보호되지 않음
- 심각도: Low / 신뢰도: High / 분류: UX — 되돌리기 흐름
- 위치: [components/admin/AdminDetailView.tsx:35-37](components/admin/AdminDetailView.tsx#L35) (`go()` 가드)
- 설명: dirty 가드는 앱 내 버튼(목록·이전/다음)과 탭 닫기(beforeunload)만 덮는다. **브라우저 뒤로가기(SPA popstate)** 는 둘 다 통과 — 녹음 14개를 듣고 찍은 O/X가 경고 없이 사라진다. 채점자는 목록↔결과지를 오가는 동선이라 뒤로가기가 자연스러운 화면이다.
- 수정 방향: App Router에서 popstate 차단은 깔끔한 API가 없다 — 현실적 완화는 ① dirty 상태에서 주기적 자동 저장(채점 저장이 PUT 멱등이라 안전), 또는 ② `history.pushState` 더미+popstate 감지로 확인 모달. ①이 단순하고 UX도 낫다.

### [G-07] 시작 화면 「새로 시작」 — 확인 없이 진행 중 검사의 재개 능력을 파기
- 심각도: Low / 신뢰도: Medium / 분류: UX — 파괴적 동작
- 위치: [app/page.tsx:259](app/page.tsx#L259)
- 설명: 이어하기 카드의 [새로 시작]은 즉시 `clearState()` — 세션 토큰이 파기돼 **그 검사는 어떤 방법으로도 재개할 수 없다**(서버에 부분 녹음만 남아 관리자 목록에 영구 "진행 중"으로 표류). [이어서 하기] 바로 옆이라 오터치 거리도 가깝다. 다른 파괴적 동작(세션 삭제·코드 삭제·반려)은 모두 확인 모달이 있는데 이것만 없다.
- 수정 방향: 확인 모달 한 겹("3번 홍길동 학생의 진행 중 검사를 지우고 새로 시작할까요? 되돌릴 수 없어요") — 기존 ConfirmDialog 재사용.

### [G-08] sticky 바(저장 줄·그룹 플레이어)가 키보드 포커스 요소를 가릴 수 있음
- 심각도: Info / 신뢰도: Medium / 분류: 접근성
- 위치: [components/admin/ResultSheet.tsx:214](components/admin/ResultSheet.tsx#L214) (sticky bottom), [components/admin/sheet/WordScoreRows.tsx:26](components/admin/sheet/WordScoreRows.tsx#L26) (sticky top)
- 설명: Tab으로 O/X 버튼을 이동할 때 브라우저가 요소를 뷰포트에 넣지만 sticky 저장 줄/플레이어 바 높이만큼의 `scroll-padding`이 없어 포커스된 버튼이 바 뒤에 가려질 수 있다(가이드라인 "Sticky headers/footers must not cover focused elements").
- 수정 방향: 결과지 컨테이너에 `scroll-padding-block` 또는 채점 버튼에 `scroll-margin` 부여.

### [G-10] 관리자 목록 전량 로드(상한 5,000행) — 알려진 한계 유지
- 심각도: Info / 신뢰도: High / 분류: 성능 — 확장성
- 위치: [lib/db.ts:505-517](lib/db.ts#L505) (`MAX_LIST_ROWS` + 경고 로그)
- 설명: 목록이 세션 전량(+행별 녹음·쓰기 코드)을 한 응답으로 받고 포커스 시 재페치한다. 코드가 상한 도달을 경고 로그로 알리는 **문서화된 한계**이며 현 규모(학급 단위 운영)에서는 문제없다. 구 리포트 로드맵의 "5,000건 초과 시 서버 페이지네이션" 항목을 그대로 승계한다.

---

## 3. 기존 리포트(2026-07-16) F-01~F-14 상태

| ID | 제목 | 상태 | 근거 |
|---|---|---|---|
| F-01 | CSV 문서-기능 불일치 | ✅ 해결 | 저장소 전체에 CSV 언급 잔존 없음(문구 제거 방향으로 해소) |
| F-02 | 글로벌 로그인 잠금 DoS | ✅ 해결 | 하드 잠금 → 점증 백오프(상한 2s), RPC가 잠금 만료 후 카운트 리셋([lib/login-policy.ts](lib/login-policy.ts), [001_init.sql:105-119](supabase/migrations/001_init.sql#L105)) |
| F-03 | 세션 토큰 무만료·제출 후 쓰기 | ✅ 해결 | 토큰 exp 24h([lib/auth.ts:58](lib/auth.ts#L58)) + `.is('submitted_at', null)` + recordings 409 — 단, 새 순서 문제 [G-01]이 같은 자리에서 발생 |
| F-04 | 아동 PII 보존정책·삭제 UI | 🟡 부분 | 동의 절차·삭제 UI·일괄 파기 절차·법 조문 근거 모두 구현/문서화. **보존 기한 확정만 잔존**([lib/consent.ts:13-21](lib/consent.ts#L13) TODO — 운영 주체 결정 사항) |
| F-05 | 스테일 메타데이터 | ✅ 해결 | `title: '읽기 검사'`([app/layout.tsx:10](app/layout.tsx#L10)). localStorage 접두사 `kodys-survey:`만 잔존(무해, 동작 영향 없음) |
| F-06 | 관리자 API 오류 원문 노출·id 미검증 | ✅ 해결 | 전 관리자 라우트 `UUID_RE` 선검증 + 일반 문구 통일 |
| F-07 | 로그인 네트워크 오류 미처리 | ✅ 해결 | `postJson` 결과형으로 전환(던지지 않음) |
| F-08 | 레이트리밋 Map 무한 성장 | ✅ 해결 | `sweepEvery` 주기 청소([lib/request.ts:73-90](lib/request.ts#L73)) |
| F-09 | deleteSession 데드 코드 | ✅ 해결 | `DELETE /api/admin/sessions/[id]` + 결과지 삭제 버튼 + 스토리지 페이지네이션 정리까지 |
| F-10 | 로그아웃 부재 | ✅ 해결 | 라우트+버튼+`queryClient.clear()`(캐시 PII 제거)까지 |
| F-11 | login_attempts 무한 누적 | 🟡 부분 | 30일 정리 쿼리가 README 운영 절차로 문서화 — 자동 실행(pg_cron)은 없음, 보존 기한 확정 시 함께 자동화 예정 |
| F-12 | 녹음 상한 TOCTOU | ⏸ 의도적 수용 | 구 리포트 판정 그대로(여유 상한 200, 토큰 보유자만 도달) |
| F-13 | CSP frame-ancestors만 | ✅ 해결 | nonce + strict-dynamic script-src([middleware.ts:10-30](middleware.ts#L10)) — 권고를 넘어선 구현 |
| F-14 | 제출 모달 미완료 미표시 | ✅ 해결 | 모달에 "아직 N개 미완료" + 버튼 라벨 "그래도 제출하기" 분기 |

---

## 4. 성능 대조 (vercel-react-best-practices)

**우선순위 대상 5개 모두 통과.** 신규 지적 없음 — 이미 구현된 근거를 남긴다.

| 점검 대상 | 판정 | 근거 |
|---|---|---|
| admin 표 렌더 (수백 행) | ✅ | `useWindowVirtualizer` + `measureElement` 실측 보정, 이중 스크롤 제거 실측 주석([components/admin/SessionTable.tsx:157-201](components/admin/SessionTable.tsx#L157)). progress 정렬 값 사전 계산으로 비교자 내 반복 할당 제거([lib/adminStats.ts:163-174](lib/adminStats.ts#L163)) |
| 'use client' 경계 | ✅ | 페이지는 얇은 서버 컴포넌트, 인터랙티브 트리만 클라이언트. 인증 뒤 대시보드 특성상 서버 페칭 이점이 없어 현 구조가 적정 |
| react-query 캐시·invalidate | ✅ | 쿼리 키 단일 소스(`adminKeys`), 삭제는 `setQueryData` 즉시 반영 후 invalidate, 결과지에서 `removeQueries` 금지 근거 주석(채점 상태 보존), 목록만 `refetchOnWindowFocus` |
| wavesurfer.js·pdf-lib 번들 | ✅ | wavesurfer는 `next/dynamic` + IntersectionObserver 지연 생성([components/admin/sheet/PageAudio.tsx:14](components/admin/sheet/PageAudio.tsx#L14), [components/AudioPlayer.tsx:48-56](components/AudioPlayer.tsx#L48)). pdf-lib는 서버 라우트 전용(클라이언트 번들 미포함). xlsx는 외부 라이브러리 없이 자체 파서 |
| survey 문항 전환 리렌더 | ✅ | 녹음 중 60fps 갱신이 `ReadingPage` 서브트리에 갇힘(작은 트리), 파생값 캐시(`itemsFor` WeakMap·`todayKey` 문자열 의존) |

잔여 관찰: [G-10] 전량 로드 상한(문서화된 한계), `sessionProgress`가 진행률·상태 셀에서 행당 2회 호출(가상화로 상쇄, 실측 문제 없음 — 조치 불요).

## 5. UI/UX·접근성 대조 (web-interface-guidelines)

**핵심 흐름 통과.** 검사 진행 화면의 오조작 방어(녹음 중 전 버튼 잠금·미녹음 시 [다음]→[모르겠어요] 라벨 전환·일시정지 전체 덮개), 확인 모달 규율(초기 포커스=취소·Tab 순환·Esc·배경 스크롤 락·busy 잠금), 폼 접근성(label 연결·`role="alert"`·첫 에러 포커스·`aria-live` 단계 안내), 전역 규칙(`:focus-visible` 링·`touch-action: manipulation`·`prefers-reduced-motion`·tabular-nums)이 모두 확인됐다. 커스텀 Select는 ARIA listbox 패턴(activedescendant·Home/End)을 올바르게 구현했다. 인쇄물은 좌표 실측·두 줄 분할로 학교명 절단을 방지하고 O/X가 색이 아닌 **모양**으로 구분된다(흑백 인쇄 안전).

지적 사항은 [G-05] [G-06] [G-07] [G-08] 4건이 전부다(§2 참조). 그 외:
- 시작·신청 폼의 "채워야 활성화" 제출 버튼은 가이드라인("제출 버튼은 요청 시작 전까지 활성 유지")과 다르지만, **보호자 동의 게이트**라는 임상 요건이 우선한다 — 비활성 사유 안내 문구가 이미 붙어 있어 적정. 지적하지 않음.
- 세션 표의 행 클릭은 이름 셀의 실제 `<Link>`가 키보드·새 탭 경로를 제공하고 수정자 키를 존중한다 — 안티패턴 아님.

## 6. 의존성 / 공급망

- [G-04] 외 특이사항 없음. 핵심 런타임 정확 버전 고정 + lockfile, 타이포스쿼팅·유기 패키지 없음.
- `next-env.d.ts` 추적 관례, 폰트 벤더링(빌드 네트워크 의존 제거)은 공급망 관점에서도 모범적.

## 7. 우선순위 로드맵

**즉시 (코드 수 줄, 이번 주)**
- [G-01] `submitSession` 순서 반전(쓰기 답 먼저 → submitted_at 마지막) + review 409 분기
- [G-02] 업로드 실패 롤백을 setState 업데이터 밖으로(localStorage 직접 갱신)
- [G-03] `pendingRetries`에 attemptNo 동봉
- [G-05] /apply beforeunload 6줄

**단기**
- [G-04] `npm audit fix` → next 16.3.1 상향 → 검증 4종 + 실기기 E2E 핵심 항목 (검사 시간대 회피 배포)
- [G-07] 「새로 시작」 확인 모달
- [G-06] 결과지 dirty 자동 저장(또는 popstate 확인)

**중장기 (기존 로드맵 승계)**
- 보존 기한 확정 → `RETENTION_LABEL`·가정통신문·pg_cron 일괄 파기 자동화 (F-04/F-11 잔여, 담당자·운영 주체 결정 대기)
- 세션 5,000건 접근 시 서버 페이지네이션 [G-10]
- iOS Safari 실기기 E2E (README 명시 미실시 항목 — 특히 [G-02]의 무음 유실 부류는 실기기에서만 검증 가능)

## 8. 임상 담당자에게 물어야 할 것 (개발 판단으로 못 정하는 것만)

1. **Pass 기준표** — 현재 만점의 ~65%는 임시값(`PROVISIONAL_CRITERIA`, [lib/scoring.ts:20-29](lib/scoring.ts#L20)). G1·G2 각각의 실제 기준 점수. 특히 **G2가 G1 비율을 옮긴 것 자체가 개발 판단**([lib/forms/g2.ts:39-42](lib/forms/g2.ts#L39))
2. **연습 낱말의 의미** — "가짜 단어들"이 ⒜쉬운 실제 낱말(현행: 나무·구름·바다)인지 ⒝무의미 낱말인지([lib/items.ts:97-108](lib/items.ts#L97)). ⒝면 본 검사 반응에 영향을 주는 변경이라 문구 교체로 끝나지 않음
3. **중단 규칙 ②(쓰기 중단) 폐기 재확인** — 2026-08-11 담당자 확정을 사용자 확정(2026-08-13)으로 뒤집었고 재확인 없음([lib/survey-flow.ts:5-11](lib/survey-flow.ts#L5)). 되돌릴 일이 생기면 여기부터
4. **메일·신청 화면 문구** — 개발 초안 상태, 연구윤리 검토본 대기([lib/mail.ts:62-65](lib/mail.ts#L62), [app/apply/page.tsx:19-28](app/apply/page.tsx#L19))
5. **보존 기한** — "목적 달성 시 지체 없이 파기" 일반 원칙을 구체 기한으로(운영 주체 결정, [lib/consent.ts:13-21](lib/consent.ts#L13))
6. **진행률 표기 "문항 N/M"** — 실제 단위는 페이지인데 화면 문구는 문항([components/ProgressBar.tsx:4-5](components/ProgressBar.tsx#L4)) — 현장에서 통하는 표현 확인

## 9. 부록

**오탐 차단 준수**: `lib/survey-flow.ts` 중단 규칙 미적용(의도), 점수 표시·미녹음 표기 규칙, 낱말 채점 순번(2026-08-15 기각), 주석 3종 출처 표기, `ignoreBuildErrors`(typecheck 별도 실행 전제), `next-env.d.ts` — 모두 지적 대상에서 제외했다. 근거 없는 `담당자 확정` 오기는 발견되지 않았다(표기 규율 준수 상태 양호).

**수용된 리스크(문서화 확인)**: `verify-code`가 코드 하나로 학급 전체 명단(실명·성별·생년월일)을 반환 — "코드 = 명단의 비밀번호"로 README·주석에 위협 모델과 함께 명시돼 있고, 방어는 코드 공간(31⁶≈8.8억)+레이트리밋. 코드 유출 시 재발급 절차도 문서화됨. 신규 지적 아님.

**[검증 필요]**
- **SessionEditDialog 상태 초기화** ([components/admin/SessionEditDialog.tsx:42-47](components/admin/SessionEditDialog.tsx#L42)): 폼 상태가 `useState(session.*)` 1회 초기화다. App Router가 `/admin/[id]` 파라미터 변경 시 페이지를 리마운트하면 무해(코드 주석·dirty 가드 설계는 리마운트를 전제)하지만, 리마운트하지 않는 조건이 있다면 **이전 아동의 신원이 다음 아동의 수정 폼에 프리필**되는 심각한 경로가 된다. 런타임 확인 전이라도 `<SessionEditDialog key={session.id} …>` 한 줄이면 전제와 무관하게 원천 차단된다 — 방어적 적용 권고.
- 실행 환경(Vercel 설정·환경변수 실값) 미확인 — `x-real-ip` 신뢰는 Vercel 전제(구 리포트와 동일).
- [G-04]의 미들웨어 우회 어드바이저리 발동 조건(Turbopack+단일 로케일)이 이 구성에 해당하는지는 어드바이저리 원문 대조 필요 — 조건과 무관하게 상향이 정답.

**검토 파일**: 전 소스 — middleware.ts, next.config.ts, lib/** (28), app/** (페이지 8·라우트 13), components/** (40), hooks/** (3), supabase/migrations/** (3), scripts 헤더, globals.css/fonts.css. 자동 도구: tsc·eslint·vitest(645)·npm audit.
