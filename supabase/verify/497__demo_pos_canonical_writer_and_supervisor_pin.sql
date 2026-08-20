-- Verificador 497: la venta POS de la demo nace por el writer canónico y la
-- autorización de supervisor deja de aceptar cualquier código de seis dígitos.
--
-- El bloqueador que cierra esta migración era que la sesión de caja de la demo
-- peruana no podía cerrarse nunca: el seed insertaba la venta POS a mano, sin
-- accounting_event_id / atomic_result / documento_id y con cpe_pendiente puesto
-- sobre un ticket interno puro. Este verificador comprueba que esa vía paralela
-- ya no existe y que el PIN de supervisor autentica de verdad.

BEGIN;

DO $verify$
DECLARE
  v_src text;
  v_tenant uuid;
  v_actor uuid;
  v_supervisor uuid;
  v_pin_ok jsonb;
  v_fallo text;
  v_i integer;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. El seed demo no conserva ninguna vía propia de escritura POS
  ---------------------------------------------------------------------------
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'app' AND p.proname = 'hydrate_demo_business_sample_tx';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'VERIFY_497: no existe app.hydrate_demo_business_sample_tx';
  END IF;

  IF v_src ~* 'INSERT[[:space:]]+INTO[[:space:]]+public\.ventas_pos' THEN
    RAISE EXCEPTION 'VERIFY_497: el seed demo volvió a insertar ventas_pos directamente';
  END IF;

  IF v_src ~* 'INSERT[[:space:]]+INTO[[:space:]]+public\.detalle_ventas_pos'
     OR v_src ~* 'INSERT[[:space:]]+INTO[[:space:]]+public\.ventas_pos_pagos'
     OR v_src ~* 'INSERT[[:space:]]+INTO[[:space:]]+public\.movimientos_caja' THEN
    RAISE EXCEPTION 'VERIFY_497: el seed demo volvió a duplicar escrituras del writer POS';
  END IF;

  -- Tampoco puede corregir el estado a posteriori: un UPDATE sobre la venta o
  -- sobre los totales de la sesión significaría que volvió a construirlo a mano.
  -- (Se busca la sentencia, no la palabra: prosrc incluye los comentarios.)
  IF v_src ~* 'UPDATE[[:space:]]+public\.ventas_pos'
     OR v_src ~* 'UPDATE[[:space:]]+public\.sesiones_caja' THEN
    RAISE EXCEPTION 'VERIFY_497: el seed demo volvió a ajustar a mano la venta o la sesión de caja';
  END IF;

  IF v_src !~* 'pos_registrar_venta_atomic_tx' THEN
    RAISE EXCEPTION 'VERIFY_497: el seed demo no invoca el writer canónico';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Las RPC de PIN existen y son service-only
  ---------------------------------------------------------------------------
  IF to_regprocedure('public.verificar_pin_supervisor_tx(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.registrar_pin_supervisor_tx(uuid,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_497: faltan las RPC de PIN de supervisor';
  END IF;

  IF has_function_privilege('anon', 'public.verificar_pin_supervisor_tx(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.verificar_pin_supervisor_tx(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.registrar_pin_supervisor_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.registrar_pin_supervisor_tx(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_497: las RPC de PIN quedaron expuestas a roles de cliente';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.verificar_pin_supervisor_tx(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_497: service_role no puede verificar el PIN';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Comportamiento real del PIN sobre un tenant efímero
  ---------------------------------------------------------------------------
  -- El guard de frontera de despliegue bloquea la escritura de tenants si el
  -- entorno no está declarado. Igual que el resto de verificadores, se declara
  -- dentro del ensayo; todo el bloque termina en ROLLBACK.
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_tenant := gen_random_uuid();
  v_actor := gen_random_uuid();
  v_supervisor := gen_random_uuid();

  INSERT INTO public.tenants (id, nombre, estado)
  VALUES (v_tenant, 'VERIFY-497', 'ACTIVO');

  INSERT INTO public.usuarios_sistema (id, tenant_id, email, nombre, password_hash, estado, activo)
  VALUES
    (v_actor, v_tenant, 'actor-497@verify.local', 'Actor', 'x', 'ACTIVO', true),
    (v_supervisor, v_tenant, 'sup-497@verify.local', 'Supervisor', 'x', 'ACTIVO', true);

  -- Sin PIN registrado se falla cerrado: no se autoriza por ausencia de control.
  v_pin_ok := public.verificar_pin_supervisor_tx(v_tenant, v_supervisor, '481590');
  IF coalesce((v_pin_ok->>'valido')::boolean, false) IS NOT FALSE
     OR v_pin_ok->>'motivo' <> 'SUPERVISOR_PIN_NOT_REGISTERED' THEN
    RAISE EXCEPTION 'VERIFY_497: se autorizó a un supervisor sin PIN registrado: %', v_pin_ok;
  END IF;

  -- Un PIN débil no puede registrarse.
  FOREACH v_fallo IN ARRAY ARRAY['111111', '123456', '654321', '12345', 'abcdef'] LOOP
    BEGIN
      PERFORM public.registrar_pin_supervisor_tx(v_tenant, v_actor, v_supervisor, v_fallo);
      RAISE EXCEPTION 'VERIFY_497: se aceptó el PIN débil %', v_fallo;
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;
  END LOOP;

  PERFORM public.registrar_pin_supervisor_tx(v_tenant, v_actor, v_supervisor, '481590');

  -- El PIN nunca queda recuperable: sólo se persiste el hash.
  IF EXISTS (
    SELECT 1 FROM public.supervisor_pins
    WHERE tenant_id = v_tenant
      AND (hash_pin = '481590' OR hash_pin IS NULL OR hash_pin NOT LIKE '$2%')
  ) THEN
    RAISE EXCEPTION 'VERIFY_497: el PIN no quedó guardado como hash bcrypt';
  END IF;

  -- El PIN correcto autoriza.
  v_pin_ok := public.verificar_pin_supervisor_tx(v_tenant, v_supervisor, '481590');
  IF coalesce((v_pin_ok->>'valido')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_497: el PIN correcto no autorizó';
  END IF;

  -- Otro código de seis dígitos NO autoriza: es la regresión que se cierra.
  v_pin_ok := public.verificar_pin_supervisor_tx(v_tenant, v_supervisor, '999111');
  IF coalesce((v_pin_ok->>'valido')::boolean, false) IS NOT FALSE THEN
    RAISE EXCEPTION 'VERIFY_497: cualquier código de seis dígitos sigue autorizando';
  END IF;

  -- El intento fallido debe PERSISTIR. Si la RPC lanzara la excepción en vez de
  -- retornar, PL/pgSQL revertiría este contador y el bloqueo nunca se activaría.
  IF (SELECT COALESCE(intentos_fallidos, 0) FROM public.supervisor_pins
      WHERE tenant_id = v_tenant AND usuario_id = v_supervisor
        AND lower(COALESCE(estado::text, 'activo')) IN ('activo', 'bloqueado')) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_497: el intento fallido no se contabilizó';
  END IF;

  -- Cinco fallos bloquean, y el bloqueo gana incluso al PIN correcto.
  FOR v_i IN 1..4 LOOP
    PERFORM public.verificar_pin_supervisor_tx(v_tenant, v_supervisor, '999111');
  END LOOP;

  -- El normalizador de la 185 pasa la fila a BLOQUEADO/activo=false al fijar
  -- bloqueado_hasta, así que se comprueba sin filtrar por `activo`.
  IF NOT EXISTS (
    SELECT 1 FROM public.supervisor_pins
    WHERE tenant_id = v_tenant AND usuario_id = v_supervisor
      AND lower(COALESCE(estado::text, 'activo')) = 'bloqueado'
      AND bloqueado_hasta IS NOT NULL AND bloqueado_hasta > now()
  ) THEN
    RAISE EXCEPTION 'VERIFY_497: el PIN no se bloqueó tras cinco intentos fallidos';
  END IF;

  v_pin_ok := public.verificar_pin_supervisor_tx(v_tenant, v_supervisor, '481590');
  IF coalesce((v_pin_ok->>'valido')::boolean, false) IS NOT FALSE
     OR v_pin_ok->>'motivo' <> 'SUPERVISOR_PIN_LOCKED' THEN
    RAISE EXCEPTION 'VERIFY_497: un PIN bloqueado siguió autorizando: %', v_pin_ok;
  END IF;

  -- Rotar reemplaza al anterior y deja un único PIN activo.
  PERFORM public.registrar_pin_supervisor_tx(v_tenant, v_actor, v_supervisor, '736284');

  IF (SELECT count(*) FROM public.supervisor_pins
      WHERE tenant_id = v_tenant AND usuario_id = v_supervisor
        AND lower(COALESCE(estado::text, 'activo')) IN ('activo', 'bloqueado')) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_497: la rotación dejó más de un PIN vigente';
  END IF;

  v_pin_ok := public.verificar_pin_supervisor_tx(v_tenant, v_supervisor, '481590');
  IF coalesce((v_pin_ok->>'valido')::boolean, false) IS NOT FALSE THEN
    RAISE EXCEPTION 'VERIFY_497: el PIN anterior siguió siendo válido tras rotar';
  END IF;

  IF coalesce((public.verificar_pin_supervisor_tx(v_tenant, v_supervisor, '736284')->>'valido')::boolean, false)
     IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_497: el PIN rotado no autorizó';
  END IF;

  RAISE NOTICE 'VERIFY_497 OK';
END;
$verify$;

-- El ensayo no deja rastro: el verificador comprueba comportamiento, no siembra.
ROLLBACK;
