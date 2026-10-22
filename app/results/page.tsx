// /results — 토큰 없이 오면 시작 화면으로. 결과 진입은 시작 화면의 [결과지 받기]·[쓰기 스캔본 올리기]가 보내는 메일 링크뿐이다(스펙).
import { redirect } from 'next/navigation'

export default function ResultsIndex() {
  redirect('/')
}
