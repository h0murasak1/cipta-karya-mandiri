import {
  ArrowDownLeft,
  ArrowLeftRight,
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  FileText,
  Hammer,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  Wallet,
  MoreHorizontal,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { AppRole, Profile, Section } from '../lib/types'

const navigation: { id: Section; label: string; icon: typeof LayoutDashboard; roles: AppRole[] }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'admin', 'workshop'] },
  { id: 'projects', label: 'Proyek', icon: Hammer, roles: ['owner', 'admin', 'workshop'] },
  { id: 'customers', label: 'Pelanggan', icon: Users, roles: ['owner', 'admin'] },
  { id: 'invoices', label: 'Invoice', icon: FileText, roles: ['owner', 'admin'] },
  { id: 'payments', label: 'Pembayaran', icon: Wallet, roles: ['owner', 'admin'] },
  { id: 'transactions', label: 'Transaksi', icon: ArrowLeftRight, roles: ['owner', 'admin'] },
  { id: 'reports', label: 'Laporan', icon: BarChart3, roles: ['owner', 'admin'] },
  { id: 'users', label: 'Pengguna', icon: ClipboardList, roles: ['owner', 'admin'] },
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
  users: 'Pengguna',
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
  const menu = navigation.filter((item) => item.roles.includes(role))
  const navigate = (id: Section) => {
    onNavigate(id)
    setMobileOpen(false)
  }

  return (
    <div className={`app-shell ${section === 'dashboard' ? 'app-shell-dashboard' : ''}`}>
      {mobileOpen && <button className="mobile-backdrop" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <span className="brand-mark">CKM</span>
          <span className="brand-copy"><strong>CKM / WORKSHOP</strong><small>Cipta Karya Mandiri</small></span>
          <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Tutup menu"><X size={18} /></button>
        </div>
        <p className="nav-caption">MENU UTAMA</p>
        <nav className="primary-nav" aria-label="Navigasi utama">
          {menu.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${section === id ? 'nav-item-active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-block">
            <div className="avatar">{profile.full_name.trim().charAt(0).toUpperCase() || 'U'}</div>
            <span className="profile-copy"><strong>{profile.full_name || 'Pengguna'}</strong><small>{role === 'owner' ? 'Owner / Admin' : role === 'admin' ? 'Admin' : 'Workshop'}</small></span>
            <ChevronDown size={15} className="profile-chevron" />
          </div>
          <button className="nav-item nav-logout" onClick={onSignOut}><LogOut size={17} /><span>Keluar</span></button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Buka menu"><Menu size={20} /></button>
          <div className="mobile-brand">CKM Workshop</div>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{sectionTitles[section]}</strong></div>
          <div className="topbar-actions">
            <span className="date-chip"><ArrowDownLeft size={14} /> Data operasional</span>
            <button className="icon-button notification-button" aria-label="Notifikasi"><Bell size={17} /><i /></button>
            <div className="top-avatar">{profile.full_name.trim().charAt(0).toUpperCase() || 'U'}</div>
          </div>
        </header>
        <div className="page-content">{children}</div>
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
