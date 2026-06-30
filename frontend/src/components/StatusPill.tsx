import type { InvoiceStatus } from '../types'
import { CheckCircle, Clock, XCircle, AlertTriangle, Loader, ShieldCheck } from './icons'

interface Props {
  status: InvoiceStatus
  size?: 'sm' | 'md'
}

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  pending_extract: {
    label: 'Extracting',
    color: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
    icon: Loader,
  },
  needs_review: {
    label: 'Needs Review',
    color: 'bg-orange-500/10 text-orange-300 border border-orange-500/20',
    icon: AlertTriangle,
  },
  pending_approval: {
    label: 'Awaiting Approval',
    color: 'bg-blue-500/10 text-blue-300 border border-blue-500/20',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    color: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20',
    icon: CheckCircle,
  },
  signing: {
    label: 'Signing',
    color: 'bg-purple-500/10 text-purple-300 border border-purple-500/20',
    icon: Loader,
  },
  settled: {
    label: 'Settled',
    color: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
    icon: CheckCircle,
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-500/10 text-red-300 border border-red-500/20',
    icon: XCircle,
  },
  failed: {
    label: 'Failed',
    color: 'bg-red-500/10 text-red-300 border border-red-500/20',
    icon: XCircle,
  },
}

export default function StatusPill({ status, size = 'md' }: Props) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  const spinning = status === 'pending_extract' || status === 'signing'
  const sizeCls = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'

  return (
    <span className={`status-pill ${cfg.color} ${sizeCls}`}>
      <Icon
        width={size === 'sm' ? 11 : 13}
        height={size === 'sm' ? 11 : 13}
        className={spinning ? 'animate-spin' : ''}
      />
      {cfg.label}
    </span>
  )
}

// For the settlement progress tracker — a vertical timeline
export function SettlementTimeline({ status }: { status: InvoiceStatus }) {
  const steps = [
    { key: 'submitted', label: 'Invoice submitted', icon: FileTextIcon },
    { key: 'extracted', label: 'AI extraction', icon: CpuIcon },
    { key: 'approved', label: 'Human approval', icon: ShieldCheck },
    { key: 'signed', label: 'Signed on-chain', icon: LockIcon },
    { key: 'settled', label: 'Settled on XRPL', icon: CheckCircle },
  ]

  const statusOrder: InvoiceStatus[] = [
    'pending_extract',
    'needs_review',
    'pending_approval',
    'approved',
    'signing',
    'settled',
  ]
  const currentIdx = statusOrder.indexOf(status)

  const stepComplete = (stepKey: string) => {
    if (status === 'settled') return true
    if (status === 'rejected' || status === 'failed') return false
    const map: Record<string, number> = {
      submitted: 0,
      extracted: 1,
      approved: currentIdx >= 3 ? 3 : -1,
      signed: currentIdx >= 4 ? 4 : -1,
      settled: -1,
    }
    return map[stepKey] >= 0 && currentIdx >= map[stepKey]
  }

  const stepActive = (stepKey: string) => {
    if (status === 'pending_extract') return stepKey === 'extracted'
    if (status === 'pending_approval' || status === 'needs_review') return stepKey === 'approved'
    if (status === 'signing') return stepKey === 'signed'
    return false
  }

  return (
    <div className="space-y-1">
      {steps.map((step) => {
        const complete = stepComplete(step.key)
        const active = stepActive(step.key)
        const Icon = step.icon
        return (
          <div key={step.key} className="flex items-center gap-3 py-1.5">
            <div
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                complete
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : active
                    ? 'bg-accent-500/15 text-accent-400'
                    : 'bg-white/[0.04] text-slate-600'
              }`}
            >
              <Icon width={14} height={14} className={active ? 'animate-pulse' : ''} />
            </div>
            <span
              className={`text-sm ${
                complete ? 'text-slate-200' : active ? 'text-slate-200' : 'text-slate-500'
              }`}
            >
              {step.label}
            </span>
            {complete && (
              <span className="text-[10px] text-emerald-400/70 ml-auto">done</span>
            )}
            {active && (
              <span className="text-[10px] text-accent-400 ml-auto animate-pulse">in progress</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Local-only icon re-imports to avoid prop spread issues in the timeline
import { FileText as FileTextIcon, Cpu as CpuIcon, Lock as LockIcon } from './icons'
