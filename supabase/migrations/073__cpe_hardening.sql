-- Harden CPE emission metadata with idempotency control and SUNAT tracking
alter table cpe
  add column if not exists idempotency_key varchar(255),
  add column if not exists sunat_status varchar(32) default 'NOT_SENT',
  add column if not exists hash_firma text,
  add column if not exists event_id uuid default gen_random_uuid(),
  add column if not exists fecha_emision date,
  add column if not exists fecha_vencimiento date;

alter table cpe drop constraint if exists cpe_sunat_status_check;
alter table cpe
  add constraint cpe_sunat_status_check
  check (sunat_status in ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR'));

alter table cpe alter column sunat_status set default 'NOT_SENT';
alter table cpe alter column event_id set default gen_random_uuid();

update cpe
set fecha_emision = coalesce(fecha_emision, created_at::date);

update cpe
set fecha_vencimiento = coalesce(fecha_vencimiento, (fecha_emision + interval '30 days')::date);

update cpe
set hash_firma = coalesce(hash_firma, hash);

update cpe
set sunat_status =
  case
    when estado = 'ACEPTADO' then 'ACCEPTED'
    when estado = 'ENVIADO' then 'SENDING'
    when estado = 'FIRMADO' then 'READY'
    when estado = 'RECHAZADO' then 'REJECTED'
    else coalesce(sunat_status, 'NOT_SENT')
  end;

update cpe
set event_id = coalesce(event_id, gen_random_uuid());

update cpe
set idempotency_key = coalesce(idempotency_key, concat_ws(':', tenant_id::text, tipo_documento, serie, numero::text));

alter table cpe alter column event_id set not null;

create unique index if not exists cpe_event_id_unique_idx on cpe (event_id);
create unique index if not exists cpe_tenant_idempotency_idx on cpe (tenant_id, idempotency_key) where idempotency_key is not null;

comment on column cpe.idempotency_key is 'Identificador idempotente por tenant para evitar emisión duplicada del comprobante';
comment on column cpe.sunat_status is 'Estado endurecido del workflow con SUNAT: NOT_SENT, READY, SENDING, ACCEPTED, REJECTED, ERROR';
comment on column cpe.hash_firma is 'Hash SHA-256 de la firma digital del XML enviado a SUNAT';
comment on column cpe.event_id is 'Identificador del evento FacturaEmitidaEvent asociado al comprobante';
comment on column cpe.fecha_emision is 'Fecha de emisión declarada ante SUNAT';
comment on column cpe.fecha_vencimiento is 'Fecha de vencimiento para cobranza del comprobante';

-- Harden GRE metadata with idempotency and SUNAT tracking
alter table gre_guias drop constraint if exists gre_guias_sunat_status_check;
alter table gre_guias
  add column if not exists idempotency_key varchar(255),
  add column if not exists sunat_status varchar(32) default 'NOT_SENT',
  add column if not exists event_id uuid default gen_random_uuid();

alter table gre_guias
  add constraint gre_guias_sunat_status_check
  check (sunat_status in ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR'));

alter table gre_guias alter column sunat_status set default 'NOT_SENT';
alter table gre_guias alter column event_id set default gen_random_uuid();

update gre_guias
set event_id = coalesce(event_id, gen_random_uuid());

update gre_guias
set idempotency_key = coalesce(idempotency_key, concat_ws(':', tenant_id::text, numero));

update gre_guias
set sunat_status =
  case
    when estado = 'ACEPTADO' then 'ACCEPTED'
    when estado = 'ENVIADO' then 'SENDING'
    when estado = 'FIRMADO' then 'READY'
    when estado = 'RECHAZADO' then 'REJECTED'
    else coalesce(sunat_status, 'NOT_SENT')
  end;

alter table gre_guias alter column event_id set not null;

create unique index if not exists gre_guias_event_id_unique_idx on gre_guias (event_id);
create unique index if not exists gre_guias_tenant_idempotency_idx on gre_guias (tenant_id, idempotency_key) where idempotency_key is not null;

comment on column gre_guias.idempotency_key is 'Identificador idempotente por tenant para emisión de GRE';
comment on column gre_guias.sunat_status is 'Estado endurecido de la integración SUNAT para la GRE';
comment on column gre_guias.event_id is 'Identificador del evento GREEmitida asociado';

