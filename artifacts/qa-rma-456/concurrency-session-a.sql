\set ON_ERROR_STOP on
BEGIN;
SELECT public.crear_rma_tx(
  '45610000-0000-4000-8000-000000000001',
  '45610000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'pedido_id', '45610000-0000-4000-8000-000000000006',
    'documento_origen_id', '45610000-0000-4000-8000-000000000008',
    'almacen_retorno_id', '45610000-0000-4000-8000-000000000004',
    'motivo_general', 'Carrera real RMA 456 sesion A',
    'items', jsonb_build_array(jsonb_build_object(
      'detalle_id', '45610000-0000-4000-8000-000000000007',
      'cantidad', 1,
      'motivo_item', 'Unidad concurrente A'
    ))
  ),
  'qa:456:race:create:a'
) AS session_a_result;
SELECT pg_sleep(12);
COMMIT;
