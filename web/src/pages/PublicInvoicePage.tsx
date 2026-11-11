import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AlertCircle, Check, Copy, FileDown, LoaderCircle } from 'lucide-react'
import { currency, date, statusLabel } from '../lib/format'

const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: 'Tunai', bank_transfer: 'Transfer bank', other: 'Lainnya' }

interface BankAccount {
  bank_name: string
  account_name: string
  account_number: string
}

interface PublicInvoice {
  invoice_number: string
  issue_date: string
  due_date: string | null
  status: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  public_note: string | null
  customer: { name: string; address: string | null; phone: string | null; email: string | null }
  project: { title: string; project_code: string } | null
  items: { description: string; quantity: number; unit: string; unit_price: number; line_total: number }[]
  payments: { amount: number; paid_at: string; payment_method: string }[]
  company: {
    company_name: string
    legal_entity: string
    address: string | null
    phone: string | null
    email: string | null
    bank_name: string | null
    bank_account_name: string | null
    bank_account_number: string | null
    bank_accounts?: BankAccount[]
    invoice_footer: string | null
  }
}

export function PublicInvoicePage({ client, token }: { client: SupabaseClient; token: string }) {
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null)

  const copyAccountNumber = async (accountNumber: string) => {
    try {
      await navigator.clipboard.writeText(accountNumber.replace(/[\s.-]/g, ''))
      setCopiedAccount(accountNumber)
      window.setTimeout(() => setCopiedAccount((current) => current === accountNumber ? null : current), 2000)
    } catch {
      // Clipboard access denied: the number stays visible and selectable.
    }
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!/^[a-f\d]{64}$/i.test(token)) {
        setError('Tautan invoice tidak valid atau sudah tidak aktif.')
        setLoading(false)
        return
      }
      const { data, error: requestError } = await client.functions.invoke('public-invoice', { body: { token } })
      if (!active) return
      if (requestError) setError('Invoice tidak dapat dibuka. Tautan mungkin tidak valid, kedaluwarsa, atau telah dicabut.')
      else if (!data?.invoice) setError('Invoice tidak dapat dibuka. Tautan mungkin tidak valid, kedaluwarsa, atau telah dicabut.')
      else setInvoice(data.invoice as PublicInvoice)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [client, token])

  if (loading) return <main className="public-invoice-page"><div className="public-loading"><LoaderCircle className="spin" size={22} />Memuat invoice aman...</div></main>
  if (!invoice) return <main className="public-invoice-page"><section className="public-error"><AlertCircle size={24} /><h1>Invoice tidak tersedia</h1><p>{error}</p></section></main>

  const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  const outstanding = Math.max(0, Number(invoice.total_amount) - paid)

  // Build bank accounts list: prefer new array, fall back to legacy single fields
  const bankAccounts: BankAccount[] = Array.isArray(invoice.company.bank_accounts) && invoice.company.bank_accounts.length > 0
    ? invoice.company.bank_accounts.filter((a) => a.account_number)
    : invoice.company.bank_account_number
      ? [{ bank_name: invoice.company.bank_name ?? '', account_name: invoice.company.bank_account_name ?? '', account_number: invoice.company.bank_account_number }]
      : []

  return (
    <main className="public-invoice-page">
      <div className="public-invoice-actions">
        <button className="button button-primary" type="button" onClick={() => window.print()}>
          <FileDown size={16} /> Unduh PDF
        </button>
      </div>
      <article className="public-invoice-card">
        <header className="public-invoice-header">
          <div className="public-invoice-brand">
            <img src="/logo-invoice-dpbs.jpeg" alt="Logo CV Dua Putra Bersaudara" />
            <div><p className="eyebrow">INVOICE RESMI</p><h1>{invoice.company.company_name}</h1><p>{invoice.company.legal_entity}</p></div>
          </div>
          <div className="public-invoice-number"><strong>{invoice.invoice_number}</strong><span className={`status-badge status-${invoice.status}`}>{statusLabel(invoice.status)}</span></div>
        </header>
        <div className="public-company-contact">
          {[invoice.company.address, invoice.company.phone, invoice.company.email].filter(Boolean).join(' · ')}
        </div>
        <div className="invoice-parties">
          <div><small>DITAGIHKAN KEPADA</small><strong>{invoice.customer.name}</strong>{invoice.customer.address && <span>{invoice.customer.address}</span>}{invoice.customer.phone && <span>{invoice.customer.phone}</span>}{invoice.customer.email && <span>{invoice.customer.email}</span>}</div>
          <div><small>TANGGAL INVOICE</small><strong>{date(invoice.issue_date)}</strong><span>Jatuh tempo: {date(invoice.due_date)}</span>{invoice.project && <span>{invoice.project.project_code} · {invoice.project.title}</span>}</div>
        </div>
        <div className="table-scroll public-items-table"><table><thead><tr><th>Deskripsi</th><th>Qty</th><th>Harga satuan</th><th>Total</th></tr></thead><tbody>
          {invoice.items.map((item, index) => <tr key={`${item.description}-${index}`}><td>{item.description}</td><td>{Number(item.quantity)} {item.unit}</td><td>{currency(item.unit_price)}</td><td>{currency(item.line_total)}</td></tr>)}
        </tbody></table></div>
        <div className="public-invoice-totals">
          <span>Subtotal <strong>{currency(invoice.subtotal)}</strong></span>
          {Number(invoice.discount_amount) > 0 && <span>Diskon <strong>− {currency(invoice.discount_amount)}</strong></span>}
          {Number(invoice.tax_amount) > 0 && <span>Pajak <strong>{currency(invoice.tax_amount)}</strong></span>}
          <span className="invoice-grand-total">Total <strong>{currency(invoice.total_amount)}</strong></span>
          {paid > 0 && <span>Sudah dibayar <strong>{currency(paid)}</strong></span>}
          <span className="invoice-outstanding">Sisa tagihan <strong>{currency(outstanding)}</strong></span>
        </div>
        {invoice.public_note && <div className="public-invoice-note"><strong>Catatan</strong><p>{invoice.public_note}</p></div>}
        {bankAccounts.length > 0 && <section className="public-bank-details">
          <h2>Informasi pembayaran</h2>
          {outstanding > 0 && <p className="bank-accounts-intro">{bankAccounts.length > 1 ? 'Silakan transfer ke salah satu rekening berikut:' : 'Silakan transfer ke rekening berikut:'}</p>}
          <div className="bank-accounts-grid">
            {bankAccounts.map((account, index) => (
              <div className="bank-account-item" key={`${account.account_number}-${index}`}>
                {account.bank_name && <p><span>Bank</span><strong>{account.bank_name}</strong></p>}
                <p>
                  <span>Nomor rekening</span>
                  <strong className="bank-account-number">
                    {account.account_number}
                    <button type="button" className="bank-copy-button" onClick={() => void copyAccountNumber(account.account_number)} aria-label={`Salin nomor rekening ${account.bank_name} ${account.account_number}`}>
                      {copiedAccount === account.account_number ? <><Check size={13} /> Tersalin</> : <><Copy size={13} /> Salin</>}
                    </button>
                  </strong>
                </p>
                {account.account_name && <p><span>Atas nama</span><strong>{account.account_name}</strong></p>}
              </div>
            ))}
          </div>
        </section>}
        {invoice.payments.length > 0 && <section className="public-payment-history"><h2>Riwayat pembayaran</h2>{invoice.payments.map((payment, index) => <div key={`${payment.paid_at}-${index}`}><span>{date(payment.paid_at)} · {PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}</span><strong>{currency(payment.amount)}</strong></div>)}</section>}
        <footer className="public-invoice-footer">{invoice.company.invoice_footer || 'Terima kasih atas kepercayaan Anda.'}</footer>
      </article>
    </main>
  )
}
