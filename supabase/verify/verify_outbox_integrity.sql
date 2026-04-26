-- Verify outbox_events integrity (schema + indices + policies)
-- Ejecutar en Supabase SQL editor o psql.

-- 1) Columnas requeridas (mínimo para outbox patrón)
WITH required(col) AS (
  SELECT * FROM (VALUES
    ('id'),
    ('event_id'),
    ('correlation_id'),
    ('tenant_id'),
    ('aggregate_type'),
    ('aggregate_id'),
    ('event_type'),
    ('event_data'),
    ('event_version'),
    ('status'),
    ('retry_count'),
    ('max_retries'),
    ('next_retry_at'),
    ('idempotency_key'),
    ('processed_at'),
    ('error_message'),
    ('created_at'),
    ('updated_at')
  ) v(col)
),
present AS (
  SELECT column_name AS col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'outbox_events'
)
SELECT
  r.col AS missing_column
FROM required r
LEFT JOIN present p USING (col)
WHERE p.col IS NULL
ORDER BY r.col;

-- 2) Índices recomendados (nombre puede variar; se valida por definición)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'outbox_events'
ORDER BY indexname;

-- 2b) Duplicados por idempotency_key (si se usa dedupe)
SELECT tenant_id, idempotency_key, count(*)::int AS duplicates
FROM public.outbox_events
WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''
GROUP BY tenant_id, idempotency_key
HAVING count(*) > 1
ORDER BY duplicates DESC, tenant_id, idempotency_key;

-- 3) Políticas RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'outbox_events'
ORDER BY policyname;

-- 4) Conteo por estado (diagnóstico rápido)
SELECT status, count(*)::int AS count
FROM public.outbox_events
GROUP BY status
ORDER BY status;
