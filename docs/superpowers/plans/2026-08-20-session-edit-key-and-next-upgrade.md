# SessionEditDialog key 방어 + 의존성 일괄 상향 + react-table v9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리뷰 리포트(STATIC_ANALYSIS_REPORT_2026-08-20.md)의 [검증 필요] #1(수정 폼 세션별 격리), [G-04]/#3(npm audit high 5건 해소 + 안전 patch/minor 11개 일괄 상향), 그리고 @tanstack/react-table v9 마이그레이션(번들 축소 + lint 억제 제거)을 처리한다.

**Architecture:** 서로 독립된 세 변경이라 **브랜치를 셋으로 나눈다** — Task 1은 JSX `key` 한 줄(+주석·README 동기화), Task 2는 의존성 상향(런타임 코드 무변경, 기존 테스트 645개가 회귀망), Task 3은 react-table v8→v9(수정 파일이 `SessionTable.tsx` 하나뿐인 major). Task 3만 Task 2에 의존한다(같은 package.json — main 병합 후 진행). Task 1·2는 파일이 겹치지 않아 순서 무관.

**Tech Stack:** Next.js 16(App Router) · React 19 · vitest(node 환경) · npm

## Global Constraints

- 커밋 전 4종 전부 통과: `npm run typecheck && npm run lint && npm test && npm run build` (CLAUDE.md 규칙 4 — build만으로는 타입 에러를 못 잡는다)
- `next-env.d.ts`는 build/dev가 다시 쓴다 — 변경분이 생기면 커밋하지 말고 `git checkout next-env.d.ts` (CLAUDE.md)
- 코드를 고치면 그 폴더 README·주석도 같은 커밋에서 (CLAUDE.md 규칙 3)
- 이 저장소는 컴포넌트 렌더 테스트를 의도적으로 두지 않는다(tests/README.md — node 환경만). Task 1에 새 테스트가 없는 것은 관례 준수이지 누락이 아니다
- 테스트 기대치: 현재 **645개 전부 통과**가 기준선
- 커밋 메시지는 한국어 + conventional prefix(저장소 관례), 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` 트레일러
- 작업 트리에 리뷰 산출물 `STATIC_ANALYSIS_REPORT_2026-08-20.md`(미추적)가 있다 — 이 계획의 커밋에 **섞지 말 것**(별도 처리)

---

### Task 1: SessionEditDialog를 세션별로 격리 (`key={s.id}`)

**배경(구현자가 알아야 할 도메인 사실):** 아동 정보 수정 모달(`SessionEditDialog`)은 폼 상태를 `useState(session.child_no)` 등으로 **마운트 시 1회** 초기화한다. `/admin/[id]`에서 아동 간 이동(이전/다음) 시 페이지가 리마운트된다는 전제가 깨지면, **이전 아동의 번호·이름·성별·생년월일이 다음 아동의 수정 폼에 프리필**된다 — 관리자가 눈치 못 채고 저장하면 임상 기록의 신원이 다른 아이 것으로 덮인다. `key`를 주면 React가 세션이 바뀔 때 컴포넌트를 강제 재생성하므로 전제와 무관하게 안전하다. 같은 파일의 `ResultSheet`가 이미 같은 이유로 `key={id}`를 쓴다.

**Files:**
- Modify: `components/admin/AdminDetailView.tsx:175` (`<SessionEditDialog …>` 호출부)
- Modify: `components/admin/README.md:17` (SessionEditDialog 행 — 규칙 3 동기화)
- Test: 없음 (Global Constraints의 관례 항목 참조 — 기존 645개가 회귀망)

**Interfaces:**
- Consumes: `s: SessionRow` (같은 파일 상단 `const { session: s } = data`) — `s.id: string`
- Produces: 없음 (동작 계약 무변경 — key는 React 조정 힌트)

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout main && git pull && git checkout -b fix/session-edit-dialog-key
```

- [ ] **Step 2: `key={s.id}` + 근거 주석 추가**

`components/admin/AdminDetailView.tsx`에서 아래 old를 new로 교체(파일 내 유일한 `<SessionEditDialog` 호출):

old:
```tsx
        <SessionEditDialog open={editOpen} session={s}
          onClose={() => setEditOpen(false)}
```

new:
```tsx
        {/* key(id): 아동 간 이동에서 페이지가 리마운트된다는 전제가 어떤 이유로든 깨져도
            폼 상태(useState 1회 초기화)가 세션별로 격리되게 한다 — 깨지면 이전 아동의
            신원이 다음 아동의 수정 폼에 프리필되는 경로다(임상 기록 오염).
            ResultSheet의 key(id)와 같은 방어선이다. */}
        <SessionEditDialog key={s.id} open={editOpen} session={s}
          onClose={() => setEditOpen(false)}
```

- [ ] **Step 3: components/admin/README.md 동기화**

17행 SessionEditDialog 행의 셀 끝에 한 문장 추가 — old(행 끝부분):

```
학급 코드를 잘못 골랐다면 수정이 아니라 삭제 후 재검사가 맞다 |
```

new:

```
학급 코드를 잘못 골랐다면 수정이 아니라 삭제 후 재검사가 맞다. 호출부(AdminDetailView)가 `key={s.id}`로 세션마다 폼을 새로 만든다 — 이전 아동 값이 다음 아동 폼에 남지 않게 |
```

- [ ] **Step 4: 검증 4종**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: 타입 에러 0 · lint 에러 0 · `Tests 645 passed (645)` · build 성공

- [ ] **Step 5: next-env.d.ts 오염 확인·되돌리기**

```bash
git status --short
```

`next-env.d.ts`가 변경 목록에 있으면:

```bash
git checkout next-env.d.ts
```

- [ ] **Step 6: 커밋**

```bash
git add components/admin/AdminDetailView.tsx components/admin/README.md
git commit -m "$(cat <<'EOF'
fix(admin): 아동 정보 수정 폼을 세션별로 격리(key) — 이전 아동 프리필 차단

SessionEditDialog는 폼 상태를 마운트 시 1회 초기화한다. 아동 간 이동에서
페이지 리마운트 전제가 깨지면 이전 아동의 신원이 다음 아동의 수정 폼에
프리필돼 임상 기록이 오염될 수 있다 — key={s.id}로 전제와 무관하게 차단.
(리뷰 리포트 2026-08-20 [검증 필요] #1, ResultSheet의 key(id)와 같은 방어)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: 스테이징 누락·혼입 확인**

```bash
git status --short
```

Expected: `?? STATIC_ANALYSIS_REPORT_2026-08-20.md`와 `?? docs/superpowers/plans/2026-08-20-session-edit-key-and-next-upgrade.md`만 남음(커밋에 미혼입)

---

### Task 2: 의존성 일괄 상향 (next 16.3.1 + 안전 patch/minor 11개) + npm audit 해소

**배경:** ① `npm audit` 6건(high 5) — next 16.2.10에 어드바이저리 9건(이 앱은 middleware가 `/admin` 인증의 전부라 Middleware bypass 계열이 치명 후보, 16.3.1에서 수정) + 전이 의존 postcss·sharp, 개발 도구 트리의 brace-expansion·js-yaml·nanoid. ② `npm outdated` 기준 같은 major 안의 안전 상향 11개를 함께 처리한다(전부 patch/minor, 검증 4종 1회로 커버). `overrides.postcss: "^8.5.10"`은 캐럿 범위라 수정판(≥8.5.23)이 범위 안에서 해소된다 — overrides 수정 불필요. 런타임 코드 변경 없음.

**같이 올리지 않는 것(이유 포함 — 건드리지 말 것):**
- `typescript` 7.x — TS7(tsgo)이 Next 16 빌드 워커와 충돌해 5.9로 되돌린 전례(README '개발·테스트' 절)
- `@types/node` 26 — 런타임이 Node v22, 타입은 런타임과 맞춘다
- `eslint` 10 — eslint-config-next가 지원 선언할 때까지 보류
- `pdfjs-dist` 6 — 검사지 좌표 추출 재현성을 위해 고정(새 검사지 받는 날 재검토)
- `@tanstack/react-table` 9 — Task 3에서 별도 처리(major, 코드 수정 동반)

**Files:**
- Modify: `package.json` (`"next": "16.2.10"` → `"16.3.1"` 등 정확 고정 관례 유지), `package-lock.json` (npm이 갱신)
- Test: 없음 (기존 645개 + build가 회귀망)

**Interfaces:**
- Consumes: 없음
- Produces: Task 3의 전제(이 브랜치가 main에 병합된 상태)

- [ ] **Step 1: 브랜치 생성 (main 기준 — Task 1과 독립)**

```bash
git checkout main && git checkout -b chore/deps-2026-08-20
```

- [ ] **Step 2: 개발 트리 취약점 자동 해소 + 캐럿 범위 내 갱신**

```bash
npm audit fix && npm update
```

Expected: brace-expansion·js-yaml·nanoid 해소, 캐럿 의존(@tanstack/react-query 5.101.4, @types/react 19.2.18, @types/react-dom 19.2.4, tsx 4.23.12 등)이 범위 내 최신으로. `--force`는 **쓰지 않는다** — next 상향은 다음 스텝에서 명시적으로 한다.

- [ ] **Step 3: 정확 고정(exact pin) 패키지 명시 상향**

```bash
npm install next@16.3.1 react@19.2.8 react-dom@19.2.8 @supabase/supabase-js@2.112.3 @node-rs/argon2@2.1.0 @tanstack/react-virtual@3.14.10 wavesurfer.js@7.12.11
npm install -D eslint-config-next@16.3.1 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 vitest@4.1.11
```

Expected: package.json 런타임 의존이 정확 버전으로(`"next": "16.3.1"`, `"react": "19.2.8"`, `"react-dom": "19.2.8"`, `"@supabase/supabase-js": "2.112.3"`, `"@node-rs/argon2": "2.1.0"`, `"@tanstack/react-virtual": "3.14.10"`, `"wavesurfer.js": "7.12.11"`), dev는 `"eslint-config-next": "^16.3.1"`, `"tailwindcss": "4.3.3"`, `"@tailwindcss/postcss": "4.3.3"`, `"vitest": "4.1.11"`. `@tanstack/react-table`은 **8.21.3 그대로**여야 한다(Task 3 몫).

- [ ] **Step 4: audit 재확인**

```bash
npm audit
```

Expected: `found 0 vulnerabilities`. 잔여가 있으면 **여기서 멈추고 잔여 내역을 보고**한다(추가 --force 금지 — 판단은 사람 몫).

- [ ] **Step 5: 검증 4종**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: 전부 통과 · `Tests 645 passed (645)` · build 성공. **build 실패 시 주의**: 과거 TypeScript 7(tsgo)이 Next 빌드 워커와 충돌한 전례가 있다(README '개발·테스트' 절) — next 마이너 상향에서 빌드가 깨지면 에러 원문을 보고하고 롤백(`git checkout package.json package-lock.json && npm install`)한다.

- [ ] **Step 6: next-env.d.ts 오염 확인·되돌리기**

```bash
git status --short
```

`next-env.d.ts` 변경분이 있으면:

```bash
git checkout next-env.d.ts
```

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): next 16.3.1 등 same-major 일괄 상향 + npm audit high 5건 해소

next 16.2.10 어드바이저리 9건(Middleware bypass 포함 — 이 앱은 middleware가
관리자 인증의 전부) 및 전이 의존 postcss·sharp, 개발 트리 brace-expansion·
js-yaml·nanoid 해소. 같은 major 내 patch/minor 일괄 상향(react 19.2.8,
supabase-js 2.112.3, argon2 2.1.0, react-virtual·wavesurfer·tailwind·
react-query·vitest 등). react-table은 8 유지(major는 별도 브랜치).
audit 0건 확인, 검증 4종 통과.
(리뷰 리포트 2026-08-20 [G-04] + 상향 탐색 2026-08-20)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: 배포 메모 (PR 본문에 포함할 것)**

PR 본문에 다음을 적는다 — 코드가 아니라 운영 주의사항이다:

```
⚠️ 프레임워크 상향 배포는 검사 시간대를 피할 것 (README '배포' 절 — 진행 중
세션 무효화 계열 주의와 동일 취급). 배포 후 /(코드 입력)·/admin(로그인)
정상 로드 확인. argon2 2.1.0(minor)이 인증 경로 네이티브 바인딩이므로
관리자 로그인 성공 1회를 반드시 눈으로 확인할 것.
```

---

### Task 3: @tanstack/react-table v8 → v9 마이그레이션

**전제:** Task 2가 main에 병합된 뒤 시작한다(같은 package.json·lockfile을 만진다).

**배경(구현자가 알아야 할 것):** [components/admin/SessionTable.tsx](../../../components/admin/SessionTable.tsx)의 주석이 "v9 호환판이 나올 때까지 경고만 억제"라고 기다리던 그 버전(9.1.2, stable)이 나왔다. v9의 이 표에 해당하는 변화:
- `useReactTable` → `useTable`, 옵션에 `features`(`tableFeatures({})`) 필수. **코어 행 모델은 자동 포함** — `getCoreRowModel` import·옵션이 사라진다.
- 기능이 옵트인이라 **미사용 기능 코드가 번들에서 빠진다**(이 표는 정렬·필터를 URL 동기화 로직이 하므로 코어만 등록).
- `createColumnHelper<TData>` → `createColumnHelper<typeof features, TData>` (타입 파라미터 2개).
- `flexRender(def, ctx)` 함수 → `<table.FlexRender header={h} />` / `<table.FlexRender cell={cell} />` 컴포넌트.
- 상태가 TanStack Store 기반이라 React Compiler 호환 — `react-hooks/incompatible-library` 억제를 제거한다.
- `ColumnMeta` 선언 병합의 타입 파라미터가 3개로: `<in out TFeatures extends TableFeatures, in out TData extends RowData, TValue extends CellData = CellData>` (table-core 원본 시그니처 실측 — 이름·제약까지 맞춰야 TS2428이 안 난다).
- `row.getVisibleCells()`는 column visibility **기능**의 API다 — 기능 미등록이므로 `row.getAllCells()`로 바꾼다(이 표는 열 숨김이 없어 결과 동일).
- `table.getRowModel().rows`·`table.getHeaderGroups()`는 그대로다(가상화 연동 무변경).

**Files:**
- Modify: `package.json` (`"@tanstack/react-table": "8.21.3"` → `"9.1.2"`), `package-lock.json`
- Modify: `components/admin/SessionTable.tsx` (아래 6개 부위)
- Test: 없음 (컴포넌트 렌더 테스트를 두지 않는 관례 — typecheck가 API 오용을, 수동 스모크가 런타임을 잡는다)

**Interfaces:**
- Consumes: Task 2 병합본(main)
- Produces: 없음 (표시 전용 컴포넌트 내부 교체 — props·URL 동기화 계약 무변경)

- [ ] **Step 1: 브랜치 생성 + 패키지 상향**

```bash
git checkout main && git pull && git checkout -b chore/react-table-v9
npm install @tanstack/react-table@9.1.2
```

Expected: package.json `"@tanstack/react-table": "9.1.2"`, 새 전이 의존 `@tanstack/react-store` 추가됨(정상 — v9 상태 저장소).

- [ ] **Step 2: import 교체** (`components/admin/SessionTable.tsx` 상단)

old:
```tsx
import {
  createColumnHelper, flexRender, getCoreRowModel, useReactTable, type RowData,
} from '@tanstack/react-table'
```

new:
```tsx
import {
  createColumnHelper, tableFeatures, useTable,
  type CellData, type RowData, type TableFeatures,
} from '@tanstack/react-table'
```

- [ ] **Step 3: ColumnMeta 선언 병합을 v9 시그니처로**

old:
```tsx
declare module '@tanstack/react-table' {
  // 선언 병합은 원본과 타입 파라미터 이름까지 동일해야 한다(TS2428) — 이 확장에서는 미사용.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    sortKey?: SortKey
    thClassName?: string
    tdClassName?: string
  }
}
```

new:
```tsx
declare module '@tanstack/react-table' {
  // 선언 병합은 원본과 타입 파라미터(이름·제약·기본값)까지 동일해야 한다(TS2428) — 이 확장에서는 미사용.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    sortKey?: SortKey
    thClassName?: string
    tdClassName?: string
  }
}
```

typecheck에서 TS2428이 나면 기본값(`= CellData`) 유무를 에러 메시지의 원본 시그니처와 맞춘다 — 그 외 임의 변형 금지.

- [ ] **Step 4: features 상수 + columnHelper·useTable 교체**

`ROW_HEIGHT` 상수 근처(모듈 최상위)에 추가:

```tsx
// v9: 사용할 기능을 명시해 그 코드만 번들에 담는다(코어 행 모델은 자동 포함).
// 이 표는 정렬·필터를 URL 동기화 로직(lib/adminStats)이 담당하므로 테이블 기능을 켜지 않는다.
// 참조가 흔들리면 타입·메모가 같이 흔들리므로 반드시 모듈 상수로 둔다.
const features = tableFeatures({})
```

columns 메모 안 — old:
```tsx
    const col = createColumnHelper<SessionListRow>()
```
new:
```tsx
    const col = createColumnHelper<typeof features, SessionListRow>()
```

테이블 생성 — old:
```tsx
  // tanstack table v8은 React Compiler 미호환 목록에 있으나(내부 캐시 뮤테이션),
  // 자체 메모이제이션으로 동작은 안전하다 — v9 호환판이 나올 때까지 경고만 억제.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
```
new:
```tsx
  // v9는 상태가 TanStack Store 기반이라 React Compiler 호환 — v8에서 필요했던
  // react-hooks/incompatible-library 억제를 제거했다(코어 행 모델은 자동 포함).
  const table = useTable({ features, columns, data: rows })
```

- [ ] **Step 5: 렌더식 교체 (flexRender → FlexRender, getVisibleCells → getAllCells)**

헤더 — old:
```tsx
                  const label = flexRender(h.column.columnDef.header, h.getContext())
```
new:
```tsx
                  const label = <table.FlexRender header={h} />
```

바디 셀 — old:
```tsx
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className={cell.column.columnDef.meta?.tdClassName ?? 'px-4'}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
```
new:
```tsx
                  {row.getAllCells().map(cell => (
                    <td key={cell.id} className={cell.column.columnDef.meta?.tdClassName ?? 'px-4'}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
```

`colCount`의 `table.getAllLeafColumns()`는 코어 API라 그대로 둔다 — typecheck가 부재를 알리면(기능 이동 시) `table.getAllColumns()`로 교체한다(이 표는 그룹 컬럼이 없어 두 값이 같다).

- [ ] **Step 6: 검증 4종**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: 전부 통과 · `Tests 645 passed (645)`. lint에서 `react-hooks/incompatible-library`가 **다시** 뜨면(플러그인 목록이 v9 미반영) Step 4의 억제 주석을 원래 형태로 되살리고 "v9인데 플러그인 목록 미갱신" 사유로 바꿔 단다 — 마이그레이션 자체는 계속 진행.

- [ ] **Step 7: 수동 스모크 (dev 서버 — 표는 렌더 테스트가 없어 이 단계가 유일한 런타임 검증)**

```bash
npm run dev
```

`/admin` 로그인 후 세션 목록에서 확인(콘솔 에러 0 전제):
- 열 머리글 정렬 토글(▲/▼ 전환, URL `?sort=` 반영)
- 행 클릭 → 결과지 이동 · 이름 셀 Cmd+클릭 → 새 탭
- 스크롤 시 가상 행 정상(빈 행·겹침 없음), 행 높이 실측 보정 동작
- 재검사 회차 배지 "n/m회차" 표시
- 진행률 막대 2트랙(녹음/쓰기) 값 정상

- [ ] **Step 8: next-env.d.ts 오염 확인 후 커밋**

```bash
git status --short
# next-env.d.ts 변경분이 있으면: git checkout next-env.d.ts
git add package.json package-lock.json components/admin/SessionTable.tsx
git commit -m "$(cat <<'EOF'
chore(admin): react-table v9 마이그레이션 — 번들 축소·Compiler 호환

useReactTable→useTable(tableFeatures 코어만 등록 — 정렬·필터는 URL 동기화
로직 담당이라 테이블 기능 불필요), flexRender→<table.FlexRender>,
getVisibleCells→getAllCells(visibility 기능 미등록), ColumnMeta 선언 병합
v9 시그니처(3파라미터). v8에서 기다리던 react-hooks/incompatible-library
억제 제거. 수동 스모크(정렬·행 이동·가상 스크롤·회차 배지) 통과.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review 결과

- **Spec coverage**: [검증 필요] #1 → Task 1, [G-04]+안전 상향 11개 → Task 2(제외 목록 5개는 이유와 함께 명시), react-table v9 → Task 3. #2(x-real-ip/Vercel)는 사용자 결정대로 조치 없음(계획 범위 밖) — 커버 완료.
- **Placeholder scan**: 조건 분기(TS2428 기본값·incompatible-library 재발·getAllLeafColumns 부재·audit 잔여·빌드 실패 롤백)는 모두 "이 신호가 오면 정확히 이렇게"로 구체화 — 모호 지시 없음. 통과.
- **Type consistency**: Task 3의 `features`는 모듈 상수 → `typeof features`가 columnHelper·ColumnMeta 병합과 일치. `ColumnMeta` 3파라미터 시그니처는 table-core 9.1.2 원본에서 실측 복사. `s.id: string`(SessionRow) — 확인됨.
- **v9 API 검증 근거**: TanStack/table 저장소 docs(guide/tables·row-models·helpers·column-defs, framework/react/quick-start)와 `packages/table-core/src/types/ColumnDef.ts` 원본을 2026-08-20에 직접 대조 — `useTable`·`tableFeatures`·`<table.FlexRender>`·코어 행 모델 자동 포함·`react: >=18` peer 확인.
