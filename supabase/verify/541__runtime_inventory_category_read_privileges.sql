\set ON_ERROR_STOP on
BEGIN;
DO $verify$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_541_REQUIERE_BASE_EFIMERA_ERP_E2E';
  END IF;
  -- Los runners contrastan las ACL heredadas antes/después, sin añadir DML.
  IF NOT has_table_privilege('service_role','public.categorias_producto','SELECT') THEN
    RAISE EXCEPTION 'VERIFY_541_CATEGORY_PRIVILEGES_INVALID';
  END IF;
END;
$verify$;
SET LOCAL ROLE service_role;
SELECT id FROM public.categorias_producto LIMIT 0;
RESET ROLE;
ROLLBACK;
