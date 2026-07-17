# 데스크톱 UI 구현 계획 (2026-07-17)

설계: [specs/2026-07-17-desktop-ui-design.md](../specs/2026-07-17-desktop-ui-design.md)
브랜치: `feat/desktop-ui` (base: `quality-uplift`)

## 작업 단위

1. **시작 화면 2열 그리드** — `app/page.tsx`
   - 컨테이너 `lg:max-w-2xl`, 폼 내부 `lg:grid lg:grid-cols-2 lg:gap-x-5`
   - 셀 배치: 학교명·생년월일·연락처·동의카드·제출버튼 = `lg:col-span-2`,
     [학년·반]과 [성별], [이름]과 [담임교사명]을 나란히
   - `data-field` 포커스 타깃·FieldError 연결 유지 확인
2. **검사 화면 무대화** — `app/survey/page.tsx`, `components/survey/MicCheck.tsx`
   - `lg:max-w-2xl` + `lg:justify-center`, 내비 `mt-auto lg:mt-12`
   - MicCheck도 동일 원칙(중앙 정렬은 이미 유사 — 폭·타이포만)
3. **제시어 타이포 스케일** — `RecordingItem.tsx`, `WritingItem.tsx`
   - 낱말 `text-[38px] lg:text-[64px]`, 문장 `text-[22px] lg:text-[30px]`
4. **검토 2열** — `app/review/page.tsx`
   - `lg:max-w-4xl`, 섹션 4장 `lg:grid lg:grid-cols-2 lg:items-start lg:gap-4`
5. **done 소폭 확대** — `app/done/page.tsx`
6. **검증** — 375/768/1280/1600 스크린샷, 모바일 회귀 없음 확인, 4종 검사
   (lint·typecheck·test·build)

## 리스크

- 그리드 전환 시 모바일 마진 리듬(mt-4 라벨 등)이 흐트러질 수 있음 → 그리드는 `lg:`에서만
  활성화하고 base 클래스는 손대지 않는다
- `justify-center`와 `mt-auto` 상호작용 → `lg:mt-12`로 오버라이드해 명시적으로 해제
