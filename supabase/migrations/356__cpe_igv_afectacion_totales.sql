-- Soporte de afectación del IGV por ítem (SUNAT — Catálogo 07).
--
-- En Perú no todo lo vendido está gravado: hay bienes exonerados (Apéndice I de
-- la Ley del IGV), inafectos y exportaciones. La tabla cpe solo conservaba
-- total_gravadas, así que un comprobante con ítems exonerados no tenía dónde
-- declarar esa base y terminaba reportándose como gravado ante SUNAT.
--
-- Esta migración es aditiva: los comprobantes existentes quedan con 0.00 en las
-- nuevas columnas, que es exactamente su situación real (todo gravado).

ALTER TABLE public.cpe
  ADD COLUMN IF NOT EXISTS total_exoneradas numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_inafectas numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_exportacion numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.cpe.total_exoneradas IS
  'Base de operaciones exoneradas del IGV (Catálogo 07 código 20). XML: TaxSubtotal 9997.';
COMMENT ON COLUMN public.cpe.total_inafectas IS
  'Base de operaciones inafectas al IGV (Catálogo 07 código 30). XML: TaxSubtotal 9998.';
COMMENT ON COLUMN public.cpe.total_exportacion IS
  'Base de operaciones de exportación (Catálogo 07 código 40).';

ALTER TABLE public.cpe
  DROP CONSTRAINT IF EXISTS ck_cpe_totales_afectacion_no_negativos_356;

ALTER TABLE public.cpe
  ADD CONSTRAINT ck_cpe_totales_afectacion_no_negativos_356
  CHECK (
    coalesce(total_exoneradas, 0) >= 0
    AND coalesce(total_inafectas, 0) >= 0
    AND coalesce(total_exportacion, 0) >= 0
  )
  NOT VALID;

ALTER TABLE public.cpe
  VALIDATE CONSTRAINT ck_cpe_totales_afectacion_no_negativos_356;

-- La columna ya existía pero sin dominio: cualquier cadena era aceptada y el XML
-- la enviaba tal cual a SUNAT. Se normaliza lo existente y se acota al catálogo.
ALTER TABLE public.productos
  ALTER COLUMN afectacion_igv SET DEFAULT '10';

UPDATE public.productos
SET afectacion_igv = '10'
WHERE afectacion_igv IS NULL
   OR btrim(afectacion_igv) = ''
   OR btrim(afectacion_igv) !~ '^(10|11|12|13|14|15|16|17|20|21|30|31|32|33|34|35|36|40)$';

ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS ck_productos_afectacion_igv_catalogo07_356;

ALTER TABLE public.productos
  ADD CONSTRAINT ck_productos_afectacion_igv_catalogo07_356
  CHECK (
    afectacion_igv IS NULL
    OR btrim(afectacion_igv) ~ '^(10|11|12|13|14|15|16|17|20|21|30|31|32|33|34|35|36|40)$'
  )
  NOT VALID;

ALTER TABLE public.productos
  VALIDATE CONSTRAINT ck_productos_afectacion_igv_catalogo07_356;

COMMENT ON COLUMN public.productos.afectacion_igv IS
  'Tipo de afectación del IGV (SUNAT Catálogo 07). 10=Gravado, 20=Exonerado, 30=Inafecto, 40=Exportación.';
