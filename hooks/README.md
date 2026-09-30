# hooks/ — 커스텀 React 훅

| 파일 | 역할 |
|---|---|
| `useRecorder.ts` | MediaRecorder 녹음 훅 — 시작/정지·maxSec 자동 종료·레벨미터(peak)·경과 시계. 마이크 트랙 정리(cleanup)를 스트림 확보 직후 등록해 어떤 실패 경로에서도 마이크가 켜진 채 남지 않게 한다. iOS AudioContext resume 처리 포함 |
| `useAdminQueries.ts` | 관리자 데이터 react-query 훅 + 쿼리 키 단일 소스(`adminKeys`) — 무효화 호출부가 키 리터럴을 복사하지 않게 한다. `useRosterQuery`는 아동 실명을 캐시하므로 로그아웃 시 함께 지워지도록 `adminKeys` 트리 안에 둔다 |
| `useSurveyForm.ts` | 진행 중인 세션의 검사지를 서버에서 받는다(`POST /api/sessions/form`, 토큰은 바디로). 검사·검토 화면이 lib/forms를 import하면 문항이 공개 JS에 실리므로 **양식은 이 훅으로만 얻는다.** 세션 안에서 양식은 바뀌지 않아 `staleTime: Infinity` — 검사 화면에서 받은 것을 검토 화면이 캐시로 즉시 쓴다. 401·404·409는 다시 시도해도 같으므로 재시도하지 않는다(`isFatalFormError`) |
| `useFocusTrap.ts` | 다이얼로그 포커스 트랩 — 초기 포커스·Tab 순환·Esc 콜백·해제 시 포커스 복귀. 안쪽 컴포넌트가 이미 처리한 Esc(`defaultPrevented` — 드롭다운 닫기)는 다이얼로그를 닫지 않고, `inert`로 막힌 부분(안쪽 겹창 뒤)은 Tab 순환에서 뺀다. ⚠️ 복귀할 곳은 **트랩이 켜질 때의 포커스**다 — 같은 렌더에서 창 안으로 포커스를 옮기는 효과는 이 훅 **뒤에** 둘 것(앞에 두면 닫을 때 사라진 요소로 돌아가려다 포커스가 body로 떨어진다, components/results/ScanUpload) |

관례: 훅에서 분리 가능한 순수 계산(예: 남은 시간, 오류 분류)은 `lib/`로 추출해
node 테스트로 검증한다(`lib/audio.ts`가 그 예).
