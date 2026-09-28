/**
 * Sign, submit, and wait for finality — for any signer, any transaction.
 *
 * Every transaction carries LastLedgerSequence. After submit we poll `tx` until it is
 * validated, or until the validated ledger passes LastLedgerSequence — at which point the
 * transaction can never apply. A lost reply in between surfaces as SubmittedError with the
 * hash filled in, so the caller can reconcile on its next run instead of guessing.
 */
import type { XrplRpc } from './rpc'
import type { Wallet } from 'xrpl'
import { LedgerError, type OnSigned, type TxResult } from './types'

export class SubmittedError extends LedgerError {
  constructor(message: string, public readonly submitted: { hash: string; lastLedgerSequence: number }, cause?: unknown) { super('network', message, cause) }
}

export interface BroadcastOptions {
  /** ledgers of validity after the current one; ~4 s each */
  ledgerWindow?: number
  pollMs?: number
  /** how many times to re-sign with a fresh sequence when another process used ours first */
  sequenceRetries?: number
}

/** Two signers racing for one account (two Worker isolates, two tabs): the loser sees one of these and simply signs again. */
const SEQUENCE_RACE = /tefPAST_SEQ|terPRE_SEQ/

export interface Validated extends TxResult { meta: Record<string, unknown> }

type Detail =
  | { state: 'validated'; ledgerIndex: number; success: boolean; result: string; feeDrops: number; meta: Record<string, unknown> }
  | { state: 'pending' } | { state: 'unknown' }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class Broadcaster {
  private readonly window: number
  private readonly pollMs: number
  private readonly retries: number
  constructor(readonly rpc: XrplRpc, opts: BroadcastOptions = {}) { this.window = opts.ledgerWindow ?? 20; this.pollMs = opts.pollMs ?? 1_500; this.retries = opts.sequenceRetries ?? 3 }

  /**
   * Fill in Account, Sequence, Fee, LastLedgerSequence; sign; submit; wait. Re-signs on a sequence race.
   * `onSigned` runs between signing and submitting, so the caller can write the hash down first: from
   * that point on, whatever happens to this process, the transaction can be found again by hash.
   */
  async send(wallet: Wallet, tx: Record<string, unknown>, onSigned?: OnSigned): Promise<Validated> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.sendOnce(wallet, tx, onSigned)
      } catch (e) {
        if (!(e instanceof LedgerError) || e.code !== 'tx_failed' || !SEQUENCE_RACE.test(e.message) || attempt >= this.retries) throw e
        await sleep(300 + Math.random() * 900)
      }
    }
  }

  private async sendOnce(wallet: Wallet, tx: Record<string, unknown>, onSigned?: OnSigned): Promise<Validated> {
    const [sequence, fee, current] = await Promise.all([this.rpc.accountSequence(wallet.classicAddress), this.rpc.feeDrops(), this.rpc.validatedLedgerIndex()])
    const lastLedgerSequence = current + this.window
    
    // sign with xrpl.js Wallet
    const signed = wallet.sign({ ...tx, Account: wallet.classicAddress, Sequence: sequence, Fee: String(fee), LastLedgerSequence: lastLedgerSequence })
    await onSigned?.(signed.hash, lastLedgerSequence)
    
    try {
      const r = await this.rpc.call<{ engine_result: string; engine_result_message?: string }>('submit', { tx_blob: signed.tx_blob })
      const engine = r.engine_result
      if (!engine.startsWith('tes') && !engine.startsWith('ter') && !engine.startsWith('tec')) {
        throw new LedgerError('tx_failed', `${engine}${r.engine_result_message ? `: ${r.engine_result_message}` : ''}`)
      }
    } catch (e) {
      if (e instanceof LedgerError && e.code === 'tx_failed') throw e
      throw new SubmittedError(`submit reply lost: ${(e as Error).message}`, { hash: signed.hash, lastLedgerSequence }, e)
    }
    return this.await(signed.hash, lastLedgerSequence)
  }

  /**
   * Poll until validated or provably expired. A transport failure while polling is not a failed
   * transaction: it surfaces as SubmittedError so the caller reconciles by hash instead of retrying.
   */
  async await(hash: string, lastLedgerSequence: number): Promise<Validated> {
    const lost = (e: unknown) => new SubmittedError(`lost track of ${hash} while waiting: ${(e as Error).message}`, { hash, lastLedgerSequence }, e)
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- polling for finality is sequential by nature
      const s = await this.detail(hash).catch((e: unknown) => { throw lost(e) })
      if (s.state === 'validated') {
        if (!s.success) throw new LedgerError('tx_failed', `${hash} validated with ${s.result}`)
        return { hash, ledgerIndex: s.ledgerIndex, feeDrops: s.feeDrops, meta: s.meta }
      }
      // oxlint-disable-next-line no-await-in-loop
      const current = await this.rpc.validatedLedgerIndex().catch((e: unknown) => { throw lost(e) })
      if (current > lastLedgerSequence) throw new SubmittedError(`${hash} expired unvalidated (ledger ${current} > ${lastLedgerSequence})`, { hash, lastLedgerSequence })
      // oxlint-disable-next-line no-await-in-loop
      await sleep(this.pollMs)
    }
  }

  async detail(hash: string): Promise<Detail> {
    try {
      const r = await this.rpc.call<{ validated?: boolean; ledger_index?: number; meta?: { TransactionResult?: string } & Record<string, unknown>; tx_json?: { Fee?: string }; Fee?: string }>('tx', { transaction: hash })
      if (!r.validated) return { state: 'pending' }
      const result = r.meta?.TransactionResult ?? 'unknown'
      return { state: 'validated', ledgerIndex: r.ledger_index ?? 0, success: result === 'tesSUCCESS', result, feeDrops: Number(r.tx_json?.Fee ?? r.Fee ?? 0), meta: r.meta ?? {} }
    } catch (e) {
      if (e instanceof LedgerError && e.code === 'not_found') return { state: 'unknown' }
      throw e
    }
  }
}
