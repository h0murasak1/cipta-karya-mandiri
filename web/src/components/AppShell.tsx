import {
  ArrowLeftRight,
  BarChart3,
  ChevronUp,
  FileText,
  Hammer,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Settings,
  Tags,
  Users,
  UsersRound,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOnlineStatus } from '../lib/hooks'
import type { AppRole, Profile, Section } from '../lib/types'

const navigation: { id: Section; label: string; icon: typeof LayoutDashboard; roles: AppRole[] }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'admin', 'workshop'] },
  { id: 'projects', label: 'Proyek', icon: Hammer, roles: ['owner', 'admin', 'workshop'] },
  { id: 'customers', label: 'Pelanggan', icon: Users, roles: ['owner', 'admin'] },
  { id: 'invoices', label: 'Invoice', icon: FileText, roles: ['owner', 'admin'] },
  { id: 'payments', label: 'Pembayaran', icon: Wallet, roles: ['owner', 'admin'] },
  { id: 'transactions', label: 'Transaksi', icon: ArrowLeftRight, roles: ['owner', 'admin'] },
  { id: 'reports', label: 'Laporan', icon: BarChart3, roles: ['owner', 'admin'] },
  { id: 'users', label: 'Staf Workshop', icon: UsersRound, roles: ['owner', 'admin'] },
  { id: 'project-categories', label: 'Kategori Proyek', icon: Tags, roles: ['owner', 'admin'] },
  { id: 'settings', label: 'Pengaturan', icon: Settings, roles: ['owner', 'admin', 'workshop'] },
]

const sectionTitles: Record<Section, string> = {
  dashboard: 'Dashboard',
  projects: 'Proyek',
  customers: 'Pelanggan',
  invoices: 'Invoice',
  payments: 'Pembayaran',
  transactions: 'Transaksi',
  reports: 'Laporan',
  users: 'Staf Workshop',
  'project-categories': 'Kategori Proyek',
  settings: 'Pengaturan',
}

export function AppShell({
  profile,
  role,
  section,
  onNavigate,
  onSignOut,
  children,
}: {
  profile: Profile
  role: AppRole
  section: Section
  onNavigate: (section: Section) => void
  onSignOut: () => void
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const online = useOnlineStatus()
  const [showScrollTop, setShowScrollTop] = useState(false)
  const menu = navigation.filter((item) => item.roles.includes(role))
  const navigate = (id: Section) => {
    onNavigate(id)
    setMobileOpen(false)
  }

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className={`app-shell ${section === 'dashboard' ? 'app-shell-dashboard' : ''}`}>
      {mobileOpen && <button className="mobile-backdrop" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <span className="brand-mark"><img src="/logo-ckm.jpeg" alt="Logo Cipta Karya Mandiri" /></span>
          <span className="brand-copy"><strong>CKM / WORKSHOP</strong><small>Cipta Karya Mandiri</small></span>
          <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Tutup menu"><X size={18} /></button>
        </div>
        <p className="nav-caption">Menu utama</p>
        <nav className="primary-nav" aria-label="Navigasi utama">
          {menu.map(({ id, label, icon: Icon }) => (
            <button key={id} title={label} aria-current={section === id ? 'page' : undefined} className={`nav-item ${section === id ? 'nav-item-active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-block">
            <div className="avatar">{profile.full_name.trim().charAt(0).toUpperCase() || 'U'}</div>
            <span className="profile-copy"><strong>{profile.full_name || 'Pengguna'}</strong><small>{role === 'owner' ? 'Owner / Admin' : role === 'admin' ? 'Admin' : 'Workshop'}</small></span>
            <button className="profile-logout-button" onClick={onSignOut} aria-label="Keluar" title="Keluar"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        {!online && (
          <div className="offline-banner" role="alert">
            <WifiOff size={16} />
            <span>Anda sedang offline. Beberapa fitur mungkin tidak tersedia.</span>
          </div>
        )}
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Buka menu" aria-expanded={mobileOpen}><Menu size={20} /></button>
          <div className="mobile-brand">CKM Workshop</div>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{sectionTitles[section]}</strong></div>
          <div className="topbar-actions">
            <span className="topbar-user"><strong>{profile.full_name || 'Pengguna'}</strong><small>{role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Workshop'}</small></span>
            <div className="top-avatar" aria-hidden="true">{profile.full_name.trim().charAt(0).toUpperCase() || 'U'}</div>
          </div>
        </header>
        <div className="page-content">{children}</div>
        {showScrollTop && (
          <button
            className="scroll-to-top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Kembali ke atas"
          >
            <ChevronUp size={20} />
          </button>
        )}
      </main>
      <nav className="mobile-bottom-nav" aria-label="Navigasi cepat">
        {[
          { id: 'dashboard' as Section, label: 'Dashboard', icon: LayoutDashboard },
          { id: 'projects' as Section, label: 'Proyek', icon: Hammer },
          { id: 'invoices' as Section, label: 'Invoice', icon: FileText },
          { id: 'transactions' as Section, label: 'Transaksi', icon: ArrowLeftRight },
        ].filter((item) => menu.some((entry) => entry.id === item.id)).map(({ id, label, icon: Icon }) => (
          <button key={id} className={section === id ? 'mobile-nav-active' : ''} onClick={() => navigate(id)}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}
        <button onClick={() => setMobileOpen(true)}><MoreHorizontal size={18} /><span>Lainnya</span></button>
      </nav>
    </div>
  )
}
