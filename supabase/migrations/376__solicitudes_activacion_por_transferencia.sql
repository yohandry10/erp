-- El pago por transferencia necesita que alguien confirme que el dinero llego.
-- Faltaban tres cosas para poder hacerlo:
--
-- 1. Quien aprobo y cuando, que es la trazabilidad minima de una activacion que
--    mueve dinero.
-- 2. El motivo cuando se rechaza, para que el cliente pueda saber que corregir.
-- 3. Una sola solicitud viva por tenant: sin esto, un cliente que reenvia el
--    formulario apila solicitudes y el que aprueba ve la misma cuenta repetida
--    sin saber cual es la buena.

ALTER TABLE public.demo_conversiones_pendientes
  ADD COLUMN IF NOT EXISTS aprobado_por text,
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_rechazo text;

COMMENT ON COLUMN public.demo_conversiones_pendientes.aprobado_por IS
  'Correo del superadministrador que confirmo la transferencia.';
COMMENT ON COLUMN public.demo_conversiones_pendientes.motivo_rechazo IS
  'Por que se rechazo la solicitud, para poder decirselo al cliente.';

-- Se deduplica antes de crear el indice: si ya hubiera varias del mismo tenant,
-- crear el indice fallaria y la migracion se quedaria a medias.
DELETE FROM public.demo_conversiones_pendientes d
WHERE EXISTS (
  SELECT 1 FROM public.demo_conversiones_pendientes otra
  WHERE otra.tenant_id = d.tenant_id
    AND otra.created_at > d.created_at
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_demo_conversiones_pendientes_tenant
  ON public.demo_conversiones_pendientes (tenant_id);
