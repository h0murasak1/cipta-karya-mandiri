import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { LoaderCircle, TrendingDown, TrendingUp } from 'lucide-react'
import { currency, date, statusLabel } from '../lib/format'

interface ReportTransaction {
  id: string
  transaction_type: 'income' | 'expense'
  transaction_date: string
  amount: number
  description: string
  transaction_categories: { name: string } | { name: string }[] | null
}

interface ReportProject {
  id: string
  status: string
  contract_value: number
}

export function ReportsPage({ client }: { client: SupabaseClient }) {
  const [period, setPeriod] = useState('90')
  const [transactions, setTransactions] = useState<ReportTransaction[]>([])
  const [projects, setProjects] = useState<ReportProject[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setBusy(true)
      setError(null)
      const start = new Date()
      start.setDate(start.getDate() - Number(period))
      const [transactionResult, projectResult] = await Promise.all([
        client.from('transactions')
          .select('id, transaction_type, transaction_date, amount, description, transaction_categories(name)')
          .gte('transaction_date', start.toISOString())
          .order('transaction_date', { ascending: false }),
        client.from('projects').select('id, status, contract_value'),
      ])
      if (!active) return
      if (transactionResult.error || projectResult.error) {
        setError(`Laporan gagal dimuat: ${transactionResult.error?.message ?? projectResult.error?.message}`)
      } else {
        setTransactions((transactionResult.data ?? []) as ReportTransaction[])
        setProjects((projectResult.data ?? []) as ReportProject[])
      }
      setBusy(false)
    }
    void load()
    return () => { active = false }
  }, [client, period])

  const income = transactions.filter((item) => item.transaction_type === 'income').reduce((sum, item) => sum + Number(item.amount), 0)
  const expense = transactions.filter((item) => item.transaction_type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0)
  const categories = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const transaction of transactions) {
      const key = `${transaction.transaction_type}:${categoryName(transaction.transaction_categories) ?? 'Tanpa kategori'}`
      grouped.set(key, (grouped.get(key) ?? 0) + Number(transaction.amount))
    }
    return [...grouped.entries()].sort((a, b) => b[1] - a[1])
  }, [transactions])
  const projectStatuses = useMemo(() => {
    const grouped = new Map<string, { count: number; value: number }>()
    for (const project of projects) {
      const item = grouped.get(project.status) ?? { count: 0, value: 0 }
      item.count += 1
      item.value += Number(project.contract_value)
      grouped.set(project.status, item)
    }
    return [...grouped.entries()]
  }, [projects])
  const maxCategory = Math.max(1, ...categories.map(([, amount]) => amount))

  return (
    <section className="reports-page">
      <div className="page-heading-row">
        <div><p className="eyebrow">ANALISIS</p><h1>Laporan</h1><p className="muted">Ringkasan kas berdasarkan transaksi tercatat, bukan laba akuntansi.</p></div>
        <label className="period-select"><span>Periode</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="30">30 hari</option><option value="90">90 hari</option><option value="365">12 bulan</option></select></label>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {busy ? <div className="loading-inline"><LoaderCircle className="spin" size={18} /> Menyusun laporan...</div> : (
        <>
          <div className="report-summary-grid">
            <Summary label="Total pemasukan" amount={income} icon={<TrendingUp size={18} />} />
            <Summary label="Total pengeluaran" amount={expense} icon={<TrendingDown size={18} />} />
            <Summary label="Arus kas bersih" amount={income - expense} icon={<span className="net-icon">±</span>} />
            <Summary label="Nilai proyek tercatat" amount={projects.reduce((sum, item) => sum + Number(item.contract_value), 0)} icon={<span className="net-icon">∑</span>} />
          </div>
          <div className="report-columns">
            <section className="panel report-panel">
              <div className="panel-heading"><h2>Transaksi per kategori</h2><span className="muted small">{transactions.length} transaksi</span></div>
              {categories.length === 0 ? <Empty text="Belum ada transaksi pada periode terpilih." /> : (
                <div className="category-report">
                  {categories.map(([key, amount]) => {
                    const [type, name] = key.split(':')
                    return <div className="category-report-row" key={key}>
                      <div className="category-report-meta"><span>{name}<small>{type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</small></span><strong>{currency(amount)}</strong></div>
                      <div className="progress-track"><span className={type === 'expense' ? 'bar-expense' : ''} style={{ width: `${amount / maxCategory * 100}%` }} /></div>
                    </div>
                  })}
                </div>
              )}
            </section>
            <section className="panel report-panel">
              <div className="panel-heading"><h2>Status proyek</h2><span className="muted small">{projects.length} proyek</span></div>
              {projectStatuses.length === 0 ? <Empty text="Belum ada proyek." /> : (
                <div className="report-project-list">
                  {projectStatuses.map(([status, totals]) => <div key={status} className="report-project-row">
                    <span><i className={`project-status-dot status-dot-${status}`} />{statusLabel(status)}</span>
                    <strong>{totals.count}</strong><small>{currency(totals.value)}</small>
                  </div>)}
                </div>
              )}
            </section>
          </div>
          <section className="panel report-transactions">
            <div className="panel-heading"><h2>Transaksi terbaru</h2><span className="muted small">Dari {date(transactions.at(-1)?.transaction_date)}</span></div>
            {transactions.length === 0 ? <Empty text="Tidak ada transaksi untuk dilaporkan." /> : (
              <div className="table-scroll"><table><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Jenis</th><th>Nominal</th></tr></thead><tbody>
                {transactions.slice(0, 12).map((transaction) => <tr key={transaction.id}>
                  <td>{date(transaction.transaction_date)}</td><td className="strong-cell">{transaction.description}</td><td>{categoryName(transaction.transaction_categories) ?? '—'}</td>
                  <td>{transaction.transaction_type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</td><td>{currency(transaction.amount)}</td>
                </tr>)}
              </tbody></table></div>
            )}
          </section>
        </>
      )}
    </section>
  )
}

function Summary({ label, amount, icon }: { label: string; amount: number; icon: React.ReactNode }) {
  return <article className="report-summary-card"><span className="report-summary-icon">{icon}</span><small>{label}</small><strong>{currency(amount)}</strong></article>
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state"><p>{text}</p></div>
}

function categoryName(value: ReportTransaction['transaction_categories']) {
  return Array.isArray(value) ? value[0]?.name : value?.name
}
