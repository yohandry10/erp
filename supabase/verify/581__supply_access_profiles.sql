\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  t uuid; a uuid; s uuid; ot uuid; oa uuid; w uuid; cl uuid; pr uuid; c uuid; l uuid; j jsonb; hoy date; f record; n integer := 0;
  stmt text; esperado text[] := ARRAY['alertas.suministro.gestionar','alertas.suministro.ver','inventario.lotes.read',
    'reports.suministro.export','reports.suministro.read','ventas.contratos.conformar','ventas.contratos.gestionar',
    'ventas.contratos.ver','ventas.penalidades.gestionar','ventas.penalidades.ver'];
  universo text[] := ARRAY['ventas.contratos.ver','ventas.contratos.gestionar','ventas.contratos.conformar','ventas.penalidades.ver',
    'ventas.penalidades.gestionar','ventas.penalidades.aprobar','inventario.lotes.read','inventario.lotes.manage',
    'reports.suministro.read','reports.suministro.export','alertas.suministro.ver','alertas.suministro.gestionar',
    'integraciones.bi.gestionar','migration.suministro.import'];
  calc uuid; audit_antes integer;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY581_LOCAL_ONLY'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
  j:=public.create_demo_tenant_ready_tx('VERIFY581',14,'PE','verify581-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
  j:=public.create_demo_tenant_ready_tx('VERIFY581OTHER',14,'PE','verify581other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
  SELECT id INTO s FROM public.usuarios_sistema WHERE tenant_id=t AND id<>a AND coalesce(activo,false) AND lower(estado::text)='activo' ORDER BY id LIMIT 1;

  -- Matriz: el perfil SUMINISTRO existe con su conjunto exacto dentro del universo de suministro.
  IF (SELECT array_agg(p.codigo ORDER BY p.codigo) FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id
      JOIN public.permisos p ON p.id=rp.permiso_id WHERE r.tenant_id=t AND upper(r.nombre)='SUMINISTRO' AND p.codigo=ANY(universo))
     IS DISTINCT FROM esperado
  THEN RAISE EXCEPTION 'VERIFY581_PROFILE %', (SELECT array_agg(p.codigo ORDER BY p.codigo) FROM public.roles r
    JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos p ON p.id=rp.permiso_id
    WHERE r.tenant_id=t AND upper(r.nombre)='SUMINISTRO' AND p.codigo=ANY(universo)); END IF;
  -- Segregación: calcular y aprobar penalidades, BI y migración no se reúnen fuera de la administración.
  IF EXISTS (SELECT 1 FROM public.roles r WHERE r.tenant_id=t AND upper(r.nombre) NOT IN ('ADMIN','ADMIN_DEMO')
      AND (SELECT count(*) FROM public.rol_permisos rp JOIN public.permisos p ON p.id=rp.permiso_id
        WHERE rp.role_id=r.id AND p.codigo IN ('ventas.penalidades.gestionar','ventas.penalidades.aprobar'))=2)
    OR EXISTS (SELECT 1 FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos p ON p.id=rp.permiso_id
      WHERE r.tenant_id=t AND upper(r.nombre) NOT IN ('ADMIN','ADMIN_DEMO')
        AND p.codigo IN ('integraciones.bi.gestionar','migration.suministro.import'))
    OR EXISTS (SELECT 1 FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos p ON p.id=rp.permiso_id
      WHERE r.tenant_id=t AND upper(r.nombre)='VENDEDOR' AND p.codigo=ANY(universo) AND p.codigo NOT IN ('ventas.contratos.ver','inventario.lotes.read'))
    OR EXISTS (SELECT 1 FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos p ON p.id=rp.permiso_id
      WHERE r.tenant_id=t AND upper(r.nombre)='AUDITOR' AND p.codigo=ANY(universo)
        AND p.codigo NOT IN ('ventas.penalidades.ver','reports.suministro.read','alertas.suministro.ver','ventas.contratos.ver','inventario.lotes.read'))
    OR NOT EXISTS (SELECT 1 FROM public.roles r JOIN public.rol_permisos rp ON rp.role_id=r.id JOIN public.permisos p ON p.id=rp.permiso_id
      WHERE r.tenant_id=t AND upper(r.nombre)='GERENCIA' AND p.codigo='ventas.penalidades.aprobar')
  THEN RAISE EXCEPTION 'VERIFY581_SEGREGATION'; END IF;

  -- Segregación en uso: SUMINISTRO contrata y calcula, pero no aprueba, no emite credenciales BI ni migra.
  DELETE FROM public.user_roles WHERE usuario_sistema_id=s;
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  SELECT s, r.id, t FROM public.roles r WHERE r.tenant_id=t AND upper(r.nombre)='SUMINISTRO';
  hoy:=app.hoy_tenant(t);
  SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
  SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC, id LIMIT 1;
  j:=public.crear_producto_inventario_tx(t,jsonb_build_object('codigo','PROD-581','nombre','Insumo de perfiles','categoria','VERIFICACION',
    'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'),w,10,0,'[]'::jsonb); pr:=(j->>'id')::uuid;
  UPDATE public.productos SET unidad_medida='NIU' WHERE tenant_id=t AND id=pr;
  SELECT count(*) INTO audit_antes FROM public.audit_log WHERE tenant_id=t;
  j:=public.operar_suministro_570(t,s,'CREAR_CONTRATO',NULL,jsonb_build_object('cliente_id',cl,'numero','581','asunto','Contrato del perfil',
    'moneda','PEN','vigencia_desde',hoy-60,'vigencia_hasta',hoy+300,'responsable_id',s,'lineas',jsonb_build_array(
      jsonb_build_object('producto_id',pr,'cantidad',100,'precio_unitario',10))),'581-contract');
  c:=(j->>'id')::uuid; SELECT id INTO l FROM public.suministro_contrato_lineas WHERE contrato_id=c;
  PERFORM public.operar_suministro_570(t,s,'ACTIVAR',c,'{"version":1}','581-activate');
  j:=public.operar_suministro_570(t,s,'CREAR_OC',c,jsonb_build_object('numero','OC581','fecha_emision',hoy-30,'lineas',jsonb_build_array(
    jsonb_build_object('contrato_linea_id',l,'cantidad',50))),'581-order');
  j:=public.operar_suministro_570(t,s,'PROGRAMAR',c,jsonb_build_object('orden_linea_id',(SELECT id FROM public.suministro_orden_lineas
    WHERE orden_cliente_id=(j->>'id')::uuid),'cantidad',20,'fecha_programada',hoy-5,'destino','Hospital'),'581-schedule');
  PERFORM public.operar_penalidades_578(t,s,c,'GUARDAR_REGLA',jsonb_build_object('nombre','Uno por ciento diario','metodo','PORCENTAJE_DIARIO',
    'base_calculo','VALOR_ENTREGA','tasa',1,'motivo','Cláusula del perfil'),'581-rule');
  PERFORM public.operar_penalidades_578(t,s,c,'CALCULAR',jsonb_build_object('fecha_corte',hoy),'581-calc');
  SELECT id INTO calc FROM public.penalidad_calculos WHERE contrato_id=c LIMIT 1;
  BEGIN PERFORM public.operar_penalidades_578(t,s,c,'REVISAR_CALCULO',jsonb_build_object('calculo_id',calc,'version',1,'accion','APROBAR',
      'monto_aprobado',1,'comentario','Aprobación del responsable'),'581-approve'); RAISE EXCEPTION 'VERIFY581_PROFILE_APPROVES';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.operar_credenciales_bi_579(t,s,'CREAR',jsonb_build_object('nombre','Power BI','datasets',jsonb_build_array('entregas'),
      'expira_en',hoy+30,'token_digest',repeat('a',64),'prefijo','aaaaaaaa'),'581-bi'); RAISE EXCEPTION 'VERIFY581_PROFILE_BI';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.ensayar_migracion_fox_580(t,s,'{}','{}'); RAISE EXCEPTION 'VERIFY581_PROFILE_MIGRATES';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.registrar_corte_tablero_579(t,s,'581-cutoff');

  -- Auditoría: cada decisión deja su rastro con actor.
  IF (SELECT count(*) FROM public.suministro_historial WHERE contrato_id=c AND actor_id=s
        AND accion IN ('CREAR_CONTRATO','ACTIVAR','CREAR_OC','PROGRAMAR','PENALIDAD_GUARDAR_REGLA','PENALIDAD_CALCULAR'))<>6
    OR NOT EXISTS (SELECT 1 FROM public.audit_log WHERE tenant_id=t AND user_id=s AND table_name='penalidades')
    OR NOT EXISTS (SELECT 1 FROM public.audit_log WHERE tenant_id=t AND user_id=s AND table_name='tablero_cortes')
    OR (SELECT count(*) FROM public.audit_log WHERE tenant_id=t)<=audit_antes
  THEN RAISE EXCEPTION 'VERIFY581_AUDIT'; END IF;

  -- Aislamiento: ninguna RPC de suministro acepta un actor de otra empresa.
  FOR f IN SELECT p.proname, p.pronargs, p.proargtypes FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.proname ~ '_(57[0-9]|58[0-9])$' AND p.pronargs>=2
      AND (p.proargnames)[1]='p_tenant_id' AND (p.proargnames)[2]='p_actor_id'
    ORDER BY p.proname
  LOOP
    stmt:=format('SELECT public.%I(%L::uuid, %L::uuid%s)', f.proname, t, oa,
      coalesce((SELECT string_agg(', NULL::'||format_type(x.typ, NULL), '' ORDER BY x.ord)
        FROM unnest(f.proargtypes::oid[]) WITH ORDINALITY x(typ, ord) WHERE x.ord>2), ''));
    BEGIN
      EXECUTE stmt;
      RAISE EXCEPTION 'VERIFY581_CROSS_TENANT %', f.proname;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'VERIFY581_CROSS_TENANT%' THEN RAISE; END IF;
      n:=n+1;
    END;
  END LOOP;
  IF n<20 THEN RAISE EXCEPTION 'VERIFY581_SWEEP_COVERAGE %', n; END IF;
  -- Y una empresa no ve los registros de otra por identificador.
  BEGIN PERFORM public.consultar_penalidades_578(ot,oa,c); RAISE EXCEPTION 'VERIFY581_FOREIGN_READ';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  RAISE NOTICE 'VERIFY581_OK: perfil SUMINISTRO, segregación por rol y en uso, auditoría y aislamiento en % RPC', n;
END $verify$;
ROLLBACK;
