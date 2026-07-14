import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

let client: SupabaseClient | null = null
/** 서버 전용. 클라이언트 컴포넌트에서 import 금지. */
export function sb(): SupabaseClient {
  client ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
  return client
}
