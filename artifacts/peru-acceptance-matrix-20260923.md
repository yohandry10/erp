# Matriz de aceptación funcional Perú — corte 2026-09-30

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

| Módulo / operaciones ofrecidas | Evidencia de operación | Pendiente funcional concreto | Resultado |
| --- | --- | --- | --- |
| Alta empresa, login, wizard fiscal, PFX y SUNAT | `http.json`: alta no demo, reintento, login, validación de RUC/titular/clave, secretos cifrados y reanudación | Recorrer wizard desde navegador con errores de red y roles; aceptación fiscal externa cuando exista cliente | OK local API; navegador parcial |
| Usuarios, roles, sesiones, sucursales | `artifacts/peru-integrated-ci-36775048567/http.json`: primer ADMIN crea/reintenta/edita usuario y rol; búsqueda por email/dominio sin inyección, login, sesión revocada, rol único protegido, bajas lógicas. UI filtra rol UUID y estado con API real. Sucursal inicial API con ACL 555. | Altas/edición/bajas por UI y permisos diferenciados de sucursales; entrega externa de correo | API de usuario/rol y filtros UI OK para casos observados; resto parcial |
| Clientes y proveedores: alta, edición, búsqueda, consulta, desactivación, importación/exportación | `artifacts/peru-integrated-ci-36775048567`: alta repetida conserva ID, duplicados rechazan; lectura/escritura/baja ajena oculta y rol de lectura no muta. Baja lógica con deuda conserva filas/saldos y una auditoría tras replay. UI importa, edita, busca, exporta activos/inactivos, recibe 503 sin falso éxito, reintenta y confirma persistencia al recargar. | Reactivación si se ofrece, variantes fiscales de cada tipo/documento, escala de archivos | OK local en casos observados API/UI; variantes pendientes |
| Productos, categorías, almacenes, stock, kardex | `artifacts/peru-integrated-20260930212136146-24116`: primer ADMIN no demo crea/reintenta/edita producto y categoría; ajuste decimal y transferencia persisten, saldo insuficiente y claves incompatibles no mutan, bajas con dependencias rechazan y bajas vacías/reactivación persisten. Lector y tenant ajeno no mutan. Contabilidad consume sobrante y faltante con asientos únicos/cuadrados, incluido detalle 68 contra 20. UI pierde respuesta tras commit, reintenta sin duplicar, transfiere y consulta filtros/saldos de kardex tras recarga. | CRUD de producto/categoría/almacén y foto desde UI. Carga masiva de productos: `productos` está en `MIGRATION_RUN_TYPES`, pero no en `MIGRATION_IMPORTER_RUN_TYPES` ni tiene ruta/importador. 556 aún no promovida. | 119 HTTP y 13 flujos UI aprobados; ensayo global fallido por pantalla de conciliación, pendiente de repetir |
| Cotizaciones de compra y venta: alta, consulta, aprobación, conversión | `http.json`: ambas creadas/reintentadas, venta aprobada por otro actor y convertida sin duplicar | Edición, rechazo/anulación, búsqueda, exportación/impresión y roles desde navegador | OK local en ruta principal; resto pendiente |
| Compra: orden, aprobación, recepción parcial/total, factura, CxP, pago, asiento | `http.json`: cadena persistida con dos actores, stock, cuenta, cargo bancario, asiento y reintentos; variantes USD/servicio/rechazo | Navegador de pago/factura y errores recuperables; impresión/exportación; autorizaciones de cada transición | OK local API en cadena principal; parcial UI |
| Devolución de compra y nota | `http.json`: antes de factura y saldo pendiente, reverso de inventario/contabilidad, incompatibilidad con factura pagada | Nota fiscal externa y recuperación por UI; devolución parcial múltiple | Parcial |
| Pedido de venta, preparación, despacho, CPE, CxC, cobro, caja, contabilidad | `artifacts/peru-integrated-20260923122407762-17892/http.json`: cotización→pedido→despacho→CPE/CxC→cobro parcial bancario→saldo en efectivo a caja→arqueo/cierre→dos asientos; reintentos, caja inválida rechazada sin mutación; POS ticket→caja→asiento. Navegador consulta ambos cobros e historial/exportación. El ensayo del 30/09 añade cobro en efectivo UI con respuesta perdida/replay y cierre. | Cobro bancario desde navegador, anulación y transmisión externa | OK local API con transferencia/efectivo y UI efectivo con reintento; resto pendiente |
| POS y cajas: abrir, vender, cerrar, arqueo | `http.json`: venta de ticket, stock, efectivo, cierre, asiento e idempotencia; navegador integrado previo | Venta CPE, cambio de turno, pagos mixtos, devolución, impresora/Tauri físicos y errores de red | OK local ticket; fiscal/hardware pendiente |
| RMA y notas de crédito | `http.json`: alta, rechazo anticipado, aprobación por otro actor, recepción, nota/CxC/asiento únicos | Recepción parcial, saldo a favor/cobro previo, impresión y anulación de nota | Parcial |
| Logística y GRE: picking, despacho, traslado, guía, reintento | `http.json`: preparación/despacho y lecturas; pruebas API/SQL previas de GRE | Guía local completa desde UI, traslado entre sucursales y transmisión/acuse SUNAT externa | Parcial |
| CPE: emitir, consultar, anular, descargar/impresión, reintentar | Pruebas de firma y A4, visual de factura/boleta demo; `http.json` nota RMA y ticket interno | Emisión fiscal local completa ligada a pedido y CxC; RA/RC, boleta/factura/NC/ND, PDF/XML, timeout/reintento | Parcial; aceptación externa pendiente |
| SIRE: preparar, consultar, exportar, presentar/rectificar | `artifacts/peru-integrated-20260923071858181-5776/http.json`: RVIE/RCE locales generados, repetidos sin duplicar, listados, descargados con SHA-256 verificado, aislados por tenant; período inválido y envío desde demo rechazados | Navegador, conciliación con fuentes fiscales, respuesta oficial SUNAT y rectificación | Instantánea local OK; presentación externa pendiente |
| CxP, bancos, tesorería, conciliación, detracciones | `http.json`: deuda, pago, banco, asiento; conciliación creada/consultada | Pagos parciales, programación/lotes, reversos, conciliación aplicada, detracción y recuperación de fallos | Parcial |
| CxC, cobranzas, caja, reportes financieros | `artifacts/peru-integrated-20260923122407762-17892`: dos cobros de pedido, banco/caja, sesión inválida rechazada sin mutación, arqueo/cierre y dos asientos cuadrados. Historial y CSV UI. `artifacts/peru-integrated-20260930192830556-23344`: primer ADMIN no demo crea caja, cobra CxC inicial desde navegador y cierra; la API confirma pero se pierde la respuesta. El diálogo muestra error y conserva datos; reintentar devuelve el mismo pago y movimiento de caja, un solo pago, saldo cero y caja correcta. | Cobro bancario desde UI, nota sobre cuenta pagada, conciliación, permisos diferenciados por rol y reportes financieros | Parcial; efectivo UI con respuesta perdida/replay OK local; transferencia API e historial/exportación UI OK local |
| Contabilidad: asientos, periodos, centros, plan, presupuestos | `http.json`: asientos automáticos únicos/cuadrados. Navegador integrado: crea centro de costo, presupuesto y asignación; edita y confirma persistencia después de recargar | Asiento manual/edición/reverso, cierre/rehabilitación de periodo y permisos diferenciados para centros/presupuestos | Parcial; centros/presupuestos UI persistidos |
| Contabilidad: activos, diferidos, consignación, consolidación, revaluación | `http.json`: sólo lecturas de activos/diferidos/consignación/consolidación/tipos de cambio | Alta→proceso→asiento→reporte por cada submódulo, reversos y aislamiento | Sólo lectura verificada |
| Reportes contables y tributarios, libros, impuestos anual | `artifacts/peru-integrated-20260923073133928-14620/http.json`: cinco TXT PLE exportados individualmente y en lote, RUC del emisor, Diario con 21 campos y debe=haber, contenido aislado por tenant, mes inválido rechazado; reportes comerciales filtrados | PVS SUNAT, conciliación completa de RV/RCE con documentos, UI/impresión y cálculos/declaraciones anuales | PLE local parcial; aceptación tributaria externa pendiente |
| RR. HH.: candidatos, empleado, contrato, asistencia | `http.json`: lecturas. Navegador integrado: candidato creado y editado, perfil y vacante conservados tras recarga | Contratación, alta/edición de empleados/contratos, asistencia y permisos/aislamiento completos | Parcial; alta/edición de candidato UI persistidas |
| Planilla, pagos, T-Registro, PLAME, liquidaciones | `http.json`: cálculo PE con norma, aprobación distinta, pago/banco/asiento únicos y bloqueo sin norma | Altas laborales desde UI, liquidación, CTS, exportaciones T-Registro/PLAME y constancias externas | OK local cadena planilla; resto pendiente |
| Configuración comercial, fiscal, RR. HH., establecimientos | `http.json`: primer cliente completa identidad/PFX/credenciales cifrados | Series, impuestos, GRE/SIRE, sucursales y parámetros con edición, permisos, recarga y errores desde UI | Parcial |
| Migración/importación de maestros y exportaciones | `artifacts/peru-integrated-20260923092617881-10028`: primer ADMIN no demo previsualiza clientes/proveedores, ejecuta dry-run sin escritura, importa archivo mixto con error por fila, consulta lote, reintenta sin duplicar y oculta lote ajeno con 404. Navegador descarga plantilla, bloquea CSV inválido/503, reintenta, importa, busca y exporta ambas filas. La 554 y el exportador #114 están desplegados (`artifacts/peru-production-verification-after-114-20260923.json`). `artifacts/peru-integrated-20260923102951518-2884`: CxC/CxP iniciales con saldo, referencia inexistente, total conciliado, reintento y colisión sin alterar deuda; stock inicial por código de producto, persistencia y replay; diez navegadores pasan. El ajuste posterior de descarga pasó diez navegadores locales en `artifacts/peru-integrated-20260923111137269-19612`; CI de main para #116 pasó tras el ajuste. `artifacts/peru-integrated-20260923114009161-23644`: balance de apertura cuadrado, validación y replay; CPE histórico local sin SUNAT/outbox, referencia de cliente y replay. | Actualización por CSV, roles diferenciados, archivos grandes, validación contable integral con saldos reales y aceptación SUNAT del futuro cliente | Clientes/proveedores OK API+navegador; CxC/CxP, stock, balance y CPE histórico OK local API; #116 desplegado y CI verde |
| Documentos, descargas, auditoría, ayuda, offline | `http.json`: auditoría real paginada, aislada y con permisos; documentos sólo lectura | Descarga/impresión y búsqueda; cola offline, reinicio/replay; controles de auditoría desde UI | Auditoría API OK; resto parcial |

## Defectos corregidos en validación

- Búsqueda de usuarios: reemplazar `@` y puntos impedía encontrar emails completos;
  filtro entrecomillado pasó contra PostgREST real, incluidas entradas maliciosas.
- Filtro UI de usuarios por rol: enviaba nombre donde el backend espera UUID.
- Baja de clientes/proveedores: errores absorbidos por `useApi` podían confirmar éxito;
  ahora se propagan y el recorrido 503→reintento confirma estado activo/inactivo.
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

El ensayo específico tiene alcance `onboarding_inventory_subset`: pasó 28 HTTP y cuatro recorridos UI. No sustituye la suite completa. Se corrigió la falsa confirmación de ajustes/transferencias ante fallos de red. El primer cliente carecía de cuentas 20/76 para contabilizar ajustes; la migración 556 aprovisiona el catálogo operativo al configurar Perú, preservando cuentas existentes y manteniendo al consumidor en sólo lectura. El respaldo privado, restauración sin red, rollback inyectado y contratos SQL pasaron (`artifacts/erp-peru-556-rehearsal-20260930212300192-22512.json`); no se aplicó a PROD.

Los 119 HTTP, contratos SQL, restauración y trece flujos UI pasaron en `artifacts/peru-integrated-20260930212136146-24116`. El barrido de 22 pantallas falló en conciliación con «Invalid or unexpected token»; `run.json` conserva `success=false`. Se amplió la traza de errores y se repite el barrido. No se acredita el ensayo global hasta resolver esta comprobación.
