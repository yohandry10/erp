\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' OR current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_594_REQUIERE_ERP_E2E_LOCAL_PG16';
  END IF;
END;
$guard$;
DO $verify$
DECLARE
  t uuid := gen_random_uuid(); a uuid := gen_random_uuid(); w uuid := gen_random_uuid(); p uuid;
  result jsonb; row jsonb;
BEGIN
  INSERT INTO public.tenants(id,codigo,nombre,pais,plan,activo,estado)
    VALUES(t,'V594-'||left(t::text,8),'Verificación Kardex 594','PE','test',true,'ACTIVO');
  INSERT INTO public.empresa_config(tenant_id,ruc,razon_social,pais,moneda_defecto,estado,configuracion_completa)
    VALUES(t,'20600000594','Empresa verify 594','PE','PEN','ACTIVO',true);
  INSERT INTO public.usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado)
    VALUES(a,t,'Actor','Verify 594','actor-'||a::text||'@local.invalid','v594','unused-local-hash',true,'ACTIVO');
  INSERT INTO public.almacenes(id,tenant_id,codigo,nombre,estado,activo,es_principal,pais)
    VALUES(w,t,'V594-A','Almacén 594','ACTIVO',true,true,'PE');
  PERFORM public.crear_categoria_producto_maestro_tx(t,a,'verify-594-category',jsonb_build_object('codigo','V594','nombre','Verificación 594'));
  p := (public.crear_producto_maestro_tx(t,a,'verify-594-product',jsonb_build_object(
    'codigo','V594','nombre','Saldo empatado 594','categoria','V594','precio_venta',30,'precio_compra',18,
    'afectacion_igv','10','unidad_medida','NIU','almacen_id',w,'es_servicio',false,'controla_stock',true))->>'id')::uuid;
  -- UUID de salida menor que el inicial: el orden antiguo reproduce -2/48.
  INSERT INTO public.movimientos_inventario(id,tenant_id,producto_id,almacen_id,tipo,tipo_movimiento,cantidad,referencia_tipo,referencia_id,metadata,activo,estado,created_at)
  VALUES('f0000000-0000-4000-8000-000000000594',t,p,w,'ENTRADA','ENTRADA',50,'PRODUCTO_STOCK_INICIAL',p,'{"costo_unitario":18}',true,'ACTIVO',now()),
    ('10000000-0000-4000-8000-000000000594',t,p,w,'SALIDA','SALIDA',2,'VENTA_POS',gen_random_uuid(),'{"costo_unitario":18}',true,'ACTIVO',now());
  result := public.reporte_kardex_valorizado_470(t,p,w,NULL,NULL,100);
  IF (result#>>'{resumen,saldoCantidad}')::numeric <> 48 OR (result#>>'{resumen,saldoValorizadoBase}')::numeric <> 864 THEN
    RAISE EXCEPTION 'VERIFY_594_FINAL_BALANCE_INVALID:%',result;
  END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(result->'data') LOOP
    IF row->>'referenciaTipo' = 'PRODUCTO_STOCK_INICIAL' AND ((row->>'saldoCantidadPosterior')::numeric <> 50 OR (row->>'saldoValorizadoBasePosterior')::numeric <> 900)
      OR row->>'referenciaTipo' = 'VENTA_POS' AND ((row->>'saldoCantidadPosterior')::numeric <> 48 OR (row->>'saldoValorizadoBasePosterior')::numeric <> 864) THEN
      RAISE EXCEPTION 'VERIFY_594_CAUSAL_OPENING_BALANCE_INVALID:%',row;
    END IF;
  END LOOP;
  IF jsonb_array_length(result->'data') <> 2 THEN RAISE EXCEPTION 'VERIFY_594_INCOMPLETE_DETAILS'; END IF;
  IF has_function_privilege('anon','public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)','EXECUTE')
    OR (SELECT prosecdef FROM pg_proc WHERE oid='public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)'::regprocedure) THEN
    RAISE EXCEPTION 'VERIFY_594_ACL_CHANGED';
  END IF;
END;
$verify$;
ROLLBACK;
