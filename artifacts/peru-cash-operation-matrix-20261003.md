# Aceptación por operación: cajas Perú

28 contratos disponibles. Ninguna operación tiene aceptación completa. Las correcciones se integraron en #136 (`4f946dfb`): 28 checks, 566 promovida una vez, main aprobado y runtime 566 verificado.

Ensayo canónico local: 23 escenarios API y 10 comprobaciones UI aprobados, con 566 canónica, su verificador y restore (`artifacts/peru-cash-canonical-local-20261003`). Parte de un snapshot local restaurado; no sustituye la reconstrucción fresca.

| Operación | Resultado de variante API | UI real | Defectos |
|---|---|---|---|
| GET /api/cajas | canonical_variant_passed_ci_deployed | pendiente |  |
| POST /api/cajas | canonical_variant_passed_ci_deployed | pendiente |  |
| PUT /api/cajas/supervisores/:supervisorId/pin | canonical_variant_passed_ci_deployed | pendiente |  |
| PUT /api/cajas/:id | canonical_variant_passed_ci_deployed | pendiente |  |
| GET /api/cajas/opciones-contables | canonical_variant_passed_ci_deployed | pendiente | cash-first-client-account-missing |
| POST /api/cajas/:id/apertura | canonical_variant_passed_ci_deployed | sí |  |
| POST /api/cajas/:id/cierre | canonical_variant_passed_ci_deployed | pendiente | cash-close-amount-alias-rejected |
| GET /api/cajas/sesiones | canonical_variant_passed_ci_deployed | sí | cash-invalid-date-500, cash-day-filter-midnight, cash-session-read-unavailability-masked, cash-ui-session-error-sticky |
| GET /api/cajas/cortes | canonical_variant_passed_ci_deployed | sí | cash-invalid-date-500, cash-day-filter-midnight, cash-cut-read-unavailability-masked, cash-ui-cuts-error-sticky |
| GET /api/cajas/cortes/:corteId | canonical_variant_passed_ci_deployed | pendiente |  |
| GET /api/cajas/cortes/:corteId/pdf | canonical_variant_passed_ci_deployed | sí |  |
| GET /api/cajas/cortes/:corteId/csv | canonical_variant_passed_ci_deployed | sí |  |
| GET /api/cajas/validar-precierre/:sesionId | canonical_variant_passed_ci_deployed | pendiente |  |
| GET /api/cajas/saldo-esperado/:sesionId | canonical_variant_passed_ci_deployed | pendiente |  |
| GET /api/cajas/movimientos/:sesionId | canonical_variant_passed_ci_deployed | pendiente |  |
| POST /api/cajas/validar-cierre/:sesionId | canonical_variant_passed_ci_deployed | sí |  |
| GET /api/cajas/supervisores-autorizados/:sesionId | canonical_variant_passed_ci_deployed | pendiente |  |
| GET /api/cajas/supervisores-gestion-pin | canonical_variant_passed_ci_deployed | pendiente |  |
| POST /api/cajas/cerrar/:sesionId | canonical_variant_passed_ci_deployed | sí |  |
| POST /api/cajas/retiros/:sesionId | canonical_variant_passed_ci_deployed | pendiente |  |
| POST /api/cajas/retiros/:retiroId/conciliar | canonical_variant_passed_ci_deployed | pendiente |  |
| POST /api/cajas/cambio-turno/iniciar/:sesionId | canonical_variant_passed_ci_deployed | pendiente |  |
| POST /api/cajas/cambio-turno/completar/:cambioId | canonical_variant_passed_ci_deployed | pendiente |  |
| POST /api/cajas/cambio-turno/cancelar/:cambioId | canonical_variant_passed_ci_deployed | pendiente |  |
| GET /api/cajas/sesiones/:sesionId/cambios-turno | canonical_variant_passed_ci_deployed | pendiente |  |
| POST /api/cajas/movimientos/manual/:sesionId | canonical_variant_passed_ci_deployed | sí |  |
| POST /api/cajas/sesiones/:sesionId/cierre-administrativo | canonical_variant_passed_ci_deployed | pendiente | cash-administrative-close-stale-expected-amount |
| GET /api/cajas/:id/corte-z | canonical_variant_passed_ci_deployed | pendiente | cash-withdrawals-report-read-privilege, cash-session-read-unavailability-masked, cash-fiscal-payment-report-infrastructure-400 |

Intentos conservados:

- `artifacts/peru-cash-local-20261003205621519-3108`: local_infrastructure_failure. Docker Desktop terminó durante la fase de navegador; login 503 por PostgREST inaccesible; no es defecto de producto.
- `artifacts/peru-cash-ui-recovery-defect-20261003`: product_defects_reproduced. Ocho comprobaciones UI aprobadas; Sesiones y Cortes mantuvieron el error tras un reintento con HTTP 200.
- `artifacts/peru-cash-canonical-local-20261003`: passed. Fuentes API/UI/SQL canónicas; 23 API, 10 UI y restore.

El JSON conserva evidencias previas, escenarios concretos, 20 defectos confirmados (incluidos dos de recuperación UI reproducidos en navegador) y comprobaciones pendientes. Las consultas que cargan no acreditan mutaciones ni flujos completos.
