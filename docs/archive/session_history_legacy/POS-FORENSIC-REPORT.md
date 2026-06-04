# REPORTE FORENSE DEL POS - Analisis Exhaustivo

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_contexto_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

**Fecha**: 2026-05-19
**Scope**: Backend (pos.service.ts, pos.controller.ts, cajas.service.ts), Frontend (page.tsx), DB (39+ migraciones), Tests
**Tests baseline**: 938 → 948 (10 tests forenses nuevos)

---

## VEREDICTO GENERAL

El path principal del POS (full_tx RPC) **FUNCIONA CORRECTAMENTE**. La venta completa (items → stock → pagos → caja → outbox) se ejecuta en una sola transaccion atomica PostgreSQL con locks `FOR UPDATE`. Sin embargo, existen **15 hallazgos verificados** en paths secundarios y edge cases (2 ALTA, 6 MEDIA, 7 BAJA).

---

## RESULTADOS POR FASE

### FASE 1: Compilacion y Analisis Estatico
| Check | Resultado |
|---|---|
| TSC backend `--noEmit` | **PASS** - 0 errores en POS/Cajas |
| Tipos `any` | 44 en pos.service.ts (Supabase boundary, DTOs) |
| Codigo muerto | Endpoints caja en PosController no usados por frontend |
| TODOs pendientes | 5x TAREA 12 (facturacion), 6x TODO en Cajas (supervisor, IP, PIN) |
| Error handling | 7 catch blocks silenciosos identificados |

### FASE 2: Verificacion de Dependencias
| Check | Resultado |
|---|---|
| 7 RPCs | **PASS** - Todas existen en migraciones |
| 8 tablas POS | **PASS** - Todas en migration 002 |
| 2 vistas | **PASS** - vista_pos_productos, vw_eventos_pos_sospechosos |
| 40+ indices | **PASS** - Cobertura completa |
| Feature flags | **PASS** - Backend + frontend alineados |

### FASE 3: Logica de Negocio
| Check | Resultado |
|---|---|
| Decimal.js (API) | **PASS** - Server-side recalculo correcto |
| numeric (RPC) | **PASS** - round(...,2) correcto |
| IGV dinamico | **PASS** en full_tx, **BUG** en legacy (hardcoded 0.18) |
| Idempotency | **PASS** - Unique index + RPC check |
| Numeracion | **BUG** - LIMIT(1000) puede subestimar correlativo |
| Pagos mixtos | **PASS** - Tolerancia 0.01, zero/negativo rechazado |
| Stock atomico | **PASS** en full_tx, **BUG** en legacy (no atomico) |
| Ventas credito | **BUG** - CxC failure silencioso |

### FASE 4: Seguridad
| Check | Resultado |
|---|---|
| Guards (16 endpoints) | **PASS** - JWT + Permission + FeatureFlag en todos |
| RLS | **PASS** - Auto-hardening en migration 066 |
| Input validation | **HALLAZGO** - Sin DTO para procesarVenta |
| Encryption | **PASS** - AES-256-GCM correcto |
| Tenant isolation | **PASS** - .eq('tenant_id') en todas las queries |

### FASE 5: Tests
| Check | Resultado |
|---|---|
| Tests POS existentes (8) | **PASS** - 8/8 |
| Tests forenses nuevos (10) | **PASS** - 10/10 |
| Suite completa (948) | **PASS** - 948/948, 104 suites |

### FASE 6: Frontend-Backend
| Check | Resultado |
|---|---|
| 9 endpoints POS | **PASS** - Todos matchean |
| Caja apertura/cierre | **DISCREPANCIA** - Frontend usa CajasController, no PosController |
| Response shapes | **PASS** - `{success, data}` consistente |

### FASE 7: Base de Datos
| Check | Resultado |
|---|---|
| RPCs compilacion | **PASS** - 7/7 funciones |
| Migraciones orden | **PASS** - 031→328 sin gaps |
| Indices | **PASS** - Idempotency, sesion unica, correlativos |
| RLS auto-hardening | **PASS** - Migration 066 cubre todas las tablas con tenant_id |

### FASE 8: Edge Cases
| Escenario | Resultado |
|---|---|
| Sin idempotency_key | **PASS** - Rechazado con mensaje claro |
| Sin items | **PASS** - Rechazado |
| Sin cliente doc/nombre | **PASS** - Rechazado |
| Pagos no cuadran | **PASS** - Rechazado con detalle |
| Monto pago ≤ 0 | **PASS** - Rechazado |
| Config incompleta | **PASS** - Rechazado pre-venta |
| >999 items | **PASS** - Rechazado (SUNAT limit) |
| Sesion de dia anterior | **PASS** - Auto-cierre |
| Stock negativo | **PASS** en full_tx (FOR UPDATE + RAISE) |
| Misma idempotency 2x | **PASS** - Retorna venta existente |
| full_tx falla → legacy | **PASS** - Fallback chain funciona |

---

## HALLAZGOS VERIFICADOS

### ALTA SEVERIDAD (2)

**F1: Sin DTO/ValidationPipe para procesarVenta**
- **Ubicacion**: `pos.controller.ts:69` — `@Body() ventaData: any`
- **Evidencia**: No hay class-validator, no hay Zod schema, no hay ValidationPipe
- **Riesgo**: Frontend puede enviar JSON arbitrario. No valida longitudes maximas de strings
- **Mitigacion parcial**: PostgREST usa queries parametrizados; service hace validaciones manuales
- **Fix propuesto**: Crear `CreateVentaPosDto` con class-validator decorators

**F2: Stock update no atomico en path legacy**
- **Ubicacion**: `pos.service.ts:483-530` — `persistirImpactosVentaPOS()`
- **Evidencia**: Dos llamadas separadas: `productos.update()` (line 483) + `movimientos_inventario.insert()` (line 498)
- **Riesgo**: Si insert falla despues del update, stock queda descontado sin movimiento
- **Mitigacion parcial**: Rollback manual del stock (lines 519-527); el path principal usa full_tx RPC que es atomico
- **Condicion de activacion**: Solo cuando full_tx RPC no existe o falla con PGRST202

### MEDIA SEVERIDAD (6)

**F3: LIMIT(1000) en scan correlativo**
- **Ubicacion**: `pos.service.ts:202-221` — `getMaxCorrelativoFiscalOcupado()`
- **Evidencia**: `.limit(1000)` en queries a ventas_pos, cpe, documentos
- **Riesgo**: Si una serie tiene >1000 registros, el max puede subestimarse → tickets duplicados
- **Mitigacion**: El RPC `obtener_siguiente_numero_pos` usa sequence atomica; este metodo es solo para sync
- **Fix propuesto**: Usar `SELECT MAX(correlativo)` via RPC en lugar de fetch + iterate

**F4: IGV hardcoded 0.18 en calculo detalle legacy**
- **Ubicacion**: `pos.service.ts:377`
- **Evidencia**: `new Decimal(subtotal).times(0.18)` — hardcoded en lugar de usar `tasaIgv`
- **Riesgo**: Si IGV cambia de 18%, `detalle_ventas_pos.impuesto` sera incorrecto
- **Condicion de activacion**: Solo en path legacy (full_tx no disponible)

**F5: Fallo CxC silencioso en ventas a credito**
- **Ubicacion**: `pos.service.ts:1502-1506`
- **Evidencia**: catch swallows error — `// No bloquear la venta si falla crear CxC`
- **Riesgo**: Venta a credito persiste sin cuenta por cobrar → receivable sin tracking
- **Fix propuesto**: Loggear como error critico; crear alerta/notificacion al admin

**F6: Fallo audit trail silencioso**
- **Ubicacion**: `pos-audit.service.ts:113-117`
- **Evidencia**: catch returns null — `// No lanzamos error para no interrumpir el flujo de venta`
- **Riesgo**: Si RPC `registrar_evento_pos` no existe, toda la auditoria desaparece silenciosamente

**F7: Fallo movimiento caja silencioso**
- **Ubicacion**: `pos.service.ts:1248-1250`
- **Evidencia**: catch con `logger.warn` — movimiento no registrado
- **Riesgo**: Monto esperado en cierre de caja sera incorrecto si movimiento falla

**F8: Validacion stock pre-check no transaccional en path legacy**
- **Ubicacion**: `pos.service.ts:329-338` (validacion) vs `483-530` (ejecucion)
- **Evidencia**: Validacion stock ocurre ANTES del lock, ejecucion DESPUES
- **Riesgo**: Stock puede cambiar entre validacion y ejecucion en concurrencia
- **Mitigacion**: full_tx RPC usa `FOR UPDATE` que resuelve esto atomicamente

### BAJA SEVERIDAD (5)

**F9: Endpoints caja en PosController no usados por frontend**
- **Ubicacion**: `pos.controller.ts:73-101` — `POST /pos/caja/abrir`, `POST /pos/caja/cerrar`
- **Evidencia**: grep confirma 0 llamadas desde `apps/web/`. Frontend usa CajasController
- **Riesgo**: Codigo muerto que puede confundir; permisos diferentes (`pos.caja.write` vs `cajas.apertura`)

**F10: Sin funcion decrypt para certificados en POS**
- **Ubicacion**: `pos.service.ts:47-63` — `encryptBuffer`, `encryptText` sin decrypt
- **Evidencia**: Write-only encryption. Decrypt debe existir en CpeService
- **Riesgo**: Si CERT_ENCRYPTION_KEY cambia, certificados existentes son irrecuperables

**F11: Inferencia CE demasiado estricta**
- **Ubicacion**: `pos.service.ts:87` — `/^[A-Z0-9]{9}$/i`
- **Evidencia**: CE real peruano puede tener 6-12 caracteres
- **Riesgo**: CE de 10+ chars se clasifica como pasaporte (tipo '7' en vez de '4')
- **Mitigacion**: Override explicito (`tipoExplicito`) bypasea la auto-inferencia

**F12: POST para endpoint read-only**
- **Ubicacion**: `pos.controller.ts:104` — `@Post('detalles-venta/:id')`
- **Evidencia**: Solo lee detalles, deberia ser GET
- **Riesgo**: Violacion de convencion REST

**F13: Sin deteccion de colision idempotency con payload diferente**
- **Ubicacion**: Migration 327, lines 77-106
- **Evidencia**: RPC retorna venta existente sin comparar si el payload es diferente
- **Riesgo**: Bug silencioso si mismo key se reusa accidentalmente para venta diferente

**F14: Error response leakea detalles internos de BD**
- **Ubicacion**: `pos.service.ts:1573-1578`
- **Evidencia**: `detalles: error.details` expone informacion interna de PostgreSQL al cliente
- **Riesgo**: Information disclosure — puede revelar nombres de tablas, constraints, esquema

**F15: Worker query no filtra intentos_facturacion < 5 en BD**
- **Ubicacion**: `pos.service.ts:2091-2097`
- **Evidencia**: Query fetch ALL pending ventas, luego filtra en JS (line 2123)
- **Riesgo**: Con muchas ventas exhausted (>=5 intentos), el worker lee records inutiles
- **Fix propuesto**: Agregar `.lt('intentos_facturacion', 5)` a la query

---

## TODOs PENDIENTES EN CODIGO

### POS (5 marcadores)
- `pos.service.ts:1360` — TAREA 12: Registrar venta como pendiente para reintentos
- `pos.service.ts:1873` — TAREA 12: Registrar venta pendiente facturacion
- `pos.service.ts:1906` — TAREA 12: Reintentar facturacion venta POS
- `pos.service.ts:2038` — TAREA 12: Obtener ventas pendientes facturacion
- `pos.service.ts:2067` — TAREA 12: Procesar ventas pendientes (worker/cron)

### Cajas (6 TODOs)
- `cajas.service.ts:329` — Verificar que supervisor tenga rol SUPERVISOR o ADMIN
- `cajas.service.ts:421` — Extraer IP de request
- `cash-authorization.service.ts:173` — Implementar validacion real con tabla usuarios y hasheado PIN
- `cash-authorization.service.ts:186` — Verificar rol supervisor
- `cash-authorization.service.ts:198` — Validar codigo PIN contra hash almacenado
- `cash-closing.service.ts:486` — Validar que adminId tenga rol ADMIN
- `cash-concurrency.service.ts:150` — Validar que adminId tenga rol ADMIN

---

## TESTS FORENSES AGREGADOS (10)

Todos en `pos.service.spec.ts`:

1. `rechaza venta sin idempotency_key` — Verifica pre-validacion
2. `rechaza venta sin items` — Verifica pre-validacion
3. `rechaza venta sin documento del cliente` — Verifica pre-validacion
4. `rechaza venta sin nombre del cliente` — Verifica pre-validacion
5. `rechaza pagos que no cuadran con el total calculado` — Verifica tolerancia 0.01
6. `acepta pagos mixtos que suman el total correcto` — Verifica pagos mixtos
7. `rechaza pago con monto cero o negativo` — Verifica validacion montos
8. `recalcula totales server-side ignorando valores del cliente` — Verifica anti-manipulacion
9. `retorna venta existente si idempotency_key ya fue usada` — Verifica idempotency
10. `maneja fallback chain: full_tx falla → legacy RPC` — Verifica fallback

**Resultado**: 948/948 tests, 104 suites — TODOS PASAN

---

## RESUMEN EJECUTIVO

| Categoria | Estado |
|---|---|
| Path principal (full_tx RPC) | **FUNCIONA** — atomico, con locks, idempotente |
| Path legacy (fallback) | **FUNCIONA con riesgos** — no atomico, hardcoded IGV |
| Validaciones pre-venta | **FUNCIONA** — 8 checks verificados con tests |
| Pagos mixtos | **FUNCIONA** — tolerancia, zero-check, normalizacion |
| Idempotency | **FUNCIONA** — unique index + RPC check |
| CPE (facturacion) | **FUNCIONA** — async queue + worker retry (5 intentos) |
| Caja sesiones | **FUNCIONA** — unique indexes + auto-cierre huerfanas |
| Auditoria | **FUNCIONA con riesgo** — silencioso si RPC falla |
| Seguridad (guards) | **FUNCIONA** — 16/16 endpoints protegidos |
| RLS | **FUNCIONA** — auto-hardening cubre todas las tablas |
| Frontend-backend | **FUNCIONA** — 9/9 endpoints matchean (caja usa CajasController) |

### Prioridad de Fixes

1. **F1** (ALTA) — Crear DTO con class-validator para procesarVenta
2. **F14** (BAJA) — Redactar error.details en respuesta al cliente
3. **F3** (MEDIA) — Cambiar LIMIT(1000) a SELECT MAX via RPC
4. **F4** (MEDIA) — Usar tasaIgv dinamica en path legacy
5. **F5** (MEDIA) — Agregar alerta/notificacion cuando CxC falla
6. **F7** (MEDIA) — Agregar alerta cuando movimiento caja falla
7. **F15** (BAJA) — Filtrar intentos >= 5 a nivel de query en worker
8. **F2** (ALTA, bajo riesgo real) — Solo activable si full_tx RPC no existe
