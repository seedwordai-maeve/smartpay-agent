-- SmartPay Agent — initial schema
-- Run with: wrangler d1 migrations apply smartpay --local

CREATE TABLE IF NOT EXISTS invoices (
  id              TEXT PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'pending_extract',
  submitter       TEXT NOT NULL,
  raw_r2_key      TEXT,
  raw_text        TEXT,
  extracted_json  TEXT,
  validation_json TEXT,
  tx_hash         TEXT,
  tx_sequence     INTEGER,
  ledger_index    INTEGER,
  xrpl_code       TEXT,
  approver        TEXT,
  reject_reason   TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_status    ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_submitter ON invoices(submitter);
CREATE INDEX IF NOT EXISTS idx_invoices_created   ON invoices(created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id   TEXT NOT NULL REFERENCES invoices(id),
  event        TEXT NOT NULL,
  payload_json TEXT,
  actor        TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_invoice ON audit_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_audit_event   ON audit_log(event);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
