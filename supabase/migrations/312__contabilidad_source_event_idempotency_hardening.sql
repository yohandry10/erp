-- Hardening de idempotencia contable por evento origen.
-- El cierre CPE/POS puede disparar rutas concurrentes hacia contabilidad; la BD
-- debe impedir mas de un asiento por tenant y source_event_id.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'asientos_contables'
      AND column_name = 'source_event_id'
  ) THEN
    WITH duplicados AS (
      SELECT id
      FROM (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY tenant_id, source_event_id
            ORDER BY created_at ASC NULLS LAST, id ASC
          ) AS rn
        FROM public.asientos_contables
        WHERE source_event_id IS NOT NULL
      ) ranked
      WHERE rn > 1
    )
    DELETE FROM public.detalle_asientos da
    USING duplicados d
    WHERE da.asiento_id = d.id;

    WITH duplicados AS (
      SELECT id
      FROM (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY tenant_id, source_event_id
            ORDER BY created_at ASC NULLS LAST, id ASC
          ) AS rn
        FROM public.asientos_contables
        WHERE source_event_id IS NOT NULL
      ) ranked
      WHERE rn > 1
    )
    DELETE FROM public.asientos_contables ac
    USING duplicados d
    WHERE ac.id = d.id;

    DROP INDEX IF EXISTS public.idx_asientos_contables_source_event_unique;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_asientos_contables_tenant_source_event_unique
      ON public.asientos_contables (tenant_id, source_event_id)
      WHERE source_event_id IS NOT NULL;
  END IF;
END $$;

COMMIT;
