// lib/validate.ts — 클라이언트 폼용 boolean 타입가드 파사드.
// 검증 규칙의 단일 소스는 lib/schema.ts(zod)이며, 여기서는 폼 코드가 safeParse 보일러플레이트
// 없이 `if (!validName(v))` 형태로 쓰도록 감싸기만 한다(클라이언트·서버 동일 규칙 보장).
import { nameSchema, birthYmdSchema, gradeSchema, classNoSchema, genderSchema, contactSchema } from './schema'

export function validName(name: unknown): name is string { return nameSchema.safeParse(name).success }
export function validBirthYmd(v: unknown): v is string { return birthYmdSchema.safeParse(v).success }
export function validGrade(v: unknown): v is number { return gradeSchema.safeParse(v).success }
export function validClassNo(v: unknown): v is number { return classNoSchema.safeParse(v).success }
export function validGender(v: unknown): v is '남' | '여' { return genderSchema.safeParse(v).success }
export function validContact(v: unknown): v is string { return contactSchema.safeParse(v).success }
