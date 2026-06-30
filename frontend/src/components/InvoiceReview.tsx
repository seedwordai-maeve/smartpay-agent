import { useState } from 'react'
import type { Invoice } from '../types'
import { approveInvoice } from '../api'
import StatusPill from './StatusPill'
import {
  Check,
  X,
  ShieldCheck,
  AlertTriangle,
  Loader,
  Cpu,
  Wallet,
  Clock,
} from './icons'

interface Props {
  invoice: Invoice
  onSettling: (status: 'signing') => void
  onApprove: (invoice: Invoice, preflight: any) => void
  onReject: () => void
}

export default function InvoiceReview({ invoice, onSettling, onApprove, onReject }: Props) {
  const ext = invoice.extracted!
  const [editedAmount, setEditedAmount] = useState(ext.amount)
  const [editedWallet, setEditedWallet] = useState(ext.payee_wallet)
  const [approving, setApproving] = useState(false)
  const [hasEdits, setHasEdits] = useState(false)

  const isEdited = hasEdits && (editedAmount !== ext.amount || editedWallet !== ext.payee_wallet)

  const handleApprove = async () => {
    setApproving(true)
    try {
      onSettling('signing')
      const { preflight } = await approveInvoice(invoice.id, invoice.submitter, {
        edited_amount: isEdited ? editedAmount : undefined,
        edited_wallet: isEdited ? editedWallet : undefined,
      })
      onApprove(invoice, preflight)
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="glass p-6 md:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu width={16} height={16} className="text-accent-400" />
            <h2 className="text-lg font-bold text-white">Review &amp; approve</h2>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            {invoice.id} · submitted by {invoice.submitter}
          </p>
        </div>
        <StatusPill status={invoice.status} />
      </div>

      {/* Confidence + raw */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
            AI confidence
          </div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white font-mono">
              {Math.round(ext.confidence * 100)}%
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  ext.confidence >= 0.9
                    ? 'bg-emerald-400'
                    : ext.confidence >= 0.8
                      ? 'bg-amber-400'
                      : 'bg-orange-400'
                }`}
                style={{ width: `${ext.confidence * 100}%` }}
              />
            </div>
          </div>
        </div>
        <div className="px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
            Invoice number
          </div>
          <div className="text-lg font-bold text-white font-mono">{ext.invoice_number}</div>
        </div>
      </div>

      {/* Extracted fields */}
      <div className="space-y-4 mb-6">
        <FieldRow label="Payee" value={ext.payee_name} />

        <div>
          <label className="label flex items-center gap-1.5">
            <Wallet width={11} height={11} />
            Payee wallet
            {isEdited && editedWallet !== ext.payee_wallet && (
              <span className="text-accent-400 normal-case tracking-normal">(edited)</span>
            )}
          </label>
          <input
            type="text"
            value={editedWallet}
            onChange={(e) => {
              setEditedWallet(e.target.value)
              setHasEdits(true)
            }}
            className="input-field font-mono text-xs"
          />
          {invoice.validation && (
            <div className="flex items-center gap-3 mt-1.5 text-xs">
              <span
                className={`flex items-center gap-1 ${
                  invoice.validation.wallet_exists ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {invoice.validation.wallet_exists ? (
                  <Check width={11} height={11} />
                ) : (
                  <X width={11} height={11} />
                )}
                {invoice.validation.wallet_exists ? 'Wallet verified' : 'Wallet not found'}
              </span>
              {ext.currency === 'RLUSD' && (
                <span
                  className={`flex items-center gap-1 ${
                    invoice.validation.trustline_present ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {invoice.validation.trustline_present ? (
                    <Check width={11} height={11} />
                  ) : (
                    <AlertTriangle width={11} height={11} />
                  )}
                  {invoice.validation.trustline_present ? 'RLUSD trustline OK' : 'No RLUSD trustline'}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className="label flex items-center gap-1.5">
              Amount
              {isEdited && editedAmount !== ext.amount && (
                <span className="text-accent-400 normal-case tracking-normal">(edited)</span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editedAmount}
                onChange={(e) => {
                  setEditedAmount(e.target.value)
                  setHasEdits(true)
                }}
                className="input-field font-mono"
              />
              <div className="px-3 py-2.5 rounded-xl bg-ripple-500/10 border border-ripple-500/20 text-ripple-400 text-xs font-bold flex items-center min-w-[70px] justify-center">
                {ext.currency}
              </div>
            </div>
          </div>
          <div>
            <div className="label flex items-center gap-1.5">
              <Clock width={11} height={11} />
              Due date
            </div>
            <div className="input-field font-mono bg-ink-850/50 cursor-default">
              {ext.due_date || '—'}
            </div>
          </div>
          <div>
            <div className="label">Currency</div>
            <div className="input-field bg-ink-850/50 cursor-default">{ext.currency}</div>
          </div>
        </div>
      </div>

      {/* Line items */}
      {ext.line_items && ext.line_items.length > 0 && (
        <div className="mb-6">
          <div className="label mb-2">Line items</div>
          <div className="rounded-xl border border-white/[0.05] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.02] text-slate-500">
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-right px-3 py-2 font-medium">Qty</th>
                  <th className="text-right px-3 py-2 font-medium">Unit</th>
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {ext.line_items.map((li, i) => (
                  <tr key={i} className="border-t border-white/[0.04]">
                    <td className="px-3 py-2 text-slate-300">{li.description}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{li.quantity}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">${li.unit_price}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-200">${li.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warnings */}
      {invoice.validation && invoice.validation.warnings.length > 0 && (
        <div className="mb-6 space-y-2">
          {invoice.validation.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/15 text-amber-200 text-xs"
            >
              <AlertTriangle width={14} height={14} className="mt-0.5 flex-shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Approval gate */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-accent-500/[0.05] border border-accent-500/15 mb-4">
        <ShieldCheck width={16} height={16} className="text-accent-400 flex-shrink-0" />
        <span className="text-xs text-slate-300">
          Approving will sign and submit a real RLUSD payment on XRPL Testnet. Review carefully.
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleApprove}
          disabled={approving}
          className="btn-primary flex-1 h-12"
        >
          {approving ? (
            <>
              <Loader width={16} height={16} />
              Preparing transaction…
            </>
          ) : (
            <>
              <Check width={16} height={16} />
              Approve &amp; settle {editedAmount} {ext.currency}
            </>
          )}
        </button>
        <button onClick={onReject} disabled={approving} className="btn-danger h-12 sm:w-32">
          <X width={16} height={16} />
          Reject
        </button>
      </div>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-slate-200">{value}</div>
    </div>
  )
}
