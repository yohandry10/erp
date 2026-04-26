-- ============================================================================
-- 093__retenciones_proveedores_integrity_constraints.sql
-- Integridad y consistencia tenant para retenciones/proveedores.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill de tenant_id desde proveedor en tablas dependientes.
-- ----------------------------------------------------------------------------
UPDATE public.libro_retenciones lr
SET tenant_id = p.tenant_id
FROM public.proveedores p
WHERE lr.proveedor_id = p.id
  AND (lr.tenant_id IS NULL OR lr.tenant_id <> p.tenant_id);

UPDATE public.proveedores_cuarta_categoria pc
SET tenant_id = p.tenant_id
FROM public.proveedores p
WHERE pc.proveedor_id = p.id
  AND (pc.tenant_id IS NULL OR pc.tenant_id <> p.tenant_id);

UPDATE public.libro_retenciones lr
SET proveedor_id = NULL
WHERE lr.proveedor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.proveedores p
    WHERE p.id = lr.proveedor_id
  );

UPDATE public.proveedores_cuarta_categoria pc
SET proveedor_id = NULL
WHERE pc.proveedor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.proveedores p
    WHERE p.id = pc.proveedor_id
  );

-- ----------------------------------------------------------------------------
-- FKs necesarias para embeds PostgREST y consistencia referencial.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible(
  'libro_retenciones',
  'proveedor_id',
  'proveedores',
  'id',
  'fk_libro_retenciones_proveedor_id'
);

SELECT app.add_fk_if_possible(
  'proveedores_cuarta_categoria',
  'proveedor_id',
  'proveedores',
  'id',
  'fk_proveedores_cuarta_categoria_proveedor_id'
);

-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant con proveedor padre.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_tenant_libro_retenciones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_proveedor uuid;
BEGIN
  IF NEW.proveedor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.tenant_id
  INTO v_tenant_proveedor
  FROM public.proveedores p
  WHERE p.id = NEW.proveedor_id;

  IF v_tenant_proveedor IS NULL THEN
    RAISE EXCEPTION 'Proveedor % no existe para libro_retenciones', NEW.proveedor_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_tenant_proveedor;
  ELSIF NEW.tenant_id <> v_tenant_proveedor THEN
    RAISE EXCEPTION
      'tenant_id (%) no coincide con proveedor (%) en libro_retenciones',
      NEW.tenant_id,
      v_tenant_proveedor
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_libro_retenciones ON public.libro_retenciones;
CREATE TRIGGER trg_enforce_tenant_libro_retenciones
BEFORE INSERT OR UPDATE OF tenant_id, proveedor_id
ON public.libro_retenciones
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_libro_retenciones();

CREATE OR REPLACE FUNCTION app.enforce_tenant_proveedores_cuarta_categoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_proveedor uuid;
BEGIN
  IF NEW.proveedor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.tenant_id
  INTO v_tenant_proveedor
  FROM public.proveedores p
  WHERE p.id = NEW.proveedor_id;

  IF v_tenant_proveedor IS NULL THEN
    RAISE EXCEPTION 'Proveedor % no existe para proveedores_cuarta_categoria', NEW.proveedor_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_tenant_proveedor;
  ELSIF NEW.tenant_id <> v_tenant_proveedor THEN
    RAISE EXCEPTION
      'tenant_id (%) no coincide con proveedor (%) en proveedores_cuarta_categoria',
      NEW.tenant_id,
      v_tenant_proveedor
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_proveedores_cuarta_categoria ON public.proveedores_cuarta_categoria;
CREATE TRIGGER trg_enforce_tenant_proveedores_cuarta_categoria
BEFORE INSERT OR UPDATE OF tenant_id, proveedor_id
ON public.proveedores_cuarta_categoria
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_proveedores_cuarta_categoria();

-- ----------------------------------------------------------------------------
-- Dedupe operativo para soportar índices únicos runtime.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    p.id,
    ROW_NUMBER() OVER (
      PARTITION BY p.tenant_id, lower(btrim(p.ruc))
      ORDER BY COALESCE(p.updated_at, p.created_at, now()) DESC, p.id::text DESC
    ) AS rn
  FROM public.proveedores p
  WHERE p.tenant_id IS NOT NULL
    AND NULLIF(btrim(COALESCE(p.ruc, '')), '') IS NOT NULL
    AND COALESCE(p.activo, true) = true
)
UPDATE public.proveedores p
SET
  activo = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    pc.id,
    ROW_NUMBER() OVER (
      PARTITION BY pc.tenant_id, pc.proveedor_id
      ORDER BY COALESCE(pc.updated_at, pc.created_at, now()) DESC, pc.id::text DESC
    ) AS rn
  FROM public.proveedores_cuarta_categoria pc
  WHERE pc.tenant_id IS NOT NULL
    AND pc.proveedor_id IS NOT NULL
    AND COALESCE(pc.activo, true) = true
)
UPDATE public.proveedores_cuarta_categoria pc
SET
  activo = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked r
WHERE pc.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    lr.id,
    upper(btrim(lr.numero_correlativo)) AS correlativo_key,
    ROW_NUMBER() OVER (
      PARTITION BY lr.tenant_id, upper(btrim(lr.numero_correlativo))
      ORDER BY COALESCE(lr.updated_at, lr.created_at, now()) DESC, lr.id::text DESC
    ) AS rn
  FROM public.libro_retenciones lr
  WHERE lr.tenant_id IS NOT NULL
    AND NULLIF(btrim(COALESCE(lr.numero_correlativo, '')), '') IS NOT NULL
)
UPDATE public.libro_retenciones lr
SET
  numero_correlativo = format('%s-DUP-%s', r.correlativo_key, r.rn),
  updated_at = now()
FROM ranked r
WHERE lr.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de calidad de datos.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.proveedores') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_proveedores_limite_credito_nonnegative'
        AND conrelid = 'public.proveedores'::regclass
    ) THEN
      ALTER TABLE public.proveedores
      ADD CONSTRAINT ck_proveedores_limite_credito_nonnegative
      CHECK (COALESCE(limite_credito, 0) >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_proveedores_dias_credito_nonnegative'
        AND conrelid = 'public.proveedores'::regclass
    ) THEN
      ALTER TABLE public.proveedores
      ADD CONSTRAINT ck_proveedores_dias_credito_nonnegative
      CHECK (COALESCE(dias_credito, 0) >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_proveedores_estado_valid'
        AND conrelid = 'public.proveedores'::regclass
    ) THEN
      ALTER TABLE public.proveedores
      ADD CONSTRAINT ck_proveedores_estado_valid
      CHECK (estado IN ('ACTIVO', 'INACTIVO'));
    END IF;
  END IF;

  IF to_regclass('public.proveedores_cuarta_categoria') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_proveedores_cuarta_estado_valid'
        AND conrelid = 'public.proveedores_cuarta_categoria'::regclass
    ) THEN
      ALTER TABLE public.proveedores_cuarta_categoria
      ADD CONSTRAINT ck_proveedores_cuarta_estado_valid
      CHECK (estado IN ('ACTIVO', 'INACTIVO'));
    END IF;
  END IF;

  IF to_regclass('public.libro_retenciones') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_libro_retenciones_categoria_valid'
        AND conrelid = 'public.libro_retenciones'::regclass
    ) THEN
      ALTER TABLE public.libro_retenciones
      ADD CONSTRAINT ck_libro_retenciones_categoria_valid
      CHECK (categoria_retencion IN ('CUARTA', 'QUINTA'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_libro_retenciones_estado_valid'
        AND conrelid = 'public.libro_retenciones'::regclass
    ) THEN
      ALTER TABLE public.libro_retenciones
      ADD CONSTRAINT ck_libro_retenciones_estado_valid
      CHECK (estado IN ('ACTIVO', 'ANULADO', 'PENDIENTE', 'PROCESADA'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_libro_retenciones_montos_valid'
        AND conrelid = 'public.libro_retenciones'::regclass
    ) THEN
      ALTER TABLE public.libro_retenciones
      ADD CONSTRAINT ck_libro_retenciones_montos_valid
      CHECK (
        COALESCE(monto_pago, 0) >= 0
        AND COALESCE(monto_retencion, 0) >= 0
        AND COALESCE(monto_retencion, 0) <= COALESCE(monto_pago, 0)
        AND COALESCE(tasa_retencion, 0) >= 0
        AND COALESCE(tasa_retencion, 0) <= 100
      );
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_proveedores_limite_credito_nonnegative'
      AND conrelid = 'public.proveedores'::regclass
  ) THEN
    ALTER TABLE public.proveedores
    VALIDATE CONSTRAINT ck_proveedores_limite_credito_nonnegative;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_proveedores_dias_credito_nonnegative'
      AND conrelid = 'public.proveedores'::regclass
  ) THEN
    ALTER TABLE public.proveedores
    VALIDATE CONSTRAINT ck_proveedores_dias_credito_nonnegative;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_proveedores_estado_valid'
      AND conrelid = 'public.proveedores'::regclass
  ) THEN
    ALTER TABLE public.proveedores
    VALIDATE CONSTRAINT ck_proveedores_estado_valid;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_proveedores_cuarta_estado_valid'
      AND conrelid = 'public.proveedores_cuarta_categoria'::regclass
  ) THEN
    ALTER TABLE public.proveedores_cuarta_categoria
    VALIDATE CONSTRAINT ck_proveedores_cuarta_estado_valid;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_libro_retenciones_categoria_valid'
      AND conrelid = 'public.libro_retenciones'::regclass
  ) THEN
    ALTER TABLE public.libro_retenciones
    VALIDATE CONSTRAINT ck_libro_retenciones_categoria_valid;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_libro_retenciones_estado_valid'
      AND conrelid = 'public.libro_retenciones'::regclass
  ) THEN
    ALTER TABLE public.libro_retenciones
    VALIDATE CONSTRAINT ck_libro_retenciones_estado_valid;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_libro_retenciones_montos_valid'
      AND conrelid = 'public.libro_retenciones'::regclass
  ) THEN
    ALTER TABLE public.libro_retenciones
    VALIDATE CONSTRAINT ck_libro_retenciones_montos_valid;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Unicidad runtime para evitar ambigüedad en `.single()`.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_tenant_ruc_activo
ON public.proveedores (tenant_id, lower(btrim(ruc)))
WHERE tenant_id IS NOT NULL
  AND NULLIF(btrim(COALESCE(ruc, '')), '') IS NOT NULL
  AND COALESCE(activo, true) = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_cuarta_tenant_proveedor_activo
ON public.proveedores_cuarta_categoria (tenant_id, proveedor_id)
WHERE tenant_id IS NOT NULL
  AND proveedor_id IS NOT NULL
  AND COALESCE(activo, true) = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_libro_retenciones_tenant_numero_correlativo
ON public.libro_retenciones (tenant_id, upper(btrim(numero_correlativo)))
WHERE tenant_id IS NOT NULL
  AND NULLIF(btrim(COALESCE(numero_correlativo, '')), '') IS NOT NULL;

-- ----------------------------------------------------------------------------
-- RLS explícito para tablas tenant-scoped del módulo.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'libro_retenciones');
SELECT app.apply_tenant_policy('public', 'proveedores_cuarta_categoria');

COMMIT;
