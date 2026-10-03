# Matriz de aceptación funcional Perú — corte 2026-10-03

Alcance: rutas visibles de `apps/web/components/layout/sidebar.tsx`, páginas de
`apps/web/app/dashboard`, flujos de `docs/MODULES.md` y escenarios de
`artifacts/peru-integrated-20260921111516642-7968/http.json`. Analytics excluido;
los reportes permanecen. `OK local` significa operación persistida contra PostgreSQL
16/PostgREST/API efímeros; `lectura` significa que la ruta respondió, sin afirmar
mutaciones. El ensayo anterior fue en el código del 21/09 y exige repetición para
aceptar cambios nuevos. Ninguna prueba local acredita aceptación SUNAT ni hardware.
`artifacts/peru-route-inventory-20260923.json` enumera 121 páginas dashboard fuera
de Analytics; sus indicadores de búsqueda/exportación/impresión/aprobación/anulación
son coincidencias estáticas del código de la página, no pruebas de disponibilidad
ni ejecución de esas acciones.

El inventario reproducible de contratos API declara 717 operaciones fuera de
Analytics en `artifacts/peru-api-operation-inventory-20260930.json`, con método,
ruta, controlador y permisos declarados. Incluye soporte, workers y administración;
la exposición de una acción en Perú exige contrastar navegación y reglas del
servicio. El inventario no representa operaciones aceptadas. La matriz API
por operación conserva las comprobaciones pendientes aunque exista respuesta HTTP.

El CI de PR 37092538107 en `82000ee9` aprobó 128 HTTP, quince recorridos UI,
99 pantallas y 22 pantallas con registros, SQL y restauración. La exportación
segura está en `artifacts/peru-integrated-ci-37092538107`; no incluye dumps.
El ensayo local anterior permanece **fallido** por reinicio de Next dev durante
el barrido estático, conservado en `artifacts/peru-integrated-accounting-phases-20261002`.
La ejecución duplicada de rama agotó 35 minutos en el último barrido; el segundo
intento pasó (`artifacts/peru-integrated-ci-37092535897`), conservando el fallo.
557 se promovió con respaldo/ensayo y #124 se integró como `f53d84dc`.
Main 37096505168, E2E y seguridad aprobaron; Render/Vercel sirven `f53d84dc`
con esquema 557 verificado en sólo lectura y preflight. La matriz UI por ruta y
control está en `artifacts/peru-ui-operation-matrix-20261002.json`: inventario
visible no implica ejecución de cada botón, formulario o variante.

Tres ensayos adicionales se incorporan al runner, pendientes de cierre CI/despliegue:
`artifacts/peru-year-close-acceptance-20261002.json` verifica cierre anual,
utilidad/pérdida, reapertura/recierre, cronología y resultado del año siguiente;
`artifacts/peru-first-client-wizard-acceptance-20261002.json` verifica desde UI
RUC, razón social, PFX desechable, parámetros fiscales y credenciales, reanudación,
contraseña incorrecta y respuestas perdidas sin duplicar pasos ni cierre.
`artifacts/peru-finance-lifecycle-20261002.json` verifica banco, transferencia,
CxP con pagos parciales, CSV/match/ajuste/cierre de conciliación, lector,
consultas ajenas y siete asientos cuadrados. El CSV corregido conserva fecha,
columnas y fórmulas neutralizadas. La 558 se promovió con respaldo, ensayo y CI; el despliegue exacto de #125 pasó en sólo lectura.
El ensayo canónico completo del 03/10 pasó 138 HTTP, 17 recorridos UI, 99
pantallas y 22 con registros, SQL y restauración
(`artifacts/peru-integrated-local-year-wizard-finance-20261003`). El recorrido
UI bancario cubre edición, CSV filtrado y consulta del cierre; no ejecuta
importación/match/ajuste/cierre por UI. No acredita aceptación SUNAT ni despliegue.

RRHH cerró tres defectos de empleados con 148 API/18 UI, SQL, 99 pantallas,
22 vistas con registros y restauración posterior en local y ambos CI del SHA
445a4a03. #126 se integró como 3612a2d9; main 37102349608 y despliegue exacto/schema 558 pasaron en sólo lectura. Main tuvo un recorrido con reintento, conservado como flaky en el export seguro.
La primera ejecución local falló en compra UI; se conserva la causa indeterminada
y las repeticiones aislada/completa aprobadas. La evidencia segura está en
`artifacts/peru-integrated-local-hr-20261003` y
`artifacts/peru-integrated-ci-37100302015`/`37100299491`.

PLAME duplicaba versiones al repetir Idempotency-Key. La propuesta 559 pasó
17 casos API/dos recorridos UI con copia local 558 más 559 y restore posterior:
CTS, liquidación, planilla, ficha/jornada/fuentes/ZIP y recuperación de paquetes
concurridos. `artifacts/peru-plame-financial-canonical-subset-20261003` conserva
ese alcance parcial. El ensayo del respaldo PROD detectó EXECUTE heredado del
writer interno PLAME para service_role; se comprueba su cierre explícito.
La repetición completa local pasó 165 API/20 UI, SQL, 99 pantallas, 22 con registros y restauración posterior (`artifacts/peru-integrated-local-plame-financial-20261003`). Ambos CI del SHA 26272755 pasaron esos contratos y todos los gates. 559 se promovió con respaldo/ensayo/preflight y preservación; #127 se integró como c034639f. Main y despliegue exacto de #127 pasaron; el estado vigente es 560. Fuentes locales
con códigos de fixture no acreditan validación oficial PVS ni presentación SOL.

Configuración/sucursales cerró los seis defectos de precisión, alta repetida, alcance, atomicidad de asignaciones, inactivos y recuperación del editor. #128 está integrado, 560 promovida y main/despliegue exacto verificados. Evidencia: `artifacts/peru-integrated-main-37110032921` y `artifacts/peru-production-verification-after-128-20261003.json`. Esto acredita el ciclo probado de sucursales y precisión; otros parámetros conservan sus pendientes.

#129 se integró como `5a23c4c1` tras 26 checks aprobados. Los dos CI del SHA `22cf5bb6` pasaron 208 API/22 UI sin reintentos, 99 pantallas, 22 con registros y restore. `artifacts/peru-integrated-ci-37111843415` y `artifacts/peru-integrated-ci-37111841817` conservan exportaciones seleccionadas. Main 37114135464, E2E y seguridad pasaron 208 API/22 UI sin reintentos, barridos y restore. Render/Vercel y esquema 560 quedaron verificados sólo en lectura con preflight; lectura previa con CI pendiente y timeout conservados. Los dos fallos locales permanecen registrados; no se declara resuelto el error JS intermitente.

La UIT mensual por período reprodujo valores incorrectos en 2024/2025 y aceptación de 2027 sin parámetro. La corrección pasó cuatro casos API y restauración, más la regresión RMT enfocada. No acredita guardado/versiones/constancias ni el módulo tributario completo; esos flujos se siguen ensayando.

| Módulo / operaciones ofrecidas | Evidencia de operación | Pendiente funcional concreto | Resultado |
| --- | --- | --- | --- |
| Alta empresa, login, wizard fiscal, PFX y SUNAT | `http.json`: alta no demo, reintento, login, RUC/titular/clave, secretos cifrados. `peru-integrated-local-year-wizard-finance-20261003/browser-first-client-wizard.json`: wizard UI con PFX desechable, clave incorrecta, reanudación tras fallo de consulta y respuestas perdidas de paso/cierre sin duplicar | Permisos diferenciados de cada paso, variantes de parámetros; aceptación fiscal externa cuando exista cliente | Casos API/UI observados OK local; 558 y despliegue #125 verificados; otras variantes pendientes |
| Usuarios, roles, sesiones, sucursales | `artifacts/peru-integrated-ci-36775048567/http.json`: primer ADMIN crea/reintenta/edita usuario y rol; búsqueda por email/dominio sin inyección, login, sesión revocada, rol único protegido, bajas lógicas. UI filtra rol UUID y estado con API real. Sucursal inicial API con ACL 555. | Altas/edición/bajas por UI y permisos diferenciados de sucursales; entrega externa de correo | API de usuario/rol y filtros UI OK para casos observados; resto parcial |
| Clientes y proveedores: alta, edición, búsqueda, consulta, desactivación, importación/exportación | `artifacts/peru-integrated-ci-36775048567`: alta repetida conserva ID, duplicados rechazan; lectura/escritura/baja ajena oculta y rol de lectura no muta. Baja lógica con deuda conserva filas/saldos y una auditoría tras replay. UI importa, edita, busca, exporta activos/inactivos, recibe 503 sin falso éxito, reintenta y confirma persistencia al recargar. | Reactivación si se ofrece, variantes fiscales de cada tipo/documento, escala de archivos | OK local en casos observados API/UI; variantes pendientes |
| Productos, categorías, almacenes, stock, kardex | `artifacts/peru-integrated-ci-36780466766`: primer ADMIN no demo crea/reintenta/edita producto y categoría; ajuste decimal y transferencia persisten, saldo insuficiente y claves incompatibles no mutan, bajas con dependencias rechazan y bajas vacías/reactivación persisten. Lector y tenant ajeno no mutan. Contabilidad consume sobrante y faltante con asientos únicos/cuadrados, incluido detalle 68 contra 20. UI pierde respuesta tras commit, reintenta sin duplicar, transfiere y consulta filtros/saldos de kardex tras recarga. | CRUD de producto/categoría/almacén y foto desde UI. La carga CSV de productos no está ofrecida: sólo existe el tipo histórico `productos` en `MIGRATION_RUN_TYPES`, sin UI, ruta ni importador. 556 promovida en PROD tras respaldo/restore/rollback/CI. | 119 HTTP, 13 flujos UI y 22 pantallas aprobados en CI; ciclo observado OK local, módulo parcial |
| Cotizaciones de compra y venta: alta, consulta, aprobación, conversión | `http.json`: ambas creadas/reintentadas, venta aprobada por otro actor y convertida sin duplicar | Edición, rechazo/anulación, búsqueda, exportación/impresión y roles desde navegador | OK local en ruta principal; resto pendiente |
| Compra: orden, aprobación, recepción parcial/total, factura, CxP, pago, asiento | `http.json`: cadena persistida con dos actores, stock, cuenta, cargo bancario, asiento y reintentos; variantes USD/servicio/rechazo | Navegador de pago/factura y errores recuperables; impresión/exportación; autorizaciones de cada transición | OK local API en cadena principal; parcial UI |
| Devolución de compra y nota | `http.json`: antes de factura y saldo pendiente, reverso de inventario/contabilidad, incompatibilidad con factura pagada | Nota fiscal externa y recuperación por UI; devolución parcial múltiple | Parcial |
| Pedido de venta, preparación, despacho, CPE, CxC, cobro, caja, contabilidad | `artifacts/peru-integrated-20260923122407762-17892/http.json`: cotización→pedido→despacho→CPE/CxC→cobro parcial bancario→saldo en efectivo a caja→arqueo/cierre→dos asientos; reintentos, caja inválida rechazada sin mutación; POS ticket→caja→asiento. Navegador consulta ambos cobros e historial/exportación. El ensayo del 30/09 añade cobro en efectivo UI con respuesta perdida/replay y cierre. | Cobro bancario desde navegador, anulación y transmisión externa | OK local API con transferencia/efectivo y UI efectivo con reintento; resto pendiente |
| POS y cajas: abrir, vender, cerrar, arqueo | `http.json`: venta de ticket, stock, efectivo, cierre, asiento e idempotencia; navegador integrado previo | Venta CPE, cambio de turno, pagos mixtos, devolución, impresora/Tauri físicos y errores de red | OK local ticket; fiscal/hardware pendiente |
| RMA y notas de crédito | `artifacts/peru-integrated-local-rma-20260930`: factura pagada→RMA→recepción parcial/reversa→dos recepciones→NC→saldo a favor; reembolsos parciales por banco/caja y sus reversas; aplicación a CxC futura sin fabricar cobro. Stock, crédito, banco/caja y seis asientos 122 únicos/cuadrados; exceso y lector rechazan, tenant ajeno oculta saldo sin mutar. UI recupera catálogo 503 agotado y respuesta perdida tras commit; replay conserva movimiento y único asiento. | Alta/aprobación/recepción, aplicación y reversas desde UI; permisos/aislamiento y otras validaciones de cada mutación aún no cubiertas; servicio/varias líneas/monedas; impresión y anulación de nota; transmisión externa | Casos observados API y reembolso bancario UI OK local; resto parcial |
| Logística y GRE: picking, despacho, traslado, guía, reintento | `http.json`: preparación/despacho y lecturas; pruebas API/SQL previas de GRE | Guía local completa desde UI, traslado entre sucursales y transmisión/acuse SUNAT externa | Parcial |
| CPE: emitir, consultar, anular, descargar/impresión, reintentar | Pruebas de firma y A4, visual de factura/boleta demo; `http.json` nota RMA y ticket interno | Emisión fiscal local completa ligada a pedido y CxC; RA/RC, boleta/factura/NC/ND, PDF/XML, timeout/reintento | Parcial; aceptación externa pendiente |
| SIRE: preparar, consultar, exportar, presentar/rectificar | `artifacts/peru-integrated-20260923071858181-5776/http.json`: RVIE/RCE locales generados, repetidos sin duplicar, listados, descargados con SHA-256 verificado, aislados por tenant; período inválido y envío desde demo rechazados | Navegador, conciliación con fuentes fiscales, respuesta oficial SUNAT y rectificación | Instantánea local OK; presentación externa pendiente |
| CxP, bancos, tesorería, conciliación, detracciones | `peru-integrated-local-year-wizard-finance-20261003/finance-lifecycle.json`: banco/edición, transferencia, dos pagos CxP y replay/exceso, CSV inválido sin mutación y válido, match/ajuste/cierre, lector/consulta ajena y siete asientos únicos cuadrados. UI edita banco, descarga CSV filtrado correcto y consulta cierre | UI de importación/match/ajuste/cierre/pago; programación/lotes, reversos, detracción, monedas, escala y aislamiento de cada escritura | Ciclos API y edición/exportación/consulta UI observados OK local; resto parcial |
| CxC, cobranzas, caja, reportes financieros | `artifacts/peru-integrated-20260923122407762-17892`: dos cobros de pedido, banco/caja, sesión inválida rechazada sin mutación, arqueo/cierre y dos asientos cuadrados. Historial y CSV UI. `artifacts/peru-integrated-20260930192830556-23344`: primer ADMIN no demo crea caja, cobra CxC inicial desde navegador y cierra; la API confirma pero se pierde la respuesta. El diálogo muestra error y conserva datos; reintentar devuelve el mismo pago y movimiento de caja, un solo pago, saldo cero y caja correcta. | Cobro bancario desde UI, nota sobre cuenta pagada, conciliación, permisos diferenciados por rol y reportes financieros | Parcial; efectivo UI con respuesta perdida/replay OK local; transferencia API e historial/exportación UI OK local |
| Contabilidad: asientos, periodos, centros, plan, presupuestos | `peru-integrated-main-37096505168`: manual/replay/borrador/confirmación/reversa, cierre mensual y reapertura administrativa, UI con respuesta perdida y PDF. `peru-integrated-local-year-wizard-finance-20261003/annual-acceptance.json`: utilidad 25, pérdida -7, reapertura/recierre, cronología y resultado 8 del año siguiente | Períodos/cierre anual por UI; plantillas, partidas, distribución analítica; permisos de centros/presupuestos; fronteras de escritores automáticos. 557 y 558 desplegadas | Casos manuales/mensuales/anuales observados OK local; módulo parcial |
| Contabilidad: activos y diferidos | `peru-integrated-main-37096505168`: activo 1001/residual 1, adquisición explícita, edición, cronograma y cuotas 333.33/333.33/333.34; baja/asientos únicos. Diferido gasto 100, cuotas 33.33/33.33/33.34, cancelación/replay, lector y consulta ajena. #124 desplegado | UI de altas/procesos/bajas; venta de activo, vida útil y períodos omitidos; diferidos ingreso/monedas; aislamiento de cada escritura, informes y reversas | Ciclos API observados OK local; variantes pendientes |
| Contabilidad: consignación, consolidación, revaluación | `http.json`: sólo lecturas de consignación/consolidación/tipos de cambio | Alta→proceso→asiento→reporte, reversos y aislamiento de cada submódulo | Sólo lectura verificada |
| Reportes contables y tributarios, libros, impuestos anual | `artifacts/peru-integrated-20260923073133928-14620/http.json`: cinco TXT PLE exportados individualmente y en lote, RUC del emisor, Diario con 21 campos y debe=haber, contenido aislado por tenant, mes inválido rechazado; reportes comerciales filtrados | PVS SUNAT, conciliación completa de RV/RCE con documentos, UI/impresión y cálculos/declaraciones anuales | PLE local parcial; aceptación tributaria externa pendiente |
| RR. HH.: candidatos, empleado, contrato, asistencia | Candidato UI y diez contratos API del primer ADMIN; alta perdida/replay/edición/recarga UI; contrato/PDF real con visual independiente; permisos y datos ajenos. Local completo y CI #126 aprobados | UI de contratos/asistencia/baja, permisos/aislamiento de cada variante, expedientes, beneficios, evaluaciones y demás acciones | Casos observados API/UI OK y despliegue exacto de #126 verificado; módulo parcial |
| Planilla, pagos, T-Registro, PLAME, liquidaciones | Ejecución completa local de 165 API/20 UI, con 17 API/2 UI de RRHH financiero/PLAME: CTS, segregación, cese/contrato/CTS consumida, pago/reversa banco y asientos; planilla/boleta JSON; ficha/jornada bloqueada/corregida, fuentes/ZIP/hashes, historial congelado, replay/concurrencia y ZIP desde UI | Alta/cálculo/aprobación de planilla, cálculo/confirmación liquidación y CTS desde UI; variantes/roles; códigos y ejecución PVS/SOL; 559/CI/despliegue | OK local en contratos descritos sobre copia 558 más 559; módulo parcial |
| Configuración comercial, fiscal, RR. HH., establecimientos | `http.json`: primer cliente completa identidad/PFX/credenciales cifrados | Series, impuestos, GRE/SIRE, sucursales y parámetros con edición, permisos, recarga y errores desde UI | Parcial |
| Migración/importación de maestros y exportaciones | `artifacts/peru-integrated-20260923092617881-10028`: primer ADMIN no demo previsualiza clientes/proveedores, ejecuta dry-run sin escritura, importa archivo mixto con error por fila, consulta lote, reintenta sin duplicar y oculta lote ajeno con 404. Navegador descarga plantilla, bloquea CSV inválido/503, reintenta, importa, busca y exporta ambas filas. La 554 y el exportador #114 están desplegados (`artifacts/peru-production-verification-after-114-20260923.json`). `artifacts/peru-integrated-20260923102951518-2884`: CxC/CxP iniciales con saldo, referencia inexistente, total conciliado, reintento y colisión sin alterar deuda; stock inicial por código de producto, persistencia y replay; diez navegadores pasan. El ajuste posterior de descarga pasó diez navegadores locales en `artifacts/peru-integrated-20260923111137269-19612`; CI de main para #116 pasó tras el ajuste. `artifacts/peru-integrated-20260923114009161-23644`: balance de apertura cuadrado, validación y replay; CPE histórico local sin SUNAT/outbox, referencia de cliente y replay. | Actualización por CSV, roles diferenciados, archivos grandes, validación contable integral con saldos reales y aceptación SUNAT del futuro cliente | Clientes/proveedores OK API+navegador; CxC/CxP, stock, balance y CPE histórico OK local API; #116 desplegado y CI verde |
| Documentos, descargas, auditoría, ayuda, offline | `http.json`: auditoría real paginada, aislada y con permisos; documentos sólo lectura | Descarga/impresión y búsqueda; cola offline, reinicio/replay; controles de auditoría desde UI | Auditoría API OK; resto parcial |

## Defectos corregidos en validación

- Búsqueda de usuarios: reemplazar `@` y puntos impedía encontrar emails completos;
  filtro entrecomillado pasó contra PostgREST real, incluidas entradas maliciosas.
- Filtro UI de usuarios por rol: enviaba nombre donde el backend espera UUID.
- Baja de clientes/proveedores: errores absorbidos por `useApi` podían confirmar éxito;
  ahora se propagan y el recorrido 503→reintento confirma estado activo/inactivo.
- RMA: la carga de CxC/medios del modal no capturaba errores de red. Ahora muestra
  el error, bloquea confirmar y permite recuperar opciones. El reembolso real
  con respuesta perdida/replay conserva crédito, banco y asiento únicos.
- El ensayo completo del 30/09 pasó 113 HTTP, SQL/restauración y once de doce UI.
  El único fallo fue espera de compilación del editor de presupuestos; la espera
  se corrigió y se exige CI completo antes de integrar.

## Comprobaciones transversales

- El PR #120 (`8b6db30d`) está fusionado y desplegado. CI 36770807955,
  E2E 36770807974 y Security Scan 36770807986 de `main` pasaron, incluida
  la auditoría de dependencias. Render/Vercel, DB/Redis, esquema 555, login
  y CORS se verificaron sólo en lectura, sin migraciones ni datos sintéticos
  (`artifacts/peru-production-verification-after-120-20260930.json`).
- El cobro en efectivo desde navegador con respuesta perdida pasó en el ensayo
  local del 30/09, junto con 105 escenarios HTTP, SQL/restauración y once
  recorridos de navegador; esa evidencia acredita sus acciones observadas.

- El PR #118 (`5d6071fb`) pasó CI, E2E y Security Scan de `main` y está
  desplegado en Render/Vercel; API, DB, Redis, esquema 555, login y CORS
  respondieron, sin escrituras sintéticas en PROD
  (`artifacts/peru-production-verification-after-118-20260923.json`).
- El PR #117 (`1dc54b73`) está fusionado y desplegado en Render/Vercel.
  Render exige/aplica 555 y tiene DB/Redis listos; login 200 y CORS 204.
  E2E, Security Scan y CI 35858257119 de `main` pasaron.
  El CPE histórico y el balance de apertura pasaron localmente en
  `artifacts/peru-integrated-20260923114009161-23644`.
- El cobro CxC por transferencia parcial y efectivo final, su caja con arqueo
  y cierre, y dos asientos únicos pasaron en 102 escenarios HTTP más SQL y
  restauración local. Una caja inexistente rechaza el pago sin cambiar saldo ni
  pagos; diez recorridos de navegador pasaron, incluido historial y exportación
  CxC (`artifacts/peru-integrated-20260923122407762-17892`).
- El PR #116 (`0e80dedf`) está desplegado en Render y Vercel con esquema PROD
  555; API, DB, Redis, login y CORS respondieron. Sus tres workflows de
  `main` pasaron, incluida la descarga CSV antes intermitente
  (`artifacts/peru-production-verification-after-116-20260923.json`).

- Aislamiento entre dos empresas y rechazo anónimo/sin permiso: probado en login,
  ventas POS, compras y auditoría. Debe repetirse en mutaciones de cada módulo.
- Idempotencia y contabilidad: probadas en POS, compras, planilla, cotizaciones,
  despacho, RMA, cobros parciales y generación local SIRE. Faltan CPE/guías
  externos y fallos de red ambiguos en sus transportes.
- Navegador: diez recorridos integrados y 22 pantallas con registros sólo acreditan
  sus acciones observadas; no equivalen a aceptar todas las acciones visibles.
- El nuevo recorrido CxC elevó a nueve los recorridos integrados locales. Descubrió
  `PGRST100` al buscar por número: el `or` combinaba una columna de relación y
  borraba las filas visibles/CSV. Se corrigió en `cxc.service.ts` resolviendo
  clientes por tenant; la pantalla distingue fallos de resultados vacíos, bloquea
  CSV sin filas y permite reintentar. HTTP+navegador pasaron en
  `artifacts/peru-integrated-20260923070817259-4196/run.json`. Para no construir
  URLs sin límite, una búsqueda que coincide con más de 100 clientes pide
  precisar el texto; esta restricción de escala requiere validación con datos
  reales del futuro cliente.
- Producción: el PR #112 (`8f74ea3b`) pasó CI/E2E/seguridad y su API respondió
  con esquema 553, DB/Redis listos, login web y CORS; sin escrituras sintéticas.
  La 554 se promovió tras respaldo, restauración sin red, rollback inyectado y
  checks del PR #113. Runtime `75c71435`, CI de main, Vercel Production,
  readiness 554, login y CORS se verificaron sin datos sintéticos. El plan
  efectivo de Render sigue sin confirmar.
- CI de `main`: ejecuciones 35826660731, E2E 35826660734 y Security Scan
  35826660864 terminaron en verde para `62068eec`. Los tres workflows de
  `8b6db30d` también pasaron e incluyen el cobro en efectivo desde UI con
  respuesta perdida y reintento idempotente.
- Plan efectivo de Render: pendiente de inspección administrativa; `render.yaml`
  declara Starter, sin prueba de facturación/plan efectivo.

## Decisión actual

No se acredita lanzamiento integral. El onboarding técnico del primer cliente y
varias cadenas principales funcionan en local; las operaciones enumeradas como
pendientes necesitan ejecución funcional. La aceptación/acuse SUNAT y el hardware
requieren credenciales/entorno del futuro cliente, sin bloquear las pruebas locales.

## Ampliación de inventario 2026-09-30

El ensayo específico tiene alcance `onboarding_inventory_subset`: pasó 28 HTTP y cuatro recorridos UI. No sustituye la suite completa. Se corrigió la falsa confirmación de ajustes/transferencias ante fallos de red. El primer cliente carecía de cuentas 20/76 para contabilizar ajustes; la migración 556 aprovisiona el catálogo operativo al configurar Perú, preservando cuentas existentes y manteniendo al consumidor en sólo lectura. El respaldo privado, restauración sin red, rollback inyectado y contratos SQL pasaron (`artifacts/erp-peru-556-rehearsal-20260930212300192-22512.json`). La promoción posterior 555→556 está documentada en `artifacts/peru-556-promotion-20260930215330681.json`.

Los 119 HTTP, contratos SQL, restauración y trece flujos UI pasaron en `artifacts/peru-integrated-20260930212136146-24116`. El barrido de 22 pantallas falló en conciliación con «Invalid or unexpected token»; `run.json` conserva `success=false`. Se amplió la traza de errores. La segunda ejecución local y CI pasaron el barrido sin reproducirlo; esta repetición no demuestra una corrección de producto para ese error.

## Cierre de PR #122 y navegación Perú

El CI 36780466766 pasó 119 HTTP, trece flujos UI y 22 pantallas con registros; el error de conciliación no se reprodujo en la segunda ejecución local ni en CI. `artifacts/peru-integrated-ci-36780466766/peru-navigation-admin.json` conserva 35 enlaces renderizados para ADMIN del primer cliente no demo PE, con Analytics excluido y reportes incluidos. La 556 se promovió transaccionalmente; #122 se integró como `5d98b214`. CI 36782425972, E2E 36782426005 y Security Scan 36782425958 de main pasaron; Render/Vercel, DB/Redis, esquema 556, login y CORS están verificados en `artifacts/peru-production-verification-after-122-20260930.json`. Las operaciones pendientes de cada módulo permanecen abiertas.

## Ampliación RMA y matriz por operación

`artifacts/peru-integrated-local-rma-20260930` conserva el ensayo aprobado de
124 HTTP, catorce recorridos UI y 22 pantallas. Su extracción usa una lista
explícita de JSON y no copia dumps. `record-survey-result.json` recoge los
controles visibles sin valores de formularios ni query strings; esa exposición
no demuestra ejecución. La matriz API observa 170 contratos y vincula cinco
casos RMA a sus operaciones, con comprobaciones y pendientes específicos en
`artifacts/peru-operation-acceptance-cases-20260930.json`. Cada caso exige que
sus escenarios hayan pasado; se conserva la distinción entre contrato HTTP,
caso funcional comprobado y aceptación completa. El PR #123 quedó integrado
como `d96aee30`; CI de main 36789420677 repitió 124 HTTP/catorce UI/22 pantallas.
E2E y Security Scan pasaron. Render/Vercel sirven ese SHA, esquema 556,
DB/Redis, login y CORS verificados sólo en lectura con preflight
(`artifacts/peru-production-verification-after-123-20260930.json`).

## Corte adicional 03/10

#128 (8417ff23), #129 (5a23c4c1) y #130 (c9629374) cerraron CI main, E2E,
seguridad y despliegue exacto en sólo lectura con preflight. #130 pasó
215 API/22 UI sin reintentos en main; su CI de rama conservó un reintento.
Storage pasó API10/UI1/DB/blobs; proveedor remoto pendiente. Los timeouts
de 20s de Render y sus repeticiones no acreditan continuidad ni plan efectivo.

#131 (3088474d) pasó 28 checks; ambos CI exactos aprobaron 241 API/24 UI
sin reintentos, SQL, barridos y restauración. La 562 se promovió una vez con
preflight/respaldo/ensayo y preservación de 29 tablas, funciones y seguridad.
Se integró como eb5312f4; main 37121705807 y despliegue exacto pendientes.
Los casos añadidos acreditan intención tributaria mensual/anual, constancia
local simulada, concurrencia, rectificación, aislamiento, rollback/recuperación
y Retry-After de oficina. No hubo datos sintéticos ni presentación SUNAT en PROD.

La matriz observa 261 de 717 contratos API en el ensayo de #131 más Storage.
Tiene 57 casos funcionales específicos. UI conserva 121 rutas, 35 enlaces
ADMIN PE y 1171 controles en CI PR #131 (1298 en el corte local previo);
presencia no equivale a ejecución.
Los 11 contratos específicos de Argentina/Colombia se conservan como variantes
de país; los otros 706 incluyen infraestructura y no equivalen automáticamente
a módulos ofrecidos Perú. artifacts/peru-module-acceptance-20261003.json
agrega la evidencia y los pendientes por dominio de código.

Consolidación y consignaciones: cuatro defectos reproducidos y candidatos
aprobados con 27 API/dos UI/restauración. La evidencia distingue el error
original de SELECT, los rechazos HTTP 500 y los dos defectos UI:
artifacts/peru-reports-consignations-defects-20261003 y
artifacts/peru-reports-consignations-candidate-20261003.
Fuentes canónicas 563 integradas; reconstrucción, CI, ensayo de preservación
y despliegue pendientes. Las pruebas con mocks sólo apoyan regresión y no
reemplazan estos recorridos reales.

No hay aceptación global. Cada operación conserva comprobaciones restantes.
Sólo Analytics está excluido; reportes operativos, contables y tributarios incluidos.
