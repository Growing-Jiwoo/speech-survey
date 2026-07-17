# components/ — UI 컴포넌트

루트에는 화면을 가리지 않는 **공용 컴포넌트**, 하위 폴더에 도메인별 컴포넌트를 둔다
(`survey/` 참여자 검사 화면, `admin/` 관리자 화면). 로직은 넣지 않는다 — 계산·검증은 `lib/`,
데이터 로딩은 `hooks/`.

## 공용

| 파일 | 역할 |
|---|---|
| `Badge.tsx` | 상태 pill(tone: blue/mint/amber/rec/mute) — 완료/누락/주의 표시의 단일 스타일 소스 |
| `ConfirmDialog.tsx` | 확인 모달 — 포커스 트랩·Esc/오버레이 닫기·busy 잠금·배경 스크롤 잠금 내장. 파괴적 동작은 `danger` |
| `Select.tsx` | 커스텀 드롭다운 — body 포탈(overflow 클리핑 회피) + ARIA listbox 키보드 내비(`aria-activedescendant`) |
| `Blip.tsx` | 마스코트/로고 SVG. 감정 연출(축하·응원) 변형은 만들지 않는다(스펙: 평가 비노출) |
| `RecordButton.tsx` | 대형 녹음 버튼 + 남은 시간 진행 링(strokeDashoffset 카운트다운) |
| `LevelMeter.tsx` | 목소리 크기 막대 5개 — "기계가 듣고 있다"는 기능 피드백(칭찬 신호 아님) |
| `AudioPlayer.tsx` | 채점용 wavesurfer 플레이어 — 파형 시크·배속·키보드(Space/±5초)·IntersectionObserver 지연 생성 |
| `AudioBus.tsx` | 동시 재생 1개 보장 컨텍스트(새 재생 시작 시 직전 플레이어 정지) |
| `LoadingOverlay.tsx` | 전역 로딩 dim — 지연 노출(150ms)·최소 노출(250ms)로 깜빡임 방지 |
| `Spinner.tsx` | 인라인 스피너(currentColor 상속) |
| `ProgressBar.tsx` | 검사 진행률(현재/전체 문항) |
| `SchoolPicker.tsx` | 지역(교육청) 선택 → 학교 검색·선택 (데이터: `public/schools/*.json`) |

## 스타일 관례

- 색·간격은 `app/globals.css`의 `@theme` 토큰 사용. 임의 hex 금지.
- 버튼: 화면 주 행동은 `.cta`, 나란한 내비/모달 버튼은 `.btn-ghost`/`.btn-primary`/`.btn-danger`
  (크기 h-* / flex-* 는 호출부에서).
- 상태 pill은 `Badge`를 쓰고 rounded-full 마크업을 새로 만들지 않는다.
