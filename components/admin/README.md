# components/admin/ — 관리자(채점자) 화면 컴포넌트

교사·연구자가 세션을 훑고 녹음을 청취해 채점하는 화면. **필터·정렬 상태의 단일 소스는
URL searchParams**(딥링크·뒤로가기 복원 가능)이고, 데이터는 react-query로 캐싱된다
(`hooks/useAdminQueries.ts`).

| 파일 | 역할 |
|---|---|
| `AdminDashboard.tsx` | `/admin` 오케스트레이션 — URL↔필터 동기화, KPI/목록 파생값 메모, 새로고침·로그아웃, `/admin/codes` 진입 링크 |
| `StatsCards.tsx` | KPI 카드 4장(전체/제출/진행중/오늘) — 클릭 시 해당 필터 토글 |
| `SchoolBreakdown.tsx` | 학교별 참여·제출 막대 — 클릭 시 학교 필터 토글 |
| `FilterToolbar.tsx` | 검색(250ms 디바운스)·상태 탭·학교/학년 Select·초기화 |
| `SessionTable.tsx` | 세션 목록 표 — react-table(컬럼 골격) + 행 가상화(5,000행 대비). 가상화 기준은 **페이지(window) 스크롤**이다: 표에 자체 스크롤 상자를 두면 페이지와 겹쳐 스크롤바가 둘이 되고 휠이 표 안에 갇힌다. 정렬은 URL 로직 사용(내장 모델 미사용 — 이중 상태 방지) |
| `AdminDetailView.tsx` | `/admin/[id]` 오케스트레이션 — 수집 진행 KPI·이전/다음 아동 내비·세션 삭제(확인 모달). 결과지 본문은 `ResultSheet`에 위임 |
| `ResultSheet.tsx` | 결과지 본문 — 검사지의 **과제 순서**만 따르는 채점 작업대. 각 과제에 아동의 결과물(녹음·검사 중 응답)과 채점 입력을 함께 두고, 채점 상태·저장을 소유. 양식 재현은 PDF가 담당한다 |
| `sheet/ScoreBand.tsx` | 상단 총평 밴드 — 과제별 점수·Pass/Fail. **채점이 끝나지 않은 과제는 판정을 내지 않는다** |
| `SessionEditDialog.tsx` | 아동 식별값(번호·이름·성별·생년월일) 수정 모달. **학년·학급은 일부러 없다** — 학년이 바뀌면 저장된 점수가 다른 양식의 문항을 가리키게 된다(`lib/schema.ts`의 `sessionEditSchema` 주석). 학급 코드를 잘못 골랐다면 수정이 아니라 삭제 후 재검사가 맞다 |
| `BadgeLegend.tsx` | 상태 배지 범례 — 화면에 **상시** 둔다. "채점 전"을 0점으로 오독하면 아직 채점하지 않은 아동이 결과지에서 0점 받은 아동과 같아 보인다 |
| `sheet/TaskSection.tsx` | 과제 한 덩어리(제목 밴드 + 구분 띠). 과제 경계를 눈으로 끊어 채점자가 지금 어느 과제를 찍는지 잃지 않게 한다 |
| `sheet/Subtotal.tsx` | 검사지의 소계 행(의미/무의미/총점). 미완료면 숫자 대신 `—` |
| `sheet/WordScoreRows.tsx` | 낱말 해독 채점 — 그룹(의미/무의미)별 **sticky 플레이어 바** + 낱말 행 리스트. 스크롤해도 지금 듣는 그룹의 플레이어가 화면 위에 붙어 "들으면서 찍기"가 된다 |
| `sheet/WritingChips.tsx` | 낱말 쓰기(G1) 검사 중 기록 — 읽기 전용이라 행 대신 낱말+O/X 칩 흐름 |
| `sheet/SentenceRows.tsx` | 문장 읽기유창성 행 — 문장·점수 입력·플레이어(자기 줄)를 한 카드에 |
| `sheet/SentenceWriteRows.tsx` | 문장 쓰기(G2) 행 — 검사 중 기록(읽기 전용). 검사지처럼 어절을 나눠 보여 준다 |
| `sheet/PageAudio.tsx` | 섹션에 인라인으로 붙는 페이지 녹음 — 시도 전환·미녹음·제한시간 초과 표시 |
| `CodeIssuer.tsx` | `/admin/codes` 오케스트레이션 — 학급 코드 발급(학교·학년·반·담임·연락처) + 목록. 목록은 `status`로 갈라 **대기(pending)는 `PendingApplications`가, 발급(active)만 이 파일의 표가** 그린다. 세션 0건인 코드만 삭제 버튼(FK restrict가 최종 방어)이고, 삭제 확인 모달은 두 섹션이 공유한다(pending 삭제 = 반려이므로 명단까지 지워진다고 문구에 밝힌다). 데이터는 `useClassCodesQuery`(react-query), 필터·탭이 없어 URL searchParams는 쓰지 않는다. 삭제 성공 뒤에는 `setQueryData`로 그 행을 캐시에서 먼저 빼고 나서 invalidate한다 — 재조회를 기다리면 지운 행이 남아 있어 다시 누를 수 있었다 |
| `PendingApplications.tsx` | 교사 신청(pending) 검토·승인 섹션 — 발급 목록보다 **위**에 둔다(관리자가 이 화면에 오는 이유는 대개 대기 건 처리다). [명단 보기]는 `useRosterQuery`로 아동 명단을 가져오고 **기본 접힘**이다(⚠️ 아동 실명 PII — 관리자가 승인 판단을 위해 직접 열 때만 표시). [승인] 후 문구는 응답의 `(already, mailed)` 조합만으로 정한다: `(false,true)` 발송 완료 / `(false,false)` 발송 실패 / `(true,false)` **발송 여부 미상**(라우트가 이전 호출의 발송을 알 수 없으므로 보냈다고도 못 보냈다고도 말하지 않는다). 확실히 나간 경우가 아니면 [안내 문구 복사]를 항상 내어 예비 전달 경로를 남긴다(검사 주소는 **승인 응답의 `surveyUrl`**을 쓴다 — `window.location.origin`으로 다시 만들면 메일에 찍힌 주소와 갈릴 수 있다). 결과 배너는 행이 active로 옮겨간 뒤에도 남고, 승인 직후 [승인] 버튼이 목록 갱신으로 사라지므로 `role="status"` + 포커스 이동으로 결과를 놓치지 않게 한다. **승인 중에는 그 행의 세 버튼을 모두 잠근다** — 승인 요청은 메일 발송까지 끝난 뒤 응답하므로 1~2초 머물고, 그 사이 같은 학급을 삭제(반려)할 수 있었다 |

**공식 출력물은 화면이 아니라 검사지 PDF다**(`/api/admin/sessions/[id]/sheet.pdf`).
담당자 배포 원본 PDF에 점수만 얹으므로 양식이 어긋날 여지가 없다.

주의: 세션 목록/결과지에는 아동 PII가, `CodeIssuer`에는 담임 성명·연락처가, `PendingApplications`의
펼친 명단에는 **아동 실명·성별·생년월일**이 표시된다 —
로그아웃 시 react-query 캐시를 비운다(`AdminDashboard.logout`의 전역 `queryClient.clear()`가
`adminKeys.codes` 캐시도 함께 지운다). 새 화면을 추가하면 같은 원칙을 지킬 것.
