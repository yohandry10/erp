-- ============================================================================
-- 110__pos_ticket_numeracion_runtime_alignment.sql
-- Alineación runtime de numeración POS y contrato de tickets en ventas_pos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ventas_pos: columnas y tipos esperados por runtime POS.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ventas_pos
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS correlativo text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- numero_ticket debe ser texto (ej: B001-00000042), no entero.
DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT c.data_type
  INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'ventas_pos'
    AND c.column_name = 'numero_ticket';

  IF v_data_type IS NULL THEN
    ALTER TABLE public.ventas_pos
      ADD COLUMN numero_ticket text;
  ELSIF v_data_type <> 'text' THEN
    ALTER TABLE public.ventas_pos
      ALTER COLUMN numero_ticket TYPE text
      USING NULLIF(btrim(numero_ticket::text), '');
  END IF;
END
$$;

-- impuestos debe ser numérico para cálculos/reportes.
DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT c.data_type
  INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'ventas_pos'
    AND c.column_name = 'impuestos';

  IF v_data_type IS NULL THEN
    ALTER TABLE public.ventas_pos
      ADD COLUMN impuestos numeric(14,2) DEFAULT 0;
  ELSIF v_data_type <> 'numeric' THEN
    ALTER TABLE public.ventas_pos
      ALTER COLUMN impuestos TYPE numeric(14,2)
      USING app.to_numeric_or_zero(impuestos::text);
  END IF;
END
$$;

-- ultimo_intento_facturacion se usa como timestamp en backend.
DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT c.data_type
  INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'ventas_pos'
    AND c.column_name = 'ultimo_intento_facturacion';

  IF v_data_type IS NULL THEN
    ALTER TABLE public.ventas_pos
      ADD COLUMN ultimo_intento_facturacion timestamptz;
  ELSIF v_data_type <> 'timestamp with time zone' THEN
    ALTER TABLE public.ventas_pos
      ALTER COLUMN ultimo_intento_facturacion TYPE timestamptz
      USING (
        CASE
          WHEN ultimo_intento_facturacion IS NULL THEN NULL
          WHEN ultimo_intento_facturacion::text ~ '^[0-9]{13}$'
            THEN to_timestamp((ultimo_intento_facturacion::numeric / 1000)::double precision)
          WHEN ultimo_intento_facturacion::text ~ '^[0-9]{10}$'
            THEN to_timestamp(ultimo_intento_facturacion::double precision)
          ELSE NULL
        END
      );
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.ventas_pos
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN impuestos TYPE numeric(14,2) USING app.to_numeric_or_zero(impuestos::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN fecha SET DEFAULT now();

-- Backfill de formato de ticket/serie/correlativo.
WITH normalized AS (
  SELECT
    v.id,
    upper(
      COALESCE(
        NULLIF(btrim(COALESCE(v.serie, '')), ''),
        NULLIF(split_part(COALESCE(v.numero_ticket, ''), '-', 1), ''),
        'T001'
      )
    ) AS serie_norm,
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
    ) AS correlativo_norm
  FROM public.ventas_pos v
)
UPDATE public.ventas_pos v
SET
  serie = n.serie_norm,
  correlativo = right(lpad(n.correlativo_norm, 8, '0'), 8),
  numero_ticket = n.serie_norm || '-' || right(lpad(n.correlativo_norm, 8, '0'), 8),
  subtotal = COALESCE(v.subtotal, 0),
  impuestos = COALESCE(v.impuestos, 0),
  total = COALESCE(v.total, 0),
  fecha = COALESCE(v.fecha, v.created_at, now()),
  idempotency_key = NULLIF(btrim(COALESCE(v.idempotency_key, '')), ''),
  updated_at = now()
FROM normalized n
WHERE v.id = n.id
  AND (
    v.serie IS NULL OR btrim(v.serie) = ''
    OR v.correlativo IS NULL OR btrim(v.correlativo) = ''
    OR v.numero_ticket IS NULL OR btrim(v.numero_ticket) = ''
    OR position('-' IN COALESCE(v.numero_ticket, '')) = 0
    OR v.impuestos IS NULL
    OR v.fecha IS NULL
  );

-- ----------------------------------------------------------------------------
-- pos_numeracion: contrato operativo de correlativos POS.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pos_numeracion
  ADD COLUMN IF NOT EXISTS serie text DEFAULT 'T001',
  ADD COLUMN IF NOT EXISTS tipo_documento text DEFAULT 'TICKET',
  ADD COLUMN IF NOT EXISTS correlativo_actual bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correlativo_maximo bigint DEFAULT 99999999,
  ADD COLUMN IF NOT EXISTS caja_id uuid,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.pos_numeracion
  ALTER COLUMN correlativo_actual TYPE bigint USING COALESCE(correlativo_actual::bigint, 0),
  ALTER COLUMN correlativo_maximo TYPE bigint USING COALESCE(correlativo_maximo::bigint, 99999999);

CREATE OR REPLACE FUNCTION app.normalize_pos_numeracion_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.serie := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.serie, '')), ''), 'T001'));
  NEW.tipo_documento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), 'TICKET'));
  NEW.correlativo_actual := GREATEST(COALESCE(NEW.correlativo_actual, 0), 0);
  NEW.correlativo_maximo := GREATEST(COALESCE(NEW.correlativo_maximo, 99999999), 1);
  NEW.correlativo_maximo := GREATEST(NEW.correlativo_maximo, NEW.correlativo_actual);
  NEW.activo := COALESCE(
    NEW.activo,
    CASE WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false ELSE true END
  );
  NEW.estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    NEW.tipo_documento || '-' || NEW.serie
  );
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pos_numeracion_row ON public.pos_numeracion;
CREATE TRIGGER trg_normalize_pos_numeracion_row
BEFORE INSERT OR UPDATE ON public.pos_numeracion
FOR EACH ROW
EXECUTE FUNCTION app.normalize_pos_numeracion_row();

UPDATE public.pos_numeracion
SET updated_at = COALESCE(updated_at, now())
WHERE true;

SELECT app.add_fk_if_possible('pos_numeracion', 'caja_id', 'cajas', 'id', 'fk_pos_numeracion_caja_id');

CREATE INDEX IF NOT EXISTS idx_pos_numeracion_scope_runtime
ON public.pos_numeracion (tenant_id, tipo_documento, serie, caja_id, activo, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ventas_pos_tenant_serie_correlativo_runtime
ON public.ventas_pos (tenant_id, serie, correlativo);

CREATE INDEX IF NOT EXISTS idx_ventas_pos_tenant_ticket_runtime
ON public.ventas_pos (tenant_id, numero_ticket);

-- ----------------------------------------------------------------------------
-- RPC: siguiente correlativo POS (serie + alcance opcional por caja).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_siguiente_numero_pos(
  p_tenant_id uuid,
  p_serie text DEFAULT 'T001',
  p_tipo_documento text DEFAULT 'TICKET',
  p_caja_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
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

  INSERT INTO public.pos_numeracion (
    id, tenant_id, tipo_documento, serie, caja_id, correlativo_actual, correlativo_maximo, activo, estado, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), p_tenant_id, v_tipo, v_serie, p_caja_id, 0, 99999999, true, 'ACTIVO', now(), now()
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
    AND COALESCE(pn.activo, true) = true
  ORDER BY COALESCE(pn.updated_at, pn.created_at, now()) DESC, pn.id::text DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.pos_numeracion (
      id, tenant_id, tipo_documento, serie, caja_id, correlativo_actual, correlativo_maximo, activo, estado, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), p_tenant_id, v_tipo, v_serie, p_caja_id, 0, 99999999, true, 'ACTIVO', now(), now()
    )
    RETURNING id, correlativo_actual, correlativo_maximo INTO v_id, v_actual, v_maximo;
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

-- ----------------------------------------------------------------------------
-- RPC: POS transaccional (alineación de ticket serie-correlativo).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_registrar_venta_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_cliente_id uuid DEFAULT NULL,
  p_cliente_documento text DEFAULT NULL,
  p_cliente_nombre text DEFAULT NULL,
  p_metodo_pago text DEFAULT 'efectivo',
  p_items jsonb DEFAULT '[]'::jsonb,
  p_serie text DEFAULT 'B001',
  p_sesion_caja_id uuid DEFAULT NULL,
  p_vendedor text DEFAULT NULL,
  p_max_descuento_pct numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_pagos jsonb DEFAULT NULL
)
RETURNS TABLE (
  venta_id uuid,
  numero_ticket text,
  subtotal numeric,
  impuestos numeric,
  total numeric
)
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_igv numeric := 0;
  v_correlativo text;
  v_ticket text;
  v_venta_id uuid;
  v_serie text := upper(COALESCE(NULLIF(btrim(COALESCE(p_serie, '')), ''), 'B001'));
BEGIN
  SELECT COALESCE(SUM(app.to_numeric_or_zero(i->>'subtotal')), 0)
  INTO v_subtotal
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS i;

  v_igv := round(v_subtotal * 0.18, 2);
  v_total := round(v_subtotal + v_igv, 2);
  v_correlativo := public.obtener_siguiente_numero_pos(p_tenant_id, v_serie, 'TICKET', p_sesion_caja_id);
  v_ticket := v_serie || '-' || v_correlativo;

  INSERT INTO public.ventas_pos(
    id,
    tenant_id,
    cliente_id,
    usuario_id,
    cliente_documento,
    cliente_nombre,
    metodo_pago,
    sesion_caja_id,
    subtotal,
    impuestos,
    total,
    cpe_pendiente,
    estado,
    numero_ticket,
    serie,
    correlativo,
    idempotency_key,
    fecha,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    p_tenant_id,
    p_cliente_id,
    p_usuario_id,
    p_cliente_documento,
    p_cliente_nombre,
    p_metodo_pago,
    p_sesion_caja_id,
    v_subtotal,
    v_igv,
    v_total,
    true,
    'PAGADA',
    v_ticket,
    v_serie,
    v_correlativo,
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''),
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_venta_id;

  INSERT INTO public.outbox_events(
    id, tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, idempotency_key, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(),
    p_tenant_id,
    'venta_pos',
    v_venta_id::text,
    'venta_pos.registrada',
    jsonb_build_object(
      'venta_id', v_venta_id,
      'cliente_id', p_cliente_id,
      'total', v_total,
      'metodo_pago', p_metodo_pago,
      'pagos', p_pagos
    ),
    'pending',
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''),
    now(),
    now()
  );

  RETURN QUERY
  SELECT v_venta_id, v_ticket, v_subtotal, v_igv, v_total;
END;
$$;

-- Firma legacy sin idempotency/pagos.
CREATE OR REPLACE FUNCTION public.pos_registrar_venta_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_cliente_id uuid,
  p_cliente_documento text,
  p_cliente_nombre text,
  p_metodo_pago text,
  p_items jsonb,
  p_serie text,
  p_sesion_caja_id uuid,
  p_vendedor text,
  p_max_descuento_pct numeric
)
RETURNS TABLE (
  venta_id uuid,
  numero_ticket text,
  subtotal numeric,
  impuestos numeric,
  total numeric
)
LANGUAGE sql
SET search_path = public, app, pg_temp
AS $$
  SELECT *
  FROM public.pos_registrar_venta_tx(
    p_tenant_id,
    p_usuario_id,
    p_cliente_id,
    p_cliente_documento,
    p_cliente_nombre,
    p_metodo_pago,
    p_items,
    p_serie,
    p_sesion_caja_id,
    p_vendedor,
    p_max_descuento_pct,
    NULL,
    NULL
  );
$$;

COMMIT;
