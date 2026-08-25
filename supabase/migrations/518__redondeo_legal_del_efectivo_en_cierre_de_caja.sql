-- 518__redondeo_legal_del_efectivo_en_cierre_de_caja.sql
--
-- La Circular 0033-2018-BCRP retiró la moneda de S/ 0,05 y ordena que, desde
-- 2019, el total pagado en efectivo se redondee a favor del consumidor. Los
-- céntimos siguen siendo unidad de cuenta y siguen vigentes para pagos no
-- efectivos. Por eso un libro que espera S/ 203,84 puede tener legalmente
-- S/ 203,80 físicos sin que los S/ 0,04 sean un faltante del cajero.
--
-- Alcance deliberadamente estrecho:
--   * venta íntegramente en efectivo, tenant Perú y moneda PEN;
--   * ajuste por venta de S/ 0,01 a S/ 0,09 y exactamente hasta el décimo
--     inferior (siempre a favor del consumidor);
--   * el cierre sólo reconoce la suma de ajustes documentados de su sesión;
--   * no cubre sobrantes, pagos mixtos/no efectivos, otras monedas o países.
--
-- El runtime previo sólo tenía metadata jsonb genérica: no existía evidencia
-- durable que distinguiera un redondeo real de un faltante casual. Se incorpora
-- un ledger mínimo, inmutable y privado, escrito dentro de la misma transacción
-- POS y ligado a venta + pago + movimiento. El cierre mantiene su FOR UPDATE y
-- exige que su diferencia negativa coincida exactamente con la suma viva del
-- ledger (una o muchas ventas). Cuando interviene supervisor, el writer vuelve a
-- comprobar rol y PIN dentro de la transacción y congela evidencia no reversible.
--
-- Rollback: reponer public.pos_registrar_venta_atomic_tx al dispatcher 471 y
-- public.cerrar_caja_tx a app.cerrar_caja_tx_471; retirar los endpoints SQL de
-- selector/gestión PIN 518, sus dos tablas privadas y las funciones/triggers 518.
-- Antes de retirar el ledger de redondeo debe conservarse su evidencia en el
-- archivo contable: borrarlo sin esa retención vuelve inexplicables los cortes.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Evidencia económica tipada. No se concede DML/SELECT directo a ningún rol de
-- API; sólo los SECURITY DEFINER 518 pueden escribirla o resumirla. Las FK y la
-- validación del writer congelan el mismo tenant/sesión de todos los impactos.
CREATE TABLE IF NOT EXISTS public.ajustes_redondeo_efectivo_pos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  sesion_caja_id uuid NOT NULL REFERENCES public.sesiones_caja(id) ON DELETE RESTRICT,
  venta_pos_id uuid NOT NULL REFERENCES public.ventas_pos(id) ON DELETE RESTRICT,
  pago_pos_id uuid NOT NULL REFERENCES public.ventas_pos_pagos(id) ON DELETE RESTRICT,
  movimiento_caja_id uuid NOT NULL REFERENCES public.movimientos_caja(id) ON DELETE RESTRICT,
  moneda text NOT NULL,
  monto_documento numeric(14,2) NOT NULL,
  monto_efectivo numeric(14,2) NOT NULL,
  monto_ajuste numeric(14,2) NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  evidencia_fingerprint text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ajuste_redondeo_efectivo_pos_moneda
    CHECK (upper(btrim(moneda)) = 'PEN'),
  CONSTRAINT ck_ajuste_redondeo_efectivo_pos_montos
    CHECK (
      monto_documento > 0
      AND monto_efectivo >= 0
      AND monto_ajuste BETWEEN 0.01 AND 0.09
      AND round(monto_documento - monto_efectivo, 2) = monto_ajuste
      AND round(monto_efectivo * 10, 0) = monto_efectivo * 10
    ),
  CONSTRAINT ck_ajuste_redondeo_efectivo_pos_fingerprint
    CHECK (evidencia_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ux_ajuste_redondeo_efectivo_pos_venta UNIQUE (tenant_id, venta_pos_id),
  CONSTRAINT ux_ajuste_redondeo_efectivo_pos_pago UNIQUE (tenant_id, pago_pos_id),
  CONSTRAINT ux_ajuste_redondeo_efectivo_pos_idempotencia UNIQUE (tenant_id, idempotency_key)
);

-- Reaplicar 518 sobre una base efímera que ya cargó una revisión anterior debe
-- converger al mismo contrato (el efectivo físico puede ser S/ 0,00 cuando el
-- documento completo vale entre S/ 0,01 y S/ 0,09).
ALTER TABLE public.ajustes_redondeo_efectivo_pos
  DROP CONSTRAINT IF EXISTS ck_ajuste_redondeo_efectivo_pos_montos;
ALTER TABLE public.ajustes_redondeo_efectivo_pos
  ADD CONSTRAINT ck_ajuste_redondeo_efectivo_pos_montos CHECK (
    monto_documento > 0
    AND monto_efectivo >= 0
    AND monto_ajuste BETWEEN 0.01 AND 0.09
    AND round(monto_documento - monto_efectivo, 2) = monto_ajuste
    AND round(monto_efectivo * 10, 0) = monto_efectivo * 10
  );

-- Registro privado de idempotencia de la rotación. No conserva el PIN ni una
-- huella determinista que permita fuerza bruta: el replay coteja el secreto
-- contra el bcrypt salado de la versión creada por 497.
CREATE TABLE IF NOT EXISTS public.supervisor_pin_rotaciones_518 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  supervisor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  pin_id uuid NOT NULL REFERENCES public.supervisor_pins(id) ON DELETE RESTRICT,
  pin_version integer NOT NULL CHECK (pin_version > 0),
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_supervisor_pin_rotacion_key_518 UNIQUE (tenant_id, idempotency_key)
);

ALTER TABLE public.supervisor_pin_rotaciones_518 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_pin_rotaciones_518 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.supervisor_pin_rotaciones_518
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS ix_ajuste_redondeo_efectivo_pos_sesion
  ON public.ajustes_redondeo_efectivo_pos(tenant_id, sesion_caja_id, created_at);

ALTER TABLE public.ajustes_redondeo_efectivo_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajustes_redondeo_efectivo_pos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ajustes_redondeo_efectivo_pos
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app.ajuste_redondeo_efectivo_inmutable_518()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'CASH_ROUNDING_EVIDENCE_IMMUTABLE' USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_ajuste_redondeo_efectivo_inmutable_518
  ON public.ajustes_redondeo_efectivo_pos;
CREATE TRIGGER trg_ajuste_redondeo_efectivo_inmutable_518
BEFORE UPDATE OR DELETE ON public.ajustes_redondeo_efectivo_pos
FOR EACH ROW EXECUTE FUNCTION app.ajuste_redondeo_efectivo_inmutable_518();

CREATE OR REPLACE FUNCTION app.rotacion_pin_inmutable_518()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'SUPERVISOR_PIN_ROTATION_EVIDENCE_IMMUTABLE'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_rotacion_pin_inmutable_518
  ON public.supervisor_pin_rotaciones_518;
CREATE TRIGGER trg_rotacion_pin_inmutable_518
BEFORE UPDATE OR DELETE ON public.supervisor_pin_rotaciones_518
FOR EACH ROW EXECUTE FUNCTION app.rotacion_pin_inmutable_518();

-- La huella comercial debe distinguir una venta que aplica el redondeo de otra
-- que cobra el total contable. De otro modo una misma clave podría reintentarse
-- cambiando ese impacto económico y el 469 la consideraría la misma intención.
CREATE OR REPLACE FUNCTION app.pos_intencion_comercial_469(p_intencion jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'cliente_id', app.to_uuid_or_null(coalesce(p_intencion->>'cliente_id', '')),
    'cliente_documento', btrim(coalesce(p_intencion->>'cliente_documento', '')),
    'cliente_tipo_documento', btrim(coalesce(p_intencion->>'cliente_tipo_documento', '')),
    'cliente_nombre', btrim(coalesce(p_intencion->>'cliente_nombre', '')),
    'cliente_direccion', btrim(coalesce(p_intencion->>'cliente_direccion', '')),
    'moneda', upper(coalesce(nullif(btrim(p_intencion->>'moneda'), ''), 'PEN')),
    'emitir_cpe', coalesce((p_intencion->>'emitir_cpe')::boolean, true),
    'tipo_documento', coalesce(
      nullif(p_intencion #>> '{comprobante,tipo}', ''),
      nullif(p_intencion #>> '{cpe_data,tipo_documento}', ''),
      nullif(p_intencion->>'tipo_documento', ''), ''),
    'serie', upper(coalesce(
      nullif(p_intencion #>> '{comprobante,serie}', ''),
      nullif(p_intencion #>> '{cpe_data,serie}', ''), '')),
    'metodo_pago', lower(btrim(coalesce(p_intencion->>'metodo_pago', ''))),
    'metodo_pago_id', btrim(coalesce(p_intencion->>'metodo_pago_id', '')),
    'referencia_pago', nullif(btrim(coalesce(p_intencion->>'referencia_pago', '')), ''),
    'descuento_global', round(app.to_numeric_or_zero(p_intencion->>'descuento_global'), 2),
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'producto_id', app.to_uuid_or_null(coalesce(item->>'producto_id', '')),
        'cantidad', round(app.to_numeric_or_zero(item->>'cantidad'), 6),
        'precio_solicitado', round(app.to_numeric_or_zero(coalesce(
          item->>'precio_unitario', item->>'precio_original')), 6),
        'descuento_monto', round(app.to_numeric_or_zero(item->>'descuento_monto'), 2),
        'descuento_porcentaje', round(app.to_numeric_or_zero(item->>'descuento_porcentaje'), 6)
      ) ORDER BY ordinality), '[]'::jsonb)
      FROM jsonb_array_elements(app.jsonb_array_or_empty_491(p_intencion->'items'))
        WITH ORDINALITY AS lines(item, ordinality)
    ),
    'pagos', app.pos_payments_canonical_451(p_intencion->'pagos')
  ) || CASE
    -- Ausente y false son la misma intención económica. Omitir false conserva
    -- la huella persistida por 469/491 para reintentos creados antes de 518;
    -- true sí debe diferenciarse porque cambia el efectivo realmente cobrado.
    WHEN coalesce((p_intencion->>'redondeo_efectivo_legal')::boolean, false)
      THEN jsonb_build_object('redondeo_efectivo_legal', true)
    ELSE '{}'::jsonb
  END;
$function$;

CREATE OR REPLACE FUNCTION app.pos_registrar_venta_atomic_tx_518(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_sesion_caja_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_aplicar boolean := coalesce((p_payload->>'redondeo_efectivo_legal')::boolean, false);
  v_payload jsonb := p_payload;
  v_items jsonb := app.pos_items_canonical_451(p_payload->'items');
  v_pagos jsonb := app.pos_payments_canonical_451(p_payload->'pagos');
  v_total numeric := 0;
  v_efectivo numeric := 0;
  v_ajuste numeric := 0;
  v_pais text;
  v_moneda text := upper(coalesce(nullif(btrim(p_payload->>'moneda'), ''), 'PEN'));
  v_pago jsonb;
  v_metodo public.metodos_pago%ROWTYPE;
  v_pago_index integer := 0;
  v_pagos_cero integer := 0;
  v_result jsonb;
  v_venta public.ventas_pos%ROWTYPE;
  v_pago_row public.ventas_pos_pagos%ROWTYPE;
  v_movimiento public.movimientos_caja%ROWTYPE;
  v_existing_adjustment public.ajustes_redondeo_efectivo_pos%ROWTYPE;
  v_fingerprint text;
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_usuario_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  IF v_key IS NULL OR length(v_key) > 200
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'POS_SALE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Se toma el mismo lock que 451/471 antes del precheck 518. Así dos requests
  -- con la misma clave no pueden observar simultáneamente "sin venta" y luego
  -- discrepar sobre si corresponde crear la evidencia de redondeo.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pos.sale:' || p_tenant_id::text || ':' || v_key, 451
  ));

  SELECT * INTO v_venta
  FROM public.ventas_pos v
  WHERE v.tenant_id = p_tenant_id AND v.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_existing_adjustment
    FROM public.ajustes_redondeo_efectivo_pos a
    WHERE a.tenant_id = p_tenant_id AND a.venta_pos_id = v_venta.id;
    IF v_aplicar IS DISTINCT FROM FOUND THEN
      RAISE EXCEPTION 'POS_IDEMPOTENCY_PAYLOAD_MISMATCH' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF v_aplicar THEN
    IF jsonb_typeof(coalesce(p_payload->'pagos', 'null'::jsonb)) <> 'array'
       OR jsonb_array_length(v_pagos) = 0 THEN
      RAISE EXCEPTION 'POS_CASH_ROUNDING_REQUIRES_EXPLICIT_CASH_PAYMENT'
        USING ERRCODE = '22023';
    END IF;

    SELECT upper(btrim(coalesce(t.pais, ''))) INTO v_pais
    FROM public.tenants t WHERE t.id = p_tenant_id;
    IF v_pais NOT IN ('PE', 'PER') OR v_moneda <> 'PEN' THEN
      RAISE EXCEPTION 'POS_CASH_ROUNDING_COUNTRY_OR_CURRENCY_INVALID'
        USING ERRCODE = '23514';
    END IF;

    SELECT round(coalesce(sum(
      app.to_numeric_or_zero(item->>'subtotal')
      + app.to_numeric_or_zero(item->>'igv')
    ), 0), 2) INTO v_total
    FROM jsonb_array_elements(v_items) item;

    FOR v_pago IN SELECT value FROM jsonb_array_elements(v_pagos)
    LOOP
      SELECT * INTO v_metodo
      FROM public.metodos_pago mp
      WHERE (mp.tenant_id = p_tenant_id OR mp.tenant_id IS NULL)
        AND coalesce(mp.activo, true)
        AND upper(coalesce(mp.estado::text, 'ACTIVO')) = 'ACTIVO'
        AND (
          (app.to_uuid_or_null(coalesce(v_pago->>'metodo_pago_id', '')) IS NOT NULL
           AND mp.id = app.to_uuid_or_null(coalesce(v_pago->>'metodo_pago_id', '')))
          OR (app.to_uuid_or_null(coalesce(v_pago->>'metodo_pago_id', '')) IS NULL
              AND lower(btrim(mp.codigo)) = lower(btrim(coalesce(v_pago->>'codigo', ''))))
        )
      ORDER BY (mp.tenant_id IS NULL), mp.id
      LIMIT 1;
      IF NOT FOUND OR upper(coalesce(v_metodo.tipo, '')) <> 'EFECTIVO' THEN
        RAISE EXCEPTION 'POS_CASH_ROUNDING_REQUIRES_CASH_ONLY'
          USING ERRCODE = '23514';
      END IF;
      IF round(app.to_numeric_or_zero(v_pago->>'monto'), 2) < 0 THEN
        RAISE EXCEPTION 'POS_CASH_ROUNDING_AMOUNT_INVALID'
          USING ERRCODE = '23514';
      END IF;
      IF round(app.to_numeric_or_zero(v_pago->>'monto'), 2) = 0 THEN
        v_pagos_cero := v_pagos_cero + 1;
      END IF;
      v_efectivo := v_efectivo + round(app.to_numeric_or_zero(v_pago->>'monto'), 2);
    END LOOP;
    v_efectivo := round(v_efectivo, 2);
    v_ajuste := round(v_total - v_efectivo, 2);

    IF v_total <= 0 OR v_efectivo < 0 OR v_ajuste NOT BETWEEN 0.01 AND 0.09
       OR (v_pagos_cero > 0 AND NOT (
         v_efectivo = 0 AND v_pagos_cero = 1 AND jsonb_array_length(v_pagos) = 1
       ))
       OR v_efectivo <> trunc(v_total * 10) / 10 THEN
      RAISE EXCEPTION 'POS_CASH_ROUNDING_AMOUNT_INVALID: total=% efectivo=% ajuste=%',
        v_total, v_efectivo, v_ajuste USING ERRCODE = '23514';
    END IF;

    -- El writer 451/471 conserva el total contable. Se completa sólo su primer
    -- pago de efectivo para que el asiento/ledger sigan cuadrando; la diferencia
    -- física queda exclusivamente en la evidencia 518 y se reconoce en el corte.
    v_payload := jsonb_set(
      v_payload,
      ARRAY['pagos', v_pago_index::text, 'monto'],
      to_jsonb(round(app.to_numeric_or_zero(v_pagos->v_pago_index->>'monto') + v_ajuste, 2)),
      false
    );
  END IF;

  IF coalesce((v_payload->>'emitir_cpe')::boolean, true) THEN
    v_result := app.pos_registrar_venta_atomic_tx_451(
      p_tenant_id, p_usuario_id, p_sesion_caja_id,
      p_idempotency_key, v_payload - 'emitir_cpe'
    ) || jsonb_build_object('tipo_emision', 'FISCAL_INMEDIATO', 'canjeable', false);
    UPDATE public.ventas_pos
    SET tipo_emision = 'FISCAL_INMEDIATO',
        atomic_result = v_result,
        updated_at = now()
    WHERE id = app.to_uuid_or_null(coalesce(v_result->>'venta_id', ''))
      AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'POS_FISCAL_SALE_NOT_FOUND_AFTER_WRITE'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    v_result := app.pos_registrar_ticket_atomic_tx_471(
      p_tenant_id, p_usuario_id, p_sesion_caja_id,
      p_idempotency_key, v_payload
    );
  END IF;

  IF NOT v_aplicar THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_venta FROM public.ventas_pos v
  WHERE v.id = app.to_uuid_or_null(coalesce(v_result->>'venta_id', ''))
    AND v.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_venta.sesion_caja_id IS DISTINCT FROM p_sesion_caja_id
     OR round(v_venta.total, 2) <> v_total THEN
    RAISE EXCEPTION 'POS_CASH_ROUNDING_SALE_POSTCONDITION_FAILED'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_pago_row FROM public.ventas_pos_pagos p
  WHERE p.tenant_id = p_tenant_id AND p.venta_pos_id = v_venta.id
    AND upper(coalesce(p.metodo_pago_tipo, '')) = 'EFECTIVO'
  ORDER BY p.created_at, p.id LIMIT 1 FOR UPDATE;
  SELECT * INTO v_movimiento FROM public.movimientos_caja m
  WHERE m.id = app.to_uuid_or_null(coalesce(v_result->>'caja_movimiento_id', ''))
    AND m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_sesion_caja_id
  FOR UPDATE;
  IF v_pago_row.id IS NULL OR v_movimiento.id IS NULL
     OR v_pago_row.venta_pos_id IS DISTINCT FROM v_venta.id THEN
    RAISE EXCEPTION 'POS_CASH_ROUNDING_IMPACT_POSTCONDITION_FAILED'
      USING ERRCODE = '23514';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', p_tenant_id, 'sesion_caja_id', p_sesion_caja_id,
    'venta_pos_id', v_venta.id, 'pago_pos_id', v_pago_row.id,
    'movimiento_caja_id', v_movimiento.id, 'actor_id', p_usuario_id,
    'moneda', v_moneda, 'monto_documento', v_total,
    'monto_efectivo', v_efectivo, 'monto_ajuste', v_ajuste,
    'idempotency_key', btrim(p_idempotency_key)
  )::text, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.ajustes_redondeo_efectivo_pos (
    tenant_id, sesion_caja_id, venta_pos_id, pago_pos_id,
    movimiento_caja_id, moneda, monto_documento, monto_efectivo,
    monto_ajuste, actor_id, idempotency_key, evidencia_fingerprint, metadata
  ) VALUES (
    p_tenant_id, p_sesion_caja_id, v_venta.id, v_pago_row.id,
    v_movimiento.id, v_moneda, v_total, v_efectivo,
    v_ajuste, p_usuario_id, btrim(p_idempotency_key), v_fingerprint,
    jsonb_build_object('schema_version', 518, 'source', 'pos.cash.rounding.518')
  ) ON CONFLICT (tenant_id, venta_pos_id) DO NOTHING;

  SELECT * INTO v_existing_adjustment
  FROM public.ajustes_redondeo_efectivo_pos a
  WHERE a.tenant_id = p_tenant_id AND a.venta_pos_id = v_venta.id;
  IF v_existing_adjustment.evidencia_fingerprint IS DISTINCT FROM v_fingerprint THEN
    RAISE EXCEPTION 'POS_CASH_ROUNDING_EVIDENCE_MISMATCH' USING ERRCODE = '23505';
  END IF;

  v_result := v_result || jsonb_build_object(
    'redondeo_efectivo_legal', true,
    'monto_efectivo_cobrado', v_efectivo,
    'monto_ajuste_redondeo', v_ajuste,
    'redondeo_evidencia_fingerprint', v_fingerprint
  );
  UPDATE public.ventas_pos
  SET atomic_result = v_result,
      tipo_emision = CASE
        WHEN coalesce((p_payload->>'emitir_cpe')::boolean, true)
          THEN 'FISCAL_INMEDIATO'
        ELSE tipo_emision
      END,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'redondeo_efectivo_legal', true,
        'monto_efectivo_cobrado', v_efectivo,
        'monto_ajuste_redondeo', v_ajuste,
        'redondeo_evidencia_fingerprint', v_fingerprint,
        'cash_rounding_schema_version', 518
      ), updated_at = now()
  WHERE id = v_venta.id AND tenant_id = p_tenant_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_registrar_venta_atomic_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_sesion_caja_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.pos_registrar_venta_atomic_tx_518($1, $2, $3, $4, $5);
$function$;

CREATE OR REPLACE FUNCTION app.resumen_redondeo_documentado_cierre_caja_518(
  p_tenant_id uuid,
  p_sesion_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'monto', round(coalesce(sum(a.monto_ajuste), 0), 2),
    'cantidad', count(*)
  )
  FROM public.ajustes_redondeo_efectivo_pos a
  JOIN public.ventas_pos v
    ON v.id = a.venta_pos_id AND v.tenant_id = a.tenant_id
  JOIN public.ventas_pos_pagos p
    ON p.id = a.pago_pos_id AND p.tenant_id = a.tenant_id
      AND p.venta_pos_id = v.id
  JOIN public.movimientos_caja m
    ON m.id = a.movimiento_caja_id AND m.tenant_id = a.tenant_id
      AND m.sesion_caja_id = a.sesion_caja_id
  WHERE a.tenant_id = p_tenant_id AND a.sesion_caja_id = p_sesion_id
    AND v.sesion_caja_id = p_sesion_id
    AND upper(coalesce(v.estado::text, '')) <> 'ANULADA'
    AND upper(coalesce(p.estado::text, 'ACTIVO')) = 'ACTIVO'
    AND upper(coalesce(p.metodo_pago_tipo, '')) = 'EFECTIVO';
$function$;

CREATE OR REPLACE FUNCTION public.resumen_redondeo_documentado_cierre_caja_518(
  p_tenant_id uuid,
  p_sesion_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.resumen_redondeo_documentado_cierre_caja_518($1, $2);
$function$;

CREATE OR REPLACE FUNCTION app.es_redondeo_efectivo_legal_518(
  p_diferencia numeric,
  p_pais text,
  p_moneda text,
  p_redondeo_documentado numeric
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT upper(btrim(coalesce(p_pais, ''))) IN ('PE', 'PER')
     AND upper(btrim(coalesce(p_moneda, ''))) = 'PEN'
     AND round(coalesce(p_diferencia, 0), 2) < 0
     AND round(coalesce(p_redondeo_documentado, 0), 2) > 0
     AND abs(round(coalesce(p_diferencia, 0), 2)
       + round(coalesce(p_redondeo_documentado, 0), 2)) <= 0.001;
$function$;

CREATE OR REPLACE FUNCTION app.cierre_caja_requiere_supervisor_518(
  p_diferencia numeric,
  p_tolerancia numeric,
  p_pais text,
  p_moneda text,
  p_redondeo_documentado numeric
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT abs(round(coalesce(p_diferencia, 0), 2))
           > greatest(coalesce(p_tolerancia, 0), 0) + 0.001
     AND NOT app.es_redondeo_efectivo_legal_518(
       p_diferencia, p_pais, p_moneda, p_redondeo_documentado
     );
$function$;

-- Única resolución de tolerancia para preview y writer. Una configuración
-- activa de la caja gana a la global del tenant; dentro de cada nivel vence la
-- modificación más reciente y el id rompe empates. NULLS LAST evita que una fila
-- sin fecha desplace una configuración vigente y hace el resultado determinista.
CREATE OR REPLACE FUNCTION app.resolver_tolerancia_cierre_caja_518(
  p_tenant_id uuid,
  p_caja_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT greatest(coalesce((
    SELECT cc.tolerancia_diferencia_cierre
    FROM public.configuracion_caja cc
    WHERE cc.tenant_id = p_tenant_id
      AND coalesce(cc.activo, true)
      AND (cc.caja_id = p_caja_id OR cc.caja_id IS NULL)
    ORDER BY (cc.caja_id = p_caja_id) DESC NULLS LAST,
             cc.updated_at DESC NULLS LAST,
             cc.id DESC
    LIMIT 1
  ), 0), 0);
$function$;

CREATE OR REPLACE FUNCTION public.resolver_tolerancia_cierre_caja_518(
  p_tenant_id uuid,
  p_caja_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.resolver_tolerancia_cierre_caja_518($1, $2);
$function$;

-- Un bloqueo de fuerza bruta dura quince minutos, no para siempre. La 497 ya
-- reactivaba al verificar el PIN, pero el selector filtraba activo=true antes de
-- intentarlo y hacía imposible volver a elegir al supervisor. Este resolver
-- limpia sólo bloqueos vencidos; los vigentes continúan excluidos.
CREATE OR REPLACE FUNCTION app.reactivar_bloqueos_supervisor_vencidos_518(
  p_tenant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.supervisor_pins sp
  SET activo = true,
      estado = 'ACTIVO',
      intentos_fallidos = 0,
      bloqueado_hasta = NULL,
      updated_at = now()
  WHERE sp.tenant_id = p_tenant_id
    AND lower(coalesce(sp.estado::text, '')) = 'bloqueado'
    AND sp.bloqueado_hasta IS NOT NULL
    AND sp.bloqueado_hasta <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

DROP FUNCTION IF EXISTS public.listar_supervisores_autorizados_caja_518(uuid);
CREATE OR REPLACE FUNCTION public.listar_supervisores_autorizados_caja_518(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_sesion_id uuid
)
RETURNS TABLE(id uuid, nombre text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_cajero_id uuid;
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_actor_id);
  SELECT coalesce(s.cajero_id, s.usuario_id) INTO v_cajero_id
  FROM public.sesiones_caja s
  WHERE s.id = p_sesion_id AND s.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_SESSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM app.reactivar_bloqueos_supervisor_vencidos_518(p_tenant_id);
  RETURN QUERY
  SELECT u.id,
         coalesce(nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), ''), 'Supervisor')
  FROM public.usuarios_sistema u
  JOIN LATERAL (
    SELECT sp.id
    FROM public.supervisor_pins sp
    WHERE sp.tenant_id = p_tenant_id AND sp.usuario_id = u.id
      AND lower(coalesce(sp.estado::text, '')) IN ('activo', 'bloqueado')
      AND coalesce(sp.activo, false)
      AND NOT (sp.bloqueado_hasta IS NOT NULL AND sp.bloqueado_hasta > now())
    ORDER BY sp.pin_version DESC, sp.created_at DESC
    LIMIT 1
  ) pin ON true
  WHERE u.tenant_id = p_tenant_id
    AND u.id <> p_actor_id
    AND u.id IS DISTINCT FROM v_cajero_id
    AND app.cash_actor_is_supervisor_474(p_tenant_id, u.id)
  ORDER BY 2, 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_supervisores_gestion_pin_caja_518(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS TABLE(
  id uuid,
  nombre text,
  pin_registrado boolean,
  pin_version integer,
  estado_pin text,
  bloqueado_hasta timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  PERFORM app.reactivar_bloqueos_supervisor_vencidos_518(p_tenant_id);
  RETURN QUERY
  SELECT u.id,
         coalesce(nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), ''), 'Supervisor'),
         pin.id IS NOT NULL,
         pin.pin_version,
         CASE
           WHEN pin.id IS NULL THEN 'SIN_PIN'
           WHEN pin.bloqueado_hasta > now() THEN 'BLOQUEADO'
           ELSE 'ACTIVO'
         END,
         CASE WHEN pin.bloqueado_hasta > now() THEN pin.bloqueado_hasta ELSE NULL END
  FROM public.usuarios_sistema u
  LEFT JOIN LATERAL (
    SELECT sp.id, sp.pin_version, sp.bloqueado_hasta
    FROM public.supervisor_pins sp
    WHERE sp.tenant_id = p_tenant_id AND sp.usuario_id = u.id
      AND lower(coalesce(sp.estado::text, '')) IN ('activo', 'bloqueado')
    ORDER BY sp.pin_version DESC, sp.created_at DESC
    LIMIT 1
  ) pin ON true
  WHERE u.tenant_id = p_tenant_id
    AND app.cash_actor_is_supervisor_474(p_tenant_id, u.id)
  ORDER BY 2, 1;
END;
$function$;

DROP FUNCTION IF EXISTS public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text);
CREATE OR REPLACE FUNCTION public.registrar_pin_supervisor_caja_tx_518(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_supervisor_id uuid,
  p_pin text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_pin text := btrim(coalesce(p_pin, ''));
  v_result jsonb;
  v_safe_result jsonb;
  v_existing public.supervisor_pin_rotaciones_518%ROWTYPE;
  v_pin_row public.supervisor_pins%ROWTYPE;
BEGIN
  IF v_key IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'SUPERVISOR_PIN_IDEMPOTENCY_KEY_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'supervisor.pin.rotate:' || p_tenant_id::text || ':' || v_key, 518
  ));

  -- Congela identidad, membresías y concesiones users.manage antes de la
  -- comprobación canónica 493. Una revocación ya iniciada gana; una posterior
  -- espera al COMMIT de esta rotación.
  PERFORM 1 FROM public.usuarios_sistema u
  WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id FOR UPDATE;
  PERFORM 1
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
  WHERE ur.usuario_sistema_id = p_actor_id AND ur.tenant_id = p_tenant_id
  FOR UPDATE OF ur, r;
  PERFORM 1
  FROM public.user_roles ur
  JOIN public.rol_permisos rp ON rp.role_id = ur.role_id
  JOIN public.permisos p ON p.id = rp.permiso_id
  WHERE ur.usuario_sistema_id = p_actor_id AND ur.tenant_id = p_tenant_id
    AND p.tenant_id = p_tenant_id
  FOR UPDATE OF rp, p;
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);

  SELECT * INTO v_existing
  FROM public.supervisor_pin_rotaciones_518 op
  WHERE op.tenant_id = p_tenant_id AND op.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_pin_row FROM public.supervisor_pins sp
    WHERE sp.id = v_existing.pin_id AND sp.tenant_id = p_tenant_id;
    IF v_existing.actor_id IS DISTINCT FROM p_actor_id
       OR v_existing.supervisor_id IS DISTINCT FROM p_supervisor_id
       OR v_pin !~ '^[0-9]{6}$'
       OR v_pin_row.id IS NULL
       OR extensions.crypt(v_pin, v_pin_row.hash_pin)
            IS DISTINCT FROM v_pin_row.hash_pin THEN
      RAISE EXCEPTION 'SUPERVISOR_PIN_IDEMPOTENCY_MISMATCH'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent', true);
  END IF;

  -- Congela también la identidad y el rol autorizador del destinatario. La
  -- posterior RPC 497 toma el lock del PIN y crea una sola versión durable.
  PERFORM 1 FROM public.usuarios_sistema u
  WHERE u.id = p_supervisor_id AND u.tenant_id = p_tenant_id FOR UPDATE;
  PERFORM 1
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
  WHERE ur.usuario_sistema_id = p_supervisor_id AND ur.tenant_id = p_tenant_id
  FOR UPDATE OF ur, r;
  IF NOT app.cash_actor_is_supervisor_474(p_tenant_id, p_supervisor_id) THEN
    RAISE EXCEPTION 'SUPERVISOR_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  v_result := public.registrar_pin_supervisor_tx(
    p_tenant_id, p_actor_id, p_supervisor_id, v_pin
  );
  v_safe_result := jsonb_build_object(
    'supervisor_id', p_supervisor_id,
    'pin_version', v_result->'pin_version',
    'rotado_at', clock_timestamp(),
    'idempotent', false
  );
  INSERT INTO public.supervisor_pin_rotaciones_518 (
    tenant_id, idempotency_key, actor_id, supervisor_id,
    pin_id, pin_version, resultado
  ) VALUES (
    p_tenant_id, v_key, p_actor_id, p_supervisor_id,
    (v_result->>'id')::uuid, (v_result->>'pin_version')::integer, v_safe_result
  );
  RETURN v_safe_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.cerrar_caja_tx_518(
  p_tenant_id uuid,
  p_sesion_id uuid,
  p_actor_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_sesion public.sesiones_caja%ROWTYPE;
  v_cierre_at timestamptz := clock_timestamp();
  v_contado numeric := round(app.to_numeric_or_zero(p_payload->>'monto_contado'), 2);
  v_esperado numeric;
  v_diferencia numeric;
  v_admin boolean := coalesce((p_payload->>'cierre_administrativo')::boolean, false);
  v_razon text := nullif(btrim(coalesce(p_payload->>'razon_cierre_administrativo', '')), '');
  v_denominaciones jsonb := coalesce(p_payload->'denominaciones', '{}'::jsonb);
  v_fingerprint text;
  v_hash text;
  v_event_id uuid := gen_random_uuid();
  v_event_key text;
  v_result jsonb;
  v_total_ventas numeric;
  v_total_impuestos numeric;
  v_total_documentos integer;
  v_metodos jsonb;
  v_fiscal jsonb;
  v_expected_seq integer;
  v_actual_seq integer;
  v_actual_count integer;
  v_supervisor_id uuid := app.to_uuid_or_null(coalesce(p_payload->>'supervisor_id', ''));
  v_supervisor_pin text := btrim(coalesce(p_payload->>'codigo_autorizacion', ''));
  v_pin_result jsonb;
  v_pin_version integer;
  v_authorization_fingerprint text;
  v_tolerancia numeric := 0;
  v_pais text := '';
  v_moneda text := '';
  v_redondeo_legal boolean := false;
  v_redondeo_resumen jsonb := '{"monto":0,"cantidad":0}'::jsonb;
  v_redondeo_documentado numeric := 0;
  v_redondeo_cantidad integer := 0;
  v_tipo_diferencia text;
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  IF v_contado < 0 THEN
    RAISE EXCEPTION 'CASH_CLOSE_COUNT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_admin AND (v_razon IS NULL OR length(v_razon) < 10) THEN
    RAISE EXCEPTION 'CASH_ADMIN_CLOSE_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sesion FROM public.sesiones_caja s
  WHERE s.id = p_sesion_id AND s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_SESSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', p_tenant_id, 'sesion_id', p_sesion_id,
    'actor_id', p_actor_id,
    'monto_contado', v_contado, 'denominaciones', v_denominaciones,
    'notas', nullif(btrim(coalesce(p_payload->>'notas', '')), ''),
    'cierre_administrativo', v_admin, 'razon', v_razon,
    'supervisor_id', v_supervisor_id
  )::text, 'UTF8'), 'sha256'), 'hex');

  IF upper(v_sesion.estado::text) = 'CERRADA' THEN
    IF coalesce(
         nullif(btrim(coalesce(v_sesion.usuario_cierre, '')), ''),
         nullif(btrim(coalesce(v_sesion.cerrado_por, '')), '')
       ) IS DISTINCT FROM p_actor_id::text THEN
      RAISE EXCEPTION 'CASH_CLOSE_REPLAY_ACTOR_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
    IF v_sesion.close_fingerprint IS NULL OR v_sesion.close_result IS NULL THEN
      RAISE EXCEPTION 'CASH_LEGACY_CLOSE_REQUIRES_RECONCILIATION' USING ERRCODE = '23514';
    END IF;
    IF v_sesion.close_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'CASH_CLOSE_PAYLOAD_MISMATCH' USING ERRCODE = '23505';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.cortes_caja c
      WHERE c.tenant_id = p_tenant_id AND c.sesion_caja_id = p_sesion_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.outbox_events o
      WHERE o.tenant_id = p_tenant_id AND o.event_id = v_sesion.close_event_id
        AND o.event_type = 'caja.cerrada'
    ) THEN
      RAISE EXCEPTION 'CASH_CLOSE_POSTCONDITION_FAILED' USING ERRCODE = '23514';
    END IF;
    RETURN v_sesion.close_result || jsonb_build_object('idempotent', true);
  END IF;
  IF upper(v_sesion.estado::text) <> 'ABIERTA' OR coalesce(v_sesion.congelada, false) THEN
    RAISE EXCEPTION 'CASH_SESSION_NOT_OPEN' USING ERRCODE = '23514';
  END IF;

  -- Un ticket Txxx interno no bloquea. Sólo una intención fiscal reservada y
  -- todavía inconclusa impide cerrar.
  IF EXISTS (
    SELECT 1 FROM public.ventas_pos v
    WHERE v.tenant_id = p_tenant_id AND v.sesion_caja_id = p_sesion_id
      AND upper(coalesce(v.estado, '')) <> 'ANULADA'
      AND coalesce(v.cpe_pendiente, false)
  ) THEN
    RAISE EXCEPTION 'CASH_CLOSE_HAS_PENDING_CPE' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ventas_pos v
    WHERE v.tenant_id = p_tenant_id AND v.sesion_caja_id = p_sesion_id
      AND upper(coalesce(v.estado, '')) <> 'ANULADA'
      AND (v.accounting_event_id IS NULL OR v.atomic_result IS NULL
        OR v.documento_id IS NULL
        OR (v.credito_monto > 0 AND v.cuenta_por_cobrar_id IS NULL)
        OR NOT EXISTS (
          SELECT 1 FROM public.outbox_events o
          WHERE o.tenant_id = v.tenant_id AND o.event_id = v.accounting_event_id
            AND o.event_type = 'pos.venta.registrada'
        ))
  ) THEN
    RAISE EXCEPTION 'CASH_CLOSE_HAS_INCOMPLETE_POS_SALE' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cambios_turno c
    WHERE c.tenant_id = p_tenant_id AND c.sesion_caja_id = p_sesion_id
      AND upper(coalesce(c.estado::text, '')) = 'EN_PROCESO'
  ) THEN
    RAISE EXCEPTION 'CASH_CLOSE_HAS_PENDING_SHIFT_CHANGE' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(max(m.secuencia), 0), count(*)
    INTO v_expected_seq, v_actual_count
  FROM public.movimientos_caja m
  WHERE m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_sesion_id;
  SELECT count(*) INTO v_actual_seq
  FROM (
    SELECT m.secuencia,
           lag(m.saldo_nuevo) OVER (ORDER BY m.secuencia) AS saldo_previo,
           m.saldo_anterior, m.saldo_nuevo, m.monto
    FROM public.movimientos_caja m
    WHERE m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_sesion_id
  ) q
  WHERE q.secuencia < 1
     OR (q.saldo_previo IS NOT NULL AND abs(q.saldo_anterior - q.saldo_previo) > 0.01)
     OR abs(q.saldo_nuevo - q.saldo_anterior - q.monto) > 0.01;
  IF v_expected_seq <> v_actual_count OR v_actual_seq <> 0 THEN
    RAISE EXCEPTION 'CASH_MOVEMENT_LEDGER_INTEGRITY_FAILED' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce((
    SELECT m.saldo_nuevo FROM public.movimientos_caja m
    WHERE m.tenant_id = p_tenant_id AND m.sesion_caja_id = p_sesion_id
    ORDER BY m.secuencia DESC LIMIT 1
  ), coalesce(v_sesion.monto_inicio, v_sesion.monto_inicial, 0))
  INTO v_esperado;
  v_esperado := round(v_esperado, 2);
  v_diferencia := round(v_contado - v_esperado, 2);

  SELECT upper(btrim(coalesce(t.pais, ''))) INTO v_pais
  FROM public.tenants t
  WHERE t.id = p_tenant_id;
  v_pais := coalesce(v_pais, '');
  v_moneda := upper(btrim(coalesce(v_sesion.moneda, '')));

  v_tolerancia := app.resolver_tolerancia_cierre_caja_518(
    p_tenant_id, v_sesion.caja_id
  );
  v_redondeo_resumen := app.resumen_redondeo_documentado_cierre_caja_518(
    p_tenant_id, p_sesion_id
  );
  v_redondeo_documentado := round(
    app.to_numeric_or_zero(v_redondeo_resumen->>'monto'), 2
  );
  v_redondeo_cantidad := greatest(
    coalesce(nullif(v_redondeo_resumen->>'cantidad', '')::integer, 0), 0
  );
  v_redondeo_legal := app.es_redondeo_efectivo_legal_518(
    v_diferencia, v_pais, v_moneda, v_redondeo_documentado
  );

  IF app.cierre_caja_requiere_supervisor_518(
    v_diferencia, v_tolerancia, v_pais, v_moneda, v_redondeo_documentado
  ) AND v_supervisor_id IS NULL THEN
      RAISE EXCEPTION 'CASH_CLOSE_SUPERVISOR_REQUIRED: diferencia=% tolerancia=%',
        v_diferencia, v_tolerancia USING ERRCODE = '42501';
  END IF;

  -- Un PIN aislado no identifica a quien autoriza, y un supervisor suministrado
  -- nunca se acepta como decoración: incluso cuando la diferencia está dentro de
  -- tolerancia debe acreditar identidad, rol y PIN. Esto cierra la divergencia
  -- entre preview/Node y el writer invocable directamente por service_role.
  IF v_supervisor_id IS NULL AND v_supervisor_pin <> '' THEN
    RAISE EXCEPTION 'CASH_CLOSE_SUPERVISOR_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF v_supervisor_id IS NOT NULL THEN
    IF v_supervisor_id = p_actor_id THEN
      RAISE EXCEPTION 'CASH_CLOSE_SELF_AUTHORIZATION_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF v_supervisor_id = coalesce(v_sesion.cajero_id, v_sesion.usuario_id) THEN
      RAISE EXCEPTION 'CASH_CLOSE_CASHIER_AUTHORIZATION_FORBIDDEN'
        USING ERRCODE = '42501';
    END IF;
    IF v_supervisor_pin !~ '^[0-9]{6}$' THEN
      RAISE EXCEPTION 'CASH_CLOSE_SUPERVISOR_PIN_REQUIRED' USING ERRCODE = '22023';
    END IF;

    -- Congela usuario y membresías RBAC hasta el COMMIT. Una revocación que ya
    -- empezó gana y se observa; una posterior espera. Sin estos locks el rol
    -- podía revocarse entre la comprobación y el cierre durable.
    PERFORM 1
    FROM public.usuarios_sistema u
    WHERE u.id = v_supervisor_id AND u.tenant_id = p_tenant_id
    FOR UPDATE;
    PERFORM app.assert_pos_actor_451(p_tenant_id, v_supervisor_id);

    PERFORM 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
    WHERE ur.usuario_sistema_id = v_supervisor_id
      AND ur.tenant_id = p_tenant_id
    FOR UPDATE OF ur, r;

    -- Reutiliza la definición canónica de Caja 474 (usuario/tenant/estado y
    -- roles ADMIN, ADMINISTRADOR, SUPERADMIN o SUPERVISOR activos).
    IF NOT app.cash_actor_is_supervisor_474(p_tenant_id, v_supervisor_id) THEN
      RAISE EXCEPTION 'CASH_CLOSE_SUPERVISOR_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;

    v_pin_result := public.verificar_pin_supervisor_tx(
      p_tenant_id, v_supervisor_id, v_supervisor_pin
    );

    -- verificar_pin_supervisor_tx retorna el rechazo para que el contador de
    -- intentos sobreviva. Por la misma razón el writer retorna un resultado de
    -- rechazo en vez de lanzar después de la llamada: un RAISE desharía el lock,
    -- el intento y el eventual bloqueo que acabamos de registrar.
    IF coalesce((v_pin_result->>'valido')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'success', false,
        'estado', 'RECHAZADO',
        'error_code', coalesce(v_pin_result->>'motivo', 'SUPERVISOR_PIN_INVALID'),
        'message', 'No se pudo acreditar al supervisor para este cierre'
      );
    END IF;

    v_pin_version := nullif(v_pin_result->>'pin_version', '')::integer;
    v_authorization_fingerprint := encode(extensions.digest(convert_to(
      jsonb_build_object(
        'tenant_id', p_tenant_id,
        'sesion_id', p_sesion_id,
        'actor_id', p_actor_id,
        'supervisor_id', v_supervisor_id,
        'close_fingerprint', v_fingerprint,
        'pin_version', v_pin_version
      )::text,
      'UTF8'
    ), 'sha256'), 'hex');
  END IF;

  v_tipo_diferencia := CASE
    WHEN abs(v_diferencia) <= 0.009 THEN 'CUADRADO'
    WHEN v_redondeo_legal THEN 'REDONDEO_EFECTIVO_LEGAL'
    WHEN v_diferencia > 0 THEN 'SOBRANTE'
    ELSE 'FALTANTE'
  END;
  v_hash := app.cash_session_integrity_hash_451(
    p_tenant_id, p_sesion_id, v_cierre_at, v_esperado, v_contado, v_denominaciones
  );

  SELECT round(coalesce(sum(v.total), 0), 2),
         round(coalesce(sum(v.impuestos), 0), 2), count(*)
    INTO v_total_ventas, v_total_impuestos, v_total_documentos
  FROM public.ventas_pos v
  WHERE v.tenant_id = p_tenant_id AND v.sesion_caja_id = p_sesion_id
    AND upper(coalesce(v.estado, '')) <> 'ANULADA';

  SELECT coalesce(jsonb_object_agg(tipo, monto), '{}'::jsonb)
    INTO v_metodos
  FROM (
    SELECT upper(p.metodo_pago_tipo) AS tipo, round(sum(p.monto), 2) AS monto
    FROM public.ventas_pos_pagos p
    JOIN public.ventas_pos v ON v.id = p.venta_pos_id AND v.tenant_id = p.tenant_id
    WHERE p.tenant_id = p_tenant_id AND v.sesion_caja_id = p_sesion_id
      AND upper(coalesce(v.estado, '')) <> 'ANULADA'
    GROUP BY upper(p.metodo_pago_tipo)
  ) x;
  v_fiscal := jsonb_build_object(
    'base_imponible', round(v_total_ventas - v_total_impuestos, 2),
    'igv', v_total_impuestos, 'total', v_total_ventas,
    'cantidad_documentos', v_total_documentos
  );

  v_event_key := 'caja.cerrada:' || p_tenant_id::text || ':' || p_sesion_id::text;
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, status,
    retry_count, idempotency_key, event_id, occurred_at, created_at, updated_at
  ) VALUES (
    p_tenant_id, 'sesion_caja', p_sesion_id::text, 'caja.cerrada',
    jsonb_build_object('eventId', v_event_id, 'tenantId', p_tenant_id,
      'sesionCajaId', p_sesion_id, 'cajaId', v_sesion.caja_id,
      'montoEsperado', v_esperado, 'montoContado', v_contado,
      'diferencia', v_diferencia, 'tipoDiferencia', v_tipo_diferencia,
      'redondeoEfectivoLegal', v_redondeo_legal,
      'redondeoEfectivoDocumentado', v_redondeo_documentado,
      'redondeoEfectivoCantidad', v_redondeo_cantidad,
      'cierreAdministrativo', v_admin, 'supervisorId', v_supervisor_id,
      'supervisorAuthorizationFingerprint', v_authorization_fingerprint,
      'fecha', v_cierre_at,
      'referencia', 'CIERRE-CAJA-' || p_sesion_id::text,
      'cuentaCajaCodigo', '10111',
      'hashIntegridad', v_hash, 'schemaVersion', 518),
    'pending', 0, v_event_key, v_event_id, v_cierre_at, now(), now()
  );

  INSERT INTO public.cortes_caja (
    tenant_id, sesion_caja_id, caja_id, fecha_corte, cajero_id, moneda,
    total_ventas, total_impuestos, total_neto, total_documentos,
    resumen_metodos_pago, resumen_fiscal, integridad_hash,
    estado, metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_sesion_id, v_sesion.caja_id, v_cierre_at,
    coalesce(v_sesion.cajero_id, v_sesion.usuario_id),
    coalesce(v_sesion.moneda, 'PEN'), v_total_ventas, v_total_impuestos,
    round(v_total_ventas - v_total_impuestos, 2), v_total_documentos,
    v_metodos, v_fiscal, v_hash, 'ACTIVO',
    jsonb_build_object(
      'atomic_rpc', 'cerrar_caja_tx_518',
      'schema_version', 518,
      'tipo_diferencia', v_tipo_diferencia,
      'redondeo_efectivo_legal', v_redondeo_legal,
      'redondeo_efectivo_documentado', v_redondeo_documentado,
      'redondeo_efectivo_cantidad', v_redondeo_cantidad,
      'supervisor_authorization_fingerprint', v_authorization_fingerprint
    ),
    now(), now()
  );

  v_result := jsonb_build_object(
    'success', true,
    'id', p_sesion_id, 'estado', 'CERRADA', 'caja_id', v_sesion.caja_id,
    'monto_inicio', coalesce(v_sesion.monto_inicio, v_sesion.monto_inicial, 0),
    'monto_esperado', v_esperado, 'monto_contado', v_contado,
    'monto_cierre', v_contado, 'diferencia', v_diferencia,
    'tipo_diferencia', v_tipo_diferencia,
    'redondeo_efectivo_legal', v_redondeo_legal,
    'redondeo_efectivo_documentado', v_redondeo_documentado,
    'redondeo_efectivo_cantidad', v_redondeo_cantidad,
    'supervisor_id', v_supervisor_id,
    'supervisor_authorization_fingerprint', v_authorization_fingerprint,
    'hash_integridad', v_hash,
    'hora_apertura', coalesce(v_sesion.hora_apertura, v_sesion.fecha_apertura),
    'hora_cierre', v_cierre_at, 'denominaciones_cierre', v_denominaciones,
    'cierre_administrativo', v_admin, 'close_event_id', v_event_id,
    'idempotent', false
  );

  IF v_supervisor_id IS NOT NULL THEN
    INSERT INTO public.autorizaciones_caja (
      tenant_id, sesion_caja_id, supervisor_id, solicitante_id,
      tipo_autorizacion, monto_solicitado, razon_autorizacion,
      firma_digital, estado, aprobado_at, metadata
    ) VALUES (
      p_tenant_id, p_sesion_id, v_supervisor_id, p_actor_id,
      'CIERRE_DIFERENCIA_ALTA', abs(v_diferencia),
      CASE
        WHEN app.cierre_caja_requiere_supervisor_518(
          v_diferencia, v_tolerancia, v_pais, v_moneda, v_redondeo_documentado
        ) THEN 'Autorización de diferencia de cierre'
        ELSE 'Supervisor acreditado voluntariamente para cierre'
      END,
      v_authorization_fingerprint, 'APROBADO', v_cierre_at,
      jsonb_build_object(
        'schema_version', 518,
        'close_fingerprint', v_fingerprint,
        'pin_version', v_pin_version,
        'tolerancia', v_tolerancia,
        'tipo_diferencia', v_tipo_diferencia
      )
    );
  END IF;

  UPDATE public.sesiones_caja SET
    estado = 'CERRADA', hora_cierre = v_cierre_at, fecha_cierre = v_cierre_at,
    cerrado_por = p_actor_id::text, usuario_cierre = p_actor_id::text,
    monto_esperado = v_esperado, monto_contado = v_contado,
    monto_cierre = v_contado, diferencia = v_diferencia,
    denominaciones_cierre = v_denominaciones,
    supervisor_cierre_id = v_supervisor_id,
    cierre_administrativo = v_admin,
    razon_cierre_administrativo = CASE WHEN v_admin THEN v_razon ELSE NULL END,
    hash_integridad = v_hash,
    notas = nullif(btrim(coalesce(p_payload->>'notas', '')), ''),
    resumen = coalesce(p_payload->'resumen', v_fiscal),
    close_fingerprint = v_fingerprint, close_result = v_result,
    close_event_id = v_event_id, updated_at = now()
  WHERE id = p_sesion_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_sesion;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_caja_tx(
  p_tenant_id uuid,
  p_sesion_id uuid,
  p_actor_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.cerrar_caja_tx_518($1, $2, $3, $4);
$function$;

REVOKE ALL ON FUNCTION app.ajuste_redondeo_efectivo_inmutable_518()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.rotacion_pin_inmutable_518()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.pos_registrar_venta_atomic_tx_518(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.resumen_redondeo_documentado_cierre_caja_518(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resumen_redondeo_documentado_cierre_caja_518(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.es_redondeo_efectivo_legal_518(numeric,text,text,numeric)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.cierre_caja_requiere_supervisor_518(numeric,numeric,text,text,numeric)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.resolver_tolerancia_cierre_caja_518(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolver_tolerancia_cierre_caja_518(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.reactivar_bloqueos_supervisor_vencidos_518(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.listar_supervisores_autorizados_caja_518(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listar_supervisores_gestion_pin_caja_518(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
-- La primitiva 497 queda privada al dueño; la API sólo usa el wrapper 518 que
-- exige users.manage y rol supervisor en la propia transacción.
REVOKE EXECUTE ON FUNCTION public.registrar_pin_supervisor_tx(uuid,uuid,uuid,text)
  FROM service_role;
REVOKE ALL ON FUNCTION app.cerrar_caja_tx_518(uuid,uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cerrar_caja_tx(uuid,uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_caja_tx(uuid,uuid,uuid,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resumen_redondeo_documentado_cierre_caja_518(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_tolerancia_cierre_caja_518(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.listar_supervisores_autorizados_caja_518(uuid,uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.listar_supervisores_gestion_pin_caja_518(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)
  TO service_role;

COMMENT ON TABLE public.ajustes_redondeo_efectivo_pos IS
  'Ledger privado e inmutable del efectivo dejado de cobrar por redondeo legal PE; cada fila liga venta, pago, movimiento y sesión.';
COMMENT ON TABLE public.supervisor_pin_rotaciones_518 IS
  'Ledger privado e inmutable de idempotencia de rotaciones PIN; no almacena el PIN ni una huella reversible del secreto.';
COMMENT ON FUNCTION app.es_redondeo_efectivo_legal_518(numeric,text,text,numeric) IS
  'Clasifica un cierre PE/PEN sólo cuando la diferencia negativa coincide exactamente con ajustes POS documentados.';
COMMENT ON FUNCTION public.resumen_redondeo_documentado_cierre_caja_518(uuid,uuid) IS
  'Resume monto y cantidad de ajustes vivos e inmutables de una sesión para preview y writer de cierre.';
COMMENT ON FUNCTION public.resolver_tolerancia_cierre_caja_518(uuid,uuid) IS
  'Resuelve tolerancia activa con precedencia caja específica > global y desempate determinista; fuente única del preview y writer 518.';
COMMENT ON FUNCTION public.cerrar_caja_tx(uuid,uuid,uuid,jsonb) IS
  'Cierre 518: reconcilia únicamente ajustes POS documentados y acredita en SQL un supervisor distinto del actor y del cajero mediante rol, PIN y huella.';

COMMIT;

NOTIFY pgrst, 'reload schema';
