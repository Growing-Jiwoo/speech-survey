import { nameSchema, birthYmdSchema, gradeSchema, classNoSchema, genderSchema, contactSchema, NAME_RE } from './schema'

export { NAME_RE }

export function validName(name: unknown): name is string { return nameSchema.safeParse(name).success }
export function validBirthYmd(v: unknown): v is string { return birthYmdSchema.safeParse(v).success }
export function validGrade(v: unknown): v is number { return gradeSchema.safeParse(v).success }
export function validClassNo(v: unknown): v is number { return classNoSchema.safeParse(v).success }
export function validGender(v: unknown): v is '남' | '여' { return genderSchema.safeParse(v).success }
export function validContact(v: unknown): v is string { return contactSchema.safeParse(v).success }
