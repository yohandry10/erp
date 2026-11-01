-- Sólo el API puede cambiar una contraseña.
BEGIN READ ONLY;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.cambiar_password_propio_auth_tx(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cambiar_password_propio_auth_tx(uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.cambiar_password_propio_auth_tx(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cambiar_password_propio_auth_tx debe ser sólo de service_role';
  END IF;
END $$;

ROLLBACK;
