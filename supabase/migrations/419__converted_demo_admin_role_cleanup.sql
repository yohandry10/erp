-- Un tenant convertido no debe conservar ADMIN_DEMO. La promocion vive en el
-- cambio atomico empresa_config.is_demo true -> false y se reparan conversiones
-- historicas que quedaron con el rol de demostracion.

create or replace function app.promover_admin_al_convertir_demo()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $$
declare
  v_principal uuid;
  v_admin uuid;
begin
  if old.is_demo is not true or new.is_demo is not false then return new; end if;

  select id into v_principal
  from public.usuarios_sistema
  where tenant_id = new.tenant_id and activo = true and is_super_admin = false
  order by created_at, id limit 1;

  select id into v_admin
  from public.roles
  where tenant_id = new.tenant_id and upper(nombre) = 'ADMIN'
  order by created_at, id limit 1;

  if v_principal is null or v_admin is null then
    raise exception 'No se pudo resolver usuario principal o rol ADMIN para tenant %', new.tenant_id;
  end if;

  delete from public.user_roles ur
  using public.roles r
  where ur.role_id = r.id and ur.usuario_sistema_id = v_principal
    and ur.tenant_id = new.tenant_id and upper(r.nombre) = 'ADMIN_DEMO';

  insert into public.user_roles (usuario_sistema_id, role_id, tenant_id)
  values (v_principal, v_admin, new.tenant_id)
  on conflict (usuario_sistema_id, role_id, tenant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_promover_admin_al_convertir_demo on public.empresa_config;
create trigger trg_promover_admin_al_convertir_demo
after update of is_demo on public.empresa_config
for each row
when (old.is_demo is true and new.is_demo is false)
execute function app.promover_admin_al_convertir_demo();

-- Backfill de conversiones completadas antes de instalar el trigger.
delete from public.user_roles ur
using public.roles r, public.usuarios_sistema us, public.empresa_config ec
where ur.role_id = r.id
  and ur.usuario_sistema_id = us.id
  and us.tenant_id = ec.tenant_id
  and ur.tenant_id = ec.tenant_id
  and ec.is_demo = false
  and us.activo = true
  and us.is_super_admin = false
  and upper(r.nombre) = 'ADMIN_DEMO'
  and us.id = (
    select principal.id from public.usuarios_sistema principal
    where principal.tenant_id = ec.tenant_id
      and principal.activo = true and principal.is_super_admin = false
    order by principal.created_at, principal.id limit 1
  );

insert into public.user_roles (usuario_sistema_id, role_id, tenant_id)
select us.id, r.id, ec.tenant_id
from public.empresa_config ec
join lateral (
  select principal.id from public.usuarios_sistema principal
  where principal.tenant_id = ec.tenant_id
    and principal.activo = true and principal.is_super_admin = false
  order by principal.created_at, principal.id limit 1
) us on true
join public.roles r on r.tenant_id = ec.tenant_id and upper(r.nombre) = 'ADMIN'
where ec.is_demo = false
  and exists (
    select 1 from public.demo_conversiones_pendientes dcp
    where dcp.tenant_id = ec.tenant_id and dcp.estado = 'COMPLETADA'
  )
on conflict (usuario_sistema_id, role_id, tenant_id) do nothing;

notify pgrst, 'reload schema';
