-- 491: la venta POS fallaba con 22023 "cannot extract elements from a scalar"
--
-- Causa: app.pos_payments_canonical_451 protegia su jsonb_array_elements con
-- coalesce(p_pagos, '[]'::jsonb). coalesce solo sustituye SQL NULL, no el JSON
-- null. El API envia "pagos": null en el payload (pos.service.ts arma
-- `pagos: pagosNormalizados ? [...] : null`), y en Postgres `p_intencion->'pagos'`
-- sobre una clave existente con valor null devuelve 'null'::jsonb -- un escalar,
-- no SQL NULL. coalesce lo dejaba pasar y jsonb_array_elements abortaba la venta
-- entera: sin ticket, sin descuento de stock y con el carrito intacto.
--
-- Arreglo: guardar por TIPO, no por nulidad. Se corrige tambien el mismo patron
-- en las otras dos funciones del camino POS, donde hoy es latente porque los
-- items siempre llegan como array.

BEGIN;

CREATE OR REPLACE FUNCTION app.jsonb_array_or_empty_491(p_valor jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_valor) = 'array' THEN p_valor
    ELSE '[]'::jsonb
  END;
$$;

COMMENT ON FUNCTION app.jsonb_array_or_empty_491(jsonb) IS
  'Devuelve el valor solo si es un array JSON; en cualquier otro caso ([], null JSON, escalar u objeto) devuelve []. Evita el 22023 de jsonb_array_elements, que coalesce no puede prevenir porque el JSON null no es SQL NULL.';

CREATE OR REPLACE FUNCTION app.pos_items_canonical_451(p_items jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'producto_id', app.to_uuid_or_null(coalesce(x->>'producto_id', '')),
      'cantidad', round(app.to_numeric_or_zero(x->>'cantidad'), 6),
      'precio_unitario', round(app.to_numeric_or_zero(coalesce(x->>'precio_unitario', x->>'precio_original')), 6),
      'descuento_monto', round(app.to_numeric_or_zero(x->>'descuento_monto'), 2),
      'subtotal', round(app.to_numeric_or_zero(x->>'subtotal'), 2),
      'igv', round(app.to_numeric_or_zero(x->>'igv'), 2)
    )
    ORDER BY
      coalesce(x->>'producto_id', ''),
      round(app.to_numeric_or_zero(x->>'cantidad'), 6),
      round(app.to_numeric_or_zero(coalesce(x->>'precio_unitario', x->>'precio_original')), 6),
      round(app.to_numeric_or_zero(x->>'descuento_monto'), 2),
      round(app.to_numeric_or_zero(x->>'subtotal'), 2),
      round(app.to_numeric_or_zero(x->>'igv'), 2)
  ), '[]'::jsonb)
  FROM jsonb_array_elements(app.jsonb_array_or_empty_491(p_items)) x;
$$;

CREATE OR REPLACE FUNCTION app.pos_payments_canonical_451(p_pagos jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'metodo_pago_id', app.to_uuid_or_null(coalesce(x->>'metodo_pago_id', '')),
      'codigo', lower(btrim(coalesce(x->>'codigo', x->>'metodo_pago', ''))),
      'monto', round(app.to_numeric_or_zero(x->>'monto'), 2),
      'moneda', upper(coalesce(nullif(btrim(x->>'moneda'), ''), 'PEN')),
      'referencia', nullif(btrim(coalesce(x->>'referencia', '')), '')
    )
    ORDER BY
      coalesce(x->>'metodo_pago_id', ''),
      lower(btrim(coalesce(x->>'codigo', x->>'metodo_pago', ''))),
      lower(btrim(coalesce(x->>'referencia', ''))),
      round(app.to_numeric_or_zero(x->>'monto'), 2)
  ), '[]'::jsonb)
  FROM jsonb_array_elements(app.jsonb_array_or_empty_491(p_pagos)) x;
$$;

CREATE OR REPLACE FUNCTION app.pos_intencion_comercial_469(p_intencion jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $$
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
  );
$$;

REVOKE ALL ON FUNCTION app.jsonb_array_or_empty_491(jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Contrato: un JSON null en pagos ya no puede abortar la venta.
DO $$
BEGIN
  IF app.pos_payments_canonical_451('null'::jsonb) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'POS_PAYMENTS_JSON_NULL_NO_CANONICALIZA_A_ARRAY_VACIO';
  END IF;
  IF app.pos_items_canonical_451('null'::jsonb) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'POS_ITEMS_JSON_NULL_NO_CANONICALIZA_A_ARRAY_VACIO';
  END IF;
  IF app.pos_intencion_comercial_469('{"pagos": null, "items": null}'::jsonb)->'pagos' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'POS_INTENCION_JSON_NULL_NO_CANONICALIZA_A_ARRAY_VACIO';
  END IF;
END;
$$;

COMMIT;
