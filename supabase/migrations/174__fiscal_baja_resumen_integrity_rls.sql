-- ============================================================================
-- 174__fiscal_baja_resumen_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para flujo SUNAT RA/RC.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.detalle_comunicacion_baja d
SET tenant_id = cb.tenant_id
FROM public.comunicaciones_baja cb
WHERE d.comunicacion_id = cb.id
  AND cb.tenant_id IS NOT NULL
  AND (d.tenant_id IS NULL OR d.tenant_id <> cb.tenant_id);

UPDATE public.detalle_comunicacion_baja d
SET tenant_id = c.tenant_id
FROM public.cpe c
WHERE d.cpe_id = c.id
  AND c.tenant_id IS NOT NULL
  AND d.tenant_id IS NULL;

UPDATE public.detalle_resumen_diario d
SET tenant_id = r.tenant_id
FROM public.resumenes_diarios r
WHERE d.resumen_id = r.id
  AND r.tenant_id IS NOT NULL
  AND (d.tenant_id IS NULL OR d.tenant_id <> r.tenant_id);

UPDATE public.detalle_resumen_diario d
SET tenant_id = c.tenant_id
FROM public.cpe c
WHERE d.cpe_id = c.id
  AND c.tenant_id IS NOT NULL
  AND d.tenant_id IS NULL;

UPDATE public.validaciones_sunat v
SET tenant_id = c.tenant_id
FROM public.cpe c
WHERE v.cpe_id = c.id
  AND c.tenant_id IS NOT NULL
  AND (v.tenant_id IS NULL OR v.tenant_id <> c.tenant_id);

UPDATE public.validaciones_sunat v
SET tenant_id = d.tenant_id
FROM public.documentos d
WHERE v.documento_id = d.id
  AND d.tenant_id IS NOT NULL
  AND v.tenant_id IS NULL;

-- ----------------------------------------------------------------------------
-- FKs runtime para embeds y joins PostgREST.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('detalle_comunicacion_baja', 'comunicacion_id', 'comunicaciones_baja', 'id', 'detalle_comunicacion_baja_comunicacion_id_fkey');
SELECT app.add_fk_if_possible('detalle_comunicacion_baja', 'cpe_id', 'cpe', 'id', 'detalle_comunicacion_baja_cpe_id_fkey');
SELECT app.add_fk_if_possible('detalle_resumen_diario', 'resumen_id', 'resumenes_diarios', 'id', 'detalle_resumen_diario_resumen_id_fkey');
SELECT app.add_fk_if_possible('detalle_resumen_diario', 'cpe_id', 'cpe', 'id', 'detalle_resumen_diario_cpe_id_fkey');
SELECT app.add_fk_if_possible('validaciones_sunat', 'cpe_id', 'cpe', 'id', 'validaciones_sunat_cpe_id_fkey');
SELECT app.add_fk_if_possible('validaciones_sunat', 'documento_id', 'documentos', 'id', 'validaciones_sunat_documento_id_fkey');

-- ----------------------------------------------------------------------------
-- Dedupe defensivo para llaves unicas operativas.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    d.id,
    row_number() OVER (
      PARTITION BY d.tenant_id, d.comunicacion_id, d.cpe_id
      ORDER BY COALESCE(d.updated_at, d.created_at, now()) DESC, d.id::text DESC
    ) AS rn
  FROM public.detalle_comunicacion_baja d
  WHERE d.tenant_id IS NOT NULL
    AND d.comunicacion_id IS NOT NULL
    AND d.cpe_id IS NOT NULL
)
DELETE FROM public.detalle_comunicacion_baja d
USING ranked r
WHERE d.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    d.id,
    row_number() OVER (
      PARTITION BY d.tenant_id, d.resumen_id, d.cpe_id
      ORDER BY COALESCE(d.updated_at, d.created_at, now()) DESC, d.id::text DESC
    ) AS rn
  FROM public.detalle_resumen_diario d
  WHERE d.tenant_id IS NOT NULL
    AND d.resumen_id IS NOT NULL
    AND d.cpe_id IS NOT NULL
)
DELETE FROM public.detalle_resumen_diario d
USING ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: detalle_comunicacion_baja.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_detalle_comunicacion_baja_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_comunicacion uuid;
  v_tenant_cpe uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.comunicacion_id := app.to_uuid_or_null(COALESCE(NEW.comunicacion_id::text, ''));
  NEW.cpe_id := app.to_uuid_or_null(COALESCE(NEW.cpe_id::text, ''));

  IF NEW.comunicacion_id IS NOT NULL THEN
    SELECT cb.tenant_id INTO v_tenant_comunicacion
    FROM public.comunicaciones_baja cb
    WHERE cb.id = NEW.comunicacion_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Comunicacion de baja no existe: %s', NEW.comunicacion_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_comunicacion;
    ELSIF v_tenant_comunicacion IS NOT NULL AND NEW.tenant_id <> v_tenant_comunicacion THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con comunicacion_baja en detalle_comunicacion_baja', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cpe_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_tenant_cpe
    FROM public.cpe c
    WHERE c.id = NEW.cpe_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('CPE no existe: %s', NEW.cpe_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_cpe;
    ELSIF v_tenant_cpe IS NOT NULL AND NEW.tenant_id <> v_tenant_cpe THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cpe en detalle_comunicacion_baja', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en detalle_comunicacion_baja', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_detalle_comunicacion_baja_tenant_consistency ON public.detalle_comunicacion_baja;
CREATE TRIGGER trg_enforce_detalle_comunicacion_baja_tenant_consistency
BEFORE INSERT OR UPDATE ON public.detalle_comunicacion_baja
FOR EACH ROW
EXECUTE FUNCTION app.enforce_detalle_comunicacion_baja_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: detalle_resumen_diario.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_detalle_resumen_diario_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_resumen uuid;
  v_tenant_cpe uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.resumen_id := app.to_uuid_or_null(COALESCE(NEW.resumen_id::text, ''));
  NEW.cpe_id := app.to_uuid_or_null(COALESCE(NEW.cpe_id::text, ''));

  IF NEW.resumen_id IS NOT NULL THEN
    SELECT r.tenant_id INTO v_tenant_resumen
    FROM public.resumenes_diarios r
    WHERE r.id = NEW.resumen_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Resumen diario no existe: %s', NEW.resumen_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_resumen;
    ELSIF v_tenant_resumen IS NOT NULL AND NEW.tenant_id <> v_tenant_resumen THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con resumen_diario en detalle_resumen_diario', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cpe_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_tenant_cpe
    FROM public.cpe c
    WHERE c.id = NEW.cpe_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('CPE no existe: %s', NEW.cpe_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_cpe;
    ELSIF v_tenant_cpe IS NOT NULL AND NEW.tenant_id <> v_tenant_cpe THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cpe en detalle_resumen_diario', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en detalle_resumen_diario', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_detalle_resumen_diario_tenant_consistency ON public.detalle_resumen_diario;
CREATE TRIGGER trg_enforce_detalle_resumen_diario_tenant_consistency
BEFORE INSERT OR UPDATE ON public.detalle_resumen_diario
FOR EACH ROW
EXECUTE FUNCTION app.enforce_detalle_resumen_diario_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: validaciones_sunat.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_validaciones_sunat_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_cpe uuid;
  v_tenant_documento uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cpe_id := app.to_uuid_or_null(COALESCE(NEW.cpe_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));

  IF NEW.cpe_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_tenant_cpe
    FROM public.cpe c
    WHERE c.id = NEW.cpe_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('CPE no existe: %s', NEW.cpe_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_cpe;
    ELSIF v_tenant_cpe IS NOT NULL AND NEW.tenant_id <> v_tenant_cpe THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cpe en validaciones_sunat', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.documento_id IS NOT NULL THEN
    SELECT d.tenant_id INTO v_tenant_documento
    FROM public.documentos d
    WHERE d.id = NEW.documento_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Documento no existe: %s', NEW.documento_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_tenant_documento;
    ELSIF v_tenant_documento IS NOT NULL AND NEW.tenant_id <> v_tenant_documento THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con documento en validaciones_sunat', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en validaciones_sunat', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_validaciones_sunat_tenant_consistency ON public.validaciones_sunat;
CREATE TRIGGER trg_enforce_validaciones_sunat_tenant_consistency
BEFORE INSERT OR UPDATE ON public.validaciones_sunat
FOR EACH ROW
EXECUTE FUNCTION app.enforce_validaciones_sunat_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio.
-- ----------------------------------------------------------------------------
ALTER TABLE public.comunicaciones_baja DROP CONSTRAINT IF EXISTS ck_comunicaciones_baja_estado_runtime;
ALTER TABLE public.comunicaciones_baja
  ADD CONSTRAINT ck_comunicaciones_baja_estado_runtime
  CHECK (estado IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ERROR', 'ANULADO'));

ALTER TABLE public.comunicaciones_baja DROP CONSTRAINT IF EXISTS ck_comunicaciones_baja_numero_runtime;
ALTER TABLE public.comunicaciones_baja
  ADD CONSTRAINT ck_comunicaciones_baja_numero_runtime
  CHECK (numero_comunicacion ~ '^RA-[0-9]{8}-[A-Z0-9]{3,}$');

ALTER TABLE public.comunicaciones_baja DROP CONSTRAINT IF EXISTS ck_comunicaciones_baja_cantidad_runtime;
ALTER TABLE public.comunicaciones_baja
  ADD CONSTRAINT ck_comunicaciones_baja_cantidad_runtime
  CHECK (
    cantidad_comprobantes >= 0
    AND cantidad_comprobantes = cardinality(COALESCE(comprobantes_ids, '{}'::uuid[]))
  );

ALTER TABLE public.comunicaciones_baja DROP CONSTRAINT IF EXISTS ck_comunicaciones_baja_fechas_runtime;
ALTER TABLE public.comunicaciones_baja
  ADD CONSTRAINT ck_comunicaciones_baja_fechas_runtime
  CHECK (fecha_generacion IS NOT NULL AND fecha_comunicacion IS NOT NULL AND fecha_comunicacion <= fecha_generacion);

ALTER TABLE public.resumenes_diarios DROP CONSTRAINT IF EXISTS ck_resumenes_diarios_estado_runtime;
ALTER TABLE public.resumenes_diarios
  ADD CONSTRAINT ck_resumenes_diarios_estado_runtime
  CHECK (estado IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ERROR', 'ANULADO'));

ALTER TABLE public.resumenes_diarios DROP CONSTRAINT IF EXISTS ck_resumenes_diarios_numero_runtime;
ALTER TABLE public.resumenes_diarios
  ADD CONSTRAINT ck_resumenes_diarios_numero_runtime
  CHECK (numero_resumen ~ '^RC-[0-9]{8}-[A-Z0-9]{3,}$');

ALTER TABLE public.resumenes_diarios DROP CONSTRAINT IF EXISTS ck_resumenes_diarios_totales_runtime;
ALTER TABLE public.resumenes_diarios
  ADD CONSTRAINT ck_resumenes_diarios_totales_runtime
  CHECK (
    cantidad_comprobantes >= 0
    AND cantidad_comprobantes = cardinality(COALESCE(comprobantes_ids, '{}'::uuid[]))
    AND total_gravadas >= 0
    AND total_exoneradas >= 0
    AND total_inafectas >= 0
    AND total_igv >= 0
    AND total_general >= 0
  );

ALTER TABLE public.resumenes_diarios DROP CONSTRAINT IF EXISTS ck_resumenes_diarios_fechas_runtime;
ALTER TABLE public.resumenes_diarios
  ADD CONSTRAINT ck_resumenes_diarios_fechas_runtime
  CHECK (fecha_generacion IS NOT NULL AND fecha_referencia IS NOT NULL AND fecha_referencia <= fecha_generacion);

ALTER TABLE public.detalle_comunicacion_baja DROP CONSTRAINT IF EXISTS ck_detalle_comunicacion_baja_tipo_runtime;
ALTER TABLE public.detalle_comunicacion_baja
  ADD CONSTRAINT ck_detalle_comunicacion_baja_tipo_runtime
  CHECK (
    tipo_documento IN ('01', '03', '07', '08')
    AND motivo_baja IS NOT NULL
    AND btrim(motivo_baja) <> ''
    AND orden >= 1
  );

ALTER TABLE public.detalle_comunicacion_baja DROP CONSTRAINT IF EXISTS ck_detalle_comunicacion_baja_estado_runtime;
ALTER TABLE public.detalle_comunicacion_baja
  ADD CONSTRAINT ck_detalle_comunicacion_baja_estado_runtime
  CHECK (estado IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO', 'ANULADO'));

ALTER TABLE public.detalle_resumen_diario DROP CONSTRAINT IF EXISTS ck_detalle_resumen_diario_tipo_runtime;
ALTER TABLE public.detalle_resumen_diario
  ADD CONSTRAINT ck_detalle_resumen_diario_tipo_runtime
  CHECK (
    tipo_documento IN ('01', '03', '07', '08')
    AND tipo_operacion IN ('1', '2', '3')
    AND orden >= 1
  );

ALTER TABLE public.detalle_resumen_diario DROP CONSTRAINT IF EXISTS ck_detalle_resumen_diario_totales_runtime;
ALTER TABLE public.detalle_resumen_diario
  ADD CONSTRAINT ck_detalle_resumen_diario_totales_runtime
  CHECK (
    total_gravadas >= 0
    AND total_exoneradas >= 0
    AND total_inafectas >= 0
    AND total_igv >= 0
    AND total >= 0
  );

ALTER TABLE public.detalle_resumen_diario DROP CONSTRAINT IF EXISTS ck_detalle_resumen_diario_estado_runtime;
ALTER TABLE public.detalle_resumen_diario
  ADD CONSTRAINT ck_detalle_resumen_diario_estado_runtime
  CHECK (estado IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO', 'ANULADO'));

ALTER TABLE public.validaciones_sunat DROP CONSTRAINT IF EXISTS ck_validaciones_sunat_estado_runtime;
ALTER TABLE public.validaciones_sunat
  ADD CONSTRAINT ck_validaciones_sunat_estado_runtime
  CHECK (estado IN ('PENDIENTE', 'VALIDO', 'INVALIDO', 'ERROR', 'VENCIDO'));

ALTER TABLE public.validaciones_sunat DROP CONSTRAINT IF EXISTS ck_validaciones_sunat_severidad_runtime;
ALTER TABLE public.validaciones_sunat
  ADD CONSTRAINT ck_validaciones_sunat_severidad_runtime
  CHECK (severidad IN ('INFO', 'WARN', 'ERROR', 'CRITICAL'));

ALTER TABLE public.validaciones_sunat DROP CONSTRAINT IF EXISTS ck_validaciones_sunat_tipo_runtime;
ALTER TABLE public.validaciones_sunat
  ADD CONSTRAINT ck_validaciones_sunat_tipo_runtime
  CHECK (tipo_validacion IN ('CERTIFICADO', 'RUC', 'CPE', 'GRE', 'SIRE', 'OTRO'));

ALTER TABLE public.validaciones_sunat DROP CONSTRAINT IF EXISTS ck_validaciones_sunat_ruc_runtime;
ALTER TABLE public.validaciones_sunat
  ADD CONSTRAINT ck_validaciones_sunat_ruc_runtime
  CHECK (ruc_consultado IS NULL OR ruc_consultado ~ '^[0-9]{8}([0-9]{3})?$');

ALTER TABLE public.validaciones_sunat DROP CONSTRAINT IF EXISTS ck_validaciones_sunat_fechas_runtime;
ALTER TABLE public.validaciones_sunat
  ADD CONSTRAINT ck_validaciones_sunat_fechas_runtime
  CHECK (expiracion_en IS NULL OR validado_en IS NULL OR expiracion_en >= validado_en);

ALTER TABLE public.comunicaciones_baja VALIDATE CONSTRAINT ck_comunicaciones_baja_estado_runtime;
ALTER TABLE public.comunicaciones_baja VALIDATE CONSTRAINT ck_comunicaciones_baja_numero_runtime;
ALTER TABLE public.comunicaciones_baja VALIDATE CONSTRAINT ck_comunicaciones_baja_cantidad_runtime;
ALTER TABLE public.comunicaciones_baja VALIDATE CONSTRAINT ck_comunicaciones_baja_fechas_runtime;

ALTER TABLE public.resumenes_diarios VALIDATE CONSTRAINT ck_resumenes_diarios_estado_runtime;
ALTER TABLE public.resumenes_diarios VALIDATE CONSTRAINT ck_resumenes_diarios_numero_runtime;
ALTER TABLE public.resumenes_diarios VALIDATE CONSTRAINT ck_resumenes_diarios_totales_runtime;
ALTER TABLE public.resumenes_diarios VALIDATE CONSTRAINT ck_resumenes_diarios_fechas_runtime;

ALTER TABLE public.detalle_comunicacion_baja VALIDATE CONSTRAINT ck_detalle_comunicacion_baja_tipo_runtime;
ALTER TABLE public.detalle_comunicacion_baja VALIDATE CONSTRAINT ck_detalle_comunicacion_baja_estado_runtime;

ALTER TABLE public.detalle_resumen_diario VALIDATE CONSTRAINT ck_detalle_resumen_diario_tipo_runtime;
ALTER TABLE public.detalle_resumen_diario VALIDATE CONSTRAINT ck_detalle_resumen_diario_totales_runtime;
ALTER TABLE public.detalle_resumen_diario VALIDATE CONSTRAINT ck_detalle_resumen_diario_estado_runtime;

ALTER TABLE public.validaciones_sunat VALIDATE CONSTRAINT ck_validaciones_sunat_estado_runtime;
ALTER TABLE public.validaciones_sunat VALIDATE CONSTRAINT ck_validaciones_sunat_severidad_runtime;
ALTER TABLE public.validaciones_sunat VALIDATE CONSTRAINT ck_validaciones_sunat_tipo_runtime;
ALTER TABLE public.validaciones_sunat VALIDATE CONSTRAINT ck_validaciones_sunat_ruc_runtime;
ALTER TABLE public.validaciones_sunat VALIDATE CONSTRAINT ck_validaciones_sunat_fechas_runtime;

-- ----------------------------------------------------------------------------
-- Indices de integridad por scope.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_detalle_comunicacion_baja_tenant_comunicacion_cpe
ON public.detalle_comunicacion_baja (tenant_id, comunicacion_id, cpe_id)
WHERE tenant_id IS NOT NULL
  AND comunicacion_id IS NOT NULL
  AND cpe_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_detalle_resumen_diario_tenant_resumen_cpe
ON public.detalle_resumen_diario (tenant_id, resumen_id, cpe_id)
WHERE tenant_id IS NOT NULL
  AND resumen_id IS NOT NULL
  AND cpe_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.comunicaciones_baja ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.comunicaciones_baja FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detalle_comunicacion_baja ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detalle_comunicacion_baja FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resumenes_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resumenes_diarios FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detalle_resumen_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detalle_resumen_diario FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.validaciones_sunat ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.validaciones_sunat FORCE ROW LEVEL SECURITY;

SELECT app.apply_tenant_policy('public', 'comunicaciones_baja');
SELECT app.apply_tenant_policy('public', 'detalle_comunicacion_baja');
SELECT app.apply_tenant_policy('public', 'resumenes_diarios');
SELECT app.apply_tenant_policy('public', 'detalle_resumen_diario');
SELECT app.apply_tenant_policy('public', 'validaciones_sunat');

COMMIT;
