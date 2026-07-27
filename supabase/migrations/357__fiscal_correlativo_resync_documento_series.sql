-- ============================================================================
-- 357__fiscal_correlativo_resync_documento_series.sql
-- El POS derivaba el correlativo fiscal del ticket interno (serie T### con su
-- propio contador por caja) en lugar de reservarlo en documento_series. Eso
-- dejó comprobantes emitidos por encima del contador canónico: la secuencia
-- fiscal volvería a entregar números ya usados.
--
-- Esta migración realinea el contador de cada serie fiscal con el máximo
-- correlativo ya emitido. Nunca baja un contador y no renumera documentos
-- históricos. El origen del desfase queda cerrado en el POS, que ahora reserva
-- el correlativo fiscal en documento_series.
-- ============================================================================

BEGIN;

WITH numeros_usados AS (
  SELECT
    d.tenant_id,
    CASE
      WHEN upper(d.tipo_documento) IN ('01', 'FACTURA') THEN 'FACTURA'
      ELSE 'BOLETA'
    END AS tipo_documento,
    upper(d.serie) AS serie,
    app.to_int_or_zero(d.numero) AS correlativo
  FROM public.documentos d
  WHERE d.tenant_id IS NOT NULL
    AND upper(d.tipo_documento) IN ('01', '03', 'FACTURA', 'BOLETA')
    AND upper(COALESCE(d.serie, '')) ~ '^[FB][A-Z0-9]{3}$'

  UNION ALL

  SELECT
    c.tenant_id,
    CASE
      WHEN upper(COALESCE(c.tipo_documento, '')) IN ('01', 'FACTURA') THEN 'FACTURA'
      ELSE 'BOLETA'
    END,
    upper(c.serie),
    app.to_int_or_zero(c.numero)
  FROM public.cpe c
  WHERE c.tenant_id IS NOT NULL
    AND upper(COALESCE(c.tipo_documento, '')) IN ('01', '03', 'FACTURA', 'BOLETA')
    AND upper(COALESCE(c.serie, '')) ~ '^[FB][A-Z0-9]{3}$'

  UNION ALL

  SELECT
    v.tenant_id,
    CASE WHEN upper(v.serie) LIKE 'F%' THEN 'FACTURA' ELSE 'BOLETA' END,
    upper(v.serie),
    app.to_int_or_zero(
      COALESCE(NULLIF(v.correlativo, ''), split_part(v.numero_ticket, '-', 2))
    )
  FROM public.ventas_pos v
  WHERE v.tenant_id IS NOT NULL
    AND upper(COALESCE(v.serie, '')) ~ '^[FB][A-Z0-9]{3}$'
),
maximos AS (
  SELECT tenant_id, tipo_documento, serie, max(correlativo) AS correlativo
  FROM numeros_usados
  GROUP BY tenant_id, tipo_documento, serie
),
faltantes AS (
  INSERT INTO public.documento_series (
    id,
    tenant_id,
    tipo_documento,
    serie,
    correlativo_actual,
    correlativo_maximo,
    longitud_correlativo,
    activo,
    estado,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    m.tenant_id,
    m.tipo_documento,
    m.serie,
    GREATEST(m.correlativo, 0),
    99999999,
    8,
    true,
    'ACTIVO',
    now(),
    now()
  FROM maximos m
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.documento_series ds
    WHERE ds.tenant_id = m.tenant_id
      AND upper(ds.tipo_documento) = m.tipo_documento
      AND upper(ds.serie) = m.serie
      AND COALESCE(ds.activo, true)
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
UPDATE public.documento_series ds
SET
  correlativo_actual = GREATEST(ds.correlativo_actual, m.correlativo),
  updated_at = now()
FROM maximos m
WHERE ds.tenant_id = m.tenant_id
  AND upper(ds.tipo_documento) = m.tipo_documento
  AND upper(ds.serie) = m.serie
  AND COALESCE(ds.activo, true)
  AND ds.correlativo_actual < m.correlativo;

COMMIT;
