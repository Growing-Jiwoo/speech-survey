# 사용성 개선 Phase 2 — 관리자 개선 설계

날짜: 2026-07-14
상태: 승인됨 (사용자 검토 대기)
관련: Phase 1(아동 흐름), Phase 3(백엔드·보안)와 함께 진행되는 3단계 사용성 개선의 2단계

## 배경·목표

관리자/검사자가 여러 아동의 녹음을 청취해 **수기 채점**하는 작업의 효율과 정확성을 높인다.
본 단계는 채점 입력·저장(B-1)은 **포함하지 않는다**(사용자 선택). 즉 "더 잘 듣고, 더 빨리
아동 간 이동하고, 목록을 신뢰성 있게 보는" 데 집중한다. 채점 결과는 기존대로 외부(PDF 기준표)
수기 유지.

대상: 사용자가 선택한 항목 11,12,13,14,15,16,17,18.

## 신규 의존성

- `wavesurfer.js` — 채점용 오디오 플레이어(파형·배속·구간·키보드).
- `@tanstack/react-table` — 세션 목록의 정렬/필터/(가상화 연계). 이미 `@tanstack/react-query`
  사용 중이라 생태계 일관.

## 스코프 제외 (YAGNI)

- **채점 입력·저장·판정(B-1)** — 사용자가 목록에서 제외. DB 스키마(scores) 신설 없음.
- CSV/엑셀 내보내기 — 이번 배치 목록에 없음(README의 "CSV 지원" 문구와 실제 부재는 별도 항목).
- PIPA 접근 로그·per-admin 계정(Phase 3에서 인증만 다룸).

## 선행 결정과의 조율 — 페이지네이션(항목 13) ⚠️

기존 스펙 `2026-07-14-admin-visibility-design.md`는 **"데이터 규모는 수백 건 이하 전제 →
서버 페이지네이션 불필요, 전량 클라이언트 처리"**를 명시했다. KPI·학교별 현황·필터는 전체
집합이 있어야 계산되므로, 서버 페이지네이션을 도입하면 이 집계 로직을 서버로 옮기는 큰 변경이
따른다. 본 항목의 실제 통증은 **렌더 비용**(전 행 × 애니메이션 2개)과 네트워크 페이로드다.

→ **채택안: 클라이언트 가상화(virtualization) 우선, 서버 페이지네이션은 보류.**
전량 페치·클라이언트 집계는 유지하되, 테이블 렌더만 `@tanstack/react-virtual`(또는
react-table 연계)로 창(window) 처리해 수천 행에서도 렌더 비용을 상수로 만든다. 네트워크
페이로드가 실제 문제가 될 규모(수천 건 이상)가 확인되면 그때 서버 페이지네이션을 별도 검토.
*이 조율안이 사용자 의도(항목 13)와 맞는지 검토 게이트에서 확인 요망.*

---

## 항목별 설계

### 11. wavesurfer 기반 채점용 오디오 플레이어 🔴

**현상**: `components/AudioPlayer.tsx`는 재생/일시정지만 있고 진행바는 표시 전용
`<div>`(클릭·드래그 불가), 배속·되감기·구간반복·키보드 없음. `preload="none"`이라 첫 클릭마다
서명 URL 페치 지연. 여러 `<audio>` 동시 재생 가능. `AdminDetailView`는 `duration_sec`를
받아오지만(`byItem`) 표시하지 않는다.

**설계**: `AudioPlayer`를 wavesurfer 기반으로 교체(동일 props `{ src }` + 확장).
- **파형 + 시크**: 파형 클릭/드래그로 임의 위치 이동.
- **배속**: 0.75×·1×·1.25×·1.5× 토글(`wavesurfer.setPlaybackRate`). 채점 시 느린 발화 확인.
- **되감기**: "−5초" 버튼(`skip(-5)`).
- **키보드**: 플레이어 포커스 시 Space(재생/정지), ←/→(5초 이동). `aria` 라벨 유지.
- **동시 재생 방지**: 앱 전역 "현재 재생 중인 플레이어" 공유 컨텍스트(`AudioBus`,
  React Context + ref). 새 재생 시작 시 이전 것을 정지. `AdminDetailView`를 이 Provider로 감쌈.
- **길이 표시**: `AdminDetailView`가 이미 가진 `duration_sec`를 각 행에 `mm:ss`로 표시하고,
  `item.maxSec`(30/40초) 초과 시 색 플래그(amber). `byItem`에서 버려지던 값을 살린다.
- **지연 완화**: `preload="metadata"` 또는 화면에 들어온 행만 wavesurfer 인스턴스 생성
  (IntersectionObserver 지연 로드) — 결과지당 최대 ~26개 인스턴스 동시 생성 방지.

### 12. 서명 URL 만료 중 무음 실패 🟠

**현상**: 서명 URL은 1시간(`lib/db.ts`의 `createSignedUrl(path, 3600)`), 상세 캐시는
staleTime 5분/gcTime 30분. 1시간 넘게 결과지를 열어두고 채점하면 URL 만료 → 재생이 조용히 무반응
(`onError` 미연결).

**설계**:
- wavesurfer의 로드 에러 이벤트에서 `queryClient.invalidateQueries(['admin','session',id])`로
  상세를 재페치 → 새 서명 URL 발급 후 자동 복구. 재생 의도를 기억해 재로드 후 이어서 재생 시도.
- 병행: `signedAudioUrl` TTL을 작업 세션보다 넉넉히 상향(예 6~12시간) — 단, TTL 상향은
  보안 트레이드오프이므로 Phase 3의 서명 URL 정책과 함께 값 결정. 최소한 만료 시 자동 복구가
  1차 방어선.

### 13. 목록 가상화 (페이지네이션 조율안) 🟠

**현상**: `SessionTable`이 `rows.map`으로 전 행을, 각 행에 애니메이션 트랙 2개
(`ProgressCell`)를 렌더. `/api/admin/sessions`는 전 세션을 무한 반환.

**설계**(위 조율안):
- `SessionTable`을 `@tanstack/react-table`(headless) 컬럼 정의 + `@tanstack/react-virtual`
  행 가상화로 재구성. 현 Tailwind 셀 스타일·정렬 헤더(`Th`)·상태 배지·진행률 셀 디자인은 보존.
- 클라이언트 전량 페치·집계(KPI/학교별/옵션)는 유지.
- 정렬/필터는 계속 부모(`AdminDashboard`)의 `adminStats` 로직 사용(react-table의 내장 대신
  기존 URL 동기화 로직 유지) — react-table은 컬럼/가상 렌더 골격으로만 사용해 회귀 최소화.

### 14. 파생값 매 렌더 재계산 🟠

**현상**: `AdminDashboard`가 `computeKpis`/`computeSchoolStats`/`filterSessions`/
`sortSessions`를 `useMemo` 없이 매 렌더 실행. 키 입력마다 전체 재계산.

**설계**: 각 파생값을 의존성 배열과 함께 `useMemo`로 감쌈. `now`(Date)는 `useMemo` 의존성에서
안정적으로 다루기 위해 별도 상태로 관리(항목 16과 연계).

### 15. 신규 제출 미반영 🟠

**현상**: `providers.tsx`가 `refetchOnWindowFocus:false`+staleTime 5분, 수동 새로고침
버튼 없음. 검사 진행 중 목록이 최대 5분간 갱신 안 됨.

**설계**:
- 목록 툴바에 "새로고침" 버튼 추가 → `queryClient.invalidateQueries(['admin','sessions'])`,
  갱신 중 스피너 표시(전면 오버레이 아님, 버튼 인라인).
- 목록 쿼리(`useSessionsQuery`)에 한해 `refetchOnWindowFocus: true` 개별 오버라이드
  (전역 기본은 유지 — 결과지 캐시 안정성 위해).
- (선택) 목록에 자동 폴링(`refetchInterval`)은 기본 off, 필요 시 옵션. 이번엔 수동+포커스만.

### 16. "오늘" 집계 KST 기준 🟠

**현상**: `computeKpis`(`adminStats.ts:37`)와 `filterSessions`(`:77`)가
`now.toDateString()`으로 로컬 타임존 날짜 비교. 자정 무렵 KST와 불일치, `now`가 렌더 시 1회
고정되어 밤샘 시 어제를 오늘로 계속 셈.

**설계**:
- 날짜 경계를 KST(UTC+9) 기준으로 명시 계산하는 헬퍼(`kstDateKey(d: Date): string` 등)를
  `adminStats.ts`에 추가하고 `computeKpis`/`filterSessions`가 이를 사용. 서버 저장
  `started_at`(UTC 가정)을 KST로 변환해 일자 키 비교.
- `now`를 `AdminDashboard`에서 상태로 두고, 포커스 시 또는 주기적(예 1분)으로 갱신해 밤샘 시
  일자 롤오버 반영. `useMemo` 의존성에 포함(항목 14 연계).

### 17. 다음/이전 아동 이동 🟠

**현상**: 결과지(`AdminDetailView`)의 이동 수단은 "← 목록"뿐. 연속 채점 시 매번 목록 왕복.

**설계**:
- 목록의 필터·정렬된 순서(`back` 쿼리로 이미 전달되는 필터 상태)를 결과지에서 재구성한다.
  결과지는 캐시된 `['admin','sessions']` 목록에 동일 필터/정렬(`parseFilters`)을 적용해
  현재 `id`의 앞/뒤 세션 id를 계산.
- 헤더 우측에 「◀ 이전 아동 / 다음 아동 ▶」 버튼. 클릭 시 `back` 쿼리를 보존한 채
  `/admin/{prevId|nextId}?back=...`로 이동. 경계(처음/끝)에서 해당 버튼 비활성.
- 캐시가 없으면(직접 URL 진입) 목록 쿼리를 로드해 계산, 실패 시 버튼 숨김(graceful).

### 18. 검색·정렬·필터 UI 정리 🟠

**현상**: 검색이 이름·학교 부분일치만(`adminStats.ts:84`), 정렬 대상이 name/school/
started/progress로 제한, 학교·학년이 Select와 Chip으로 이중 표시(`SessionTable.tsx:59-68`).

**설계**:
- **검색 확장**: `filterSessions`의 키워드 매칭에 담임교사명(`teacher_name`)·반 추가.
  (생년월일은 형식 특수성으로 제외 — YAGNI.)
- **정렬 확장**: `SortKey`에 학년/반·제출일 추가(필요 최소). `sortSessions`·`Th`·URL 파서
  (`SORT_KEY_SET`)에 반영. 동일 정렬 키 내 안정적 2차 정렬(이름)로 흔들림 방지(started가
  날짜만 표시되는 문제 완화).
- **이중 표시 정리**: 학교·학년은 Select 하나로 상태를 나타내고, 활성 필터 Chip은 today 등
  Select가 없는 필터에만 사용하거나, Select 값이 있을 때 Chip을 숨긴다(둘 중 택1 —
  구현 시 Select 유지 + Chip 제거가 단순). "N건 표시"·초기화는 유지.

---

## 데이터 흐름 (변경 요약)

```
useSessionsQuery: refetchOnWindowFocus 개별 on + 수동 invalidate 버튼
AdminDashboard: now(state, 주기 갱신) → useMemo[kpis, schoolStats, filtered, sorted]
                 filterSessions/computeKpis → kstDateKey 기반 "오늘"
SessionTable: @tanstack/react-table 컬럼 + 가상 렌더 (집계는 여전히 클라이언트)
AudioBus(Context): 현재 재생 플레이어 1개만 활성
AdminDetailView: prev/next id 계산(캐시 목록 + parseFilters(back)), duration 표시,
                 wavesurfer onError → invalidate(['admin','session',id])
```

## 오류 처리

- 서명 URL 만료 → 자동 재페치 복구(12). 목록 로드 실패는 기존 에러 문구 유지하되,
  가능하면 404/기타를 구분(선택). prev/next 계산 실패는 버튼 숨김으로 degrade.

## 테스트

- 단위(vitest): `kstDateKey`/KST 일자 경계, 확장된 `filterSessions`(담임/반) 및
  `sortSessions`(학년/반·제출일 + 2차 정렬), prev/next id 계산 로직(순수 함수로 분리).
- 컴포넌트/수동: 가상화 후 대량 행 스크롤, 배속·−5초·키보드·동시재생 방지, 만료 URL 자동복구,
  새로고침 버튼·포커스 갱신, 다음/이전 아동 왕복 시 필터 보존.

## 완료 기준

11~18 반영 + 단위 테스트 통과 + `npm run typecheck` 통과 + 관리자 화면 수동 점검
(대량 목록 스크롤 성능, 채점 청취 워크플로 왕복).
