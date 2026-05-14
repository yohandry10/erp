-- ============================================================================
-- 224__documentos_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en documentos.
-- Tablas foco: public.documentos, public.documento_archivos.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

DROP VIEW IF EXISTS public.v_kpis_sunat_multitenant;
DROP VIEW IF EXISTS public.vw_cpe_documentos_auditoria;
DROP VIEW IF EXISTS public.v_documentos_completos;
DROP VIEW IF EXISTS public.v_documentos_pendientes_sunat;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_documentos_estado_224(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'BORRADOR'));
  IF v_estado IN ('ACTIVO', 'DRAFT', 'PENDIENTE') THEN v_estado := 'BORRADOR'; END IF;
  IF v_estado IN ('ENVIADO', 'ACEPTADO', 'ACEPTADA') THEN v_estado := 'ENVIADO_SUNAT'; END IF;
  IF v_estado NOT IN ('BORRADOR', 'EMITIDO', 'ENVIADO_SUNAT', 'OBSERVADO', 'RECHAZADO', 'ANULADO') THEN
    v_estado := 'BORRADOR';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_documento_archivos_estado_224(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ACTIVO'));
  IF v_estado NOT IN ('ACTIVO', 'ARCHIVADO', 'ELIMINADO') THEN
    v_estado := 'ACTIVO';
  END IF;
  RETURN v_estado::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion a citext para filtros case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.documentos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_documentos_estado_224(estado::text);

ALTER TABLE public.documento_archivos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_documento_archivos_estado_224(estado::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.documentos d
SET estado = app.normalize_documentos_estado_224(d.estado::text),
    updated_at = now()
WHERE d.id IS NOT NULL;

UPDATE public.documento_archivos a
SET estado = app.normalize_documento_archivos_estado_224(a.estado::text),
    updated_at = now()
WHERE a.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documentos_tenant_estado_ci_runtime_224
ON public.documentos (tenant_id, estado, fecha_emision DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documento_archivos_tenant_estado_ci_runtime_224
ON public.documento_archivos (tenant_id, estado, uploaded_at DESC, created_at DESC);

CREATE OR REPLACE VIEW public.v_documentos_completos AS
SELECT
  d.*,
  c.estado_sunat::text AS cpe_estado_sunat,
  c.error_message AS cpe_error_message
FROM public.documentos d
LEFT JOIN public.cpe c ON c.documento_id = d.id;

CREATE OR REPLACE VIEW public.v_documentos_pendientes_sunat AS
SELECT *
FROM public.documentos
WHERE estado IN ('BORRADOR', 'EMITIDO');

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
  d.estado::text AS documento_estado,
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
        NULLIF(btrim(d.estado::text), ''),
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
