-- Segregacion de funciones configurable en la aprobacion de ordenes de compra.
--
-- La regla estaba cableada como absoluta: quien creaba la orden nunca podia
-- aprobarla. En una empresa que reparte los roles entre varias personas eso es
-- correcto y es un control interno basico. Pero en un tenant con una sola cuenta
-- operativa deja el circuito de compras bloqueado, porque el segundo aprobador
-- que exige no existe.
--
-- Pasa a ser una decision de la empresa. Por defecto queda desactivada para que
-- el ERP sea usable desde el primer dia, y se activa cuando hay personas
-- distintas para crear y para autorizar.

alter table public.empresa_config
  add column if not exists exigir_aprobacion_segregada boolean not null default false;

comment on column public.empresa_config.exigir_aprobacion_segregada is
  'Si es true, quien crea una orden de compra no puede aprobarla. Se desactiva por defecto porque un tenant con una sola cuenta operativa quedaria bloqueado: se activa cuando la empresa reparte los roles entre varias personas.';
