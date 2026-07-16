# hooks/ — 커스텀 React 훅

| 파일 | 역할 |
|---|---|
| `useRecorder.ts` | MediaRecorder 녹음 훅 — 시작/정지·maxSec 자동 종료·레벨미터(peak)·경과 시계. 마이크 트랙 정리(cleanup)를 스트림 확보 직후 등록해 어떤 실패 경로에서도 마이크가 켜진 채 남지 않게 한다. iOS AudioContext resume 처리 포함 |
| `useAdminQueries.ts` | 관리자 데이터 react-query 훅 + 쿼리 키 단일 소스(`adminKeys`) — 무효화 호출부가 키 리터럴을 복사하지 않게 한다 |
| `useFocusTrap.ts` | 다이얼로그 포커스 트랩 — 초기 포커스·Tab 순환·Esc 콜백·해제 시 포커스 복귀 |

관례: 훅에서 분리 가능한 순수 계산(예: 남은 시간, 오류 분류)은 `lib/`로 추출해
node 테스트로 검증한다(`lib/audio.ts`가 그 예).
