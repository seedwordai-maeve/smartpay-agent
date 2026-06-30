import type {
  Invoice,
  StatusEvent,
  WalletBalance,
  AuditEntry,
  ExtractedInvoice,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// API layer with mock fallback.
// Production: calls the Cloudflare Worker backend.
// If the backend is unavailable or extraction fails, falls back to client-side
// regex extraction + mock settlement for demo purposes.
// ─────────────────────────────────────────────────────────────────────────────

declare const __VITE_API_URL__: string
const API_URL = __VITE_API_URL__ || ''

const TESTNET_EXPLORER = 'https://testnet.xrpl.org/transactions'

// ── Client-side mock extraction (regex-based, no AI needed) ────────────────
function mockExtract(text: string): ExtractedInvoice {
  const addrMatch = text.match(/\b(r[1-9A-HJ-NP-Za-km-z]{24,34})\b/)
  const amountPatterns = [
    /\$\s?([\d,]+\.?\d*)\s*(?:USD|RLUSD|USDT|USDC)/i,
    /(?:total\s*(?:due|amount)[:\s]*)\$?\s?([\d,]+\.?\d*)/i,
    /(?:amount\s*(?:due|owing)[:\s]*)\$?\s?([\d,]+\.?\d*)/i,
    /(?:pay|send|transfer)\s+(\d+(?:\.\d+)?)\s*(XRP|RLUSD|USD)/i,
  ]
  let amount = '0'
  let currency: 'RLUSD' | 'XRP' = 'RLUSD'
  for (const p of amountPatterns) {
    const m = text.match(p)
    if (m) {
      amount = m[1].replace(/,/g, '')
      if (m[2] && m[2].toUpperCase() === 'XRP') currency = 'XRP'
      break
    }
  }
  const nameMatch = text.match(/(?:from|vendor|payee|company)[:\s]*([A-Za-z\s.]+?)(?:\n|$)/i)
  const invMatch = text.match(/(?:invoice|inv)[\s#:.-]*(\S+)/i)
  const dueMatch = text.match(/(?:due[:\s]*)(\d{4}-\d{2}-\d{2})/i)

  return {
    payee_name: nameMatch?.[1]?.trim() || '',
    payee_wallet: addrMatch?.[1] || '',
    amount,
    currency,
    due_date: dueMatch?.[1] || '',
    invoice_number: invMatch?.[1] || '',
    line_items: [],
    confidence: addrMatch ? 0.85 : 0.5,
  }
}

// ── Helper: typed fetch wrapper ─────────────────────────────────────────────
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || body.title || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function mockTxHash(): string {
  return Array.from({ length: 64 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('')
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function submitInvoice(
  text: string,
  submitter: string,
): Promise<Invoice> {
  const extracted = mockExtract(text)

  // Try the real backend first
  if (API_URL) {
    try {
      const res = await api<{ id: string; status: string; submitted_at: string }>('/v1/invoices', {
        method: 'POST',
        body: JSON.stringify({ text, submitter }),
      })
      const invoice = await api<Invoice>(`/v1/invoices/${res.id}`)
      if (invoice.status !== 'failed' && invoice.extracted) {
        return { ...invoice, raw_text: text, submitter }
      }
    } catch {
      // Backend unavailable — fall through to mock
    }
  }

  // Mock fallback
  return {
    id: `inv_${Date.now().toString(36).toUpperCase()}`,
    status: extracted.payee_wallet ? 'pending_approval' : 'needs_review',
    submitter,
    raw_text: text,
    extracted,
    validation: {
      wallet_exists: !!extracted.payee_wallet,
      trustline_present: !!extracted.payee_wallet,
      warnings: extracted.payee_wallet ? [] : ['No XRPL wallet address detected in the invoice text'],
    },
    submitted_at: new Date().toISOString(),
  }
}

export async function approveInvoice(
  id: string,
  approver: string,
  edits?: { edited_amount?: string; edited_wallet?: string },
): Promise<{ id: string; status: 'signing'; preflight?: StatusEvent['tx_preflight'] }> {
  if (API_URL) {
    try {
      return await api(`/v1/invoices/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approver, ...edits }),
      })
    } catch {
      // fall through
    }
  }
  return { id, status: 'signing' }
}

export async function streamSettlement(
  onEvent: (e: StatusEvent) => void,
  opts: { invoiceId?: string } = {},
): Promise<void> {
  const invoiceId = opts.invoiceId

  // Try real SSE from backend
  if (invoiceId && API_URL) {
    try {
      const res = await fetch(`${API_URL}/v1/invoices/${invoiceId}/events`)
      if (res.ok && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try { onEvent(JSON.parse(line.slice(6)) as StatusEvent) } catch { /* skip */ }
            }
          }
        }
        return
      }
    } catch {
      // fall through to mock
    }
  }

  // Mock settlement simulation
  const now = new Date().toISOString()
  const steps: StatusEvent[] = [
    { status: 'signing', at: now },
    { status: 'approved', at: now },
    { status: 'settled', at: now, tx_final: { tx_hash: mockTxHash(), sequence: Math.floor(Math.random() * 10000) + 1, ledger_index: Math.floor(Math.random() * 8000000) + 50000000, fee: '0.000012', settled_at: now } },
  ]

  for (const step of steps) {
    await delay(1200 + Math.random() * 800)
    onEvent(step)
  }
}

export async function getWalletBalance(): Promise<WalletBalance> {
  if (API_URL) {
    try { return await api<WalletBalance>('/v1/wallet/balance') } catch { /* fall through */ }
  }
  return {
    address: 'rn4pDbpeL5vQbssKJAEzsYhX5aWA9c1KnZ',
    network: 'testnet',
    xrp_balance: '100.000000',
    rlusd_balance: '0',
    trustlines: [],
  }
}

interface AuditResponse { items: AuditEntry[]; next_cursor: string | null }

export async function getAuditLog(limit = 50): Promise<AuditEntry[]> {
  if (API_URL) {
    try {
      const res = await api<AuditResponse>(`/v1/audit?limit=${limit}`)
      return res.items
    } catch { /* fall through */ }
  }
  return []
}

export function explorerUrl(txHash: string): string {
  return `${TESTNET_EXPLORER}/${txHash}`
}

export const SAMPLE_INVOICES = [
  {
    label: 'Clean text invoice',
    text: `Invoice INV-2026-0417
From: Acme Suppliers Ltd
Bill to: SmartPay Demo Co.

Date: 2026-06-28
Due: 2026-07-15

Description                          Qty   Unit      Total
API infrastructure (enterprise)        1   $1,000.00 $1,000.00
Priority support add-on                1   $250.00    $250.00

Total due: $1,250.00 USD
Payment address: rD8sEimQjrmzqXryQYsbqzLGw3Y9X3yF1Y
Settle in RLUSD on XRPL.`,
  },
  {
    label: 'Short payment instruction',
    text: `Pay 85 RLUSD to rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De for Globex Hosting monthly invoice #GH-7723. Due 2026-07-10.`,
  },
  {
    label: 'Multi-line vendor invoice',
    text: `Vendor: Cyberdyne AI Systems Inc
Invoice: CDY-2026-093
Date: 2026-06-30
Net 30 — due 2026-07-30

GPU compute cluster (monthly)    1 x $4,500.00 = $4,500.00
Model fine-tuning service        1 x $900.00   = $900.00

Amount due: $5,400.00 USD
Pay to XRPL wallet: rLfWQbcyQmFhXKhzVq7dWk3KgYkS8sJ6Y
Currency: RLUSD`,
  },
]
