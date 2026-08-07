-- Repara asientos POS que registraron ingreso/IGV pero omitieron el costo de
-- venta aun cuando el movimiento físico ya conservaba su valorización.
-- Es idempotente: sólo agrega las líneas 69/20 que falten.

update public.asientos_contables
set origen = 'Automático',
    updated_at = now()
where source_event_id is not null
  and coalesce(btrim(origen), '') = '';

drop table if exists pg_temp.migration_417_pos_costs;
create temporary table migration_417_pos_costs as
select
  a.id as asiento_id,
  a.tenant_id,
  round(costos.costo_ventas, 2) as costo_ventas,
  cuenta_69.id as cuenta_69_id,
  cuenta_20.id as cuenta_20_id
from public.asientos_contables a
join public.ventas_pos vp
  on vp.tenant_id = a.tenant_id
 and upper(vp.numero_ticket) = upper(a.referencia)
join lateral (
  select sum(coalesce(nullif(m.metadata->>'valor_total', '')::numeric, 0)) as costo_ventas
  from public.movimientos_inventario m
  where m.tenant_id = a.tenant_id
    and m.referencia_id = vp.id
    and upper(coalesce(m.tipo, '')) = 'SALIDA'
    and upper(coalesce(m.referencia_tipo, '')) = 'VENTA_POS'
) costos on costos.costo_ventas > 0
join lateral (
  select p.id
  from public.plan_cuentas p
  where p.tenant_id = a.tenant_id and p.codigo = '69'
  order by p.created_at, p.id
  limit 1
) cuenta_69 on true
join lateral (
  select p.id
  from public.plan_cuentas p
  where p.tenant_id = a.tenant_id and p.codigo = '20'
  order by p.created_at, p.id
  limit 1
) cuenta_20 on true
where a.source_event_id is not null
  and (
    not exists (
      select 1
      from public.detalle_asientos d
      join public.plan_cuentas p on p.id = d.cuenta_id
      where d.asiento_id = a.id and d.tenant_id = a.tenant_id and p.codigo = '69'
    )
    or not exists (
      select 1
      from public.detalle_asientos d
      join public.plan_cuentas p on p.id = d.cuenta_id
      where d.asiento_id = a.id and d.tenant_id = a.tenant_id and p.codigo = '20'
    )
  );

insert into public.detalle_asientos (
  tenant_id, asiento_id, cuenta_id, debe, haber, nombre, concepto
)
select t.tenant_id, t.asiento_id, t.cuenta_69_id,
       t.costo_ventas, 0, 'Costo de ventas', 'Costo de ventas'
from migration_417_pos_costs t
where not exists (
  select 1
  from public.detalle_asientos d
  join public.plan_cuentas p on p.id = d.cuenta_id
  where d.asiento_id = t.asiento_id and d.tenant_id = t.tenant_id and p.codigo = '69'
);

insert into public.detalle_asientos (
  tenant_id, asiento_id, cuenta_id, debe, haber, nombre, concepto
)
select t.tenant_id, t.asiento_id, t.cuenta_20_id,
       0, t.costo_ventas, 'Mercaderías', 'Mercaderías'
from migration_417_pos_costs t
where not exists (
  select 1
  from public.detalle_asientos d
  join public.plan_cuentas p on p.id = d.cuenta_id
  where d.asiento_id = t.asiento_id and d.tenant_id = t.tenant_id and p.codigo = '20'
);

update public.asientos_contables a
set total_debe = totales.total_debe,
    total_haber = totales.total_haber,
    updated_at = now()
from (
  select d.asiento_id,
         round(sum(coalesce(d.debe, 0)), 2) as total_debe,
         round(sum(coalesce(d.haber, 0)), 2) as total_haber
  from public.detalle_asientos d
  where d.asiento_id in (select asiento_id from migration_417_pos_costs)
  group by d.asiento_id
) totales
where a.id = totales.asiento_id;

do $$
begin
  if exists (
    select 1
    from public.asientos_contables a
    where a.id in (select asiento_id from migration_417_pos_costs)
      and abs(coalesce(a.total_debe, 0) - coalesce(a.total_haber, 0)) >= 0.01
  ) then
    raise exception 'migration 417 produjo un asiento POS desbalanceado';
  end if;
end
$$;

drop table if exists pg_temp.migration_417_pos_costs;
