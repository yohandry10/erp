import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';

const changedFunctions=[
 'apply_empresa_config_patch_464','actualizar_empresa_config_tx',
 'crear_cotizacion_comercial_tx','actualizar_cotizacion_comercial_tx','crear_pedido_comercial_tx','actualizar_pedido_comercial_legacy_531',
 'gestionar_maestro_contable_tx_482',
 'crear_cotizacion_compra_tx','actualizar_cotizacion_compra_tx','insert_purchase_order_453','actualizar_orden_compra_tx','convertir_cotizacion_compra_a_oc_tx',
 'cerrar_periodo_contable_tx',
 'crear_almacen_maestro_tx','actualizar_almacen_maestro_tx','crear_almacen_maestro_tx_460','actualizar_almacen_maestro_tx_460',
 'seed_operational_rbac_for_tenant','seed_operational_rbac_for_tenant_base_570','iniciar_cambio_turno_caja_tx',
 'aplicar_movimiento_inventario_tx','crear_producto_maestro_tx','crear_producto_inventario_tx','validar_inventory_stock_reconciliation_runtime','reporte_kardex_valorizado_470','pos_registrar_venta_atomic_tx_451','transferir_inventario_tx_455','registrar_ajuste_inventario_tx_455','despachar_pedido_parcial_tx',
 'finalizar_anulacion_cpe_tx','facturar_pedido_venta_tx','sucursal_de_serie','balance_general_live',
 'cerrar_conciliacion_bancaria_tx','enforce_liquidacion_lifecycle_449','guardar_liquidacion_calculada_tx','confirmar_liquidacion_tx','emitir_cpe_directo_peru_tx','guardar_calculo_planilla_tx',
 'build_sire_snapshot_463','crear_factura_proveedor_tx','is_accounting_owned_outbox_event_492','is_accounting_event_458','cerrar_caja_tx_518',
];
const newFunctions=['accounting_close_conditions_570','validar_cierre_periodo_contable_570','guardar_normativa_peru_periodo_tx_570','guardar_calculo_planilla_normativa_base_570','vincular_cxc_cpe_contado_tx_570','sucursal_activa_570','audit_almacen_sucursal_570','enforce_caja_establecimiento_570',
 'registrar_serie_establecimiento_tx_570','registrar_serie_establecimiento_tx','sembrar_lecturas_roles_570',
 'costo_inventario_base_570','costo_promedio_movimiento_570','seed_peru_capital_account_570','seed_peru_capital_config_570',
 'cxp_original_fiscal_amounts_570','guard_cxp_original_fiscal_amounts_570','preserve_cxp_fiscal_snapshot_time_570','registrar_nota_credito_proveedor_devolucion_tx','guard_supplier_credit_570','registrar_nota_credito_proveedor_tx','aplicar_credito_proveedor_tx','revertir_detraccion_proveedor_pendiente_tx','guardar_calculo_planilla_gratificacion_tx_570','guardar_calculo_planilla_eps_tx_570'];
newFunctions.push('revaluacion_simulacion_570','guard_revaluacion_570','registrar_revaluacion_tx_570');
newFunctions.push('assert_reviewed_commercial_prices_570');
newFunctions.push('provisionar_cobranza_dudosa_tx_570');
newFunctions.push('crear_presupuesto_tx_570');
newFunctions.push('actualizar_presupuesto_tx_570');
newFunctions.push('registrar_entrega_pedido_tx_570');
newFunctions.push('eliminar_presupuesto_tx_570');
newFunctions.push('resolver_edicion_presupuesto_tx_570');
newFunctions.push("assert_calculation_request_570","leer_recibo_calculo_planilla_570","guardar_calculo_planilla_operacion_tx_570","resolver_calculo_planilla_tx_570");
changedFunctions.push('crear_planilla_tx_495');
newFunctions.push("assert_payroll_creation_request_570","guard_payroll_creation_key_570","leer_recibo_alta_planilla_570","crear_planilla_operacion_tx_570","resolver_alta_planilla_tx_570");
newFunctions.push('inventory_operation_request_570','guard_inventory_operation_key_570','resolver_operacion_inventario_tx_570');
newFunctions.push('leer_lote_depreciacion_570','registrar_lote_depreciacion_tx_570');
newFunctions.push('asset_original_snapshot_570','leer_operacion_activo_570','guardar_operacion_activo_tx_570');
const changedTriggers=['trg_zz_caja_establecimiento_570','trg_zz_costo_promedio_570','trg_seed_peru_capital_account_570','trg_cxp_original_fiscal_amounts_570','zz_preserve_cxp_fiscal_snapshot_time_570','trg_supplier_credit_570','trg_supplier_credit_ledger_570',
 'trg_fx_revaluacion_asiento_570','trg_fx_revaluacion_cxc_570','trg_fx_revaluacion_cxp_570','trg_fx_revaluacion_cotizacion_570'];
const equal=(a,b,message)=>assert.ok(isDeepStrictEqual(a,b),message);
const list=names=>names.map(n=>`'${n}'`).join(',');
const quantityColumns=[['productos','stock'],['productos','stock_actual'],['productos','stock_reservado'],['productos','stock_minimo'],
 ['producto_existencias','stock_actual'],['producto_existencias','stock_reservado'],['producto_existencias','stock_danado'],['producto_existencias','stock_minimo'],['movimientos_inventario','cantidad']];
const quantityPredicate=`n.nspname='public' AND (c.relname,a.attname) IN (${quantityColumns.map(([table,column])=>`('${table}','${column}')`).join(',')})`;
const normalizedView=(()=>{
 let definition='pg_get_viewdef(c.oid,true)';
 for(const [view,names] of [['vista_pos_productos',['stock_actual_num','stock_reservado_num','stock_minimo_num']],['vw_kardex_valorizado',['cantidad_recibida','cantidad_movimiento','cantidad_firmada']]]) {
  let expected='pg_get_viewdef(c.oid,true)';
  for(const name of names) expected=`replace(${expected},'::numeric(18,6) AS ${name}','::numeric(14,2) AS ${name}')`;
  if(view==='vista_pos_productos')expected=`replace(${expected},'NULL::numeric(18,6)','NULL::numeric(14,2)')`;
  definition=`CASE WHEN n.nspname='public' AND c.relname='${view}' THEN ${expected} ELSE ${definition} END`;
 }
 return definition;
})();
const branches=table=>`(SELECT coalesce(jsonb_object_agg(t.id::text,t.sucursal_id),'{}'::jsonb) FROM public.${table} t)`;
const expectedBranches=table=>`(SELECT coalesce(jsonb_object_agg(t.id::text,coalesce((SELECT ds.sucursal_id FROM public.documento_series ds
 WHERE ds.tenant_id=t.tenant_id AND upper(btrim(ds.serie))=upper(btrim(t.serie)) AND upper(btrim(ds.tipo_documento))=CASE upper(btrim(t.tipo_documento)) WHEN '01' THEN 'FACTURA' WHEN '03' THEN 'BOLETA' WHEN '07' THEN 'NOTA_CREDITO' WHEN '08' THEN 'NOTA_DEBITO' ELSE upper(btrim(t.tipo_documento)) END
 LIMIT 1),app.casa_matriz_de(t.tenant_id))),'{}'::jsonb) FROM public.${table} t)`;
export function peru570StateSql(requiredSchema) {
 assert.ok([569,570].includes(requiredSchema));
 return `SELECT jsonb_build_object(
 'project',(SELECT project_ref FROM app.deployment_environment WHERE singleton),
 'environment',(SELECT environment FROM app.deployment_environment WHERE singleton),
 'schema',(SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$'),
 'ready',coalesce((public.outbox_runtime_health_492(p_required_schema_version=>${requiredSchema})->>'ready')::boolean,false),
 'existingData',(SELECT jsonb_object_agg(n.nspname||'.'||c.relname,
   md5(query_to_xml(format('SELECT coalesce(string_agg(md5(normalized::text),'''' ORDER BY normalized::text),'''') AS fingerprint FROM (SELECT (SELECT jsonb_object_agg(e.key,CASE WHEN jsonb_typeof(e.value)=''number'' THEN to_jsonb(trim_scale((e.value#>>''{}'')::numeric)) ELSE e.value END) FROM jsonb_each(to_jsonb(t)-%L::text[])e) normalized FROM %I.%I t %s)rows',
     CASE c.relname WHEN 'productos' THEN '{costo,costo_promedio_base,updated_at}' WHEN 'cpe' THEN '{sucursal_id,updated_at}'
       WHEN 'documentos' THEN '{sucursal_id,updated_at}' WHEN 'cuentas_por_pagar' THEN '{original_fiscal_amounts,saldo_credito_proveedor}' WHEN 'normativa_peru_periodos' THEN '{afp_remuneracion_max_asegurable}' ELSE '{}' END,
     n.nspname,c.relname,CASE WHEN c.relname='plan_cuentas' AND n.nspname='public' THEN 'WHERE codigo NOT IN(''50'',''10411'',''10412'',''6391'')' ELSE '' END),false,true,'')::text))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p')
     AND n.nspname IN('public','app','auth','storage') AND NOT(n.nspname='app' AND c.relname IN('rrhh_calculation_operations_570','rrhh_payroll_creation_operations_570','inventory_operation_abandonments_570','asset_depreciation_batches_570','asset_lifecycle_operations_570')) AND NOT(n.nspname='public' AND c.relname IN('rol_permisos','cxp_credito_proveedor_movimientos'))),
 'tableSecurity',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,
   (SELECT coalesce(jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb)
    FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE NOT(n.nspname='public' AND c.relname IN('pagos_facturas','plantillas_asientos_detalle','plantillas_asientos_historial','depreciaciones','knowledge_base','pedido_despachos','documento_archivos','cxc_cobro_reversas','distribucion_analitica','producto_precios_sucursal','producto_stock_sucursal') AND a.grantee='service_role'::regrole AND a.privilege_type='SELECT' AND NOT a.is_grantable)))::text,'' ORDER BY n.nspname,c.relname),'')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p') AND n.nspname IN('public','app','auth','storage') AND NOT(n.nspname='app' AND c.relname IN('rrhh_calculation_operations_570','rrhh_payroll_creation_operations_570','inventory_operation_abandonments_570','asset_depreciation_batches_570','asset_lifecycle_operations_570')) AND c.relname<>'cxp_credito_proveedor_movimientos'),
 'supplierPaymentBackendRead',has_table_privilege('service_role','public.pagos_facturas','SELECT'),
 'templateBackendRead',has_table_privilege('service_role','public.plantillas_asientos_detalle','SELECT') AND has_table_privilege('service_role','public.plantillas_asientos_historial','SELECT'),
 'depreciationBackendRead',has_table_privilege('service_role','public.depreciaciones','SELECT'),
 'helpBackendRead',has_table_privilege('service_role','public.knowledge_base','SELECT'),
 'dispatchBackendRead',has_table_privilege('service_role','public.pedido_despachos','SELECT'),
 'documentFilesBackendRead',has_table_privilege('service_role','public.documento_archivos','SELECT'),
 'cpeCancellationBackendRead',has_table_privilege('service_role','public.cxc_cobro_reversas','SELECT'),
 'analyticBackendRead',has_table_privilege('service_role','public.distribucion_analitica','SELECT'),
 'productBranchBackendRead',has_table_privilege('service_role','public.producto_precios_sucursal','SELECT') AND has_table_privilege('service_role','public.producto_stock_sucursal','SELECT'),
 'policies',(SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY p.schemaname,p.tablename,p.policyname),'')) FROM pg_policies p WHERE schemaname IN('public','app','auth','storage') AND tablename<>'cxp_credito_proveedor_movimientos'),
 'existingColumns',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,a.attname,a.atttypid::regtype::text,CASE WHEN ${quantityPredicate} THEN 917510 ELSE a.atttypmod END,a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid))::text,'' ORDER BY n.nspname,c.relname,a.attnum),'')) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN('r','p') AND n.nspname IN('public','app','auth','storage') AND NOT(n.nspname='app' AND c.relname IN('rrhh_calculation_operations_570','rrhh_payroll_creation_operations_570','inventory_operation_abandonments_570','asset_depreciation_batches_570','asset_lifecycle_operations_570')) AND c.relname<>'cxp_credito_proveedor_movimientos' AND NOT(n.nspname='public' AND ((c.relname='productos' AND a.attname='costo_promedio_base') OR (c.relname='normativa_peru_periodos' AND a.attname='afp_remuneracion_max_asegurable') OR (c.relname='cuentas_por_pagar' AND a.attname IN('original_fiscal_amounts','saldo_credito_proveedor'))))),
 'normativeCaps',(SELECT coalesce(jsonb_object_agg(n.id::text,to_jsonb(n)->'afp_remuneracion_max_asegurable'),'{}'::jsonb) FROM public.normativa_peru_periodos n),
 'normativeCapColumn',(SELECT jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'privileges',a.attacl) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.normativa_peru_periodos'::regclass AND a.attname='afp_remuneracion_max_asegurable' AND a.attnum>0 AND NOT a.attisdropped),
 'quantityColumnTypes',(SELECT jsonb_object_agg(c.relname||'.'||a.attname,format_type(a.atttypid,a.atttypmod)) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped AND ${quantityPredicate}),
 'existingViews',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relowner,c.reloptions,
  (SELECT jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),obj_description(c.oid,'pg_class'),
  (SELECT jsonb_agg(jsonb_build_array(a.attname,a.attacl,col_description(c.oid,a.attnum)) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),${normalizedView})::text,'' ORDER BY n.nspname,c.relname),'')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('v','m') AND n.nspname IN('public','app','auth','storage')),
 'existingFunctions',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl)::text,'' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN('public','app') AND p.proname NOT IN(${list([...changedFunctions,...newFunctions])})),
 'existingTriggers',(SELECT md5(coalesce(string_agg(pg_get_triggerdef(t.oid,true),'' ORDER BY t.tgrelid::regclass::text,t.tgname),'')) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN('public','app') AND t.tgname NOT IN(${list(changedTriggers)})),
 'changedFunctionSecurity',(SELECT jsonb_object_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_array(p.prosecdef,p.provolatile,pg_get_userbyid(p.proowner),p.proconfig,p.proacl::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN('public','app') AND p.proname IN(${list(changedFunctions)}) AND p.proname NOT IN('crear_almacen_maestro_tx_460','actualizar_almacen_maestro_tx_460','seed_operational_rbac_for_tenant_base_570')),
 'newFunctionSecurity',(SELECT coalesce(jsonb_object_agg(n.nspname||'.'||p.proname,jsonb_build_object('secdef',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,
   'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
   'public',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))),'{}'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN('public','app') AND p.proname IN(${list(newFunctions)})),
 'newCreditRows',CASE WHEN to_regclass('public.cxp_credito_proveedor_movimientos') IS NOT NULL THEN (xpath('//row_count/text()',query_to_xml('SELECT count(*) AS row_count FROM public.cxp_credito_proveedor_movimientos',false,true,'')))[1]::text::integer ELSE NULL END,
 'newCreditLedger',(SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'serviceRead',has_table_privilege('service_role',c.oid,'SELECT'),'unsafePrivileges',EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE (a.grantee=0 OR pg_get_userbyid(a.grantee) IN('anon','authenticated')) OR (pg_get_userbyid(a.grantee)='service_role' AND a.privilege_type<>'SELECT'))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='cxp_credito_proveedor_movimientos'),
 'creditBalances',(SELECT coalesce(jsonb_object_agg(c.id::text,coalesce((to_jsonb(c)->>'saldo_credito_proveedor')::numeric,0)),'{}'::jsonb) FROM public.cuentas_por_pagar c),
 'fiscalSnapshots',(SELECT coalesce(jsonb_object_agg(c.id::text,to_jsonb(c)->'original_fiscal_amounts'),'{}'::jsonb) FROM public.cuentas_por_pagar c WHERE to_jsonb(c)->'original_fiscal_amounts' IS NOT NULL AND to_jsonb(c)->'original_fiscal_amounts'<>'null'::jsonb),
 'rceRestoreEvidence',(SELECT coalesce(jsonb_object_agg(c.id::text,jsonb_build_object('tenant',c.tenant_id,'provider',c.proveedor_id,'number',c.numero_documento,'currency',c.moneda,'base',c.subtotal::text,'igv',c.igv::text,'total',c.total::text,
   'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('event',e.event_id,'payload',e.payload) ORDER BY e.id),'[]'::jsonb) FROM public.outbox_events e WHERE e.tenant_id=c.tenant_id AND e.aggregate_id=c.id::text AND e.event_type='factura.proveedor.registrada'),
   'adjustments',(SELECT jsonb_agg(jsonb_build_object('currency',a.moneda,'base',a.subtotal::text,'igv',a.igv::text,'total',a.total::text,'before',a.total_anterior::text,'after',a.total_nuevo::text) ORDER BY a.total_anterior DESC,a.id) FROM public.cxp_ajustes_proveedor a WHERE a.tenant_id=c.tenant_id AND a.cuenta_por_pagar_id=c.id))),'{}'::jsonb) FROM public.cuentas_por_pagar c WHERE EXISTS(SELECT 1 FROM public.cxp_ajustes_proveedor a WHERE a.tenant_id=c.tenant_id AND a.cuenta_por_pagar_id=c.id)),
 'costs',(SELECT coalesce(jsonb_object_agg(id::text,jsonb_build_object('legacy',costo,'base',(to_jsonb(p)->>'costo_promedio_base')::numeric)),'{}'::jsonb) FROM public.productos p),
 'cpeBranches',${branches('cpe')},'expectedCpeBranches',${expectedBranches('cpe')},
 'documentBranches',${branches('documentos')},'expectedDocumentBranches',${expectedBranches('documentos')},
 'expectedCosts',(WITH k AS(SELECT tenant_id,producto_id,sum(valor_firmado_base) valor,sum(cantidad_firmada) unidades,
   bool_and(valuacion_estado='CONFIRMADA' AND cantidad_firmada IS NOT NULL AND valor_firmado_base IS NOT NULL) completo FROM public.vw_kardex_valorizado WHERE almacen_id IS NOT NULL GROUP BY tenant_id,producto_id)
   SELECT coalesce(jsonb_object_agg(p.id::text,jsonb_build_object('legacy',CASE WHEN k.completo AND k.unidades>0 AND k.valor>=0 AND k.unidades=p.stock_actual AND EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p.tenant_id AND upper(btrim(ec.pais))='PE') THEN round(k.valor/k.unidades,2) ELSE p.costo END,'base',CASE WHEN k.completo AND k.unidades>0 AND k.valor>=0 AND k.unidades=p.stock_actual AND EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p.tenant_id AND upper(btrim(ec.pais))='PE') THEN k.valor/k.unidades ELSE (to_jsonb(p)->>'costo_promedio_base')::numeric END)),'{}'::jsonb) FROM public.productos p LEFT JOIN k ON k.producto_id=p.id AND k.tenant_id=p.tenant_id),
 'capital',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(p)),'{}'::jsonb) FROM public.plan_cuentas p WHERE codigo IN('50','10411','10412','6391')),
 'capitalMissing',(SELECT coalesce(jsonb_agg(ec.tenant_id::text||':'||x.codigo ORDER BY ec.tenant_id,x.codigo),'[]'::jsonb) FROM public.empresa_config ec CROSS JOIN (VALUES('50'),('10411'),('10412'),('6391')) x(codigo) WHERE upper(btrim(pais))='PE' AND NOT EXISTS(SELECT 1 FROM public.plan_cuentas p WHERE p.tenant_id=ec.tenant_id AND p.codigo=x.codigo)),
 'grants',(SELECT coalesce(jsonb_object_agg(role_id::text||':'||permiso_id::text,to_jsonb(rp)),'{}'::jsonb) FROM public.rol_permisos rp),
 'grantMissing',(SELECT coalesce(jsonb_agg(r.id::text||':'||p.id::text ORDER BY r.id,p.id),'[]'::jsonb) FROM public.roles r JOIN public.permisos p ON p.tenant_id=r.tenant_id JOIN public.empresa_config ec ON ec.tenant_id=r.tenant_id
   WHERE NOT coalesce(ec.is_demo,false) AND coalesce(r.is_system_role,false) AND coalesce(p.activo,true)
     AND ((upper(r.nombre)='VENDEDOR' AND lower(p.codigo) IN('inventario.productos.read','inventario.almacenes.read')) OR (lower(p.codigo)='compras.recepciones.ver' AND EXISTS(SELECT 1 FROM public.rol_permisos g JOIN public.permisos gp ON gp.id=g.permiso_id WHERE g.role_id=r.id AND g.concedido AND lower(gp.codigo)='finanzas.cxp.gestionar')))
     AND NOT EXISTS(SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id=r.id AND rp.permiso_id=p.id)),
 'calculationLedger',(SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
   'unsafePrivileges',EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee IN(0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)),
   'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='app' AND tablename='rrhh_calculation_operations_570'),
   'rows',(xpath('/row/n/text()',query_to_xml('SELECT count(*) AS n FROM app.rrhh_calculation_operations_570',false,true,'')))[1]::text::int)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname='rrhh_calculation_operations_570'),
 'payrollCreationLedger',(SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
   'unsafePrivileges',EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee IN(0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)),
   'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='app' AND tablename='rrhh_payroll_creation_operations_570'),
   'rows',(xpath('/row/n/text()',query_to_xml('SELECT count(*) AS n FROM app.rrhh_payroll_creation_operations_570',false,true,'')))[1]::text::int)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname='rrhh_payroll_creation_operations_570'),
 'inventoryAbandonmentLedger',(SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
   'unsafePrivileges',EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee IN(0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)),
   'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='app' AND tablename='inventory_operation_abandonments_570'),
   'rows',(xpath('/row/n/text()',query_to_xml('SELECT count(*) AS n FROM app.inventory_operation_abandonments_570',false,true,'')))[1]::text::int)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname='inventory_operation_abandonments_570'),
 'depreciationBatchLedger',(SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
   'unsafePrivileges',EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee IN(0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)),
   'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='app' AND tablename='asset_depreciation_batches_570'),
   'rows',(xpath('/row/n/text()',query_to_xml('SELECT count(*) AS n FROM app.asset_depreciation_batches_570',false,true,'')))[1]::text::int)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname='asset_depreciation_batches_570'),
 'assetLifecycleLedger',(SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
   'unsafePrivileges',EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee IN(0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)),
   'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='app' AND tablename='asset_lifecycle_operations_570'),
   'rows',(xpath('/row/n/text()',query_to_xml('SELECT count(*) AS n FROM app.asset_lifecycle_operations_570',false,true,'')))[1]::text::int)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname='asset_lifecycle_operations_570'),
 'historyHash',(SELECT md5(coalesce(string_agg(to_jsonb(m)::text,'' ORDER BY version),'')) FROM supabase_migrations.schema_migrations m WHERE version<>'570')
 );`;
}
function expectedFiscalSnapshots(before) {
 const result=structuredClone(before.fiscalSnapshots||{});
 const cents=value=>{const match=String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);if(!match)throw new Error('not-money');return (BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')))*(match[1]? -1n:1n);};
 const near=(a,b)=>{const d=a-b;return d>=-1n&&d<=1n;};
 for(const [id,row] of Object.entries(before.rceRestoreEvidence||{})) {
  if(result[id])continue;
  try {
   if(row.events.length!==1)continue;
   const event=row.events[0],p=event.payload;
   if(p.tenantId!==row.tenant||p.facturaProvId!==id||p.proveedorId!==row.provider||p.numeroDocumento!==row.number||String(p.moneda).toUpperCase()!==String(row.currency).toUpperCase())continue;
   const base=cents(p.subtotal),igv=cents(p.igv),total=cents(p.total);
   if(base<0n||igv<0n||total<=0n||!near(base+igv,total))continue;
   let prior=null,first=null,last=null,adjustBase=0n,adjustIgv=0n,valid=true;
   for(const a of row.adjustments) {
    const ab=cents(a.base),ai=cents(a.igv),at=cents(a.total),old=cents(a.before),next=cents(a.after);
    if(prior===null)first=old;else if(!near(prior,old))valid=false;
    if(String(a.currency).toUpperCase()!==String(row.currency).toUpperCase()||!near(ab+ai,at)||!near(old-at,next)||next>=old)valid=false;
    adjustBase+=ab;adjustIgv+=ai;prior=next;last=a;
   }
   if(!last)continue;
   if(cents(last.after)<=1n){adjustBase-=cents(last.base);adjustIgv-=cents(last.igv);prior=cents(last.before);}
   if(!valid||!near(total,first)||!near(cents(row.total),prior)||!near(cents(row.base)+adjustBase,base)||!near(cents(row.igv)+adjustIgv,igv))continue;
   result[id]={subtotal:Number(p.subtotal),igv:Number(p.igv),total:Number(p.total),source:'ORIGINAL_OUTBOX_AND_VERIFIED_RETURN_CHAIN',event_id:event.event};
  } catch { /* Evidencia incompleta permanece NULL; nunca se infiere el original. */ }
 }
 return result;
}
export function assertPeru570Preserved(before,after) {
 equal(after.normativeCaps,before.normativeCaps,'La migración asignó límites AFP sin fuente a filas existentes');
 assert.equal(before.normativeCapColumn,null,'Campo AFP presente antes de570');
 equal(after.normativeCapColumn,{type:'numeric(14,2)',notnull:false,default:null,privileges:null},'CampoAFPfuera del contrato');
 equal(before.quantityColumnTypes,Object.fromEntries(quantityColumns.map(([table,column])=>[table+'.'+column,'numeric(14,2)'])),'Precisión base de inventario inesperada');
 equal(after.quantityColumnTypes,Object.fromEntries(quantityColumns.map(([table,column])=>[table+'.'+column,'numeric(18,6)'])),'Precisión final de inventario distinta del alcance');
 assert.equal(after.supplierPaymentBackendRead,true,'Historial de pagos proveedor no legible por backend');
 assert.equal(after.templateBackendRead,true,'Detalle e historial de plantillas no legible por backend');
 assert.equal(after.depreciationBackendRead,true,'Historial de depreciación no legible por backend');
 assert.equal(after.helpBackendRead,true,'Catálogo de ayuda no legible por backend');
 assert.equal(after.dispatchBackendRead,true,'Despachos canónicos no legibles por backend');
 assert.equal(after.documentFilesBackendRead,true,'Adjuntos documentales no legibles por backend');
 assert.equal(after.cpeCancellationBackendRead,true,'Reversas de cobros CPE no legibles por backend');
 assert.equal(after.analyticBackendRead,true,'Reparto analítico no legible por backend');
 assert.equal(after.productBranchBackendRead,true,'Fuentes opcionales por sucursal no legibles por backend');
 for(const key of ['existingData','tableSecurity','policies','existingColumns','existingViews','existingFunctions','existingTriggers','historyHash']) equal(after[key],before[key],`La migración alteró ${key}`);
 equal(after.calculationLedger,{owner:'postgres',rls:true,force:true,unsafePrivileges:false,policies:0,rows:0},'Nuevo ledger de cálculo debe ser privado y vacío');
 equal(after.payrollCreationLedger,{owner:'postgres',rls:true,force:true,unsafePrivileges:false,policies:0,rows:0},'Nuevo ledger de alta debe ser privado y vacío');
 equal(after.inventoryAbandonmentLedger,{owner:'postgres',rls:true,force:true,unsafePrivileges:false,policies:0,rows:0},'Nuevo fence de inventario debe ser privado y vacío');
 equal(after.depreciationBatchLedger,{owner:'postgres',rls:true,force:true,unsafePrivileges:false,policies:0,rows:0},'Ledger de depreciación debe ser privado y vacío');
 equal(after.assetLifecycleLedger,{owner:'postgres',rls:true,force:true,unsafePrivileges:false,policies:0,rows:0},'Ledger de ciclo del activo debe ser privado y vacío');
 assert.equal(after.newCreditRows,0,'El ledger nuevo debe empezar sin datos');
 equal(after.newCreditLedger,{owner:'postgres',rls:true,force:true,serviceRead:true,unsafePrivileges:false},'Ledger crédito proveedor inseguro');
 equal(after.creditBalances,before.creditBalances,'La migración alteró crédito proveedor existente');
 assert.ok(isDeepStrictEqual(after.fiscalSnapshots,expectedFiscalSnapshots(before)),'El backfill fiscal no coincide con evento original y cadena de ajustes');
 equal(after.costs,before.expectedCosts,'El backfill de costo no coincide con evidencia base');
 equal(after.cpeBranches,before.expectedCpeBranches,'El backfill CPE contradice la serie');
 equal(after.documentBranches,before.expectedDocumentBranches,'El backfill documental contradice la serie');
 for(const [id,row] of Object.entries(before.capital)) equal(after.capital[id],row,`Capital existente alterado ${id}`);
 const addedCapital=Object.keys(after.capital).filter(id=>!before.capital[id]);
 equal(addedCapital.map(id=>after.capital[id].tenant_id+':'+after.capital[id].codigo).sort(),[...before.capitalMissing].sort(),'Capital añadido fuera de alcance');
 for(const [id,row] of Object.entries(before.grants)) equal(after.grants[id],row,`Permiso existente alterado ${id}`);
 const addedGrants=Object.keys(after.grants).filter(id=>!before.grants[id]).sort();
 equal(addedGrants,[...before.grantMissing].sort(),'Permisos añadidos fuera de alcance');
 for(const id of addedGrants) assert.equal(after.grants[id].concedido,true);
 for(const [id,security] of Object.entries(before.changedFunctionSecurity)) equal(after.changedFunctionSecurity[id],security,`Seguridad de función alterada ${id}`);
 for(const [name,security] of Object.entries(after.newFunctionSecurity)) {
  assert.equal(security.owner,'postgres',name);
  for(const role of ['anon','authenticated','public']) assert.equal(security[role],false,`${name}.${role}`);
  assert.equal(security.service,["public.leer_operacion_activo_570","public.guardar_operacion_activo_tx_570","public.leer_lote_depreciacion_570","public.registrar_lote_depreciacion_tx_570","public.resolver_operacion_inventario_tx_570","public.leer_recibo_alta_planilla_570","public.crear_planilla_operacion_tx_570","public.resolver_alta_planilla_tx_570","public.leer_recibo_calculo_planilla_570","public.guardar_calculo_planilla_operacion_tx_570","public.resolver_calculo_planilla_tx_570",'public.resolver_edicion_presupuesto_tx_570','public.eliminar_presupuesto_tx_570','public.registrar_entrega_pedido_tx_570','public.actualizar_presupuesto_tx_570','public.crear_presupuesto_tx_570','public.provisionar_cobranza_dudosa_tx_570','public.validar_cierre_periodo_contable_570','public.guardar_normativa_peru_periodo_tx_570','public.vincular_cxc_cpe_contado_tx_570','public.registrar_serie_establecimiento_tx','public.registrar_nota_credito_proveedor_devolucion_tx','public.registrar_nota_credito_proveedor_tx','public.aplicar_credito_proveedor_tx','public.revertir_detraccion_proveedor_pendiente_tx','public.guardar_calculo_planilla_gratificacion_tx_570','public.guardar_calculo_planilla_eps_tx_570','public.registrar_revaluacion_tx_570'].includes(name),`${name}.service`);
 }
 assert.ok(after.newFunctionSecurity['app.costo_inventario_base_570']);
 assert.equal(after.schema,570); assert.equal(after.ready,true);
}
export function summarizePeru570State(state) {
 return {project:state.project,environment:state.environment,schema:state.schema,ready:state.ready,
  comparedData:Object.keys(state.existingData).sort(),comparedProducts:Object.keys(state.costs).length,
  comparedGrants:Object.keys(state.grants).length,pendingGrantAdds:state.grantMissing.length,pendingCapitalAdds:state.capitalMissing.length};
}
