/** Immutable report artifact schema, registered as migration 7 by the integration. */
export const checkReportTableSql = `
CREATE TABLE quote_check_report (
  report_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  quote_id TEXT NOT NULL REFERENCES quote_v1(id),
  revision_id TEXT NOT NULL,
  quote_version INTEGER NOT NULL CHECK(quote_version > 0),
  checked_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX quote_check_report_history ON quote_check_report(workspace_id,revision_id,checked_at DESC,report_id);
CREATE TRIGGER quote_check_report_revision BEFORE INSERT ON quote_check_report
WHEN NOT (
  (NEW.quote_version=1 AND NEW.quote_id=NEW.revision_id AND EXISTS (
    SELECT 1 FROM quote_v1 WHERE id=NEW.revision_id AND workspace_id=NEW.workspace_id
  )) OR (NEW.quote_version>1 AND EXISTS (
    SELECT 1 FROM quote_revision r JOIN quote_v1 q ON q.id=r.root_id
    WHERE r.id=NEW.revision_id AND r.root_id=NEW.quote_id AND r.version=NEW.quote_version
      AND r.workspace_id=NEW.workspace_id AND q.workspace_id=NEW.workspace_id
  ))
)
BEGIN SELECT RAISE(ABORT, 'INVALID_CHECK_REVISION'); END;
CREATE TRIGGER quote_check_report_no_update BEFORE UPDATE ON quote_check_report
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_CHECK_REPORT'); END;
CREATE TRIGGER quote_check_report_no_delete BEFORE DELETE ON quote_check_report
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_CHECK_REPORT'); END;
`;
