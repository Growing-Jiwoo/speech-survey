import { NextResponse } from 'next/server'
import { clientIp } from '@/lib/client-ip'
import { checkRateLimit, createSession } from '@/lib/db'
import { REGION_NAMES } from '@/lib/schools'
import { validBirthYmd, validClassNo, validContact, validGender, validGrade, validName } from '@/lib/validate'

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })
const cleanStr = (v: unknown) => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''

const MAX_SESSIONS_PER_HOUR = 60 // 학교 컴퓨터실 공용 IP 대비 여유 있게 설정

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
