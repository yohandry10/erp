# Flujo de credenciales y encabezados multi-tenant

Este ERP aplica aislamiento lógico en cada llamada hacia la base de datos (Supabase/PostgREST) mediante una combinación de middleware HTTP, un contexto asincrónico y clientes firmados en tiempo de ejecución. El flujo completo es el siguiente:

1. **Autenticación y middleware (`TenantMiddleware`)**  
   - Ruta: `apps/erp-api/src/common/middleware/tenant.middleware.ts`  
   - Extrae de `req.user` el `tenant_id` y `id` del usuario autenticado (proveniente del `JwtAuthGuard`).  
   - Busca encabezados alternativos (`x-supabase-access-token`, `authorization`) para propagar el token de Supabase del usuario.  
   - En caso de no recibir encabezado válido, continúa pero deja constancia para auditoría.  
   - Persistente: registra el contexto en `TenantContextService` para toda la cadena asíncrona.

2. **Contexto asincrónico (`TenantContextService`)**  
   - Ruta: `apps/erp-api/src/shared/tenant/tenant-context.service.ts`  
   - Usa `AsyncLocalStorage` para que cualquier servicio pueda recuperar `tenantId`, `userId` y el token Supabase actual sin pasarlo explícitamente como parámetro.

3. **Cliente Supabase en backend (`SupabaseService`)**  
  - Ruta: `apps/erp-api/src/shared/supabase/supabase.service.ts`  
  - Cada llamada ejecuta `fetch` con encabezados firmados dinámicamente:
    - `apikey`: `SUPABASE_ANON_KEY` (rol anónimo + RLS).
    - `Authorization`: `Bearer` con el token de usuario si existe; caso contrario, usa anon key (manteniendo RLS).
    - `X-Tenant-Id` y `X-User-Id` para que las funciones `app.current_tenant_id()` operen correctamente.
  - El servicio advierte en logs cuando cae al modo anónimo para priorizar diagnósticos.

4. **Cliente en frontend (`useApi` / `useApiCall`)**  
  - Ruta: `apps/web/hooks/use-api.ts`  
  - Inyecta `Authorization: Bearer {access_token}` desde `localStorage`.  
  - Propaga encabezados extra (p. ej. `x-country-id`). La cabecera `X-Tenant-Id` la resuelve el backend para evitar spoofing.

5. **Auditoría y pruebas automatizadas**  
  - `TenantMiddleware` y `SupabaseService` están cubiertos en `apps/erp-api/tests/run-tests.ts` con escenarios negativos (token ausente, headers espurios).  
  - El `PedidoLockService` y las pruebas de concurrencia garantizan que estos encabezados se mantengan coherentes incluso bajo carga simultánea.

> **Recomendaciones operativas**  
> - En entornos de producción, mantener dashboards de logs centrados en `TenantMiddleware` para detectar requests sin `tenantId`.  
> - Al extender endpoints, no acceder a Supabase directamente desde controladores; siempre usar servicios que recuperen el contexto desde `TenantContextService`.