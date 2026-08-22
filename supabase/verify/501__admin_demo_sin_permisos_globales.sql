-- Verificador 501: ADMIN_DEMO no alcanza los permisos globales.
--
-- Comprueba las dos mitades de la migracion por separado, porque fallan por
-- motivos distintos: el dato ya sembrado (un DELETE que se ejecuto una vez) y el
-- camino de alta (una funcion que puede volver a desbordarse en cualquier
-- migracion futura que retoque el sembrado por nombre de rol).
--
-- Y comprueba el espejo. `rol_permisos` y `role_permissions` son dos modelos de
-- permisos que dos triggers mantienen sincronizados en ambos sentidos; mirar solo
-- uno dejaria la mitad del sistema sin comprobar.

BEGIN;

DO $verify$
DECLARE
  v_tenant uuid;
  v_infractores text;
  v_admin_demo integer;
  v_admin integer;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Lo ya sembrado: ningun ADMIN_DEMO existente los tiene
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT lower(COALESCE(p.codigo, p.modulo||'.'||p.recurso||'.'||p.accion)), ', ')
    INTO v_infractores
  FROM public.roles r
  JOIN public.rol_permisos rp ON rp.role_id = r.id AND COALESCE(rp.concedido, true)
  JOIN public.permisos p ON p.id = rp.permiso_id
  WHERE upper(btrim(COALESCE(r.nombre, ''))) = 'ADMIN_DEMO'
    AND lower(COALESCE(p.codigo, p.modulo||'.'||p.recurso||'.'||p.accion))
        IN ('tenants.manage', 'system.debug', 'security.audit.read', 'documentos.audit.read');

  IF v_infractores IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_501: un ADMIN_DEMO ya sembrado conserva permisos globales: %', v_infractores;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. El espejo legado dice lo mismo
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT lower(COALESCE(p.codigo, p.modulo||'.'||p.recurso||'.'||p.accion)), ', ')
    INTO v_infractores
  FROM public.roles r
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE upper(btrim(COALESCE(r.nombre, ''))) = 'ADMIN_DEMO'
    AND lower(COALESCE(p.codigo, p.modulo||'.'||p.recurso||'.'||p.accion))
        IN ('tenants.manage', 'system.debug', 'security.audit.read', 'documentos.audit.read');

  IF v_infractores IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_501: el espejo `role_permissions` conserva permisos globales para ADMIN_DEMO: %', v_infractores;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. El camino de alta: un demo nuevo tampoco los recibe
  ---------------------------------------------------------------------------
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-501', 14, 'PE', 'verify-501-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  SELECT count(*) INTO v_admin_demo
  FROM public.roles r
  JOIN public.rol_permisos rp ON rp.role_id = r.id
  WHERE r.tenant_id = v_tenant AND upper(r.nombre) = 'ADMIN_DEMO';

  SELECT count(*) INTO v_admin
  FROM public.roles r
  JOIN public.rol_permisos rp ON rp.role_id = r.id
  WHERE r.tenant_id = v_tenant AND upper(r.nombre) = 'ADMIN';

  -- Control de la medicion: un ADMIN_DEMO vacio pasaria los tres cortes sin medir
  -- nada. Y ADMIN no debe encogerse al acotar la rama que compartia con el.
  IF v_admin_demo < 200 THEN
    RAISE EXCEPTION 'VERIFY_501: ADMIN_DEMO recien creado tiene % permisos; la comprobacion no esta midiendo nada', v_admin_demo;
  END IF;
  IF v_admin < 200 THEN
    RAISE EXCEPTION 'VERIFY_501: ADMIN recien creado bajo a % permisos; el arreglo se llevo por delante al rol de administracion', v_admin;
  END IF;

  SELECT string_agg(DISTINCT lower(COALESCE(p.codigo, p.modulo||'.'||p.recurso||'.'||p.accion)), ', ')
    INTO v_infractores
  FROM public.roles r
  JOIN public.rol_permisos rp ON rp.role_id = r.id AND COALESCE(rp.concedido, true)
  JOIN public.permisos p ON p.id = rp.permiso_id
  WHERE r.tenant_id = v_tenant
    AND upper(r.nombre) = 'ADMIN_DEMO'
    AND lower(COALESCE(p.codigo, p.modulo||'.'||p.recurso||'.'||p.accion))
        IN ('tenants.manage', 'system.debug', 'security.audit.read', 'documentos.audit.read');

  IF v_infractores IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_501: el alta de un demo vuelve a conceder permisos globales a ADMIN_DEMO: %', v_infractores;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Lo que el 490 exige que SI tenga, sigue ahi
  ---------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.roles r
    JOIN public.rol_permisos rp ON rp.role_id = r.id AND COALESCE(rp.concedido, true)
    JOIN public.permisos p ON p.id = rp.permiso_id
    WHERE r.tenant_id = v_tenant
      AND upper(r.nombre) = 'ADMIN_DEMO'
      AND lower(COALESCE(p.codigo, p.modulo||'.'||p.recurso||'.'||p.accion)) = 'users.manage'
  ) THEN
    RAISE EXCEPTION 'VERIFY_501: ADMIN_DEMO perdio users.manage, que el verificador 490 exige';
  END IF;

  RAISE NOTICE 'VERIFY_501 OK: ADMIN_DEMO % permisos y ADMIN % en un demo nuevo, ninguno global, users.manage intacto',
    v_admin_demo, v_admin;
END;
$verify$;

ROLLBACK;
