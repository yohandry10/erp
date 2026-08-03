-- `documentos` guardaba `subtotal` con la base gravada y nada mas, asi que una
-- venta con lineas exoneradas o inafectas perdia esa parte: subtotal + IGV no
-- llegaba al total y no habia de donde sacar el detalle. Una boleta de S/ 33.00
-- con S/ 25.00 gravados y S/ 3.50 exonerados aparecia como 25.00 + 4.50 = 33.00
-- sin explicar los 3.50 que faltaban.
--
-- El Registro de Ventas de SUNAT pide las bases separadas, y `cpe` ya las
-- calcula bien; lo que faltaba era conservarlas en el documento operativo.

ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS total_gravadas numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_exoneradas numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_inafectas numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_exportacion numeric(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.documentos.total_gravadas IS
  'Base imponible afecta a IGV (catalogo 07, afectacion 10).';
COMMENT ON COLUMN public.documentos.total_exoneradas IS
  'Operaciones exoneradas (afectacion 20, Apendice I de la Ley del IGV).';
COMMENT ON COLUMN public.documentos.total_inafectas IS
  'Operaciones inafectas (afectacion 30).';
COMMENT ON COLUMN public.documentos.total_exportacion IS
  'Operaciones de exportacion (afectacion 40).';

-- Backfill 1: los documentos que nacieron de un CPE toman sus bases reales.
UPDATE public.documentos d
SET total_gravadas = COALESCE(c.total_gravadas, 0),
    total_exoneradas = COALESCE(c.total_exoneradas, 0),
    total_inafectas = COALESCE(c.total_inafectas, 0),
    total_exportacion = COALESCE(c.total_exportacion, 0)
FROM public.cpe c
WHERE c.documento_id = d.id
  AND (c.total_gravadas IS NOT NULL
       OR c.total_exoneradas IS NOT NULL
       OR c.total_inafectas IS NOT NULL
       OR c.total_exportacion IS NOT NULL);

-- Backfill 2: para el resto solo se puede afirmar lo que ya decia `subtotal`.
-- No se reparte el residuo entre exonerado e inafecto: son categorias
-- tributarias distintas y adivinarlas seria inventar el dato.
UPDATE public.documentos d
SET total_gravadas = COALESCE(d.subtotal, 0)
WHERE d.total_gravadas = 0
  AND COALESCE(d.subtotal, 0) <> 0;
