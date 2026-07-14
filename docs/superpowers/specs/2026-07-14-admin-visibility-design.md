# /admin 데이터 가시성 개편 설계

날짜: 2026-07-14
상태: 승인됨

## 배경·목표

현재 `/admin` 목록은 검색(이름/학교) + 상태 탭(전체/제출/진행 중) + 단순 테이블 구조다.
사용자가 지적한 문제 세 가지를 해결한다:

1. **목록 스캔성** — 세션이 쌓이면 전체 현황·우선 확인 대상이 한눈에 안 들어옴.
2. **집계·통계 부재** — 학교별 참여 현황, 제출률 같은 집계 뷰 없음.
3. **정보 밀도·디자인** — 숫자 컬럼("녹음 x/14+4", "쓰기 y/10")과 배지의 시각적 위계가 약함.
   특히 "제출 · 미완료 있음" 배지가 초록(mint)이라 완료처럼 읽힘.

데이터 규모는 수백 건 이하 전제 → 전량 클라이언트 처리 유지, 서버 페이지네이션 불필요.

## 스코프 제외 (YAGNI)

- 채점(점수 입력) 기능 — 채점은 기존대로 외부(PDF 기준표) 수기.
- 결과지 `/admin/[id]` 구조 변경.
- 서버 페이지네이션·서버 필터링, DB 스키마 변경, `listSessions` 쿼리 변경.
- 일자별 추이 차트, 체크리스트 분포 (사용자가 선택하지 않음).

## 화면 구성 (`/admin` 단일 페이지)

위에서 아래로:

1. **헤더** — 기존 유지 (로고 + 타이틀). 우측 kpi 배지는 KPI 카드로 대체되므로 제거.
2. **KPI 카드 4장** — 전체 세션 / 제출 완료 / 진행 중 / 오늘 참여.
   - 카드는 클릭 가능한 필터 토글: 제출 완료 → 상태 `submitted`, 진행 중 → 상태 `inProgress`,
     오늘 참여 → 날짜 필터 `today` on/off, 전체 세션 → 모든 필터 해제.
   - 활성 상태(현재 필터와 일치)일 때 시각적으로 표시(테두리/배경 강조).
3. **학교별 현황** — 학교별 `참여 수`, `제출 수`, 제출률 가로 막대(참여 수 비례 폭 + 제출 구간 색 채움).
   - 참여 수 내림차순 정렬. 6개 초과 시 상위 6개만 표시하고 "전체 N개 학교 보기" 토글로 펼침.
   - 학교 행 클릭 → 테이블 학교 필터 적용(재클릭 시 해제). 활성 학교는 강조 표시.
   - 세션 0건이면 영역 자체를 렌더하지 않음.
4. **필터 바** — 기존 검색 input + 상태 탭 유지, 추가:
   - 학교 드롭다운(데이터에 존재하는 학교 목록), 학년 드롭다운(존재하는 학년 목록).
   - 활성 필터(검색어 제외)는 제거 가능한 칩(chip)으로 표시. "N건 표시" 카운터 유지.
   - **초기화 버튼**: 하나 이상의 필터(검색어 포함)가 활성일 때만 노출, 클릭 시 모든 필터·검색어 해제.
5. **테이블**
   - 컬럼: 이름 · 학교 · 학년/반 · 생년월일 · 시작 · 진행률 · 체크 · 상태. (생년월일은 동명이인
     구분용으로 유지 — 사용자 결정.)
   - **정렬**: 이름·학교·시작·진행률 헤더 클릭 정렬(오름/내림 토글, 기본: 시작 내림차순).
     정렬 상태는 헤더에 화살표로 표시.
   - **진행률 컬럼**: 녹음(18문항)+쓰기(10문항)=28 세그먼트… 대신 2트랙 미니 바
     (녹음 바 + 쓰기 바, 각 트랙 채움 비율)와 `12/18 · 8/10` 숫자 병기.
     완료(둘 다 만점)면 중립 색, 미완료면 rec 계열 강조.
   - **상태 배지 3단계**: `제출 완료`(mint) / `제출 · 미완료 있음`(amber) / `진행 중`(회색/ink-mute).

## 컴포넌트·모듈 구조

```
app/admin/page.tsx            — 서버: listSessions() → <AdminDashboard sessions />
components/admin/
  AdminDashboard.tsx          — 'use client'. 필터·정렬 상태 단일 보유(useState),
                                 lib/adminStats의 순수 함수 호출, 하위 3개 조립
  StatsCards.tsx              — KPI 카드 4장 (presentational, onClick 콜백)
  SchoolBreakdown.tsx         — 학교별 현황 (presentational, onClick 콜백)
  SessionTable.tsx            — 필터 바 + 테이블 (필터/정렬 상태는 props로 수신)
lib/adminStats.ts             — 순수 함수 모듈 (React 무의존):
  computeKpis(sessions, now)        → { total, submitted, inProgress, today }
  computeSchoolStats(sessions)      → [{ school, total, submitted, rate }] 정렬 포함
  sessionProgress(row, totals)      → { recorded, written, incomplete }
  filterSessions(sessions, filters, now) → 필터 적용 결과
  sortSessions(rows, sortKey, dir, totals) → 정렬 결과
```

필터 상태 형태: `{ q: string; status: 'all'|'submitted'|'inProgress'; school: string|null; grade: number|null; today: boolean }`
정렬 상태: `{ key: 'name'|'school'|'started'|'progress'; dir: 'asc'|'desc' }`

`now`는 호출부에서 주입(테스트 용이성, "오늘" 판정에 사용). "오늘" 판정은 로컬 타임존
`toDateString()` 비교 — 기존 page.tsx 로직과 동일 기준.

## 데이터 흐름·에러 처리

- 서버 컴포넌트가 `listSessions()` 한 번 호출(변경 없음) → 전체를 클라이언트로 전달.
- 모든 집계·필터·정렬은 클라이언트 순수 함수.
- **필터·정렬 상태는 URL searchParams에 동기화**(사용자 결정 — 새로고침·링크 공유 시 유지):
  `?q=&status=&school=&grade=&today=&sort=&dir=`. 기본값과 같은 키는 URL에서 생략.
  구현은 `useSearchParams` + `router.replace`(scroll:false, 히스토리 오염 방지).
  URL ↔ 상태 파싱/직렬화도 `lib/adminStats.ts`의 순수 함수로 두고 단위 테스트
  (`parseFilters(searchParams)` / `filtersToQuery(filters, sort)`; 잘못된 값은 기본값으로 폴백).
- 에러 처리는 기존과 동일: `listSessions` 실패 시 Next 에러 바운더리. 신규 실패 경로 없음.

## 테스트

- `lib/adminStats.ts` 전 함수 vitest 단위 테스트 (`tests/` 기존 패턴 준수):
  KPI 집계(오늘 경계 포함), 학교 집계·정렬·제출률, 필터 조합(검색×상태×학교×학년×오늘),
  정렬(각 키, 방향, 진행률 동률), 진행률 계산(중복 item_code 녹음은 1개로 집계).
- UI는 수동 확인: 카드/학교 클릭 → 필터 연동, 정렬 토글, 빈 상태 문구.
- `npm test` + `npm run typecheck` 통과 필수.
