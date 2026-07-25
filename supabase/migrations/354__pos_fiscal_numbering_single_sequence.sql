-- ============================================================================
-- 354__pos_fiscal_numbering_single_sequence.sql
-- Una serie fiscal (Fxxx/Bxxx) debe tener un único correlativo por tenant.
-- POS y Documentos usaban contadores independientes, lo que permitía emitir dos
-- comprobantes distintos con el mismo número fiscal.
-- ============================================================================

BEGIN;

-- Llevar el contador canónico hasta el máximo número ya utilizado por cualquier
-- flujo. No se renumeran documentos históricos.
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
insertadas AS (
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
  ON CONFLICT DO NOTHING
  RETURNING id
)
UPDATE public.documento_series ds
SET
  correlativo_actual = GREATEST(ds.correlativo_actual, m.correlativo),
  correlativo_maximo = GREATEST(ds.correlativo_maximo, m.correlativo, 1),
  updated_at = now()
FROM maximos m
WHERE ds.tenant_id = m.tenant_id
  AND upper(ds.tipo_documento) = m.tipo_documento
  AND upper(ds.serie) = m.serie
  AND COALESCE(ds.activo, true);

CREATE OR REPLACE FUNCTION public.obtener_siguiente_numero_pos(
  p_tenant_id uuid,
  p_serie text DEFAULT 'T001',
  p_tipo_documento text DEFAULT 'TICKET',
  p_caja_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_serie text := upper(COALESCE(NULLIF(btrim(COALESCE(p_serie, '')), ''), 'T001'));
  v_tipo text := upper(COALESCE(NULLIF(btrim(COALESCE(p_tipo_documento, '')), ''), 'TICKET'));
  v_id uuid;
  v_actual bigint;
  v_maximo bigint;
  v_next bigint;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED';
  END IF;

  -- Bxxx/Fxxx son números fiscales: todas las cajas y todos los módulos deben
  -- reservarlos en documento_series. Txxx conserva numeración interna por caja.
  IF v_serie ~ '^B[A-Z0-9]{3}$' THEN
    RETURN public.obtener_siguiente_numero_documento(p_tenant_id, 'BOLETA', v_serie);
  ELSIF v_serie ~ '^F[A-Z0-9]{3}$' THEN
    RETURN public.obtener_siguiente_numero_documento(p_tenant_id, 'FACTURA', v_serie);
  END IF;

  INSERT INTO public.pos_numeracion (
    id, tenant_id, tipo_documento, serie, caja_id, correlativo_actual,
    correlativo_maximo, activo, estado, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), p_tenant_id, v_tipo, v_serie, p_caja_id, 0,
    99999999, true, 'ACTIVO', now(), now()
  )
  ON CONFLICT DO NOTHING;

  SELECT pn.id, pn.correlativo_actual, pn.correlativo_maximo
  INTO v_id, v_actual, v_maximo
  FROM public.pos_numeracion pn
  WHERE pn.tenant_id = p_tenant_id
    AND upper(COALESCE(pn.tipo_documento, 'TICKET')) = v_tipo
    AND upper(COALESCE(pn.serie, 'T001')) = v_serie
    AND (
      (p_caja_id IS NULL AND pn.caja_id IS NULL)
      OR pn.caja_id = p_caja_id
    )
    AND COALESCE(pn.activo, true)
  ORDER BY COALESCE(pn.updated_at, pn.created_at, now()) DESC, pn.id::text DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'POS_NUMERACION_NOT_FOUND: tenant=% serie=% tipo=% caja=%',
      p_tenant_id, v_serie, v_tipo, COALESCE(p_caja_id::text, 'NULL');
  END IF;

  v_next := COALESCE(v_actual, 0) + 1;
  IF v_maximo IS NOT NULL AND v_next > v_maximo THEN
    RAISE EXCEPTION 'POS_NUMERACION_MAX_REACHED: tenant=% serie=% tipo=% caja=% next=% max=%',
      p_tenant_id, v_serie, v_tipo, COALESCE(p_caja_id::text, 'NULL'), v_next, v_maximo;
  END IF;

  UPDATE public.pos_numeracion
  SET correlativo_actual = v_next,
      updated_at = now()
  WHERE id = v_id;

  RETURN lpad(v_next::text, 8, '0');
END;
$$;

COMMENT ON FUNCTION public.obtener_siguiente_numero_pos(uuid, text, text, uuid)
IS 'Reserva B/F en documento_series (secuencia fiscal única); T y otras series conservan secuencia POS por caja.';

COMMIT;
