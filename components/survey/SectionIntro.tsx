// components/survey/SectionIntro.tsx — 섹션(주제) 진입 안내 화면.
// 낱말 읽기 → 문장 읽기 → 낱말 쓰기처럼 주제가 바뀔 때, 조용히 넘어가지 않고 "이제 무엇을
// 하는지"를 아이 눈높이로 크게 알려 준다. [시작하기]는 상위 페이지의 하단 버튼이 담당한다.
'use client'
import { Blip } from '@/components/Blip'
import { SECTION_INTRO, SECTION_ORDER, type Section } from '@/lib/items'

export function SectionIntro({ section }: { section: Section }) {
  const intro = SECTION_INTRO[section]
  const step = SECTION_ORDER.indexOf(section) + 1
  return (
    <div className="flex flex-col items-center text-center">
      <span className="rounded-full bg-blue/10 px-4 py-1.5 text-sm font-bold text-blue lg:text-base">
        {step}단계 · 총 {SECTION_ORDER.length}단계
      </span>
      <Blip variant="idle" className="mt-6 h-24 w-[100px] lg:h-32 lg:w-[136px]" />
      <h2 className="mt-6 text-3xl font-bold lg:text-5xl">{intro.title}</h2>
      <p className="mt-3 text-base leading-relaxed text-ink-soft lg:text-xl">{intro.desc}</p>
    </div>
  )
}
