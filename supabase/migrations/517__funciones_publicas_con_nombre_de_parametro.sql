-- Migracion 517: las funciones publicas recuperan el nombre de sus parametros.
--
-- Catorce funciones de escritura estaban **inalcanzables desde el API**, y nadie
-- lo habia notado porque el sintoma no se parece a la causa.
--
-- El envoltorio publico se declaro con los tipos y sin los nombres:
--
--     CREATE FUNCTION public.gestionar_maestro_contable_tx(uuid,uuid,text,text,uuid,jsonb,text)
--
-- PostgREST solo sabe llamar funciones **por nombre de parametro** --es como las
-- llama supabase-js-- asi que responde `PGRST202: Could not find the function
-- ... in the schema cache`. La funcion existe, se puede llamar por psql con
-- argumentos posicionales, y el verificador que la prueba asi pasa en verde. Por
-- eso duro tanto.
--
-- Lo que estaba caido en produccion, comprobado uno por uno:
--
--   * registrar y desactivar un tipo de cambio, crear un centro de costo y
--     abrir un periodo contable (`gestionar_maestro_contable_tx`);
--   * crear, editar y anular un documento manual, y crear una serie;
--   * el resumen diario y la comunicacion de baja de SUNAT, con las tres
--     funciones que gobiernan su envio;
--   * consignaciones, consolidacion, presupuestos y el borrado de una
--     distribucion analitica.
--
-- Se recrean con los nombres que el codigo ya enviaba. El cuerpo, la seguridad,
-- el `search_path` y los privilegios quedan como estaban; lo unico que cambia es
-- que ahora se las puede nombrar.

BEGIN;

DROP FUNCTION IF EXISTS public.actualizar_documento_manual_tx(uuid, uuid, uuid, jsonb, jsonb, text);
CREATE FUNCTION public.actualizar_documento_manual_tx(p_documento_id uuid, p_tenant_id uuid, p_actor_id uuid, p_payload jsonb, p_detalles jsonb, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.actualizar_documento_manual_tx($1,$2,$3,$4,$5,$6) $function$;
REVOKE ALL ON FUNCTION public.actualizar_documento_manual_tx(uuid, uuid, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_documento_manual_tx(uuid, uuid, uuid, jsonb, jsonb, text) TO service_role;

DROP FUNCTION IF EXISTS public.anular_documento_borrador_tx(uuid, uuid, uuid, text, text);
CREATE FUNCTION public.anular_documento_borrador_tx(p_documento_id uuid, p_tenant_id uuid, p_actor_id uuid, p_motivo text, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.anular_documento_borrador_tx($1,$2,$3,$4,$5) $function$;
REVOKE ALL ON FUNCTION public.anular_documento_borrador_tx(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anular_documento_borrador_tx(uuid, uuid, uuid, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.crear_comunicacion_baja_tx(uuid, uuid, uuid[], text, date, text);
CREATE FUNCTION public.crear_comunicacion_baja_tx(p_tenant_id uuid, p_actor_id uuid, p_comprobantes_ids uuid[], p_motivo text, p_fecha_comunicacion date, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.crear_comunicacion_baja_tx($1,$2,$3,$4,$5,$6) $function$;
REVOKE ALL ON FUNCTION public.crear_comunicacion_baja_tx(uuid, uuid, uuid[], text, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_comunicacion_baja_tx(uuid, uuid, uuid[], text, date, text) TO service_role;

DROP FUNCTION IF EXISTS public.crear_documento_manual_tx(uuid, uuid, jsonb, jsonb, text);
CREATE FUNCTION public.crear_documento_manual_tx(p_tenant_id uuid, p_actor_id uuid, p_payload jsonb, p_detalles jsonb, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.crear_documento_manual_tx($1,$2,$3,$4,$5) $function$;
REVOKE ALL ON FUNCTION public.crear_documento_manual_tx(uuid, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_documento_manual_tx(uuid, uuid, jsonb, jsonb, text) TO service_role;

DROP FUNCTION IF EXISTS public.crear_resumen_diario_tx(uuid, uuid, uuid[], date, text);
CREATE FUNCTION public.crear_resumen_diario_tx(p_tenant_id uuid, p_actor_id uuid, p_comprobantes_ids uuid[], p_fecha_referencia date, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.crear_resumen_diario_tx($1,$2,$3,$4,$5) $function$;
REVOKE ALL ON FUNCTION public.crear_resumen_diario_tx(uuid, uuid, uuid[], date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_resumen_diario_tx(uuid, uuid, uuid[], date, text) TO service_role;

DROP FUNCTION IF EXISTS public.crear_serie_documento_tx(uuid, uuid, text, text, integer, text);
CREATE FUNCTION public.crear_serie_documento_tx(p_tenant_id uuid, p_actor_id uuid, p_tipo_documento text, p_serie text, p_correlativo_maximo integer, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.crear_serie_documento_tx($1,$2,$3,$4,$5,$6) $function$;
REVOKE ALL ON FUNCTION public.crear_serie_documento_tx(uuid, uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_serie_documento_tx(uuid, uuid, text, text, integer, text) TO service_role;

DROP FUNCTION IF EXISTS public.finalizar_envio_resumen_fiscal_tx(text, uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz);
CREATE FUNCTION public.finalizar_envio_resumen_fiscal_tx(p_tipo text, p_lote_id uuid, p_tenant_id uuid, p_actor_id uuid, p_envio_token uuid, p_resultado text, p_ticket text, p_codigo text, p_descripcion text, p_cdr text, p_next_retry_at timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.finalizar_envio_resumen_fiscal_tx($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) $function$;
REVOKE ALL ON FUNCTION public.finalizar_envio_resumen_fiscal_tx(text, uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_envio_resumen_fiscal_tx(text, uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz) TO service_role;

DROP FUNCTION IF EXISTS public.gestionar_consignacion_tx(uuid, uuid, text, uuid, jsonb, text);
CREATE FUNCTION public.gestionar_consignacion_tx(p_tenant_id uuid, p_actor_id uuid, p_action text, p_id uuid, p_payload jsonb, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.gestionar_consignacion_tx_481($1,$2,$3,$4,$5,$6) $function$;
REVOKE ALL ON FUNCTION public.gestionar_consignacion_tx(uuid, uuid, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_consignacion_tx(uuid, uuid, text, uuid, jsonb, text) TO service_role;

DROP FUNCTION IF EXISTS public.gestionar_consolidacion_tx(uuid, uuid, uuid, text, jsonb, text);
CREATE FUNCTION public.gestionar_consolidacion_tx(p_tenant_id uuid, p_actor_id uuid, p_grupo_id uuid, p_accion text, p_payload jsonb, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.gestionar_consolidacion_tx_484($1,$2,$3,$4,$5,$6) $function$;
REVOKE ALL ON FUNCTION public.gestionar_consolidacion_tx(uuid, uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_consolidacion_tx(uuid, uuid, uuid, text, jsonb, text) TO service_role;

DROP FUNCTION IF EXISTS public.gestionar_maestro_contable_tx(uuid, uuid, text, text, uuid, jsonb, text);
CREATE FUNCTION public.gestionar_maestro_contable_tx(p_tenant_id uuid, p_actor_id uuid, p_entity text, p_action text, p_record_id uuid, p_payload jsonb, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.gestionar_maestro_contable_tx_482($1,$2,$3,$4,$5,$6,$7) $function$;
REVOKE ALL ON FUNCTION public.gestionar_maestro_contable_tx(uuid, uuid, text, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_maestro_contable_tx(uuid, uuid, text, text, uuid, jsonb, text) TO service_role;

DROP FUNCTION IF EXISTS public.gestionar_presupuesto_tx(uuid, uuid, text, uuid, jsonb, text);
CREATE FUNCTION public.gestionar_presupuesto_tx(p_tenant_id uuid, p_actor_id uuid, p_action text, p_presupuesto_id uuid, p_payload jsonb, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.gestionar_presupuesto_tx_480($1,$2,$3,$4,$5,$6) $function$;
REVOKE ALL ON FUNCTION public.gestionar_presupuesto_tx(uuid, uuid, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_presupuesto_tx(uuid, uuid, text, uuid, jsonb, text) TO service_role;

DROP FUNCTION IF EXISTS public.marcar_resumen_fiscal_generado_tx(text, uuid, uuid, uuid, text, text, text, text);
CREATE FUNCTION public.marcar_resumen_fiscal_generado_tx(p_tipo text, p_lote_id uuid, p_tenant_id uuid, p_actor_id uuid, p_xml_generado text, p_xml_firmado text, p_hash_xml text, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.marcar_resumen_fiscal_generado_tx($1,$2,$3,$4,$5,$6,$7,$8) $function$;
REVOKE ALL ON FUNCTION public.marcar_resumen_fiscal_generado_tx(text, uuid, uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_resumen_fiscal_generado_tx(text, uuid, uuid, uuid, text, text, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.preparar_envio_resumen_fiscal_tx(text, uuid, uuid, uuid, text);
CREATE FUNCTION public.preparar_envio_resumen_fiscal_tx(p_tipo text, p_lote_id uuid, p_tenant_id uuid, p_actor_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.preparar_envio_resumen_fiscal_tx($1,$2,$3,$4,$5) $function$;
REVOKE ALL ON FUNCTION public.preparar_envio_resumen_fiscal_tx(text, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_envio_resumen_fiscal_tx(text, uuid, uuid, uuid, text) TO service_role;

DROP FUNCTION IF EXISTS public.eliminar_distribucion_analitica_tx(uuid, uuid, uuid, text, text);
CREATE FUNCTION public.eliminar_distribucion_analitica_tx(p_tenant_id uuid, p_actor_id uuid, p_detalle_id uuid, p_eje text, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$ SELECT app.eliminar_distribucion_analitica_tx_483($1,$2,$3,$4,$5) $function$;
REVOKE ALL ON FUNCTION public.eliminar_distribucion_analitica_tx(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_distribucion_analitica_tx(uuid, uuid, uuid, text, text) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
