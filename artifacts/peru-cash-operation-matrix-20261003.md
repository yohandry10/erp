# Aceptación por operación: cajas Perú

28 contratos disponibles. Ninguna operación tiene aceptación completa. Las correcciones ya están en fuentes canónicas de la rama de caja; falta CI exacto, promoción 566 y runtime.

Ensayo canónico local: 23 escenarios API y 10 comprobaciones UI aprobados, con 566 canónica, su verificador y restore (`artifacts/peru-cash-canonical-local-20261003`). Parte de un snapshot local restaurado; no sustituye la reconstrucción fresca.

| Operación | Resultado de variante API | UI real | Defectos |
|---|---|---|---|
| GET /api/cajas | canonical_local_variant_passed | pendiente |  |
| POST /api/cajas | canonical_local_variant_passed | pendiente |  |
| PUT /api/cajas/supervisores/:supervisorId/pin | canonical_local_variant_passed | pendiente |  |
| PUT /api/cajas/:id | canonical_local_variant_passed | pendiente |  |
| GET /api/cajas/opciones-contables | canonical_local_variant_passed | pendiente | cash-first-client-account-missing |
| POST /api/cajas/:id/apertura | canonical_local_variant_passed | sí |  |
| POST /api/cajas/:id/cierre | canonical_local_variant_passed | pendiente | cash-close-amount-alias-rejected |
| GET /api/cajas/sesiones | canonical_local_variant_passed | sí | cash-invalid-date-500, cash-day-filter-midnight, cash-session-read-unavailability-masked, cash-ui-session-error-sticky |
| GET /api/cajas/cortes | canonical_local_variant_passed | sí | cash-invalid-date-500, cash-day-filter-midnight, cash-cut-read-unavailability-masked, cash-ui-cuts-error-sticky |
| GET /api/cajas/cortes/:corteId | canonical_local_variant_passed | pendiente |  |
| GET /api/cajas/cortes/:corteId/pdf | canonical_local_variant_passed | sí |  |
| GET /api/cajas/cortes/:corteId/csv | canonical_local_variant_passed | sí |  |
| GET /api/cajas/validar-precierre/:sesionId | canonical_local_variant_passed | pendiente |  |
| GET /api/cajas/saldo-esperado/:sesionId | canonical_local_variant_passed | pendiente |  |
| GET /api/cajas/movimientos/:sesionId | canonical_local_variant_passed | pendiente |  |
| POST /api/cajas/validar-cierre/:sesionId | canonical_local_variant_passed | sí |  |
| GET /api/cajas/supervisores-autorizados/:sesionId | canonical_local_variant_passed | pendiente |  |
| GET /api/cajas/supervisores-gestion-pin | canonical_local_variant_passed | pendiente |  |
| POST /api/cajas/cerrar/:sesionId | canonical_local_variant_passed | sí |  |
| POST /api/cajas/retiros/:sesionId | canonical_local_variant_passed | pendiente |  |
| POST /api/cajas/retiros/:retiroId/conciliar | canonical_local_variant_passed | pendiente |  |
| POST /api/cajas/cambio-turno/iniciar/:sesionId | canonical_local_variant_passed | pendiente |  |
| POST /api/cajas/cambio-turno/completar/:cambioId | canonical_local_variant_passed | pendiente |  |
| POST /api/cajas/cambio-turno/cancelar/:cambioId | canonical_local_variant_passed | pendiente |  |
| GET /api/cajas/sesiones/:sesionId/cambios-turno | canonical_local_variant_passed | pendiente |  |
| POST /api/cajas/movimientos/manual/:sesionId | canonical_local_variant_passed | sí |  |
| POST /api/cajas/sesiones/:sesionId/cierre-administrativo | canonical_local_variant_passed | pendiente |  |
| GET /api/cajas/:id/corte-z | canonical_local_variant_passed | pendiente | cash-withdrawals-report-read-privilege, cash-session-read-unavailability-masked, cash-fiscal-payment-report-infrastructure-400 |

Intentos conservados:

- `artifacts/peru-cash-local-20261003205621519-3108`: local_infrastructure_failure. Docker Desktop terminó durante la fase de navegador; login 503 por PostgREST inaccesible; no es defecto de producto.
- `artifacts/peru-cash-ui-recovery-defect-20261003`: product_defects_reproduced. Ocho comprobaciones UI aprobadas; Sesiones y Cortes mantuvieron el error tras un reintento con HTTP 200.
- `artifacts/peru-cash-canonical-local-20261003`: passed. Fuentes API/UI/SQL canónicas; 23 API, 10 UI y restore.

El JSON conserva evidencias previas, escenarios concretos, 19 defectos confirmados (incluidos dos de recuperación UI reproducidos en navegador) y comprobaciones pendientes. Las consultas que cargan no acreditan mutaciones ni flujos completos.
