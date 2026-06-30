import type { StatusEvent, TxFinal } from '../types'
import { explorerUrl } from '../api'
import { SettlementTimeline } from './StatusPill'
import { CheckCircle, XCircle, ExternalLink, Copy, Loader, AlertTriangle } from './icons'
import { useState } from 'react'

interface Props {
  events: StatusEvent[]
  currentStatus: string
  txFinal?: TxFinal
  error?: string
  onReset: () => void
}

export default function SettlementProgress({
  events,
  currentStatus,
  txFinal,
  error,
  onReset,
}: Props) {
  const isSettled = currentStatus === 'settled'
  const isFailed = currentStatus === 'failed'
  const [copied, setCopied] = useState(false)

  const copyHash = () => {
    if (!txFinal?.tx_hash) return
    navigator.clipboard.writeText(txFinal.tx_hash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="glass p-6 md:p-8 animate-fade-in">
      {/* Status header */}
      <div className="flex items-center gap-3 mb-6">
        {isSettled ? (
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle width={24} height={24} className="text-emerald-400" />
          </div>
        ) : isFailed ? (
          <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center">
            <XCircle width={24} height={24} className="text-red-400" />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <Loader width={22} height={22} className="text-purple-300 animate-spin" />
          </div>
        )}
        <div>
          <div className="text-lg font-bold text-white">
            {isSettled
              ? 'Settlement confirmed'
              : isFailed
                ? 'Settlement failed'
                : 'Settling on XRPL…'}
          </div>
          <div className="text-xs text-slate-400">
            {isSettled
              ? 'Payment finalized on-ledger'
              : isFailed
                ? 'The transaction was rejected by the ledger'
                : 'Signing and submitting to Testnet'}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="mb-6 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
        <SettlementTimeline status={currentStatus as any} />
      </div>

      {/* Preflight / tx details */}
      {!isFailed && events.length > 0 && (
        <div className="space-y-2 mb-6">
          {events
            .filter((e) => e.tx_preflight)
            .map((e, i) => (
              <div
                key={i}
                className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]"
              >
                <Detail label="Network fee" value={`${e.tx_preflight!.fee} XRP`} />
                <Detail label="Sequence" value={String(e.tx_preflight!.sequence)} mono />
                <Detail
                  label="Last ledger"
                  value={String(e.tx_preflight!.last_ledger_sequence)}
                  mono
                />
                <Detail label="Preview hash" value={`${e.tx_preflight!.signed_preview_hash.slice(0, 10)}…`} mono />
              </div>
            ))}
        </div>
      )}

      {/* Settlement result */}
      {isSettled && txFinal && (
        <div className="space-y-3">
          {/* Big success block */}
          <div className="px-5 py-4 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-emerald-300 font-semibold uppercase tracking-wider">
                Transaction hash
              </div>
              <button
                onClick={copyHash}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                {copied ? <CheckCircle width={11} height={11} /> : <Copy width={11} height={11} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="font-mono text-sm text-white break-all leading-relaxed">
              {txFinal.tx_hash}
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-emerald-500/10">
              <Detail label="Ledger" value={`#${txFinal.ledger_index.toLocaleString()}`} mono />
              <Detail label="Sequence" value={String(txFinal.sequence)} mono />
              <Detail label="Fee" value={`${txFinal.fee} XRP`} mono />
            </div>
          </div>

          {/* Explorer link */}
          <a
            href={explorerUrl(txFinal.tx_hash)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full px-5 py-3.5 rounded-xl bg-accent-500/10 border border-accent-500/20 hover:bg-accent-500/15 hover:border-accent-500/30 transition-all group"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-accent-300">
              <ExternalLink width={15} height={15} />
              View on XRPL Testnet Explorer
            </span>
            <span className="text-accent-400 group-hover:translate-x-0.5 transition-transform">→</span>
          </a>
        </div>
      )}

      {/* Failure details */}
      {isFailed && error && (
        <div className="px-5 py-4 rounded-xl bg-red-500/[0.05] border border-red-500/20 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle width={16} height={16} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-red-200 mb-1">On-ledger rejection</div>
              <div className="text-xs text-red-300/80 font-mono">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Event log (collapsible-ish, always shown) */}
      <details className="mt-6 group">
        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition-colors select-none flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
          Event log ({events.length} {events.length === 1 ? 'event' : 'events'})
        </summary>
        <div className="mt-3 space-y-1.5">
          {events.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs"
            >
              <span className="font-mono text-slate-500">{new Date(e.at).toLocaleTimeString()}</span>
              <span
                className={`px-1.5 py-0.5 rounded font-mono font-semibold ${
                  e.status === 'settled'
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : e.status === 'failed'
                      ? 'bg-red-500/10 text-red-300'
                      : 'bg-purple-500/10 text-purple-300'
                }`}
              >
                {e.status}
              </span>
              {e.tx_final && (
                <span className="text-slate-500 font-mono truncate">
                  tx={e.tx_final.tx_hash.slice(0, 16)}…
                </span>
              )}
            </div>
          ))}
        </div>
      </details>

      {/* Reset */}
      <button onClick={onReset} className="btn-ghost w-full mt-6 h-11">
        Submit another invoice
      </button>
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}
