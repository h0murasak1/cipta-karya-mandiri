import { currency, date, statusLabel } from './format'

interface ProjectReportPhoto {
  url: string
  caption: string | null
}

export interface ProjectReportData {
  projectCode: string
  title: string
  description: string | null
  location: string | null
  status: string
  startDate: string | null
  targetDate: string | null
  contractValue: number
  customerName: string
  customerAddress: string | null
  categoryName: string | null
  progress: {
    progressDate: string
    stageName: string
    progressPercent: number
    description: string | null
    photos: ProjectReportPhoto[]
  }[]
}

const escapeHtml = (value: string | number | null | undefined) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

export function openProjectReport(data: ProjectReportData, reportWindow: Window): void {
  const progressRows = data.progress.map((item) => `
    <article class="progress-entry">
      <div class="progress-heading">
        <div><strong>${escapeHtml(item.stageName)}</strong><span>${escapeHtml(date(item.progressDate))}</span></div>
        <b>${escapeHtml(item.progressPercent)}%</b>
      </div>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      ${item.photos.length > 0 ? `<div class="photo-grid">${item.photos.map((photo) => `<figure><img src="${escapeHtml(photo.url)}" alt=""><figcaption>${escapeHtml(photo.caption)}</figcaption></figure>`).join('')}</div>` : ''}
    </article>
  `).join('')

  reportWindow.document.open()
  reportWindow.document.write(`<!doctype html>
    <html lang="id"><head><meta charset="utf-8"><title>Laporan ${escapeHtml(data.projectCode)}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #242824; font: 13px Arial, sans-serif; line-height: 1.5; }
      header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid #b6531f; }
      h1 { margin: 0 0 4px; font-size: 24px; } h2 { margin: 26px 0 10px; font-size: 17px; }
      .eyebrow { margin: 0 0 6px; color: #b6531f; font-size: 11px; font-weight: 700; letter-spacing: .12em; }
      .meta { color: #68716b; text-align: right; } .meta strong { display: block; color: #242824; font-size: 15px; }
      .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 20px; }
      .summary div { padding: 11px; background: #f5f3ed; border-radius: 6px; } .summary span { display: block; color: #68716b; font-size: 11px; } .summary strong { display: block; margin-top: 3px; }
      .progress-entry { margin-top: 13px; padding: 13px; border: 1px solid #dfe3dd; border-radius: 7px; break-inside: avoid; }
      .progress-heading { display: flex; justify-content: space-between; gap: 16px; } .progress-heading div { display: grid; gap: 2px; } .progress-heading span { color: #68716b; font-size: 11px; } .progress-heading b { color: #b6531f; font-size: 17px; }
      .progress-entry p { margin: 9px 0 0; color: #4d554f; } .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 11px; }
      figure { margin: 0; } figure img { display: block; width: 100%; height: 150px; object-fit: cover; border-radius: 5px; } figcaption { margin-top: 3px; color: #68716b; font-size: 10px; }
      footer { margin-top: 28px; padding-top: 10px; color: #68716b; border-top: 1px solid #dfe3dd; font-size: 11px; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <header><div><p class="eyebrow">LAPORAN PENYELESAIAN PROYEK</p><h1>${escapeHtml(data.title)}</h1><div>${escapeHtml(data.projectCode)}</div></div><div class="meta"><strong>${escapeHtml(data.customerName)}</strong><span>${escapeHtml(statusLabel(data.status))}</span></div></header>
    <section class="summary">
      <div><span>Kategori</span><strong>${escapeHtml(data.categoryName || '—')}</strong></div>
      <div><span>Lokasi</span><strong>${escapeHtml(data.location || '—')}</strong></div>
      <div><span>Nilai kontrak</span><strong>${escapeHtml(currency(data.contractValue))}</strong></div>
      <div><span>Tanggal mulai</span><strong>${escapeHtml(date(data.startDate))}</strong></div>
      <div><span>Target selesai</span><strong>${escapeHtml(date(data.targetDate))}</strong></div>
      <div><span>Alamat pelanggan</span><strong>${escapeHtml(data.customerAddress || '—')}</strong></div>
    </section>
    ${data.description ? `<h2>Ringkasan pekerjaan</h2><p>${escapeHtml(data.description)}</p>` : ''}
    <h2>Riwayat progres dan dokumentasi</h2>
    ${progressRows || '<p>Belum ada catatan progres.</p>'}
    <footer>Dokumen dibuat pada ${escapeHtml(date(new Date().toISOString()))}. Gunakan dialog cetak browser untuk menyimpan sebagai PDF.</footer>
    </body></html>`)
  reportWindow.document.close()
  reportWindow.onload = () => reportWindow.setTimeout(() => reportWindow.print(), 250)
}
