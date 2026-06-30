import { useEffect, useState } from 'react'
import { getAuditLog } from '../api'
import type { AuditEntry } from '../types'
import StatusPill from './StatusPill'
import { Layers, ExternalLink } from './icons'

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAuditLog(8).then((e) => {
      setEntries(e)
      setLoading(false)
    })
  }, [])

  return (
    <section className="max-w-7xl mx-auto px-6 py-12">
      <div className="flex items-center gap-2 mb-6">
        <Layers width={18} height={18} className="text-accent-400" />
        <h2 className="text-lg font-bold text-white">Recent settlements</h2>
        <span className="text-xs text-slate-500 ml-2">on-ledger audit trail</span>
      </div>

      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.02] text-slate-500 text-xs">
              <th className="text-left px-5 py-3 font-medium">Vendor</th>
              <th className="text-left px-5 py-3 font-medium">Amount</th>
              <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">Status</th>
              <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Settled</th>
              <th className="text-left px-5 py-3 font-medium hidden lg:table-cell">Transaction</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-white/[0.04]">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3.5 rounded bg-white/[0.04] animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-200">{e.payee_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{e.id}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-slate-200">{e.amount}</span>{' '}
                      <span className="text-xs text-ripple-400">{e.currency}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <StatusPill status={e.status} size="sm" />
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate-400">
                      {e.settled_at
                        ? new Date(e.settled_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      {e.tx_hash ? (
                        <span className="font-mono text-xs text-slate-400">
                          {e.tx_hash.slice(0, 12)}…{e.tx_hash.slice(-6)}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {e.tx_hash && (
                        <a
                          href={`https://testnet.xrpl.org/transactions/${e.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300 transition-colors"
                        >
                          <ExternalLink width={11} height={11} />
                          <span className="hidden sm:inline">View</span>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
