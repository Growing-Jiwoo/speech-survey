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
| `AdminDetailView.tsx` | `/admin/[id]` 오케스트레이션 — 수집 진행 KPI·이전/다음 아동 내비·세션 삭제(확인 모달). 결과지 본문은 `ResultSheet`에 위임 |
| `ResultSheet.tsx` | 결과지 본문 — 종이 검사지와 같은 순서로 배치하고, 각 줄에 아동의 결과물(녹음·검사 중 응답)과 채점 입력을 함께 둔다. 채점 상태·저장을 소유 |
| `sheet/ScoreBand.tsx` | 상단 총평 밴드 — 과제별 점수·Pass/Fail. **채점이 끝나지 않은 과제는 판정을 내지 않는다** |
| `sheet/Subtotal.tsx` | 검사지의 소계 행(의미/무의미/총점). 미완료면 숫자 대신 `—` |
| `sheet/WordGrid.tsx` | 검사지형 낱말 격자(가로 배열) — 낱말 해독은 채점, 낱말 쓰기는 검사 중 기록(읽기 전용) |
| `sheet/SentenceRows.tsx` | 문장 읽기유창성 행 — 문장·녹음·어절 수 입력을 한 줄에 |
| `sheet/PageAudio.tsx` | 섹션에 인라인으로 붙는 페이지 녹음 — 시도 전환·미녹음·제한시간 초과 표시 |

**공식 출력물은 화면이 아니라 검사지 PDF다**(`/api/admin/sessions/[id]/sheet.pdf`).
담당자 배포 원본 PDF에 점수만 얹으므로 양식이 어긋날 여지가 없다.

주의: 세션 목록/결과지에는 아동 PII가 표시된다 — 로그아웃 시 react-query 캐시를 비운다
(`AdminDashboard.logout`). 새 화면을 추가하면 같은 원칙을 지킬 것.
