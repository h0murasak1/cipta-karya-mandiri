import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowRight, LockKeyhole } from 'lucide-react'

export function LoginPage({ client, authError }: { client: SupabaseClient; authError: string | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: signInError } = await client.auth.signInWithPassword({ email, password })
    if (signInError) setError(`Gagal masuk: ${signInError.message}`)
    setBusy(false)
  }

  return (
    <main className="login-page">
      <section className="login-aside">
        <div className="login-brand">
          <div className="login-logo-frame">
            <img className="login-logo" src="/logo-ckm.jpeg" alt="Logo CV Dua Putra Bersaudara" />
          </div>
          <span className="login-brand-caption">WORKSHOP MANAGEMENT</span>
        </div>
        <div className="login-message">
          <p className="eyebrow eyebrow-light">CV DUA PUTRA BERSAUDARA</p>
          <h1>Ruang kerja yang tertata. Proyek yang terkendali.</h1>
          <p>Pantau pekerjaan workshop, transaksi, dan tagihan dalam satu tempat.</p>
        </div>
        <span className="login-footnote">SISTEM MANAJEMEN WORKSHOP <i /> AKSES INTERNAL</span>
      </section>
      <section className="login-form-side">
        <form className="login-card" onSubmit={(event) => void submit(event)}>
          <span className="login-icon"><LockKeyhole size={19} /></span>
          <p className="eyebrow">AKSES INTERNAL</p>
          <h2>Selamat datang kembali</h2>
          <p className="muted">Masuk ke akun Anda untuk melanjutkan pekerjaan.</p>
          <label className="field-label" htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label className="field-label" htmlFor="login-password">Kata sandi</label>
          <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {(error || authError) && <div className="form-error" role="alert">{error ?? authError}</div>}
          <button className="button button-primary login-submit" disabled={busy}>
            {busy ? 'Memeriksa...' : 'Masuk'} <ArrowRight size={16} />
          </button>
          <p className="small muted login-note">Akun staf dibuat oleh Owner/Admin. Hubungi administrator untuk mendapatkan akses.</p>
        </form>
      </section>
    </main>
  )
}
