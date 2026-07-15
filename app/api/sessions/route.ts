import { NextResponse } from 'next/server'
import { clientIp } from '@/lib/client-ip'
import { checkRateLimit, createSession } from '@/lib/db'
import { REGION_NAMES } from '@/lib/schools'
import { validBirthYmd, validClassNo, validContact, validGender, validGrade, validName } from '@/lib/validate'

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })
const cleanStr = (v: unknown) => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''

// 세션 생성은 IP 단위로 제한한다(세션당 스팸은 녹음 라우트의 세션 단위 상한이 막음).
// 한 학교의 여러 학급, 나아가 학원 등 제3의 장소가 같은 공용 IP(NAT)로 동시 검사할 수
// 있으므로 넉넉히 잡는다. 예상 전체 사용 규모(6개월 약 1,000명) 기준, 가장 몰릴 만한
// 단일 이벤트(학교 1개 학년 전체 동시 시작, 100~200명)의 2~3배 여유를 둔 값 — 정상
// 사용은 절대 못 닿고, 닿으면 그 자체가 이상 징후인 감지선 역할.
const MAX_SESSIONS_PER_HOUR = 500

export async function POST(req: Request) {
  if (!(await checkRateLimit(`session:${clientIp(req)}`, MAX_SESSIONS_PER_HOUR, 3600_000)))
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
  const b = await req.json().catch(() => ({}))
  const name = cleanStr(b.name)
  const teacherName = cleanStr(b.teacherName)
  const schoolName = cleanStr(b.schoolName)
  const schoolId = cleanStr(b.schoolId)
  if (!REGION_NAMES.includes(b.region)) return bad('지역을 선택해 주세요.')
  if (!schoolId || !schoolName || schoolName.length > 100) return bad('학교를 목록에서 선택해 주세요.')
  if (!validBirthYmd(b.birthYmd)) return bad('생년월일은 숫자 6자리(예: 190101)로 입력해 주세요.')
  if (!validGrade(b.grade)) return bad('학년은 1~6 사이로 선택해 주세요.')
  if (!validClassNo(b.classNo)) return bad('반은 1~99 사이 숫자로 입력해 주세요.')
  if (!validGender(b.gender)) return bad('성별을 선택해 주세요.')
  if (!validName(name)) return bad('이름은 한글이나 영어로만 쓸 수 있어요.')
  if (!validName(teacherName)) return bad('담임교사명은 한글이나 영어로만 쓸 수 있어요.')
  if (!validContact(b.teacherContact)) return bad('연락처는 전화번호 또는 이메일 형식으로 입력해 주세요.')
  const sessionId = await createSession({
    schoolRegion: b.region, schoolId, schoolName,
    birthYmd: b.birthYmd, grade: b.grade, classNo: b.classNo, gender: b.gender,
    childName: name, teacherName, teacherContact: b.teacherContact,
  })
  return NextResponse.json({ sessionId })
}
