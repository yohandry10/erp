-- Verificador 516: toda clave ajena que el codigo nombra existe.
--
-- Este verificador nace de un fallo propio. La migracion 515 retiro claves
-- ajenas duplicadas y dejo una de cada par. Lo que no se miro es que **hay
-- consultas que nombran la restriccion** para desambiguar el embed:
--
--     .from('recepciones').select('orden:ordenes_compra!recepciones_orden_id_fkey_runtime(...)')
--
-- Siete de ellas nombraban la que se retiro, y produccion respondio en caliente
-- «Could not find a relationship between 'recepciones' and 'ordenes_compra' in
-- the schema cache»: el listado de recepciones, caido. Buscar las consultas que
-- **fallaban por ambiguedad** no era suficiente; habia que buscar tambien las
-- que **dependian del nombre**.
--
-- La lista de abajo sale de recorrer `apps/erp-api/src` buscando `!nombre` en
-- los `select` de PostgREST. Que no se quede vieja lo vigila una prueba aparte
-- --`apps/erp-api/src/shared/supabase/nombres-clave-ajena.spec.ts`-- que la
-- regenera desde el codigo y la compara con esta. Las dos hacen falta: esta sabe
-- lo que hay en la base y no lee TypeScript; aquella lee TypeScript y no tiene
-- base delante.

BEGIN;

DO $verify$
DECLARE
  v_faltan text;
  v_total integer;
BEGIN
  CREATE TEMP TABLE nombres_que_el_codigo_pide (nombre text PRIMARY KEY) ON COMMIT DROP;

  INSERT INTO nombres_que_el_codigo_pide (nombre) VALUES
    ('candidatos_id_vacante_fkey'),
    ('contratos_id_empleado_fkey_runtime'),
    ('cotizaciones_cliente_id_fkey'),
    ('cuentas_por_cobrar_cliente_id_fkey'),
    ('cuentas_por_pagar_orden_id_fkey'),
    ('cuentas_por_pagar_proveedor_id_fkey'),
    ('cuentas_por_pagar_recepcion_id_fkey'),
    ('empleado_horarios_id_empleado_fkey'),
    ('empleado_horarios_id_horario_fkey'),
    ('empleados_id_departamento_fkey_runtime'),
    ('empresa_config_pais_id_fkey'),
    ('fk_compras_proveedor_id'),
    ('fk_detalle_asientos_asiento_id'),
    ('fk_detalle_asientos_cuenta_id'),
    ('fk_orden_compra_detalles_orden_id'),
    ('fk_ordenes_compra_proveedor_id'),
    ('fk_presupuestos_centro_costo_id'),
    ('fk_presupuestos_cuenta_id'),
    ('fk_presupuestos_periodo_contable_id'),
    ('fk_recepcion_items_almacen_id_v2'),
    ('fk_recepcion_items_ubicacion_id_v2'),
    ('liquidaciones_id_empleado_fkey'),
    ('movimientos_bancarios_cuenta_bancaria_id_fkey'),
    ('movimientos_consignacion_registro_id_fkey_runtime'),
    ('movimientos_bancarios_cxp_id_fkey'),
    ('movimientos_bancarios_proveedor_id_fkey'),
    ('orden_compra_detalles_producto_id_fkey_runtime'),
    ('pedidos_venta_cliente_id_fkey'),
    ('pedidos_venta_cotizacion_id_fkey'),
    ('pedidos_venta_detalle_pedido_id_fkey'),
    ('recepcion_items_detalle_id_fkey_runtime'),
    ('recepcion_items_producto_id_fkey_runtime'),
    ('recepcion_items_recepcion_id_fkey_runtime'),
    ('recepciones_orden_id_fkey_runtime'),
    ('user_roles_role_id_fkey'),
    ('user_roles_usuario_sistema_id_fkey');

  SELECT count(*) INTO v_total FROM nombres_que_el_codigo_pide;

  ---------------------------------------------------------------------------
  -- 1. Cada nombre existe
  ---------------------------------------------------------------------------
  SELECT string_agg(n.nombre, ', ' ORDER BY n.nombre) INTO v_faltan
  FROM nombres_que_el_codigo_pide n
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conname = n.nombre AND c.contype = 'f'
  );

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_516: el codigo nombra estas claves ajenas y no existen: %. '
      'Cualquier consulta que las use respondera «Could not find a relationship ... '
      'in the schema cache», que es como se cayo el listado de recepciones.', v_faltan;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Control positivo: la comprobacion sabe detectar una que falte
  ---------------------------------------------------------------------------
  INSERT INTO nombres_que_el_codigo_pide (nombre)
  VALUES ('fk_que_no_existe_control_positivo_516');

  SELECT string_agg(n.nombre, ', ') INTO v_faltan
  FROM nombres_que_el_codigo_pide n
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conname = n.nombre AND c.contype = 'f'
  );

  IF v_faltan IS DISTINCT FROM 'fk_que_no_existe_control_positivo_516' THEN
    RAISE EXCEPTION
      'VERIFY_516: la comprobacion no detecto un nombre inventado, asi que estaba '
      'pasando en verde sin mirar nada: %', coalesce(v_faltan, '(nada)');
  END IF;

  DELETE FROM nombres_que_el_codigo_pide WHERE nombre = 'fk_que_no_existe_control_positivo_516';

  RAISE NOTICE
    'VERIFY_516 OK: las % claves ajenas que el codigo nombra existen, y la comprobacion detecta la que falta',
    v_total;
END;
$verify$;

ROLLBACK;
