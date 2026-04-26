-- ============================================================================
-- 021__runtime_columns_alignment_final_touch.sql
-- Cierra columnas residuales de compatibilidad detectadas en escaneo de código.
-- ============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.cxc_pagos
  ADD COLUMN IF NOT EXISTS retencionmonto numeric(14,2);

ALTER TABLE IF EXISTS public.gre_detalles
  ADD COLUMN IF NOT EXISTS gre_id uuid;

ALTER TABLE IF EXISTS public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS error text;

ALTER TABLE IF EXISTS public.pagos_ventas
  ADD COLUMN IF NOT EXISTS metodo_pago text;

ALTER TABLE IF EXISTS public.producto_precios_sucursal
  ADD COLUMN IF NOT EXISTS producto_id uuid;

ALTER TABLE IF EXISTS public.producto_stock_sucursal
  ADD COLUMN IF NOT EXISTS producto_id uuid;

ALTER TABLE IF EXISTS public.registro_consignaciones
  ADD COLUMN IF NOT EXISTS fecha_registro date;

ALTER TABLE IF EXISTS public.rma_items
  ADD COLUMN IF NOT EXISTS detalle_id uuid;

ALTER TABLE IF EXISTS public.sire_registros_detalle
  ADD COLUMN IF NOT EXISTS cpe_id uuid;

ALTER TABLE IF EXISTS public.supervisor_pins
  ADD COLUMN IF NOT EXISTS usuario_id uuid;

ALTER TABLE IF EXISTS public.ventas
  ADD COLUMN IF NOT EXISTS fecha date;

-- Alias defensivo para payload legado detectado sin guion bajo.
ALTER TABLE IF EXISTS public.integration_logs
  ADD COLUMN IF NOT EXISTS fechatraslado date;

COMMIT;
