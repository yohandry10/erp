-- ============================================================================
-- 033__views_fiscal_kpis_alignment.sql
-- Alinea vistas fiscales consumidas por CPE/reportes.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Vista de auditoría CPE + documentos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_cpe_documentos_auditoria AS
SELECT
  c.id AS cpe_id,
  c.tenant_id,
  c.documento_id,
  COALESCE(NULLIF(btrim(c.tipo_documento), ''), NULLIF(btrim(d.tipo_documento), '')) AS tipo_documento,
  COALESCE(NULLIF(btrim(c.serie), ''), NULLIF(btrim(d.serie), '')) AS serie,
  COALESCE(NULLIF(btrim(c.numero::text), ''), NULLIF(btrim(d.numero::text), '')) AS numero,
  COALESCE(NULLIF(btrim(c.estado), ''), 'PENDIENTE') AS estado_cpe,
  COALESCE(NULLIF(btrim(c.sunat_status), ''), NULLIF(btrim(c.estado_sunat), ''), NULLIF(btrim(d.estado_sunat), '')) AS estado_sunat,
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

-- ----------------------------------------------------------------------------
-- KPIs SUNAT multitenant por periodo (día)
-- ----------------------------------------------------------------------------
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
        NULLIF(btrim(c.sunat_status), ''),
        NULLIF(btrim(c.estado_sunat), ''),
        NULLIF(btrim(d.estado_sunat), ''),
        NULLIF(btrim(c.estado), ''),
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
        NULLIF(btrim(c.sunat_status), ''),
        NULLIF(btrim(c.estado_sunat), ''),
        NULLIF(btrim(c.estado), ''),
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
