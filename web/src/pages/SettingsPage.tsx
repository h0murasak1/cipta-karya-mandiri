import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { LoaderCircle, Save } from 'lucide-react'
import { useToast } from '../components/Toast'
import type { AppRole } from '../lib/types'

interface CompanySettings {
  company_name: string
  legal_entity: string
  address: string | null
  phone: string | null
  email: string | null
  bank_name: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  invoice_prefix: string
  invoice_footer: string | null
}

export function SettingsPage({ client, role, userId }: { client: SupabaseClient; role: AppRole; userId: string }) {
  const { toast } = useToast()
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void client.from('company_settings')
      .select('company_name, legal_entity, address, phone, email, bank_name, bank_account_name, bank_account_number, invoice_prefix, invoice_footer')
      .eq('id', true)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!active) return
        if (loadError) setError(`Pengaturan perusahaan gagal dimuat: ${loadError.message}`)
        else if (!data) setError('Data company_settings belum tersedia pada database.')
        else setSettings(data as CompanySettings)
        setLoading(false)
      })
    return () => { active = false }
  }, [client])

  const canManageCompany = role === 'owner' || role === 'admin'
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canManageCompany || !settings) return
    setSaving(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const { error: saveError } = await client.from('company_settings').update({
      company_name: String(form.get('company_name')).trim(),
      legal_entity: String(form.get('legal_entity')).trim(),
      address: String(form.get('address') || '').trim() || null,
      phone: String(form.get('phone') || '').trim() || null,
      email: String(form.get('email') || '').trim() || null,
      bank_name: String(form.get('bank_name') || '').trim() || null,
      bank_account_name: String(form.get('bank_account_name') || '').trim() || null,
      bank_account_number: String(form.get('bank_account_number') || '').trim() || null,
      invoice_prefix: String(form.get('invoice_prefix')).trim(),
      invoice_footer: String(form.get('invoice_footer') || '').trim() || null,
      updated_by: userId,
    }).eq('id', true)
    if (saveError) toast('error', `Pengaturan gagal disimpan: ${saveError.message}`)
    else toast('success', 'Identitas perusahaan berhasil diperbarui.')
    setSaving(false)
  }

  if (loading) return <div className="loading-inline"><LoaderCircle className="spin" size={18} /> Memuat pengaturan...</div>
  if (!settings) return <section className="panel settings-panel">{error && <div className="form-error">{error}</div>}</section>

  return (
    <section className="settings-page">
      <div className="page-heading-row"><div><p className="eyebrow">Administrasi</p><h1>Pengaturan</h1><p className="muted">Identitas perusahaan untuk invoice dan dokumen.</p></div></div>
      {canManageCompany && <form className="panel settings-panel" onSubmit={(event) => void save(event)}>
        <div className="settings-section-heading"><div><h2>Informasi perusahaan</h2><p className="muted">Perubahan dapat dilakukan oleh Owner maupun Admin.</p></div><span className="role-pill">Owner / Admin</span></div>
        <div className="form-grid">
          <Field label="Nama usaha" name="company_name" value={settings.company_name} required />
          <Field label="Badan hukum" name="legal_entity" value={settings.legal_entity} required />
          <Field label="Telepon" name="phone" value={settings.phone ?? ''} />
          <Field label="Email" name="email" type="email" value={settings.email ?? ''} />
          <Field label="Awalan nomor invoice" name="invoice_prefix" value={settings.invoice_prefix} required />
        </div>
        <Field label="Alamat" name="address" value={settings.address ?? ''} />
        <div className="settings-section-heading settings-bank-heading"><div><h2>Rekening perusahaan</h2><p className="muted">Nomor rekening ditampilkan pada invoice publik jika diisi.</p></div></div>
        <div className="form-grid">
          <Field label="Nama bank" name="bank_name" value={settings.bank_name ?? ''} autoComplete="off" />
          <Field label="Nama pemilik rekening" name="bank_account_name" value={settings.bank_account_name ?? ''} autoComplete="off" />
          <Field label="Nomor rekening" name="bank_account_number" value={settings.bank_account_number ?? ''} autoComplete="off" />
        </div>
        <Field label="Footer invoice" name="invoice_footer" value={settings.invoice_footer ?? ''} />
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="settings-actions"><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? 'Menyimpan...' : 'Simpan pengaturan'}</button></div>
      </form>}
      <PasswordChangeForm client={client} />
      <section className="panel settings-note"><h2>Akses dan keamanan</h2><p className="muted">Owner dan Admin memiliki izin pengelolaan yang sama. Pengelolaan akun Workshop tetap dilakukan melalui backend tepercaya, dengan perlindungan Supabase Auth dan Row Level Security.</p></section>
    </section>
  )
}

function PasswordChangeForm({ client }: { client: SupabaseClient }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const password = String(form.get('new_password') ?? '')
    if (password.length < 8) {
      setError('Password baru harus terdiri dari minimal 8 karakter.')
      return
    }
    if (password !== String(form.get('password_confirmation') ?? '')) {
      setError('Konfirmasi password tidak sama.')
      return
    }

    setSaving(true)
    setError(null)
    const { error: updateError } = await client.auth.updateUser({ password })
    if (updateError) setError(`Password gagal diubah: ${updateError.message}`)
    else {
      formElement.reset()
      toast('success', 'Password berhasil diubah.')
    }
    setSaving(false)
  }

  return <form className="panel settings-panel" onSubmit={(event) => void changePassword(event)}>
    <div className="settings-section-heading"><div><h2>Ubah password</h2><p className="muted">Gunakan password baru minimal 8 karakter.</p></div></div>
    <div className="form-grid">
      <Field label="Password baru" name="new_password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
      <Field label="Konfirmasi password baru" name="password_confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="settings-actions"><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? 'Menyimpan...' : 'Ubah password'}</button></div>
  </form>
}

function Field({ label, name, value = '', type = 'text', required, disabled, readOnly, autoComplete, minLength, maxLength }: { label: string; name: string; value?: string; type?: string; required?: boolean; disabled?: boolean; readOnly?: boolean; autoComplete?: string; minLength?: number; maxLength?: number }) {
  return <label className="field-group"><span className="field-label">{label}{required && <i> *</i>}</span><input name={name} type={type} defaultValue={value} required={required} disabled={disabled} readOnly={readOnly} autoComplete={autoComplete} minLength={minLength} maxLength={maxLength} /></label>
}
