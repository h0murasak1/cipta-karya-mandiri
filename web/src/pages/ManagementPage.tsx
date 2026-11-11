import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  FileText,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Plus,
  QrCode,
  Search,
  Trash2,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Dialog } from '../components/Dialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useToast } from '../components/Toast'
import { currency, date, statusLabel } from '../lib/format'
import { compressImage } from '../lib/compressImage'
import { openProjectReport, type ProjectReportData } from '../lib/projectReport'
import { DEFAULT_COMPANY_SIGNATURE, companySignature, invoiceMessage, openWhatsApp, paymentReceiptMessage, publicInvoiceUrl, whatsAppNumber } from '../lib/whatsapp'
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
  publicToken?: string | null
  customerPhone?: string | null
  customerName?: string | null
  outstandingAmount?: number
  editData?: {
    phone?: string | null
    email?: string | null
    address?: string | null
    notes?: string | null
    description?: string | null
    categoryId?: string | null
    projectId?: string | null
    customerId?: string | null
    transactionDate?: string
    transactionType?: 'income' | 'expense'
    amount?: number
    invoiceId?: string | null
    paymentId?: string | null
  }
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

const INVALID_WHATSAPP_MESSAGE = 'Nomor WhatsApp pelanggan belum diisi atau tidak valid. Perbarui di data pelanggan.'

const PROJECT_STATUSES = ['waiting_confirmation', 'waiting_work', 'in_progress', 'completed', 'cancelled'] as const

/** Sections whose first cell shows `row.detail` as a secondary line (it is not already a column there). */
const SUBLINE_SECTIONS: ReadonlySet<ManagementProps['section']> = new Set(['transactions', 'users'])

const configs: Record<ManagementProps['section'], { title: string; subtitle: string; add?: string; columns: string[] }> = {
  projects: { title: 'Proyek workshop', subtitle: 'Pantau pekerjaan, jadwal, dan pembaruan progres.', add: 'Proyek baru', columns: ['Nama proyek', 'Kode', 'Pelanggan / kategori', 'Target selesai', 'Nilai kontrak', 'Staf workshop', 'Status'] },
  customers: { title: 'Pelanggan', subtitle: 'Kelola data dan kontak pelanggan workshop.', add: 'Pelanggan baru', columns: ['Nama pelanggan', 'Telepon', 'Email', 'Kode', 'Status'] },
  invoices: { title: 'Invoice', subtitle: 'Kelola tagihan, pembayaran, dan tautan invoice publik.', add: 'Invoice baru', columns: ['Nomor invoice', 'Pelanggan', 'Tanggal / jatuh tempo', 'Total', 'Sisa', 'Status'] },
  payments: { title: 'Pembayaran', subtitle: 'Catat DP, termin, dan pelunasan melalui proses atomik database.', add: 'Catat pembayaran', columns: ['Invoice', 'Tanggal', 'Metode', 'Referensi', 'Jumlah'] },
  transactions: { title: 'Transaksi', subtitle: 'Arus kas dari pembayaran invoice dan pencatatan manual.', add: 'Transaksi manual', columns: ['Keterangan', 'Tanggal', 'Kategori', 'Jenis', 'Jumlah'] },
  users: { title: 'Staf Workshop', subtitle: 'Kelola akun, akses, dan penugasan staf workshop.', add: 'Tambah staf', columns: ['Nama / email', 'Telepon', 'Peran', 'Status'] },
  'project-categories': { title: 'Kategori Proyek', subtitle: 'Kelola pilihan kategori yang tersedia saat membuat proyek.', add: 'Kategori baru', columns: ['Nama kategori', 'Deskripsi', 'Status'] },
}

export function ManagementPage({ client, role, section, userId }: ManagementProps) {
  const config = configs[section]
  const columns = section === 'projects' && role === 'workshop'
    ? config.columns.filter((column) => column !== 'Nilai kontrak')
    : config.columns
  const { toast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [customers, setCustomers] = useState<Option[]>([])
  const [projects, setProjects] = useState<Option[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [workshopUsers, setWorkshopUsers] = useState<Option[]>([])
  const [invoices, setInvoices] = useState<Option[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<'customer' | 'edit-customer' | 'project' | 'invoice' | 'transaction' | 'edit-transaction' | 'payment' | 'progress' | 'assignment' | 'user' | 'reset-user' | 'category' | 'edit-category' | null>(null)
  const [selectedProject, setSelectedProject] = useState<Option | null>(null)
  const [selectedUser, setSelectedUser] = useState<Option | null>(null)
  const [selectedRow, setSelectedRow] = useState<Row | null>(null)
  const [issuedLink, setIssuedLink] = useState<string | null>(null)
  const [issuingId, setIssuingId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void; danger?: boolean } | null>(null)
  const [signature, setSignature] = useState(DEFAULT_COMPANY_SIGNATURE)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const canManage = role !== 'workshop'

  useEffect(() => {
    if (section !== 'invoices' && section !== 'payments') return
    let active = true
    void client.from('company_settings').select('company_name, legal_entity').eq('id', true).maybeSingle().then(({ data }) => {
      if (active && data) setSignature(companySignature(data))
    })
    return () => { active = false }
  }, [client, section])

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(null)
    let nextRows: Row[] = []
    let nextCustomers: Option[] = []
    let nextProjects: Option[] = []
    let nextCategories: Option[] = []
    let nextWorkshopUsers: Option[] = []
    let nextInvoices: Option[] = []
    let customerPhoneMap = new Map<string, string>()

    if (section === 'customers' || section === 'projects' || section === 'invoices' || section === 'payments') {
      const result = await client.from('customers').select('id, name, phone, email, address, customer_code, is_active').eq('is_active', true).order('name')
      if (result.error) {
        setError(`Pelanggan gagal dimuat: ${result.error.message}`)
        setBusy(false)
        return
      }
      customerPhoneMap = new Map((result.data ?? []).map((item) => [item.id, item.phone ?? '']))
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

    if (section === 'project-categories') {
      const categoryResult = await client.from('project_categories').select('id, name, description, is_active').order('is_active', { ascending: false }).order('name')
      if (categoryResult.error) {
        setError(`Kategori proyek gagal dimuat: ${categoryResult.error.message}`)
        setBusy(false)
        return
      }
      nextRows = (categoryResult.data ?? []).map((item) => ({
        id: item.id,
        title: item.name,
        detail: item.description ?? 'Tanpa deskripsi',
        cells: [item.name, item.description ?? '—', item.is_active ? 'Aktif' : 'Diarsipkan'],
        status: item.is_active ? 'active' : 'inactive',
        editData: { description: item.description },
      }))
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
              item.title,
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
      const result = await client.from('customers').select('id, name, phone, email, address, notes, customer_code, is_active').eq('is_active', true).order('created_at', { ascending: false })
      if (result.error) setError(`Pelanggan gagal dimuat: ${result.error.message}`)
      else nextRows = (result.data ?? []).map((item) => ({
        id: item.id,
        title: item.name,
        detail: item.phone ?? 'Tanpa nomor telepon',
        cells: [item.name, item.phone ?? '—', item.email ?? '—', item.customer_code ?? '—', 'Aktif'],
        editData: { phone: item.phone, email: item.email, address: item.address, notes: item.notes },
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
        client.from('invoices').select('id, public_token, public_token_hash, token_revoked_at'),
      ])
      if (balanceResult.error || invoiceDetails.error) {
        setError(`Invoice gagal dimuat: ${balanceResult.error?.message ?? invoiceDetails.error?.message}`)
      } else {
        const customerNames = new Map(nextCustomers.map((item) => [item.id, item.name]))
        const tokens = new Map((invoiceDetails.data ?? []).map((item) => [item.id, !item.token_revoked_at && item.public_token ? item.public_token : null]))
        nextRows = (balanceResult.data ?? []).map((item) => {
          const token = tokens.get(item.id) ?? null
          return {
            id: item.id,
            title: item.invoice_number,
            detail: customerNames.get(item.customer_id) ?? '—',
            cells: [
              item.invoice_number,
              customerNames.get(item.customer_id) ?? '—',
              `${date(item.issue_date)} / ${date(item.due_date)}`,
              currency(item.total_amount),
              currency(item.outstanding_amount),
              statusLabel(item.display_status),
            ],
            status: item.display_status,
            amount: Number(item.total_amount),
            outstandingAmount: Number(item.outstanding_amount),
            publicToken: token,
            customerPhone: customerPhoneMap.get(item.customer_id) ?? null,
            customerName: customerNames.get(item.customer_id) ?? null,
            createdAt: token ? 'token-active' : 'token-missing',
          }
        })
        nextInvoices = (balanceResult.data ?? []).filter((item) => Number(item.outstanding_amount) > 0 && !['draft', 'cancelled'].includes(item.display_status)).map((item) => ({
          id: item.id,
          name: item.invoice_number,
          extra: `${customerNames.get(item.customer_id) ?? 'Pelanggan'} · sisa ${currency(item.outstanding_amount)}`,
        }))
      }
    } else if (section === 'payments') {
      const [result, balanceResult] = await Promise.all([
        client.from('payments')
          .select('id, invoice_id, amount, paid_at, payment_method, reference_number, invoices(invoice_number, public_token, token_revoked_at, customer_id)')
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
        const customerNames = new Map(nextCustomers.map((item) => [item.id, item.name]))
        nextRows = (result.data ?? []).map((item) => {
          const inv = Array.isArray(item.invoices) ? item.invoices[0] : item.invoices
          const customerId = inv?.customer_id
          return {
            id: item.id,
            title: inv?.invoice_number ?? 'Invoice',
            detail: date(item.paid_at),
            cells: [
              inv?.invoice_number ?? 'Invoice',
              date(item.paid_at),
              item.payment_method,
              item.reference_number ?? '—',
              currency(item.amount),
            ],
            amount: Number(item.amount),
            publicToken: inv && !inv.token_revoked_at ? inv.public_token ?? null : null,
            customerPhone: customerId ? customerPhoneMap.get(customerId) ?? null : null,
            customerName: customerId ? customerNames.get(customerId) ?? null : null,
          }
        })
        nextInvoices = (balanceResult.data ?? []).map((item) => ({
          id: item.id,
          name: item.invoice_number,
          extra: `${customerNames.get(item.customer_id) ?? 'Pelanggan'} · sisa ${currency(item.outstanding_amount)}`,
        }))
      }
    } else if (section === 'transactions') {
      const result = await client.from('transactions')
        .select('id, transaction_type, category_id, project_id, customer_id, invoice_id, payment_id, transaction_date, amount, description, transaction_categories(name)')
        .order('transaction_date', { ascending: false })
        .limit(250)
      if (result.error) setError(`Transaksi gagal dimuat: ${result.error.message}`)
      else nextRows = (result.data ?? []).map((item) => ({
        id: item.id,
        title: item.description,
        detail: item.invoice_id ? 'Dari pembayaran invoice' : 'Transaksi manual',
        cells: [
          item.description,
          date(item.transaction_date),
          (Array.isArray(item.transaction_categories) ? item.transaction_categories[0] : item.transaction_categories)?.name ?? '—',
          item.transaction_type === 'income' ? 'Pemasukan' : 'Pengeluaran',
          currency(item.amount),
        ],
        status: item.transaction_type,
        amount: Number(item.amount),
        editData: {
          categoryId: item.category_id,
          projectId: item.project_id,
          customerId: item.customer_id,
          transactionDate: item.transaction_date.slice(0, 10),
          transactionType: item.transaction_type,
          amount: Number(item.amount),
          invoiceId: item.invoice_id,
          paymentId: item.payment_id,
        },
      }))
    } else if (section === 'users') {
      const result = await client.from('profiles').select('id, full_name, email, phone, role, is_active').order('full_name')
      if (result.error) setError(`Profil pengguna gagal dimuat: ${result.error.message}`)
      else nextRows = (result.data ?? []).map((item) => ({
        id: item.id,
        title: item.full_name || 'Tanpa nama',
        detail: item.email ?? 'Email belum tersedia',
        cells: [
          item.full_name || 'Tanpa nama',
          item.phone ?? '—',
          item.role === 'owner' ? 'Owner/Admin' : item.role === 'admin' ? 'Admin' : 'Workshop',
          item.is_active ? 'Aktif' : 'Nonaktif',
        ],
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

  const filteredRows = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase('id-ID')
    return query ? rows.filter((row) => [row.title, row.detail, ...row.cells].join(' ').toLocaleLowerCase('id-ID').includes(query)) : rows
  }, [filter, rows])
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const startAdd = () => {
    setError(null)
    setIssuedLink(null)
    if (section === 'projects') setDialog('project')
    else if (section === 'customers') setDialog('customer')
    else if (section === 'invoices') setDialog('invoice')
    else if (section === 'transactions') setDialog('transaction')
    else if (section === 'payments') setDialog('payment')
    else if (section === 'users') setDialog('user')
    else if (section === 'project-categories') setDialog('category')
  }

  const issueInvoice = async (invoiceId: string) => {
    setIssuingId(invoiceId)
    setError(null)
    setIssuedLink(null)
    const { data: sessionData, error: sessionError } = await client.auth.getSession()
    if (sessionError || !sessionData.session) {
      toast('error', `Sesi login tidak tersedia. Silakan masuk kembali${sessionError ? `: ${sessionError.message}` : '.'}`)
      setIssuingId(null)
      return
    }

    const { data, error: issueError } = await client.functions.invoke('issue-invoice', {
      body: { invoice_id: invoiceId },
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    })
    if (issueError) {
      toast('error', `Token invoice gagal diterbitkan: ${await edgeFunctionErrorMessage(issueError)}`)
      setIssuingId(null)
      return
    }
    if (typeof data?.url !== 'string') {
      toast('error', 'Token berhasil diproses tetapi URL publik tidak diterima. Periksa Edge Function.')
      setIssuingId(null)
      return
    }
    setIssuedLink(data.url)
    setIssuingId(null)
    toast('success', data.replaced_previous
      ? 'Link invoice permanen diterbitkan. Link/QR lama invoice ini tidak berlaku lagi — kirim ulang link baru ke pelanggan.'
      : data.is_existing ? 'Link invoice sudah aktif dan permanen.' : 'Link invoice permanen berhasil diterbitkan.')
    await refresh()
  }

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast('success', 'Link invoice berhasil disalin.')
    } catch (copyError) {
      toast('error', `Link invoice gagal disalin: ${copyError instanceof Error ? copyError.message : 'akses clipboard ditolak.'}`)
    }
  }

  const sendInvoiceWhatsApp = (row: Row) => {
    if (!row.publicToken) {
      toast('error', 'Invoice belum memiliki link. Terbitkan link terlebih dahulu.')
      return
    }
    const sent = openWhatsApp(row.customerPhone, invoiceMessage({
      customerName: row.customerName,
      invoiceNumber: row.title,
      totalAmount: row.amount ?? 0,
      outstandingAmount: row.outstandingAmount ?? row.amount ?? 0,
      url: publicInvoiceUrl(row.publicToken),
      signature,
    }))
    if (!sent) toast('error', INVALID_WHATSAPP_MESSAGE)
  }

  const sendPaymentReceiptWhatsApp = (row: Row) => {
    const sent = openWhatsApp(row.customerPhone, paymentReceiptMessage({
      customerName: row.customerName,
      invoiceNumber: row.title,
      amount: row.amount ?? 0,
      paidOn: row.detail,
      url: row.publicToken ? publicInvoiceUrl(row.publicToken) : null,
      signature,
    }))
    if (!sent) toast('error', INVALID_WHATSAPP_MESSAGE)
  }

  const archiveCustomer = (id: string, name: string) => {
    setConfirm({
      title: 'Arsipkan pelanggan',
      message: `Arsipkan pelanggan "${name}"? Data tetap tersimpan tetapi tidak muncul pada daftar aktif.`,
      onConfirm: async () => {
        const { error: updateError } = await client.from('customers').update({ is_active: false }).eq('id', id)
        if (updateError) toast('error', `Pelanggan gagal diarsipkan: ${updateError.message}`)
        else {
          toast('success', 'Pelanggan diarsipkan.')
          await refresh()
        }
      },
    })
  }

  const archiveProjectCategory = (id: string, name: string) => {
    setConfirm({
      title: 'Arsipkan kategori proyek',
      message: `Arsipkan kategori "${name}"? Kategori tidak akan muncul untuk proyek baru, tetapi tetap tersimpan pada proyek lama.`,
      onConfirm: async () => {
        setError(null)
        const { error: updateError } = await client.from('project_categories').update({ is_active: false }).eq('id', id)
        if (updateError) toast('error', `Kategori proyek gagal diarsipkan: ${updateError.message}`)
        else {
          toast('success', 'Kategori proyek diarsipkan.')
          await refresh()
        }
      },
    })
  }

  const deleteTransaction = (id: string) => {
    setConfirm({
      title: 'Hapus transaksi',
      message: 'Hapus transaksi manual ini? Tindakan ini tidak dapat dibatalkan.',
      danger: true,
      onConfirm: async () => {
        setError(null)
        const { error: deleteError } = await client.from('transactions').delete().eq('id', id)
        if (deleteError) toast('error', `Transaksi gagal dihapus: ${deleteError.message}`)
        else {
          toast('success', 'Transaksi manual berhasil dihapus.')
          await refresh()
        }
      },
    })
  }

  const updateProjectStatus = async (id: string, status: string) => {
    // The status <select> is controlled by row.status, so on any early return below it
    // simply snaps back to the saved value — no reload needed.
    setStatusUpdatingId(id)
    try {
      if (status === 'completed') {
        const blockers = await completionBlockers(id)
        if (typeof blockers === 'string') {
          toast('error', blockers)
          return
        }
        if (blockers.length > 0) {
          toast('error', `Proyek belum dapat diselesaikan:\n• ${blockers.join('\n• ')}`)
          return
        }
      }

      // The database trigger enforces the same completion rules; this is the source of truth.
      const { error: updateError } = await client.from('projects').update({ status }).eq('id', id)
      if (updateError) {
        toast('error', `Status proyek gagal diperbarui: ${updateError.message}`)
        return
      }
      toast('success', status === 'completed' ? 'Proyek berhasil diselesaikan. Laporan PDF kini tersedia.' : 'Status proyek diperbarui.')
      await refresh()
    } finally {
      setStatusUpdatingId(null)
    }
  }

  /** Friendly pre-check of the completion rules. Returns the unmet rules, or a string when the check itself failed. */
  const completionBlockers = async (projectId: string): Promise<string[] | string> => {
    const [progressResult, invoiceResult, projectResult] = await Promise.all([
      // Progress only ever increases, so the highest entry is the current one.
      client.from('project_progress').select('progress_percent').eq('project_id', projectId).order('progress_percent', { ascending: false }).limit(1),
      client.from('invoice_balances').select('invoice_number, outstanding_amount, display_status').eq('project_id', projectId).neq('display_status', 'cancelled'),
      client.from('projects').select('contract_value').eq('id', projectId).single(),
    ])
    const checkError = progressResult.error ?? invoiceResult.error ?? projectResult.error
    if (checkError) return `Syarat penyelesaian proyek gagal diperiksa: ${checkError.message}`

    const blockers: string[] = []
    const currentPercent = Number(progressResult.data?.[0]?.progress_percent ?? 0)
    if (currentPercent < 100) blockers.push(`Progres pekerjaan baru ${currentPercent}%, belum mencapai 100%`)

    const projectInvoices = invoiceResult.data ?? []
    const contractValue = Number(projectResult.data?.contract_value || 0)
    const unpaid = projectInvoices.filter((invoice) => Number(invoice.outstanding_amount) > 0)
    if (projectInvoices.length === 0 && contractValue > 0) {
      blockers.push(`Belum ada invoice untuk nilai kontrak ${currency(contractValue)}`)
    } else if (unpaid.length > 0) {
      blockers.push(`Invoice belum lunas: ${unpaid.map((invoice) => `${invoice.invoice_number} (sisa ${currency(Number(invoice.outstanding_amount))})`).join(', ')}`)
    }
    return blockers
  }

  const downloadProjectReport = async (row: Row) => {
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      toast('error', 'Jendela baru diblokir oleh browser. Izinkan pop-up untuk melihat laporan.')
      return
    }
    reportWindow.document.write('<p style="font:14px Arial;padding:24px;color:#555">Menyiapkan laporan proyek...</p>')
    try {
      const [projectResult, progressResult, photoResult, companyResult] = await Promise.all([
        client.from('projects').select('project_code, title, description, location, status, start_date, target_completion_date, contract_value, customers(name, address), project_categories(name)').eq('id', row.id).single(),
        client.from('project_progress').select('id, progress_date, stage_name, progress_percent, description').eq('project_id', row.id).order('progress_date').order('created_at'),
        client.from('project_photos').select('progress_id, storage_path, caption').eq('project_id', row.id).order('created_at'),
        // Letterhead only: the report still renders with a fallback when this is not readable.
        client.from('company_settings').select('company_name, legal_entity, address, phone, email').eq('id', true).maybeSingle(),
      ])
      if (projectResult.error || progressResult.error || photoResult.error || !projectResult.data) {
        reportWindow.close()
        toast('error', `Laporan gagal disiapkan: ${projectResult.error?.message ?? progressResult.error?.message ?? photoResult.error?.message ?? 'data proyek tidak ditemukan.'}`)
        return
      }
      const photoRows = photoResult.data ?? []
      const signed = await Promise.all(photoRows.map(async (photo) => {
        try {
          const result = await client.storage.from('project-photos').createSignedUrl(photo.storage_path, 3600)
          return { ...photo, url: result.data?.signedUrl ?? null }
        } catch {
          return { ...photo, url: null }
        }
      }))
      const customer = Array.isArray(projectResult.data.customers) ? projectResult.data.customers[0] : projectResult.data.customers
      const category = Array.isArray(projectResult.data.project_categories) ? projectResult.data.project_categories[0] : projectResult.data.project_categories
      const company = companyResult.data
      const report: ProjectReportData = {
        company: company ? {
          name: company.company_name,
          legalEntity: company.legal_entity,
          address: company.address,
          phone: company.phone,
          email: company.email,
        } : null,
        // Workshop staff are not shown contract values anywhere else in the app.
        showContractValue: canManage,
        projectCode: projectResult.data.project_code,
        title: projectResult.data.title,
        description: projectResult.data.description,
        location: projectResult.data.location,
        status: projectResult.data.status,
        startDate: projectResult.data.start_date,
        targetDate: projectResult.data.target_completion_date,
        contractValue: Number(projectResult.data.contract_value || 0),
        customerName: customer?.name ?? '—',
        customerAddress: customer?.address ?? null,
        categoryName: category?.name ?? null,
        progress: (progressResult.data ?? []).map((progress) => ({
          progressDate: progress.progress_date,
          stageName: progress.stage_name,
          progressPercent: Number(progress.progress_percent),
          description: progress.description,
          photos: signed
            .filter((photo) => photo.progress_id === progress.id && photo.url)
            .map((photo) => ({ url: photo.url as string, caption: photo.caption })),
        })),
      }
      openProjectReport(report, reportWindow)
    } catch (err) {
      reportWindow.close()
      toast('error', `Laporan gagal disiapkan: ${err instanceof Error ? err.message : 'terjadi kesalahan sistem.'}`)
    }
  }

  const saveDone = async (message?: string) => {
    setDialog(null)
    setSelectedProject(null)
    if (message) toast('success', message)
    await refresh()
  }

  return (
    <section className="management-page">
      <div className="page-heading-row">
        <div><p className="eyebrow">OPERASIONAL</p><h1>{config.title}</h1><p className="muted">{config.subtitle}</p></div>
        {config.add && role !== 'workshop' && <button className="button button-primary" onClick={startAdd}><Plus size={16} />{config.add}</button>}
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {issuedLink && (
        <div className="issued-link-panel">
          <div><QrCode size={18} /><div><strong>Link invoice publik (permanen)</strong><span>{issuedLink}</span></div></div>
          <button type="button" className="button button-secondary button-small" onClick={() => void copyLink(issuedLink)}><Copy size={14} /> Salin tautan</button>
          <QRCodeSVG value={issuedLink} size={88} />
        </div>
      )}
      <section className="panel data-panel">
        <div className="table-toolbar">
          <div className="table-count">{filteredRows.length} data</div>
          <label className="search-control"><Search size={16} /><input value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1) }} placeholder="Cari data..." /></label>
        </div>
        {busy ? <div className="loading-inline"><LoaderCircle className="spin" size={18} /> Memuat data...</div> : visibleRows.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">{filter.trim() && !error ? <Search size={19} /> : <Plus size={19} />}</span>
            <p>{error
              ? 'Data tidak dapat ditampilkan sampai kendala di atas diperbaiki.'
              : filter.trim()
                ? `Tidak ada data yang cocok dengan “${filter.trim()}”.`
                : 'Belum ada data untuk ditampilkan.'}</p>
            {filter.trim() && !error && <button type="button" className="text-button" onClick={() => setFilter('')}>Hapus pencarian</button>}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}<th className="actions-heading">Aksi</th></tr></thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    {row.cells.map((cell, index) => {
                      const isStatusColumn = columns[index] === 'Status' || columns[index] === 'Jenis'
                      return (
                        <td data-label={columns[index]} key={columns[index] ?? index}>
                          {index === 0 ? <>
                            <span className="strong-cell">{cell}</span>
                            {SUBLINE_SECTIONS.has(section) && row.detail && <small className="table-subline">{row.detail}</small>}
                          </> : isStatusColumn && row.status ? <StatusBadge value={row.status} text={cell} /> : cell}
                        </td>
                      )
                    })}
                    <td className="row-actions">
                        <div className="row-action-group">
                          {section === 'projects' && canManage && (
                            <select
                              aria-label={`Ubah status proyek ${row.title}`}
                              className="row-action-status"
                              value={row.status}
                              disabled={statusUpdatingId !== null}
                              onChange={(event) => void updateProjectStatus(row.id, event.target.value)}
                            >
                              {PROJECT_STATUSES.map((value) => <option value={value} key={value}>{statusLabel(value)}</option>)}
                            </select>
                          )}
                          <div className="row-action-buttons">
                            {section === 'projects' && <>
                              {canManage && (
                                <button
                                  type="button"
                                  className="text-button project-action-button project-action-assignment"
                                  onClick={() => {
                                    setSelectedProject({ id: row.id, name: row.title, extra: row.projectCode, assignedIds: row.assignmentIds })
                                    setDialog('assignment')
                                  }}
                                >
                                  <UsersRound size={14} />Staf
                                </button>
                              )}
                              <button
                                type="button"
                                className="text-button project-action-button project-action-progress"
                                onClick={() => {
                                  setSelectedProject({ id: row.id, name: row.title, extra: row.projectCode })
                                  setDialog('progress')
                                }}
                              >
                                <Plus size={14} />Progres
                              </button>
                            </>}
                            {section === 'projects' && row.status === 'completed' && <button type="button" className="text-button project-action-button" onClick={() => void downloadProjectReport(row)}><FileText size={14} />Laporan PDF</button>}
                            {section === 'customers' && <>
                              <button className="text-button record-action-button" onClick={() => { setSelectedRow(row); setDialog('edit-customer') }}><Edit3 size={14} />Edit</button>
                              <button className="text-button text-danger" onClick={() => archiveCustomer(row.id, row.title)}>Arsipkan</button>
                            </>}
                            {section === 'project-categories' && row.status === 'active' && <>
                              <button className="text-button record-action-button" onClick={() => { setSelectedRow(row); setDialog('edit-category') }}><Edit3 size={14} />Edit</button>
                              <button className="text-button text-danger record-action-button" onClick={() => archiveProjectCategory(row.id, row.title)}>Arsipkan</button>
                            </>}
                            {section === 'invoices' && row.status !== 'cancelled' && (
                              <div className="invoice-action-btns">
                                {row.publicToken ? (
                                  <>
                                    <button
                                      type="button"
                                      className="text-button record-action-button"
                                      onClick={() => void copyLink(publicInvoiceUrl(row.publicToken!))}
                                      title="Salin tautan invoice permanen"
                                    >
                                      <Copy size={13} /> Salin Link
                                    </button>
                                    <button
                                      type="button"
                                      className="text-button button-wa-action"
                                      onClick={() => sendInvoiceWhatsApp(row)}
                                      title="Kirim tagihan ke WhatsApp pelanggan"
                                    >
                                      <MessageCircle size={13} /> Kirim WA
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="text-button"
                                    disabled={issuingId === row.id}
                                    onClick={() => void issueInvoice(row.id)}
                                  >
                                    {issuingId === row.id ? 'Memproses...' : 'Terbitkan link invoice'}
                                  </button>
                                )}
                              </div>
                            )}
                            {section === 'payments' && (
                              <button
                                type="button"
                                className="text-button button-wa-action"
                                onClick={() => sendPaymentReceiptWhatsApp(row)}
                                title="Kirim tanda terima ke WhatsApp pelanggan"
                              >
                                <MessageCircle size={13} /> Kirim Bukti WA
                              </button>
                            )}
                            {section === 'transactions' && (row.editData?.invoiceId || row.editData?.paymentId)
                              ? <span className="row-action-locked">Dikelola dari pembayaran</span>
                              : section === 'transactions' && <>
                                <button className="text-button record-action-button" onClick={() => { setSelectedRow(row); setDialog('edit-transaction') }}><Edit3 size={14} />Edit</button>
                                <button className="text-button text-danger record-action-button" onClick={() => deleteTransaction(row.id)}><Trash2 size={14} />Hapus</button>
                              </>}
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
        {!busy && filteredRows.length > pageSize && (
          <div className="table-pagination" aria-label="Navigasi halaman data">
            <span>Halaman {currentPage} dari {pageCount}</span>
            <div className="table-pagination-actions">
              <button className="icon-button" type="button" aria-label="Halaman sebelumnya" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></button>
              <button className="icon-button" type="button" aria-label="Halaman berikutnya" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight size={17} /></button>
            </div>
          </div>
        )}
      </section>
      {section === 'users' && <p className="small muted page-footnote"><UserRoundPlus size={14} /> Owner dan Admin memiliki izin pengelolaan yang sama. Berikan password awal dan password reset kepada staf melalui jalur aman; staf dapat menggantinya di Pengaturan.</p>}

      {dialog === 'customer' && <Dialog title="Pelanggan baru" onClose={() => setDialog(null)}><CustomerForm client={client} userId={userId} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'edit-customer' && selectedRow && <Dialog title="Edit pelanggan" description={selectedRow.title} onClose={() => setDialog(null)}><CustomerForm client={client} userId={userId} initial={selectedRow} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'category' && <Dialog title="Kategori proyek baru" onClose={() => setDialog(null)}><ProjectCategoryForm client={client} userId={userId} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'edit-category' && selectedRow && <Dialog title="Edit kategori proyek" description={selectedRow.title} onClose={() => setDialog(null)}><ProjectCategoryForm client={client} userId={userId} initial={selectedRow} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'project' && <Dialog title="Proyek baru" onClose={() => setDialog(null)}><ProjectForm client={client} userId={userId} customers={customers} categories={categories} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'invoice' && <Dialog title="Buat invoice" description="Invoice baru disimpan sebagai draft." onClose={() => setDialog(null)}><InvoiceForm client={client} userId={userId} customers={customers} projects={projects} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'transaction' && <Dialog title="Transaksi manual" onClose={() => setDialog(null)}><TransactionForm client={client} userId={userId} projects={projects} categories={categories} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'edit-transaction' && selectedRow && <Dialog title="Edit transaksi manual" description={selectedRow.title} onClose={() => setDialog(null)}><TransactionForm client={client} userId={userId} projects={projects} categories={categories} initial={selectedRow} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'payment' && <Dialog title="Catat pembayaran" description="Pembayaran dicatat oleh fungsi database secara atomik bersama transaksi kas masuk." onClose={() => setDialog(null)}><PaymentForm client={client} userId={userId} invoices={invoices} signature={signature} onRecorded={() => void refresh()} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'progress' && selectedProject && <Dialog title="Tambah progres proyek" description={`${selectedProject.name} · ${selectedProject.extra ?? ''}`} onClose={() => setDialog(null)}><ProgressForm client={client} userId={userId} project={selectedProject} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'assignment' && selectedProject && <Dialog title="Atur staf proyek" description={`${selectedProject.name} · ${selectedProject.extra ?? ''}`} onClose={() => setDialog(null)}><AssignmentForm client={client} userId={userId} project={selectedProject} users={workshopUsers} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'user' && <Dialog title="Tambah staf Workshop" description="Akun dibuat aktif dan dapat langsung digunakan untuk masuk." onClose={() => setDialog(null)}><WorkshopUserForm client={client} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {dialog === 'reset-user' && selectedUser && <Dialog title="Reset password staf" description={`${selectedUser.name} · ${selectedUser.extra ?? ''}`} onClose={() => setDialog(null)}><ResetWorkshopPasswordForm client={client} user={selectedUser} onCancel={() => setDialog(null)} onDone={saveDone} /></Dialog>}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} danger={confirm.danger} onConfirm={() => { confirm.onConfirm(); setConfirm(null) }} onCancel={() => setConfirm(null)} />}
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

function CustomerForm({ client, userId, initial, onDone, onCancel }: FormProps & { initial?: Row }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const customerPayload = {
      name: String(form.get('name')).trim(),
      phone: String(form.get('phone') || '').trim() || null,
      email: String(form.get('email') || '').trim() || null,
      address: String(form.get('address') || '').trim() || null,
      notes: String(form.get('notes') || '').trim() || null,
    }
    const result = initial
      ? await client.from('customers').update(customerPayload).eq('id', initial.id)
      : await client.from('customers').insert({ ...customerPayload, created_by: userId })
    if (result.error) setError(`Pelanggan gagal disimpan: ${result.error.message}`)
    else onDone(initial ? 'Data pelanggan berhasil diperbarui.' : 'Pelanggan berhasil ditambahkan.')
    setBusy(false)
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <Field label="Nama pelanggan" name="name" required defaultValue={initial?.title} />
    <div className="form-grid"><Field label="Nomor telepon" name="phone" defaultValue={initial?.editData?.phone ?? ''} /><Field label="Email" name="email" type="email" defaultValue={initial?.editData?.email ?? ''} /></div>
    <Field label="Alamat" name="address" defaultValue={initial?.editData?.address ?? ''} />
    <Field label="Catatan internal" name="notes" defaultValue={initial?.editData?.notes ?? ''} />
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

function ProjectCategoryForm({ client, initial, onDone, onCancel }: FormProps & { initial?: Row }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') ?? '').trim(),
      description: String(form.get('description') ?? '').trim() || null,
    }
    const result = initial
      ? await client.from('project_categories').update(payload).eq('id', initial.id)
      : await client.from('project_categories').insert(payload)
    if (result.error) {
      setError(`Kategori proyek gagal disimpan: ${result.error.message}`)
    } else {
      onDone(initial ? 'Kategori proyek berhasil diperbarui.' : 'Kategori proyek berhasil ditambahkan.')
    }
    setBusy(false)
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <Field label="Nama kategori" name="name" required defaultValue={initial?.title} />
    <Field label="Deskripsi" name="description" defaultValue={initial?.editData?.description ?? ''} />
    <p className="small muted">Kategori aktif akan tersedia pada pilihan saat membuat proyek.</p>
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

function AssignmentForm({ client, userId, project, users, onDone, onCancel }: FormProps & { project: Option; users: Option[] }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>(project.assignedIds ?? [])
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
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
    <div className="assignment-intro">
      <span className="assignment-intro-icon"><UsersRound size={19} /></span>
      <div><strong>Tentukan tim proyek</strong><p>Pilih staf yang bertanggung jawab mengerjakan proyek ini.</p></div>
      <span className="assignment-count">{selectedIds.length} dipilih</span>
    </div>
    {users.length > 0 ? <div className="assignment-list" role="group" aria-label="Daftar staf workshop">
      {users.map((user) => {
        const selected = selectedIds.includes(user.id)
        return <label className={`assignment-option ${selected ? 'assignment-option-selected' : ''}`} key={user.id}>
          <input type="checkbox" name="profile_ids" value={user.id} checked={selected} disabled={busy} onChange={() => setSelectedIds((current) => selected ? current.filter((id) => id !== user.id) : [...current, user.id])} />
          <span className="assignment-check" aria-hidden="true">{selected && <Check size={14} strokeWidth={2.5} />}</span>
          <span className="assignment-user-copy"><strong>{user.name}</strong><small>Staf Workshop</small></span>
          <span className="assignment-option-state">{selected ? 'Ditugaskan' : 'Pilih'}</span>
        </label>
      })}
    </div> : <div className="assignment-empty"><UsersRound size={22} /><strong>Belum ada staf aktif</strong><p>Tambahkan akun staf Workshop terlebih dahulu dari menu Staf Workshop.</p></div>}
    <p className="small muted">Perubahan penugasan langsung tersimpan ke proyek dan mengikuti policy akses database.</p>
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

function TransactionForm({ client, userId, projects, categories, initial, onDone, onCancel }: FormProps & { projects: Option[]; categories: Option[]; initial?: Row }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [today] = useState(localDateInputValue)
  const [type, setType] = useState<'income' | 'expense'>(initial?.editData?.transactionType ?? 'expense')
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
    const transactionPayload = {
      transaction_type: type,
      category_id: String(form.get('category_id') || '') || null,
      project_id: String(form.get('project_id') || '') || null,
      customer_id: String(form.get('customer_id') || '') || null,
      transaction_date: localDateTimeIso(String(form.get('transaction_date'))),
      amount: Number(form.get('amount')),
      description: String(form.get('description')).trim(),
    }
    const result = initial
      ? await client.from('transactions').update(transactionPayload).eq('id', initial.id)
      : await client.from('transactions').insert({ ...transactionPayload, recorded_by: userId })
    if (result.error) setError(`Transaksi gagal disimpan: ${result.error.message}`)
    else onDone(initial ? 'Transaksi manual berhasil diperbarui.' : 'Transaksi manual berhasil disimpan.')
    setBusy(false)
  }
  return <form className="form-stack" onSubmit={(event) => void save(event)}>
    <div className="field-group"><span className="field-label">Jenis transaksi</span><div className="segmented-control"><button type="button" className={type === 'income' ? 'segment-active' : ''} onClick={() => setType('income')}>Pemasukan</button><button type="button" className={type === 'expense' ? 'segment-active' : ''} onClick={() => setType('expense')}>Pengeluaran</button></div></div>
    {type === 'income' && <p className="form-hint">Untuk pemasukan dari pembayaran invoice, gunakan menu <strong>Pembayaran</strong> agar sisa tagihan invoice ikut diperbarui.</p>}
    <div className="form-grid"><SelectField label="Kategori" name="category_id" options={categories.filter((item) => item.extra === type && (item.id === initial?.editData?.categoryId || !item.name.toLowerCase().includes('invoice')))} required defaultValue={initial?.editData?.categoryId ?? ''} /><Field label="Nominal (Rp)" name="amount" type="number" min="1" required defaultValue={initial?.editData?.amount?.toString()} /></div>
    <div className="form-grid"><Field label="Tanggal" name="transaction_date" type="date" defaultValue={initial?.editData?.transactionDate ?? today} required /><SelectField label="Proyek terkait" name="project_id" options={projects} optionalLabel="Tanpa proyek" defaultValue={initial?.editData?.projectId ?? ''} /></div>
    <SelectField label="Pelanggan terkait" name="customer_id" options={customerOptions} optionalLabel="Tanpa pelanggan" defaultValue={initial?.editData?.customerId ?? ''} />
    <Field label="Keterangan" name="description" required defaultValue={initial?.title} />
    <FormFooter error={error} busy={busy} onCancel={onCancel} />
  </form>
}

interface PaymentReceiptData {
  invoiceNumber: string
  amount: number
  customerName: string
  customerPhone: string
  /** null when the balance could not be re-read after saving. */
  remainingAmount: number | null
  publicToken: string | null
}

function PaymentForm({ client, userId, invoices, signature, onRecorded, onDone, onCancel }: FormProps & { invoices: Option[]; signature: string; onRecorded: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [today] = useState(localDateInputValue)
  const [receipt, setReceipt] = useState<PaymentReceiptData | null>(null)

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const invoiceId = String(form.get('invoice_id'))
    const paidAmount = Number(form.get('amount'))

    const { error: rpcError } = await client.rpc('record_invoice_payment', {
      p_invoice_id: invoiceId,
      p_amount: paidAmount,
      p_paid_at: localDateTimeIso(String(form.get('paid_at'))),
      p_payment_method: String(form.get('payment_method')),
      p_reference_number: String(form.get('reference_number') || '') || null,
      p_notes: String(form.get('notes') || '') || null,
    })
    if (rpcError) {
      setError(`Pembayaran gagal dicatat: ${rpcError.message}`)
      setBusy(false)
      return
    }

    // The payment is committed: refresh the list now, so it is up to date however this dialog gets closed.
    onRecorded()

    // Fetch invoice & balance to prepare receipt confirmation
    const [invRes, balRes] = await Promise.all([
      client.from('invoices').select('invoice_number, public_token, token_revoked_at, customers(name, phone)').eq('id', invoiceId).maybeSingle(),
      client.from('invoice_balances').select('outstanding_amount').eq('id', invoiceId).maybeSingle(),
    ])

    const inv = invRes.data
    const cust = inv?.customers ? (Array.isArray(inv.customers) ? inv.customers[0] : inv.customers) : null
    if (inv) {
      setReceipt({
        invoiceNumber: inv.invoice_number,
        amount: paidAmount,
        customerName: cust?.name ?? '',
        customerPhone: cust?.phone ?? '',
        remainingAmount: balRes.data ? Number(balRes.data.outstanding_amount) : null,
        publicToken: inv.token_revoked_at ? null : inv.public_token,
      })
    } else {
      onDone('Pembayaran dan transaksi kas masuk berhasil dicatat.')
    }
    setBusy(false)
  }

  if (receipt) {
    const canSendWhatsApp = whatsAppNumber(receipt.customerPhone) !== null
    const sendWA = () => {
      openWhatsApp(receipt.customerPhone, paymentReceiptMessage({
        customerName: receipt.customerName,
        invoiceNumber: receipt.invoiceNumber,
        amount: receipt.amount,
        outstandingAmount: receipt.remainingAmount ?? undefined,
        url: receipt.publicToken ? publicInvoiceUrl(receipt.publicToken) : null,
        signature,
      }))
    }

    return (
      <div className="payment-receipt-view">
        <div className="payment-receipt-icon"><Check size={28} /></div>
        <h3>Pembayaran berhasil dicatat</h3>
        <p className="muted">Pembayaran telah masuk ke buku kas dan status invoice telah diperbarui.</p>
        <div className="payment-receipt-card">
          <p><span>Nomor invoice</span><strong>{receipt.invoiceNumber}</strong></p>
          <p><span>Pelanggan</span><strong>{receipt.customerName || '—'}</strong></p>
          <p><span>Nominal diterima</span><strong className="payment-receipt-amount">{currency(receipt.amount)}</strong></p>
          {receipt.remainingAmount !== null && <p><span>Sisa tagihan</span><strong>{receipt.remainingAmount > 0 ? currency(receipt.remainingAmount) : 'LUNAS'}</strong></p>}
        </div>
        <div className="payment-receipt-actions">
          {canSendWhatsApp ? (
            <button type="button" className="button button-wa-action button-wa-large" onClick={sendWA}>
              <MessageCircle size={16} /> Kirim bukti ke WhatsApp
            </button>
          ) : (
            <p className="small muted">Nomor WhatsApp pelanggan belum diisi atau tidak valid, jadi bukti tidak dapat dikirim dari sini.</p>
          )}
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Selesai
          </button>
        </div>
      </div>
    )
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [latestProgress, setLatestProgress] = useState<{ percent: number; stageName: string; date: string } | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    async function loadLatestProgress() {
      setLoadingHistory(true)
      const { data, error: fetchErr } = await client
        .from('project_progress')
        .select('progress_percent, stage_name, progress_date')
        .eq('project_id', project.id)
        // Progress only ever increases, so the highest entry is the current one.
        .order('progress_percent', { ascending: false })
        .limit(1)

      if (active) {
        if (fetchErr) {
          setError(`Progres terakhir gagal dimuat: ${fetchErr.message}`)
        } else if (data && data.length > 0) {
          setLatestProgress({
            percent: Number(data[0].progress_percent),
            stageName: data[0].stage_name,
            date: data[0].progress_date,
          })
        }
        setLoadingHistory(false)
      }
    }
    void loadLatestProgress()
    return () => {
      active = false
    }
  }, [client, project.id])

  const currentPercent = latestProgress?.percent ?? 0
  const isAlreadyComplete = currentPercent >= 100
  const minAllowed = Math.min(100, Number((currentPercent + 0.01).toFixed(2)))

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('File yang dipilih harus berupa gambar.')
      event.target.value = ''
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedPhoto(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError(null)
  }

  const handlePhotoRemove = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setSelectedPhoto(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const newPercent = Number(form.get('progress_percent'))

    const invalid = Number.isNaN(newPercent)
      ? 'Persentase progres tidak valid.'
      : newPercent > 100
        ? 'Persentase progres tidak boleh melebihi 100%.'
        : newPercent <= currentPercent
          ? `Persentase progres baru (${newPercent}%) harus lebih tinggi dari progres saat ini (${currentPercent}%).`
          : null
    if (invalid) {
      setError(invalid)
      setBusy(false)
      return
    }

    const { data, error: insertError } = await client.from('project_progress').insert({
      project_id: project.id,
      stage_name: String(form.get('stage_name')).trim(),
      progress_percent: newPercent,
      description: String(form.get('description') || '').trim() || null,
      created_by: userId,
    }).select('id').single()

    if (insertError) {
      setError(`Progres gagal disimpan: ${insertError.message}`)
      setBusy(false)
      return
    }

    if (selectedPhoto && selectedPhoto.size > 0) {
      let compressedPhoto: File
      try {
        compressedPhoto = await compressImage(selectedPhoto)
      } catch (compressionError) {
        onDone(`Progres tersimpan. Foto gagal dikompres: ${compressionError instanceof Error ? compressionError.message : 'format foto tidak didukung.'}`)
        setBusy(false)
        return
      }
      const ext = 'jpg'
      const path = `${project.id}/${crypto.randomUUID()}.${ext}`
      const upload = await client.storage.from('project-photos').upload(path, compressedPhoto, { contentType: 'image/jpeg', upsert: false })
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
    <div className="current-progress-banner">
      <div className="progress-banner-header">
        <div>
          <span className="progress-banner-label">Progres Proyek Saat Ini</span>
          {loadingHistory ? (
            <span className="progress-banner-stage">Memeriksa catatan progres...</span>
          ) : latestProgress ? (
            <span className="progress-banner-stage">Tahap terakhir: <strong>{latestProgress.stageName}</strong> ({date(latestProgress.date)})</span>
          ) : (
            <span className="progress-banner-stage">Belum ada catatan progres sebelumnya (0%)</span>
          )}
        </div>
        <strong className="progress-banner-percent">{currentPercent}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${Math.min(100, Math.max(0, currentPercent))}%` }} />
      </div>
    </div>

    {isAlreadyComplete && (
      <div className="form-success" role="status">
        Proyek ini sudah mencapai 100%, jadi tidak ada progres baru yang perlu dicatat. Ubah status proyek menjadi “Selesai” dari daftar proyek.
      </div>
    )}

    <Field label="Tahapan pekerjaan" name="stage_name" required placeholder="Contoh: Fabrikasi / Pengecatan / Finishing" />
    <Field
      label={currentPercent > 0 ? `Persentase progres baru (%) · harus lebih dari ${currentPercent}%` : 'Persentase progres baru (%)'}
      name="progress_percent"
      type="number"
      min={String(minAllowed)}
      max="100"
      step="0.01"
      placeholder={isAlreadyComplete ? 'Sudah 100%' : `${minAllowed} – 100`}
      required
    />
    <Field label="Catatan progres" name="description" placeholder="Rincian kegiatan yang telah diselesaikan..." />

    {!previewUrl ? (
      <label className="upload-field">
        <ImagePlus size={18} />
        <span>
          Foto dokumentasi (opsional)
          <small className="upload-hint">Otomatis diperkecil ke JPEG agar upload lebih ringan.</small>
        </span>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handlePhotoSelect}
        />
      </label>
    ) : (
      <div className="photo-preview-box">
        <img src={previewUrl} alt="Preview dokumentasi" className="photo-preview-img" />
        <div className="photo-preview-info">
          <strong>{selectedPhoto?.name}</strong>
          <small className="muted">Foto dokumentasi siap diunggah</small>
        </div>
        <button
          type="button"
          className="button button-secondary photo-remove-btn"
          onClick={handlePhotoRemove}
          title="Hapus foto ini"
        >
          <Trash2 size={14} /> Hapus
        </button>
      </div>
    )}

    {previewUrl && <Field label="Keterangan foto" name="caption" placeholder="Keterangan foto (opsional)" />}
    <FormFooter error={error} busy={busy} disabled={loadingHistory || isAlreadyComplete} onCancel={onCancel} />
  </form>
}

function Field({ label, name, type = 'text', required, min, max, step, minLength, maxLength, defaultValue, placeholder, autoComplete }: { label: string; name: string; type?: string; required?: boolean; min?: string; max?: string; step?: string; minLength?: number; maxLength?: number; defaultValue?: string; placeholder?: string; autoComplete?: string }) {
  return <label className="field-group"><span className="field-label">{label}{required && <i> *</i>}</span>
    <input name={name} type={type} required={required} min={min} max={max} step={step} minLength={minLength} maxLength={maxLength} defaultValue={defaultValue} placeholder={placeholder} autoComplete={autoComplete} />
  </label>
}

function SelectField({ label, name, options, required, optionalLabel, defaultValue = '' }: { label: string; name: string; options: Option[]; required?: boolean; optionalLabel?: string; defaultValue?: string }) {
  return <label className="field-group"><span className="field-label">{label}{required && <i> *</i>}</span>
    <select name={name} required={required} defaultValue={defaultValue}>
      <option value="">{required ? 'Pilih...' : optionalLabel ?? 'Pilih...'}</option>
      {options.map((option) => <option value={option.id} key={option.id}>{option.name}{option.extra ? ` · ${option.extra}` : ''}</option>)}
    </select>
  </label>
}

function FormFooter({ error, busy, disabled = false, onCancel }: { error: string | null; busy: boolean; disabled?: boolean; onCancel: () => void }) {
  return <div className="form-footer">
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Batal</button><button className="button button-primary" disabled={busy || disabled}>{busy ? 'Menyimpan...' : 'Simpan'}</button></div>
  </div>
}

function StatusBadge({ value, text }: { value: string; text: string }) {
  const safe = value.replace(/[^a-z0-9_-]/gi, '_')
  return <span className={`status-badge status-${safe}`}>{text}</span>
}
