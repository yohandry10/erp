\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'RMA 456 concurrency fixture solo puede ejecutarse en erp_e2e';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = '45610000-0000-4000-8000-000000000001'::uuid
      AND codigo <> 'QA-RMA-456-RACE'
  ) THEN
    RAISE EXCEPTION 'UUID del fixture RMA 456 ocupado por otro tenant';
  END IF;
END;
$$;

DELETE FROM public.tenants
WHERE id = '45610000-0000-4000-8000-000000000001'::uuid
  AND codigo = 'QA-RMA-456-RACE';

BEGIN;

INSERT INTO public.tenants (
  id, codigo, nombre, descripcion, pais, plan, activo, estado
) VALUES (
  '45610000-0000-4000-8000-000000000001', 'QA-RMA-456-RACE',
  'QA local concurrencia RMA 456', 'Fixture sintetico efimero',
  'PE', 'test', true, 'ACTIVO'
);

INSERT INTO public.empresa_config (
  tenant_id, ruc, razon_social, pais, moneda_defecto, estado,
  configuracion_completa, habilitar_rma, dias_maximos_rma,
  rma_requiere_control_calidad, serie_nota_credito
) VALUES (
  '45610000-0000-4000-8000-000000000001', '20600001456',
  'QA local concurrencia RMA 456', 'PE', 'PEN', 'ACTIVO',
  true, true, 30, false, 'FC56'
);

INSERT INTO public.usuarios_sistema (
  id, tenant_id, nombre, apellido, email, nombre_usuario,
  password_hash, activo, estado
) VALUES (
  '45610000-0000-4000-8000-000000000002',
  '45610000-0000-4000-8000-000000000001',
  'Actor', 'Race 456', 'race-456@local.invalid', 'race456',
  'unused-local-hash', true, 'ACTIVO'
);

INSERT INTO public.clientes (
  id, tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
) VALUES (
  '45610000-0000-4000-8000-000000000003',
  '45610000-0000-4000-8000-000000000001',
  'CLI-RACE-456', 'Cliente race 456', 'Cliente race 456',
  'RUC', '20123451456', true
);

INSERT INTO public.almacenes (
  id, tenant_id, codigo, nombre, estado, activo, es_principal, pais
) VALUES (
  '45610000-0000-4000-8000-000000000004',
  '45610000-0000-4000-8000-000000000001',
  'ALM-RACE-456', 'Almacen race 456', 'ACTIVO', true, true, 'PE'
);

INSERT INTO public.productos (
  id, tenant_id, codigo, nombre, estado, activo, es_servicio,
  controla_stock, precio_venta, precio_compra, afectacion_igv,
  stock, stock_actual, stock_reservado
) VALUES (
  '45610000-0000-4000-8000-000000000005',
  '45610000-0000-4000-8000-000000000001',
  'PROD-RACE-456', 'Producto race 456', 'ACTIVO', true, false,
  true, 118, 10, '10', 0, 0, 0
);

INSERT INTO public.pedidos_venta (
  id, tenant_id, cliente_id, numero, fecha, fecha_pedido, estado,
  subtotal, igv, total, moneda, created_by
) VALUES (
  '45610000-0000-4000-8000-000000000006',
  '45610000-0000-4000-8000-000000000001',
  '45610000-0000-4000-8000-000000000003',
  'PV-RACE-456', current_date, current_date, 'FACTURADO',
  200, 36, 236, 'PEN',
  '45610000-0000-4000-8000-000000000002'
);

INSERT INTO public.pedidos_venta_detalle (
  id, tenant_id, pedido_id, producto_id, descripcion, cantidad,
  precio_unitario, subtotal, estado_item, cantidad_despachada,
  cantidad_facturada, created_at
) VALUES (
  '45610000-0000-4000-8000-000000000007',
  '45610000-0000-4000-8000-000000000001',
  '45610000-0000-4000-8000-000000000006',
  '45610000-0000-4000-8000-000000000005',
  'Producto race 456', 2, 118, 236, 'FACTURADO', 2, 2, now()
);

INSERT INTO public.documentos (
  id, tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
  fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
  total, total_gravadas, total_exoneradas, total_inafectas,
  total_exportacion, pedido_id, cliente_id, created_by,
  emisor_ruc, emisor_razon_social, emisor_direccion,
  receptor_tipo_doc, receptor_numero_doc, receptor_documento,
  receptor_razon_social, receptor_nombre, receptor_direccion
) VALUES (
  '45610000-0000-4000-8000-000000000008',
  '45610000-0000-4000-8000-000000000001',
  'FACTURA', 'F456', '00000077', 'EMITIDO', now(),
  now() + interval '30 days', 'PEN', 1, 200, 36, 236,
  200, 0, 0, 0,
  '45610000-0000-4000-8000-000000000006',
  '45610000-0000-4000-8000-000000000003',
  '45610000-0000-4000-8000-000000000002',
  '20600001456', 'QA local concurrencia RMA 456', 'Lima',
  '6', '20123451456', '20123451456',
  'Cliente race 456', 'Cliente race 456', 'Lima'
);

INSERT INTO public.documento_detalles (
  id, tenant_id, documento_id, orden, producto_id, codigo_producto,
  descripcion, unidad_medida, cantidad, precio_unitario,
  descuento_unitario, valor_venta, impuesto_igv, impuesto_isc,
  total_item, metadata
) VALUES (
  '45610000-0000-4000-8000-000000000009',
  '45610000-0000-4000-8000-000000000001',
  '45610000-0000-4000-8000-000000000008', 1,
  '45610000-0000-4000-8000-000000000005', 'PROD-RACE-456',
  'Producto race 456', 'NIU', 2, 118, 0, 200, 36, 0, 236,
  jsonb_build_object('afectacion_igv', '10')
);

INSERT INTO public.cpe (
  id, tenant_id, documento_id, tipo_documento, serie, numero,
  numero_comprobante, ruc_emisor, razon_social_emisor, direccion_emisor,
  tipo_documento_receptor, documento_receptor, razon_social_receptor,
  direccion_receptor, cliente_id, moneda, total_gravadas,
  total_exoneradas, total_inafectas, total_exportacion, total_igv,
  total_venta, total, items, fecha_emision, fecha_vencimiento,
  estado, estado_sunat, sunat_status, created_by, event_id, activo
) VALUES (
  '45610000-0000-4000-8000-000000000010',
  '45610000-0000-4000-8000-000000000001',
  '45610000-0000-4000-8000-000000000008',
  '01', 'F456', '00000077', 77,
  '20600001456', 'QA local concurrencia RMA 456', 'Lima',
  '6', '20123451456', 'Cliente race 456', 'Lima',
  '45610000-0000-4000-8000-000000000003',
  'PEN', 200, 0, 0, 0, 36, 236, 236,
  jsonb_build_array(jsonb_build_object(
    'producto_id', '45610000-0000-4000-8000-000000000005',
    'codigo', 'PROD-RACE-456', 'cantidad', 2,
    'valor_venta', 200, 'igv', 36
  )),
  now(), current_date + 30,
  'ACEPTADO', 'ACEPTADO', 'ACCEPTED',
  '45610000-0000-4000-8000-000000000002',
  '45610000-0000-4000-8000-000000000011', true
);

UPDATE public.pedidos_venta
SET factura_id = '45610000-0000-4000-8000-000000000010'
WHERE id = '45610000-0000-4000-8000-000000000006';

COMMIT;
