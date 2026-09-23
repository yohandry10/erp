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
| Usuarios, roles, sesiones, sucursales | `http.json`: cambio de empresa, revocación de privilegio, aislamiento; pruebas API/SQL previas | Alta/edición/desactivación de usuarios, asignaciones de sucursal, búsqueda y recuperación desde navegador | Parcial |
| Clientes y proveedores: alta, edición, consulta, búsqueda | `http.json`: alta/consulta de proveedor; 22 pantallas con registros | Edición y búsqueda persistidas de ambos; duplicados, permisos y aislamiento por acción | Parcial |
| Productos, categorías, almacenes, stock, kardex | `http.json`: alta idempotente de servicio, stock por recepción/venta/devolución y lecturas POS | Alta/edición/búsqueda de producto físico, categoría, almacén; ajustes, transferencias, kardex exportado y sucursales | Parcial |
| Cotizaciones de compra y venta: alta, consulta, aprobación, conversión | `http.json`: ambas creadas/reintentadas, venta aprobada por otro actor y convertida sin duplicar | Edición, rechazo/anulación, búsqueda, exportación/impresión y roles desde navegador | OK local en ruta principal; resto pendiente |
| Compra: orden, aprobación, recepción parcial/total, factura, CxP, pago, asiento | `http.json`: cadena persistida con dos actores, stock, cuenta, cargo bancario, asiento y reintentos; variantes USD/servicio/rechazo | Navegador de pago/factura y errores recuperables; impresión/exportación; autorizaciones de cada transición | OK local API en cadena principal; parcial UI |
| Devolución de compra y nota | `http.json`: antes de factura y saldo pendiente, reverso de inventario/contabilidad, incompatibilidad con factura pagada | Nota fiscal externa y recuperación por UI; devolución parcial múltiple | Parcial |
| Pedido de venta, preparación, despacho, CPE, CxC, cobro, caja, contabilidad | `artifacts/peru-integrated-20260923063745572-21668/http.json`: cotización→pedido→despacho→CPE/CxC→dos cobros→banco→dos asientos; reintentos; POS ticket→caja→asiento | Recorrer cobranza desde navegador, cobro en efectivo→caja, anulación y reintento incierto; transmisión externa | OK local API con transferencia; otros canales pendientes |
| POS y cajas: abrir, vender, cerrar, arqueo | `http.json`: venta de ticket, stock, efectivo, cierre, asiento e idempotencia; navegador integrado previo | Venta CPE, cambio de turno, pagos mixtos, devolución, impresora/Tauri físicos y errores de red | OK local ticket; fiscal/hardware pendiente |
| RMA y notas de crédito | `http.json`: alta, rechazo anticipado, aprobación por otro actor, recepción, nota/CxC/asiento únicos | Recepción parcial, saldo a favor/cobro previo, impresión y anulación de nota | Parcial |
| Logística y GRE: picking, despacho, traslado, guía, reintento | `http.json`: preparación/despacho y lecturas; pruebas API/SQL previas de GRE | Guía local completa desde UI, traslado entre sucursales y transmisión/acuse SUNAT externa | Parcial |
| CPE: emitir, consultar, anular, descargar/impresión, reintentar | Pruebas de firma y A4, visual de factura/boleta demo; `http.json` nota RMA y ticket interno | Emisión fiscal local completa ligada a pedido y CxC; RA/RC, boleta/factura/NC/ND, PDF/XML, timeout/reintento | Parcial; aceptación externa pendiente |
| SIRE: preparar, consultar, exportar, presentar/rectificar | Pruebas API/SQL previas; ruta web disponible | Recorrido local persistido de propuesta/libro y validaciones; respuesta oficial SUNAT | Sin aceptación integral |
| CxP, bancos, tesorería, conciliación, detracciones | `http.json`: deuda, pago, banco, asiento; conciliación creada/consultada | Pagos parciales, programación/lotes, reversos, conciliación aplicada, detracción y recuperación de fallos | Parcial |
| CxC, cobranzas, caja, reportes financieros | `artifacts/peru-integrated-20260923070817259-4196/http.json`: CxC de pedido cobrada en dos pagos, banco y asientos únicos; búsqueda por número/cliente, rechazo anónimo y aislamiento entre empresas. El navegador buscó la cuenta, mostró ambos cobros, exportó la fila CSV y recuperó un 503 tras reintentar. RMA afecta saldo. | Cobro en efectivo→caja, nota sobre cuenta pagada, conciliación y permisos diferenciados por rol | Parcial; transferencia, búsqueda e historial/exportación OK local |
| Contabilidad: asientos, periodos, centros, plan, presupuestos | `http.json`: asientos automáticos únicos/cuadrados; lecturas de centros, presupuestos, eventos | Asiento manual/edición/reverso, cierre/rehabilitación de periodo, presupuestos y centros persistidos con roles | Parcial |
| Contabilidad: activos, diferidos, consignación, consolidación, revaluación | `http.json`: sólo lecturas de activos/diferidos/consignación/consolidación/tipos de cambio | Alta→proceso→asiento→reporte por cada submódulo, reversos y aislamiento | Sólo lectura verificada |
| Reportes contables y tributarios, libros, impuestos anual | Páginas disponibles; pruebas de algunos cálculos/exports y reportes comerciales | Cifras reconciliadas contra asientos y comprobantes, filtros, exportación/impresión, rectificación | Sin aceptación integral |
| RR. HH.: candidatos, empleado, contrato, asistencia | `http.json`: lecturas; ensayo visual de candidato | Alta/edición, contratación, asistencia y permisos/aislamiento completos | Parcial |
| Planilla, pagos, T-Registro, PLAME, liquidaciones | `http.json`: cálculo PE con norma, aprobación distinta, pago/banco/asiento únicos y bloqueo sin norma | Altas laborales desde UI, liquidación, CTS, exportaciones T-Registro/PLAME y constancias externas | OK local cadena planilla; resto pendiente |
| Configuración comercial, fiscal, RR. HH., establecimientos | `http.json`: primer cliente completa identidad/PFX/credenciales cifrados | Series, impuestos, GRE/SIRE, sucursales y parámetros con edición, permisos, recarga y errores desde UI | Parcial |
| Migración/importación de maestros y exportaciones | Suites API/SQL previas; rutas de descarga | CSV real con errores por fila, duplicados, rollback y exportes descargables por rol | Sin aceptación integral |
| Documentos, descargas, auditoría, ayuda, offline | `http.json`: auditoría real paginada, aislada y con permisos; documentos sólo lectura | Descarga/impresión y búsqueda; cola offline, reinicio/replay; controles de auditoría desde UI | Auditoría API OK; resto parcial |

## Comprobaciones transversales

- Aislamiento entre dos empresas y rechazo anónimo/sin permiso: probado en login,
  ventas POS, compras y auditoría. Debe repetirse en mutaciones de cada módulo.
- Idempotencia y contabilidad: probadas en POS, compras, planilla, cotizaciones,
  despacho y RMA. Faltan cobros parciales, CPE/guías y fallos de red ambiguos.
- Navegador: ocho recorridos integrados y 22 pantallas con registros sólo acreditan
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
- Producción: `artifacts/peru-production-verification-20260923.json` acredita
  versión 62068eec, esquema 553, DB, Redis, login y CORS sin escrituras sintéticas.
- CI de `main`: ejecuciones 35826660731, E2E 35826660734 y Security Scan
  35826660864 terminaron en verde para `62068eec`. El escenario de cobro nuevo
  aún es cambio local; no forma parte de ese CI.
- Plan efectivo de Render: pendiente de inspección administrativa; `render.yaml`
  declara Starter, sin prueba de facturación/plan efectivo.

## Decisión actual

No se acredita lanzamiento integral. El onboarding técnico del primer cliente y
varias cadenas principales funcionan en local; las operaciones enumeradas como
pendientes necesitan ejecución funcional. La aceptación/acuse SUNAT y el hardware
requieren credenciales/entorno del futuro cliente, sin bloquear las pruebas locales.
