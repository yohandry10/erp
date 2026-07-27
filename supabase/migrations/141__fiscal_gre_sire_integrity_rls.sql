-- ============================================================================
-- 141__fiscal_gre_sire_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para GRE/SIRE.
-- Tablas: gre_guias, gre_detalles, sire_files, sire_registros_detalle.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id y sincronización de aliases de estado/período.
-- ----------------------------------------------------------------------------
UPDATE public.gre_guias g
SET tenant_id = c.tenant_id
FROM public.cpe c
WHERE g.cpe_relacionado = c.id
  AND c.tenant_id IS NOT NULL
  AND (g.tenant_id IS NULL OR g.tenant_id <> c.tenant_id);

UPDATE public.gre_detalles gd
SET tenant_id = g.tenant_id
FROM public.gre_guias g
WHERE gd.gre_id = g.id
  AND g.tenant_id IS NOT NULL
  AND (gd.tenant_id IS NULL OR gd.tenant_id <> g.tenant_id);

UPDATE public.sire_registros_detalle srd
SET tenant_id = sf.tenant_id
FROM public.sire_files sf
WHERE srd.reporte_id = sf.id
  AND sf.tenant_id IS NOT NULL
  AND (srd.tenant_id IS NULL OR srd.tenant_id <> sf.tenant_id);

UPDATE public.sire_registros_detalle srd
SET tenant_id = c.tenant_id
FROM public.cpe c
WHERE srd.cpe_id = c.id
  AND c.tenant_id IS NOT NULL
  AND srd.tenant_id IS NULL;

UPDATE public.sire_files
SET
  periodo = COALESCE(NULLIF(btrim(COALESCE(periodo, '')), ''), NULLIF(btrim(COALESCE(period, '')), ''), to_char(COALESCE(created_at, now()), 'YYYY-MM')),
  period = COALESCE(NULLIF(btrim(COALESCE(period, '')), ''), NULLIF(btrim(COALESCE(periodo, '')), ''), to_char(COALESCE(created_at, now()), 'YYYY-MM')),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('RUNNING', 'GENERANDO', 'GENERATING') THEN 'GENERANDO'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('COMPLETED', 'GENERADO') THEN 'GENERADO'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('SENT', 'ENVIADO') THEN 'ENVIADO'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('PENDING', 'PENDIENTE') THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('CANCELLED', 'ANULADO') THEN 'ANULADO'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), NULLIF(btrim(COALESCE(status, '')), ''), 'GENERANDO')) IN ('FAILED', 'ERROR') THEN 'ERROR'
    ELSE 'GENERANDO'
  END,
  status = CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('RUNNING', 'GENERANDO', 'GENERATING') THEN 'RUNNING'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('COMPLETED', 'GENERADO') THEN 'COMPLETED'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('SENT', 'ENVIADO') THEN 'SENT'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('PENDING', 'PENDIENTE') THEN 'PENDING'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('CANCELLED', 'ANULADO') THEN 'CANCELLED'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'RUNNING')) IN ('FAILED', 'ERROR') THEN 'ERROR'
    ELSE 'RUNNING'
  END,
  updated_at = now()
WHERE true;

-- ----------------------------------------------------------------------------
-- FKs para embeds PostgREST y consistencia referencial.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('gre_guias', 'tenant_id', 'tenants', 'id', 'gre_guias_tenant_id_fkey');
SELECT app.add_fk_if_possible('gre_guias', 'cpe_relacionado', 'cpe', 'id', 'gre_guias_cpe_relacionado_fkey');

SELECT app.add_fk_if_possible('gre_detalles', 'tenant_id', 'tenants', 'id', 'gre_detalles_tenant_id_fkey');
SELECT app.add_fk_if_possible('gre_detalles', 'gre_id', 'gre_guias', 'id', 'gre_detalles_gre_id_fkey');
SELECT app.add_fk_if_possible('gre_detalles', 'producto_id', 'productos', 'id', 'gre_detalles_producto_id_fkey');

SELECT app.add_fk_if_possible('sire_files', 'tenant_id', 'tenants', 'id', 'sire_files_tenant_id_fkey');

SELECT app.add_fk_if_possible('sire_registros_detalle', 'tenant_id', 'tenants', 'id', 'sire_registros_detalle_tenant_id_fkey');
SELECT app.add_fk_if_possible('sire_registros_detalle', 'reporte_id', 'sire_files', 'id', 'sire_registros_detalle_reporte_id_fkey');
SELECT app.add_fk_if_possible('sire_registros_detalle', 'cpe_id', 'cpe', 'id', 'sire_registros_detalle_cpe_id_fkey');

-- ----------------------------------------------------------------------------
-- Dedupe operativo para unicidad de scopes runtime.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    g.id,
    row_number() OVER (
      PARTITION BY g.tenant_id, btrim(g.idempotency_key)
      ORDER BY COALESCE(g.updated_at, g.created_at, now()) DESC, g.id::text DESC
    ) AS rn
  FROM public.gre_guias g
  WHERE g.tenant_id IS NOT NULL
    AND g.idempotency_key IS NOT NULL
    AND btrim(g.idempotency_key) <> ''
)
DELETE FROM public.gre_guias g
USING ranked r
WHERE g.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    g.id,
    row_number() OVER (
      PARTITION BY g.tenant_id, upper(COALESCE(g.serie, '')), g.correlativo
      ORDER BY COALESCE(g.updated_at, g.created_at, now()) DESC, g.id::text DESC
    ) AS rn
  FROM public.gre_guias g
  WHERE g.tenant_id IS NOT NULL
    AND g.serie IS NOT NULL
    AND btrim(g.serie) <> ''
    AND g.correlativo IS NOT NULL
)
DELETE FROM public.gre_guias g
USING ranked r
WHERE g.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    sf.id,
    row_number() OVER (
      PARTITION BY sf.tenant_id, upper(COALESCE(NULLIF(btrim(sf.periodo), ''), 'NO_PERIODO')), upper(COALESCE(NULLIF(btrim(sf.tipo), ''), 'NO_TIPO'))
      ORDER BY COALESCE(sf.updated_at, sf.created_at, now()) DESC, sf.id::text DESC
    ) AS rn
  FROM public.sire_files sf
  WHERE sf.tenant_id IS NOT NULL
    AND sf.periodo IS NOT NULL
    AND btrim(sf.periodo) <> ''
    AND sf.tipo IS NOT NULL
    AND btrim(sf.tipo) <> ''
)
DELETE FROM public.sire_files sf
USING ranked r
WHERE sf.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    srd.id,
    row_number() OVER (
      PARTITION BY srd.tenant_id, srd.cpe_id
      ORDER BY COALESCE(srd.updated_at, srd.created_at, srd.fecha_registro, now()) DESC, srd.id::text DESC
    ) AS rn
  FROM public.sire_registros_detalle srd
  WHERE srd.tenant_id IS NOT NULL
    AND srd.cpe_id IS NOT NULL
)
DELETE FROM public.sire_registros_detalle srd
USING ranked r
WHERE srd.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_gre_guias_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cpe_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cpe_relacionado := app.to_uuid_or_null(COALESCE(NEW.cpe_relacionado::text, ''));

  IF NEW.cpe_relacionado IS NOT NULL THEN
    SELECT c.tenant_id INTO v_cpe_tenant
    FROM public.cpe c
    WHERE c.id = NEW.cpe_relacionado;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('CPE relacionado no existe: %s', NEW.cpe_relacionado), ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_cpe_tenant;
    ELSIF v_cpe_tenant IS NOT NULL AND NEW.tenant_id <> v_cpe_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cpe_relacionado en gre_guias', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en gre_guias', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_gre_guias_tenant_consistency ON public.gre_guias;
CREATE TRIGGER trg_enforce_gre_guias_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cpe_relacionado
ON public.gre_guias
FOR EACH ROW
EXECUTE FUNCTION app.enforce_gre_guias_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_gre_detalles_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_gre_tenant uuid;
  v_producto_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.gre_id := app.to_uuid_or_null(COALESCE(NEW.gre_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));

  IF NEW.gre_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'gre_id es obligatorio en gre_detalles', ERRCODE = '23514';
  END IF;

  SELECT g.tenant_id INTO v_gre_tenant
  FROM public.gre_guias g
  WHERE g.id = NEW.gre_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('GRE no existe: %s', NEW.gre_id), ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_gre_tenant;
  ELSIF v_gre_tenant IS NOT NULL AND NEW.tenant_id <> v_gre_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con gre_id en gre_detalles', ERRCODE = '23514';
  END IF;

  IF NEW.producto_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_producto_tenant
    FROM public.productos p
    WHERE p.id = NEW.producto_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Producto no existe: %s', NEW.producto_id), ERRCODE = '23503';
    END IF;

    IF v_producto_tenant IS NOT NULL AND NEW.tenant_id <> v_producto_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con producto en gre_detalles', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en gre_detalles', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_gre_detalles_tenant_consistency ON public.gre_detalles;
CREATE TRIGGER trg_enforce_gre_detalles_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, gre_id, producto_id
ON public.gre_detalles
FOR EACH ROW
EXECUTE FUNCTION app.enforce_gre_detalles_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_sire_files_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en sire_files', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sire_files_tenant_consistency ON public.sire_files;
CREATE TRIGGER trg_enforce_sire_files_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id
ON public.sire_files
FOR EACH ROW
EXECUTE FUNCTION app.enforce_sire_files_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_sire_registros_detalle_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_reporte_tenant uuid;
  v_cpe_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.reporte_id := app.to_uuid_or_null(COALESCE(NEW.reporte_id::text, ''));
  NEW.cpe_id := app.to_uuid_or_null(COALESCE(NEW.cpe_id::text, ''));

  IF NEW.reporte_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'reporte_id es obligatorio en sire_registros_detalle', ERRCODE = '23514';
  END IF;

  SELECT sf.tenant_id INTO v_reporte_tenant
  FROM public.sire_files sf
  WHERE sf.id = NEW.reporte_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format('Reporte SIRE no existe: %s', NEW.reporte_id), ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_reporte_tenant;
  ELSIF v_reporte_tenant IS NOT NULL AND NEW.tenant_id <> v_reporte_tenant THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con reporte_id en sire_registros_detalle', ERRCODE = '23514';
  END IF;

  IF NEW.cpe_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_cpe_tenant
    FROM public.cpe c
    WHERE c.id = NEW.cpe_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('CPE no existe: %s', NEW.cpe_id), ERRCODE = '23503';
    END IF;

    IF v_cpe_tenant IS NOT NULL AND NEW.tenant_id <> v_cpe_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cpe_id en sire_registros_detalle', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en sire_registros_detalle', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sire_registros_detalle_tenant_consistency ON public.sire_registros_detalle;
CREATE TRIGGER trg_enforce_sire_registros_detalle_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, reporte_id, cpe_id
ON public.sire_registros_detalle
FOR EACH ROW
EXECUTE FUNCTION app.enforce_sire_registros_detalle_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio e integridad.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.gre_guias') IS NOT NULL THEN
    ALTER TABLE public.gre_guias
      ADD CONSTRAINT ck_gre_guias_ids_required
      CHECK (tenant_id IS NOT NULL AND numero IS NOT NULL AND btrim(numero) <> '') NOT VALID;
    ALTER TABLE public.gre_guias
      ADD CONSTRAINT ck_gre_guias_estado_valid
      CHECK (estado IN ('BORRADOR', 'FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO', 'ERROR')) NOT VALID;
    ALTER TABLE public.gre_guias
      ADD CONSTRAINT ck_gre_guias_sunat_status_valid
      CHECK (sunat_status IN ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR')) NOT VALID;
    ALTER TABLE public.gre_guias
      ADD CONSTRAINT ck_gre_guias_totals_nonnegative
      CHECK (
        base_imponible >= 0
        AND igv >= 0
        AND total >= 0
        AND peso_total >= 0
      ) NOT VALID;
    ALTER TABLE public.gre_guias
      ADD CONSTRAINT ck_gre_guias_retry_nonnegative
      CHECK (retry_count >= 0) NOT VALID;
    ALTER TABLE public.gre_guias
      ADD CONSTRAINT ck_gre_guias_anio_shape
      CHECK (anio IS NULL OR anio ~ '^[0-9]{4}$') NOT VALID;
    ALTER TABLE public.gre_guias
      ADD CONSTRAINT ck_gre_guias_mes_shape
      CHECK (mes IS NULL OR mes ~ '^(0[1-9]|1[0-2])$') NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.gre_detalles') IS NOT NULL THEN
    ALTER TABLE public.gre_detalles
      ADD CONSTRAINT ck_gre_detalles_ids_required
      CHECK (tenant_id IS NOT NULL AND gre_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.gre_detalles
      ADD CONSTRAINT ck_gre_detalles_descripcion_nonempty
      CHECK (descripcion IS NOT NULL AND btrim(descripcion) <> '') NOT VALID;
    ALTER TABLE public.gre_detalles
      ADD CONSTRAINT ck_gre_detalles_cantidad_positive
      CHECK (cantidad > 0) NOT VALID;
    ALTER TABLE public.gre_detalles
      ADD CONSTRAINT ck_gre_detalles_peso_nonnegative
      CHECK (peso IS NULL OR peso >= 0) NOT VALID;
    ALTER TABLE public.gre_detalles
      ADD CONSTRAINT ck_gre_detalles_estado_valid
      CHECK (estado IN ('ACTIVO', 'INACTIVO')) NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.sire_files') IS NOT NULL THEN
    ALTER TABLE public.sire_files
      ADD CONSTRAINT ck_sire_files_ids_required
      CHECK (
        tenant_id IS NOT NULL
        AND periodo IS NOT NULL AND btrim(periodo) <> ''
        AND period IS NOT NULL AND btrim(period) <> ''
        AND tipo IS NOT NULL AND btrim(tipo) <> ''
      ) NOT VALID;
    ALTER TABLE public.sire_files
      ADD CONSTRAINT ck_sire_files_period_sync
      CHECK (periodo = period) NOT VALID;
    ALTER TABLE public.sire_files
      ADD CONSTRAINT ck_sire_files_estado_valid
      CHECK (estado IN ('GENERANDO', 'GENERADO', 'ENVIADO', 'PENDIENTE', 'ERROR', 'ANULADO')) NOT VALID;
    ALTER TABLE public.sire_files
      ADD CONSTRAINT ck_sire_files_status_valid
      CHECK (status IN ('RUNNING', 'COMPLETED', 'SENT', 'PENDING', 'ERROR', 'CANCELLED')) NOT VALID;
    ALTER TABLE public.sire_files
      ADD CONSTRAINT ck_sire_files_file_size_nonnegative
      CHECK (file_size >= 0) NOT VALID;
    ALTER TABLE public.sire_files
      ADD CONSTRAINT ck_sire_files_total_registros_nonnegative
      CHECK (total_registros >= 0) NOT VALID;
    ALTER TABLE public.sire_files
      ADD CONSTRAINT ck_sire_files_period_length
      CHECK (length(periodo) <= 10 AND length(period) <= 10) NOT VALID;
    ALTER TABLE public.sire_files
      ADD CONSTRAINT ck_sire_files_tipo_length
      CHECK (length(tipo) <= 10) NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.sire_registros_detalle') IS NOT NULL THEN
    ALTER TABLE public.sire_registros_detalle
      ADD CONSTRAINT ck_sire_registros_detalle_ids_required
      CHECK (tenant_id IS NOT NULL AND reporte_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.sire_registros_detalle
      ADD CONSTRAINT ck_sire_registros_detalle_total_nonnegative
      CHECK (total >= 0) NOT VALID;
    ALTER TABLE public.sire_registros_detalle
      ADD CONSTRAINT ck_sire_registros_detalle_fecha_required
      CHECK (fecha_registro IS NOT NULL) NOT VALID;
    ALTER TABLE public.sire_registros_detalle
      ADD CONSTRAINT ck_sire_registros_detalle_estado_valid
      CHECK (estado IN ('REGISTRADO', 'ANULADO')) NOT VALID;
    ALTER TABLE public.sire_registros_detalle
      ADD CONSTRAINT ck_sire_registros_detalle_tipo_nonempty
      CHECK (tipo_documento IS NOT NULL AND btrim(tipo_documento) <> '') NOT VALID;
    ALTER TABLE public.sire_registros_detalle
      ADD CONSTRAINT ck_sire_registros_detalle_serie_nonempty
      CHECK (serie IS NOT NULL AND btrim(serie) <> '') NOT VALID;
    ALTER TABLE public.sire_registros_detalle
      ADD CONSTRAINT ck_sire_registros_detalle_numero_nonempty
      CHECK (numero IS NOT NULL AND btrim(numero) <> '') NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE IF EXISTS public.gre_guias VALIDATE CONSTRAINT ck_gre_guias_ids_required;
ALTER TABLE IF EXISTS public.gre_guias VALIDATE CONSTRAINT ck_gre_guias_estado_valid;
ALTER TABLE IF EXISTS public.gre_guias VALIDATE CONSTRAINT ck_gre_guias_sunat_status_valid;
ALTER TABLE IF EXISTS public.gre_guias VALIDATE CONSTRAINT ck_gre_guias_totals_nonnegative;
ALTER TABLE IF EXISTS public.gre_guias VALIDATE CONSTRAINT ck_gre_guias_retry_nonnegative;
ALTER TABLE IF EXISTS public.gre_guias VALIDATE CONSTRAINT ck_gre_guias_anio_shape;
ALTER TABLE IF EXISTS public.gre_guias VALIDATE CONSTRAINT ck_gre_guias_mes_shape;

ALTER TABLE IF EXISTS public.gre_detalles VALIDATE CONSTRAINT ck_gre_detalles_ids_required;
ALTER TABLE IF EXISTS public.gre_detalles VALIDATE CONSTRAINT ck_gre_detalles_descripcion_nonempty;
ALTER TABLE IF EXISTS public.gre_detalles VALIDATE CONSTRAINT ck_gre_detalles_cantidad_positive;
ALTER TABLE IF EXISTS public.gre_detalles VALIDATE CONSTRAINT ck_gre_detalles_peso_nonnegative;
ALTER TABLE IF EXISTS public.gre_detalles VALIDATE CONSTRAINT ck_gre_detalles_estado_valid;

ALTER TABLE IF EXISTS public.sire_files VALIDATE CONSTRAINT ck_sire_files_ids_required;
ALTER TABLE IF EXISTS public.sire_files VALIDATE CONSTRAINT ck_sire_files_period_sync;
ALTER TABLE IF EXISTS public.sire_files VALIDATE CONSTRAINT ck_sire_files_estado_valid;
ALTER TABLE IF EXISTS public.sire_files VALIDATE CONSTRAINT ck_sire_files_status_valid;
ALTER TABLE IF EXISTS public.sire_files VALIDATE CONSTRAINT ck_sire_files_file_size_nonnegative;
ALTER TABLE IF EXISTS public.sire_files VALIDATE CONSTRAINT ck_sire_files_total_registros_nonnegative;
ALTER TABLE IF EXISTS public.sire_files VALIDATE CONSTRAINT ck_sire_files_period_length;
ALTER TABLE IF EXISTS public.sire_files VALIDATE CONSTRAINT ck_sire_files_tipo_length;

ALTER TABLE IF EXISTS public.sire_registros_detalle VALIDATE CONSTRAINT ck_sire_registros_detalle_ids_required;
ALTER TABLE IF EXISTS public.sire_registros_detalle VALIDATE CONSTRAINT ck_sire_registros_detalle_total_nonnegative;
ALTER TABLE IF EXISTS public.sire_registros_detalle VALIDATE CONSTRAINT ck_sire_registros_detalle_fecha_required;
ALTER TABLE IF EXISTS public.sire_registros_detalle VALIDATE CONSTRAINT ck_sire_registros_detalle_estado_valid;
ALTER TABLE IF EXISTS public.sire_registros_detalle VALIDATE CONSTRAINT ck_sire_registros_detalle_tipo_nonempty;
ALTER TABLE IF EXISTS public.sire_registros_detalle VALIDATE CONSTRAINT ck_sire_registros_detalle_serie_nonempty;
ALTER TABLE IF EXISTS public.sire_registros_detalle VALIDATE CONSTRAINT ck_sire_registros_detalle_numero_nonempty;

-- ----------------------------------------------------------------------------
-- Unicidades operativas e índices de soporte.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_gre_guias_tenant_idempotency_key
ON public.gre_guias (tenant_id, idempotency_key)
WHERE tenant_id IS NOT NULL
  AND idempotency_key IS NOT NULL
  AND btrim(idempotency_key) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_gre_guias_tenant_serie_correlativo
ON public.gre_guias (tenant_id, upper(serie), correlativo)
WHERE tenant_id IS NOT NULL
  AND serie IS NOT NULL
  AND btrim(serie) <> ''
  AND correlativo IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_sire_files_tenant_periodo_tipo
ON public.sire_files (tenant_id, upper(periodo), upper(tipo))
WHERE tenant_id IS NOT NULL
  AND periodo IS NOT NULL
  AND btrim(periodo) <> ''
  AND tipo IS NOT NULL
  AND btrim(tipo) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_sire_registros_detalle_tenant_cpe
ON public.sire_registros_detalle (tenant_id, cpe_id)
WHERE tenant_id IS NOT NULL
  AND cpe_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gre_guias_tenant_retry_queue_runtime
ON public.gre_guias (tenant_id, estado, retry_count, next_retry_at, updated_at DESC)
WHERE tenant_id IS NOT NULL
  AND estado IN ('RECHAZADO', 'ERROR');

CREATE INDEX IF NOT EXISTS idx_sire_files_tenant_estado_updated_runtime
ON public.sire_files (tenant_id, estado, updated_at DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sire_registros_detalle_tenant_reporte_cpe_runtime
ON public.sire_registros_detalle (tenant_id, reporte_id, cpe_id, fecha_registro DESC)
WHERE tenant_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'gre_guias');
SELECT app.apply_tenant_policy('public', 'gre_detalles');
SELECT app.apply_tenant_policy('public', 'sire_files');
SELECT app.apply_tenant_policy('public', 'sire_registros_detalle');

COMMIT;
