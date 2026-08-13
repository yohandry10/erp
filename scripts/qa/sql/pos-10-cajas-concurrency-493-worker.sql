\set ON_ERROR_STOP on

SELECT public.pos_registrar_venta_comercial_tx(
  :'tenant_id'::uuid,
  :'actor_id'::uuid,
  :'session_id'::uuid,
  :'idempotency_key',
  jsonb_build_object(
    'emitir_cpe', false,
    'commercial_request', jsonb_build_object(
      'cliente_documento', :'cliente_documento',
      'cliente_tipo_documento', '1',
      'cliente_nombre', :'cliente_nombre',
      'moneda', 'PEN',
      'emitir_cpe', false,
      'metodo_pago', 'efectivo',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', :'producto_id'::uuid,
        'cantidad', 1,
        'precio_unitario', :'precio_unitario'::numeric,
        'descuento_monto', 0,
        'subtotal', :'precio_unitario'::numeric
      )),
      'pagos', jsonb_build_array(jsonb_build_object(
        'codigo', 'efectivo',
        'monto', round(:'precio_unitario'::numeric * 1.18, 2),
        'moneda', 'PEN'
      ))
    ),
    'cliente_documento', :'cliente_documento',
    'cliente_tipo_documento', '1',
    'cliente_nombre', :'cliente_nombre',
    'moneda', 'PEN',
    'metodo_pago', 'efectivo',
    'ticket_serie', 'T001',
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', :'producto_id'::uuid,
      'cantidad', 1,
      'precio_unitario', :'precio_unitario'::numeric,
      'descuento_monto', 0,
      'subtotal', :'precio_unitario'::numeric,
      'igv', round(:'precio_unitario'::numeric * 0.18, 2)
    )),
    'pagos', jsonb_build_array(jsonb_build_object(
      'codigo', 'efectivo',
      'monto', round(:'precio_unitario'::numeric * 1.18, 2),
      'moneda', 'PEN'
    ))
  )
)::text;
