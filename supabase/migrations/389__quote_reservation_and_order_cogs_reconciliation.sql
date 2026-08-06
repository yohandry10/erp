-- Unifica el ciclo cotizacion -> pedido con inventario y repara asientos de
-- pedidos ya facturados que omitieron el costo de venta.

create or replace function public.liberar_stock_cotizacion(
  p_cotizacion_id uuid,
  p_tenant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_item record;
  v_liberados integer := 0;
begin
  for v_item in
    select
      cd.producto_id,
      greatest(
        coalesce(sum(case when upper(coalesce(m.tipo, m.tipo_movimiento, '')) = 'RESERVA'
                          then m.cantidad else 0 end), 0)
        - coalesce(sum(case when upper(coalesce(m.tipo, m.tipo_movimiento, '')) = 'LIBERACION'
                            then m.cantidad else 0 end), 0),
        0
      ) as cantidad
    from public.cotizacion_detalles cd
    join public.cotizaciones c on c.id = cd.cotizacion_id
    left join public.movimientos_inventario m
      on m.tenant_id = c.tenant_id
     and m.producto_id = cd.producto_id
     and upper(coalesce(m.referencia_tipo, '')) = 'COTIZACION'
     and m.referencia_id = p_cotizacion_id
    where cd.cotizacion_id = p_cotizacion_id
      and c.tenant_id = p_tenant_id
    group by cd.producto_id
  loop
    if v_item.cantidad > 0 then
      perform public.liberar_stock_atomico(
        v_item.producto_id,
        v_item.cantidad,
        'COTIZACION',
        p_cotizacion_id::text,
        'Liberacion por conversion de cotizacion'
      );
      v_liberados := v_liberados + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'productos_liberados', v_liberados,
    'cotizacion_id', p_cotizacion_id
  );
end;
$$;

-- La liberacion queda dentro de la misma transaccion de conversion.
create or replace function public.convertir_cotizacion_a_pedido(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_cot record;
  v_pedido_id uuid;
  v_numero text;
  v_next integer;
begin
  select * into v_cot
  from public.cotizaciones
  where id = p_cotizacion_id and tenant_id = p_tenant_id
  for update;

  if not found then raise exception 'Cotizacion no encontrada'; end if;
  if coalesce(v_cot.estado, '') = 'CONVERTIDA' then
    raise exception 'La cotizacion ya fue convertida';
  end if;

  select coalesce(max(app.to_int_or_zero(regexp_replace(numero::text, '[^0-9]', '', 'g'))), 0) + 1
    into v_next
  from public.pedidos_venta
  where tenant_id = p_tenant_id;

  v_numero := 'PED-' || to_char(current_date, 'YYYY') || '-' || lpad(v_next::text, 4, '0');

  insert into public.pedidos_venta (
    id, tenant_id, numero, cotizacion_id, cliente_id, fecha_pedido, estado,
    subtotal, igv, total, observaciones, created_by, created_at, updated_at
  ) values (
    gen_random_uuid(), p_tenant_id, v_numero, p_cotizacion_id, v_cot.cliente_id,
    current_date, 'PENDIENTE', coalesce(v_cot.subtotal, 0), coalesce(v_cot.igv, 0),
    coalesce(v_cot.total, 0), coalesce(p_notas, v_cot.observaciones), p_user_id, now(), now()
  ) returning id into v_pedido_id;

  insert into public.pedidos_venta_detalle (
    id, tenant_id, pedido_id, producto_id, descripcion, cantidad, precio_unitario,
    subtotal, created_at, updated_at
  )
  select gen_random_uuid(), p_tenant_id, v_pedido_id, cd.producto_id,
         coalesce(cd.descripcion, cd.producto_nombre), coalesce(cd.cantidad, 0),
         coalesce(cd.precio_unitario, 0), coalesce(cd.subtotal, 0), now(), now()
  from public.cotizacion_detalles cd
  where cd.cotizacion_id = p_cotizacion_id;

  update public.cotizaciones
  set estado = 'CONVERTIDA', fecha_conversion = now(), convertido_por = p_user_id,
      pedido_id = v_pedido_id, updated_at = now()
  where id = p_cotizacion_id and tenant_id = p_tenant_id;

  perform public.liberar_stock_cotizacion(p_cotizacion_id, p_tenant_id);

  return jsonb_build_object('success', true, 'pedido_id', v_pedido_id,
    'pedido_numero', v_numero, 'cotizacion_id', p_cotizacion_id);
end;
$$;

-- Repara reservas de cotizaciones convertidas antes de esta migracion.
do $$
declare v_cot record;
begin
  for v_cot in
    select id, tenant_id from public.cotizaciones where upper(coalesce(estado, '')) = 'CONVERTIDA'
  loop
    perform public.liberar_stock_cotizacion(v_cot.id, v_cot.tenant_id);
  end loop;
end
$$;

drop table if exists pg_temp.migration_389_order_costs;
create temporary table migration_389_order_costs as
select a.id asiento_id, a.tenant_id,
       round(sum(coalesce(nullif(m.metadata->>'valor_total', '')::numeric, 0)), 2) costo_ventas,
       c69.id cuenta_69_id, c20.id cuenta_20_id
from public.pedidos_venta p
join public.cpe c on c.id = p.factura_id and c.tenant_id = p.tenant_id
join public.asientos_contables a
  on a.tenant_id = p.tenant_id
 and upper(a.referencia) in (
   upper(c.serie || '-' || c.numero::text),
   upper(c.serie || '-' || lpad(c.numero::text, 8, '0'))
 )
join public.movimientos_inventario m
  on m.tenant_id = p.tenant_id and m.referencia_id = p.id
 and upper(coalesce(m.referencia_tipo, '')) = 'PEDIDO'
 and upper(coalesce(m.tipo, m.tipo_movimiento, '')) = 'SALIDA'
join lateral (select id from public.plan_cuentas where tenant_id=p.tenant_id and codigo='69' order by created_at,id limit 1) c69 on true
join lateral (select id from public.plan_cuentas where tenant_id=p.tenant_id and codigo='20' order by created_at,id limit 1) c20 on true
where not exists (
  select 1 from public.detalle_asientos d join public.plan_cuentas pc on pc.id=d.cuenta_id
  where d.asiento_id=a.id and pc.codigo='69'
)
group by a.id, a.tenant_id, c69.id, c20.id
having sum(coalesce(nullif(m.metadata->>'valor_total', '')::numeric, 0)) > 0;

insert into public.detalle_asientos (tenant_id, asiento_id, cuenta_id, debe, haber, nombre, concepto)
select tenant_id, asiento_id, cuenta_69_id, costo_ventas, 0, 'Costo de ventas', 'Costo de ventas'
from migration_389_order_costs;

insert into public.detalle_asientos (tenant_id, asiento_id, cuenta_id, debe, haber, nombre, concepto)
select tenant_id, asiento_id, cuenta_20_id, 0, costo_ventas, 'Mercaderias', 'Mercaderias'
from migration_389_order_costs;

update public.asientos_contables a
set total_debe=t.debe, total_haber=t.haber, origen='Automático', updated_at=now()
from (
  select d.asiento_id, round(sum(coalesce(d.debe,0)),2) debe, round(sum(coalesce(d.haber,0)),2) haber
  from public.detalle_asientos d
  where d.asiento_id in (select asiento_id from migration_389_order_costs)
  group by d.asiento_id
) t
where a.id=t.asiento_id;

do $$
begin
  if exists (
    select 1 from public.asientos_contables
    where id in (select asiento_id from migration_389_order_costs)
      and abs(coalesce(total_debe,0)-coalesce(total_haber,0)) >= 0.01
  ) then raise exception 'migration 389 produjo un asiento desbalanceado'; end if;
end
$$;

drop table if exists pg_temp.migration_389_order_costs;
