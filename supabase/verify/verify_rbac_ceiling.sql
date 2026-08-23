-- Techo RBAC: ningún rol operativo alcanza los permisos que dan poder.
--
-- Este contrato existía, pero sólo dentro de una prueba e2e que **no se ejecuta**.
-- `tests/e2e/superadmin-tenant-rbac-rls.spec.ts` fija los permisos por rol y es una
-- de las 22 e2e que CI no corre: necesitan el API levantado con base y credenciales
-- reales, y el job de Playwright sólo levanta la web. Es una razón arquitectónica,
-- no un olvido, pero el efecto es el mismo: el contrato no lo comprueba nadie.
--
-- Y ya derivó. La e2e espera ADMIN 195, CONTADOR 64 y VENDEDOR 51; en producción
-- son 251–256, 99 y 56. Fijar un número es un contrato malo: crece solo cada vez
-- que se añade un permiso ordinario, y entonces la prueba estorba y se apaga.
--
-- Lo que sí es estable es el techo. De los cinco permisos sensibles, tres dan
-- poder de verdad —crear y administrar contribuyentes, administrar usuarios y
-- roles, y depurar el sistema— y sólo deben vivir en los roles de administración.
-- Los otros dos son lecturas de auditoría, y en producción los llevan AUDITOR,
-- CONTADOR, FINANZAS y GERENCIA, que es exactamente para lo que existen: no se
-- comprueban aquí porque prohibirlos seria describir mal el producto.
--
-- Deliberadamente **no** se dice nada sobre qué debe tener ADMIN_DEMO: de eso ya
-- responde el verificador 501, que cubre las dos mitades --el dato sembrado y el
-- camino de alta-- después de que la migración del mismo número cerrara el
-- desbordamiento que le entregaba el catálogo entero.
--
-- Va sin número porque no le corresponde ninguna migración: es un invariante, como
-- `verify_outbox_integrity.sql`.

BEGIN;

DO $verify$
DECLARE
  v_tenant uuid;
  v_roles integer;
  v_infractores text;
BEGIN
  -- El alta de un contribuyente exige el entorno declarado.
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-RBAC', 14, 'PE', 'verify-rbac-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  ---------------------------------------------------------------------------
  -- Control de la medición: sin roles sembrados la comprobación no mide nada
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_roles FROM public.roles WHERE tenant_id = v_tenant;
  IF v_roles < 3 THEN
    RAISE EXCEPTION
      'VERIFY_RBAC: el alta sembró % roles; la comprobación no está midiendo nada', v_roles;
  END IF;

  ---------------------------------------------------------------------------
  -- El techo
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT upper(r.nombre) || ':' || lower(
           COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)
         ), ', ')
    INTO v_infractores
  FROM public.roles r
  JOIN public.rol_permisos rp ON rp.role_id = r.id AND COALESCE(rp.concedido, true)
  JOIN public.permisos p ON p.id = rp.permiso_id
  WHERE r.tenant_id = v_tenant
    AND upper(btrim(COALESCE(r.nombre, ''))) NOT IN ('ADMIN', 'ADMIN_DEMO', 'SUPER_ADMIN', 'ADMINISTRADOR')
    AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
        IN ('tenants.manage', 'users.manage', 'system.debug');

  IF v_infractores IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_RBAC: un rol operativo alcanza un permiso de administración: %', v_infractores;
  END IF;

  RAISE NOTICE
    'VERIFY_RBAC OK: % roles sembrados y ninguno operativo alcanza tenants.manage, users.manage ni system.debug',
    v_roles;
END;
$verify$;

ROLLBACK;
