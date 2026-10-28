\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject582(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE expected || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'VERIFY582_UNEXPECTED_ERROR esperado=% recibido=%', expected, SQLERRM;
  END;
  RAISE EXCEPTION 'VERIFY582_EXPECTED_REJECTION %', expected;
END $fn$;
DO $verify$
DECLARE
  t uuid; a uuid; b uuid; ot uuid; oa uuid; s uuid; j jsonb; hoy date; lote uuid; lote2 uuid; n integer; k text;
  run_p uuid; run_a uuid; run_pc uuid; run_b uuid; run_l uuid; run_oc uuid; run_pv uuid; run_cli uuid; run_prv uuid; run_cxc uuid;
  run_bal uuid; run_st uuid; outbox_antes integer; asientos_antes integer; cta1041 uuid; existente uuid; prod_demo text;
  alm_demo text; p1 uuid; p2 uuid; oc uuid; pv uuid; v_banco uuid; adoptada uuid; lote_ensayo jsonb; control jsonb; filas jsonb;
  p_banco jsonb; p_oc jsonb; p_pv jsonb; p_prod jsonb;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY582_LOCAL_ONLY'; END IF;
  FOREACH k IN ARRAY ARRAY['migracion_archivo_lotes','migracion_archivo'] LOOP
    IF has_table_privilege('service_role','public.'||k,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.'||k,'SELECT')
      OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=('public.'||k)::regclass AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'VERIFY582_ACL %', k; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['public.operar_archivo_fox_582(uuid,uuid,text,jsonb,text)','public.archivar_filas_fox_582(uuid,uuid,uuid,text,jsonb)',
      'public.consultar_archivo_fox_582(uuid,uuid,jsonb)','public.importar_maestro_fox_582(uuid,uuid,uuid,text,text,jsonb)',
      'public.conciliar_migracion_fox_582(uuid,uuid,jsonb)','public.ensayar_migracion_fox_582(uuid,uuid,jsonb,jsonb,date)'] LOOP
    IF has_function_privilege('anon',k,'EXECUTE') OR has_function_privilege('authenticated',k,'EXECUTE')
      OR NOT has_function_privilege('service_role',k,'EXECUTE') THEN RAISE EXCEPTION 'VERIFY582_FUNCTION_ACL %', k; END IF;
  END LOOP;
  IF has_function_privilege('service_role','app.fox_unico_582(uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'VERIFY582_HELPER_ACL'; END IF;

  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  j:=public.create_demo_tenant_ready_tx('VERIFY582',14,'PE','verify582-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
  j:=public.create_demo_tenant_ready_tx('VERIFY582OTHER',14,'PE','verify582other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
  SELECT id INTO b FROM public.usuarios_sistema WHERE tenant_id=t AND id<>a AND coalesce(activo,false) AND lower(estado::text)='activo' ORDER BY id LIMIT 1;
  IF b IS NULL THEN RAISE EXCEPTION 'VERIFY582_SECOND_USER'; END IF;

  -- Matriz de permisos en una empresa creada después de la migración (siembra por rol).
  IF EXISTS (SELECT 1 FROM (VALUES ('ADMIN','migration.fox.import',true),('ADMIN','migration.archivo.import',true),
        ('ADMIN','migration.archivo.read',true),('GERENCIA','migration.archivo.read',true),('CONTADOR','migration.archivo.read',true),
        ('AUDITOR','migration.archivo.read',true),('GERENCIA','migration.fox.import',false),('AUDITOR','migration.archivo.import',false),
        ('CONTADOR','migration.fox.import',false),('VENDEDOR','migration.archivo.read',false),('SUMINISTRO','migration.archivo.read',false),
        ('ALMACEN','migration.archivo.read',false)) m(rol,codigo,esperado)
      WHERE m.esperado <> EXISTS (SELECT 1 FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id AND rp.concedido
        JOIN public.permisos p ON p.id=rp.permiso_id WHERE r.tenant_id=t AND upper(r.nombre)=m.rol AND p.codigo=m.codigo))
    OR EXISTS (SELECT 1 FROM public.tenants x WHERE NOT EXISTS (SELECT 1 FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id
        JOIN public.permisos p ON p.id=rp.permiso_id WHERE r.tenant_id=x.id AND upper(r.nombre)='ADMIN' AND p.codigo='migration.archivo.import')
      AND EXISTS (SELECT 1 FROM public.roles r WHERE r.tenant_id=x.id AND upper(r.nombre)='ADMIN' AND coalesce(r.activo,true)))
  THEN RAISE EXCEPTION 'VERIFY582_PERMISSION_MATRIX'; END IF;

  -- Fixture: a migra como ADMIN; b audita.
  PERFORM app.sembrar_permisos_migracion_554(t);
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  SELECT a, r.id, t FROM public.roles r WHERE r.tenant_id=t AND upper(r.nombre)='ADMIN';
  DELETE FROM public.user_roles WHERE usuario_sistema_id=b;
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  SELECT b, r.id, t FROM public.roles r WHERE r.tenant_id=t AND upper(r.nombre)='AUDITOR';
  hoy:=app.hoy_tenant(t);
  SELECT id INTO s FROM public.sucursales WHERE tenant_id=t ORDER BY es_principal DESC, id LIMIT 1;

  -- 1. Archivo íntegro: tandas idempotentes, filas cambiadas rechazadas, cierre por conteo.
  j:=public.operar_archivo_fox_582(t,a,'CREAR_LOTE',jsonb_build_object('descripcion','Extracto FOX completo','fecha_corte',hoy),'verify582-lote-1');
  lote:=(j->>'id')::uuid;
  IF j->>'estado'<>'CARGANDO' OR (public.operar_archivo_fox_582(t,a,'CREAR_LOTE',jsonb_build_object('descripcion','Extracto FOX completo',
      'fecha_corte',hoy),'verify582-lote-1'))->>'id'<>lote::text THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_CREATE %', j; END IF;
  PERFORM pg_temp.reject582(format('SELECT public.operar_archivo_fox_582(%L,%L,''CREAR_LOTE'',%L,''verify582-lote-1'')',t,a,
    jsonb_build_object('descripcion','Otro extracto')),'SUPPLY_IDEMPOTENCY_CONFLICT');
  filas:=jsonb_build_array(
    jsonb_build_object('clave','PRV-1','fila',jsonb_build_object('CODPRO','PRV-1','RAZON','Laboratorio Andino SA','RUC','20601234567')),
    jsonb_build_object('clave','PRV-2','fila',jsonb_build_object('CODPRO','PRV-2','RAZON','Droguería del Sur','RUC','20509876543')));
  j:=public.archivar_filas_fox_582(t,a,lote,'PROVEED',filas);
  IF (j->>'nuevas')::integer<>2 THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_LOAD %', j; END IF;
  j:=public.archivar_filas_fox_582(t,a,lote,'PROVEED',filas);
  IF (j->>'nuevas')::integer<>0 OR (j->>'existentes')::integer<>2 THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_REPLAY %', j; END IF;
  PERFORM public.archivar_filas_fox_582(t,a,lote,'KARDEX_2019',jsonb_build_array(
    jsonb_build_object('clave','1','fila',jsonb_build_object('FECHA','2019-03-01','CODART','P-1','CANT',10,'GLOSA','Ingreso por compra')),
    jsonb_build_object('clave','2','fila',jsonb_build_object('FECHA','2019-03-02','CODART','P-1','CANT',-4,'GLOSA','Salida a hospital'))));
  PERFORM pg_temp.reject582(format('SELECT public.archivar_filas_fox_582(%L,%L,%L,''PROVEED'',%L)',t,a,lote,
    jsonb_build_array(jsonb_build_object('clave','PRV-1','fila',jsonb_build_object('CODPRO','PRV-1','RAZON','Otra razón')))),
    'MIGRATION_ARCHIVE_ROW_CHANGED');
  PERFORM pg_temp.reject582(format('SELECT public.archivar_filas_fox_582(%L,%L,%L,''PROVEED'',%L)',t,a,lote,
    jsonb_build_array(jsonb_build_object('clave','PRV-9','fila','{}'::jsonb),jsonb_build_object('clave','PRV-9','fila','{}'::jsonb))),
    'MIGRATION_ARCHIVE_DUPLICATE_KEY');
  PERFORM pg_temp.reject582(format('SELECT public.archivar_filas_fox_582(%L,%L,%L,''PRO VEED;'',%L)',t,a,lote,filas),'MIGRATION_ARCHIVE_INPUT_INVALID');
  -- Valores anidados se rechazan: no pueden esconder credenciales de la redacción.
  PERFORM pg_temp.reject582(format('SELECT public.archivar_filas_fox_582(%L,%L,%L,''PROVEED'',%L)',t,a,lote,
    jsonb_build_array(jsonb_build_object('clave','PRV-8','fila',jsonb_build_object('DATOS',jsonb_build_object('CLAVE','s3creta'))))),
    'MIGRATION_ARCHIVE_INPUT_INVALID');
  PERFORM pg_temp.reject582(format('SELECT public.archivar_filas_fox_582(%L,%L,%L,''PROVEED'',%L)',t,a,lote,
    jsonb_build_array(jsonb_build_object('clave','PRV-8','fila',jsonb_build_object('LISTA',jsonb_build_array('CLAVE','s3creta'))))),
    'MIGRATION_ARCHIVE_INPUT_INVALID');
  PERFORM pg_temp.reject582(format('SELECT public.operar_archivo_fox_582(%L,%L,''CERRAR_LOTE'',%L,''verify582-cierre-x'')',t,a,
    jsonb_build_object('lote_id',lote,'tablas',jsonb_build_object('PROVEED',3,'KARDEX_2019',2))),'MIGRATION_ARCHIVE_COUNT_MISMATCH');
  -- La búsqueda no ve un lote incompleto por defecto.
  IF (public.consultar_archivo_fox_582(t,a,'{}'::jsonb))->>'lote_id' IS NOT NULL THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_DEFAULT_INCOMPLETE'; END IF;
  j:=public.operar_archivo_fox_582(t,a,'CERRAR_LOTE',jsonb_build_object('lote_id',lote,'tablas',jsonb_build_object('PROVEED',2,'KARDEX_2019',2)),
    'verify582-cierre-1');
  IF j->>'estado'<>'COMPLETO' OR j#>>'{tablas,PROVEED}'<>'2' THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_CLOSE %', j; END IF;
  PERFORM pg_temp.reject582(format('SELECT public.archivar_filas_fox_582(%L,%L,%L,''CLIENTES'',%L)',t,a,lote,filas),'MIGRATION_ARCHIVE_STATE');
  PERFORM pg_temp.reject582(format('UPDATE public.migracion_archivo SET fila=''{}'' WHERE lote_id=%L',lote),'MIGRATION_ARCHIVE_IMMUTABLE');
  PERFORM pg_temp.reject582(format('DELETE FROM public.migracion_archivo WHERE lote_id=%L',lote),'MIGRATION_ARCHIVE_IMMUTABLE');
  PERFORM pg_temp.reject582(format('UPDATE public.migracion_archivo_lotes SET descripcion=''cambiada'' WHERE id=%L',lote),'MIGRATION_ARCHIVE_IMMUTABLE');
  PERFORM pg_temp.reject582(format('UPDATE public.migracion_archivo_lotes SET estado=''CARGANDO'' WHERE id=%L',lote),'MIGRATION_ARCHIVE_IMMUTABLE');

  -- Consulta: texto completo, filtro por tabla, paginación y lote por defecto; el auditor lee.
  j:=public.consultar_archivo_fox_582(t,b,jsonb_build_object('texto','andino'));
  IF j->>'lote_id'<>lote::text OR (j->>'total')::integer<>1 OR j#>>'{filas,0,clave}'<>'PRV-1' OR jsonb_array_length(j->'tablas')<>2
  THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_SEARCH %', j; END IF;
  j:=public.consultar_archivo_fox_582(t,b,jsonb_build_object('lote_id',lote,'tabla','KARDEX_2019','limite',1,'pagina',2));
  IF (j->>'total')::integer<>2 OR jsonb_array_length(j->'filas')<>1 OR j#>>'{filas,0,clave}'<>'2' THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_PAGE %', j; END IF;
  -- Se consulta en el orden de la tanda, no por la clave como texto.
  lote2:=(public.operar_archivo_fox_582(t,a,'CREAR_LOTE',jsonb_build_object('descripcion','Orden de carga'),'verify582-lote-orden'))->>'id';
  PERFORM public.archivar_filas_fox_582(t,a,lote2,'ORDEN',(SELECT jsonb_agg(jsonb_build_object('clave',g::text,'fila',jsonb_build_object('N',g)) ORDER BY g)
    FROM generate_series(1,12) g));
  IF (SELECT string_agg(clave, ',' ORDER BY id) FROM public.migracion_archivo WHERE lote_id=lote2 AND tabla='ORDEN')<>'1,2,3,4,5,6,7,8,9,10,11,12'
  THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_ORDER'; END IF;
  -- La base redacta credenciales aunque la tanda llegue sin pasar por la CLI.
  j:=public.archivar_filas_fox_582(t,a,lote2,'USUARIOS',jsonb_build_array(jsonb_build_object('clave','1','fila',jsonb_build_object(
    'USR_PASSWD','s3creta','PIN','1234','CLAVEACCESO','x9','API_KEY','k','NROTARJETA','4111','SPINNER','queda','KEYWORD','queda',
    'CLAVE','','USUARIO','ADMIN'))));
  IF (SELECT fila FROM public.migracion_archivo WHERE lote_id=lote2 AND tabla='USUARIOS')<>jsonb_build_object('USR_PASSWD','[REDACTADO]',
      'PIN','[REDACTADO]','CLAVEACCESO','[REDACTADO]','API_KEY','[REDACTADO]','NROTARJETA','[REDACTADO]','SPINNER','queda','KEYWORD','queda',
      'CLAVE','','USUARIO','ADMIN')
    OR j->'campos_redactados'<>'["API_KEY", "CLAVE", "CLAVEACCESO", "NROTARJETA", "PIN", "USR_PASSWD"]'::jsonb
    OR EXISTS (SELECT 1 FROM public.migracion_archivo WHERE lote_id=lote2 AND fila::text LIKE '%s3creta%')
  THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_REDACTION %', j; END IF;
  -- La misma fila ya redactada por la CLI tiene la misma huella: el reintento no choca.
  j:=public.archivar_filas_fox_582(t,a,lote2,'USUARIOS',jsonb_build_array(jsonb_build_object('clave','1','fila',jsonb_build_object(
    'USR_PASSWD','[REDACTADO]','PIN','[REDACTADO]','CLAVEACCESO','[REDACTADO]','API_KEY','[REDACTADO]','NROTARJETA','[REDACTADO]',
    'SPINNER','queda','KEYWORD','queda','CLAVE','','USUARIO','ADMIN'))));
  IF (j->>'existentes')::integer<>1 THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_REDACTION_REPLAY %', j; END IF;
  IF ((public.consultar_archivo_fox_582(t,b,jsonb_build_object('texto','hospital -salida')))->>'total')::integer<>0
    OR ((public.consultar_archivo_fox_582(t,b,jsonb_build_object('texto','"ingreso por compra"')))->>'total')::integer<>1
  THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_WEBSEARCH'; END IF;
  PERFORM pg_temp.reject582(format('SELECT public.consultar_archivo_fox_582(%L,%L,%L)',t,b,'{"pagina":"x"}'),'MIGRATION_ARCHIVE_FILTER_INVALID');
  BEGIN PERFORM public.archivar_filas_fox_582(t,b,lote,'OTRA',filas); RAISE EXCEPTION 'VERIFY582_AUDITOR_WRITES';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.consultar_archivo_fox_582(t,oa,'{}'::jsonb); RAISE EXCEPTION 'VERIFY582_FOREIGN_READ';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.reject582(format('SELECT public.consultar_archivo_fox_582(%L,%L,%L)',ot,oa,jsonb_build_object('lote_id',lote)),
    'MIGRATION_ARCHIVE_NOT_FOUND');
  -- Un segundo extracto se descarta con motivo; el completo sigue siendo el de consulta.
  lote2:=(public.operar_archivo_fox_582(t,a,'CREAR_LOTE',jsonb_build_object('descripcion','Extracto de prueba'),'verify582-lote-2'))->>'id';
  PERFORM pg_temp.reject582(format('SELECT public.operar_archivo_fox_582(%L,%L,''DESCARTAR_LOTE'',%L,''verify582-desc-x'')',t,a,
    jsonb_build_object('lote_id',lote2)),'SUPPLY_REASON_REQUIRED');
  j:=public.operar_archivo_fox_582(t,a,'DESCARTAR_LOTE',jsonb_build_object('lote_id',lote2,'motivo','Extracto incompleto de prueba'),'verify582-desc-2');
  IF j->>'estado'<>'DESCARTADO' OR (public.consultar_archivo_fox_582(t,b,'{}'::jsonb))->>'lote_id'<>lote::text
    OR NOT EXISTS (SELECT 1 FROM public.audit_log WHERE tenant_id=t AND table_name='migracion_archivo_lotes' AND record_id=lote2::text
      AND metadata->>'accion'='DESCARTAR_LOTE')
  THEN RAISE EXCEPTION 'VERIFY582_ARCHIVE_DISCARD %', j; END IF;

  -- Fixtures del ERP destino: lo que ya existe se adopta, no se duplica.
  SELECT id INTO cta1041 FROM public.plan_cuentas WHERE tenant_id=t AND codigo='1041';
  SELECT codigo INTO prod_demo FROM public.productos WHERE tenant_id=t AND activo AND codigo IS NOT NULL ORDER BY codigo LIMIT 1;
  SELECT codigo INTO alm_demo FROM public.almacenes WHERE tenant_id=t AND activo AND codigo IS NOT NULL ORDER BY codigo LIMIT 1;
  IF cta1041 IS NULL OR prod_demo IS NULL OR alm_demo IS NULL THEN RAISE EXCEPTION 'VERIFY582_FIXTURE'; END IF;
  j:=public.gestionar_cuenta_bancaria_tx(t,a,NULL,jsonb_build_object('nombre','Interbank dólares','banco','INTERBANK',
    'numero_cuenta','200-3001234567','moneda','PEN','tipo_cuenta','CORRIENTE','cuenta_contable_id',cta1041,'activa',true),'verify582-banco-previo');
  existente:=(j#>>'{cuenta,id}')::uuid;
  PERFORM public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','AMB','nombre','Ambiguo uno','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',1,'precio_compra',1,'afectacion_igv','10'),NULL,0,0,'[]'::jsonb);
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','AMB-2','nombre','Ambiguo dos','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',1,'precio_compra',1,'afectacion_igv','10'),NULL,0,0,'[]'::jsonb);
  UPDATE public.productos SET external_id='AMB' WHERE id=(j->>'id')::uuid;

  -- 2. Ensayo integral: todo el lote en orden, errores por registro, nada persiste.
  lote_ensayo:=jsonb_build_object(
    'clientes',jsonb_build_array(jsonb_build_object('id_origen','CLI-1','fila',2,'payload',jsonb_build_object('tipo','EMPRESA','documento_tipo','RUC',
      'documento_identidad','20100070970','documento_numero','20100070970','razon_social','Hospital Regional SAC','pais','PE'))),
    'proveedores',jsonb_build_array(jsonb_build_object('id_origen','PRV-1','fila',2,'payload',jsonb_build_object('tipo','EMPRESA','documento_tipo','RUC',
      'documento_identidad','20601234567','documento_numero','20601234567','razon_social','Laboratorio Andino SA','email','ventas@andino.test','pais','PE'))),
    'almacenes',jsonb_build_array(jsonb_build_object('id_origen','ALM-2','fila',2,'payload',jsonb_build_object('codigo','FOX-ALM2','nombre','Almacén Callao'))),
    'cuentas_contables',jsonb_build_array(
      jsonb_build_object('id_origen','104101','fila',2,'payload',jsonb_build_object('codigo','104101','nombre','BCP corriente soles')),
      jsonb_build_object('id_origen','00991','fila',3,'payload',jsonb_build_object('codigo','00991','nombre','Sin padre'))),
    'productos',jsonb_build_array(
      jsonb_build_object('id_origen','P-1','fila',2,'payload',jsonb_build_object('codigo','FOX-P1','nombre','Guantes de nitrilo','precio_venta',12,'precio_compra',5)),
      jsonb_build_object('id_origen','P-2','fila',3,'payload',jsonb_build_object('codigo','FOX-P2','nombre','Amoxicilina 500 mg','controla_lote',true))),
    'cuentas_bancarias',jsonb_build_array(jsonb_build_object('id_origen','BAN-1','fila',2,'payload',jsonb_build_object('nombre','BCP Soles','banco','BCP',
      'numero_cuenta','193-1234567-0-11','moneda','PEN','cuenta_contable_codigo','104101','saldo_apertura',15000,'fecha_apertura',hoy))),
    'cxc',jsonb_build_array(jsonb_build_object('id_origen','CXC-1','fila',2,'payload',jsonb_build_object('codigo_tercero','CLI-1','tipo_documento','FACTURA',
      'serie','F001','numero','123','fecha_emision',hoy-20,'fecha_vencimiento',hoy+10,'moneda','PEN','monto_total',1180,'saldo_pendiente',500))),
    'oc_compra',jsonb_build_array(jsonb_build_object('id_origen','OCC-1','fila',2,'payload',jsonb_build_object('proveedor_codigo','PRV-1','numero','OCF-1',
      'fecha_orden',hoy-3,'lineas',jsonb_build_array(jsonb_build_object('producto_codigo','FOX-P1','cantidad_original',100,'cantidad_recibida',40,'precio_unitario',5))))),
    'balance',jsonb_build_array(
      jsonb_build_object('payload',jsonb_build_object('cuenta_contable_codigo','104101','debe',15000,'haber',0)),
      jsonb_build_object('payload',jsonb_build_object('cuenta_contable_codigo','50','debe',0,'haber',15000))),
    'stock',jsonb_build_array(
      jsonb_build_object('external_id','stock:FOX-P2:L1','fila',2,'stock',jsonb_build_object('producto_codigo','FOX-P2','almacen_codigo','FOX-ALM2',
        'sucursal_id',s,'fecha_corte',hoy,'cantidad',200,'costo_unitario',0.8,'lote','L1','fecha_vencimiento',hoy+300)),
      jsonb_build_object('external_id','stock:FOX-P2:sin','fila',3,'stock',jsonb_build_object('producto_codigo','FOX-P2','almacen_codigo','FOX-ALM2',
        'sucursal_id',s,'fecha_corte',hoy,'cantidad',1,'costo_unitario',0.8))));
  j:=public.ensayar_migracion_fox_582(t,a,lote_ensayo,jsonb_build_object('cuentas_bancarias',jsonb_build_object('registros',1,'saldo_local',15000),
    'oc_compra',jsonb_build_object('registros',1,'cantidad',60,'valor',300),'productos',jsonb_build_object('registros',2,'con_lote',1)),hoy);
  IF j->>'ensayo'<>'true' OR (j->>'errores')::integer<>2 OR j#>>'{conciliacion,cuadra}'<>'true'
    OR j#>>'{conciliacion,cruces,bancos_vs_apertura,cuadra}'<>'true'
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'registros') x WHERE x->>'id_origen'='00991'
      AND x->>'error' LIKE 'MIGRATION_FOX_ACCOUNT_PARENT_NOT_FOUND%' AND (x->>'fila')::integer=3)
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'registros') x WHERE x->>'id_origen'='stock:FOX-P2:sin'
      AND x->>'error' LIKE 'MIGRATION_STOCK_LOT_REQUIRED%')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'registros') x WHERE x->>'entidad'='BALANCE' AND (x->>'ok')::boolean)
  THEN RAISE EXCEPTION 'VERIFY582_REHEARSAL %', j; END IF;
  IF EXISTS (SELECT 1 FROM public.migracion_correspondencias WHERE tenant_id=t)
    OR EXISTS (SELECT 1 FROM public.migration_row_operations WHERE tenant_id=t)
    OR EXISTS (SELECT 1 FROM public.plan_cuentas WHERE tenant_id=t AND codigo='104101')
    OR EXISTS (SELECT 1 FROM public.productos WHERE tenant_id=t AND codigo IN ('FOX-P1','FOX-P2'))
    OR EXISTS (SELECT 1 FROM public.almacenes WHERE tenant_id=t AND codigo='FOX-ALM2')
    OR EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE tenant_id=t AND numero_cuenta='193-1234567-0-11')
    OR EXISTS (SELECT 1 FROM public.movimientos_bancarios WHERE tenant_id=t)
    OR EXISTS (SELECT 1 FROM public.ordenes_compra WHERE tenant_id=t AND numero='OCF-1')
    OR EXISTS (SELECT 1 FROM public.clientes WHERE tenant_id=t AND external_id='CLI-1')
  THEN RAISE EXCEPTION 'VERIFY582_REHEARSAL_PERSISTED'; END IF;
  BEGIN PERFORM public.ensayar_migracion_fox_582(t,b,lote_ensayo,NULL,hoy); RAISE EXCEPTION 'VERIFY582_AUDITOR_REHEARSES';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- 3. Importación real por entidad, en orden, con su corrida.
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES
    (t,'clientes',a,1) RETURNING id INTO run_cli;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'proveedores',a,1) RETURNING id INTO run_prv;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'almacenes',a,2) RETURNING id INTO run_a;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'plan_cuentas',a,3) RETURNING id INTO run_pc;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'productos',a,3) RETURNING id INTO run_p;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'cuentas_bancarias',a,2) RETURNING id INTO run_b;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'listas_precios',a,1) RETURNING id INTO run_l;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'cxc_abiertas',a,1) RETURNING id INTO run_cxc;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'oc_compra',a,1) RETURNING id INTO run_oc;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'pedidos_venta',a,1) RETURNING id INTO run_pv;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'balance_apertura',a,3) RETURNING id INTO run_bal;
  INSERT INTO public.migration_runs (tenant_id, run_type, started_by, total_rows) VALUES (t,'stock_inicial',a,1) RETURNING id INTO run_st;
  SELECT count(*) INTO outbox_antes FROM public.outbox_events WHERE tenant_id=t;
  SELECT count(*) INTO asientos_antes FROM public.asientos_contables WHERE tenant_id=t;

  PERFORM public.importar_cliente_historico_tx(t,a,run_cli,'CLI-1',lote_ensayo#>'{clientes,0,payload}');
  PERFORM public.importar_proveedor_historico_tx(t,a,run_prv,'PRV-1',lote_ensayo#>'{proveedores,0,payload}');

  j:=public.importar_maestro_fox_582(t,a,run_a,'ALMACEN','ALM-2',jsonb_build_object('codigo','FOX-ALM2','nombre','Almacén Callao'));
  IF j->>'action'<>'CREATED' OR (SELECT nombre FROM public.almacenes WHERE id=(j->>'id')::uuid)<>'Almacén Callao' THEN RAISE EXCEPTION 'VERIFY582_WAREHOUSE %', j; END IF;
  j:=public.importar_maestro_fox_582(t,a,run_a,'ALMACEN','ALM-1',jsonb_build_object('codigo',lower(alm_demo),'nombre','Principal FOX'));
  IF j->>'action'<>'ADOPTED' OR (SELECT codigo FROM public.almacenes WHERE id=(j->>'id')::uuid)<>alm_demo THEN RAISE EXCEPTION 'VERIFY582_WAREHOUSE_ADOPT %', j; END IF;

  j:=public.importar_maestro_fox_582(t,a,run_pc,'CUENTA_CONTABLE','1041',jsonb_build_object('codigo','1041','nombre','Cuentas corrientes'));
  IF j->>'action'<>'ADOPTED' OR j->>'id'<>cta1041::text THEN RAISE EXCEPTION 'VERIFY582_ACCOUNT_ADOPT %', j; END IF;
  j:=public.importar_maestro_fox_582(t,a,run_pc,'CUENTA_CONTABLE','104101',jsonb_build_object('codigo','104101','nombre','BCP corriente soles'));
  IF j->>'action'<>'CREATED' OR (SELECT cuenta_padre_id FROM public.plan_cuentas WHERE id=(j->>'id')::uuid)<>cta1041
    OR (SELECT nivel FROM public.plan_cuentas WHERE id=(j->>'id')::uuid) IS DISTINCT FROM (SELECT coalesce(nivel,0)+1 FROM public.plan_cuentas WHERE id=cta1041)
    OR (SELECT tipo_cuenta FROM public.plan_cuentas WHERE id=(j->>'id')::uuid) IS DISTINCT FROM (SELECT tipo_cuenta FROM public.plan_cuentas WHERE id=cta1041)
  THEN RAISE EXCEPTION 'VERIFY582_ACCOUNT_CREATE %', j; END IF;
  PERFORM public.importar_maestro_fox_582(t,a,run_pc,'CUENTA_CONTABLE','104102',jsonb_build_object('codigo','104102','nombre','Interbank corriente'));
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''CUENTA_CONTABLE'',''00991'',%L)',t,a,run_pc,
    jsonb_build_object('codigo','00991','nombre','Sin padre')),'MIGRATION_FOX_ACCOUNT_PARENT_NOT_FOUND');
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''CUENTA_CONTABLE'',''X1'',%L)',t,a,run_pc,
    jsonb_build_object('codigo','10A','nombre','Código inválido')),'MIGRATION_FOX_ACCOUNT_INVALID');

  p_prod:=jsonb_build_object('codigo','FOX-P1','nombre','Guantes de nitrilo','unidad_medida','kgm','precio_venta',12,'precio_compra',5);
  j:=public.importar_maestro_fox_582(t,a,run_p,'PRODUCTO','P-1',p_prod); p1:=(j->>'id')::uuid;
  IF j->>'action'<>'CREATED' OR (SELECT external_id||'|'||unidad_medida FROM public.productos WHERE id=p1)<>'P-1|KGM'
    OR coalesce((SELECT sum(stock_actual) FROM public.producto_existencias WHERE tenant_id=t AND producto_id=p1),0)<>0
  THEN RAISE EXCEPTION 'VERIFY582_PRODUCT %', j; END IF;
  j:=public.importar_maestro_fox_582(t,a,run_p,'PRODUCTO','P-1',p_prod);
  IF j->>'action'<>'IDEMPOTENT' OR j->>'id'<>p1::text THEN RAISE EXCEPTION 'VERIFY582_PRODUCT_REPLAY %', j; END IF;
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''PRODUCTO'',''P-1'',%L)',t,a,run_p,
    jsonb_set(p_prod,'{precio_venta}','13')),'MIGRATION_FOX_SOURCE_CHANGED');
  j:=public.importar_maestro_fox_582(t,a,run_p,'PRODUCTO','P-2',jsonb_build_object('codigo','FOX-P2','nombre','Amoxicilina 500 mg',
    'controla_lote',true,'requiere_vencimiento',true,'dias_minimos_vida_util',90)); p2:=(j->>'id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.inventario_lote_politicas WHERE tenant_id=t AND producto_id=p2 AND controla_lote AND requiere_vencimiento
      AND dias_minimos_vida_util=90) THEN RAISE EXCEPTION 'VERIFY582_PRODUCT_LOT_POLICY'; END IF;
  j:=public.importar_maestro_fox_582(t,a,run_p,'PRODUCTO','P-DEMO',jsonb_build_object('codigo',prod_demo,'nombre','Producto existente'));
  IF j->>'action'<>'ADOPTED' THEN RAISE EXCEPTION 'VERIFY582_PRODUCT_ADOPT %', j; END IF;
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''PRODUCTO'',''P-1B'',%L)',t,a,run_p,
    jsonb_build_object('codigo','fox-p1','nombre','Guantes duplicados')),'MIGRATION_FOX_TARGET_ALREADY_LINKED');
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''PRODUCTO'',''P-AMB'',%L)',t,a,run_p,
    jsonb_build_object('codigo','AMB','nombre','Ambiguo')),'MIGRATION_FOX_AMBIGUOUS_CODE');
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''PRODUCTO'',''P-PAR'',%L)',t,a,run_p,
    jsonb_build_object('codigo','FOX-PAR','nombre','Unidad sin homologar','unidad_medida','PAR')),'INVENTORY_MASTER_PRODUCT_UNIT_UNSUPPORTED');
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''PRODUCTO'',''P#1'',%L)',t,a,run_p,p_prod),
    'MIGRATION_FOX_INPUT_INVALID');

  -- Bancos: saldo de apertura como un solo movimiento migrado, sin asiento ni evento.
  p_banco:=jsonb_build_object('nombre','BCP Soles','banco','BCP','numero_cuenta','193-1234567-0-11','moneda','PEN',
    'cuenta_contable_codigo','104101','saldo_apertura',15000,'fecha_apertura',hoy);
  j:=public.importar_maestro_fox_582(t,a,run_b,'CUENTA_BANCARIA','BAN-1',p_banco); v_banco:=(j->>'id')::uuid;
  IF j->>'action'<>'CREATED' OR NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE id=v_banco AND saldo=15000 AND saldo_actual=15000
      AND saldo_contable=15000 AND saldo_inicial=15000)
    OR (SELECT count(*) FROM public.movimientos_bancarios WHERE tenant_id=t AND cuenta_bancaria_id=v_banco AND categoria='APERTURA_MIGRACION'
      AND tipo='ABONO' AND monto=15000 AND saldo_nuevo=15000)<>1
    OR (SELECT pc.codigo FROM public.cuentas_bancarias cb JOIN public.plan_cuentas pc ON pc.id=cb.cuenta_contable_id WHERE cb.id=v_banco)<>'104101'
  THEN RAISE EXCEPTION 'VERIFY582_BANK %', (SELECT to_jsonb(cb) FROM public.cuentas_bancarias cb WHERE id=v_banco); END IF;
  j:=public.importar_maestro_fox_582(t,a,run_b,'CUENTA_BANCARIA','BAN-1',p_banco);
  IF j->>'action'<>'IDEMPOTENT' OR (SELECT count(*) FROM public.movimientos_bancarios WHERE tenant_id=t)<>1 THEN RAISE EXCEPTION 'VERIFY582_BANK_REPLAY'; END IF;
  j:=public.importar_maestro_fox_582(t,a,run_b,'CUENTA_BANCARIA','BAN-2',jsonb_build_object('nombre','Interbank','banco','INTERBANK',
    'numero_cuenta','200 3001234567','saldo_apertura',3000,'fecha_apertura',hoy)); adoptada:=(j->>'id')::uuid;
  IF j->>'action'<>'ADOPTED' OR adoptada<>existente OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=existente)<>3000 THEN
    RAISE EXCEPTION 'VERIFY582_BANK_ADOPT %', j; END IF;
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''CUENTA_BANCARIA'',''BAN-3'',%L)',t,a,run_b,
    jsonb_set(p_banco,'{nombre}','"BCP repetida"')),'MIGRATION_FOX_BANK_ACCOUNT_IN_USE');
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''CUENTA_BANCARIA'',''BAN-4'',%L)',t,a,run_b,
    jsonb_build_object('nombre','Sin fecha','banco','BBVA','numero_cuenta','0011-0999','cuenta_contable_codigo','104101','saldo_apertura',10)),
    'MIGRATION_FOX_BANK_OPENING_DATE_REQUIRED');
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''CUENTA_BANCARIA'',''BAN-5'',%L)',t,a,run_b,
    jsonb_build_object('nombre','Cuenta mal','banco','BBVA','numero_cuenta','0011-0998','cuenta_contable_codigo','104999')),
    'MIGRATION_FOX_REFERENCE_NOT_FOUND');

  j:=public.importar_maestro_fox_582(t,a,run_l,'LISTA_PRECIOS','LP-1',jsonb_build_object('codigo','FOX-LP1','nombre','Lista hospitales','vigencia_desde',hoy,
    'cliente_codigo','CLI-1','lineas',jsonb_build_array(jsonb_build_object('producto_codigo','FOX-P1','precio_unitario',11.5))));
  IF (SELECT count(*) FROM public.lista_precios_venta_detalles WHERE lista_id=(j->>'id')::uuid)<>1
    OR (SELECT cliente_id FROM public.listas_precios_venta WHERE id=(j->>'id')::uuid) IS NULL THEN RAISE EXCEPTION 'VERIFY582_PRICE_LIST %', j; END IF;
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''LISTA_PRECIOS'',''LP-2'',%L)',t,a,run_l,
    jsonb_build_object('codigo','FOX-LP2','nombre','Lista mal','vigencia_desde',hoy,'lineas',jsonb_build_array(
      jsonb_build_object('producto_codigo','NO-EXISTE','precio_unitario',1)))),'MIGRATION_FOX_PRODUCT_NOT_FOUND');

  PERFORM public.importar_cxc_apertura_tx(t,a,run_cxc,'CXC-1',(lote_ensayo#>'{cxc,0,payload}') - 'codigo_tercero'
    || jsonb_build_object('cliente_id',app.fox_unico_582(t,'clientes','CLI-1'),'fecha_corte',hoy));

  -- OC de compra: sólo lo pendiente de recibir, en borrador, al precio pactado.
  p_oc:=jsonb_build_object('proveedor_codigo','PRV-1','numero','OCF-1','fecha_orden',hoy-3,'almacen_codigo','FOX-ALM2','lineas',jsonb_build_array(
    jsonb_build_object('producto_codigo','FOX-P1','cantidad_original',100,'cantidad_recibida',40,'precio_unitario',5),
    jsonb_build_object('producto_codigo','FOX-P2','cantidad_original',50,'cantidad_recibida',50,'precio_unitario',0.8)));
  j:=public.importar_maestro_fox_582(t,a,run_oc,'OC_COMPRA','OCC-1',p_oc); oc:=(j->>'id')::uuid;
  IF (SELECT estado FROM public.ordenes_compra WHERE id=oc)<>'BORRADOR'
    OR NOT EXISTS (SELECT 1 FROM public.orden_compra_detalles WHERE orden_id=oc HAVING count(*)=1 AND sum(cantidad)=60 AND min(precio_unitario)=5)
    OR (SELECT a2.codigo FROM public.ordenes_compra o JOIN public.almacenes a2 ON a2.id=o.almacen_destino_id WHERE o.id=oc)<>'FOX-ALM2'
  THEN RAISE EXCEPTION 'VERIFY582_PURCHASE_ORDER %', (SELECT jsonb_agg(to_jsonb(d)) FROM public.orden_compra_detalles d WHERE orden_id=oc); END IF;
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''OC_COMPRA'',''OCC-2'',%L)',t,a,run_oc,
    jsonb_set(jsonb_set(p_oc,'{numero}','"OCF-2"'),'{lineas,0,cantidad_recibida}','100')),'MIGRATION_FOX_NOTHING_OPEN');
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''OC_COMPRA'',''OCC-3'',%L)',t,a,run_oc,
    jsonb_set(p_oc,'{proveedor_codigo}','"PRV-9"')),'MIGRATION_FOX_SUPPLIER_NOT_FOUND');

  -- Pedido de venta: lo pendiente de despachar, conserva el precio de FOX aunque la lista diga otro.
  p_pv:=jsonb_build_object('cliente_codigo','20100070970','numero','PV-9','lineas',jsonb_build_array(
    jsonb_build_object('producto_codigo','FOX-P1','cantidad_original',30,'cantidad_despachada',10,'precio_unitario',12)));
  j:=public.importar_maestro_fox_582(t,a,run_pv,'PEDIDO_VENTA','PV-9',p_pv); pv:=(j->>'id')::uuid;
  IF (SELECT estado FROM public.pedidos_venta WHERE id=pv)<>'PENDIENTE' OR (SELECT metadata->>'numero_origen' FROM public.pedidos_venta WHERE id=pv)<>'PV-9'
    OR NOT EXISTS (SELECT 1 FROM public.pedidos_venta_detalle WHERE pedido_id=pv HAVING sum(cantidad)=20 AND min(precio_unitario)=12)
    OR (SELECT subtotal FROM public.pedidos_venta WHERE id=pv)<>240
  THEN RAISE EXCEPTION 'VERIFY582_SALES_ORDER %', (SELECT jsonb_agg(to_jsonb(d)) FROM public.pedidos_venta_detalle d WHERE pedido_id=pv); END IF;
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''PEDIDO_VENTA'',''PV-10'',%L)',t,a,run_pv,
    jsonb_set(p_pv,'{cliente_codigo}','"00000000"')),'MIGRATION_FOX_CLIENT_NOT_FOUND');

  -- Maestros y saldos abiertos no generan asientos, eventos, despachos ni cobranzas.
  IF (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t)<>outbox_antes
    OR (SELECT count(*) FROM public.asientos_contables WHERE tenant_id=t)<>asientos_antes
  THEN RAISE EXCEPTION 'VERIFY582_SIDE_EFFECTS'; END IF;

  -- El balance de apertura se importa después, con las subcuentas ya creadas.
  PERFORM public.importar_balance_apertura_tx(t,a,run_bal,hoy,jsonb_build_array(
    jsonb_build_object('cuenta_id',app.fox_unico_582(t,'plan_cuentas','104101'),'debe',15000,'haber',0,'concepto','Bancos'),
    jsonb_build_object('cuenta_id',cta1041,'debe',3000,'haber',0,'concepto','Bancos'),
    jsonb_build_object('cuenta_id',app.fox_unico_582(t,'plan_cuentas','50'),'debe',0,'haber',18000,'concepto','Capital')));
  PERFORM public.importar_stock_inicial_tx(t,a,run_st,'stock:FOX-P2:L1',jsonb_build_object('producto_id',p2,
    'almacen_id',app.fox_unico_582(t,'almacenes','FOX-ALM2'),'sucursal_id',s,'fecha_corte',hoy,'cantidad',200,'costo_unitario',0.8,
    'lote','L1','fecha_vencimiento',hoy+300));

  -- 4. Conciliación: totales de control, diferencias y cruce bancos/104.
  control:=jsonb_build_object('clientes',jsonb_build_object('registros',1),'proveedores',jsonb_build_object('registros',1),
    'almacenes',jsonb_build_object('registros',2),'cuentas_contables',jsonb_build_object('registros',3,'creadas',2),
    'productos',jsonb_build_object('registros',3,'con_lote',1),'cuentas_bancarias',jsonb_build_object('registros',2,'saldo_local',18000),
    'listas_precios',jsonb_build_object('registros',1,'lineas',1),'cxc',jsonb_build_object('registros',1,'saldo',500),
    'oc_compra',jsonb_build_object('registros',1,'lineas',1,'cantidad',60,'valor',300),
    'pedidos_venta',jsonb_build_object('registros',1,'lineas',1,'cantidad',20,'valor',240),
    'balance',jsonb_build_object('lineas',3,'debe',18000,'haber',18000),'stock',jsonb_build_object('registros',1,'lotes',1,'cantidad',200,'valor',160));
  j:=public.conciliar_migracion_fox_582(t,a,control);
  IF j->>'cuadra'<>'true' OR j#>>'{cruces,bancos_vs_apertura,cuadra}'<>'true' OR jsonb_array_length(j->'entidades')<>12
    OR jsonb_array_length(j#>'{cruces,bancos_vs_apertura,cuentas}')<>2 THEN
    RAISE EXCEPTION 'VERIFY582_RECONCILE %', j; END IF;
  j:=public.conciliar_migracion_fox_582(t,a,jsonb_set(control,'{cuentas_bancarias,saldo_local}','18500'));
  IF j->>'cuadra'<>'false' OR (SELECT (x#>>'{diferencias,saldo_local}')::numeric FROM jsonb_array_elements(j->'entidades') x
      WHERE x->>'entidad'='cuentas_bancarias')<>-500 THEN RAISE EXCEPTION 'VERIFY582_RECONCILE_DIFF %', j; END IF;
  -- Una cuenta en dólares exige su tipo de cambio y cruza en moneda local.
  PERFORM pg_temp.reject582(format('SELECT public.importar_maestro_fox_582(%L,%L,%L,''CUENTA_BANCARIA'',''BAN-USD'',%L)',t,a,run_b,
    jsonb_build_object('nombre','BCP dólares','banco','BCP','numero_cuenta','193-7777777-1-99','moneda','USD',
      'cuenta_contable_codigo','104101','saldo_apertura',100,'fecha_apertura',hoy)),'MIGRATION_FOX_BANK_EXCHANGE_RATE_REQUIRED');
  j:=public.importar_maestro_fox_582(t,a,run_b,'CUENTA_BANCARIA','BAN-USD',jsonb_build_object('nombre','BCP dólares','banco','BCP',
    'numero_cuenta','193-7777777-1-99','moneda','USD','cuenta_contable_codigo','104102','saldo_apertura',100,'fecha_apertura',hoy,'tipo_cambio',3.75));
  IF (SELECT monto_moneda_local||'|'||tipo_cambio FROM public.movimientos_bancarios WHERE cuenta_bancaria_id=(j->>'id')::uuid)
      NOT IN ('375.00|3.75','375.00|3.750000','375|3.75')
    OR (public.conciliar_migracion_fox_582(t,a,'{}'::jsonb))#>>'{cruces,bancos_vs_apertura,cuadra}'<>'false'
  THEN RAISE EXCEPTION 'VERIFY582_BANK_FX %', (SELECT to_jsonb(m) FROM public.movimientos_bancarios m WHERE cuenta_bancaria_id=(j->>'id')::uuid); END IF;
  PERFORM pg_temp.reject582(format('SELECT public.conciliar_migracion_fox_582(%L,%L,%L)',t,a,'{"nomina":{}}'),'MIGRATION_FOX_CONTROL_INVALID');
  BEGIN PERFORM public.conciliar_migracion_fox_582(t,oa,control); RAISE EXCEPTION 'VERIFY582_FOREIGN_RECONCILE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- 5. Permisos y aislamiento.
  BEGIN PERFORM public.importar_maestro_fox_582(t,b,NULL,'PRODUCTO','P-9',p_prod); RAISE EXCEPTION 'VERIFY582_AUDITOR_IMPORTS';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.importar_maestro_fox_582(t,oa,NULL,'PRODUCTO','P-9',p_prod); RAISE EXCEPTION 'VERIFY582_FOREIGN_ACTOR';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM = 'VERIFY582_FOREIGN_ACTOR' THEN RAISE; END IF;
  END;
  DELETE FROM public.user_roles WHERE usuario_sistema_id=b;
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  SELECT b, r.id, t FROM public.roles r WHERE r.tenant_id=t AND upper(r.nombre)='VENDEDOR';
  BEGIN PERFORM public.consultar_archivo_fox_582(t,b,'{}'::jsonb); RAISE EXCEPTION 'VERIFY582_SELLER_READS';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.migracion_correspondencias WHERE tenant_id=ot)
    OR EXISTS (SELECT 1 FROM public.migracion_archivo WHERE tenant_id=ot) THEN RAISE EXCEPTION 'VERIFY582_ISOLATION'; END IF;
  SELECT count(*) INTO n FROM public.migracion_correspondencias WHERE tenant_id=t;
  -- 2 almacenes, 3 cuentas contables, 3 productos, 3 bancos, 1 lista, 1 OC y 1 pedido.
  IF n<>14 THEN RAISE EXCEPTION 'VERIFY582_CORRESPONDENCES %', n; END IF;
  RAISE NOTICE 'VERIFY582_OK: archivo íntegro inmutable y consultable, ensayo integral sin persistencia, maestros y saldos abiertos por writers con adopción, rechazos explícitos, conciliación con cruce bancos/104, permisos y aislamiento';
END $verify$;
ROLLBACK;
