-- 501__admin_demo_sin_permisos_globales.sql
--
-- Los 66 roles ADMIN_DEMO de produccion tienen `tenants.manage`, `system.debug`,
-- `security.audit.read` y `documentos.audit.read`. El verificador 490 exige lo
-- contrario y falla desde que existe; se daba por dato heredado. No lo es: un
-- tenant demo recien creado en base limpia sale igual, asi que es un defecto vivo.
--
-- La raiz no estaba donde parecia. `ensure_demo_admin_rbac_for_tenant` excluye esos
-- permisos correctamente y aun asi el rol acaba con los 256, porque el granter es
-- otro: `app.sembrar_permisos_rrhh_financiero_495`. Su tercer INSERT reparte los
-- paquetes por nombre de rol y tiene tres ramas; las de CONTADOR y FINANZAS filtran
-- por codigo, la de administracion no:
--
--     upper(r.nombre) IN ('ADMIN', 'ADMIN_DEMO')      -- sin filtro de permiso
--
-- Sin filtro, el JOIN con `permisos` entrega el catalogo entero del tenant. Y
-- corre desde el trigger `seed_rrhh_role_495` sobre `public.roles`, es decir en el
-- instante en que `ensure_demo_admin_rbac_for_tenant` inserta el rol ADMIN_DEMO
-- --pisando, tres lineas antes de ejecutarse, las exclusiones de esa misma
-- funcion. Por eso volver a llamarla no arreglaba nada: solo inserta el conjunto
-- permitido, que ya estaba, y su DELETE defensivo apunta a ADMIN, no a ADMIN_DEMO.
-- Ese DELETE es de hecho el parche que alguien puso para el mismo desbordamiento,
-- sin advertir que ADMIN_DEMO estaba en la misma rama.
--
-- Se localizo grabando la pila con GET DIAGNOSTICS PG_CONTEXT en un trigger
-- temporal sobre `rol_permisos` durante un alta de demo, no leyendo codigo: los
-- cuatro permisos llegan desde `sembrar_permisos_rrhh_financiero_495` linea 33.
--
-- El arreglo es acotar esa rama a los once permisos que la propia funcion siembra,
-- que es lo unico que le corresponde conceder. Medido sobre base limpia, antes y
-- despues, creando un tenant demo con cada version:
--
--     ADMIN      251 -> 251     (sus permisos vienen de sembrar_rbac_canonico)
--     ADMIN_DEMO 256 -> 252     (pierde exactamente los cuatro)
--     los otros nueve roles     identicos
--     users.manage de ADMIN_DEMO conservado, que el 490 tambien lo exige
--
-- La segunda parte limpia lo ya sembrado. `users.manage` se respeta a proposito.

BEGIN;

-- 1. La rama de administracion solo concede los permisos de esta migracion.

CREATE OR REPLACE FUNCTION app.sembrar_permisos_rrhh_financiero_495(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp'
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id es obligatorio para sembrar permisos RRHH'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.permisos (
    tenant_id, modulo, recurso, accion, codigo, descripcion, activo
  ) VALUES
    (p_tenant_id, 'rrhh', 'planillas', 'create', 'rrhh.planillas.create',
      'Crear, editar o eliminar borradores de planilla', true),
    (p_tenant_id, 'rrhh', 'planillas', 'calculate', 'rrhh.planillas.calculate',
      'Calcular planillas', true),
    (p_tenant_id, 'rrhh', 'planillas', 'approve', 'rrhh.planillas.approve',
      'Aprobar y devengar planillas calculadas', true),
    (p_tenant_id, 'rrhh', 'planillas', 'pay', 'rrhh.planillas.pay',
      'Pagar planillas aprobadas contra tesorería', true),
    (p_tenant_id, 'rrhh', 'liquidaciones', 'calculate', 'rrhh.liquidaciones.calculate',
      'Calcular liquidaciones laborales', true),
    (p_tenant_id, 'rrhh', 'liquidaciones', 'approve', 'rrhh.liquidaciones.approve',
      'Aprobar liquidaciones laborales', true),
    (p_tenant_id, 'rrhh', 'liquidaciones', 'pay', 'rrhh.liquidaciones.pay',
      'Pagar liquidaciones laborales', true),
    (p_tenant_id, 'rrhh', 'liquidaciones', 'reverse', 'rrhh.liquidaciones.reverse',
      'Revertir pagos de liquidaciones', true),
    (p_tenant_id, 'rrhh', 'cts', 'calculate', 'rrhh.cts.calculate',
      'Calcular depósitos CTS', true),
    (p_tenant_id, 'rrhh', 'cts', 'deposit', 'rrhh.cts.deposit',
      'Depositar CTS contra tesorería', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND COALESCE(r.activo, true)
    -- Los paquetes por nombre pertenecen únicamente a roles canónicos. Un
    -- ADMIN_DEMO puede crear roles custom, pero esos roles reciben sólo los
    -- permisos que el writer RBAC validó y solicitó explícitamente.
    AND COALESCE(r.is_system_role, false)
    AND COALESCE(p.activo, true)
    AND (
      -- Esta funcion siembra los permisos de RRHH financiero, y eso es lo unico
      -- que puede conceder. La rama de administracion no filtraba por codigo, de
      -- modo que el JOIN con `permisos` entregaba a ADMIN y a ADMIN_DEMO el
      -- catalogo completo del tenant --incluidos tenants.manage, system.debug y
      -- las dos lecturas de auditoria-- desde un trigger sobre `public.roles`.
      (
        upper(r.nombre) IN ('ADMIN', 'ADMIN_DEMO')
        AND lower(p.codigo) IN (
          'rrhh.planillas.read', 'rrhh.planillas.create',
          'rrhh.planillas.calculate', 'rrhh.planillas.approve',
          'rrhh.planillas.pay',
          'rrhh.liquidaciones.calculate', 'rrhh.liquidaciones.approve',
          'rrhh.liquidaciones.pay', 'rrhh.liquidaciones.reverse',
          'rrhh.cts.calculate', 'rrhh.cts.deposit'
        )
      )
      OR (
        upper(r.nombre) = 'RRHH'
        AND lower(p.codigo) IN (
          'rrhh.planillas.read', 'rrhh.planillas.create',
          'rrhh.planillas.calculate', 'rrhh.planillas.approve',
          'rrhh.liquidaciones.calculate', 'rrhh.liquidaciones.approve',
          'rrhh.cts.calculate'
        )
      )
      OR (
        upper(r.nombre) IN ('FINANZAS', 'TESORERIA')
        AND lower(p.codigo) IN (
          'rrhh.planillas.read', 'rrhh.planillas.pay',
          'rrhh.liquidaciones.pay', 'rrhh.liquidaciones.reverse',
          'rrhh.cts.deposit'
        )
      )
    )
  ON CONFLICT (role_id, permiso_id) DO UPDATE SET concedido = true;
END;
$function$

;

-- 2. Retirar lo ya concedido. El espejo `role_permissions` lo mantiene el trigger
--    `sync_role_permissions_from_rol_permisos`, y se comprueba en el verificador.

DELETE FROM public.rol_permisos rp
USING public.roles r, public.permisos p
WHERE rp.role_id = r.id
  AND rp.permiso_id = p.id
  AND upper(btrim(COALESCE(r.nombre, ''))) = 'ADMIN_DEMO'
  AND (
    lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
      ~ '^(security\.audit\.|tenants\.manage$|system\.debug$)'
    OR lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
      = 'documentos.audit.read'
  );

COMMIT;
