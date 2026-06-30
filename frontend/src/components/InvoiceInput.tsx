import { useState } from 'react'
import { SAMPLE_INVOICES, submitInvoice } from '../api'
import type { Invoice } from '../types'
import { Send, Loader, FileText, Sparkles } from './icons'

interface Props {
  onSubmitted: (invoice: Invoice) => void
}

export default function InvoiceInput({ onSubmitted }: Props) {
  const [text, setText] = useState('')
  const [submitter, setSubmitter] = useState('alice@example.com')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('Paste an invoice or payment instruction first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const inv = await submitInvoice(text, submitter)
      onSubmitted(inv)
    } catch {
      setError('Failed to submit invoice. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSample = (sampleText: string) => {
    setText(sampleText)
    setError(null)
  }

  return (
    <div className="glass p-6 md:p-8 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <FileText width={18} height={18} className="text-accent-400" />
        <h2 className="text-lg font-bold text-white">Submit an invoice</h2>
      </div>
      <p className="text-sm text-slate-400 mb-5">
        Paste an invoice or write a payment instruction in plain English. The agent will extract the
        payment details using AI.
      </p>

      {/* Sample buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs text-slate-500 flex items-center gap-1 mr-1">
          <Sparkles width={11} height={11} />
          Try:
        </span>
        {SAMPLE_INVOICES.map((s, i) => (
          <button
            key={i}
            onClick={() => handleSample(s.text)}
            className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Invoice textarea */}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`e.g.\n\nInvoice INV-2026-0417\nFrom: Acme Suppliers Ltd\nAmount: $1,250.00\nPay to: rD8sEimQjrmzqXryQYsbqzLGw3Y9X3yF1Y\nDue: 2026-07-15\nSettle in RLUSD`}
          rows={9}
          className="input-field font-mono text-xs resize-y leading-relaxed"
          disabled={loading}
        />
      </div>

      {/* Submitter + submit */}
      <div className="flex flex-col sm:flex-row gap-3 mt-4 items-stretch sm:items-end">
        <div className="flex-1">
          <label className="label">Submitter (for audit)</label>
          <input
            type="email"
            value={submitter}
            onChange={(e) => setSubmitter(e.target.value)}
            className="input-field"
            placeholder="you@company.com"
            disabled={loading}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading || !text.trim()}
          className="btn-primary h-[42px] min-w-[160px]"
        >
          {loading ? (
            <>
              <Loader width={15} height={15} />
              Extracting…
            </>
          ) : (
            <>
              <Send width={15} height={15} />
              Submit to agent
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
          {error}
        </div>
      )}
    </div>
  )
}
