-- Lecturas comprobadas por el recorrido HTTP/Chromium sobre una reconstrucción
-- local limpia. La API mantiene permisos funcionales y filtros de empresa.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

GRANT SELECT ON TABLE
  public.activos_fijos,
  public.centros_costo,
  public.compras,
  public.comunicaciones_baja,
  public.cotizaciones,
  public.diferidos,
  public.documento_detalles,
  public.grupos_consolidacion,
  public.grupos_consolidacion_miembros,
  public.normativa_peru_periodos,
  public.plantillas_asientos,
  public.presupuestos,
  public.registro_consignaciones,
  public.movimientos_consignacion,
  public.reportes_contables_configurables,
  public.reportes_contables_lineas,
  public.resumenes_diarios,
  public.tasas_detraccion,
  public.tipos_cambio,
  public.asistencia,
  public.departamentos,
  public.empleado_horarios,
  public.horarios_trabajo,
  public.candidatos,
  public.vacantes,
  public.libro_retenciones,
  public.conciliaciones_bancarias,
  public.pedidos_venta,
  public.pedidos_venta_detalle,
  public.rma_solicitudes,
  public.v_documentos_completos,
  public.vw_inventario_recepciones
TO service_role;

-- El catálogo de vendedores legacy sólo necesita identidad comercial pública.
GRANT SELECT (id, tenant_id, nombre, apellido, email, activo)
ON public.usuarios TO service_role;

-- Sin backfill, cambios de datos, escritores, RLS ni ACL del navegador.
-- Rollback: restaurar ACL desde el respaldo de esquema previo; no revocar
-- concesiones preexistentes a ciegas. Detener antes el runtime incompatible.
COMMIT;
