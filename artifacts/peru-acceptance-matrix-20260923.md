# Matriz de aceptación funcional Perú — 2026-09-23

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

| Módulo / operaciones ofrecidas | Evidencia de operación | Pendiente funcional concreto | Resultado |
| --- | --- | --- | --- |
| Alta empresa, login, wizard fiscal, PFX y SUNAT | `http.json`: alta no demo, reintento, login, validación de RUC/titular/clave, secretos cifrados y reanudación | Recorrer wizard desde navegador con errores de red y roles; aceptación fiscal externa cuando exista cliente | OK local API; navegador parcial |
| Usuarios, roles, sesiones, sucursales | `http.json`: cambio de empresa, revocación de privilegio, aislamiento; `artifacts/peru-integrated-20260923102951518-2884`: primer cliente crea sucursal en API con ACL 555, ya promovida | Edición/desactivación de usuarios, asignaciones de sucursal, búsqueda y recuperación desde navegador | Parcial |
| Clientes y proveedores: alta, edición, consulta, búsqueda | `http.json`: alta/consulta de proveedor; 22 pantallas con registros | Edición y búsqueda persistidas de ambos; duplicados, permisos y aislamiento por acción | Parcial |
| Productos, categorías, almacenes, stock, kardex | `http.json`: alta idempotente de servicio, stock por recepción/venta/devolución y lecturas POS; `artifacts/peru-integrated-20260923102951518-2884`: primer cliente crea categoría, almacén, producto físico y stock inicial por código, dry-run rechaza referencia ajena y replay no duplica; 555 promovida | Edición/búsqueda, ajustes, transferencias, kardex exportado; carga masiva de productos: `productos` está en `MIGRATION_RUN_TYPES`, pero no en `MIGRATION_IMPORTER_RUN_TYPES` ni tiene ruta/importador | Parcial |
| Cotizaciones de compra y venta: alta, consulta, aprobación, conversión | `http.json`: ambas creadas/reintentadas, venta aprobada por otro actor y convertida sin duplicar | Edición, rechazo/anulación, búsqueda, exportación/impresión y roles desde navegador | OK local en ruta principal; resto pendiente |
| Compra: orden, aprobación, recepción parcial/total, factura, CxP, pago, asiento | `http.json`: cadena persistida con dos actores, stock, cuenta, cargo bancario, asiento y reintentos; variantes USD/servicio/rechazo | Navegador de pago/factura y errores recuperables; impresión/exportación; autorizaciones de cada transición | OK local API en cadena principal; parcial UI |
| Devolución de compra y nota | `http.json`: antes de factura y saldo pendiente, reverso de inventario/contabilidad, incompatibilidad con factura pagada | Nota fiscal externa y recuperación por UI; devolución parcial múltiple | Parcial |
| Pedido de venta, preparación, despacho, CPE, CxC, cobro, caja, contabilidad | `artifacts/peru-integrated-20260923122407762-17892/http.json`: cotización→pedido→despacho→CPE/CxC→cobro parcial bancario→saldo en efectivo a caja→arqueo/cierre→dos asientos; reintentos, caja inválida rechazada sin mutación; POS ticket→caja→asiento. Navegador consulta ambos cobros e historial/exportación. | Registrar cobranza desde navegador, anulación y reintento incierto; transmisión externa | OK local API con transferencia y efectivo; consulta UI OK; resto pendiente |
| POS y cajas: abrir, vender, cerrar, arqueo | `http.json`: venta de ticket, stock, efectivo, cierre, asiento e idempotencia; navegador integrado previo | Venta CPE, cambio de turno, pagos mixtos, devolución, impresora/Tauri físicos y errores de red | OK local ticket; fiscal/hardware pendiente |
| RMA y notas de crédito | `http.json`: alta, rechazo anticipado, aprobación por otro actor, recepción, nota/CxC/asiento únicos | Recepción parcial, saldo a favor/cobro previo, impresión y anulación de nota | Parcial |
| Logística y GRE: picking, despacho, traslado, guía, reintento | `http.json`: preparación/despacho y lecturas; pruebas API/SQL previas de GRE | Guía local completa desde UI, traslado entre sucursales y transmisión/acuse SUNAT externa | Parcial |
| CPE: emitir, consultar, anular, descargar/impresión, reintentar | Pruebas de firma y A4, visual de factura/boleta demo; `http.json` nota RMA y ticket interno | Emisión fiscal local completa ligada a pedido y CxC; RA/RC, boleta/factura/NC/ND, PDF/XML, timeout/reintento | Parcial; aceptación externa pendiente |
| SIRE: preparar, consultar, exportar, presentar/rectificar | `artifacts/peru-integrated-20260923071858181-5776/http.json`: RVIE/RCE locales generados, repetidos sin duplicar, listados, descargados con SHA-256 verificado, aislados por tenant; período inválido y envío desde demo rechazados | Navegador, conciliación con fuentes fiscales, respuesta oficial SUNAT y rectificación | Instantánea local OK; presentación externa pendiente |
| CxP, bancos, tesorería, conciliación, detracciones | `http.json`: deuda, pago, banco, asiento; conciliación creada/consultada | Pagos parciales, programación/lotes, reversos, conciliación aplicada, detracción y recuperación de fallos | Parcial |
| CxC, cobranzas, caja, reportes financieros | `artifacts/peru-integrated-20260923122407762-17892`: dos cobros de pedido, transferencia a banco y efectivo a caja, replay sin duplicación, sesión inválida rechazada sin mutación, saldo cero, arqueo/cierre y dos asientos cuadrados. Navegador mostró historial con ambos cobros, exportó CSV y recuperó un 503 en consulta. `artifacts/peru-integrated-20260923070817259-4196`: búsqueda por número/cliente, rechazo anónimo y aislamiento. RMA afecta saldo. | Registrar cobro desde UI, nota sobre cuenta pagada, conciliación, permisos diferenciados por rol, recuperación de red durante cobro y reportes financieros | Parcial; transferencia/efectivo API, búsqueda e historial/exportación UI OK local |
| Contabilidad: asientos, periodos, centros, plan, presupuestos | `http.json`: asientos automáticos únicos/cuadrados; lecturas de centros, presupuestos, eventos | Asiento manual/edición/reverso, cierre/rehabilitación de periodo, presupuestos y centros persistidos con roles | Parcial |
| Contabilidad: activos, diferidos, consignación, consolidación, revaluación | `http.json`: sólo lecturas de activos/diferidos/consignación/consolidación/tipos de cambio | Alta→proceso→asiento→reporte por cada submódulo, reversos y aislamiento | Sólo lectura verificada |
| Reportes contables y tributarios, libros, impuestos anual | `artifacts/peru-integrated-20260923073133928-14620/http.json`: cinco TXT PLE exportados individualmente y en lote, RUC del emisor, Diario con 21 campos y debe=haber, contenido aislado por tenant, mes inválido rechazado; reportes comerciales filtrados | PVS SUNAT, conciliación completa de RV/RCE con documentos, UI/impresión y cálculos/declaraciones anuales | PLE local parcial; aceptación tributaria externa pendiente |
| RR. HH.: candidatos, empleado, contrato, asistencia | `http.json`: lecturas; ensayo visual de candidato | Alta/edición, contratación, asistencia y permisos/aislamiento completos | Parcial |
| Planilla, pagos, T-Registro, PLAME, liquidaciones | `http.json`: cálculo PE con norma, aprobación distinta, pago/banco/asiento únicos y bloqueo sin norma | Altas laborales desde UI, liquidación, CTS, exportaciones T-Registro/PLAME y constancias externas | OK local cadena planilla; resto pendiente |
| Configuración comercial, fiscal, RR. HH., establecimientos | `http.json`: primer cliente completa identidad/PFX/credenciales cifrados | Series, impuestos, GRE/SIRE, sucursales y parámetros con edición, permisos, recarga y errores desde UI | Parcial |
| Migración/importación de maestros y exportaciones | `artifacts/peru-integrated-20260923092617881-10028`: primer ADMIN no demo previsualiza clientes/proveedores, ejecuta dry-run sin escritura, importa archivo mixto con error por fila, consulta lote, reintenta sin duplicar y oculta lote ajeno con 404. Navegador descarga plantilla, bloquea CSV inválido/503, reintenta, importa, busca y exporta ambas filas. La 554 y el exportador #114 están desplegados (`artifacts/peru-production-verification-after-114-20260923.json`). `artifacts/peru-integrated-20260923102951518-2884`: CxC/CxP iniciales con saldo, referencia inexistente, total conciliado, reintento y colisión sin alterar deuda; stock inicial por código de producto, persistencia y replay; diez navegadores pasan. El ajuste posterior de descarga pasó diez navegadores locales en `artifacts/peru-integrated-20260923111137269-19612`; CI de main para #116 pasó tras el ajuste. `artifacts/peru-integrated-20260923114009161-23644`: balance de apertura cuadrado, validación y replay; CPE histórico local sin SUNAT/outbox, referencia de cliente y replay. | Actualización por CSV, roles diferenciados, archivos grandes, validación contable integral con saldos reales y aceptación SUNAT del futuro cliente | Clientes/proveedores OK API+navegador; CxC/CxP, stock, balance y CPE histórico OK local API; #116 desplegado y CI verde |
| Documentos, descargas, auditoría, ayuda, offline | `http.json`: auditoría real paginada, aislada y con permisos; documentos sólo lectura | Descarga/impresión y búsqueda; cola offline, reinicio/replay; controles de auditoría desde UI | Auditoría API OK; resto parcial |

## Comprobaciones transversales

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
  `1dc54b73` también pasaron; el escenario de cobro en efectivo añadido después
  permanece en validación local y aún no forma parte de CI.
- Plan efectivo de Render: pendiente de inspección administrativa; `render.yaml`
  declara Starter, sin prueba de facturación/plan efectivo.

## Decisión actual

No se acredita lanzamiento integral. El onboarding técnico del primer cliente y
varias cadenas principales funcionan en local; las operaciones enumeradas como
pendientes necesitan ejecución funcional. La aceptación/acuse SUNAT y el hardware
requieren credenciales/entorno del futuro cliente, sin bloquear las pruebas locales.
