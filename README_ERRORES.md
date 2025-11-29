# Reporte de errores y brechas ERP

Análisis exhaustivo del ERP con foco en flujos, lógica, datos faltantes e interacciones entre módulos (backend, worker, frontend, DB/RLS). Archivos base revisados: `errores_funcionalidades_esperadas.md`, `PENDIENTES_ERP.md`, `ultimos_erorres.md`, `faltantes_para_prod.md`, `RLS_TRIGGERS_FUNCTIONS.md`, Supabase migrations, `apps/erp-api`, `apps/worker`, `apps/web`.

## Resumen crítico
- Worker POS ahora usa JWT `pos.worker` con `POS_WORKER_JWT_SECRET` y llama `/pos/worker/procesar-pendientes`; ya no inserta directo en BD ni usa SRK como bearer. Mantener el secreto alineado en API/worker.
- Jobs automáticos del API se autoprograman en cada instancia con placeholders de “mock mode” sin implementar (`apps/erp-api/src/shared/jobs/background-jobs.service.ts:350-354,588-642`), generando ejecuciones duplicadas y eventos falsos (ausentes/inventario).
- El wizard de configuración en frontend marca el paso SUNAT como requerido pero no importa el componente (`apps/web/app/dashboard/wizard/page.tsx:12-15`, `WizardContext.tsx:70-76`) → el flujo se rompe al llegar al paso.

## Hallazgos por categoría
### Errores de flujo
- **CPE POS reintentos**: jobs POS ya llaman el API con JWT `pos.worker`; validar idempotency/outbox en el endpoint para evitar dobles eventos.
- **Jobs del API sin aislamiento de instancia**: ahora existe `BACKGROUND_JOBS_LEADER=true` para evitar scheduling en instancias no líderes; inventario cíclico y asistencias quedan deshabilitados por flags (`BACKGROUND_JOBS_INVENTARIO_ENABLED/ASISTENCIAS_ENABLED`).
- **SIRE sin persistencia de detalle**: ahora inserta en `sire_registros_detalle` si la tabla existe y las métricas cuentan detalles; validar esquema completo y reportes GRE/SIRE adicionales.

### Errores de lógica
- **Datos fiscales hardcodeados en pedidos**: corregido para usar moneda de pedido/configuración y UOM/código del producto; validar que el frontend envíe unidad/código y que el backend persista valores reales (multi-moneda/UOM).
- **Vacaciones mock**: corregido; vacaciones usadas se calculan desde solicitudes aprobadas por año (resta de 30 días para liquidación).
- **Inventario cíclico no real**: `background-jobs.service.ts:588-618` genera diferencias de stock con `Math.random()` y emite eventos; produce alertas/ajustes falsos.
- **Asistencias pendientes sin idempotencia**: deshabilitadas por flag; siguen siendo mock si se activan (`background-jobs.service.ts:640-680`).
- **PDF CPE incompleto**: logos remotos se cargan y se convierten montos a letras (es-PE); revisar formato final y leyendas según SUNAT/DIAN.

### Errores de vacío / datos faltantes
- **Paso SUNAT inaccesible**: importado `SunatConfigStep` en el wizard, el flujo ya permite continuar; falta probar con credenciales reales.
- **SIRE sin tabla de detalle**: ahora intenta insertar en `sire_registros_detalle` si la tabla existe; métricas y auditoría siguen dependiendo del esquema y de reportes GRE/SIRE faltantes.
- **Jobs sin modo mock**: placeholders `isMockMode` en `background-jobs.service.ts` y en worker carecen de implementación → no se puede desactivar en QA/staging sin tocar código.
- **CPE/generación PDF sin logo/cadena en letras**: logos remotos se cargan y montos se convierten a letras (es-PE); validar formato final y leyendas SUNAT/DIAN en homologación.

-### Análisis por capas
- **Backend / Worker**
  - Jobs POS usan JWT `pos.worker`; riesgo principal: mantener secretos en sync y asegurar idempotency/outbox en el endpoint `/pos/worker/procesar-pendientes`.
  - Jobs programados duplicados entre API (`background-jobs.service.ts`) y worker (`apps/worker/src/index.ts` setInterval/cron), compitiendo por las mismas ventas.
  - RRHH, inventario y asistencia carecen de lógica de negocio real (vacaciones, conteo físico, ausencias) → resultados ficticios.
- **Frontend**
  - Wizard se rompe en el paso SUNAT; además el paso está marcado como requerido en `WizardContext.tsx`, bloqueando avance.
  - Sin fallback visual cuando `NEXT_PUBLIC_API_URL` no está definido; usa localhost, lo que en producción apunta a endpoint incorrecto si falta la env.
- **Base de datos / RLS / migraciones**
  - No se detectaron nuevas violaciones de RLS en migrations, pero los jobs del worker usan service role y tablas sin filtros de tenant, lo que evade políticas.
  - Funciones RLS documentadas en `RLS_TRIGGERS_FUNCTIONS.md` no incluyen hard stops para los nuevos flujos de CPE del worker (no hay control de idempotencia adicional al insertar directo en `cpe`).

### Módulos interconectados
- **POS ↔ CPE ↔ Contabilidad**: los jobs del worker crean CPE sin pasar por el servicio del API; no generan eventos contables ni actualizan outbox, dejando ventas facturadas sin asientos ni CxC.
- **Inventario ↔ Alertas**: inventario cíclico ficticio emite eventos que pueden disparar alertas/ajustes erróneos.
- **RRHH ↔ Planillas**: vacaciones usan solicitudes aprobadas; ausencias siguen sin calcularse.

## Funcionalidad esperada pendiente (según docs revisados)
- Segregar secretos y entornos (`POS_WORKER_JWT_SECRET` distinto de service role en todos los envs; rotación de certificados) y separar staging/prod (`faltantes_para_prod.md`).
- Formalizar endpoints de cierre contable 59/89 y reportes GRE/SIRE adicionales (`PENDIENTES_ERP.md`).
- Implementar rotación/carga real de certificados en configuración y completar paso SUNAT en el wizard.
- Completar outbox/eventos en compras/devoluciones y pedidos CPE placeholders (documentado como pendiente).

## Recomendaciones de corrección
- Jobs POS: mantener `POS_WORKER_JWT_SECRET` en API/worker, monitorear que `/pos/worker/procesar-pendientes` aplique idempotency_key/outbox/locks y no reintroducir SRK como bearer.
- BACKGROUND_JOBS: usar `BACKGROUND_JOBS_LEADER=true` solo en la instancia líder; inventario/ausencias mock permanecen apagados por `BACKGROUND_JOBS_INVENTARIO_ENABLED/ASISTENCIAS_ENABLED` hasta implementar lógica real.
- Corregir `PedidosService` para obtener moneda/UOM/códigos desde producto/configuración y recalcular totales en base a ello. (ajuste aplicado; revisar frontend para enviar unidad/código y backend para UOM/código consistentes).
- Implementar cálculo real de vacaciones/ausencias en `rrhh.service.ts` y persistencia de detalle SIRE.
- Descomentar e importar `SunatConfigStep` o remover el paso SUNAT del array mientras no esté operativo; añadir pruebas de navegación del wizard.










