-- Verificador 500: ninguna columna de moneda cae en soles por omisión.
--
-- No se limita a las cinco tablas que arregló la migración: recorre **todas** las
-- columnas llamadas `moneda` del esquema público y exige que ninguna traiga un
-- defecto literal. Ése es el punto — el defecto peruano llevaba tanto tiempo ahí
-- porque nadie lo miraba, y una tabla nueva lo reintroduciría igual de callada.
--
-- Sobre las tablas donde el importe es el dato, además, la moneda es obligatoria:
-- sin ella un número no significa nada.

BEGIN;

DO $verify$
DECLARE
  v_con_defecto integer;
  v_nulas integer;
  v_total integer;
  v_ejemplo text;
BEGIN
  SELECT count(*) INTO v_total
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'moneda';

  IF v_total < 10 THEN
    RAISE EXCEPTION 'VERIFY_500: sólo % columnas `moneda`; la comprobación no está midiendo lo que cree', v_total;
  END IF;

  ---------------------------------------------------------------------------
  -- 1. Ninguna columna `moneda` trae una moneda por defecto
  ---------------------------------------------------------------------------
  SELECT count(*), min(table_name || '.' || column_name || ' = ' || column_default)
  INTO v_con_defecto, v_ejemplo
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'moneda'
    AND column_default IS NOT NULL;

  IF v_con_defecto > 0 THEN
    RAISE EXCEPTION
      'VERIFY_500: % columnas `moneda` con valor por defecto (ej. %). La moneda la decide el contribuyente, no el esquema.',
      v_con_defecto, v_ejemplo;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Donde el importe es el dato, la moneda es obligatoria
  ---------------------------------------------------------------------------
  SELECT count(*), min(table_name)
  INTO v_nulas, v_ejemplo
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'moneda'
    AND is_nullable = 'YES'
    AND table_name IN (
      'cuentas_por_cobrar',
      'cuentas_por_pagar',
      'cuentas_bancarias',
      'cxc_pagos',
      'cpe'
    );

  IF v_nulas > 0 THEN
    RAISE EXCEPTION 'VERIFY_500: % tablas de dinero admiten moneda nula (ej. %)', v_nulas, v_ejemplo;
  END IF;

  RAISE NOTICE 'VERIFY_500 OK: % columnas `moneda`, ninguna con defecto y ninguna nula donde el importe manda', v_total;
END;
$verify$;

-- ROLLBACK y no COMMIT: la convencion de los otros 67 verificadores. Este solo
-- lee el catalogo, pero dejarlo abierto invitaria a que el dia que cree un
-- fixture lo dejara escrito en la base de la compuerta.
ROLLBACK;
