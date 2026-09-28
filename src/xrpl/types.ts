export type Network = 'testnet' | 'devnet' | 'mainnet'

export interface TxResult { hash: string; ledgerIndex: number; feeDrops: number }

export type OnSigned = (hash: string, lastLedgerSequence: number) => Promise<void> | void

export type LedgerErrorCode = 'tx_failed' | 'network' | 'not_found' | 'invalid'
export class LedgerError extends Error {
  constructor(public readonly code: LedgerErrorCode, message: string, public override readonly cause?: unknown) { 
    super(message); 
    this.name = 'LedgerError' 
  }
}
