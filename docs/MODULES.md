# Módulos y flujos funcionales

Este documento describe responsabilidades y límites. Los DTO, endpoints y tablas
exactos se consultan en código, OpenAPI y migraciones.

## Ventas

Flujo principal:

```text
Cotización -> Pedido -> Reserva -> Despacho -> Documento/CPE -> Cobro -> Asiento
```

- Cotizaciones y pedidos calculan IGV según la afectación real del producto.
- La gestión comercial resuelve listas de precios por vendedor, cliente,
  producto exacto o marca, con moneda, cantidad mínima, vigencia y prioridad.
  Producto exacto prevalece sobre marca; el precio y el alcance elegidos se
  congelan en la misma transacción de cotización, pedido o POS. Convertir una
  cotización hereda su snapshot y no revaloriza la historia.
- El vendedor operativo puede provenir de la identidad canónica
  `usuarios_sistema` o de referencias comerciales legacy verificadas dentro del
  mismo tenant. Un reintento POS usa la intención persistida antes de revaluar
  reglas; cambiar actor, sesión, carrito, receptor o medio de pago produce una
  colisión idempotente y no una segunda venta.
- Las comisiones por vendedor, producto y/o marca forman un ledger append-only:
  sólo una venta POS pagada o una factura/boleta válida devenga. Una factura
  directa usa `documentos.created_by`; una factura de pedido usa su creador.
  La marca proviene del snapshot de venta cuando existe, de modo que editar el
  producto después no altera la regla histórica. NC y anulaciones agregan
  reversas o reintegros serializados; nunca reescriben el devengo.
- El consolidado comercial agrupa ventas POS y documentos válidos de una sola
  moneda (la UI opera bloques de hasta diez). Congela cabecera y líneas, impide
  reutilizar una fuente, es idempotente e inmutable y no publica outbox ni crea
  otro asiento: los efectos contables siguen perteneciendo a cada venta origen.
- La cotización puede enviarse y ser aprobada o rechazada por un actor distinto
  de su creador; `BORRADOR`, `ENVIADA` y `APROBADA` son elegibles para convertir
  a pedido, según permisos.
- Confirmar un pedido distingue una excepción comercial pendiente de aprobación
  de un bloqueo crediticio: el primero continúa por la bandeja de aprobaciones y
  el segundo exige regularizar la cuenta del cliente. No existe confirmación
  forzada desde el contrato público.
- La reserva de stock es transaccional e idempotente.
- Facturación genera documento, CPE, cuenta por cobrar cuando corresponde y
  trazabilidad contable.
- Notas de crédito y anulaciones restauran stock y registran reversos.
- RMA cubre solicitud, aprobación/rechazo segregado, recepción parcial o
  completa, reversa previa a la nota de crédito y cierre. No se puede recibir
  una solicitud `CREADA`; quien la creó tampoco puede aprobarla.
- La clasificación fiscal/logística de cada línea se congela al crear la RMA.
  Sólo los bienes marcados entonces como stock-controlados generan recepción
  física; servicios y productos sin control de stock avanzan lógicamente.
- El cierre emite un documento interno y CPE 07 por las líneas devueltas sin
  anular la factura original completa. La serie FC/BC se deriva del comprobante
  origen y la transmisión fiscal queda pendiente hasta que el cliente configure
  sus propias credenciales o firma; el flujo interno no exige habilitación legal.
- La nota de crédito reduce la cuenta por cobrar hasta cero y lleva el exceso a
  saldo a favor del cliente (cuenta 122). Ese pasivo puede aplicarse a una CxC
  futura o reembolsarse por una caja/sesión o cuenta bancaria explícita.
- `nota_credito.emitida`, `saldo_favor.aplicado` y
  `saldo_favor.reembolsado` son los únicos dueños contables de esas operaciones;
  la recepción física no vuelve a contabilizar el inventario.

Código principal: `apps/erp-api/src/modules/ventas`,
`apps/erp-api/src/modules/documentos`, `apps/erp-api/src/modules/cpe`.

## POS y cajas

```text
Apertura -> Venta -> Pago -> Ticket/CPE -> Movimiento de caja -> Cierre
```

- La caja abierta determina sucursal y almacén.
- El ticket `Txxx` es interno; el comprobante fiscal usa serie `Bxxx/Fxxx`.
- Pagos mixtos sólo afectan la gaveta por la porción en efectivo.
- Venta, detalle, stock por almacén, pagos, movimiento de efectivo, documento,
  CxC a crédito, intención CPE cuando corresponda y evento contable se confirman
  en una única frontera transaccional. La misma clave sólo admite la misma
  intención normalizada; cambiar carrito o pago en un reintento falla sin
  aplicar impactos nuevos.
- Un precio de lista distinto al catálogo sólo entra si el writer recalcula en
  servidor la regla vigente y coincide con su snapshot; un flag del navegador
  no puede autorizarlo. El retry de una venta ya confirmada reutiliza el
  snapshot persistido aunque la lista luego expire o se desactive.
- En Perú, `emitir_cpe=false` crea sólo el ticket interno y no consume serie ni
  correlativo fiscal. Puede canjearse una única vez a factura 01 o boleta 03;
  factura exige cliente activo con RUC válido y boleta aplica las reglas del
  receptor y el umbral de S/ 700.
- El canje reconstruye líneas e importes desde la venta congelada, reserva el
  documento/CPE fiscal y sólo relinkea la referencia documental de una CxC
  existente. No repite inventario, pagos, caja/banco, ingreso, costo, comisión,
  saldo de CxC ni el evento `pos.venta.registrada`; ticket, receptor original,
  receptor fiscal y documento final permanecen trazables.
- El worker CPE firma y adopta el documento fiscal ya reservado por POS; no
  vuelve a facturar ni crea una segunda CxC al procesar o reintentar la cola.
- Servicios y productos sin control de stock se venden sin crear kardex; un SKU
  físico repetido en el carrito produce un solo movimiento por cantidad total.
- El cierre diferencia arqueo real de cierre administrativo.
- Un ticket interno puro no es un CPE pendiente y no bloquea el cierre; un canje
  fiscal reservado sí debe finalizar. No se cierra con CPE pendiente, venta
  incompleta, outbox/CxC inconsistente ni
  secuencia de movimientos inválida. El cierre y corte son idempotentes y
  durables; un sobrante o faltante emite `caja.cerrada` y genera su asiento.
- Consultar una sesión nunca debe cerrarla como efecto lateral.
- Reintentar una venta reutiliza identidad y correlativo reservados.
- Ingresos y gastos manuales exigen cuenta de contrapartida; un retiro a banco
  exige una cuenta bancaria real y un retiro a bóveda o gasto conserva su
  destino contable. Caja, saldo, evidencia y outbox se confirman juntos.
- El cambio de turno congela la sesión, exige confirmación de ambos usuarios y
  contabiliza sólo la diferencia entre saldo del sistema y conteo. Cancelarlo
  debe quedar confirmado por el servidor antes de descongelar la caja.

Código principal: `apps/erp-api/src/modules/pos`,
`apps/erp-api/src/modules/cajas`, `apps/web/app/dashboard/pos`.

## Fiscal: CPE, GRE y SIRE

- CPE construye UBL, firma, envía, consulta, almacena CDR y produce
  representación impresa.
- Envío y consulta usan reserva, llamada externa y finalización durable. Un
  retry reutiliza la operación y no puede repetir una transmisión ya reclamada;
  el worker POS adopta el documento reservado sin crear otra factura o CxC.
- Factura, boleta, notas, RA y RC tienen soporte beta verificado.
- El Centro de Documentos crea y modifica borradores manuales mediante RPCs
  atómicas con tenant, actor, RBAC, idempotencia y fingerprint. PostgreSQL
  reserva el correlativo y recalcula detalle, descuentos, base, IGV y total;
  el cliente no decide montos, número ni estado. Cada serie debe darse de alta
  antes mediante su RPC y permiso específicos; crear un documento nunca
  auto-crea una serie por el helper legacy.
- Factura y boleta manual delegan su emisión al writer CPE canónico: documento,
  CPE, CxC cuando corresponde y outbox se confirman en una frontera única. Un
  contrato permanece no fiscal. Las NC/ND sólo nacen desde el comprobante
  original y no anulan un pedido ni duplican stock, CxC o asientos.
- El XML canónico siempre es UBL firmado con el certificado configurado por el
  tenant. La demo y QA usan transporte local simulado, sin habilitación legal
  ni transmisión real; al aportar sus credenciales, el cliente reutiliza el
  mismo flujo.
- RA (facturas) y RC operación 3 (boletas) sólo aceptan CPE que 448 ya dejó
  `ANULADO` con reversa comercial durable confirmada; no son un atajo para
  anular deuda, ingreso, stock o pedido. El Centro de Documentos expone la
  selección elegible, creación/firma, envío/reintento y consulta de ticket.
- Cada lote reserva cabecera y detalle atómicamente, bloquea sus CPE en orden
  determinista, congela el XML firmado y conserva ticket, estado, error e
  intentos. Aceptar exige ticket, código y CDR; `ACEPTADO`/`RECHAZADO` son
  terminales e idempotentes sólo para la misma huella de respuesta. Reintentar
  no crea otro lote ni duplica efectos comerciales o contables.
- GRE usa transporte configurable y conserva estados asíncronos.
- SIRE genera una vista local de comparación por período para RVIE y RCE. La
  aceptación de la propuesta oficial usa la API SUNAT exclusivamente desde el
  backend, exige `sire_activo`, credenciales SOL/API y la referencia física de
  PROD; DEV y empresas demo fallan cerrado aunque contengan credenciales.
- Recibir `numTicket` deja el reporte en `PENDIENTE`; no se informa como
  aceptado hasta que la consulta oficial devuelve el código `06` (`Terminado`).
  Cada aceptación y consulta queda en `sire_operaciones` sin tokens ni secretos.
  La generación final del registro continúa en SUNAT Operaciones en Línea.
- Todo flujo fiscal falla cerrado ante credenciales, certificado, firma o
  respuesta inválidos.

Código principal: `apps/erp-api/src/modules/cpe`,
`apps/erp-api/src/modules/gre`, `apps/erp-api/src/modules/sire`,
`apps/erp-api/src/modules/ose`.

## Compras

```text
Cotización -> Aprobación -> Orden de compra -> Recepción -> CxP -> Pago
```

- Órdenes y recepciones conservan cantidades pedidas, recibidas y pendientes.
- La creación de recepción reserva en PostgreSQL un correlativo único por tenant
  y guarda cabecera e ítems en una RPC atómica con actor e idempotencia; un
  reintento reutiliza la misma recepción y nunca deja cabeceras huérfanas.
- Cerrar una recepción actualiza cumplimiento, inventario aplicable y outbox
  contable en una operación transaccional e idempotente.
- El cierre cumple la orden para bienes y servicios aceptados, pero sólo mueve
  inventario para bienes físicos con control de stock. La recepción reconoce el
  costo pendiente de factura; la CxP y el crédito fiscal nacen al registrar la
  factura real del proveedor, no al recibir la mercadería o el servicio.
- Devoluciones al proveedor revierten existencia y obligación según estado.
- Aprobaciones respetan tenant, rol, monto y estado.

Código principal: `apps/erp-api/src/modules/compras`.

## Inventario y logística

- El saldo físico vive en `producto_existencias`.
- Los movimientos conservan almacén, producto, cantidad, costo, referencia e
  idempotencia.
- Reservar no descuenta físico; despachar/facturar aplica el movimiento
  autoritativo.
- Ajustes, transferencias, recepciones y POS usan el mismo writer.
- El kardex valorizado proyecta todos los movimientos físicos (`ENTRADA`,
  `SALIDA`, `AJUSTE` y `DEVOLUCION`) desde ese ledger único. Producto, almacén
  y fechas se filtran dentro del mismo RPC; el detalle puede limitarse, pero el
  resumen siempre agrega el conjunto completo. Cantidad, costo, moneda origen,
  moneda base y tipo de cambio quedan congelados en el movimiento. Si falta
  costo, dirección o TC, el saldo afectado queda pendiente: no se sustituye por
  cero ni se suman monedas/base distintas. El backfill histórico sólo usa
  evidencia persistida y un snapshot confirmado no admite cambiar almacén,
  referencia, semántica de signo ni columnas de valorización.
- Picking, packing, despacho, backorders y GRE mantienen referencia al pedido.
- Stock inicial exige `almacen_id` válido.
- Productos, categorías, almacenes y ubicaciones se modifican exclusivamente
  mediante RPCs transaccionales `service_role`: reciben tenant y actor activo,
  separan la clave idempotente del payload y rechazan reutilizarla con otro
  fingerprint. La firma legacy `crear_producto_inventario_tx` permanece como
  puente de importación/verificación; API y UI usan el contrato maestro.
- `marca` forma parte del alta, edición, huella idempotente y respuesta del
  producto maestro. Puede limpiarse explícitamente y alimenta listas de precios
  y comisiones futuras; las ventas ya confirmadas conservan la marca congelada.
- El código de producto/almacén y el nombre/código de categoría son únicos por
  tenant sin distinguir mayúsculas; el código de ubicación es único dentro de
  cada almacén. Renombrar una categoría actualiza sus productos en el mismo
  commit.
- La desactivación es lógica y se rechaza con stock, reservas, dañados,
  productos activos o ubicaciones activas según corresponda. Siempre existe un
  único almacén principal entre los activos y una existencia con saldo sólo
  puede apuntar a una ubicación activa de su mismo almacén.
- La pantalla de almacenes permite alta, edición, reactivación y desactivación
  de almacenes y ubicaciones con permisos RBAC granulares; no depende de una
  consola de base de datos.
- La foto del producto se carga desde alta o edición en JPG, PNG o WebP (máximo
  5 MB) al bucket Supabase `product-images`. El navegador nunca recibe la clave
  de servicio ni escribe Storage directamente: API, permiso
  `inventario.productos.update`, tenant, actor e intención idempotente reservan
  metadata y ruta antes de subir. Activar una foto cambia `imagen_url` y deja la
  anterior en limpieza segura; quitarla despeja primero la referencia visible y
  luego confirma el borrado del objeto. Reintentar completa la misma operación
  sin duplicar metadata ni aceptar otra huella.

Código principal: `apps/erp-api/src/modules/inventario`,
`apps/erp-api/src/modules/logistica`.

## Finanzas y tesorería

- CxC y CxP gestionan saldo, vencimiento, pagos y estados.
- El aging CxC es un snapshot a una fecha de corte local del tenant. Incluye
  toda deuda emitida hasta el corte aunque sea antigua, reconstruye pagos y
  reversas desde `cxc_pagos` y aplicaciones desde `saldos_favor_movimientos`,
  y deriva mora/estado a esa fecha. Una reversa legacy sin timestamp se marca
  pendiente de reconstrucción. Expone saldos
  por moneda origen y equivalentes con TC documental congelado por separado;
  una cuenta sin moneda, TC o reconstrucción confiable se identifica como
  pendiente y nunca se mezcla nominalmente con otra divisa. La UI exporta el
  detalle al corte en CSV neutralizado.
- El rol CONTADOR puede consultar proveedores para filtrar CxP, pero no recibe
  por ello permisos de alta, edición, recepción ni pago. Las listas CxC/CxP
  exportan CSV real y neutralizan fórmulas de hoja de cálculo.
- Tesorería cubre cajas, bancos, movimientos y conciliaciones.
- Cada cuenta bancaria debe mapear una cuenta contable de movimiento. Un
  movimiento manual exige moneda, categoría, contracuenta, actor e intención
  idempotente; movimiento, tres saldos y outbox contable se confirman en una
  sola transacción. Las transferencias internas crean un par cargo/abono
  inseparable, bloqueando ambas cuentas en orden estable.
- La conciliación opera por RPCs reservadas al servicio: período mensual único,
  importación CSV como lote atómico con saldos inicial/final comprobables,
  match exacto manual/automático/por lote y cierre sin excepción forzada. Toda
  diferencia se resuelve antes mediante un ajuste bancario explícito con
  contracuenta y outbox; un período cerrado y sus movimientos son inmutables,
  incluso frente a escrituras tardías sin `conciliacion_id`.
- Cobranzas y pagos por lote requieren referencias idempotentes.
- Retenciones, percepciones, detracciones y anticipos se aplican a una CxC o
  CxP mediante el writer `registrar_ajuste_fiscal_financiero_tx`: recibe tenant,
  actor e intención idempotente, bloquea documento/anticipo, verifica la huella,
  actualiza saldo y publica el outbox en el mismo commit. La percepción aumenta
  el saldo; retención, detracción y anticipo lo reducen.
- Un anticipo no nace al digitar un monto en una factura. Primero debe existir
  en `anticipos_terceros`, creado junto con su abono de cliente o cargo de
  proveedor mediante `registrar_anticipo_tercero_tx`; cada aplicación consume
  su saldo disponible con lock. La factura de proveedor exige `anticipo_id` si
  declara anticipo.
- La detracción de proveedor reclasifica CxP a 421 y queda
  `PENDIENTE_TESORERIA`; `depositar_detraccion_proveedor_tx` genera después el
  cargo bancario Dr 421 / Cr banco sin volver a reducir la CxP. Los ajustes CxP
  publican `cxp.ajuste.registrado`; los ajustes CxC reutilizan el writer 452.
- Un ajuste CxC activo no se confunde con un cobro. Su reversa exige motivo y
  confirmación explícitos mediante `revertir_ajuste_fiscal_cxc_tx`: inactiva el
  `cxc_pagos` documental, restaura saldos/totales y, si corresponde, libera el
  anticipo; marca la operación `ANULADO` y emite `cxc.ajuste.revertido` sin
  generar caja ni banco. La anulación CPE permanece bloqueada mientras exista
  cualquier `cxc_pagos` activo, incluso si su tipo no es `PAGO`.
- La factura de proveedor genera un único asiento compuesto: base e IGV más
  percepción al debe; saldo neto del proveedor, retención, detracción y
  aplicación de anticipo al haber. No se publican asientos adicionales por sus
  ajustes iniciales.
- Renta de quinta categoría pertenece a RRHH/planilla y no se modela como
  proveedor. El flujo financiero no expone `QUINTA` y preserva sólo registros
  legacy históricos.
- Los dashboards financieros consumen agregados; no reconstruyen reglas
  contables en frontend.
- La ruta raíz de Finanzas funciona como centro operativo y enlaza CxC, CxP,
  bancos, tesorería, conciliación y reportes; no debe renderizar una superficie
  vacía ni depender de una redirección cliente.

Código principal: `apps/erp-api/src/modules/finanzas`,
`apps/erp-api/src/modules/retenciones`, `apps/erp-api/src/modules/cajas`.

## Contabilidad

- Plan de cuentas, períodos, centros de costo y presupuestos son catálogos
  tenant-scoped.
- Si una operación alcanza un mes todavía no configurado, el backend crea de
  forma idempotente el período `ABIERTO`; nunca permite el movimiento bajo un
  estado abierto meramente implícito e invisible para el contador.
- Asientos se originan en eventos de ventas, compras, POS, caja, RRHH y activos.
- Debe/haber debe cuadrar y el período debe permitir la operación.
- Libros, estados financieros y materialized views son proyecciones.
- El Balance de Comprobación y el Balance General son estados a fecha de cierre:
  conservan el último saldo de cuentas sin movimiento en el mes y respetan la
  naturaleza deudora o acreedora. La pantalla de estados incluye comprobación,
  resultados, situación financiera, flujo de efectivo indirecto e indicadores;
  estos dos últimos explicitan sus supuestos y no se presentan como EBITDA
  auditado ni como sustituto de conciliación bancaria.
- La descarga PLE de Diario y Mayor filtra exclusivamente asientos
  `CONFIRMADO`. El Balance de Comprobación electrónico es el formato SUNAT 3.17
  (`031700`), con período `AAAAMMDD` al cierre y 19 campos posicionales; el
  formato 3.1 pertenece al Estado de Situación Financiera y no se usa para este
  reporte. Los TXT son insumos para PVS: el ERP no los presenta ni sustituye la
  validación oficial.
- En el Registro de Compras 8.1, las notas de crédito invierten base, IGV y
  total, conservan la referencia SUNAT del comprobante modificado y una compra
  en moneda extranjera se rechaza si no tiene tipo de cambio de origen; nunca se
  inventa 1.000 para USD u otra divisa.
- El asiento manual nace en `BORRADOR` o `CONFIRMADO`; un confirmado es
  inmutable y se corrige mediante un contra-asiento enlazado, nunca reescribiendo
  silenciosamente el original.
- Cabecera y detalle de asientos, confirmación, reversión, conciliación,
  distribución analítica, devengos, depreciaciones y bajas usan operaciones
  atómicas; sus barreras de idempotencia también viven en la base.
- Multi-moneda conserva importe de origen y cotización, revalúa saldos abiertos
  y reconoce diferencias realizadas en pagos sin duplicar el asiento.
- Plantillas recurrentes generan una sola instancia por período. Activos fijos
  conservan cronograma, depreciación, valor residual y baja. Las partidas de
  terceros pueden conciliarse total o parcialmente y deshacerse sin alterar el
  asiento.
- La distribución analítica reparte una línea por varios ejes independientes.
  Ingresos y gastos diferidos se reconocen por período y la última cuota absorbe
  residuos de redondeo.
- El detalle del asiento permite registrar y mantener esa distribución
  analítica por línea. El registro de consignaciones calcula el total en el
  servidor, toma el tenant del contexto autenticado y limita sus cambios a
  estados válidos; el cliente no puede imponer tenant, total ni estado inicial.
- Consolidación agrupa empresas legalmente separadas solo después de que cada
  miembro acepta la invitación. Homologa códigos de cuenta, exige tasas de
  cierre/promedio/históricas cuando cambia la moneda y aplica eliminaciones o
  reclasificaciones en una capa de reporte que no toca los libros legales.
- Los reportes configurables admiten líneas por prefijos de cuentas y fórmulas
  entre líneas, con alcance de período o acumulado. Las fórmulas son estructuras
  validadas con detección de ciclos; nunca SQL suministrado por el usuario.
- `Contabilidad > Impuestos Perú` prepara el borrador mensual de IGV y renta
  para NRUS, RER, RMT y Régimen General. Ventas salen de CPE, compras de CxP y
  los créditos manuales quedan en una versión con corte y conteos de origen.
- El cálculo aplica IGV, saldos, retenciones y percepciones; NRUS categoriza las
  cuotas S/ 20 y S/ 50, RER calcula 1,5 %, RMT usa 1 % hasta 300 UIT y luego el
  mayor entre coeficiente y 1,5 %, y General usa el mayor entre coeficiente y
  1,5 %. El parámetro 2026 usa UIT S/ 5.500.
- Este espacio no presenta FV 621 ni FV 1611. El contador contrasta contra
  RVIE/RCE, presenta en SUNAT y registra la constancia externa; cada corrección
  crea otra versión y conserva el historial.
- `Contabilidad > Renta anual e ITAN` toma el resultado y los activos del cierre
  contable y prepara la conciliación del FV 710 para Régimen General/RMT. General
  aplica 29,5 %; RMT aplica 10 % hasta 15 UIT y 29,5 % al exceso. Selecciona el
  formulario Completo al superar 1.700 UIT y calcula ITAN al 0,4 % sobre el
  exceso de activos netos ajustados sobre S/ 1.000.000.
- Adiciones, deducciones, pérdidas, créditos y exclusiones ITAN son entradas
  explícitas con papel de trabajo. Un ejercicio abierto o balance descuadrado
  bloquea registrar la constancia. El ERP no presenta FV 710 ni ITAN.

Código principal: `apps/erp-api/src/modules/contabilidad`.

## Recursos humanos

- Empleados, contratos, asistencia, vacaciones y conceptos alimentan planillas.
- Configuración laboral, maestros, reclutamiento, asistencia, solicitudes,
  beneficios, evaluaciones, capacitaciones, horarios, expediente, contratos y
  ficha PLAME convergen en un writer operativo con actor, permiso, huella e
  idempotencia. El job de ausencias exige un actor técnico explícito y falla
  cerrado si no está configurado.
- El país del tenant selecciona el motor normativo; no se mezclan reglas entre
  Perú, Argentina y Colombia.
- Calcular una liquidación PE/AR/CO sólo congela el cálculo: no inactiva al
  empleado ni termina su contrato. La confirmación explícita exige actor y
  aplica cese, devengo `Dr 621 / Cr 411` y outbox en una frontera transaccional
  e idempotente.
- Una liquidación aprobada se paga completa. La transferencia registra la
  evidencia laboral, el cargo bancario y el evento de pago en el mismo commit;
  su asiento es `Dr 411 / Cr 10`. La reversa restaura banco y obligación, crea
  el contra-asiento y conserva el pago original como evidencia `REVERTIDO`.
- CTS usa un libro independiente: recalcular sólo modifica filas `CALCULADO`,
  nunca reabre un depósito realizado. Depositar exige cuenta bancaria, actor y
  referencia, y genera tesorería/outbox/asiento atómicos. Una CTS pendiente que
  ya se incorpora a la liquidación final queda consumida para impedir doble
  pago.
- Perú calcula AFP/ONP, EsSalud, quinta categoría, gratificaciones, CTS,
  vacaciones y liquidación peruana con sus topes y libros idempotentes.
- La configuración laboral Perú expone la normativa efectiva del período
  (UIT, RMV, asignación familiar, AFP/ONP, EsSalud, horas y sobretasas). Los
  contratos AFP conservan administradora, esquema de comisión y tasas
  individuales; la planilla usa esos valores y recurre a la normativa vigente
  sólo como respaldo.
- Argentina valida CUIL y configuración contractual (CCT, categoría, modalidad,
  obra social, sindicato y ART); calcula SIPA, INSSJP, obra social,
  contribuciones patronales, ART, horas extra 50/100, SAC, vacaciones con
  divisor 25 y liquidación final bajo parámetros argentinos versionados.
- Ganancias argentina no se inventa en la interfaz: se recibe como retención
  parametrizada/SiRADIG. LSD y F.931 forman parte del readiness del tenant.
- `RRHH > PLAME / T-Registro` valida cada planilla peruana calculada contra RUC,
  identidad, contrato y códigos paramétricos de la ficha SUNAT. Si falta un dato
  obligatorio muestra un bloqueo y no genera archivos que aparenten estar
  listos para PVS.
- Una versión sin bloqueos contiene papeles de trabajo PLAME y fuentes
  `RP_<RUC>.ide`, `.tra`, `.per` y `.est` para las estructuras 04, 05, 11 y 17,
  con delimitador final y huella SHA-256. El ZIP del ERP no es el ZIP de carga:
  PVS valida las fuentes y produce el ZIP que el usuario carga en SOL.
- Los papeles de trabajo incluyen quinta categoría y recibos por honorarios de
  cuarta categoría. La jornada ordinaria procede de asistencia real o de una
  corrección manual explícita y auditable; si falta, el paquete queda bloqueado.
- Cada trabajador conserva la huella de la última fuente asociada a un CIR. Si
  no cambió, no se repite como alta/modificación; si cambia la identidad, ficha
  o contrato, reaparece automáticamente como novedad pendiente de PVS.
- La constancia PLAME y el ticket/CIR de T-Registro son evidencias distintas. El
  estado sólo pasa a presentado con constancia PLAME real y, si existen
  novedades registrales, con ticket y CIR reales de T-Registro. Las
  rectificatorias preservan versiones y no reescriben evidencia histórica.
- Colombia valida CC/TI/NIT y la configuración de EPS, pensión, ARL, clase de
  riesgo, caja de compensación y exoneraciones; calcula salud y pensión del
  trabajador, aportes patronales, parafiscales, auxilio de transporte,
  horas extra/recargo nocturno, prima, cesantías e intereses, vacaciones y
  liquidación final con parámetros versionados por vigencia. Para la vigencia
  2026 aplica SMMLV 1.750.905, auxilio 249.095, UVT 52.374, tope IBC 25 SMMLV,
  jornada máxima de 42 horas/divisor mensual 210 desde julio, jornada nocturna
  desde las 19:00 y recargo dominical/festivo de 90 % desde julio.
- PLAME/T-Registro (PE) requiere ejecutar PVS/SOL con datos reales; la
  Simplificación Registral/LSD/F.931 (AR) y PILA/nómina electrónica (CO) reales
  requieren credenciales, datos patronales y validación legal-operativa externa.
- Colombia expone configuración y prueba de integración PILA por tenant. En
  demo la prueba es local y marcada como simulada; en una cuenta real se elige
  portal del operador o API privada HTTPS, se cifran token y PIN, y se bloquean
  destinos locales/privados para evitar SSRF. No se simula una API PILA pública.

Código principal: `apps/erp-api/src/modules/rrhh`.

## Administración, auth y configuración

- Tenants, usuarios, roles y permisos determinan acceso.
- El alta administrativa usa la identidad local canónica del ERP: contraseña
  cifrada en `usuarios_sistema`, roles y auditoría se confirman en una sola
  transacción. No se crea una segunda cuenta en el proveedor de autenticación.
  `/usuarios-sistema` (pantalla vigente) y `/users` (compatibilidad) delegan al
  mismo writer; creación exige llave idempotente y actor activo del tenant.
- Cambiar datos/estado/roles revoca sesiones al inactivar, impide la
  auto-desactivación y protege al último superadministrador. Roles y permisos
  también se crean o reemplazan atómicamente, los roles de sistema son
  inmutables y un rol no puede desactivarse si dejaría un usuario activo sin
  acceso. Las decisiones RBAC no usan caché local entre réplicas.
- Un login normaliza el email y crea la sesión en la misma transacción que
  valida usuario y tenant, limpia bloqueos y registra el último acceso. Un
  tenant demo sólo inicia sesión mientras su período de prueba siga vigente.
  Las sesiones revocadas se rechazan en el request siguiente, sin una ventana
  de caché positivo; los tokens de reset nunca se exponen en respuestas HTTP.
- Países operativos: Perú, Argentina y Colombia. El selector inicial y la demo
  crean el tenant con su país, moneda, impuesto, autoridad fiscal, documentos y
  opciones de módulos; el contexto se vuelve a resolver desde el tenant.
- El alta administrativa de empresa, su primer administrador y el RBAC
  operativo se confirman en una sola transacción idempotente. Los reintentos no
  duplican tenants; activar o desactivar sincroniza `tenants` y
  `empresa_config`, y la desactivación revoca las sesiones sin borrar su
  evidencia.
- `/configuracion` y `/configuration` conservan compatibilidad HTTP, pero sus
  escrituras convergen en las mismas fronteras SQL: empresa, parámetros, GRE,
  wizard, series y preferencia de país exigen actor y llave idempotente, toman
  locks por tenant y dejan auditoría. Crear o editar una serie usa el mismo
  contrato, sin recuperar el upsert directo anterior.
- La demo pública PE/AR/CO se crea completa o no se crea: tenant, empresa,
  usuarios segregados, RBAC, almacén, stock canónico, clientes, proveedores,
  caja abierta, banco, plan contable y base de RR. HH. comparten un commit. Un
  retry devuelve el mismo tenant y nunca reescribe AR/ARS o CO/COP como PE/PEN.
- Probar el ERP o completar el alta no exige certificado ni habilitación fiscal.
  Cuando el cliente incorpora sus propias credenciales o certificado, el
  wizard los valida y cifra; las transmisiones reales siguen bloqueadas hasta
  que esa configuración sea válida para su jurisdicción.
- La configuración fiscal SUNAT/OSE (PE), ARCA WSAA/WSFE (AR) o DIAN (CO) es
  por tenant y cifra secretos; GRE y SIRE sólo están disponibles para Perú.
  SIRE comparte las credenciales API SUNAT cifradas con GRE REST, pero su
  activación y su frontera de ejecución son independientes.
- La demo Perú se crea en PEN, con IGV, RUC/DNI, series F001/B001/T001,
  SUNAT/OSE simulado, GRE/SIRE y flujo logístico habilitado. El PCGE inicial se
  inserta por código sin duplicar cuentas ya existentes.
- La conversión de demo a cuenta real exige que el cliente defina y confirme
  un correo de acceso y una contraseña permanente antes de elegir si conserva
  o reinicia sus datos. La activación sustituye atómicamente las credenciales
  temporales; sólo persiste el hash de la contraseña y el login posterior usa
  esas mismas credenciales. El asistente fiscal se ejecuta después de autenticar
  y no crea una identidad paralela. La ruta de conversión exige sesión válida,
  falla cerrada si no puede comprobar el tenant y devuelve al dashboard a una
  cuenta que ya fue convertida, evitando ofrecer una segunda conversión.
- La demo Colombia crea datos sintéticos en COP, NIT/CC y configuración DIAN,
  PILA y nómina electrónica simuladas, incluido un contrato colombiano con
  salario válido para ejercitar el cálculo completo. La transmisión real
  permanece bloqueada hasta completar credenciales, certificado, resolución y
  homologación.
- La prueba DIAN consulta únicamente el WSDL oficial y registra si el transporte
  es accesible, si detectó el servicio y si hubo transmisión (siempre `false` en
  demo). Al convertir una demo colombiana, una RPC de servicio elimina todos los
  secretos y afiliaciones sintéticos antes de marcarla como real. El envío de
  documentos permanece fail-closed hasta disponer de SOAP WS-Security/XAdES
  homologado; nunca se interpreta una respuesta JSON ficticia como aceptación.
- ADMIN normal y ADMIN demo tienen contratos de permisos distintos.
- Las pruebas gratuitas viven en PROD con política explícita y datos aislados;
  no habilitan transmisiones fiscales reales. DEV está retirado y bloqueado.

Código principal: `apps/erp-api/src/modules/auth`,
`apps/erp-api/src/modules/usuarios`, `apps/erp-api/src/modules/permissions`,
`apps/erp-api/src/modules/tenants`, `apps/erp-api/src/modules/configuracion`.

## Analytics, reportes y auditoría

- Analytics consume métricas tenant-scoped.
- Reportes exportan sin duplicar reglas de negocio.
- Auditoría registra actor, tenant, acción, entidad, resultado y correlación.
- Métricas, logs y notificaciones no contienen secretos.

## Reglas transversales

- Dinero usa precisión decimal y redondeo explícito.
- Fechas de negocio no se interpretan como UTC si representan día local.
- Estados se normalizan y validan en los límites.
- Toda escritura sensible requiere tenant, autorización e idempotencia.
- Un cambio de flujo debe actualizar pruebas y este documento si altera el
  contrato funcional.
