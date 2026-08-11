BEGIN;
SET lock_timeout='10s';
SET statement_timeout='120s';

DO $block$
DECLARE v_fn text;
BEGIN
 FOREACH v_fn IN ARRAY ARRAY[
  'app.set_tenant_context(uuid,uuid,boolean)','app.clear_tenant_context()',
  'public."app.set_tenant_context"(uuid,uuid)','public.set_tenant_context(uuid,uuid,boolean)',
  'public.set_config(text,text,boolean)','public.pgrst_reload_schema()',
  'public.acquire_job_lock(text,integer)','public.release_job_lock(text)',
  'public.acquire_pos_lock(uuid,text)','public.release_pos_lock(uuid,text)',
  'public.get_pending_outbox_events(integer)','public.mark_outbox_event_processing(uuid)',
  'public.mark_outbox_event_completed(uuid)','public.mark_outbox_event_failed(uuid,text,timestamptz)'
 ] LOOP
  PERFORM app.grant_execute_if_exists(v_fn,'service_role');
 END LOOP;
END $block$;

CREATE OR REPLACE FUNCTION app.sync_role_permissions_deferred_487()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
BEGIN
 IF pg_trigger_depth()>2 THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF TG_OP='DELETE' THEN
  DELETE FROM public.rol_permisos WHERE id=OLD.id;
  RETURN OLD;
 END IF;
 INSERT INTO public.rol_permisos(id,role_id,permiso_id,concedido,created_at)
 VALUES(NEW.id,NEW.role_id,NEW.permission_id,NEW.concedido,NEW.created_at)
 ON CONFLICT(id) DO UPDATE SET role_id=excluded.role_id,permiso_id=excluded.permiso_id,concedido=excluded.concedido;
 RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_sync_role_permissions_deferred_487 ON public.role_permissions;
DROP TRIGGER IF EXISTS trg_sync_role_permissions_immediate_487 ON public.role_permissions;
CREATE TRIGGER trg_sync_role_permissions_immediate_487
AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION app.sync_role_permissions_deferred_487();

INSERT INTO public.rol_permisos(id,role_id,permiso_id,concedido,created_at)
SELECT rp.id,rp.role_id,rp.permission_id,rp.concedido,rp.created_at
FROM public.role_permissions rp
ON CONFLICT(id) DO UPDATE SET role_id=excluded.role_id,permiso_id=excluded.permiso_id,concedido=excluded.concedido;

REVOKE ALL ON FUNCTION app.sync_role_permissions_deferred_487() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app.sync_legacy_role_permissions_immediate_487()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE v_tenant_id uuid;
BEGIN
 IF pg_trigger_depth()>2 THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF TG_OP='DELETE' THEN
  DELETE FROM public.role_permissions WHERE id=OLD.id;
  RETURN OLD;
 END IF;
 INSERT INTO public.permissions(id,tenant_id,modulo,recurso,accion,codigo,descripcion,activo,created_at,updated_at)
 SELECT p.id,p.tenant_id,coalesce(nullif(btrim(p.modulo),''),'general'),
  coalesce(nullif(btrim(p.recurso),''),'__global__'),coalesce(nullif(btrim(p.accion),''),'read'),
  coalesce(nullif(lower(btrim(coalesce(p.codigo,''))),''),app.build_permission_code(p.modulo,p.accion)),
  nullif(btrim(coalesce(p.descripcion,'')),''),coalesce(p.activo,true),coalesce(p.created_at,now()),clock_timestamp()
 FROM public.permisos p WHERE p.id=NEW.permiso_id
 ON CONFLICT(id) DO UPDATE SET tenant_id=excluded.tenant_id,modulo=excluded.modulo,recurso=excluded.recurso,
  accion=excluded.accion,codigo=excluded.codigo,descripcion=excluded.descripcion,activo=excluded.activo,updated_at=clock_timestamp();
 SELECT tenant_id INTO v_tenant_id FROM public.roles WHERE id=NEW.role_id;
 INSERT INTO public.role_permissions(id,role_id,permission_id,tenant_id,concedido,created_at,updated_at)
 VALUES(NEW.id,NEW.role_id,NEW.permiso_id,v_tenant_id,NEW.concedido,NEW.created_at,clock_timestamp())
 ON CONFLICT(id) DO UPDATE SET role_id=excluded.role_id,permission_id=excluded.permission_id,
  tenant_id=excluded.tenant_id,concedido=excluded.concedido,updated_at=clock_timestamp();
 RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_sync_legacy_role_permissions_immediate_487 ON public.rol_permisos;
CREATE TRIGGER trg_sync_legacy_role_permissions_immediate_487
AFTER INSERT OR UPDATE OR DELETE ON public.rol_permisos FOR EACH ROW
EXECUTE FUNCTION app.sync_legacy_role_permissions_immediate_487();
INSERT INTO public.role_permissions(id,role_id,permission_id,tenant_id,concedido,created_at,updated_at)
SELECT rp.id,rp.role_id,rp.permiso_id,r.tenant_id,rp.concedido,rp.created_at,clock_timestamp()
FROM public.rol_permisos rp JOIN public.roles r ON r.id=rp.role_id
ON CONFLICT(id) DO UPDATE SET role_id=excluded.role_id,permission_id=excluded.permission_id,
 tenant_id=excluded.tenant_id,concedido=excluded.concedido,updated_at=clock_timestamp();
REVOKE ALL ON FUNCTION app.sync_legacy_role_permissions_immediate_487() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
