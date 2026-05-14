-- 308__detalle_asientos_concepto_runtime_compat.sql
-- Compatibilidad runtime para servicios/reportes contables que leen y escriben detalle_asientos.concepto.

alter table public.detalle_asientos
  add column if not exists concepto text;

update public.detalle_asientos
set concepto = coalesce(concepto, nombre)
where concepto is null;

create index if not exists idx_detalle_asientos_concepto_runtime_308
  on public.detalle_asientos (tenant_id, concepto);

notify pgrst, 'reload schema';
