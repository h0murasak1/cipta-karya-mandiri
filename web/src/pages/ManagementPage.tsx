import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { QrCode, Search, UserRoundPlus, LoaderCircle, Plus, ImagePlus } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Dialog } from '../components/Dialog'
import { currency, date, statusLabel } from '../lib/format'
import type { AppRole, Section } from '../lib/types'

interface Row {
  id: string
  title: string
  detail: string
  cells: string[]
  role?: AppRole
  status?: string
  amount?: number
  createdAt?: string
  projectCode?: string
  assignmentIds?: string[]
}

interface Option {
  id: string
  name: string
  extra?: string
  assignedIds?: string[]
}

interface FormProps {
  client: SupabaseClient
  userId: string
  onDone: (message?: string) => void
  onCancel: () => void
}

interface ManagementProps {
  client: SupabaseClient
  role: AppRole
  section: Exclude<Section, 'dashboard' | 'reports' | 'settings'>
  userId: string
}

function localDateInputValue() {
  const current = new Date()
  current.setMinutes(current.getMinutes() - current.getTimezoneOffset())
  return current.toISOString().slice(0, 10)
}

function localDateTimeIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString()
}

const configs: Record<ManagementProps['section'], { title: string; subtitle: string; add?: string; columns: string[] }> = {
  projects: { title: 'Proyek workshop', subtitle: 'Pantau pekerjaan, jadwal, dan pembaruan progres.', add: 'Proyek baru', columns: ['Nama proyek', 'Kode', 'Pelanggan / kategori', 'Target selesai', 'Nilai kontrak', 'Staf workshop', 'Status'] },
  customers: { title: 'Pelanggan', subtitle: 'Kelola data dan kontak pelanggan workshop.', add: 'Pelanggan baru', columns: ['Nama pelanggan', 'Telepon', 'Email', 'Kode', 'Status'] },
  invoices: { title: 'Invoice', subtitle: 'Kelola tagihan, pembayaran, dan tautan invoice publik.', add: 'Invoice baru', columns: ['Nomor invoice', 'Pelanggan', 'Tanggal / jatuh tempo', 'Total', 'Sisa', 'Status'] },
  payments: { title: 'Pembayaran', subtitle: 'Catat DP, termin, dan pelunasan melalui proses atomik database.', add: 'Catat pembayaran', columns: ['Invoice', 'Tanggal', 'Metode', 'Referensi', 'Jumlah'] },
  transactions: { title: 'Transaksi', subtitle: 'Arus kas dari pembayaran invoice dan pencatatan manual.', add: 'Transaksi manual', columns: ['Keterangan', 'Tanggal', 'Kategori', 'Jenis', 'Jumlah'] },
  users: { title: 'Pengguna internal', subtitle: 'Kelola akun staf Workshop dan status akses.', add: 'Tambah staf Workshop', columns: ['Nama / email', 'Telepon', 'Peran', 'Status'] },
}

export function ManagementPage({ client, role, section, userId }: ManagementProps) {
  const config = configs[section]
  const columns = section === 'projects' && role === 'workshop'
    ? config.columns.filter((column) => column !== 'Nilai kontrak')
    : config.columns
  const [rows, setRows] = useState<Row[]>([])
  const [customers, setCustomers] = useState<Option[]>([])
  const [projects, setProjects] = useState<Option[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [workshopUsers, setWorkshopUsers] = useState<Option[]>([])
  const [invoices, setInvoices] = useState<Option[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [dialog, setDialog] = useState<'customer' | 'project' | 'invoice' | 'transaction' | 'payment' | 'progress' | 'assignment' | 'user' | 'reset-user' | null>(null)
  const [selectedProject, setSelectedProject] = useState<Option | null>(null)
  const [selectedUser, setSelectedUser] = useState<Option | null>(null)
  const [issuedLink, setIssuedLink] = useState<string | null>(null)
  const [issuingId, setIssuingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(null)
    let nextRows: Row[] = []
    let nextCustomers: Option[] = []
    let nextProjects: Option[] = []
    let nextCategories: Option[] = []
    let nextWorkshopUsers: Option[] = []
    let nextInvoices: Option[] = []

    if (section === 'customers' || section === 'projects' || section === 'invoices' || section === 'payments') {
      const result = await client.from('customers').select('id, name, phone, email, address, customer_code, is_active').eq('is_active', true).order('name')
      if (result.error) {
        setError(`Pelanggan gagal dimuat: ${result.error.message}`)
        setBusy(false)
        return
      }
      nextCustomers = (result.data ?? []).map((item) => ({ id: item.id, name: item.name, extra: item.customer_code ?? '' }))
    }

    if (section === 'projects') {
      const categoryResult = await client.from('project_categories').select('id, name').eq('is_active', true).order('name')
      if (categoryResult.error) {
        setError(`Kategori pekerjaan gagal dimuat: ${categoryResult.error.message}`)
        setBusy(false)
        return
      }
      nextCategories = (categoryResult.data ?? []).map((item) => ({ id: item.id, name: item.name }))
    }

    if (section === 'transactions') {
      const categoryResult = await client.from('transaction_categories').select('id, name, transaction_type').eq('is_active', true).order('name')
      if (categoryResult.error) {
        setError(`Kategori transaksi gagal dimuat: ${categoryResult.error.message}`)
        setBusy(false)
        return
      }
      nextCategories = (categoryResult.data ?? []).map((item) => ({ id: item.id, name: item.name, extra: item.transaction_type }))
      const projectResult = await client.from('projects')
        .select('id, project_code, title')
        .order('updated_at', { ascending: false })
      if (projectResult.error) {
        setError(`Proyek terkait gagal dimuat: ${projectResult.error.message}`)
        setBusy(false)
        return
      }
      nextProjects = (projectResult.data ?? []).map((item) => ({
        id: item.id,
        name: item.title,
        extra: item.project_code,
      }))
    }

    if (section === 'projects') {
      const result = role === 'workshop'
        ? await client
          .from('projects')
          .select('id, project_code, title, status, target_completion_date, customers(name), project_categories(name)')
          .order('updated_at', { ascending: false })
        : await client
          .from('projects')
          .select('id, project_code, title, status, contract_value, target_completion_date, customers(name), project_categories(name)')
          .order('updated_at', { ascending: false })
      if (result.error) {
        setError(`Proyek gagal dimuat: ${result.error.message}`)
      } else {
        const projectIds = (result.data ?? []).map((item) => item.id)
        let assignmentRows: { project_id: string; profile_id: string }[] = []
        if (projectIds.length > 0) {
          const assignmentResult = await client.from('project_assignments').select('project_id, profile_id').in('project_id', projectIds)
          if (assignmentResult.error) setError(`Penugasan staf gagal dimuat: ${assignmentResult.error.message}`)
          else assignmentRows = assignmentResult.data ?? []
        }
        const assignmentsByProject = new Map<string, string[]>()
        for (const assignment of assignmentRows) {
          assignmentsByProject.set(assignment.project_id, [...(assignmentsByProject.get(assignment.project_id) ?? []), assignment.profile_id])
        }
        const assignedProfileIds = [...new Set(assignmentRows.map((item) => item.profile_id))]
        let profileNames = new Map<string, string>()
        if (role !== 'workshop') {
          const usersResult = await client.from('profiles').select('id, full_name').eq('role', 'workshop').eq('is_active', true).order('full_name')
          if (usersResult.error) setError(`Daftar staf workshop gagal dimuat: ${usersResult.error.message}`)
          else nextWorkshopUsers = (usersResult.data ?? []).map((item) => ({ id: item.id, name: item.full_name || 'Tanpa nama' }))
          profileNames = new Map(nextWorkshopUsers.map((item) => [item.id, item.name]))
        }
        nextRows = (result.data ?? []).map((item) => {
          const customer = Array.isArray(item.customers) ? item.customers[0] : item.customers
          const category = Array.isArray(item.project_categories) ? item.project_categories[0] : item.project_categories
          const assignedIds = assignmentsByProject.get(item.id) ?? []
          const assignedNames = role === 'workshop'
            ? assignedIds.includes(userId) ? 'Anda' : '—'
            : assignedIds.map((id) => profileNames.get(id) ?? (assignedProfileIds.includes(id) ? 'Pengguna nonaktif' : '')).filter(Boolean).join(', ')
          const contractValue = 'contract_value' in item ? item.contract_value : undefined
          return {
            id: item.id,
            title: item.title,
            detail: '',
            projectCode: item.project_code,
            cells: [
              item.project_code,
              `${customer?.name ?? '—'} / ${category?.name ?? '—'}`,
              date(item.target_completion_date),
              ...(role === 'workshop' || contractValue === undefined ? [] : [currency(Number(contractValue))]),
              assignedNames || (role === 'workshop' ? '—' : 'Belum ditugaskan'),
              statusLabel(item.status),
            ],
            status: item.status,
            assignmentIds: assignedIds,
          }
        })
        nextProjects = (result.data ?? []).map((item) => ({ id: item.id, name: item.title, extra: item.project_code }))
      }
    } else if (section === 'customers') {
      const result = await client.from('customers').select('id, name, phone, email, customer_code, is_active').eq('is_active', true).order('created_at', { ascending: false })
      if (result.error) setError(`Pelanggan gagal dimuat: ${result.error.message}`)
      else nextRows = (result.data ?? []).map((item) => ({
        id: item.id,
        title: item.name,
        detail: item.phone ?? 'Tanpa nomor telepon',
        cells: [item.phone ?? '—', item.email ?? '—', item.customer_code ?? '—', 'Aktif'],
      }))
    } else if (section === 'invoices') {
      const projectResult = await client.from('projects')
        .select('id, project_code, title')
        .order('updated_at', { ascending: false })
      if (projectResult.error) {
        setError(`Proyek terkait gagal dimuat: ${projectResult.error.message}`)
      } else {
        nextProjects = (projectResult.data ?? []).map((item) => ({
          id: item.id,
          name: item.title,
          extra: item.project_code,
        }))
      }

      const [balanceResult, invoiceDetails] = await Promise.all([
        client.from('invoice_balances').select('id, invoice_number, customer_id, project_id, issue_date, due_date, status, total_amount, paid_amount, outstanding_amount, display_status').order('issue_date', { ascending: false }),
        client.from('invoices').select('id, public_token_hash, token_revoked_at'),
      ])
      if (balanceResult.error || invoiceDetails.error) {
        setError(`Invoice gagal dimuat: ${balanceResult.error?.message ?? invoiceDetails.error?.message}`)
      } else {
        const customerNames = new Map(nextCustomers.map((item) => [item.id, item.name]))
        const tokens = new Map((invoiceDetails.data ?? []).map((item) => [item.id, Boolean(item.public_token_hash && !item.token_revoked_at)]))
        nextRows = (balanceResult.data ?? []).map((item) => ({
          id: item.id,
          title: item.invoice_number,
          detail: customerNames.get(item.customer_id) ?? '—',
          cells: [customerNames.get(item.customer_id) ?? '—', `${date(item.issue_date)} / ${date(item.due_date)}`, currency(item.total_amount), currency(item.outstanding_amount), statusLabel(item.display_status)],
          status: item.display_status,
          amount: Number(item.total_amount),
          createdAt: tokens.get(item.id) ? 'token-active' : 'token-missing',
        }))
        nextInvoices = (balanceResult.data ?? []).filter((item) => Number(item.outstanding_amount) > 0 && !['draft', 'cancelled'].includes(item.display_status)).map((item) => ({
          id: item.id,
          name: item.invoice_number,
          extra: `${customerNames.get(item.customer_id) ?? 'Pelanggan'} · sisa ${currency(item.outstanding_amount)}`,
        }))
      }
    } else if (section === 'payments') {
      const [result, balanceResult] = await Promise.all([
        client.from('payments')
          .select('id, invoice_id, amount, paid_at, payment_method, reference_number, invoices(invoice_number)')
          .order('paid_at', { ascending: false })
          .limit(200),
        client.from('invoice_balances')
          .select('id, invoice_number, customer_id, outstanding_amount, display_status')
          .gt('outstanding_amount', 0)
          .neq('display_status', 'draft')
          .neq('display_status', 'cancelled')
          .order('issue_date', { ascending: false }),
      ])
      if (result.error || balanceResult.error) {
        setError(`Pembayaran gagal dimuat: ${result.error?.message ?? balanceResult.error?.message}`)
      } else {
        nextRows = (result.data ?? []).map((item) => ({
          id: item.id,
          title: (Array.isArray(item.invoices) ? item.invoices[0] : item.invoices)?.invoice_number ?? 'Invoice',
          detail: date(item.paid_at),
          cells: [date(item.paid_at), item.payment_method, item.reference_number ?? '—', currency(item.amount)],
          amount: Number(item.amount),
        }))
        const customerNames = new Map(nextCustomers.map((item) => [item.id, item.name]))
        nextInvoices = (balanceResult.data ?? []).map((item) => ({
          id: item.id,
          name: item.invoice_number,
          extra: `${customerNames.get(item.customer_id) ?? 'Pelanggan'} · sisa ${currency(item.outstanding_amount)}`,
        }))
      }
    } else if (section === 'transactions') {
      const result = await client.from('transactions')
        .select('id, transaction_type, category_id, project_id, invoice_id, transaction_date, amount, description, transaction_categories(name)')
        .order('transaction_date', { ascending: false })
        .limit(250)
      if (result.error) setError(`Transaksi gagal dimuat: ${result.error.message}`)
      else nextRows = (result.data ?? []).map((item) => ({
        id: item.id,
        title: item.description,
        detail: item.invoice_id ? 'Dari pembayaran invoice' : 'Transaksi manual',
        cells: [date(item.transaction_date), (Array.isArray(item.transaction_categories) ? item.transaction_categories[0] : item.transaction_categories)?.name ?? '—', item.transaction_type === 'income' ? 'Pemasukan' : 'Pengeluaran', currency(item.amount)],
        status: item.transaction_type,
        amount: Number(item.amount),
      }))
    } else {
      const result = await client.from('profiles').select('id, full_name, email, phone, role, is_active').order('full_name')
      if (result.error) setError(`Profil pengguna gagal dimuat: ${result.error.message}`)
      else nextRows = (result.data ?? []).map((item) => ({
        id: item.id,
        title: item.full_name || 'Tanpa nama',
        detail: item.email ?? 'Email belum tersedia',
        cells: [item.phone ?? '—', item.role === 'owner' ? 'Owner/Admin' : item.role === 'admin' ? 'Admin' : 'Workshop', item.is_active ? 'Aktif' : 'Nonaktif'],
        role: item.role as AppRole,
      }))
    }

    setRows(nextRows)
    setCustomers(nextCustomers)
    setProjects(nextProjects)
    setCategories(nextCategories)
    setWorkshopUsers(nextWorkshopUsers)
    setInvoices(nextInvoices)
    setBusy(false)
  }, [client, role, section, userId])

  useEffect(() => { void refresh() }, [refresh])

  const visibleRows = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase('id-ID')
    return query ? rows.filter((row) => [row.title, row.detail, ...row.cells].join(' ').toLocaleLowerCase('id-ID').includes(query)) : rows
  }, [filter, rows])
  const startAdd = () => {
    setNotice(null)
    setError(null)
    setIssuedLink(null)
    if (section === 'projects') setDialog('project')
    else if (section === 'customers') setDialog('customer')
    else if (section === 'invoices') setDialog('invoice')
    else if (section === 'transactions') setDialog('transaction')
    else if (section === 'payments') setDialog('payment')
    else if (section === 'users') setDialog('user')
  }

  const issueInvoice = async (invoiceId: string) => {
    setIssuingId(invoiceId)
    setError(null)
    setIssuedLink(null)
    const { data: sessionData, error: sessionError } = await client.auth.getSession()
    if (sessionError || !sessionData.session) {
      setError(`Sesi login tidak tersedia. Silakan masuk kembali${sessionError ? `: ${sessionError.message}` : '.'}`)
      setIssuingId(null)
      return
    }

    const { data, error: issueError } = await client.functions.invoke('issue-invoice', {
      body: { invoice_id: invoiceId },
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    })
    if (issueError) {
      setError(`Token invoice gagal diterbitkan: ${await edgeFunctionErrorMessage(issueError)}`)
      setIssuingId(null)
      return
    }
    if (typeof data?.url !== 'string') {
      setError('Token berhasil diproses tetapi URL publik tidak diterima. Periksa Edge Function.')
      setIssuingId(null)
      return
    }
    setIssuedLink(data.url)
    setIssuingId(null)
    setNotice('Link publik aktif. Jika diterbitkan ulang, token QR sebelumnya tidak berlaku lagi.')
    await refresh()
  }

  const copyIssuedLink = async () => {
    if (!issuedLink) return
    try {
      await navigator.clipboard.writeText(issuedLink)
      setNotice('Link invoice berhasil disalin.')
      setError(null)
    } catch (copyError) {
      setError(`Link invoice gagal disalin: ${copyError instanceof Error ? copyError.message : 'akses clipboard ditolak.'}`)
    }
  }

  const archiveCustomer = async (id: string) => {
    const { error: updateError } = await client.from('customers').update({ is_active: false }).eq('id', id)
    if (updateError) setError(`Pelanggan gagal diarsipkan: ${updateError.message}`)
    else {
      setNotice('Pelanggan diarsipkan.')
      await refresh()
    }
  }

  const updateProjectStatus = async (id: string, status: string) => {
    const { error: updateError } = await client.from('projects').update({ status }).eq('id', id)
    if (updateError) setError(`Status proyek gagal diperbarui: ${updateError.message}`)
    else {
      setNotice('Status proyek diperbarui.')
      await refresh()
    }
  }

  const saveDone = async (message?: string) => {
    setDialog(null)
    setSelectedProject(null)
    if (message) setNotice(message)
    await refresh()
  }

  return (
    <section className="management-page">
      <div className="page-heading-row">
        <div><p className="eyebrow">OPERASIONAL</p><h1>{config.title}</h1><p className="muted">{config.subtitle}</p></div>
        {config.add && role !== 'workshop' && <button className="button button-primary" onClick={startAdd}><Plus size={16} />{config.add}</button>}
      </div>
      {notice && <div className="inline-success">{notice}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {issuedLink && (
        <div className="issued-link-panel">
          <div><QrCode size={18} /><div><strong>Link invoice publik</strong><span>{issuedLink}</span></div></div>
          <button className="button button-secondary button-small" onClick={() => void copyIssuedLink()}>Salin tautan</button>
          <QRCodeSVG value={issuedLink} size={88} />
        </div>
      )}
      <section className="panel data-panel">
        <div className="table-toolbar">
          <div className="table-count">{visibleRows.length} data</div>
          <label className="search-control"><Search size={16} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Cari data..." /></label>
        </div>
        {busy ? <div className="loading-inline"><LoaderCircle className="spin" size={18} /> Memuat data...</div> : visibleRows.length === 0 ? (
          <div className="empty-state"><span className="empty-icon"><Plus size={19} /></span><p>{error ? 'Data tidak dapat ditampilkan sampai kendala di atas diperbaiki.' : 'Belum ada data untuk ditampilkan.'}</p></div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}<th className="actions-heading">Aksi</th></tr></thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                      <td><span className="strong-cell">{row.title}</span>{row.detail && <small className="table-subline">{row.detail}</small>}</td>
                    {row.cells.map((cell, index) => <td key={`${row.id}-${index}`}>{index === row.cells.length - 1 && row.status ? <StatusBadge value={row.status} text={cell} /> : cell}</td>)}
                    <td className="row-actions">
                        <div className="row-action-group">
                          {section === 'projects' && role !== 'workshop' && <select aria-label={`Ubah status ${row.title}`} value={row.status} onChange={(event) => void updateProjectStatus(row.id, event.target.value)}>
                              <option value="waiting_confirmation">Menunggu konfirmasi</option><option value="waiting_work">Menunggu pengerjaan</option><option value="in_progress">Dalam proses</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option>
                          </select>}
                          <div className="row-action-buttons">
                            {section === 'projects' && role !== 'workshop' && <button className="text-button" onClick={() => { setSelectedProject({ id: row.id, name: row.title, extra: row.projectCode, assignedIds: row.assignmentIds }); setDialog('assignment') }}>Atur staf</button>}
                            {section === 'projects' && <button className="text-button" onClick={() => { setSelectedProject({ id: row.id, name: row.title, extra: row.projectCode }); setDialog('progress') }}>Tambah progres</button>}
                            {section === 'customers' && <button className="text-button text-danger" onClick={() => void archiveCustomer(row.id)}>Arsipkan</button>}
                            {section === 'invoices' && row.status !== 'cancelled' && (
                              <button className="text-button" disabled={issuingId === row.id} onClick={() => void issueInvoice(row.id)}>
                                {issuingId === row.id ? 'Memproses...' : row.createdAt === 'token-active' ? 'Ganti QR' : 'Terbitkan QR'}
                              </button>
                            )}
                            {section === 'users' && row.role === 'workshop' && <button className="text-button" onClick={() => {
                              setSelectedUser({ id: row.id, name: row.title, extra: row.detail })
                              setDialog('reset-user')
                            }}>Reset password</button>}
                          </div>
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {section === 'users' && <p className="small muted page-footnote"><UserRoundPlus size={14} /> Owner dan Admin memiliki izin pengelolaan yang sama. Berikan password awal dan password reset kepada staf melalui jalur aman; staf dapat menggantinya di Pengaturan.</p>}

      {dialog === 'customer' && <Dialog title="Pelanggan baru" onClose={() => setDialog(null)}><CustomerForm client={client} userId={userId} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'project' && <Dialog title="Proyek baru" onClose={() => setDialog(null)}><ProjectForm client={client} userId={userId} customers={customers} categories={categories} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'invoice' && <Dialog title="Buat invoice" description="Invoice baru disimpan sebagai draft." onClose={() => setDialog(null)}><InvoiceForm client={client} userId={userId} customers={customers} projects={projects} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'transaction' && <Dialog title="Transaksi manual" onClose={() => setDialog(null)}><TransactionForm client={client} userId={userId} projects={projects} categories={categories} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'payment' && <Dialog title="Catat pembayaran" description="Pembayaran dicatat oleh fungsi database secara atomik bersama transaksi kas masuk." onClose={() => setDialog(null)}><PaymentForm client={client} userId={userId} invoices={invoices} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'progress' && selectedProject && <Dialog title="Tambah progres proyek" description={`${selectedProject.name} · ${selectedProject.extra ?? ''}`} onClose={() => setDialog(null)}><ProgressForm client={client} userId={userId} project={selectedProject} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'assignment' && selectedProject && <Dialog title="Atur staf proyek" description={`${selectedProject.name} · ${selectedProject.extra ?? ''}`} onClose={() => setDialog(null)}><AssignmentForm client={client} userId={userId} project={selectedProject} users={workshopUsers} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'user' && <Dialog title="Tambah staf Workshop" description="Akun dibuat aktif dan dapat langsung digunakan untuk masuk." onClose={() => setDialog(null)}><WorkshopUserForm client={client} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'reset-user' && selectedUser && <Dialog title="Reset password staf" description={`${selectedUser.name} · ${selectedUser.extra ?? ''}`} onClose={() => setDialog(null)}><ResetWorkshopPasswordForm client={client} user={selectedUser} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
    </section>
  )
}

function WorkshopUserForm({ client, onDone, onCancel }: Pick<FormProps, 'client' | 'onDone' | 'onCancel'>) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    if (password !== String(form.get('password_confirmation'))) {
      setError('Konfirmasi password tidak sama.')
      setBusy(false)
      return
    }
    const { error: invokeError } = await client.functions.invoke('manage-workshop-users', {
      body: {
        action: 'create',
        full_name: String(form.get('full_name')).trim(),
        email: String(form.get('email')).trim(),
        phone: String(form.get('phone') || '').trim(),
        password,
      },
    })
    if (invokeError) setError(await edgeFunctionErrorMessage(invokeError))
    else onDone('Akun staf Workshop berhasil dibuat. Berikan password awal melalui jalur aman.')
    setBusy(false)
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <Field label="Nama staf" name="full_name" required maxLength={120} autoComplete="name" />
    <Field label="Email login" name="email" type="email" required maxLength={254} autoComplete="email" />
    <Field label="Nomor telepon" name="phone" type="tel" maxLength={40} autoComplete="tel" />
    <Field label="Password awal" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
    <Field label="Konfirmasi password" name="password_confirmation" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
    <p className="small muted">Gunakan password minimal 8 karakter. Staf dapat menggantinya sendiri di menu Pengaturan.</p>
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

function ResetWorkshopPasswordForm({ client, user, onDone, onCancel }: Pick<FormProps, 'client' | 'onDone' | 'onCancel'> & { user: Option }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    if (password !== String(form.get('password_confirmation'))) {
      setError('Konfirmasi password tidak sama.')
      setBusy(false)
      return
    }
    const { error: invokeError } = await client.functions.invoke('manage-workshop-users', {
      body: { action: 'reset_password', profile_id: user.id, password },
    })
    if (invokeError) setError(await edgeFunctionErrorMessage(invokeError))
    else onDone('Password berhasil direset. Sampaikan kepada staf melalui jalur aman.')
    setBusy(false)
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <Field label="Password baru" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
    <Field label="Konfirmasi password baru" name="password_confirmation" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
    <p className="small muted">Password baru tidak dikirim lewat aplikasi. Sampaikan kepada staf melalui jalur aman; staf dapat menggantinya di Pengaturan.</p>
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

async function edgeFunctionErrorMessage(error: { message: string; context?: unknown }) {
  if (error.context instanceof Response) {
    const body: unknown = await error.context.clone().json().catch(() => null)
    if (body && typeof body === 'object') {
      if ('error' in body && typeof body.error === 'string') return body.error
      if ('message' in body && typeof body.message === 'string') return body.message
    }
  }
  return error.message
}

function CustomerForm({ client, userId, onDone, onCancel }: FormProps) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const { error: insertError } = await client.from('customers').insert({
      name: String(form.get('name')).trim(),
      phone: String(form.get('phone') || '').trim() || null,
      email: String(form.get('email') || '').trim() || null,
      address: String(form.get('address') || '').trim() || null,
      notes: String(form.get('notes') || '').trim() || null,
      created_by: userId,
    })
    if (insertError) setError(`Pelanggan gagal disimpan: ${insertError.message}`)
    else onDone('Pelanggan berhasil ditambahkan.')
    setBusy(false)
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <Field label="Nama pelanggan" name="name" required />
    <div className="form-grid"><Field label="Nomor telepon" name="phone" /><Field label="Email" name="email" type="email" /></div>
    <Field label="Alamat" name="address" />
    <Field label="Catatan internal" name="notes" />
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

function ProjectForm({ client, userId, customers, categories, onDone, onCancel }: FormProps & { customers: Option[]; categories: Option[] }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const projectCode = `CKM-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
    const { error: insertError } = await client.from('projects').insert({
      project_code: projectCode,
      customer_id: String(form.get('customer_id')),
      category_id: String(form.get('category_id') || '') || null,
      title: String(form.get('title')).trim(),
      description: String(form.get('description') || '').trim() || null,
      location: String(form.get('location') || '').trim() || null,
      contract_value: Number(form.get('contract_value') || 0),
      start_date: String(form.get('start_date') || '') || null,
      target_completion_date: String(form.get('target_completion_date') || '') || null,
      created_by: userId,
    })
    if (insertError) setError(`Proyek gagal disimpan: ${insertError.message}`)
    else onDone(`Proyek ${projectCode} berhasil dibuat.`)
    setBusy(false)
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <Field label="Nama proyek" name="title" required />
    <div className="form-grid">
      <SelectField label="Pelanggan" name="customer_id" options={customers} required />
      <SelectField label="Kategori pekerjaan" name="category_id" options={categories} optionalLabel="Pilih kategori" />
    </div>
    <div className="form-grid"><Field label="Nilai kontrak (Rp)" name="contract_value" type="number" min="0" required /><Field label="Lokasi pekerjaan" name="location" /></div>
    <div className="form-grid"><Field label="Tanggal mulai" name="start_date" type="date" /><Field label="Target selesai" name="target_completion_date" type="date" /></div>
    <Field label="Deskripsi" name="description" />
    <p className="small muted">Kode proyek dibuat otomatis. Status awal: Menunggu konfirmasi.</p>
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

function AssignmentForm({ client, userId, project, users, onDone, onCancel }: FormProps & { project: Option; users: Option[] }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const selectedIds = [...new Set(form.getAll('profile_ids').map(String))]
    const currentIds = new Set(project.assignedIds ?? [])
    const selectedSet = new Set(selectedIds)
    const additions = selectedIds.filter((id) => !currentIds.has(id))
    const removals = [...currentIds].filter((id) => !selectedSet.has(id))

    if (additions.length > 0) {
      const { error: insertError } = await client.from('project_assignments').insert(additions.map((profileId) => ({
        project_id: project.id,
        profile_id: profileId,
        assigned_by: userId,
      })))
      if (insertError) {
        setError(`Penugasan staf baru gagal disimpan: ${insertError.message}`)
        setBusy(false)
        return
      }
    }

    if (removals.length > 0) {
      const { error: deleteError } = await client.from('project_assignments')
        .delete()
        .eq('project_id', project.id)
        .in('profile_id', removals)
      if (deleteError) {
        setError(`Staf tambahan tersimpan, tetapi penugasan lama gagal dihapus: ${deleteError.message}`)
        setBusy(false)
        return
      }
    }

    onDone('Penugasan staf workshop berhasil diperbarui.')
    setBusy(false)
  }

  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <label className="field-group">
      <span className="field-label">Pilih staf workshop</span>
      <select name="profile_ids" multiple size={Math.min(Math.max(users.length, 3), 8)} defaultValue={project.assignedIds ?? []} disabled={busy || users.length === 0}>
        {users.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}
      </select>
    </label>
    {users.length === 0 && <p className="small muted">Belum ada akun Workshop aktif untuk ditugaskan.</p>}
    <p className="small muted">Gunakan Ctrl (Windows) atau Command (macOS) untuk memilih beberapa staf. Perubahan akses mengikuti policy RLS di database.</p>
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

function InvoiceForm({ client, userId, customers, projects, onDone, onCancel }: FormProps & { customers: Option[]; projects: Option[] }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [today] = useState(localDateInputValue)
  const [items, setItems] = useState([{ description: '', quantity: '1', unit: 'unit', unit_price: '' }])
  const total = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const invoiceNumber = `INV-${String(form.get('issue_date')).slice(0, 4)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
    const header = await client.from('invoices').insert({
      invoice_number: invoiceNumber,
      customer_id: String(form.get('customer_id')),
      project_id: String(form.get('project_id') || '') || null,
      issue_date: String(form.get('issue_date')),
      due_date: String(form.get('due_date') || '') || null,
      public_note: String(form.get('public_note') || '').trim() || null,
      issued_by: userId,
      status: 'draft',
      subtotal: total,
      total_amount: total,
    }).select('id').single()

    if (header.error) {
      setError(`Invoice gagal dibuat: ${header.error.message}`)
      setBusy(false)
      return
    }

    const itemResult = await client.from('invoice_items').insert(items.map((item, index) => ({
      invoice_id: header.data.id,
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unit: item.unit.trim() || 'unit',
      unit_price: Number(item.unit_price),
      line_total: Number(item.quantity) * Number(item.unit_price),
      sort_order: index,
    })))

    if (itemResult.error) {
      const rollback = await client.from('invoices').delete().eq('id', header.data.id)
      setError(rollback.error
        ? `Item invoice gagal disimpan (${itemResult.error.message}) dan draft gagal dibersihkan (${rollback.error.message}). Periksa data invoice ${invoiceNumber}.`
        : `Item invoice gagal disimpan; draft ${invoiceNumber} telah dibersihkan. ${itemResult.error.message}`)
      setBusy(false)
      return
    }

    onDone(`Draft ${invoiceNumber} berhasil dibuat dengan total ${currency(total)}.`)
    setBusy(false)
  }
  const updateItem = (index: number, key: keyof typeof items[number], value: string) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <div className="form-grid">
      <SelectField label="Pelanggan" name="customer_id" options={customers} required />
      <SelectField label="Proyek terkait" name="project_id" options={projects} optionalLabel="Tanpa proyek terkait" />
    </div>
    <div className="form-grid"><Field label="Tanggal terbit" name="issue_date" type="date" defaultValue={today} required /><Field label="Jatuh tempo" name="due_date" type="date" /></div>
    <div className="invoice-items-editor">
      <div className="invoice-items-heading"><strong>Item invoice</strong><button className="text-button" type="button" onClick={() => setItems((current) => [...current, { description: '', quantity: '1', unit: 'unit', unit_price: '' }])}>+ Tambah item</button></div>
      {items.map((item, index) => <div className="invoice-item-input" key={index}>
        <input aria-label="Deskripsi item" placeholder="Deskripsi pekerjaan" value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} required />
        <input aria-label="Kuantitas" type="number" min="0.01" step="0.01" placeholder="Qty" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} required />
        <input aria-label="Satuan" placeholder="Satuan" value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)} />
        <input aria-label="Harga satuan" type="number" min="0" step="1" placeholder="Harga satuan" value={item.unit_price} onChange={(event) => updateItem(index, 'unit_price', event.target.value)} required />
        {items.length > 1 && <button className="icon-button" type="button" aria-label="Hapus item" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>}
      </div>)}
      <div className="invoice-total"><span>Total sementara</span><strong>{currency(total)}</strong></div>
    </div>
    <Field label="Catatan untuk pelanggan" name="public_note" />
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

function TransactionForm({ client, userId, projects, categories, onDone, onCancel }: FormProps & { projects: Option[]; categories: Option[] }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [today] = useState(localDateInputValue)
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [customerOptions, setCustomerOptions] = useState<Option[]>([])
  useEffect(() => {
    let active = true
    void client.from('customers').select('id, name').eq('is_active', true).order('name').then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError) setError(`Pelanggan gagal dimuat: ${loadError.message}`)
      else setCustomerOptions((data ?? []).map((item) => ({ id: item.id, name: item.name })))
    })
    return () => { active = false }
  }, [client])
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const { error: insertError } = await client.from('transactions').insert({
      transaction_type: type,
      category_id: String(form.get('category_id') || '') || null,
      project_id: String(form.get('project_id') || '') || null,
      customer_id: String(form.get('customer_id') || '') || null,
      transaction_date: localDateTimeIso(String(form.get('transaction_date'))),
      amount: Number(form.get('amount')),
      description: String(form.get('description')).trim(),
      recorded_by: userId,
    })
    if (insertError) setError(`Transaksi gagal disimpan: ${insertError.message}`)
    else onDone('Transaksi manual berhasil disimpan.')
    setBusy(false)
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <div className="field-group"><span className="field-label">Jenis transaksi</span><div className="segmented-control"><button type="button" className={type === 'income' ? 'segment-active' : ''} onClick={() => setType('income')}>Pemasukan</button><button type="button" className={type === 'expense' ? 'segment-active' : ''} onClick={() => setType('expense')}>Pengeluaran</button></div></div>
    <div className="form-grid"><SelectField label="Kategori" name="category_id" options={categories.filter((item) => item.extra === type)} required /><Field label="Nominal (Rp)" name="amount" type="number" min="1" required /></div>
    <div className="form-grid"><Field label="Tanggal" name="transaction_date" type="date" defaultValue={today} required /><SelectField label="Proyek terkait" name="project_id" options={projects} optionalLabel="Tanpa proyek" /></div>
    <SelectField label="Pelanggan terkait" name="customer_id" options={customerOptions} optionalLabel="Tanpa pelanggan" />
    <Field label="Keterangan" name="description" required />
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

function PaymentForm({ client, userId, invoices, onDone, onCancel }: FormProps & { invoices: Option[] }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [today] = useState(localDateInputValue)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const { error: rpcError } = await client.rpc('record_invoice_payment', {
      p_invoice_id: String(form.get('invoice_id')),
      p_amount: Number(form.get('amount')),
      p_paid_at: localDateTimeIso(String(form.get('paid_at'))),
      p_payment_method: String(form.get('payment_method')),
      p_reference_number: String(form.get('reference_number') || '') || null,
      p_notes: String(form.get('notes') || '') || null,
    })
    if (rpcError) setError(`Pembayaran gagal dicatat: ${rpcError.message}`)
    else onDone('Pembayaran dan transaksi kas masuk berhasil dicatat secara atomik.')
    setBusy(false)
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <SelectField label="Invoice" name="invoice_id" options={invoices} required />
    {invoices.length === 0 && <p className="small muted">Tidak ada invoice aktif dengan sisa tagihan.</p>}
    <div className="form-grid"><Field label="Nominal pembayaran (Rp)" name="amount" type="number" min="1" required /><SelectField label="Metode" name="payment_method" options={[{ id: 'cash', name: 'Tunai' }, { id: 'bank_transfer', name: 'Transfer bank' }, { id: 'other', name: 'Lainnya' }]} required /></div>
    <div className="form-grid"><Field label="Tanggal bayar" name="paid_at" type="date" defaultValue={today} required /><Field label="Nomor referensi" name="reference_number" /></div>
    <Field label="Catatan" name="notes" />
    <p className="small muted">User penerima pembayaran: {userId.slice(0, 8)}…</p>
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

function ProgressForm({ client, userId, project, onDone, onCancel }: FormProps & { project: Option }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const { data, error: insertError } = await client.from('project_progress').insert({
      project_id: project.id,
      stage_name: String(form.get('stage_name')).trim(),
      progress_percent: Number(form.get('progress_percent')),
      description: String(form.get('description') || '').trim() || null,
      created_by: userId,
    }).select('id').single()

    if (insertError) {
      setError(`Progres gagal disimpan: ${insertError.message}`)
      setBusy(false)
      return
    }

    const photo = form.get('photo')
    if (photo instanceof File && photo.size > 0) {
      const ext = photo.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'jpg'
      const path = `${project.id}/${crypto.randomUUID()}.${ext}`
      const upload = await client.storage.from('project-photos').upload(path, photo, { contentType: photo.type || 'application/octet-stream', upsert: false })
      if (upload.error) {
        onDone(`Progres tersimpan. Foto gagal diunggah: ${upload.error.message}`)
        setBusy(false)
        return
      }
      const metadata = await client.from('project_photos').insert({
        project_id: project.id,
        progress_id: data.id,
        storage_path: path,
        caption: String(form.get('caption') || '').trim() || null,
        uploaded_by: userId,
      })
      if (metadata.error) {
        const cleanup = await client.storage.from('project-photos').remove([path])
        onDone(cleanup.error
          ? `Progres tersimpan, metadata foto gagal (${metadata.error.message}), dan file sementara gagal dibersihkan (${cleanup.error.message}).`
          : `Progres tersimpan, metadata foto gagal, dan file sementara telah dibersihkan. ${metadata.error.message}`)
        setBusy(false)
        return
      }
    }

    onDone('Pembaruan progres berhasil disimpan.')
    setBusy(false)
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <Field label="Tahapan pekerjaan" name="stage_name" required placeholder="Contoh: Fabrikasi" />
    <Field label="Persentase progres" name="progress_percent" type="number" min="0" max="100" step="0.01" required />
    <Field label="Catatan progres" name="description" />
    <label className="upload-field"><ImagePlus size={17} /><span>Foto dokumentasi (opsional)</span><input type="file" name="photo" accept="image/*" /></label>
    <Field label="Keterangan foto" name="caption" />
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

function Field({ label, name, type = 'text', required, min, max, step, minLength, maxLength, defaultValue, placeholder, autoComplete }: { label: string; name: string; type?: string; required?: boolean; min?: string; max?: string; step?: string; minLength?: number; maxLength?: number; defaultValue?: string; placeholder?: string; autoComplete?: string }) {
  return <label className="field-group"><span className="field-label">{label}{required && <i> *</i>}</span>
    <input name={name} type={type} required={required} min={min} max={max} step={step} minLength={minLength} maxLength={maxLength} defaultValue={defaultValue} placeholder={placeholder} autoComplete={autoComplete} />
  </label>
}

function SelectField({ label, name, options, required, optionalLabel }: { label: string; name: string; options: Option[]; required?: boolean; optionalLabel?: string }) {
  return <label className="field-group"><span className="field-label">{label}{required && <i> *</i>}</span>
    <select name={name} required={required} defaultValue="">
      <option value="">{required ? 'Pilih...' : optionalLabel ?? 'Pilih...'}</option>
      {options.map((option) => <option value={option.id} key={option.id}>{option.name}{option.extra ? ` · ${option.extra}` : ''}</option>)}
    </select>
  </label>
}

function FormFooter({ error, busy, onCancel }: { error: string | null; busy: boolean; onCancel: () => void }) {
  return <div className="form-footer">
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Batal</button><button className="button button-primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button></div>
  </div>
}

function StatusBadge({ value, text }: { value: string; text: string }) {
  const safe = value.replace(/[^a-z0-9_-]/gi, '_')
  return <span className={`status-badge status-${safe}`}>{text}</span>
}
