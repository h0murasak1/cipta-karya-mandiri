import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ManagementPage } from './pages/ManagementPage'
import { PublicInvoicePage } from './pages/PublicInvoicePage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { configMessage, supabase } from './lib/supabase'
import type { AppRole, Profile, Section } from './lib/types'

function ConfigurationPage({ message }: { message: string }) {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <div className="brand-mark">CKM</div>
        <p className="eyebrow">CIPTA KARYA MANDIRI</p>
        <h1>Hubungkan Supabase</h1>
        <p className="muted">
          Aplikasi belum terhubung ke backend. Konfigurasikan URL project dan
          anon/publishable key di environment lokal untuk mulai menggunakan data
          operasional.
        </p>
        <pre className="setup-code">VITE_SUPABASE_URL=...{'\n'}VITE_SUPABASE_ANON_KEY=...</pre>
        <div className="inline-alert">
          <AlertCircle size={17} />
          <span>{message}</span>
        </div>
        <p className="small muted">
          Jangan gunakan service-role key di aplikasi browser.
        </p>
      </section>
    </main>
  )
}

function LoadingPage() {
  return (
    <main className="loading-page">
      <LoaderCircle className="spin" size={24} />
      <span>Memuat sesi...</span>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('dashboard')

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return
    setProfileError(null)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, is_active')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      setProfileError(`Profil gagal dimuat: ${error.message}`)
      setProfile(null)
      return
    }

    if (!data) {
      setProfileError('Profil pengguna tidak ditemukan. Minta Owner memeriksa akun dan role.')
      setProfile(null)
      return
    }

    if (!data.is_active) {
      setProfileError('Akun ini sedang dinonaktifkan. Hubungi Owner.')
      setProfile(null)
      return
    }

    setProfile(data as Profile)
  }, [])

  useEffect(() => {
    if (!supabase) return

    let active = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setProfileError(`Sesi gagal diperiksa: ${error.message}`)
      }
      setSession(data.session)
      setAuthReady(true)
      if (data.session?.user.id) void loadProfile(data.session.user.id)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setProfile(null)
      setProfileError(null)
      setSection('dashboard')
      if (nextSession?.user.id) {
        window.setTimeout(() => void loadProfile(nextSession.user.id), 0)
      }
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [loadProfile])

  if (!supabase) return <ConfigurationPage message={configMessage} />
  const client = supabase
  if (!authReady) return <LoadingPage />

  if (window.location.pathname.startsWith('/invoice/')) {
    return <PublicInvoicePage client={client} token={window.location.pathname.slice('/invoice/'.length)} />
  }

  if (!session) return <LoginPage client={client} authError={profileError} />
  if (!profile) {
    return (
      <main className="setup-page">
        <section className="setup-card">
          <div className="brand-mark">CKM</div>
          <p className="eyebrow">AKUN INTERNAL</p>
          <h1>Akses belum tersedia</h1>
          <p className="muted">{profileError ?? 'Memeriksa profil...'}</p>
          <button className="button button-secondary" onClick={() => void client.auth.signOut()}>
            Keluar
          </button>
        </section>
      </main>
    )
  }

  const role = profile.role as AppRole
  const page = section === 'dashboard'
    ? <DashboardPage client={client} role={role} onNavigate={setSection} />
    : section === 'reports'
      ? <ReportsPage client={client} />
      : section === 'settings'
        ? <SettingsPage client={client} role={role} userId={profile.id} />
        : <ManagementPage client={client} role={role} section={section} userId={profile.id} />

  return (
    <AppShell
      profile={profile}
      role={role}
      section={section}
      onNavigate={setSection}
      onSignOut={() => void client.auth.signOut()}
    >
      {page}
    </AppShell>
  )
}
