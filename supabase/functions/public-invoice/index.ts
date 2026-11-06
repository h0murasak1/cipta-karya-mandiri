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
    const body = await request.json().catch(() => null)
    const token = body && typeof body.token === 'string' ? body.token : ''
    if (!/^[a-f\d]{64}$/i.test(token)) return json({ error: 'Invoice not found' }, 404)

    const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const tokenHash = await hashToken(token)
    const { data: invoice, error: invoiceError } = await admin.from('invoices')
      .select('invoice_number, issue_date, due_date, status, subtotal, discount_amount, tax_amount, total_amount, public_note, token_revoked_at, customers(name, address, phone, email), projects(title, project_code), invoice_items(description, quantity, unit, unit_price, line_total, sort_order), payments(amount, paid_at, payment_method)')
      .eq('public_token_hash', tokenHash)
      .is('token_revoked_at', null)
      .maybeSingle()
    if (invoiceError) throw invoiceError
    if (!invoice || !['issued', 'partially_paid', 'paid'].includes(invoice.status)) {
      return json({ error: 'Invoice not found' }, 404)
    }

    const { data: company, error: companyError } = await admin.from('company_settings')
      .select('company_name, legal_entity, address, phone, email, invoice_footer')
      .eq('id', true)
      .maybeSingle()
    if (companyError) throw companyError
    if (!company) throw new Error('Company settings are missing')

    return json({
      invoice: {
        invoice_number: invoice.invoice_number,
        issue_date: invoice.issue_date,
        due_date: invoice.due_date,
        status: invoice.status,
        subtotal: invoice.subtotal,
        discount_amount: invoice.discount_amount,
        tax_amount: invoice.tax_amount,
        total_amount: invoice.total_amount,
        public_note: invoice.public_note,
        customer: invoice.customers,
        project: invoice.projects,
        items: [...(invoice.invoice_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
        payments: (invoice.payments ?? []).map(({ amount, paid_at, payment_method }) => ({ amount, paid_at, payment_method })),
        company,
      },
    })
  } catch (error) {
    console.error('public-invoice failed:', error)
    return json({ error: 'Invoice could not be loaded. Check Edge Function configuration and logs.' }, 500)
  }
})
