// Types matching the SmartPay Agent API contract (DESIGN.md §5)

export type InvoiceStatus =
  | 'pending_extract'
  | 'pending_approval'
  | 'approved'
  | 'signing'
  | 'settled'
  | 'rejected'
  | 'failed'
  | 'needs_review'

export interface ExtractedInvoice {
  payee_name: string
  payee_wallet: string
  amount: string
  currency: 'RLUSD' | 'XRP'
  due_date: string
  invoice_number: string
  line_items?: LineItem[]
  confidence: number
}

export interface LineItem {
  description: string
  quantity: number
  unit_price: string
  total: string
}

export interface ValidationInfo {
  wallet_exists: boolean
  trustline_present: boolean
  warnings: string[]
}

export interface TxFinal {
  tx_hash: string
  ledger_index: number
  sequence: number
  fee: string
  settled_at: string
}

export interface Invoice {
  id: string
  status: InvoiceStatus
  submitted_at: string
  submitter: string
  raw_text: string
  extracted?: ExtractedInvoice
  validation?: ValidationInfo
  tx_final?: TxFinal
  reject_reason?: string
}

export interface WalletBalance {
  address: string
  network: string
  xrp_balance: string
  rlusd_balance: string
  trustlines: { currency: string; issuer: string; balance: string }[]
}

export interface AuditEntry {
  id: string
  payee_name: string
  amount: string
  currency: string
  status: InvoiceStatus
  submitted_at: string
  settled_at?: string
  tx_hash?: string
  approver?: string
}

// SSE-style event the mock backend emits
export interface StatusEvent {
  status: InvoiceStatus
  at: string
  tx_preflight?: {
    fee: string
    sequence: number
    last_ledger_sequence: number
    signed_preview_hash: string
  }
  tx_final?: TxFinal
  error?: string
  xrpl_code?: string
}
