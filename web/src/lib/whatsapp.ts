import { currency } from './format'

export const DEFAULT_COMPANY_SIGNATURE = 'CKM Workshop / CV Dua Putra Bersaudara'

/** Signature line for outgoing messages, built from company settings when available. */
export function companySignature(company: { company_name?: string | null; legal_entity?: string | null } | null | undefined) {
  const name = company?.company_name?.trim()
  const legal = company?.legal_entity?.trim()
  if (!name) return DEFAULT_COMPANY_SIGNATURE
  return legal && legal.toLocaleLowerCase('id-ID') !== name.toLocaleLowerCase('id-ID') ? `${name} / ${legal}` : name
}

/**
 * Normalises an Indonesian phone number to the international form wa.me expects
 * (digits only, no "+"). Accepts "0812…", "812…", "62812…", "+62 812-…".
 * Returns null when the result cannot be a valid number.
 */
export function whatsAppNumber(phone: string | null | undefined): string | null {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`
  else if (digits.startsWith('8')) digits = `62${digits}`
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

/** Opens a WhatsApp chat with a pre-filled message. Returns false when the number is unusable. */
export function openWhatsApp(phone: string | null | undefined, message: string): boolean {
  const number = whatsAppNumber(phone)
  if (!number) return false
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  return true
}

export const publicInvoiceUrl = (token: string) => `${window.location.origin}/invoice/${token}`

const greeting = (customerName: string | null | undefined) =>
  customerName?.trim() ? `Halo Bpk/Ibu *${customerName.trim()}*` : 'Halo Bpk/Ibu'

export function invoiceMessage(input: {
  customerName?: string | null
  invoiceNumber: string
  totalAmount: number
  outstandingAmount: number
  url: string
  signature: string
}) {
  const isPartlyPaid = input.outstandingAmount > 0 && input.outstandingAmount < input.totalAmount
  return [
    `${greeting(input.customerName)},`,
    '',
    `Berikut tagihan resmi untuk invoice *${input.invoiceNumber}* sebesar *${currency(input.totalAmount)}*.`,
    ...(isPartlyPaid ? [`Sisa tagihan saat ini: *${currency(input.outstandingAmount)}*.`] : []),
    '',
    'Rincian tagihan dan rekening pembayaran resmi dapat dilihat melalui tautan berikut:',
    input.url,
    '',
    'Terima kasih atas kepercayaannya,',
    `*${input.signature}*`,
  ].join('\n')
}

export function paymentReceiptMessage(input: {
  customerName?: string | null
  invoiceNumber: string
  amount: number
  paidOn?: string
  /** Omit when the remaining balance is unknown. */
  outstandingAmount?: number
  url?: string | null
  signature: string
}) {
  const lines = [
    `${greeting(input.customerName)}, terima kasih!`,
    '',
    `Pembayaran sebesar *${currency(input.amount)}* untuk invoice *${input.invoiceNumber}* telah kami terima${input.paidOn ? ` pada ${input.paidOn}` : ''}.`,
  ]
  if (input.outstandingAmount !== undefined) {
    lines.push(input.outstandingAmount > 0
      ? `Sisa tagihan saat ini: *${currency(input.outstandingAmount)}*.`
      : 'Tagihan ini sudah *LUNAS*.')
  }
  if (input.url) lines.push('', 'Rincian invoice dan riwayat pembayaran dapat dilihat di:', input.url)
  lines.push('', 'Terima kasih atas kepercayaannya,', `*${input.signature}*`)
  return lines.join('\n')
}
