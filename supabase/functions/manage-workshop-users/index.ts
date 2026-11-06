import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function isValidPassword(password: string) {
  return password.length >= 8 && new TextEncoder().encode(password).length <= 72
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = requiredEnv('SUPABASE_URL')
    const anonKey = requiredEnv('SUPABASE_ANON_KEY')
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const authorization = request.headers.get('Authorization')
    if (!authorization) return json({ error: 'Silakan masuk terlebih dahulu.' }, 401)

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Sesi tidak valid. Silakan masuk kembali.' }, 401)

    const { data: allowed, error: roleError } = await userClient.rpc('is_owner_or_admin')
    if (roleError) throw roleError
    if (allowed !== true) return json({ error: 'Hanya Owner/Admin yang dapat mengelola akun staf.' }, 403)

    let body: Record<string, unknown>
    try {
      const parsed: unknown = await request.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return json({ error: 'Permintaan tidak valid.' }, 400)
      }
      body = parsed as Record<string, unknown>
    } catch {
      return json({ error: 'Format permintaan tidak valid.' }, 400)
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    if (body.action === 'create') {
      const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!fullName || fullName.length > 120) {
        return json({ error: 'Nama wajib diisi (maksimal 120 karakter).' }, 400)
      }
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: 'Alamat email tidak valid.' }, 400)
      }
      if (phone.length > 40) return json({ error: 'Nomor telepon terlalu panjang.' }, 400)
      if (!isValidPassword(password)) {
        return json({ error: 'Kata sandi harus terdiri dari minimal 8 karakter dan maksimal 72 byte.' }, 400)
      }

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })
      if (error) {
        if (error.code === 'email_exists' || error.code === 'user_already_exists') {
          return json({ error: 'Email tersebut sudah terdaftar.' }, 409)
        }
        throw error
      }
      if (!data.user) throw new Error('Supabase Auth did not return the created user')

      const { error: profileError } = await admin.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        email,
        phone: phone || null,
        role: 'workshop',
        is_active: true,
      }, { onConflict: 'id' })
      if (profileError) {
        const { error: rollbackError } = await admin.auth.admin.deleteUser(data.user.id)
        if (rollbackError) console.error('Unable to roll back staff account after profile failure:', rollbackError)
        throw profileError
      }
      return json({ id: data.user.id })
    }

    if (body.action === 'reset_password') {
      const profileId = typeof body.profile_id === 'string' ? body.profile_id : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(profileId)) {
        return json({ error: 'Akun staf tidak valid.' }, 400)
      }
      if (!isValidPassword(password)) {
        return json({ error: 'Kata sandi harus terdiri dari minimal 8 karakter dan maksimal 72 byte.' }, 400)
      }
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id, role')
        .eq('id', profileId)
        .maybeSingle()
      if (profileError) throw profileError
      if (!profile || profile.role !== 'workshop') {
        return json({ error: 'Reset hanya tersedia untuk akun staf Workshop.' }, 404)
      }

      const { error } = await admin.auth.admin.updateUserById(profileId, { password })
      if (error) throw error
      return json({ id: profileId })
    }

    return json({ error: 'Aksi tidak dikenal.' }, 400)
  } catch (error) {
    console.error('manage-workshop-users failed:', error)
    return json({ error: 'Pengelolaan akun gagal. Periksa konfigurasi dan log Edge Function.' }, 500)
  }
})
