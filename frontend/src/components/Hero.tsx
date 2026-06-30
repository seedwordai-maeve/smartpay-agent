import { Sparkles, ShieldCheck, Zap, Eye, ArrowRight } from './icons'

export default function Hero({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="relative pt-16 pb-12 px-6">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.07] text-xs text-slate-400 mb-6 animate-fade-in">
          <Sparkles width={12} height={12} className="text-ripple-500" />
          Autonomous invoice settlement · Powered by XRPL + Workers AI
        </div>

        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight gradient-text leading-[1.05] mb-6 animate-slide-up">
          Settle any invoice.
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-ripple-400 via-accent-400 to-accent-500">
            In plain English.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10 animate-slide-up">
          Paste a natural-language invoice. The agent reads it, extracts the payment instruction,
          asks for your approval, and settles in RLUSD on the XRPL — with a full on-ledger audit trail.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-14 animate-slide-up">
          <button onClick={onGetStarted} className="btn-primary text-base px-6 py-3">
            Try the demo
            <ArrowRight width={16} height={16} />
          </button>
          <a
            href="https://testnet.xrpl.org"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost text-base px-6 py-3"
          >
            <Eye width={16} height={16} />
            View explorer
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            {
              icon: Sparkles,
              title: 'AI extraction',
              desc: 'Llama 3.1 8B reads free-text invoices via function calling — no templates.',
            },
            {
              icon: ShieldCheck,
              title: 'Human in the loop',
              desc: 'Every payment is previewed and approved before signing. Nothing moves blind.',
            },
            {
              icon: Zap,
              title: '3–5s finality',
              desc: 'Settles in RLUSD on XRPL Testnet with deterministic finality and audit Memos.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="glass glass-hover p-5 text-left"
            >
              <f.icon width={18} height={18} className="text-ripple-500 mb-3" />
              <div className="text-sm font-semibold text-white mb-1">{f.title}</div>
              <div className="text-xs text-slate-400 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
