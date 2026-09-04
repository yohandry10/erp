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
- El consolidado comercial agrupa entre una y diez ventas POS/documentos
  válidos de una sola moneda; UI, DTO y PostgreSQL aplican el mismo máximo.
  Congela cabecera y líneas, impide
  reutilizar una fuente, es idempotente e inmutable y no publica outbox ni crea
  otro asiento: los efectos contables siguen perteneciendo a cada venta origen.
  Un consolidado histórico anterior de 11..100 fuentes sólo admite replay
  exacto por el mismo actor; no se puede crear ni modificar con el contrato
  vigente.
- La cotización puede enviarse y ser aprobada o rechazada por un actor distinto
  de su creador. Un usuario con rol canónico `ADMIN` o `ADMIN_DEMO` y permiso
  explícito de aprobación puede autoaprobarla; la excepción conserva actor,
  fecha y observación de auditoría y no se extiende a roles operativos ni al
  autorrechazo. `BORRADOR`, `ENVIADA` y `APROBADA` son elegibles para convertir
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
- En Perú y PEN, cada venta íntegramente en efectivo puede aplicar el redondeo
  a favor del consumidor hasta el décimo inferior. Cada ajuste queda limitado
  a S/ 0,01..0,09 y se confirma dentro de la misma transacción POS en un ledger
  inmutable que liga tenant, sesión, venta, pago y movimiento. El cierre sólo
  usa `REDONDEO_EFECTIVO_LEGAL` cuando su diferencia negativa coincide
  exactamente con la suma de esos ajustes vivos; varias ventas pueden acumular
  más de S/ 0,09. Una diferencia pequeña sin evidencia sigue siendo faltante y
  exige supervisor. La excepción no alcanza sobrantes, pagos mixtos/no
  efectivos, otras monedas ni otros países. Preview y cierre consultan el mismo
  ledger y la misma configuración activa, con la caja específica antes que el
  valor global y cero como fallback. Un total efectivo menor a S/ 0,10 también
  puede redondearse a S/ 0,00: la venta conserva el total contable y el ledger
  documenta que no hubo entrega física de efectivo.
- El cierre físico normal requiere `cajas.cierre`; el cierre administrativo
  forzado permanece separado. Todo supervisor enviado se valida aunque la
  diferencia no lo exija: debe ser distinto tanto del actor que ejecuta el
  cierre como del cajero responsable, tener rol autorizado y acreditar su PIN
  en la misma transacción. La evidencia durable se
  liga a tenant, sesión, actores, huella del cierre y versión del PIN, sin
  persistir el código en claro.
- Registrar o rotar un PIN se hace desde Gestión de Cajas y exige
  `users.manage` tanto en HTTP como en SQL. El body sólo admite el PIN nuevo de
  seis dígitos; tenant, actor, supervisor, versión y estado se resuelven del
  contexto y nunca se devuelve el PIN ni su hash. La mutación exige
  `Idempotency-Key`; repetir exactamente la misma intención devuelve la primera
  versión sin rotarla otra vez, y reutilizar la clave con otro PIN falla cerrado.
  Cinco fallos bloquean la credencial durante quince minutos: un bloqueo vigente
  oculta al supervisor del selector y uno vencido lo reactiva automáticamente.
  El selector de cierre también excluye al actor y al cajero responsable.
- Un ticket interno puro no es un CPE pendiente y no bloquea el cierre; un canje
  fiscal reservado sí debe finalizar. No se cierra con CPE pendiente, venta
  incompleta, outbox/CxC inconsistente ni
  secuencia de movimientos inválida. El cierre y corte son idempotentes y
  durables; un sobrante o faltante emite `caja.cerrada` y genera su asiento.
- Consultar una sesión nunca debe cerrarla como efecto lateral.
- Reintentar una venta reutiliza identidad y correlativo reservados.
- La numeración POS se serializa por tenant/caja/serie. La prueba de concurrencia
  local usa diez usuarios distintos del mismo tenant y diez cajas: produce diez
  tickets/documentos/pagos/detalles únicos, descuenta stock exactamente diez
  veces y sus diez retries recuperan los mismos identificadores.
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
- El PDF A4 es la salida física elegida por el ERP: mide 210 × 297 mm y debe
  imprimirse en papel A4, escala 100 % y sin «ajustar a página». SUNAT no impone
  un único tamaño de papel; lo exigible es que la representación impresa sea
  legible y contenga la información fiscal aplicable. El PDF del backend es la
  representación autoritativa para comprobantes de una o varias páginas; la
  vista HTML permite revisarla sin depender del visor PDF nativo y no debe
  recortar líneas, totales ni el QR.
- Para Perú, la representación usa las leyendas de factura, boleta y notas,
  muestra las bases que tengan importe, unidad de medida y un QR negro en la
  parte inferior: nivel de corrección Q, margen físico mínimo de 1 mm y tamaño
  menor a 6 × 6 cm. El valor resumen se incluye cuando existe y también puede
  mostrarse fuera del QR. Argentina y Colombia conservan sus propias etiquetas
  e identificadores; nunca pasan por el validador QR de SUNAT.
- El logo es marca opcional, no un requisito fiscal. Se carga únicamente por
  `POST /api/configuration/empresa/logo` como PNG/JPEG de hasta 2 MiB, se guarda
  en Supabase Storage bajo una ruta tenant-scoped y se reemplaza o elimina con
  operación idempotente. No se aceptan data URLs ni hosts arbitrarios en la
  configuración empresarial. En demo, PDF y vista declaran que el documento no
  tiene validez tributaria.
- Argentina emite por WSFEv1 comprobantes ordinarios A/B/C y sus notas en ARS o
  USD. La clase se resuelve con la condición IVA del emisor y del receptor; una
  A exige CUIT (`DocTipo=80`). El servidor obtiene la cotización oficial ARCA
  para la fecha fiscal, persiste `MonId`, `MonCotiz` y `CanMisMonExt` y vuelve a
  comprobarla antes del envío; el navegador no puede fijar punto, correlativo,
  emisor, receptor ni cotización. Concepto `1/2/3` gobierna las fechas de
  servicios y vencimiento, y los tributos se recalculan en servidor. La
  aceptación se cierra con CAE de 14 dígitos, vencimiento, punto, tipo y número
  autorizados, que deben coincidir con el CPE. `ImpNeto` contiene sólo la base
  gravada: las bases exentas y no gravadas se informan por separado y nunca se
  duplican. El QR conserva exactamente el `CbteFch` y la cotización confirmados
  por ARCA y no vuelve a reinterpretarlos al preparar la representación. El A4
  incluye el bloque de transparencia fiscal con IVA contenido y otros impuestos
  nacionales indirectos.
  Exportación E/WSFEXv1, CAEA, A-CBU y A sujeta a retención permanecen bloqueadas
  mientras no exista su configuración e integración específica. Los códigos
  51-53 representan A sujeta a retención, no una clase M vigente.
- Colombia usa **UBL 2.1 conforme al Anexo Técnico de Factura Electrónica de
  Venta 1.9**; «1.9» es la versión del anexo DIAN y no otra versión de UBL.
  Factura `01`, nota crédito `91` y nota débito `92` declaran afectación,
  bases, tributos y totales desde el snapshot comercial. CUFE/CUDE se calculan
  con SHA-384 y los secretos/autorización que corresponden al tipo documental;
  `cpe.hash` sigue siendo el hash del XML y nunca se reutiliza como código
  fiscal. Los `ProfileID` normativos son exactamente `DIAN 2.1: Factura
  Electrónica de Venta`, `DIAN 2.1: Nota Crédito de Factura Electrónica de
  Venta`, `DIAN 2.1: Nota Débito de Factura Electrónica de Venta` y `DIAN 2.1:
  ApplicationResponse de Factura Electrónica de Venta`.
- La tasa general se toma de la configuración del tenant como única fuente para
  ventas y compras. Cada línea conserva su afectación `10/20/30`; los aliases
  de INC se normalizan y base, impuesto y total se recalculan en servidor. El
  navegador no puede imponer una tasa arbitraria ni contradecir la afectación.
- La firma colombiana es XMLDSig enveloped con XAdES-EPES 1.3.2. Una cuenta
  real sólo usa el PFX y la contraseña cifrada de su tenant; un certificado o
  NIT incongruente falla antes del I/O externo y nunca hereda credenciales
  DIAN globales del proceso. La titularidad se compara con el NIT efectivo del
  payload: activar DIAN o cambiar el NIT conservando un PFX de otro emisor se
  rechaza antes del writer y del I/O externo. La firma del sobre SOAP 1.2 es independiente:
  aplica WS-Addressing y WS-Security X.509, fija el destino oficial del ambiente
  y rechaza redirecciones, faults, respuestas no XML y entidades externas.
- La confianza en la respuesta DIAN es independiente del PFX del contribuyente.
  El runtime exige un bundle CA público operativo y una allowlist de pins
  SHA-256 del SPKI del firmante. Verifica cadena, pin, referencias XAdES y
  anti-wrapping; una fuente ausente/ambigua, un pin malformado o una firma que no
  encadene falla cerrado. El PFX privado de un tenant nunca se reutiliza como
  trust store de la autoridad.
- Habilitación envía por `SendTestSetAsync`; producción usa
  `SendBillSync` y la variante asíncrona usa `SendBillAsync`.
  `GetNumberingRange` confirma resolución, rango, vigencia, clave técnica y el
  prefijo únicamente cuando DIAN lo asigna, antes de reservar o firmar una
  factura real. El contexto oficial prevalidado se conserva sólo en memoria y
  se reutiliza durante la firma; no existe una segunda consulta divergente ni
  se persisten el Software PIN o la clave técnica. Ese
  método no recibe el Software PIN:
  valida transporte/certificado y numeración, pero nunca acredita el PIN. La
  evidencia Software ID/TestSet/PIN procede del TestSet y del portal
  `HABILITADO`. La recepción de un ZIP no es aceptación:
  `GetStatusZip` consulta el `ZipKey`, mientras `GetStatus` consulta un
  CUFE/CUDE. Pendiente, rechazado, no encontrado y error técnico permanecen
  estados diferentes.
- Para una factura `01` real creada desde la UI, el navegador sólo declara la
  intención. La RPC `reservar_numeracion_dian_ui_tx` de la 530 obtiene el
  correlativo y el prefijo opcional de la resolución activa del tenant, valida actor, fecha, rango y
  vigencia y reserva el número por clave idempotente. No recibe serie libre. Un
  retry de la misma intención recupera el mismo número; cambiar tipo o fecha con
  esa clave falla. Las demos usan su numeración local y no consumen resolución
  DIAN.
- El atajo de retry ya completado sólo aplica a una emisión directa Colombia y
  exige tenant, actor, tipo y huella fiscal completa coincidentes. Los namespaces
  internos de pedido, POS y Documentos conservan su RPC transaccional; una fila
  legacy o incompleta entra a la reconciliación normal en vez de saltar masters,
  reserva o writer.
- La RPC 531 congela bajo el mismo lock el pedido, su intención de pago, sus
  detalles y la identidad fiscal del cliente. La emisión descarta cualquier DTO
  comercial cargado antes del lock y mapea únicamente ese snapshot canónico;
  una edición concurrente no puede mezclar cabecera, líneas o receptor de dos
  instantes distintos. La intención y la reserva incluyen `pedido_id`: una clave
  que llegue por el endpoint CPE genérico no puede pre-ocupar ni consumir la
  factura de otro pedido, y el cierre exige que CPE, documento y `factura_id` del
  pedido apunten al mismo artefacto.
- La identidad fiscal visible usa exactamente `prefijo + consecutivo`: no se
  añade guion ni se rellena con ceros; una resolución sin prefijo muestra sólo
  el consecutivo. CPE, UBL, venta/documento, CxC, outbox, PDF y reintentos deben
  conservar esa misma identidad reservada por servidor; ninguna serie o número
  enviado por el navegador puede sustituirla.
- La factura se construye desde el cliente maestro del mismo tenant. La UI
  muestra el snapshot receptor como sólo lectura y el backend rechaza un cliente
  inexistente, perfil incompleto o snapshot divergente. En crédito, emisión,
  vencimiento y plazo deben coincidir como fechas calendario. La huella
  transaccional 530 incorpora cliente, fechas, forma/medio/plazo y perfil DIAN,
  de modo que un retry no pueda sustituirlos silenciosamente.
- Una cuenta CO real genera y firma la `Invoice` UBL DIAN antes de persistir la
  emisión. El XML debe tener namespace `Invoice-2`, una sola firma XMLDSig,
  CUFE SHA-384 y ninguna marca `PE:SUNAT`; si no cumple, falla antes del writer.
  Un XML SUNAT histórico asociado a procedencia Colombia no se entrega por la
  API. En demo se conserva una representación explícitamente simulada y sin
  transporte externo.
- Las respuestas públicas de lista y detalle eliminan XML firmado, CDR,
  firmas, costos de transporte, metadata sensible, tenant e idempotencia. El
  XML sólo sale por descargas explícitas con autorización; la vista histórica
  de Documentos resuelve el mismo endpoint protegido.
- La operación de envío se reserva, sella con el XML firmado y finaliza de
  forma durable. Un timeout después del sello consulta primero la clave tipada y
  no reenvía a ciegas. Un retry reutiliza nombre ZIP, secuencia anual,
  idempotencia, XML y código único; una clave nueva no puede repetir un evento
  ya aceptado.
- La respuesta `ApplicationResponse` que devuelve DIAN se conserva como
  evidencia. El `AttachedDocument` sólo se construye cuando existen el XML
  fiscal firmado y una respuesta DIAN verificable; no se fabrica una
  aceptación desde un código o mensaje parcial. El contenedor exterior también
  se firma con XAdES y conserva las firmas embebidas. El gate local incorporado
  a CI deja verdes los nueve XML en XSD; factura, notas y eventos pasan además
  el Schematron versionado de la caja oficial FEV 1.9. El XSL distribuido no
  cubre la raíz de `AttachedDocument`.
  Las divergencias internas conocidas se enumeran por regla y mensaje exactos;
  no existe una exención genérica al validador.
- La migración 528 impide que una factura o nota colombiana real pase a
  `ACEPTADO` por un HTTP 200, `IsValid` o XML parcial. La operación debe estar
  completada con código `00`; el `ApplicationResponse` debe tener raíz y
  namespace UBL exactos, una sola `ds:Signature`, un solo
  `DocumentResponse/DocumentReference/UUID` directo con el mismo CUFE/CUDE,
  hash coincidente y la marca criptográfica de trust verificado. El verificador
  PostgreSQL 16 prueba casos positivos y adulteraciones estructurales.
- La migración 529 habilita desde la bandeja CPE la creación de notas `91/92`
  sólo sobre un comprobante colombiano real y aceptado del mismo tenant. El
  usuario elige tipo, motivo DIAN, descripción, líneas y, cuando corresponde, un
  prorrateo explícito; el servidor exige saldo disponible y conserva la
  referencia, CUFE/CUDE y efecto. Identidad, ubicación, régimen, certificado y
  configuración pública del emisor quedan congelados y se revalidan antes de
  firmar o entregar; nunca se persisten el PIN ni la contraseña del PFX en una
  huella. Una demo muestra el bloqueo y no precarga una aceptación ficticia.
- Para Argentina, `Documentos` consulta clase A/B/C y estado desde el CPE
  vinculado del mismo tenant. Conserva la procedencia demo aunque cambie la
  cuenta; una muestra se identifica sin validez ARCA. `FACTURA` no implica
  clase A y `BOLETA` no implica clase B. Si falta evidencia, presenta el tipo
  genérico y remite al Centro ARCA. Las acciones fiscales y la edición se
  gestionan allí; los endpoints heredados de emisión/envío de Documentos
  rechazan Argentina antes de llamar al transporte.
- Para Colombia, `Documentos` es únicamente un repositorio histórico de lectura:
  las acciones fiscales nuevas se desvían a Centro CPE y se ocultan los writers
  SUNAT heredados. CxC crea una nota DIAN `91` referenciada; cancelación y RMA no
  pueden reutilizar la nota `07`. La migración 532 hace cumplir esa frontera en
  el writer histórico antes de cualquier cambio de stock, caja o contabilidad.
- Los **eventos FEV 030-034** están implementados técnicamente en 527. La API
  consulta `GetStatusEvent`, `GetStatus` y `GetXmlByDocumentKey`, importa y ancla
  una FEV recibida inmutable, lista su historial y usa el ZIP oficial. 030-033
  parten del adquirente sobre esa ancla; 034 parte del facturador sobre su CPE
  emitido. Reserva, sello y finalización son tenant-safe e idempotentes; el retry
  server-side recupera la operación por `operationId` sin depender de conservar
  una clave de `sessionStorage`. Los verificadores 527/528 se ejecutan en una
  reconstrucción limpia de PostgreSQL 16 y las suites API cubren la cadena.
- La interfaz aplica RBAC separado: lectura de FEV/eventos, gestión de recibidas
  030-033 y emisión 034. Un auditor puede consultar sin ver escrituras; una demo
  o tenant no listo conserva historial pero no puede importar ni emitir. Chrome
  Playwright cubre la cadena 030→032→033 y 034, con APIs
  interceptadas; no es una transmisión real.
- 030-034 no equivalen a **habilitación RADIAN completa** ni dejan listo el
  factoring. Para operar como participante directo se requiere un registro
  separado, documentos/requisitos, verificación DIAN y superar el Set de pruebas
  RADIAN vigente de 15 eventos. Los eventos de circulación no implementados
  quedan fuera del alcance; los plazos y la aceptación jurídica los decide DIAN.
- El perfil tributario del receptor no se infiere de un NIT. El cliente elige
  expresamente consumidor final o adquirente NIT B2B; PostgreSQL valida la
  combinación de responsabilidad/tributo y la congela en metadata del CPE para
  que editar al cliente no reescriba un documento preparado.
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
  original y no anulan un pedido ni duplican stock, CxC o asientos. Crear una
  nota `07/08` deja su efecto financiero en `PENDING_FISCAL_ACCEPTANCE`: no
  modifica CxC, saldo a favor ni contabilidad. El efecto se aplica una sola vez
  después de que nota y documento origen estén aceptados y exista CDR; rechazo
  o retry técnico quedan sin efecto financiero.
- El XML canónico siempre es UBL firmado. Una cuenta real usa exclusivamente el
  certificado configurado por su tenant. La demo PE, sólo con
  `sunat_environment=homologacion` y mientras no tenga credenciales propias,
  usa el PFX sintético del runtime para generar y firmar. Toda transmisión,
  consulta, ticket, aceptación y CDR sigue bloqueada: la demo no fabrica
  evidencia fiscal ni transmite a SUNAT. Al convertirse, el cliente debe cargar
  sus propias credenciales y certificado para habilitar el flujo real.
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
  resumen siempre agrega el conjunto completo. Con filtro `desde` separa saldo
  inicial, movimiento neto y saldo final, y cada fila expone saldo corrido. La
  fecha se calcula en la zona del tenant y no en la del navegador. Cantidad,
  costo, moneda origen,
  moneda base y tipo de cambio quedan congelados en el movimiento. Si falta
  costo, dirección o TC, el saldo afectado queda pendiente: no se sustituye por
  cero ni se publican subtotales incompletos como saldos finales. Las cantidades
  de productos/unidades diferentes no se suman: el detalle conserva NIU, KGM,
  LTR, MTR o ZZ y el resumen físico exige filtrar un producto cuando no es
  agregable. Un producto legacy con unidad nula permanece “Sin regularizar”; una
  edición de precio/nombre no presume NIU y asignar unidad requiere confirmación
  explícita. El backfill histórico sólo usa
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
- Registrar cobros, aplicar notas y reprogramar una CxC exige
  `finanzas.cxc.cobros.write`; emitir CPE es una capacidad fiscal separada y no
  autoriza por sí sola acciones de cobranza.
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
  silenciosamente el original. La captura sólo comunica un asiento balanceado
  cuando debe y haber tienen importes positivos y su diferencia es menor a un
  céntimo; un formulario 0/0 permanece pendiente.
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
  aplica cese, devengo y outbox en una frontera transaccional e idempotente. El
  asiento separa beneficios sociales en `Dr 629` y el resto remunerativo en
  `Dr 621`, contra `Cr 411`, usando componentes congelados del cálculo.
- Una liquidación aprobada se paga completa. La transferencia registra la
  evidencia laboral, el cargo bancario y el evento de pago en el mismo commit;
  su asiento es `Dr 411` contra la cuenta bancaria exacta congelada, no contra
  una cuenta genérica. La reversa restaura el mismo banco y obligación aunque
  el banco o la cuenta contable se desactiven después, crea el contra-asiento y
  conserva el pago original como evidencia `REVERTIDO`. Nuevos pagos de
  liquidación son sólo por transferencia; efectivo legacy sin sesión/movimiento
  inequívocos falla cerrado y exige regularización.
- CTS usa un libro independiente: recalcular sólo modifica filas `CALCULADO`,
  nunca reabre un depósito realizado. Depositar exige cuenta bancaria, actor y
  referencia, y genera tesorería/outbox/asiento atómicos (`Dr 629` contra la
  cuenta tesorera exacta, mientras no exista un evento separado de provisión).
  Una CTS pendiente que
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
- En demo, `ADMIN_DEMO` puede crear usuarios y roles operativos del propio
  tenant para probar segregación y permisos. No puede delegar `users.manage`,
  conceder permisos globales ni crear otro `ADMIN_DEMO` mediante un writer
  alterno; el actor debe poseer autorización administrativa real.
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
- Las mutaciones de autenticación/configuración, conversión demo y material
  fiscal sensible no son offline-capable. En Colombia, numeración, emisión,
  notas, firma, consulta y transmisión DIAN requieren backend en línea y se
  bloquean antes de entrar a la cola; un ticket local no fiscal puede seguir
  operando, pero nunca se promueve a CPE real por replay. Certificados, PFX,
  credenciales y secretos nunca entran en Web Storage ni SQLite; una lectura o
  sincronización purga cualquier entrada legacy sensible antes de devolverla.
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
  generación y firma fiscal de prueba, GRE/SIRE y flujo logístico habilitado;
  ningún envío ni aceptación SUNAT/OSE se simula. El PCGE inicial se
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
  permanece bloqueada aunque el código de transporte exista: completar campos
  sintéticos nunca concede habilitación fiscal.
- Una cuenta colombiana real sólo aparece lista para transmitir cuando tiene
  identidad y PFX tenant-scoped, Software ID/PIN, TestSet, resolución y rango,
  trust store/pins DIAN operativos, una validación técnica reciente y una
  constancia administrativa de que el portal DIAN muestra ese mismo
  software/TestSet como `HABILITADO`. Registrar
  esa constancia exige ADMIN, referencia verificable, idempotencia y auditoría;
  cambiar NIT, Software ID, TestSet o convertir la demo la invalida.
- La prueba DIAN valida certificado, transporte y numeración contra el endpoint
  oficial exacto del ambiente; una demo nunca la ejecuta. Al convertir una demo
  colombiana, una RPC de servicio elimina todos los secretos y afiliaciones
  sintéticos antes de marcarla como real. Ningún test local, WSDL accesible,
  respuesta JSON o documento aceptado aislado sustituye el TestSet ni el estado
  `HABILITADO` del portal.
- La habilitación FEV anterior no habilita automáticamente al participante
  directo RADIAN. Ese segundo proceso exige registro en Eventos RADIAN,
  documentos/requisitos, verificación de DIAN y su Set de 15 eventos. El ERP no
  presenta 030-034 como evidencia de factoring o habilitación RADIAN integral.
- La representación A4 toma el país y el emisor del snapshot inmutable del CPE,
  no de la configuración actual del tenant. Por eso cambiar de país o convertir
  una demo no reetiqueta comprobantes históricos ni les concede validez fiscal:
  los nacidos en demo continúan mostrándose explícitamente como muestra.
- Un contribuyente tiene uno o varios **establecimientos anexos** del RUC. La
  casa matriz es el codigo `0000`, existe siempre, la crea un trigger al dar de
  alta el tenant y no se puede desactivar; los anexos llevan el codigo de cuatro
  digitos de la ficha RUC y ese codigo no se reescribe una vez creado, porque ya
  viaja dentro de comprobantes emitidos. Las series de comprobante pertenecen a
  un establecimiento y son las que deciden el `cbc:AddressTypeCode` del CPE.
  Almacenes, cajas y ventas cuelgan tambien del establecimiento; lo que no lo
  declara se atribuye a la casa matriz.
- **La contabilidad no se parte por establecimiento**: los libros electronicos
  son por RUC. El resultado por local se obtiene con centros de costo, que
  llegan hasta la linea del asiento y a los que la sucursal puede apuntar. Una
  contabilidad realmente separada exige otro RUC, es decir otro tenant, y para
  eso existe el grupo de consolidacion.
- Un usuario sin asignacion de sucursales las alcanza todas --es la oficina
  central--; asignarle una o varias lo restringe a esas. Dar de alta o asignar
  establecimientos es cosa de administracion; el resto de roles operativos solo
  los lee.
- **La operacion no declara su establecimiento: lo hereda.** Una venta de POS lo
  toma de la caja de su sesion, una sesion de su caja, un movimiento de
  inventario de su almacen y un comprobante de su serie. El valor se guarda para
  poder consultarlo sin saltos, pero un trigger lo deriva en cada escritura y
  **rechaza** cualquiera que contradiga a su ancla, de modo que no puede
  divergir. El stock por local se consulta en `stock_por_sucursal`.
- **Mover mercaderia entre establecimientos es un traslado, no un apunte
  interno.** Cuando el almacen de origen y el de destino son de sucursales
  distintas, la transferencia queda marcada con el motivo 04 de SUNAT y los
  codigos de los dos establecimientos, en el resultado y en la metadata de los
  dos movimientos. Si el contribuyente marco GRE obligatorio, el traslado se
  rechaza mientras no se referencie una guia. Dentro de un mismo establecimiento
  no se marca nada.
- **La planilla declara el establecimiento donde trabaja cada empleado.** El
  empleado pertenece a una sucursal y la ficha del T-Registro **hereda** su
  codigo en cada escritura; no se escribe a mano. Antes toda la planilla de todos
  los locales se declaraba en la casa matriz, porque la columna tenia
  `DEFAULT '0000'` y nada la cambiaba.
- **El alcance del usuario se aplica en un solo sitio**: el cliente que devuelve
  `SupabaseService.getClient()` filtra por `sucursal_id` toda lectura,
  modificacion y borrado sobre las tablas que llevan la columna. No se filtra el
  alta, porque la sucursal de una fila nueva la decide la base. Un usuario sin
  asignaciones no paga ningun filtro.
- ADMIN normal y ADMIN demo tienen contratos de permisos distintos.
- Las pruebas gratuitas viven en PROD con política explícita y datos aislados;
  no habilitan transmisiones fiscales reales. DEV está retirado y bloqueado.

Código principal: `apps/erp-api/src/modules/auth`,
`apps/erp-api/src/modules/usuarios`, `apps/erp-api/src/modules/permissions`,
`apps/erp-api/src/modules/tenants`, `apps/erp-api/src/modules/configuracion`,
`apps/erp-api/src/modules/sucursales`.

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
