import { createClient } from '@supabase/supabase-js'
import { QUESTIONS } from '../supabase/seed/questions'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요'); process.exit(1) }

const sb = createClient(url, key)
const rows = QUESTIONS.map(q => ({ order_no: q.orderNo, text: q.text, difficulty: q.difficulty }))
const { error } = await sb.from('questions').upsert(rows, { onConflict: 'order_no' })
if (error) { console.error(error.message); process.exit(1) }
console.log(`questions ${rows.length}건 시드 완료`)
