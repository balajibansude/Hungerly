-- Append-only guarantees for financial and audit history: rows can be inserted, never
-- changed or removed. Corrections are new rows (e.g. a payout_reversal ledger entry).
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER order_status_events_append_only BEFORE UPDATE OR DELETE ON order_status_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER declaration_acceptances_append_only BEFORE UPDATE OR DELETE ON declaration_acceptances
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
