-- Lecturas requeridas por HTTP real sobre una reconstrucción limpia. Supabase
-- puede conceder privilegios por defecto, pero el runtime no debe depender de
-- grants externos al historial. Ninguna de estas concesiones habilita DML.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

GRANT SELECT ON TABLE
  public.usuario_sucursales,
  public.sucursales,
  public.vista_pos_productos,
  public.metodos_pago,
  public.paises,
  public.configuracion_fiscal,
  public.tipos_documentos_fiscales,
  public.tipos_impuestos,
  public.documento_series,
  public.pos_numeracion,
  public.detalle_ventas_pos,
  public.ventas_pos,
  public.ventas_pos_pagos,
  public.plan_cuentas,
  public.configuracion_caja,
  public.cortes_caja,
  public.usuario_configuracion,
  public.caja_audit_log,
  public.eventos_pos,
  public.periodos_contables,
  public.asientos_contables,
  public.detalle_asientos,
  public.plantillas_asientos_ventas,
  public.event_processing_log
TO service_role;

-- No hay backfill ni alteración de RLS, contenido, escritores o grants de
-- anon/authenticated. Rollback: restaurar las ACL previas desde el respaldo de
-- esquema; no revocar a ciegas concesiones que existían antes de esta migración.
COMMIT;
