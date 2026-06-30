import type {
  Invoice,
  StatusEvent,
  WalletBalance,
  AuditEntry,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Production API — calls the Cloudflare Worker backend.
// In development, set VITE_API_URL to your local wrangler dev URL.
// ─────────────────────────────────────────────────────────────────────────────

declare const __VITE_API_URL__: string
const API_URL = __VITE_API_URL__ || ''

const TESTNET_EXPLORER = 'https://testnet.xrpl.org/transactions'

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

// ─── Public API (REST contract matching DESIGN.md §5) ────────────────────────

interface InvoiceCreateResponse {
  id: string
  status: string
  submitted_at: string
  raw_url: string | null
  poll_url: string
}

export async function submitInvoice(
  text: string,
  submitter: string,
): Promise<Invoice> {
  const res = await api<InvoiceCreateResponse>('/v1/invoices', {
    method: 'POST',
    body: JSON.stringify({ text, submitter }),
  })

  // The backend creates the invoice + extracts + validates in one shot.
  // Poll for the latest status to get extracted + validation fields.
  const invoice = await api<Invoice>(`/v1/invoices/${res.id}`)

  return {
    ...invoice,
    raw_text: text,
    submitter,
  }
}

export async function approveInvoice(
  id: string,
  approver: string,
  edits?: { edited_amount?: string; edited_wallet?: string },
): Promise<{ id: string; status: 'signing'; preflight?: StatusEvent['tx_preflight'] }> {
  return api(`/v1/invoices/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approver, ...edits }),
  })
}

// ── SSE settlement stream (real SSE from GET /v1/invoices/:id/events) ──────
export async function streamSettlement(
  onEvent: (e: StatusEvent) => void,
  opts: { invoiceId?: string } = {},
): Promise<void> {
  const invoiceId = opts.invoiceId
  if (!invoiceId) {
    // Fallback for development without a real invoice ID — no-op
    return
  }

  const res = await fetch(`${API_URL}/v1/invoices/${invoiceId}/events`)
  if (!res.ok || !res.body) {
    onEvent({ status: 'failed', at: new Date().toISOString(), error: 'Failed to connect to event stream' })
    return
  }

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
        try {
          const data = JSON.parse(line.slice(6))
          onEvent(data as StatusEvent)
        } catch {
          // ignore malformed SSE data
        }
      }
    }
  }
}

// ── Wallet balance (GET /v1/wallet/balance) ──────────────────────────────────
export async function getWalletBalance(): Promise<WalletBalance> {
  return api<WalletBalance>('/v1/wallet/balance')
}

// ── Audit log (GET /v1/audit) ────────────────────────────────────────────────
interface AuditResponse {
  items: AuditEntry[]
  next_cursor: string | null
}

export async function getAuditLog(limit = 50): Promise<AuditEntry[]> {
  const res = await api<AuditResponse>(`/v1/audit?limit=${limit}`)
  return res.items
}

export function explorerUrl(txHash: string): string {
  return `${TESTNET_EXPLORER}/${txHash}`
}

// ── Sample invoices for the "try an example" buttons ─────────────────────────
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
