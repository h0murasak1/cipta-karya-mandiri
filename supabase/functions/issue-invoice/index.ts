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

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = requiredEnv('SUPABASE_URL')
    const anonKey = requiredEnv('SUPABASE_ANON_KEY')
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const appUrl = requiredEnv('PUBLIC_APP_URL')
    const authorization = request.headers.get('Authorization')
    if (!authorization) return json({ error: 'Authentication required' }, 401)

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Authentication required' }, 401)
    const { data: allowed, error: roleError } = await userClient.rpc('is_owner_or_admin')
    if (roleError) throw roleError
    if (allowed !== true) return json({ error: 'Not authorized' }, 403)

    const body = await request.json().catch(() => null)
    const invoiceId = body && typeof body.invoice_id === 'string' ? body.invoice_id : ''
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(invoiceId)) {
      return json({ error: 'A valid invoice_id is required' }, 400)
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .select('id, status')
      .eq('id', invoiceId)
      .maybeSingle()
    if (invoiceError) throw invoiceError
    if (!invoice || invoice.status === 'cancelled') return json({ error: 'Invoice not available' }, 404)

    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const token = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const tokenHash = await hashToken(token)
    const { error: updateError } = await admin.from('invoices').update({
      public_token_hash: tokenHash,
      token_created_at: new Date().toISOString(),
      token_revoked_at: null,
      status: invoice.status === 'draft' ? 'issued' : invoice.status,
      issued_by: userData.user.id,
    }).eq('id', invoiceId)
    if (updateError) throw updateError

    const publicUrl = new URL(`/invoice/${token}`, appUrl)
    return json({ url: publicUrl.toString() })
  } catch (error) {
    console.error('issue-invoice failed:', error)
    return json({ error: 'Invoice token could not be issued. Check Edge Function configuration and logs.' }, 500)
  }
})
