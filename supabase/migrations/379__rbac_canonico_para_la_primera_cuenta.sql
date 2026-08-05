-- ============================================================================
-- 379__rbac_canonico_para_la_primera_cuenta.sql
-- Una base de producción recién creada no podía dar de alta ni un solo tenant:
-- app.seed_operational_rbac_for_tenant clona roles y permisos de OTRO tenant
-- que ya los tenga, y en una base vacía no hay ninguno. La primera cuenta
-- moría con 'No existe tenant fuente con RBAC operativo completo'.
--
-- El catálogo canónico ya vivía en la 320, pero allí se sembró solo para los
-- tenants que existían el día de esa migración. Aquí se vuelve reutilizable:
-- una función que siembra ese mismo catálogo en un tenant concreto, y el
-- seeder la usa cuando no hay de dónde clonar. Con un tenant fuente disponible
-- el comportamiento no cambia.
-- Funciones foco:
--   app.sembrar_rbac_canonico(uuid)
--   app.seed_operational_rbac_for_tenant(uuid, uuid)
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION app.sembrar_rbac_canonico(p_tenant_id uuid)
RETURNS TABLE (
  permisos_seeded integer,
  roles_seeded integer,
  role_permissions_seeded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $fn$
BEGIN
  permisos_seeded := 0;
  roles_seeded := 0;
  role_permissions_seeded := 0;

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
)
INSERT INTO public.permisos (
  tenant_id, modulo, recurso, accion, codigo, descripcion, activo
)
SELECT p_tenant_id, p.modulo, p.recurso, p.accion, p.codigo, p.descripcion, true
FROM parsed_permissions p
WHERE NOT EXISTS (
  SELECT 1 FROM public.permisos existing
  WHERE existing.tenant_id = p_tenant_id
    AND lower(existing.codigo) = p.codigo
);
GET DIAGNOSTICS permisos_seeded = ROW_COUNT;

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
)
INSERT INTO public.roles (
  tenant_id, nombre, descripcion, is_system_role, activo
)
SELECT p_tenant_id, r.nombre, r.descripcion, true, true
FROM role_defs r
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles existing
  WHERE existing.tenant_id = p_tenant_id
    AND lower(existing.nombre) = lower(r.nombre)
);
GET DIAGNOSTICS roles_seeded = ROW_COUNT;

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
  role_id, permiso_id, concedido
)
SELECT r.id, p.id, true
FROM public.roles r
JOIN role_patterns rp ON lower(r.nombre) = lower(rp.nombre)
JOIN public.permisos p ON p.tenant_id = r.tenant_id
WHERE r.tenant_id = p_tenant_id
  AND lower(p.codigo) ~ rp.pattern
  AND COALESCE(p.activo, true) = true
  AND NOT EXISTS (
    SELECT 1 FROM public.rol_permisos existing
    WHERE existing.role_id = r.id
      AND existing.permiso_id = p.id
  );
GET DIAGNOSTICS role_permissions_seeded = ROW_COUNT;

  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION app.sembrar_rbac_canonico(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.sembrar_rbac_canonico(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- El seeder deja de exigir un tenant del que copiar: si no hay ninguno, siembra
-- el catálogo canónico. Con un tenant fuente disponible se comporta igual que
-- antes, así que las instalaciones existentes no cambian de comportamiento.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.seed_operational_rbac_for_tenant(
  p_tenant_id uuid,
  p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  permisos_seeded integer,
  roles_seeded integer,
  role_permissions_seeded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $seed$
DECLARE
  v_source_tenant_id uuid;
  v_is_demo boolean := false;
  v_admin_permissions_seeded integer := 0;
  v_canonico record;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id es requerido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant % no existe', p_tenant_id;
  END IF;

  SELECT COALESCE(ec.is_demo, false)
  INTO v_is_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  LIMIT 1;

  v_is_demo := COALESCE(v_is_demo, false);

  IF p_source_tenant_id IS NOT NULL THEN
    SELECT t.id
    INTO v_source_tenant_id
    FROM public.tenants t
    WHERE t.id = p_source_tenant_id
      AND t.id <> p_tenant_id
    LIMIT 1;
  END IF;

  IF v_source_tenant_id IS NULL THEN
    SELECT r.tenant_id
    INTO v_source_tenant_id
    FROM public.roles r
    JOIN public.permisos p ON p.tenant_id = r.tenant_id
    WHERE r.tenant_id <> p_tenant_id
      AND upper(r.nombre) IN (
        'ADMIN', 'GERENCIA', 'COMPRAS', 'ALMACEN', 'VENDEDOR',
        'CAJERO', 'FINANZAS', 'CONTADOR', 'RRHH', 'AUDITOR'
      )
      AND COALESCE(r.activo, true) = true
      AND COALESCE(p.activo, true) = true
    GROUP BY r.tenant_id
    HAVING count(DISTINCT upper(r.nombre)) = 10
       AND count(DISTINCT lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))) >= 100
    ORDER BY count(DISTINCT lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))) DESC
    LIMIT 1;
  END IF;

  IF v_source_tenant_id IS NULL THEN
    -- Primera cuenta de la instalación: no hay de dónde clonar.
    SELECT c.permisos_seeded, c.roles_seeded, c.role_permissions_seeded
    INTO v_canonico
    FROM app.sembrar_rbac_canonico(p_tenant_id) c;

    permisos_seeded := v_canonico.permisos_seeded;
    roles_seeded := v_canonico.roles_seeded;
    role_permissions_seeded := v_canonico.role_permissions_seeded;

    -- Un demo no se lleva los permisos sensibles aunque los traiga el catálogo:
    -- misma poda que se aplica cuando se clona de otro tenant.
    IF v_is_demo THEN
      DELETE FROM public.rol_permisos rp
      USING public.roles r, public.permisos p
      WHERE rp.role_id = r.id
        AND rp.permiso_id = p.id
        AND r.tenant_id = p_tenant_id
        AND p.tenant_id = p_tenant_id
        AND upper(r.nombre) = 'ADMIN'
        AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) IN (
          'documentos.audit.read',
          'security.audit.read',
          'system.debug',
          'tenants.manage',
          'users.manage'
        );
    END IF;
  ELSE
    INSERT INTO public.permisos (
      tenant_id, modulo, recurso, accion, codigo, descripcion, activo
    )
    SELECT
      p_tenant_id,
      p.modulo,
      p.recurso,
      p.accion,
      lower(COALESCE(NULLIF(p.codigo, ''), p.modulo || '.' || p.recurso || '.' || p.accion)),
      p.descripcion,
      COALESCE(p.activo, true)
    FROM public.permisos p
    WHERE p.tenant_id = v_source_tenant_id
      AND COALESCE(p.activo, true) = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.permisos existing
        WHERE existing.tenant_id = p_tenant_id
          AND lower(COALESCE(existing.codigo, existing.modulo || '.' || existing.recurso || '.' || existing.accion))
            = lower(COALESCE(NULLIF(p.codigo, ''), p.modulo || '.' || p.recurso || '.' || p.accion))
      );
    GET DIAGNOSTICS permisos_seeded = ROW_COUNT;

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
    )
    INSERT INTO public.roles (
      tenant_id, nombre, descripcion, is_system_role, activo
    )
    SELECT p_tenant_id, rd.nombre, rd.descripcion, true, true
    FROM role_defs rd
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.roles existing
      WHERE existing.tenant_id = p_tenant_id
        AND upper(existing.nombre) = rd.nombre
    );
    GET DIAGNOSTICS roles_seeded = ROW_COUNT;

    INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
    SELECT
      target_role.id,
      target_perm.id,
      COALESCE(source_rp.concedido, true)
    FROM public.rol_permisos source_rp
    JOIN public.roles source_role ON source_role.id = source_rp.role_id
    JOIN public.permisos source_perm ON source_perm.id = source_rp.permiso_id
    JOIN public.roles target_role
      ON target_role.tenant_id = p_tenant_id
     AND upper(target_role.nombre) = upper(source_role.nombre)
    JOIN public.permisos target_perm
      ON target_perm.tenant_id = p_tenant_id
     AND lower(COALESCE(target_perm.codigo, target_perm.modulo || '.' || target_perm.recurso || '.' || target_perm.accion))
       = lower(COALESCE(source_perm.codigo, source_perm.modulo || '.' || source_perm.recurso || '.' || source_perm.accion))
    WHERE source_role.tenant_id = v_source_tenant_id
      AND source_perm.tenant_id = v_source_tenant_id
      AND upper(source_role.nombre) IN (
        'ADMIN', 'GERENCIA', 'COMPRAS', 'ALMACEN', 'VENDEDOR',
        'CAJERO', 'FINANZAS', 'CONTADOR', 'RRHH', 'AUDITOR'
      )
      AND (
        NOT v_is_demo
        OR upper(source_role.nombre) <> 'ADMIN'
        OR lower(COALESCE(source_perm.codigo, source_perm.modulo || '.' || source_perm.recurso || '.' || source_perm.accion))
          NOT IN (
            'documentos.audit.read',
            'security.audit.read',
            'system.debug',
            'tenants.manage',
            'users.manage'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.rol_permisos existing
        WHERE existing.role_id = target_role.id
          AND existing.permiso_id = target_perm.id
      );
    GET DIAGNOSTICS role_permissions_seeded = ROW_COUNT;
  END IF;

  -- ADMIN operativo es administrador total de su tenant. Los endpoints globales
  -- siguen protegidos adicionalmente por SuperAdminGuard.
  IF NOT v_is_demo THEN
    INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
    SELECT r.id, p.id, true
    FROM public.roles r
    JOIN public.permisos p ON p.tenant_id = r.tenant_id
    WHERE r.tenant_id = p_tenant_id
      AND upper(r.nombre) = 'ADMIN'
      AND COALESCE(r.activo, true) = true
      AND COALESCE(p.activo, true) = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.rol_permisos existing
        WHERE existing.role_id = r.id
          AND existing.permiso_id = p.id
      );
    GET DIAGNOSTICS v_admin_permissions_seeded = ROW_COUNT;
    role_permissions_seeded := role_permissions_seeded + v_admin_permissions_seeded;
  END IF;

  RETURN NEXT;
END;
$seed$;

REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) TO service_role;

COMMIT;
