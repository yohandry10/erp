\set ON_ERROR_STOP on
BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_pos_491') THEN
    RAISE EXCEPTION 'VERIFY_491_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_491_REQUIERE_POSTGRESQL_16';
  END IF;
END
$guard$;

DO $verify$
DECLARE
  v_value jsonb;
BEGIN
  FOREACH v_value IN ARRAY ARRAY[
    NULL::jsonb,
    'null'::jsonb,
    'true'::jsonb,
    '42'::jsonb,
    '"scalar"'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb
  ] LOOP
    IF app.jsonb_array_or_empty_491(v_value) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'VERIFY_491_ARRAY_GUARD_FAILED:%', v_value;
    END IF;
    IF app.pos_payments_canonical_451(v_value) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'VERIFY_491_PAYMENT_CANONICAL_FAILED:%', v_value;
    END IF;
    IF app.pos_items_canonical_451(v_value) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'VERIFY_491_ITEM_CANONICAL_FAILED:%', v_value;
    END IF;
  END LOOP;

  IF app.jsonb_array_or_empty_491('[{"ok":true}]'::jsonb) <> '[{"ok":true}]'::jsonb THEN
    RAISE EXCEPTION 'VERIFY_491_VALID_ARRAY_CHANGED';
  END IF;
  IF app.pos_intencion_comercial_469(
    '{"pagos":null,"items":null,"emitir_cpe":true}'::jsonb
  )->'pagos' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'VERIFY_491_POS_INTENTION_PAYMENT_NULL_FAILED';
  END IF;
  IF app.pos_intencion_comercial_469(
    '{"pagos":{},"items":"bad","emitir_cpe":true}'::jsonb
  )->'items' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'VERIFY_491_POS_INTENTION_ITEM_SCALAR_FAILED';
  END IF;

  IF has_function_privilege('service_role', 'app.jsonb_array_or_empty_491(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'app.jsonb_array_or_empty_491(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.jsonb_array_or_empty_491(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_491_INTERNAL_HELPER_EXPOSED';
  END IF;
END
$verify$;

ROLLBACK;
