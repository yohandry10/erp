# Reauditoría de 10 preguntas — 2026-08-13

Entorno: PostgreSQL 16, PostgREST, API y Web locales/efímeros. No se escribió en
PROD ni en el DEV retirado. PROD continúa verificado hasta la migración `490`;
el candidato `491..496` requiere promoción coordinada.

## Resultado después de las correcciones

| # | Pregunta | Resultado local | Evidencia principal |
|---|---|---|---|
| 1 | ¿Diez usuarios distintos del mismo tenant pueden trabajar a la vez? | PASS | Diez actores/cajas realizaron diez ventas concurrentes y diez retries exactos; no se mezclaron sesiones ni identidades. |
| 2 | ¿Dos tenants permanecen aislados bajo carga y cambios de sesión/rol? | PASS | 200/200 lecturas por tenant, cero cruces; guards SQL/API continúan rechazando referencias y actores cross-tenant. |
| 3 | ¿ADMIN_DEMO puede crear roles/usuarios sin escalar privilegios? | PASS | Puede administrar roles operativos de su tenant; `users.manage` no es delegable, permisos globales están prohibidos y un writer alterno no puede asignar `ADMIN_DEMO`. |
| 4 | ¿POS soporta diez ventas concurrentes del mismo SKU? | PASS | Diez tickets/documentos/pagos/detalles únicos, stock reducido exactamente diez veces y retries con los mismos IDs. |
| 5 | ¿Listas, comisiones y consolidado de diez ventas son coherentes? | PASS | UI, DTO y SQL exigen 1..10; snapshots/reversas permanecen durables. Historia >10 sólo admite replay exacto. |
| 6 | ¿CPE/GRE/SIRE/NC/ND preservan integridad fiscal y financiera? | PASS técnico | Una 07/08 nace neutra; sólo aceptación de nota+origen con CDR aplica CxC/saldo/outbox una vez. Rechazo no tiene efecto. Homologación SUNAT real sigue siendo evidencia externa. |
| 7 | ¿Compras, inventario, imágenes y Kardex son correctos? | PASS | Kardex separa apertura/período/cierre, saldo corrido, fecha tenant, unidades y valoración incompleta; editar un producto legacy no presume NIU. |
| 8 | ¿Cobros, reembolsos, reversas y aging son coherentes? | PASS en flujos formales | Cobro/anulación, RMA, saldo a favor y ajustes fiscales tienen reversa causal; aging reconstruye corte y monedas. No se adivina tesorería histórica ambigua. |
| 9 | ¿RRHH tiene segregación y tesorería conciliable? | PASS | Permisos finos, maker-checker, banco/caja en el mismo commit, cuenta contable congelada, retry durable y reversa bancaria aun tras desactivación. Efectivo legacy sin evidencia falla cerrado. |
| 10 | ¿Readiness/outbox/migraciones demuestran operación sana? | PASS local / PROD pendiente | Outbox single-writer y PostgREST real pasan; readiness es pasivo y exige esquema/Redis/outbox. Reconstrucción limpia 000..496 y verify491..496 verdes. Render debe desplegarse y acreditar SHA. |

Balance técnico local: **10/10 sin P0/P1 reproducibles en la segunda revisión**.
Esto no equivale a una promoción productiva ni a homologación legal externa.

## Evidencia final

- PostgreSQL 16 limpio: **493 migraciones `000..496`** aplicadas; verificadores
  `491..496` y readiness real con esquema requerido `496`, todos verdes.
- API: **199/199 suites, 1711/1711 pruebas**; type-check verde.
- Worker/outbox/RRHH focal: **11 suites, 222 pruebas** y PostgREST HTTP real.
- Web: type-check verde, build Next **131/131** y Playwright aislado **16/16**.
  Incluye gate fiscal 494, monitor outbox 492 con `failed`/`dead_letter` y estado
  degradado, Kardex mixto/fecha local/totales incompletos, liquidación sólo
  transferencia, producto legacy sin unidad y login móvil.
- Lint API: cero errores; conserva 118 warnings no bloqueantes.
- `git diff --check`: sin errores de whitespace (sólo avisos EOL del worktree).
- Concurrencia POS posterior a 493: `pos-10-users-after-493.json`.
- Capturas de la primera auditoría y QA fiscal permanecen en esta carpeta; las
  aserciones repetibles viven en los verificadores SQL y specs Playwright.

## Fallos iniciales que quedaron cerrados

1. **NC/ND prematuras:** 494 difiere todo efecto hasta aceptación+CDR y lo aplica
   una sola vez.
2. **Outbox/readiness falsamente verdes:** 492 introduce RPCs de claim/heartbeat/
   complete/fail/reset, tokens de claim, catch-up y readiness pasivo real.
3. **POS concurrente:** 493 serializa numeración por tenant/caja/serie y prueba
   diez usuarios/cajas reales.
4. **Escalación demo:** 493 hace indelegable `users.manage` y exige que el actor
   lo posea al administrar roles/usuarios privilegiados.
5. **RRHH sin tesorería:** 495 integra autorización, segregación, banco/caja,
   outbox y fechas en la transacción; 492 consume la cuenta exacta congelada.
6. **Consolidado/Kardex divergentes:** 496 fija máximo diez y reconstruye saldo
   histórico sin mezclar productos, unidades, monedas o subtotales incompletos.

## Límites explícitos antes de PROD

- Aplicar `491..496` sólo tras preflight PROD, respaldo y revisión del backfill
  `490→492`. Si falta snapshot contable inequívoco, la migración aborta con
  diagnóstico de regularización; no infiere el mapping bancario actual.
- Desplegar DB antes que API/worker y configurar
  `REQUIRED_DATABASE_SCHEMA_VERSION=496`.
- `/api/health/version` debe acreditar el SHA y la fecha reales tras el deploy.
- El cambio de plan Render `free→starter` tiene costo y requiere aprobación.
- No afirmar aceptación SUNAT beta de notas 07/08 hasta conservar CDR aceptado
  de ambos tipos; no afirmar GRE SOAP listo mientras persista el rechazo 2112.
