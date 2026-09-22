// /results — 토큰 없이 오면 시작 화면으로. 결과 진입은 시작 화면의 [결과지 받기 →] 하나다(스펙).
import { redirect } from 'next/navigation'

export default function ResultsIndex() {
  redirect('/')
}
