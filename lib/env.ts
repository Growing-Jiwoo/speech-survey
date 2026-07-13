export function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`환경변수 ${name}가 설정되지 않았습니다 (.env.local 확인)`)
  return v
}
