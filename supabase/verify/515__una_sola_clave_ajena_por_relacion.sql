-- Verificador 515: una relacion, una clave ajena, y la integridad intacta.
--
-- Tres comprobaciones, y la tercera es la que evita el desastre silencioso:
--
--   1. Que no queden relaciones con dos claves ajenas identicas. Es la causa del
--      `PGRST201` que impedia crear un RMA.
--
--   2. Que el grupo de `tenant_id` **siga como estaba**. Ahi una duplicada dice
--      CASCADE y la otra NO ACTION, y con las dos manda la estricta: retirarlas
--      cambiaria lo que ocurre al borrar un contribuyente. Que la limpieza no se
--      lleve eso por delante es parte del contrato.
--
--   3. Que la clave que queda **siga rechazando** una referencia inexistente. Un
--      DROP de mas dejaria la tabla sin ninguna restriccion, y eso no se nota
--      hasta que hay datos huerfanos: la comprobacion 1 pasaria igual de verde.

BEGIN;

DO $verify$
DECLARE
  v_duplicadas integer;
  v_pedidos_clientes integer;
  v_tenant_pares integer;
  v_demo jsonb;
  v_tenant uuid;
  v_rechazado boolean := false;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Ninguna relacion con claves ajenas identicas repetidas
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_duplicadas
  FROM (
    SELECT c.conrelid, c.confrelid, c.conkey, c.confkey
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
    GROUP BY 1, 2, 3, 4
    HAVING count(*) > 1
       AND count(DISTINCT c.confdeltype::text) = 1
       AND count(DISTINCT c.confupdtype::text) = 1
  ) x;

  IF v_duplicadas > 0 THEN
    RAISE EXCEPTION
      'VERIFY_515: quedan % relaciones con la misma clave ajena declarada dos veces; '
      'PostgREST responde 400 a cualquier embed entre esas tablas', v_duplicadas;
  END IF;

  -- El caso concreto que rompia la pantalla de devoluciones
  SELECT count(*) INTO v_pedidos_clientes
  FROM pg_constraint
  WHERE contype = 'f'
    AND conrelid = 'public.pedidos_venta'::regclass
    AND confrelid = 'public.clientes'::regclass;

  IF v_pedidos_clientes <> 1 THEN
    RAISE EXCEPTION
      'VERIFY_515: pedidos_venta tiene % claves ajenas hacia clientes y deberia tener 1; '
      'con dos, /ventas/rma/candidatos no puede listar pedidos', v_pedidos_clientes;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. El grupo de tenant_id sigue intacto
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_tenant_pares
  FROM (
    SELECT c.conrelid
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
      AND c.confrelid = 'public.tenants'::regclass
    GROUP BY c.conrelid, c.conkey, c.confkey
    HAVING count(*) > 1 AND count(DISTINCT c.confdeltype::text) > 1
  ) x;

  IF v_tenant_pares = 0 THEN
    RAISE EXCEPTION
      'VERIFY_515: se retiraron las claves ajenas de tenant_id que difieren en ON DELETE. '
      'Con CASCADE y NO ACTION juntas manda la estricta; quitar una cambia lo que ocurre '
      'al borrar un contribuyente, y eso es una decision de producto, no una limpieza.';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. La clave que queda sigue rechazando lo que no existe
  ---------------------------------------------------------------------------
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_demo := public.create_demo_tenant('VERIFY FK 515', 1, 'PE');
  v_tenant := (v_demo->>'tenant_id')::uuid;

  BEGIN
    INSERT INTO public.pedidos_venta (tenant_id, cliente_id, numero, estado)
    VALUES (v_tenant, '00000000-0000-0000-0000-0000000000ff'::uuid, 'PV-VERIFY-515', 'BORRADOR');
  EXCEPTION WHEN foreign_key_violation THEN
    v_rechazado := true;
  END;

  IF NOT v_rechazado THEN
    RAISE EXCEPTION
      'VERIFY_515: se admitio un pedido con un cliente que no existe. La limpieza se llevo '
      'por delante la unica clave ajena que quedaba, y eso no se nota hasta que hay datos '
      'huerfanos.';
  END IF;

  RAISE NOTICE
    'VERIFY_515 OK: una clave ajena por relacion, las de tenant_id intactas y la integridad sigue aplicandose';
END;
$verify$;

ROLLBACK;
