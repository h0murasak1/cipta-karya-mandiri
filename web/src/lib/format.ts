export const currency = (amount: number | string | null | undefined) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(amount ?? 0))

export const date = (value: string | null | undefined) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed)
}

export const statusLabel = (value: string | null | undefined) => {
  const labels: Record<string, string> = {
    waiting_confirmation: 'Menunggu konfirmasi',
    waiting_work: 'Menunggu pengerjaan',
    in_progress: 'Dalam proses',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
    draft: 'Draft',
    issued: 'Belum dibayar',
    partially_paid: 'Dibayar sebagian',
    paid: 'Lunas',
    overdue: 'Terlambat',
  }
  return labels[value ?? ''] ?? value ?? '—'
}
