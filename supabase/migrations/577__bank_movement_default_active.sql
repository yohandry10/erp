-- Future bank movements default to active. Explicitly inactive records stay inactive.
-- Existing rows are deliberately untouched: historical false values can represent
-- either the former default or an intentional state and must not be guessed.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.movimientos_bancarios ALTER COLUMN activo SET DEFAULT true;
COMMIT;
