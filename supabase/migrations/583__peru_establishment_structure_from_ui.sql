-- 583__peru_establishment_structure_from_ui.sql
--
-- La 503 modeló el establecimiento anexo sobre almacenes, cajas y series, y la
-- 504 hizo que cada operación herede su establecimiento de esa estructura. Pero
-- ningún writer expuesto permitía elegirlo: todo almacén y toda serie creados
-- desde la aplicación caían en la casa matriz por el default de la 503. Una
-- empresa con una sucursal no podía separar stock, caja ni numeración.
--
-- 1. Almacén con establecimiento al crear y al editar. Cambiarlo se rechaza si
--    el almacén ya tiene movimientos o cajas: la historia derivada mentiría.
-- 2. Caja y almacén del mismo establecimiento, y el establecimiento de una caja
--    no cambia con una sesión abierta.
-- 3. Serie registrada en un establecimiento, sin reasignar una serie ya usada
--    ni las series de la casa matriz declaradas en empresa_config.
-- 4. Lecturas por rol: VENDEDOR ve el catálogo y quien registra facturas de
--    proveedor ve las recepciones que factura.
-- 5. El cambio de turno espera el efectivo físico (redondeo POS documentado).
-- 6. Costo promedio ponderado del inventario en todos los canales.
-- 7. El CPE hereda el establecimiento de su serie (códigos SUNAT vs nombres).
-- 8. Balance General: todo saldo de las clases 1 a 5 cae en un rubro.
-- 9. Cuenta 50 Capital para el asiento de apertura de empresas PE.
-- 10. La conciliación bancaria sólo se cierra con su período terminado.
-- 11. Recalcular una liquidación todavía no confirmada reemplaza el borrador.
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.crear_almacen_maestro_tx(uuid,uuid,text,jsonb)') IS NULL
     OR to_regprocedure('public.actualizar_almacen_maestro_tx(uuid,uuid,uuid,text,jsonb)') IS NULL
     OR to_regprocedure('app.crear_almacen_maestro_tx_460(uuid,uuid,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_570_BASE_UNEXPECTED';
  END IF;
END
$guard$;

-- ----------------------------------------------------------------------------
-- 1. Almacenes
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.crear_almacen_maestro_tx(uuid,uuid,text,jsonb) RENAME TO crear_almacen_maestro_tx_460;
ALTER FUNCTION public.crear_almacen_maestro_tx_460(uuid,uuid,text,jsonb) SET SCHEMA app;
ALTER FUNCTION public.actualizar_almacen_maestro_tx(uuid,uuid,uuid,text,jsonb) RENAME TO actualizar_almacen_maestro_tx_460;
ALTER FUNCTION public.actualizar_almacen_maestro_tx_460(uuid,uuid,uuid,text,jsonb) SET SCHEMA app;
REVOKE ALL ON FUNCTION app.crear_almacen_maestro_tx_460(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.actualizar_almacen_maestro_tx_460(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app.sucursal_activa_570(p_tenant_id uuid, p_value text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_id uuid := app.to_uuid_or_null(coalesce(p_value, ''));
BEGIN
  IF v_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.sucursales s
    WHERE s.tenant_id = p_tenant_id AND s.id = v_id AND s.activo
  ) THEN
    RAISE EXCEPTION 'ESTABLISHMENT_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '23514';
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION app.audit_almacen_sucursal_570(
  p_tenant_id uuid, p_actor_id uuid, p_old public.almacenes, p_new public.almacenes
)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id, old_values, new_values, changed_fields, metadata
  ) VALUES (
    p_tenant_id, p_actor_id, 'almacenes', 'UPDATE', p_new.id::text,
    to_jsonb(p_old), to_jsonb(p_new), '["sucursal_id"]'::jsonb,
    jsonb_build_object('accion', 'ASIGNAR_ESTABLECIMIENTO_ALMACEN', 'source', 'establishment_structure_570')
  );
$function$;

CREATE FUNCTION public.crear_almacen_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_branch uuid;
  v_result jsonb;
  v_old public.almacenes%ROWTYPE;
  v_new public.almacenes%ROWTYPE;
BEGIN
  IF jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_REQUIRED_FIELDS' USING ERRCODE = '23514';
  END IF;
  IF nullif(btrim(coalesce(p_payload->>'sucursal_id', '')), '') IS NOT NULL THEN
    v_branch := app.sucursal_activa_570(p_tenant_id, p_payload->>'sucursal_id');
  ELSE
    v_branch := app.casa_matriz_de(p_tenant_id);
  END IF;
  v_result := app.crear_almacen_maestro_tx_460(p_tenant_id, p_actor_id, p_idempotency_key, p_payload - 'sucursal_id');
  IF v_branch IS NULL THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_old FROM public.almacenes
  WHERE tenant_id = p_tenant_id AND id = (v_result->>'id')::uuid
  FOR UPDATE;
  -- La huella de la 460 no incluye el establecimiento: un reintento con otro
  -- establecimiento es otra intención y no puede responder como la primera.
  IF coalesce((v_result->>'idempotent')::boolean, false) THEN
    IF v_old.sucursal_id IS DISTINCT FROM v_branch THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_result || jsonb_build_object('sucursal_id', v_branch);
  END IF;
  IF v_old.sucursal_id IS DISTINCT FROM v_branch THEN
    UPDATE public.almacenes
    SET sucursal_id = v_branch, updated_by = p_actor_id, updated_at = now()
    WHERE id = v_old.id
    RETURNING * INTO v_new;
    PERFORM app.audit_almacen_sucursal_570(p_tenant_id, p_actor_id, v_old, v_new);
  END IF;
  RETURN v_result || jsonb_build_object('sucursal_id', v_branch);
END;
$function$;

CREATE FUNCTION public.actualizar_almacen_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_almacen_id uuid,
  p_idempotency_key text,
  p_cambios jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_branch uuid;
  v_result jsonb;
  v_old public.almacenes%ROWTYPE;
  v_new public.almacenes%ROWTYPE;
BEGIN
  IF jsonb_typeof(coalesce(p_cambios, '{}'::jsonb)) = 'object' AND p_cambios ? 'sucursal_id' THEN
    v_branch := app.sucursal_activa_570(p_tenant_id, p_cambios->>'sucursal_id');
  END IF;
  -- La 460 ignora claves que no conoce pero las incluye en su huella; el
  -- reintento con el mismo cambio de establecimiento responde como el primero.
  v_result := app.actualizar_almacen_maestro_tx_460(p_tenant_id, p_actor_id, p_almacen_id, p_idempotency_key, p_cambios);
  IF v_branch IS NULL OR coalesce((v_result->>'idempotent')::boolean, false) THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_old FROM public.almacenes
  WHERE tenant_id = p_tenant_id AND id = p_almacen_id
  FOR UPDATE;
  IF v_old.sucursal_id IS NOT DISTINCT FROM v_branch THEN
    RETURN v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.movimientos_inventario m
    WHERE m.tenant_id = p_tenant_id AND m.almacen_id = p_almacen_id
  ) OR EXISTS (
    SELECT 1 FROM public.producto_existencias pe
    WHERE pe.tenant_id = p_tenant_id AND pe.almacen_id = p_almacen_id
      AND (coalesce(pe.stock_actual, 0) <> 0 OR coalesce(pe.stock_reservado, 0) <> 0)
  ) THEN
    RAISE EXCEPTION 'INVENTORY_WAREHOUSE_BRANCH_LOCKED_BY_HISTORY' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cajas c
    WHERE c.tenant_id = p_tenant_id AND c.almacen_id = p_almacen_id
  ) THEN
    RAISE EXCEPTION 'INVENTORY_WAREHOUSE_BRANCH_LOCKED_BY_CASH' USING ERRCODE = '23514';
  END IF;
  UPDATE public.almacenes
  SET sucursal_id = v_branch, updated_by = p_actor_id, updated_at = now()
  WHERE id = v_old.id
  RETURNING * INTO v_new;
  PERFORM app.audit_almacen_sucursal_570(p_tenant_id, p_actor_id, v_old, v_new);
  RETURN v_result || to_jsonb(v_new) || jsonb_build_object('idempotent', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_almacen_maestro_tx(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_almacen_maestro_tx(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_almacen_maestro_tx(uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_almacen_maestro_tx(uuid,uuid,uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION app.sucursal_activa_570(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.audit_almacen_sucursal_570(uuid,uuid,public.almacenes,public.almacenes) FROM PUBLIC, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Cajas: mismo establecimiento que su almacén
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_caja_establecimiento_570()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.almacen_id IS NOT NULL
     AND app.sucursal_de_almacen(NEW.tenant_id, NEW.almacen_id) IS DISTINCT FROM NEW.sucursal_id THEN
    RAISE EXCEPTION 'CASH_WAREHOUSE_BRANCH_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id AND EXISTS (
    SELECT 1 FROM public.sesiones_caja s
    WHERE s.tenant_id = NEW.tenant_id AND s.caja_id = NEW.id AND lower(s.estado::text) = 'abierta'
  ) THEN
    RAISE EXCEPTION 'CASH_MASTER_OPEN_SESSION_BLOCKS_CRITICAL_CHANGE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION app.enforce_caja_establecimiento_570() FROM PUBLIC, anon, authenticated, service_role;

-- Corre después de trg_sucursal_default_cajas (orden alfabético), que ya
-- resolvió la casa matriz para una caja sin establecimiento.
DROP TRIGGER IF EXISTS trg_zz_caja_establecimiento_570 ON public.cajas;
CREATE TRIGGER trg_zz_caja_establecimiento_570
BEFORE INSERT OR UPDATE OF sucursal_id, almacen_id ON public.cajas
FOR EACH ROW EXECUTE FUNCTION app.enforce_caja_establecimiento_570();

-- ----------------------------------------------------------------------------
-- 3. Series por establecimiento
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.registrar_serie_establecimiento_tx_570(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_sucursal_id uuid,
  p_tipo_documento text,
  p_serie text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo_documento, '')));
  v_serie text := upper(btrim(coalesce(p_serie, '')));
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_branch uuid;
  v_principal boolean;
  v_config record;
  v_row public.documento_series%ROWTYPE;
  v_new public.documento_series%ROWTYPE;
BEGIN
  v_tipo := CASE v_tipo WHEN '01' THEN 'FACTURA' WHEN '03' THEN 'BOLETA'
    WHEN '07' THEN 'NOTA_CREDITO' WHEN '08' THEN 'NOTA_DEBITO' ELSE v_tipo END;
  IF p_tenant_id IS NULL
     OR v_tipo NOT IN ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO')
     OR v_serie !~ '^[FB][A-Z0-9]{3}$'
     OR (v_tipo = 'FACTURA' AND v_serie NOT LIKE 'F%')
     OR (v_tipo = 'BOLETA' AND v_serie NOT LIKE 'B%')
     OR length(v_key) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION 'DOCUMENT_SERIES_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  v_branch := app.sucursal_activa_570(p_tenant_id, p_sucursal_id::text);
  SELECT s.es_principal INTO v_principal FROM public.sucursales s WHERE s.id = v_branch;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':document-series-scope:' || v_tipo || ':' || v_serie, 461)
  );

  -- Las series declaradas en la configuración de la empresa son las de la casa
  -- matriz: el POS y la facturación las usan sin consultar el establecimiento.
  SELECT upper(coalesce(ec.serie_factura, '')) AS f, upper(coalesce(ec.serie_boleta, '')) AS b,
         upper(coalesce(ec.serie_nota_credito, '')) AS nc
  INTO v_config FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id;
  IF NOT coalesce(v_principal, false) AND v_serie IN (v_config.f, v_config.b, v_config.nc) THEN
    RAISE EXCEPTION 'DOCUMENT_SERIES_RESERVED_FOR_MAIN_ESTABLISHMENT' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_row FROM public.documento_series ds
  WHERE ds.tenant_id = p_tenant_id AND upper(ds.tipo_documento) = v_tipo AND upper(ds.serie) = v_serie
  FOR UPDATE;
  IF FOUND THEN
    IF v_row.sucursal_id = v_branch AND coalesce(v_row.activo, false) THEN
      RETURN jsonb_build_object('serie', to_jsonb(v_row), 'idempotent', true);
    END IF;
    -- Una serie con comprobantes ya pertenece a donde se emitieron.
    IF coalesce(v_row.correlativo_actual, 0) > 0
       OR EXISTS (SELECT 1 FROM public.documentos d WHERE d.tenant_id = p_tenant_id AND upper(d.serie) = v_serie)
       OR EXISTS (SELECT 1 FROM public.cpe c WHERE c.tenant_id = p_tenant_id AND upper(c.serie) = v_serie) THEN
      RAISE EXCEPTION 'DOCUMENT_SERIES_ALREADY_USED_IN_OTHER_ESTABLISHMENT' USING ERRCODE = '23514';
    END IF;
    UPDATE public.documento_series
    SET sucursal_id = v_branch, activo = true, estado = 'ACTIVO', updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('establishment_assigned_by', p_actor_id, 'source', 'establishment_structure_570')
    WHERE id = v_row.id
    RETURNING * INTO v_new;
  ELSE
    INSERT INTO public.documento_series (
      tenant_id, tipo_documento, serie, correlativo_actual, correlativo_maximo,
      longitud_correlativo, activo, estado, idempotency_key, sucursal_id, metadata
    ) VALUES (
      p_tenant_id, v_tipo, v_serie, 0, 99999999, 8, true, 'ACTIVO', v_key, v_branch,
      jsonb_build_object('created_by', p_actor_id, 'source', 'establishment_structure_570')
    )
    RETURNING * INTO v_new;
  END IF;

  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id, old_values, new_values, changed_fields, metadata
  ) VALUES (
    p_tenant_id, p_actor_id, 'documento_series', CASE WHEN v_row.id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    v_new.id::text, CASE WHEN v_row.id IS NULL THEN NULL ELSE to_jsonb(v_row) END, to_jsonb(v_new), NULL,
    jsonb_build_object('accion', 'REGISTRAR_SERIE_ESTABLECIMIENTO', 'source', 'establishment_structure_570')
  );
  RETURN jsonb_build_object('serie', to_jsonb(v_new), 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_serie_establecimiento_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_sucursal_id uuid,
  p_tipo_documento text,
  p_serie text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.registrar_serie_establecimiento_tx_570($1, $2, $3, $4, $5, $6) $function$;

REVOKE ALL ON FUNCTION app.registrar_serie_establecimiento_tx_570(uuid,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_serie_establecimiento_tx(uuid,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_serie_establecimiento_tx(uuid,uuid,uuid,text,text,text) TO service_role;


-- ----------------------------------------------------------------------------
-- 4. Lecturas que cada rol operativo necesita para su flujo
--
-- El patrón canónico de la 379 no incluía inventario.productos.read: el
-- vendedor no podía elegir productos al cotizar ni al crear un pedido. Y quien
-- registra la factura del proveedor (finanzas.cxp.gestionar) no podía ver la
-- recepción que factura, así que no podía vincularla: el asiento volvía a
-- cargar la 20 y la 4699 de mercadería por facturar quedaba abierta.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sembrar_lecturas_roles_570(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND coalesce(r.is_system_role, false)
    AND coalesce(p.activo, true)
    AND (
      (upper(r.nombre) = 'VENDEDOR'
        AND lower(p.codigo) IN ('inventario.productos.read', 'inventario.almacenes.read'))
      OR (lower(p.codigo) = 'compras.recepciones.ver' AND EXISTS (
        SELECT 1 FROM public.rol_permisos g
        JOIN public.permisos gp ON gp.id = g.permiso_id
        WHERE g.role_id = r.id AND g.concedido
          AND lower(gp.codigo) = 'finanzas.cxp.gestionar'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id = r.id AND rp.permiso_id = p.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

DO $wrap$
BEGIN
  IF to_regprocedure('app.seed_operational_rbac_for_tenant_base_570(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid)
      RENAME TO seed_operational_rbac_for_tenant_base_570;
  END IF;
END;
$wrap$;

CREATE OR REPLACE FUNCTION app.seed_operational_rbac_for_tenant(
  p_tenant_id uuid, p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE(permisos_seeded integer, roles_seeded integer, role_permissions_seeded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_base record;
BEGIN
  SELECT * INTO v_base FROM app.seed_operational_rbac_for_tenant_base_570(p_tenant_id, p_source_tenant_id);
  permisos_seeded := coalesce(v_base.permisos_seeded, 0);
  roles_seeded := coalesce(v_base.roles_seeded, 0);
  role_permissions_seeded := coalesce(v_base.role_permissions_seeded, 0)
    + app.sembrar_lecturas_roles_570(p_tenant_id);
  RETURN NEXT;
END;
$function$;

-- Sólo empresas operativas ya creadas; los roles demo conservan su contrato.
DO $existing$
DECLARE
  v_tenant_id uuid;
BEGIN
  FOR v_tenant_id IN
    SELECT ec.tenant_id FROM public.empresa_config ec WHERE NOT coalesce(ec.is_demo, false)
  LOOP
    PERFORM app.sembrar_lecturas_roles_570(v_tenant_id);
  END LOOP;
END;
$existing$;

REVOKE ALL ON FUNCTION app.sembrar_lecturas_roles_570(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant_base_570(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. El cambio de turno espera el efectivo físico
--
-- El redondeo legal del efectivo (518) cobra menos céntimos de los que registra
-- el movimiento de la venta y lo documenta en ajustes_redondeo_efectivo_pos. El
-- cierre ya lo descuenta; el cambio de turno de la 474 no, y cada venta
-- redondeada aparecía como faltante del cajero saliente con su asiento de gasto.
-- Se descuenta lo documentado de la sesión del saldo esperado del cambio, sin
-- crear movimientos: el cierre sigue cuadrando contra el mismo ledger.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_cambio_turno_caja_tx(
  p_tenant_id uuid, p_session_id uuid, p_incoming_user_id uuid,
  p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_result jsonb;
  v_redondeo numeric(14,2);
  v_change public.cambios_turno%ROWTYPE;
BEGIN
  v_result := app.iniciar_cambio_turno_caja_tx_474(
    p_tenant_id, p_session_id, p_incoming_user_id, p_actor_id, p_idempotency_key
  );
  IF coalesce((v_result->>'idempotent')::boolean, false) THEN
    RETURN v_result;
  END IF;
  SELECT coalesce(sum(a.monto_ajuste), 0) INTO v_redondeo
  FROM public.ajustes_redondeo_efectivo_pos a
  WHERE a.tenant_id = p_tenant_id AND a.sesion_caja_id = p_session_id;
  IF v_redondeo <= 0 THEN
    RETURN v_result;
  END IF;
  UPDATE public.cambios_turno c
  SET saldo_sistema = round(c.saldo_sistema - v_redondeo, 2),
      metadata = coalesce(c.metadata, '{}'::jsonb)
        || jsonb_build_object('redondeo_efectivo_documentado', v_redondeo)
  WHERE c.tenant_id = p_tenant_id AND c.id = (v_result->>'cambio_id')::uuid
  RETURNING * INTO v_change;
  RETURN v_result || jsonb_build_object('cambio', to_jsonb(v_change));
END;
$function$;
REVOKE ALL ON FUNCTION public.iniciar_cambio_turno_caja_tx(uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_cambio_turno_caja_tx(uuid,uuid,uuid,uuid,text) TO service_role;

-- ----------------------------------------------------------------------------
-- 6. Costo promedio ponderado del inventario
--
-- Las salidas se valoraban con productos.precio_compra, un precio de catálogo
-- que ninguna compra actualiza, y productos.costo quedaba en cero. Comprar a
-- otro precio no cambiaba el costo de ventas ni el de las transferencias, y la
-- cuenta 20 se desviaba del kardex. Además cada canal elegía distinto: POS y
-- pedidos Perú leían costo primero; despacho, ajuste, anulación y el writer
-- único, precio_compra primero.
--
-- productos.costo_promedio_base es el promedio ponderado móvil en moneda base: cada
-- movimiento confirmado por el writer único lo recalcula con su costo. Entrar
-- o salir al costo vigente lo deja igual; una compra o una devolución a
-- proveedor a otro precio lo mueven. Todos los lectores usan costo primero y
-- precio_compra sólo como respaldo inicial.
-- ----------------------------------------------------------------------------
-- El promedio es una razón, no un importe monetario. Guardarlo en numeric(14,2)
-- perdía 0.005 por unidad (100 a 1.00 + 100 a 1.01) y las siguientes salidas
-- multiplicaban esa pérdida. El valor monetario procede del ledger congelado;
-- la división mantiene su precisión y el redondeo sólo ocurre en cada importe.
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS costo_promedio_base numeric;
COMMENT ON COLUMN public.productos.costo_promedio_base IS 'Promedio PE en moneda base con precisión del ledger; NULL indica que no existe un saldo físico confirmado. costo conserva compatibilidad de catálogo.';

CREATE OR REPLACE FUNCTION app.costo_inventario_base_570(p_tenant_id uuid, p_producto_id uuid, p_stock numeric DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_stock numeric; v_inicial numeric; v_unidades numeric; v_valor numeric;
  v_completo boolean;
BEGIN
  SELECT p.stock_actual, coalesce(nullif(p.costo, 0), nullif(p.precio_compra, 0), 0)
    INTO v_stock, v_inicial FROM public.productos p
    WHERE p.tenant_id=p_tenant_id AND p.id=p_producto_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_FOUND_OR_TENANT_MISMATCH'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND upper(btrim(pais))='PE') THEN
    RETURN (SELECT coalesce(nullif(precio_compra,0),nullif(costo,0),0) FROM public.productos WHERE tenant_id=p_tenant_id AND id=p_producto_id);
  END IF;
  v_stock:=coalesce(p_stock,v_stock);
  IF coalesce(v_stock,0)=0 THEN RETURN v_inicial; END IF;
  SELECT coalesce(sum(k.cantidad_firmada),0), coalesce(sum(k.valor_firmado_base),0),
    coalesce(bool_and(k.valuacion_estado='CONFIRMADA' AND k.cantidad_firmada IS NOT NULL
      AND k.valor_firmado_base IS NOT NULL),false)
    INTO v_unidades,v_valor,v_completo
  FROM public.vw_kardex_valorizado k
  WHERE k.tenant_id=p_tenant_id AND k.producto_id=p_producto_id AND k.almacen_id IS NOT NULL;
  IF NOT v_completo OR v_unidades IS DISTINCT FROM v_stock OR v_valor<0 THEN
    RAISE EXCEPTION 'INVENTORY_VALUATION_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN v_valor/v_stock;
END;
$function$;
REVOKE ALL ON FUNCTION app.costo_inventario_base_570(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app.costo_promedio_movimiento_570()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(coalesce(NEW.tipo, ''));
  v_cantidad numeric := abs(coalesce(NEW.cantidad, 0));
  v_stock_despues numeric := app.to_numeric_or_zero(NEW.metadata->>'stock_total_actual');
  v_unidades numeric;
  v_valor numeric;
  v_completo boolean;
  v_nuevo numeric;
BEGIN
  IF v_tipo NOT IN ('ENTRADA', 'SALIDA') OR v_cantidad <= 0
     OR NEW.metadata->>'inventory_writer' IS DISTINCT FROM 'aplicar_movimiento_inventario_tx'
     OR (TG_OP = 'UPDATE'
         AND OLD.metadata->>'inventory_writer' IS NOT DISTINCT FROM 'aplicar_movimiento_inventario_tx') THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.empresa_config WHERE tenant_id=NEW.tenant_id AND upper(btrim(pais))='PE') THEN
    RETURN NULL;
  END IF;

  -- El writer ya bloqueó el producto. La vista utiliza moneda base y el TC
  -- de origen congelado, incluyendo devoluciones y ajustes con su dirección.
  -- Una valorización pendiente no se convierte en un costo de catálogo.
  SELECT coalesce(sum(k.cantidad_firmada),0), coalesce(sum(k.valor_firmado_base),0),
    coalesce(bool_and(k.valuacion_estado='CONFIRMADA' AND k.cantidad_firmada IS NOT NULL
      AND k.valor_firmado_base IS NOT NULL),false)
    INTO v_unidades,v_valor,v_completo
  FROM public.vw_kardex_valorizado k
  WHERE k.tenant_id=NEW.tenant_id AND k.producto_id=NEW.producto_id AND k.almacen_id IS NOT NULL;
  IF NOT v_completo OR v_unidades IS DISTINCT FROM v_stock_despues OR v_valor<0
     OR (v_stock_despues=0 AND v_valor<>0) THEN
    RAISE EXCEPTION 'INVENTORY_VALUATION_REQUIRED' USING ERRCODE='23514';
  END IF;
  v_nuevo := CASE WHEN v_stock_despues>0 THEN v_valor/v_stock_despues ELSE 0 END;

  UPDATE public.productos p
  SET costo_promedio_base = v_nuevo, costo = round(v_nuevo,2), updated_at = now()
  WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.producto_id
    AND (p.costo_promedio_base IS DISTINCT FROM v_nuevo OR p.costo IS DISTINCT FROM round(v_nuevo,2));
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION app.costo_promedio_movimiento_570() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_zz_costo_promedio_570 ON public.movimientos_inventario;
CREATE TRIGGER trg_zz_costo_promedio_570
AFTER INSERT OR UPDATE OF metadata ON public.movimientos_inventario
FOR EACH ROW EXECUTE FUNCTION app.costo_promedio_movimiento_570();

-- Lectores de costo: costo primero. Cada fragmento debe aparecer exactamente
-- las veces esperadas; si el writer cambió, la migración falla en vez de
-- adivinar.
DO $costo$
DECLARE
  v_patch record;
  v_def text;
  v_count integer;
BEGIN
  FOR v_patch IN
    SELECT * FROM (VALUES
      ('public.aplicar_movimiento_inventario_tx(uuid,uuid,uuid,text,numeric,text,uuid,text,uuid,text,date,text,jsonb,boolean)',
       'NULLIF(v_producto.precio_compra, 0),' || chr(10) || '    NULLIF(v_producto.costo, 0),',
       'NULLIF(v_producto.costo, 0),' || chr(10) || '    NULLIF(v_producto.precio_compra, 0),', 1),
      ('public.aplicar_movimiento_inventario_tx(uuid,uuid,uuid,text,numeric,text,uuid,text,uuid,text,date,text,jsonb,boolean)',
       '''ULTIMO_COSTO''', 'CASE WHEN EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(btrim(ec.pais))=''PE'') THEN ''PROMEDIO_PONDERADO'' ELSE ''ULTIMO_COSTO'' END', 1),
      ('app.pos_registrar_venta_atomic_tx_451(uuid,uuid,uuid,text,jsonb)',
       'coalesce(nullif(v_producto.costo, 0), v_producto.precio_compra, 0)',
       'CASE WHEN EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(btrim(ec.pais))=''PE'') THEN app.costo_inventario_base_570(p_tenant_id,v_producto.id) ELSE coalesce(nullif(v_producto.costo,0),v_producto.precio_compra,0) END',3),
      ('app.registrar_ajuste_inventario_tx_455(uuid,jsonb,uuid,text)',
       'NULLIF(v_producto.precio_compra, 0),' || chr(10) || '    NULLIF(v_producto.costo, 0),',
        'CASE WHEN EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(btrim(ec.pais))=''PE'') THEN app.costo_inventario_base_570(p_tenant_id,v_producto.id) ELSE coalesce(nullif(v_producto.precio_compra,0),nullif(v_producto.costo,0),0) END,', 1),
      ('app.despachar_pedido_parcial_tx(uuid,uuid,text,jsonb,text,uuid,jsonb)',
       'coalesce(p.precio_compra, p.costo, 0)',
        'CASE WHEN EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(btrim(ec.pais))=''PE'') THEN app.costo_inventario_base_570(p_tenant_id,p.id) ELSE coalesce(p.precio_compra,p.costo,0) END', 1),
      ('app.finalizar_anulacion_cpe_tx(uuid,uuid,uuid,text)',
       'nullif(p.precio_compra, 0), nullif(p.costo, 0), 0',
        'CASE WHEN EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(btrim(ec.pais))=''PE'') THEN app.costo_inventario_base_570(p_tenant_id,p.id) ELSE coalesce(nullif(p.precio_compra,0),nullif(p.costo,0),0) END, 0', 2),
      ('app.facturar_pedido_venta_tx(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)',
       'coalesce(nullif(p.precio_compra, 0), nullif(p.costo, 0), 0)',
        'CASE WHEN EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(btrim(ec.pais))=''PE'') THEN app.costo_inventario_base_570(p_tenant_id,d.producto_id) ELSE coalesce(nullif(p.precio_compra,0),nullif(p.costo,0),0) END', 2)
    ) AS t(signature, fragment, replacement, expected)
  LOOP
    v_def := replace(pg_get_functiondef(v_patch.signature::regprocedure),chr(13),'');
    v_count := (length(v_def) - length(replace(v_def, v_patch.fragment, ''))) / length(v_patch.fragment);
    IF v_count <> v_patch.expected THEN
      RAISE EXCEPTION 'MIGRATION_570_COST_READER_CHANGED: % (% de %)',
        v_patch.signature, v_count, v_patch.expected;
    END IF;
    EXECUTE replace(v_def, v_patch.fragment, v_patch.replacement);
  END LOOP;
END;
$costo$;

-- El writer conserva el cero explícito y resuelve su costo por defecto desde
-- el saldo anterior (ya actualizó stock, pero aún no insertó el movimiento).
DO $writer_cost$
DECLARE v_def text; v_from text; v_to text;
BEGIN
 v_def:=pg_get_functiondef('public.aplicar_movimiento_inventario_tx(uuid,uuid,uuid,text,numeric,text,uuid,text,uuid,text,date,text,jsonb,boolean)'::regprocedure);
 v_from:='  v_costo_unitario := COALESCE(' || chr(10)
  || '    NULLIF(app.to_numeric_or_zero(COALESCE(p_metadata, ''{}''::jsonb)->>''costo_unitario''), 0),' || chr(10)
  || '    NULLIF(v_producto.costo, 0),' || chr(10)
  || '    NULLIF(v_producto.precio_compra, 0),' || chr(10) || '    0' || chr(10) || '  );';
 v_to:='  v_costo_unitario := CASE' || chr(10)
  || '    WHEN lower(coalesce(p_metadata->>''costo_cero_confirmado'',''false''))=''true'' AND p_metadata ? ''costo_unitario''' || chr(10)
  || '      THEN app.to_numeric_or_zero(p_metadata->>''costo_unitario'')' || chr(10)
  || '    ELSE coalesce(nullif(app.to_numeric_or_zero(p_metadata->>''costo_unitario''),0),' || chr(10)
  || '      app.costo_inventario_base_570(p_tenant_id,p_producto_id,v_producto.stock_actual)) END;';
 IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN
  RAISE EXCEPTION 'MIGRATION_570_COST_SOURCE_CHANGED';
 END IF;
 v_def:=replace(v_def,v_from,v_to);
 v_from:='  IF v_movimiento_legacy_id IS NOT NULL THEN';
 v_to:='  IF v_costo_unitario=0 AND (lower(coalesce(p_metadata->>''costo_cero_confirmado'',''false''))=''true''' || chr(10)
  || '    OR (v_producto.stock_actual>0 AND EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(btrim(ec.pais))=''PE'') AND app.costo_inventario_base_570(p_tenant_id,p_producto_id,v_producto.stock_actual)=0)) THEN' || chr(10)
  || '    v_metadata:=v_metadata||jsonb_build_object(''costo_cero_confirmado'',true);' || chr(10)
  || '  END IF;' || chr(10) || v_from;
 IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN
  RAISE EXCEPTION 'MIGRATION_570_COST_ZERO_SOURCE_CHANGED';
 END IF;
 EXECUTE replace(v_def,v_from,v_to);
END $writer_cost$;

-- La transferencia conserva el costo congelado de su salida incluso si vacía
-- el producto. Resolver de nuevo después del saldo cero usaba el catálogo.
DO $transfer_cost$
DECLARE v_def text; v_from text; v_to text;
BEGIN
 v_def:=replace(pg_get_functiondef('app.transferir_inventario_tx_455(uuid,jsonb,uuid,text)'::regprocedure),chr(13),'');
 v_from:='      ''almacen_origen_id'', v_origen_id,';
 v_to:=v_from||chr(10)||'      ''costo_unitario'', (SELECT metadata->>''costo_unitario'' FROM public.movimientos_inventario WHERE id=v_salida_id AND tenant_id=p_tenant_id),'||chr(10)
 ||'      ''costo_cero_confirmado'', (SELECT coalesce((metadata->>''costo_cero_confirmado'')::boolean,false) FROM public.movimientos_inventario WHERE id=v_salida_id AND tenant_id=p_tenant_id),';
 IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_TRANSFER_COST_SOURCE_CHANGED'; END IF;
 EXECUTE replace(v_def,v_from,v_to);
END $transfer_cost$;

-- Una referencia GRE debe pertenecer al tenant, estar firmada y amparar los
-- establecimientos, producto/unidad y cantidad disponible del traslado.
-- El lock exclusivo serializa consumos de la misma GRE y bloquea su anulación.
-- El replay exacto permanece antes de esta comprobación: no reabre la historia.
DO $transfer_gre$
DECLARE v_def text; v_from text; v_to text;
BEGIN
 v_def:=replace(pg_get_functiondef('app.transferir_inventario_tx_455(uuid,jsonb,uuid,text)'::regprocedure),chr(13),'');
 v_from:='  IF v_traslado_anexos THEN';
 v_to:=$guard$  IF v_guia_id IS NOT NULL THEN
    IF NOT v_traslado_anexos THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_GRE_INVALID' USING ERRCODE='23514';
    END IF;
    PERFORM 1 FROM public.gre_guias g
    WHERE g.id=v_guia_id AND g.tenant_id=p_tenant_id
      AND g.estado IN ('FIRMADO','ENVIADO','ACEPTADO')
      AND g.motivo='TRASLADO_ENTRE_ESTABLECIMIENTOS'
      AND g.datos_adicionales->>'partidaSucursalId'=v_sucursal_origen::text
      AND g.datos_adicionales->>'llegadaSucursalId'=v_sucursal_destino::text
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_GRE_INVALID' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.gre_detalles gd JOIN public.productos p
        ON p.id=gd.producto_id AND p.tenant_id=gd.tenant_id
      WHERE gd.tenant_id=p_tenant_id AND gd.gre_id=v_guia_id
        AND gd.producto_id=v_producto_id
        AND upper(btrim(gd.unidad_medida))=upper(coalesce(nullif(btrim(p.unidad_medida),''),'NIU'))
    ) THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_GRE_PRODUCT_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF v_cantidad + coalesce((
      SELECT sum(m.cantidad) FROM public.movimientos_inventario m
      WHERE m.tenant_id=p_tenant_id AND m.producto_id=v_producto_id
        AND m.tipo='SALIDA' AND m.referencia_tipo='TRANSFERENCIA_SALIDA'
        AND m.metadata->'traslado_entre_establecimientos'->>'guia_remision_id'=v_guia_id::text
    ),0) > (
      SELECT sum(gd.cantidad) FROM public.gre_detalles gd JOIN public.productos p
        ON p.id=gd.producto_id AND p.tenant_id=gd.tenant_id
      WHERE gd.tenant_id=p_tenant_id AND gd.gre_id=v_guia_id AND gd.producto_id=v_producto_id
        AND upper(btrim(gd.unidad_medida))=upper(coalesce(nullif(btrim(p.unidad_medida),''),'NIU'))
    ) THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_GRE_QUANTITY_EXCEEDED' USING ERRCODE='23514';
    END IF;
  END IF;
$guard$ || v_from;
 IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_TRANSFER_GRE_SOURCE_CHANGED'; END IF;
 EXECUTE replace(v_def,v_from,v_to);
END $transfer_gre$;

-- Backfill sólo con evidencia persistida: el promedio de partida es el saldo
-- del kardex valorizado (470) cuando todos los movimientos del producto están
-- confirmados en moneda base y sus unidades netas cuadran con el stock. En los
-- demás casos un saldo físico existente exige completar su valuación; stock
-- inicial cero permite iniciar con el precio de catálogo. Los
-- movimientos confirmados conservan su valuación congelada.
WITH kardex AS (
  SELECT k.tenant_id, k.producto_id, sum(k.valor_firmado_base) AS valor,
    sum(k.cantidad_firmada) AS unidades,
    bool_and(k.valuacion_estado='CONFIRMADA' AND k.cantidad_firmada IS NOT NULL
      AND k.valor_firmado_base IS NOT NULL) AS completo
  FROM public.vw_kardex_valorizado k WHERE k.almacen_id IS NOT NULL
  GROUP BY k.tenant_id,k.producto_id
)
UPDATE public.productos p
SET costo_promedio_base = k.valor/k.unidades, costo = round(k.valor/k.unidades,2), updated_at = now()
FROM kardex k
WHERE p.tenant_id = k.tenant_id AND p.id = k.producto_id
  AND k.completo AND k.unidades > 0 AND k.valor >= 0
  AND k.unidades = coalesce(p.stock_actual, 0)
  AND EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p.tenant_id AND upper(btrim(ec.pais))='PE')
  AND (p.costo_promedio_base IS DISTINCT FROM k.valor/k.unidades OR p.costo IS DISTINCT FROM round(k.valor/k.unidades,2));

-- ----------------------------------------------------------------------------
-- 7. El CPE hereda el establecimiento de su serie
--
-- cpe.tipo_documento guarda el código SUNAT ('03') y documento_series el
-- nombre ('BOLETA'). La 504 los comparaba literalmente, no encontraba la
-- serie y sellaba todo CPE en la casa matriz: una boleta B002 de Arequipa
-- quedaba fuera del alcance de su cajero y dentro del de Lima. El XML ya
-- declaraba el anexo correcto; lo que mentía era el informe por sucursal.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sucursal_de_serie(
  p_tenant_id uuid,
  p_serie text,
  p_tipo_documento text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  WITH tipo AS (
    SELECT CASE upper(btrim(p_tipo_documento))
      WHEN '01' THEN 'FACTURA'
      WHEN '03' THEN 'BOLETA'
      WHEN '07' THEN 'NOTA_CREDITO'
      WHEN '08' THEN 'NOTA_DEBITO'
      ELSE upper(btrim(p_tipo_documento))
    END AS nombre
  )
  SELECT ds.sucursal_id
  FROM public.documento_series ds, tipo
  WHERE ds.tenant_id = p_tenant_id
    AND upper(btrim(COALESCE(ds.serie, ''))) = upper(btrim(COALESCE(p_serie, '')))
    AND (
      p_tipo_documento IS NULL
      OR upper(btrim(COALESCE(ds.tipo_documento, ''))) = tipo.nombre
    )
  ORDER BY (upper(btrim(COALESCE(ds.tipo_documento, ''))) = COALESCE(tipo.nombre, '')) DESC
  LIMIT 1;
$$;

-- Las filas ya selladas contra su serie dejarían de poder actualizarse: el
-- trigger 504 rechaza una sucursal que contradice a su ancla. Se vuelven a
-- derivar. Antes de la 570 ninguna serie podía asignarse a un anexo, así que
-- en datos previos esto no cambia ninguna fila.
UPDATE public.cpe c
SET sucursal_id = NULL
WHERE c.sucursal_id IS DISTINCT FROM COALESCE(
  app.sucursal_de_serie(c.tenant_id, c.serie, c.tipo_documento),
  app.casa_matriz_de(c.tenant_id)
);
UPDATE public.documentos d
SET sucursal_id = NULL
WHERE d.sucursal_id IS DISTINCT FROM COALESCE(
  app.sucursal_de_serie(d.tenant_id, d.serie, d.tipo_documento),
  app.casa_matriz_de(d.tenant_id)
);

-- ----------------------------------------------------------------------------
-- 8. Balance General: todo saldo de las clases 1 a 5 cae en un rubro
--
-- La 558 sólo sumaba los saldos que encajaban en el signo esperado de cada
-- rubro y descartaba el resto: el IGV a favor (40 deudora), los anticipos a
-- proveedores, las cuentas 17, 19, 21-29, 30-32 y 51-52. El Balance General
-- salía descuadrado con una operación normal de compras. Ahora cada saldo va a
-- exactamente un rubro; los saldos con signo inesperado se muestran en su
-- rubro con ese signo en vez de desaparecer. Misma firma y mismo contrato JSON.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.balance_general_live(p_tenant_id uuid, p_anio integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp'
AS $function$
DECLARE
  v_resultado jsonb;
  v_resultado_ejercicio numeric;
  v_cierre_confirmado boolean;
  v_anio_anterior integer;
  v_resultados_anteriores_sin_cierre numeric := 0;
  v_balance jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_anio < 2000 OR p_anio > 2100 OR p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'ACCOUNTING_REPORT_PARAMETERS_INVALID' USING ERRCODE = '22023';
  END IF;

  v_resultado := app.estado_resultados_live_458(p_tenant_id, p_anio, p_mes);
  v_resultado_ejercicio := COALESCE((v_resultado->>'utilidad_neta')::numeric, 0);

  SELECT EXISTS (
    SELECT 1
    FROM public.asientos_contables a
    WHERE a.tenant_id = p_tenant_id
      AND upper(COALESCE(a.estado::text, '')) = 'CONFIRMADO'
      AND upper(COALESCE(a.origen, '')) = 'CIERRE_ANUAL'
      AND EXTRACT(YEAR FROM COALESCE(a.fecha, a.created_at))::integer = p_anio
      AND COALESCE(a.fecha, a.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
  ) INTO v_cierre_confirmado;

  IF v_cierre_confirmado THEN
    v_resultado_ejercicio := 0;
  END IF;

  -- Los activos/pasivos incluyen toda la historia. Mientras un ejercicio
  -- anterior aún no trasladó su resultado a 59, ese resultado sigue formando
  -- parte del patrimonio operativo. Se reutiliza el ER por ejercicio para no
  -- duplicar las reglas de naturaleza/destino. Un cierre confirmado ya está
  -- incluido en 59; una reapertura anula ese cierre y vuelve a incluir el ER.
  FOR v_anio_anterior IN
    SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(a.fecha,a.created_at))::integer
    FROM public.asientos_contables a
    WHERE a.tenant_id=p_tenant_id
      AND upper(COALESCE(a.estado::text,''))='CONFIRMADO'
      AND COALESCE(a.fecha,a.created_at)::date<make_date(p_anio,1,1)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.asientos_contables a
      WHERE a.tenant_id=p_tenant_id
        AND upper(COALESCE(a.estado::text,''))='CONFIRMADO'
        AND upper(COALESCE(a.origen,''))='CIERRE_ANUAL'
        AND EXTRACT(YEAR FROM COALESCE(a.fecha,a.created_at))::integer=v_anio_anterior
    ) THEN
      v_resultados_anteriores_sin_cierre:=v_resultados_anteriores_sin_cierre
        +COALESCE((app.estado_resultados_live_458(p_tenant_id,v_anio_anterior,12)->>'utilidad_neta')::numeric,0);
    END IF;
  END LOOP;

  WITH balances AS (
    SELECT
      COALESCE(pc.codigo, '') AS codigo,
      round(COALESCE(sum(COALESCE(da.debe, 0) - COALESCE(da.haber, 0)), 0), 2) AS saldo
    FROM public.asientos_contables ac
    JOIN public.detalle_asientos da
      ON da.asiento_id = ac.id
     AND da.tenant_id = ac.tenant_id
    JOIN public.plan_cuentas pc
      ON pc.id = da.cuenta_id
     AND pc.tenant_id = ac.tenant_id
    WHERE ac.tenant_id = p_tenant_id
      AND upper(COALESCE(ac.estado::text, '')) = 'CONFIRMADO'
      AND COALESCE(ac.fecha, ac.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
    GROUP BY pc.codigo
  ), agg AS (
    SELECT
      COALESCE(sum(CASE WHEN codigo ~ '^10' THEN greatest(saldo, 0) ELSE 0 END), 0) AS efectivo,
      COALESCE(sum(CASE WHEN codigo ~ '^12' THEN greatest(saldo, 0) ELSE 0 END), 0) AS cuentas_por_cobrar,
      -- Un saldo acreedor de existencias no se esconde: se muestra negativo.
      COALESCE(sum(CASE WHEN codigo ~ '^2' THEN saldo ELSE 0 END), 0) AS inventarios,
      -- Los saldos deudores de la clase 4 (IGV a favor, anticipos a
      -- proveedores) son activo; antes se descartaban y el balance no cuadraba.
      COALESCE(sum(CASE
        WHEN codigo ~ '^1[13-9]' THEN saldo
        WHEN codigo ~ '^4' THEN greatest(saldo, 0)
        ELSE 0 END), 0) AS otros_activos_corrientes,
      COALESCE(sum(CASE WHEN codigo ~ '^33' THEN saldo ELSE 0 END), 0) AS activos_fijos,
      -COALESCE(sum(CASE WHEN codigo ~ '^39' THEN saldo ELSE 0 END), 0) AS depreciacion_acumulada,
      COALESCE(sum(CASE WHEN codigo ~ '^3[0-24-8]' THEN saldo ELSE 0 END), 0) AS otros_activos_no_corrientes,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^42' THEN least(saldo, 0) ELSE 0 END), 0)) AS cuentas_por_pagar,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^40' THEN least(saldo, 0) ELSE 0 END), 0)) AS tributos_por_pagar,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^41' THEN least(saldo, 0) ELSE 0 END), 0)) AS remuneraciones_por_pagar,
      abs(COALESCE(sum(CASE
        WHEN codigo ~ '^(43|44)' THEN least(saldo, 0)
        WHEN codigo ~ '^(10|12)' THEN least(saldo, 0)
        ELSE 0 END), 0)) AS otros_pasivos_corrientes,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^(45|46|47|48)' THEN least(saldo, 0) ELSE 0 END), 0)) AS deudas_largo_plazo,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^49' THEN least(saldo, 0) ELSE 0 END), 0)) AS otros_pasivos_no_corrientes,
      -COALESCE(sum(CASE WHEN codigo ~ '^5[0-2]' THEN saldo ELSE 0 END), 0) AS capital,
      -COALESCE(sum(CASE WHEN codigo ~ '^5[3-9]' THEN saldo ELSE 0 END), 0) AS resultados_acumulados
    FROM balances
  )
  SELECT jsonb_build_object(
    'efectivo', round(efectivo, 2),
    'cuentas_por_cobrar', round(cuentas_por_cobrar, 2),
    'inventarios', round(inventarios, 2),
    'otros_activos_corrientes', round(otros_activos_corrientes, 2),
    'activos_fijos', round(activos_fijos, 2),
    'depreciacion_acumulada', round(depreciacion_acumulada, 2),
    'otros_activos_no_corrientes', round(otros_activos_no_corrientes, 2),
    'cuentas_por_pagar', round(cuentas_por_pagar, 2),
    'tributos_por_pagar', round(tributos_por_pagar, 2),
    'remuneraciones_por_pagar', round(remuneraciones_por_pagar, 2),
    'otros_pasivos_corrientes', round(otros_pasivos_corrientes, 2),
    'deudas_largo_plazo', round(deudas_largo_plazo, 2),
    'otros_pasivos_no_corrientes', round(otros_pasivos_no_corrientes, 2),
    'capital', round(capital, 2),
    'resultados_acumulados', round(resultados_acumulados + v_resultados_anteriores_sin_cierre, 2),
    'resultado_ejercicio', round(v_resultado_ejercicio, 2)
  ) INTO v_balance
  FROM agg;

  RETURN v_balance;
END;
$function$;

REVOKE ALL ON FUNCTION public.balance_general_live(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.balance_general_live(uuid,integer,integer) TO service_role;

-- ----------------------------------------------------------------------------
-- 9. Capital en el plan de cuentas
--
-- El plan sembrado no traía la 50 y la aplicación no permite crear cuentas: una
-- empresa nueva no podía registrar su asiento de apertura (aporte de capital o
-- inventario inicial) contra capital. Mismo writer idempotente que la 558.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.seed_peru_capital_account_570(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresa_config
    WHERE tenant_id = p_tenant_id AND upper(btrim(pais)) = 'PE') THEN RETURN; END IF;
  PERFORM app.ensure_fiscal_account_465(p_tenant_id, '50', 'Capital', 'PATRIMONIO', 2);
  -- La 451 ya asigna estos códigos a pagos POS: tarjeta y transferencias.
  PERFORM app.ensure_fiscal_account_465(p_tenant_id, '10411', 'Cobros POS por tarjeta', 'ACTIVO', 5);
  PERFORM app.ensure_fiscal_account_465(p_tenant_id, '10412', 'Cobros POS por transferencia y billetera', 'ACTIVO', 5);
  -- PCGE 6391: servicios bancarios (gestión de cuentas y cobranzas), no
  -- intereses de financiamiento. La UI del plan no permite añadir cuentas.
  PERFORM app.ensure_fiscal_account_465(p_tenant_id, '6391', 'Gastos bancarios', 'GASTO', 4);
END;
$fn$;
CREATE OR REPLACE FUNCTION app.seed_peru_capital_config_570()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  PERFORM app.seed_peru_capital_account_570(NEW.tenant_id);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_seed_peru_capital_account_570 ON public.empresa_config;
CREATE TRIGGER trg_seed_peru_capital_account_570
AFTER INSERT OR UPDATE OF pais ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.seed_peru_capital_config_570();
REVOKE ALL ON FUNCTION app.seed_peru_capital_account_570(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_peru_capital_config_570() FROM PUBLIC, anon, authenticated, service_role;
SELECT app.seed_peru_capital_account_570(tenant_id)
FROM public.empresa_config WHERE upper(btrim(pais)) = 'PE';

-- ----------------------------------------------------------------------------
-- 10. Una conciliación bancaria sólo se cierra con su período terminado
--
-- Cerrar la conciliación vuelve inmutable el banco en todo su período (457).
-- Nada impedía cerrarla el día 5: desde ese momento la cuenta no admitía
-- cobros, pagos a proveedores, planillas ni depósitos hasta fin de mes, y no
-- existe reapertura. El cierre exige que el último día del período ya haya
-- pasado en la fecha local de la empresa.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_conciliacion_bancaria_tx(
  p_tenant_id uuid, p_conciliacion_id uuid, p_actor_id uuid, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_hasta date;
  v_estado text;
BEGIN
  SELECT c.fecha_hasta, upper(c.estado::text) INTO v_hasta, v_estado
  FROM public.conciliaciones_bancarias c
  WHERE c.tenant_id = p_tenant_id AND c.id = p_conciliacion_id;
  -- Un reintento sobre una conciliación ya cerrada conserva su respuesta.
  IF v_hasta IS NOT NULL AND v_estado <> 'CERRADA' AND v_hasta >= app.hoy_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'BANK_RECONCILIATION_PERIOD_NOT_ENDED' USING ERRCODE = '23514';
  END IF;
  RETURN app.cerrar_conciliacion_bancaria_tx_457(
    p_tenant_id, p_conciliacion_id, p_actor_id, p_idempotency_key
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cerrar_conciliacion_bancaria_tx(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_conciliacion_bancaria_tx(uuid,uuid,uuid,text) TO service_role;

-- ----------------------------------------------------------------------------
-- 11. Recalcular una liquidación que aún no se confirmó
--
-- Calcular sólo prepara importes, pero un cálculo existente bloqueaba para
-- siempre cualquier otro en la misma fecha: tras corregir un dato (o la
-- fórmula) no había forma de reemplazar el borrador. Si el anterior sigue
-- 'calculada' y el nuevo cálculo difiere, el anterior queda 'anulada' con su
-- trazabilidad. Aprobada o pagada siguen siendo intocables. El actor ya está
-- fijado por el wrapper 495 (sólo quien calculó puede recalcular).
-- ----------------------------------------------------------------------------
DO $liquidacion$
DECLARE
  v_patch record;
  v_def text;
  v_count integer;
BEGIN
  FOR v_patch IN
    SELECT * FROM (VALUES
      ('app.enforce_liquidacion_lifecycle_449()',
       'AND v_transition = format(''revertir:%s'', OLD.id))',
       'AND v_transition = format(''revertir:%s'', OLD.id))' || chr(10)
         || '      OR (lower(OLD.estado::text) = ''calculada'' AND lower(NEW.estado::text) = ''anulada''' || chr(10)
         || '        AND v_transition = format(''recalcular:%s'', OLD.id))'),
      ('app.guardar_liquidacion_calculada_tx(uuid,jsonb,uuid)',
       '    RAISE EXCEPTION ''Ya existe una liquidacion activa para el empleado y fecha con otro calculo o estado''' || chr(10)
         || '      USING ERRCODE = ''23514'';' || chr(10) || '  END IF;',
       '    IF lower(v_existente.estado::text) <> ''calculada'' THEN' || chr(10)
         || '      RAISE EXCEPTION ''Ya existe una liquidacion activa para el empleado y fecha con otro calculo o estado''' || chr(10)
         || '        USING ERRCODE = ''23514'';' || chr(10)
         || '    END IF;' || chr(10)
         || '    PERFORM set_config(''app.liquidacion_transition'', format(''recalcular:%s'', v_existente.id), true);' || chr(10)
         || '    UPDATE public.liquidaciones' || chr(10)
         || '    SET estado = ''anulada'',' || chr(10)
         || '        metadata = COALESCE(metadata, ''{}''::jsonb) || jsonb_build_object(' || chr(10)
         || '          ''anulada_por_recalculo'', p_usuario_id, ''anulada_en'', clock_timestamp())' || chr(10)
         || '    WHERE tenant_id = p_tenant_id AND id = v_existente.id;' || chr(10)
         || '    PERFORM set_config(''app.liquidacion_transition'', '''', true);' || chr(10)
         || '  END IF;')
    ) AS t(signature, fragment, replacement)
  LOOP
    v_def := replace(pg_get_functiondef(v_patch.signature::regprocedure),chr(13),'');
    v_count := (length(v_def) - length(replace(v_def, v_patch.fragment, ''))) / length(v_patch.fragment);
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'MIGRATION_570_SETTLEMENT_CONTRACT_CHANGED: % (%)', v_patch.signature, v_count;
    END IF;
    EXECUTE replace(v_def, v_patch.fragment, v_patch.replacement);
  END LOOP;
END;
$liquidacion$;

-- 15. Lectura backend del historial de pagos en efectivo de proveedores.
-- No concede escritura ni acceso de anon/authenticated.
GRANT SELECT ON public.pagos_facturas TO service_role;
-- Escrituras por RPC; recuperar detalle e historial tras el commit requiere
-- lectura del backend. No se conceden escrituras directas ni acceso de cliente.
GRANT SELECT ON public.plantillas_asientos_detalle, public.plantillas_asientos_historial TO service_role;
-- El cronograma conserva las cuotas históricas al cambiar una estimación.
-- Su backend necesita leerlas; las escrituras siguen exclusivamente por RPC.
GRANT SELECT ON public.depreciaciones TO service_role;
-- Las RPC invocadoras de ayuda leen el catálogo global y del tenant.
-- Conservar RLS, propietarios y ACL existentes; no conceder DML ni acceso cliente.
GRANT SELECT ON public.knowledge_base TO service_role;

-- 18. El wizard consulta las mismas condiciones que el cierre bajo lock.
CREATE OR REPLACE FUNCTION app.accounting_close_conditions_570(p_tenant_id uuid,p_anio integer,p_mes integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $conditions570$
DECLARE v_pending integer;v_drafts integer;v_invalid integer;v_prior jsonb;v_annual boolean:=true;v_state text;
BEGIN
 IF p_anio IS NULL OR p_mes IS NULL OR p_anio NOT BETWEEN 2000 AND 2100 OR p_mes NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'ACCOUNTING_PERIOD_PARAMETERS_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT upper(p.estado::text) INTO v_state FROM public.periodos_contables p WHERE p.tenant_id=p_tenant_id AND p.anio=p_anio AND p.mes=p_mes;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',prior.id,'anio',prior.anio,'mes',prior.mes,'estado',prior.estado) ORDER BY prior.mes),'[]'::jsonb) INTO v_prior
 FROM public.periodos_contables prior WHERE prior.tenant_id=p_tenant_id AND prior.anio=p_anio AND prior.mes<p_mes AND upper(prior.estado::text)<>'CERRADO';
  SELECT count(*) INTO v_pending
  FROM public.outbox_events e
  WHERE e.tenant_id = p_tenant_id
    AND app.is_accounting_event_458(e.event_type)
    AND app.accounting_event_date_458(e.payload, e.occurred_at) >= make_date(p_anio, p_mes, 1)
    AND app.accounting_event_date_458(e.payload, e.occurred_at) <
      (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
    AND (e.processed_at IS NULL OR lower(COALESCE(e.status, '')) NOT IN ('completed', 'processed'));
  SELECT count(*) INTO v_drafts
  FROM public.asientos_contables a
  WHERE a.tenant_id = p_tenant_id
    AND upper(COALESCE(a.estado::text, '')) = 'BORRADOR'
    AND COALESCE(a.fecha, a.created_at)::date >= make_date(p_anio, p_mes, 1)
    AND COALESCE(a.fecha, a.created_at)::date <
      (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date;
  SELECT count(*) INTO v_invalid
  FROM (
    SELECT
      a.id,
      count(d.id) AS lines,
      round(COALESCE(sum(d.debe), 0), 2) AS debe,
      round(COALESCE(sum(d.haber), 0), 2) AS haber,
      round(COALESCE(a.total_debe, 0), 2) AS header_debe,
      round(COALESCE(a.total_haber, 0), 2) AS header_haber
    FROM public.asientos_contables a
    LEFT JOIN public.detalle_asientos d
      ON d.asiento_id = a.id
     AND d.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant_id
      AND upper(COALESCE(a.estado::text, '')) = 'CONFIRMADO'
      AND COALESCE(a.fecha, a.created_at)::date >= make_date(p_anio, p_mes, 1)
      AND COALESCE(a.fecha, a.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
    GROUP BY a.id, a.total_debe, a.total_haber
    HAVING count(d.id) < 2
       OR round(COALESCE(sum(d.debe), 0), 2) <= 0
       OR round(COALESCE(sum(d.debe), 0), 2) <> round(COALESCE(sum(d.haber), 0), 2)
       OR round(COALESCE(sum(d.debe), 0), 2) <> round(COALESCE(a.total_debe, 0), 2)
       OR round(COALESCE(sum(d.haber), 0), 2) <> round(COALESCE(a.total_haber, 0), 2)
  ) invalid;
 IF p_mes=12 AND abs(coalesce((app.estado_resultados_live_458(p_tenant_id,p_anio,12)->>'utilidad_neta')::numeric,0))>0.005 THEN
  v_annual:=(SELECT count(DISTINCT btrim(codigo))=2 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND btrim(codigo) IN('89','59'));
 END IF;
 RETURN jsonb_build_object(
  'puedeCerrar',v_state='ABIERTO' AND jsonb_array_length(v_prior)=0 AND v_pending=0 AND v_drafts=0 AND v_invalid=0 AND v_annual,
  'estado',jsonb_build_object('valido',v_state='ABIERTO','actual',v_state),
  'previos',jsonb_build_object('valido',jsonb_array_length(v_prior)=0,'periodos',v_prior),
  'borradores',jsonb_build_object('valido',v_drafts=0,'cantidad',v_drafts),
  'asientos',jsonb_build_object('valido',v_invalid=0,'cantidadInvalidos',v_invalid,'asientosDescuadrados','[]'::jsonb),
  'eventos',jsonb_build_object('valido',v_pending=0,'eventosPendientes',v_pending),
  'cierreAnual',jsonb_build_object('valido',v_annual));
END;$conditions570$;
REVOKE ALL ON FUNCTION app.accounting_close_conditions_570(uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.validar_cierre_periodo_contable_570(p_tenant_id uuid,p_periodo_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $preflight570$
DECLARE v_periodo public.periodos_contables;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'contabilidad.periodos.validar');
 SELECT * INTO v_periodo FROM public.periodos_contables WHERE tenant_id=p_tenant_id AND id=p_periodo_id;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN app.accounting_close_conditions_570(p_tenant_id,v_periodo.anio,v_periodo.mes);
END;$preflight570$;
REVOKE ALL ON FUNCTION public.validar_cierre_periodo_contable_570(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validar_cierre_periodo_contable_570(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cerrar_periodo_contable_tx(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_periodo public.periodos_contables;
  v_checks jsonb;
  v_pending integer;
  v_drafts integer;
  v_invalid integer;
  v_resultado numeric;
  v_cuenta_89 uuid;
  v_cuenta_59 uuid;
  v_cierre_seq integer;
  v_source_event_id uuid;
  v_asiento jsonb;
  v_detalles jsonb;
BEGIN
  PERFORM app.assert_accounting_actor_458(p_tenant_id, p_actor_id);

  IF p_anio < 2000 OR p_anio > 2100 OR p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_PARAMETERS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_periodo
  FROM public.periodos_contables p
  WHERE p.tenant_id = p_tenant_id
    AND p.anio = p_anio
    AND p.mes = p_mes
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND:%-%', p_anio, p_mes;
  END IF;

  IF upper(v_periodo.estado::text) = 'CERRADO' THEN
    RETURN jsonb_build_object(
      'periodo', to_jsonb(v_periodo),
      'idempotent', true,
      'cierre_asiento_id', v_periodo.metadata->>'cierre_asiento_id'
    );
  END IF;

  IF upper(v_periodo.estado::text) <> 'ABIERTO' THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_OPEN:%', v_periodo.estado USING ERRCODE = '55000';
  END IF;

  v_checks:=app.accounting_close_conditions_570(p_tenant_id,p_anio,p_mes);
  IF NOT (v_checks->'previos'->>'valido')::boolean THEN RAISE EXCEPTION 'ACCOUNTING_PRIOR_PERIODS_MUST_BE_CLOSED' USING ERRCODE='55000';END IF;
  v_pending:=(v_checks->'eventos'->>'eventosPendientes')::integer;
  IF v_pending>0 THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_PENDING_EVENTS:%',v_pending USING ERRCODE='55000';END IF;
  v_drafts:=(v_checks->'borradores'->>'cantidad')::integer;
  IF v_drafts>0 THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_DRAFT_ENTRIES:%',v_drafts USING ERRCODE='55000';END IF;
  v_invalid:=(v_checks->'asientos'->>'cantidadInvalidos')::integer;
  IF v_invalid>0 THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_INVALID_ENTRIES:%',v_invalid USING ERRCODE='55000';END IF;
  v_cierre_seq := COALESCE((v_periodo.metadata->>'cierre_sequence')::integer, 0) + 1;

  IF p_mes = 12 THEN
    v_resultado := COALESCE((app.estado_resultados_live_458(p_tenant_id, p_anio, 12)->>'utilidad_neta')::numeric, 0);
    IF abs(v_resultado) > 0.005 THEN
      SELECT pc.id INTO v_cuenta_89
      FROM public.plan_cuentas pc
      WHERE pc.tenant_id = p_tenant_id AND btrim(pc.codigo) = '89'
      ORDER BY pc.created_at, pc.id
      LIMIT 1;

      SELECT pc.id INTO v_cuenta_59
      FROM public.plan_cuentas pc
      WHERE pc.tenant_id = p_tenant_id AND btrim(pc.codigo) = '59'
      ORDER BY pc.created_at, pc.id
      LIMIT 1;

      IF v_cuenta_89 IS NULL OR v_cuenta_59 IS NULL THEN
        RAISE EXCEPTION 'ACCOUNTING_YEAR_CLOSE_ACCOUNTS_89_59_REQUIRED';
      END IF;

      v_source_event_id := (
        substr(encode(extensions.digest(convert_to(
          format('cierre-anual:%s:%s:%s', p_tenant_id, p_anio, v_cierre_seq), 'UTF8'
        ), 'sha256'), 'hex'), 1, 32)
      )::uuid;

      v_detalles := CASE WHEN v_resultado > 0 THEN
        jsonb_build_array(
          jsonb_build_object('cuenta_id', v_cuenta_89, 'debe', round(v_resultado, 2), 'haber', 0, 'concepto', format('Determinacion del resultado %s', p_anio)),
          jsonb_build_object('cuenta_id', v_cuenta_59, 'debe', 0, 'haber', round(v_resultado, 2), 'concepto', format('Utilidad del ejercicio %s', p_anio))
        )
      ELSE
        jsonb_build_array(
          jsonb_build_object('cuenta_id', v_cuenta_59, 'debe', round(abs(v_resultado), 2), 'haber', 0, 'concepto', format('Perdida del ejercicio %s', p_anio)),
          jsonb_build_object('cuenta_id', v_cuenta_89, 'debe', 0, 'haber', round(abs(v_resultado), 2), 'concepto', format('Determinacion del resultado %s', p_anio))
        )
      END;

      v_asiento := public.crear_asiento_con_detalles_tx(
        p_tenant_id,
        jsonb_build_object(
          'fecha', make_date(p_anio, 12, 31)::text,
          'concepto', format('Asiento de cierre del ejercicio %s', p_anio),
          'descripcion', format('Asiento de cierre del ejercicio %s', p_anio),
          'tipo_asiento', 'CIERRE',
          'origen', 'CIERRE_ANUAL',
          'referencia', format('CIERRE-%s-%s', p_anio, v_cierre_seq),
          'source_event_id', v_source_event_id,
          'estado', 'CONFIRMADO',
          'created_by', p_actor_id,
          'confirmado_por', p_actor_id
        ),
        v_detalles
      );
    END IF;
  END IF;

  PERFORM set_config('app.period_transition_458', 'on', true);
  UPDATE public.periodos_contables p
  SET estado = 'CERRADO',
      fecha_cierre = app.hoy_tenant(p_tenant_id),
      cerrado_por = p_actor_id,
      metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'cierre_sequence', v_cierre_seq,
        'cierre_asiento_id', v_asiento->>'id',
        'cerrado_en', now(),
        'cerrado_por', p_actor_id
      ),
      updated_at = now()
  WHERE p.id = v_periodo.id
  RETURNING p.* INTO v_periodo;
  PERFORM set_config('app.period_transition_458', 'off', true);

  RETURN jsonb_build_object(
    'periodo', to_jsonb(v_periodo),
    'idempotent', false,
    'cierre_asiento_id', v_asiento->>'id'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.cerrar_periodo_contable_tx(uuid,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_periodo_contable_tx(uuid,integer,integer,uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Cada cálculo PE queda ligado al vínculo laboral que lo produjo. Un
-- borrador previo al reingreso no puede cesar un contrato distinto ni devengar
-- otra obligación. El legacy sin snapshot se recalcula por la misma UI.
DO $liquidacion_contract$
DECLARE v_def text; v_from text; v_to text;
BEGIN
 v_def:=replace(pg_get_functiondef('app.guardar_liquidacion_calculada_tx(uuid,jsonb,uuid)'::regprocedure),chr(13),'');
 v_from:='  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(';
 v_to:='  IF v_pais=''PE'' THEN'||chr(10)
 ||'    SELECT v_metadata||jsonb_build_object(''contrato_id_calculo'',c.id,''contrato_fecha_inicio_calculo'',c.fecha_inicio)'||chr(10)
 ||'      INTO v_metadata FROM public.contratos c WHERE c.tenant_id=p_tenant_id AND c.id_empleado=v_empleado_id'||chr(10)
 ||'      AND lower(c.estado::text) IN (''vigente'',''renovado'',''en_periodo_prueba'') FOR SHARE;'||chr(10)
 ||'  END IF;'||chr(10)||v_from;
 IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_LIQUIDACION_CONTRACT_SOURCE_CHANGED'; END IF;
 EXECUTE replace(v_def,v_from,v_to);
 v_def:=replace(pg_get_functiondef('app.confirmar_liquidacion_tx(uuid,uuid,uuid)'::regprocedure),chr(13),'');
 v_def:=replace(v_def,'  v_contratos integer;','  v_contratos integer;'||chr(10)||'  v_contrato public.contratos%ROWTYPE;');
 v_from:='  IF v_estado_inicial = ''calculada'' THEN';
 v_to:=v_from||chr(10)||'    IF upper(coalesce(v_liquidacion.pais_codigo,''PE''))=''PE'' THEN'||chr(10)
 ||'      SELECT * INTO v_contrato FROM public.contratos c WHERE c.tenant_id=p_tenant_id AND c.id_empleado=v_liquidacion.id_empleado'||chr(10)
 ||'        AND lower(c.estado::text) IN (''vigente'',''renovado'',''en_periodo_prueba'') ORDER BY c.id LIMIT 1 FOR UPDATE;'||chr(10)
 ||'      IF NOT FOUND OR app.to_uuid_or_null(v_liquidacion.metadata->>''contrato_id_calculo'') IS DISTINCT FROM v_contrato.id'||chr(10)
 ||'        OR v_contrato.fecha_inicio IS DISTINCT FROM (v_liquidacion.metadata->>''contrato_fecha_inicio_calculo'')::date'||chr(10)
 ||'        OR v_contrato.fecha_inicio IS NULL OR v_liquidacion.fecha_terminacion<v_contrato.fecha_inicio THEN'||chr(10)
 ||'        RAISE EXCEPTION ''RRHH_LIQUIDACION_CONTRACT_SNAPSHOT_REQUIRED'' USING ERRCODE=''23514'';'||chr(10)
 ||'      END IF;'||chr(10)||'    END IF;';
 IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_LIQUIDACION_CONFIRM_SOURCE_CHANGED'; END IF;
 EXECUTE replace(v_def,v_from,v_to);
END $liquidacion_contract$;

-- 12. Original fiscal del proveedor, NC, crédito y reversión de detracción pendiente
-- Integrar dentro de 570, antes de COMMIT. No ejecutar contra PROD por separado.
-- RCE conserva el comprobante del proveedor; devolución física/CxP no lo sustituye.
-- SUNAT: https://www.sunat.gob.pe/legislacion/igv/regla/cap9.htm
-- SUNAT: https://cpe.sunat.gob.pe/node/160

ALTER TABLE public.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS original_fiscal_amounts jsonb;

CREATE OR REPLACE FUNCTION app.cxp_original_fiscal_amounts_570(
  p_cxp public.cuentas_por_pagar
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_event public.outbox_events;
  v_events integer;
  v_adjust public.cxp_ajustes_proveedor;
  v_previous numeric;
  v_first numeric;
  v_last public.cxp_ajustes_proveedor;
  v_base_adjust numeric := 0;
  v_igv_adjust numeric := 0;
  v_base numeric;
  v_igv numeric;
  v_total numeric;
BEGIN
  IF p_cxp.original_fiscal_amounts IS NOT NULL THEN
    RETURN p_cxp.original_fiscal_amounts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cxp_ajustes_proveedor a
    WHERE a.tenant_id=p_cxp.tenant_id AND a.cuenta_por_pagar_id=p_cxp.id) THEN
    IF p_cxp.metadata->>'ultima_devolucion_id' IS NOT NULL THEN
      RAISE EXCEPTION 'SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED' USING ERRCODE='23514';
    END IF;
    RETURN jsonb_build_object('subtotal',p_cxp.subtotal,'igv',p_cxp.igv,
      'total',p_cxp.total,'source','BEFORE_FIRST_RETURN');
  END IF;

  -- Un importe neto legacy no permite adivinar la factura. Exigimos el evento
  -- original único y la cadena de ajustes que acredita exactamente su cambio.
  SELECT count(*) INTO v_events FROM public.outbox_events e
  WHERE e.tenant_id=p_cxp.tenant_id AND e.aggregate_id=p_cxp.id::text
    AND e.event_type='factura.proveedor.registrada';
  IF v_events <> 1 THEN
    RAISE EXCEPTION 'SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT v_event FROM public.outbox_events e
  WHERE e.tenant_id=p_cxp.tenant_id AND e.aggregate_id=p_cxp.id::text
    AND e.event_type='factura.proveedor.registrada';
  IF v_event.payload->>'tenantId' IS DISTINCT FROM p_cxp.tenant_id::text
    OR v_event.payload->>'facturaProvId' IS DISTINCT FROM p_cxp.id::text
    OR v_event.payload->>'proveedorId' IS DISTINCT FROM p_cxp.proveedor_id::text
    OR upper(v_event.payload->>'moneda') IS DISTINCT FROM upper(p_cxp.moneda)
    OR v_event.payload->>'numeroDocumento' IS DISTINCT FROM p_cxp.numero_documento THEN
    RAISE EXCEPTION 'SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED' USING ERRCODE='23514';
  END IF;
  BEGIN
    v_base := (v_event.payload->>'subtotal')::numeric;
    v_igv := (v_event.payload->>'igv')::numeric;
    v_total := (v_event.payload->>'total')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED' USING ERRCODE='23514';
  END;
  IF v_base IS NULL OR v_igv IS NULL OR v_total IS NULL
    OR v_base < 0 OR v_igv < 0 OR v_total <= 0
    OR abs(v_base+v_igv-v_total)>0.01 THEN
    RAISE EXCEPTION 'SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED' USING ERRCODE='23514';
  END IF;
  FOR v_adjust IN SELECT a.* FROM public.cxp_ajustes_proveedor a
    WHERE a.tenant_id=p_cxp.tenant_id AND a.cuenta_por_pagar_id=p_cxp.id
    ORDER BY a.total_anterior DESC,a.id
  LOOP
    IF v_previous IS NULL THEN v_first:=v_adjust.total_anterior;
    ELSIF abs(v_previous-v_adjust.total_anterior)>0.01 THEN
      RAISE EXCEPTION 'SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED' USING ERRCODE='23514';
    END IF;
    IF upper(v_adjust.moneda) IS DISTINCT FROM upper(p_cxp.moneda)
      OR abs(v_adjust.subtotal+v_adjust.igv-v_adjust.total)>0.01
      OR abs(v_adjust.total_anterior-v_adjust.total-v_adjust.total_nuevo)>0.01
      OR v_adjust.total_nuevo>=v_adjust.total_anterior THEN
      RAISE EXCEPTION 'SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED' USING ERRCODE='23514';
    END IF;
    v_base_adjust:=v_base_adjust+v_adjust.subtotal;
    v_igv_adjust:=v_igv_adjust+v_adjust.igv;
    v_previous:=v_adjust.total_nuevo;
    v_last:=v_adjust;
  END LOOP;
  -- La 450 deja las columnas monetarias sin modificar en la devolución total;
  -- por eso el último ajuste cero no se suma otra vez al saldo previo guardado.
  IF v_last.total_nuevo<=0.01 THEN
    v_base_adjust:=v_base_adjust-v_last.subtotal;
    v_igv_adjust:=v_igv_adjust-v_last.igv;
    v_previous:=v_last.total_anterior;
  END IF;
  IF abs(v_total-v_first)>0.01 OR abs(p_cxp.total-v_previous)>0.01
    OR abs(p_cxp.subtotal+v_base_adjust-v_base)>0.01
    OR abs(p_cxp.igv+v_igv_adjust-v_igv)>0.01 THEN
    RAISE EXCEPTION 'SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN jsonb_build_object('subtotal',v_base,'igv',v_igv,'total',v_total,
    'source','ORIGINAL_OUTBOX_AND_VERIFIED_RETURN_CHAIN','event_id',v_event.event_id);
END;
$function$;

-- El normalizador 131 siempre actualiza updated_at. Una captura histórica sólo
-- añade evidencia fiscal: el trigger se ejecuta después de los normalizadores
-- y conserva la fecha si ningún campo de negocio ha cambiado.
CREATE OR REPLACE FUNCTION app.preserve_cxp_fiscal_snapshot_time_570()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog,public,app,pg_temp
AS $function$
BEGIN
  IF OLD.original_fiscal_amounts IS NULL AND NEW.original_fiscal_amounts IS NOT NULL
    AND (to_jsonb(NEW)-'original_fiscal_amounts'-'updated_at')
      IS NOT DISTINCT FROM (to_jsonb(OLD)-'original_fiscal_amounts'-'updated_at') THEN
    NEW.updated_at:=OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER zz_preserve_cxp_fiscal_snapshot_time_570
BEFORE UPDATE ON public.cuentas_por_pagar
FOR EACH ROW EXECUTE FUNCTION app.preserve_cxp_fiscal_snapshot_time_570();

-- Sólo backfill de evidencia original verificable. Las filas irreconciliables
-- permanecen sin snapshot y bloquean expresamente la generación de su RCE.
DO $backfill$
DECLARE v_cxp public.cuentas_por_pagar; v_snapshot jsonb; v_restored integer:=0; v_pending integer:=0;
BEGIN
  FOR v_cxp IN SELECT c.* FROM public.cuentas_por_pagar c
    WHERE c.original_fiscal_amounts IS NULL AND EXISTS (
      SELECT 1 FROM public.cxp_ajustes_proveedor a
      WHERE a.tenant_id=c.tenant_id AND a.cuenta_por_pagar_id=c.id)
    ORDER BY c.id FOR UPDATE
  LOOP
    BEGIN
      v_snapshot:=app.cxp_original_fiscal_amounts_570(v_cxp);
      UPDATE public.cuentas_por_pagar SET original_fiscal_amounts=v_snapshot
      WHERE id=v_cxp.id AND tenant_id=v_cxp.tenant_id;
      v_restored:=v_restored+1;
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM <> 'SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED' THEN RAISE; END IF;
      v_pending:=v_pending+1;
    END;
  END LOOP;
  RAISE NOTICE 'RCE original snapshots: verified=%, pending_reconciliation=%',v_restored,v_pending;
END;
$backfill$;

CREATE OR REPLACE FUNCTION app.guard_cxp_original_fiscal_amounts_570()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE v_return_changed boolean; v_note_changed boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.original_fiscal_amounts IS NOT NULL THEN
      RAISE EXCEPTION 'CXP_ORIGINAL_FISCAL_AMOUNTS_READ_ONLY' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.original_fiscal_amounts IS DISTINCT FROM OLD.original_fiscal_amounts THEN
    RAISE EXCEPTION 'CXP_ORIGINAL_FISCAL_AMOUNTS_READ_ONLY' USING ERRCODE='23514';
  END IF;
  v_return_changed:=NEW.metadata->>'ultima_devolucion_id'
    IS DISTINCT FROM OLD.metadata->>'ultima_devolucion_id';
  v_note_changed:=NEW.metadata->>'ultima_nota_credito_proveedor_id'
    IS DISTINCT FROM OLD.metadata->>'ultima_nota_credito_proveedor_id';
  IF v_note_changed AND (current_setting('app.supplier_credit_writer_570',true) IS DISTINCT FROM 'on'
    OR NOT EXISTS(SELECT 1 FROM public.cuentas_por_pagar n WHERE n.tenant_id=OLD.tenant_id
      AND n.id::text=NEW.metadata->>'ultima_nota_credito_proveedor_id' AND n.proveedor_id=OLD.proveedor_id
      AND n.metadata->>'factura_proveedor_id'=OLD.id::text AND n.metadata->>'source'='SUPPLIER_CREDIT_NC_570'
      AND n.tipo_documento='NOTA_CREDITO')) THEN
    RAISE EXCEPTION 'CXP_FISCAL_CREDIT_NOTE_SOURCE_INVALID' USING ERRCODE='23514';
  END IF;
  IF (NEW.metadata->>'cancelada_por_nota_credito') IS DISTINCT FROM (OLD.metadata->>'cancelada_por_nota_credito')
    AND NOT v_note_changed THEN
    RAISE EXCEPTION 'CXP_FISCAL_CREDIT_NOTE_SOURCE_INVALID' USING ERRCODE='23514';
  END IF;
  IF OLD.original_fiscal_amounts IS NOT NULL AND (
    NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id
    OR NEW.numero_documento IS DISTINCT FROM OLD.numero_documento
    OR NEW.tipo_documento IS DISTINCT FROM OLD.tipo_documento
    OR NEW.fecha_emision IS DISTINCT FROM OLD.fecha_emision
    OR NEW.moneda IS DISTINCT FROM OLD.moneda
    OR NEW.fiscal_metadata IS DISTINCT FROM OLD.fiscal_metadata
    OR ((NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.igv IS DISTINCT FROM OLD.igv
      OR NEW.total IS DISTINCT FROM OLD.total) AND NOT v_return_changed AND NOT v_note_changed)
  ) THEN
    RAISE EXCEPTION 'CXP_FISCAL_DOCUMENT_HAS_RETURNS' USING ERRCODE='23514';
  END IF;
  IF v_return_changed THEN
    IF NOT EXISTS (SELECT 1 FROM public.devoluciones_proveedor d
      WHERE d.tenant_id=OLD.tenant_id AND d.id::text=NEW.metadata->>'ultima_devolucion_id'
        AND d.proveedor_id=OLD.proveedor_id AND upper(d.estado::text)='PENDIENTE'
        AND (OLD.recepcion_id=d.recepcion_id OR
          (upper(OLD.referencia_tipo)='RECEPCION' AND OLD.referencia_id=d.recepcion_id))) THEN
      RAISE EXCEPTION 'CXP_FISCAL_RETURN_SOURCE_INVALID' USING ERRCODE='23514';
    END IF;
  END IF;
  IF (v_return_changed OR v_note_changed) AND OLD.original_fiscal_amounts IS NULL THEN
    NEW.original_fiscal_amounts:=app.cxp_original_fiscal_amounts_570(OLD);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_cxp_original_fiscal_amounts_570
BEFORE INSERT OR UPDATE ON public.cuentas_por_pagar
FOR EACH ROW EXECUTE FUNCTION app.guard_cxp_original_fiscal_amounts_570();

REVOKE ALL ON FUNCTION app.cxp_original_fiscal_amounts_570(public.cuentas_por_pagar),
  app.guard_cxp_original_fiscal_amounts_570(),app.preserve_cxp_fiscal_snapshot_time_570()
FROM PUBLIC,anon,authenticated,service_role;

-- build_sire_snapshot_463 se reemplaza abajo manteniendo contrato, actor,
-- generación congelada, huellas, locks y todo el tramo RVIE vigente.
CREATE OR REPLACE FUNCTION app.build_sire_snapshot_463(
  p_tenant_id uuid,
  p_tipo text,
  p_periodo text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(COALESCE(p_tipo,''));
  v_periodo text := btrim(COALESCE(p_periodo,''));
  v_start date;
  v_end date;
  v_cutoff timestamptz := clock_timestamp();
  v_include_cancelled boolean := COALESCE((COALESCE(p_metadata,'{}'::jsonb)->>'incluirAnulados')::boolean,false);
  v_header text;
  v_rows text;
  v_content text;
  v_manifest jsonb := '[]'::jsonb;
  v_totals jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_fingerprint text;
BEGIN
  IF v_tipo NOT IN ('REG_VEN','REG_COM')
     OR v_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'SIRE_SNAPSHOT_REQUEST_INVALID' USING ERRCODE='22023';
  END IF;
  v_start := to_date(v_periodo||'-01','YYYY-MM-DD');
  v_end := (v_start + interval '1 month')::date;

  IF v_tipo='REG_VEN' THEN
    IF EXISTS (
      SELECT 1 FROM public.cpe c
        LEFT JOIN public.documentos d ON d.id=c.documento_id AND d.tenant_id=c.tenant_id
      WHERE c.tenant_id=p_tenant_id
        AND c.fecha_emision>=v_start AND c.fecha_emision<v_end AND c.created_at<=v_cutoff
        AND upper(COALESCE(NULLIF(btrim(c.moneda),''),'PEN'))<>'PEN'
        AND (d.tipo_cambio IS NULL OR d.tipo_cambio<=0 OR d.tipo_cambio IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))
        AND (lower(c.estado::text)='aceptado' OR (v_include_cancelled AND lower(c.estado::text)='anulado'))
    ) THEN RAISE EXCEPTION 'SIRE_RVIE_EXCHANGE_RATE_REQUIRED' USING ERRCODE='23514'; END IF;

    PERFORM c.id
    FROM public.cpe c
    WHERE c.tenant_id=p_tenant_id
      AND c.fecha_emision>=v_start AND c.fecha_emision<v_end
      AND c.created_at<=v_cutoff
      AND (lower(c.estado::text)='aceptado'
        OR (v_include_cancelled AND lower(c.estado::text)='anulado'))
    ORDER BY c.id
    FOR SHARE;

    v_header := 'PERIODO|FECHA_EMISION|TIPO_DOCUMENTO|SERIE|NUMERO|DOC_CLIENTE|CLIENTE|VALOR_FACTURADO|IGV|TOTAL|MONEDA|TIPO_CAMBIO';
    SELECT
      string_agg(
        concat_ws('|',
          v_periodo,
          to_char(c.fecha_emision AT TIME ZONE 'America/Lima','YYYY-MM-DD'),
          COALESCE(c.tipo_documento,''), COALESCE(c.serie,''),
          lpad(COALESCE(c.numero,c.numero_comprobante::text,''),8,'0'),
          COALESCE(c.documento_receptor,''),
          replace(replace(COALESCE(c.razon_social_receptor,''),'|',' '),E'\n',' '),
          converted.base::text,
          converted.igv::text,
          converted.total::text,
          COALESCE(NULLIF(upper(c.moneda),''),'PEN'),exchange_rate.rate::text
        ), E'\n' ORDER BY c.fecha_emision,c.id
      ),
      COALESCE(jsonb_agg(jsonb_build_object(
        'id',c.id,'updated_at',c.updated_at,'estado',c.estado,
        'moneda',COALESCE(NULLIF(upper(c.moneda),''),'PEN'),'tipo_cambio',exchange_rate.rate,
        'total',COALESCE(c.total_venta,c.total,0),'igv',COALESCE(c.total_igv,0)
      ) ORDER BY c.id),'[]'::jsonb),
      count(*)::integer,
      jsonb_build_object(
        'base',COALESCE(sum(converted.base),0),
        'igv',COALESCE(sum(converted.igv),0),
        'total',COALESCE(sum(converted.total),0)
      )
    INTO v_rows,v_manifest,v_count,v_totals
    FROM public.cpe c
    LEFT JOIN public.documentos d ON d.id=c.documento_id AND d.tenant_id=c.tenant_id
    CROSS JOIN LATERAL (SELECT CASE WHEN upper(COALESCE(NULLIF(btrim(c.moneda),''),'PEN'))='PEN' THEN 1::numeric ELSE d.tipo_cambio END AS rate) exchange_rate
    CROSS JOIN LATERAL (SELECT
      (CASE WHEN upper(c.tipo_documento) IN ('NOTA_CREDITO','NC','07') THEN -1 ELSE 1 END)*round(abs(COALESCE(c.total_venta,c.total,0)-COALESCE(c.total_igv,0))*exchange_rate.rate,2) AS base,
      (CASE WHEN upper(c.tipo_documento) IN ('NOTA_CREDITO','NC','07') THEN -1 ELSE 1 END)*round(abs(COALESCE(c.total_igv,0))*exchange_rate.rate,2) AS igv,
      (CASE WHEN upper(c.tipo_documento) IN ('NOTA_CREDITO','NC','07') THEN -1 ELSE 1 END)*round(abs(COALESCE(c.total_venta,c.total,0))*exchange_rate.rate,2) AS total) converted
    WHERE c.tenant_id=p_tenant_id
      AND c.fecha_emision>=v_start AND c.fecha_emision<v_end
      AND c.created_at<=v_cutoff
      AND (lower(c.estado::text)='aceptado'
        OR (v_include_cancelled AND lower(c.estado::text)='anulado'));
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.cuentas_por_pagar cp
      WHERE cp.tenant_id=p_tenant_id
        AND cp.fecha_emision>=v_start AND cp.fecha_emision<v_end
        AND cp.created_at<=v_cutoff
        AND upper(COALESCE(cp.moneda,'PEN'))<>'PEN'
        AND (COALESCE(NULLIF(cp.fiscal_metadata->>'tipo_cambio','')::numeric,cp.tipo_cambio_origen,0)<=0
          OR COALESCE(NULLIF(cp.fiscal_metadata->>'tipo_cambio','')::numeric,cp.tipo_cambio_origen,0) IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))
        AND (v_include_cancelled OR lower(cp.estado::text) NOT IN ('anulado','anulada','cancelado','cancelada') OR EXISTS (SELECT 1 FROM public.cxp_ajustes_proveedor a WHERE a.tenant_id=cp.tenant_id AND a.cuenta_por_pagar_id=cp.id AND a.total_nuevo<=0.01))
    ) THEN
      RAISE EXCEPTION 'SIRE_RCE_EXCHANGE_RATE_REQUIRED' USING ERRCODE='23514';
    END IF;

    PERFORM cp.id
    FROM public.cuentas_por_pagar cp
    WHERE cp.tenant_id=p_tenant_id
      AND cp.fecha_emision>=v_start AND cp.fecha_emision<v_end
      AND cp.created_at<=v_cutoff
      AND upper(COALESCE(cp.tipo_documento,'')) IN ('FACTURA','NOTA_CREDITO','NOTA_DEBITO','RECIBO_HONORARIOS')
      AND (v_include_cancelled OR lower(cp.estado::text) NOT IN ('anulado','anulada','cancelado','cancelada') OR EXISTS (SELECT 1 FROM public.cxp_ajustes_proveedor a WHERE a.tenant_id=cp.tenant_id AND a.cuenta_por_pagar_id=cp.id AND a.total_nuevo<=0.01))
    ORDER BY cp.id
    FOR SHARE;

    v_header := 'PERIODO|FECHA_EMISION|TIPO_DOCUMENTO|NUMERO|RUC_PROVEEDOR|PROVEEDOR|VALOR_ADQUISICIONES|IGV|TOTAL|MONEDA|TIPO_CAMBIO|DOC_MODIFICADO';
    SELECT
      string_agg(
        concat_ws('|',
          v_periodo, to_char(cp.fecha_emision,'YYYY-MM-DD'),
          COALESCE(cp.tipo_documento,''), COALESCE(cp.numero_documento,cp.numero,''),
          COALESCE(pr.ruc,pr.numero_documento,pr.documento_numero,''),
          replace(replace(COALESCE(pr.razon_social,pr.nombre,''),'|',' '),E'\n',' '),
          (CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END * round(COALESCE((original_fiscal.amounts->>'subtotal')::numeric,0) * exchange_rate.rate,2))::text,
          (CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END * round(COALESCE((original_fiscal.amounts->>'igv')::numeric,0) * exchange_rate.rate,2))::text,
          (CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END * round(COALESCE((original_fiscal.amounts->>'total')::numeric,0) * exchange_rate.rate,2))::text,
          COALESCE(NULLIF(upper(cp.moneda),''),'PEN'),
          CASE WHEN upper(COALESCE(cp.moneda,'PEN'))='PEN' THEN '1'
               ELSE COALESCE(NULLIF(cp.fiscal_metadata->>'tipo_cambio',''),cp.tipo_cambio_origen::text) END,
          concat_ws('-',NULLIF(cp.fiscal_metadata->>'documento_referencia_tipo',''),
            NULLIF(cp.fiscal_metadata->>'documento_referencia_serie',''),
            NULLIF(cp.fiscal_metadata->>'documento_referencia_numero',''))
        ), E'\n' ORDER BY cp.fecha_emision,cp.id
      ),
      COALESCE(jsonb_agg(jsonb_build_object(
        'id',cp.id,'updated_at',cp.updated_at,'estado',cp.estado,'tipo',cp.tipo_documento,
        'moneda',COALESCE(NULLIF(upper(btrim(cp.moneda)),''),'PEN'),'tipo_cambio',exchange_rate.rate,
        'subtotal',original_fiscal.amounts->'subtotal','igv',original_fiscal.amounts->'igv','total',original_fiscal.amounts->'total'
      ) ORDER BY cp.id),'[]'::jsonb),
      count(*)::integer,
      jsonb_build_object(
        'base',COALESCE(sum((CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END)*round(COALESCE((original_fiscal.amounts->>'subtotal')::numeric,0) * exchange_rate.rate,2)),0),
        'igv',COALESCE(sum((CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END)*round(COALESCE((original_fiscal.amounts->>'igv')::numeric,0) * exchange_rate.rate,2)),0),
        'total',COALESCE(sum((CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END)*round(COALESCE((original_fiscal.amounts->>'total')::numeric,0) * exchange_rate.rate,2)),0)
      )
    INTO v_rows,v_manifest,v_count,v_totals
    FROM public.cuentas_por_pagar cp
    CROSS JOIN LATERAL (SELECT app.cxp_original_fiscal_amounts_570(cp) AS amounts OFFSET 0) original_fiscal
    CROSS JOIN LATERAL (SELECT CASE WHEN upper(COALESCE(NULLIF(btrim(cp.moneda),''),'PEN'))='PEN' THEN 1::numeric
      ELSE COALESCE(NULLIF(cp.fiscal_metadata->>'tipo_cambio','')::numeric,cp.tipo_cambio_origen) END AS rate) exchange_rate
    LEFT JOIN public.proveedores pr
      ON pr.id=cp.proveedor_id AND pr.tenant_id=cp.tenant_id
    WHERE cp.tenant_id=p_tenant_id
      AND cp.fecha_emision>=v_start AND cp.fecha_emision<v_end
      AND cp.created_at<=v_cutoff
      AND upper(COALESCE(cp.tipo_documento,'')) IN ('FACTURA','NOTA_CREDITO','NOTA_DEBITO','RECIBO_HONORARIOS')
      AND (v_include_cancelled OR lower(cp.estado::text) NOT IN ('anulado','anulada','cancelado','cancelada') OR EXISTS (SELECT 1 FROM public.cxp_ajustes_proveedor a WHERE a.tenant_id=cp.tenant_id AND a.cuenta_por_pagar_id=cp.id AND a.total_nuevo<=0.01) OR (cp.original_fiscal_amounts IS NOT NULL AND cp.metadata->>'cancelada_por_nota_credito'='true'));
  END IF;

  v_content := v_header || CASE WHEN COALESCE(v_rows,'')='' THEN '' ELSE E'\n'||v_rows END;
  v_fingerprint := app.fiscal_fingerprint_463(jsonb_build_object(
    'tipo',v_tipo,'periodo',v_periodo,'manifest',v_manifest,'totals',v_totals,
    'content_sha256',encode(extensions.digest(convert_to(v_content,'UTF8'),'sha256'),'hex')
  ));
  RETURN jsonb_build_object(
    'contenido',v_content,'manifest',v_manifest,'total_registros',v_count,
    'totals',v_totals,'cutoff_at',v_cutoff,'source_fingerprint',v_fingerprint,
    'contenido_sha256',encode(extensions.digest(convert_to(v_content,'UTF8'),'sha256'),'hex')
  );
END;
$function$;

-- Integrar después de la sección RCE de 570. Sin emisión fiscal ni datos PROD.
-- La devolución 450 ya redujo stock/CxP y emitió su asiento. La NC recibida
-- sustenta ese mismo ajuste: no crea otra deuda ni vuelve a emitir contabilidad.
CREATE OR REPLACE FUNCTION public.registrar_nota_credito_proveedor_devolucion_tx(
  p_tenant_id uuid, p_actor_id uuid, p_devolucion_id uuid,
  p_payload jsonb, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_return public.devoluciones_proveedor;
  v_invoice public.cuentas_por_pagar;
  v_adjust public.cxp_ajustes_proveedor;
  v_note public.cuentas_por_pagar;
  v_operation public.financial_master_operations;
  v_key text:=lower(btrim(coalesce(p_idempotency_key,'')));
  v_number text:=upper(btrim(coalesce(p_payload->>'numero_documento','')));
  v_series text:=upper(btrim(coalesce(p_payload->>'serie','')));
  v_payload jsonb;
  v_fingerprint text;
  v_original_number text;
  v_original_series text;
  v_reference_number text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'finanzas.cxp.gestionar');
  PERFORM set_config('app.current_tenant_id',p_tenant_id::text,true);
  IF p_devolucion_id IS NULL OR jsonb_typeof(p_payload)<>'object'
    OR length(v_key) NOT BETWEEN 8 AND 200 OR v_number='' OR v_series=''
    OR upper(p_payload->>'tipo_documento') IS DISTINCT FROM 'NOTA_CREDITO'
    OR (p_payload->>'fecha_emision')::date IS NULL THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_NC_INVALID_PAYLOAD' USING ERRCODE='22023';
  END IF;
  v_payload:=jsonb_build_object('devolucion_id',p_devolucion_id,'proveedor_id',p_payload->'proveedor_id',
    'numero_documento',v_number,'serie',v_series,'fecha_emision',(p_payload->>'fecha_emision')::date,
    'subtotal',(p_payload->>'subtotal')::numeric,'igv',(p_payload->>'igv')::numeric,
    'total',(p_payload->>'total')::numeric,'moneda',upper(p_payload->>'moneda'),
    'tipo_cambio',(p_payload->>'tipo_cambio')::numeric,
    'documento_referencia_tipo',upper(p_payload->>'documento_referencia_tipo'),
    'documento_referencia_serie',upper(btrim(p_payload->>'documento_referencia_serie')),
    'documento_referencia_numero',btrim(p_payload->>'documento_referencia_numero'),
    'documento_referencia_fecha',(p_payload->>'documento_referencia_fecha')::date,
    'observaciones',nullif(btrim(p_payload->>'observaciones'),''));
  v_fingerprint:=app.financial_master_fingerprint_477(v_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':supplier-nc:'||v_key,570));
  SELECT * INTO v_operation FROM public.financial_master_operations
    WHERE tenant_id=p_tenant_id AND operation_type='SUPPLIER_RETURN_NC'
      AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operation.request_fingerprint<>v_fingerprint OR v_operation.actor_id<>p_actor_id THEN
      RAISE EXCEPTION 'SUPPLIER_RETURN_NC_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_operation.result||jsonb_build_object('idempotent',true);
  END IF;
  SELECT * INTO v_return FROM public.devoluciones_proveedor
    WHERE tenant_id=p_tenant_id AND id=p_devolucion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_RETURN_NC_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF upper(v_return.estado::text)<>'EMITIDA' OR v_return.cuenta_por_pagar_id IS NULL THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_NC_RETURN_NOT_APPLIED' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT v_invoice FROM public.cuentas_por_pagar
    WHERE tenant_id=p_tenant_id AND id=v_return.cuenta_por_pagar_id FOR SHARE;
  SELECT * INTO v_adjust FROM public.cxp_ajustes_proveedor
    WHERE tenant_id=p_tenant_id AND devolucion_id=v_return.id
      AND cuenta_por_pagar_id=v_invoice.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_RETURN_NC_ADJUSTMENT_MISSING' USING ERRCODE='23514'; END IF;
  IF v_invoice.proveedor_id::text IS DISTINCT FROM p_payload->>'proveedor_id'
    OR upper(v_invoice.moneda) IS DISTINCT FROM upper(p_payload->>'moneda')
    OR (p_payload->>'subtotal')::numeric IS DISTINCT FROM v_adjust.subtotal
    OR (p_payload->>'igv')::numeric IS DISTINCT FROM v_adjust.igv
    OR (p_payload->>'total')::numeric IS DISTINCT FROM v_adjust.total
    OR (p_payload->>'fecha_emision')::date<v_invoice.fecha_emision::date
    OR coalesce((p_payload->>'tipo_cambio')::numeric,0)<=0
    OR (v_invoice.moneda='PEN' AND (p_payload->>'tipo_cambio')::numeric<>1)
    OR coalesce((p_payload->>'retencion')::numeric,0)<>0
    OR coalesce((p_payload->>'percepcion')::numeric,0)<>0
    OR coalesce((p_payload->>'detraccion')::numeric,0)<>0
    OR coalesce((p_payload->>'anticipo')::numeric,0)<>0 THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_NC_AMOUNTS_MISMATCH' USING ERRCODE='23514';
  END IF;
  v_original_series:=upper(coalesce(nullif(v_invoice.fiscal_metadata->>'serie',''),
    split_part(v_invoice.numero_documento,'-',1)));
  v_original_number:=CASE WHEN position('-' IN v_invoice.numero_documento)>0
    THEN substr(v_invoice.numero_documento,position('-' IN v_invoice.numero_documento)+1)
    ELSE v_invoice.numero_documento END;
  v_reference_number:=btrim(p_payload->>'documento_referencia_numero');
  IF upper(p_payload->>'documento_referencia_tipo') IS DISTINCT FROM upper(v_invoice.tipo_documento)
    OR upper(btrim(p_payload->>'documento_referencia_serie')) IS DISTINCT FROM v_original_series
    OR nullif(ltrim(v_reference_number,'0'),'') IS DISTINCT FROM nullif(ltrim(v_original_number,'0'),'')
    OR (p_payload->>'documento_referencia_fecha')::date IS DISTINCT FROM v_invoice.fecha_emision::date THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_NC_REFERENCE_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cuentas_por_pagar c WHERE c.tenant_id=p_tenant_id
    AND c.metadata->>'devolucion_proveedor_id'=v_return.id::text
    AND c.metadata->>'registro_fiscal_sin_obligacion'='true') THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_NC_ALREADY_REGISTERED' USING ERRCODE='23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cuentas_por_pagar c WHERE c.tenant_id=p_tenant_id
    AND c.proveedor_id=v_invoice.proveedor_id AND upper(c.numero_documento)=v_number) THEN
    RAISE EXCEPTION 'SUPPLIER_RETURN_NC_DOCUMENT_ALREADY_REGISTERED' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.cuentas_por_pagar (
    tenant_id,proveedor_id,numero,numero_documento,tipo_documento,
    fecha_emision,fecha_vencimiento,condiciones_pago,dias_credito,
    subtotal,igv,total,saldo,saldo_pendiente,moneda,estado,
    referencia_tipo,referencia_id,idempotency_key,fiscal_metadata,metadata,
    destino_credito_fiscal,tipo_cambio_origen,observaciones,created_by,updated_by
  ) VALUES (
    p_tenant_id,v_invoice.proveedor_id,v_number,v_number,'NOTA_CREDITO',
    (p_payload->>'fecha_emision')::date,(p_payload->>'fecha_emision')::date,'CONTADO',0,
    v_adjust.subtotal,v_adjust.igv,v_adjust.total,0,0,v_invoice.moneda,'PAGADA',
    'DEVOLUCION_PROVEEDOR',v_return.id,v_key,
    jsonb_build_object('serie',v_series,'tipo_cambio',(p_payload->>'tipo_cambio')::numeric,
      'documento_referencia_tipo',v_invoice.tipo_documento,
      'documento_referencia_serie',v_original_series,'documento_referencia_numero',v_original_number,
      'documento_referencia_fecha',v_invoice.fecha_emision::date),
    jsonb_build_object('registro_fiscal_sin_obligacion',true,'devolucion_proveedor_id',v_return.id,
      'factura_proveedor_id',v_invoice.id,'ajuste_cxp_id',v_adjust.id,
      'accounting_event_id',v_return.emit_event_id,'source','SUPPLIER_RETURN_NC_570'),
    v_invoice.destino_credito_fiscal,(p_payload->>'tipo_cambio')::numeric,
    nullif(btrim(p_payload->>'observaciones'),''),p_actor_id,p_actor_id
  ) RETURNING * INTO v_note;
  v_result:=to_jsonb(v_note)||jsonb_build_object('idempotent',false);
  INSERT INTO public.financial_master_operations
    (tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
  VALUES (p_tenant_id,'SUPPLIER_RETURN_NC',v_key,v_fingerprint,p_actor_id,v_note.id,v_result);
  PERFORM app.audit_fiscal_463(p_tenant_id,p_actor_id,'cuentas_por_pagar','INSERT',v_note.id,
    NULL,to_jsonb(v_note),'REGISTRAR_NC_PROVEEDOR_DEVOLUCION',
    jsonb_build_object('devolucion_id',v_return.id,'factura_id',v_invoice.id,'idempotency_key',v_key));
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_nota_credito_proveedor_devolucion_tx(uuid,uuid,uuid,jsonb,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_nota_credito_proveedor_devolucion_tx(uuid,uuid,uuid,jsonb,text)
TO service_role;

CREATE UNIQUE INDEX ux_cxp_supplier_return_fiscal_note_570
ON public.cuentas_por_pagar (tenant_id,(metadata->>'devolucion_proveedor_id'))
WHERE metadata->>'registro_fiscal_sin_obligacion'='true';
CREATE OR REPLACE FUNCTION public.crear_factura_proveedor_tx(
  p_tenant_id uuid, p_cxp jsonb, p_event_id uuid, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_result jsonb;
  v_invoice public.cuentas_por_pagar%ROWTYPE;
  v_destination text := upper(btrim(coalesce(p_cxp->>'destino_credito_fiscal', 'GRAVADAS')));
  v_code text := nullif(btrim(p_cxp->>'codigo_detraccion'), '');
  v_rate numeric(18,6);
  v_context jsonb;
  v_saved_context jsonb;
BEGIN
  IF upper(btrim(coalesce(p_cxp->>'tipo_documento','FACTURA'))) IN ('07','NC','NOTA_CREDITO') THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_NOTE_USE_RETURN_WRITER' USING ERRCODE='23514';
  END IF;
  IF v_destination NOT IN ('GRAVADAS','NO_GRAVADAS','COMUN')
     OR length(v_code) > 10 THEN
    RAISE EXCEPTION 'SUPPLIER_INVOICE_FISCAL_CONTEXT_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_code ~ '^[0-9]{1,3}$' THEN v_code := lpad(v_code, 3, '0'); END IF;
  v_rate := CASE WHEN upper(btrim(coalesce(p_cxp->>'moneda','PEN')))='PEN' THEN 1
    ELSE nullif(p_cxp->'fiscal_metadata'->>'tipo_cambio','')::numeric END;
  IF v_rate IS NULL OR v_rate <= 0 OR (
    nullif(p_cxp->>'tipo_cambio_origen','') IS NOT NULL
    AND (p_cxp->>'tipo_cambio_origen')::numeric IS DISTINCT FROM v_rate
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_INVOICE_EXCHANGE_RATE_INCONSISTENT' USING ERRCODE='22023';
  END IF;
  v_context := jsonb_build_object(
    'destino_credito_fiscal',v_destination, 'codigo_detraccion',v_code,
    'tipo_cambio_origen',v_rate,
    'fecha_emision',(p_cxp->>'fecha_emision')::date,
    'serie',nullif(btrim(p_cxp->'fiscal_metadata'->>'serie'),''),
    'documento_referencia_tipo',nullif(btrim(p_cxp->'fiscal_metadata'->>'documento_referencia_tipo'),''),
    'documento_referencia_serie',nullif(btrim(p_cxp->'fiscal_metadata'->>'documento_referencia_serie'),''),
    'documento_referencia_numero',nullif(btrim(p_cxp->'fiscal_metadata'->>'documento_referencia_numero'),''),
    'documento_referencia_fecha',nullif(p_cxp->'fiscal_metadata'->>'documento_referencia_fecha','')::date
  );

  -- El writer vigente conserva actor, tenant, locks, huella monetaria,
  -- anticipos, ajustes, factura y outbox; cualquier fallo posterior revierte todo.
  v_result := app.crear_factura_proveedor_tx(p_tenant_id,p_cxp,p_event_id,p_idempotency_key);
  SELECT * INTO STRICT v_invoice FROM public.cuentas_por_pagar
  WHERE tenant_id=p_tenant_id AND id=(v_result->>'id')::uuid FOR UPDATE;
  IF coalesce((v_result->>'idempotent')::boolean,false) THEN
    v_saved_context := v_invoice.fiscal_metadata->'request_context_540';
    IF v_saved_context IS NULL THEN
      -- Compatibilidad con facturas previas: sólo se admite lo que la fila
      -- histórica acredita. No adivinar su destino ni corregirla por reintento.
      v_saved_context := jsonb_build_object(
        'destino_credito_fiscal',v_invoice.destino_credito_fiscal,
        'codigo_detraccion',v_invoice.codigo_detraccion,
        'tipo_cambio_origen',coalesce(v_invoice.tipo_cambio_origen,
          (v_invoice.fiscal_metadata->>'tipo_cambio')::numeric,
          CASE WHEN v_invoice.moneda='PEN' THEN 1 END),
        'fecha_emision',v_invoice.fecha_emision::date,
        'serie',nullif(btrim(v_invoice.fiscal_metadata->>'serie'),''),
        'documento_referencia_tipo',nullif(btrim(v_invoice.fiscal_metadata->>'documento_referencia_tipo'),''),
        'documento_referencia_serie',nullif(btrim(v_invoice.fiscal_metadata->>'documento_referencia_serie'),''),
        'documento_referencia_numero',nullif(btrim(v_invoice.fiscal_metadata->>'documento_referencia_numero'),''),
        'documento_referencia_fecha',nullif(v_invoice.fiscal_metadata->>'documento_referencia_fecha','')::date
      );
    END IF;
    IF v_saved_context IS DISTINCT FROM v_context THEN
      RAISE EXCEPTION 'SUPPLIER_INVOICE_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FISCAL_CONTEXT'
        USING ERRCODE='23505';
    END IF;
    RETURN v_result;
  END IF;

  UPDATE public.cuentas_por_pagar
  SET destino_credito_fiscal=v_destination, codigo_detraccion=v_code,
      tipo_cambio_origen=v_rate,
      fiscal_metadata=coalesce(fiscal_metadata,'{}'::jsonb)
        || jsonb_build_object('request_context_540',v_context)
  WHERE tenant_id=p_tenant_id AND id=v_invoice.id
  RETURNING * INTO v_invoice;
  RETURN to_jsonb(v_invoice) || jsonb_build_object('idempotent',false);
END;
$function$;

-- NC recibidas sin devolución: ajuste de obligación y crédito excedente.
-- No altera inventario. El usuario selecciona la contrapartida contable.
ALTER TABLE public.cuentas_por_pagar
  ADD COLUMN saldo_credito_proveedor numeric(14,2) NOT NULL DEFAULT 0
  CHECK (saldo_credito_proveedor>=0);

CREATE TABLE public.cxp_credito_proveedor_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  nota_credito_id uuid NOT NULL REFERENCES public.cuentas_por_pagar(id) ON DELETE RESTRICT,
  factura_id uuid REFERENCES public.cuentas_por_pagar(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK(tipo IN ('ORIGEN','APLICACION','REEMBOLSO')),
  monto numeric(14,2) NOT NULL CHECK(monto>0),
  saldo_anterior numeric(14,2) NOT NULL CHECK(saldo_anterior>=0),
  saldo_nuevo numeric(14,2) NOT NULL CHECK(saldo_nuevo>=0),
  moneda text NOT NULL CHECK(moneda~'^[A-Z]{3}$'),
  fecha date NOT NULL,
  movimiento_bancario_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,idempotency_key),
  CHECK ((tipo='ORIGEN' AND saldo_nuevo=saldo_anterior+monto)
      OR (tipo<>'ORIGEN' AND saldo_nuevo=saldo_anterior-monto)),
  CHECK ((tipo='REEMBOLSO')=(movimiento_bancario_id IS NOT NULL))
);
ALTER TABLE public.cxp_credito_proveedor_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cxp_credito_proveedor_movimientos FORCE ROW LEVEL SECURITY;
SELECT app.apply_tenant_policy('public','cxp_credito_proveedor_movimientos');
REVOKE ALL ON public.cxp_credito_proveedor_movimientos FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.cxp_credito_proveedor_movimientos TO service_role;

CREATE OR REPLACE FUNCTION app.guard_supplier_credit_570()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
BEGIN
  IF TG_TABLE_NAME='cxp_credito_proveedor_movimientos' THEN
    IF TG_OP<>'INSERT' OR current_setting('app.supplier_credit_writer_570',true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'SUPPLIER_CREDIT_RPC_REQUIRED' USING ERRCODE='42501';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.cuentas_por_pagar c WHERE c.id=NEW.nota_credito_id
      AND c.tenant_id=NEW.tenant_id AND c.tipo_documento='NOTA_CREDITO'
      AND c.metadata->>'source'='SUPPLIER_CREDIT_NC_570')
      OR (NEW.factura_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cuentas_por_pagar c
      JOIN public.cuentas_por_pagar n ON n.id=NEW.nota_credito_id AND n.tenant_id=c.tenant_id
      WHERE c.id=NEW.factura_id AND c.tenant_id=NEW.tenant_id AND c.proveedor_id=n.proveedor_id
      AND c.moneda=n.moneda)) THEN
      RAISE EXCEPTION 'SUPPLIER_CREDIT_TENANT_SOURCE_INVALID' USING ERRCODE='23514';
    END IF;
  ELSIF (TG_OP='INSERT' AND NEW.saldo_credito_proveedor<>0)
    OR (TG_OP='UPDATE' AND NEW.saldo_credito_proveedor IS DISTINCT FROM OLD.saldo_credito_proveedor) THEN
    IF current_setting('app.supplier_credit_writer_570',true) IS DISTINCT FROM 'on'
      OR NEW.tipo_documento<>'NOTA_CREDITO' OR NEW.metadata->>'source'<>'SUPPLIER_CREDIT_NC_570' THEN
      RAISE EXCEPTION 'SUPPLIER_CREDIT_RPC_REQUIRED' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER trg_supplier_credit_570 BEFORE INSERT OR UPDATE ON public.cuentas_por_pagar
FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_credit_570();
CREATE TRIGGER trg_supplier_credit_ledger_570 BEFORE INSERT OR UPDATE OR DELETE ON public.cxp_credito_proveedor_movimientos
FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_credit_570();

CREATE OR REPLACE FUNCTION public.registrar_nota_credito_proveedor_tx(
  p_tenant_id uuid,p_actor_id uuid,p_factura_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $fn$
DECLARE
  v_invoice public.cuentas_por_pagar; v_note public.cuentas_por_pagar;
  v_operation public.financial_master_operations;
  v_counter public.plan_cuentas; v_payable public.plan_cuentas; v_advance public.plan_cuentas; v_tax public.plan_cuentas;
  v_key text:=lower(btrim(coalesce(p_idempotency_key,'')));
  v_fingerprint text; v_payload jsonb; v_number text:=upper(btrim(p_payload->>'numero_documento'));
  v_series text:=upper(btrim(p_payload->>'serie'));
  v_reason text:=upper(p_payload->>'motivo_nota_credito');
  v_base numeric:=round((p_payload->>'subtotal')::numeric,2);
  v_tax_amount numeric:=round((p_payload->>'igv')::numeric,2);
  v_total numeric:=round((p_payload->>'total')::numeric,2);
  v_rate numeric:=(p_payload->>'tipo_cambio')::numeric;
  v_date date:=(p_payload->>'fecha_emision')::date;
  v_old_balance numeric; v_new_balance numeric; v_credit numeric; v_cancel boolean;
  v_original_series text; v_original_number text; v_event uuid:=gen_random_uuid(); v_result jsonb;
  v_original_rate numeric;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'finanzas.cxp.gestionar');
  PERFORM set_config('app.current_tenant_id',p_tenant_id::text,true);
  IF p_factura_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR length(v_key) NOT BETWEEN 8 AND 180 OR coalesce(v_number,'')='' OR coalesce(v_series,'')=''
    OR upper(p_payload->>'tipo_documento') IS DISTINCT FROM 'NOTA_CREDITO'
    OR v_reason IS NULL OR v_reason NOT IN ('DESCUENTO','ANULACION') OR v_date IS NULL
    OR coalesce(v_base,-1)<0 OR coalesce(v_tax_amount,-1)<0 OR coalesce(v_total,0)<=0
    OR v_total<>v_base+v_tax_amount OR coalesce(v_rate,0)<=0 THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  v_payload:=p_payload||jsonb_build_object('factura_id',p_factura_id,'numero_documento',v_number,
    'serie',v_series,'subtotal',v_base,'igv',v_tax_amount,'total',v_total,'motivo_nota_credito',v_reason);
  v_fingerprint:=app.financial_master_fingerprint_477(v_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':supplier-credit:'||v_key,570));
  SELECT * INTO v_operation FROM public.financial_master_operations
    WHERE tenant_id=p_tenant_id AND operation_type='SUPPLIER_CREDIT_NC' AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operation.request_fingerprint<>v_fingerprint OR v_operation.actor_id<>p_actor_id THEN
      RAISE EXCEPTION 'SUPPLIER_CREDIT_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN v_operation.result||jsonb_build_object('idempotent',true);
  END IF;
  SELECT * INTO v_invoice FROM public.cuentas_por_pagar
    WHERE id=p_factura_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_INVOICE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_invoice.tipo_documento NOT IN ('FACTURA','BOLETA') OR v_invoice.estado='ANULADA'
    OR v_invoice.metadata->>'cancelada_por_nota_credito'='true'
    OR v_invoice.proveedor_id::text IS DISTINCT FROM p_payload->>'proveedor_id'
    OR upper(v_invoice.moneda) IS DISTINCT FROM upper(p_payload->>'moneda')
    OR v_date<v_invoice.fecha_emision::date OR (v_invoice.moneda='PEN' AND v_rate<>1)
    OR v_base>v_invoice.subtotal OR v_tax_amount>v_invoice.igv OR v_total>v_invoice.total
    OR coalesce((p_payload->>'retencion')::numeric,0)<>0
    OR coalesce((p_payload->>'detraccion')::numeric,0)<>0
    OR coalesce((p_payload->>'percepcion')::numeric,0)<>0
    OR coalesce((p_payload->>'anticipo')::numeric,0)<>0 THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_INVOICE_AMOUNTS_INVALID' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.operaciones_fiscales_financieras o
    WHERE o.tenant_id=p_tenant_id AND o.cxp_id=v_invoice.id AND o.origen='PROVEEDOR'
      AND o.tipo='DETRACCION' AND o.estado='PENDIENTE_TESORERIA') THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_PENDING_DETRACTION_REQUIRES_REVERSAL' USING ERRCODE='23514'; END IF;
  v_original_series:=upper(coalesce(nullif(v_invoice.fiscal_metadata->>'serie',''),split_part(v_invoice.numero_documento,'-',1)));
  v_original_number:=CASE WHEN position('-' IN v_invoice.numero_documento)>0
    THEN substr(v_invoice.numero_documento,position('-' IN v_invoice.numero_documento)+1) ELSE v_invoice.numero_documento END;
  IF upper(p_payload->>'documento_referencia_tipo') IS DISTINCT FROM upper(v_invoice.tipo_documento)
    OR upper(btrim(p_payload->>'documento_referencia_serie')) IS DISTINCT FROM v_original_series
    OR nullif(ltrim(btrim(p_payload->>'documento_referencia_numero'),'0'),'') IS DISTINCT FROM nullif(ltrim(v_original_number,'0'),'')
    OR (p_payload->>'documento_referencia_fecha')::date IS DISTINCT FROM v_invoice.fecha_emision::date THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
  v_cancel:=v_total=v_invoice.total;
  IF v_reason='ANULACION' AND NOT v_cancel THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_CANCELLATION_REQUIRES_FULL_AMOUNT' USING ERRCODE='23514'; END IF;
  v_counter:=app.assert_postable_account_457(p_tenant_id,(p_payload->>'cuenta_ajuste_id')::uuid,'SUPPLIER_NC_COUNTER');
  SELECT * INTO v_payable FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='42';
  v_payable:=app.assert_postable_account_457(p_tenant_id,v_payable.id,'SUPPLIER_NC_PAYABLE');
  SELECT * INTO v_advance FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='422';
  v_advance:=app.assert_postable_account_457(p_tenant_id,v_advance.id,'SUPPLIER_NC_CREDIT');
  IF v_tax_amount>0 THEN
    SELECT * INTO v_tax FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='40';
    v_tax:=app.assert_postable_account_457(p_tenant_id,v_tax.id,'SUPPLIER_NC_TAX');
  END IF;
  IF v_counter.id IN (v_payable.id,v_advance.id,v_tax.id) THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_COUNTER_ACCOUNT_INVALID' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant_id
    AND proveedor_id=v_invoice.proveedor_id AND upper(numero_documento)=v_number) THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_DOCUMENT_ALREADY_REGISTERED' USING ERRCODE='23505'; END IF;
  v_old_balance:=v_invoice.saldo;
  v_new_balance:=greatest(v_old_balance-v_total,0);
  v_credit:=greatest(v_total-v_old_balance,0);
  v_original_rate:=CASE WHEN v_invoice.moneda=app.treasury_local_currency_452(p_tenant_id) THEN 1
    ELSE coalesce(v_invoice.tipo_cambio_origen,(v_invoice.fiscal_metadata->>'tipo_cambio')::numeric) END;
  IF coalesce(v_original_rate,0)<=0 THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_ORIGIN_RATE_REQUIRED' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.supplier_credit_writer_570','on',true);
  INSERT INTO public.cuentas_por_pagar(tenant_id,proveedor_id,numero,numero_documento,tipo_documento,
    fecha_emision,fecha_vencimiento,condiciones_pago,dias_credito,subtotal,igv,total,saldo,saldo_pendiente,
    moneda,estado,referencia_tipo,referencia_id,idempotency_key,fiscal_metadata,metadata,
    destino_credito_fiscal,tipo_cambio_origen,observaciones,created_by,updated_by,saldo_credito_proveedor)
  VALUES(p_tenant_id,v_invoice.proveedor_id,v_number,v_number,'NOTA_CREDITO',v_date,v_date,'CONTADO',0,
    v_base,v_tax_amount,v_total,0,0,v_invoice.moneda,'PAGADA',NULL,NULL,v_key,
    jsonb_build_object('serie',v_series,'tipo_cambio',v_rate,'documento_referencia_tipo',v_invoice.tipo_documento,
      'documento_referencia_serie',v_original_series,'documento_referencia_numero',v_original_number,
      'documento_referencia_fecha',v_invoice.fecha_emision::date),
    jsonb_build_object('registro_fiscal_sin_obligacion',true,'factura_proveedor_id',v_invoice.id,
      'source','SUPPLIER_CREDIT_NC_570','motivo',v_reason,'cuenta_ajuste_id',v_counter.id,
      'ajustes_fiscales_preservados',jsonb_build_object('retencion',v_invoice.retencion_total,
        'percepcion',v_invoice.percepcion_total,'detraccion',v_invoice.detraccion_total),
      'tipo_cambio_credito',v_original_rate,'accounting_event_id',v_event),
    v_invoice.destino_credito_fiscal,v_rate,nullif(btrim(p_payload->>'observaciones'),''),p_actor_id,p_actor_id,v_credit)
  RETURNING * INTO v_note;
  UPDATE public.cuentas_por_pagar SET
    subtotal=CASE WHEN v_cancel THEN subtotal ELSE subtotal-v_base END,
    igv=CASE WHEN v_cancel THEN igv ELSE igv-v_tax_amount END,
    total=CASE WHEN v_cancel THEN total ELSE total-v_total END,
    saldo=v_new_balance,saldo_pendiente=v_new_balance,
    estado=CASE WHEN v_cancel AND v_new_balance=0 THEN 'ANULADA' WHEN v_new_balance=0 THEN 'PAGADA'
      WHEN v_new_balance<total-v_total THEN 'PARCIAL' ELSE 'PENDIENTE' END,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('ultima_nota_credito_proveedor_id',v_note.id,
      'cancelada_por_nota_credito',v_cancel),updated_by=p_actor_id
  WHERE tenant_id=p_tenant_id AND id=v_invoice.id;
  IF v_credit>0 THEN INSERT INTO public.cxp_credito_proveedor_movimientos(
    tenant_id,nota_credito_id,factura_id,tipo,monto,saldo_anterior,saldo_nuevo,moneda,fecha,event_id,actor_id,idempotency_key)
    VALUES(p_tenant_id,v_note.id,v_invoice.id,'ORIGEN',v_credit,0,v_credit,v_invoice.moneda,v_date,v_event,p_actor_id,v_key);
  END IF;
  INSERT INTO public.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,payload,status,retry_count,idempotency_key,event_id,occurred_at)
  VALUES(p_tenant_id,'nota_credito_proveedor',v_note.id::text,'nota_credito.proveedor.registrada',
    jsonb_build_object('tenantId',p_tenant_id,'eventId',v_event,'fecha',v_date,'numeroDocumento',v_number,
      'notaCreditoId',v_note.id,'facturaId',v_invoice.id,'proveedorId',v_invoice.proveedor_id,
      'subtotal',v_base,'igv',v_tax_amount,'total',v_total,'deudaReducida',least(v_old_balance,v_total),
      'creditoCreado',v_credit,'tipoCambio',v_original_rate,'moneda',v_invoice.moneda,
      'cuentaAjusteId',v_counter.id,'cuentaAjusteCodigo',v_counter.codigo,
      'cuentaProveedorId',v_payable.id,'cuentaCreditoId',v_advance.id,'cuentaIgvId',v_tax.id),
    'pending',0,'supplier-credit:nc:'||v_key,v_event,clock_timestamp());
  v_result:=to_jsonb(v_note)||jsonb_build_object('idempotent',false);
  INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
    VALUES(p_tenant_id,'SUPPLIER_CREDIT_NC',v_key,v_fingerprint,p_actor_id,v_note.id,v_result);
  PERFORM app.audit_fiscal_463(p_tenant_id,p_actor_id,'cuentas_por_pagar','INSERT',v_note.id,NULL,to_jsonb(v_note),
    'REGISTRAR_NC_PROVEEDOR',jsonb_build_object('factura_id',v_invoice.id,'idempotency_key',v_key));
  PERFORM set_config('app.supplier_credit_writer_570','off',true);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.aplicar_credito_proveedor_tx(
  p_tenant_id uuid,p_actor_id uuid,p_nota_credito_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $fn$
DECLARE
  v_note public.cuentas_por_pagar; v_invoice public.cuentas_por_pagar;
  v_operation public.financial_master_operations; v_ledger public.cxp_credito_proveedor_movimientos;
  v_bank public.cuentas_bancarias; v_credit_account public.plan_cuentas; v_payable public.plan_cuentas;
  v_key text:=lower(btrim(coalesce(p_idempotency_key,'')));
  v_action text:=upper(p_payload->>'accion'); v_amount numeric:=round((p_payload->>'monto')::numeric,2);
  v_date date:=(p_payload->>'fecha')::date; v_fingerprint text; v_result jsonb; v_bank_result jsonb;
  v_event uuid:=gen_random_uuid(); v_old numeric; v_credit_rate numeric; v_target_rate numeric; v_refund_rate numeric;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'finanzas.cxp.gestionar');
  PERFORM set_config('app.current_tenant_id',p_tenant_id::text,true);
  IF p_nota_credito_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR length(v_key) NOT BETWEEN 8 AND 160 OR v_action IS NULL OR v_action NOT IN ('APLICACION','REEMBOLSO')
    OR coalesce(v_amount,0)<=0 OR v_date IS NULL THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_ACTION_INVALID' USING ERRCODE='22023'; END IF;
  v_fingerprint:=app.financial_master_fingerprint_477(p_payload||jsonb_build_object('nota_id',p_nota_credito_id));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':supplier-credit-use:'||v_key,570));
  SELECT * INTO v_operation FROM public.financial_master_operations
    WHERE tenant_id=p_tenant_id AND operation_type='SUPPLIER_CREDIT_USE' AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operation.request_fingerprint<>v_fingerprint OR v_operation.actor_id<>p_actor_id THEN
      RAISE EXCEPTION 'SUPPLIER_CREDIT_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN v_operation.result||jsonb_build_object('idempotent',true);
  END IF;
  SELECT * INTO v_note FROM public.cuentas_por_pagar
    WHERE tenant_id=p_tenant_id AND id=p_nota_credito_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_NOTE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_note.metadata->>'source' IS DISTINCT FROM 'SUPPLIER_CREDIT_NC_570'
    OR v_date<v_note.fecha_emision::date OR v_amount>v_note.saldo_credito_proveedor THEN
    RAISE EXCEPTION 'SUPPLIER_CREDIT_AVAILABLE_BALANCE_EXCEEDED' USING ERRCODE='23514'; END IF;
  v_credit_rate:=(v_note.metadata->>'tipo_cambio_credito')::numeric;
  SELECT * INTO v_credit_account FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='422';
  v_credit_account:=app.assert_postable_account_457(p_tenant_id,v_credit_account.id,'SUPPLIER_CREDIT');
  IF v_action='APLICACION' THEN
    SELECT * INTO v_invoice FROM public.cuentas_por_pagar
      WHERE tenant_id=p_tenant_id AND id=(p_payload->>'factura_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_TARGET_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF v_invoice.proveedor_id<>v_note.proveedor_id OR v_invoice.moneda<>v_note.moneda
      OR v_invoice.tipo_documento='NOTA_CREDITO' OR v_invoice.estado IN ('ANULADA','PAGADA')
      OR v_amount>v_invoice.saldo OR v_date<v_invoice.fecha_emision::date THEN
      RAISE EXCEPTION 'SUPPLIER_CREDIT_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    v_target_rate:=CASE WHEN v_invoice.moneda=app.treasury_local_currency_452(p_tenant_id) THEN 1
      ELSE coalesce(v_invoice.tipo_cambio_origen,(v_invoice.fiscal_metadata->>'tipo_cambio')::numeric) END;
    IF coalesce(v_target_rate,0)<=0 THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_ORIGIN_RATE_REQUIRED' USING ERRCODE='23514'; END IF;
    SELECT * INTO v_payable FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='42';
    v_payable:=app.assert_postable_account_457(p_tenant_id,v_payable.id,'SUPPLIER_CREDIT_PAYABLE');
    UPDATE public.cuentas_por_pagar SET saldo=saldo-v_amount,saldo_pendiente=saldo-v_amount,
      estado=CASE WHEN saldo-v_amount=0 THEN 'PAGADA' ELSE 'PARCIAL' END,updated_by=p_actor_id
      WHERE tenant_id=p_tenant_id AND id=v_invoice.id;
    INSERT INTO public.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,payload,status,retry_count,idempotency_key,event_id,occurred_at)
    VALUES(p_tenant_id,'credito_proveedor',p_nota_credito_id::text,'credito.proveedor.aplicado',
      jsonb_build_object('tenantId',p_tenant_id,'eventId',v_event,'fecha',v_date,'numeroDocumento',v_note.numero_documento,
        'notaCreditoId',v_note.id,'facturaId',v_invoice.id,'monto',v_amount,'moneda',v_note.moneda,
        'tipoCambioCredito',v_credit_rate,'tipoCambioFactura',v_target_rate,
        'cuentaProveedorId',v_payable.id,'cuentaCreditoId',v_credit_account.id),
      'pending',0,'supplier-credit:apply:'||v_key,v_event,clock_timestamp());
  ELSE
    PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'finanzas.bancos.gestionar');
    SELECT * INTO v_bank FROM public.cuentas_bancarias
      WHERE tenant_id=p_tenant_id AND id=(p_payload->>'cuenta_bancaria_id')::uuid FOR UPDATE;
    IF NOT FOUND OR v_bank.moneda<>v_note.moneda THEN
      RAISE EXCEPTION 'SUPPLIER_CREDIT_REFUND_BANK_INVALID' USING ERRCODE='23514'; END IF;
    v_refund_rate:=CASE WHEN v_note.moneda=app.treasury_local_currency_452(p_tenant_id) THEN 1
      ELSE (p_payload->>'tipo_cambio')::numeric END;
    IF coalesce(v_refund_rate,0)<=0 THEN RAISE EXCEPTION 'SUPPLIER_CREDIT_REFUND_RATE_REQUIRED' USING ERRCODE='23514'; END IF;
    v_bank_result:=app.registrar_movimiento_bancario_tx_457(p_tenant_id,
      jsonb_build_object('cuenta_bancaria_id',v_bank.id,'cuenta_contrapartida_id',v_credit_account.id,
        'tipo','ABONO','monto',v_amount,'fecha',v_date,'descripcion','Reembolso de nota de crédito proveedor '||v_note.numero_documento,
        'referencia',p_payload->>'referencia','metodo_pago','TRANSFERENCIA','categoria','OTRO_INGRESO',
        'moneda',v_note.moneda,'tipo_cambio',v_refund_rate),p_actor_id,v_key||':bank');
    INSERT INTO public.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,payload,status,retry_count,idempotency_key,event_id,occurred_at)
    VALUES(p_tenant_id,'credito_proveedor',p_nota_credito_id::text,'credito.proveedor.reembolsado',
      jsonb_build_object('tenantId',p_tenant_id,'eventId',v_event,'fecha',v_date,'numeroDocumento',v_note.numero_documento,
        'notaCreditoId',v_note.id,'monto',v_amount,'tipoCambioCredito',v_credit_rate,'tipoCambioLiquidacion',v_refund_rate,
        'cuentaCreditoId',v_credit_account.id,'movimientoBancarioId',v_bank_result->>'movimiento_id'),
      'pending',0,'supplier-credit:refund:'||v_key,v_event,clock_timestamp());
  END IF;
  PERFORM set_config('app.supplier_credit_writer_570','on',true);
  UPDATE public.cuentas_por_pagar SET saldo_credito_proveedor=saldo_credito_proveedor-v_amount,updated_by=p_actor_id
    WHERE tenant_id=p_tenant_id AND id=v_note.id RETURNING * INTO v_note;
  INSERT INTO public.cxp_credito_proveedor_movimientos(tenant_id,nota_credito_id,factura_id,tipo,monto,
    saldo_anterior,saldo_nuevo,moneda,fecha,movimiento_bancario_id,event_id,actor_id,idempotency_key,metadata)
  VALUES(p_tenant_id,v_note.id,v_invoice.id,v_action,v_amount,v_note.saldo_credito_proveedor+v_amount,
    v_note.saldo_credito_proveedor,v_note.moneda,v_date,(v_bank_result->>'movimiento_id')::uuid,v_event,p_actor_id,v_key,
    jsonb_build_object('tipo_cambio_credito',v_credit_rate,'tipo_cambio_factura',v_target_rate,'tipo_cambio_liquidacion',v_refund_rate))
    RETURNING * INTO v_ledger;
  v_result:=jsonb_build_object('nota',to_jsonb(v_note),'movimiento_credito',to_jsonb(v_ledger),
    'movimiento_bancario',v_bank_result,'idempotent',false);
  INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
    VALUES(p_tenant_id,'SUPPLIER_CREDIT_USE',v_key,v_fingerprint,p_actor_id,v_note.id,v_result);
  PERFORM set_config('app.supplier_credit_writer_570','off',true);
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION app.guard_supplier_credit_570() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.registrar_nota_credito_proveedor_tx(uuid,uuid,uuid,jsonb,text),
  public.aplicar_credito_proveedor_tx(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_nota_credito_proveedor_tx(uuid,uuid,uuid,jsonb,text),
  public.aplicar_credito_proveedor_tx(uuid,uuid,uuid,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION app.is_accounting_owned_outbox_event_492(
  p_event_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT lower(COALESCE(btrim(p_event_type), '')) = ANY (ARRAY[
    'venta.procesada','ventafacturada','pos.venta.registrada','caja.cerrada',
    'caja.movimiento_manual.registrado','caja.retiro.registrado',
    'caja.cambio_turno.completado','banco.movimiento.registrado',
    'banco.transferencia.registrada','cobro.registrado','cobroregistrado',
    'cobro.revertido','cxc.ajuste.registrado','cxcajusteregistrado',
    'cxc.ajuste.revertido','cxp.ajuste.registrado','cxp.ajuste.revertido','nota_credito.emitida',
    'nota_debito.emitida','saldo_favor.aplicado','saldo_favor.reembolsado',
    'saldo_favor.reembolso_revertido','recepcion.registrada',
    'recepcionregistrada','factura.proveedor.registrada',
    'facturaproveedorregistrada','devolucion.proveedor.registrada','nota_credito.proveedor.registrada','credito.proveedor.aplicado','credito.proveedor.reembolsado',
    'devolucionproveedoremitida','cxc.creada','cuentaporcobrarcreada',
    'pago.proveedor.registrado','pagoproveedorregistrado',
    'ajuste.inventario.aplicado','ajusteinventarioaplicado',
    'planilla.liquidada','planillaliquidada','planilla.pagada','planillapagada',
    'liquidacion.aprobada','liquidacion.pagada','liquidacion.pago.revertido',
    'cts.depositado','depreciacion.generada','depreciaciongenerada',
    'cpe.anulado','cpeanulado','factura.emitida','facturaemitida',
    'producto.stock_bajo','producto.stock.bajo','productostockbajo',
    'stock.movimiento','stockmovimiento'
  ]::text[])
$function$;
CREATE OR REPLACE FUNCTION app.is_accounting_event_458(p_event_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT lower(COALESCE(btrim(p_event_type), '')) = ANY (ARRAY[
    'venta.procesada','ventafacturada','pos.venta.registrada','caja.cerrada',
    'caja.movimiento_manual.registrado','caja.retiro.registrado',
    'caja.cambio_turno.completado',
    'banco.movimiento.registrado','banco.transferencia.registrada',
    'cobro.registrado','cobroregistrado','cobro.revertido',
    'cxc.ajuste.registrado','cxcajusteregistrado','cxc.ajuste.revertido',
    'cxp.ajuste.registrado','cxp.ajuste.revertido','nota_credito.emitida','nota_debito.emitida',
    'saldo_favor.aplicado','saldo_favor.reembolsado',
    'saldo_favor.reembolso_revertido','recepcion.registrada',
    'recepcionregistrada','factura.proveedor.registrada',
    'facturaproveedorregistrada','devolucion.proveedor.registrada','nota_credito.proveedor.registrada','credito.proveedor.aplicado','credito.proveedor.reembolsado',
    'devolucionproveedoremitida','cxc.creada','cuentaporcobrarcreada',
    'pago.proveedor.registrado','pagoproveedorregistrado',
    'ajuste.inventario.aplicado','ajusteinventarioaplicado',
    'planilla.liquidada','planillaliquidada','planilla.pagada','planillapagada',
    'liquidacion.aprobada','liquidacion.pagada','liquidacion.pago.revertido',
    'cts.depositado','depreciacion.generada','depreciaciongenerada',
    'cpe.anulado','cpeanulado','factura.emitida','facturaemitida'
  ]::text[])
$function$;

-- Sólo se revierte una reclasificación aún no depositada: nunca simula
-- una devolución del Banco de la Nación ni cancela retenciones efectuadas.
CREATE OR REPLACE FUNCTION public.revertir_detraccion_proveedor_pendiente_tx(
  p_tenant_id uuid,p_actor_id uuid,p_operacion_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $fn$
DECLARE
  v_adjust public.operaciones_fiscales_financieras; v_invoice public.cuentas_por_pagar;
  v_operation public.financial_master_operations; v_payable public.plan_cuentas; v_detraction public.plan_cuentas;
  v_key text:=lower(btrim(coalesce(p_idempotency_key,''))); v_reason text:=nullif(btrim(p_payload->>'motivo'),'');
  v_date date:=(p_payload->>'fecha')::date; v_fingerprint text; v_new numeric; v_result jsonb; v_event uuid:=gen_random_uuid();
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'finanzas.cxp.gestionar');
  PERFORM set_config('app.current_tenant_id',p_tenant_id::text,true);
  IF p_operacion_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR length(v_key) NOT BETWEEN 8 AND 160 OR v_date IS NULL OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'SUPPLIER_DETRACTION_REVERSAL_PAYLOAD_INVALID' USING ERRCODE='22023'; END IF;
  v_fingerprint:=app.financial_master_fingerprint_477(jsonb_build_object('operacion_id',p_operacion_id,'fecha',v_date,'motivo',v_reason));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':supplier-detraction-reversal:'||v_key,570));
  SELECT * INTO v_operation FROM public.financial_master_operations WHERE tenant_id=p_tenant_id
    AND operation_type='SUPPLIER_DETRACTION_REVERSAL' AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operation.request_fingerprint<>v_fingerprint OR v_operation.actor_id<>p_actor_id THEN
      RAISE EXCEPTION 'SUPPLIER_DETRACTION_REVERSAL_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN v_operation.result||jsonb_build_object('idempotent',true);
  END IF;
  SELECT * INTO v_adjust FROM public.operaciones_fiscales_financieras WHERE tenant_id=p_tenant_id AND id=p_operacion_id FOR UPDATE;
  IF NOT FOUND OR v_adjust.origen<>'PROVEEDOR' OR v_adjust.tipo<>'DETRACCION' THEN
    RAISE EXCEPTION 'SUPPLIER_DETRACTION_REVERSAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_adjust.estado<>'PENDIENTE_TESORERIA' OR v_adjust.movimiento_bancario_id IS NOT NULL
    OR v_adjust.cuenta_bancaria_id IS NOT NULL OR v_date<v_adjust.fecha THEN
    RAISE EXCEPTION 'SUPPLIER_DETRACTION_ALREADY_SETTLED_OR_REVERSED' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_invoice FROM public.cuentas_por_pagar WHERE tenant_id=p_tenant_id AND id=v_adjust.cxp_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.proveedor_id<>v_adjust.proveedor_id OR v_invoice.moneda<>v_adjust.moneda
    OR v_invoice.estado='ANULADA' OR v_invoice.detraccion_total<v_adjust.monto
    OR coalesce(v_adjust.monto,0)<=0 OR coalesce(v_adjust.monto_contabilizado,0)<=0 THEN
    RAISE EXCEPTION 'SUPPLIER_DETRACTION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
  PERFORM app.ensure_accounting_period_open_458(p_tenant_id,v_date);
  SELECT * INTO v_payable FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='42';
  v_payable:=app.assert_postable_account_457(p_tenant_id,v_payable.id,'SUPPLIER_DETRACTION_PAYABLE');
  SELECT * INTO v_detraction FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='421';
  v_detraction:=app.assert_postable_account_457(p_tenant_id,v_detraction.id,'SUPPLIER_DETRACTION_PENDING');
  v_new:=v_invoice.saldo+v_adjust.monto;
  UPDATE public.cuentas_por_pagar SET saldo=v_new,saldo_pendiente=v_new,detraccion_total=detraccion_total-v_adjust.monto,
    estado=CASE WHEN v_new<total THEN 'PARCIAL' ELSE 'PENDIENTE' END,updated_by=p_actor_id,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('ultima_reversa_detraccion_id',v_adjust.id,'ultima_reversa_detraccion_key',v_key)
    WHERE tenant_id=p_tenant_id AND id=v_invoice.id RETURNING * INTO v_invoice;
  UPDATE public.operaciones_fiscales_financieras SET estado='ANULADO',
    metadata=coalesce(metadata,'{}')||jsonb_build_object('reversa_key',v_key,'reversa_motivo',v_reason,
      'reversa_event_id',v_event,'revertido_por',p_actor_id,'revertido_en',clock_timestamp()),updated_at=clock_timestamp()
    WHERE tenant_id=p_tenant_id AND id=v_adjust.id;
  INSERT INTO public.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,payload,status,retry_count,idempotency_key,event_id,occurred_at)
  VALUES(p_tenant_id,'ajuste_fiscal_proveedor',v_adjust.id::text,'cxp.ajuste.revertido',
    jsonb_build_object('tenantId',p_tenant_id,'eventId',v_event,'fecha',v_date,'numeroDocumento',v_invoice.numero_documento,
      'operacionId',v_adjust.id,'monto',v_adjust.monto_contabilizado,'cuentaProveedorId',v_payable.id,
      'cuentaDetraccionId',v_detraction.id,'motivo',v_reason),'pending',0,'supplier-detraction:reverse:'||v_key,v_event,clock_timestamp());
  v_result:=jsonb_build_object('cxp',to_jsonb(v_invoice),'operacion_id',v_adjust.id,'estado','ANULADO','event_id',v_event,'idempotent',false);
  INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
    VALUES(p_tenant_id,'SUPPLIER_DETRACTION_REVERSAL',v_key,v_fingerprint,p_actor_id,v_adjust.id,v_result);
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.revertir_detraccion_proveedor_pendiente_tx(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revertir_detraccion_proveedor_pendiente_tx(uuid,uuid,uuid,jsonb,text) TO service_role;

-- 13. Fuentes históricas de gratificación y crédito EPS: cálculo atómico
-- Atomic persistence of ordinary gratuity computation source, keeping495 lifecycle.
CREATE OR REPLACE FUNCTION public.guardar_calculo_planilla_gratificacion_tx_570(
  p_tenant_id uuid,p_planilla_id uuid,p_empleados jsonb,p_actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $grat570$
DECLARE v_planilla public.planillas%ROWTYPE;v_row jsonb;v_base jsonb;v_result jsonb;v_periodo_base text;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id,p_actor_id,'rrhh.planillas.calculate');
  IF COALESCE(jsonb_typeof(p_empleados),'null')<>'array' OR jsonb_array_length(p_empleados)=0 THEN
    RAISE EXCEPTION 'GRATIFICACION_EMPLOYEES_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('eps570:'||p_tenant_id::text,570));
  SELECT * INTO v_planilla FROM public.planillas WHERE tenant_id=p_tenant_id AND id=p_planilla_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRATIFICACION_PLANILLA_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_empleados) e WHERE e->'metadata' ? 'base_gratificacion_ordinaria') THEN
    IF NOT EXISTS(SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND upper(pais)='PE')
      OR right(v_planilla.periodo,2) NOT IN ('07','12') THEN
      RAISE EXCEPTION 'GRATIFICACION_PERIOD_INVALID' USING ERRCODE='22023'; END IF;
    v_periodo_base:=left(v_planilla.periodo,4)||CASE WHEN right(v_planilla.periodo,2)='07' THEN '-06' ELSE '-11' END;
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_empleados) LOOP
    v_base:=v_row->'metadata'->'base_gratificacion_ordinaria';
    IF v_base IS NULL THEN CONTINUE; END IF;
    IF COALESCE(jsonb_typeof(v_base),'null')<>'object' OR v_base->>'periodo' IS DISTINCT FROM v_periodo_base
      OR app.to_uuid_or_null(v_base->>'declarado_por') IS DISTINCT FROM p_actor_id
      OR COALESCE(jsonb_typeof(v_base->'monto'),'null')<>'number'
      OR COALESCE(v_base->>'monto','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
      OR (v_base->>'monto')::numeric<=0
      OR COALESCE(v_base->>'fuente','') NOT IN ('CONTRATO_HISTORICO','FUENTE_EXTERNA_DECLARADA') THEN
      RAISE EXCEPTION 'GRATIFICACION_SOURCE_INVALID' USING ERRCODE='22023'; END IF;
    IF v_base->>'fuente'='FUENTE_EXTERNA_DECLARADA' AND COALESCE(btrim(v_base->>'referencia'),'')='' THEN
      RAISE EXCEPTION 'GRATIFICACION_REFERENCE_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_base->>'fuente'='CONTRATO_HISTORICO' AND (
      COALESCE(jsonb_typeof(v_base->'sueldo_bruto'),'null')<>'number'
      OR COALESCE(jsonb_typeof(v_base->'asignacion_familiar'),'null')<>'number'
      OR (v_base->>'monto')::numeric IS DISTINCT FROM round((v_base->>'sueldo_bruto')::numeric+(v_base->>'asignacion_familiar')::numeric,2)
      OR (v_base->>'asignacion_familiar')::numeric<0
      OR NOT EXISTS(SELECT 1 FROM public.contratos c
      WHERE c.tenant_id=p_tenant_id AND c.id=app.to_uuid_or_null(v_base->>'contrato_id')
        AND c.empleado_id=app.to_uuid_or_null(v_row->>'empleado_id')
        AND c.fecha_inicio<=(v_periodo_base||'-30')::date
        AND (c.fecha_fin IS NULL OR c.fecha_fin>=(v_periodo_base||'-30')::date)
        AND c.sueldo_bruto IS NOT DISTINCT FROM (v_base->>'sueldo_bruto')::numeric
        AND lower(c.estado::text) NOT IN ('borrador','anulado','cancelado'))) THEN
      RAISE EXCEPTION 'GRATIFICACION_CONTRACT_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
  END LOOP;
  v_result:=public.guardar_calculo_planilla_tx(p_tenant_id,p_planilla_id,p_empleados,p_actor_id);
  UPDATE public.empleado_planilla ep SET metadata=COALESCE(ep.metadata,'{}'::jsonb)||COALESCE(e.value->'metadata','{}'::jsonb)
  FROM jsonb_array_elements(p_empleados) e WHERE ep.tenant_id=p_tenant_id AND ep.planilla_id=p_planilla_id
    AND ep.empleado_id=app.to_uuid_or_null(e.value->>'empleado_id');
  RETURN v_result;
END;
$grat570$;
REVOKE ALL ON FUNCTION public.guardar_calculo_planilla_gratificacion_tx_570(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_calculo_planilla_gratificacion_tx_570(uuid,uuid,jsonb,uuid) TO service_role;

-- Candidate for migration570; integrated by DB owner after local verification.
-- No migration or production execution is performed by this artifact.
CREATE OR REPLACE FUNCTION public.guardar_calculo_planilla_eps_tx_570(
  p_tenant_id uuid,p_planilla_id uuid,p_empleados jsonb,p_actor_id uuid,p_eps jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $eps570$
DECLARE
  v_result jsonb; v_planilla public.planillas%ROWTYPE;
  v_row jsonb; v_gross numeric:=0; v_net numeric:=0; v_credit numeric:=0;
  v_generated numeric; v_available numeric; v_source text; v_arrastre_source text; v_arrastre public.planillas%ROWTYPE;
  v_pending_carry uuid;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id,p_actor_id,'rrhh.planillas.calculate');
  IF COALESCE(jsonb_typeof(p_eps),'null')<>'object' OR COALESCE(jsonb_typeof(p_empleados),'null')<>'array'
     OR jsonb_array_length(p_empleados)=0
     OR app.to_uuid_or_null(p_eps->>'declarado_por') IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'EPS_SNAPSHOT_ACTOR_INVALID' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('eps570:'||p_tenant_id::text,570));
  SELECT * INTO v_planilla FROM public.planillas
  WHERE id=p_planilla_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EPS_PLANILLA_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND upper(pais)='PE')
     OR p_eps->>'periodo_aplicacion' IS DISTINCT FROM v_planilla.periodo
     OR p_eps->>'fuente' IS DISTINCT FROM 'FUENTE_EXTERNA_DECLARADA'
     OR COALESCE(btrim(p_eps->>'referencia'),'')=''
     OR COALESCE(p_eps->>'fecha_pago','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR COALESCE(p_eps->>'periodo_cobertura','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     OR p_eps->>'periodo_cobertura' > v_planilla.periodo
     OR COALESCE(jsonb_typeof(p_eps->'pago_oportuno'),'null')<>'boolean'
     OR (p_eps->>'fecha_pago')::date > (clock_timestamp() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'EPS_SOURCE_INVALID' USING ERRCODE='22023';
  END IF;
  IF to_char((p_eps->>'fecha_pago')::date,'YYYY-MM') < p_eps->>'periodo_cobertura'
     OR ((p_eps->>'pago_oportuno')::boolean=false AND to_char((p_eps->>'fecha_pago')::date,'YYYY-MM')<>v_planilla.periodo)
     OR ((p_eps->>'pago_oportuno')::boolean=true AND p_eps->>'periodo_cobertura'<>v_planilla.periodo) THEN
    RAISE EXCEPTION 'EPS_PAYMENT_PERIOD_INVALID' USING ERRCODE='22023';
  END IF;
  IF NOT (p_eps ?& ARRAY['monto_pagado','aporte_essalud_origen','trabajadores_cubiertos_origen',
      'uit_origen','credito_generado','credito_arrastre_declarado','credito_aplicado','credito_saldo',
      'aporte_essalud_bruto','aporte_essalud_neto','limite_25_por_ciento','limite_10_uit']) THEN
    RAISE EXCEPTION 'EPS_SNAPSHOT_INCOMPLETE' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(p_eps) j WHERE j.key=ANY(ARRAY[
      'monto_pagado','aporte_essalud_origen','uit_origen','credito_generado',
      'credito_arrastre_declarado','credito_aplicado','credito_saldo','aporte_essalud_bruto',
      'aporte_essalud_neto','limite_25_por_ciento','limite_10_uit'])
    AND (jsonb_typeof(j.value)<>'number' OR COALESCE(j.value#>>'{}','') !~ '^[0-9]+(\.[0-9]{1,2})?$'))
     OR COALESCE(p_eps->>'trabajadores_cubiertos_origen','') !~ '^(0|[1-9][0-9]*)$'
     OR (p_eps->>'uit_origen')::numeric <= 0 THEN
    RAISE EXCEPTION 'EPS_AMOUNT_INVALID' USING ERRCODE='22023';
  END IF;
  -- Sin cobertura ni pago actual sólo puede consumirse un saldo ERP real;
  -- el linaje y su importe se comprueban abajo bajo el mismo lock de tenant.
  IF (p_eps->>'trabajadores_cubiertos_origen')::numeric=0 AND (
      app.to_uuid_or_null(p_eps->>'planilla_arrastre_id') IS NULL
      OR (p_eps->>'credito_arrastre_declarado')::numeric<=0
      OR (p_eps->>'monto_pagado')::numeric<>0
      OR (p_eps->>'aporte_essalud_origen')::numeric<>0
      OR (p_eps->>'credito_generado')::numeric<>0
      OR (p_eps->>'limite_25_por_ciento')::numeric<>0
      OR (p_eps->>'limite_10_uit')::numeric<>0
      OR p_eps->>'periodo_cobertura' IS DISTINCT FROM v_planilla.periodo) THEN
    RAISE EXCEPTION 'EPS_ZERO_COVERAGE_REQUIRES_ERP_CARRY' USING ERRCODE='23514';
  END IF;
  v_generated:=LEAST(trunc((p_eps->>'aporte_essalud_origen')::numeric*0.25,2),
    (p_eps->>'monto_pagado')::numeric,
    trunc((p_eps->>'uit_origen')::numeric*0.10*(p_eps->>'trabajadores_cubiertos_origen')::integer,2));
  v_available:=v_generated+(p_eps->>'credito_arrastre_declarado')::numeric;
  IF v_generated IS DISTINCT FROM (p_eps->>'credito_generado')::numeric
     OR trunc((p_eps->>'aporte_essalud_origen')::numeric*0.25,2) IS DISTINCT FROM (p_eps->>'limite_25_por_ciento')::numeric
     OR trunc((p_eps->>'uit_origen')::numeric*0.10*(p_eps->>'trabajadores_cubiertos_origen')::integer,2) IS DISTINCT FROM (p_eps->>'limite_10_uit')::numeric
     OR LEAST(v_available,(p_eps->>'aporte_essalud_bruto')::numeric) IS DISTINCT FROM (p_eps->>'credito_aplicado')::numeric
     OR v_available-(p_eps->>'credito_aplicado')::numeric IS DISTINCT FROM (p_eps->>'credito_saldo')::numeric
     OR (p_eps->>'credito_arrastre_declarado')::numeric>0 AND COALESCE(btrim(p_eps->>'referencia_arrastre'),'')='' THEN
    RAISE EXCEPTION 'EPS_CREDIT_LIMIT_INVALID' USING ERRCODE='23514';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_empleados) LOOP
    IF v_row->'metadata'->'eps_cobertura_snapshot' IS DISTINCT FROM p_eps
       OR COALESCE(jsonb_typeof(v_row->'metadata'->'essalud'),'null')<>'object'
       OR NOT(v_row->'metadata'->'essalud' ?& ARRAY['bruto','credito_eps','neto'])
       OR EXISTS(SELECT 1 FROM jsonb_each(v_row->'metadata'->'essalud') j
          WHERE j.key=ANY(ARRAY['bruto','credito_eps','neto']) AND
            (jsonb_typeof(j.value)<>'number' OR COALESCE(j.value#>>'{}','') !~ '^[0-9]+(\.[0-9]{1,2})?$')) THEN
      RAISE EXCEPTION 'EPS_EMPLOYEE_SNAPSHOT_INVALID' USING ERRCODE='22023';
    END IF;
    IF (v_row->'metadata'->'essalud'->>'bruto')::numeric < 0
       OR (v_row->'metadata'->'essalud'->>'credito_eps')::numeric < 0
       OR (v_row->'metadata'->'essalud'->>'neto')::numeric < 0
       OR (v_row->'metadata'->'essalud'->>'bruto')::numeric-(v_row->'metadata'->'essalud'->>'credito_eps')::numeric
          IS DISTINCT FROM (v_row->'metadata'->'essalud'->>'neto')::numeric
       OR (SELECT COALESCE(sum((c->>'monto')::numeric),0)
           FROM jsonb_array_elements(v_row->'conceptos') c
           JOIN public.conceptos_planilla cp ON cp.id=app.to_uuid_or_null(c->>'concepto_id')
           AND cp.tenant_id=p_tenant_id AND cp.codigo='201')
          IS DISTINCT FROM (v_row->'metadata'->'essalud'->>'neto')::numeric THEN
      RAISE EXCEPTION 'EPS_EMPLOYEE_NET_INVALID' USING ERRCODE='23514';
    END IF;
    v_gross:=v_gross+(v_row->'metadata'->'essalud'->>'bruto')::numeric;
    v_net:=v_net+(v_row->'metadata'->'essalud'->>'neto')::numeric;
    v_credit:=v_credit+(v_row->'metadata'->'essalud'->>'credito_eps')::numeric;
  END LOOP;
  IF v_gross IS DISTINCT FROM (p_eps->>'aporte_essalud_bruto')::numeric
     OR v_net IS DISTINCT FROM (p_eps->>'aporte_essalud_neto')::numeric
     OR v_credit IS DISTINCT FROM (p_eps->>'credito_aplicado')::numeric THEN
    RAISE EXCEPTION 'EPS_HEADER_TOTAL_INVALID' USING ERRCODE='23514';
  END IF;
  v_source:=app.fingerprint_rrhh_495(jsonb_build_object('periodo',p_eps->'periodo_cobertura',
    'fecha_pago',p_eps->'fecha_pago','referencia',upper(btrim(p_eps->>'referencia'))));
  IF v_generated>0 AND EXISTS(SELECT 1 FROM public.planillas p
    WHERE p.tenant_id=p_tenant_id AND p.id<>p_planilla_id AND lower(p.estado::text)<>'anulada'
      AND p.metadata->>'eps_source_fingerprint'=v_source) THEN
    RAISE EXCEPTION 'EPS_SOURCE_ALREADY_APPLIED' USING ERRCODE='23514';
  END IF;
  SELECT p.id INTO v_pending_carry FROM public.planillas p
    WHERE p.tenant_id=p_tenant_id AND p.periodo<v_planilla.periodo AND lower(p.estado::text)<>'anulada'
      AND COALESCE((p.metadata->'eps_cobertura'->>'credito_saldo')::numeric,0)>0
      AND NOT EXISTS(SELECT 1 FROM public.planillas consumed
        WHERE consumed.tenant_id=p_tenant_id AND consumed.id<>p_planilla_id AND lower(consumed.estado::text)<>'anulada'
          AND consumed.metadata->'eps_cobertura'->>'planilla_arrastre_id'=p.id::text)
    ORDER BY p.periodo,p.id LIMIT 1;
  IF v_pending_carry IS NOT NULL AND v_pending_carry IS DISTINCT FROM app.to_uuid_or_null(p_eps->>'planilla_arrastre_id') THEN
    RAISE EXCEPTION 'Existe saldo EPS previo disponible: seleccione la planilla origen para aplicarlo' USING ERRCODE='23514';
  END IF;
  IF (p_eps->>'credito_arrastre_declarado')::numeric>0 THEN
    IF app.to_uuid_or_null(p_eps->>'planilla_arrastre_id') IS NOT NULL THEN
      SELECT * INTO v_arrastre FROM public.planillas WHERE tenant_id=p_tenant_id
        AND id=app.to_uuid_or_null(p_eps->>'planilla_arrastre_id') FOR UPDATE;
      IF NOT FOUND OR v_arrastre.periodo>=v_planilla.periodo OR lower(v_arrastre.estado::text)='anulada'
         OR (v_arrastre.metadata->'eps_cobertura'->>'credito_saldo')::numeric
              IS DISTINCT FROM (p_eps->>'credito_arrastre_declarado')::numeric THEN
        RAISE EXCEPTION 'EPS_CARRY_SOURCE_INVALID' USING ERRCODE='23514';
      END IF;
      IF EXISTS(SELECT 1 FROM public.planillas p WHERE p.tenant_id=p_tenant_id AND p.id<>p_planilla_id
        AND lower(p.estado::text)<>'anulada' AND p.metadata->'eps_cobertura'->>'planilla_arrastre_id'=v_arrastre.id::text) THEN
        RAISE EXCEPTION 'EPS_CARRY_ALREADY_APPLIED' USING ERRCODE='23514';
      END IF;
    ELSE
      v_arrastre_source:=app.fingerprint_rrhh_495(jsonb_build_object('referencia',upper(btrim(p_eps->>'referencia_arrastre'))));
      IF EXISTS(SELECT 1 FROM public.planillas p WHERE p.tenant_id=p_tenant_id AND p.id<>p_planilla_id
        AND lower(p.estado::text)<>'anulada' AND p.metadata->>'eps_external_carry_fingerprint'=v_arrastre_source) THEN
        RAISE EXCEPTION 'EPS_EXTERNAL_CARRY_ALREADY_APPLIED' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  v_result:=public.guardar_calculo_planilla_gratificacion_tx_570(p_tenant_id,p_planilla_id,p_empleados,p_actor_id);
  UPDATE public.planillas SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object(
    'eps_cobertura',p_eps,'eps_source_fingerprint',v_source,
    'eps_external_carry_fingerprint',v_arrastre_source),updated_at=now()
  WHERE tenant_id=p_tenant_id AND id=p_planilla_id;
  UPDATE public.empleado_planilla ep SET metadata=COALESCE(ep.metadata,'{}'::jsonb)||(j.value->'metadata')
  FROM jsonb_array_elements(p_empleados) j
  WHERE ep.tenant_id=p_tenant_id AND ep.planilla_id=p_planilla_id
    AND ep.empleado_id=app.to_uuid_or_null(j.value->>'empleado_id');
  RETURN v_result||jsonb_build_object('eps_cobertura',p_eps);
END;
$eps570$;
REVOKE ALL ON FUNCTION public.guardar_calculo_planilla_eps_tx_570(uuid,uuid,jsonb,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_calculo_planilla_eps_tx_570(uuid,uuid,jsonb,uuid,jsonb) TO service_role;

-- 14. Cierre con saldo físico
-- Cierre con saldo físico; el redondeo documentado no es otro faltante.
DO $cash_close_physical$
DECLARE v_def text; v_from text; v_to text;
BEGIN
 v_def:=replace(pg_get_functiondef('app.cerrar_caja_tx_518(uuid,uuid,uuid,jsonb)'::regprocedure),chr(13),'');
 v_def:=replace(v_def,'  v_esperado numeric;','  v_esperado numeric;'||chr(10)||'  v_esperado_nominal numeric; v_diferencia_nominal numeric;');
 v_from:='  v_redondeo_legal := app.es_redondeo_efectivo_legal_518('||chr(10)||'    v_diferencia, v_pais, v_moneda, v_redondeo_documentado'||chr(10)||'  );';
 v_to:='  v_esperado_nominal:=v_esperado; v_diferencia_nominal:=v_diferencia;'||chr(10)
 ||'  IF v_pais IN (''PE'',''PER'') AND v_moneda=''PEN'' THEN'||chr(10)
 ||'    v_esperado:=round(v_esperado_nominal-v_redondeo_documentado,2);'||chr(10)
 ||'    v_diferencia:=round(v_contado-v_esperado,2);'||chr(10)||'  END IF;'||chr(10)
 ||'  v_redondeo_legal := app.es_redondeo_efectivo_legal_518('||chr(10)||'    v_diferencia_nominal, v_pais, v_moneda, v_redondeo_documentado'||chr(10)||'  );';
 IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_CASH_CLOSE_SOURCE_CHANGED'; END IF;
 v_def:=replace(v_def,v_from,v_to);
 v_def:=replace(v_def,'v_diferencia, v_tolerancia, v_pais, v_moneda, v_redondeo_documentado','v_diferencia, v_tolerancia, v_pais, v_moneda, 0');
 v_def:=replace(v_def,'WHEN abs(v_diferencia) <= 0.009 THEN ''CUADRADO'''||chr(10)||'    WHEN v_redondeo_legal THEN ''REDONDEO_EFECTIVO_LEGAL''','WHEN v_redondeo_legal THEN ''REDONDEO_EFECTIVO_LEGAL'''||chr(10)||'    WHEN abs(v_diferencia) <= 0.009 THEN ''CUADRADO''');
 v_def:=replace(v_def,'''montoEsperado'', v_esperado, ''montoContado'', v_contado,','''montoEsperado'', v_esperado, ''montoContado'', v_contado,'||chr(10)
 ||'      ''montoEsperadoNominal'',v_esperado_nominal,''montoEsperadoFisico'',v_esperado,'||chr(10)
 ||'      ''diferenciaNominal'',v_diferencia_nominal,''diferenciaOperativa'',v_diferencia,');
 v_def:=replace(v_def,'''monto_esperado'', v_esperado, ''monto_contado'', v_contado,','''monto_esperado'', v_esperado, ''monto_contado'', v_contado,'||chr(10)
 ||'    ''monto_esperado_nominal'',v_esperado_nominal,''monto_esperado_fisico'',v_esperado,'||chr(10)
 ||'    ''diferencia_nominal'',v_diferencia_nominal,''diferencia_operativa'',v_diferencia,');
 v_def:=replace(v_def,'''schemaVersion'', 518','''schemaVersion'', 570');
 EXECUTE v_def;
END $cash_close_physical$;

-- 15. CPE PE directo al contado: deuda visible hasta su cobro real.
-- La forma fiscal CONTADO no constituye un movimiento de tesorería. Con un
-- cliente maestro se crea CxC en el commit original; un receptor manual puede
-- vincularse después sin reemitir el CPE ni repetir su asiento de venta.
DO $direct_receivable$
DECLARE v_def text; v_from text; v_to text;
BEGIN
 v_def:=replace(pg_get_functiondef('public.emitir_cpe_directo_peru_tx(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text)'::regprocedure),chr(13),'');
 v_from:=' v_result:=public.emitir_factura_cliente_tx';
 v_to:=' IF v_existing.id IS NOT NULL AND v_existing.documento_id IS NOT NULL'
  ||' AND EXISTS(SELECT 1 FROM public.documentos WHERE tenant_id=p_tenant_id AND id=v_existing.documento_id)'
  ||' AND (SELECT count(*) FROM public.documento_detalles WHERE tenant_id=p_tenant_id AND documento_id=v_existing.documento_id)=jsonb_array_length(v_existing.items)'
  ||' AND EXISTS(SELECT 1 FROM public.outbox_events WHERE tenant_id=p_tenant_id AND event_type=''factura.emitida'' AND event_id=v_existing.event_id AND aggregate_id=v_existing.documento_id::text) THEN'
  ||chr(10)||'  RETURN jsonb_build_object(''cpe'',to_jsonb(v_existing),''cpe_id'',v_existing.id,''documento_id'',v_existing.documento_id,'
  ||'''cxc_id'',(SELECT id FROM public.cuentas_por_cobrar WHERE tenant_id=p_tenant_id AND documento_id=v_existing.documento_id),'
  ||'''factura_event_id'',v_existing.event_id,''idempotent'',true);'
  ||chr(10)||' END IF;'||chr(10)||v_from;
 IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_CPE_REPLAY_SOURCE_CHANGED';END IF;
 v_def:=replace(v_def,v_from,v_to);
 v_from:=' IF NOT EXISTS(SELECT 1 FROM public.cpe WHERE tenant_id=p_tenant_id AND id=(v_result->>''cpe_id'')::uuid';
 v_to:=' IF p_cxc IS NOT NULL AND NOT coalesce((v_result->>''idempotent'')::boolean,false) AND NOT EXISTS('
  ||'SELECT 1 FROM public.clientes c WHERE c.tenant_id=p_tenant_id AND c.id=(p_cxc->>''cliente_id'')::uuid AND coalesce(c.activo,true) '
  ||'AND btrim(coalesce(nullif(c.documento_identidad,''''),nullif(c.ruc,''''),c.documento_numero::text,c.numero_documento::text,''''))=btrim(p_cpe->>''documento_receptor'')) THEN'
  ||chr(10)||'  RAISE EXCEPTION ''CPE_RECEIVABLE_RECEIVER_MISMATCH'' USING ERRCODE=''23514'';'||chr(10)||' END IF;'||chr(10)
  ||' IF upper(p_cpe->>''condicion_pago'')=''CONTADO'' AND ((p_cpe->>''fecha_vencimiento'')::date IS DISTINCT FROM (p_cpe->>''fecha_emision'')::date OR coalesce((p_cpe->>''plazo_pago_dias'')::integer,0)<>0) THEN'
  ||chr(10)||'  RAISE EXCEPTION ''CPE_CONTADO_PAYMENT_TERM_INVALID'' USING ERRCODE=''23514'';'||chr(10)||' END IF;'||chr(10)
  ||' IF p_cxc IS NOT NULL AND upper(p_cpe->>''condicion_pago'')=''CONTADO'' AND NOT coalesce((v_result->>''idempotent'')::boolean,false) THEN'
  ||chr(10)||'  UPDATE public.documentos SET metodo_pago=''CONTADO'' WHERE tenant_id=p_tenant_id AND id=(v_result->>''documento_id'')::uuid;'
  ||chr(10)||' END IF;'||chr(10)||v_from;
 IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_CPE_DIRECT_SOURCE_CHANGED';END IF;
 EXECUTE replace(v_def,v_from,v_to);
END $direct_receivable$;

CREATE OR REPLACE FUNCTION public.vincular_cxc_cpe_contado_tx_570(
 p_tenant_id uuid,p_actor_id uuid,p_cpe_id uuid,p_cliente_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $link570$
DECLARE v_cpe public.cpe%ROWTYPE;v_doc public.documentos%ROWTYPE;v_cliente public.clientes%ROWTYPE;
 v_cxc public.cuentas_por_cobrar%ROWTYPE;v_key text:=lower(btrim(coalesce(p_idempotency_key,'')));v_super boolean;v_total numeric;v_rate numeric;
BEGIN
 PERFORM app.assert_actor_461(p_tenant_id,p_actor_id);
 SELECT coalesce(is_super_admin,false) INTO v_super FROM public.usuarios_sistema WHERE id=p_actor_id;
 IF NOT coalesce(v_super,false) AND NOT EXISTS(
  SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id AND r.tenant_id=p_tenant_id AND coalesce(r.activo,true)
  JOIN public.rol_permisos rp ON rp.role_id=r.id AND rp.concedido
  JOIN public.permisos p ON p.id=rp.permiso_id AND p.tenant_id=p_tenant_id AND coalesce(p.activo,true)
  WHERE ur.tenant_id=p_tenant_id AND ur.usuario_sistema_id=p_actor_id AND p.codigo='finanzas.cxc.cobros.write'
 ) THEN RAISE EXCEPTION 'CPE_RECEIVABLE_PERMISSION_REQUIRED' USING ERRCODE='42501';END IF;
 IF length(v_key) NOT BETWEEN 8 AND 160 OR NOT EXISTS(SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND pais='PE') THEN
  RAISE EXCEPTION 'CPE_RECEIVABLE_LINK_INVALID' USING ERRCODE='22023';END IF;
 PERFORM set_config('app.current_tenant_id',p_tenant_id::text,true);
 SELECT * INTO v_cpe FROM public.cpe WHERE tenant_id=p_tenant_id AND id=p_cpe_id FOR UPDATE;
 IF NOT FOUND OR v_cpe.tipo_documento NOT IN('01','03') OR v_cpe.estado NOT IN('FIRMADO','ENVIADO','ACEPTADO')
  OR v_cpe.metadata->>'pe_direct_request_fingerprint' IS NULL THEN
  RAISE EXCEPTION 'CPE_RECEIVABLE_SOURCE_NOT_FOUND' USING ERRCODE='P0002';END IF;
 SELECT * INTO v_doc FROM public.documentos WHERE tenant_id=p_tenant_id AND id=v_cpe.documento_id FOR UPDATE;
 IF NOT FOUND OR v_doc.pedido_id IS NOT NULL
  OR upper(v_doc.metodo_pago)<>'CONTADO' THEN
  RAISE EXCEPTION 'CPE_RECEIVABLE_SOURCE_INVALID' USING ERRCODE='23514';END IF;
 SELECT * INTO v_cliente FROM public.clientes WHERE tenant_id=p_tenant_id AND id=p_cliente_id AND coalesce(activo,true) FOR SHARE;
 IF NOT FOUND OR btrim(coalesce(nullif(v_cliente.documento_identidad,''),nullif(v_cliente.ruc,''),v_cliente.documento_numero::text,v_cliente.numero_documento::text,'')) IS DISTINCT FROM btrim(v_cpe.documento_receptor)
  OR upper(coalesce(v_cliente.documento_tipo,'')) IS DISTINCT FROM (CASE v_cpe.tipo_documento_receptor WHEN '6' THEN 'RUC' WHEN '1' THEN 'DNI' WHEN '4' THEN 'CE' WHEN '7' THEN 'PASAPORTE' ELSE upper(v_cpe.tipo_documento_receptor) END) THEN
  RAISE EXCEPTION 'CPE_RECEIVABLE_RECEIVER_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT * INTO v_cxc FROM public.cuentas_por_cobrar WHERE tenant_id=p_tenant_id AND documento_id=v_doc.id FOR UPDATE;
 IF FOUND THEN
  IF v_cxc.cliente_id IS DISTINCT FROM p_cliente_id OR v_cxc.metadata->>'link_intent_570' IS DISTINCT FROM v_key
   OR v_cxc.metadata->>'link_actor_570' IS DISTINCT FROM p_actor_id::text THEN
   RAISE EXCEPTION 'CPE_RECEIVABLE_LINK_CONFLICT' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('cxc_id',v_cxc.id,'idempotent',true);
 END IF;
 v_total:=round(v_cpe.total_venta,2);v_rate:=coalesce(v_doc.tipo_cambio,1);
 IF v_total<=0 OR v_rate<=0 OR EXISTS(SELECT 1 FROM public.cpe WHERE tenant_id=p_tenant_id AND documento_referencia_id=v_doc.id AND estado<>'ANULADO')
  OR NOT EXISTS(SELECT 1 FROM public.asientos_contables a JOIN public.detalle_asientos d ON d.asiento_id=a.id JOIN public.plan_cuentas p ON p.id=d.cuenta_id AND p.tenant_id=a.tenant_id
   WHERE a.tenant_id=p_tenant_id AND a.source_event_id=v_cpe.event_id AND a.estado='CONFIRMADO' AND p.codigo='12' AND abs(d.debe-round(v_total*v_rate,2))<=0.01 AND d.haber=0) THEN
  RAISE EXCEPTION 'CPE_RECEIVABLE_ORIGINAL_LEDGER_REQUIRED' USING ERRCODE='23514';END IF;
 INSERT INTO public.cuentas_por_cobrar(
  tenant_id,cliente_id,documento_id,serie,numero,numero_documento,tipo_documento,
  fecha_emision,fecha_vencimiento,moneda,tipo_cambio_origen,monto_total,monto_original,total,
  monto_pendiente,saldo,saldo_pendiente,estado,dias_mora,retencion_total,percepcion_total,detraccion_total,anticipo_total,
  event_id,idempotency_key,event_source,activo,metadata
 ) VALUES(p_tenant_id,p_cliente_id,v_doc.id,v_cpe.serie,v_cpe.numero,v_cpe.serie||'-'||v_cpe.numero,v_cpe.tipo_documento,
  v_doc.fecha_emision::date,v_doc.fecha_emision::date,v_cpe.moneda,v_rate,v_total,v_total,v_total,
  v_total,v_total,v_total,'PENDIENTE',0,0,0,0,0,v_cpe.event_id,'cpe-link-570:'||p_cpe_id::text,'cpe.link.570',true,
  jsonb_build_object('cpe_id',p_cpe_id,'link_intent_570',v_key,'link_actor_570',p_actor_id,'linked_at',clock_timestamp(),'condicion_pago','CONTADO')) RETURNING * INTO v_cxc;
 RETURN jsonb_build_object('cxc_id',v_cxc.id,'idempotent',false);
END;
$link570$;
REVOKE ALL ON FUNCTION public.vincular_cxc_cpe_contado_tx_570(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_cxc_cpe_contado_tx_570(uuid,uuid,uuid,uuid,text) TO service_role;

-- 16. Cantidades físicas y costo cero confirmado.
-- Cantidades físicas: contrato de seis decimales, independiente de importes.
-- Ejecutar dentro de una transacción después de la sección de costo 570 y
-- antes del verificador cero. No contiene semillas ni actualiza valores.
-- Tablas: productos.{stock,stock_actual,stock_reservado,stock_minimo};
-- producto_existencias.{stock_actual,stock_reservado,stock_danado,stock_minimo};
-- movimientos_inventario.cantidad. Todas numeric(14,2) -> numeric(18,6).
-- Vistas: stock_por_sucursal (definición intacta), vista_pos_productos y
-- vw_kardex_valorizado (sólo casts de cantidades). Los importes siguen a 2.
DO $inventory_quantity_precision$
DECLARE
  v_item record; v_view record; v_acl record; v_column record; v_trigger record;
  v_views jsonb := '[]'::jsonb; v_before jsonb; v_after jsonb;
  v_triggers jsonb := '[]'::jsonb;
  v_def text; v_old text; v_new text; v_count integer;
BEGIN
  LOCK TABLE public.productos, public.producto_existencias,
    public.movimientos_inventario IN ACCESS EXCLUSIVE MODE;

  FOR v_item IN SELECT * FROM (VALUES
    ('productos','stock'),('productos','stock_actual'),
    ('productos','stock_reservado'),('productos','stock_minimo'),
    ('producto_existencias','stock_actual'),('producto_existencias','stock_reservado'),
    ('producto_existencias','stock_danado'),('producto_existencias','stock_minimo'),
    ('movimientos_inventario','cantidad')
  ) AS t(table_name,column_name) LOOP
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=v_item.table_name
        AND c.column_name=v_item.column_name AND c.data_type='numeric'
        AND c.numeric_precision=14 AND c.numeric_scale=2) THEN
      RAISE EXCEPTION 'MIGRATION_570_QUANTITY_SOURCE_CHANGED: %.%',
        v_item.table_name,v_item.column_name;
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
    'productos',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.productos p),
    'existencias',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.producto_existencias p),
    'movimientos',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.movimientos_inventario p)
  ) INTO v_before;

  -- PostgreSQL también protege las columnas listadas en UPDATE OF. Se
  -- reconstruyen sólo estas cuatro dependencias, conservando definición,
  -- enabled, comentario y propietarios de tabla/función. Ninguna fila se
  -- escribe mientras los triggers están ausentes.
  FOR v_trigger IN
    SELECT DISTINCT t.oid,t.tgname,t.tgenabled,t.tgisinternal,c.relname,
      c.relowner AS table_owner,p.proowner AS function_owner,
      pg_get_triggerdef(t.oid,false) AS definition,
      obj_description(t.oid,'pg_trigger') AS description
    FROM pg_depend d JOIN pg_trigger t ON t.oid=d.objid AND d.classid='pg_trigger'::regclass
    JOIN pg_class c ON c.oid=d.refobjid
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid
    JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE c.oid IN ('public.productos'::regclass,'public.producto_existencias'::regclass,'public.movimientos_inventario'::regclass)
      AND a.attname IN ('stock','stock_actual','stock_reservado','stock_minimo','stock_danado','cantidad')
    ORDER BY c.relname,t.tgname
  LOOP
    IF v_trigger.tgisinternal OR (v_trigger.relname,v_trigger.tgname) NOT IN (
      ('productos','trg_enforce_product_stock_is_derived_350'),
      ('producto_existencias','trg_guard_active_inventory_location_460'),
      ('producto_existencias','trg_sync_producto_stock_sucursal_from_existence_351'),
      ('movimientos_inventario','trg_freeze_inventory_valuation_470')
    ) THEN RAISE EXCEPTION 'MIGRATION_570_QUANTITY_TRIGGER_SOURCE_CHANGED: %.%',v_trigger.relname,v_trigger.tgname; END IF;
    v_triggers:=v_triggers||jsonb_build_array(jsonb_build_object(
      'table',v_trigger.relname,'name',v_trigger.tgname,'definition',v_trigger.definition,
      'enabled',v_trigger.tgenabled,'tableOwner',v_trigger.table_owner,
      'functionOwner',v_trigger.function_owner,'description',v_trigger.description));
  END LOOP;
  IF jsonb_array_length(v_triggers)<>4 THEN RAISE EXCEPTION 'MIGRATION_570_QUANTITY_EXPECTED_TRIGGERS_MISSING'; END IF;

  FOR v_view IN
    SELECT c.oid,c.relname,c.reloptions,c.relacl,c.relowner,
      pg_get_userbyid(c.relowner) AS owner_name,
      pg_get_viewdef(c.oid,true) AS definition,
      obj_description(c.oid,'pg_class') AS description
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='v'
      AND c.relname IN ('stock_por_sucursal','vista_pos_productos','vw_kardex_valorizado')
    ORDER BY c.relname
  LOOP
    IF v_view.owner_name<>current_user OR v_view.reloptions IS DISTINCT FROM ARRAY['security_invoker=true']::text[]
      OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_view.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL)
      OR EXISTS(SELECT 1 FROM pg_seclabel s WHERE s.objoid=v_view.oid) THEN
      RAISE EXCEPTION 'MIGRATION_570_QUANTITY_VIEW_SECURITY_CHANGED: %',v_view.relname;
    END IF;
    v_def:=v_view.definition;
    IF v_view.relname='vista_pos_productos' THEN
      FOREACH v_old IN ARRAY ARRAY[
        '::numeric(14,2) AS stock_actual_num',
        '::numeric(14,2) AS stock_reservado_num',
        '::numeric(14,2) AS stock_minimo_num',
        'NULL::numeric(14,2)'
      ] LOOP
        v_new:=replace(v_old,'numeric(14,2)','numeric(18,6)');
        v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
        IF v_count<>1 THEN RAISE EXCEPTION 'MIGRATION_570_QUANTITY_POS_VIEW_SOURCE_CHANGED: %',v_old; END IF;
        v_def:=replace(v_def,v_old,v_new);
      END LOOP;
    ELSIF v_view.relname='vw_kardex_valorizado' THEN
      FOREACH v_old IN ARRAY ARRAY[
        '::numeric(14,2) AS cantidad_recibida',
        '::numeric(14,2) AS cantidad_movimiento',
        '::numeric(14,2) AS cantidad_firmada'
      ] LOOP
        v_new:=replace(v_old,'numeric(14,2)','numeric(18,6)');
        v_count:=(length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
        IF v_count<>1 THEN RAISE EXCEPTION 'MIGRATION_570_QUANTITY_KARDEX_VIEW_SOURCE_CHANGED: %',v_old; END IF;
        v_def:=replace(v_def,v_old,v_new);
      END LOOP;
    END IF;
    v_views:=v_views||jsonb_build_array(jsonb_build_object(
      'name',v_view.relname,'definition',v_def,'owner',v_view.owner_name,
      'acl',CASE WHEN v_view.relacl IS NULL THEN NULL ELSE to_jsonb(v_view.relacl::text[]) END,
      'aclSemantic',(SELECT coalesce(jsonb_agg(jsonb_build_object('grantor',a.grantor,'grantee',a.grantee,'privilege',a.privilege_type,'grantable',a.is_grantable)
          ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]')
        FROM aclexplode(coalesce(v_view.relacl,acldefault('r',v_view.relowner))) a),
      'description',v_view.description,
      'columnComments',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'description',col_description(v_view.oid,a.attnum))),'[]')
        FROM pg_attribute a WHERE a.attrelid=v_view.oid AND a.attnum>0 AND NOT a.attisdropped AND col_description(v_view.oid,a.attnum) IS NOT NULL)
    ));
  END LOOP;
  IF jsonb_array_length(v_views)<>3 THEN RAISE EXCEPTION 'MIGRATION_570_QUANTITY_EXPECTED_VIEWS_MISSING'; END IF;

  -- Sin CASCADE: cualquier dependencia nueva aborta toda la transacción.
  DROP VIEW public.vw_kardex_valorizado, public.vista_pos_productos, public.stock_por_sucursal;
  FOR v_trigger IN SELECT * FROM jsonb_to_recordset(v_triggers) AS t("table" text,name text) LOOP
    EXECUTE format('DROP TRIGGER %I ON public.%I',v_trigger.name,v_trigger."table");
  END LOOP;
  FOR v_item IN SELECT * FROM (VALUES
    ('productos','stock'),('productos','stock_actual'),
    ('productos','stock_reservado'),('productos','stock_minimo'),
    ('producto_existencias','stock_actual'),('producto_existencias','stock_reservado'),
    ('producto_existencias','stock_danado'),('producto_existencias','stock_minimo'),
    ('movimientos_inventario','cantidad')
  ) AS t(table_name,column_name) LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(18,6)',v_item.table_name,v_item.column_name);
  END LOOP;
  FOR v_trigger IN SELECT * FROM jsonb_to_recordset(v_triggers)
    AS t("table" text,name text,definition text,enabled text,description text,"tableOwner" oid,"functionOwner" oid)
  LOOP
    EXECUTE v_trigger.definition;
    EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I',v_trigger."table",
      CASE v_trigger.enabled WHEN 'D' THEN 'DISABLE' WHEN 'R' THEN 'ENABLE REPLICA' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'O' THEN 'ENABLE' END,v_trigger.name);
    IF v_trigger.description IS NOT NULL THEN
      EXECUTE format('COMMENT ON TRIGGER %I ON public.%I IS %L',v_trigger.name,v_trigger."table",v_trigger.description);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE c.oid=to_regclass(format('public.%I',v_trigger."table")) AND t.tgname=v_trigger.name
        AND t.tgenabled::text=v_trigger.enabled AND pg_get_triggerdef(t.oid,false)=v_trigger.definition
        AND c.relowner=v_trigger."tableOwner" AND p.proowner=v_trigger."functionOwner") THEN
      RAISE EXCEPTION 'MIGRATION_570_QUANTITY_TRIGGER_RESTORE_MISMATCH: %.%',v_trigger."table",v_trigger.name;
    END IF;
  END LOOP;
  FOR v_view IN SELECT * FROM jsonb_to_recordset(v_views)
    AS t(name text,definition text,owner text,acl jsonb,description text,"columnComments" jsonb,"aclSemantic" jsonb)
  LOOP
    EXECUTE format('CREATE VIEW public.%I WITH (security_invoker=true) AS %s',v_view.name,v_view.definition);
    EXECUTE format('ALTER VIEW public.%I OWNER TO %I',v_view.name,v_view.owner);
    -- CREATE VIEW consume los defaults reales de Supabase. Se revocan sólo los
    -- privilegios adicionales de esta vista; los defaults de la base no cambian.
    FOR v_acl IN
      SELECT a.* FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=to_regclass(format('public.%I',v_view.name))
    LOOP
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_view."aclSemantic") expected
        WHERE (expected->>'grantor')::oid=v_acl.grantor AND (expected->>'grantee')::oid=v_acl.grantee
          AND expected->>'privilege'=v_acl.privilege_type) THEN
        EXECUTE format('REVOKE %s ON TABLE public.%I FROM %s',v_acl.privilege_type,v_view.name,
          CASE WHEN v_acl.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_acl.grantee)) END);
      ELSIF v_acl.is_grantable AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_view."aclSemantic") expected
        WHERE (expected->>'grantor')::oid=v_acl.grantor AND (expected->>'grantee')::oid=v_acl.grantee
          AND expected->>'privilege'=v_acl.privilege_type AND (expected->>'grantable')::boolean) THEN
        EXECUTE format('REVOKE GRANT OPTION FOR %s ON TABLE public.%I FROM %s',v_acl.privilege_type,v_view.name,
          CASE WHEN v_acl.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_acl.grantee)) END);
      END IF;
    END LOOP;
    IF v_view.acl IS NOT NULL THEN
      FOR v_acl IN SELECT * FROM aclexplode(ARRAY(SELECT jsonb_array_elements_text(v_view.acl))::aclitem[]) LOOP
        EXECUTE format('GRANT %s ON TABLE public.%I TO %s%s',
          v_acl.privilege_type,v_view.name,
          CASE WHEN v_acl.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_acl.grantee)) END,
          CASE WHEN v_acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
      END LOOP;
    END IF;
    IF v_view.description IS NOT NULL THEN
      EXECUTE format('COMMENT ON VIEW public.%I IS %L',v_view.name,v_view.description);
    END IF;
    FOR v_column IN SELECT * FROM jsonb_to_recordset(v_view."columnComments") AS t(name text,description text) LOOP
      EXECUTE format('COMMENT ON COLUMN public.%I.%I IS %L',v_view.name,v_column.name,v_column.description);
    END LOOP;
    IF (SELECT coalesce(jsonb_agg(jsonb_build_object('grantor',a.grantor,'grantee',a.grantee,'privilege',a.privilege_type,'grantable',a.is_grantable)
          ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]')
        FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        WHERE c.oid=to_regclass(format('public.%I',v_view.name))) IS DISTINCT FROM v_view."aclSemantic" THEN
      RAISE EXCEPTION 'MIGRATION_570_QUANTITY_VIEW_ACL_RESTORE_MISMATCH: %',v_view.name;
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
    'productos',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.productos p),
    'existencias',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.producto_existencias p),
    'movimientos',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.movimientos_inventario p)
  ) INTO v_after;
  -- JSONB compara los números por valor: 2.50 y 2.500000 son iguales.
  IF v_after IS DISTINCT FROM v_before THEN RAISE EXCEPTION 'MIGRATION_570_QUANTITY_VALUES_CHANGED'; END IF;
END $inventory_quantity_precision$;

-- El writer no redondea silenciosamente una cantidad que el contrato no admite.
DO $inventory_quantity_writer$
DECLARE v_def text; v_from text; v_to text;
BEGIN
  v_def:=replace(pg_get_functiondef('public.aplicar_movimiento_inventario_tx(uuid,uuid,uuid,text,numeric,text,uuid,text,uuid,text,date,text,jsonb,boolean)'::regprocedure),chr(13),'');
  v_from:='  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN';
  v_to:='  IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad<>round(p_cantidad,6) THEN';
  IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_QUANTITY_WRITER_SOURCE_CHANGED'; END IF;
  EXECUTE replace(v_def,v_from,v_to);
END $inventory_quantity_writer$;

-- El diagnóstico de conciliación compara cantidades con la misma precisión.
DO $inventory_quantity_reconciliation$
DECLARE v_def text; v_from text; v_to text;
BEGIN
  v_def:=replace(pg_get_functiondef('public.validar_inventory_stock_reconciliation_runtime(uuid)'::regprocedure),chr(13),'');
  FOREACH v_from IN ARRAY ARRAY[
    'SUM(COALESCE(pe.stock_actual, 0))::numeric(14,2) AS stock_actual',
    'SUM(COALESCE(pe.stock_reservado, 0))::numeric(14,2) AS stock_reservado'
  ] LOOP
    v_to:=replace(v_from,'numeric(14,2)','numeric(18,6)');
    IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_QUANTITY_RECONCILIATION_SOURCE_CHANGED: %',v_from; END IF;
    v_def:=replace(v_def,v_from,v_to);
  END LOOP;
  EXECUTE v_def;
END $inventory_quantity_reconciliation$;

-- Complemento functions-only: el reporte 496 conserva seis decimales en
-- cantidades y saldos físicos. Valor monetario, monedas y TC no se modifican.
DO $inventory_quantity_report$
DECLARE v_def text; v_patch record; v_count integer;
BEGIN
  v_def:=replace(pg_get_functiondef('public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)'::regprocedure),chr(13),'');
  FOR v_patch IN SELECT * FROM (VALUES
    ('round(sum(cantidad_firmada) OVER quantity_window, 2)',1),
    ('round(coalesce(sum(greatest(cantidad_firmada, 0)), 0), 2) AS entries',1),
    ('round(coalesce(sum(abs(least(cantidad_firmada, 0))), 0), 2) AS exits',1),
    ('round(coalesce(sum(cantidad_firmada), 0), 2) AS quantity_net',1),
    ('round(coalesce(sum(cantidad_firmada) FILTER (WHERE tipo = ''AJUSTE''), 0), 2) AS adjustments',1),
    ('round(coalesce(sum(cantidad_firmada) FILTER (WHERE tipo = ''DEVOLUCION''), 0), 2) AS returns',1),
    ('round(coalesce(sum(cantidad_firmada), 0), 2) AS quantity_balance',2)
  ) AS t(fragment,expected) LOOP
    v_count:=(length(v_def)-length(replace(v_def,v_patch.fragment,'')))/length(v_patch.fragment);
    IF v_count<>v_patch.expected THEN RAISE EXCEPTION 'MIGRATION_570_QUANTITY_REPORT_SOURCE_CHANGED: % (%/% )',v_patch.fragment,v_count,v_patch.expected; END IF;
    v_def:=replace(v_def,v_patch.fragment,replace(v_patch.fragment,', 2)',', 6)'));
  END LOOP;
  EXECUTE v_def;
END $inventory_quantity_report$;

DO $inventory_zero_master$
DECLARE v_def text; v_from text; v_to text;
BEGIN
  v_def:=replace(pg_get_functiondef('public.crear_producto_maestro_tx(uuid,uuid,text,jsonb)'::regprocedure),chr(13),'');
  v_from:='  v_canonical := jsonb_build_object(';
  v_to:=$new$  IF p_payload ? 'costo_cero_confirmado' AND jsonb_typeof(p_payload->'costo_cero_confirmado')<>'boolean' THEN
    RAISE EXCEPTION 'INVENTORY_ZERO_COST_CONFIRMATION_INVALID' USING ERRCODE='22023';
  END IF;
  IF coalesce((p_payload->>'costo_cero_confirmado')::boolean,false) THEN
    IF NOT(p_payload ? 'precio_compra') OR (v_producto_payload->>'precio_compra')::numeric<>0 THEN
      RAISE EXCEPTION 'INVENTORY_ZERO_COST_CONFIRMATION_CONTRADICTS_COST' USING ERRCODE='23514';
    END IF;
    -- Incluido en la misma huella del alta; otro intento no puede cambiarlo.
    v_producto_payload:=v_producto_payload||jsonb_build_object('costo_cero_confirmado',true);
  END IF;
  v_canonical := jsonb_build_object($new$;
  IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN
    RAISE EXCEPTION 'MIGRATION_570_ZERO_MASTER_SOURCE_CHANGED';
  END IF;
  EXECUTE replace(v_def,v_from,v_to);
END $inventory_zero_master$;

DO $inventory_zero_opening$
DECLARE v_def text; v_from text; v_to text;
BEGIN
  v_def:=replace(pg_get_functiondef('public.crear_producto_inventario_tx(uuid,jsonb,uuid,numeric,numeric,jsonb)'::regprocedure),chr(13),'');
  v_from:='        ''costo_unitario'', app.to_numeric_or_zero(p_producto->>''precio_compra'')';
  v_to:=v_from||','||chr(10)||'        ''costo_cero_confirmado'', coalesce(p_producto->''costo_cero_confirmado'',''false''::jsonb)';
  IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN
    RAISE EXCEPTION 'MIGRATION_570_ZERO_OPENING_SOURCE_CHANGED';
  END IF;
  EXECUTE replace(v_def,v_from,v_to);
END $inventory_zero_opening$;

DO $inventory_zero_adjustment$
DECLARE v_def text; v_from text; v_to text;
BEGIN
  v_def:=replace(pg_get_functiondef('app.registrar_ajuste_inventario_tx_455(uuid,jsonb,uuid,text)'::regprocedure),chr(13),'');
  v_from:='  IF v_costo <= 0 THEN';
  v_to:=$new$  -- Cero se admite únicamente desde un saldo PE confirmado en el ledger,
  -- nunca desde un precio de catálogo ausente ni una afirmación del navegador.
  IF v_costo<0 OR (v_costo=0 AND (
      v_producto.costo_promedio_base IS DISTINCT FROM 0::numeric
      OR NOT EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(btrim(ec.pais))='PE')
      OR NOT EXISTS(SELECT 1 FROM public.movimientos_inventario mi
                    WHERE mi.tenant_id=p_tenant_id AND mi.producto_id=v_producto_id
                      AND mi.metadata->>'costo_cero_confirmado'='true')
    )) THEN$new$;
  IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_ZERO_ADJUSTMENT_SOURCE_CHANGED'; END IF;
  v_def:=replace(v_def,v_from,v_to);
  v_from:='  IF v_valor <= 0 THEN';
  v_to:='  IF v_valor<0 OR (v_valor=0 AND v_costo<>0) THEN';
  IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_ZERO_VALUE_SOURCE_CHANGED'; END IF;
  v_def:=replace(v_def,v_from,v_to);
  v_from:='      ''costo_unitario'', v_costo,';
  v_to:=v_from||chr(10)||'      ''costo_cero_confirmado'', v_costo=0,';
  IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_ZERO_LEDGER_SOURCE_CHANGED'; END IF;
  v_def:=replace(v_def,v_from,v_to);
  v_from:='      ''costoUnitario'', v_costo,';
  v_to:=v_from||chr(10)||'      ''costoCeroConfirmado'', v_costo=0,'||chr(10)||'      ''schemaVersion'', 570,';
  IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN RAISE EXCEPTION 'MIGRATION_570_ZERO_EVENT_SOURCE_CHANGED'; END IF;
  EXECUTE replace(v_def,v_from,v_to);
END $inventory_zero_adjustment$;

-- 17. Normativa Perú por empresa y período, conservando versiones.
-- Candidato del lote570. Integrar y verificar desde el propietario de la DB.
-- Configuración histórica/futura PE propia, versiones + intención + auditoría.
ALTER TABLE public.normativa_peru_periodos ADD COLUMN IF NOT EXISTS afp_remuneracion_max_asegurable numeric(14,2);
DO $cap_constraint$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.normativa_peru_periodos'::regclass AND conname='ck_normativa_afp_max_570') THEN
   ALTER TABLE public.normativa_peru_periodos ADD CONSTRAINT ck_normativa_afp_max_570
     CHECK(afp_remuneracion_max_asegurable IS NULL OR afp_remuneracion_max_asegurable>0);
 END IF;
END;$cap_constraint$;
CREATE OR REPLACE FUNCTION public.guardar_normativa_peru_periodo_tx_570(
 p_tenant_id uuid,p_actor_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $norm570$
DECLARE
 v_key text:=btrim(COALESCE(p_idempotency_key,''));v_period text:=p_payload->>'periodo';
 v_intent public.rrhh_operaciones_475%ROWTYPE;v_old public.normativa_peru_periodos%ROWTYPE;
 v_new public.normativa_peru_periodos%ROWTYPE;v_fp text;v_version integer;v_result jsonb;v_field text;
 v_money text[]:=ARRAY['uit','rmv','asignacion_familiar','quinta_deduccion_uit','bancarizacion_pen_min','bancarizacion_usd_min'];
 v_rates text[]:=ARRAY['afp_aporte','afp_prima_seguro','afp_comision_flujo_default','onp_aporte','essalud_aporte','igv_tasa'];
BEGIN
 PERFORM app.assert_admin_actor_462(p_tenant_id,p_actor_id);
 PERFORM app.assert_rrhh_permission_495(p_tenant_id,p_actor_id,'configuracion.write');
 IF NOT EXISTS(SELECT 1 FROM public.usuarios_sistema u WHERE u.id=p_actor_id AND u.tenant_id=p_tenant_id AND
   (u.is_super_admin OR EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
    WHERE ur.usuario_sistema_id=u.id AND ur.tenant_id=p_tenant_id AND r.tenant_id=p_tenant_id
     AND COALESCE(r.activo,true) AND upper(btrim(r.nombre)) IN ('ADMIN','ADMINISTRADOR','SUPER_ADMIN')))) THEN
   RAISE EXCEPTION 'Sólo ADMIN de esta empresa puede configurar normativa peruana' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(ec.pais)='PE') THEN
   RAISE EXCEPTION 'La normativa corresponde a una empresa Perú' USING ERRCODE='23514'; END IF;
 IF length(v_key) NOT BETWEEN 8 AND 200 OR COALESCE(jsonb_typeof(p_payload),'null')<>'object'
   OR COALESCE(v_period,'')!~'^[0-9]{4}-(0[1-9]|1[0-2])$'
   OR length(btrim(COALESCE(p_payload->>'referencia',''))) NOT BETWEEN 3 AND 1000
   OR NOT(p_payload ?& (v_money||v_rates||ARRAY['periodo','referencia']))
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload)k WHERE NOT(k=ANY(v_money||v_rates||ARRAY['periodo','referencia','afp_remuneracion_max_asegurable']))) THEN
   RAISE EXCEPTION 'Normativa incompleta, período o referencia inválidos' USING ERRCODE='22023'; END IF;
 FOREACH v_field IN ARRAY v_money LOOP
   IF jsonb_typeof(p_payload->v_field)<>'number' OR (p_payload->>v_field)!~'^[0-9]+(\.[0-9]{1,2})?$'
    OR (p_payload->>v_field)::numeric>999999999999.99
    OR (v_field<>'asignacion_familiar' AND (p_payload->>v_field)::numeric<=0) THEN
     RAISE EXCEPTION 'Importe normativo inválido: %',v_field USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_payload ? 'afp_remuneracion_max_asegurable' AND p_payload->'afp_remuneracion_max_asegurable'<>'null'::jsonb AND
    (jsonb_typeof(p_payload->'afp_remuneracion_max_asegurable')<>'number'
     OR (p_payload->>'afp_remuneracion_max_asegurable')!~'^[0-9]+(\.[0-9]{1,2})?$'
     OR (p_payload->>'afp_remuneracion_max_asegurable')::numeric<=0
     OR (p_payload->>'afp_remuneracion_max_asegurable')::numeric>999999999999.99) THEN
   RAISE EXCEPTION 'Máximo asegurable AFP inválido' USING ERRCODE='22023';
 END IF;
 FOREACH v_field IN ARRAY v_rates LOOP
   IF jsonb_typeof(p_payload->v_field)<>'number' OR (p_payload->>v_field)!~'^[0-9]+(\.[0-9]{1,6})?$'
    OR (p_payload->>v_field)::numeric>1 THEN
     RAISE EXCEPTION 'Tasa normativa inválida: %',v_field USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (p_payload->>'quinta_deduccion_uit')::numeric>100 OR
    (p_payload->>'asignacion_familiar')::numeric IS DISTINCT FROM round((p_payload->>'rmv')::numeric*.1,2) THEN
   RAISE EXCEPTION 'Asignación familiar debe corresponder al 10%% de RMV; deducción UIT inválida' USING ERRCODE='23514'; END IF;
 v_fp:=app.rrhh_fingerprint_475(p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':NORMATIVA:'||v_key,570));
 SELECT * INTO v_intent FROM public.rrhh_operaciones_475 WHERE tenant_id=p_tenant_id
   AND operacion='PERU_NORMATIVA_UPSERT' AND idempotency_key=v_key FOR UPDATE;
 IF FOUND THEN
   IF v_intent.actor_id IS DISTINCT FROM p_actor_id OR v_intent.fingerprint IS DISTINCT FROM v_fp THEN
     RAISE EXCEPTION 'Intención normativa reutilizada con otro actor o contenido' USING ERRCODE='23505'; END IF;
   IF v_intent.response IS NULL THEN RAISE EXCEPTION 'Intención normativa incompleta' USING ERRCODE='40001'; END IF;
   RETURN v_intent.response;
 END IF;
 -- Mismo mutex que alta/cambio de período495; rows de planilla se bloquean antes
 -- de revisar estados. No se cambia ningún concepto calculado ni documento.
 PERFORM pg_advisory_xact_lock(hashtextextended('eps570:'||p_tenant_id::text,570));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':PLANILLA:'||v_period,495));
 PERFORM 1 FROM public.planillas WHERE tenant_id=p_tenant_id AND (periodo=v_period OR
    (right(v_period,2) IN ('06','11') AND periodo=to_char(to_date(v_period||'-01','YYYY-MM-DD')+interval '1 month','YYYY-MM'))) FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.planillas WHERE tenant_id=p_tenant_id AND (periodo=v_period OR
    (right(v_period,2) IN ('06','11') AND periodo=to_char(to_date(v_period||'-01','YYYY-MM-DD')+interval '1 month','YYYY-MM')))
    AND lower(estado::text) IN('calculada','aprobada','pagada')) THEN
   RAISE EXCEPTION 'Normativa bloqueada: existe planilla calculada, aprobada o pagada del período' USING ERRCODE='23514'; END IF;
 INSERT INTO public.rrhh_operaciones_475(tenant_id,actor_id,operacion,idempotency_key,fingerprint)
 VALUES(p_tenant_id,p_actor_id,'PERU_NORMATIVA_UPSERT',v_key,v_fp) RETURNING * INTO v_intent;
 SELECT * INTO v_old FROM public.normativa_peru_periodos WHERE tenant_id=p_tenant_id AND periodo=v_period AND activo FOR UPDATE;
 SELECT count(*)+1 INTO v_version FROM public.normativa_peru_periodos WHERE tenant_id=p_tenant_id AND periodo=v_period;
 UPDATE public.normativa_peru_periodos SET activo=false,updated_at=now() WHERE tenant_id=p_tenant_id AND periodo=v_period AND activo;
 INSERT INTO public.normativa_peru_periodos(tenant_id,periodo,pais_codigo,uit,rmv,asignacion_familiar,
   afp_aporte,afp_prima_seguro,afp_comision_flujo_default,onp_aporte,essalud_aporte,quinta_deduccion_uit,
   bancarizacion_pen_min,bancarizacion_usd_min,igv_tasa,afp_remuneracion_max_asegurable,fuente)
 VALUES(p_tenant_id,v_period,'PE',(p_payload->>'uit')::numeric,(p_payload->>'rmv')::numeric,
   (p_payload->>'asignacion_familiar')::numeric,(p_payload->>'afp_aporte')::numeric,
   (p_payload->>'afp_prima_seguro')::numeric,(p_payload->>'afp_comision_flujo_default')::numeric,
   (p_payload->>'onp_aporte')::numeric,(p_payload->>'essalud_aporte')::numeric,
   (p_payload->>'quinta_deduccion_uit')::numeric,(p_payload->>'bancarizacion_pen_min')::numeric,
   (p_payload->>'bancarizacion_usd_min')::numeric,(p_payload->>'igv_tasa')::numeric,
   (p_payload->>'afp_remuneracion_max_asegurable')::numeric,
   jsonb_build_object('referencia',btrim(p_payload->>'referencia'),'version',v_version,'declarado_por',p_actor_id,
    'declarado_en',now(),'origen','ADMIN_EMPRESA','version_anterior_id',v_old.id)) RETURNING * INTO v_new;
 v_result:=jsonb_build_object('success',true,'data',to_jsonb(v_new));
 PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'normativa_peru_periodos',
   CASE WHEN v_old.id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,v_new.id,
   CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END,to_jsonb(v_new),'PERU_NORMATIVA_UPSERT',v_intent.id);
 UPDATE public.rrhh_operaciones_475 SET entidad_id=v_new.id,response=v_result,completed_at=now() WHERE id=v_intent.id;
 RETURN v_result;
END;
$norm570$;
REVOKE ALL ON FUNCTION public.guardar_normativa_peru_periodo_tx_570(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_normativa_peru_periodo_tx_570(uuid,uuid,jsonb,text) TO service_role;

-- Fija la versión leída por el motor dentro de la misma transacción del cálculo.
-- Si una edición concurrente cambió la regla después de leerla, se rechaza el
-- cálculo sin persistir conceptos ni eventos. No amplía el lifecycle495.
DO $move_norm570$
BEGIN
 IF to_regprocedure('app.guardar_calculo_planilla_normativa_base_570(uuid,uuid,jsonb,uuid)') IS NULL THEN
   ALTER FUNCTION public.guardar_calculo_planilla_tx(uuid,uuid,jsonb,uuid) SET SCHEMA app;
   ALTER FUNCTION app.guardar_calculo_planilla_tx(uuid,uuid,jsonb,uuid) RENAME TO guardar_calculo_planilla_normativa_base_570;
 END IF;
END;
$move_norm570$;
REVOKE ALL ON FUNCTION app.guardar_calculo_planilla_normativa_base_570(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guardar_calculo_planilla_tx(
 p_tenant_id uuid,p_planilla_id uuid,p_empleados jsonb,p_actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $calc_norm570$
DECLARE
 v_planilla public.planillas%ROWTYPE;v_norm public.normativa_peru_periodos%ROWTYPE;
 v_base public.normativa_peru_periodos%ROWTYPE;v_refs jsonb:='[]'::jsonb;
 v_row jsonb;v_period_base text;v_result jsonb;v_is_pe boolean;
BEGIN
 PERFORM app.assert_rrhh_permission_495(p_tenant_id,p_actor_id,'rrhh.planillas.calculate');
 PERFORM pg_advisory_xact_lock(hashtextextended('eps570:'||p_tenant_id::text,570));
 SELECT * INTO v_planilla FROM public.planillas WHERE id=p_planilla_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Planilla no encontrada para el tenant' USING ERRCODE='P0002'; END IF;
 IF jsonb_typeof(p_empleados)<>'array' THEN RAISE EXCEPTION 'El cálculo requiere un arreglo de empleados' USING ERRCODE='22023'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(ec.pais)='PE') INTO v_is_pe;
 IF v_is_pe THEN
   SELECT * INTO v_norm FROM public.normativa_peru_periodos WHERE periodo=v_planilla.periodo AND activo
     AND (tenant_id=p_tenant_id OR tenant_id IS NULL) ORDER BY (tenant_id IS NOT NULL) DESC LIMIT 1;
   FOR v_row IN SELECT value FROM jsonb_array_elements(p_empleados) LOOP
     IF (v_norm.tenant_id IS NOT NULL OR v_row->'metadata' ? 'normativa_periodo_id')
       AND app.to_uuid_or_null(v_row->'metadata'->>'normativa_periodo_id') IS DISTINCT FROM v_norm.id THEN
       RAISE EXCEPTION 'La normativa cambió durante el cálculo; consulte el período y vuelva a calcular' USING ERRCODE='40001';
     END IF;
     IF v_row->'metadata'->'base_gratificacion_ordinaria'->>'fuente'='CONTRATO_HISTORICO' THEN
       v_period_base:=v_row->'metadata'->'base_gratificacion_ordinaria'->>'periodo';
       SELECT * INTO v_base FROM public.normativa_peru_periodos WHERE periodo=v_period_base AND activo
         AND (tenant_id=p_tenant_id OR tenant_id IS NULL) ORDER BY (tenant_id IS NOT NULL) DESC LIMIT 1;
       IF (v_base.tenant_id IS NOT NULL OR v_row->'metadata'->'base_gratificacion_ordinaria' ? 'normativa_base_id')
         AND app.to_uuid_or_null(v_row->'metadata'->'base_gratificacion_ordinaria'->>'normativa_base_id') IS DISTINCT FROM v_base.id THEN
         RAISE EXCEPTION 'La normativa de la base de gratificación cambió; vuelva a calcular' USING ERRCODE='40001';
       END IF;
     END IF;
   END LOOP;
   IF v_norm.id IS NOT NULL THEN v_refs:=v_refs||jsonb_build_array(to_jsonb(v_norm)); END IF;
   IF v_base.id IS NOT NULL AND v_base.id IS DISTINCT FROM v_norm.id THEN v_refs:=v_refs||jsonb_build_array(to_jsonb(v_base)); END IF;
 END IF;
 v_result:=app.guardar_calculo_planilla_normativa_base_570(p_tenant_id,p_planilla_id,p_empleados,p_actor_id);
 IF v_is_pe AND jsonb_array_length(v_refs)>0 THEN
   UPDATE public.planillas SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('normativa_usada',v_refs)
     WHERE id=p_planilla_id AND tenant_id=p_tenant_id;
 END IF;
 RETURN v_result;
END;
$calc_norm570$;
REVOKE ALL ON FUNCTION public.guardar_calculo_planilla_tx(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_calculo_planilla_tx(uuid,uuid,jsonb,uuid) TO service_role;



-- 18. El wizard consulta las mismas condiciones que el cierre bajo lock.
CREATE OR REPLACE FUNCTION app.accounting_close_conditions_570(p_tenant_id uuid,p_anio integer,p_mes integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $conditions570$
DECLARE v_pending integer;v_drafts integer;v_invalid integer;v_prior jsonb;v_annual boolean:=true;v_state text;
BEGIN
 IF p_anio IS NULL OR p_mes IS NULL OR p_anio NOT BETWEEN 2000 AND 2100 OR p_mes NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'ACCOUNTING_PERIOD_PARAMETERS_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT upper(p.estado::text) INTO v_state FROM public.periodos_contables p WHERE p.tenant_id=p_tenant_id AND p.anio=p_anio AND p.mes=p_mes;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',prior.id,'anio',prior.anio,'mes',prior.mes,'estado',prior.estado) ORDER BY prior.mes),'[]'::jsonb) INTO v_prior
 FROM public.periodos_contables prior WHERE prior.tenant_id=p_tenant_id AND prior.anio=p_anio AND prior.mes<p_mes AND upper(prior.estado::text)<>'CERRADO';
  SELECT count(*) INTO v_pending
  FROM public.outbox_events e
  WHERE e.tenant_id = p_tenant_id
    AND app.is_accounting_event_458(e.event_type)
    AND app.accounting_event_date_458(e.payload, e.occurred_at) >= make_date(p_anio, p_mes, 1)
    AND app.accounting_event_date_458(e.payload, e.occurred_at) <
      (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
    AND (e.processed_at IS NULL OR lower(COALESCE(e.status, '')) NOT IN ('completed', 'processed'));
  SELECT count(*) INTO v_drafts
  FROM public.asientos_contables a
  WHERE a.tenant_id = p_tenant_id
    AND upper(COALESCE(a.estado::text, '')) = 'BORRADOR'
    AND COALESCE(a.fecha, a.created_at)::date >= make_date(p_anio, p_mes, 1)
    AND COALESCE(a.fecha, a.created_at)::date <
      (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date;
  SELECT count(*) INTO v_invalid
  FROM (
    SELECT
      a.id,
      count(d.id) AS lines,
      round(COALESCE(sum(d.debe), 0), 2) AS debe,
      round(COALESCE(sum(d.haber), 0), 2) AS haber,
      round(COALESCE(a.total_debe, 0), 2) AS header_debe,
      round(COALESCE(a.total_haber, 0), 2) AS header_haber
    FROM public.asientos_contables a
    LEFT JOIN public.detalle_asientos d
      ON d.asiento_id = a.id
     AND d.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant_id
      AND upper(COALESCE(a.estado::text, '')) = 'CONFIRMADO'
      AND COALESCE(a.fecha, a.created_at)::date >= make_date(p_anio, p_mes, 1)
      AND COALESCE(a.fecha, a.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
    GROUP BY a.id, a.total_debe, a.total_haber
    HAVING count(d.id) < 2
       OR round(COALESCE(sum(d.debe), 0), 2) <= 0
       OR round(COALESCE(sum(d.debe), 0), 2) <> round(COALESCE(sum(d.haber), 0), 2)
       OR round(COALESCE(sum(d.debe), 0), 2) <> round(COALESCE(a.total_debe, 0), 2)
       OR round(COALESCE(sum(d.haber), 0), 2) <> round(COALESCE(a.total_haber, 0), 2)
  ) invalid;
 IF p_mes=12 AND abs(coalesce((app.estado_resultados_live_458(p_tenant_id,p_anio,12)->>'utilidad_neta')::numeric,0))>0.005 THEN
  v_annual:=(SELECT count(DISTINCT btrim(codigo))=2 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND btrim(codigo) IN('89','59'));
 END IF;
 RETURN jsonb_build_object(
  'puedeCerrar',v_state='ABIERTO' AND jsonb_array_length(v_prior)=0 AND v_pending=0 AND v_drafts=0 AND v_invalid=0 AND v_annual,
  'estado',jsonb_build_object('valido',v_state='ABIERTO','actual',v_state),
  'previos',jsonb_build_object('valido',jsonb_array_length(v_prior)=0,'periodos',v_prior),
  'borradores',jsonb_build_object('valido',v_drafts=0,'cantidad',v_drafts),
  'asientos',jsonb_build_object('valido',v_invalid=0,'cantidadInvalidos',v_invalid,'asientosDescuadrados','[]'::jsonb),
  'eventos',jsonb_build_object('valido',v_pending=0,'eventosPendientes',v_pending),
  'cierreAnual',jsonb_build_object('valido',v_annual));
END;$conditions570$;
REVOKE ALL ON FUNCTION app.accounting_close_conditions_570(uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.validar_cierre_periodo_contable_570(p_tenant_id uuid,p_periodo_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $preflight570$
DECLARE v_periodo public.periodos_contables;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'contabilidad.periodos.validar');
 SELECT * INTO v_periodo FROM public.periodos_contables WHERE tenant_id=p_tenant_id AND id=p_periodo_id;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN app.accounting_close_conditions_570(p_tenant_id,v_periodo.anio,v_periodo.mes);
END;$preflight570$;
REVOKE ALL ON FUNCTION public.validar_cierre_periodo_contable_570(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validar_cierre_periodo_contable_570(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cerrar_periodo_contable_tx(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_periodo public.periodos_contables;
  v_checks jsonb;
  v_pending integer;
  v_drafts integer;
  v_invalid integer;
  v_resultado numeric;
  v_cuenta_89 uuid;
  v_cuenta_59 uuid;
  v_cierre_seq integer;
  v_source_event_id uuid;
  v_asiento jsonb;
  v_detalles jsonb;
BEGIN
  PERFORM app.assert_accounting_actor_458(p_tenant_id, p_actor_id);

  IF p_anio < 2000 OR p_anio > 2100 OR p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_PARAMETERS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_periodo
  FROM public.periodos_contables p
  WHERE p.tenant_id = p_tenant_id
    AND p.anio = p_anio
    AND p.mes = p_mes
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND:%-%', p_anio, p_mes;
  END IF;

  IF upper(v_periodo.estado::text) = 'CERRADO' THEN
    RETURN jsonb_build_object(
      'periodo', to_jsonb(v_periodo),
      'idempotent', true,
      'cierre_asiento_id', v_periodo.metadata->>'cierre_asiento_id'
    );
  END IF;

  IF upper(v_periodo.estado::text) <> 'ABIERTO' THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_OPEN:%', v_periodo.estado USING ERRCODE = '55000';
  END IF;

  v_checks:=app.accounting_close_conditions_570(p_tenant_id,p_anio,p_mes);
  IF NOT (v_checks->'previos'->>'valido')::boolean THEN RAISE EXCEPTION 'ACCOUNTING_PRIOR_PERIODS_MUST_BE_CLOSED' USING ERRCODE='55000';END IF;
  v_pending:=(v_checks->'eventos'->>'eventosPendientes')::integer;
  IF v_pending>0 THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_PENDING_EVENTS:%',v_pending USING ERRCODE='55000';END IF;
  v_drafts:=(v_checks->'borradores'->>'cantidad')::integer;
  IF v_drafts>0 THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_DRAFT_ENTRIES:%',v_drafts USING ERRCODE='55000';END IF;
  v_invalid:=(v_checks->'asientos'->>'cantidadInvalidos')::integer;
  IF v_invalid>0 THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_INVALID_ENTRIES:%',v_invalid USING ERRCODE='55000';END IF;
  v_cierre_seq := COALESCE((v_periodo.metadata->>'cierre_sequence')::integer, 0) + 1;

  IF p_mes = 12 THEN
    v_resultado := COALESCE((app.estado_resultados_live_458(p_tenant_id, p_anio, 12)->>'utilidad_neta')::numeric, 0);
    IF abs(v_resultado) > 0.005 THEN
      SELECT pc.id INTO v_cuenta_89
      FROM public.plan_cuentas pc
      WHERE pc.tenant_id = p_tenant_id AND btrim(pc.codigo) = '89'
      ORDER BY pc.created_at, pc.id
      LIMIT 1;

      SELECT pc.id INTO v_cuenta_59
      FROM public.plan_cuentas pc
      WHERE pc.tenant_id = p_tenant_id AND btrim(pc.codigo) = '59'
      ORDER BY pc.created_at, pc.id
      LIMIT 1;

      IF v_cuenta_89 IS NULL OR v_cuenta_59 IS NULL THEN
        RAISE EXCEPTION 'ACCOUNTING_YEAR_CLOSE_ACCOUNTS_89_59_REQUIRED';
      END IF;

      v_source_event_id := (
        substr(encode(extensions.digest(convert_to(
          format('cierre-anual:%s:%s:%s', p_tenant_id, p_anio, v_cierre_seq), 'UTF8'
        ), 'sha256'), 'hex'), 1, 32)
      )::uuid;

      v_detalles := CASE WHEN v_resultado > 0 THEN
        jsonb_build_array(
          jsonb_build_object('cuenta_id', v_cuenta_89, 'debe', round(v_resultado, 2), 'haber', 0, 'concepto', format('Determinacion del resultado %s', p_anio)),
          jsonb_build_object('cuenta_id', v_cuenta_59, 'debe', 0, 'haber', round(v_resultado, 2), 'concepto', format('Utilidad del ejercicio %s', p_anio))
        )
      ELSE
        jsonb_build_array(
          jsonb_build_object('cuenta_id', v_cuenta_59, 'debe', round(abs(v_resultado), 2), 'haber', 0, 'concepto', format('Perdida del ejercicio %s', p_anio)),
          jsonb_build_object('cuenta_id', v_cuenta_89, 'debe', 0, 'haber', round(abs(v_resultado), 2), 'concepto', format('Determinacion del resultado %s', p_anio))
        )
      END;

      v_asiento := public.crear_asiento_con_detalles_tx(
        p_tenant_id,
        jsonb_build_object(
          'fecha', make_date(p_anio, 12, 31)::text,
          'concepto', format('Asiento de cierre del ejercicio %s', p_anio),
          'descripcion', format('Asiento de cierre del ejercicio %s', p_anio),
          'tipo_asiento', 'CIERRE',
          'origen', 'CIERRE_ANUAL',
          'referencia', format('CIERRE-%s-%s', p_anio, v_cierre_seq),
          'source_event_id', v_source_event_id,
          'estado', 'CONFIRMADO',
          'created_by', p_actor_id,
          'confirmado_por', p_actor_id
        ),
        v_detalles
      );
    END IF;
  END IF;

  PERFORM set_config('app.period_transition_458', 'on', true);
  UPDATE public.periodos_contables p
  SET estado = 'CERRADO',
      fecha_cierre = app.hoy_tenant(p_tenant_id),
      cerrado_por = p_actor_id,
      metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'cierre_sequence', v_cierre_seq,
        'cierre_asiento_id', v_asiento->>'id',
        'cerrado_en', now(),
        'cerrado_por', p_actor_id
      ),
      updated_at = now()
  WHERE p.id = v_periodo.id
  RETURNING p.* INTO v_periodo;
  PERFORM set_config('app.period_transition_458', 'off', true);

  RETURN jsonb_build_object(
    'periodo', to_jsonb(v_periodo),
    'idempotent', false,
    'cierre_asiento_id', v_asiento->>'id'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.cerrar_periodo_contable_tx(uuid,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_periodo_contable_tx(uuid,integer,integer,uuid) TO service_role;

-- 19. Compras conserva el contrato comercial de dos decimales. Rechazar
-- sobreprecisión antes de calcular dinero evita cantidad redondeada con un
-- subtotal calculado sobre otra cantidad. No reconstruye filas históricas.
DO $purchase_quantity_contract_570$
DECLARE v_signature text;v_def text;v_from text;v_to text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.crear_cotizacion_compra_tx(uuid,uuid,text,jsonb)',
    'public.actualizar_cotizacion_compra_tx(uuid,uuid,uuid,jsonb)',
    'app.insert_purchase_order_453(uuid,uuid,text,jsonb,uuid)',
    'public.actualizar_orden_compra_tx(uuid,uuid,uuid,jsonb)'
  ] LOOP
    v_def:=replace(pg_get_functiondef(v_signature::regprocedure),chr(13),'');
    v_from:='v_cantidad <= 0';
    v_to:='(v_cantidad <= 0 OR v_cantidad::text IN (''NaN'',''Infinity'',''-Infinity'') OR v_cantidad <> round(v_cantidad,2))';
    IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN
      RAISE EXCEPTION 'MIGRATION_570_PURCHASE_QUANTITY_SOURCE_CHANGED: %',v_signature;
    END IF;
    v_def:=replace(v_def,v_from,v_to);
    v_from:='v_precio < 0';
    v_to:='(v_precio < 0 OR v_precio::text IN (''NaN'',''Infinity'',''-Infinity'') OR (v_detalle->>''precio_unitario'')::numeric <> v_precio)';
    IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN
      RAISE EXCEPTION 'MIGRATION_570_PURCHASE_PRICE_SOURCE_CHANGED: %',v_signature;
    END IF;
    EXECUTE replace(v_def,v_from,v_to);
  END LOOP;
  v_signature:='public.convertir_cotizacion_compra_a_oc_tx(uuid,uuid,uuid,text,text,date)';
  v_def:=replace(pg_get_functiondef(v_signature::regprocedure),chr(13),'');
  v_from:='  v_tasa := app.tasa_impuesto_tenant(p_tenant_id);';
  v_to:=$patch$  IF EXISTS(SELECT 1 FROM public.cotizacion_compra_detalles d
    WHERE d.cotizacion_id=p_cotizacion_id AND d.tenant_id=p_tenant_id
      AND d.subtotal IS DISTINCT FROM round(d.cantidad*d.precio_unitario,2)) THEN
    RAISE EXCEPTION 'La cantidad historica de la cotizacion no coincide con su subtotal; rectifique el borrador';
  END IF;
  v_tasa := app.tasa_impuesto_tenant(p_tenant_id);$patch$;
  IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN
    RAISE EXCEPTION 'MIGRATION_570_PURCHASE_CONVERSION_SOURCE_CHANGED';
  END IF;
  EXECUTE replace(v_def,v_from,v_to);
END $purchase_quantity_contract_570$;

-- 20. Revaluación: intención y snapshot confirmados en una transacción.
-- El ajuste agregado se reversa antes de otro corte o de liquidar sus documentos;
-- no cambia el tipo de cambio histórico ni duplica diferencias no realizadas.
CREATE OR REPLACE FUNCTION app.revaluacion_simulacion_570(p_tenant_id uuid,p_fecha date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fx570$
 WITH local AS (
  SELECT CASE upper(btrim(coalesce((SELECT pais FROM public.empresa_config WHERE tenant_id=p_tenant_id),'PE')))
   WHEN 'AR' THEN 'ARS' WHEN 'CO' THEN 'COP' ELSE 'PEN' END moneda
 ), abiertas AS (
  SELECT 'CXC' tipo,c.id documento_id,nullif(concat_ws('-',c.serie,c.numero),'') referencia,
   upper(c.moneda) moneda,coalesce(c.monto_pendiente,c.saldo_pendiente,c.saldo,0) pendiente,c.tipo_cambio_origen origen
  FROM public.cuentas_por_cobrar c,local l WHERE c.tenant_id=p_tenant_id AND upper(c.moneda)<>l.moneda
   AND c.fecha_emision<=p_fecha AND upper(coalesce(c.estado,'')) NOT IN('ANULADA','ANULADO','PAGADA','PAGADO')
  UNION ALL
  SELECT 'CXP',c.id,nullif(c.numero_documento,''),upper(c.moneda),coalesce(c.saldo,c.saldo_pendiente,0),c.tipo_cambio_origen
  FROM public.cuentas_por_pagar c,local l WHERE c.tenant_id=p_tenant_id AND upper(c.moneda)<>l.moneda
   AND c.fecha_emision<=p_fecha AND upper(coalesce(c.estado,'')) NOT IN('ANULADA','ANULADO','PAGADA','PAGADO')
 ), valuadas AS (
  SELECT a.*,CASE WHEN a.tipo='CXC' THEN tc.compra ELSE tc.venta END cierre,
   round(a.pendiente*a.origen,2) contabilizado,
   round(a.pendiente*CASE WHEN a.tipo='CXC' THEN tc.compra ELSE tc.venta END,2) valor_cierre
  FROM abiertas a CROSS JOIN local l LEFT JOIN LATERAL (
   SELECT t.compra,t.venta FROM public.tipos_cambio t WHERE t.tenant_id=p_tenant_id
    AND upper(t.moneda_origen)=a.moneda AND upper(t.moneda_destino)=l.moneda AND t.fecha<=p_fecha
    AND coalesce(t.activo,true) AND upper(coalesce(t.estado::text,'ACTIVO'))='ACTIVO'
   ORDER BY t.fecha DESC,t.id LIMIT 1
  )tc ON true WHERE a.pendiente>0
 ), diferencias AS (
  SELECT *,CASE WHEN tipo='CXC' THEN valor_cierre-contabilizado ELSE contabilizado-valor_cierre END diferencia
  FROM valuadas WHERE origen>0 AND cierre>0
 ), posiciones AS (
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('tipo',tipo,'documento_id',documento_id,
   'referencia',referencia,'moneda',moneda,'saldo_moneda_origen',pendiente,'tipo_cambio_origen',origen,
   'tipo_cambio_cierre',cierre,'valor_contabilizado',contabilizado,'valor_a_cierre',valor_cierre,
   'diferencia',diferencia)) ORDER BY tipo,documento_id),'[]') items,
   coalesce(sum(diferencia) FILTER(WHERE diferencia>0),0) ganancia,
   -coalesce(sum(diferencia) FILTER(WHERE diferencia<0),0) perdida
  FROM diferencias WHERE diferencia<>0
 ), excluidas AS (
  SELECT jsonb_agg(jsonb_build_object('tipo',tipo,'documento_id',documento_id,'motivo',CASE
   WHEN coalesce(origen,0)<=0 THEN 'El documento no registra el tipo de cambio con el que se contabilizó, por lo que su diferencia de cambio no es calculable.'
   ELSE format('No hay tipo de cambio %s/%s vigente al %s.',moneda,(SELECT moneda FROM local),p_fecha) END)
   ORDER BY tipo,documento_id) items FROM valuadas WHERE coalesce(origen,0)<=0 OR coalesce(cierre,0)<=0
 ) SELECT jsonb_strip_nulls(jsonb_build_object('fecha',p_fecha,'moneda_local',l.moneda,'posiciones',p.items,
  'total_ganancia',p.ganancia,'total_perdida',p.perdida,'diferencia_neta',p.ganancia-p.perdida,'excluidas',e.items))
 FROM local l,posiciones p,excluidas e;
$fx570$;

CREATE OR REPLACE FUNCTION app.guard_revaluacion_570()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fx570$
DECLARE v_tenant uuid;v_id uuid;v_revaluation boolean:=false;v_old jsonb;v_new jsonb;v_active uuid;
BEGIN
 IF TG_TABLE_NAME='asientos_contables' THEN
  v_tenant:=NEW.tenant_id;
  v_revaluation:=NEW.origen='REVALUACION_MONEDA';
  IF NOT v_revaluation AND NOT EXISTS(SELECT 1 FROM public.asientos_contables a
    WHERE a.tenant_id=v_tenant AND a.id=NEW.reversion_de_asiento_id AND a.origen='REVALUACION_MONEDA') THEN RETURN NEW;END IF;
 ELSIF TG_TABLE_NAME='tipos_cambio' THEN
  v_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
 ELSE
  v_old:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  v_new:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  IF (v_old->>'moneda') IS NOT DISTINCT FROM (v_new->>'moneda') AND TG_OP='UPDATE'
    AND (v_old->'saldo',v_old->'saldo_pendiente',v_old->'monto_pendiente',v_old->'tipo_cambio_origen',v_old->'estado',v_old->'fecha_emision')
     IS NOT DISTINCT FROM (v_new->'saldo',v_new->'saldo_pendiente',v_new->'monto_pendiente',v_new->'tipo_cambio_origen',v_new->'estado',v_new->'fecha_emision') THEN RETURN NEW;END IF;
  v_tenant:=coalesce((v_new->>'tenant_id')::uuid,(v_old->>'tenant_id')::uuid);
  IF coalesce(v_new->>'moneda',app.treasury_local_currency_452(v_tenant))=app.treasury_local_currency_452(v_tenant)
   AND coalesce(v_old->>'moneda',app.treasury_local_currency_452(v_tenant))=app.treasury_local_currency_452(v_tenant) THEN
   IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
  END IF;
  v_id:=coalesce((v_new->>'id')::uuid,(v_old->>'id')::uuid);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':fx-revaluation',570));
 IF v_revaluation OR (TG_TABLE_NAME IN('cuentas_por_cobrar','cuentas_por_pagar') AND TG_OP<>'INSERT') THEN
  SELECT a.id INTO v_active FROM public.asientos_contables a WHERE a.tenant_id=v_tenant
   AND a.origen='REVALUACION_MONEDA' AND a.estado='CONFIRMADO'
   AND NOT EXISTS(SELECT 1 FROM public.asientos_contables r WHERE r.tenant_id=v_tenant
    AND r.reversion_de_asiento_id=a.id AND r.estado='CONFIRMADO')
   AND (v_revaluation OR a.metadata->'revaluacion_posiciones' IS NULL OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(a.metadata->'revaluacion_posiciones')p
     WHERE p->>'documento_id'=v_id::text AND p->>'tipo'=CASE TG_TABLE_NAME WHEN 'cuentas_por_cobrar' THEN 'CXC' ELSE 'CXP' END))
   ORDER BY a.created_at,a.id LIMIT 1;
  IF v_active IS NOT NULL THEN RAISE EXCEPTION 'Existe una revaluación vigente (%); revierta ese asiento antes de otro corte o de liquidar los documentos revaluados.',v_active USING ERRCODE='55000';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END;$fx570$;
CREATE TRIGGER trg_fx_revaluacion_asiento_570 BEFORE INSERT ON public.asientos_contables FOR EACH ROW EXECUTE FUNCTION app.guard_revaluacion_570();
CREATE TRIGGER trg_fx_revaluacion_cxc_570 BEFORE INSERT OR UPDATE OR DELETE ON public.cuentas_por_cobrar FOR EACH ROW EXECUTE FUNCTION app.guard_revaluacion_570();
CREATE TRIGGER trg_fx_revaluacion_cxp_570 BEFORE INSERT OR UPDATE OR DELETE ON public.cuentas_por_pagar FOR EACH ROW EXECUTE FUNCTION app.guard_revaluacion_570();
CREATE TRIGGER trg_fx_revaluacion_cotizacion_570 BEFORE INSERT OR UPDATE OR DELETE ON public.tipos_cambio FOR EACH ROW EXECUTE FUNCTION app.guard_revaluacion_570();

CREATE OR REPLACE FUNCTION public.registrar_revaluacion_tx_570(
 p_tenant_id uuid,p_actor_id uuid,p_fecha date,p_simulacion jsonb,p_concepto text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fx570$
DECLARE v_key text:=btrim(p_idempotency_key);v_fingerprint text;v_op public.financial_master_operations;
 v_actual jsonb;v_review jsonb;v_period public.periodos_contables;v_account uuid;v_code text;v_lines jsonb:='[]';
 v_cxc numeric;v_cxp numeric;v_debit numeric;v_credit numeric;v_journal jsonb;v_result jsonb;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'contabilidad.revaluacion.ejecutar');
 IF p_fecha IS NULL OR length(coalesce(v_key,'')) NOT BETWEEN 8 AND 200 OR jsonb_typeof(p_simulacion)<>'object' THEN
  RAISE EXCEPTION 'La fecha, simulación revisada y clave de intención son obligatorias' USING ERRCODE='22023';END IF;
 v_fingerprint:=app.financial_master_fingerprint_477(jsonb_build_object('fecha',p_fecha,'simulacion',p_simulacion,'concepto',p_concepto));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':fx-revaluation',570));
 SELECT * INTO v_op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id
  AND operation_type='FX_REVALUATION' AND idempotency_key=v_key FOR UPDATE;
 IF FOUND THEN
  IF v_op.actor_id<>p_actor_id OR v_op.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'La clave de revaluación pertenece a otra intención' USING ERRCODE='23505';END IF;
  RETURN v_op.result;
 END IF;
 SELECT * INTO v_period FROM public.periodos_contables WHERE tenant_id=p_tenant_id
  AND anio=extract(year FROM p_fecha)::integer AND mes=extract(month FROM p_fecha)::integer FOR SHARE;
 IF NOT FOUND OR v_period.estado<>'ABIERTO' THEN RAISE EXCEPTION 'El período de revaluación no está ABIERTO' USING ERRCODE='55000';END IF;
 v_actual:=app.revaluacion_simulacion_570(p_tenant_id,p_fecha);
 SELECT p_simulacion||jsonb_build_object('posiciones',coalesce(jsonb_agg(p ORDER BY p->>'tipo',p->>'documento_id'),'[]'))
  INTO v_review FROM jsonb_array_elements(p_simulacion->'posiciones')p;
 IF p_simulacion?'excluidas' THEN
  SELECT v_review||jsonb_build_object('excluidas',jsonb_agg(p ORDER BY p->>'tipo',p->>'documento_id')) INTO v_review
   FROM jsonb_array_elements(p_simulacion->'excluidas')p;
 END IF;
 IF v_review IS DISTINCT FROM v_actual THEN RAISE EXCEPTION 'Los saldos o cotizaciones cambiaron desde la simulación; vuelva a simular antes de registrar.' USING ERRCODE='40001';END IF;
 IF jsonb_array_length(v_actual->'posiciones')=0 THEN RAISE EXCEPTION 'No hay diferencia de cambio que registrar' USING ERRCODE='22023';END IF;
 SELECT coalesce(sum((p->>'valor_a_cierre')::numeric-(p->>'valor_contabilizado')::numeric) FILTER(WHERE p->>'tipo'='CXC'),0),
  coalesce(sum((p->>'valor_a_cierre')::numeric-(p->>'valor_contabilizado')::numeric) FILTER(WHERE p->>'tipo'='CXP'),0)
 INTO v_cxc,v_cxp FROM jsonb_array_elements(v_actual->'posiciones')p;
 FOREACH v_code IN ARRAY ARRAY['12','42','676','776'] LOOP
  v_debit:=CASE v_code WHEN '12' THEN greatest(v_cxc,0) WHEN '42' THEN greatest(-v_cxp,0)
    WHEN '676' THEN (v_actual->>'total_perdida')::numeric ELSE 0 END;
  v_credit:=CASE v_code WHEN '12' THEN greatest(-v_cxc,0) WHEN '42' THEN greatest(v_cxp,0)
    WHEN '776' THEN (v_actual->>'total_ganancia')::numeric ELSE 0 END;
  IF v_debit=0 AND v_credit=0 THEN CONTINUE;END IF;
  SELECT id INTO v_account FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo=v_code
   AND coalesce(activo,true) AND coalesce(acepta_movimiento,false);
  IF NOT FOUND THEN RAISE EXCEPTION 'La cuenta % no está activa o no admite movimientos',v_code USING ERRCODE='23514';END IF;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('cuenta_id',v_account,'debe',v_debit,'haber',v_credit,'concepto','Diferencia de cambio al '||p_fecha));
 END LOOP;
 v_journal:=public.crear_asiento_con_detalles_tx(p_tenant_id,jsonb_build_object('fecha',p_fecha::text||'T00:00:00Z',
  'concepto',coalesce(nullif(btrim(p_concepto),''),'Diferencia de cambio no realizada al '||p_fecha),
  'referencia','REVAL-'||p_fecha,'tipo_asiento','AJUSTE','origen','REVALUACION_MONEDA','source_event_id',gen_random_uuid(),
  'estado','CONFIRMADO','created_by',p_actor_id,'confirmado_por',p_actor_id,'confirmado_en',clock_timestamp()),v_lines);
 UPDATE public.asientos_contables SET metadata=coalesce(metadata,'{}')||jsonb_build_object('revaluacion_posiciones',v_actual->'posiciones')
  WHERE tenant_id=p_tenant_id AND id=(v_journal->>'id')::uuid;
 v_result:=v_actual||jsonb_build_object('asiento_id',v_journal->'id','numero_asiento',v_journal->'numero_asiento');
 INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id,result)
 VALUES(p_tenant_id,'FX_REVALUATION',v_key,v_fingerprint,p_actor_id,(v_journal->>'id')::uuid,v_result);
 RETURN v_result;
END;$fx570$;
REVOKE ALL ON FUNCTION app.revaluacion_simulacion_570(uuid,date),app.guard_revaluacion_570() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.registrar_revaluacion_tx_570(uuid,uuid,date,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_revaluacion_tx_570(uuid,uuid,date,jsonb,text,text) TO service_role;

-- 21. Cotizaciones: rechazar sobreprecisión antes de la conversión numeric(18,6).
-- Sólo cambia la validación del writer privado; conserva filas, propietario y ACL.
DO $fx_precision_570$
DECLARE v_def text;v_from text;v_to text;
BEGIN
 v_def:=replace(pg_get_functiondef('app.gestionar_maestro_contable_tx_482(uuid,uuid,text,text,uuid,jsonb,text)'::regprocedure),chr(13),'');
 v_from:='IF origin!~''^[A-Z]{3}$'' OR destination!~''^[A-Z]{3}$'' OR origin=destination OR buy<=0 OR sell<=0 THEN';
 v_to:='IF origin!~''^[A-Z]{3}$'' OR destination!~''^[A-Z]{3}$'' OR origin=destination OR buy IS NULL OR sell IS NULL OR buy<=0 OR sell<=0 OR buy::text IN (''NaN'',''Infinity'',''-Infinity'') OR sell::text IN (''NaN'',''Infinity'',''-Infinity'') OR buy<>round(buy,6) OR sell<>round(sell,6) THEN';
 IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from)<>1 THEN
  RAISE EXCEPTION 'MIGRATION_570_FX_PRECISION_SOURCE_CHANGED';
 END IF;
 EXECUTE replace(v_def,v_from,v_to);
END;$fx_precision_570$;

-- 20. La revisión de precios de la UI se vuelve precondición del writer.
-- Si otra sesión modifica la regla después de la consulta, no se cambia dinero
-- silenciosamente. Los recibos567 ya comprometidos se recuperan antes del guard.
CREATE OR REPLACE FUNCTION app.assert_reviewed_commercial_prices_570(
 p_reviewed jsonb, p_resolved jsonb
) RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog
AS $reviewed_prices_570$
DECLARE v_row record;v_reviewed numeric;v_resolved numeric;
BEGIN
 IF p_reviewed IS NULL OR p_resolved IS NULL
    OR jsonb_typeof(p_reviewed)<>'array' OR jsonb_typeof(p_resolved)<>'array'
    OR jsonb_array_length(p_reviewed)<>jsonb_array_length(p_resolved) THEN
  RAISE EXCEPTION 'COMMERCIAL_REVIEW_DETAILS_INVALID' USING ERRCODE='22023';
 END IF;
 FOR v_row IN SELECT value,ordinality FROM jsonb_array_elements(p_resolved) WITH ORDINALITY LOOP
  v_reviewed:=nullif(p_reviewed->(v_row.ordinality::integer-1)->>'precio_unitario','')::numeric;
  v_resolved:=nullif(v_row.value->>'precio_unitario','')::numeric;
  IF v_reviewed IS NULL OR v_resolved IS NULL OR abs(v_reviewed-v_resolved)>0.000001 THEN
   RAISE EXCEPTION 'COMMERCIAL_PRICE_STALE' USING ERRCODE='40001';
  END IF;
 END LOOP;
END;$reviewed_prices_570$;
REVOKE ALL ON FUNCTION app.assert_reviewed_commercial_prices_570(jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;

DO $commercial_price_review_570$
DECLARE v_signature text;v_def text;v_needle text;v_guard text;
BEGIN
 FOREACH v_signature IN ARRAY ARRAY[
  'public.crear_cotizacion_comercial_tx(uuid,uuid,uuid,date,text,text,text,numeric,numeric,numeric,jsonb)',
  'public.actualizar_cotizacion_comercial_tx(uuid,uuid,jsonb,jsonb)',
  'public.crear_pedido_comercial_tx(jsonb,jsonb)',
  'public.actualizar_pedido_comercial_legacy_531(uuid,uuid,jsonb,jsonb)'
 ] LOOP
  SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_def;
  v_guard:='PERFORM app.assert_reviewed_commercial_prices_570(p_detalle, v_detalle);';
  IF strpos(v_def,v_guard)>0 THEN CONTINUE;END IF;
  v_needle:=CASE WHEN v_signature='public.crear_pedido_comercial_tx(jsonb,jsonb)'
   THEN 'v_totales := app.totales_detalle_comercial_469(v_tenant_id, v_detalle);'
   ELSE 'v_totales := app.totales_detalle_comercial_469(p_tenant_id, v_detalle);' END;
  IF length(v_def)-length(replace(v_def,v_needle,''))<>length(v_needle) THEN
   RAISE EXCEPTION 'MIGRATION_570_COMMERCIAL_REVIEW_SOURCE_CHANGED: %',v_signature;
  END IF;
  EXECUTE replace(v_def,v_needle,v_guard||E'\n    '||v_needle);
 END LOOP;
END;$commercial_price_review_570$;

-- 23. Habilitación de reportes desde Configuración, por empresa.
-- Conserva el writer464 con sus locks, permisos, intención y auditoría.
-- Sólo amplía cuatro campos públicos; no cambia filas ni secretos existentes.
DO $sales_report_configuration_570$
DECLARE v_def text; v_needle text;
BEGIN
 v_def:=replace(pg_get_functiondef('app.apply_empresa_config_patch_464(uuid,jsonb)'::regprocedure),chr(13),'');
 IF strpos(v_def,'CONFIGURATION_SALES_REPORT_VALUES_INVALID')=0 THEN
 v_needle:=E'''errores_configuracion''\n  ];';
 IF length(v_def)-length(replace(v_def,v_needle,''))<>length(v_needle) THEN
  RAISE EXCEPTION 'MIGRATION_570_SALES_REPORT_ALLOWED_SOURCE_CHANGED';END IF;
 v_def:=replace(v_def,v_needle,E'''errores_configuracion'',\n    ''habilitar_dashboards_otif'',''habilitar_dashboards_sunat'',\n    ''objetivo_otif'',''frecuencia_actualizacion_dashboards''\n  ];');
 v_needle:='  v_country := upper(COALESCE(NULLIF(btrim(p_patch->>''pais''), ''''), v_old.pais, ''PE''));';
 IF length(v_def)-length(replace(v_def,v_needle,''))<>length(v_needle) THEN
  RAISE EXCEPTION 'MIGRATION_570_SALES_REPORT_VALIDATION_SOURCE_CHANGED';END IF;
 v_def:=replace(v_def,v_needle,$guard$
  FOR v_key IN SELECT unnest(ARRAY['habilitar_dashboards_otif','habilitar_dashboards_sunat'])
  LOOP
    IF p_patch ? v_key AND jsonb_typeof(p_patch->v_key) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'CONFIGURATION_SALES_REPORT_VALUES_INVALID:%',v_key USING ERRCODE='22023';END IF;
  END LOOP;
  IF p_patch ? 'objetivo_otif' THEN
    IF jsonb_typeof(p_patch->'objetivo_otif') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'CONFIGURATION_SALES_REPORT_VALUES_INVALID:objetivo_otif' USING ERRCODE='22023';END IF;
    IF (p_patch->>'objetivo_otif')::numeric NOT BETWEEN 0 AND 100
       OR (p_patch->>'objetivo_otif')::numeric<>round((p_patch->>'objetivo_otif')::numeric,2) THEN
      RAISE EXCEPTION 'CONFIGURATION_SALES_REPORT_VALUES_INVALID:objetivo_otif' USING ERRCODE='22023';END IF;
  END IF;
  IF p_patch ? 'frecuencia_actualizacion_dashboards' THEN
    IF jsonb_typeof(p_patch->'frecuencia_actualizacion_dashboards') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'CONFIGURATION_SALES_REPORT_VALUES_INVALID:frecuencia' USING ERRCODE='22023';END IF;
    IF (p_patch->>'frecuencia_actualizacion_dashboards')::numeric NOT BETWEEN 1 AND 86400
       OR (p_patch->>'frecuencia_actualizacion_dashboards')::numeric<>trunc((p_patch->>'frecuencia_actualizacion_dashboards')::numeric) THEN
      RAISE EXCEPTION 'CONFIGURATION_SALES_REPORT_VALUES_INVALID:frecuencia' USING ERRCODE='22023';END IF;
  END IF;
$guard$||v_needle);
 EXECUTE v_def;
 END IF;
 -- La autorización de estos campos se comprueba también antes del replay.
 -- No amplía la excepción histórica de superadmin a otra empresa.
 v_def:=replace(pg_get_functiondef('public.actualizar_empresa_config_tx(uuid,uuid,text,text,jsonb)'::regprocedure),chr(13),'');
 IF strpos(v_def,'SALES_REPORT_CONFIGURATION_PERMISSION_570')=0 THEN
  v_needle:='  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(';
  IF length(v_def)-length(replace(v_def,v_needle,''))<>length(v_needle) THEN
   RAISE EXCEPTION 'MIGRATION_570_SALES_REPORT_PERMISSION_SOURCE_CHANGED';END IF;
  v_def:=replace(v_def,v_needle,$permission$
  -- SALES_REPORT_CONFIGURATION_PERMISSION_570
  IF COALESCE(p_patch,'{}'::jsonb) ?| ARRAY['habilitar_dashboards_otif','habilitar_dashboards_sunat','objetivo_otif','frecuencia_actualizacion_dashboards'] THEN
    PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'configuracion.write');
  END IF;
$permission$||v_needle);
  EXECUTE v_def;
 END IF;
END;$sales_report_configuration_570$;

-- Lectura del registro canónico de despachos; la mutación sigue en sus writers.
GRANT SELECT ON public.pedido_despachos TO service_role;

-- El detalle documental incluye adjuntos; sólo lectura del backend autenticado.
-- Conserva owner/RLS/policies y no concede escrituras ni privilegios al cliente.
GRANT SELECT ON public.documento_archivos TO service_role;

-- 24. Cantidades comerciales de despacho: no redondear una solicitud explícita.
-- Conserva el writer442, sus locks, fingerprint, replay y ACL; sólo rechaza
-- valores fuera del contrato antes de crear eventos o descontar inventario.
DO $dispatch_quantity570$
DECLARE signature text:='app.despachar_pedido_parcial_tx(uuid,uuid,text,jsonb,text,uuid,jsonb)';definition text;anchor text;guard text;
BEGIN
 definition:=pg_get_functiondef(signature::regprocedure);
 anchor:='  PERFORM set_config(''app.current_tenant_id'', p_tenant_id::text, true);';
 guard:=$guard$  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) e
    WHERE e ? 'cantidad' AND CASE WHEN jsonb_typeof(e->'cantidad')='number' THEN
      (e->>'cantidad')::numeric < 0.01
      OR (e->>'cantidad')::numeric >= 1000000000000
      OR (e->>'cantidad')::numeric <> round((e->>'cantidad')::numeric,2)
    ELSE true END
  ) THEN
    RAISE EXCEPTION 'DISPATCH_QUANTITY_REQUIRES_POSITIVE_NUMBER_WITH_TWO_DECIMALS' USING ERRCODE='22023';
  END IF;

$guard$;
 IF strpos(definition,guard)=0 THEN
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN
   RAISE EXCEPTION 'DISPATCH_QUANTITY570_SOURCE_DRIFT';END IF;
  EXECUTE replace(definition,anchor,guard||anchor);
 END IF;
END;$dispatch_quantity570$;

-- La consulta de anulación financiera lee las reversas mediante el backend.
-- Sin SELECT, incluso un actor con permiso funcional recibe 403 antes del preview.
-- Sólo lectura del rol servidor; no cambia owner, RLS, clientes ni writers RPC.
GRANT SELECT ON public.cxc_cobro_reversas TO service_role;

-- Frontera local570: RPC509 privado, recibo durable y replay por actor/criterio.
CREATE OR REPLACE FUNCTION public.provisionar_cobranza_dudosa_tx_570(
 p_tenant_id uuid, p_periodo text, p_actor_id uuid, p_dias_vencido integer,
 p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $provision570$
DECLARE
 v_key text := lower(btrim(coalesce(p_idempotency_key,'')));
 v_type text := 'ACCOUNTING_BAD_DEBT_PROVISION';
 v_payload jsonb; v_fingerprint text; v_existing public.financial_master_operations%ROWTYPE;
 v_period public.periodos_contables%ROWTYPE; v_cut date; v_result jsonb;
 v_journal public.asientos_contables%ROWTYPE; v_lines jsonb := '[]'; v_provisions jsonb := '[]';
 v_operation uuid := gen_random_uuid(); v_total numeric; v_count integer;
BEGIN
 IF p_tenant_id IS NULL OR p_actor_id IS NULL THEN
  RAISE EXCEPTION 'PROVISION570_ACTOR_INVALID' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios_sistema u WHERE u.id=p_actor_id
  AND u.tenant_id IS NULL AND u.is_super_admin AND u.activo AND lower(u.estado::text)='activo') THEN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'contabilidad.asientos.crear');
 END IF;
 IF p_periodo IS NULL OR p_periodo !~ '^(20[0-9]{2}|21[0-9]{2}|2200)-(0[1-9]|1[0-2])$'
  OR coalesce(p_dias_vencido,0)<1 OR length(v_key) NOT BETWEEN 8 AND 200 THEN
  RAISE EXCEPTION 'PROVISION570_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 v_payload:=jsonb_build_object('periodo',p_periodo,'dias_vencido',p_dias_vencido);
 v_fingerprint:=app.financial_master_fingerprint_477(v_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':provision-key:'||v_key,0));
 SELECT * INTO v_existing FROM public.financial_master_operations
 WHERE tenant_id=p_tenant_id AND operation_type=v_type AND idempotency_key=v_key FOR UPDATE;
 IF FOUND THEN
  IF v_existing.actor_id<>p_actor_id OR v_existing.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'PROVISION570_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023';
  END IF;
  RETURN v_existing.result||jsonb_build_object('idempotent',true);
 END IF;
 SELECT * INTO v_period FROM public.periodos_contables WHERE tenant_id=p_tenant_id
  AND anio=split_part(p_periodo,'-',1)::integer AND mes=split_part(p_periodo,'-',2)::integer FOR UPDATE;
 IF NOT FOUND OR v_period.estado::text<>'ABIERTO' THEN
  RAISE EXCEPTION 'PROVISION570_PERIOD_NOT_OPEN' USING ERRCODE='23514';
 END IF;
 v_cut:=(make_date(v_period.anio,v_period.mes,1)+interval '1 month - 1 day')::date;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:provision-cobranza:%s',p_tenant_id,p_periodo),0));
 -- Congelar saldos elegibles mientras el writer discrimina el detalle.
 PERFORM c.id FROM public.cuentas_por_cobrar c
 JOIN app.cxc_provisionables_509(p_tenant_id,v_cut,p_dias_vencido) x ON x.id=c.id
 WHERE c.tenant_id=p_tenant_id ORDER BY c.id FOR UPDATE OF c;
 -- SQL509 suma importes nominales. No mezclar monedas sin una conversión definida.
 IF EXISTS(SELECT 1 FROM app.cxc_provisionables_509(p_tenant_id,v_cut,p_dias_vencido) x
  WHERE x.moneda IS DISTINCT FROM 'PEN') THEN
  RAISE EXCEPTION 'PROVISION570_CURRENCY_REQUIRES_CONVERSION' USING ERRCODE='22023';
 END IF;
 v_result:=public.provisionar_cobranza_dudosa_tx(p_tenant_id,p_periodo,p_actor_id,p_dias_vencido);
 IF (v_result->>'documentos')::integer>0 THEN
  SELECT * INTO v_journal FROM public.asientos_contables
   WHERE id=(v_result->>'asiento_id')::uuid AND tenant_id=p_tenant_id;
  IF NOT FOUND OR v_journal.estado::text<>'CONFIRMADO'
   OR v_journal.origen<>'PROVISION_COBRANZA_DUDOSA' OR v_journal.referencia<>'PCD-'||p_periodo
   OR v_journal.created_by::text IS DISTINCT FROM p_actor_id::text OR v_journal.confirmado_por::text IS DISTINCT FROM p_actor_id::text
   OR v_journal.total_debe IS DISTINCT FROM (v_result->>'monto_provisionado')::numeric
   OR v_journal.total_haber IS DISTINCT FROM (v_result->>'monto_provisionado')::numeric THEN
   RAISE EXCEPTION 'PROVISION570_JOURNAL_RECEIPT_MISMATCH' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('cuenta_codigo',pc.codigo) ORDER BY d.id),'[]')
   INTO v_lines FROM public.detalle_asientos d JOIN public.plan_cuentas pc
    ON pc.id=d.cuenta_id AND pc.tenant_id=d.tenant_id
   WHERE d.tenant_id=p_tenant_id AND d.asiento_id=v_journal.id;
  IF jsonb_array_length(v_lines)<>2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_lines) d
    WHERE btrim(d->>'cuenta_codigo')='68' AND (d->>'debe')::numeric=v_journal.total_debe AND (d->>'haber')::numeric=0)
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_lines) d
    WHERE btrim(d->>'cuenta_codigo')='19' AND (d->>'haber')::numeric=v_journal.total_haber AND (d->>'debe')::numeric=0) THEN
   RAISE EXCEPTION 'PROVISION570_LINES_RECEIPT_MISMATCH' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'),count(*),coalesce(sum(p.monto_provisionado),0)
   INTO v_provisions,v_count,v_total FROM public.provisiones_cobranza_dudosa p
   WHERE p.tenant_id=p_tenant_id AND p.asiento_id=v_journal.id AND p.periodo=p_periodo;
  IF v_count<>(v_result->>'documentos')::integer OR v_total<>(v_result->>'monto_provisionado')::numeric THEN
   RAISE EXCEPTION 'PROVISION570_DOCUMENT_RECEIPT_MISMATCH' USING ERRCODE='23514';
  END IF;
 END IF;
 v_result:=v_result||jsonb_build_object('operation_id',v_operation,'tenant_id',p_tenant_id,
  'actor_id',p_actor_id,'periodo_id',v_period.id,'idempotency_key',v_key,'request_fingerprint',v_fingerprint,
  'payload',v_payload,'idempotent',false,'moneda','PEN','corte',v_cut,
  'asiento',CASE WHEN v_journal.id IS NULL THEN NULL ELSE to_jsonb(v_journal) END,
  'detalles',v_lines,'provisiones',v_provisions);
 INSERT INTO public.financial_master_operations(id,tenant_id,operation_type,idempotency_key,
  request_fingerprint,actor_id,record_id,result)
 VALUES(v_operation,p_tenant_id,v_type,v_key,v_fingerprint,p_actor_id,v_period.id,v_result);
 RETURN v_result;
END;
$provision570$;
REVOKE ALL ON FUNCTION public.provisionar_cobranza_dudosa_tx_570(uuid,text,uuid,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provisionar_cobranza_dudosa_tx_570(uuid,text,uuid,integer,text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Alta de presupuesto local570: actor/permiso, período bloqueado y recibo original durable.
CREATE OR REPLACE FUNCTION public.crear_presupuesto_tx_570(
 p_tenant_id uuid,p_actor_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $budget570$
DECLARE
 k text:=lower(btrim(coalesce(p_idempotency_key,'')));fp text;amount numeric;
 center_id uuid;account_id uuid;period_id uuid;period public.periodos_contables%ROWTYPE;
 op public.financial_master_operations%ROWTYPE;r jsonb;record jsonb;replayed boolean:=false;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'contabilidad.presupuestos.crear');
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR length(k) NOT BETWEEN 8 AND 200
  OR (SELECT count(*) FROM jsonb_object_keys(p_payload))<>6
  OR NOT p_payload ?& ARRAY['centro_costo_id','cuenta_id','periodo_contable_id','monto_presupuestado','notas','estado']
  OR jsonb_typeof(p_payload->'monto_presupuestado') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_payload->'notas') IS DISTINCT FROM 'string'
  OR p_payload->>'notas'<>btrim(p_payload->>'notas') OR length(p_payload->>'notas')>10000
  OR jsonb_typeof(p_payload->'estado') IS DISTINCT FROM 'string'
  OR p_payload->>'estado' NOT IN('ACTIVO','BLOQUEADO','CERRADO') THEN
  RAISE EXCEPTION 'BUDGET570_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 center_id:=app.to_uuid_or_null(p_payload->>'centro_costo_id');account_id:=app.to_uuid_or_null(p_payload->>'cuenta_id');period_id:=app.to_uuid_or_null(p_payload->>'periodo_contable_id');amount:=(p_payload->>'monto_presupuestado')::numeric;
 IF center_id IS NULL OR account_id IS NULL OR period_id IS NULL OR amount<=0 OR amount<>round(amount,2) OR amount>90071992547409.91 THEN
  RAISE EXCEPTION 'BUDGET570_VALUES_INVALID' USING ERRCODE='22023';
 END IF;
 fp:=app.financial_master_fingerprint_477(jsonb_build_object('action','CREATE','id',NULL,'payload',p_payload));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':budget:'||k,0));
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type='BUDGET_CREATE' AND idempotency_key=k FOR UPDATE;
 IF FOUND THEN
  IF op.actor_id<>p_actor_id OR op.request_fingerprint<>fp THEN RAISE EXCEPTION 'BUDGET570_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023';END IF;
  r:=op.result;replayed:=true;
 ELSE
  SELECT * INTO period FROM public.periodos_contables WHERE tenant_id=p_tenant_id AND id=period_id FOR UPDATE;
  IF NOT FOUND OR upper(coalesce(period.estado,''))<>'ABIERTO' THEN RAISE EXCEPTION 'BUDGET570_PERIOD_NOT_OPEN' USING ERRCODE='23514';END IF;
  r:=app.gestionar_presupuesto_tx_480(p_tenant_id,p_actor_id,'CREATE',NULL,p_payload,k);
  SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type='BUDGET_CREATE' AND idempotency_key=k FOR UPDATE;
  IF NOT FOUND OR op.actor_id<>p_actor_id OR op.request_fingerprint<>fp THEN RAISE EXCEPTION 'BUDGET570_LEDGER_INVALID' USING ERRCODE='23514';END IF;
 END IF;
 record:=r->'record';
 IF r->>'success' IS DISTINCT FROM 'true' OR r->>'action' IS DISTINCT FROM 'CREATE'
  OR jsonb_typeof(record) IS DISTINCT FROM 'object' OR r->>'id' IS DISTINCT FROM op.record_id::text
  OR record->>'id' IS DISTINCT FROM op.record_id::text OR record->>'tenant_id' IS DISTINCT FROM p_tenant_id::text
  OR record->>'centro_costo_id' IS DISTINCT FROM center_id::text OR record->>'cuenta_id' IS DISTINCT FROM account_id::text OR record->>'periodo_contable_id' IS DISTINCT FROM period_id::text
  OR record->>'created_by' IS DISTINCT FROM p_actor_id::text OR record->>'updated_by' IS DISTINCT FROM p_actor_id::text
  OR (record->>'monto_presupuestado')::numeric IS DISTINCT FROM amount OR (record->>'monto_ejecutado')::numeric IS DISTINCT FROM 0
  OR (record->>'monto_comprometido')::numeric IS DISTINCT FROM 0 OR (record->>'monto_disponible')::numeric IS DISTINCT FROM amount
  OR (record->>'porcentaje_ejecutado')::numeric IS DISTINCT FROM 0 OR record->>'estado' IS DISTINCT FROM p_payload->>'estado'
  OR record->>'notas' IS DISTINCT FROM nullif(p_payload->>'notas','')
  OR nullif(record->>'codigo','') IS NULL OR nullif(record->>'nombre','') IS NULL OR jsonb_typeof(record->'metadata') IS DISTINCT FROM 'object'
  OR record->>'created_at' IS NULL OR record->>'updated_at' IS NULL THEN
  RAISE EXCEPTION 'BUDGET570_RECEIPT_INVALID' USING ERRCODE='23514';
 END IF;
 r:=r||jsonb_build_object('operation_id',op.id,'tenant_id',p_tenant_id,'actor_id',p_actor_id,'idempotency_key',k,'payload',p_payload,'request_fingerprint',fp,'idempotent',replayed);
 IF NOT replayed THEN UPDATE public.financial_master_operations SET result=r WHERE id=op.id;END IF;
 RETURN r;
END $budget570$;
ALTER FUNCTION public.crear_presupuesto_tx_570(uuid,uuid,jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.crear_presupuesto_tx_570(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crear_presupuesto_tx_570(uuid,uuid,jsonb,text) TO service_role;

-- Edición local570: recibo durable correlacionado y compare de fotografía antes de modificar.
CREATE OR REPLACE FUNCTION public.actualizar_presupuesto_tx_570(
 p_tenant_id uuid,p_actor_id uuid,p_presupuesto_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $budget_update570$
DECLARE k text:=lower(btrim(coalesce(p_idempotency_key,'')));fp text;amount numeric;
 b public.presupuestos%ROWTYPE;period public.periodos_contables%ROWTYPE;
 op public.financial_master_operations%ROWTYPE;r jsonb;record jsonb;replayed boolean:=false;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'contabilidad.presupuestos.actualizar');
 IF p_presupuesto_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR length(k) NOT BETWEEN 8 AND 200
  OR (SELECT count(*) FROM jsonb_object_keys(p_payload))<>4
  OR NOT p_payload ?& ARRAY['monto_presupuestado','notas','estado','expected_snapshot']
  OR jsonb_typeof(p_payload->'monto_presupuestado') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_payload->'notas') IS DISTINCT FROM 'string'
  OR p_payload->>'notas'<>btrim(p_payload->>'notas') OR length(p_payload->>'notas')>10000
  OR jsonb_typeof(p_payload->'estado') IS DISTINCT FROM 'string' OR p_payload->>'estado' NOT IN('ACTIVO','BLOQUEADO','CERRADO')
  OR jsonb_typeof(p_payload->'expected_snapshot') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'BUDGET_UPDATE570_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 amount:=(p_payload->>'monto_presupuestado')::numeric;
 IF amount<=0 OR amount<>round(amount,2) OR amount>90071992547409.91 THEN RAISE EXCEPTION 'BUDGET_UPDATE570_AMOUNT_INVALID' USING ERRCODE='22023';END IF;
 fp:=app.financial_master_fingerprint_477(jsonb_build_object('action','UPDATE','id',p_presupuesto_id,'payload',p_payload));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':budget:'||k,0));
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type='BUDGET_UPDATE' AND idempotency_key=k FOR UPDATE;
 IF FOUND THEN
  IF op.actor_id<>p_actor_id OR op.request_fingerprint<>fp OR op.record_id<>p_presupuesto_id THEN RAISE EXCEPTION 'BUDGET_UPDATE570_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023';END IF;
  IF op.result->>'action'='ABANDON_UPDATE' THEN RAISE EXCEPTION 'BUDGET_UPDATE570_ABANDONED' USING ERRCODE='40001';END IF;
  r:=op.result;replayed:=true;
 ELSE
  SELECT * INTO b FROM public.presupuestos WHERE tenant_id=p_tenant_id AND id=p_presupuesto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_UPDATE570_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT * INTO period FROM public.periodos_contables WHERE tenant_id=p_tenant_id AND id=b.periodo_contable_id FOR UPDATE;
  IF NOT FOUND OR upper(coalesce(period.estado,''))<>'ABIERTO' THEN RAISE EXCEPTION 'BUDGET_UPDATE570_PERIOD_NOT_OPEN' USING ERRCODE='23514';END IF;
  IF to_jsonb(b) IS DISTINCT FROM p_payload->'expected_snapshot' THEN RAISE EXCEPTION 'BUDGET_UPDATE570_SNAPSHOT_CHANGED' USING ERRCODE='40001';END IF;
  r:=app.gestionar_presupuesto_tx_480(p_tenant_id,p_actor_id,'UPDATE',p_presupuesto_id,p_payload,k);
  SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type='BUDGET_UPDATE' AND idempotency_key=k FOR UPDATE;
  IF NOT FOUND OR op.actor_id<>p_actor_id OR op.request_fingerprint<>fp THEN RAISE EXCEPTION 'BUDGET_UPDATE570_LEDGER_INVALID' USING ERRCODE='23514';END IF;
 END IF;
 record:=r->'record';
 IF r->>'success' IS DISTINCT FROM 'true' OR r->>'action' IS DISTINCT FROM 'UPDATE' OR jsonb_typeof(record) IS DISTINCT FROM 'object'
  OR r->>'id' IS DISTINCT FROM p_presupuesto_id::text OR record->>'id' IS DISTINCT FROM p_presupuesto_id::text OR record->>'tenant_id' IS DISTINCT FROM p_tenant_id::text
  OR record->>'updated_by' IS DISTINCT FROM p_actor_id::text OR (record->>'monto_presupuestado')::numeric IS DISTINCT FROM amount
  OR record->>'estado' IS DISTINCT FROM p_payload->>'estado' OR record->>'notas' IS DISTINCT FROM nullif(p_payload->>'notas','')
  OR (record-ARRAY['monto_presupuestado','monto_disponible','porcentaje_ejecutado','notas','estado','updated_by','updated_at']) IS DISTINCT FROM ((p_payload->'expected_snapshot')-ARRAY['monto_presupuestado','monto_disponible','porcentaje_ejecutado','notas','estado','updated_by','updated_at'])
  OR (record->>'monto_disponible')::numeric IS DISTINCT FROM amount-(record->>'monto_ejecutado')::numeric-(record->>'monto_comprometido')::numeric
  OR (record->>'porcentaje_ejecutado')::numeric IS DISTINCT FROM round((record->>'monto_ejecutado')::numeric/amount*100,2)
  OR (record->>'updated_at')::timestamptz<(p_payload#>>'{expected_snapshot,updated_at}')::timestamptz THEN
  RAISE EXCEPTION 'BUDGET_UPDATE570_RECEIPT_INVALID' USING ERRCODE='23514';
 END IF;
 r:=r||jsonb_build_object('operation_id',op.id,'tenant_id',p_tenant_id,'actor_id',p_actor_id,'idempotency_key',k,'payload',p_payload,'request_fingerprint',fp,'idempotent',replayed);
 IF NOT replayed THEN UPDATE public.financial_master_operations SET result=r WHERE id=op.id;END IF;
 RETURN r;
END $budget_update570$;
ALTER FUNCTION public.actualizar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.actualizar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text) TO service_role;

-- Entrega local570: compare de fotografía y recibo durable; no tocar RPC550/ACL/stock/factura.
CREATE OR REPLACE FUNCTION public.registrar_entrega_pedido_tx_570(
 p_tenant_id uuid,p_actor_id uuid,p_pedido_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $delivery570$
DECLARE k text:=btrim(coalesce(p_idempotency_key,''));fp text;r jsonb;
 prior_order public.pedidos_venta%ROWTYPE;next_order public.pedidos_venta%ROWTYPE;
 event_row public.logistica_eventos%ROWTYPE;audit_row public.audit_log%ROWTYPE;
 details jsonb;before_details jsonb;replayed boolean:=false;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.logistica.despachar');
 IF p_pedido_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR length(k) NOT BETWEEN 8 AND 200
  OR (SELECT count(*) FROM jsonb_object_keys(p_payload))<>3 OR NOT p_payload ?& ARRAY['estado','notas','expected_snapshot']
  OR p_payload->>'estado' IS DISTINCT FROM 'ENTREGADO' OR jsonb_typeof(p_payload->'notas') IS DISTINCT FROM 'string'
  OR p_payload->>'notas'<>btrim(p_payload->>'notas') OR length(p_payload->>'notas')>10000
  OR jsonb_typeof(p_payload->'expected_snapshot') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'DELIVERY570_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 fp:=app.inventory_operation_fingerprint_455(jsonb_build_object('pedido',p_pedido_id,'actor',p_actor_id,'accion','TRACKING','payload',p_payload));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':logistics:ENTREGA:'||k,0));
 SELECT * INTO event_row FROM public.logistica_eventos WHERE tenant_id=p_tenant_id AND tipo='ENTREGA' AND idempotency_key=k FOR UPDATE;
 IF FOUND THEN
  IF event_row.pedido_id<>p_pedido_id OR event_row.registrado_por<>p_actor_id OR event_row.datos->>'fingerprint' IS DISTINCT FROM fp OR event_row.datos->>'accion' IS DISTINCT FROM 'TRACKING' THEN
   RAISE EXCEPTION 'DELIVERY570_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023';
  END IF;
  r:=event_row.datos->'resultado';replayed:=true;
 ELSE
  SELECT * INTO prior_order FROM public.pedidos_venta WHERE tenant_id=p_tenant_id AND id=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY570_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF to_jsonb(prior_order) IS DISTINCT FROM p_payload->'expected_snapshot' THEN RAISE EXCEPTION 'DELIVERY570_SNAPSHOT_CHANGED' USING ERRCODE='40001';END IF;
  IF prior_order.tracking_estado='ENTREGADO' THEN RAISE EXCEPTION 'DELIVERY570_ALREADY_REGISTERED' USING ERRCODE='23514';END IF;
  IF upper(prior_order.estado::text) NOT IN('DESPACHO_PARCIAL','LISTO_FACTURAR','FACTURADO','COMPLETADO') THEN RAISE EXCEPTION 'DELIVERY570_DISPATCH_REQUIRED' USING ERRCODE='23514';END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]'::jsonb) INTO before_details FROM public.pedidos_venta_detalle d WHERE d.tenant_id=p_tenant_id AND d.pedido_id=p_pedido_id;
  PERFORM public.operar_logistica_tx(p_tenant_id,p_pedido_id,p_actor_id,'TRACKING',p_payload,k);
  SELECT * INTO event_row FROM public.logistica_eventos WHERE tenant_id=p_tenant_id AND tipo='ENTREGA' AND idempotency_key=k FOR UPDATE;
  SELECT * INTO next_order FROM public.pedidos_venta WHERE tenant_id=p_tenant_id AND id=p_pedido_id;
  SELECT * INTO audit_row FROM public.audit_log WHERE tenant_id=p_tenant_id AND user_id=p_actor_id AND table_name='pedidos_venta' AND operation='UPDATE' AND record_id=p_pedido_id::text AND metadata->>'source'='operar_logistica_tx' AND metadata->>'idempotency_key'=k AND new_values->>'accion'='TRACKING' AND new_values->>'tracking_estado'='ENTREGADO';
  IF event_row.id IS NULL OR audit_row.id IS NULL OR event_row.registrado_por<>p_actor_id OR event_row.datos->>'fingerprint' IS DISTINCT FROM fp
   OR next_order.tracking_estado IS DISTINCT FROM 'ENTREGADO' OR next_order.tracking_notas IS DISTINCT FROM p_payload->>'notas'
   OR next_order.tracking_actualizado_en IS DISTINCT FROM event_row.registrado_en
   OR next_order.estado::text IS DISTINCT FROM (CASE WHEN upper(prior_order.estado::text)='FACTURADO' THEN 'COMPLETADO' ELSE prior_order.estado::text END)
   OR (to_jsonb(next_order)-ARRAY['estado','tracking_estado','tracking_actualizado_en','tracking_notas','updated_at']) IS DISTINCT FROM (to_jsonb(prior_order)-ARRAY['estado','tracking_estado','tracking_actualizado_en','tracking_notas','updated_at']) THEN
   RAISE EXCEPTION 'DELIVERY570_RECEIPT_INVALID' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]'::jsonb) INTO details FROM public.pedidos_venta_detalle d WHERE d.tenant_id=p_tenant_id AND d.pedido_id=p_pedido_id;
  IF details IS DISTINCT FROM before_details THEN RAISE EXCEPTION 'DELIVERY570_DETAIL_CHANGED' USING ERRCODE='23514';END IF;
  r:=jsonb_build_object('success',true,'action','TRACKING','tenant_id',p_tenant_id,'actor_id',p_actor_id,'pedido_id',p_pedido_id,'idempotency_key',k,
   'request_fingerprint',fp,'payload',p_payload,'pedido',to_jsonb(next_order),'detalle',details,
   'evento',to_jsonb(event_row)||jsonb_build_object('datos',event_row.datos-'resultado'),'auditoria',to_jsonb(audit_row),'idempotent',false);
  UPDATE public.logistica_eventos SET datos=datos||jsonb_build_object('resultado',r) WHERE id=event_row.id;
 END IF;
 IF r->>'success' IS DISTINCT FROM 'true' OR r->>'action' IS DISTINCT FROM 'TRACKING' OR r->>'tenant_id' IS DISTINCT FROM p_tenant_id::text OR r->>'actor_id' IS DISTINCT FROM p_actor_id::text
  OR r->>'pedido_id' IS DISTINCT FROM p_pedido_id::text OR r->>'idempotency_key' IS DISTINCT FROM k OR r->>'request_fingerprint' IS DISTINCT FROM fp
  OR r->'payload' IS DISTINCT FROM p_payload OR r#>>'{pedido,tracking_estado}' IS DISTINCT FROM 'ENTREGADO'
  OR r#>>'{evento,id}' IS DISTINCT FROM event_row.id::text OR r#>>'{evento,registrado_por}' IS DISTINCT FROM p_actor_id::text
  OR jsonb_typeof(r->'detalle') IS DISTINCT FROM 'array' OR jsonb_typeof(r->'auditoria') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'DELIVERY570_FROZEN_RECEIPT_INCOMPLETE' USING ERRCODE='23514';
 END IF;
 RETURN r||jsonb_build_object('idempotent',replayed);
END $delivery570$;
ALTER FUNCTION public.registrar_entrega_pedido_tx_570(uuid,uuid,uuid,jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.registrar_entrega_pedido_tx_570(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_entrega_pedido_tx_570(uuid,uuid,uuid,jsonb,text) TO service_role;

-- Baja local570: fotografía bloqueada, eliminación atómica y recibo original durable.
CREATE OR REPLACE FUNCTION public.eliminar_presupuesto_tx_570(
 p_tenant_id uuid,p_actor_id uuid,p_presupuesto_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $budget_delete570$
DECLARE k text:=lower(btrim(coalesce(p_idempotency_key,'')));fp text;
 b public.presupuestos%ROWTYPE;period public.periodos_contables%ROWTYPE;
 op public.financial_master_operations%ROWTYPE;r jsonb;replayed boolean:=false;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'contabilidad.presupuestos.eliminar');
 IF p_presupuesto_id IS NULL OR app.to_uuid_or_null(k) IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(p_payload))<>1 OR NOT p_payload?'expected_snapshot'
  OR jsonb_typeof(p_payload->'expected_snapshot') IS DISTINCT FROM 'object'
  OR p_payload#>>'{expected_snapshot,id}' IS DISTINCT FROM p_presupuesto_id::text
  OR p_payload#>>'{expected_snapshot,tenant_id}' IS DISTINCT FROM p_tenant_id::text THEN
  RAISE EXCEPTION 'BUDGET_DELETE570_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 fp:=app.financial_master_fingerprint_477(jsonb_build_object('action','DELETE','id',p_presupuesto_id,'payload',p_payload));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':budget:'||k,0));
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type='BUDGET_DELETE' AND idempotency_key=k FOR UPDATE;
 IF FOUND THEN
  IF op.actor_id<>p_actor_id OR op.request_fingerprint<>fp OR op.record_id<>p_presupuesto_id THEN RAISE EXCEPTION 'BUDGET_DELETE570_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023';END IF;
  r:=op.result;replayed:=true;
 ELSE
  SELECT * INTO b FROM public.presupuestos WHERE tenant_id=p_tenant_id AND id=p_presupuesto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_DELETE570_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT * INTO period FROM public.periodos_contables WHERE tenant_id=p_tenant_id AND id=b.periodo_contable_id FOR UPDATE;
  IF NOT FOUND OR upper(coalesce(period.estado,''))<>'ABIERTO' THEN RAISE EXCEPTION 'BUDGET_DELETE570_PERIOD_NOT_OPEN' USING ERRCODE='23514';END IF;
  IF to_jsonb(b) IS DISTINCT FROM p_payload->'expected_snapshot' THEN RAISE EXCEPTION 'BUDGET_DELETE570_SNAPSHOT_CHANGED' USING ERRCODE='40001';END IF;
  r:=app.gestionar_presupuesto_tx_480(p_tenant_id,p_actor_id,'DELETE',p_presupuesto_id,p_payload,k);
  SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type='BUDGET_DELETE' AND idempotency_key=k FOR UPDATE;
  IF NOT FOUND OR op.actor_id<>p_actor_id OR op.record_id<>p_presupuesto_id OR op.request_fingerprint<>fp THEN RAISE EXCEPTION 'BUDGET_DELETE570_LEDGER_INVALID' USING ERRCODE='23514';END IF;
 END IF;
 IF r->>'success' IS DISTINCT FROM 'true' OR r->>'action' IS DISTINCT FROM 'DELETE'
  OR r->>'id' IS DISTINCT FROM p_presupuesto_id::text OR jsonb_typeof(r->'record') IS DISTINCT FROM 'object'
  OR r->'record' IS DISTINCT FROM p_payload->'expected_snapshot' THEN
  RAISE EXCEPTION 'BUDGET_DELETE570_RECEIPT_INVALID' USING ERRCODE='23514';
 END IF;
 r:=r||jsonb_build_object('operation_id',op.id,'tenant_id',p_tenant_id,'actor_id',p_actor_id,'idempotency_key',k,'payload',p_payload,'request_fingerprint',fp,'idempotent',replayed);
 IF NOT replayed THEN UPDATE public.financial_master_operations SET result=r WHERE id=op.id;END IF;
 RETURN r;
END $budget_delete570$;
ALTER FUNCTION public.eliminar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.eliminar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text) TO service_role;


-- La resolución comparte el lock de la edición: commit previo o fence durable, nunca ausencia temporal.
CREATE OR REPLACE FUNCTION public.resolver_edicion_presupuesto_tx_570(
 p_tenant_id uuid,p_actor_id uuid,p_presupuesto_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $budget_resolve570$
DECLARE k text:=lower(btrim(coalesce(p_idempotency_key,'')));fp text;amount numeric;
 op public.financial_master_operations%ROWTYPE;r jsonb;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'contabilidad.presupuestos.actualizar');
 IF p_presupuesto_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR length(k) NOT BETWEEN 8 AND 200
  OR (SELECT count(*) FROM jsonb_object_keys(p_payload))<>4
  OR NOT p_payload ?& ARRAY['monto_presupuestado','notas','estado','expected_snapshot']
  OR jsonb_typeof(p_payload->'monto_presupuestado') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_payload->'notas') IS DISTINCT FROM 'string'
  OR p_payload->>'notas'<>btrim(p_payload->>'notas') OR length(p_payload->>'notas')>10000
  OR jsonb_typeof(p_payload->'estado') IS DISTINCT FROM 'string' OR p_payload->>'estado' NOT IN('ACTIVO','BLOQUEADO','CERRADO')
  OR jsonb_typeof(p_payload->'expected_snapshot') IS DISTINCT FROM 'object'
  OR p_payload#>>'{expected_snapshot,id}' IS DISTINCT FROM p_presupuesto_id::text
  OR p_payload#>>'{expected_snapshot,tenant_id}' IS DISTINCT FROM p_tenant_id::text THEN
  RAISE EXCEPTION 'BUDGET_RESOLVE570_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 amount:=(p_payload->>'monto_presupuestado')::numeric;
 IF amount<=0 OR amount<>round(amount,2) OR amount>90071992547409.91 THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_AMOUNT_INVALID' USING ERRCODE='22023';END IF;
 fp:=app.financial_master_fingerprint_477(jsonb_build_object('action','UPDATE','id',p_presupuesto_id,'payload',p_payload));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':budget:'||k,0));
 -- Los permisos pueden cambiar mientras se espera el lock de otro request.
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'contabilidad.presupuestos.actualizar');
 SELECT * INTO op FROM public.financial_master_operations WHERE tenant_id=p_tenant_id AND operation_type='BUDGET_UPDATE' AND idempotency_key=k FOR UPDATE;
 IF FOUND THEN
  IF op.actor_id<>p_actor_id OR op.request_fingerprint<>fp OR op.record_id<>p_presupuesto_id THEN RAISE EXCEPTION 'BUDGET_RESOLVE570_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023';END IF;
  IF op.result->>'action'='ABANDON_UPDATE' THEN
   IF op.result->>'success' IS DISTINCT FROM 'true' OR op.result->'payload' IS DISTINCT FROM p_payload
    OR op.result->>'id' IS DISTINCT FROM p_presupuesto_id::text OR op.result->>'operation_id' IS DISTINCT FROM op.id::text
    OR op.result->>'tenant_id' IS DISTINCT FROM p_tenant_id::text OR op.result->>'actor_id' IS DISTINCT FROM p_actor_id::text
    OR op.result->>'idempotency_key' IS DISTINCT FROM k OR op.result->>'request_fingerprint' IS DISTINCT FROM fp
    OR jsonb_typeof(op.result->'abandoned_at') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'BUDGET_RESOLVE570_RECEIPT_INVALID' USING ERRCODE='23514';
   END IF;
   RETURN op.result||jsonb_build_object('idempotent',true);
  END IF;
  -- Sólo replay validado; no vuelve a ejecutar una edición ni requiere que siga existiendo la fila.
  RETURN public.actualizar_presupuesto_tx_570(p_tenant_id,p_actor_id,p_presupuesto_id,p_payload,k);
 END IF;
 INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,request_fingerprint,actor_id,record_id)
 VALUES(p_tenant_id,'BUDGET_UPDATE',k,fp,p_actor_id,p_presupuesto_id) RETURNING * INTO op;
 r:=jsonb_build_object('success',true,'action','ABANDON_UPDATE','id',p_presupuesto_id,'operation_id',op.id,
  'tenant_id',p_tenant_id,'actor_id',p_actor_id,'idempotency_key',k,'payload',p_payload,
  'request_fingerprint',fp,'idempotent',false,'abandoned_at',clock_timestamp());
 UPDATE public.financial_master_operations SET result=r WHERE id=op.id;
 RETURN r;
END $budget_resolve570$;
ALTER FUNCTION public.resolver_edicion_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolver_edicion_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_edicion_presupuesto_tx_570(uuid,uuid,uuid,jsonb,text) TO service_role;

-- Original personalized request and computed economic snapshot seal with the calculation.
-- No backfill: historical calculations cannot be attributed to a new browser UUID.
CREATE TABLE IF NOT EXISTS app.rrhh_calculation_operations_570 (
 tenant_id uuid NOT NULL, idempotency_key uuid NOT NULL, operation_id uuid NOT NULL UNIQUE,
 actor_id uuid NOT NULL, planilla_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('CALCULATE','ABANDON_CALCULATION')),
 request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),
 request_fingerprint text NOT NULL, result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 confirmed_at timestamptz NOT NULL, PRIMARY KEY(tenant_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS rrhh_calculation_once_570
 ON app.rrhh_calculation_operations_570(tenant_id,planilla_id) WHERE action='CALCULATE';
ALTER TABLE app.rrhh_calculation_operations_570 OWNER TO postgres;
ALTER TABLE app.rrhh_calculation_operations_570 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rrhh_calculation_operations_570 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.rrhh_calculation_operations_570 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.assert_calculation_request_570(p_tenant_id uuid,p_actor_id uuid,p_planilla_id uuid,p_key uuid,p_request jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $calculation_request570$
BEGIN
 PERFORM app.assert_rrhh_permission_495(p_tenant_id,p_actor_id,'rrhh.planillas.calculate');
 IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_planilla_id IS NULL OR p_key IS NULL
  OR COALESCE(jsonb_typeof(p_request),'null')<>'object'
  OR COALESCE(jsonb_typeof(p_request->'empleados'),'null')<>'array'
  OR jsonb_array_length(p_request->'empleados')=0
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN('empleados','eps_cobertura')) THEN
  RAISE EXCEPTION 'CALCULATION570_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'empleados') e WHERE COALESCE(jsonb_typeof(e),'null')<>'object' OR app.to_uuid_or_null(e->>'empleado_id') IS NULL)
  OR (SELECT count(DISTINCT app.to_uuid_or_null(e->>'empleado_id')) FROM jsonb_array_elements(p_request->'empleados') e)<>jsonb_array_length(p_request->'empleados') THEN
  RAISE EXCEPTION 'CALCULATION570_REQUEST_EMPLOYEES_INVALID' USING ERRCODE='22023';
 END IF;
END $calculation_request570$;

CREATE OR REPLACE FUNCTION public.leer_recibo_calculo_planilla_570(p_tenant_id uuid,p_actor_id uuid,p_planilla_id uuid,p_key uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $calculation_read570$
DECLARE op app.rrhh_calculation_operations_570%ROWTYPE;
BEGIN
 PERFORM app.assert_calculation_request_570(p_tenant_id,p_actor_id,p_planilla_id,p_key,p_request);
 -- Serializes lookup, calculation and explicit abandonment of the same UUID.
 PERFORM pg_advisory_xact_lock(hashtextextended('calculation570:'||p_tenant_id::text||':'||p_key::text,570));
 PERFORM app.assert_rrhh_permission_495(p_tenant_id,p_actor_id,'rrhh.planillas.calculate');
 SELECT * INTO op FROM app.rrhh_calculation_operations_570 WHERE tenant_id=p_tenant_id AND idempotency_key=p_key;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF op.actor_id IS DISTINCT FROM p_actor_id OR op.planilla_id IS DISTINCT FROM p_planilla_id OR op.request IS DISTINCT FROM p_request
  OR op.request_fingerprint IS DISTINCT FROM app.fingerprint_rrhh_495(p_request) THEN
  RAISE EXCEPTION 'CALCULATION570_KEY_CONFLICT' USING ERRCODE='40001';
 END IF;
 RETURN op.result||jsonb_build_object('idempotent',true);
END $calculation_read570$;

CREATE OR REPLACE FUNCTION public.guardar_calculo_planilla_operacion_tx_570(
 p_tenant_id uuid,p_actor_id uuid,p_planilla_id uuid,p_key uuid,p_request jsonb,p_empleados jsonb,p_kind text,p_eps jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $calculation_write570$
DECLARE previous jsonb;r jsonb;v_row jsonb;requested_employee jsonb;operation jsonb;oid uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();
 totals jsonb;field text;
BEGIN
 previous:=public.leer_recibo_calculo_planilla_570(p_tenant_id,p_actor_id,p_planilla_id,p_key,p_request);
 IF previous IS NOT NULL THEN
  IF previous->'calculation_operation'->>'action'='ABANDON_CALCULATION' THEN RAISE EXCEPTION 'CALCULATION570_ABANDONED' USING ERRCODE='40001';END IF;
  RETURN previous;
 END IF;
 IF p_kind IS NULL OR p_kind NOT IN('ORDINARY','GRATIFICATION','EPS') OR (p_kind='EPS') IS DISTINCT FROM (p_eps IS NOT NULL)
  OR COALESCE(jsonb_typeof(p_empleados),'null')<>'array' OR jsonb_array_length(p_empleados)=0 THEN
  RAISE EXCEPTION 'CALCULATION570_COMPUTED_INVALID' USING ERRCODE='22023';
 END IF;
 IF (SELECT array_agg(app.to_uuid_or_null(e->>'empleado_id') ORDER BY app.to_uuid_or_null(e->>'empleado_id')) FROM jsonb_array_elements(p_empleados)e)
  IS DISTINCT FROM (SELECT array_agg(app.to_uuid_or_null(e->>'empleado_id') ORDER BY app.to_uuid_or_null(e->>'empleado_id')) FROM jsonb_array_elements(p_request->'empleados')e) THEN
  RAISE EXCEPTION 'CALCULATION570_COMPUTED_EMPLOYEES_CONFLICT' USING ERRCODE='22023';
 END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_empleados) LOOP
  SELECT value INTO requested_employee FROM jsonb_array_elements(p_request->'empleados')
   WHERE app.to_uuid_or_null(value->>'empleado_id')=app.to_uuid_or_null(v_row->>'empleado_id');
  FOREACH field IN ARRAY ARRAY['dias_trabajados','horas_extras_25','horas_extras_35','tardanzas_minutos','faltas'] LOOP
   IF COALESCE(jsonb_typeof(v_row->field),'null')<>'number' OR COALESCE(jsonb_typeof(requested_employee->field),'null')<>'number'
    OR v_row->field IS DISTINCT FROM requested_employee->field THEN RAISE EXCEPTION 'CALCULATION570_ORIGINAL_INPUT_CONFLICT' USING ERRCODE='22023';END IF;
  END LOOP;

  FOREACH field IN ARRAY ARRAY['total_ingresos','total_descuentos','total_aportes','neto_pagar'] LOOP
   IF COALESCE(jsonb_typeof(v_row->field),'null')<>'number' OR (v_row->>field)::numeric<0 THEN RAISE EXCEPTION 'CALCULATION570_COMPUTED_MONEY_INVALID' USING ERRCODE='22023';END IF;
  END LOOP;
 END LOOP;
 -- Keep existing EPS tenant -> planilla lock order; these established RPCs own payroll locks.
 r:=CASE p_kind
  WHEN 'EPS' THEN public.guardar_calculo_planilla_eps_tx_570(p_tenant_id,p_planilla_id,p_empleados,p_actor_id,p_eps)
  WHEN 'GRATIFICATION' THEN public.guardar_calculo_planilla_gratificacion_tx_570(p_tenant_id,p_planilla_id,p_empleados,p_actor_id)
  ELSE public.guardar_calculo_planilla_tx(p_tenant_id,p_planilla_id,p_empleados,p_actor_id) END;
 IF r->'success' IS DISTINCT FROM 'true'::jsonb OR r->>'planillaId' IS DISTINCT FROM p_planilla_id::text
  OR r->'idempotent' IS DISTINCT FROM 'false'::jsonb THEN
  RAISE EXCEPTION 'CALCULATION570_ALREADY_CALCULATED_OR_UNKNOWN' USING ERRCODE='23514';
 END IF;
 SELECT jsonb_build_object('totalEmpleados',count(*),'totalIngresos',sum(round((e->>'total_ingresos')::numeric,2)),
  'totalDescuentos',sum(round((e->>'total_descuentos')::numeric,2)),'totalAportes',sum(round((e->>'total_aportes')::numeric,2)),
  'totalNeto',sum(round((e->>'neto_pagar')::numeric,2))) INTO totals FROM jsonb_array_elements(p_empleados)e;
 FOR field IN SELECT jsonb_object_keys(totals) LOOP
  IF r->field IS DISTINCT FROM totals->field THEN RAISE EXCEPTION 'CALCULATION570_RECEIPT_TOTALS_UNKNOWN' USING ERRCODE='23514';END IF;
 END LOOP;
 operation:=jsonb_build_object('version',1,'action','CALCULATE','operation_id',oid,'idempotency_key',p_key,
  'tenant_id',p_tenant_id,'actor_id',p_actor_id,'planilla_id',p_planilla_id,'request',p_request,
  'request_fingerprint',app.fingerprint_rrhh_495(p_request),'calculated_employees',p_empleados,'rpc_kind',p_kind,
  'eps_snapshot',p_eps,'confirmed_at',stamp);
 r:=r||jsonb_build_object('calculation_operation',operation);
 INSERT INTO app.rrhh_calculation_operations_570 VALUES(p_tenant_id,p_key,oid,p_actor_id,p_planilla_id,'CALCULATE',p_request,app.fingerprint_rrhh_495(p_request),r,stamp);
 RETURN r;
END $calculation_write570$;

CREATE OR REPLACE FUNCTION public.resolver_calculo_planilla_tx_570(p_tenant_id uuid,p_actor_id uuid,p_planilla_id uuid,p_key uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $calculation_resolve570$
DECLARE r jsonb;oid uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();
BEGIN
 r:=public.leer_recibo_calculo_planilla_570(p_tenant_id,p_actor_id,p_planilla_id,p_key,p_request);
 IF r IS NOT NULL THEN RETURN r;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.planillas WHERE tenant_id=p_tenant_id AND id=p_planilla_id) THEN RAISE EXCEPTION 'CALCULATION570_PLANILLA_NOT_FOUND' USING ERRCODE='P0002';END IF;
 r:=jsonb_build_object('success',true,'planillaId',p_planilla_id,'idempotent',false,'calculation_operation',
  jsonb_build_object('version',1,'action','ABANDON_CALCULATION','operation_id',oid,'idempotency_key',p_key,
   'tenant_id',p_tenant_id,'actor_id',p_actor_id,'planilla_id',p_planilla_id,'request',p_request,
   'request_fingerprint',app.fingerprint_rrhh_495(p_request),'confirmed_at',stamp));
 INSERT INTO app.rrhh_calculation_operations_570 VALUES(p_tenant_id,p_key,oid,p_actor_id,p_planilla_id,'ABANDON_CALCULATION',p_request,app.fingerprint_rrhh_495(p_request),r,stamp);
 RETURN r;
END $calculation_resolve570$;

ALTER FUNCTION app.assert_calculation_request_570(uuid,uuid,uuid,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.leer_recibo_calculo_planilla_570(uuid,uuid,uuid,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.guardar_calculo_planilla_operacion_tx_570(uuid,uuid,uuid,uuid,jsonb,jsonb,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.resolver_calculo_planilla_tx_570(uuid,uuid,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.assert_calculation_request_570(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.leer_recibo_calculo_planilla_570(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guardar_calculo_planilla_operacion_tx_570(uuid,uuid,uuid,uuid,jsonb,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resolver_calculo_planilla_tx_570(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leer_recibo_calculo_planilla_570(uuid,uuid,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_calculo_planilla_operacion_tx_570(uuid,uuid,uuid,uuid,jsonb,jsonb,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_calculo_planilla_tx_570(uuid,uuid,uuid,uuid,jsonb) TO service_role;

-- Whole original creation + reserved calculation body; no historical key/body backfill.
CREATE TABLE IF NOT EXISTS app.rrhh_payroll_creation_operations_570 (
 tenant_id uuid NOT NULL,idempotency_key uuid NOT NULL,calculation_key uuid NOT NULL,
 operation_id uuid NOT NULL UNIQUE,actor_id uuid NOT NULL,planilla_id uuid,
 action text NOT NULL CHECK(action IN('CREATE_WITH_CALCULATION','ABANDON_CREATION')),
 request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),confirmed_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,idempotency_key),UNIQUE(tenant_id,calculation_key),
 CHECK(idempotency_key<>calculation_key),CHECK((action='CREATE_WITH_CALCULATION')=(planilla_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS rrhh_payroll_creation_once_570
 ON app.rrhh_payroll_creation_operations_570(tenant_id,planilla_id) WHERE action='CREATE_WITH_CALCULATION';
ALTER TABLE app.rrhh_payroll_creation_operations_570 OWNER TO postgres;
ALTER TABLE app.rrhh_payroll_creation_operations_570 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rrhh_payroll_creation_operations_570 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.rrhh_payroll_creation_operations_570 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.assert_payroll_creation_request_570(p_tenant_id uuid,p_actor_id uuid,p_key uuid,p_request jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $payroll_create_request570$
BEGIN
 PERFORM app.assert_rrhh_permission_495(p_tenant_id,p_actor_id,'rrhh.planillas.create');
 PERFORM app.assert_rrhh_permission_495(p_tenant_id,p_actor_id,'rrhh.planillas.calculate');
 IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_key IS NULL OR COALESCE(jsonb_typeof(p_request),'null')<>'object'
  OR app.to_uuid_or_null(p_request->>'idempotency_key') IS DISTINCT FROM p_key
  OR app.to_uuid_or_null(p_request->>'calculo_idempotency_key') IS NULL
  OR app.to_uuid_or_null(p_request->>'calculo_idempotency_key')=p_key
  OR COALESCE(p_request->>'periodo','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  OR COALESCE(p_request->>'pais_codigo','') NOT IN('PE','AR','CO')
  OR p_request->>'moneda' IS DISTINCT FROM (CASE p_request->>'pais_codigo' WHEN 'PE' THEN 'PEN' WHEN 'AR' THEN 'ARS' ELSE 'COP' END)
  OR COALESCE(jsonb_typeof(p_request->'calculo_original'),'null')<>'object'
  OR COALESCE(jsonb_typeof(p_request->'calculo_original'->'empleados'),'null')<>'array'
  OR jsonb_array_length(p_request->'calculo_original'->'empleados')=0
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN('periodo','observaciones','metadata','idempotency_key','calculo_idempotency_key','calculo_original','pais_codigo','moneda')) THEN
  RAISE EXCEPTION 'PAYROLL_CREATION570_ORIGINAL_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'calculo_original'->'empleados') item
    WHERE COALESCE(jsonb_typeof(item),'null')<>'object' OR app.to_uuid_or_null(item->>'empleado_id') IS NULL)
  OR (SELECT count(DISTINCT app.to_uuid_or_null(item->>'empleado_id')) FROM jsonb_array_elements(p_request->'calculo_original'->'empleados') item)<>jsonb_array_length(p_request->'calculo_original'->'empleados') THEN
  RAISE EXCEPTION 'PAYROLL_CREATION570_EMPLOYEES_INVALID' USING ERRCODE='22023';
 END IF;
END $payroll_create_request570$;

CREATE OR REPLACE FUNCTION app.guard_payroll_creation_key_570(p_tenant_id uuid,p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $payroll_create_guard570$
BEGIN
 IF EXISTS(SELECT 1 FROM app.rrhh_payroll_creation_operations_570 WHERE tenant_id=p_tenant_id
   AND idempotency_key=app.to_uuid_or_null(lower(btrim(p_key))) AND action='ABANDON_CREATION') THEN
  RAISE EXCEPTION 'PAYROLL_CREATION570_ABANDONED' USING ERRCODE='40001';
 END IF;
END $payroll_create_guard570$;

CREATE OR REPLACE FUNCTION public.leer_recibo_alta_planilla_570(p_tenant_id uuid,p_actor_id uuid,p_key uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $payroll_create_read570$
DECLARE op app.rrhh_payroll_creation_operations_570%ROWTYPE;child uuid;
BEGIN
 PERFORM app.assert_payroll_creation_request_570(p_tenant_id,p_actor_id,p_key,p_request);
 child:=app.to_uuid_or_null(p_request->>'calculo_idempotency_key');
 -- Same creation495 lock closes the legacy late-POST path; child lock reserves one whole intention.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':CREAR:'||lower(p_key::text),495));
 PERFORM pg_advisory_xact_lock(hashtextextended('calculation570:'||p_tenant_id::text||':'||child::text,570));
 PERFORM app.assert_payroll_creation_request_570(p_tenant_id,p_actor_id,p_key,p_request);
 SELECT * INTO op FROM app.rrhh_payroll_creation_operations_570 WHERE tenant_id=p_tenant_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF op.actor_id IS DISTINCT FROM p_actor_id OR op.request IS DISTINCT FROM p_request OR op.calculation_key IS DISTINCT FROM child
   OR op.request_fingerprint IS DISTINCT FROM app.fingerprint_rrhh_495(p_request) THEN RAISE EXCEPTION 'PAYROLL_CREATION570_KEY_CONFLICT' USING ERRCODE='40001';END IF;
  RETURN op.result||jsonb_build_object('idempotent',true);
 END IF;
 IF EXISTS(SELECT 1 FROM app.rrhh_payroll_creation_operations_570 WHERE tenant_id=p_tenant_id AND calculation_key=child)
  OR EXISTS(SELECT 1 FROM app.rrhh_calculation_operations_570 WHERE tenant_id=p_tenant_id AND idempotency_key=child) THEN
  RAISE EXCEPTION 'PAYROLL_CREATION570_CHILD_KEY_ALREADY_USED' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.rrhh_planilla_operaciones_495 WHERE tenant_id=p_tenant_id AND tipo='CREAR' AND lower(btrim(idempotency_key))=lower(p_key::text)) THEN
  RAISE EXCEPTION 'PAYROLL_CREATION570_LEGACY_KEY_ALREADY_USED' USING ERRCODE='40001';
 END IF;
 RETURN NULL;
END $payroll_create_read570$;

CREATE OR REPLACE FUNCTION public.crear_planilla_operacion_tx_570(p_tenant_id uuid,p_actor_id uuid,p_key uuid,p_request jsonb,p_planilla jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $payroll_create_write570$
DECLARE r jsonb;previous jsonb;metadata jsonb;expected jsonb;operation jsonb;oid uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();
BEGIN
 previous:=public.leer_recibo_alta_planilla_570(p_tenant_id,p_actor_id,p_key,p_request);
 IF previous IS NOT NULL THEN
  IF previous->'creation_operation'->>'action'='ABANDON_CREATION' THEN RAISE EXCEPTION 'PAYROLL_CREATION570_ABANDONED' USING ERRCODE='40001';END IF;
  RETURN previous;
 END IF;
 metadata:=CASE WHEN jsonb_typeof(p_request->'metadata')='object' THEN p_request->'metadata' ELSE '{}'::jsonb END;
 IF COALESCE(p_request->>'observaciones','')<>'' THEN metadata:=metadata||jsonb_build_object('observaciones',btrim(p_request->>'observaciones',chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)));END IF;
 expected:=jsonb_build_object('periodo',p_request->>'periodo','pais_codigo',p_request->>'pais_codigo','moneda',p_request->>'moneda','metadata',metadata);
 IF p_planilla IS DISTINCT FROM expected THEN RAISE EXCEPTION 'PAYROLL_CREATION570_NORMALIZED_INPUT_CONFLICT' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND upper(pais)=p_request->>'pais_codigo') THEN RAISE EXCEPTION 'PAYROLL_CREATION570_CURRENT_COUNTRY_CONFLICT' USING ERRCODE='40001';END IF;
 r:=public.crear_planilla_tx_495(p_tenant_id,p_planilla,p_actor_id,p_key::text);
 IF r->'success' IS DISTINCT FROM 'true'::jsonb OR r->'idempotent' IS DISTINCT FROM 'false'::jsonb OR app.to_uuid_or_null(r->>'id') IS NULL
  OR app.to_uuid_or_null(r->>'tenant_id') IS DISTINCT FROM p_tenant_id OR r->>'periodo' IS DISTINCT FROM p_request->>'periodo'
  OR r->>'pais_codigo' IS DISTINCT FROM p_request->>'pais_codigo' OR r->>'moneda' IS DISTINCT FROM p_request->>'moneda'
  OR r->>'estado' IS DISTINCT FROM 'borrador' OR r->>'estado_pago' IS DISTINCT FROM 'pendiente'
  OR app.to_uuid_or_null(r->'metadata'->>'creada_por') IS DISTINCT FROM p_actor_id
  OR (r->'metadata')-ARRAY['creada_por','creada_en'] IS DISTINCT FROM metadata-ARRAY['creada_por','creada_en'] THEN
  RAISE EXCEPTION 'PAYROLL_CREATION570_RECEIPT_UNKNOWN' USING ERRCODE='23514';
 END IF;
 operation:=jsonb_build_object('version',1,'action','CREATE_WITH_CALCULATION','operation_id',oid,'idempotency_key',p_key,
  'calculation_key',app.to_uuid_or_null(p_request->>'calculo_idempotency_key'),'tenant_id',p_tenant_id,'actor_id',p_actor_id,
  'planilla_id',r->>'id','request',p_request,'request_fingerprint',app.fingerprint_rrhh_495(p_request),'normalized_planilla',p_planilla,'confirmed_at',stamp);
 r:=r||jsonb_build_object('creation_operation',operation);
 INSERT INTO app.rrhh_payroll_creation_operations_570 VALUES(p_tenant_id,p_key,app.to_uuid_or_null(p_request->>'calculo_idempotency_key'),oid,p_actor_id,(r->>'id')::uuid,'CREATE_WITH_CALCULATION',p_request,app.fingerprint_rrhh_495(p_request),r,stamp);
 RETURN r;
END $payroll_create_write570$;

CREATE OR REPLACE FUNCTION public.resolver_alta_planilla_tx_570(p_tenant_id uuid,p_actor_id uuid,p_key uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $payroll_create_resolve570$
DECLARE r jsonb;oid uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();
BEGIN
 r:=public.leer_recibo_alta_planilla_570(p_tenant_id,p_actor_id,p_key,p_request);IF r IS NOT NULL THEN RETURN r;END IF;
 r:=jsonb_build_object('success',true,'idempotent',false,'creation_operation',jsonb_build_object('version',1,'action','ABANDON_CREATION',
  'operation_id',oid,'idempotency_key',p_key,'calculation_key',app.to_uuid_or_null(p_request->>'calculo_idempotency_key'),
  'tenant_id',p_tenant_id,'actor_id',p_actor_id,'planilla_id',NULL,'request',p_request,'request_fingerprint',app.fingerprint_rrhh_495(p_request),'confirmed_at',stamp));
 INSERT INTO app.rrhh_payroll_creation_operations_570 VALUES(p_tenant_id,p_key,app.to_uuid_or_null(p_request->>'calculo_idempotency_key'),oid,p_actor_id,NULL,'ABANDON_CREATION',p_request,app.fingerprint_rrhh_495(p_request),r,stamp);
 RETURN r;
END $payroll_create_resolve570$;

ALTER FUNCTION app.assert_payroll_creation_request_570(uuid,uuid,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION app.guard_payroll_creation_key_570(uuid,text) OWNER TO postgres;
ALTER FUNCTION public.leer_recibo_alta_planilla_570(uuid,uuid,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.crear_planilla_operacion_tx_570(uuid,uuid,uuid,jsonb,jsonb) OWNER TO postgres;
ALTER FUNCTION public.resolver_alta_planilla_tx_570(uuid,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.assert_payroll_creation_request_570(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.guard_payroll_creation_key_570(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.leer_recibo_alta_planilla_570(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crear_planilla_operacion_tx_570(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resolver_alta_planilla_tx_570(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leer_recibo_alta_planilla_570(uuid,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_planilla_operacion_tx_570(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_alta_planilla_tx_570(uuid,uuid,uuid,jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.crear_planilla_tx_495(
  p_tenant_id uuid,
  p_planilla jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_periodo text := NULLIF(btrim(COALESCE(p_planilla->>'periodo', '')), '');
  v_pais text := upper(COALESCE(NULLIF(btrim(p_planilla->>'pais_codigo'), ''), 'PE'));
  v_moneda text := upper(COALESCE(NULLIF(btrim(p_planilla->>'moneda'), ''), 'PEN'));
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_payload jsonb;
  v_fingerprint text;
  v_existing public.rrhh_planilla_operaciones_495%ROWTYPE;
  v_planilla public.planillas%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_actor_id, 'rrhh.planillas.create');
  IF jsonb_typeof(p_planilla) <> 'object'
     OR v_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 180 THEN
    RAISE EXCEPTION 'Planilla, período YYYY-MM y clave idempotente son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  IF (v_pais, v_moneda) NOT IN (('PE','PEN'), ('AR','ARS'), ('CO','COP')) THEN
    RAISE EXCEPTION 'País/moneda laboral no permitido: %/%', v_pais, v_moneda
      USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'periodo', v_periodo, 'pais_codigo', v_pais, 'moneda', v_moneda,
    'metadata', COALESCE(p_planilla->'metadata', '{}'::jsonb)
  );
  v_fingerprint := app.fingerprint_rrhh_495(v_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':CREAR:' || lower(v_key), 495));
  PERFORM app.assert_rrhh_permission_495(p_tenant_id,p_actor_id,'rrhh.planillas.create');
  PERFORM app.guard_payroll_creation_key_570(p_tenant_id,v_key);

  SELECT * INTO v_existing
  FROM public.rrhh_planilla_operaciones_495
  WHERE tenant_id = p_tenant_id AND tipo = 'CREAR'
    AND lower(btrim(idempotency_key)) = lower(v_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM p_actor_id
       OR v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'La clave idempotente de alta ya pertenece a otra intención o actor'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':PLANILLA:' || v_periodo, 495));
  IF EXISTS (
    SELECT 1 FROM public.planillas
    WHERE tenant_id = p_tenant_id AND periodo = v_periodo
      AND lower(estado::text) <> 'anulada'
  ) THEN
    RAISE EXCEPTION 'Ya existe una planilla no anulada para el período %', v_periodo
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.planillas (
    tenant_id, periodo, pais_codigo, moneda, estado, estado_pago,
    total_ingresos, total_descuentos, total_aportes, total_neto,
    total_pagado, asientos_generados, metadata
  ) VALUES (
    p_tenant_id, v_periodo, v_pais, v_moneda, 'borrador', 'pendiente',
    0, 0, 0, 0, 0, 'false',
    COALESCE(p_planilla->'metadata', '{}'::jsonb) || jsonb_build_object(
      'creada_por', p_actor_id, 'creada_en', clock_timestamp()
    )
  ) RETURNING * INTO v_planilla;

  v_result := jsonb_build_object(
    'success', true, 'id', v_planilla.id, 'tenant_id', p_tenant_id,
    'periodo', v_periodo, 'pais_codigo', v_pais, 'moneda', v_moneda,
    'estado', 'borrador', 'estado_pago', 'pendiente', 'metadata', v_planilla.metadata,
    'idempotent', false
  );
  INSERT INTO public.rrhh_planilla_operaciones_495 (
    tenant_id, tipo, planilla_id, idempotency_key, request_fingerprint,
    actor_id, resultado
  ) VALUES (
    p_tenant_id, 'CREAR', v_planilla.id, v_key, v_fingerprint, p_actor_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.assert_calculation_request_570(p_tenant_id uuid,p_actor_id uuid,p_planilla_id uuid,p_key uuid,p_request jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $calculation_request570$
DECLARE linked app.rrhh_payroll_creation_operations_570%ROWTYPE;
BEGIN
 PERFORM app.assert_rrhh_permission_495(p_tenant_id,p_actor_id,'rrhh.planillas.calculate');
 IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_planilla_id IS NULL OR p_key IS NULL
  OR COALESCE(jsonb_typeof(p_request),'null')<>'object'
  OR COALESCE(jsonb_typeof(p_request->'empleados'),'null')<>'array'
  OR jsonb_array_length(p_request->'empleados')=0
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN('empleados','eps_cobertura')) THEN
  RAISE EXCEPTION 'CALCULATION570_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'empleados') e WHERE COALESCE(jsonb_typeof(e),'null')<>'object' OR app.to_uuid_or_null(e->>'empleado_id') IS NULL)
  OR (SELECT count(DISTINCT app.to_uuid_or_null(e->>'empleado_id')) FROM jsonb_array_elements(p_request->'empleados') e)<>jsonb_array_length(p_request->'empleados') THEN
  RAISE EXCEPTION 'CALCULATION570_REQUEST_EMPLOYEES_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT * INTO linked FROM app.rrhh_payroll_creation_operations_570 WHERE tenant_id=p_tenant_id AND calculation_key=p_key;
 IF FOUND AND (linked.action IS DISTINCT FROM 'CREATE_WITH_CALCULATION' OR linked.actor_id IS DISTINCT FROM p_actor_id
  OR linked.planilla_id IS DISTINCT FROM p_planilla_id OR linked.request->'calculo_original' IS DISTINCT FROM p_request) THEN
  RAISE EXCEPTION 'CALCULATION570_RESERVED_CREATION_CHILD_CONFLICT' USING ERRCODE='40001';
 END IF;
END $calculation_request570$;

CREATE OR REPLACE FUNCTION public.resolver_calculo_planilla_tx_570(p_tenant_id uuid,p_actor_id uuid,p_planilla_id uuid,p_key uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $calculation_resolve570$
DECLARE r jsonb;oid uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();
BEGIN
 r:=public.leer_recibo_calculo_planilla_570(p_tenant_id,p_actor_id,p_planilla_id,p_key,p_request);
 IF r IS NOT NULL THEN RETURN r;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.planillas WHERE tenant_id=p_tenant_id AND id=p_planilla_id)
  AND NOT EXISTS(SELECT 1 FROM app.rrhh_payroll_creation_operations_570 WHERE tenant_id=p_tenant_id AND calculation_key=p_key AND actor_id=p_actor_id AND planilla_id=p_planilla_id AND action='CREATE_WITH_CALCULATION' AND request->'calculo_original'=p_request) THEN RAISE EXCEPTION 'CALCULATION570_PLANILLA_NOT_FOUND' USING ERRCODE='P0002';END IF;
 r:=jsonb_build_object('success',true,'planillaId',p_planilla_id,'idempotent',false,'calculation_operation',
  jsonb_build_object('version',1,'action','ABANDON_CALCULATION','operation_id',oid,'idempotency_key',p_key,
   'tenant_id',p_tenant_id,'actor_id',p_actor_id,'planilla_id',p_planilla_id,'request',p_request,
   'request_fingerprint',app.fingerprint_rrhh_495(p_request),'confirmed_at',stamp));
 INSERT INTO app.rrhh_calculation_operations_570 VALUES(p_tenant_id,p_key,oid,p_actor_id,p_planilla_id,'ABANDON_CALCULATION',p_request,app.fingerprint_rrhh_495(p_request),r,stamp);
 RETURN r;
END $calculation_resolve570$;


CREATE OR REPLACE FUNCTION public.leer_recibo_calculo_planilla_570(p_tenant_id uuid,p_actor_id uuid,p_planilla_id uuid,p_key uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $calculation_read570$
DECLARE op app.rrhh_calculation_operations_570%ROWTYPE;
BEGIN
 PERFORM app.assert_calculation_request_570(p_tenant_id,p_actor_id,p_planilla_id,p_key,p_request);
 -- Serializes lookup, calculation and explicit abandonment of the same UUID.
 PERFORM pg_advisory_xact_lock(hashtextextended('calculation570:'||p_tenant_id::text||':'||p_key::text,570));
 PERFORM app.assert_calculation_request_570(p_tenant_id,p_actor_id,p_planilla_id,p_key,p_request);
 SELECT * INTO op FROM app.rrhh_calculation_operations_570 WHERE tenant_id=p_tenant_id AND idempotency_key=p_key;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF op.actor_id IS DISTINCT FROM p_actor_id OR op.planilla_id IS DISTINCT FROM p_planilla_id OR op.request IS DISTINCT FROM p_request
  OR op.request_fingerprint IS DISTINCT FROM app.fingerprint_rrhh_495(p_request) THEN
  RAISE EXCEPTION 'CALCULATION570_KEY_CONFLICT' USING ERRCODE='40001';
 END IF;
 RETURN op.result||jsonb_build_object('idempotent',true);
END $calculation_read570$;

-- El abandono sólo reserva la identidad original. No modifica stock ni contabilidad.
CREATE TABLE app.inventory_operation_abandonments_570 (
 tenant_id uuid NOT NULL, type text NOT NULL CHECK(type IN('AJUSTE','TRANSFERENCIA')),
 idempotency_key text NOT NULL CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 180 AND idempotency_key=btrim(idempotency_key)),
 actor_id uuid NOT NULL, operation_id uuid NOT NULL UNIQUE,
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'), confirmed_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,type,idempotency_key)
);
ALTER TABLE app.inventory_operation_abandonments_570 OWNER TO postgres;
ALTER TABLE app.inventory_operation_abandonments_570 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inventory_operation_abandonments_570 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.inventory_operation_abandonments_570 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app.inventory_operation_request_570(p_type text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,public,app,pg_temp
AS $inventory_request570$
DECLARE k text;v numeric;ids text[];required text[];allowed text[];r jsonb;m text;
BEGIN
 IF p_type IS NULL OR p_type NOT IN('AJUSTE','TRANSFERENCIA') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'INVENTORY_RESOLUTION570_REQUEST_INVALID' USING ERRCODE='22023';END IF;
 IF p_type='AJUSTE' THEN
  required:=ARRAY['producto_id','almacen_id','delta','motivo'];
  ids:=ARRAY['producto_id','almacen_id','ubicacion_id','centro_costo_id'];
  allowed:=required||ARRAY['ubicacion_id','centro_costo_id'];k:='delta';
 ELSE
  required:=ARRAY['producto_id','almacen_origen_id','almacen_destino_id','cantidad','motivo'];
  ids:=ARRAY['producto_id','almacen_origen_id','almacen_destino_id','ubicacion_origen_id','ubicacion_destino_id','guia_remision_id'];
  allowed:=required||ARRAY['ubicacion_origen_id','ubicacion_destino_id','lote','fecha_expiracion','guia_remision_id'];k:='cantidad';
 END IF;
 IF NOT p_payload ?& required OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) x WHERE NOT x=ANY(allowed))
  OR jsonb_typeof(p_payload->k) IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_payload->'motivo') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'INVENTORY_RESOLUTION570_REQUEST_INVALID' USING ERRCODE='22023';END IF;
 v:=(p_payload->>k)::numeric;m:=nullif(btrim(p_payload->>'motivo'),'');
 IF v=0 OR abs(v)>999999999999 OR (p_type='TRANSFERENCIA' AND v<0) OR m IS NULL OR length(m)>500 THEN
  RAISE EXCEPTION 'INVENTORY_RESOLUTION570_REQUEST_INVALID' USING ERRCODE='22023';END IF;
 v:=round(v,6);IF v=0 THEN RAISE EXCEPTION 'INVENTORY_RESOLUTION570_QUANTITY_TOO_SMALL' USING ERRCODE='22023';END IF;
 r:=jsonb_build_object(k,v,'motivo',m);
 FOREACH k IN ARRAY ids LOOP
  IF p_payload ? k AND p_payload->k<>'null'::jsonb AND
   (jsonb_typeof(p_payload->k) IS DISTINCT FROM 'string' OR app.to_uuid_or_null(p_payload->>k) IS NULL) THEN
   RAISE EXCEPTION 'INVENTORY_RESOLUTION570_UUID_INVALID' USING ERRCODE='22023';END IF;
  IF k=ANY(required) AND app.to_uuid_or_null(p_payload->>k) IS NULL THEN
   RAISE EXCEPTION 'INVENTORY_RESOLUTION570_UUID_REQUIRED' USING ERRCODE='22023';END IF;
  r:=r||jsonb_build_object(k,app.to_uuid_or_null(p_payload->>k));
 END LOOP;
 IF p_type='TRANSFERENCIA' THEN
  IF r->'almacen_origen_id'=r->'almacen_destino_id' THEN RAISE EXCEPTION 'INVENTORY_RESOLUTION570_WAREHOUSES_IDENTICAL' USING ERRCODE='22023';END IF;
  FOREACH k IN ARRAY ARRAY['lote','fecha_expiracion'] LOOP
   IF p_payload ? k AND p_payload->k<>'null'::jsonb AND jsonb_typeof(p_payload->k) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'INVENTORY_RESOLUTION570_OPTIONAL_TEXT_INVALID' USING ERRCODE='22023';END IF;
  END LOOP;
  r:=r||jsonb_build_object('lote',nullif(btrim(coalesce(p_payload->>'lote','')),''),
   'fecha_expiracion',nullif(p_payload->>'fecha_expiracion','')::date);
 END IF;
 RETURN r;
END $inventory_request570$;
ALTER FUNCTION app.inventory_operation_request_570(text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.inventory_operation_request_570(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Se ejecuta después del lock original, antes del replay o cualquier movimiento.
CREATE FUNCTION app.guard_inventory_operation_key_570(p_tenant_id uuid,p_actor_id uuid,p_type text,p_key text,p_canonical jsonb,p_writer boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $inventory_guard570$
DECLARE f app.inventory_operation_abandonments_570%ROWTYPE;o public.operaciones_inventario%ROWTYPE;fp text:=app.inventory_operation_fingerprint_455(p_canonical);
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
 SELECT * INTO o FROM public.operaciones_inventario WHERE tenant_id=p_tenant_id AND tipo=p_type AND idempotency_key=p_key;
 IF FOUND AND (o.actor_id IS DISTINCT FROM p_actor_id OR o.fingerprint IS DISTINCT FROM fp OR o.metadata->'payload' IS DISTINCT FROM p_canonical) THEN
  IF p_writer AND o.actor_id=p_actor_id THEN
   RAISE EXCEPTION 'INVENTORY_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' USING ERRCODE='23505';END IF;
  RAISE EXCEPTION 'INVENTORY_RESOLUTION570_KEY_CONFLICT' USING ERRCODE='40001';END IF;
 SELECT * INTO f FROM app.inventory_operation_abandonments_570 WHERE tenant_id=p_tenant_id AND type=p_type AND idempotency_key=p_key;
 IF FOUND THEN
  IF o.id IS NOT NULL THEN RAISE EXCEPTION 'INVENTORY_RESOLUTION570_INCONSISTENT_LEDGER' USING ERRCODE='23514';END IF;
  IF f.actor_id IS DISTINCT FROM p_actor_id OR f.request_payload IS DISTINCT FROM p_canonical OR f.request_fingerprint IS DISTINCT FROM fp THEN
   RAISE EXCEPTION 'INVENTORY_RESOLUTION570_KEY_CONFLICT' USING ERRCODE='40001';END IF;
  IF p_writer THEN RAISE EXCEPTION 'INVENTORY_RESOLUTION570_ABANDONED' USING ERRCODE='40001';END IF;
 END IF;
END $inventory_guard570$;
ALTER FUNCTION app.guard_inventory_operation_key_570(uuid,uuid,text,text,jsonb,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.guard_inventory_operation_key_570(uuid,uuid,text,text,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.resolver_operacion_inventario_tx_570(p_tenant_id uuid,p_actor_id uuid,p_type text,p_idempotency_key text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $inventory_resolve570$
DECLARE k text:=btrim(coalesce(p_idempotency_key,''));p jsonb;fp text;
 o public.operaciones_inventario%ROWTYPE;f app.inventory_operation_abandonments_570%ROWTYPE;
 oid uuid:=gen_random_uuid();stamp timestamptz;r jsonb;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
 IF length(k) NOT BETWEEN 8 AND 180 THEN RAISE EXCEPTION 'INVENTORY_RESOLUTION570_KEY_INVALID' USING ERRCODE='22023';END IF;
 p:=app.inventory_operation_request_570(p_type,p_payload);fp:=app.inventory_operation_fingerprint_455(p);
 -- Exactamente el mismo tenant/tipo/clave y seed0 que ambos writers455.
 PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:%s:%s',p_tenant_id,p_type,k),0));
 PERFORM app.guard_inventory_operation_key_570(p_tenant_id,p_actor_id,p_type,k,p,false);
 SELECT * INTO o FROM public.operaciones_inventario WHERE tenant_id=p_tenant_id AND tipo=p_type AND idempotency_key=k;
 IF FOUND THEN
  IF jsonb_typeof(o.resultado) IS DISTINCT FROM 'object' OR o.resultado->>'success' IS DISTINCT FROM 'true'
   OR o.resultado->>'operacion_id' IS DISTINCT FROM o.id::text OR o.resultado->>'idempotent' IS DISTINCT FROM 'false' THEN
   RAISE EXCEPTION 'INVENTORY_RESOLUTION570_COMMITTED_RECEIPT_INVALID' USING ERRCODE='23514';END IF;
  RETURN jsonb_build_object('success',true,'resolution','COMMITTED','receipt',o.resultado||jsonb_build_object('idempotent',true));
 END IF;
 SELECT * INTO f FROM app.inventory_operation_abandonments_570 WHERE tenant_id=p_tenant_id AND type=p_type AND idempotency_key=k;
 IF FOUND THEN oid:=f.operation_id;stamp:=f.confirmed_at;ELSE stamp:=clock_timestamp();END IF;
 r:=jsonb_build_object('success',true,'resolution','ABANDONED','idempotent',false,'operation_identity',
  jsonb_build_object('version',1,'action','ABANDON_INVENTORY','operation_id',oid,'type',p_type,
   'tenant_id',p_tenant_id,'actor_id',p_actor_id,'idempotency_key',k,'request_payload',p,'request_fingerprint',fp,'confirmed_at',stamp));
 IF f.operation_id IS NOT NULL THEN
  IF f.result IS DISTINCT FROM r THEN RAISE EXCEPTION 'INVENTORY_RESOLUTION570_ABANDON_RECEIPT_INVALID' USING ERRCODE='23514';END IF;
  RETURN f.result||jsonb_build_object('idempotent',true);
 END IF;
 INSERT INTO app.inventory_operation_abandonments_570 VALUES(p_tenant_id,p_type,k,p_actor_id,oid,p,fp,r,stamp);
 RETURN r;
END $inventory_resolve570$;
ALTER FUNCTION public.resolver_operacion_inventario_tx_570(uuid,uuid,text,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolver_operacion_inventario_tx_570(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_operacion_inventario_tx_570(uuid,uuid,text,text,jsonb) TO service_role;

DO $inventory_fence_legacy570$
DECLARE signature text;kind text;d text;needle text:='  SELECT * INTO v_operacion';guard text;
BEGIN
 FOR signature,kind IN SELECT * FROM (VALUES
  ('app.registrar_ajuste_inventario_tx_455(uuid,jsonb,uuid,text)','AJUSTE'),
  ('app.transferir_inventario_tx_455(uuid,jsonb,uuid,text)','TRANSFERENCIA')) s(signature,kind) LOOP
  d:=replace(pg_get_functiondef(signature::regprocedure),chr(13),'');
  IF (length(d)-length(replace(d,needle,'')))/length(needle)<>1 OR position(needle IN d)<position('pg_advisory_xact_lock(' IN d)
   OR position('guard_inventory_operation_key_570' IN d)>0 THEN RAISE EXCEPTION 'MIGRATION570_INVENTORY_FENCE_SOURCE_CHANGED:%',signature;END IF;
  guard:='  PERFORM app.guard_inventory_operation_key_570(p_tenant_id,p_actor_id,'||quote_literal(kind)||',v_key,v_canonical,true);'||chr(10);
  EXECUTE replace(d,needle,guard||needle);
 END LOOP;
END $inventory_fence_legacy570$;

-- Original batch receipt; historical depreciations are never backfilled or replayed.
CREATE TABLE IF NOT EXISTS app.asset_depreciation_batches_570 (
 tenant_id uuid NOT NULL, idempotency_key uuid NOT NULL, actor_id uuid NOT NULL,
 operation_id uuid NOT NULL UNIQUE, request jsonb NOT NULL, plan jsonb NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,idempotency_key)
);
ALTER TABLE app.asset_depreciation_batches_570 OWNER TO postgres;
ALTER TABLE app.asset_depreciation_batches_570 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.asset_depreciation_batches_570 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.asset_depreciation_batches_570 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.leer_lote_depreciacion_570(p_tenant_id uuid,p_actor_id uuid,p_key uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $depreciation_read570$
DECLARE op app.asset_depreciation_batches_570%ROWTYPE;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'contabilidad.activos.depreciar');
 IF p_key IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>2
  OR jsonb_typeof(p_request->'anio') IS DISTINCT FROM 'number' OR jsonb_typeof(p_request->'mes') IS DISTINCT FROM 'number'
  OR (p_request->>'anio')::numeric<>trunc((p_request->>'anio')::numeric) OR (p_request->>'mes')::numeric<>trunc((p_request->>'mes')::numeric)
  OR (p_request->>'anio')::numeric NOT BETWEEN 1900 AND 9999 OR (p_request->>'mes')::numeric NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'DEPRECIATION570_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('depreciation570:'||p_tenant_id::text||':'||p_key::text,570));
 SELECT * INTO op FROM app.asset_depreciation_batches_570 WHERE tenant_id=p_tenant_id AND idempotency_key=p_key;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF op.actor_id IS DISTINCT FROM p_actor_id OR op.request IS DISTINCT FROM p_request THEN
  RAISE EXCEPTION 'DEPRECIATION570_KEY_CONFLICT' USING ERRCODE='40001';
 END IF;
 RETURN op.result||jsonb_build_object('idempotent',true);
END $depreciation_read570$;

CREATE OR REPLACE FUNCTION public.registrar_lote_depreciacion_tx_570(p_tenant_id uuid,p_actor_id uuid,p_key uuid,p_request jsonb,p_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
SET lock_timeout='5s' AS $depreciation_write570$
DECLARE previous jsonb;current_sources jsonb;expected_sources jsonb;item jsonb;source jsonb;r jsonb;result jsonb;
 cuotas jsonb:='[]';omitidos jsonb:='[]';dep public.depreciaciones%ROWTYPE;
 oid uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();v_periodo text;fecha date;
 total numeric:=0;base numeric;remaining numeric;monthly numeric;elapsed integer;cuota numeric;acc numeric;net numeric;start_date date;
BEGIN
 previous:=public.leer_lote_depreciacion_570(p_tenant_id,p_actor_id,p_key,p_request);
 IF previous IS NOT NULL THEN RETURN previous;END IF;
 IF jsonb_typeof(p_plan) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DEPRECIATION570_PLAN_INVALID' USING ERRCODE='22023';END IF;
 v_periodo:=to_char(make_date((p_request->>'anio')::int,(p_request->>'mes')::int,1),'YYYY-MM');
 fecha:=(make_date((p_request->>'anio')::int,(p_request->>'mes')::int,1)+interval '1 month - 1 day')::date;
 -- Fences inserts and changes to candidates across pages, including equal-count replacements.
 -- Fail/rollback on any row: no exception handler may convert a partial batch into success.
 LOCK TABLE public.activos_fijos IN EXCLUSIVE MODE;
 PERFORM app.ensure_accounting_period_open_458(p_tenant_id,fecha);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'tenant_id',a.tenant_id,'codigo',a.codigo,
  'valor_adquisicion',a.valor_adquisicion,'valor_residual',a.valor_residual,'vida_util_meses',a.vida_util_meses,
  'depreciacion_acumulada',a.depreciacion_acumulada,'fecha_inicio_depreciacion',coalesce(a.fecha_inicio_depreciacion,a.fecha_adquisicion),
  'centro_costo_id',a.centro_costo_id) ORDER BY a.id),'[]') INTO current_sources
 FROM public.activos_fijos a WHERE a.tenant_id=p_tenant_id AND a.situacion='ACTIVO';
 SELECT coalesce(jsonb_agg(value->'source' ORDER BY value->'source'->>'id'),'[]') INTO expected_sources FROM jsonb_array_elements(p_plan);
 IF current_sources IS DISTINCT FROM expected_sources THEN RAISE EXCEPTION 'DEPRECIATION570_SOURCE_CHANGED' USING ERRCODE='40001';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan) ORDER BY value->'source'->>'id' LOOP
  source:=item->'source';
  IF jsonb_typeof(item->'cuota') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'acumulada') IS DISTINCT FROM 'number'
   OR jsonb_typeof(item->'valor_neto') IS DISTINCT FROM 'number' OR (source->>'vida_util_meses')::int<1 THEN
   RAISE EXCEPTION 'DEPRECIATION570_PLAN_INVALID' USING ERRCODE='22023';END IF;
  start_date:=(source->>'fecha_inicio_depreciacion')::date;
  elapsed:=((p_request->>'anio')::int-extract(year FROM start_date)::int)*12+(p_request->>'mes')::int-extract(month FROM start_date)::int;
  base:=round(((source->>'valor_adquisicion')::numeric-(source->>'valor_residual')::numeric)*100);
  remaining:=base-round((source->>'depreciacion_acumulada')::numeric*100);
  monthly:=round(base/(source->>'vida_util_meses')::int);
  cuota:=CASE WHEN elapsed<0 OR elapsed>=(source->>'vida_util_meses')::int OR remaining<=0 THEN 0
   ELSE least(CASE WHEN elapsed=(source->>'vida_util_meses')::int-1 THEN remaining ELSE monthly END,remaining)/100 END;
  acc:=round((source->>'depreciacion_acumulada')::numeric+cuota,2);net:=round((source->>'valor_adquisicion')::numeric-acc,2);
  IF (item->>'cuota')::numeric IS DISTINCT FROM cuota OR (item->>'acumulada')::numeric IS DISTINCT FROM acc OR (item->>'valor_neto')::numeric IS DISTINCT FROM net THEN
   RAISE EXCEPTION 'DEPRECIATION570_COMPUTED_CONFLICT' USING ERRCODE='40001';END IF;
  -- Existing installments belong to their original operation and stay untouched.
  SELECT * INTO dep FROM public.depreciaciones d WHERE d.tenant_id=p_tenant_id AND d.activo_id=(source->>'id')::uuid
   AND d.periodo=v_periodo AND lower(d.estado::text) IN('pendiente','procesada') ORDER BY d.created_at,d.id LIMIT 1;
  IF FOUND THEN
   omitidos:=omitidos||jsonb_build_array(jsonb_build_object('activo_id',source->>'id','codigo',source->>'codigo','motivo','ALREADY_REGISTERED','depreciacion_id',dep.id));
  ELSIF cuota<=0 THEN
   omitidos:=omitidos||jsonb_build_array(jsonb_build_object('activo_id',source->>'id','codigo',source->>'codigo','motivo','OUTSIDE_USEFUL_LIFE_OR_RESIDUAL'));
  ELSE
   r:=public.registrar_depreciacion_tx(p_tenant_id,(source->>'id')::uuid,v_periodo,fecha,cuota,acc,net,(source->>'centro_costo_id')::uuid,p_actor_id::text);
   IF r->'idempotent' IS DISTINCT FROM 'false'::jsonb OR r->'depreciacion'->>'tenant_id' IS DISTINCT FROM p_tenant_id::text
    OR r->'depreciacion'->>'activo_id' IS DISTINCT FROM source->>'id' OR r->'outbox'->>'depreciacionId' IS DISTINCT FROM r->'depreciacion'->>'id' THEN
    RAISE EXCEPTION 'DEPRECIATION570_INSTALLMENT_UNKNOWN' USING ERRCODE='23514';END IF;
   cuotas:=cuotas||jsonb_build_array(jsonb_build_object('activo_id',source->>'id','codigo',source->>'codigo','depreciacion',r->'depreciacion','outbox',r->'outbox'));
   total:=total+cuota;
  END IF;
 END LOOP;
 result:=jsonb_build_object('success',true,'complete',true,'tenant_id',p_tenant_id,'idempotent',false,
  'data',jsonb_build_object('periodo',v_periodo,'activos_depreciados',jsonb_array_length(cuotas),'total_depreciado',total,'cuotas',cuotas,'omitidos',omitidos),
  'operation',jsonb_build_object('status','COMMITTED','type','ACCOUNTING_ASSET_DEPRECIATION_BATCH','operation_id',oid,'tenant_id',p_tenant_id,
   'actor_id',p_actor_id,'idempotency_key',p_key,'request',p_request,'request_fingerprint',encode(extensions.digest(convert_to(p_request::text,'UTF8'),'sha256'),'hex'),
   'snapshot_count',jsonb_array_length(p_plan),'created_at',stamp));
 INSERT INTO app.asset_depreciation_batches_570 VALUES(p_tenant_id,p_key,p_actor_id,oid,p_request,p_plan,result,stamp);
 RETURN result;
END $depreciation_write570$;
ALTER FUNCTION public.leer_lote_depreciacion_570(uuid,uuid,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.registrar_lote_depreciacion_tx_570(uuid,uuid,uuid,jsonb,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.leer_lote_depreciacion_570(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.registrar_lote_depreciacion_tx_570(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leer_lote_depreciacion_570(uuid,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_lote_depreciacion_tx_570(uuid,uuid,uuid,jsonb,jsonb) TO service_role;

-- Immutable original update/retirement receipts; no attribution of historical operations.
CREATE TABLE IF NOT EXISTS app.asset_lifecycle_operations_570 (
 tenant_id uuid NOT NULL,idempotency_key uuid NOT NULL,actor_id uuid NOT NULL,
 operation_id uuid NOT NULL UNIQUE,asset_id uuid NOT NULL,action text NOT NULL CHECK(action IN('UPDATE','RETIRE')),
 request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),request_fingerprint text NOT NULL,
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),created_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,idempotency_key)
);
ALTER TABLE app.asset_lifecycle_operations_570 OWNER TO postgres;
ALTER TABLE app.asset_lifecycle_operations_570 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.asset_lifecycle_operations_570 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.asset_lifecycle_operations_570 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.asset_original_snapshot_570(a public.activos_fijos)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $asset_snapshot570$
 SELECT jsonb_build_object('id',a.id,'tenant_id',a.tenant_id,'codigo',a.codigo,'nombre',a.nombre,'descripcion',a.descripcion,
  'fecha_adquisicion',a.fecha_adquisicion,'fecha_inicio_depreciacion',a.fecha_inicio_depreciacion,
  'valor_adquisicion',a.valor_adquisicion,'valor_residual',a.valor_residual,'vida_util_meses',a.vida_util_meses,
  'depreciacion_acumulada',a.depreciacion_acumulada,'centro_costo_id',a.centro_costo_id,'situacion',a.situacion,
  'updated_at',a.updated_at,'asiento_baja_id',a.asiento_baja_id,'estado',a.estado,'activo',a.activo,'created_at',a.created_at,'created_by',a.created_by);
$asset_snapshot570$;

CREATE OR REPLACE FUNCTION public.leer_operacion_activo_570(p_tenant_id uuid,p_actor_id uuid,p_asset_id uuid,p_action text,p_key uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $asset_original_read570$
DECLARE op app.asset_lifecycle_operations_570%ROWTYPE;payload jsonb;expected jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('UPDATE','RETIRE') OR p_key IS NULL OR p_asset_id IS NULL THEN
  RAISE EXCEPTION 'ASSET_ORIGINAL570_SCOPE_INVALID' USING ERRCODE='22023';END IF;
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,CASE p_action WHEN 'UPDATE' THEN 'contabilidad.activos.actualizar' ELSE 'contabilidad.activos.baja' END);
 payload:=p_request->'original';expected:=p_request->'expected';
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>2
  OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR jsonb_typeof(expected) IS DISTINCT FROM 'object'
  OR expected->>'id' IS DISTINCT FROM p_asset_id::text OR expected->>'tenant_id' IS DISTINCT FROM p_tenant_id::text
  OR (SELECT count(*) FROM jsonb_object_keys(expected))<>19 THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_REQUEST_INVALID' USING ERRCODE='22023';END IF;
 IF p_action='UPDATE' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload)k WHERE k NOT IN('nombre','descripcion','vida_util_meses','valor_residual','centro_costo_id'))
   OR jsonb_typeof(payload->'nombre') IS DISTINCT FROM 'string'
   OR (payload?'descripcion' AND jsonb_typeof(payload->'descripcion') NOT IN('string','null'))
   OR nullif(btrim(payload->>'nombre'),'') IS NULL OR jsonb_typeof(payload->'vida_util_meses') IS DISTINCT FROM 'number'
   OR (payload->>'vida_util_meses')::numeric NOT BETWEEN 1 AND 2147483647 OR (payload->>'vida_util_meses')::numeric<>trunc((payload->>'vida_util_meses')::numeric)
   OR jsonb_typeof(payload->'valor_residual') IS DISTINCT FROM 'number' OR (payload->>'valor_residual')::numeric<0
   OR (payload->>'valor_residual')::numeric<>round((payload->>'valor_residual')::numeric,2) THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_UPDATE_INVALID' USING ERRCODE='22023';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload)k WHERE k NOT IN('fecha','tipo','valor_venta','motivo'))
   OR coalesce(payload->>'tipo','') NOT IN('BAJA','VENTA') OR coalesce(payload->>'fecha','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR to_char((payload->>'fecha')::date,'YYYY-MM-DD') IS DISTINCT FROM payload->>'fecha'
   OR (payload->>'tipo'='VENTA' AND (jsonb_typeof(payload->'valor_venta') IS DISTINCT FROM 'number' OR (payload->>'valor_venta')::numeric<=0
    OR (payload->>'valor_venta')::numeric<>round((payload->>'valor_venta')::numeric,2)))
   OR (payload->>'tipo'='BAJA' AND coalesce(payload->'valor_venta','null')<>'null'::jsonb) THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_RETIRE_INVALID' USING ERRCODE='22023';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('asset-original570:'||p_tenant_id::text||':'||p_key::text,570));
 SELECT * INTO op FROM app.asset_lifecycle_operations_570 WHERE tenant_id=p_tenant_id AND idempotency_key=p_key;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF op.actor_id IS DISTINCT FROM p_actor_id OR op.asset_id IS DISTINCT FROM p_asset_id OR op.action IS DISTINCT FROM p_action OR op.request IS DISTINCT FROM p_request
  OR op.request_fingerprint IS DISTINCT FROM app.financial_master_fingerprint_477(p_request) THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_KEY_CONFLICT' USING ERRCODE='40001';END IF;
 RETURN op.result||jsonb_build_object('idempotent',true);
END $asset_original_read570$;

CREATE OR REPLACE FUNCTION public.guardar_operacion_activo_tx_570(
 p_tenant_id uuid,p_actor_id uuid,p_asset_id uuid,p_action text,p_key uuid,p_request jsonb,
 p_asiento jsonb DEFAULT NULL,p_detalles jsonb DEFAULT NULL,p_baja jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp SET lock_timeout='5s' AS $asset_original_write570$
DECLARE previous jsonb;asset public.activos_fijos%ROWTYPE;expected jsonb;current_snapshot jsonb;payload jsonb;r jsonb;result jsonb;
 journal jsonb;details jsonb;oid uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();total numeric;
BEGIN
 previous:=public.leer_operacion_activo_570(p_tenant_id,p_actor_id,p_asset_id,p_action,p_key,p_request);
 IF previous IS NOT NULL THEN RETURN previous;END IF;
 SELECT * INTO asset FROM public.activos_fijos WHERE tenant_id=p_tenant_id AND id=p_asset_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_NOT_FOUND' USING ERRCODE='P0002';END IF;
 expected:=p_request->'expected';payload:=p_request->'original';current_snapshot:=app.asset_original_snapshot_570(asset);
 IF (current_snapshot-ARRAY['updated_at','created_at']) IS DISTINCT FROM (expected-ARRAY['updated_at','created_at'])
  OR (expected->>'updated_at')::timestamptz IS DISTINCT FROM asset.updated_at OR (expected->>'created_at')::timestamptz IS DISTINCT FROM asset.created_at THEN
  RAISE EXCEPTION 'ASSET_ORIGINAL570_SOURCE_CHANGED' USING ERRCODE='40001';END IF;
 IF NOT coalesce(asset.activo,false) OR asset.estado IS DISTINCT FROM 'ACTIVO' THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_INACTIVE' USING ERRCODE='23514';END IF;
 IF p_action='UPDATE' THEN
  IF p_asiento IS NOT NULL OR p_detalles IS NOT NULL OR p_baja IS NOT NULL THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_UPDATE_EXTRA' USING ERRCODE='22023';END IF;
  IF payload->>'centro_costo_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.centros_costo c WHERE c.id=(payload->>'centro_costo_id')::uuid AND c.tenant_id=p_tenant_id) THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_COST_CENTER_FOREIGN' USING ERRCODE='23503';END IF;
  r:=public.gestionar_activo_diferido_tx(p_tenant_id,p_actor_id,'ASSET','UPDATE',p_asset_id,payload,p_key::text);
  IF r->'idempotent' IS DISTINCT FROM 'false'::jsonb OR r->>'id' IS DISTINCT FROM p_asset_id::text THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_LEGACY_UNKNOWN' USING ERRCODE='23514';END IF;
  SELECT * INTO asset FROM public.activos_fijos WHERE tenant_id=p_tenant_id AND id=p_asset_id;
 ELSE
  IF jsonb_typeof(p_asiento) IS DISTINCT FROM 'object' OR jsonb_typeof(p_detalles) IS DISTINCT FROM 'array' OR jsonb_typeof(p_baja) IS DISTINCT FROM 'object'
   OR (p_asiento->>'fecha')::date IS DISTINCT FROM (payload->>'fecha')::date OR p_asiento->>'created_by' IS DISTINCT FROM p_actor_id::text
   OR p_asiento->>'confirmado_por' IS DISTINCT FROM p_actor_id::text OR p_asiento->>'estado' IS DISTINCT FROM 'CONFIRMADO'
   OR p_asiento->>'origen' IS DISTINCT FROM 'BAJA_ACTIVO_FIJO' OR p_baja->>'fecha_baja' IS DISTINCT FROM payload->>'fecha'
   OR p_baja->>'situacion' IS DISTINCT FROM (CASE payload->>'tipo' WHEN 'VENTA' THEN 'VENDIDO' ELSE 'BAJA' END)
   OR coalesce(p_baja->'valor_venta','null') IS DISTINCT FROM coalesce(payload->'valor_venta','null')
   OR coalesce(p_baja->'motivo_baja','null') IS DISTINCT FROM coalesce(payload->'motivo','null') THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_COMPUTED_CONFLICT' USING ERRCODE='40001';END IF;
  PERFORM app.ensure_accounting_period_open_458(p_tenant_id,(payload->>'fecha')::date);
  r:=public.dar_baja_activo_tx(p_tenant_id,p_asset_id,p_asiento,p_detalles,p_baja);
  SELECT * INTO asset FROM public.activos_fijos WHERE tenant_id=p_tenant_id AND id=p_asset_id;
  SELECT to_jsonb(a) INTO journal FROM public.asientos_contables a WHERE a.tenant_id=p_tenant_id AND a.id=asset.asiento_baja_id;
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]') INTO details FROM public.detalle_asientos d WHERE d.tenant_id=p_tenant_id AND d.asiento_id=asset.asiento_baja_id;
  total:=round(asset.valor_adquisicion+coalesce((payload->>'valor_venta')::numeric,0),2);
  IF journal IS NULL OR journal->>'estado' IS DISTINCT FROM 'CONFIRMADO' OR jsonb_array_length(details) NOT BETWEEN 2 AND 5
   OR (SELECT sum((d->>'debe')::numeric) FROM jsonb_array_elements(details)d) IS DISTINCT FROM total
   OR (SELECT sum((d->>'haber')::numeric) FROM jsonb_array_elements(details)d) IS DISTINCT FROM total THEN RAISE EXCEPTION 'ASSET_ORIGINAL570_JOURNAL_UNKNOWN' USING ERRCODE='23514';END IF;
 END IF;
 result:=jsonb_build_object('success',true,'complete',true,'tenant_id',p_tenant_id,'idempotent',false,'data',to_jsonb(asset)||jsonb_build_object('valor_neto',round(asset.valor_adquisicion-asset.depreciacion_acumulada,2)),
  'journal',CASE WHEN p_action='RETIRE' THEN journal||jsonb_build_object('detalles',details) ELSE NULL END,
  'operation',jsonb_build_object('status','COMMITTED','type','ACCOUNTING_ASSET_'||p_action,'operation_id',oid,'asset_id',p_asset_id,'tenant_id',p_tenant_id,
   'actor_id',p_actor_id,'idempotency_key',p_key,'request',p_request,'request_fingerprint',app.financial_master_fingerprint_477(p_request),'created_at',stamp));
 INSERT INTO app.asset_lifecycle_operations_570 VALUES(p_tenant_id,p_key,p_actor_id,oid,p_asset_id,p_action,p_request,app.financial_master_fingerprint_477(p_request),result,stamp);
 RETURN result;
END $asset_original_write570$;
ALTER FUNCTION app.asset_original_snapshot_570(public.activos_fijos) OWNER TO postgres;
ALTER FUNCTION public.leer_operacion_activo_570(uuid,uuid,uuid,text,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.guardar_operacion_activo_tx_570(uuid,uuid,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.asset_original_snapshot_570(public.activos_fijos) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.leer_operacion_activo_570(uuid,uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guardar_operacion_activo_tx_570(uuid,uuid,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leer_operacion_activo_570(uuid,uuid,uuid,text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_operacion_activo_tx_570(uuid,uuid,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb) TO service_role;


-- Lecturas enriquecidas por sucursal: fuentes del runtime del servidor.
-- Sin DML nuevo, cambio de RLS/owner/políticas ni permisos para clientes.
GRANT SELECT ON public.producto_precios_sucursal, public.producto_stock_sucursal TO service_role;

-- Consulta del reparto analítico por el servidor; la escritura sigue en RPC.
GRANT SELECT ON public.distribucion_analitica TO service_role;

COMMIT;
