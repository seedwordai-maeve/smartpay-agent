import { Logo, Wallet } from './icons'
import { getWalletBalance } from '../api'
import { useEffect, useState } from 'react'
import type { WalletBalance as WB } from '../types'

export default function Header() {
  const [bal, setBal] = useState<WB | null>(null)

  useEffect(() => {
    getWalletBalance().then(setBal)
  }, [])

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-ink-950/70 border-b border-white/[0.05]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-500/20 to-ripple-500/10 border border-white/[0.08] flex items-center justify-center">
            <Logo width={18} height={18} className="text-ripple-500" />
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-tight leading-none">SmartPay</div>
            <div className="text-[10px] text-slate-500 leading-none mt-0.5">Agent</div>
          </div>
          <span className="ml-3 status-pill bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-dot" />
            Testnet
          </span>
        </div>

        <div className="flex items-center gap-3">
          {bal && (
            <div className="hidden md:flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <Wallet width={15} height={15} className="text-slate-400" />
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-500">XRP</span>{' '}
                  <span className="font-semibold text-slate-200 font-mono">{bal.xrp_balance}</span>
                </div>
                <div className="w-px h-3 bg-white/[0.08]" />
                <div>
                  <span className="text-slate-500">RLUSD</span>{' '}
                  <span className="font-semibold text-ripple-400 font-mono">{bal.rlusd_balance}</span>
                </div>
              </div>
            </div>
          )}
          <a
            href="https://xrpl.org/docs"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost text-xs"
          >
            Docs
          </a>
        </div>
      </div>
    </header>
  )
}
