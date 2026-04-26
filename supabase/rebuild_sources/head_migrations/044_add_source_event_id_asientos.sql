-- Migration: Add source_event_id to asientos_contables for idempotency
-- Description: Adds source_event_id column to track which event generated each accounting entry
-- This ensures idempotency when processing events from the outbox pattern
-- Date: 2025-10-27

-- Add source_event_id column to asientos_contables table
-- This column will reference the outbox_events table to track which event generated this entry
-- Using uuid type to match outbox_events.id
ALTER TABLE asientos_contables 
ADD COLUMN IF NOT EXISTS source_event_id uuid;

-- Create index for faster lookups when checking if an event has already been processed
-- Partial index only on non-null values for efficiency
CREATE INDEX IF NOT EXISTS idx_asientos_contables_source_event_id 
ON asientos_contables(source_event_id) 
WHERE source_event_id IS NOT NULL;

-- Create unique constraint to prevent duplicate asientos from the same event
-- This is the key to idempotency: one event can only generate one asiento
-- Unique index on source_event_id ensures one asiento per event
CREATE UNIQUE INDEX IF NOT EXISTS idx_asientos_contables_source_event_unique 
ON asientos_contables(source_event_id) 
WHERE source_event_id IS NOT NULL;

-- Add comment to document the purpose of this column
COMMENT ON COLUMN asientos_contables.source_event_id IS 
'References the outbox_events.id that generated this accounting entry. Used for idempotency to prevent duplicate entries from the same event. NULL for manual entries.';

-- Note: Foreign key constraint to outbox_events will be added in a separate migration
-- once the outbox_events table structure is finalized, to avoid circular dependencies
