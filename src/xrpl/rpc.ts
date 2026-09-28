/**
 * A small JSON-RPC client for rippled over HTTPS. The Workers runtime has no long-lived
 * WebSocket to spare for a job that runs once a minute, and the commands Moments needs
 * (account_info, account_tx, account_objects, ledger_entry, tx, submit, fee, ledger_current,
 * server_info) are all plain requests. In the browser the URL is the Worker's /api/rpc proxy,
 * which forwards exactly these methods and no others (docs/v1.1.md §3).
 */
import { LedgerError, type Network } from './types.ts'

export const RPC_URLS: Record<Network, string> = {
  testnet: 'https://s.altnet.rippletest.net:51234',
  devnet: 'https://s.devnet.rippletest.net:51234',
  mainnet: 'https://xrplcluster.com',
}

export interface RpcOptions { url: string; fetch?: typeof fetch; timeoutMs?: number }

interface RpcEnvelope { result?: Record<string, unknown> & { status?: string; error?: string; error_message?: string; error_code?: number } }

export class XrplRpc {
  private readonly fetchFn: typeof fetch
  private readonly timeoutMs: number
  constructor(private readonly opts: RpcOptions) {
    // Never store the global fetch as a method: Workers reject it when called with a foreign `this`.
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init))
    this.timeoutMs = opts.timeoutMs ?? 15_000
  }

  /** Raw command. Throws LedgerError('network') on transport trouble and LedgerError('not_found' | 'invalid') on rippled errors. */
  async call<T extends Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    let res: Response
    try {
      res = await this.fetchFn(this.opts.url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params: [params] }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (e) { throw new LedgerError('network', `${method}: ${(e as Error).message}`, e) }
    if (!res.ok) throw new LedgerError('network', `${method}: HTTP ${res.status}`)
    const body = (await res.json().catch(() => null)) as RpcEnvelope | null
    const r = body?.result
    if (!r) throw new LedgerError('network', `${method}: malformed reply`)
    if (r.status === 'error' || r.error) {
      const code = r.error === 'entryNotFound' || r.error === 'txnNotFound' || r.error === 'actNotFound' ? 'not_found' : 'invalid'
      throw new LedgerError(code, `${method}: ${r.error ?? 'error'}${r.error_message ? ` — ${r.error_message}` : ''}`)
    }
    return r as T
  }

  async validatedLedgerIndex(): Promise<number> {
    const r = await this.call<{ info: { validated_ledger?: { seq: number } } }>('server_info')
    const seq = r.info.validated_ledger?.seq
    if (!seq) throw new LedgerError('network', 'server has no validated ledger')
    return seq
  }

  async accountSequence(account: string): Promise<number> {
    const r = await this.call<{ account_data: { Sequence: number } }>('account_info', { account, ledger_index: 'validated' })
    return r.account_data.Sequence
  }

  /** Whether an account exists on the validated ledger, and its flags when it does. */
  async accountFlags(account: string): Promise<number | null> {
    try { return (await this.call<{ account_data: { Flags: number } }>('account_info', { account, ledger_index: 'validated' })).account_data.Flags }
    catch (e) { if (e instanceof LedgerError && e.code === 'not_found') return null; throw e }
  }

  async accountLines(account: string): Promise<{ currency: string; account: string; balance: string }[]> {
    const r = await this.call<{ lines: { currency: string; account: string; balance: string }[] }>('account_lines', { account, ledger_index: 'validated' })
    return r.lines || []
  }

  async accountInfo(account: string): Promise<Record<string, unknown> | null> {
    try { return (await this.call<{ account_data: Record<string, unknown> }>('account_info', { account, ledger_index: 'validated' })).account_data }
    catch (e) { if (e instanceof LedgerError && e.code === 'not_found') return null; throw e }
  }

  /** Open-ledger base fee in drops, floored at 12 so a busy ledger never rejects us for 2 drops. */
  async feeDrops(): Promise<number> {
    try {
      const r = await this.call<{ drops: { open_ledger_fee: string; base_fee: string } }>('fee')
      return Math.max(12, Math.min(1_000, Number(r.drops.open_ledger_fee || r.drops.base_fee || 12)))
    } catch { return 12 }
  }
}
