import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

let validationMessage = ''
if (!url || !anonKey) {
  validationMessage = 'Environment VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum diatur.'
} else {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
      validationMessage = 'URL Supabase harus menggunakan HTTPS (localhost diizinkan untuk development).'
    }
  } catch {
    validationMessage = 'VITE_SUPABASE_URL bukan URL yang valid.'
  }
}

export const configMessage = validationMessage
export const supabase = validationMessage
  ? null
  : createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
