-- ============================================================================
-- 320__rbac_operational_roles_seed.sql
-- Semilla operativa RBAC para roles diarios y permisos declarados en backend.
-- ============================================================================

BEGIN;

WITH permission_defs(raw) AS (
  VALUES
  ('admin.stats.read'),
  ('analytics.cobranza.read'),
  ('analytics.finanzas.read'),
  ('analytics.rentabilidad.read'),
  ('analytics.ventas.read'),
  ('cajas.apertura'),
  ('cajas.cambios_turno.cancelar'),
  ('cajas.cambios_turno.completar'),
  ('cajas.cambios_turno.iniciar'),
  ('cajas.cambios_turno.ver'),
  ('cajas.cierre'),
  ('cajas.cierre_administrativo'),
  ('cajas.corte_z.ver'),
  ('cajas.cortes.exportar_csv'),
  ('cajas.cortes.exportar_pdf'),
  ('cajas.cortes.ver'),
  ('cajas.crear'),
  ('cajas.editar'),
  ('cajas.movimientos.manual'),
  ('cajas.precierre.ver'),
  ('cajas.retiros.conciliar'),
  ('cajas.retiros.crear'),
  ('cajas.saldo_esperado.ver'),
  ('cajas.sesiones.ver'),
  ('cajas.ver'),
  ('compras.cotizaciones.aprobar'),
  ('compras.cotizaciones.convertir_orden'),
  ('compras.cotizaciones.crear'),
  ('compras.cotizaciones.editar'),
  ('compras.cotizaciones.enviar'),
  ('compras.cotizaciones.rechazar'),
  ('compras.cotizaciones.ver'),
  ('compras.devoluciones.crear'),
  ('compras.devoluciones.emitir'),
  ('compras.devoluciones.ver'),
  ('compras.ordenes.actualizar'),
  ('compras.ordenes.aprobar'),
  ('compras.ordenes.cancelar'),
  ('compras.ordenes.crear'),
  ('compras.ordenes.rechazar'),
  ('compras.ordenes.ver'),
  ('compras.proveedores.crear'),
  ('compras.proveedores.editar'),
  ('compras.proveedores.eliminar'),
  ('compras.proveedores.read'),
  ('compras.proveedores.ver'),
  ('compras.recepciones.cerrar'),
  ('compras.recepciones.crear'),
  ('compras.recepciones.editar'),
  ('compras.recepciones.ver'),
  ('configuracion.read'),
  ('configuracion.usuarios.crear'),
  ('configuracion.usuarios.editar'),
  ('configuracion.usuarios.eliminar'),
  ('configuracion.usuarios.ver'),
  ('configuracion.write'),
  ('contabilidad.asientos.crear'),
  ('contabilidad.asientos.create'),
  ('contabilidad.asientos.read'),
  ('contabilidad.centros_costo.actualizar'),
  ('contabilidad.centros_costo.crear'),
  ('contabilidad.centros_costo.read'),
  ('contabilidad.cierre.ejecutar'),
  ('contabilidad.consignaciones.actualizar'),
  ('contabilidad.consignaciones.crear'),
  ('contabilidad.eventos.reintentar'),
  ('contabilidad.periodos.bloquear'),
  ('contabilidad.periodos.cerrar'),
  ('contabilidad.periodos.crear'),
  ('contabilidad.periodos.reabrir'),
  ('contabilidad.periodos.read'),
  ('contabilidad.periodos.validar'),
  ('contabilidad.presupuestos.actualizar'),
  ('contabilidad.presupuestos.crear'),
  ('contabilidad.presupuestos.ejecucion'),
  ('contabilidad.presupuestos.eliminar'),
  ('contabilidad.presupuestos.read'),
  ('contabilidad.reportes.actualizar'),
  ('contabilidad.reportes.read'),
  ('cpe.comprobantes.anular'),
  ('cpe.comprobantes.consultar'),
  ('cpe.comprobantes.descargar_pdf'),
  ('cpe.comprobantes.descargar_xml'),
  ('cpe.comprobantes.emitir'),
  ('cpe.comprobantes.enviar'),
  ('cpe.comprobantes.listar'),
  ('cpe.comprobantes.reenviar'),
  ('cpe.comprobantes.ver'),
  ('cpe.reportes.ver'),
  ('dashboard.stats.read'),
  ('documentos.audit.read'),
  ('documentos.cancel'),
  ('documentos.create'),
  ('documentos.download'),
  ('documentos.enviar_sunat'),
  ('documentos.generate_xml'),
  ('documentos.read'),
  ('documentos.series.read'),
  ('documentos.series.write'),
  ('documentos.stats.read'),
  ('documentos.update'),
  ('documentos.validations.run'),
  ('finanzas.bancos.gestionar'),
  ('finanzas.bancos.ver'),
  ('finanzas.conciliacion.gestionar'),
  ('finanzas.conciliacion.ver'),
  ('finanzas.cxc.cobros.write'),
  ('finanzas.cxc.read'),
  ('finanzas.cxp.gestionar'),
  ('finanzas.cxp.ver'),
  ('finanzas.read'),
  ('finanzas.tesoreria.gestionar'),
  ('finanzas.tesoreria.ver'),
  ('finanzas.write'),
  ('gre.configuracion.actualizar'),
  ('gre.configuracion.evaluar'),
  ('gre.configuracion.ver'),
  ('gre.guias.consultar'),
  ('gre.guias.descargar_xml'),
  ('gre.guias.emitir'),
  ('gre.guias.enviar'),
  ('gre.guias.reenviar'),
  ('gre.guias.ver'),
  ('gre.reportes.ver'),
  ('import-export.catalogo.import'),
  ('import-export.catalogo.preview'),
  ('import-export.comprobantes.preview'),
  ('import-export.templates.read'),
  ('inventario.almacenes.read'),
  ('inventario.ingresos.write'),
  ('inventario.kardex.read'),
  ('inventario.logistica.despachar'),
  ('inventario.logistica.preparar'),
  ('inventario.logistica.ver'),
  ('inventario.movimientos.create'),
  ('inventario.movimientos.read'),
  ('inventario.productos.create'),
  ('inventario.productos.delete'),
  ('inventario.productos.read'),
  ('inventario.productos.update'),
  ('inventario.stats.read'),
  ('notifications.create'),
  ('notifications.delete'),
  ('notifications.read'),
  ('notifications.update'),
  ('paises.usuario.read'),
  ('paises.usuario.update'),
  ('pos.caja.write'),
  ('pos.configuracion.write'),
  ('pos.read'),
  ('pos.vender'),
  ('reportes.ventas.export'),
  ('reports.inventario.read'),
  ('reports.ventas.export'),
  ('reports.ventas.read'),
  ('rrhh.access'),
  ('security.audit.read'),
  ('sire.emitir'),
  ('sire.read'),
  ('system.debug'),
  ('tenants.manage'),
  ('users.manage'),
  ('validations.run'),
  ('ventas.clientes.crear'),
  ('ventas.clientes.editar'),
  ('ventas.clientes.eliminar'),
  ('ventas.clientes.read'),
  ('ventas.clientes.validar_ruc'),
  ('ventas.clientes.ver'),
  ('ventas.cotizaciones.approve'),
  ('ventas.cotizaciones.convert'),
  ('ventas.cotizaciones.convertir_pedido'),
  ('ventas.cotizaciones.crear'),
  ('ventas.cotizaciones.editar'),
  ('ventas.cotizaciones.eliminar'),
  ('ventas.cotizaciones.read'),
  ('ventas.cotizaciones.ver'),
  ('ventas.cotizaciones.write'),
  ('ventas.facturas.create'),
  ('ventas.pedidos.cancelar'),
  ('ventas.pedidos.confirmar'),
  ('ventas.pedidos.crear'),
  ('ventas.pedidos.editar'),
  ('ventas.pedidos.generar_factura'),
  ('ventas.pedidos.ver'),
  ('ventas.pedidos.ver_gre'),
  ('ventas.pedidos.ver_historial'),
  ('ventas.pedidos_aprobaciones.resolver'),
  ('ventas.pedidos_aprobaciones.ver'),
  ('ventas.reportes.ver'),
  ('ventas.rma.aprobar'),
  ('ventas.rma.crear'),
  ('ventas.rma.generar_nota_credito'),
  ('ventas.rma.recepcionar'),
  ('ventas.rma.ver')
),
parsed_permissions AS (
  SELECT
    lower(raw) AS codigo,
    parts[1] AS modulo,
    CASE WHEN n = 2 THEN '__global__' ELSE array_to_string(parts[2:(n - 1)], '.') END AS recurso,
    parts[n] AS accion,
    'Permiso ' || raw AS descripcion
  FROM (
    SELECT raw, string_to_array(raw, '.') AS parts, array_length(string_to_array(raw, '.'), 1) AS n
    FROM permission_defs
  ) parsed
),
active_tenants AS (
  SELECT id
  FROM public.tenants
  WHERE COALESCE(activo, true) = true
)
INSERT INTO public.permisos (
  tenant_id,
  modulo,
  recurso,
  accion,
  codigo,
  descripcion,
  activo
)
SELECT
  t.id,
  p.modulo,
  p.recurso,
  p.accion,
  p.codigo,
  p.descripcion,
  true
FROM active_tenants t
CROSS JOIN parsed_permissions p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.permisos existing
  WHERE existing.tenant_id = t.id
    AND lower(existing.codigo) = p.codigo
);

WITH role_defs(nombre, descripcion) AS (
  VALUES
  ('ADMIN', 'Administrador del tenant'),
  ('GERENCIA', 'Gerencia y direccion'),
  ('COMPRAS', 'Compras y proveedores'),
  ('ALMACEN', 'Almacen e inventario'),
  ('VENDEDOR', 'Ventas B2B y clientes'),
  ('CAJERO', 'POS y caja'),
  ('FINANZAS', 'Tesoreria, CxC, CxP, bancos y conciliacion'),
  ('CONTADOR', 'Contabilidad y fiscal'),
  ('RRHH', 'Recursos humanos'),
  ('AUDITOR', 'Auditoria y trazabilidad')
),
active_tenants AS (
  SELECT id
  FROM public.tenants
  WHERE COALESCE(activo, true) = true
)
INSERT INTO public.roles (
  tenant_id,
  nombre,
  descripcion,
  is_system_role,
  activo
)
SELECT
  t.id,
  r.nombre,
  r.descripcion,
  true,
  true
FROM active_tenants t
CROSS JOIN role_defs r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.roles existing
  WHERE existing.tenant_id = t.id
    AND lower(existing.nombre) = lower(r.nombre)
);

WITH role_patterns(nombre, pattern) AS (
  VALUES
  ('ADMIN', '.*'),
  ('GERENCIA', '^(dashboard\.|analytics\.|ventas\.reportes\.|reports\.|reportes\.|finanzas\.(read|cxc\.read|cxp\.ver|bancos\.ver|conciliacion\.ver)|contabilidad\.reportes\.read|cpe\.reportes\.|gre\.reportes\.|sire\.read|security\.audit\.read)'),
  ('COMPRAS', '^(compras\.|inventario\.(productos\.read|almacenes\.read|ingresos\.write|kardex\.read|movimientos\.read)|finanzas\.cxp\.ver|sire\.read|contabilidad\.reportes\.read)'),
  ('ALMACEN', '^(inventario\.|compras\.recepciones\.|compras\.ordenes\.ver|ventas\.pedidos\.(ver|ver_gre)|gre\.guias\.ver|reports\.inventario\.read)'),
  ('VENDEDOR', '^(ventas\.|cpe\.comprobantes\.(listar|ver|consultar|emitir|enviar|descargar_pdf|descargar_xml)|gre\.guias\.(ver|emitir|enviar|consultar)|finanzas\.cxc\.read|documentos\.(read|create|update|stats\.read|series\.read|download)|analytics\.ventas\.read)'),
  ('CAJERO', '^(pos\.|cajas\.|cpe\.comprobantes\.(listar|ver|consultar|emitir|enviar)|documentos\.(read|create|download|series\.read)|finanzas\.cxc\.(read|cobros\.write))'),
  ('FINANZAS', '^(finanzas\.|cajas\.(ver|sesiones\.ver|cortes\.ver|corte_z\.ver|precierre\.ver|saldo_esperado\.ver)|analytics\.(finanzas|cobranza|rentabilidad)\.read|contabilidad\.reportes\.read|documentos\.audit\.read)'),
  ('CONTADOR', '^(contabilidad\.|finanzas\.(read|cxc\.read|cxp\.ver|bancos\.ver|conciliacion\.ver)|cpe\.|gre\.|sire\.|documentos\.|analytics\.finanzas\.read|analytics\.rentabilidad\.read)'),
  ('RRHH', '^(rrhh\.|contabilidad\.(asientos\.read|reportes\.read))'),
  ('AUDITOR', '^(security\.audit\.read|documentos\.audit\.read|analytics\.|dashboard\.stats\.read|contabilidad\.reportes\.read|finanzas\.(read|cxc\.read|cxp\.ver|bancos\.ver|conciliacion\.ver)|cpe\.comprobantes\.(listar|ver|consultar)|gre\.guias\.ver|sire\.read)')
)
INSERT INTO public.rol_permisos (
  role_id,
  permiso_id,
  concedido
)
SELECT
  r.id,
  p.id,
  true
FROM public.roles r
JOIN role_patterns rp ON lower(r.nombre) = lower(rp.nombre)
JOIN public.permisos p ON p.tenant_id = r.tenant_id
WHERE lower(p.codigo) ~ rp.pattern
  AND COALESCE(p.activo, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.rol_permisos existing
    WHERE existing.role_id = r.id
      AND existing.permiso_id = p.id
  );

COMMIT;
