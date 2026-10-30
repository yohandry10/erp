-- Verify the forward default without changing historical movements.
BEGIN READ ONLY;

DO $$
DECLARE
  actual_default text;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid)
    INTO actual_default
    FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.movimientos_bancarios'::regclass
     AND a.attname = 'activo'
     AND NOT a.attisdropped;

  IF actual_default IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'movimientos_bancarios.activo default must be true, got %', actual_default;
  END IF;
END $$;

ROLLBACK;
