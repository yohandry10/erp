-- Migration: Add missing columns to audit_log table
-- This is a fix for existing audit_log tables that don't have the new columns
-- Requirements: 27.1, 27.2

-- Add record_id column if it doesn't exist
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS record_id UUID;

-- Add changed_fields column if it doesn't exist
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS changed_fields TEXT[];

-- Add metadata column if it doesn't exist
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create indexes for performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_table_record 
    ON audit_log(tenant_id, table_name, record_id);

-- Add comments for columns
COMMENT ON COLUMN audit_log.record_id IS 'ID of the record being modified';
COMMENT ON COLUMN audit_log.changed_fields IS 'Array of field names that were changed (for UPDATE)';
COMMENT ON COLUMN audit_log.metadata IS 'Additional metadata about the operation';
