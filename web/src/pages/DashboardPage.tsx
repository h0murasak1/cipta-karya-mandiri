import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CircleAlert, FolderKanban, LoaderCircle, Plus, Search } from 'lucide-react'
import { currency, date, statusLabel } from '../lib/format'
import type { AppRole, Section } from '../lib/types'

interface DashboardTransaction {
  id: string
  transaction_type: 'income' | 'expense'
  transaction_date: string
  amount: number
  description: string
}

interface DashboardProject {
  id: string
  project_code: string
  title: string
  status: string
  target_completion_date: string | null
  project_progress: { progress_percent: number; progress_date: string; stage_name: string }[]
}

interface DashboardInvoice {
  id: string
  invoice_number: string
  customer_id: string
  project_id: string | null
  due_date: string | null
  total_amount: number
  outstanding_amount: number
  display_status: string
}

const monthLabel = (month: Date) => new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(month)

const periods = [
  { days: 7, label: '7 hari terakhir' },
  { days: 30, label: '30 hari terakhir' },
  { days: 180, label: '6 bulan terakhir' },
]

export function DashboardPage({ client, role, onNavigate }: { client: SupabaseClient; role: AppRole; onNavigate: (section: Section) => void }) {
  const [now] = useState(() => new Date())
  const [period, setPeriod] = useState(7)
  const [search, setSearch] = useState('')
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([])
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [invoices, setInvoices] = useState<DashboardInvoice[]>([])
  const [customers, setCustomers] = useState<Record<string, string>>({})
  const [projectNames, setProjectNames] = useState<Record<string, string>>({})
  const [activeProjectCount, setActiveProjectCount] = useState(0)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isWorkshop = role === 'workshop'

  useEffect(() => {
    let active = true
    const load = async () => {
      setBusy(true)
      setError(null)
      const [projectResult, projectCountResult] = await Promise.all([
        client
          .from('projects')
          .select('id, project_code, title, status, target_completion_date, project_progress(progress_percent, progress_date, stage_name)')
          .order('updated_at', { ascending: false })
          .limit(6),
        client
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .not('status', 'in', '(completed,cancelled)'),
      ])

      if (projectResult.error || projectCountResult.error) {
        if (active) {
          setError(`Proyek gagal dimuat: ${projectResult.error?.message ?? projectCountResult.error?.message}`)
          setBusy(false)
        }
        return
      }

      let transactionRows: DashboardTransaction[] = []
      let invoiceRows: DashboardInvoice[] = []
      let customerNames: Record<string, string> = {}
      let relatedProjectNames: Record<string, string> = {}

      if (!isWorkshop) {
        const from = new Date()
        from.setMonth(from.getMonth() - 5, 1)
        from.setHours(0, 0, 0, 0)
        const [transactionResult, invoiceResult] = await Promise.all([
          client
            .from('transactions')
            .select('id, transaction_type, transaction_date, amount, description')
            .gte('transaction_date', from.toISOString())
            .order('transaction_date', { ascending: false }),
          client
            .from('invoice_balances')
            .select('id, invoice_number, customer_id, project_id, due_date, total_amount, outstanding_amount, display_status')
            .neq('display_status', 'draft')
            .neq('display_status', 'cancelled')
            .gt('outstanding_amount', 0)
            .order('due_date', { ascending: true })
        ])

        if (transactionResult.error || invoiceResult.error) {
          if (active) {
            setError(`Data dashboard gagal dimuat: ${transactionResult.error?.message ?? invoiceResult.error?.message}`)
            setBusy(false)
          }
          return
        }

        transactionRows = (transactionResult.data ?? []) as DashboardTransaction[]
        invoiceRows = (invoiceResult.data ?? []) as DashboardInvoice[]
        const customerIds = [...new Set(invoiceRows.map((invoice) => invoice.customer_id))]
        const projectIds = [...new Set(invoiceRows.flatMap((invoice) => invoice.project_id ? [invoice.project_id] : []))]
        const [customerResult, relatedProjectResult] = await Promise.all([
          customerIds.length > 0 ? client.from('customers').select('id, name').in('id', customerIds) : Promise.resolve({ data: [], error: null }),
          projectIds.length > 0 ? client.from('projects').select('id, title').in('id', projectIds) : Promise.resolve({ data: [], error: null }),
        ])
        if (customerResult.error || relatedProjectResult.error) {
            if (active) {
              setError(`Detail invoice gagal dimuat: ${customerResult.error?.message ?? relatedProjectResult.error?.message}`)
              setBusy(false)
            }
            return
        }
        customerNames = Object.fromEntries((customerResult.data ?? []).map((customer) => [customer.id, customer.name]))
        relatedProjectNames = Object.fromEntries((relatedProjectResult.data ?? []).map((project) => [project.id, project.title]))
      }

      if (!active) return
      setTransactions(transactionRows)
      setProjects((projectResult.data ?? []) as DashboardProject[])
      setInvoices(invoiceRows)
      setCustomers(customerNames)
      setProjectNames(relatedProjectNames)
      setActiveProjectCount(projectCountResult.count ?? 0)
      setBusy(false)
    }

    void load()
    return () => { active = false }
  }, [client, isWorkshop])

  const monthly = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
      const rows = transactions.filter((item) => {
        const when = new Date(item.transaction_date)
        return when.getFullYear() === month.getFullYear() && when.getMonth() === month.getMonth()
      })
      return {
        label: monthLabel(month),
        income: rows.filter((item) => item.transaction_type === 'income').reduce((sum, item) => sum + Number(item.amount), 0),
        expense: rows.filter((item) => item.transaction_type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0),
      }
    })
  }, [now, transactions])

  const selectedTransactions = transactions.filter((item) => {
    const age = now.getTime() - new Date(item.transaction_date).getTime()
    return age >= 0 && age <= period * 24 * 60 * 60 * 1000
  })
  const totalIncome = selectedTransactions.filter((item) => item.transaction_type === 'income').reduce((sum, item) => sum + Number(item.amount), 0)
  const totalExpense = selectedTransactions.filter((item) => item.transaction_type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0)
  const outstanding = invoices.reduce((sum, invoice) => sum + Number(invoice.outstanding_amount), 0)
  const maxBar = Math.max(1, ...monthly.flatMap((item) => [item.income, item.expense]))
  const query = search.trim().toLocaleLowerCase('id-ID')
  const filteredProjects = projects.filter((project) => [project.title, project.project_code, statusLabel(project.status)]
    .some((value) => value.toLocaleLowerCase('id-ID').includes(query)))
  const filteredInvoices = invoices.filter((invoice) => [
    invoice.invoice_number,
    customers[invoice.customer_id] ?? '',
    invoice.project_id ? projectNames[invoice.project_id] ?? '' : '',
  ].some((value) => value.toLocaleLowerCase('id-ID').includes(query)))
  const periodLabel = periods.find((item) => item.days === period)?.label ?? periods[0].label

  if (busy) {
    return <div className="loading-inline"><LoaderCircle className="spin" size={20} /> Memuat data dashboard...</div>
  }

  return (
    <section className="dashboard-page">
      <div className="page-heading-row">
        <div className="dashboard-title">
          <p className="eyebrow">WORKSHOP CONTROL ROOM</p>
          <h1>Dashboard</h1>
          <p className="muted">{isWorkshop ? 'Pantau progres proyek yang ditugaskan kepada Anda.' : 'Ringkasan aktivitas dan kinerja workshop Anda.'}</p>
        </div>
        <div className="dashboard-actions">
          {!isWorkshop && (
            <label className="dashboard-search">
              <Search size={16} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari proyek atau invoice" aria-label="Cari proyek atau invoice" />
            </label>
          )}
          {!isWorkshop && (
            <label className="period-select-wrap">
              <span className="visually-hidden">Periode ringkasan keuangan</span>
              <select className="period-select" value={period} onChange={(event) => setPeriod(Number(event.target.value))}>
                {periods.map((item) => <option key={item.days} value={item.days}>{item.label}</option>)}
              </select>
            </label>
          )}
          {!isWorkshop && <button className="button button-primary dashboard-create-button" onClick={() => onNavigate('projects')}><Plus size={16} /> Proyek baru</button>}
        </div>
      </div>
      <div className="dashboard-data-note"><span className="live-dot" /> Data langsung <span>Ringkasan memakai data operasional tersimpan. Periode kas: {periodLabel}.</span></div>
      {error && <div className="inline-alert" role="alert"><CircleAlert size={17} />{error}</div>}

      {isWorkshop ? (
        <div className="stat-grid stat-grid-workshop">
          <StatCard label="Proyek aktif" value={String(activeProjectCount)} detail="Proyek yang ditugaskan" />
          <StatCard label="Total proyek terlihat" value={String(projects.length)} detail="Sesuai penugasan aktif" />
        </div>
      ) : (
        <div className="stat-grid">
          <StatCard label="Total pemasukan" value={currency(totalIncome)} detail={`Dalam ${periodLabel}`} />
          <StatCard label="Total pengeluaran" value={currency(totalExpense)} detail={`Dalam ${periodLabel}`} />
          <StatCard label="Proyek aktif" value={String(activeProjectCount)} detail={`${projects.length} proyek terbaru ditampilkan`} />
          <StatCard label="Belum tertagih" value={currency(outstanding)} detail={`${invoices.length} invoice dengan sisa tagihan`} dark />
        </div>
      )}

      {!isWorkshop && (
        <div className="dashboard-grid">
          <section className="panel chart-panel">
            <div className="panel-heading">
              <div><h2>Arus kas</h2><p className="muted">Pemasukan dan pengeluaran berdasarkan transaksi tersimpan.</p></div>
              <div className="chart-legend"><span><i className="legend-income" /> Masuk</span><span><i className="legend-expense" /> Keluar</span></div>
            </div>
            {transactions.length === 0 && <p className="chart-empty-note">Belum ada transaksi pada enam bulan terakhir.</p>}
              <div className="chart-area" role="img" aria-label="Grafik pemasukan dan pengeluaran enam bulan terakhir">
                <div className="chart-grid-lines"><span /><span /><span /></div>
                <div className="chart-columns">
                  {monthly.map((month) => (
                    <div className="chart-month" key={`${month.label}-${month.income}`}>
                      <div className="bar-pair">
                        <div className="chart-bar income-bar" style={{ height: `${Math.max(3, month.income / maxBar * 100)}%` }} title={`Pemasukan ${currency(month.income)}`} />
                        <div className="chart-bar expense-bar" style={{ height: `${Math.max(3, month.expense / maxBar * 100)}%` }} title={`Pengeluaran ${currency(month.expense)}`} />
                      </div>
                      <span>{month.label}</span>
                    </div>
                  ))}
                </div>
              </div>
          </section>
          <section className="panel project-panel">
            <div className="panel-heading"><h2>Monitoring proyek</h2><button className="panel-link" onClick={() => onNavigate('projects')}>Lihat semua →</button></div>
            <ProjectList projects={filteredProjects.slice(0, 4)} />
          </section>
        </div>
      )}

      {isWorkshop && (
        <section className="panel workshop-project-panel">
          <PanelHeading title="Proyek ditugaskan" />
          <ProjectList projects={filteredProjects} />
        </section>
      )}

      {!isWorkshop && (
        <section className="panel invoices-panel">
          <div className="panel-heading"><h2>Invoice terbaru</h2><button className="panel-link" onClick={() => onNavigate('invoices')}>Lihat semua →</button></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Nomor invoice</th><th>Pelanggan</th><th>Proyek</th><th>Jatuh tempo</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {filteredInvoices.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState text={invoices.length === 0 ? 'Belum ada invoice dengan sisa tagihan.' : 'Tidak ada hasil yang cocok.'} /></td></tr>
                ) : filteredInvoices.slice(0, 5).map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="strong-cell">{invoice.invoice_number}</td>
                      <td>{customers[invoice.customer_id] ?? '—'}</td>
                      <td>{invoice.project_id ? projectNames[invoice.project_id] ?? '—' : '—'}</td>
                      <td>{date(invoice.due_date)}</td>
                      <td>{currency(invoice.total_amount)}</td>
                      <td><StatusBadge value={invoice.display_status} /></td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  )
}

function StatCard({ label, value, detail, dark }: { label: string; value: string; detail: string; dark?: boolean }) {
  return (
    <article className={`stat-card ${dark ? 'stat-card-dark' : ''}`}>
      <div className="stat-top"><span>{label}</span></div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-detail">{detail}</span>
    </article>
  )
}

function PanelHeading({ title, linkLabel }: { title: string; linkLabel?: string }) {
  return <div className="panel-heading"><h2>{title}</h2>{linkLabel && <span className="panel-link">{linkLabel} →</span>}</div>
}

function ProjectList({ projects }: { projects: DashboardProject[] }) {
  if (projects.length === 0) return <EmptyState text="Belum ada proyek yang dapat ditampilkan." />
  return (
    <div className="project-list">
      {projects.map((project) => {
        const latest = [...project.project_progress].sort((a, b) => b.progress_date.localeCompare(a.progress_date))[0]
        const percentage = Math.max(0, Math.min(100, Number(latest?.progress_percent ?? 0)))
        return (
          <article className="project-progress-item" key={project.id}>
            <div className="project-progress-heading">
              <div><strong>{project.title}</strong><small>{project.project_code} · {latest?.stage_name ?? statusLabel(project.status)}</small></div>
              <span>{percentage}%</span>
            </div>
            <div className="progress-track"><span style={{ width: `${percentage}%` }} /></div>
            <small className="project-target">Target {date(project.target_completion_date)}</small>
          </article>
        )
      })}
    </div>
  )
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge status-${value}`}>{statusLabel(value)}</span>
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><span className="empty-icon"><FolderKanban size={19} /></span><p>{text}</p></div>
}
