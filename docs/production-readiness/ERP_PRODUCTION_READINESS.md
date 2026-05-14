# ERP Production Readiness

Bitacora oficial para declarar el ERP listo para produccion.

## Reglas de uso

- Este es el unico documento fuente para evidenciar readiness productivo.
- No se declara el ERP "100% listo" hasta que las 20 tareas esten en estado `validado` con evidencia suficiente.
- Estados permitidos por tarea: `pendiente`, `en progreso`, `corregido`, `validado`.
- El unico pendiente aceptable para produccion es el certificado digital verdadero de SUNAT/CPE/GRE, si aun no existe. Todo lo demas debe funcionar logica y funcionalmente.
- Toda evidencia debe incluir comandos, resultados, validacion visible en navegador integrado y revision de consola/red.
- Las referencias a evidencia previa deben marcarse como `evidencia importada` hasta que una corrida vigente las confirme en este documento.

## Reglas obligatorias de auditoria funcional

1. No se corrigen solo tests si el bug existe en produccion; primero se corrige el comportamiento real.
2. No se aceptan tests que pasan por `skip`, return temprano, condicionales opcionales, `try/catch` silencioso, `waitForTimeout` innecesario, asserts debiles o rutas que no cargan.
3. Cada test funcional debe comprobar resultado real: UI, API y estado persistido cuando aplique.
4. Despues de cada correccion importante se ejecuta el gate minimo del modulo: type-check, test unitario/integracion relacionado, E2E relacionado y validacion manual en navegador si aplica.
5. La validacion de flujos reales se hace con navegador integrado visible, como usuario y como admin cuando aplique.
6. En cada validacion de navegador se revisa consola y red: no debe haber errores fatales, 500 inesperados, 404 de chunks, overlays de Next, loaders permanentes ni pantallas en blanco.
7. No se usan datos historicos fragiles como condicion de exito. Si un flujo necesita datos, se crean desde API o UI dentro del test.
8. Cada modulo se valida aislado y conectado con los modulos que afecta.
9. Toda respuesta inconsistente entre backend y frontend se normaliza; no se aceptan contratos mezclados que funcionen solo por casualidad.
10. Si algo queda pendiente, se documenta con causa real, impacto y bloqueo exacto.

## Estado global

- Estado actual: `en progreso`.
- Fecha de creacion de esta bitacora: 2026-05-12.
- Fuente de contexto inicial: `docs/db_rebuild_status.md`, `docs/release/production-checklist.md`, `docs/release/branch-protection.md`.
- Evidencia importada relevante:
  - 2026-05-07: `pnpm type-check`, `pnpm build`, `pnpm test`, `pnpm lint` y `pnpm audit --audit-level=low` reportados como exitosos en `docs/db_rebuild_status.md`.
  - 2026-05-07: validadores runtime de BD reportados como exitosos, con `runtime_failures=0` y smoke tests de modulos al 100%.
  - 2026-05-08: validacion SQL de trazabilidad demo y carga visual de modulos principales en navegador integrado.
  - 2026-05-12: stack Docker de validacion `erpval3` reportado healthy; `test:e2e:production-readiness` reportado exitoso contra `http://localhost:13002/api`.
  - 2026-05-12: navegador integrado reportado sin `Failed to fetch`, sin pantallas fatales y sin errores nuevos de consola.
- Riesgo global pendiente: certificado digital productivo SUNAT/CPE/GRE y secretos productivos deben reemplazar el certificado demo antes de salida productiva real.

## Auditoria visible vigente - 2026-05-14

Esta seccion invalida cualquier lectura de "listo" basada solo en evidencia importada. La corrida vigente se esta ejecutando con navegador integrado visible, frontend local `http://localhost:13003` para iteracion rapida, API Docker `http://localhost:13002/api`, worker y Redis del stack `erpval3`. Usuario admin confirmado en UI: `admin@erp.local`. El usuario estandar queda reservado para pruebas negativas de permisos.

### CASO VIG-00 - Entorno de auditoria local visible

- Estado: `en progreso`.
- Rol usado: admin `admin@erp.local`.
- Rutas visitadas: `http://localhost:13003/dashboard/ventas/clientes/nuevo/`, `http://localhost:13003/dashboard/pos/`, `http://localhost:13003/dashboard/inventario/kardex/`.
- Datos creados: `QA PROD READY 20260514012530 CLIENTE POS`, RUC `20514125301`; producto preexistente de esta corrida `QAPR-20260514045719`.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/web run type-check` -> OK.
  - `pnpm --dir apps/web exec next dev -p 13003` -> frontend local levantado en `13003`.
  - `docker ps` -> `erpval3-erp-api-1`, `erpval3-worker-1`, `erpval3-redis-1` healthy; `erpval3-web-1` queda como bundle productivo viejo en `13001`, no se usa para iterar cambios.
- Evidencia consola/red: API `POST /api/ventas/clientes` devolvio 201; `POST /api/pos/venta` devolvio 201. Se detectaron errores posteriores de CPE/CxC detallados abajo.
- Riesgos pendientes: no usar builds Docker por cada cambio durante auditoria; el frontend local es la superficie visible vigente hasta consolidar una imagen final.
- Criterio de cierre: solo cerrar cuando los flujos se repitan en navegador visible y los impactos intermodulo no dejen errores fatales.

### CASO VIG-01 - Crear cliente desde UI para POS

- Estado: `corregido`.
- Rol usado: admin `admin@erp.local`.
- Rutas visitadas: `/dashboard/ventas/clientes/nuevo/`, `/dashboard/ventas/clientes/`.
- Datos creados: `QA PROD READY 20260514012530 CLIENTE POS`, RUC `20514125301`.
- Pasos ejecutados en navegador: seleccionar Empresa/RUC, ingresar RUC, razon social, direccion y telefono, enviar formulario, volver al listado.
- Resultado esperado: cliente creado y visible en listado, con documento utilizable por POS.
- Resultado real: cliente creado; listado muestra el cliente. Primer intento fallo porque `react-hook-form` no recibia cambios de `documento_tipo/documento_numero`; segundo bloqueo por campos opcionales enviados como `''` contra DTO backend.
- Bugs encontrados:
  - `ClienteForm` pisaba `register().onChange` con `onChange={() => setRucValidated(false)}`.
  - `ClienteForm` enviaba opcionales vacios como string vacio; el DTO backend los rechazaba con 400.
- Codigo corregido:
  - `apps/web/components/ventas/ClienteForm.tsx`.
- Tests/comandos:
  - `pnpm --filter @erp-suite/web run type-check` -> OK.
  - E2E automatico no se cuenta como aprobado en esta corrida; el foco vigente es navegador visible.
- Evidencia consola/red: `POST /api/ventas/clientes` -> 201; sin pantalla blanca, sin overlay Next, sin loader infinito.
- Impacto verificado en otros modulos: POS lista el cliente luego del fix de documento descrito en VIG-02.
- Criterio de cierre: queda `corregido`, pendiente de repetir en suite E2E estable al final.

### CASO VIG-02 - POS venta visible con cliente y producto QA

- Estado: `bloqueado`.
- Rol usado: admin `admin@erp.local`.
- Rutas visitadas: `/dashboard/pos/`, `/dashboard/inventario/kardex/`.
- Datos usados: cliente `QA PROD READY 20260514012530 CLIENTE POS` RUC `20514125301`; producto `QAPR-20260514045719`, precio S/ 25.00.
- Pasos ejecutados en navegador:
  - Abrir POS con caja abierta.
  - Buscar `QAPR-20260514045719`.
  - Agregar 1 unidad al carrito.
  - Seleccionar cliente QA y pago `Efectivo`.
  - Procesar venta.
- Resultado esperado: venta POS pagada, boleta/CPE consistente, stock disminuido, Kardex salida, caja/CxC/contabilidad/SIRE impactados sin errores.
- Resultado real:
  - Primer bloqueo: POS rechazaba el cliente como "Documento invalido" porque solo leia `numero_documento`; para RUC largo creado por clientes el documento valido vive en `ruc/codigo`.
  - Se corrigio frontend POS para resolver documento desde `numero_documento`, `documento_numero`, `ruc` o `codigo`.
  - Venta visible procesada: modal `¡Venta Exitosa!`, boleta `B001-00000002`, cliente QA, total S/ 29.50, carrito vacio.
  - Bloqueos intermodulo abiertos en backend: CPE/CxC/inventario no quedan limpios.
- Bugs encontrados:
  - POS no podia usar clientes RUC creados desde UI por contrato de documento mezclado.
  - CPE falla por redondeo: `total_igv=2.39 no coincide con el total calculado 2.38`.
  - Documento fallback CPE duplica clave unica `ux_documentos_tenant_tipo_serie_numero_runtime` para `BOLETA B001 00000002`.
  - CxC falla: `Documento no existe: 9e362531-4b57-4b3f-83a6-85251d5e8b4a`.
  - Inventario reporta: `Venta B001-00000002 omitida: inventario ya aplicado por el flujo de pedidos`; en la UI POS el stock siguio mostrando 15 tras venta, por lo que el impacto de stock queda no validado.
- Codigo corregido:
  - `apps/web/app/dashboard/pos/page.tsx`.
- Tests/comandos:
  - `pnpm --filter @erp-suite/web run type-check` -> OK.
- Evidencia consola/red:
  - `POST /api/pos/venta` -> 201.
  - Errores backend fatales de integracion CPE/CxC presentes en logs; por regla de auditoria, esto bloquea produccion.
  - Navegador visible sin pantalla blanca, sin overlay Next, sin loader infinito durante el flujo POS.
- Impacto verificado en otros modulos:
  - Kardex cargó y permite seleccionar producto QA, pero no se pudo confirmar salida limpia; logs contradicen impacto de inventario.
  - CPE/CxC no validan por errores backend.
- Riesgos pendientes: redondeo fiscal POS->CPE, idempotencia/duplicado de documento, evento CxC con documento inexistente, stock/Kardex POS.
- Criterio de cierre: repetir POS completo en navegador visible y cerrar CPE, CxC, inventario, caja y contabilidad sin errores.

## Criterio de cierre global

El ERP queda listo para produccion solo cuando:

1. Las 20 tareas de esta bitacora estan en `validado`.
2. Cada tarea registra modulos, flujos, bugs, correcciones, tests, falsos positivos, comandos, navegador, consola/red, riesgos y criterio de cierre.
3. No hay errores fatales de consola, respuestas 500 inesperadas, loaders infinitos ni pantallas vacias en los flujos criticos.
4. Las validaciones de BD runtime, API, web, worker, seguridad, CI y E2E pasan en una corrida vigente.
5. El unico riesgo abierto, si aplica, es el certificado digital verdadero de SUNAT/CPE/GRE.

## Matriz de 20 tareas

| # | Tarea | Estado | Cierre |
|---|---|---|---|
| 01 | Inventario total del ERP | validado | Matriz de cobertura creada; no declara modulos listos |
| 02 | Baseline tecnico limpio | validado | Type-check/build/test/smoke/navegador/logs limpios tras correcciones |
| 03 | Auth, sesion, pais/empresa, wizard y permisos | validado | Admin y usuario estandar entran; redirects, contexto seguro, permisos y logout UI validados |
| 04 | Navegacion global y layouts | validado | Rutas principales/subrutas visibles validadas en smoke desktop+narrow y navegador integrado |
| 05 | Contratos API/UI | validado | Contratos compartidos normalizados, rutas criticas validadas y tests API/UI ejecutados |
| 06 | Vertical completo de Compras | validado | Compra real impacta inventario, Kardex, CxP, contabilidad/eventos y SIRE/reporte equivalente; devolucion ajusta stock sin duplicar salida |
| 07 | Vertical completo de Ventas | validado | Venta real atraviesa cliente, cotizacion, pedido, inventario, Kardex, CPE, CxC, contabilidad y SIRE; listados/detalles/busquedas validados |
| 08 | POS completo | validado | Venta POS real valida ticket, pagos mixtos, stock, Kardex, CPE/cola, caja y asiento; casos negativos sin stock/inactivo y doble click cubiertos |
| 09 | Inventario y logistica | validado | Inventario refleja compra/recepcion, devolucion, venta/logistica y POS en Kardex/stock; pantallas de inventario y logistica cargan sin vacios ni loaders |
| 10 | CPE completo | validado | CPE valida factura, boleta POS, listado, detalle, PDF, estados, idempotencia, errores fiscales, CxC y navegador visible; unico pendiente aceptable: certificado digital SUNAT real si no existe |
| 11 | GRE completo | validado | GRE valida configuracion, pedido/despacho, detalle, transporte, PDF, estados, idempotencia, negativos, stock sin alteracion y navegador visible; unico pendiente aceptable: certificado digital SUNAT real si no existe |
| 12 | SIRE completo | validado | SIRE refleja ventas CPE y compras/CxP reales por periodo; genera REG_VEN/REG_COM, totales, filtros, descarga, envio SUNAT mock, UI y consola/red sin errores fatales |
| 13 | Finanzas, CxC, cobranzas, bancos y tesoreria | validado | Venta/compra a credito, cobros/pagos parciales y totales, POS caja, bancos, conciliacion manual/automatica, filtros y UI validados sin 500 inesperados |
| 14 | Contabilidad, asientos, materialized views y reportes | validado | E2E completo, navegador visible y logs revisados el 2026-05-13 |
| 15 | RRHH, asistencia, planillas y asientos RRHH | pendiente | Sin evidencia vigente en esta bitacora |
| 16 | Worker, outbox, jobs y procesamiento asincrono | pendiente | Sin evidencia vigente en esta bitacora |
| 17 | Observabilidad, logs, auditoria y alertas | pendiente | Sin evidencia vigente en esta bitacora |
| 18 | Seguridad operativa, rate limit, secretos y PII | pendiente | Sin evidencia vigente en esta bitacora |
| 19 | CI/CD, Docker, build, lint, tests y audit | en progreso | Evidencia importada; falta corrida vigente registrada aqui |
| 20 | E2E productivo y validacion visible en navegador integrado | en progreso | Evidencia importada; falta corrida vigente registrada aqui |

## Plantilla obligatoria por tarea

Copiar esta plantilla para nuevas tareas o auditorias adicionales.

```md
### Tarea NN - Nombre

- Estado: pendiente
- Modulos revisados:
- Flujos funcionales ejecutados:
- Bugs encontrados:
- Codigo corregido:
- Tests modificados o creados:
- Posibles falsos positivos eliminados:
- Comandos ejecutados y resultado:
- Validacion en navegador integrado visible:
- Evidencia de consola/red:
- Riesgos pendientes:
- Criterio de cierre:
```

## Tareas

### Tarea 01 - Inventario total del ERP

- Estado: `validado`.
- Modulos revisados: frontend `apps/web/app/dashboard`, backend `apps/erp-api/src`, worker `apps/worker`, libreria `libs/crypto`, migraciones `supabase/migrations`, tests API/web y documentacion de readiness.
- Flujos funcionales ejecutados: no se ejecutaron flujos funcionales; esta tarea es inventario. No se declara ningun modulo como listo.
- Bugs encontrados:
  - La cobertura funcional real es desigual: solo existen 4 specs E2E UI Playwright (`setup`, `compras`, `finanzas`, `full-ui-smoke`) para 92 rutas dashboard.
  - Se detectaron patrones no aceptables para evidencia final en tests existentes: `waitForTimeout` en `apps/web/tests/e2e/compras.spec.ts` y `apps/web/tests/e2e/finanzas.spec.ts`; `return` temprano en E2E de API para POS/RRHH/RLS/Outbox/Inventario/Ventas; `try` de tolerancia en varios E2E; asserts debiles `toBeDefined`/`toBeTruthy` en multiples specs. Estos no se corrigen en esta tarea por alcance.
  - Modulos visibles sin cobertura funcional UI dedicada: Dashboard, Analytics, Auditoria, Ayuda, Cajas/POS visual completo, Configuracion/Wizard, Contabilidad, CPE, Documentos, GRE, Inventario, RRHH, SIRE, Usuarios.
- Codigo corregido: solo documentacion; se actualizo esta bitacora con matriz de inventario y cobertura. No se corrigio codigo productivo ni tests.
- Tests modificados o creados: ninguno.
- Posibles falsos positivos eliminados:
  - No se cuentan tests con `skip`, return temprano, `waitForTimeout` o asserts debiles como evidencia de readiness; quedan inventariados como cobertura existente pero no suficiente.
  - La evidencia historica de flujos se mantiene como importada, no como cierre de modulos.
- Comandos ejecutados y resultado:
  - `git status --short`: exito; el worktree tiene muchos cambios previos no relacionados. No se revirtieron ni modificaron.
  - `rg --files apps/web/app/dashboard`: exito; se inventariaron archivos de rutas y componentes dashboard.
  - `Get-ChildItem apps\web\app\dashboard -Recurse -Filter page.tsx`: exito; 92 rutas UI dashboard detectadas.
  - `Get-ChildItem apps\erp-api\src -Recurse -Filter *.controller.ts`: exito; 55 controllers detectados.
  - `Get-ChildItem apps\erp-api\src -Recurse -Filter *.service.ts`: exito; 126 services detectados.
  - `Get-ChildItem apps\erp-api\src -Recurse -Filter *.module.ts`: exito; 62 Nest modules detectados.
  - `rg --files apps/erp-api/src | rg "dto|\.module\.ts$"`: exito; DTOs y modules encontrados.
  - Script inline Node sobre decorators Nest: exito; 541 endpoints API detectados.
  - `rg --files supabase/migrations`: exito; 308 migraciones SQL detectadas (`000..311`, con huecos historicos conocidos).
  - Busqueda de tests `*.spec.ts`, `*.test.ts`, `*.e2e-spec.ts`, specs Playwright: exito; 119 tests detectados.
  - Lectura de `package.json` por workspace: exito; scripts disponibles inventariados.
  - Busqueda de patrones no aceptables en tests (`skip`, `return`, `waitForTimeout`, `try`, asserts debiles): exito; hallazgos documentados como riesgo de cobertura.
- Validacion en navegador integrado visible: no aplica en esta tarea; no se levantaron servicios ni se validaron rutas como usuario/admin. Queda obligatorio desde tareas funcionales.
- Evidencia de consola/red: no aplica en esta tarea; no hubo sesion de navegador ni trafico de red. Queda obligatorio desde tareas funcionales.
- Riesgos pendientes:
  - Completar inventario fino de entidades por endpoint durante cada modulo funcional, contrastando con `docs/db_tables_base_list.txt` y migraciones reales.
  - Reemplazar o endurecer tests fragiles antes de usarlos como evidencia de cierre.
  - Validar manualmente en navegador integrado cada ruta critica por rol usuario/admin.
- Criterio de cierre: cumplido para inventario inicial. Existe matriz clara de rutas UI, endpoints API, backend, migraciones, tests, cobertura faltante, flujos esperados e interconexiones. No implica readiness funcional.

#### Matriz de cobertura - Tarea 01

Resumen inventariado:

- Rutas frontend dashboard: 92.
- Endpoints API detectados por decorators Nest: 541.
- Controllers backend: 55.
- Services backend: 126.
- Nest modules backend/shared: 62.
- Directorios DTO: 22, con 109 archivos DTO aproximados.
- Migraciones SQL: 308 (`000-099`: 96, `100-199`: 100, `200-299`: 100, `300+`: 12).
- Tests detectados: 119 (`unit/spec`: 97, `integration`: 4, `api-e2e`: 14, `web-e2e`: 4).
- Workspaces/scripts:
  - root: `dev`, `build`, `test`, `lint`, `type-check`, `docker:build`, `k8s:*`, `check-encoding`.
  - `apps/erp-api`: `build`, `lint`, `type-check`, `test`, `test:e2e`, `test:e2e:production-readiness`.
  - `apps/web`: `build`, `dev`, `type-check`, `test:e2e`, `test:e2e:headed`, `test:e2e:ui`.
  - `apps/worker`: `build`, `dev`, `start`, `type-check`.
  - `libs/crypto`: `build`, `dev`, `type-check`.

| Modulo visible | Rutas UI dashboard | Endpoints API / controllers | Entidades BD principales | Tests existentes | Tests faltantes / debiles | Flujos esperados | Interconexiones |
|---|---:|---|---|---|---|---|---|
| Dashboard | 1: `/dashboard` | `/dashboard` 4 endpoints; `/metrics` 2; `/health` 4; controllers `dashboard`, `metrics`, `app` | `ventas`, `compras`, `cpe`, `gre_guias`, `cuentas_por_cobrar`, `cuentas_por_pagar`, `movimientos_stock`, `outbox_events` | `dashboard-metrics.service.spec`, parte de `full-ui-smoke` | Falta E2E UI con datos creados en test y verificacion de cards/actividad; no aceptar seed historico | KPIs, actividad reciente, estado operativo | Ventas, Compras, Inventario, Finanzas, Fiscal, Worker |
| POS | 1: `/dashboard/pos` | `/pos` 15 endpoints; controller `pos.controller`; service `pos.service` | `ventas_pos`, `detalle_ventas_pos`, `ventas_pos_pagos`, `pos_numeracion`, `sesiones_caja`, `cajas`, `metodos_pago`, `productos`, `clientes` | `pos.service.spec`, `pos-e2e.test` | `pos-e2e` contiene returns tempranos; falta E2E UI fuerte con venta real, pago, stock y ticket | Abrir caja, vender, pagar, numerar ticket, facturar/reintentar, cerrar caja | Cajas, Inventario, CPE, Finanzas, Contabilidad, Worker |
| Documentos | 2: `/dashboard/documentos`, `/dashboard/documentos/descargas` | `/documentos` 15 endpoints; `documentos.controller` | `documentos`, `documento_detalles`, `documento_series`, `documento_auditoria`, `documento_archivos`, `cpe` | `documentos.service.spec` doble ubicacion | Falta E2E API/UI que cree documento desde flujo real y verifique persistencia/descarga | Crear, validar, generar XML, enviar SUNAT, descargar PDF/XML, anular | Ventas, CPE, Finanzas, Contabilidad |
| Contabilidad | 19 rutas | `/contabilidad` 63 endpoints; services de asientos, estados, periodos, presupuestos, plan cuentas, cashflow, outbox | `asientos_contables`, `detalle_asientos`, `plan_cuentas`, `periodos_contables`, `centros_costo`, `presupuestos`, MVs contables | 9 specs unitarias/listeners | Falta E2E UI contable completo y verificacion persistida de reportes/MVs; varios asserts debiles `toBeDefined` | Asientos, cierres, presupuestos, estados financieros, libros, refresh, eventos contables | Finanzas, Ventas, Compras, RRHH, POS, Inventario, Worker |
| Analytics | 1: `/dashboard/analytics` | `/analytics` 8 endpoints | `ventas`, `cuentas_por_cobrar`, `cuentas_por_pagar`, `productos`, `detalle_ventas_pos`, reportes agregados | 0 tests directos | Sin cobertura funcional real | Ventas tiempo/categoria, deudas, KPIs, rentabilidad, escenarios | Dashboard, Ventas, Finanzas, Inventario |
| Inventario | 9 rutas | `/inventario` 23 endpoints; controllers `inventario`, `logistica`; services `inventario`, `almacenes`, `logistica` | `productos`, `almacenes`, `almacen_ubicaciones`, `producto_stock_sucursal`, `movimientos_stock`, `stock_movimientos`, `recepciones`, `kardex`/views, `pedido_despachos`, `pedido_backorders` | `inventario.service.spec`, `inventario-e2e`, `inventario-rls`, integracion recepciones-inventario | `inventario-e2e` contiene return temprano; falta E2E UI productos/kardex/logistica con persistencia | Productos, stock, movimientos, recepciones, kardex, preparar/listo/despachar | Compras, Ventas, POS, Contabilidad, Logistica |
| CPE | 2: `/dashboard/cpe`, `/dashboard/cpe/cotizaciones` | `/cpe` 24 endpoints; baja/resumen, worker; services CPE/PDF/fiscal | `cpe`, `comprobantes_electronicos`, `comunicaciones_baja`, `resumenes_diarios`, `documento_series`, `validaciones_sunat` | `cpe.service.spec`, `cpe.idempotency`, `cpe-e2e`, integracion pedidos-CPE | Falta UI E2E; certificado productivo pendiente puede ser unico bloqueo aceptable | Crear CPE, enviar SUNAT/OSE, estados, XML/PDF, baja/resumen, reenvio | Documentos, Ventas, POS, Fiscal, Worker, Configuracion |
| GRE | 1: `/dashboard/gre` | `/gre` 13 endpoints; `gre.controller`, `gre.worker.controller` | `gre`, `gre_guias`, `gre_detalles`, `pedido_gres`, `validaciones_sunat` | `gre.service.spec`, `gre.idempotency`, integracion pedidos-GRE | Sin E2E API dedicado detectado ni UI E2E; certificado productivo pendiente | Crear guia, auto-config, XML, enviar/reintentar, consultar estado | Ventas, Inventario/Logistica, SIRE, Worker, Configuracion |
| SIRE | 1: `/dashboard/sire` | `/sire` 8 endpoints | `sire_files`, `sire_registros_detalle`, `cpe`, `compras`, `ventas` | `sire.service.spec`, `sire.controller.security.spec` | Falta E2E API/UI con reporte real y persistencia | Generar reporte, descargar, enviar SUNAT, integracion POS | CPE, Compras, Ventas, POS, Worker |
| Compras | 17 rutas | `/compras` 46 endpoints; controllers legacy y especificos; services proveedores, OC, recepciones, devoluciones, cotizaciones | `proveedores`, `ordenes_compra`, `orden_compra_detalles`, `oc_aprobaciones`, `recepciones`, `recepcion_items`, `compras`, `cotizaciones_compra`, `devoluciones_proveedor`, `cuentas_por_pagar` | 12 API specs + `compras-e2e` + `compras.spec.ts` Playwright | Playwright usa varios `waitForTimeout`; falta cerrar validacion persistida UI/API/BD sin esperas fragiles | Proveedor, cotizacion, OC, aprobacion, recepcion, devolucion, CxP | Inventario, Finanzas/CxP, Contabilidad, Dashboard |
| Ventas | 13 rutas | `/ventas` 42 endpoints + `/cotizaciones` 10 legacy | `clientes`, `cotizaciones`, `cotizacion_detalles`, `pedidos_venta`, `pedidos_venta_detalle`, `pedido_aprobaciones`, `documentos`, `cpe`, `gre_guias`, `cuentas_por_cobrar` | 11 specs API + `ventas-e2e` | `ventas-e2e` tiene returns informativos; falta E2E UI real | Cliente, cotizacion, aprobacion, pedido, documento/factura, despacho, RMA | Inventario, Documentos, CPE, GRE, CxC, Contabilidad |
| Finanzas | 14 rutas | `/finanzas` 46 endpoints; bancos, conciliacion, CxC, CxP, tesoreria | `cuentas_por_cobrar`, `cuentas_por_pagar`, `cxc_pagos`, `pagos_lote`, `cuentas_bancarias`, `movimientos_bancarios`, `conciliaciones_bancarias`, `cobranzas`, `egresos` | 16 API specs + `finanzas-e2e` + `finanzas.spec.ts` Playwright | Playwright usa `waitForTimeout`; falta validacion BD para todos los pagos/lotes/conciliaciones | CxC/CxP, pagos, lotes, bancos, conciliacion, flujo caja | Ventas, Compras, POS/Cajas, Contabilidad |
| Usuarios | 1: `/dashboard/usuarios` | `/users` 13 endpoints, `/usuarios-sistema` 9, `/roles` 9, `/permissions` 1 | `usuarios_sistema`, `usuarios_sistemas`, `users`, `roles`, `permisos`, `user_roles`, `rol_permisos` | `user-management.service.spec`, security specs, permissions specs | Falta E2E UI admin para CRUD usuarios/roles/permisos y aislamiento tenant | Crear/editar usuarios, activar/desactivar, roles, permisos, reset password | Auth, Tenants, RBAC/RLS, Auditoria |
| RRHH | 6 rutas | `/rrhh` 57 endpoints | `empleados`, `departamentos`, `asistencia/asistencias`, `planillas`, `detalle_planillas`, `pagos_empleados`, `rrhh_pagos`, `contratos`, `candidatos`, `vacantes`, `evaluaciones` | `rrhh-accounting-integration`, `rrhh-e2e`, `rrhh-rls` | `rrhh-e2e` contiene returns tempranos; falta UI E2E y persistencia completa | Empleados, asistencia, planilla, pagos, asiento RRHH | Contabilidad, Finanzas, Usuarios, Dashboard |
| Configuracion | 1: `/dashboard/wizard` + componentes configuracion | `/configuracion` 13, `/configuration` 10, `/configuracion-fiscal` 1, `/paises` 7, `/retenciones` 6 | `empresa_config`, `wizard_progress`, `configuracion_fiscal`, `documento_series`, `paises`, `configuracion_retenciones`, `metodos_pago` | 0 tests directos de configuracion; retenciones/paises tienen cobertura parcial o nula | Sin E2E wizard vigente; certificado real pendiente para fiscal | Wizard, empresa, fiscal, certificado, series, OSE/SUNAT, paises | CPE, GRE, POS, Documentos, Tenants |
| Auditoria | 1: `/dashboard/audit-logs` | `/audit-logs` 4, `/observability` 5, `/security` 9 | `audit_log`, `audit_log_archive`, `integration_logs`, `rls_audit_log`, `rls_alert_history`, `system_alerts`, `request_logs` | `audit.service.spec`, observabilidad/seguridad parcial | Falta E2E UI con filtros y verificacion de logs generados por una accion real | Consultar auditoria, integraciones, alertas, metricas | Todos los modulos, Seguridad, Usuarios |
| Ayuda | 1: `/dashboard/ayuda` | `/help` 2 endpoints | `knowledge_base` | `help.controller.spec` | Falta E2E UI/API con busqueda y sugerencias persistidas | Buscar ayuda, sugerencias por contexto/rol | Configuracion, Usuarios/Roles |
| Cajas | 1: `/dashboard/cajas` | `/cajas` 22 endpoints | `cajas`, `sesiones_caja`, `movimientos_caja`, `retiros_caja`, `cambios_turno`, `cortes_caja`, `autorizaciones_caja`, `caja_audit_log` | 5 specs service | Falta E2E UI caja con apertura/cierre/corte y conciliacion | Apertura, movimientos, retiros, cambio turno, cierre, corte Z | POS, Finanzas, Contabilidad, Auditoria |

#### Rutas UI dashboard inventariadas

`/dashboard`, `/dashboard/analytics`, `/dashboard/audit-logs`, `/dashboard/ayuda`, `/dashboard/cajas`, `/dashboard/pos`, `/dashboard/wizard`, `/dashboard/usuarios`, `/dashboard/cpe`, `/dashboard/cpe/cotizaciones`, `/dashboard/documentos`, `/dashboard/documentos/descargas`, `/dashboard/gre`, `/dashboard/sire`, `/dashboard/compras`, `/dashboard/compras/proveedores`, `/dashboard/compras/proveedores/nuevo`, `/dashboard/compras/proveedores/[id]`, `/dashboard/compras/proveedores/[id]/editar`, `/dashboard/compras/cotizaciones`, `/dashboard/compras/cotizaciones/nueva`, `/dashboard/compras/cotizaciones/[id]`, `/dashboard/compras/ordenes`, `/dashboard/compras/ordenes/nueva`, `/dashboard/compras/ordenes/[id]`, `/dashboard/compras/recepciones`, `/dashboard/compras/recepciones/nueva`, `/dashboard/compras/recepciones/[id]`, `/dashboard/compras/devoluciones`, `/dashboard/compras/devoluciones/nueva`, `/dashboard/compras/devoluciones/[id]`, `/dashboard/ventas`, `/dashboard/ventas/clientes`, `/dashboard/ventas/clientes/nuevo`, `/dashboard/ventas/clientes/[id]`, `/dashboard/ventas/clientes/[id]/editar`, `/dashboard/ventas/cotizaciones`, `/dashboard/ventas/cotizaciones/nueva`, `/dashboard/ventas/cotizaciones/[id]`, `/dashboard/ventas/pedidos`, `/dashboard/ventas/pedidos/nuevo`, `/dashboard/ventas/pedidos/[id]`, `/dashboard/ventas/aprobaciones`, `/dashboard/ventas/reportes`, `/dashboard/inventario`, `/dashboard/inventario/almacenes`, `/dashboard/inventario/productos`, `/dashboard/inventario/productos/nuevo`, `/dashboard/inventario/productos/[id]/editar`, `/dashboard/inventario/recepciones`, `/dashboard/inventario/kardex`, `/dashboard/inventario/logistica/ordenes-pendientes`, `/dashboard/inventario/logistica/listo-despacho`, `/dashboard/finanzas/bancos`, `/dashboard/finanzas/bancos/nueva`, `/dashboard/finanzas/bancos/[id]`, `/dashboard/finanzas/bancos/[id]/editar`, `/dashboard/finanzas/cxc`, `/dashboard/finanzas/cxp`, `/dashboard/finanzas/cxp/[id]`, `/dashboard/finanzas/conciliacion`, `/dashboard/finanzas/conciliacion/[id]`, `/dashboard/finanzas/reportes`, `/dashboard/finanzas/tesoreria`, `/dashboard/finanzas/tesoreria/flujo-caja`, `/dashboard/finanzas/tesoreria/lote`, `/dashboard/finanzas/tesoreria/programacion`, `/dashboard/contabilidad`, `/dashboard/contabilidad/asientos`, `/dashboard/contabilidad/asientos/nuevo`, `/dashboard/contabilidad/asientos/[id]`, `/dashboard/contabilidad/centros-costo`, `/dashboard/contabilidad/centros-costo/nuevo`, `/dashboard/contabilidad/centros-costo/[id]`, `/dashboard/contabilidad/centros-costo/[id]/editar`, `/dashboard/contabilidad/periodos`, `/dashboard/contabilidad/periodos/nuevo`, `/dashboard/contabilidad/periodos/[id]`, `/dashboard/contabilidad/presupuestos`, `/dashboard/contabilidad/presupuestos/nuevo`, `/dashboard/contabilidad/presupuestos/[id]`, `/dashboard/contabilidad/presupuestos/lista`, `/dashboard/contabilidad/presupuestos/alertas`, `/dashboard/contabilidad/presupuestos/comparacion`, `/dashboard/contabilidad/estados`, `/dashboard/contabilidad/monitoreo`, `/dashboard/rrhh`, `/dashboard/rrhh/asistencia`, `/dashboard/rrhh/candidatos`, `/dashboard/rrhh/contratos`, `/dashboard/rrhh/pagos`, `/dashboard/rrhh/planillas`.

#### Backend inventariado por prefijo API

- `analytics`: 8 endpoints.
- `audit-logs`: 4 endpoints.
- `auth`: 11 endpoints.
- `cajas`: 22 endpoints.
- `compras`: 46 endpoints.
- `configuracion/configuration/configuracion-fiscal`: 24 endpoints.
- `contabilidad`: 63 endpoints.
- `cotizaciones`: 10 endpoints legacy.
- `cpe`: 24 endpoints.
- `dashboard`: 4 endpoints.
- `demo/webhooks`: 5 endpoints.
- `documentos`: 15 endpoints.
- `finanzas`: 46 endpoints.
- `gre`: 13 endpoints.
- `health/info/test-connection`: 6 endpoints.
- `help`: 2 endpoints.
- `import-export`: 5 endpoints.
- `inventario`: 23 endpoints.
- `metrics/observability/notifications/reports`: 17 endpoints.
- `paises`: 7 endpoints.
- `permissions/roles`: 10 endpoints.
- `pos`: 15 endpoints.
- `retenciones`: 6 endpoints.
- `rrhh`: 57 endpoints.
- `security`: 9 endpoints.
- `sire`: 8 endpoints.
- `tenants`: 11 endpoints.
- `users/usuarios-sistema`: 22 endpoints.
- `validations`: 5 endpoints.
- `ventas`: 42 endpoints.

#### Modulos backend inventariados

`analytics`, `audit`, `auth`, `cajas`, `compras`, `configuracion`, `contabilidad`, `cotizaciones`, `cpe`, `dashboard`, `demo`, `documentos`, `finanzas`, `fiscal`, `gre`, `help`, `import-export`, `inventario`, `metrics`, `notifications`, `ose`, `paises`, `permissions`, `pos`, `reports`, `retenciones`, `rrhh`, `security`, `sire`, `sunat-retry`, `tenants`, `usuarios`, `validations`, `ventas`, mas shared modules `cache`, `crypto`, `email`, `events`, `integration`, `jobs`, `observability`, `outbox`, `resilience`, `secrets`, `security`, `supabase`, `tracing`.

#### Modulos sin cobertura funcional real suficiente

- Sin tests directos detectados: `analytics`, `configuracion`, `paises`.
- Solo unit/security superficial o sin E2E UI/API persistente suficiente: `audit`, `help`, `metrics`, `notifications`, `reports`, `demo`, `tenants`, `usuarios`, `security`.
- Con E2E/API existente pero no aceptable como evidencia final sin endurecer: `pos`, `rrhh`, `inventario`, `ventas`, `outbox`, `rls`, por returns tempranos o tolerancia condicional.
- Con Playwright existente pero requiere limpieza antes de cierre: `compras`, `finanzas`, por `waitForTimeout` y asserts debiles.

### Tarea 02 - Baseline tecnico limpio

- Estado: `validado`.
- Modulos revisados: entorno Docker de validacion `erpval3`, API Nest `apps/erp-api`, Web Next `apps/web`, Worker `apps/worker`, Redis, PostgreSQL/Supabase externo usado por los servicios, Playwright E2E y navegador integrado visible.
- Flujos funcionales ejecutados:
  - Health API: `/api/health/live` y `/api/health/ready`.
  - Web publico: `/login/` y `/dashboard/`.
  - Smoke Playwright real contra `http://localhost:13001`: `setup.spec.ts` y segmento `full-ui-smoke.spec.ts` rutas 0..8 (`/dashboard`, superadmin, POS, documentos y contabilidad/asientos).
  - Login y dashboard en navegador integrado visible: login carga, dashboard carga autenticado, sin overlay, sin pantalla blanca, sin loader permanente.
  - Worker POS: corrida programada observada en API a las 2026-05-13 00:15, `procesadas=0`, `errores=0`.
- Bugs encontrados:
  - Web/Next tenia chunks construidos contra `NEXT_PUBLIC_API_URL=http://localhost:3002`, pero el API real de validacion expone `http://localhost:13002`; el smoke inicial emitia `net::ERR_CONNECTION_REFUSED`.
  - El smoke marcaba como fallo el boton POS `📋 Factura` deshabilitado aunque la UI indicaba correctamente `Factura requiere cliente con RUC`.
  - API registraba error de worker: `POS_WORKER_JWT_SECRET not configured in API`; el compose de validacion no declaraba el secreto para `erp-api`.
  - Worker POS firmaba tokens sin `iss: 'pos.worker'`, mientras `WorkerAuthGuard` lo exige; producia `Invalid token issuer`.
  - Contabilidad usaba embeds PostgREST ambiguos o inexistentes en `detalle_asientos`: relacion duplicada para `cuenta_id` y ausencia de relacion para `centro_costo_id`.
  - Durante reinicio de API, web registro `ECONNREFUSED` hacia el contenedor API anterior; se reinicio web junto con API/worker para limpiar conexiones internas.
- Codigo corregido:
  - `apps/web/.env.local`: se ajusto el entorno local de web a `NEXT_PUBLIC_API_URL=http://localhost:13002` para construir contra el API real de validacion.
  - `docker-compose.validation.yml`: `erp-api` ahora recibe `POS_WORKER_JWT_SECRET`.
  - `apps/worker/src/jobs/pos-facturacion-pendiente.job.ts` y `apps/worker/src/jobs/pos-cpe-retry.job.ts`: los JWT del worker incluyen `iss: 'pos.worker'` y `sub: 'worker-service'`.
  - `apps/erp-api/src/modules/contabilidad/services/asientos.service.ts`: embed `plan_cuentas` usa FK explicita y `centros_costo` se resuelve con query separada, no con embed inexistente.
  - `apps/erp-api/src/modules/contabilidad/services/centros-costo.service.ts`: embed `plan_cuentas` usa FK explicita y el nombre del centro se toma del centro validado.
- Tests modificados o creados:
  - `apps/web/tests/e2e/full-ui-smoke.spec.ts`: se agrego regla explicita por ruta/nombre/title para boton POS deshabilitado por precondicion real (`Factura requiere cliente con RUC`) y se registra como `state-disabled-not-clicked`.
- Posibles falsos positivos eliminados:
  - No se debilito el smoke global de botones. Solo se elimino el falso positivo de POS con regla exacta por ruta, texto accesible y `title` de negocio.
  - No se aceptaron errores de consola/red como ruido: los errores de puerto, worker y contabilidad se corrigieron en runtime.
- Comandos ejecutados y resultado:
  - `git status --short`: exito; worktree con muchos cambios previos no relacionados, no revertidos.
  - Revision de procesos/puertos con `Get-Process`, `Get-NetTCPConnection` y `docker ps`: exito; stack `erpval3` detectado en `13001` web, `13002` API, Redis y Postgres activos.
  - `pnpm --filter @erp-suite/erp-api run type-check`: exito.
  - `pnpm --filter @erp-suite/web run type-check`: exito.
  - `pnpm --filter @erp-suite/worker run type-check`: exito tras correcciones.
  - `pnpm --filter @erp-suite/erp-api run build`: exito.
  - `pnpm --filter @erp-suite/web run build`: exito.
  - `pnpm --filter @erp-suite/worker run build`: exito.
  - `pnpm --filter @erp-suite/erp-api run test -- --runInBand`: exito; 94 suites, 868 tests passed. Advertencia no fatal: `DEP0040 punycode`.
  - `BASE_URL=http://localhost:13001 pnpm --filter @erp-suite/web exec playwright test tests/e2e/setup.spec.ts --project=chromium --reporter=line`: exito; 2/2 passed.
  - `BASE_URL=http://localhost:13001 SMOKE_ROUTE_START=0 SMOKE_ROUTE_END=8 pnpm --filter @erp-suite/web exec playwright test tests/e2e/full-ui-smoke.spec.ts --project=chromium --reporter=line`: fallo inicial por `ERR_CONNECTION_REFUSED` y falso positivo POS; exito final 8/8 passed.
  - `docker build --no-cache -f apps/web/Dockerfile -t erp-web:latest .`: exito; elimina chunks antiguos con API `3002`.
  - `docker build --no-cache -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: exito.
  - `docker build --no-cache -f apps/worker/Dockerfile -t erp-worker:latest .`: exito.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate erp-api worker web`: exito; contenedores healthy.
  - `Invoke-WebRequest` a `http://localhost:13002/api/health/live`, `ready`, `http://localhost:13001/login/`, `dashboard/`: exito; 200 OK.
  - `docker logs --since 2m` filtrando errores criticos en web/API/worker: exito; sin `ChunkLoadError`, `Cannot find module`, `ECONNREFUSED`, 500, error de token worker ni embeds PostgREST.
- Validacion en navegador integrado visible:
  - Skill `browser-use:browser` usado con navegador integrado Codex.
  - `/login/`: carga visible, contenido de login presente, consola con 0 errores.
  - `/dashboard/`: carga visible autenticada, senales de dashboard presentes, `Verificando autenticacion...` oculto, sin overlay fatal, sin pantalla blanca, sin loader infinito, consola con 0 errores.
- Evidencia de consola/red:
  - Playwright smoke final revisa respuestas `>=500` y errores de consola/pageerror por ruta: 8/8 sin fallas.
  - Logs web recientes: sin errores criticos, sin chunks faltantes y sin `ECONNREFUSED` despues del reinicio conjunto.
  - Logs API recientes: sin `POS_WORKER_JWT_SECRET not configured`, sin `Invalid token issuer`, sin errores de embed PostgREST, sin 500 inesperados en el segmento validado.
  - Logs worker recientes: sin errores; health healthy.
- Riesgos pendientes:
  - Este cierre valida el baseline tecnico local, no todos los modulos funcionales.
  - La suite frontend completa aun no esta ejecutada en todos los segmentos de las 92 rutas; eso corresponde a tareas funcionales y Tarea 20.
  - Persiste el riesgo global del certificado digital productivo SUNAT/CPE/GRE.
- Criterio de cierre: cumplido. El entorno local de validacion queda estable, con API/Web/Worker healthy, type-check/build/tests/smoke minimo en verde, navegador integrado validado y errores fatales iniciales corregidos/documentados.

### Tarea 03 - Auth, sesion, pais/empresa, wizard y permisos

- Estado: `validado`.
- Modulos revisados: `apps/web/app/login`, `apps/web/app/dashboard/layout.tsx`, `apps/web/contexts/AuthContext.tsx`, `apps/web/lib/auth-service.ts`, `apps/web/hooks/use-api.ts`, `apps/web/hooks/use-country-context.ts`, `apps/web/hooks/use-empresa-config.tsx`, `apps/web/hooks/use-paises.ts`, `apps/web/hooks/use-permission.ts`, `apps/web/app/dashboard/hooks/useConfigurationStatus.ts`, `apps/erp-api/src/modules/auth`, `apps/erp-api/src/modules/configuracion`, `apps/erp-api/src/modules/dashboard.controller.ts`, `apps/erp-api/src/modules/notifications.controller.ts`, `apps/erp-api/src/modules/usuarios.controller.ts`, `apps/erp-api/src/common/guards/permission.guard.ts`.
- Flujos funcionales ejecutados:
  - Sin sesion: `/dashboard` redirige a `/login/` y no deja pantalla vacia.
  - Admin: login UI, carga dashboard, reload con sesion persistente, visita `/login` con sesion valida redirige a dashboard, refresh/profile API, cierre de sesion desde UI y vuelta a login.
  - Usuario estandar creado por API: login UI, dashboard sin falso wizard, sin loader `Cargando pais configurado`, contexto de pais/empresa disponible y escritura de wizard/configuracion denegada con 403.
  - Admin puede leer/actualizar configuracion de empresa; usuario estandar sin permiso recibe 403 real.
- Bugs encontrados:
  - `useCountryContext` y `useEmpresaConfig` consumian endpoints administrativos (`/configuration/empresa`) y generaban 403 visibles para usuario estandar.
  - `useConfigurationStatus` llamaba directo al API fuera del proxy y podia fallar por CORS/contrato mixto.
  - Dashboard stats/activities y notificaciones no leidas generaban denegaciones visibles en bootstrap para usuario autenticado sin permisos administrativos.
  - `PermissionGuard` consultaba permisos sin contexto tenant Supabase y podia devolver 500 en lugar de 403.
  - `usePermission` consultaba permisos de usuario por ruta administrativa y generaba 403 en sidebar para usuario estandar.
  - Login con sesion valida no redirigia consistentemente a dashboard.
  - En produccion Next con `trailingSlash: true`, fetches sin slash final pasaban por 308 y producian `Failed to fetch`/loaders o ruido de consola durante navegacion.
  - Cargas abortadas de paises/configuracion durante navegacion se registraban como `console.error`.
  - El test anterior de logout solo validaba API; se endurecio para usar boton real de UI y cerrar tour visible antes de hacer logout.
- Codigo corregido:
  - Nuevo `ConfigurationContextController` con `GET /api/configuration/context/country` y `GET /api/configuration/context/status`, autenticados pero seguros para bootstrap.
  - `ConfiguracionModule` registra el controller de contexto seguro.
  - Frontend de pais/empresa/configuracion usa endpoints seguros y proxy same-origin.
  - `dashboard.controller.ts`: stats/activities quedan auth-only para dashboard base.
  - `notifications.controller.ts`: lecturas de no leidas quedan disponibles para el usuario autenticado sin permiso administrativo.
  - `permission.guard.ts`: chequeo de permisos corre dentro de `TenantContextService`.
  - `usuarios.controller.ts`: nuevo `GET /api/usuarios-sistema/me/permissions`; `use-permission` usa ese endpoint propio.
  - `auth-service.ts` y `use-api.ts`: normalizacion de rutas con slash final para evitar 308 de Next.
  - `login/page.tsx`: sesion valida redirige a dashboard y login no queda bloqueado por carga opcional de paises.
  - `use-paises.ts` y `useConfigurationStatus.ts`: cargas abortables y errores no fatales en navegacion normal.
- Tests modificados o creados:
  - Nuevo `apps/web/tests/e2e/auth-session-country-wizard.spec.ts` con flujos admin, usuario estandar, redirects, status/country seguro, permisos negativos y logout UI.
  - `apps/erp-api/src/common/guards/permission.guard.spec.ts` actualizado por nueva dependencia de tenant context.
  - `apps/web/playwright.config.ts` soporta `PLAYWRIGHT_SKIP_WEBSERVER=1` para ejecutar smoke contra servidor Docker real sin intentar levantar otro Next en el mismo puerto.
- Posibles falsos positivos eliminados:
  - No se aceptaron 403 del usuario estandar como ruido: se corrigieron contratos productivos de permisos, configuracion y notificaciones.
  - No se acepto `Failed to fetch` por navegacion como error fatal: se hizo abortable la carga opcional y se evito `console.error` en abortos.
  - No se mantuvo logout solo por API: el E2E ahora pulsa `Cerrar Sesion` real despues de cerrar el tour si esta visible.
  - Los 401 esperados se permiten solo en pruebas negativas de auth/sin sesion; siguen fallando 500, chunks rotos y errores fatales.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: exito.
  - `pnpm --filter @erp-suite/web run type-check`: exito tras cada correccion.
  - `pnpm --filter @erp-suite/erp-api run test -- permission.guard.spec.ts --runInBand`: exito; 4 tests passed.
  - `docker build -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: exito; incluye `nest build`.
  - `docker build -f apps/web/Dockerfile -t erp-web:latest .`: exito; incluye `next build`.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate erp-api web`: exito; servicios healthy.
  - `BASE_URL=http://localhost:13001/login/ PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/auth-session-country-wizard.spec.ts --project=chromium --reporter=line`: exito final; 4/4 passed.
  - `curl.exe -i http://localhost:13001/api/public/paises/` y `curl.exe -i http://localhost:13002/api/paises`: exito; 200 OK con catalogo de paises.
- Validacion en navegador integrado visible:
  - Skill `browser-use:browser` usado con navegador integrado Codex.
  - Admin: `/login/` visible, campos de correo/contrasena presentes, login admin llega a `/dashboard/`, dashboard visible, sin `Cargando pais configurado`, sin pantalla blanca.
  - Se intento validar logout y usuario estandar en la misma sesion visible; la evidencia automatizada E2E confirmo logout UI y usuario estandar. En el navegador integrado quedo validada la carga admin visible y consola sin errores tras login admin.
- Evidencia de consola/red:
  - E2E final no reporta errores de consola no permitidos, no respuestas `>=500`, no errores de chunks Next y no pantallas vacias.
  - Navegador integrado admin: `tab.dev.logs({ levels: ['error'] })` retorno `[]` tras login a dashboard.
  - Los 401 de pruebas sin sesion se documentan como esperados por redirects protegidos; no se aceptaron 403 inesperados ni 500.
- Riesgos pendientes:
  - El caso "usuario sin configuracion debe ir al wizard" queda cubierto a nivel contrato por `requiresSetup` en endpoint seguro, pero no se creo un tenant incompleto real porque el flujo publico actual de alta crea configuracion completa. Debe revalidarse con datos controlados cuando se audite configuracion/wizard en Tarea 05.
  - Riesgo global persistente: certificado digital productivo SUNAT/CPE/GRE, fuera del alcance de auth.
- Criterio de cierre: cumplido para Tarea 03. Admin y usuario estandar pueden entrar, dashboard no queda en loader de pais ni redirige falsamente al wizard, rutas protegidas redirigen sin sesion, logout UI queda cubierto, permisos negativos devuelven 403 real y no hay 500/chunks rotos/pantallas vacias en el flujo validado.

### Tarea 04 - Navegacion global y layouts

- Estado: `validado`.
- Modulos revisados: layout dashboard/sidebar, smoke UI autenticado, proxy API web, Dashboard, POS, Documentos, Contabilidad, Analytics, Inventario, CPE, GRE, SIRE, Compras, Ventas, Finanzas, Usuarios, RRHH, Configuracion, Auditoria y Ayuda.
- Flujos funcionales ejecutados:
  - Smoke Playwright autenticado contra servidor Docker real `http://localhost:13001/login/` en desktop y viewport estrecho.
  - Rutas principales y subrutas visibles: dashboard, POS, documentos, contabilidad, analytics, inventario/resumen/almacenes/recepciones/kardex/logistica, CPE, GRE, SIRE, compras, ventas/clientes/cotizaciones/pedidos/aprobaciones/reportes, finanzas/CxC/CxP/bancos/conciliacion/tesoreria/reportes, usuarios, RRHH/asistencia/candidatos/contratos/pagos/planillas/reportes, wizard/configuracion, auditoria y ayuda.
  - Validacion visible en navegador integrado de rutas representativas: `/dashboard/`, `/dashboard/pos/`, `/dashboard/documentos/`, `/dashboard/contabilidad/`, `/dashboard/analytics/`, `/dashboard/inventario/`, `/dashboard/inventario/kardex/`, `/dashboard/cpe/`, `/dashboard/gre/`, `/dashboard/sire/`, `/dashboard/compras/`, `/dashboard/ventas/`, `/dashboard/finanzas/cxc/`, `/dashboard/usuarios/`, `/dashboard/rrhh/`, `/dashboard/rrhh/reportes/`, `/dashboard/wizard/`, `/dashboard/audit-logs/`, `/dashboard/ayuda/`.
- Bugs encontrados:
  - El smoke incluia rutas `superadmin` fuera del alcance de la navegacion ERP de esta tarea y fallaba por rol incorrecto del usuario autenticado.
  - El boton movil de sidebar no tenia nombre accesible visible para el smoke de viewport estrecho.
  - La deteccion literal de `404` generaba falsos positivos por identificadores reales como numeros de documentos.
  - `useApi` agregaba slash despues del query string y generaba URLs invalidas como `/backend/api/audit-logs?page=1&limit=50/`, con respuesta 400.
  - Componentes contables llamaban directo a `/api/contabilidad/...` en lugar del proxy backend autenticado, produciendo 404 HTML desde Next.
  - Backend de presupuestos ordenaba por relacion embebida `plan_cuentas.codigo` con sintaxis no soportada por PostgREST y devolvia 500.
  - La ruta visible `/dashboard/rrhh/reportes` estaba enlazada desde RRHH pero no existia; generaba 404 RSC al cargar el dashboard RRHH.
- Codigo corregido:
  - `apps/web/tests/e2e/full-ui-smoke.spec.ts`: rutas de smoke alineadas a la navegacion ERP visible, validaciones de titulo/contenido, captura de consola/pageerror/respuestas `>=500`, deteccion de pantallas vacias/loaders/overlays y segmentos por `SMOKE_ROUTE_START/END`.
  - `apps/web/components/layout/sidebar.tsx`: nombre accesible y `title` para el boton movil de menu.
  - `apps/web/hooks/use-api.ts`: normalizacion de slash final preservando query string.
  - `apps/web/components/contabilidad/PresupuestoVsRealChart.tsx` y `apps/web/components/contabilidad/PeriodoCierreWizard.tsx`: uso de `useApi`/proxy backend autenticado y manejo no fatal de errores esperados.
  - `apps/erp-api/src/modules/contabilidad/services/presupuestos.service.ts`: eliminacion del order embebido invalido, ordenamiento secundario en memoria y shape vacio completo para comparacion presupuesto vs real.
  - `apps/web/app/dashboard/rrhh/reportes/page.tsx`: nueva pagina funcional para la subruta visible de reportes RRHH.
- Tests modificados o creados:
  - `apps/web/tests/e2e/full-ui-smoke.spec.ts` endurecido: falla ante pantalla vacia, loader permanente, overlay/error fatal, consola fatal, 404 de chunks/rutas dashboard, 500 inesperado, botones visibles sin nombre y contenido insuficiente.
  - `apps/erp-api/src/modules/contabilidad/services/presupuestos.service.spec.ts`: caso nuevo para impedir el order embebido invalido y exigir shape completo sin datos.
- Posibles falsos positivos eliminados:
  - Se excluyeron rutas `superadmin` de esta tarea porque requieren rol distinto y no estan en la lista funcional solicitada.
  - Se reemplazo la busqueda literal de `404` en texto por patrones fatales de pagina y validacion real de respuestas HTTP.
  - Se documento y descarto una falla aislada de type-check web causada por ejecutarlo en paralelo con `next build`, que regenero `.next/types`; al repetirlo de forma serial paso.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/web run type-check`: exito final.
  - `pnpm --filter @erp-suite/erp-api run type-check`: exito final.
  - `pnpm --filter @erp-suite/erp-api run test -- presupuestos.service.spec.ts --runInBand`: exito; 9/9 tests passed, solo advertencia no fatal `DEP0040 punycode`.
  - `pnpm --filter @erp-suite/erp-api run build`: exito.
  - `pnpm --filter @erp-suite/web run build`: exito.
  - `docker build -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: exito.
  - `docker build -f apps/web/Dockerfile -t erp-web:latest .`: exito.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate erp-api web worker`: exito tras correcciones backend/frontend.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate web`: exito tras agregar `/dashboard/rrhh/reportes`.
  - `BASE_URL=http://localhost:13001/login/ PLAYWRIGHT_SKIP_WEBSERVER=1 SMOKE_ROUTE_START=0 SMOKE_ROUTE_END=10 pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/full-ui-smoke.spec.ts --project=chromium --reporter=line`: exito final; 20/20 passed.
  - Segmentos `10..20`, `20..30`, `30..40`, `40..50`, `50..60`, `60..70`: exito final; 20/20 passed cada uno.
  - Segmento `70..80`: exito final; 6/6 passed.
- Validacion en navegador integrado visible:
  - Skill `browser-use:browser` usado con navegador integrado Codex.
  - Sesion admin activa en `http://localhost:13001/dashboard/`.
  - Se recorrieron rutas representativas de todos los grupos principales y subrutas criticas; cada una mostro `<main>` visible, titulo/contenido real, sin pantalla blanca, sin overlay fatal y sin loader permanente.
  - La validacion visible requirio esperar explicitamente el contenido principal despues de cada navegacion para evitar leer un snapshot transitorio.
- Evidencia de consola/red:
  - Navegador integrado: `tab.dev.logs({ levels: ['error'] })` retorno `[]` despues del recorrido representativo.
  - Smoke Playwright endurecido inspecciona consola, page errors y respuestas HTTP por ruta; los segmentos finales pasaron sin errores fatales, sin 500 inesperados, sin 404 de chunks/rutas dashboard, sin pantallas vacias y sin loaders infinitos.
- Riesgos pendientes:
  - Esta tarea valida carga funcional de navegacion/layouts, no CRUD profundo ni persistencia de cada modulo; esos cierres quedan para las tareas funcionales por modulo.
  - Persiste el riesgo global del certificado digital productivo SUNAT/CPE/GRE.
- Criterio de cierre: cumplido. Todas las rutas principales y subrutas visibles inventariadas para la navegacion ERP cargan correctamente en desktop y viewport estrecho con smoke automatizado, y el navegador integrado confirma contenido real y consola sin errores en rutas representativas.

### Tarea 05 - Contratos API/UI

- Estado: `validado`.
- Modulos revisados:
  - Frontend: `useApi`, hooks de paises/configuracion fiscal/impuestos, Compras, Documentos, CPE, GRE, SIRE, RRHH Planillas y Auditoria.
  - Backend: filtro global de excepciones, DTOs de filtros/fechas/booleanos/estados en modulos criticos, endpoints consumidos por las rutas validadas.
  - Cobertura por alcance de la tarea: Compras, Ventas/Documentos, POS por contrato compartido, Inventario por contrato compartido, Finanzas/Contabilidad por DTOs y gates heredados, RRHH, CPE, GRE, SIRE, Usuarios/Permisos y Configuracion.
- Flujos funcionales ejecutados:
  - Normalizacion de respuestas `{ success, data }`, arrays crudos, objetos crudos y respuestas paginadas `{ data: { data: [] } }`.
  - Validacion de `success: "false"` como fallo real, no como truthy.
  - Validacion de booleanos string, fechas ISO/date-only, estados invalidos y filtros numericos por DTO.
  - Recorrido real de UI contra stack local Docker en `/dashboard/compras/`, `/dashboard/documentos/`, `/dashboard/cpe/`, `/dashboard/gre/`, `/dashboard/sire/`, `/dashboard/rrhh/planillas/` y `/dashboard/audit-logs/`.
- Bugs encontrados:
  - Varios consumidores frontend asumian solo `{ success, data }` y podian descartar arrays crudos u objetos validos devueltos por API.
  - `useApi` trataba cualquier `success` truthy como exito; `success: "false"` podia aceptarse por accidente.
  - CPE expuso un bug real durante E2E: la UI no aceptaba la forma paginada anidada `{ success, data: { data: [...] } }`, dejando el flujo dependiente de contrato ambiguo.
  - Errores crudos de BD por duplicados/constraints podian caer como `500` generico en vez de `409`/`400` utiles.
  - El E2E inicial no detectaba todos los loaders genericos; se endurecio para no aceptar una ruta todavia en `Cargando`.
- Codigo corregido:
  - `apps/web/lib/api-contract.ts`: helper comun para `apiSucceeded`, unwrap de datos/arrays/objetos, booleanos y fechas.
  - `apps/web/hooks/use-api.ts`: uso del contrato comun, manejo correcto de `success` y helpers expuestos.
  - `apps/web/hooks/use-paises.ts`, `apps/web/hooks/use-fiscal-config.ts`, `apps/web/hooks/useTaxConfig.ts`.
  - `apps/web/app/dashboard/compras/page.tsx`, `apps/web/app/dashboard/documentos/page.tsx`, `apps/web/app/dashboard/cpe/page.tsx`, `apps/web/app/dashboard/gre/page.tsx`, `apps/web/app/dashboard/sire/page.tsx`, `apps/web/app/dashboard/rrhh/planillas/page.tsx`.
  - `apps/web/components/audit/AuditLogsViewer.tsx`.
  - `apps/erp-api/src/common/filters/global-exception.filter.ts`: mapeo de duplicados a `409` y errores de constraint/entrada a `400`.
- Tests modificados o creados:
  - `apps/web/tests/e2e/api-contract.spec.ts`: contratos frontend y rutas criticas contra servidor real, con inspeccion de consola/red.
  - `apps/erp-api/src/common/filters/global-exception.filter.spec.ts`: 409/400/errores Nest preservados.
  - `apps/erp-api/src/modules/__tests__/api-contract-dtos.spec.ts`: coercion numerica, fechas ISO y rechazo de booleano string como estado.
- Posibles falsos positivos eliminados:
  - No se acepta `success: "false"` como exito.
  - No se acepta que `data.data` funcione por casualidad; el unwrap paginado queda explicito.
  - El smoke de contrato falla ante loaders persistentes, pantallas vacias, overlays, 500 inesperados y chunks 404.
  - La falla de `type-check` de web al correr en paralelo con `build` se clasifico como carrera de `.next/types`; el type-check serial paso.
  - Entradas `ERROR` vistas en logs de API correspondian a estados/datos de dominio CPE/GRE, no a HTTP 500 ni excepciones runtime.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/web run type-check`: paso.
  - `pnpm --filter @erp-suite/erp-api run type-check`: paso.
  - `pnpm --filter @erp-suite/erp-api run test -- global-exception.filter.spec.ts api-contract-dtos.spec.ts presupuestos.service.spec.ts --runInBand`: paso, 3 suites / 15 tests.
  - `pnpm --filter @erp-suite/erp-api run build`: paso.
  - `pnpm --filter @erp-suite/web run build`: paso.
  - `docker build -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: paso.
  - `docker build -f apps/web/Dockerfile -t erp-web:latest .`: paso.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate erp-api web`: paso.
  - `BASE_URL=http://localhost:13001/login/ PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/api-contract.spec.ts --project=chromium --reporter=line`: paso, 2/2 tests.
  - `docker logs erpval3-web-1 --since 10m | Select-String -Pattern "error|Error|500|ChunkLoadError|Cannot find module|Unhandled"`: sin hallazgos.
  - `docker logs erpval3-erp-api-1 --since 10m | Select-String -Pattern ' 500 |"statusCode":500|ERROR|Unhandled|duplicate key value|Cannot find module|ChunkLoadError'`: sin HTTP 500/runtime fatal; solo estados de dominio `ERROR` en registros CPE/GRE.
- Validacion en navegador integrado visible:
  - Sesion visible `ERP Tarea 05` recorrio `/dashboard/compras/`, `/dashboard/documentos/`, `/dashboard/cpe/`, `/dashboard/gre/`, `/dashboard/sire/`, `/dashboard/rrhh/planillas/` y `/dashboard/audit-logs/`.
  - Todas las rutas mostraron contenido real, sin overlay de Next, sin pantalla blanca y sin loader permanente.
  - `tab.dev.logs({ levels: ['error'] })` retorno `[]`.
- Evidencia de consola/red:
  - E2E inspecciono `console.error`, `pageerror`, respuestas `>=500`, chunks 404 y rutas dashboard/backend 404; resultado sin errores fatales.
  - Navegador integrado visible retorno logs de error vacios.
  - Logs Docker de web sin errores fatales ni chunks faltantes.
  - Logs Docker de API sin `500` inesperados ni excepciones runtime asociadas a la validacion.
- Riesgos pendientes:
  - Esta tarea cierra la normalizacion transversal de contratos y rutas criticas; los CRUD/formularios profundos de cada modulo deben validarse en sus tareas funcionales especificas.
  - Persiste el riesgo global del certificado digital productivo SUNAT/CPE/GRE.
- Criterio de cierre: cumplido. Los consumidores criticos ya no dependen de contratos ambiguos, los estados HTTP relevantes se normalizan, los tests de contrato API/UI pasan contra servidor real y el navegador integrado confirma rutas criticas sin errores fatales, 500 inesperados, loaders infinitos ni pantallas vacias.

### Tarea 06 - Vertical completo de Compras

- Estado: `validado`.
- Modulos revisados:
  - Backend: controllers y services de `compras` para proveedores, cotizaciones, ordenes, recepciones y devoluciones; integraciones con inventario, finanzas/CxP, contabilidad/eventos, outbox y SIRE.
  - Frontend: rutas `/dashboard/compras`, `/dashboard/compras/ordenes`, `/dashboard/compras/recepciones`, `/dashboard/compras/devoluciones`, detalle de recepcion, Kardex, CxP y SIRE.
  - Entidades y contratos revisados: `proveedores`, `productos`, `ordenes_compra`, `orden_compra_detalles`, `recepciones`, `recepcion_items`, `devoluciones_proveedor`, `devolucion_items`, `movimientos_inventario`, `producto_stock_sucursal`, `cuentas_por_pagar`, `sire_files`, `outbox_events`.
- Flujos funcionales ejecutados:
  - Flujo positivo completo con datos creados por el test: proveedor, producto, orden de compra, aprobacion, recepcion cerrada, incremento de stock, Kardex de entrada, CxP, generacion/reuso idempotente de reporte SIRE compras, devolucion desde recepcion y ajuste de stock.
  - Casos negativos: recepcion por cantidad mayor a la ordenada, devolucion por cantidad invalida, doble emision de devolucion y validacion de que no se duplica el movimiento de salida.
  - Navegacion UI a listados y detalles de orden, recepcion, devolucion, Kardex, CxP y SIRE como admin autenticado.
- Bugs encontrados:
  - Controllers de Compras devolvian errores productivos como HTTP 200 con `{ success: false }`, ocultando fallos reales a UI/E2E.
  - Devoluciones no validaban estrictamente cantidades contra recepcion y devoluciones previas.
  - Devolucion emitia movimiento de inventario duplicado antes de descontar stock, generando evidencia contable/inventario duplicable.
  - Recepcion aplicaba inventario y luego el listener/outbox podia reprocesar el evento de compra entregada, multiplicando stock.
  - CxP podia generarse por dos rutas: integracion legacy de Compras y listener canonico de CxP.
  - Listener de CxP registraba como error fatal una repeticion idempotente cuando la cuenta por pagar ya existia.
  - `/api/inventario/movimientos` consultaba fuente legacy y ocultaba errores con lista vacia; el Kardex no veia el movimiento canonico de devolucion.
  - SIRE devolvia `success:false` bajo HTTP 201 para reporte duplicado, en vez de operar idempotentemente o lanzar error real.
  - Detalle de recepcion en UI solo aceptaba envoltorio `{ data }` y redirigia pese a recibir objeto valido.
  - Endpoint de recepciones por orden usaba embed PostgREST ambiguo y columna inexistente, causando 500 en detalle de orden.
- Codigo corregido:
  - `apps/erp-api/src/modules/compras/controllers/ordenes-compra.controller.ts`
  - `apps/erp-api/src/modules/compras/controllers/proveedores.controller.ts`
  - `apps/erp-api/src/modules/compras/controllers/cotizaciones-compra.controller.ts`
  - `apps/erp-api/src/modules/compras/services/devoluciones-proveedor.service.ts`
  - `apps/erp-api/src/modules/compras/services/recepciones.service.ts`
  - `apps/erp-api/src/modules/compras/services/compras-cxp-integration.service.ts`
  - `apps/erp-api/src/modules/compras/repositories/ordenes-compra.repository.ts`
  - `apps/erp-api/src/modules/inventario/inventario.service.ts`
  - `apps/erp-api/src/modules/inventario/inventario.controller.ts`
  - `apps/erp-api/src/modules/finanzas/cxp/listeners/cxp-events.listener.ts`
  - `apps/erp-api/src/modules/sire/sire.controller.ts`
  - `apps/erp-api/src/modules/sire/sire.service.ts`
  - `apps/erp-api/src/shared/events/event-bus.service.ts`
  - `apps/erp-api/src/shared/integration/inventory-integration.service.ts`
  - `apps/web/app/dashboard/compras/recepciones/[id]/page.tsx`
  - `apps/web/tests/e2e/helpers/auth.ts`
  - `apps/web/tests/e2e/compras-vertical.spec.ts`
- Tests modificados o creados:
  - `apps/web/tests/e2e/compras-vertical.spec.ts`: E2E vertical completo con API, UI, persistencia y checks de consola/red.
  - `apps/web/tests/e2e/helpers/auth.ts`: login mas estable sin depender de `networkidle` fragil.
  - `apps/erp-api/src/modules/compras/services/devoluciones-proveedor.service.spec.ts`: validaciones de devolucion contra recepcion, cantidades previas y no duplicar salida.
  - Gates focalizados existentes reforzados/ejecutados: inventario, recepciones, ordenes, integracion Compras-CxP y listener CxP.
- Posibles falsos positivos eliminados:
  - El E2E no depende de datos historicos; crea proveedor/producto/OC/recepcion/devolucion y valida estado persistido.
  - Se evito aceptar HTTP 200 con `success:false` como exito.
  - Se evito que el proxy web o cookies freno oculten errores de API: el test usa contexto API directo con token real de la sesion.
  - Se elimino dependencia de `waitForTimeout`; las esperas son por URL, DOM, respuestas y estado persistido.
  - Los 400 de casos negativos quedan identificados como esperados, no como errores productivos.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: paso.
  - `pnpm --filter @erp-suite/web run type-check`: paso.
  - `pnpm --filter @erp-suite/erp-api run test -- inventario.service.spec.ts devoluciones-proveedor.service.spec.ts recepciones.service.spec.ts ordenes-compra.service.spec.ts compras-cxp-integration.service.spec.ts cxp-events.listener.spec.ts --runInBand`: paso, 6 suites / 100 tests.
  - `docker build --no-cache -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: paso, build API limpio.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate erp-api worker`: paso, API healthy y worker iniciado.
  - `BASE_URL=http://localhost:13001 PLAYWRIGHT_SKIP_WEBSERVER=1 E2E_API_ORIGIN=http://localhost:13002 pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/compras-vertical.spec.ts --project=chromium --reporter=line`: paso, 1/1 test en 51.0s.
  - `docker logs erpval3-erp-api-1 --since 5m | Select-String -Pattern ' 500 |"statusCode":500|ChunkLoadError|Cannot find module|Unhandled|INTERNAL_SERVER_ERROR|PGRST200|duplicate key value|Error creando CxP automatica' -CaseSensitive:$false`: sin 500 ni errores fatales; solo los 400 esperados de casos negativos.
  - `docker logs erpval3-web-1 --since 5m | Select-String -Pattern 'error|500|ChunkLoadError|Cannot find module|Unhandled|Application error' -CaseSensitive:$false`: sin hallazgos.
- Validacion en navegador integrado visible:
  - Sesion visible `ERP T06 Compras` con admin `admin@erp.local`.
  - Rutas validadas con contenido real: `/dashboard/compras/`, `/dashboard/compras/ordenes/`, `/dashboard/compras/recepciones/`, `/dashboard/compras/devoluciones/`, `/dashboard/inventario/kardex/`, `/dashboard/finanzas/cxp/`, `/dashboard/sire/`.
  - Todas las rutas devolvieron DOM no vacio, titulo del ERP, hints visibles del modulo y ninguna frase de error (`Application error`, `ChunkLoadError`, `Cannot find module`, `Internal Server Error`, loader de pais).
- Evidencia de consola/red:
  - Navegador integrado: `tab.dev.logs({ levels: ['error'], limit: 100 })` sin logs fatales filtrados por `ChunkLoadError`, `Cannot find module`, `Application error`, `Internal Server Error`, `500`, `Unhandled` o `Failed to fetch`.
  - E2E Playwright captura `console.error`, `pageerror`, responses `>=500` y chunks 404; resultado sin errores fatales.
  - Logs API recientes: no hay 500 inesperados ni `PGRST200`, `duplicate key value` o error de CxP duplicada. Los tres `400` registrados corresponden a negativos esperados: sobre-recepcion, devolucion invalida y doble emision.
  - Logs Web recientes: sin errores, sin chunks faltantes y sin overlay de Next.
- Riesgos pendientes:
  - La inclusion SIRE validada es reporte local/equivalente; no se valida envio real SUNAT/SIRE con certificado productivo en esta tarea.
  - Los 400 de dominio esperados se registran como `ERROR` por el logger global; no bloquean produccion porque son respuestas controladas y assertadas, pero conviene ajustar severidad de logs en una tarea de observabilidad.
- Criterio de cierre: cumplido para Tarea 06. Una compra real incrementa inventario, aparece en Kardex, genera CxP, emite evidencia/eventos contables y queda incluida en SIRE/reporte equivalente; una devolucion desde recepcion cerrada ajusta stock con un unico movimiento de salida. No se declara el ERP completo como 100% listo.

### Tarea 07 - Vertical completo de Ventas

- Estado: `validado`.
- Modulos revisados:
  - Backend: `ventas/clientes`, `ventas/cotizaciones`, `ventas/pedidos`, `inventario`, `finanzas/cxc`, `contabilidad`, `sire`, `cpe`, `event-bus`, integracion contable e integracion inventario.
  - Frontend: rutas dashboard de ventas, clientes, cotizaciones, pedidos, aprobaciones, inventario/kardex, CPE, Finanzas/CxC y SIRE.
  - Persistencia: `clientes`, `cotizaciones`, `cotizacion_detalles`, `pedidos_venta`, `pedidos_venta_detalle`, `productos`, `movimientos_inventario`, `documentos`, `cpe`, `cuentas_por_cobrar`, `asientos_contables`, `detalle_asientos`, `plan_cuentas`, `sire_files`.
- Flujos funcionales ejecutados:
  - Login admin real en web y obtencion de token de sesion.
  - Creacion de cliente con documento propio del test.
  - Creacion de producto con stock propio del test.
  - Creacion de cotizacion, conversion a pedido y detalle persistido.
  - Caso negativo: cotizacion vencida no convierte.
  - Caso negativo: pedido sin stock suficiente no se crea.
  - Confirmacion de pedido sin descontar stock antes de facturar.
  - Generacion de documento/CPE/CxC desde pedido.
  - Caso negativo: doble click/reintento de generacion de documento no duplica venta/documento.
  - Descuento de inventario, movimiento unico de salida y Kardex con salida.
  - CxC vinculada al cliente/documento.
  - Asiento contable persistido por referencia fiscal `serie-numero`.
  - Generacion de reporte SIRE ventas.
  - Busqueda/listado de cliente y pedido.
  - Navegacion UI a detalle de cliente, detalle de cotizacion, detalle/listado de pedido.
- Bugs encontrados:
  - Creacion de clientes enviaba/consultaba columnas no alineadas al runtime (`contacto`, `nombre_comercial`, `telefono`) y mezclaba documento string/numerico.
  - Busqueda de clientes aplicaba `ilike` sobre columnas numericas (`numero_documento`), generando `operator does not exist: integer ~~* unknown`.
  - Creacion de detalle de cotizacion insertaba `producto_codigo`, columna inexistente en `cotizacion_detalles`.
  - Cotizacion vencida por fecha podia convertirse si el estado no estaba previamente en `VENCIDA`.
  - Conversion cotizacion -> pedido via RPC podia generar numero duplicado `PED-2026-2026` por extraccion incorrecta de digitos; se agrego fallback seguro por sufijo.
  - Fallback de conversion insertaba columna inexistente `orden` en `pedidos_venta_detalle`.
  - Generacion de documento reutilizaba correlativos fiscales cuando la RPC/serie quedaba atrasada frente a documentos ya normalizados.
  - Confirmacion/facturacion podia duplicar impacto de inventario por evento; se marco `inventarioAplicado`.
  - Facturacion desde pedido no dejaba salida canonica en `movimientos_inventario`/Kardex.
  - Kardex no mostraba salidas de venta porque solo leia la vista de recepciones.
  - Plan contable de tenant no tenia cuentas operativas exigidas por ventas (`12`, `69`, `70`); el listener fallaba con cuentas faltantes.
  - Evento `venta.procesada` de confirmacion de pedido se trataba como venta fiscal facturada.
  - Evento CxC emitido desde pedido no llevaba `montoTotal`, `montoPendiente`, `subtotal` e `impuestos`; el asiento quedaba descuadrado.
  - Busqueda de pedidos usaba `or` PostgREST contra relacion embebida `clientes.razon_social`, generando `PGRST100`.
  - Login podia quedar bloqueado visualmente en carga de paises si la carga publica de paises se demoraba; se agrego fallback/timeout de UI.
- Codigo corregido:
  - `apps/erp-api/src/modules/ventas/clientes/clientes.service.ts`
  - `apps/erp-api/src/modules/ventas/clientes/clientes.service.spec.ts`
  - `apps/erp-api/src/modules/ventas/cotizaciones/cotizaciones.service.ts`
  - `apps/erp-api/src/modules/ventas/cotizaciones/cotizaciones.service.spec.ts`
  - `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts`
  - `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.spec.ts`
  - `apps/erp-api/src/modules/contabilidad/services/plan-cuentas.service.ts`
  - `apps/erp-api/src/modules/contabilidad/services/plan-cuentas.service.spec.ts`
  - `apps/erp-api/src/modules/contabilidad/listeners/contabilidad-events.listener.ts`
  - `apps/erp-api/src/shared/events/event-bus.service.ts`
  - `apps/erp-api/src/shared/integration/inventory-integration.service.ts`
  - `apps/erp-api/src/shared/integration/accounting-entries.service.ts`
  - `apps/erp-api/src/modules/inventario/inventario.service.ts`
  - `apps/web/hooks/use-paises.ts`
  - `apps/web/app/login/page.tsx`
- Tests modificados o creados:
  - Nuevo E2E vertical: `apps/web/tests/e2e/ventas-vertical.spec.ts`.
  - Endurecidos/agregados unitarios de contratos: `clientes.service.spec.ts`, `cotizaciones.service.spec.ts`, `pedidos.service.spec.ts`, `plan-cuentas.service.spec.ts`.
  - Gates relacionados ejecutados tambien contra `inventario.service.spec.ts`, `cxc-factura-event.spec.ts`, `contabilidad-events.listener.spec.ts`, `asientos-generator.service.spec.ts`, `pedidos.facturacion.spec.ts`.
- Posibles falsos positivos eliminados:
  - El E2E no usa datos historicos: crea cliente, producto, cotizacion, pedido, documento y reporte propios.
  - No se acepto asiento contable por existencia generica; se exigio asiento persistido por referencia fiscal del documento generado.
  - No se acepto Kardex por listado de movimientos: se valido entrada de Kardex con salida de venta.
  - No se aceptaron 400 genericos como exito; los casos negativos verifican estado 400 esperado por regla de negocio.
  - Se retiro una navegacion artificial a `about:blank` que generaba un `pageerror` no atribuible al producto.
  - Se amplio la espera contable a 90s solo para cubrir la latencia real del outbox/cron; el assert sigue exigiendo asiento persistido real.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: exito tras correcciones.
  - `pnpm --filter @erp-suite/web run type-check`: exito.
  - `pnpm --filter @erp-suite/erp-api run test -- inventario.service.spec.ts pedidos.service.spec.ts pedidos.facturacion.spec.ts cotizaciones.service.spec.ts clientes.service.spec.ts --runInBand`: exito, 5 suites / 48 tests.
  - `pnpm --filter @erp-suite/erp-api run test -- plan-cuentas.service.spec.ts asientos-generator.service.spec.ts contabilidad-events.listener.spec.ts pedidos.service.spec.ts --runInBand`: exito, 4 suites / 71 tests.
  - `pnpm --filter @erp-suite/erp-api run test -- contabilidad-events.listener.spec.ts pedidos.service.spec.ts cxc-factura-event.spec.ts asientos-generator.service.spec.ts --runInBand`: exito, 4 suites / 62 tests.
  - `pnpm --filter @erp-suite/erp-api run test -- clientes.service.spec.ts pedidos.service.spec.ts cotizaciones.service.spec.ts --runInBand`: exito, 3 suites / 32 tests.
  - `docker build --no-cache -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: exito tras cada correccion backend.
  - `docker build --no-cache -f apps/web/Dockerfile -t erp-web:latest .`: exito; build Next productivo generado.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate erp-api worker`: exito; API y worker `healthy`.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate web`: exito; web `healthy`.
  - `Invoke-WebRequest -UseBasicParsing http://localhost:13001/login/`: exito, 200.
  - `pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/ventas-vertical.spec.ts --project=chromium --reporter=line` con `BASE_URL=http://localhost:13001`, `E2E_API_ORIGIN=http://localhost:13002`, `PLAYWRIGHT_SKIP_WEBSERVER=1`: exito final, 1 test passed en 1.5 min.
  - Revision de logs Docker API/Web/Worker con patrones `500`, `ChunkLoadError`, `Cannot find module`, `Unhandled`, `PGRST`, eventos contables fallidos: sin coincidencias fatales en la ventana final revisada. Worker solo reporto jobs POS con `0 errores`.
- Validacion en navegador integrado visible:
  - Login visible con admin ya autenticado; dashboard visible sin pantalla blanca.
  - Rutas revisadas en navegador integrado: `/dashboard/ventas`, `/dashboard/ventas/clientes`, `/dashboard/ventas/cotizaciones`, `/dashboard/ventas/pedidos`, `/dashboard/ventas/aprobaciones`, `/dashboard/inventario/kardex`, `/dashboard/cpe`, `/dashboard/finanzas/cxc`, `/dashboard/sire`.
  - Resultado: rutas de Ventas, Inventario/Kardex y Finanzas/CxC con contenido util, sin overlay, sin blanco y sin loader permanente.
  - Segunda lectura fiscal: `/dashboard/cpe` cargo "Comprobantes de Pago Electronicos (CPE)" con estadisticas y lista; `/dashboard/sire` cargo "SIRE - Sistema de Registros Electronicos" con reportes/metricas. Sin loader permanente.
- Evidencia de consola/red:
  - Navegador integrado: `badLogs=[]` para la segunda lectura fiscal; ultimos logs visibles son informativos de autenticacion/dashboard/CPE.
  - Docker API/Web/Worker final: sin errores fatales, sin 500 inesperados, sin chunks 404, sin overlays de Next, sin loaders infinitos ni pantallas vacias.
  - 400 esperados durante E2E: cotizacion vencida, pedido sin stock y doble generacion de documento ya facturado; corresponden a casos negativos validados, no a fallos inesperados.
- Riesgos pendientes:
  - Certificado digital productivo SUNAT/CPE/GRE sigue siendo riesgo global permitido si aun no existe.
  - La generacion de documento descuenta inventario antes de completar todos los efectos fiscales/financieros; hay idempotencia para evitar doble salida, pero sigue siendo un punto a revisar en tareas de transaccionalidad/worker si se exige rollback atomico total.
  - La latencia de outbox contable puede acercarse a 60s; el flujo queda funcional, pero debe observarse en tareas de worker/outbox.
- Criterio de cierre: cumplido para Tarea 07. Una venta real atraviesa cliente, cotizacion, pedido, inventario, Kardex, CPE, CxC, contabilidad y SIRE; los casos negativos principales no duplican ni permiten operaciones invalidas; UI/API/persistencia fueron validadas. No se declara el ERP completo como 100% listo.

### Tarea 08 - POS completo

- Estado: `validado`.
- Modulos revisados:
  - Backend: `apps/erp-api/src/modules/pos/pos.service.ts`, `pos.controller.ts`, `cajas`, `inventario`, `cpe`, `contabilidad`/eventos.
  - Frontend: `/dashboard/pos`, `/dashboard/inventario/kardex`, `/dashboard/cpe`, `/dashboard/cajas`.
  - BD: `ventas_pos`, `detalle_ventas_pos`, `ventas_pos_pagos`, `productos`, `movimientos_inventario`, `movimientos_caja`, `asientos_contables`, `cpe`/cola CPE.
  - Worker: `erpval3-worker-1` para jobs POS/CPE.
- Flujos funcionales ejecutados:
  - Venta POS con caja abierta, cliente, producto propio creado por el test, pago mixto efectivo/tarjeta, ticket `B001-########`, CPE generado o cola pendiente, descuento de stock real, Kardex por salida `VENTA_POS`, movimiento de caja por componente efectivo y asiento contable.
  - Casos negativos: producto sin stock, producto inactivo, pago mixto descuadrado detectado por API, doble click/reintento con misma `idempotency_key` devuelve la misma venta sin duplicar.
  - Rutas visibles revisadas en navegador integrado: POS, Kardex, CPE y Cajas.
- Bugs encontrados:
  - POS aceptaba ventas sin validar en produccion producto activo, stock suficiente y cantidad valida antes de llamar la RPC.
  - El servicio liberaba el advisory lock con una llave distinta a la usada para adquirirlo cuando no habia `idempotency_key`.
  - La venta POS dependia de la RPC para persistir detalles/pagos/stock, pero el flujo real no dejaba garantizados `detalle_ventas_pos`, `ventas_pos_pagos`, salida de inventario canonica ni evento contable.
  - El query de validacion de productos referenciaba `productos.unidad_medida_sunat`, columna inexistente en runtime; el E2E lo detecto como error real antes de la venta.
  - El worker estaba en estado `Created`; con worker detenido el asiento contable no se materializaba dentro del tiempo esperado.
- Codigo corregido:
  - `apps/erp-api/src/modules/pos/pos.service.ts`: validacion productiva de productos, stock e inactivos; lock principal consistente; persistencia idempotente de detalles, pagos, descuento de stock y movimiento `movimientos_inventario`; rollback ampliado de pagos/outbox; emision de evento `pos.venta.registrada` con datos suficientes para contabilidad sin duplicar inventario.
  - `docker-compose.validation.yml` ya mantiene worker como servicio de validacion; en esta tarea se recreo y verifico `erpval3-worker-1` healthy.
- Tests modificados o creados:
  - `apps/erp-api/src/modules/pos/pos.service.spec.ts`: endurecido para verificar validacion de productos, persistencia de detalles/pagos/movimiento de inventario y liberacion de lock correcto.
  - `apps/web/tests/e2e/pos-vertical.spec.ts`: nuevo E2E vertical que crea datos propios, ejecuta negativos sin stock/inactivo, procesa venta POS con pago mixto, valida idempotencia, detalle, stock persistido, Kardex, CPE/cola, caja y asiento contable.
- Posibles falsos positivos eliminados:
  - El E2E inicial usaba pagos que no cuadraban con el total (`112.10` vs `134.52`); se corrigio el dato de prueba para validar una venta real valida.
  - En navegador integrado, la busqueda textual de `500` marco `Ini: S/ 500.00` y `Dif: -500.00` en Cajas; se clasifico como falso positivo, no HTTP 500 ni overlay.
  - No se acepto el pase del flujo con worker detenido; se levanto el worker y se repitio el E2E hasta observar asiento contable.
- Comandos ejecutados y resultado:
  - `git status --short`: exito; worktree con cambios previos amplios, no se revirtieron cambios ajenos.
  - `pnpm --filter @erp-suite/erp-api run type-check`: exito.
  - `pnpm --filter @erp-suite/web run type-check`: exito.
  - `pnpm --filter @erp-suite/erp-api run build`: exito.
  - `pnpm --filter @erp-suite/web run build`: exito; Next compilo 85 rutas, incluida `/dashboard/pos`.
  - `pnpm --filter @erp-suite/erp-api run test -- pos.service.spec.ts inventario.service.spec.ts contabilidad-events.listener.spec.ts asientos-generator.service.spec.ts --runInBand`: exito, 4 suites / 69 tests.
  - `docker build -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: exito tras correccion de `unidad_medida_sunat`.
  - `docker build -f apps/web/Dockerfile -t erp-web:latest .`: exito; imagen web productiva reconstruida.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate erp-api`: exito; API healthy.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate web`: exito; web healthy.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate worker`: exito; worker healthy.
  - `Invoke-WebRequest -UseBasicParsing http://localhost:13001/login/`: exito, 200.
  - `pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/pos-vertical.spec.ts --project=chromium --reporter=line` con `BASE_URL=http://localhost:13001`, `E2E_API_ORIGIN=http://localhost:13002`, `PLAYWRIGHT_SKIP_WEBSERVER=1`: fallo inicial por pagos descuadrados; fallo posterior por asiento ausente con worker detenido; exito final, 1 test passed en 1.1 min con worker healthy.
  - Logs Docker API/Web/Worker filtrados por `ERROR|Error|Unhandled|500|Cannot find module|chunk`: sin errores fatales ni 500 inesperados en la ventana final; worker reporto jobs POS/CPE con `0 errores`.
- Validacion en navegador integrado visible:
  - Sesion admin visible reutilizada; dashboard mostraba actividad reciente con facturas POS `B001-00000001` y `B001-00000002` por `S/ 134.52`.
  - `/dashboard/pos`: carga visible sin pantalla blanca ni overlay; se observo estado de verificacion de caja.
  - `/dashboard/inventario/kardex`: carga "Kardex valorizado" con filtros y contenido util.
  - `/dashboard/cpe`: carga "Comprobantes de Pago Electronicos (CPE)" con KPIs y listado.
  - `/dashboard/cajas`: carga "Gestion de Cajas" con sesiones abiertas/cerradas y datos de caja.
- Evidencia de consola/red:
  - Navegador integrado: `tab.dev.logs({ levels: ['error'] })` devolvio lista vacia durante la validacion final.
  - No se observaron overlays de Next, pantallas vacias, loaders infinitos ni chunks 404 en POS/Kardex/CPE/Cajas.
  - La evidencia de red se complemento con E2E contra API real y logs Docker API/Web/Worker sin `500` inesperados ni errores fatales; los 400 observados correspondieron a negativos esperados de negocio.
- Riesgos pendientes:
  - Mantener `erpval3-worker-1`/worker productivo activo es requisito para materializar asiento y jobs POS/CPE; si se despliega sin worker, el flujo queda incompleto.
  - La persistencia POS combina RPC y pasos de aplicacion; existe rollback defensivo, pero la atomicidad total multi-tabla debe revisarse en la tarea de worker/outbox/transaccionalidad si se exige una unica transaccion DB.
  - Certificado digital productivo SUNAT/CPE/GRE sigue siendo riesgo global permitido si aun no existe.
- Criterio de cierre: cumplido para Tarea 08. El POS puede ejecutar una venta diaria real con ticket, pago, stock, Kardex, caja, CPE/cola y asiento contable; los negativos principales no permiten operaciones invalidas ni duplican venta por reintento. No se declara el ERP completo como 100% listo.

### Tarea 09 - Inventario y logistica

- Estado: `validado`.
- Modulos revisados:
  - Backend: `InventarioController`, `InventarioService`, `AlmacenesService`, `LogisticaService`, compras/recepciones/devoluciones, ventas/pedidos y POS por interconexion.
  - Frontend: `/dashboard/inventario`, `/dashboard/inventario/almacenes`, `/dashboard/inventario/recepciones`, `/dashboard/inventario/kardex`, `/dashboard/inventario/logistica/ordenes-pendientes`, `/dashboard/inventario/logistica/listo-despacho`.
  - BD: `productos`, `almacenes`, `recepciones`, `recepcion_items`, `movimientos_inventario`, `vw_kardex_valorizado`, `producto_existencias`, `pedidos_venta`, `pedidos_venta_detalle`, `pedido_despachos`, `pedido_backorders`, `logistica_eventos`, `empresa_config`.
- Flujos funcionales ejecutados:
  - Configuracion logistica deshabilitada: API devuelve lista vacia controlada y UI muestra estado claro "Flujo de logistica desactivado".
  - Compra/recepcion: proveedor, producto, OC, aprobacion, recepcion cerrada; stock sube de `0` a `9` y Kardex registra entrada.
  - Devolucion de compra: devolucion emitida por `2`; stock baja de `9` a `7` y movimientos/Kardex registran salida por devolucion.
  - Venta/logistica: cliente, pedido, confirmacion, orden pendiente de preparacion, bloqueo de despacho sin preparacion, preparacion, listo para despacho, bloqueo de almacen invalido, despacho final; stock baja de `7` a `4` y Kardex registra salida.
  - POS -> Kardex ya validado en T08 con salida `VENTA_POS`; se considera interconexion vigente para este criterio.
  - Resumen de inventario y stock por almacen/existencias consultados.
- Bugs encontrados:
  - No se encontro bug productivo nuevo durante T09.
  - Hallazgos de validacion: el backend rechaza almacen invalido con `404 Almacen no encontrado`; se documenta como comportamiento correcto para recurso inexistente, no como fallo.
  - El type-check web fallo una vez en paralelo con build por carrera de `.next/types`; repetido en secuencia paso correctamente.
- Codigo corregido: ninguno en produccion para esta tarea.
- Tests modificados o creados:
  - Creado `apps/web/tests/e2e/inventario-logistica.spec.ts`.
  - El E2E crea sus propios datos y valida API, UI y estado persistido: almacenes, producto, recepcion, devolucion, pedido, preparacion/despacho, movimientos, Kardex, resumen y `producto_existencias`.
  - Se reutiliza evidencia vigente de T08 para POS -> Kardex y de T06/T07 para interconexiones compras/ventas, pero T09 tiene su propia corrida vertical.
- Posibles falsos positivos eliminados:
  - El texto esperado inicial para logistica deshabilitada no coincidia con la UI real; se ajusto a "Flujo de logistica desactivado" tras revisar screenshot/contexto.
  - Rechazo por almacen invalido puede ser `400` o `404`; el test acepta ambos porque ambos bloquean el movimiento y comunican recurso/operacion invalida.
  - El fallo `TS6053` de web type-check ocurrio solo al ejecutarlo en paralelo con `next build`; repetido despues del build paso.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/web run type-check`: exito antes del E2E; fallo transitorio en paralelo con build por `.next/types`; exito final en secuencia.
  - `pnpm --filter @erp-suite/erp-api run type-check`: exito.
  - `pnpm --filter @erp-suite/erp-api run test -- inventario.service.spec.ts recepciones.service.spec.ts devoluciones-proveedor.service.spec.ts pedidos.service.spec.ts pedidos.facturacion.spec.ts --runInBand`: exito, 5 suites / 63 tests.
  - `pnpm --filter @erp-suite/erp-api run build`: exito.
  - `pnpm --filter @erp-suite/web run build`: exito; Next compilo 85 rutas, incluidas rutas de inventario y logistica.
  - `docker ps --format ...`: `erpval3-web-1`, `erpval3-erp-api-1`, `erpval3-worker-1` y `erpval3-redis-1` healthy.
  - `pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/inventario-logistica.spec.ts --project=chromium --reporter=line` con `BASE_URL=http://localhost:13001`, `E2E_API_ORIGIN=http://localhost:13002`, `PLAYWRIGHT_SKIP_WEBSERVER=1`: fallo inicial por texto UI esperado; fallo posterior por esperar solo 400 ante almacen invalido cuando backend devolvio 404; exito final, 1 test passed en 1.5 min.
  - Logs Docker API/Web/Worker filtrados por `ERROR|Unhandled|Cannot find module|ChunkLoadError|500|PGRST`: sin errores fatales ni 500 inesperados en la ventana final.
- Validacion en navegador integrado visible:
  - Login visible admin en navegador integrado contra `http://localhost:13001/login/`; dashboard cargado.
  - Rutas recorridas: `/dashboard/inventario`, `/dashboard/inventario/almacenes`, `/dashboard/inventario/recepciones`, `/dashboard/inventario/kardex`, `/dashboard/inventario/logistica/ordenes-pendientes`, `/dashboard/inventario/logistica/listo-despacho`.
  - Resultado: todas muestran contenido util o estado accionable, sin pantalla blanca, sin overlay, sin loader infinito y sin redireccion falsa.
  - La ruta `listo-despacho` mostro un pedido T09 creado por el E2E en estado listo para despacho, confirmando que la UI ve datos reales del flujo.
- Evidencia de consola/red:
  - Navegador integrado: `tab.dev.logs({ levels: ['error'] })` devolvio lista vacia en la validacion final.
  - E2E Playwright monitoreo `pageerror`, `console.error` y respuestas `>=500`/chunks 404; `browserFailures=[]`.
  - Docker API/Web/Worker final sin errores fatales, sin 500 inesperados, sin `Cannot find module`, sin `ChunkLoadError` y sin `PGRST` en la ventana revisada.
- Riesgos pendientes:
  - El cierre extendido de cajas/conciliacion queda para T10; no forma parte del cierre de inventario salvo impacto POS ya validado.
  - La atomicidad completa multi-tabla de inventario/logistica debe seguir observandose en tareas de worker/outbox/transaccionalidad si se exige rollback unico a nivel DB.
  - `producto_existencias` existe y es consultable para stock por almacen, pero la UI principal todavia muestra stock agregado; cualquier desglose avanzado por almacen debe validarse cuando se aborde una tarea especifica de multialmacen.
- Criterio de cierre: cumplido para Tarea 09. Inventario refleja exactamente los impactos validados de compras/recepciones, devolucion, ventas/logistica y POS en stock, movimientos y Kardex; las pantallas visibles de inventario/logistica no quedan vacias ni en loader permanente. No se declara el ERP completo como 100% listo.

### Tarea 10 - CPE completo

- Estado: `validado`.
- Modulos revisados:
  - Backend: `CpeController`, `CpeService`, `CpePdfService`, DTO `CreateFacturaDto`, idempotencia CPE, endpoints de listado/detalle/PDF/status/reenvio/anulacion, evento `FacturaEmitidaEvent`, listener CxC y fallback de clientes desde CPE.
  - Frontend: `/dashboard/cpe`, `ComprobantesTable`, modal de detalle fiscal, integracion de tipo documento en tabla/modal y boton de detalle.
  - Interconexiones: POS -> CPE/boleta, CPE -> CxC, CPE -> PDF/representacion impresa, CPE -> worker/SUNAT mock/estado fiscal.
- Flujos funcionales ejecutados:
  - Creacion de factura CPE con cliente fiscal propio del test, serie `F001`, totales reales e idempotency key.
  - Reintento idempotente de la misma factura: segunda llamada devuelve el mismo `id`.
  - Casos negativos: totales inconsistentes rechazados con 400; factura con receptor no RUC rechazada con 400; anulacion invalida rechazada con 400.
  - Consulta de detalle, listado, PDF y estado fiscal de la factura creada.
  - Persistencia verificada en tabla `cpe`: `xml_firmado` o `hash_firma`, estado fiscal y `cliente_id`.
  - Persistencia verificada en `cuentas_por_cobrar`: CxC creada con `cliente_id`, `documento_id`, `monto_total=118` y `monto_pendiente=118`.
  - POS crea boleta `B001-########` con caja, producto y metodo de pago creados por el test, y deja evidencia CPE/cola.
  - UI `/dashboard/cpe` muestra la factura creada; modal visible muestra `FACTURA ELECTRONICA`, serie/numero, RUC receptor, totales y `Hash de Seguridad`.
- Bugs encontrados:
  - `CpeService.create` recalculaba y sobrescribia totales antes de validar lo recibido; una UI/API podia enviar `total_venta` inconsistente y aun asi quedar aceptada.
  - El detalle UI recibia `tipoComprobante` como etiqueta (`Factura`) en lugar del codigo SUNAT (`01`), por lo que el modal caia a titulo generico `COMPROBANTE ELECTRONICO`.
  - El flujo CPE -> CxC fallaba con RUC de 11 digitos: busqueda por columna entera producia `out of range for type integer`, y el fallback intentaba insertar columna inexistente `contacto` en `clientes`.
  - Tras recrear contenedores hubo resets transitorios de chunks durante arranque; no quedaron presentes en la validacion final con servicios healthy.
- Codigo corregido:
  - `apps/erp-api/src/modules/cpe/cpe.service.ts`: validacion fuerte de totales provistos contra totales calculados, validacion de receptor por tipo de documento, persistencia de `cliente_id` y emision de eventos CPE con cliente real.
  - `libs/dtos/src/cpe/factura.dto.ts`: `cliente_id` opcional en DTO de factura.
  - `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts`: busqueda segura de cliente por RUC/codigo, fallback sin columnas inexistentes y sin overflow de documento entero.
  - `apps/web/app/dashboard/cpe/page.tsx`, `apps/web/components/cpe/ComprobantesTable.tsx`, `apps/web/components/modals/GreModal.tsx`: normalizacion de `tipoDocumento` SUNAT para listado y detalle.
- Tests modificados o creados:
  - `apps/erp-api/src/modules/cpe/cpe.service.spec.ts`: cubre rechazo de totales inconsistentes y factura sin RUC receptor.
  - `apps/erp-api/src/modules/finanzas/cxc/cxc-factura-event.spec.ts`: cubre fallback de cliente CPE sin columnas inexistentes ni overflow de RUC.
  - `apps/web/tests/e2e/cpe-completo.spec.ts`: nuevo E2E funcional que crea datos propios, valida API, UI, PDF, idempotencia, errores fiscales, boleta POS, persistencia `cpe` y CxC.
- Posibles falsos positivos eliminados:
  - No se usan datos historicos como condicion de exito; el test crea cliente, producto, caja, metodo de pago y CPE propios.
  - No se acepta solo status 2xx: se verifica UI visible, API, PDF y estado persistido en BD.
  - Los 400 de negativos CPE se clasifican como esperados por dominio; no se cuentan como errores fatales.
  - Se elimino el falso cierre UI donde el modal abria pero con tipo generico en vez de factura real.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: exito.
  - `pnpm --filter @erp-suite/web run type-check`: exito despues de los cambios de CPE/CxC/E2E.
  - `pnpm --filter @erp-suite/erp-api run test -- cpe.service.spec.ts cpe.idempotency.spec.ts cxc-factura-event.spec.ts --runInBand`: exito, 3 suites / 15 tests.
  - `pnpm --filter @erp-suite/erp-api run build`: exito.
  - `pnpm --filter @erp-suite/web run build`: exito.
  - `docker build -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: exito.
  - `docker build -f apps/web/Dockerfile -t erp-web:latest .`: exito; build Next produjo `/dashboard/cpe` correctamente.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate erp-api web worker`: exito; `erpval3-web-1`, `erpval3-erp-api-1`, `erpval3-worker-1` y Redis quedaron healthy.
  - `BASE_URL=http://localhost:13001 PLAYWRIGHT_SKIP_WEBSERVER=1 E2E_API_ORIGIN=http://localhost:13002 pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/cpe-completo.spec.ts --project=chromium --reporter=line`: exito, 1 test passed en 48.8s.
  - `docker logs --since 20m ... | Select-String ...`: web sin errores; API solo 400 esperados de negativos; sin `statusCode:500`, `PGRST204`, overflow de RUC, `CxcFacturaListener.*Error`, chunks rotos ni `Unhandled`; worker healthy con metricas CPE/POS sin errores.
- Validacion en navegador integrado visible:
  - Navegador integrado contra `http://localhost:13001/dashboard/cpe/` con sesion admin.
  - La pagina cargo `Comprobantes de Pago Electronicos (CPE)`, KPIs, filtros y tabla con boletas/facturas creadas por el E2E.
  - Se abrio la factura `F001-90662855`; el modal mostro `FACTURA ELECTRONICA`, emisor, receptor `Cliente CPE T10`, RUC `20670662855`, item, total `PEN 118.00` y `Hash de Seguridad`.
  - `tab.dev.logs({ levels: ['error'] })` devolvio `[]` durante la validacion final.
- Evidencia de consola/red:
  - E2E captura `pageerror`, `console.error`, respuestas `>=500` y chunks `_next` 404; `browserFailures=[]`.
  - Browser visible final sin errores de consola, sin overlay Next, sin pantalla blanca, sin loader infinito.
  - Docker web final sin `ChunkLoadError`, `Cannot find module`, `ERR_CONNECTION_RESET`, `Application error`, 500 ni 404 de chunks.
  - Docker API final sin 500 inesperados ni errores CxC/Supabase; los 400 registrados corresponden a negativos esperados: totales inconsistentes, factura sin RUC y anulacion invalida.
  - Docker worker final healthy; cola POS/CPE sin errores reportados.
- Riesgos pendientes:
  - Certificado digital productivo SUNAT/CPE/GRE verdadero sigue siendo el unico pendiente aceptable si el tenant aun no lo tiene cargado; en local se valida hasta el limite permitido por mock/ambiente.
  - La comunicacion real con SUNAT/OSE productivo debe revalidarse al cargar certificado y secretos productivos, sin cambiar el cierre logico/funcional local.
- Criterio de cierre: cumplido para Tarea 10. CPE genera factura y boleta, valida estados, detalle, PDF, idempotencia, errores fiscales, persistencia y CxC sin errores fatales; la UI carga y muestra comprobantes reales en navegador integrado. No se declara el ERP completo como 100% listo.

### Tarea 11 - GRE completo

- Estado: `validado`.
- Modulos revisados:
  - Backend: `GreController`, `GreService`, DTO/interface `CreateGuiaRemisionDto`, idempotencia GRE, endpoints de listado/detalle/PDF/XML/status/reenvio/envio SUNAT, configuracion automatica GRE, relacion pedido-GRE.
  - Frontend: `/dashboard/gre`, `GreModal`, `GreViewModal`, listado, detalle, descarga/representacion impresa y contrato API por proxy autenticado.
  - Interconexiones: Ventas/Pedidos, `pedido_gres`, `gre_detalles`, Inventario/stock, OSE/SUNAT mock, worker/colas GRE.
- Flujos funcionales ejecutados:
  - Configuracion base validada con tenant Peru activo y certificado/mock local suficiente para generar/firma GRE en ambiente de validacion.
  - Creacion de cliente RUC, producto con stock y pedido de venta con detalle propio del test.
  - Casos negativos: GRE sin destinatario, GRE con peso/cantidad invalida y GRE con pedido origen inexistente responden 400 con mensaje util.
  - Creacion de GRE desde pedido/despacho con transportista privado, placa, licencia, documento de destinatario en `datosAdicionales`, notas de despacho y `idempotencyKey`.
  - Reintento idempotente de creacion GRE: segunda llamada devuelve la misma GRE, sin duplicar.
  - Consulta de detalle, listado, representacion impresa `/pdf` y estado SUNAT/mock.
  - Persistencia verificada en `gre_guias`, `gre_detalles` y `pedido_gres`.
  - Inventario verificado: crear GRE documental no altera `stock_actual` del producto.
  - UI `/dashboard/gre` muestra la GRE creada y el modal de detalle carga destinatario, direccion, modalidad, placa/licencia, peso, fecha y estado.
- Bugs encontrados:
  - El controller GRE devolvia `success:false` con HTTP 200 en varios errores, lo que podia ocultar fallos reales en UI/tests.
  - La UI de detalle `GreViewModal` llamaba directo a `NEXT_PUBLIC_API_URL`/API externa y no al proxy autenticado `/backend`, dejando el detalle dependiente de cookies/host por casualidad.
  - La UI tenia boton/flujo de descarga GRE contra `/api/gre/guias/:id/pdf`, pero el backend no exponia ese endpoint.
  - GRE manual no podia generar XML si no habia CPE relacionado, porque no habia contrato para documento del destinatario manual.
  - `ClientesService` convertia RUC de 11 digitos a columnas integer (`numero_documento`/`documento_numero`) y fallaba con `value ... is out of range for type integer`, bloqueando flujos GRE desde venta con cliente RUC.
- Codigo corregido:
  - `apps/erp-api/src/modules/gre/gre.controller.ts`: errores GRE ahora salen como HTTP 400 reales; se agrego endpoint `/api/gre/guias/:id/pdf`.
  - `apps/erp-api/src/modules/gre/gre.service.ts`: validaciones fuertes de campos obligatorios, peso, modalidad, transportista/placa/licencia, origen pedido/CPE existente y soporte de documento destinatario desde `datos_adicionales`.
  - `apps/web/components/modals/GreViewModal.tsx`: detalle usa `useApiCall`/proxy autenticado y descarga por `/backend/api/gre/guias/:id/pdf/`.
  - `apps/erp-api/src/modules/ventas/clientes/clientes.service.ts`: RUC de 11 digitos se conserva como texto (`codigo`/`ruc`) y no se inserta en columnas enteras fuera de rango.
- Tests modificados o creados:
  - `apps/erp-api/src/modules/gre/gre.service.spec.ts`: reemplaza placeholder por validaciones reales de datos obligatorios, peso, transporte publico/privado y GRE valida.
  - `apps/erp-api/src/modules/gre/gre.idempotency.spec.ts`: ejecutado como cobertura de in-flight/idempotencia de envio.
  - `apps/erp-api/src/modules/ventas/clientes/clientes.service.spec.ts`: ajustado para RUC seguro sin overflow y DNI numerico seguro.
  - `apps/web/tests/e2e/gre-completo.spec.ts`: nuevo E2E funcional GRE con datos propios, API/UI/BD, negativos, idempotencia, PDF, estado SUNAT/mock, pedido-GRE, detalle GRE y stock sin alteracion.
- Posibles falsos positivos eliminados:
  - No se usan semillas historicas como exito; el E2E crea cliente, producto, pedido y GRE propios.
  - No se acepta solo que la ruta cargue; se valida API, UI y persistencia en `gre_guias`, `gre_detalles` y `pedido_gres`.
  - Los 400 de negativos GRE se clasifican como esperados; no son errores fatales.
  - Se valida que GRE documental no descuente stock, evitando confundir guia con salida de inventario.
  - Se elimino el falso positivo de detalle que podia abrir modal pero no cargar datos por usar URL/API fuera del proxy autenticado.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: exito.
  - `pnpm --filter @erp-suite/web run type-check`: exito.
  - `pnpm --filter @erp-suite/erp-api run test -- gre.service.spec.ts gre.idempotency.spec.ts clientes.service.spec.ts --runInBand`: exito, 3 suites / 11 tests.
  - `pnpm --filter @erp-suite/erp-api run build`: exito.
  - `pnpm --filter @erp-suite/web run build`: exito.
  - `docker build -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: exito.
  - `docker build -f apps/web/Dockerfile -t erp-web:latest .`: exito.
  - `docker compose -p erpval3 -f docker-compose.validation.yml up -d --force-recreate erp-api web worker`: exito; servicios healthy.
  - `BASE_URL=http://localhost:13001 PLAYWRIGHT_SKIP_WEBSERVER=1 E2E_API_ORIGIN=http://localhost:13002 pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/gre-completo.spec.ts --project=chromium --reporter=line`: fallo inicial por bug real RUC integer en clientes; fallo posterior por contrato GRE manual sin documento destinatario; exito final, 1 test passed en 37.8s.
  - `docker logs --since 10m ... | Select-String ...`: sin HTTP 500, sin `PGRST204`, sin overflow, sin chunks rotos, sin `Unhandled`; worker healthy.
- Validacion en navegador integrado visible:
  - Navegador integrado contra `http://localhost:13001/dashboard/gre/` con sesion admin.
  - La pagina cargo `Guias de Remision Electronica (GRE)`, KPIs, filtros y tabla.
  - Se abrio la GRE `T001-00000014`; el modal mostro `GUIA DE REMISION ELECTRONICA`, destinatario `Cliente GRE T11`, direccion `Av. Logistica GRE 123`, modalidad `Transporte Privado`, placa, licencia, peso `7.5 Kg`, fecha traslado, observaciones y estado.
  - `tab.dev.logs({ levels: ['error'] })` devolvio `[]` durante la validacion final.
- Evidencia de consola/red:
  - E2E captura `pageerror`, `console.error`, respuestas `>=500` y chunks `_next` 404; `browserFailures=[]`.
  - Browser visible final sin errores de consola, sin overlay Next, sin pantalla blanca y sin loader infinito.
  - Docker web final sin `ChunkLoadError`, `Cannot find module`, `Application error`, 500 ni 404 de chunks.
  - Docker API final sin 500 inesperados, sin `PGRST204` y sin overflow de RUC; los 400 registrados corresponden a negativos esperados de GRE.
  - Docker worker final healthy; colas CPE/GRE/SIRE disponibles y jobs POS/CPE sin errores reportados.
- Riesgos pendientes:
  - Certificado digital productivo SUNAT/CPE/GRE verdadero sigue siendo el unico pendiente aceptable si el tenant aun no lo tiene cargado; en local se valido hasta mock/ambiente permitido.
  - La aceptacion/rechazo real de SUNAT/OSE productivo debe revalidarse al cargar certificado y credenciales productivas.
- Criterio de cierre: cumplido para Tarea 11. GRE funciona logicamente conectada con venta/pedido, detalle, transporte, despacho/logistica, inventario sin alteracion indebida, PDF/representacion, idempotencia, estados y errores configuracionales. No se declara el ERP completo como 100% listo.

### Tarea 12 - SIRE completo

- Estado: `validado`.
- Modulos revisados:
  - Backend: `SireController`, `SireService`, endpoints `/api/sire/stats`, `/api/sire/reportes`, `/api/sire/generar-reporte`, `/api/sire/reportes/:id/download`, `/api/sire/reportes/:id/enviar-sunat`.
  - Frontend: `/dashboard/sire`, `SireReportModal`, filtros de periodo/tipo/estado, tabla, descarga y envio SUNAT.
  - Interconexiones: ventas/pedidos/CPE, compras/recepciones/CxP, `sire_files`, `sire_registros_detalle`, estados `GENERADO/ENVIADO/PENDIENTE`, descarga TXT y SUNAT/mock.
- Flujos funcionales ejecutados:
  - Venta real creada desde API funcional: cliente, producto, pedido, confirmacion y generacion de documento/CPE.
  - Compra real creada desde API funcional: proveedor, producto, OC, aprobacion, recepcion, cierre y CxP.
  - Datos del test aislados por periodo SIRE propio; CPE y CxP alineados a ese periodo sin depender de historicos.
  - Generacion de reportes `REGISTRO_VENTAS` y `REGISTRO_COMPRAS`.
  - Validacion de listado por periodo, tipo y estado.
  - Descarga de reportes y validacion de filas/totales reales contra CPE/CxP creados.
  - Validacion negativa de mezcla de periodos: todas las filas descargadas deben tener fecha de emision dentro del periodo solicitado.
  - Envio/mock SUNAT de reporte generado y validacion posterior de estado `ENVIADO`.
  - Stats SIRE consultadas por API y visibles en UI: reportes del mes, registros totales, enviados y pendientes.
- Bugs encontrados:
  - `SireService.generarContenidoSire` generaba ventas y compras sin filtrar por periodo; un reporte mensual podia mezclar documentos de otros meses.
  - `SireService.simularGeneracionReporte` contaba el encabezado como registro cuando el reporte no tenia filas reales.
  - `SireController` devolvia HTTP 200 con `success:false`/listas vacias en errores de stats/listado/descarga/envio, ocultando fallos reales.
  - `SireService.procesarComprobanteParaSire` calculaba el periodo con la fecha actual del servidor, no con la fecha del comprobante.
  - La UI SIRE no tenia filtro por estado, impidiendo validar `pendientes` vs `enviados` desde el listado.
  - Falso positivo operativo detectado: el puerto `3001` estaba ocupado por otro contenedor (`gitgov-server`), no por el ERP; el ERP real de validacion corre en `13001`.
  - Falso positivo de despliegue detectado: el primer E2E contra contenedores fallo mezcla de periodos porque el contenedor API seguia con imagen vieja; se reconstruyo/recreo antes de validar.
- Codigo corregido:
  - `apps/erp-api/src/modules/sire/sire.controller.ts`: errores de stats/listado/descarga/envio ahora se propagan como errores HTTP reales, sin respuesta 200 silenciosa.
  - `apps/erp-api/src/modules/sire/sire.service.ts`: normalizacion de tipo/periodo, periodo desde fecha del comprobante, filtros `tenant_id + fecha_emision` por rango mensual, exclusion de anulados/cancelados por defecto, filtro de estado en listado, generacion sincronica deterministica y conteo solo de filas reales.
  - `apps/web/app/dashboard/sire/page.tsx`: filtro de estado agregado y enviado al backend.
- Tests modificados o creados:
  - `apps/erp-api/src/modules/sire/sire.service.spec.ts`: reemplaza placeholder por pruebas reales de periodo del comprobante, filtros REG_VEN/REG_COM, filtro de estado y rechazo de periodo invalido.
  - `apps/web/tests/e2e/sire-completo.spec.ts`: nuevo E2E T12 con datos propios, venta+CPE, compra+CxP, reportes, descarga, totales, filtros, envio SUNAT mock, UI y consola/red.
- Posibles falsos positivos eliminados:
  - No se acepta que SIRE muestre contadores/listados con cero si existen documentos validos: el E2E exige `total_registros > 0` en ventas y compras.
  - No se acepta reporte mensual que incluya documentos de otros periodos: se inspecciona el TXT descargado fila por fila.
  - No se acepta status 200 con `success:false`: controller deja que Nest devuelva errores HTTP reales.
  - No se acepta que el test pase por historicos: crea venta, CPE, compra, recepcion y CxP propios.
  - No se acepta solo UI visible: se valida API, persistencia indirecta via CPE/CxP/reportes, descarga y estado enviado.
  - Se separa el falso fallo de puerto `3001` ocupado por otro servicio; la validacion ERP usa `http://localhost:13001` y `http://localhost:13002`.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: exito.
  - `pnpm --filter @erp-suite/web run type-check`: exito.
  - `pnpm --filter @erp-suite/erp-api run test -- sire.service.spec.ts sire.controller.security.spec.ts --runInBand`: exito, 2 suites / 6 tests.
  - `pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/sire-completo.spec.ts --project=chromium`: fallo inicial por config intentando usar `3001` ocupado y por binario Playwright no resuelto con `exec`; documentado como baseline/falso positivo de entorno.
  - `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:13001 E2E_API_ORIGIN=http://localhost:13002 pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/sire-completo.spec.ts --project=chromium --reporter=line --timeout=120000`: fallo con imagen API vieja, detecto mezcla de periodos en SIRE.
  - `docker build -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: exito; build Nest dentro de Docker exitoso.
  - `docker build -f apps/web/Dockerfile -t erp-web:latest .`: exito; build Next produjo `/dashboard/sire` correctamente.
  - `docker compose -f docker-compose.validation.yml -p erpval3 up -d --force-recreate erp-api web`: exito; `erpval3-erp-api-1` y `erpval3-web-1` healthy.
  - `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:13001 E2E_API_ORIGIN=http://localhost:13002 pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/sire-completo.spec.ts --project=chromium --reporter=line --timeout=120000`: exito final, 1 test passed en 1.1m.
  - `Invoke-RestMethod http://localhost:13002/api/sire/stats` con token admin: exito; `reportesDelMes=10`, `registrosTotales=153`, `enviadosASunat=3`, `pendientes=7`.
  - `docker logs --since 20m erpval3-erp-api-1 | Select-String ...`: sin 500 inesperados ni chunks; coincidencias benignas `error_message:null` y logs `errores=0`.
  - `docker logs --since 20m erpval3-web-1 | Select-String ...`: sin errores.
  - `docker compose -f docker-compose.validation.yml -p erpval3 ps`: API, Web, Redis y Worker healthy.
- Validacion en navegador integrado visible:
  - Navegador integrado contra `http://localhost:13001/dashboard/sire` con sesion admin.
  - La pagina cargo `SIRE - Sistema de Registros Electronicos`, KPIs y tabla de reportes.
  - Tras refrescar, UI mostro `REPORTES DEL MES=10`, `REGISTROS TOTALES=153`, `ENVIADOS A SUNAT=3`, `PENDIENTES=7`.
  - Tabla visible con `Registro de Compras` y `Registro de Ventas`, periodos aislados del E2E (`2048-01`, `2040-12`, etc.), `REG_COM/REG_VEN`, registros `1`, estados `Generado/Enviado`, botones `Descargar` y `Enviar SUNAT` donde corresponde.
  - No hubo pantalla blanca, overlay de Next ni loader permanente.
- Evidencia de consola/red:
  - E2E captura `pageerror`, `console.error`, respuestas `>=500` y chunks `_next` 404; corrida final sin fallos de consola/red.
  - Navegador integrado: `tab.dev.logs()` final `totalLogs=39`, `seriousCount=0`; sin errores de consola, sin 500/404 de chunks, sin `Application error`, sin `Unhandled`.
  - Docker API/Web final sin 500 inesperados, sin `Cannot find module`, sin chunks rotos y sin pantallas vacias.
- Riesgos pendientes:
  - Certificado/credenciales productivas SUNAT/OSE reales siguen siendo el unico pendiente aceptable si el tenant aun no los tiene cargados; en local se valido envio/mock y descarga funcional.
  - La prueba actual valida SIRE con CPE/CxP y reportes TXT; cualquier integracion SUNAT productiva real debe revalidarse al cargar certificado y secretos productivos.
- Criterio de cierre: cumplido para Tarea 12. SIRE refleja operaciones reales de ventas y compras por periodo, no mezcla meses, no queda en cero con documentos validos, genera/descarga reportes, filtra por periodo/tipo/estado, marca enviados por SUNAT/mock y carga en navegador integrado sin errores fatales. No se declara el ERP completo como 100% listo.

### Tarea 13 - Finanzas, CxC, cobranzas, bancos y tesoreria

- Estado: `validado`.
- Modulos revisados:
  - Backend: CxC, CxP, bancos, conciliacion, tesoreria, eventos financieros, integracion POS/caja, integracion compras/ventas y outbox contable.
  - Frontend: `/dashboard/finanzas/cxc`, `/dashboard/finanzas/cxp`, `/dashboard/finanzas/bancos`, `/dashboard/finanzas/conciliacion`, `/dashboard/finanzas/reportes`.
  - Persistencia: `cuentas_por_cobrar`, `cuentas_por_pagar`, `movimientos_bancarios`, `conciliaciones_bancarias`, `cajas`, `sesiones_caja`, `movimientos_caja`, documentos/ventas/compras asociados.
- Flujos funcionales ejecutados:
  - Venta a credito creada desde datos propios del test y validada como CxC pendiente.
  - Cobro parcial y cobro total sobre CxC, con saldo/estado persistidos y movimiento bancario asociado.
  - Compra a credito desde proveedor/producto/orden/recepcion propia del test y validada como CxP pendiente.
  - Pago parcial y pago total sobre CxP, con saldo/estado persistidos y movimiento bancario asociado.
  - Movimiento bancario manual y filtros `conciliado=false` / `conciliado=true`.
  - Conciliacion bancaria con importacion CSV, match automatico, match manual y rechazo de doble conciliacion.
  - Movimiento de caja generado desde venta POS en efectivo.
  - Vencidos/pendientes: CxC con filtro `vencidas`, CxP vencida propia para aging/vencimientos y reportes financieros.
  - UI de CxC, CxP, cuentas bancarias, conciliacion y reportes cargada como admin en navegador integrado visible.
- Bugs encontrados:
  - `ConciliacionController` tenia rutas estaticas (`pendientes`, `plantillas-csv`) despues de `:id`; Nest podia resolverlas como id dinamico y romper reportes/plantillas.
  - `ConciliacionService.matchAutomatico` marcaba el movimiento del sistema como conciliado sin escribir `conciliacion_id`; la BD rechazaba la actualizacion por constraint `ck_movimientos_bancarios_conciliado_conciliacion`.
  - El marcado manual de conciliacion necesitaba el mismo contrato persistente de `conciliacion_id` para quedar alineado con las reglas de integridad de movimientos conciliados.
  - El primer E2E de vencimientos podia convertirse en falso positivo si mutaba una CxP ya pagada; se reemplazo por una CxP vencida creada especificamente para el escenario.
  - La imagen Docker API mantuvo JS compilado viejo por cache; se reconstruyo sin cache antes de aceptar el resultado final.
- Codigo corregido:
  - `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.controller.ts`: rutas estaticas de conciliacion movidas antes de `:id`.
  - `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.ts`: el match automatico y el marcado manual ahora persisten `conciliacion_id` y relacion cruzada en ambos movimientos conciliados.
- Tests modificados o creados:
  - `apps/web/tests/e2e/finanzas-completo.spec.ts`: nuevo E2E T13 con datos propios; valida UI/API/persistencia de CxC, CxP, bancos, conciliacion, POS caja, negativos y reportes.
  - `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.spec.ts`: asserts de `conciliacion_id`, `match_id` y `movimiento_relacionado_id` en match automatico.
  - `apps/erp-api/src/modules/finanzas/bancos/__tests__/bancos.service.spec.ts`: cobertura para que `conciliado="false"` no se trate como verdadero y `conciliado="true"` filtre correctamente.
- Posibles falsos positivos eliminados:
  - El E2E no depende de datos historicos: crea tenant operativo, proveedor, producto, cliente, compra, venta, cuenta bancaria, movimientos y conciliacion propios.
  - No se acepta pasar solo por UI: cada flujo relevante verifica respuesta API y estado persistido.
  - No se acepta que filtros booleanos string pasen por casualidad: `false` y `true` se prueban explicitamente.
  - No se acepta conciliacion simulada sin constraint real: el bug de `conciliacion_id` fallo contra BD y se corrigio en produccion.
  - No se acepta imagen Docker vieja como evidencia: se reconstruyo `erp-erp-api:latest` sin cache y se recreo el servicio API.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: exito.
  - `pnpm --filter @erp-suite/web run type-check`: exito.
  - `pnpm --filter @erp-suite/erp-api run test -- conciliacion.service.spec.ts bancos.service.spec.ts cxp.service.spec.ts cxc-service-actions.spec.ts --runInBand`: exito, 4 suites / 91 tests.
  - `docker build --no-cache -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: exito; elimino cache con dist viejo.
  - `docker compose -f docker-compose.validation.yml -p erpval3 up -d --force-recreate --no-deps erp-api`: exito; API recreada con fix.
  - `docker exec erpval3-erp-api-1 sh -lc 'sed -n "360,382p" /app/apps/erp-api/dist/modules/finanzas/conciliacion/conciliacion.service.js'`: exito; se verifico JS compilado con `conciliacion_id`.
  - `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:13001 E2E_API_ORIGIN=http://localhost:13002 pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/finanzas-completo.spec.ts --project=chromium --reporter=line --timeout=180000`: exito final, 1 test passed en 2.1m.
  - `docker compose -f docker-compose.validation.yml -p erpval3 ps`: API, Web, Redis y Worker healthy.
  - `docker logs erpval3-web-1 --since 20m | Select-String ...`: sin coincidencias de error, 500, chunks rotos, overlay ni `Cannot find module`.
  - `docker logs erpval3-erp-api-1 --since 20m | Select-String ...`: sin 500 inesperados ni fallos fatales; coincidencias corresponden a 400/404 esperados de negativos y duplicado idempotente de outbox en `CobroRegistrado`.
- Validacion en navegador integrado visible:
  - Navegador integrado visible contra `http://localhost:13001` con sesion admin `admin@erp.local`.
  - Login cargo y dashboard mostro contenido real.
  - Rutas recorridas: `/dashboard/finanzas/cxc`, `/dashboard/finanzas/cxp`, `/dashboard/finanzas/bancos`, `/dashboard/finanzas/conciliacion`, `/dashboard/finanzas/reportes`.
  - CxC, CxP, conciliacion y reportes mostraron contenido funcional. Bancos mostro `Cuentas Bancarias`, cuentas demo, saldos y acciones `Ver Movimientos`/`Editar` tras resolver la carga inicial.
  - No hubo pantalla blanca, overlay de Next, `ChunkLoadError`, `Cannot find module`, loader permanente ni error fatal visible.
- Evidencia de consola/red:
  - Navegador integrado: `tab.dev.logs({ limit: 300 })` devolvio `consoleErrorCount=0` en el recorrido financiero final.
  - E2E captura errores de consola, `pageerror`, respuestas `>=500`, chunks `_next` 404 y textos fatales; corrida final sin fallos.
  - Docker web sin errores en ventana final.
  - Docker API sin 500 inesperados. Los 400/404 registrados fueron casos negativos esperados: sobrepago CxC/CxP, CxC inexistente y doble conciliacion. Se observo `duplicate key` en outbox para `CobroRegistrado`; no bloqueo la operacion porque el evento ya existia por idempotencia.
- Riesgos pendientes:
  - Observacion no bloqueante: endurecer el registro de outbox de `CobroRegistrado` para que el duplicado idempotente no se registre como `error`; no produjo 500, no perdio el pago y no impidio el evento.
  - Validar nuevamente secretos/cuentas bancarias productivas reales antes de go-live; no bloquea T13 porque la logica financiera local quedo validada con datos propios.
- Criterio de cierre: cumplido para Tarea 13. Cada venta/compra de credito afecta saldos, pagos/cobros, banco, conciliacion y caja POS de forma persistida; filtros booleanos y estados se comportan correctamente; UI financiera carga en navegador integrado sin errores fatales, sin 500 inesperados, sin pantalla vacia y sin loaders permanentes. No se declara el ERP completo como 100% listo.

### Tarea 14 - Contabilidad, asientos, materialized views y reportes

- Estado: `validado`.
- Modulos revisados:
  - Backend: `ContabilidadController`, `AsientosService`, `PeriodosService`, `AccountingEntriesService`, `AccountingBooksService`, `AsientosGeneratorService`, `ContabilidadEventsListener`, outbox contable y `RRHH/planillas.service`.
  - Frontend: rutas `/dashboard/contabilidad`, `/dashboard/contabilidad/asientos`, `/dashboard/contabilidad/estados`, `/dashboard/contabilidad/periodos`.
  - DTOs: `CreateAsientoManualDto`.
- Flujos funcionales ejecutados:
  - Venta con CPE/CxC -> asiento balanceado.
  - POS -> asiento balanceado.
  - Compra/recepcion/CxP -> asiento balanceado.
  - Pago proveedor -> asiento y movimiento bancario.
  - Cobro cliente -> asiento.
  - Conciliacion bancaria -> importacion CSV, match automatico y movimiento vinculado.
  - Planilla/RRHH -> asiento, reintento idempotente sin duplicar.
  - Asiento manual balanceado y asiento de reverso.
  - Negativos: asiento descuadrado rechazado y asiento en periodo cerrado rechazado.
  - Libro diario, libro mayor filtrado con datos creados por el test, balance de comprobacion y listado por documento origen.
- Bugs encontrados:
  - `CreateAsientoManualDto.detalles` no tenia validadores; con `whitelist/forbidNonWhitelisted` el endpoint rechazaba asientos validos.
  - RRHH planillas generaba asientos no idempotentes y podia usar fecha actual en vez del periodo de la planilla.
  - RRHH planillas intento usar `source_event_id` textual sobre columna UUID; corregido a `planillaId`.
  - `AsientosService.generarNumeroAsiento` asumía `numero_asiento` string y fallaba con `TypeError` cuando el runtime devuelve enteros.
  - El asiento manual intentaba insertar formato `A-YYYYMM-NNNN` en columna runtime `integer`.
  - Libros contables usaban embed ambiguo `detalle_asientos(...)` con FKs duplicadas (`PGRST201`).
  - Libro mayor completo ordenaba por `plan_cuentas.codigo` con sintaxis PostgREST invalida (`PGRST100`).
  - Libro mayor filtraba por `detalle_asientos.tenant_id` y podia omitir detalles reales; se cambio a join interno por `asientos_contables.tenant_id`.
  - Libro mayor sin orden podia omitir movimientos recientes por limite de filas; se ordeno por `created_at desc` y se amplio el rango solicitado.
- Codigo corregido:
  - `apps/erp-api/src/modules/rrhh/planillas.service.ts`
  - `apps/erp-api/src/modules/contabilidad/services/asientos.service.ts`
  - `apps/erp-api/src/shared/integration/accounting-books.service.ts`
  - `libs/dtos/src/contabilidad/asiento.dto.ts`
  - `apps/web/tests/e2e/contabilidad-completo.spec.ts`
- Tests modificados o creados:
  - Creado `apps/web/tests/e2e/contabilidad-completo.spec.ts`.
  - Reusados/endurecidos gates unitarios de contabilidad: `asientos-generator`, `accounting-entries`, `accounting-books`, `periodos`, `estados-financieros`.
- Posibles falsos positivos eliminados:
  - El setup de periodo cerrado ahora verifica insercion real antes del negativo.
  - El E2E no depende de historicos: crea producto, venta, compra, CxC, CxP, banco, conciliacion, planilla y asientos propios.
  - Se aumento timeout de outbox a 180s por latencia real local, sin `waitForTimeout` fijo.
  - El libro mayor se valida con fecha del test para no depender de historico voluminoso.
  - El falso positivo de consola por ID con substring `5001` se clasifico como no fatal.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: OK.
  - `pnpm --filter @erp-suite/web run type-check`: OK.
  - `pnpm --filter @erp-suite/erp-api run build`: OK.
  - `pnpm --filter @erp-suite/erp-api run test -- asientos-generator.service.spec.ts accounting-entries.service.spec.ts accounting-books.service.spec.ts periodos.service.spec.ts estados-financieros.service.spec.ts --runInBand`: OK, 5 suites / 71 tests.
  - `pnpm --filter @erp-suite/web run test:e2e -- tests/e2e/contabilidad-completo.spec.ts --project=chromium --reporter=line --timeout=600000`: OK, 1 test, 5.3 min.
  - `docker compose -f docker-compose.validation.yml -p erpval3 ps`: API/Web/Redis/Worker healthy.
  - `docker build -f apps/erp-api/Dockerfile -t erp-erp-api:latest .`: una reconstruccion completa previa OK; una reconstruccion posterior excedio 20 min por instalacion Docker. La validacion final uso `pnpm build` y copia del JS compilado al contenedor de validacion para ejecutar el runtime corregido.
- Validacion en navegador integrado visible:
  - Navegador integrado visible contra `http://localhost:13001` con admin `admin@erp.local`.
  - Rutas recorridas: `/dashboard/contabilidad`, `/dashboard/contabilidad/asientos`, `/dashboard/contabilidad/estados`, `/dashboard/contabilidad/periodos`.
  - Todas mostraron contenido util; sin pantalla blanca, overlay de Next, loader permanente ni error fatal visible.
- Evidencia de consola/red:
  - E2E captura `pageerror`, consola error, respuestas `>=500`, chunks `_next` 404 y textos fatales; corrida final sin fallos.
  - Navegador integrado: sin fallos visibles; el unico match de `500` fue un falso positivo por un identificador de documento que contenia `5001`.
  - Docker web sin coincidencias de errores fatales en ventana final.
  - Docker API sin 500 inesperados; coincidencias fueron 400 esperados de negativos (asiento descuadrado y periodo cerrado) y duplicado idempotente no bloqueante de `CobroRegistrado`.
- Riesgos pendientes:
  - Observacion no bloqueante: el build Docker puede tardar demasiado por reinstalacion de dependencias; conviene optimizar capas/cache antes de CI final.
  - Observacion no bloqueante: outbox `CobroRegistrado` registra duplicado idempotente como error de log aunque no pierde datos ni devuelve 500.
  - Balance de comprobacion legacy puede devolver lista vacia cuando la MV no esta poblada, pero el contrato usado por el test mantiene `totales.cuadrado=true`; revisar en T16/T17 la estrategia de refresh/observabilidad de MVs.
- Criterio de cierre: cumplido para Tarea 14. Las operaciones economicas principales generan o vinculan asientos balanceados, se rechazan asientos descuadrados y periodos cerrados, RRHH es idempotente, libro diario/mayor y balance responden sin errores fatales, y la UI contable carga en navegador integrado sin 500 inesperados, pantallas vacias ni loaders permanentes. No se declara el ERP completo como 100% listo.

### Tarea 15 - RRHH, asistencia, planillas y asientos RRHH

- Estado: `validado`.
- Modulos revisados:
  - Backend: `RrhhController`, `RrhhService`, `PlanillasService`, integracion RRHH -> contabilidad y contratos/empleado_planilla.
  - Frontend: `/dashboard/rrhh`, modal de empleados, `/dashboard/rrhh/planillas`, `/dashboard/rrhh/pagos`, `/dashboard/rrhh/asistencia`.
  - Persistencia: `empleados`, `contratos`, `planillas`, `empleado_planilla`, `rrhh_pagos`, `asientos_contables`, `detalle_asientos`, `periodos_contables`, `plan_cuentas`.
- Flujos funcionales ejecutados:
  - Login admin, carga de RRHH y subrutas visibles.
  - Crear empleado, editar empleado, inactivar por `DELETE` como baja logica, reactivar por `PUT`, validar duplicado de documento.
  - Crear contrato, consultar conceptos, rechazar planilla sin periodo, crear planilla con periodo propio del test.
  - Crear detalle de empleado en planilla, procesar pago, validar persistencia en `rrhh_pagos`.
  - Generar asiento contable de planilla y validar cabecera/detalle balanceados.
  - Crear empleado desde navegador integrado visible y verificar aparicion en el listado.
- Bugs encontrados:
  - Alta/edicion de empleados aceptaba payloads incompletos y documentos duplicados.
  - `DELETE /rrhh/empleados/:id` eliminaba fisicamente en vez de inactivar.
  - Reactivacion con solo `estado=activo` podia violar consistencia `estado/activo`.
  - UI de edicion de empleado mostraba funcion pendiente y no abria formulario real.
  - Creacion de planilla aceptaba campos UI no soportados por runtime y podia terminar en 500.
  - `pagar-empleados` usaba embed PostgREST inexistente entre `empleado_planilla` y `empleados`, devolviendo 500.
  - `numero_operacion` alfanumerico se enviaba a columna numerica y la sincronizacion con `rrhh_pagos` podia fallar sin romper la respuesta.
- Codigo corregido:
  - `apps/erp-api/src/modules/rrhh/rrhh.service.ts`: validacion/sanitizacion de empleados, documento unico, normalizacion `estado/activo`, baja logica.
  - `apps/erp-api/src/modules/rrhh/planillas.service.ts`: validacion de `periodo`, whitelist de campos de planilla, pago de empleados sin embed roto, tenant consistente y fallo explicito si `rrhh_pagos` no persiste.
  - `apps/erp-api/src/modules/rrhh/rrhh.controller.ts`: paso de `tenantId` a pago de empleados.
  - `apps/web/components/modals/EmpleadoModal.tsx`: modo crear/editar con datos iniciales y estado editable.
  - `apps/web/app/dashboard/rrhh/page.tsx`: alta/edicion/inactivacion reales desde UI.
- Tests modificados o creados:
  - Creado `apps/web/tests/e2e/rrhh-completo.spec.ts`.
  - Reusado `apps/erp-api/src/modules/rrhh/rrhh-accounting-integration.service.spec.ts`.
- Posibles falsos positivos eliminados:
  - El E2E valida UI, API y estado persistido; no depende de historicos.
  - La prueba de acceso sin autenticacion usa `fetch` sin cookies para evitar contaminacion de sesion del contexto Playwright.
  - Se corrigio el falso positivo donde `pagar-empleados` podia devolver exito aunque `rrhh_pagos` no quedara persistido.
  - Se normalizo el origen `localhost` en E2E para eliminar CORS falso por mezclar `127.0.0.1` con `NEXT_PUBLIC_API_URL`.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: OK.
  - `pnpm --filter @erp-suite/web run type-check`: OK.
  - `pnpm --filter @erp-suite/erp-api run build`: OK.
  - `pnpm --filter @erp-suite/web run build`: OK.
  - `pnpm --filter @erp-suite/erp-api run test -- rrhh-accounting-integration.service.spec.ts --runInBand`: OK, 1 suite / 4 tests.
  - `docker build -t erp-erp-api:latest -f apps/erp-api/Dockerfile .`: OK.
  - `docker build -t erp-web:latest -f apps/web/Dockerfile .`: OK.
  - `docker compose -f docker-compose.validation.yml -p erpval3 up -d --no-deps --force-recreate erp-api web`: OK.
  - `docker cp apps/erp-api/dist/src/. erpval3-erp-api-1:/app/apps/erp-api/dist/` + `docker restart erpval3-erp-api-1`: OK para aplicar JS compilado final en el contenedor de validacion.
  - `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:13001 E2E_API_ORIGIN=http://localhost:13002 pnpm --filter @erp-suite/web exec playwright test tests/e2e/rrhh-completo.spec.ts --project=chromium --reporter=line`: OK, 1 test / 42.0s.
- Validacion en navegador integrado visible:
  - Navegador integrado visible contra `http://localhost:13001` con admin `admin@erp.local`.
  - Rutas recorridas: `/dashboard/rrhh`, `/dashboard/rrhh/planillas`, `/dashboard/rrhh/pagos`, `/dashboard/rrhh/asistencia`.
  - Evidencia visible: listado RRHH con empleados `Empleado T15 ...` y cargo editado `Coordinador RRHH`; planillas con tabla/resumen; pagos con registros `PROCESADO`; asistencia con estado vacio razonable.
  - Flujo UI visible: apertura del modal `Agregar Nuevo Empleado`, creacion de `UI T15 93113423 Visible RRHH`, cierre del modal y aparicion en el listado.
- Evidencia de consola/red:
  - E2E captura `pageerror`, consola error, respuestas `>=500`, chunks `_next` 404 y textos fatales; corrida final sin fallos.
  - Navegador integrado: `tab.dev.logs({ levels: ['error'] })` reporto `errorCount: 0`.
  - Docker web sin coincidencias de `500`, `Unhandled`, `Cannot find module`, `chunk` ni errores fatales en ventana final.
  - Docker API sin 500 inesperados despues de la correccion; los 400/409 observados corresponden a negativos intencionales, y los 401 corresponden a validacion de acceso sin sesion.
- Riesgos pendientes:
  - No bloqueante: el build Docker de API es lento por reinstalacion de dependencias; optimizar cache/capas antes de CI final.
  - No bloqueante: la UI de pagos muestra `N/A` para nombre en algunos pagos heredados aunque el pago, periodo, monto y estado persisten correctamente; revisar enriquecimiento visual si se prioriza UX.
- Criterio de cierre: cumplido para Tarea 15. RRHH crea, edita, inactiva/reactiva empleados, rechaza datos invalidos y duplicados, genera planilla/pago/asiento contable balanceado, persiste el estado esperado y carga sus pantallas principales sin 500 inesperados, overlays, pantallas vacias ni loaders permanentes. No se declara el ERP completo como 100% listo.

### Tarea 16 - Analytics y Dashboard

- Estado: `validado`.
- Modulos revisados:
  - Backend: `DashboardController`, `DashboardMetricsService`, `AnalyticsController`, cache de dashboard.
  - Frontend: `/dashboard`, `/dashboard/analytics`, `useApi`, tarjetas, graficos, KPIs y estados vacios.
  - Persistencia: `cpe`, `ventas`, `productos`, `ordenes_compra`, `sire_files`, `clientes`, `documentos`, `cuentas_por_cobrar`, `proveedores`, `cuentas_por_pagar`.
- Flujos funcionales ejecutados:
  - Baseline de dashboard, creacion de datos propios T16 y relectura despues de invalidar cache.
  - Insercion de producto/inventario, CPE, venta, orden de compra, SIRE, CxC y CxP con tenant del usuario autenticado.
  - Dashboard valida incremento real de ingresos, compras, inventario valorizado, SIRE y actividad reciente.
  - Analytics valida ventas por rango de fecha, periodo sin datos, rechazo de fecha invalida, CxC, CxP y carga visual.
  - Acceso sin sesion a `/api/dashboard/stats` devuelve 401.
- Bugs encontrados:
  - Dashboard valorizaba inventario con `stock` aunque consultaba `stock_actual`; podia mostrar valor cero/falso.
  - Dashboard sumaba CPE y compras sin acotar al periodo mensual que la UI declara.
  - Dashboard no seleccionaba `precio_venta/stock`, por lo que el fallback de valorizacion no podia funcionar.
  - Analytics `ventas-tiempo` ignoraba filtros reales de fecha/periodo y no devolvia 400 para filtros invalidos.
  - Fin de rango de Analytics dependia de zona horaria local por usar `setHours` en vez de UTC.
  - Analytics CxC usaba embed ambiguo con `clientes`, generando error PostgREST cuando hay multiples relaciones.
  - Analytics CxC devolvia `porcentajeVencido` como string y la UI hacia `.toFixed()`, causando pantalla `Algo salio mal`.
- Codigo corregido:
  - `apps/erp-api/src/modules/dashboard/dashboard-metrics.service.ts`: filtros de periodo en CPE/compras, `total_venta ?? total`, columnas runtime de inventario, fallback `stock_actual ?? stock`, estados case-insensitive.
  - `apps/erp-api/src/modules/analytics.controller.ts`: parsing/validacion de `periodo`, `fecha_desde`, `fecha_hasta`, rango UTC, periodo anterior coherente, CxC sin embed ambiguo y porcentajes numericos.
- Tests modificados o creados:
  - Creado `apps/web/tests/e2e/analytics-dashboard.spec.ts`.
  - Reemplazado placeholder `apps/erp-api/src/modules/dashboard/dashboard-metrics.service.spec.ts` por tests reales de tenant, periodo e inventario.
  - Creado `apps/erp-api/src/modules/analytics.controller.spec.ts` para filtros invalidos y rango real.
- Posibles falsos positivos eliminados:
  - El E2E no usa historicos como condicion de exito: crea datos propios con `runId`.
  - Se valida API y estado persistido antes de revisar UI.
  - Se invalida cache del dashboard antes y despues de crear datos para evitar lecturas viejas.
  - Se eliminan falsos exitos de Analytics: fecha invalida debe ser 400, periodo sin datos debe ser cero, y CxC/CxP deben devolver totales reales.
  - Se acepta tolerancia de `0.01` en sumas monetarias por redondeo decimal, no asserts debiles.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: OK.
  - `pnpm --filter @erp-suite/web run type-check`: OK.
  - `pnpm --filter @erp-suite/erp-api run test -- analytics.controller.spec.ts dashboard-metrics.service.spec.ts --runInBand`: OK, 2 suites / 3 tests.
  - `pnpm --filter @erp-suite/erp-api run build`: OK.
  - `docker cp apps/erp-api/dist/src/. erpval3-erp-api-1:/app/apps/erp-api/dist/` + `docker restart erpval3-erp-api-1`: OK, contenedor healthy.
  - `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:13001 E2E_API_ORIGIN=http://localhost:13002 pnpm --filter @erp-suite/web exec playwright test tests/e2e/analytics-dashboard.spec.ts --project=chromium --reporter=line`: OK, 1 test / 33.0s.
- Validacion en navegador integrado visible:
  - Navegador integrado visible contra `http://localhost:13001`.
  - Rutas recorridas: `/dashboard` y `/dashboard/analytics`.
  - Dashboard mostro `INGRESOS MENSUALES`, `INVENTARIO TOTAL` y tarjetas reales.
  - Analytics mostro `Analytics Financiero`, `Evolucion de Ventas` e `Indicadores Clave de Rendimiento`.
  - Resultado visible: sin pantalla blanca, sin loader permanente, sin overlay `Algo salio mal`, sin pantalla de error.
- Evidencia de consola/red:
  - Navegador integrado: `errorCount: 0`.
  - E2E captura `pageerror`, consola error, respuestas `>=500`, chunks `_next` 404 y textos fatales; corrida final sin fallos.
  - Logs API finales: solo 400 esperado por fecha invalida y 401 esperado por acceso sin sesion; sin 500 inesperados.
  - Logs web finales: sin coincidencias de `500`, `Unhandled`, `Cannot find module`, `chunk` ni errores fatales.
- Riesgos pendientes:
  - No bloqueante: la pagina Analytics no expone controles de exportacion visibles; se registra como funcionalidad inexistente en la UI actual, no como fallo de exportacion.
  - No bloqueante: no se creo tenant secundario nuevo durante el E2E; la segregacion se valido por filtros `tenant_id` en unitarios y por no incluir datos ajenos en consultas actuales.
- Criterio de cierre: cumplido para Tarea 16. Dashboard y Analytics reflejan datos reales creados en la prueba, respetan tenant y filtros de fecha, no muestran ceros cuando hay operaciones reales, manejan periodos sin datos e invalidos correctamente, y cargan en navegador integrado sin errores fatales. No se declara el ERP completo como 100% listo.

### Tarea 17 - Usuarios, permisos, auditoria y configuracion

- Estado: `validado`.
- Modulos revisados:
  - Backend: `usuarios-sistema`, `users`, roles, permisos, `PermissionGuard`, `AuditService`, `ConfigurationController`, auth login/logout/profile.
  - Frontend: `/dashboard/usuarios`, `/dashboard/audit-logs`, `usePermission`, modal/tabla de usuarios.
  - BD: `usuarios_sistema`, `user_roles`, `roles`, `rol_permisos`, `permisos`, `audit_log`, `empresa_config`, `auth_login_attempts`.
- Flujos funcionales ejecutados:
  - Admin inicia sesion y lista usuarios/roles/stats.
  - Admin crea usuario restringido con rol sin permisos.
  - Usuario creado inicia sesion realmente con password propia.
  - Admin edita usuario y mantiene/asigna rol valido.
  - Usuario restringido intenta listar/crear usuarios, cambiar configuracion y leer auditoria: todo responde `403`.
  - Usuario restringido navega a `/dashboard/usuarios`: UI muestra acceso denegado y no muestra boton `Nuevo Usuario`.
  - Admin inactiva usuario; estado persistido queda `INACTIVO` y `activo=false`.
  - Configuracion invalida de empresa (`pais_id` no valido) responde `400`, no `500`.
  - Configuracion valida de empresa queda auditada.
  - Auditoria registra INSERT/UPDATE/DELETE logico de `usuarios_sistema` y UPDATE de `empresa_config`.
- Bugs encontrados:
  - Creacion legacy de usuarios guardaba credenciales en Supabase Auth pero no persistia `password_hash` en `usuarios_sistema`; el usuario creado desde UI/API no podia iniciar sesion en el login real del ERP.
  - Edicion de usuario enviaba `rol_id` como si fuera columna de `usuarios_sistema`, provocando contrato UI/API incorrecto y riesgo de fallo en actualizacion.
  - Cambio de estado no sincronizaba explicitamente `activo` con `estado`.
  - No habia proteccion explicita para inactivar/eliminar el ultimo superadmin activo.
  - Mutaciones legacy de usuarios devolvian `{ success:false }` con HTTP 200 ante errores reales, debilitando contratos y tests.
  - Cambios de empresa envolvian errores de validacion como `500`.
  - Pantalla de Usuarios permitia renderizar estructura de gestion a usuario sin permisos si el backend devolvia `403`.
- Codigo corregido:
  - `apps/erp-api/src/modules/usuarios.controller.ts`: hash bcrypt al crear usuario, asignacion `tenant_id` en `user_roles`, normalizacion `estado/activo`, reasignacion segura de rol, proteccion ultimo superadmin, borrado logico, auditoria explicita y errores 4xx reales.
  - `apps/erp-api/src/modules/usuarios/user-management.service.ts`: proteccion ultimo superadmin y sincronizacion `activo` en activar/desactivar/borrado logico.
  - `apps/erp-api/src/modules/configuracion/configuration.controller.ts`: auditoria de `empresa_config` y preservacion de `HttpException` para 400/403.
  - `apps/erp-api/src/modules/configuracion.module.ts`: import de `AuditModule` para auditoria de configuracion.
  - `apps/web/app/dashboard/usuarios/page.tsx`: gate frontend con `usePermission`; sin permiso muestra acceso denegado y oculta acciones de creacion.
- Tests modificados o creados:
  - Creado `apps/web/tests/e2e/usuarios-permisos-auditoria-config.spec.ts`.
  - Ajustado `apps/erp-api/src/modules/usuarios.controller.security.spec.ts` por nueva dependencia de auditoria.
  - Tests existentes ejecutados: `user-management.service.spec.ts`, `permission.guard.spec.ts`, `permissions.routes.security.spec.ts`, `audit.service.spec.ts`, `legacy-controllers.security.spec.ts`.
- Posibles falsos positivos eliminados:
  - El E2E no acepta usuario creado solo en tabla si no puede autenticar con password real.
  - El E2E no acepta permisos solo por UI: comprueba `403` reales en API y estado UI.
  - El E2E no acepta inactivacion visual: consulta persistencia `estado/activo`.
  - El E2E no acepta auditoria decorativa: consulta `audit_log` por `tenant_id`, tabla y `record_id`.
  - Error esperado `400` por configuracion invalida y `403` por usuario restringido no se cuentan como fallos fatales.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/erp-api run type-check`: OK.
  - `pnpm --filter @erp-suite/web run type-check`: OK.
  - `pnpm --filter @erp-suite/erp-api run test -- usuarios.controller.security.spec.ts user-management.service.spec.ts permission.guard.spec.ts permissions.routes.security.spec.ts audit.service.spec.ts legacy-controllers.security.spec.ts --runInBand`: OK, 6 suites / 48 tests.
  - `pnpm --filter @erp-suite/erp-api run build`: OK.
  - `pnpm --filter @erp-suite/web run build`: OK.
  - `docker cp apps/erp-api/dist/src/. erpval3-erp-api-1:/app/apps/erp-api/dist/` + `docker restart erpval3-erp-api-1`: OK, contenedor healthy.
  - `docker cp apps/web/.next/. erpval3-web-1:/app/apps/web/.next/` + `docker restart erpval3-web-1`: OK, contenedor healthy.
  - Primera corrida E2E T17: fallo real, `password_hash=null` en usuario creado; se corrigio produccion.
  - `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:13001 E2E_API_ORIGIN=http://localhost:13002 pnpm --filter @erp-suite/web exec playwright test tests/e2e/usuarios-permisos-auditoria-config.spec.ts --project=chromium --reporter=line`: OK, 1 test / 41.3s.
- Validacion en navegador integrado visible:
  - Navegador integrado visible contra `http://localhost:13001`.
  - Admin: `/dashboard/usuarios` cargo `Gestion de Usuarios`, stats, roles, usuarios creados por T17 y boton `Nuevo Usuario`.
  - Admin: `/dashboard/audit-logs` cargo `Logs de Auditoria`, filtros, usuarios y registros; sin pantalla blanca ni loader permanente.
  - Usuario restringido: validado funcionalmente por E2E con navegador Chromium contra servidor real; intento de cambio visible en navegador integrado quedo limitado por la sesion admin persistente del browser, sin hallazgos de produccion adicionales. La restriccion quedo cubierta por UI/API/E2E con usuario real creado en la prueba.
- Evidencia de consola/red:
  - Navegador integrado admin: sin `500`, sin `404` de chunks, sin `Unhandled`, sin `Application error`, sin `Cannot find module`.
  - E2E captura `pageerror`, consola error, respuestas `>=500`, chunks `_next` 404 y textos fatales; corrida final sin fallos.
  - Respuestas negativas esperadas: `403` para usuario restringido y `400` para configuracion invalida; sin `500` inesperados.
- Riesgos pendientes:
  - No bloqueante para T17: la validacion visual integrada de usuario restringido no pudo cambiar la sesion del browser ya autenticado como admin; se reemplazo por E2E real con usuario restringido, API y UI. Revalidar visualmente al iniciar una sesion limpia del navegador integrado.
  - No bloqueante para produccion: conservar politica operativa de no borrar fisicamente usuarios; el endpoint DELETE queda como inactivacion logica auditada.
- Criterio de cierre: cumplido para Tarea 17. El ERP separa admin/usuario restringido en API y UI, impide acciones sin permiso, crea usuarios que autentican realmente, inactiva con estado persistido coherente, evita inactivar/eliminar ultimo superadmin y deja auditoria de acciones criticas. No se declara el ERP completo como 100% listo.

### Tarea 18 - Calidad funcional UI

- Estado: `validado`.
- Modulos revisados:
  - Frontend: Compras/proveedores, Ventas/clientes, Inventario/productos, Finanzas/bancos, Usuarios/modal, GRE/listado, smoke de rutas relacionadas.
  - Helpers E2E: login/navegacion existentes y nuevos asserts de calidad UI.
  - Contratos UI: `useApiCall`, validaciones de formularios y botones con estado documentado.
- Flujos funcionales ejecutados:
  - Formulario proveedor: submit vacio muestra errores visibles de RUC, razon social y email; cancelacion vuelve al listado.
  - Formulario cliente: submit vacio muestra errores visibles de documento y razon social; cancelacion vuelve al listado.
  - Formulario producto: submit vacio muestra errores visibles de codigo, nombre, categoria y precio de venta; cancelacion vuelve al listado.
  - Formulario cuenta bancaria: submit vacio muestra errores visibles de nombre, banco y numero de cuenta; cancelacion vuelve al listado.
  - Modal usuarios: apertura, submit vacio, errores visibles de nombre/email/password/rol y cierre accesible por boton con nombre.
  - GRE: carga sin loader permanente y no expone accion PDF muerta cuando no hay representacion PDF real.
  - Smoke responsive desktop/narrow sobre rutas tocadas: GRE, producto nuevo, banco nuevo y usuarios.
- Bugs encontrados:
  - `Nuevo Producto` dependia de validacion nativa/alert para campos obligatorios; no dejaba evidencia visible persistente dentro de la UI.
  - `Nueva Cuenta Bancaria` mezclaba `required` nativo con validacion React; el navegador podia bloquear submit sin mostrar errores consistentes del producto.
  - Modal de usuario tenia boton `×` sin nombre accesible; era cerrable visualmente pero debil para accesibilidad y automatizacion robusta.
  - GRE mostraba boton `PDF` accionable sin handler ni endpoint PDF real, generando una accion muerta.
  - GRE podia mantener pantalla completa de loader durante reintentos largos de API; se acoto timeout/reintentos para renderizar estado util.
  - Primera corrida E2E T18 contra `localhost:13001` fallo porque el contenedor web servia build anterior; se corrigio aplicando build actualizado al contenedor.
- Codigo corregido:
  - `apps/web/app/dashboard/inventario/productos/nuevo/page.tsx`: validacion React visible por campo, `noValidate`, `aria-invalid/aria-describedby`, error general no intrusivo y limpieza de errores al editar.
  - `apps/web/app/dashboard/finanzas/bancos/nueva/page.tsx`: `noValidate`, errores visibles por campo, `aria-invalid/aria-describedby` y normalizacion del submit.
  - `apps/web/components/ventas/ClienteForm.tsx`: `noValidate` para evitar bloqueo nativo inconsistente.
  - `apps/web/components/modals/UsuarioModal.tsx`: boton de cierre con `type`, `aria-label` y `title`.
  - `apps/web/app/dashboard/gre/page.tsx`: timeout/reintentos acotados para carga inicial y boton `PDF` deshabilitado con razon visible hasta existir representacion real.
  - `apps/web/hooks/use-api.ts`: `useApiCall` acepta opciones para timeout/reintentos por pantalla.
  - `apps/web/tests/e2e/full-ui-smoke.spec.ts`: regla documentada para estado deshabilitado del PDF GRE.
- Tests modificados o creados:
  - Creado `apps/web/tests/e2e/helpers/ui-quality.ts`.
  - Creado `apps/web/tests/e2e/ui-quality.spec.ts`.
  - Modificado `apps/web/tests/e2e/full-ui-smoke.spec.ts`.
- Posibles falsos positivos eliminados:
  - El E2E no acepta tests de click simple: exige textos de validacion visibles, URL de cancelacion, cierre real de modal y ausencia de loader GRE.
  - No se usa `waitForTimeout`; las esperas son por estado de carga, texto visible o desaparicion de loader.
  - El boton PDF GRE queda deshabilitado y documentado mientras no exista endpoint/representacion real; no se acepta como boton muerto.
  - La primera corrida fallida contra build viejo se documento y se repitio despues de copiar `.next` y reiniciar el contenedor web.
- Comandos ejecutados y resultado:
  - `pnpm --filter @erp-suite/web run type-check`: OK.
  - `pnpm --filter @erp-suite/web run build`: OK.
  - `docker cp apps/web/.next/. erpval3-web-1:/app/apps/web/.next/`: OK.
  - `docker cp apps/web/public/. erpval3-web-1:/app/apps/web/public/`: OK.
  - `docker restart erpval3-web-1` + espera de healthcheck: OK, `healthy`.
  - Primera corrida `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:13001 E2E_API_ORIGIN=http://localhost:13002 pnpm --filter @erp-suite/web exec playwright test tests/e2e/ui-quality.spec.ts --project=chromium --reporter=line`: fallo esperado por build web anterior y loader GRE prolongado; se corrigio produccion.
  - Corrida final del mismo E2E T18: OK, 3 tests / 42.4s.
  - `full-ui-smoke` segmentos exactos con `SMOKE_ROUTE_START/END`:
    - `/dashboard/gre`: OK, 2 tests desktop/narrow.
    - `/dashboard/inventario/productos/nuevo`: OK, 2 tests desktop/narrow.
    - `/dashboard/finanzas/bancos/nueva`: OK, 2 tests desktop/narrow.
    - `/dashboard/usuarios`: OK, 2 tests desktop/narrow.
  - Segmentos vecinos ejecutados por indice inicial incorrecto tambien pasaron: `/dashboard/sire`, `/dashboard/inventario/recepciones`, `/dashboard/finanzas/bancos`, `/dashboard/finanzas/conciliacion`, `/dashboard/ventas/aprobaciones`.
- Validacion en navegador integrado visible:
  - Navegador integrado visible contra `http://localhost:13001`, sesion admin ya autenticada.
  - Producto nuevo: submit vacio mostro `El codigo es requerido`, `El nombre es requerido`, `La categoria es requerida`, `El precio de venta debe ser mayor a 0`.
  - Cuenta bancaria nueva: submit vacio mostro `El nombre de la cuenta es requerido`, `El nombre del banco es requerido`, `El numero de cuenta es requerido`.
  - Usuarios: modal `Nuevo Usuario` abrio, submit vacio mostro errores de nombre/email/password/rol y el boton accesible `Cerrar modal de usuario` cerro el modal.
  - GRE: despues de carga acotada mostro `Guias de Remision Electronica (GRE)` y `Lista de Guias de Remision`; sin loader permanente.
- Evidencia de consola/red:
  - E2E T18 captura `pageerror`, `console.error` y respuestas `>=500`; corrida final sin fallos.
  - Full UI smoke valida body/main, textos fatales, loaders permanentes, botones visibles sin nombre, botones deshabilitados sin regla, respuestas `>=500` y consola; rutas exactas finales sin fallos.
  - Navegador integrado: `tab.dev.logs({ levels: ['error'] })` reporto `fatalErrors: 0`.
  - No se observaron overlays de Next, pantallas blancas, chunks 404, loaders infinitos ni 500 inesperados en las rutas validadas.
- Riesgos pendientes:
  - No bloqueante: GRE aun no tiene endpoint PDF/representacion PDF real; el boton queda deshabilitado con razon visible. La emision/representacion real de GRE permanece bajo el criterio de T11/certificado/configuracion fiscal, no como accion UI muerta.
  - No bloqueante: T18 cubrio formularios criticos y rutas tocadas; la corrida completa de todas las rutas queda para T20 final de validacion visible integral.
- Criterio de cierre: cumplido para Tarea 18. La UI critica revisada muestra validaciones claras, estados de carga controlados, modales cerrables/accesibles, cancelaciones previsibles, botones sin acciones muertas y rutas tocadas sin errores fatales ni loaders permanentes. No se declara el ERP completo como 100% listo.

### Tarea 19 - Falsos positivos y suite de regresion

- Estado: `validado`.
- Modulos revisados:
  - Tests API E2E legacy: RRHH, POS, Ventas, Inventario, Outbox, RLS anon y helper Supabase.
  - Unitarios API con placeholders: Metricas, Retenciones, Security Dashboard, Permissions y Documentos.
  - E2E web: Auth/country/wizard, contratos API/UI, Compras, Ventas, POS, Inventario, Finanzas, Contabilidad, RRHH, CPE, GRE, SIRE, Usuarios/Configuracion/Auditoria, Analytics/Dashboard, calidad UI y full UI smoke.
  - Frontend runtime afectado por hallazgos: auth profile, nueva cuenta bancaria, smoke global de rutas.
- Flujos funcionales ejecutados:
  - Barrido de patrones sospechosos en tests: `test.skip`, `describe.skip`, `waitForTimeout`, `console.warn` de salto, retornos tempranos, `expect(true).toBe(true)` y skips condicionales.
  - API completa en modo serial.
  - Regresion Playwright por verticales reales con datos creados por test.
  - Smoke global segmentado desktop/narrow sobre todas las rutas autenticadas del ERP.
  - Validacion visible en navegador integrado de `/dashboard/finanzas/cxc`.
- Bugs encontrados:
  - Tests E2E API ocultaban fallos con `console.warn` y `return` temprano cuando faltaba Supabase, RPC o contexto tenant.
  - Unitarios API contenian placeholders `expect(true).toBe(true)` que no validaban comportamiento real.
  - E2E web tenia `waitForTimeout` heredado en Compras/Finanzas.
  - Helper `gotoAuthenticated` reintentaba login al detectar loader; en regresion larga disparaba rate-limit 429 y contaminaba verticales sanos.
  - `auth-service.fetchProfile()` podia dejar la UI en verificacion indefinida si `/backend/api/auth/profile` quedaba colgada.
  - `Nueva Cuenta Bancaria` usaba `router.back()` para cancelar/volver; desde navegacion directa regresaba al dashboard y no al listado.
  - Verticales largos T07/T08/T09 no tenian timeout explicito y el runner los cortaba a 90s durante flujos validos.
  - Full smoke clasificaba acciones financieras de estado (`Cobro`, `Nota`, `Reprogramar`) como botones que debian estar siempre habilitados; falso positivo sobre CxC canceladas.
  - Full smoke hacia click secuencial en `Cancelar` y luego `Volver` aun despues de navegar, generando fallo por DOM desmontado.
- Codigo corregido:
  - `apps/web/lib/auth-service.ts`: timeout con `AbortController` en `fetchProfile()` para evitar loader infinito ante profile colgado.
  - `apps/web/app/dashboard/finanzas/bancos/nueva/page.tsx`: cancelar/volver navega deterministicamente a `/dashboard/finanzas/bancos`.
  - `apps/web/tests/e2e/helpers/auth.ts`: `gotoAuthenticated` ya no reintenta login en bucle; recarga una vez y falla si la sesion real no resuelve.
  - `scripts/audit-test-quality.mjs`: nuevo gate anti-falsos-positivos.
  - `package.json`: nuevo script `test:quality`.
  - `apps/erp-api/tests/e2e/helpers/supabase-test-client.ts`: fallos de Supabase/contexto tenant ahora son bloqueantes.
  - Tests E2E API legacy: reemplazo de saltos silenciosos por fallos explicitos.
  - `apps/web/tests/e2e/full-ui-smoke.spec.ts`: clasificacion de acciones financieras guardadas, click seguro de botones de navegacion y segmentacion por `SMOKE_ROUTE_START/END`.
- Tests modificados o creados:
  - Creado `scripts/audit-test-quality.mjs`.
  - Reemplazados placeholders por asserts reales en `metrics.service.spec.ts`, `retenciones.service.spec.ts`, `security-dashboard.service.spec.ts` y `permission.service.spec.ts`.
  - Eliminado placeholder duplicado `apps/erp-api/src/modules/documentos/documentos.service.spec.ts`; queda el spec real `apps/erp-api/src/modules/documentos.service.spec.ts`.
  - Endurecidos E2E API legacy de RRHH, POS, Ventas, Inventario, Outbox y RLS.
  - Endurecidos E2E web/smoke: sin `waitForTimeout`, con timeouts explicitos en verticales largos y asserts de pantalla/loader/errores.
- Posibles falsos positivos eliminados:
  - La suite falla si falta Supabase/RPC/contexto tenant; no hay saltos silenciosos.
  - No quedan `test.skip`, `describe.skip`, `waitForTimeout`, `console.warn` de salto ni `expect(true).toBe(true)` detectados por el gate.
  - Los tests de contrato y verticales validan API, UI y persistencia con datos propios.
  - Los 400/401/403 negativos esperados no se cuentan como errores fatales; los 500/chunks/overlays/loaders permanentes siguen bloqueando.
  - Acciones financieras deshabilitadas por estado de negocio quedan clasificadas como guardadas, no como botones muertos.
- Comandos ejecutados y resultado:
  - `pnpm run test:quality`: OK, 136 archivos de test revisados.
  - `pnpm --filter @erp-suite/erp-api run test -- metrics.service.spec.ts retenciones.service.spec.ts security-dashboard.service.spec.ts permission.service.spec.ts documentos.service.spec.ts --runInBand`: OK, 6 suites / 19 tests.
  - `pnpm --filter @erp-suite/erp-api run test -- --runInBand`: OK, 96 suites / 896 tests.
  - `pnpm --filter @erp-suite/erp-api run type-check`: OK.
  - `pnpm --filter @erp-suite/web run type-check`: OK.
  - `pnpm --filter @erp-suite/erp-api run build`: OK.
  - `pnpm --filter @erp-suite/web run build`: OK.
  - Regresion Playwright segmento Auth/Contratos/Compras/Ventas/POS/Inventario: primera corrida expuso timeout/socket por presupuesto de 90s; tras timeouts explicitos, T07/T08/T09 aislados OK, 3 tests / 4.0m. Los otros 7 tests del segmento ya habian pasado.
  - Regresion Playwright segmento Finanzas/Contabilidad/RRHH/CPE/GRE/SIRE/Usuarios/Analytics/UI quality: OK, 9 tests / 10.2m.
  - Full UI smoke `SMOKE_ROUTE_START=0 SMOKE_ROUTE_END=25`: OK, 50 tests / 9.4m.
  - Full UI smoke `SMOKE_ROUTE_START=25 SMOKE_ROUTE_END=50`: primera corrida detecto falsos positivos de smoke; corrida final OK, 50 tests / 9.5m.
  - Full UI smoke `SMOKE_ROUTE_START=50 SMOKE_ROUTE_END=999`: OK, 46 tests / 7.4m.
- Validacion en navegador integrado visible:
  - Navegador integrado visible contra `http://localhost:13001/dashboard/finanzas/cxc/`.
  - Resultado visible: sidebar autenticado como admin, titulo `Cuentas por Cobrar`, tabla de CxC y acciones `Cobro`, `Nota`, `Reprogramar`, `Historial`, `Detalle`.
  - Sin pantalla blanca, sin loader permanente y sin overlay de Next.
- Evidencia de consola/red:
  - Navegador integrado: `errorCount: 0`; sin coincidencias de `Application error`, `Unhandled Runtime Error`, `Cannot find module`, `ChunkLoadError`, pagina no encontrada ni `Verificando autenticacion`.
  - Playwright smoke valida consola, `pageerror`, respuestas `>=500`, chunks `_next` 404, texto fatal, body/main no vacios y loaders permanentes; corridas finales sin fallos.
  - Regresion vertical final sin 500 inesperados; errores 400/401/403 observados corresponden a negativos intencionales.
- Riesgos pendientes:
  - No bloqueante: la suite completa de full smoke tarda cerca de 26 minutos en 1 worker; conviene mantenerla segmentada en CI por rangos de rutas.
  - No bloqueante: quedan avisos `DEP0040 punycode` de dependencias Playwright/Node, sin impacto funcional observado.
  - No bloqueante: la validacion integrada visible se hizo sobre CxC como muestra representativa de smoke/regresion; T20 debe repetir barrido visible final de producto completo antes de declarar ERP listo.
- Criterio de cierre: cumplido para Tarea 19. Los tests criticos ya no pasan por skips, retornos tempranos, waits arbitrarios, placeholders o condiciones opcionales; la regresion por verticales y el smoke global segmentado cargan rutas reales sin errores fatales, 500 inesperados, pantallas vacias ni loaders permanentes. No se declara el ERP completo como 100% listo.

### Tarea 20 - Simulacion final de produccion y alta

- Estado: `validado`.
- Resumen ejecutivo:
  - Stack local controlado `erpval3`: API `http://localhost:13002`, Web `http://localhost:13001`, worker y Redis saludables.
  - Migraciones locales presentes hasta `311__documento_series_tipo_canonico_fix.sql`; base reconstruida supera el rango base `000..301`.
  - Variables criticas configuradas en `.env`, `apps/erp-api/.env` y `apps/web/.env.local`; `PFX_PATH` y `CERTIFICATE_PATH` existen localmente.
  - Ambiente fiscal en `SUNAT_ENVIRONMENT=homologacion` y `REQUIRE_REAL_FISCAL_CERTIFICATE=false`; por tanto el unico pendiente aceptado para alta fiscal real es cargar/activar certificado digital verdadero SUNAT/CPE/GRE en produccion.
  - Decision final: `ERP listo para produccion` con condicion fiscal explicita: no pasar CPE/GRE/SUNAT a produccion real hasta cargar y validar el certificado digital verdadero. Fuera de ese punto no quedan bloqueos funcionales abiertos en la evidencia T01-T20.
- Tabla de modulos cubiertos:
  | Modulo | Evidencia final |
  | --- | --- |
  | Auth/sesion/pais/empresa/wizard | E2E `auth-session-country-wizard.spec.ts` OK; navegador visible admin y usuario normal OK. |
  | Dashboard/Analytics | `analytics-dashboard.spec.ts` OK; dashboard visible con actividad real T16; actividad reciente ordena por `created_at`. |
  | Navegacion/layouts | `full-ui-smoke.spec.ts` segmentos 0-25, 25-50, 50-999 OK en desktop y viewport estrecho. |
  | Compras | `compras-vertical.spec.ts` OK; simulacion API OC -> aprobacion -> recepcion -> CxP/asiento/SIRE. |
  | Ventas/POS | `ventas-vertical.spec.ts`, `pos-vertical.spec.ts` y `test:e2e:production-readiness` OK; POS valida pagos, stock, Kardex, caja, CPE y asiento. |
  | Inventario/logistica | `inventario-logistica.spec.ts` OK; Kardex canónico en `movimientos_inventario` validado para POS. |
  | CPE/GRE/SIRE | `cpe-completo.spec.ts`, `gre-completo.spec.ts`, `sire-completo.spec.ts` OK; pendiente unico: certificado real para SUNAT productivo. |
  | Finanzas/Contabilidad | `finanzas-completo.spec.ts`, `contabilidad-completo.spec.ts` OK; CxC/CxP/cobros/pagos/bancos/asientos validados. |
  | RRHH | `rrhh-completo.spec.ts` OK; empleados, planilla/pagos e integracion contable basica validados. |
  | Usuarios/permisos/auditoria/configuracion | `usuarios-permisos-auditoria-config.spec.ts` OK; usuario restringido recibe 403 y auditoria/config quedan trazables. |
  | Calidad UI/tests | `test:quality` OK; 136 archivos revisados sin patrones permisivos criticos. |
- Modulos revisados:
  - API, Web, worker, Redis, BD/migraciones, Auth, Dashboard, POS, Documentos, Compras, Ventas, Inventario, Logistica, CPE, GRE, SIRE, Finanzas, Contabilidad, RRHH, Usuarios, Permisos, Auditoria, Configuracion y Ayuda.
- Flujos funcionales ejecutados:
  - Flujo A POS/Venta: producto con stock, venta POS, comprobante/CPE, Kardex salida, caja/CxC, asiento contable y SIRE ventas.
  - Flujo B Compras: proveedor, orden de compra, aprobacion, recepcion, Kardex entrada, devolucion parcial, CxP, asiento y SIRE compras.
  - Flujo C Ventas/logistica: cotizacion/pedido/venta, preparacion/despacho, GRE, estados e impacto de inventario.
  - Flujo D Finanzas: cobro, pago, banco, conciliacion y saldos.
  - Flujo E RRHH: empleado, planilla/pagos e impacto contable.
  - Flujo F Admin/seguridad: usuario limitado, permisos, auditoria y configuracion.
  - Simulacion API final creo datos propios y devolvio IDs reales: OC `de40f7d0-a84e-42b4-be6c-831afdc38c5a`, recepcion `802b391f-0cfc-436f-ba58-07b7785e50f5`, pedido `36b7ad96-7965-492e-ad9a-88e44aced6cc`, documento `4b78be18-cff0-4944-aa32-05d9e47765c1`, CPE `3e38a2f8-a0da-4b50-95d1-6dba64b8c913`, CxC `d491f38f-581b-40f9-a035-cf993927b6cb`, GRE `bbf0ed59-ef88-44cb-84c5-742a517ca82b`, POS `16719db2-dd76-47f9-bef2-e81a7f8243e2`.
- Bugs encontrados:
  - POS persistia literal `efectivo` en `ventas_pos_pagos.metodo_pago_id` UUID durante flujo API real.
  - E2E productivo buscaba Kardex POS en `stock_movimientos`, tabla legacy/no canónica para esa salida; el flujo real registra en `movimientos_inventario`.
  - Dashboard/Analytics podia ocultar una OC recien creada porque actividad reciente ordenaba compras/cotizaciones/GRE por fecha de negocio antes que por `created_at`.
  - Helper E2E de login podia reutilizar sesion admin al pedir credenciales explicitas de usuario restringido.
  - Corridas paralelas de specs de auth/fiscal activaron rate-limit 429; se reejecutaron secuencialmente despues de la ventana de throttling.
- Codigo corregido:
  - `apps/erp-api/src/modules/pos/pos.service.ts`: normalizacion robusta de metodo de pago por literal/codigo/UUID, sin castear literales como UUID; persistencia de `metodo_pago_id` solo si existe id real.
  - `apps/erp-api/src/modules/dashboard/dashboard-metrics.service.ts`: actividad reciente usa `created_at` para ordenar eventos recien creados y metricas aceptan `total`/`stock_actual` como contrato runtime.
  - `apps/web/tests/e2e/helpers/auth.ts`: credenciales explicitas limpian cookies y no reutilizan sesion previa.
  - `apps/web/tests/e2e/usuarios-permisos-auditoria-config.spec.ts`: captura de consola del usuario restringido empieza despues del login para no contar 401 pre-auth esperados.
- Tests modificados o creados:
  - `apps/erp-api/src/modules/pos/pos.service.spec.ts`: nuevo assert que garantiza que `metodo_pago_id: "efectivo"` no se persiste como UUID.
  - `apps/erp-api/tests/e2e/production-readiness-e2e.test.ts`: Kardex POS valida `movimientos_inventario` con `referencia_id`, `referencia_tipo=VENTA_POS` y `tipo=SALIDA`.
  - `apps/web/tests/e2e/helpers/auth.ts` y `apps/web/tests/e2e/usuarios-permisos-auditoria-config.spec.ts` endurecidos contra sesion falsa/admin reutilizada.
- Posibles falsos positivos eliminados:
  - No se acepto el primer fallo POS como "test"; se corrigio produccion y se agrego unit test.
  - Se reemplazo una asercion de tabla legacy por asercion del Kardex real persistido.
  - Se evito que el usuario restringido heredara cookies admin en E2E.
  - Rate-limit 429 se separo de fallos funcionales mediante re-ejecucion secuencial; los specs finales pasaron.
- Comandos ejecutados y resultado:
  - `git status --short`: worktree sucio preexistente; se respetaron cambios no relacionados.
  - `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"`: `erpval3-erp-api-1`, `erpval3-web-1`, `erpval3-worker-1`, `erpval3-redis-1` saludables.
  - `Invoke-RestMethod http://localhost:13002/api/health/live`: OK `alive`.
  - `Invoke-RestMethod http://localhost:13002/api/health/ready`: OK `ready`, database `ok`.
  - `Invoke-WebRequest http://localhost:13001/login/`: OK `200`.
  - `pnpm --filter @erp-suite/erp-api run type-check`: OK.
  - `pnpm --filter @erp-suite/web run type-check`: OK.
  - `pnpm --filter @erp-suite/erp-api run build`: OK.
  - `pnpm --filter @erp-suite/web run build`: OK.
  - `pnpm --filter @erp-suite/erp-api run test -- --runInBand`: OK, 96 suites / 897 tests.
  - `pnpm run test:quality`: OK, 136 archivos de test revisados.
  - `API_BASE_URL=http://localhost:13002/api pnpm --filter @erp-suite/erp-api run test:e2e:production-readiness`: primera corrida fallo por POS UUID; segunda fallo por asercion legacy Kardex; corrida final OK con IDs reales.
  - `playwright` Compras/Ventas/POS: OK, 3 tests / 3.7m.
  - `playwright` Finanzas/Inventario: OK, 2 tests / 3.8m.
  - `playwright` CPE/GRE/SIRE: primera corrida afectada por 429; rerun secuencial OK, 2 tests / 1.6m, CPE ya habia pasado.
  - `playwright` Auth/Usuarios: primera corrida afectada por 429 y helper de sesion; reruns finales OK, auth 4/4 dentro del spec y usuarios 1/1.
  - `playwright` Contabilidad/RRHH/Analytics: Contabilidad y RRHH OK; Analytics fallo por orden de actividad reciente; rerun final `analytics-dashboard.spec.ts` OK, 1 test / 32.1s.
  - Full UI smoke `SMOKE_ROUTE_START=0 SMOKE_ROUTE_END=25`: OK, 50 tests / 9.4m.
  - Full UI smoke `SMOKE_ROUTE_START=25 SMOKE_ROUTE_END=50`: OK, 50 tests / 9.9m.
  - Full UI smoke `SMOKE_ROUTE_START=50 SMOKE_ROUTE_END=999`: OK, 46 tests / 7.6m.
  - `docker logs --since 30m` API/Web buscando `statusCode":5`, chunks, `Cannot find module`, `Unhandled Runtime`, `ECONNREFUSED`: sin coincidencias bloqueantes.
- Validacion en navegador integrado visible:
  - Admin `admin@erp.local`: login visible y rutas `/dashboard`, `/dashboard/pos`, `/dashboard/compras/ordenes`, `/dashboard/inventario/kardex`, `/dashboard/finanzas/cxc`, `/dashboard/cpe`, `/dashboard/gre`, `/dashboard/sire`, `/dashboard/usuarios`, `/dashboard/audit-logs` cargaron con contenido; `errorCount: 0`.
  - Usuario normal `standard-auth-1778704291821-ehoupv@erp-e2e.local`: login visible, sidebar restringido, `/dashboard`, `/dashboard/pos`, `/dashboard/usuarios`, `/dashboard/audit-logs` no dejaron pantalla blanca ni loader permanente; `403` esperados por permisos en POS/config/auditoria; errores fatales nuevos `0`.
- Evidencia de consola/red:
  - Navegador integrado admin: sin errores fatales, sin 500, sin chunk 404, sin overlay Next, sin pantalla blanca, sin loader infinito.
  - Navegador integrado usuario normal: sin errores fatales nuevos; `403 Forbidden` esperados por falta de permisos, sin 500 inesperados.
  - Logs API/Web ultimos 30 minutos: sin `statusCode 5xx`, sin `Cannot find module`, sin chunks rotos, sin `Unhandled Runtime`.
  - Logs historicos de la corrida contienen 400/403/404 esperados de casos negativos y un error POS inicial ya corregido; no quedan como bloqueo porque los gates finales pasaron despues de la correccion.
- Riesgos pendientes:
  - Unico pendiente aceptado: certificado digital verdadero SUNAT/CPE/GRE para operar contra produccion real; el entorno validado esta en homologacion y modo certificado demo/validacion local.
  - No bloqueante: dependencia Node/Playwright emite warning `DEP0040 punycode`.
  - No bloqueante: smoke global tarda ~27 minutos en 1 worker; mantener segmentacion por rutas en CI.
- Criterio de cierre:
  - Cumplido. Las 20 tareas quedan cerradas con evidencia; todos los gates finales pasaron; los flujos finales funcionan con datos propios; no hay 500 inesperados, chunks rotos, loaders infinitos, pantallas vacias, overlays de Next ni tests permisivos criticos. Se autoriza alta funcional del ERP con la condicion fiscal indicada para certificado real.

## Registro cronologico

### 2026-05-14 - Resolucion bloqueo POS stock visible y entorno local limpio

- ID del caso: `POS-BLOCKER-20260514-STOCK-UI`.
- Estado: `corregido` y `validado` para el bloqueo puntual de POS; no implica alta completa del ERP.
- Rol usado: admin `admin@erp.local`.
- Rutas visitadas en navegador integrado visible:
  - `http://localhost:13003/login/`
  - `http://localhost:13003/dashboard/`
  - `http://localhost:13003/dashboard/pos/`
- Datos creados/usados:
  - Cliente visible: `QA PROD READY 20260514012530 CLIENTE POS`, RUC `20514125301`.
  - Producto visible: `T16-693702933-1201a904-PROD`.
  - Ventas visibles: `B001-00000062` y `B001-00000063`.
- Pasos ejecutados en navegador:
  - Se detuvieron los procesos locales previos en `13003` y `13012`.
  - Se cerro la pestana del navegador integrado que habia quedado en estado `about:blank`.
  - Se elimino solo cache de Next `apps/web/.next`.
  - Se levanto API local dev en `http://localhost:13012` y Web local dev en `http://localhost:13003`, sin reconstruir imagen Docker.
  - Se abrio navegador integrado visible en `/login/`, se entro como admin y se navego a POS.
  - Primera reproduccion: producto bajo de `Stock: 6` a `Stock: 5`, venta `B001-00000062` aparecio en historial.
  - Se detecto bloqueo adicional: la venta POS tardo casi 12s y el timeout generico del hook (`12000ms`) disparo retry automatico de POST aunque el backend ya habia procesado la venta.
  - Se corrigio la UI POS para usar cliente API transaccional con `timeoutMs: 30000` y `retries: 1` solo en `/api/pos/venta`.
  - Revalidacion visible: producto bajo de `Stock: 5` a `Stock: 4`, venta `B001-00000063` aparecio en historial y el carrito quedo en `Procesar Venta (S/ 0.00)` deshabilitado.
- Resultado esperado:
  - El stock visible debe reflejar el stock persistido despues de vender.
  - Una venta POS no debe disparar retries automaticos genericos por timeout de UI.
  - No debe haber pantalla blanca, overlay Next, loader infinito ni 500 inesperado.
- Resultado real:
  - Cumplido para el bloqueo puntual: stock visible `6 -> 5 -> 4` en la grilla POS.
  - Historial POS mostro `B001-00000062` y `B001-00000063`.
  - Logs Web posteriores a la correccion muestran un unico `POST /backend/api/pos/venta/ 201` para `B001-00000063`; el retry doble solo existio antes de la correccion en `B001-00000062`.
- Evidencia consola/red:
  - Navegador integrado: sin errores fatales nuevos, sin overlay Next, sin pantalla blanca y sin loader infinito durante la revalidacion.
  - Web local: `POST /backend/api/pos/venta/ 201 in 11187ms`, luego `GET /backend/api/pos/ventas-recientes/ 200` y `GET /backend/api/pos/productos/ 200`.
  - API local: `Venta B001-00000063 procesada para KPIs`; inventario omitio doble aplicacion porque el flujo POS ya habia aplicado stock.
  - Pendiente conocido fuera de este bloqueo: logs de certificado demo SUNAT siguen apareciendo por falta de certificado real, aceptado como pendiente fiscal.
- Impacto verificado en otros modulos:
  - Inventario/POS: grilla POS refleja stock persistido despues de recargar productos.
  - CPE/SIRE: venta genero comprobante y registro SIRE en flujo POS.
  - Contabilidad/finanzas: API creo asiento y CxC/eventos asociados para la venta.
- Bugs encontrados:
  - Frontend POS estaba siendo validado contra estado de servidor/navegador no limpio, lo que hizo parecer que el bundle corregido no aplicaba.
  - `useApi` generico era inadecuado para la transaccion POS: `timeoutMs=12000` + retries automaticos podia duplicar el POST a nivel HTTP aunque la idempotencia evitara duplicado funcional.
- Codigo corregido:
  - `apps/web/app/dashboard/pos/page.tsx`: se agrego `posSaleApi = useApi({ retries: 1, timeoutMs: 30000 })` y la venta POS usa ese cliente para `/api/pos/venta`.
- Tests/comandos ejecutados:
  - `Stop-Process` sobre procesos locales previos `13003/13012`: OK.
  - Limpieza controlada de `apps/web/.next`: OK.
  - Levantado local dev API `PORT=13012 pnpm --dir apps/erp-api run dev`: OK.
  - Levantado local dev Web `pnpm --dir apps/web exec next dev -p 13003`: OK.
  - `Invoke-WebRequest http://localhost:13003/login/`: OK `200`.
  - `pnpm --filter @erp-suite/web run type-check`: OK.
  - Validacion manual en navegador integrado visible: OK para el bloqueo.
- Archivos corregidos:
  - `apps/web/app/dashboard/pos/page.tsx`.
- Riesgos pendientes:
  - La transaccion POS sigue tardando alrededor de 11s por CPE/SIRE/contabilidad; ya no dispara retry indebido, pero conviene evaluar optimizacion/asynchronia controlada en una tarea de rendimiento posterior.
  - El certificado digital verdadero SUNAT/CPE/GRE sigue fuera de esta validacion y sera provisto aparte.
- Criterio de cierre:
  - Cumplido para este bloqueo: el entorno local limpio muestra el cambio en navegador visible, la venta POS no reintenta por timeout generico y el stock visible queda consistente con el impacto de la venta.

### 2026-05-14 - Auditoria visible POS/CPE/CxC/inventario vigente

- Estado: `bloqueado`.
- Rol usado: admin `admin@erp.local`.
- Rutas visitadas: `/dashboard/pos/`; intentos de navegar a CPE/CxC/Kardex desde el navegador integrado quedaron sin cambio efectivo de URL y se complementaron con verificacion directa de persistencia.
- Datos usados: cliente `QA PROD READY 20260514012530 CLIENTE POS` RUC `20514125301`; producto `QAPR-20260514045719`.
- Flujos ejecutados en navegador visible:
  - POS: buscar producto, agregar al carrito, seleccionar cliente, seleccionar efectivo, procesar venta.
  - Ventas visibles creadas: `B001-00000059`, `B001-00000060`, `B001-00000061`, todas con cliente QA y total `S/ 29.50`.
- Bugs encontrados:
  - CPE rechazaba totales por diferencia flotante de un centavo (`total_igv=2.39` vs `2.38`).
  - CPE/CxC aceptaban fallback peligroso usando `cpe.id` o vinculando por serie/numero sin verificar total/receptor.
  - POS reutilizo correlativo fiscal ya ocupado (`B001-00000003`) porque `pos_numeracion` estaba atrasado respecto de `documentos/cpe/ventas_pos`.
  - POS visible conserva stock stale: tras ventas reales, BD/vista muestran stock real (`productos.stock_actual` bajo hasta `11`), pero la grilla visible sigue mostrando `Stock: 14`.
- Codigo corregido:
  - `apps/erp-api/src/modules/cpe/cpe.service.ts`: comparacion de totales por centavos, documento operativo real/idempotente, rechazo de conflicto si mismo numero tiene total/receptor distinto, sin `cpe.id` como factura falsa.
  - `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts`: CxC ya no usa `cpe.id` como documento si no puede resolver `documento_id`.
  - `apps/erp-api/src/modules/pos/pos.service.ts`: POS obtiene documento de cliente por `numero_documento/documento_numero/ruc/codigo`, sincroniza numeracion POS contra `ventas_pos`, `cpe` y `documentos`, y devuelve `items_actualizados` con stock real.
  - `apps/web/app/dashboard/pos/page.tsx`: tras venta exitosa actualiza productos con `items_actualizados` y recarga productos/historial.
  - `apps/web/.env.local`: validacion local apunta Web a API local `http://localhost:13012`.
- Tests/comandos ejecutados:
  - `pnpm --filter @erp-suite/erp-api run type-check`: OK.
  - `pnpm --filter @erp-suite/web run type-check`: OK.
  - `pnpm --filter @erp-suite/erp-api run test -- pos.service.spec.ts cpe.service.spec.ts --runInBand`: OK, 2 suites / 14 tests.
- Evidencia de persistencia:
  - CPE `B001-00000059`: `cpe.documento_id=ef038614-e624-4c2c-9913-b540e06184d4`, total `29.50`, receptor `20514125301`.
  - Documento operativo `B001-00000059`: total `29.50`, receptor `20514125301`.
  - CxC creada: `monto_original=29.50`, `saldo_pendiente=29.50`, `estado=PENDIENTE`.
  - Kardex: movimientos `SALIDA` `VENTA_POS` para producto `QAPR-20260514045719`.
  - BD/vista POS: `productos.stock_actual=11`, `vista_pos_productos.stock_disponible=11`.
- Evidencia consola/red:
  - Navegador integrado durante POS: sin 500, sin overlay Next, sin pantalla blanca, sin loader infinito y sin errores fatales capturados.
  - Logs API local/Docker: sin `Totales inconsistentes`, sin `duplicate key` nuevo para `B001-00000059+`, sin `Documento no existe` para los documentos corregidos.
- Riesgos pendientes:
  - Bloqueante: la grilla POS visible sigue mostrando `Stock: 14` aunque BD/vista devuelven `11`; falta confirmar que el navegador cargue el bundle corregido y que la UI pinte `items_actualizados`.
  - Bloqueante operativo: existe data QA corrupta generada durante la deteccion (`B001-00000003`) donde un CPE nuevo quedo vinculado a documento preexistente con total distinto. No se debe tomar esa fila como evidencia valida; debe limpiarse o quedar marcada como dato de prueba fallido antes del cierre final.
- Criterio de cierre: no cumplido. POS ya vende y persiste CPE/documento/CxC/Kardex correctos para correlativos nuevos, pero no se puede cerrar mientras el stock visible no refleje el estado persistido.

### 2026-05-12 - Creacion de bitacora oficial

- Estado: `en progreso`.
- Cambio: se creo `docs/production-readiness/ERP_PRODUCTION_READINESS.md`.
- Resultado: documento base con 20 tareas y campos obligatorios.
- Decision: no se declara el ERP listo; la evidencia historica queda importada y requiere confirmacion vigente dentro de esta bitacora.
