// lib/sheet-leave.ts — 관리자 결과지의 이동 확인 창 「저장하고 이동」. 순수 함수 — 화면(AdminDetailView)이 부르고 node 테스트가 본다.
//
// 왜: 이 버튼은 전에 이동만 하고 저장은 떠날 때 즉시 저장(ResultSheet 언마운트의 keepalive PUT)에 맡겼다. 그 요청은
// 실패를 삼키므로 로그인 만료(401)나 그사이 바뀐 스캔본(409 — 같은 요청의 읽기 채점까지 거부)이면 채점이 알림 없이
// 사라졌다. 저장을 약속한 버튼이니 일반 저장을 기다려 **성공했을 때만** 떠난다(개발 판단 2026-10-08, 담당자 회신 아님).

/** 저장을 기다려 성공(null)이면 이동한다. 실패 문구를 그대로 돌려준다 — 호출부가 창에 띄우고 머문다.
 *  save가 없으면(결과지가 없다) 저장할 것도 없으니 바로 이동한다. */
export async function saveThenLeave(
  save: (() => Promise<string | null>) | null,
  leave: () => void,
): Promise<string | null> {
  const err = save ? await save() : null
  if (err === null) leave()
  return err
}
