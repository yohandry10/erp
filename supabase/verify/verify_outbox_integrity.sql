\set ON_ERROR_STOP on

-- Contrato real del outbox runtime. `payload` es el nombre canónico; los
-- consumidores normalizan a `event_data` en memoria para compatibilidad.
DO $$
DECLARE
  v_missing text;
  v_duplicates integer;
BEGIN
  WITH required(col) AS (
    SELECT * FROM (VALUES
      ('id'), ('event_id'), ('tenant_id'), ('aggregate_type'),
      ('aggregate_id'), ('event_type'), ('payload'), ('status'),
      ('retry_count'), ('next_retry_at'), ('idempotency_key'),
      ('processed_at'), ('error_message'), ('created_at'), ('updated_at')
    ) v(col)
  ), present AS (
    SELECT column_name AS col
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'outbox_events'
  )
  SELECT string_agg(r.col, ', ' ORDER BY r.col)
    INTO v_missing
  FROM required r
  LEFT JOIN present p USING (col)
  WHERE p.col IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'outbox_events carece de columnas runtime: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'outbox_events'
      AND indexdef ILIKE '%(tenant_id, event_type, idempotency_key)%'
      AND indexdef ILIKE '%UNIQUE%'
  ) THEN
    RAISE EXCEPTION 'Falta índice único tenant/event_type/idempotency_key en outbox_events';
  END IF;

  SELECT count(*) INTO v_duplicates
  FROM (
    SELECT tenant_id, event_type, idempotency_key
    FROM public.outbox_events
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''
    GROUP BY tenant_id, event_type, idempotency_key
    HAVING count(*) > 1
  ) d;

  IF v_duplicates > 0 THEN
    RAISE EXCEPTION 'Hay % claves idempotentes duplicadas en outbox_events', v_duplicates;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'outbox_events'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'outbox_events debe tener RLS habilitado y forzado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'outbox_events'
  ) THEN
    RAISE EXCEPTION 'outbox_events no tiene política RLS';
  END IF;

  IF to_regprocedure('public.get_pending_outbox_events(integer,uuid)') IS NULL
     OR to_regprocedure('public.mark_outbox_event_processing(uuid)') IS NULL
     OR to_regprocedure('public.mark_outbox_event_completed(uuid)') IS NULL
     OR to_regprocedure('public.mark_outbox_event_failed(uuid,text,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Falta una o más RPC runtime del outbox';
  END IF;
END;
$$;
