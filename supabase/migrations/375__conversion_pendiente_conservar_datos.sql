-- La eleccion del cliente al convertir —conservar lo que probo o empezar de
-- cero— se tomaba en el formulario pero se perdia si el pago pasaba por Stripe:
-- el webhook reconstruye el DTO desde demo_conversiones_pendientes, y esa tabla
-- no guardaba el dato. El cliente pedia empezar limpio, pagaba, y se encontraba
-- la cuenta con todo lo del demo dentro.
--
-- Por defecto true: conservar es lo reversible, borrar no.

ALTER TABLE public.demo_conversiones_pendientes
  ADD COLUMN IF NOT EXISTS conservar_datos boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.demo_conversiones_pendientes.conservar_datos IS
  'Si el cliente eligio conservar los datos del demo al convertir. false borra los datos operativos conservando la estructura.';
