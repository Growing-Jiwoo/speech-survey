# 사용성 개선 Phase 1 — 아동/검사자 흐름 안정성 설계

날짜: 2026-07-14
상태: 승인됨 (사용자 검토 대기)
관련: Phase 2(관리자 개선), Phase 3(백엔드·보안)와 함께 진행되는 3단계 사용성 개선의 1단계

## 배경·목표

KODYS-G1 초등 1학년 선별검사 웹의 아동/검사자 흐름은 완성도가 높으나, **조용히 데이터를
잃거나 잘못된 상태로 진행되는 신뢰성 결함**이 다수 있다. 특히 태블릿(iOS Safari) 배포 환경과
6~7세 아동 + 옆에 앉은 검사자라는 사용 맥락에서 치명적이다. 본 단계는 신규 화면 없이
기존 컴포넌트의 결함을 외과적으로 고친다.

대상: 사용자가 선택한 항목 1,2,3,4,5,6,7,8,9,10.

## 공통 사항 (3단계 공유)

- 신규 의존성(전체 3단계 합): `wavesurfer.js`, `@tanstack/react-table`, `zod`, `@node-rs/argon2`.
  이 중 Phase 1에서 도입하는 것은 **없음**(순수 로직·UI 수정). `zod`는 Phase 3에서 도입.
- 기존 디자인 토큰(`app/globals.css`)·Tailwind 유틸 유지. UI 껍데기 재작성 없음.
- 각 단계는 독립 PR + 자체 테스트. Phase 1을 최우선 배포.

## 스코프 제외 (YAGNI)

- 서버 측 재개(cross-device resume) — localStorage 자동 재개만. 다른 기기 이어하기는 제외.
- react-hook-form 도입 — 시작 페이지 폼은 기존 useState 구조 유지(Phase 3에서 zod 검증만 공유).
- 채점·관리자 기능(Phase 2), 백엔드/보안(Phase 3).

---

## 항목별 설계

### 1. 진행 위치·상태 유실 (A-1) 🔴

**현상**: `SurveyState`(`lib/survey-state.ts`)는 `sessionStorage`에 저장되고 현재 문항
인덱스(`idx`)·단계(`phase`)를 담지 않는다. `app/survey/page.tsx:15`가 `idx`를 항상 `0`으로
초기화 → 새로고침/OS 탭 회수 시 처음으로 복귀. `sessionStorage`는 탭을 닫으면 소멸 → 재개 불가.
낱말쓰기·체크리스트 답은 최종 제출 시점에만 서버 저장되므로 제출 전 이탈 시 유실.

**설계**:
- `SurveyState`에 `idx: number`, `phase: 'mic' | 'item'` 필드 추가. `newState`는
  `idx: 0`, `phase: 'mic'`로 초기화.
- 저장소를 `sessionStorage` → `localStorage`로 이전. 키를 `kodys-survey:{sessionId}`로
  세션별 분리(기존 단일 키 `kodys-survey` 대체). 이전 형식 키는 무시(마이그레이션 불필요 —
  진행 중 세션은 극소수, 유실돼도 서버 녹음은 보존).
- `survey/page.tsx`의 `patch`가 `idx`·`phase` 변경도 저장하도록 통합. 마운트 시
  URL의 `q` 파라미터가 있으면 그것을, 없으면 저장된 `idx`를 복원.
- `phase`도 상태에서 복원(현재는 `micDone`만 보고 `mic`으로 강제). 마이크 확인을 이미
  통과했으면 `item`으로 복원.
- 별도 "이어하기" 확인 UI 없이 **자동 복원**(사용자 선택 방식).
- `clearState`는 현재 세션 키를 지운다(제출 완료 시 `review/page.tsx`에서 호출).

**주의**: `loadState`는 이제 `sessionId`를 알아야 키를 만들 수 있으나, 진입점(`/survey`,
`/review`)은 세션ID를 URL이 아닌 저장소에서 얻는다. → 최근 활성 세션 포인터
(`kodys-survey:last` = 마지막 sessionId)를 함께 저장하고, 인자 없는 `loadState()`는
그 포인터로 실제 상태를 읽는다. `saveState`가 포인터도 갱신.

### 2. iOS Safari 녹음 무음 실패 (A-2) 🔴

**현상**: `hooks/useRecorder.ts`의 `start`가
① `getUserMedia` 성공 후 `AudioContext` 생성 중 예외 시 `stream`을 정리 안 함(마이크 누수,
`cleanupRef` 할당은 `:53`으로 뒤늦음) ② `ctx.resume()` 미호출 → iOS에서 suspended 시작 시
레벨미터가 0 고정, 마이크 확인을 영원히 통과 못 함 ③ `MediaRecorder` 미지원/`start()`
`NotSupportedError`가 호출부에서 전부 "권한 거부"(`micDenied`)로 오표시.
(웹 리서치: iOS는 `isTypeSupported('audio/webm;codecs=opus')`가 true여도 `start()`가
throw하며 무음 녹음되는 사례 존재.)

**설계**:
- `start` 진입 즉시, `getUserMedia` 직후 `stream`을 잡으면 곧바로 정리 콜백을 등록해
  이후 어느 줄에서 throw해도 트랙이 정지되도록 순서 교정.
- `new AudioContext()` 직후 `await ctx.resume()` 호출(사용자 제스처 컨텍스트 내이므로 허용).
- `new MediaRecorder(...)`와 `rec.start()`를 try/catch로 감싸고, 실패 시 정리 후
  구분된 에러를 던진다. 에러 종류를 판별 가능하게 `useRecorder`가 예외에 코드를 실어 던지거나
  `onError(kind)` 콜백을 받는다. 최소 3종 구분: `'denied'`(권한), `'unsupported'`
  (MediaRecorder 미정의 또는 mime 없음), `'failed'`(기타).
- 호출부(`MicCheck`, `RecordingItem`)는 `micDenied` 단일 플래그 대신 에러 종류에 따라
  다른 안내를 표시. `'unsupported'`는 "이 브라우저에서는 녹음을 지원하지 않아요. Safari/Chrome
  최신 버전에서 다시 시도해 주세요." 문구.

### 3. 마지막 문항 버튼 라벨 (#3) 🟠

**현상**: `survey/page.tsx:125`에서 마지막 문항 버튼이 `제출`이지만 `goNext`(`:46`)는
`/review`로 이동. 사용자는 제출을 기대하나 또 다른 제출 버튼이 있는 화면으로 감.

**설계**: 마지막 문항 버튼 라벨을 `제출` → `검토`로 변경(동작은 그대로 `/review`).

### 4. 업로드 중 이동 차단 (#4) 🟠

**현상**: `canNext`(`survey/page.tsx:44`)는 `isRecording`만 검사. 녹음 정지 후 업로드
중(`RecordingItem`의 `busy=true`, `isRecording=false`)에 [다음] 이동 가능 → `RecordingItem`이
`key={item.code}`로 언마운트되어 업로드 실패 시 재시도 UI가 사라지고 녹음 유실.

**설계**: `RecordingItem`이 `busy` 상태를 상위로 올리도록 `onBusyChange?: (busy: boolean) => void`
콜백 추가(기존 `onRecordingChange` 패턴 재사용). `survey/page.tsx`에 `isUploading` 상태 추가,
`canNext`에 `&& !isUploading` 및 [이전] 버튼 `disabled`에도 반영.

### 5. 타이머 단일화 (#5) 🟠

**현상**: 카운트다운이 3중으로 각자 돎 — `RecordButton`의 링(100ms `elapsed`,
`:16-21`), `RecordingItem`의 "남은 시간" 라벨(200ms, `:51-57`), `useRecorder`의 자동정지
`setTimeout`(`:72`). 각기 다른 `Date.now()` 기준·반올림이라 서로 어긋난다.

**설계**: `useRecorder`가 단일 시계를 노출한다. 훅 내부에서 `rAF` 또는 하나의 인터벌로
`elapsedMs`를 관리하고 `{ state, level, elapsedMs, remainingSec, start, stop }`를 반환.
`RecordButton`은 `elapsedMs/maxSec`로 링을, `RecordingItem`은 `remainingSec`로 라벨을
그린다(둘 다 동일 소스). `RecordButton`·`RecordingItem`의 개별 타이머 `useEffect` 제거.
자동정지 `setTimeout`도 같은 시계 기준으로 유지(정합성 확보). `maxSec`·`remainingSec`은
`Math.ceil` 규칙 하나로 통일.

### 6. 저음 임계값 통일 (#6) 🟠

**현상**: 마이크 확인 통과 기준 `MIC_OK_PEAK = 0.1`(`MicCheck.tsx:9`)과 실제 녹음
저음 경고 기준 `SILENT_PEAK = 0.01`(`RecordingItem.tsx:8`)이 10배 차이. 마이크 확인을
간신히 통과한 아동이 실제 문항을 훨씬 작게 녹음해도 "완료"로 표시됨.

**설계**: `lib/audio.ts`(또는 `useRecorder` 인접)에 임계값 상수를 한 곳에 정의.
- `MIC_MIN_PEAK`: 마이크 확인 통과 및 녹음 저음 경고에 **동일 값** 사용.
  값은 현재 마이크 확인 기준(0.1)을 기준선으로 채택하되, 실기기 튜닝 여지를 주석에 명시.
- `MicCheck`와 `RecordingItem`이 이 상수를 import. 매직넘버 중복 제거.

### 7. "특이사항 없음" 배타 선택 (#7) 🟠

**현상**: 체크리스트(`survey/page.tsx:87-116`, 옵션 `lib/items.ts:56`)의 `none`(특이사항
없음)이 일반 체크박스라 "없음"+"인지" 동시 선택 가능 → 모순 데이터.

**설계**: 체크박스 토글 핸들러에 배타 로직 추가.
- `none` 선택 시 → `checklist`를 `['none']`으로 설정(나머지 해제).
- 다른 영역 선택 시 → `checklist`에서 `none` 제거 후 해당 영역 토글.
- 관리자 결과지·CSV에서도 `none`은 "특이사항 없음"으로 정상 표기(기존 `areaLabel` 유지).

### 8. 제출 확인 모달 접근성 (#8) 🟠

**현상**: `review/page.tsx:112-136`의 모달은 `role="dialog"`·`aria-modal`은 있으나
초기 포커스 이동·포커스 트랩·Esc 닫기가 없다. 키보드/스크린리더 사용자가 오버레이 뒤에 갇힘.

**설계**: 재사용 가능한 `useFocusTrap(active: boolean)` 훅 신설(`hooks/useFocusTrap.ts`).
- 활성화 시 컨테이너 첫 포커서블 요소(여기선 "아니오")로 포커스 이동.
- Tab/Shift+Tab을 컨테이너 내부로 순환(트랩).
- Esc 키로 닫기(단, `busy` 중엔 무시 — 기존 외부 클릭 규칙과 동일).
- 모달 해제 시 직전 포커스(제출 버튼)로 복귀.
- 신규 의존성 없이 직접 구현(Radix 미도입 — 사용자 선택). Phase 2의 관리자 다이얼로그가
  생기면 동일 훅 재사용.

### 9. prefers-reduced-motion (#9) 🟠

**현상**: 전역 CSS(`globals.css:57`)에 reduce 규칙이 있으나, 이는 `animation`/`transition`
전역 차단이라 실제로는 개별 요소를 덮는다. 그러나 검토 결과 녹음 링(`RecordButton`의 SVG
`strokeDashoffset` 변화), 레벨미터 `transition-colors`, 프로그레스바 `transition-all`,
펄스(`blip-antpulse`)가 전부 전역 규칙에 걸리는지 확인 필요. `strokeDashoffset`은 인라인
`style` 기반 애니메이션이 아니라 React 리렌더라 CSS 규칙으로 막히지 않는다.

**설계**:
- `useRecorder`가 노출하는 단일 시계 기반 링은 값 자체가 계속 갱신되므로, reduce 환경에서
  **부드러운 채움 대신 이산 갱신**은 유지하되(정보 전달 필요) 불필요한 장식 애니메이션
  (`blip-antpulse` 펄스, 성공 체크의 스케일 등)만 `motion-reduce:` 유틸로 정지.
- 레벨미터·프로그레스바의 `transition-*`에 `motion-reduce:transition-none` 명시(전역 규칙
  의존 대신 컴포넌트 국소화하여 의도를 명확히).
- 원칙: **기능 전달용 움직임(레벨미터 막대, 카운트다운 숫자)은 유지**, 순수 장식만 정지.

### 10. 레벨미터·체크박스 접근성 (#10) 🟠

**현상**: 레벨미터(`LevelMeter.tsx`)가 색상(`bg-blue`/`bg-line`)만으로 상태 전달,
`aria-label="목소리 크기"`만 있고 값 없음(WCAG 1.4.1). 체크리스트 체크박스 native control이
16px(`survey/page.tsx:100`, WCAG 2.5.8 권장 24px 미만) — 감싼 `<label>`이 크지만 native
컨트롤 자체가 작음.

**설계**:
- 레벨미터: `role="meter"` + `aria-valuenow/min/max`(0~100 정규화) + `aria-label` 유지.
  시각적으로 색 외 신호 보강(활성 막대에 미세한 높이/투명도 차 → 이미 높이는 다르나,
  저시력 대비를 위해 활성 색을 충분한 대비의 blue로 확인). 색맹 대비 텍스트 필요는 없음
  (막대 개수/높이가 이미 형태 신호 제공).
- 체크박스: native `input`을 `h-4 w-4` → 시각 크기는 유지하되 **터치 타깃을 24px 이상**으로.
  `<label>` 전체가 이미 클릭 가능하므로(패딩 `px-4 py-3`) 실질 타깃은 충족 — 이 경우
  변경은 native input에 최소 크기 보장 또는 문서상 확인만. 실제 미달 시 input 크기/패딩 조정.

---

## 데이터 흐름 (변경 요약)

```
localStorage[kodys-survey:{id}] ← saveState(state{idx,phase,recorded,writing,checklist})
localStorage[kodys-survey:last] ← 최근 sessionId 포인터
useRecorder → { state, level, elapsedMs, remainingSec, start, stop }  (단일 시계)
             start(): getUserMedia → cleanup 등록 → ctx.resume() → MediaRecorder try/catch
             예외 → { kind: 'denied'|'unsupported'|'failed' }
```

## 오류 처리

- 녹음 실패는 종류별 안내(#2). 업로드 실패는 기존 재시도 UI 유지하되 이동 차단으로 유실 방지(#4).
- localStorage 접근 실패(사파리 프라이빗 등)는 기존 `try/catch` 유지 → 저장 실패 시 메모리
  상태로만 진행(현행 동작 유지, 회귀 없음).

## 테스트

- 단위(vitest): `survey-state`의 idx/phase 저장·복원·세션별 키·last 포인터; 배타 선택 로직;
  `remainingSec` 계산 정합성.
- `useRecorder`: 예외 종류 분기(모의 `getUserMedia`/`MediaRecorder`로 denied/unsupported/failed).
- 수동 E2E(실기기 iOS Safari 필수): 마이크 확인 통과 → 무음 녹음 없음, 20문항 진행 후
  새로고침·탭 닫기 후 재진입 시 같은 문항 복원, 업로드 중 [다음] 잠금, 모달 키보드 조작.
- README의 E2E 체크리스트에 "탭 닫기 후 재개", "iOS 무음 녹음 없음", "모달 Esc/포커스" 추가.

## 완료 기준

1~10 전 항목이 코드에 반영되고, 위 단위 테스트 통과 + `npm run typecheck` 통과 +
iOS Safari 실기기 수동 체크리스트 통과.
