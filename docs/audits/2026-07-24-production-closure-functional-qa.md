# Cierre funcional QA integral DEV — 2026-07-24

## Alcance y entorno

- Rama: `codex/accounting-production-closure`.
- Base operada: DEV `hbueraexcbowpfnjlppi`.
- PROD `wypnbcptofqdmoynlonq`: no se conectó, no se migró y no se cargaron datos sintéticos.
- Preflight DEV ejecutado antes de las operaciones de BD.
- Fuentes canónicas revisadas: `START_HERE`, `CURRENT_STATE`, `FLOW_STATUS`, `AGENT_SYNC`, `ANTI_DUPLICATION_PROTOCOL`, `DECISIONS`, manifiesto documental, manuales de Ventas/POS/Fiscal, Compras/Inventario, Finanzas/Contabilidad, runbook de migración y límites DEV/PROD.
- Búsqueda anti-duplicación: `rg` sobre decisiones, estados vivos, auditorías, importación de stock, cancelación CPE, numeración fiscal, RBAC y pruebas E2E.

Este documento registra evidencia de código y runtime DEV. No equivale a certificación legal, tributaria ni a aceptación productiva de SUNAT.

## Decisiones cerradas

### Stock inicial: `almacen_id` es obligatorio

El contrato canónico requiere `almacen_id`:

- `validate()` exige el header y un UUID válido por fila.
- La plantilla y el runbook deben documentarlo como requerido.
- `run()` no debe entender `null` como un caso funcional válido; la tolerancia `?? null` era una inconsistencia defensiva, no el contrato.
- Los cambios de fixtures en `migration.spec.ts` son correctos y no deben revertirse.

Motivo: desde el cierre single-ledger, el saldo físico vive por almacén en `producto_existencias`; importar stock sin almacén crearía un saldo sin ubicación autoritativa.

### Anulación CPE POS: el diagnóstico histórico era correcto, pero ya no describe el código actual

El bug pre-fix estaba confirmado:

- `cpe.event_id` correspondía a `factura.emitida`.
- `asientos_contables.source_event_id` podía corresponder a `venta.procesada`.
- En POS ambos eventos eran distintos; buscar exclusivamente por `source_event_id` hacía que el guard fail-closed devolviera 409 pese a existir el asiento.

El servicio actual resuelve primero el evento y conserva un fallback tenant-scoped por referencia fiscal canónica. Exige unicidad del asiento y detalle antes de revertir; no abre un fallback ambiguo. El E2E validó anulación, nota de crédito y reversos de stock, caja y contabilidad. Por tanto:

- “Ninguna venta POS se puede anular” era cierto para la implementación anterior.
- No es cierto para el runtime DEV actual.

### Numeración fiscal: una serie B/F tiene una sola secuencia

La migración `354__pos_fiscal_numbering_single_sequence.sql` hace que POS y Ventas/Documentos reserven `Bxxx/Fxxx` en `documento_series`. Los tickets `Txxx` conservan numeración POS por caja.

La migración eleva el contador al máximo ya usado, pero no renumera documentos históricos. Antes de promoverla se debe auditar si PROD contiene colisiones históricas y definir tratamiento contable/fiscal.

### ADMIN operativo y ADMIN demo son contratos distintos

La migración `355__non_demo_admin_rbac_seed_integrity.sql` evita copiar a tenants normales el ADMIN reducido de una demo:

- ADMIN no-demo recibe todos los permisos activos de su tenant.
- ADMIN/ADMIN_DEMO de demos conserva retirados `documentos.audit.read`, `security.audit.read`, `system.debug`, `tenants.manage` y `users.manage`.
- La función de seed queda ejecutable sólo por `service_role`.

Verificación DEV: tenant normal nuevo con 10 roles, 195 permisos y ADMIN 195/195; tenant demo mantiene ADMIN reducido a 190.

## Hallazgos adicionales cerrados

- La navegación autenticada a `/login/` podía mostrar el formulario por no normalizar trailing slash en middleware. Se normalizó el pathname y el E2E Auth quedó 4/4.
- El sidebar móvil nacía visible durante el primer paint porque `isMobile=false` hasta el efecto de cliente. Ahora CSS lo mantiene fuera del viewport y sin pointer events desde el HTML inicial; en escritorio permanece visible.
- Offline mostraba “Sincronizar” deshabilitado sin explicar la razón. Ahora expone `title` para sin conexión, sincronización en curso o cola vacía.
- Descargas CPE y los formularios de cotización/pedido podían mostrar acciones deshabilitadas durante una carga transitoria sin explicar la causa. Ahora los controles exponen el estado y el smoke lo valida como contrato explícito.
- El setup global Playwright no cargaba el password operativo del workspace y no reintentaba un 429 de login. Se alineó con los helpers E2E y la ventana de throttle.
- El tema podía volver de claro a oscuro por una hidratación tardía porque el hook priorizaba el atributo DOM obsoleto sobre `localStorage`. La preferencia persistida es ahora la fuente de verdad.
- Estados financieros reutilizaban `text-white` sobre superficies claras y el CTA de apertura POS terminaba en un cian sin contraste AA suficiente. Se alinearon con tokens adaptativos y una gradiente oscura verificable.
- El smoke de 74 rutas tenía falsos positivos por `<main>` anidado, contenido mínimo arbitrario, colecciones dinámicas de botones y loaders evaluados antes de aparecer. Ahora exige título real y ausencia de loader dentro del `<main>`, toma botones en una captura DOM estable y documenta estados deshabilitados legítimos.

## Evidencia funcional

### Flujos verticales reales DEV

Los siguientes E2E quedaron verdes de forma aislada en esta campaña:

- Compras: proveedor, cotización, aprobación, OC, recepción, inventario, CxP y devolución.
- Inventario/Logística: almacenes, existencias, kardex, reservas, picking, despacho e idempotencia.
- POS/Cajas: apertura, venta, pago, stock, ticket/CPE, cierre, corte y asiento.
- Ventas B2B: cliente, cotización, pedido, aprobación, reserva, facturación, CxC y contabilidad.
- CPE: factura/boleta, listado, detalle, PDF, idempotencia, errores fiscales y anulación/reversos.
- GRE y SIRE: contratos, persistencia, estados y fallos cerrados.
- RRHH: empleados, asistencia, planilla, pago, PDF y asiento contable.
- Contabilidad: asientos, periodos, libros y estados financieros.
- Finanzas: CxC, CxP, bancos, conciliación, tesorería y reportes.
- Auth/Auditoría/RBAC/RLS: login/cookie, rutas protegidas, aprobación con actor alterno, filtros de auditoría, usuario restringido 403 y aislamiento de tenants A/B.

### Gates técnicos

- Backend Jest: **120/120 suites, 1106/1106 tests**.
- Web type-check: OK.
- Web build Next: **111/111 rutas generadas**, OK.
- API type-check/build: OK en la campaña.
- Gate tenant/RBAC/RLS: 1/1.
- Auth: 4/4.
- Auditoría real: 1/1.
- Finanzas completo con secuencia fiscal compartida y reintento CPE: 1/1.
- Contrato de tema, persistencia, contraste y responsive: 2/2.
- Calidad funcional UI (validaciones, creación real de cliente, modal de usuarios y acción GRE): 4/4.
- Smoke UI horizontal contra `next start`: 74 rutas × desktop/narrow, **148/148**.

## Riesgos y dependencias que impiden afirmar “100% producción”

1. Las migraciones `347..355` están sólo en DEV. La promoción a PROD requiere preflight, respaldo, ventana, validación posterior y el runbook.
2. Antes de `354`, auditar colisiones históricas B/F entre POS y Documentos. No renumerar automáticamente documentos fiscales existentes.
3. El PFX local no demuestra todavía correspondencia/autorización con el RUC 20 del contribuyente; el guard productivo debe seguir fail-closed.
4. GRE REST requiere credenciales API SUNAT reales si el contribuyente emitirá guías.
5. PLE/SIRE/PLAME, tasas AFP/ONP y reglas laborales/tributarias requieren validación contable/legal con el régimen y datos reales.
6. Falta prueba con impresora térmica física y smoke del ejecutable Tauri instalado/reconexión.
7. Redis y SMTP no están levantados en el entorno local. El fallback de cache permitió QA, pero producción necesita infraestructura y observabilidad reales.
8. Falta carga/concurrencia en infraestructura destino, secretos finales y un smoke productivo externo expresamente autorizado.

## Criterio de salida

El código core y DEV pueden calificarse como release-candidate para el alcance probado. El alta productiva sigue condicionada a promover `347..355` con control, resolver dependencias fiscales/legales/infra y ejecutar el checklist de Go-Live. No corresponde prometer certeza absoluta: el estándar es evidencia reproducible, fallos cerrados y riesgos residuales explícitos.
