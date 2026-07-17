# components/admin/ — 관리자(채점자) 화면 컴포넌트

교사·연구자가 세션을 훑고 녹음을 청취해 채점하는 화면. **필터·정렬 상태의 단일 소스는
URL searchParams**(딥링크·뒤로가기 복원 가능)이고, 데이터는 react-query로 캐싱된다
(`hooks/useAdminQueries.ts`).

| 파일 | 역할 |
|---|---|
| `AdminDashboard.tsx` | `/admin` 오케스트레이션 — URL↔필터 동기화, KPI/목록 파생값 메모, 새로고침·로그아웃 |
| `StatsCards.tsx` | KPI 카드 4장(전체/제출/진행중/오늘) — 클릭 시 해당 필터 토글 |
| `SchoolBreakdown.tsx` | 학교별 참여·제출 막대 — 클릭 시 학교 필터 토글 |
| `FilterToolbar.tsx` | 검색(250ms 디바운스)·상태 탭·학교/학년 Select·초기화 |
| `SessionTable.tsx` | 세션 목록 표 — react-table(컬럼 골격) + 행 가상화(5,000행 대비). 정렬은 URL 로직 사용(내장 모델 미사용 — 이중 상태 방지) |
| `AdminDetailView.tsx` | `/admin/[id]` 결과지 — 헤더(아동 정보·진행 KPI)·이전/다음 아동 내비·세션 삭제(확인 모달) |
| `RecordingsTable.tsx` | 결과지의 녹음 문항 표 — 모든 시도(재녹음 포함) 표시, wavesurfer 지연 로드 |

주의: 세션 목록/결과지에는 아동 PII가 표시된다 — 로그아웃 시 react-query 캐시를 비운다
(`AdminDashboard.logout`). 새 화면을 추가하면 같은 원칙을 지킬 것.
