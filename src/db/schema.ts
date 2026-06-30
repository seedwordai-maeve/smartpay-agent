import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * invoices — one row per submitted invoice.
 * Lifecycle: pending_extract → pending_approval → approved → signing → settled | rejected | failed
 */
export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),                  // inv_01J... (ULID)
  status: text("status").notNull().default("pending_extract"),
  submitter: text("submitter").notNull(),       // user email (audit)
  raw_r2_key: text("raw_r2_key"),               // R2 object key for original upload
  raw_text: text("raw_text"),                   // pasted/extracted text
  extracted_json: text("extracted_json"),        // JSON blob of LLM output (ExtractedInvoice)
  validation_json: text("validation_json"),       // JSON blob of XRPL pre-flight checks
  tx_hash: text("tx_hash"),
  tx_sequence: integer("tx_sequence"),
  ledger_index: integer("ledger_index"),
  xrpl_code: text("xrpl_code"),                 // tec* / tef* on failure
  approver: text("approver"),
  reject_reason: text("reject_reason"),
  created_at: text("created_at").notNull(),     // ISO 8601
  updated_at: text("updated_at").notNull(),
});

/**
 * audit_log — append-only trail of every state transition + tx preflight.
 * One invoice → many audit rows.
 */
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoice_id: text("invoice_id").notNull().references(() => invoices.id),
  event: text("event").notNull(),               // status name or "preflight" / "submit" / "verify"
  payload_json: text("payload_json"),            // arbitrary structured detail
  actor: text("actor"),                          // approver email or "system"
  created_at: text("created_at").notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
