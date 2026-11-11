import { currency, date, statusLabel } from './format'

interface ProjectReportPhoto {
  url: string
  caption: string | null
}

export interface ProjectReportCompany {
  name: string
  legalEntity: string | null
  address: string | null
  phone: string | null
  email: string | null
}

export interface ProjectReportData {
  /** Letterhead. Falls back to a generic one when company settings are unavailable. */
  company?: ProjectReportCompany | null
  /** Hide the contract value for roles that must not see it. Defaults to true. */
  showContractValue?: boolean
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

const FALLBACK_COMPANY: ProjectReportCompany = {
  name: 'CKM Workshop',
  legalEntity: 'CV Dua Putra Bersaudara',
  address: null,
  phone: null,
  email: null,
}

const escapeHtml = (value: string | number | null | undefined) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const DAY_MS = 86_400_000

/** Calendar-day index in local time, so a date-only string and a timestamp compare fairly. */
function dayIndex(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.floor(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime() / DAY_MS)
}

const percentText = (value: number) => `${Number.isFinite(value) ? Number(value.toFixed(2)) : 0}%`
const clampPercent = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))

const STATUS_TONE: Record<string, string> = {
  completed: 'tone-success',
  in_progress: 'tone-active',
  cancelled: 'tone-danger',
}

const STYLES = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; padding: 24px 16px 48px; background: #efeae2; color: #26221c; font: 13px/1.55 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; }
  .sheet { max-width: 210mm; margin: 0 auto; padding: 16mm 15mm; background: #fff; border-radius: 4px; box-shadow: 0 10px 40px rgba(49, 39, 27, .14); }

  .toolbar { position: sticky; top: 12px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; max-width: 210mm; margin: 0 auto 16px; padding: 10px 14px; background: #fffdf8; border: 1px solid #e1d7c8; border-radius: 10px; box-shadow: 0 6px 20px rgba(49, 39, 27, .08); }
  .toolbar-actions { display: flex; gap: 8px; }
  .toolbar button { padding: 9px 16px; font: inherit; font-weight: 600; border: 1px solid transparent; border-radius: 7px; cursor: pointer; }
  .toolbar .primary { background: #e05a1d; color: #fff; }
  .toolbar .primary:hover { background: #c64b15; }
  .toolbar .primary:disabled { background: #e9b59c; cursor: progress; }
  .toolbar .ghost { background: #fff; color: #4f4b43; border-color: #d9cfc0; }
  .toolbar .ghost:hover { background: #f4eee3; }
  .toolbar-note { margin: 0; color: #7a7062; font-size: 12px; }

  .letterhead { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 12px; border-bottom: 3px solid #e05a1d; }
  .company-name { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: .01em; color: #2b2319; }
  .company-meta { margin: 2px 0 0; color: #7a7062; font-size: 11px; }
  .doc-tag { text-align: right; color: #7a7062; font-size: 11px; white-space: nowrap; }
  .doc-tag strong { display: block; color: #e05a1d; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }

  .title-block { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-top: 18px; }
  h1 { margin: 0; font-size: 23px; line-height: 1.25; color: #2b2319; }
  .code { display: inline-block; margin-top: 6px; padding: 2px 8px; background: #f3ece1; border-radius: 4px; color: #5a5043; font-size: 12px; font-weight: 600; letter-spacing: .02em; }
  .customer { text-align: right; }
  .customer small { display: block; color: #7a7062; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .customer strong { display: block; font-size: 15px; color: #2b2319; }
  .pill { display: inline-block; margin-top: 5px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; background: #efebe4; color: #5a5043; }
  .pill.tone-success { background: #e4f4e7; color: #1f6b2c; }
  .pill.tone-active { background: #fdefd8; color: #9a5a06; }
  .pill.tone-danger { background: #fde7e4; color: #a3352b; }

  .stats { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 10px; margin-top: 18px; }
  .stat { padding: 12px 14px; background: #fbf8f2; border: 1px solid #e8dfd2; border-radius: 9px; }
  .stat span { display: block; color: #7a7062; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .stat strong { display: block; margin-top: 2px; font-size: 20px; line-height: 1.2; color: #2b2319; }
  .stat small { display: block; margin-top: 2px; color: #7a7062; font-size: 11px; }
  .stat.highlight { background: #fff4ec; border-color: #f3cdb6; }
  .stat.highlight strong { color: #c64b15; }
  .bar { height: 6px; margin-top: 8px; overflow: hidden; background: #eadfd1; border-radius: 99px; }
  .bar i { display: block; height: 100%; background: #e05a1d; border-radius: inherit; }

  h2 { margin: 26px 0 10px; padding-bottom: 5px; border-bottom: 1px solid #e8dfd2; color: #2b2319; font-size: 14px; letter-spacing: .02em; break-after: avoid; }
  .details { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 28px; margin: 0; }
  .details div { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; border-bottom: 1px solid #f1eadf; }
  .details dt { flex: 0 0 auto; color: #7a7062; }
  .details dd { margin: 0; color: #2b2319; font-weight: 600; text-align: right; overflow-wrap: anywhere; }
  .details .note { display: block; color: #7a7062; font-size: 11px; font-weight: 500; }
  .details .note.late { color: #a3352b; }
  .details .note.ontime { color: #1f6b2c; }
  .prose { margin: 0; color: #453f36; white-space: pre-wrap; overflow-wrap: anywhere; }
  .empty { margin: 10px 0 0; color: #7a7062; font-style: italic; }

  .timeline { margin: 0; padding: 0; list-style: none; }
  .entry { position: relative; margin: 0 0 12px; padding: 12px 14px 13px 46px; background: #fffdfa; border: 1px solid #e8dfd2; border-radius: 9px; }
  .entry.no-photos, .entry-head { break-inside: avoid; }
  .entry-head { break-after: avoid; }
  .step { position: absolute; top: 12px; left: 13px; display: grid; width: 22px; height: 22px; place-items: center; background: #e05a1d; border-radius: 50%; color: #fff; font-size: 11px; font-weight: 700; }
  .entry-top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .entry-top strong { font-size: 14px; color: #2b2319; overflow-wrap: anywhere; }
  .entry-top b { flex: 0 0 auto; color: #c64b15; font-size: 15px; }
  .entry-date { color: #7a7062; font-size: 11px; }
  .entry .prose { margin-top: 8px; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-top: 11px; }
  figure { margin: 0; break-inside: avoid; }
  figure img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #f1eadf; border: 1px solid #e1d7c8; border-radius: 6px; }
  figcaption { margin-top: 3px; color: #68604f; font-size: 10.5px; overflow-wrap: anywhere; }

  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 34px; break-inside: avoid; }
  .signature { text-align: center; color: #5a5043; font-size: 12px; }
  .signature .line { height: 62px; margin: 0 18px 6px; border-bottom: 1px solid #8a8072; }
  .signature strong { display: block; color: #2b2319; }

  .doc-footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 30px; padding-top: 10px; border-top: 1px solid #e1d7c8; color: #7a7062; font-size: 10.5px; }

  @media (max-width: 640px) {
    .sheet { padding: 20px 16px; }
    .stats { grid-template-columns: 1fr 1fr; }
    .details { grid-template-columns: 1fr; }
    .photos { grid-template-columns: repeat(2, 1fr); }
    .title-block, .letterhead { flex-direction: column; align-items: flex-start; }
    .customer, .doc-tag { text-align: left; }
  }

  @media print {
    body { padding: 0; background: #fff; }
    .no-print { display: none !important; }
    .sheet { max-width: none; padding: 0; border-radius: 0; box-shadow: none; }
  }
`

// Runs inside the report window: print only once the photos have loaded (or failed),
// so the PDF is never saved with half-rendered images.
const PRINT_SCRIPT = `
  (function () {
    var button = document.getElementById('print-button');
    var note = document.getElementById('print-note');
    var images = Array.prototype.slice.call(document.images);
    var pending = images.length;
    var ready = false;
    function finish() {
      if (ready) return;
      ready = true;
      button.disabled = false;
      note.textContent = 'Pada dialog cetak, pilih tujuan "Simpan sebagai PDF".';
      window.focus();
      window.print();
    }
    function settle(image, failed) {
      if (failed) {
        var figure = image.closest('figure');
        if (figure) figure.remove();
      }
      pending -= 1;
      if (pending <= 0) finish();
    }
    button.addEventListener('click', function () { window.print(); });
    document.getElementById('close-button').addEventListener('click', function () { window.close(); });
    if (pending === 0) { finish(); return; }
    note.textContent = 'Memuat ' + pending + ' foto dokumentasi…';
    images.forEach(function (image) {
      if (image.complete) { settle(image, image.naturalWidth === 0); return; }
      image.addEventListener('load', function () { settle(image, false); });
      image.addEventListener('error', function () { settle(image, true); });
    });
    setTimeout(finish, 12000);
  })();
`

export function buildProjectReportHtml(data: ProjectReportData, generatedAt: Date = new Date()): string {
  const company = data.company?.name?.trim() ? data.company : FALLBACK_COMPANY
  const companyMeta = [company.legalEntity, company.address, company.phone, company.email]
    .map((part) => part?.trim())
    .filter((part) => part && part !== company.name.trim())
  const entries = data.progress ?? []
  const showContractValue = data.showContractValue ?? true

  const finalPercent = entries.reduce((highest, item) => Math.max(highest, clampPercent(item.progressPercent)), 0)
  const photoCount = entries.reduce((total, item) => total + (item.photos?.length ?? 0), 0)
  const firstEntry = entries[0]
  const lastEntry = entries[entries.length - 1]
  const completedOn = finalPercent >= 100 ? entries.find((item) => item.progressPercent >= 100)?.progressDate ?? null : null

  const startDay = dayIndex(data.startDate) ?? dayIndex(firstEntry?.progressDate)
  const endDay = dayIndex(completedOn ?? lastEntry?.progressDate)
  const durationDays = startDay !== null && endDay !== null && endDay >= startDay ? endDay - startDay + 1 : null

  const targetDay = dayIndex(data.targetDate)
  const completedDay = dayIndex(completedOn)
  const scheduleNote = targetDay === null || completedDay === null
    ? ''
    : completedDay <= targetDay
      ? `<span class="note ontime">${completedDay === targetDay ? 'Tepat pada target' : `${targetDay - completedDay} hari lebih cepat dari target`}</span>`
      : `<span class="note late">${completedDay - targetDay} hari melewati target</span>`

  const detail = (label: string, value: string, extra = '') =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}${extra}</dd></div>`

  const timeline = entries.map((item, index) => {
    const photos = item.photos ?? []
    return `
      <li class="entry${photos.length === 0 ? ' no-photos' : ''}">
        <span class="step">${index + 1}</span>
        <div class="entry-head">
          <div class="entry-top"><strong>${escapeHtml(item.stageName)}</strong><b>${escapeHtml(percentText(item.progressPercent))}</b></div>
          <div class="entry-date">${escapeHtml(date(item.progressDate))}</div>
          <div class="bar"><i style="width:${clampPercent(item.progressPercent)}%"></i></div>
        </div>
        ${item.description ? `<p class="prose">${escapeHtml(item.description)}</p>` : ''}
        ${photos.length > 0 ? `<div class="photos">${photos.map((photo) => `<figure><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.caption || `Dokumentasi ${item.stageName}`)}">${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}
      </li>`
  }).join('')

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Laporan Proyek ${escapeHtml(data.projectCode)} - ${escapeHtml(data.title)}</title>
<style>${STYLES}</style></head><body>
<div class="toolbar no-print">
  <div class="toolbar-actions">
    <button type="button" class="primary" id="print-button" disabled>Cetak / Simpan PDF</button>
    <button type="button" class="ghost" id="close-button">Tutup</button>
  </div>
  <p class="toolbar-note" id="print-note" role="status">Menyiapkan laporan…</p>
</div>
<main class="sheet">
  <div class="letterhead">
    <div>
      <p class="company-name">${escapeHtml(company.name)}</p>
      ${companyMeta.length > 0 ? `<p class="company-meta">${companyMeta.map((part) => escapeHtml(part)).join(' &middot; ')}</p>` : ''}
    </div>
    <div class="doc-tag"><strong>Laporan Penyelesaian Proyek</strong>Dibuat ${escapeHtml(date(generatedAt.toISOString()))}</div>
  </div>

  <div class="title-block">
    <div>
      <h1>${escapeHtml(data.title)}</h1>
      <span class="code">${escapeHtml(data.projectCode)}</span>
    </div>
    <div class="customer">
      <small>Pelanggan</small>
      <strong>${escapeHtml(data.customerName)}</strong>
      <span class="pill ${STATUS_TONE[data.status] ?? ''}">${escapeHtml(statusLabel(data.status))}</span>
    </div>
  </div>

  <section class="stats">
    <div class="stat highlight"><span>Progres akhir</span><strong>${escapeHtml(percentText(finalPercent))}</strong><div class="bar"><i style="width:${finalPercent}%"></i></div></div>
    <div class="stat"><span>Tahap tercatat</span><strong>${entries.length}</strong><small>pembaruan progres</small></div>
    <div class="stat"><span>Dokumentasi</span><strong>${photoCount}</strong><small>foto lapangan</small></div>
    <div class="stat"><span>Durasi</span><strong>${durationDays ?? '—'}</strong><small>${durationDays === null ? 'belum dapat dihitung' : 'hari kalender'}</small></div>
  </section>

  <h2>Informasi proyek</h2>
  <dl class="details">
    ${detail('Kategori', data.categoryName || '—')}
    ${detail('Lokasi pengerjaan', data.location || '—')}
    ${detail('Tanggal mulai', date(data.startDate))}
    ${detail('Target selesai', date(data.targetDate))}
    ${detail('Tanggal selesai', date(completedOn), scheduleNote)}
    ${showContractValue ? detail('Nilai kontrak', data.contractValue > 0 ? currency(data.contractValue) : '—') : ''}
    ${detail('Alamat pelanggan', data.customerAddress || '—')}
  </dl>

  ${data.description ? `<h2>Ringkasan pekerjaan</h2><p class="prose">${escapeHtml(data.description)}</p>` : ''}

  <h2>Riwayat progres &amp; dokumentasi lapangan</h2>
  ${timeline ? `<ol class="timeline">${timeline}</ol>` : '<p class="empty">Belum ada catatan progres untuk proyek ini.</p>'}

  <section class="signatures">
    <div class="signature"><div>Disiapkan oleh,</div><div class="line"></div><strong>${escapeHtml(company.name)}</strong></div>
    <div class="signature"><div>Diterima oleh,</div><div class="line"></div><strong>${escapeHtml(data.customerName)}</strong></div>
  </section>

  <div class="doc-footer">
    <span>${escapeHtml(data.projectCode)} &middot; dibuat otomatis pada ${escapeHtml(date(generatedAt.toISOString()))}</span>
    <span>${escapeHtml(company.name)}</span>
  </div>
</main>
<script>${PRINT_SCRIPT}</script>
</body></html>`
}

export function openProjectReport(data: ProjectReportData, reportWindow: Window): void {
  reportWindow.document.open()
  reportWindow.document.write(buildProjectReportHtml(data))
  reportWindow.document.close()
}
