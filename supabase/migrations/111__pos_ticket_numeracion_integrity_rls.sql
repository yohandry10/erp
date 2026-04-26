-- ============================================================================
-- 111__pos_ticket_numeracion_integrity_rls.sql
-- Integridad, normalización y hardening RLS para numeración POS/tickets.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Normalización de tickets en ventas_pos.
-- ----------------------------------------------------------------------------
UPDATE public.ventas_pos v
SET
  serie = upper(
    COALESCE(
      NULLIF(btrim(COALESCE(v.serie, '')), ''),
      NULLIF(split_part(COALESCE(v.numero_ticket, ''), '-', 1), ''),
      'T001'
    )
  ),
  correlativo = lpad(
    COALESCE(
      NULLIF(
        regexp_replace(
          COALESCE(
            NULLIF(btrim(COALESCE(v.correlativo, '')), ''),
            NULLIF(split_part(COALESCE(v.numero_ticket, ''), '-', 2), ''),
            NULLIF(regexp_replace(COALESCE(v.numero_ticket, ''), '[^0-9]', '', 'g'), '')
          ),
          '[^0-9]',
          '',
          'g'
        ),
        ''
      ),
      '1'
    ),
    8,
    '0'
  ),
  numero_ticket = upper(
    COALESCE(
      NULLIF(btrim(COALESCE(v.serie, '')), ''),
      NULLIF(split_part(COALESCE(v.numero_ticket, ''), '-', 1), ''),
      'T001'
    )
  )
  || '-'
  || lpad(
    COALESCE(
      NULLIF(
        regexp_replace(
          COALESCE(
            NULLIF(btrim(COALESCE(v.correlativo, '')), ''),
            NULLIF(split_part(COALESCE(v.numero_ticket, ''), '-', 2), ''),
            NULLIF(regexp_replace(COALESCE(v.numero_ticket, ''), '[^0-9]', '', 'g'), '')
          ),
          '[^0-9]',
          '',
          'g'
        ),
        ''
      ),
      '1'
    ),
    8,
    '0'
  ),
  subtotal = GREATEST(COALESCE(v.subtotal, 0), 0),
  impuestos = GREATEST(COALESCE(v.impuestos, 0), 0),
  total = GREATEST(COALESCE(v.total, 0), 0),
  idempotency_key = NULLIF(btrim(COALESCE(v.idempotency_key, '')), ''),
  fecha = COALESCE(v.fecha, v.created_at, now()),
  updated_at = now()
WHERE true;

UPDATE public.ventas_pos
SET
  correlativo = right(correlativo, 8),
  numero_ticket = upper(COALESCE(serie, 'T001')) || '-' || right(COALESCE(correlativo, '00000001'), 8),
  updated_at = now()
WHERE correlativo IS NOT NULL
  AND length(correlativo) > 8;

CREATE OR REPLACE FUNCTION app.normalize_ventas_pos_ticket_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_serie text;
  v_corr text;
BEGIN
  v_serie := upper(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.serie, '')), ''),
      NULLIF(split_part(COALESCE(NEW.numero_ticket, ''), '-', 1), ''),
      'T001'
    )
  );

  v_corr := COALESCE(
    NULLIF(
      regexp_replace(
        COALESCE(
          NULLIF(btrim(COALESCE(NEW.correlativo, '')), ''),
          NULLIF(split_part(COALESCE(NEW.numero_ticket, ''), '-', 2), ''),
          NULLIF(regexp_replace(COALESCE(NEW.numero_ticket, ''), '[^0-9]', '', 'g'), '')
        ),
        '[^0-9]',
        '',
        'g'
      ),
      ''
    ),
    '1'
  );

  NEW.serie := v_serie;
  NEW.correlativo := right(lpad(v_corr, 8, '0'), 8);
  NEW.numero_ticket := NEW.serie || '-' || NEW.correlativo;

  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  NEW.impuestos := GREATEST(COALESCE(NEW.impuestos, 0), 0);
  NEW.total := GREATEST(COALESCE(NEW.total, 0), 0);
  NEW.idempotency_key := NULLIF(btrim(COALESCE(NEW.idempotency_key, '')), '');
  NEW.fecha := COALESCE(NEW.fecha, NEW.created_at, now());
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_ventas_pos_ticket_row ON public.ventas_pos;
CREATE TRIGGER trg_normalize_ventas_pos_ticket_row
BEFORE INSERT OR UPDATE ON public.ventas_pos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_ventas_pos_ticket_row();

-- ----------------------------------------------------------------------------
-- Dedupe de scope activo en pos_numeracion.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    pn.id,
    first_value(pn.id) OVER (
      PARTITION BY
        COALESCE(pn.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        upper(COALESCE(NULLIF(btrim(pn.tipo_documento), ''), 'TICKET')),
        upper(COALESCE(NULLIF(btrim(pn.serie), ''), 'T001')),
        COALESCE(pn.caja_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY
        COALESCE(pn.correlativo_actual, 0) DESC,
        COALESCE(pn.updated_at, pn.created_at, now()) DESC,
        pn.id::text DESC
    ) AS kept_id,
    row_number() OVER (
      PARTITION BY
        COALESCE(pn.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        upper(COALESCE(NULLIF(btrim(pn.tipo_documento), ''), 'TICKET')),
        upper(COALESCE(NULLIF(btrim(pn.serie), ''), 'T001')),
        COALESCE(pn.caja_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY
        COALESCE(pn.correlativo_actual, 0) DESC,
        COALESCE(pn.updated_at, pn.created_at, now()) DESC,
        pn.id::text DESC
    ) AS rn
  FROM public.pos_numeracion pn
  WHERE COALESCE(pn.activo, true) = true
)
UPDATE public.pos_numeracion pn
SET
  activo = false,
  estado = 'INACTIVO',
  metadata = COALESCE(pn.metadata, '{}'::jsonb) || jsonb_build_object(
    'dedupe_migration',
    '111__pos_ticket_numeracion_integrity_rls',
    'dedupe_kept_id',
    r.kept_id::text
  ),
  updated_at = now()
FROM ranked r
WHERE pn.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de calidad.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.pos_numeracion') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pos_numeracion_serie_shape'
        AND conrelid = 'public.pos_numeracion'::regclass
    ) THEN
      ALTER TABLE public.pos_numeracion
      ADD CONSTRAINT ck_pos_numeracion_serie_shape
      CHECK (serie IS NOT NULL AND serie ~ '^[A-Z0-9]{1,10}$');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pos_numeracion_tipo_documento_nonempty'
        AND conrelid = 'public.pos_numeracion'::regclass
    ) THEN
      ALTER TABLE public.pos_numeracion
      ADD CONSTRAINT ck_pos_numeracion_tipo_documento_nonempty
      CHECK (tipo_documento IS NOT NULL AND btrim(tipo_documento) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pos_numeracion_correlativo_nonnegative'
        AND conrelid = 'public.pos_numeracion'::regclass
    ) THEN
      ALTER TABLE public.pos_numeracion
      ADD CONSTRAINT ck_pos_numeracion_correlativo_nonnegative
      CHECK (correlativo_actual >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pos_numeracion_correlativo_max_valid'
        AND conrelid = 'public.pos_numeracion'::regclass
    ) THEN
      ALTER TABLE public.pos_numeracion
      ADD CONSTRAINT ck_pos_numeracion_correlativo_max_valid
      CHECK (correlativo_maximo >= GREATEST(correlativo_actual, 1));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pos_numeracion_estado_consistency'
        AND conrelid = 'public.pos_numeracion'::regclass
    ) THEN
      ALTER TABLE public.pos_numeracion
      ADD CONSTRAINT ck_pos_numeracion_estado_consistency
      CHECK (COALESCE(activo, false) = false OR upper(COALESCE(estado, '')) = 'ACTIVO');
    END IF;
  END IF;

  IF to_regclass('public.ventas_pos') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_ventas_pos_ticket_shape'
        AND conrelid = 'public.ventas_pos'::regclass
    ) THEN
      ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ck_ventas_pos_ticket_shape
      CHECK (
        numero_ticket IS NULL
        OR numero_ticket ~ '^[A-Z0-9]{1,10}-[0-9]{8}$'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_ventas_pos_serie_shape'
        AND conrelid = 'public.ventas_pos'::regclass
    ) THEN
      ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ck_ventas_pos_serie_shape
      CHECK (
        serie IS NULL
        OR serie ~ '^[A-Z0-9]{1,10}$'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_ventas_pos_correlativo_shape'
        AND conrelid = 'public.ventas_pos'::regclass
    ) THEN
      ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ck_ventas_pos_correlativo_shape
      CHECK (
        correlativo IS NULL
        OR correlativo ~ '^[0-9]{8}$'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_ventas_pos_montos_nonnegative'
        AND conrelid = 'public.ventas_pos'::regclass
    ) THEN
      ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ck_ventas_pos_montos_nonnegative
      CHECK (
        COALESCE(subtotal, 0) >= 0
        AND COALESCE(impuestos, 0) >= 0
        AND COALESCE(total, 0) >= 0
      );
    END IF;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Índices de integridad/rendimiento.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_numeracion_scope_active
ON public.pos_numeracion (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(COALESCE(tipo_documento, 'TICKET')),
  upper(COALESCE(serie, 'T001')),
  COALESCE(caja_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE COALESCE(activo, true) = true;

CREATE INDEX IF NOT EXISTS idx_ventas_pos_tenant_ticket_upper_runtime
ON public.ventas_pos (tenant_id, upper(numero_ticket))
WHERE numero_ticket IS NOT NULL
  AND btrim(numero_ticket) <> '';

-- ----------------------------------------------------------------------------
-- Consistencia tenant de caja en pos_numeracion.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_pos_numeracion_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_caja_tenant uuid;
BEGIN
  IF NEW.caja_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.tenant_id
  INTO v_caja_tenant
  FROM public.cajas c
  WHERE c.id = NEW.caja_id;

  IF v_caja_tenant IS NULL THEN
    RAISE EXCEPTION 'CAJA_NOT_FOUND: %', NEW.caja_id;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_caja_tenant;
  ELSIF NEW.tenant_id <> v_caja_tenant THEN
    RAISE EXCEPTION 'TENANT_MISMATCH_POS_NUMERACION_CAJA: row_tenant=% caja_tenant=% caja_id=%',
      NEW.tenant_id, v_caja_tenant, NEW.caja_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pos_numeracion_tenant_consistency ON public.pos_numeracion;
CREATE TRIGGER trg_enforce_pos_numeracion_tenant_consistency
BEFORE INSERT OR UPDATE ON public.pos_numeracion
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pos_numeracion_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito sobre pos_numeracion.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'pos_numeracion');

COMMIT;
