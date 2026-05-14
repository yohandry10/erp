-- ============================================================================
-- 218__cpe_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados de CPE.
-- Tabla foco: public.cpe.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

DROP VIEW IF EXISTS public.cpe_documentos;
DROP VIEW IF EXISTS public.v_documentos_completos;
DROP VIEW IF EXISTS public.v_kpis_sunat_multitenant;
DROP VIEW IF EXISTS public.vw_cpe_documentos_auditoria;

-- ----------------------------------------------------------------------------
-- Cierre defensivo de columnas esperadas en runtime.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cpe
  ADD COLUMN IF NOT EXISTS sunat_status text,
  ADD COLUMN IF NOT EXISTS estado_sunat text;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cpe_estado_218(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'BORRADOR'));

  IF v_estado IN ('ACTIVO', 'DRAFT', 'PENDIENTE', 'PENDING') THEN v_estado := 'BORRADOR'; END IF;
  IF v_estado IN ('READY', 'LISTO', 'GENERADO') THEN v_estado := 'FIRMADO'; END IF;
  IF v_estado IN ('SENT', 'SENDING') THEN v_estado := 'ENVIADO'; END IF;
  IF v_estado IN ('ACCEPTED', 'ACEPTADA') THEN v_estado := 'ACEPTADO'; END IF;
  IF v_estado IN ('REJECTED', 'RECHAZADA') THEN v_estado := 'RECHAZADO'; END IF;
  IF v_estado IN ('FAILED') THEN v_estado := 'ERROR'; END IF;
  IF v_estado IN ('CANCELLED', 'ANULADA') THEN v_estado := 'ANULADO'; END IF;

  IF v_estado NOT IN ('BORRADOR', 'FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO', 'ERROR') THEN
    v_estado := 'BORRADOR';
  END IF;

  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_cpe_sunat_status_218(p_status text, p_estado text DEFAULT NULL)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_status text;
  v_estado text;
BEGIN
  v_estado := app.normalize_cpe_estado_218(COALESCE(p_estado, 'BORRADOR'))::text;
  v_status := upper(COALESCE(NULLIF(btrim(COALESCE(p_status, '')), ''), ''));

  IF v_status = '' THEN
    v_status := CASE
      WHEN v_estado = 'BORRADOR' THEN 'NOT_SENT'
      WHEN v_estado = 'FIRMADO' THEN 'READY'
      WHEN v_estado = 'ENVIADO' THEN 'SENDING'
      WHEN v_estado = 'ACEPTADO' THEN 'ACCEPTED'
      WHEN v_estado = 'RECHAZADO' THEN 'REJECTED'
      WHEN v_estado = 'ERROR' THEN 'ERROR'
      ELSE 'NOT_SENT'
    END;
  END IF;

  IF v_status IN ('BORRADOR', 'PENDIENTE', 'PENDING', 'NOT_SENT') THEN v_status := 'NOT_SENT'; END IF;
  IF v_status IN ('FIRMADO', 'LISTO', 'READY') THEN v_status := 'READY'; END IF;
  IF v_status IN ('ENVIADO', 'SENT', 'SENDING') THEN v_status := 'SENDING'; END IF;
  IF v_status IN ('ACEPTADO', 'ACCEPTED') THEN v_status := 'ACCEPTED'; END IF;
  IF v_status IN ('RECHAZADO', 'REJECTED') THEN v_status := 'REJECTED'; END IF;
  IF v_status IN ('FAILED', 'ERROR') THEN v_status := 'ERROR'; END IF;

  IF v_status NOT IN ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR') THEN
    v_status := 'NOT_SENT';
  END IF;

  RETURN v_status::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.map_cpe_estado_sunat_218(p_sunat_status text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  v_status := app.normalize_cpe_sunat_status_218(p_sunat_status, NULL)::text;

  RETURN (
    CASE
      WHEN v_status = 'NOT_SENT' THEN 'PENDIENTE'
      WHEN v_status = 'READY' THEN 'PENDIENTE'
      WHEN v_status = 'SENDING' THEN 'ENVIADO'
      WHEN v_status = 'ACCEPTED' THEN 'ACEPTADO'
      WHEN v_status = 'REJECTED' THEN 'RECHAZADO'
      ELSE 'ERROR'
    END
  )::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cpe
  ALTER COLUMN estado TYPE citext
  USING app.normalize_cpe_estado_218(estado::text),
  ALTER COLUMN sunat_status TYPE citext
  USING app.normalize_cpe_sunat_status_218(sunat_status::text, estado::text),
  ALTER COLUMN estado_sunat TYPE citext
  USING COALESCE(
    NULLIF(upper(btrim(COALESCE(estado_sunat::text, ''))), ''),
    app.map_cpe_estado_sunat_218(sunat_status::text)::text
  );

-- ----------------------------------------------------------------------------
-- Trigger de normalizacion en fila.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cpe_row_218()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_cpe_estado_218(NEW.estado::text);
  NEW.sunat_status := app.normalize_cpe_sunat_status_218(NEW.sunat_status::text, NEW.estado::text);
  NEW.estado_sunat := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.estado_sunat::text, ''))), ''),
    app.map_cpe_estado_sunat_218(NEW.sunat_status::text)::text
  )::citext;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cpe_row_218 ON public.cpe;
CREATE TRIGGER trg_normalize_cpe_row_218
BEFORE INSERT OR UPDATE ON public.cpe
FOR EACH ROW
EXECUTE FUNCTION app.normalize_cpe_row_218();

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.cpe c
SET
  estado = app.normalize_cpe_estado_218(c.estado::text),
  sunat_status = app.normalize_cpe_sunat_status_218(c.sunat_status::text, c.estado::text),
  estado_sunat = COALESCE(
    NULLIF(upper(btrim(COALESCE(c.estado_sunat::text, ''))), ''),
    app.map_cpe_estado_sunat_218(c.sunat_status::text)::text
  )::citext,
  updated_at = now()
WHERE c.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cpe_tenant_estado_ci_runtime_218
ON public.cpe (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cpe_tenant_sunat_status_ci_runtime_218
ON public.cpe (tenant_id, sunat_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cpe_retry_rechazado_runtime_218
ON public.cpe (tenant_id, updated_at DESC)
WHERE lower(estado::text) = 'rechazado';

CREATE OR REPLACE VIEW public.cpe_documentos AS
SELECT
  c.id,
  c.tenant_id,
  c.tipo_documento,
  c.serie,
  c.numero,
  c.estado::text AS estado,
  c.fecha_emision,
  COALESCE(c.total_venta, 0)::numeric(14,2) AS total,
  c.created_at,
  c.updated_at
FROM public.cpe c;

CREATE OR REPLACE VIEW public.v_documentos_completos AS
SELECT
  d.*,
  c.estado_sunat::text AS cpe_estado_sunat,
  c.error_message AS cpe_error_message
FROM public.documentos d
LEFT JOIN public.cpe c ON c.documento_id = d.id;

CREATE OR REPLACE VIEW public.vw_cpe_documentos_auditoria AS
SELECT
  c.id AS cpe_id,
  c.tenant_id,
  c.documento_id,
  COALESCE(NULLIF(btrim(c.tipo_documento), ''), NULLIF(btrim(d.tipo_documento), '')) AS tipo_documento,
  COALESCE(NULLIF(btrim(c.serie), ''), NULLIF(btrim(d.serie), '')) AS serie,
  COALESCE(NULLIF(btrim(c.numero::text), ''), NULLIF(btrim(d.numero::text), '')) AS numero,
  COALESCE(NULLIF(btrim(c.estado::text), ''), 'PENDIENTE') AS estado_cpe,
  COALESCE(NULLIF(btrim(c.sunat_status::text), ''), NULLIF(btrim(c.estado_sunat::text), ''), NULLIF(btrim(d.estado_sunat), '')) AS estado_sunat,
  COALESCE(
    app.to_numeric_or_zero(c.total_venta::text),
    app.to_numeric_or_zero(c.total::text),
    app.to_numeric_or_zero(d.total::text),
    0
  )::numeric(14,2) AS total,
  c.fecha_emision,
  c.created_at,
  c.updated_at,
  d.id AS documento_fk,
  d.estado AS documento_estado,
  d.fecha_emision AS documento_fecha_emision,
  d.error_sunat,
  c.error_message,
  CASE
    WHEN c.documento_id IS NULL THEN 'CPE_SIN_DOCUMENTO'
    WHEN d.id IS NULL THEN 'DOCUMENTO_NO_ENCONTRADO'
    WHEN COALESCE(NULLIF(btrim(c.tipo_documento), ''), '') <> COALESCE(NULLIF(btrim(d.tipo_documento), ''), '') THEN 'TIPO_DOC_DESALINEADO'
    WHEN ABS(
      COALESCE(app.to_numeric_or_zero(c.total_venta::text), app.to_numeric_or_zero(c.total::text), 0)
      - COALESCE(app.to_numeric_or_zero(d.total::text), 0)
    ) > 0.01 THEN 'TOTAL_DESALINEADO'
    ELSE 'OK'
  END AS estado_integridad
FROM public.cpe c
LEFT JOIN public.documentos d ON d.id = c.documento_id;

CREATE OR REPLACE VIEW public.v_kpis_sunat_multitenant AS
WITH docs_base AS (
  SELECT
    d.tenant_id,
    COALESCE(
      date_trunc('day', d.fecha_emision)::date,
      date_trunc('day', c.fecha_emision)::date,
      date_trunc('day', d.created_at)::date,
      date_trunc('day', c.created_at)::date,
      CURRENT_DATE
    ) AS periodo,
    upper(
      COALESCE(
        NULLIF(btrim(c.sunat_status::text), ''),
        NULLIF(btrim(c.estado_sunat::text), ''),
        NULLIF(btrim(d.estado_sunat), ''),
        NULLIF(btrim(c.estado::text), ''),
        NULLIF(btrim(d.estado), ''),
        'PENDIENTE'
      )
    ) AS estado_normalizado
  FROM public.documentos d
  LEFT JOIN public.cpe c
    ON c.documento_id = d.id
   AND c.tenant_id = d.tenant_id
  WHERE
    upper(COALESCE(d.tipo_documento, c.tipo_documento, '')) IN (
      '01', '03', '07', '08',
      'FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO'
    )
),
cpe_sueltos AS (
  SELECT
    c.tenant_id,
    COALESCE(
      date_trunc('day', c.fecha_emision)::date,
      date_trunc('day', c.created_at)::date,
      CURRENT_DATE
    ) AS periodo,
    upper(
      COALESCE(
        NULLIF(btrim(c.sunat_status::text), ''),
        NULLIF(btrim(c.estado_sunat::text), ''),
        NULLIF(btrim(c.estado::text), ''),
        'PENDIENTE'
      )
    ) AS estado_normalizado
  FROM public.cpe c
  WHERE c.documento_id IS NULL
),
base AS (
  SELECT * FROM docs_base
  UNION ALL
  SELECT * FROM cpe_sueltos
)
SELECT
  b.tenant_id,
  b.periodo,
  COUNT(*) FILTER (WHERE b.estado_normalizado IN ('ACEPTADO', 'APROBADO'))::bigint AS aceptados,
  COUNT(*) FILTER (WHERE b.estado_normalizado LIKE 'OBSERVAD%')::bigint AS observados,
  COUNT(*) FILTER (WHERE b.estado_normalizado IN ('RECHAZADO', 'ERROR', 'ANULADO'))::bigint AS rechazados,
  COUNT(*) FILTER (
    WHERE b.estado_normalizado NOT IN ('ACEPTADO', 'APROBADO', 'RECHAZADO', 'ERROR', 'ANULADO')
      AND b.estado_normalizado NOT LIKE 'OBSERVAD%'
  )::bigint AS pendientes,
  COUNT(*)::bigint AS total
FROM base b
GROUP BY b.tenant_id, b.periodo
ORDER BY b.tenant_id, b.periodo;

COMMIT;
