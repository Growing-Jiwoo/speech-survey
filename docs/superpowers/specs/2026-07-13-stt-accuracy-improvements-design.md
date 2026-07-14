# STT 정확도 개선 — 디자인 스펙

**작성일:** 2026-07-13
**상태:** 사용자 확정
**범위:** ②단어 퍼지 비교, ③타임아웃 연장, ④`format=detailed`+`Lexical` 채택. **오디오 정규화·포맷 통일은 제외**(사용자 결정).

## 1. 배경

기존 자동 비교(`lib/compare.ts`)는 완전일치라 "apple"↔"apples"처럼 사소한 차이도 통째로 "불일치"로 떨어지는 오탐이 잦았다. 또한 STT는 `format=simple`의 `DisplayText`(ITN 적용됨 — 예: "two"→"2")를 쓰고 있어 향후 숫자 포함 문항에서 비교가 깨질 잠재 위험이 있었고, 타임아웃(10초)이 최대 녹음 길이(20초)보다 짧아 긴 문장에서 빈 결과 위험이 있었다.

**중요한 전제**: 어떤 STT도 아동의 오발음(예: "know"를 "now"로 발음)을 글자로 완벽히 옮기지 못한다 — 이는 ASR의 본질적 한계이며 이번 개선으로 해결되지 않는다. "그대로 딱"을 보장하는 것은 여전히 **저장된 녹음 원본**이며, 교사가 결과지에서 직접 청취해 최종 판단한다. 이번 개선은 (a) 자동 비교의 **판정 공정성**을 높이고 (b) STT 원문의 **견고성**을 높이는 것이지, 발음 정오 판정 자체를 자동화하는 것이 아니다. 발음 평가(Pronunciation Assessment) API는 검토 후 **채택하지 않기로 결정**(점수 지표를 실제로 활용할 계획이 없고, 정답 문장 기준 정렬이 사용자가 원치 않는 방식의 "보정"에 해당).

## 2. 단어 퍼지 비교 (`lib/compare.ts`)

### 알고리즘
1. `normalize()`(기존 유지: 소문자화·NFKC·구두점 제거·공백 축약)한 뒤 공백으로 토큰화.
2. **단어 시퀀스 정렬** — 표준 편집거리(Wagner-Fischer) DP를 단어 단위로 수행(치환·삽입·삭제 비용 각 1, 정확히 같은 단어면 비용 0).
3. 역추적하며 **정답(target) 단어마다 가중치**를 매긴다:
   - 정확히 일치 → 1.0
   - 치환(단어가 다름) → 두 단어의 **글자 단위 유사도**(`1 - Levenshtein거리/최대길이`)가 0.75 이상이면 0.5(근접 오차), 미만이면 0
   - 정답 단어가 STT에서 통째로 누락(삭제) → 0
   - **STT 쪽 여분의 단어(삽입)는 감점하지 않는다** — 정답 단어 분모에 영향을 주지 않음(관대한 정책: 아이가 "음…", 되풀이 등 여분의 말을 해도 정답 단어를 모두 정확히 읽었다면 만점).
4. `score = round(가중치 합 / 정답 단어 수 * 100)`, 0~100 정수.

### 판정 기준 (신규 4단계)
| 점수 | 상태 |
|---|---|
| 90~100 | `matched` (일치) |
| 60~89 | `partial` (부분일치, 신규) |
| 0~59 | `mismatched` (불일치) |
| STT 빈 값/공백만 | `unrecognized` (인식 안 됨), score=0 |

### API 변경
```ts
export type MatchStatus = 'matched' | 'partial' | 'mismatched' | 'unrecognized'
export interface CompareResult { status: MatchStatus; score: number }
export function wordMatchScore(target: string, stt: string): number
export function compareUtterance(target: string, stt: string): CompareResult  // 기존: MatchResult 문자열 반환 → 객체로 변경(breaking)
```
`normalize()`는 시그니처 변경 없음.

## 3. Azure STT — `format=detailed` + `Lexical` (`lib/azure-stt.ts`)

- URL의 `format=simple` → `format=detailed`로 변경.
- 응답 파싱: 최상위 `DisplayText` 대신 **`NBest[0].Lexical`**을 추출해 반환(소문자·구두점 없는 원형 — ITN 미적용이라 향후 숫자 포함 문항에서도 안전).
- **`transcribeShortAudio`의 반환 타입은 변경 없음**(`Promise<string>`) — 저장·비교에 쓰이는 텍스트가 이제 Lexical 형태라는 것만 내부적으로 바뀐다. 따라서 `/api/transcribe` 라우트·DB 저장 로직은 **무변경**.
- **트레이드오프(확정 승인됨)**: 교사가 결과지에서 보는 "들린 말"이 `Hello world.` 대신 `hello world`로 대소문자·구두점 없이 표시된다. 교사의 최종 판단은 녹음 청취이므로 기능 손실 없음, 가독성만 소폭 저하.
- 타임아웃: 10초 → **25초** (최대 녹음 20초보다 여유 확보).

## 4. 교사 결과지·CSV 반영 (`app/admin/[id]/page.tsx`, `app/api/admin/export/route.ts`)

- `Pill` 컴포넌트에 `partial` 항목 추가: 라벨 "부분일치", 색상은 기존 디자인 토큰 재사용 — `bg-blue/10 text-blue`(신규 색상 토큰 추가 없음. mint=일치, amber=불일치와 구분되는 중립색으로 blue 재사용).
- Pill에 **유사도 %** 표시(matched/partial/mismatched일 때만; unrecognized/skipped/none은 표시 안 함).
- KPI 칩에 "부분일치" 개수 추가(기존 "자동 일치" 옆).
- CSV에 **`유사도`** 컬럼 추가(자동비교 컬럼 바로 뒤). unrecognized/미시도 행은 빈 값.
- "자동 일치" KPI·matched 카운트는 기존 규칙 유지(스킵된 응답 제외).

## 5. 비목표 (Non-goals)

- 오디오 정규화(loudnorm)·포맷 통일 — 별도 검토 후 보류.
- 발음 평가(Pronunciation Assessment) API — 채택 안 함.
- DB 스키마 변경 — 없음(Lexical을 기존 `stt_text` 컬럼에 그대로 저장, 새 컬럼 없음).
- 아이 화면 변경 — 없음(평가 비노출 원칙 그대로, STT/점수는 여전히 교사 결과지 전용).

## 6. 완료 기준

1. `wordMatchScore`가 완전일치=100, "apples"↔"apple" 등 근접 치환에 부분점수, 여분 단어 삽입엔 무감점, 전혀 다른 문장엔 저점을 반환.
2. `compareUtterance`가 90/60 임계값으로 4단계 상태를 올바르게 반환.
3. `transcribeShortAudio`가 `format=detailed` 엔드포인트를 호출하고 `NBest[0].Lexical`을 반환, 실패 시 기존과 동일하게 예외.
4. 타임아웃 25초.
5. 결과지에 부분일치 pill+유사도%, CSV에 유사도 컬럼.
6. 기존 51개 테스트 중 영향받는 파일(compare/azure-stt/export-route/admin) 갱신 후 전체 통과, typecheck clean.
