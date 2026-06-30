import { useState, useCallback, useRef } from 'react'
import type { Invoice, StatusEvent, TxFinal } from './types'
import { streamSettlement } from './api'
import Header from './components/Header'
import Hero from './components/Hero'
import InvoiceInput from './components/InvoiceInput'
import InvoiceReview from './components/InvoiceReview'
import SettlementProgress from './components/SettlementProgress'
import AuditLog from './components/AuditLog'

type Phase = 'input' | 'review' | 'settling'

export default function App() {
  const [phase, setPhase] = useState<Phase>('input')
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [events, setEvents] = useState<StatusEvent[]>([])
  const [currentStatus, setCurrentStatus] = useState<string>('signing')
  const [txFinal, setTxFinal] = useState<TxFinal | undefined>(undefined)
  const [setError, setSetError] = useState<string | undefined>(undefined)
  const streamCancelled = useRef(false)

  const heroRef = useRef<HTMLDivElement>(null)

  const handleSubmitted = (inv: Invoice) => {
    setInvoice(inv)
    setPhase('review')
  }

  const handleApprove = (_invoice: Invoice, preflight: StatusEvent['tx_preflight']) => {
    // Merge preflight into events and start streaming
    setPhase('settling')
    setCurrentStatus('signing')
    setTxFinal(undefined)
    setSetError(undefined)
    setEvents([
      {
        status: 'signing',
        at: new Date().toISOString(),
        tx_preflight: preflight,
      },
    ])
    streamCancelled.current = false

    // Begin the mock SSE settlement stream
    streamSettlement((e) => {
      if (streamCancelled.current) return
      setEvents((prev) => [...prev, e])
      setCurrentStatus(e.status)
      if (e.tx_final) setTxFinal(e.tx_final)
      if (e.error) setSetError(e.error)
    }).catch(() => {
      if (!streamCancelled.current) {
        setSetError('Stream interrupted unexpectedly.')
        setCurrentStatus('failed')
      }
    })
  }

  const handleReject = () => {
    reset()
  }

  const reset = useCallback(() => {
    streamCancelled.current = true
    setPhase('input')
    setInvoice(null)
    setEvents([])
    setTxFinal(undefined)
    setSetError(undefined)
  }, [])

  const scrollToDemo = () => {
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero is always visible above the demo */}
        <div ref={heroRef}>
          <Hero onGetStarted={scrollToDemo} />
        </div>

        {/* Interactive demo */}
        <section className="max-w-3xl mx-auto px-6 pb-16" id="demo">
          {phase === 'input' && <InvoiceInput onSubmitted={handleSubmitted} />}

          {phase === 'review' && invoice && (
            <InvoiceReview
              invoice={invoice}
              onSettling={() => {}}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}

          {phase === 'settling' && (
            <SettlementProgress
              events={events}
              currentStatus={currentStatus}
              txFinal={txFinal}
              error={setError}
              onReset={reset}
            />
          )}
        </section>

        {/* Audit log (always visible, gives the page depth + proof) */}
        <AuditLog />
      </main>

      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.05] py-8 px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          SmartPay Agent · XRPL Testnet · Agentic Commerce
        </div>
        <div className="flex items-center gap-4">
          <span>Built with Workers AI · xrpl.js · Cloudflare</span>
        </div>
      </div>
    </footer>
  )
}
