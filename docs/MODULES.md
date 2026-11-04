# Módulos y flujos funcionales

Este documento describe responsabilidades y límites. Los DTO, endpoints y tablas
exactos se consultan en código, OpenAPI y migraciones.

Las confirmaciones esperan la respuesta tanto del navegador como del diálogo
asíncrono de escritorio. Cancelación, rechazo, otro diálogo pendiente o cambio
de sesión/navegación durante la espera no autorizan la acción. Las operaciones
durables de diferidos, depreciación y resolución presupuestaria comprueban además
que siguen vigentes sus permisos, selección e intención originales; cambiar y
volver a esos datos invalida la confirmación anterior.

Los detalles y bajas distinguen un identificador mal formado (400/404) de uno
inexistente o ajeno (404) y de una lectura indisponible (503). La baja de una
plantilla contable ya ausente conserva el resultado idempotente del writer 473.
El barrido local exige ambas variantes por endpoint y no acredita rutas que
respondan sin permiso ni expongan errores internos de PostgreSQL.

## Ventas

### Contratos de suministro y OC del cliente

La feature F01 vive en `/dashboard/ventas/contratos`
y `ventas/contratos` del API. Requiere las migraciones 570–573; su presencia en la
rama no acredita promoción ni disponibilidad en producción. Este desarrollo
se gestiona como feature independiente de la matriz de aceptación existente.

- El contrato conserva cliente, moneda, vigencia, responsable y líneas con
  producto, unidad, cantidad y precio unitario sin impuestos. Código,
  descripción y unidad se congelan desde el maestro. La edición directa y la
  anulación del contrato sólo operan en borrador. Un contrato activo admite
  adendas con referencia, motivo y versión: asunto, fin de vigencia, responsable,
  observaciones, cantidades, precios y productos adicionales. Cliente, número,
  moneda e inicio de vigencia permanecen fijos. Las cantidades no pueden bajar
  de lo asignado a OC vigentes; la vigencia debe cubrir sus fechas y las entregas
  programadas vigentes. Las líneas con OC históricas se conservan. Registrar una
  adenda no firma ni aprueba legalmente el documento asociado.
- Una OC recibida del cliente pertenece a un contrato activo y distribuye sus
  cantidades por línea. No se confunde con una OC emitida a proveedores. La
  modificación exige referencia, motivo y versión, mantiene las identidades de
  sus líneas y no reduce cantidades por debajo de lo programado. Una línea con
  entregas históricas, incluso anuladas, debe conservarse. La anulación exige
  cancelar primero todas sus programaciones vigentes; conserva la OC y libera
  sus cantidades para nuevas órdenes. No se programan OC anuladas.
- Cada línea de OC congela el precio unitario del contrato al incorporarse.
  Las adendas no revalorizan OC anteriores y modificar la cantidad de una línea
  conserva su precio. Las líneas nuevas toman el precio contractual vigente.
  El historial registra referencia, motivo, actor y valores anteriores y nuevos;
  una misma referencia no puede duplicar la misma clase de revisión del recurso.
- Cada línea de OC admite varias entregas programadas con cantidad, fecha y
  destino. La suma de OC no supera la línea contratada y la suma programada
  vigente no supera la línea de OC. Todas las escrituras se serializan por
  contrato para preservar estos límites frente a concurrencia.
- Reprogramar exige versión vigente y motivo; mantiene fecha original, fecha
  anterior, destino, actor e historial. Anular una programación exige motivo
  y libera su cantidad programable. Las fechas deben estar dentro de la
  vigencia y no preceder la emisión de la OC. No se interpreta una programación
  como reserva física, despacho, conformidad ni facturación.
- Las RPCs de consulta y escritura comprueban usuario activo, tenant y permisos
  `ventas.contratos.ver/gestionar`. Las diez tablas permanecen privadas, con
  RLS forzado y sin lectura o DML directo para roles de aplicación. Permisos
  iniciales: ADMIN, ADMIN_DEMO y GERENCIA consultan y gestionan; VENDEDOR,
  AUDITOR y CONTADOR sólo consultan. Las concesiones existentes no se reescriben.
- Cada escritura exige Idempotency-Key: mismo actor y contenido recuperan el
  resultado; otra intención devuelve conflicto. Cambio de versión responde
  409, recurso ajeno 404 y servicio indisponible 503. Historial y auditoría se
  confirman junto con la operación. Las mutaciones requieren conexión y no
  entran en la cola offline; ante respuesta incierta la pantalla conserva
  solicitud y clave para reintentar mientras permanece abierta.
- Un pedido pendiente del mismo cliente y moneda se vincula completo a un
  contrato: cada línea se asigna a una programación con producto y precio de OC
  coincidentes. Varias parcialidades pueden consumir una programación sin
  excederla. Un snapshot del pedido evita confirmar una selección obsoleta.
  Consultar exige también `ventas.pedidos.ver`; vincular o desvincular requiere
  además `ventas.pedidos.editar` y `ventas.contratos.gestionar`.
- Los pedidos vinculados conservan líneas, cliente, moneda, número y totales;
  las programaciones con pedidos vigentes no se modifican ni anulan. Se puede
  desvincular mientras el pedido siga pendiente. Confirmación, reservas, despacho,
  facturación y cancelación usan sus writers operativos existentes. Cancelar
  libera la asignación contractual y conserva el vínculo histórico; no permite
  reactivar el pedido cancelado. El expediente muestra contadores operativos,
  y la ficha del pedido permite volver a su contrato, OC y programación.
- Los adjuntos privados se asocian a contrato, OC o adenda: PDF, DOCX sin macros,
  PNG y JPG, hasta 10 MiB, con validación de contenido, tamaño y extensión. Una
  reserva durable precede a la subida sin sobrescritura; confirmar exige objeto
  almacenado. Reintentos recuperan el mismo objeto y verifican su huella si ya
  existe. Ningún adjunto pendiente se ofrece como confirmado.
- El bucket `supply-contract-files` es privado y una política restrictiva impide
  acceso directo anónimo/autenticado. Descargar exige lectura del expediente y
  emite un enlace válido por 60 segundos. Retirar exige motivo, conserva objeto
  e historial y bloquea nuevos enlaces; los ya emitidos vencen normalmente.
  El retiro no es borrado físico ni un servicio de retención/exportación F09.
- Entregas y conformidades (F03, migración 575): la recepción del cliente se
  registra por pedido vinculado, con líneas por despacho y lote: recibido,
  aceptado y rechazado (con motivo), fecha, receptor, guía, PECOSA, número de
  conformidad e incidencias. Lo recibido acumulado no supera lo despachado de
  cada lote y la fecha no es futura ni anterior al despacho. Sólo lo aceptado
  cuenta como cumplido: marcar el tracking como entregado no acredita
  conformidad. Lo rechazado vuelve a quedar por aceptar y libera saldo de la
  programación para vincular un pedido de reposición; la devolución física del
  rechazo sigue el flujo RMA. Anular una recepción exige versión y motivo, la
  conserva en el historial y se rechaza si su rechazo ya fue repuesto. Un
  despacho con aceptación registrada no se anula cancelando el pedido.
- Registrar recepciones requiere `ventas.contratos.conformar` (ADMIN,
  ADMIN_DEMO, GERENCIA y ALMACEN; ALMACEN también consulta contratos). Ese
  permiso adjunta guía, PECOSA o conformidad firmada a la recepción sin
  gestionar el contrato. La siembra de roles de empresas nuevas ya no concede a
  VENDEDOR gestionar contratos ni conformar por el patrón genérico de ventas.
- El ERP no emite PECOSAS: registra su número y su documento.
- Facturación y conciliación (F04, migración 576): cada pedido vinculado se
  factura una sola vez con el writer de pedidos, su CxC, sus cobros y notas;
  facturar por entrega es facturar el pedido de esa entrega, y cada línea de
  pedido pertenece a una sola programación. El contrato define su base de
  facturación con versión y motivo: por despacho completo (actual) o contra
  conformidad, que impide asignar comprobante a un pedido vinculado mientras
  lo aceptado no cubra todas sus líneas. Facturar por hito queda pendiente de
  definición con el cliente.
- El estado de cuenta contractual muestra por línea contratado, en OC,
  programado, en pedidos, despachado, aceptado, facturado y por facturar a
  precio de OC sin impuestos, y por comprobante total, notas de crédito,
  cobrado y saldo de la CxC, con totales por moneda. Señala el comprobante cuyo
  total menos notas y cobros no coincide con el saldo de la CxC. No crea
  efectos contables ni de inventario: lee los documentos existentes.
- Alertas de suministro (F05, migración 577) en `/dashboard/alertas`: una regla
  por tipo y empresa para entregas próximas sin despachar, atrasadas o
  incompletas (rechazo o aceptación parcial), lotes con stock por vencer o
  vencidos y cobranza contractual por vencer o vencida. Cada regla define
  anticipación, destinatarios, responsable del contrato, escalamiento (días y
  a quién) y correo. La evaluación corre cada hora para las empresas con reglas
  activas y bajo demanda; serializa por empresa y mantiene una sola alerta
  abierta por condición, sin duplicar avisos ni correos al reintentarse. Si
  la condición desaparece se resuelve (superada, reprogramada o regla
  desactivada) y una reprogramación abre la alerta de la nueva fecha,
  conservando ambas. Cada destinatario recibe una notificación personal y
  reconoce por sí mismo; sólo se escala una vez si nadie reconoce a tiempo.
  El correo se encola en el outbox (`email.send`); enviarlo exige el servicio
  de correo productivo configurado y comprobado. Las propias se consultan sin
  permiso especial; ver todas exige `alertas.suministro.ver` y configurar
  `alertas.suministro.gestionar`. `ALERTAS_SUMINISTRO_CRON=off` apaga la tarea.
- Penalidades contractuales (F06, migración 578) en la sección Penalidades del
  expediente: reglas por contrato con método (mora 0.10 × base / (F × plazo),
  porcentaje diario, importe diario o único), base (valor de la entrega o lo
  no aceptado al límite), plazo fijo o de la OC a la entrega, tolerancia, días
  calendario o hábiles (lunes a viernes, sin feriados) y tope porcentual sobre
  el contrato o la entrega, descontando lo ya aprobado del mismo grupo de
  reglas. Editar crea una versión nueva y la anterior queda reemplazada; las
  versiones no se modifican. Los días excluidos (ampliaciones de plazo) se
  registran por entrega, para todas las reglas o una. Calcular a una fecha de
  corte (nunca futura) guarda una instantánea inmutable por versión de regla,
  entrega y corte con sus entradas y la explicación del cálculo; repetir el
  corte no duplica. El atraso cuenta desde la fecha programada más la
  tolerancia hasta la recepción que completa lo aceptado, o hasta el corte.
  La revisión (en revisión, observado, controversia, descartado, aprobado) es
  un historial aparte; aprobar exige otra persona que quien calculó y un monto
  entre 0 y el estimado, y no genera asientos, notas ni descuentos en la
  cobranza. Permisos `ventas.penalidades.ver`, `ventas.penalidades.gestionar`
  (reglas, excepciones y cálculo) y `ventas.penalidades.aprobar`.
- Tablero de suministro (F07, migración 579) en `/dashboard/tablero-suministro`:
  cumplimiento por OC, entregas a tiempo y completas (aceptación total hasta la
  fecha programada vigente), atrasos, cobertura de stock (stock no vencido
  frente a lo pendiente de despachar en 30 días), lotes vencidos y por vencer
  (90 días, con la política de vida útil), por facturar, cobranza y
  penalidades (último corte de 578). Cada indicador abre su detalle y cada fila
  enlaza al expediente del contrato o a Lotes. Filtros por contrato, cliente y
  rango de fecha (programada, de OC o de emisión). Un corte es la instantánea
  inmutable de todos los conjuntos de la empresa con su hash SHA-256: exportar
  registra un corte y descarga su Excel (hoja de corte con hash y filtros,
  resumen y un detalle por conjunto); una tarea horaria registra un corte
  automático por día para empresas con contratos activos
  (`TABLEROS_SUMINISTRO_CRON=off` la apaga). La pantalla, el Excel y Power BI
  leen el mismo corte y concilian por construcción. Cada conjunto exige el
  permiso de su módulo origen (contratos, lotes, CxC, penalidades); el tablero
  exige `reports.suministro.read` y exportar `reports.suministro.export`.
- Power BI lee `GET /api/bi/v1/suministro/{conjunto}/?corte=ultimo|<id>` con
  `Authorization: Bearer erpbi_…`: credencial de lectura de la empresa, no de un
  usuario, creada con `integraciones.bi.gestionar` (sólo ADMIN), limitada a los
  conjuntos que su creador puede ver, con vencimiento de hasta un año y
  revocable. El token se muestra una sola vez y la base guarda su hash. Cada
  lectura, también las rechazadas, queda registrada con corte, hash, filas y
  origen; cada fila lleva `corte_id` y `fecha_corte`.
- Migración desde otro sistema (F08, migración 580) en `/dashboard/migracion`:
  plantillas de contratos, OC, cronograma y stock inicial; ensayo completo que
  importa todo en orden en la base y lo revierte, con error por registro y
  conciliación; importación por archivo con lote y fila registrados, e
  idempotente por registro de origen; conciliación de registros, líneas,
  cantidades y valores contra los totales de control. Se migra lo abierto al
  corte: del contrato lo no ejecutado (las líneas agotadas no se migran), de la
  OC lo pendiente de entregar y del cronograma las entregas pendientes. El
  stock inicial acepta lote y vencimiento y los exige si el producto controla
  lotes; un lote vencido también se registra. Nada migrado crea pedidos,
  despachos, comprobantes, cobranza ni asientos. Los clientes y productos se
  importan antes con los importadores existentes (`external_id` = código de origen).
  Importar exige `migration.suministro.import` (ADMIN) y conciliar
  `migration.validar.read`.
- Migración integral desde otro sistema (migración 582), en la misma pantalla:
  - Archivo íntegro: cada tabla del extracto tal cual, con los registros
    borrados en origen, en lotes inmutables que cierran por conteo y se consultan
    por texto, tabla y página. La base redacta credenciales y medios de pago
    al cargar, llegue la tanda por la CLI o directo al API. Leer
    exige `migration.archivo.read` (ADMIN, GERENCIA, CONTADOR, AUDITOR) y
    cargar `migration.archivo.import` (ADMIN).
  - Maestros y saldos abiertos que faltaban, con `migration.origen.import`
    (ADMIN): almacenes, plan de cuentas (lo existente se enlaza; lo nuevo cuelga
    de la cuenta con el prefijo más largo), productos con política de lote,
    cuentas bancarias con saldo de apertura, listas de precios, OC de compra
    (sólo lo pendiente de recibir, en borrador) y pedidos de venta (sólo lo
    pendiente de despachar, al precio pactado en el sistema anterior).
  - Lo que ya existe en el ERP se adopta por código; un código que coincide con
    dos registros o un registro del ERP ya enlazado a otro código de origen se
    rechazan en vez de adivinar.
  - El ensayo integral recorre terceros, maestros, saldos, balance, suministro
    y stock en el orden real. La conciliación compara todo contra el extracto y
    cruza, por cuenta contable, los saldos bancarios en moneda local con el
    asiento de apertura.
- Perfiles de suministro (F09/F10, migración 581). SUMINISTRO (responsable de
  contratos): contratos (ver, gestionar, conformar), pedidos (ver, editar),
  penalidades (ver, gestionar), lotes (leer), alertas (ver, gestionar) y
  tablero (leer, exportar). GERENCIA aprueba penalidades pero no las calcula;
  ALMACÉN registra conformidades y gestiona lotes; FINANZAS, CONTADOR y
  AUDITOR sólo consultan; VENDEDOR sólo ve contratos y lotes. Credenciales BI y
  migración son de ADMIN. Calcular y aprobar una misma penalidad exige dos
  personas distintas aun para ADMIN. Ninguna RPC de suministro acepta un
  actor de otra empresa.

Código: `apps/erp-api/src/modules/ventas/contratos`,
`apps/web/app/dashboard/ventas/contratos`.

La generación desde pedido guarda una intención privada por empresa, actor y
pedido antes de enviar el cuerpo. Sólo anuncia éxito después de validar el recibo
vivo y consultar el pedido completo con su CPE vinculado: fotografía congelada,
estado facturado, cantidades, moneda, importes, receptor y líneas coherentes.
Recarga/regreso/reinicio recuperan sin envío automático. La verificación manual
consulta primero el resultado y retira la intención sólo si siguen sus mismos
bytes; corrupción, fallos de almacenamiento y cambios concurrentes se conservan.
Si aún no existe vínculo y el pedido sigue elegible, ofrece un retry explícito;
un pedido cerrado se recupera por consulta sin volver a facturarlo.
El control y su handler requieren `ventas.pedidos.generar_factura`; otro actor
no ve la intención OWNER. El área se remonta por empresa/actor/pedido y descarta
respuestas tardías. Lectura incompleta/no viva/ajena muestra error y reintento.
La proyección pública del CPE entrega el IGV de cada línea en centavos, igual
que XML/PDF, también para comprobantes históricos que conservan el cálculo
intermedio con más decimales. No reescribe el documento ni sus importes contables;
la interfaz sigue contrastando suma de líneas, cabecera y pedido antes de confirmar.
El POST no entra a la cola genérica JS/Rust. El servidor deriva su propia clave;
el CPE público no expone sus claves/huellas/vínculos internos, por lo que la UI
no acredita una comprobación criptográfica. La emisión fiscal sigue dependiendo
de la autoridad. Evidencia local: `invoice-from-order-postconditions.json`,
103 pasos por interfaz, reinicio nativo2+3,84checks y Rust19; ningún nuevo writer
empresarial en esta fase. Facturación parcial de cantidades sin selector UI,
otros perfiles/ventanas y aceptación externa requieren sus propios casos.


El listado de clientes distingue una consulta fallida de un catálogo vacío:
retira filas y métricas previas, informa el error y permite reintentar. Descarta
respuestas de consultas anteriores. Un cambio real de rol con la pantalla
abierta,403 y una lectura autorizada demorada repitió el bloqueo sin recuperar
clientes mediante la caché al perder la red.

Clientes y Proveedores permiten importar CSV UTF-8 desde sus listados: plantilla,
vista previa sin escritura, validación por registro y confirmación explícita.
El importador masivo valida documentos peruanos y requiere los permisos
`migration.*` correspondientes; otros países conservan el alta individual.
La UI admite 5 MiB, muestra resultados completos/parciales/fallidos y conserva
`external_id` para reintentos idempotentes. No encola importaciones offline.
Comas, comillas escapadas y saltos de línea dentro de campos se preservan;
columnas desalineadas, encabezados duplicados y campos mayores a 4096 caracteres
se rechazan antes de escribir, sin truncar datos. La numeración de errores sigue
el registro CSV (encabezado = 1), no sus líneas físicas cuando hay saltos internos.
El lote procesa cada fila por separado: una colisión de contenido conserva el
maestro original y permite registrar otras filas válidas. Repetir el archivo
con los mismos external_id omite las altas aplicadas; crea otro registro de lote,
sin duplicar maestros. La UI conserva archivo y vista previa tras unACK perdido,
muestra creados/actualizados/omitidos/errores y sólo permite otra confirmación
después de cargar un archivo nuevo cuando ya recibió resultado. La corrección
del archivo elimina el conflicto sin cambiar la identidad de las filas aplicadas.
El corte local verificó dos altas por entidad, resultado parcial, retry y
archivo corregido; lector de inventario403 e aislamiento de empresa2.
Clientes, Proveedores y Cotizaciones de Compra exportan la página actual en CSV,
con filtros vigentes y escape de fórmulas. Reportes de Ventas y el detalle de una
Orden de Compra permiten imprimir/guardar PDF mediante el navegador.
El plazo comercial cotización→factura se mide con la fecha de emisión del CPE
vinculado al pedido; el período filtra esa emisión. Incluye tendencia mensual
cronológica y mediana correcta también para un número par de conversiones.
Pedidos por estado y productos más vendidos aplican el filtro de cliente; el
reporte de productos muestra su código de catálogo, no un fragmento del UUID.
Ventas por cliente, pedidos por estado, productos, cotizaciones pendientes y
top clientes preservan la moneda de cada registro. Totales y rankings monetarios
se separan por moneda, sin sumar importes nominales PEN/USD ni rotular dólares
como soles. Esos reportes recorren todas las páginas de PostgREST; el CSV de
ventas reutiliza el escape de celdas y protección contra fórmulas.
El Resumen de Ventas consulta facturas/boletas vigentes, aplica fecha, estado y
cliente por nombre o documento, conserva serie/número y acumula con Decimal la
base gravada, las bases no gravadas, IGV y total por moneda. Una base gravada cero
no se sustituye por el subtotal. Recorre todas las páginas y comparte filtros con
su exportación Excel de servidor; esa ruta todavía no tiene control UI.
Las once pestañas distinguen una lectura fallida de un vacío válido: retiran
filas/métricas anteriores, muestran error y reintento y descartan respuestas
tardías. No exportan datos anteriores tras un fallo. Los filtros visibles son
los admitidos por cada consulta; Aging usa fecha de corte, sin fecha desde ni
estado. El CSV del resumen conserva quince columnas con moneda, serie y bases
separadas. Su impresión repite encabezados y adapta las ocho columnas a A4.
El corte local verificó ADMIN de dos empresas y lector de inventario en un mismo
navegador: empresa2 tiene fuentes vacías reales y el lector recibe403 en los once
reportes, sin filas, exportación ni recuperación de caché deADMIN al perder red.
El paquete nativo embebido repitió los once reportes con lectura/error/reintento;
descarga e impresión nativas, otros roles, USD desde UI, agrupaciones múltiples
para ordenación y cartera vencida actual permanecen pendientes. Aging positivo
repitió73.16→53.15→0 después de cobro parcial y liquidación, CSV, filtros y
corte histórico; el corte futuro es una proyección, no mora actual. El binario
nativo verificó deuda positiva, lector403 y recuperación por la propietaria.
Fill-rate y KPIs SUNAT muestran su estado deshabilitado sin métricas en cero.
Configuración → Ventas permite habilitarlos y ajustar objetivo/frecuencia indicada
con `configuracion.write`; el lector consulta sin editor. El guardado usa el
writer atómico con permiso del actor antes del replay, valores validados e
intención/auditoría/evento; un ACK perdido conserva la clave y el formulario.
Cuatro cambios locales desdeUI terminaron con la configuración original
restaurada y sin efectos extra del retry. La frecuencia indicada no activa una
consulta automática. Habilitar KPIs no transmite documentos aSUNAT.
Fill-rate analiza pedidos confirmados vigentes y las cantidades registradas en
`pedido_despachos`, excluyendo despachos anulados y pedidos cancelados/pendientes;
recorre páginas y acota los filtros por IDs. Tres pedidos reales/ocho unidades
mostraron87.5% durante un despacho parcial y100% al completarlo. Ese despacho no confirma
recepción: OTIF usa entregas con trackingENTREGADO/fecha válida, mide días civiles
del país y exige cantidad completa. Sin entregas confirmadas muestra “No evaluado”.
Los documentos SUNAT pendientes no se presentan como todos aceptados. La UI
verificó deshabilitación/restauración,503/retry y lector nativo403;
entrega confirmada/SLA y volumen>1000 siguen acreditados sólo técnicamente.
Las fechas civiles de emisión y vencimiento de cotizaciones se muestran sin
desplazarlas al día anterior por la zona horaria del navegador.

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
- Cotización, pedido y POS consultan el precio vigente antes de guardar o abrir
  el cobro. Si cambia, muestran el precio y total nuevos y requieren otra
  confirmación. Una consulta fallida conserva los datos y bloquea la escritura.
  POS descarta la respuesta si cambió el carrito o receptor durante la consulta;
  el usuario debe verificar nuevamente su venta actual.
- Alta y edición de cotización/pedido comparan el precio revisado con el resuelto
  dentro del writer. Un cambio concurrente rechaza la transacción con409 y pide
  revisar el total vigente antes de confirmar; no deja un alta, edición o recibo
  de intención fallido. Los recibos ya confirmados se recuperan antes de ese
  guard, sin revalorizar su snapshot histórico. Tres recorridosUI comprobaron
  alta/edición de cotización y alta de pedido entre dos pantallas, con regla
  restaurada al estado original. Edición de pedido tiene writer verificado,
  pero no se localizó pantalla para acreditar su aceptación funcional.
- Si se pierde la respuesta de conversión de cotización, la UI consulta el
  vínculo persistido y recupera el pedido existente. Sólo una lectura que
  confirme estadoCONVERTIDA y pedido vinculado acredita ese resultado; no
  ejecuta una segunda conversión para recuperar la respuesta.
- La gestión comercial requiere un catálogo completo antes de mostrar importes
  o habilitar altas y cambios de estado. Una lectura fallida ofrece reintento;
  no se presenta como cero listas o comisiones. Las intenciones de guardado
  conservan un UUID corto por contenido del formulario, sin incluir ese
  contenido en la cabecera `Idempotency-Key`.
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
  trazabilidad contable. El costo PE de productos físicos usa la clave del
  producto agrupada al consumir reservas; no referencia una columna ajena al
  GROUP BY. La prueba histórica446 detectó y verificó la corrección local583;
  el recorrido integrado/UI completo conserva su compuerta propia.
- Notas de crédito y anulaciones restauran stock y registran reversos.
- Refresco readonly de estados actuales tras delta auditado: cinco reportes
  contables deoctubre2026,6pasos web/6Windows;balance35cuentas/debe-haber
  91.076,55 igualaSQL live.0writers/materializaciones/cambios de fuente.
  `audited-inventory-financial-current-read-postconditions.json`: alcance
  acotado;otrasfinanzas/fiscal/exportaciones/periodos/monedas/roles pendientes.
- Causa del incidente de arnés reproducida y correlacionada: extracción vacía
  dejó factory ausente; quitar ruta con página viva tras fallo despacha HTTP.
  Aborto explícito previo impide envío en servidor efímero sin API/DB principal.
  Source original y clave/cuerpo reales correlacionados. GuardHTTP local sigue
  activo; cierre de web temporal antes de liberar rutas, aborto de pendientes
  nativos. `inventory-original-scout-route-cleanup-cause.json`: soporte técnico.
- Consulta manual original y ACK real: GET explícito independiente del
  catálogo actual, sin replay.77contratos,40web+40Windows,64GETcontrolados,
  4POSTinterceptados/0writers. Recibo/cache/error/JSONcorrupto/cambio mientras
  GETretenido/archivo fallido mantienen original. Recibo completo persistido
  y leído antes del retiro.3web+3Windows de ACK real,2GET200/no-store, costo
  original1,051643192488263/importe0,26/stock2,38;archivo real en perfilWindows.
  Ajuste anterior no previsto1declarado,0cambios nuevos.1787fuentes;web/nativo
  nuevos,API4804/366,Rust35,SQL80 por huellas. GuardHTTP local sigue activo.
  `inventory-operation-manual-read-ui-postconditions.json`: lectura/ACKacotados.
  Fence de abandono,reinicio/two-tab,refresco financiero yvariantes pendientes.
- Época auditada inventario: un ajuste no previsto+0,25/asientoS/0,26
  preservado, sin borrado/reversión/replay y sin aceptación como writer QA.
  239de252tablas iguales; delta ligado a ocho tablas de negocio, cincoAuth.
  Todos los ledgers/movimientos/eventos/asientos/detalles previos intactos.
  GL156/confirmados154, inventario9; outbox60pendientes/0errores históricos.
  Recibo real200/no-store por GET. Costo completo1,051643192488263 se coteja
  con numeric(18,6) mediante HALF_UP6, sin redondear respuesta/importe niSQL.
  105dirigidas/27compiladas/API4804/366,1787fuentes. Guard HTTP local3311
  bloquea writers antes de Nest (14controles/423); causa de interceptación
  aún abierta. Baselines históricos no reescritos; nueva época coteja247
  tablas y material de usuarios, actividadAuth expresamente excluida.
  `inventory-read-recovery-audited-epoch-postconditions.json`: sólo soporte.
  UI manual sin catálogo/archivo ACK real/fence y refresco financiero pendientes.
- Consulta original de inventario: GET autenticado/con permiso del writer,
  no-store y DTO original; ledger por empresa/tipo/clave/actor. Recibo completo
  ligado al cuerpo canónico y snapshot; sin RPC de stock ni catálogos/fuentes
  actuales. Ausencia/error/ajeno/parcial/cacheado503, sin inferir abandono.
  34métodos servicio/28controlador previos exactos.102dirigidas/24compiladas;
  ocho snapshots readonly y11GET reales tras cuatro logins UI: OWNER8recibos,
  dos lectores403,OWNER secundario503 con clave principal. Cero writers/replays.
  API4801/366,1787 fuentes; web/export/nativo10248/6e1e,Rust35,SQL80 por huellas.
  `inventory-operation-read-recovery-postconditions.json`: soporte,ui_complete:false.
  Consulta manual UI sin catálogo y fence atómico de abandono pendientes.
- Confirmación original de inventario en UI: operation_identity completo
  debe corresponder a empresa/actor/tipo/clave/cuerpo canónico/operación/
  fingerprint/fecha. Recibo ajeno/parcial/cacheado o fallo503/red/400 conserva
  JSON y clave. Recarga sin reenvío; archivo completo persistido y verificado
  antes de retirar; cuota/lectura/retiro fallidos mantienen pendiente.
  40web+40Windows,76POST interceptados antes API, cero ajustes/traslados reales.
  Cuatro archivos de fixtures resueltos preservados;52 contratos. Funciones
  originales de envío exactas;1786 fuentes. Web/export/nativo nuevos;
  API4755/365,SQL80,Rust35 por huellas. `inventory-operation-receipt-ui-postconditions.json`
  acepta sólo vínculo y archivo. Conciliación readonly sin catálogo/fence
  servidor para abandono definitivo pendientes;400 sólo conserva. NO_GO global.
- Recibos de ajuste/transferencia: tras las RPC originales se exige ledger
  readonly por empresa/tipo/clave/actor y correspondencia del cuerpo normalizado,
  resultado inmutable, movimientos/evento, cantidades/costo/valor/stock,
  fingerprint/fecha. Identidad original en operation_identity. Parcial/ajeno/
  desconocido/cacheado/discrepante produce503 sin retry; sin DDL ni backfill.
  Otros32 métodos y selección/cuerpos RPC exactos; aritmética/SQL intactos.
  85 dirigidas/24 compiladas con ocho ledgers readonly; ningún writer/replay.
  Contexto del ledger canónico no reconstruye JSON histórico de UI. Cuatro GET
  tras login real, activos/inactivos6+1 y0+0; API4755/365,1785 fuentes.
  `inventory-operation-receipt-binding-postconditions.json`: soporte,ui_complete:false.
  UI aún debe vincular clave/actor/empresa/cuerpo y conservar/archivar/conciliar
  intención segura; no repetir ocho operaciones cerradas. NO_GO global.
- Operaciones de inventario exige catálogos completos/vivos con conteos
  estables, IDs únicos y pertenencia actual para productos crudos activos y
  almacenes. Servicio/control de stock se confirma antes de filtrar. Guías de
  traslado usan catálogo readonly íntegro bajo gre.guias.ver existente: motivo
  TRASLADO_ENTRE_ESTABLECIMIENTOS y estados FIRMADO/ENVIADO/ACEPTADO actuales;
  ninguna guía se crea/firma/envía. Caché/cola/error/incompleto/ajeno retira
  opciones y bloquea operaciones; país/moneda/configuración deben estar
  confirmados antes de habilitar campos. Reintento manual, tardías de pantalla,
  permisos/actores y secundaria. 79 pasos web/85
  Windows PASS, reinicio separado,71 contratos/API4115/350,1754 fuentes.
  `inventory-operation-live-read-postconditions.json`; stocks/movimientos/GL,
  maestros/colas/perfiles/PG intactos, cero escritores nuevos. El catálogo
  enriquecido includeSucursal ahora confirma fuentes hijas paginadas1000,
  conteos estables, IDs/claves compuestas únicos, scope empresa/producto y joins
  sucursal/almacén; lotes de100 IDs. Desconocido/truncado/ajeno falla antes de
  complete:true. Precio0, stocks negativos, inactivos y referencias NULL conocidas
  permitidas se conservan. Listado y detalle comparten lector;26 otros métodos/
  escritores exactos.55 pruebas dirigidas/2 controles compilados y11 consultas
  actuales de dos empresas contra SQL readonly: tablas hijas vacías por SQL,
  SELECT service_role denegado42501; API enriquecida falla explícitamente,
  sin vacío completo inventado. ACLs conservadas; disponibilidad pendiente.
  API4143/351,1756 fuentes; web/nativo/SQL80/Rust31 por huellas exactas.
  `inventory-sucursal-source-postconditions.json` acredita soporte técnico,
  cero writers y denegación explícita, con fila ui_complete:false; precio/stock
  positivo real por sucursal, consumidor enriquecido UI, recibos completos/
  durables, carga UI y snapshot de igual cardinalidad conservan caso propio.
 1001 con dobles es soporte técnico; NO_GO global.
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
- La cuenta 122 del contrato de anticipos y saldo a favor se aprovisiona al
  configurar Perú (551), preservando cuentas existentes. El generador de NC
  sólo exige esa cuenta cuando la distribución realmente genera saldo a favor;
  tampoco exige cuentas de inventario cuando no hay reversión de costo.
- La nota de crédito reduce la cuenta por cobrar hasta cero y lleva el exceso a
  saldo a favor del cliente (cuenta 122). Ese pasivo puede aplicarse a una CxC
  futura o reembolsarse por una caja/sesión o cuenta bancaria explícita.
- `nota_credito.emitida`, `saldo_favor.aplicado` y
  `saldo_favor.reembolsado` son los únicos dueños contables de esas operaciones;
  la recepción física no vuelve a contabilizar el inventario.
- El alta de cotización o pedido con `Idempotency-Key` registra su intención
  (567): repetir la misma clave, actor y contenido devuelve el documento ya
  creado; otro contenido o actor responde 409. La UI conserva la clave mientras
  reintenta la misma intención. Sin clave se mantiene el contrato anterior.
- Lecturas y writers de ventas indisponibles responden 503; un documento ajeno o
  inexistente, 404; las reglas de negocio, 400. Los reportes comerciales no
  devuelven el error crudo de PostgREST.
- El historial de cotización y pedido incluye el ciclo de vida durable del
  propio registro (alta, aprobación, rechazo, conversión, confirmación) además
  de auditoría, integraciones y movimientos de inventario.

Código principal: `apps/erp-api/src/modules/ventas`,
`apps/erp-api/src/modules/documentos`, `apps/erp-api/src/modules/cpe`.

## POS y cajas

F8 consulta el carrito y el tipo de comprobante vigentes en cada pulsación.
Cambiar cantidades sin añadir o quitar líneas vuelve a verificar esos precios;
el atajo conserva la exigencia de cliente al cambiar a factura. Abrir el cobro
no registra una venta ni un movimiento de caja.

```text
Apertura -> Venta -> Pago -> Ticket/CPE -> Movimiento de caja -> Cierre
```

- La caja abierta determina sucursal y almacén.
- La configuración expuesta por `pos/empresa-config` contiene sólo identidad,
  contacto, logo, país, moneda, impuesto y series necesarios para venta/ticket;
  nunca PFX, claves SOL, secretos OSE ni credenciales de otras autoridades.
  Una lectura fallida responde con error, no con configuración vacía exitosa.
- Una empresa Perú nueva recibe el catálogo de referencia de medios de pago
  al crear su configuración, sin depender de seeds demo. La carga POS de PFX
  valida contraseña, vigencia y emisor antes de cifrar y exige Idempotency-Key;
  permiso, actor e intención se comprueban también en su writer SQL.
- Estado fiscal inexistente o ajeno devuelve 404; conflicto de canje o reintento
  de ticket puro devuelve 409. El worker admite un contador de intentos NULL
  como cero para adoptar el canje reservado.
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
  Cerrar el diálogo de un cambio de turno en espera conserva la congelación;
  «Cancelar cambio y descongelar caja» ejecuta la cancelación explícita y sólo
  cierra el diálogo cuando el servidor la confirma.
- En Perú y PEN, cada venta íntegramente en efectivo puede aplicar el redondeo
  a favor del consumidor hasta el décimo inferior. Cada ajuste queda limitado
  a S/ 0,01..0,09 y se confirma dentro de la misma transacción POS en un ledger
  inmutable que liga tenant, sesión, venta, pago y movimiento. El cierre resta
  esos ajustes del saldo nominal para obtener el efectivo esperado. Compara
  el conteo con ese efectivo y autoriza sólo la diferencia operativa, sin
  descontar el redondeo dos veces. Usa `REDONDEO_EFECTIVO_LEGAL` cuando el
  arqueo físico cuadra y la diferencia nominal coincide con los ajustes vivos;
  varias ventas pueden acumular más de S/ 0,09. Una diferencia pequeña sin evidencia sigue siendo faltante y
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
  durables; un sobrante, faltante o redondeo documentado emite `caja.cerrada`.
  El asiento distingue el arqueo del redondeo y ajusta la caja nominal una
  sola vez, incluso si el conteo físico cuadra.
- Sesiones, movimientos, cortes y registros de apertura se consultan en vivo.
  Las respuestas exigen identidad, estado, secuencia e importes válidos; aceptan
  decimales textuales finitos de PostgreSQL normalizándolos. Carga/error retiran
  filas/acciones sin falso vacío; retry conserva el contexto y una consulta
  anterior no sustituye otra sesión, actor o diálogo. Las operaciones de caja
  requieren confirmación real: no crean nuevas intenciones offline ni anuncian
  éxito local. Abrir exige además sesión/caja/importe coincidentes.
- PDF/CSV de cortes requieren respuesta en vivo, tipo y contenido completo,
  con identidad de actor/empresa conservada durante la descarga. El error queda
  visible en la página y permite repetir la descarga del mismo corte. El arqueo
  se obtiene del `close_result` congelado: saldo nominal, redondeo documentado,
  cantidad de ajustes, esperado físico, contado y diferencias operativa/nominal.
  PDF/CSV del cierre102.52/102.50/82.50 separan faltante20 y diferencia nominal20.02;
  el CSV mantiene tres columnas y agrega ocho campos de arqueo. No recalcula ni
  vuelve a cerrar la sesión. Si el snapshot histórico no contiene nominal o
  redondeo, los muestra como no disponibles; si es inconsistente, responde503.
  Un cierre administrativo indica sin arqueo/diferencia no verificada, sin
  simular conteo físico. Estas variantes se verificaron con dobles técnicos;
  PDF/CSV reales web/nativo se cotejaron contra el mismo cierre físico guardado.
  El baseline del P2 permanece histórico y los UUID de cajeros conservan P3.
  Caja chica/reversa no ofrecen controlUI localizado y no se acreditan mediante
  writers directos.
- Concurrencia UI local: apertura201/400 dejó una sesión100; dos ingresos1/1
  registraron dos movimientos/asientos únicos. Ticket0.52/efectivo0.50 con
  redondeo0.02 y conteo82.50 frente esperado físico102.50 exigió supervisor
  distinto por faltante20. El asiento separó faltante20 y redondeo0.02 una vez.
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
- Una empresa que configura país PE recibe la cuenta operativa `10111` (566);
  una cuenta existente, personalizada o inactiva no se reescribe, no hay
  backfill y otros países no cambian. El backend lee `cambios_turno` y
  `retiros_caja` sólo con SELECT de `service_role`.
- No poder leer sesiones, movimientos, cortes, ventas, retiros, turnos, la
  tolerancia o los pagos del reporte responde 503; nunca validación positiva,
  saldo igual al fondo inicial, 400, 404 ni 500. Un identificador inexistente
  sigue siendo 404. El writer manual distingue dominio (400), permiso (403) e
  infraestructura (503 recuperable con la misma intención).
- Los filtros `fecha_desde/fecha_hasta` exigen `YYYY-MM-DD` real, rechazan
  rangos invertidos y cubren el día local completo del tenant. El cierre
  admite el alias `monto_contado`; repetir un cierre administrativo ya
  confirmado devuelve su resultado aunque la sesión esté cerrada. El cierre
  administrativo cuenta el saldo del ledger por secuencia, como el preview; no
  usa `monto_esperado` de apertura ni sustituye un error de lectura por el fondo.
- El PDF de cierre conserva columnas dentro de A4 y pagina tablas; el CSV
  neutraliza fórmulas en el nombre de caja. Sesiones y cortes limpian el error
  al reintentar una lectura recuperada.

Código principal: `apps/erp-api/src/modules/pos`,
`apps/erp-api/src/modules/cajas`, `apps/web/app/dashboard/pos`.

## Fiscal: CPE, GRE y SIRE

El QR de representaciones PE admite los alias históricos FACTURA, BOLETA,
NOTA_CREDITO y NOTA_DEBITO y emite sus códigos 01, 03, 07 y 08. La traducción es
de lectura: no modifica el comprobante persistido ni omite la validación de RUC,
receptor, serie, fecha e importes. Los tipos desconocidos siguen rechazándose.

Centro de Documentos y Descargas distinguen lecturas fallidas de resultados vacíos
válidos. Validan identidad, tipo, serie/número, fecha, receptor, moneda, estado e
importe; retiran filas/acciones y ofrecenretry. Las métricas del centro tienen
consulta y reintento propios. Descargas conserva filtros aplicados separados del
borrador y descarta respuestas anteriores. Los tipos de lectura usan los valores
literales del backend, incluidos NC/ND/GRE/TICKET; esto no amplía el alta manual.
La numeración usa `numero` autoritativo y el formato fiscal del país.
PDF sigue el resolver autenticado sólo hacia el comprobante indicado y verifica
contenidoPDF; XML extrae el documento y valida su estructura. Ninguna descarga
guarda el sobreJSON como archivo fiscal. Al cambiar actor/empresa se cancela la
entrega. El caso local verificó F001-00000012PEN4.72, PDFuna página y XMLfirmado,
fallos/retry sin archivos inválidos; descargas/diálogos nativos siguen pendientes.
Centro sólo ofrecePDF para ENVIADO_SUNAT/ACEPTADO; Descargas puede consultar el
PDF local. Firmado/READY permanece distinto de aceptación externa.

- CPE construye UBL, firma, envía, consulta, almacena CDR y produce
  representación impresa.
- Factura/boleta directa PE reserva una intención por empresa, contenido y
  actor mediante `emitir_cpe_directo_peru_tx` (565). Un replay idéntico recupera
  el mismo CPE; contenido distinto devuelve 409. Las claves históricas sin la
  huella PE fallan cerrado. Pedido y POS conservan sus writers propios.
  Crédito PE exige cliente maestro y conserva su `cliente_id` en la CxC;
  `precio_unitario` es el valor neto y `precio_venta` el unitario con impuesto.
  El alta manual permite declarar afectación gravada, exonerada, inafecta o
  exportación por línea. UBL y PDF conservan la tasa fiscal declarada: no la
  infieren del cociente de importes monetarios ya redondeados. La referencia de
  precio de una nota es unitaria, aunque devuelva varias unidades.
- La emisión directa distingue venta interna0101 de exportación de bienes0200.
  Exportación requiere todas las líneas40, IGV cero y receptor no domiciliado
  identificado sin RUC; admite pasaporte o carné de extranjería. Conserva0200
  en el snapshot y la huella idempotente; el XML declara9995 sin subtotal1000
  vacío. El QR mantiene la identidad extranjera y el PDF no agrega una leyenda
  de transferencia gratuita. Servicios exportados y excepciones fiscales
  especiales requieren otro contrato y no se infieren de la afectación40.
- La bandeja CPE pagina y muestra el total; exporta todas las coincidencias a
  CSV con campos escapados y fórmulas de texto neutralizadas. Para PE, las
  fechas filtran por emisión. Ausencia/empresa ajena devuelve 404, parámetros
  inválidos 400 y fallo de infraestructura 503. Los errores son visibles y
  permiten reintentar sin sustituirlos por estadísticas cero o listas vacías.
  Un fallo técnico fiscal conserva 503 también al recuperar el intento;
  reenvío con otra clave en conflicto devuelve 409. Una firma o estado READY
  local no representa aceptación SUNAT: ésta exige la respuesta y CDR reales.
- El PDF A4 es la salida física elegida por el ERP: mide 210 × 297 mm y debe
  imprimirse en papel A4, escala 100 % y sin «ajustar a página». SUNAT no impone
  un único tamaño de papel; lo exigible es que la representación impresa sea
  legible y contenga la información fiscal aplicable. El PDF del backend es la
  representación autoritativa para comprobantes de una o varias páginas; la
  vista HTML permite revisarla sin depender del visor PDF nativo y no debe
  recortar líneas, totales ni el QR.
- La vista A4 exige metadatos completos del documento solicitado y un PDF real
  en vivo. Un fallo retira la hoja anterior y deshabilita descarga/impresión;
  ofrece reintento manual. Cerrar aborta las lecturas y libera el Blob. El
  alcance cambia con el actor y el documento. Detalles anteriores con total
  explícito o base+impuesto conservan sus importes; datos ausentes no se
  convierten en cero. PENDING se muestra como **Sin aceptación SUNAT**: firma
  y PDF no acreditan aceptación ni un CDR.
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
- En Perú, la serie FACTURA/BOLETA que el administrador configuró en la empresa
  se registra con `crear_serie_documento_tx` (461, auditada) la primera vez que
  el Centro de Documentos la usa; cualquier otra serie exige su alta explícita.
  La auditoría de un documento ajeno responde 404 y las lecturas o el writer
  indisponibles responden 503.
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
- Listado e indicadores CPE requieren fuentes completas en vivo: un error,
  caché o respuesta incompleta retira las filas/importes y ofrece reintento.
  No convierte una lectura desconocida en cero ni en catálogo vacío; la
  paginación exige conteo exacto. La suma mensual recorre todos los CPE con
  decimal y rechaza páginas truncadas o cambiantes. Los filtros siguen
  disponibles al cargar, incluidos FIRMADO/ERROR/ANULADO; una respuesta tardía
  no sustituye otro filtro, documento ni actor.
- La consulta de anulación financiera CPE verifica identidad, cobros, ajustes,
  sesiones y estado del flujo antes de ofrecer sus acciones. Un refresco
  fallido retira el estado anterior y permite recuperar la lectura. El permiso
  funcional del OWNER no suplía el SELECT ausente del backend en reversas:
  la583 local añade sólo esa lectura, preservando filas, RLS y demás ACL.
  Esta prueba no ejecutó notas, devolución de cobros ni finalización.
- La solicitud de anulación conserva una intención por empresa, actor y CPE
  antes de enviar: clave y cuerpo quedan fijos tras error, cierre, recarga o
  reinicio Windows. Sólo una confirmación completa en vivo del mismo CPE y
  nota retira esa intención; el reintento es manual. Respuestas vacías,
  pendientes, cacheadas o de otra identidad no confirman. Se recuperó una
  única solicitud real201/idempotent:true tras perder el ACK, sin duplicar
  nota/documento/pago/asiento. En esa fase la nota quedó BORRADOR sin CDR;
  originalFIRMADO y CxC1.18 permanecen activos. Lectores403/empresa2vacía no
  ven la intención del OWNER, que se recupera al regresar a su sesión.
- El alta CPE conserva el borrador por empresa, actor y país. Antes del POST
  guarda clave y cuerpo; un error incierto congela los datos y ofrece reintento
  manual de esa misma emisión. Cierre, recarga y reinicio preservan cliente,
  líneas y fecha manual. Sólo un CPE completo en vivo, coherente en documento,
  folio, estado, receptor, fecha e importes, confirma y retira la intención.
  Un borrador dañado bloquea el writer sin sobrescribir la evidencia. Windows
  recuperó una emisión real201 tras ACK perdido con el mismo CPE/clave/cuerpo,
  sin repetir documento, CxC ni asiento. Lectores403 y empresa2vacía no ven el
  borrador del OWNER. El rechazo explícito de normalización anterior a numeración
  y escritura permite corregir sólo una claveUI nueva sin CPE existente.
  Requiere HTTP400 real y el código dedicado; conserva formulario y fecha,
  retirando esa intención para que la corrección obtenga otra clave. Un400
  genérico, estadoHTTP contradictorio, caché o error incierto mantiene retry.
  Una lectura incompleta de la intención falla cerrado. Web/Windows verificó
  cuatro rechazos reales por cantidad0 sin escritura; todas las correcciones
  válidas se interceptaron antes delAPI. Otros rechazos de DTO/fiscal conservan
  intención: no se deduce ausencia de emisión sólo de un400.
- Los orígenes de NC/ND requieren información completa en vivo; error,
  respuesta incompleta o caché bloquean el writer y ofrecen reintento sin
  anunciar un vacío falso. Cerrar y reabrir descarta respuestas del modal
  anterior. Los orígenes reales elegibles locales siguen vacíos sin CDR;
  la creación desde un origen aceptado conserva UAT pendiente.
- La firma guarda una intención por empresa, actor y nota antes del POST.
  Clave/cuerpo sobreviven error, recarga y reinicio, y permiten recuperar la
  misma firma aunque el listado ya muestre FIRMADO. Sólo una confirmación
  completa en vivo del mismo CPE retira la intención; una intención dañada
  bloquea el writer y conserva el contenido. Windows recuperó una firma
  real201/idempotent:true con la misma nota/clave/cuerpo/hash XML, sin otra
  operación. Lectores403/empresa2vacía no acceden a la intención del OWNER.
  La NC sigue FIRMADO/READY sin documento emitido/CDR; CxC1.18 activa y sin
  ajuste tributario. La firma técnica no acredita aceptación fiscal.
- El envío Perú conserva intención por empresa, actor y CPE y usa la misma
  clave canónica del backend. Bloquea doble clic; un fallo o recibo incompleto,
  offline, cacheado, en curso o con sólo un ticket no anuncia envío ni aceptación.
  Recarga y reinicio conservan clave/cuerpo para reintento manual. La intención
  dañada bloquea la acción sin sobrescribir el contenido; cambiar sesión no
  publica la respuesta anterior. La recuperación permite verificar la intención
  pendiente cuando el servidor ya cambió el estado, con permiso de envío.
  La UAT local acreditó únicamente negativos interceptados antes del API, sin
  operación fiscal real. Envío y recuperación positivos requieren la autoridad.
- El PDF Perú sin estado aceptado y CDR acreditado imprime **Sin aceptación
  SUNAT · CDR no acreditado** y presenta READY como estado técnico. La muestra
  conserva su aviso propio. Web y Windows revisaron dos PDF originales de NC,
  de una página, y abrieron24A4; el pie no acredita aceptación por sí mismo.
- La descarga desde el listado exige PDF binario completo o CSV con cabecera,
  filas y montos completos; rechaza JSON, archivos truncados y caché. Ofrece
  error/reintento y descarta la descarga si cambia filtro o sesión. Web y
  Windows cotejaron CSV21filas/10columnas idénticos y el PDF previo
  F001-00000012/PEN4.72 de una página por interfaz, revisados individualmente.
  El pie READY del PDF y FIRMADO del listado son estados técnicos distintos;
  ninguno acredita aceptación fiscal. El preview A4 y los writers conservan
  variantes pendientes de UAT, detalladas en la matriz.
- El historial CPE importado por473 conserva `MIGRADO`. El listado exige su
  procedencia canónica íntegra y lo publica como historia de sólo lectura,
  con estado fiscal no verificado; permite filtrar y exportar. No ofrece A4,
  envío, firma, GRE, nueva vinculación de cobro ni anulación fiscal para esas
  filas. Los contratos A4 y de anulación siguen rechazando MIGRADO; los estados
  desconocidos o una procedencia incompleta siguen fallando explícitamente.
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
  El panel exige dos lecturas en vivo y válidas del tipo actual y del mismo
  contexto de empresa/actor. Fuente desconocida o cacheada bloquea acciones;
  respuestas tardías de RA no sustituyen RC. La recarga del listado de
  documentos mantiene el panel montado y conserva el tipo elegido. Reanudar
  firma usa la cabecera original; el reintento de envío conserva su clave.
- Cada lote reserva cabecera y detalle atómicamente, bloquea sus CPE en orden
  determinista, congela el XML firmado y conserva ticket, estado, error e
  intentos. Aceptar exige ticket, código y CDR; `ACEPTADO`/`RECHAZADO` son
  terminales e idempotentes sólo para la misma huella de respuesta. Reintentar
  no crea otro lote ni duplica efectos comerciales o contables.
- GRE usa transporte configurable y conserva estados asíncronos. El formulario
  manual recoge tipo/documento del destinatario y pesos con tres decimales;
  un emisor configurado puede crear y firmar UBL sin un desarrollo adicional.
  El alta interna sin certificado conserva borrador y error recuperable.
- GRE desde pedido exige una lectura en vivo del pedido/empresa esperados,
  destinatario completo y detalle identificado sin cantidades inválidas ni
  líneas duplicadas. Fallos, caché e incompletos retiran origen y writer, con
  reintento manual. PED-2026-0005 FACTURADO sólo preparó el formulario en UAT;
  no acredita otra entrega ni creación de guía. Lectores403/empresa2real404
  no exponen origen. Navegar fuera descarta respuestas del formulario anterior.
- Listado, indicadores, detalle, establecimientos y productos GRE requieren
  respuestas completas en vivo. Error/caché/incompletos retiran datos y acciones,
  muestran retry y no anuncian vacío ni cero. Los filtros siguen disponibles al
  cargar; respuestas anteriores no sustituyen otra consulta, guía o actor.
- Alta y acciones GRE conservan una intención por empresa/actor/contexto antes
  del POST. Una confirmación ambigua mantiene campos y clave al cerrar/recargar,
  sin éxito ni nueva cola offline; el reintento es manual y recupera esa operación.
  Una respuesta sin guía, ajena o con estado incorrecto no confirma el writer.
  Datos prellenados de CPE/pedido no sobrescriben el intento recuperado.
  El intento conserva el contexto original: cambiar despacho del mismo pedido
  bloquea retry y ofrece regreso explícito al original. Referencias persistidas
  ajenas, UUID inválidos, listas dañadas/duplicadas o metadatos incoherentes
  bloquean la escritura sin borrar ni migrar la clave. Web/Windows y reinicio
  del mismo binario/perfil verificaron sólo POST negativos antesAPI; primer alta
  positiva de pedido/despacho/CPE relacionado conserva su pendiente.
  El preflight fiscal bloquea una demo antes de reservar y conserva
  `DEMO_EXTERNAL_TRANSPORT_BLOCKED` como `error` HTTP. Únicamente HTTP400
  real con ese código en vivo, sin offline/pending/queued, de envío/reenvío/
  consulta libera la intención porque no se aplicó. Un400 genérico,403,503,
  200 contradictorio, red caída, caché u offline sigue conservándola. La UI web y
  Windows verificó esos rechazos inducidos antes delAPI; la empresa local no
  es demo y no se transmitió. El guard/filtro HTTP y reenvío/consulta se
  verificaron con dobles técnicos, sin fabricar guías en estados enviables.
- GRE ofrece PDF binario con emisor, estado, transporte y todos los bienes,
  descarga desde listado/detalle e impresión de ese PDF. En una GRE firmada,
  el emisor proviene del XML congelado y no de una razón social editada después.
  La vista muestra los bienes persistidos; un PDF no acredita aceptación SUNAT.
  El alta manual declara el peso total y no ofrece reparto por bien. El PDF
  muestra «Peso por bien: no declarado» para el cero legacy o la ausencia de
  desglose; conserva los pesos positivos declarados y el total original.
  La descarga de una guía manual real se contrastó con el texto del PDF.
- El CSV GRE escapa comillas, comas y saltos y neutraliza prefijos de fórmula.
  Conserva tres decimales de peso. CSV/PDF usan la fecha de emisión del XML
  cuando existe, y la fecha persistida del registro sin XML; una fecha no
  verificable bloquea el archivo. La descarga requiere tipo/contenido completo,
  respuesta en vivo y el mismo actor. El CSV de la pantalla contiene todas las
  guías, independientemente de los filtros del listado.
  Conflictos GRE responden 409; indisponibilidad RPC responde 503 sin detalles
  internos, conservando la intención para un reintento. Validaciones siguen 400
  y consultas ajenas/inexistentes 404.
- UAT local: T001-00000005 pública/OTROS, bien y peso0.125, alta/anulación únicas
  con respuestas perdidas y misma clave; anulación recuperada tras reinicio real.
  Cuatro guías anteriores y corte131/banco/stock exactos. Lectores403 y empresa2
  vacía, recuperación/tardías/descargas web/nativo; CSV5guías/12columnas y dosPDF
  actuales cotejados (`gre-lifecycle-postconditions.json`). El evento gre.creada
  permanece pending en el harness; no acredita worker ni aceptación externa.
- SIRE: reportes/estadísticas/bitácora exigen lectura completa en vivo, conteo
  exacto, IDs únicos y empresa coincidente; bitácora correlacionada con reporte.
  Fuente desconocida/fallida, caché/cola o datos incoherentes retiran filas y
  métricas, muestran error y bloquean generación. Vacío sólo confirmado;
  respuestas de filtro/sesión anteriores o bitácora cerrada se descartan.
  Estadísticas acumuladas se identifican como empresariales, independientes del
  filtro; reportes del mes usan límites civiles Perú. Permiso sire.emitir en
  controles/handlers y configuración fiscal confirmada, sin fallback Perú.
  Aceptar propuesta y consultar ticket notifican los errores de la solicitud;
  conservan la clave original para el reintento manual. Los lectores mantienen
  su error de pantalla propio y no muestran un éxito fiscal ante un fallo.
  Borrador no enviado permanece ante503 y reintento manual;69 pasos web/
  75 Windows PASS,54 contratos, API3882/344 y reinicio separado.
  Dos reportes previos/datos fiscales y153GL14períodos exactos; cero nuevos
  escritores. `sire-live-read-postconditions.json`. Paginación/conteo estable
  no garantiza snapshot transaccional de contenido bajo toda concurrencia;
  recibos/intenciones durables de writers y autoridad real siguen pendientes.
- Descarga SIRE: antes de crear el archivo verifica SHA256 de los bytes UTF8
  y empresa, reporte, nombre, tipo de contenido y metadatos de la instantánea
  seleccionada. Una respuesta alterada, de caché, ajena o parcial muestra error
  con reintento. Una sola descarga activa; filtro/sesión invalida pendientes.
  112 pasos web/Windows,52 contratos y dos archivos originales conservados.
  REG_COM5/REG_VEN0 son instantáneas históricas; no los17/23documentos actuales.
  Sin regenerar, transmitir ni acreditar SUNAT/PVS; cero writes. Evidencia:
  `sire-frozen-download-postconditions.json`. Writers fiscales durables pendientes.
- SIRE genera una vista local de comparación por período para RVIE y RCE.
  Expresa importes y totales en PEN, conserva moneda y cotización originales
  y resta las notas de crédito. RCE usa los importes fiscales originales de la
  compra; RVIE obtiene el cambio del documento enlazado. Un documento extranjero
  sin cotización válida bloquea la generación. La descarga de comparación no
  constituye un archivo normativo de reemplazo ni acredita PVSIRE.
  La aceptación de la propuesta oficial usa la API SUNAT exclusivamente desde el
  backend, exige `sire_activo`, credenciales SOL/API y la referencia física de
  PROD; DEV y empresas demo fallan cerrado aunque contengan credenciales.
- La cola histórica `sire-processing`, sin productores vigentes, ya no inventa
  archivos completados. Sus trabajos se rechazan sin reintentar y deben
  generarse mediante la API vigente con actor, tipo e idempotencia. Tampoco se
  marcan como completados trabajos CPE que respondan función no implementada.
- El cron SIRE antiguo de la API también se retiró: anunciaba un archivo sin
  generarlo. Invocarlo falla explícitamente; la generación funcional permanece
  en `/api/sire/generar-reporte` con permisos, actor e idempotencia.
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

El contador de órdenes activas incluye BORRADOR, APROBACION, APROBADA y PARCIAL,
además de los estados históricos PENDIENTE y ENTREGADO. Excluye las órdenes
RECIBIDA, ANULADA y RECHAZADA; una recepción parcial permanece activa.

El historial de aprobaciones de una orden permanece consultable en APROBACION,
APROBADA, PARCIAL, RECIBIDA y ANULADA, sujeto a sus permisos y a una lectura viva
completa. Recibir la orden no oculta su trazabilidad ni habilita nuevas acciones
de aprobación.

La anulación de una devolución pendiente conserva su confirmación visible después
de recargar el detalle. Sólo confirma con respuesta viva para el mismo ID y estado
ANULADA; un error de transporte o un resultado sin ese recibo no confirma la
operación y permite consultar o reintentar. La emisión también presenta su confirmación después de
actualizar el detalle, para que la consulta no retire el mensaje recién mostrado.
- El detalle de OC ofrece Crear Recepción para APROBADA o PARCIAL cuando alguna
  línea tiene cantidad pendiente y el actor dispone de compras.crear.recepciones.
  El wizard conserva pendiente real; una orden completada no ofrece otra recepción.
  Regresión UI web/Windows y rechazo real0.25, parcialOK0.25 y observado0.50
  sin stock documentados en `service-receipt-variants-postconditions.json`.
  El rechazo no satisface la orden ni genera asiento; las cantidades aceptadas
  completaron OC-2026-S57002 y produjeron dos GL63/4699. Facturas0.89/1.77 y
  un lote pago2.66 cerrados una vez; banco21228.70 y corte150.2748 huellas históricas
  exactas, reportes/PLE/tributos actuales sin presentación. No repetir operaciones.

- La factura de servicio F570-10110001 quedó PAGADA por un pago bancario de
  PEN 1.77 registrado desde Windows. ACK 503 tras commit y reintento manual con
  misma intención tras recarga; un cargo y un asiento 42/1041. Banco 21231.36,
  144 asientos confirmados. `service-payment-postconditions.json` conserva fuentes,
  2703 huellas, ocho colas en cero y actualiza estados/PLE/reportes/cálculos tributarios
  desde UI sin reescribir declaraciones. No repetir la operación. Pago externo,
  SUNAT, variantes y demás módulos pendientes; NO_GO global.


```text
Cotización -> Aprobación -> Orden de compra -> Recepción -> CxP -> Pago
```

- Órdenes y recepciones conservan cantidades pedidas, recibidas y pendientes.
- La valoración de cada recepción usa el precio congelado en su línea de OC.
  Un precio contractual cero se transmite como costo cero confirmado al writer
  de inventario; no se sustituye por el costo o precio actual del catálogo.
  La corrección 589 sólo cambia los cierres futuros: no revaloriza movimientos,
  asientos ni recibos históricos, ni modifica permisos o RLS.
- Cantidad y precio unitario de cotizaciones/órdenes conservan el contrato
  comercial de dos decimales. UI, DTO y writers rechazan sobreprecisión antes
  de calcular importes; nunca guardan una cantidad redondeada con el subtotal
  de la entrada original. Esto no habilita compras a seis decimales por el
  hecho de que inventario físico los admita. La conversión bloquea líneas
  históricas cuyo subtotal no corresponde a cantidad×precio; no las reconstruye.
- El detalle permite rectificar cantidades/precios de líneas existentes en
  borrador. Conserva producto, descripción y campos tras error, recalcula
  importes/impuesto mediante el writer vigente y espera confirmación antes de
  cerrar el diálogo. Cabecera se edita desde el listado; en órdenes requiere
  seleccionar Lista. Aprobar/rechazar conserva la segregación del creador.
  El corte local verificó una cotización nueva de tres productos distintos:
  gravado/exonerado/precio0, total1.18; dos cantidades editadas desdeWindows
  recalcularon1.19 sin cambiar productos/descripciones/precio0. Sobreprecisión
  bloqueada,503 previo conservó borrador;200 real único y recargas web/Windows
  comprobaron revisión2. Lector403/empresa2real404 sin datos ni editor;OWNER
  recuperó el detalle. CSV web exportó cabecera de la página filtrada actual.
  Dos fallos posteriores del arnés se conservaron, con recuperación sóloGET.
  Añadir/quitar se probó en asistente antesdelalta; no hay esos controles en el
  editor persistido. Cotización no ofrece selector/columna de moneda: casoPEN
  visible, sin aceptaciónUSD. Ese corte histórico no añadióOC/recepción/stock/
  CxP/asiento/outbox. La fase posterior envió/aprobó/convirtió esa misma
  cotización: OWNER200/autoaprobación400/BUYERdistinto200; Windows201 produjo
  una solaOC-2026-0002/treslíneas por1.19. ACK503 trascommit y retry201
  recuperaron mismoID; reinicio real leyó vínculo APROBADA→OCBORRADOR.
  Cantidades0.13/0.50/3, precios1.25/2/0, tributos10/20 conservados;
  recibidas0/pendientes igualesapedidas. Sinrecepción/CxP/GL/outbox/stock.
  Detalle de cotización exige lectura viva completa e identidadempresa/actor;
  los recibos de enviar/aprobar/rechazar/conversión validan estado, importes,
  líneas y huellas antesdeléxito.25web/26Windows negativos,12POSTinterceptados
  porinterfaz,0writes; fixtures negativos explícitos no acreditan negocio.
  Roles200/403/404/relogin200 enambas y dosCSVweb de cabecera actual pasan.
  Se conserva writer1PASS/1fallo selectorPEN/S/, corroborado sóloGET; no se
  acredita recorrido completo dewriter.2173huellas y filas anteriores intactas.
  El detalleOC posterior corrigió el cero visible como guión, el reintento503
  y las lecturas cacheadas/incompletas accionables. Exige empresa/documento/
  actor, estado, fechas, moneda, importes y líneas coherentes; cantidades
  recibidas no exceden pedidas y pendientes corresponden a la diferencia.
  36 controles porinterfaz y cinco órdenes actuales/siete líneas pasan;
  OWNER200/lector403/empresa2real404/relogin200,0writes/2188huellas intactas.
  La impresión de orden conserva datos comerciales, líneas, cumplimiento,
  importes, fechas y observaciones; omite paneles operativos de aprobación/
  recepción y no atribuye tasa general18% a tributos mixtos. CincoPDFweb/
  diezpáginas revisadas mantienen resumen y total completos, sintexto cortado.
  Originales/fallos conservados. No acredita impresora/descargaWindows niUSD.
  La fase de acciones exige recibo completo antesdeéxito: actor/estado,
  importes/líneas/tributos intactos, marcas/huellas de decisión e idempotencia;
  motivo coincide en rechazo/cancelación.49controles porinterfaz conservan
  formularios tras error,48POSTinterceptadosantesAPI y0writes de regresión.
  AutoaprobaciónOWNER400 real;BUYERdistinto aprobó esaOCmixta una sola vez
  desdeWindows:200commit→ACK503→retry200idempotente mismoevento/fila. Reinicio
  posterioralretry recuperóAPROBADA/3líneas sinPOST; no acredita intención
  durable al cerrarantesretry. Unaaprobación/unevento, sinrecepción/CxP/GL/
  stock/pago. OWNER/BUYER200/lector403/empresa2real404/reloginOWNER200, historial
  único de actor/comentario, PDFwebactualAPROBADA yCSV real de una cabecera
  filtrada APROBADA/PEN1,19 pasan;2229huellas intactas. CSV sin detalle ni
  descargaWindows acreditada.
  El historial de aprobación/recepción ya exige lectura viva y scope actual,
  success/count/IDs únicos, fechas/estados/campos usados y cantidades positivas.
  La aprobación confirmada coincide con actor/fecha del header; recepción
  existente exige fila cerrada. Error conserva panel y ofrece retry propio.
  Siete P1 y un P2 reproducidos en ambas interfaces;59 controles por interfaz
  (13 negativos de aprobación/16 de recepción y sus GET reales de recuperación)
  pasan sin writers. Corpus/roles10 por interfaz: cinco órdenes, aprobación
  única de BUYER y dos recepciones CERRADA de8/12 unidades, total20/100%;
  OWNER/BUYER200, lector403, empresa2 real404 y reingreso OWNER200.
  56 checks técnicos preservan almacén null explícito de servicio/no-stock,
  sin acreditar recepción real de servicio.2254 huellas/fuentes exactas y ocho
  colas0; sin nueva decisión/recepción/CxP/stock/GL/evento. Visibilidad por estado
  conservada. Intentos fallidos/intermedios preservados como no actuales.
  La mixta OC-2026-0002 quedó RECIBIDA con tres recepciones reales: parcialweb
  0,05/0,20/1, segundaWindows0,08/0,08/0,30 y saldoWindows0,22/1,70. El segundo
  arnés conserva2PASS/1FAIL; retrycreate y delta readonly acreditan commit único,
  sin convertirlo en recorrido completo. Saldo por código4PASS, ACK503 postcommit
  yretryUI mismo body/key/ID/fingerprint/actor/fecha sin duplicación; reinicio
  posterior2PASS sinPOST, no prueba durable antes de retry. Seis operaciones
  crear/cerrar,3recepciones/8items/8movimientos/3eventos/3GL; base1,16 yprecio0
  preservados, sinCxP/pago en ese corte; la factura se verificó después.
  Ruta Windows literal nueva tiene prioridad HTML/RSC sobre fallback dinámico;
  UUIDdetalle/query/recarga correctos. Cantidades a dos decimales yclamp de saldo
  evitan0,219999… y escáner1 sobrependiente0,22; Enter consume código sinactivar
  botón enfocado. Cinco controles por interfaz y18 técnicos; roles8 porinterfaz
  OWNER/BUYER200, lector403/empresa2real404; orden100%sinpendientes bloquea alta.
  2261huellas/ocho colas0 exactas. Reportes/Excel/PDF/PLE del corte140 verificados
  contra diario raw,12páginas individuales;111asientosOCT/299líneasD=H90011,41.
  F570-10010001 consolidó la orden recibida por1,16/0,03/1,19 desdeWindows.
  Una recepción seleccionada de la misma orden permite registrar el encabezado
  consolidado: unaCxP/unoutbox/unGL/treslíneas;4699 queda0,stock exacto ysinpago.
  Cuatro pasos201commit→ACK503→retryUI201 mismo body/key/ID sin duplicación.
  Proveedor/recepción exigen catálogos vivos y scope actual;503/caché/filas
  inválidas muestran reintento propio ybloquean alta, conservando campos.
  Dieciséis negativos/reintentos,33 controles por interfaz y35 técnicos.
  Roles7 por interfaz OWNER200, lectores403, empresa2real404 yregresoOWNER;
  reinicio posterior2PASS sin POST automático, no acredita intención antesretry.
  Reportes del corte141 ydoce páginas PDF revisadas contra diario raw;
  PLE112asientosOCT/302líneas/D=H90012,60,compras14/ventas23. El encabezado
  consolidado no acredita distribución fiscal por línea; versiones5/4 históricas
  intactas,2302 huellas y ocho colas0. Contrato POST inválido recuperado con fixtures; servicio real,
  rechazar/cancelar otro documento mixto, desconexión/cola/intención durable
  y respuestas tardías siguen pendientes.
  Consulta fiscalfallida403/429/503 bloquea módulos conerror/retry yconserva
  ruta; no implica alta incompleta. Permite salir y cachea poractor/empresa.
  429real previo produjo falsoasistente tras recargas;49PASS/1FAIL conservados
  y9controles porinterfaz pasan, sinwrites. La fase de contexto completa corrigió
  siete200malformados/ajenos aceptados por defecto comoPE, incluida ausencia
  explícita null. Se validaempresa/tenant, país/ID, moneda/tasa/demo/ARCA usados;
  sólo ausencia explícita válida dirige alwizard, error conserva ruta yretry.
  51controles porinterfaz (24payloads adversariales/retry ydos ausencias),
  regresiónHTTP9 yroles reales5 pasan, sinbusinesswrites. Nulltax conserva
  fallback y0 explícito permanece0; puntoARCA null sigue null.40checks técnicos
  decontrato no acreditan negocioAR/CO.2245huellas/progreso exactos ycolas8actores0.
  Caché válido sigue compatible; offline real yrespuestas tardías pendientes.
- El asistente de cotización exige ambos catálogos completos; lectura fallida
  muestra error y reintento, bloqueando el avance sin presentar ausencia de
  proveedores. Las fechas civiles se muestran en el mismo día ingresado y
  vencimiento se compara por día local. Conversión/reintento devuelve una sola
  orden vinculada, conservando la cotización aprobada como fotografía histórica.
- Listados de cotizaciones/órdenes publican documentos y proveedores juntos;
  lectura fallida bloquea cifras/acciones y permite reintentar sin falso vacío.
  Una respuesta anterior no reemplaza un filtro nuevo. El detalle conserva su
  ruta y ofrece reintento ante fallo, sin redirigir al listado ni declarar que
  la cotización no existe por un 503.
- El alta rápida de orden conserva una clave de intento entre reintentos,
  envía la moneda seleccionada y muestra el rechazo sin vaciar el formulario.
  Una nueva apertura inicia otra intención y una sola línea; cancelar no
  arrastra productos a la siguiente compra. API valida moneda y cantidades,
  mientras PostgreSQL calcula importes e impuesto sin aceptar totales del cliente.
- Servicio real UAT570:OC-2026-S57001/0.50precio3/base1.50/IGV0.27/total1.77,
  creada web201 sin almacén. Autoaprobación OWNER400;BUYERWindows200una vez.
  El evento de aprobación queda pending sin asiento. RecepciónWindows201/200:
  un itemOK sin almacén,RECIBIDA100%,Debe63 1.50/Haber4699 1.50,sin stock.
  F570-10110001Windows201/ACK503 se recuperó tras reinicio antes de dos replays201,
  mismos cuerpo/clave/ID/fotografía540,idempotent=true;una CxP1.77pendiente,sinpagos.
  Debe4699 1.50/Debe40 0.27/Haber42 1.77;4699queda0. DosGL/cincolíneas,
  dos eventos contables completed/retry0;cinco operaciones únicas,siete llamadas
  exitosas yuna negativa400. Todos los productos/stock/pagos/caja/bancos yRRHH12
  históricos exactos. Corpus4/roles7porinterfaz,lectores403/empresa2real404;
  segundo reinicio/corpus4yocho colas0. Reportes143/18CxP:6Excel6PDF12páginas
  revisadas,5PLE/OCT114GL307líneas/D=H90015.87/15compras23ventas.
  P2 de -PEN0.00 en este corte corregido en fase posterior; PDF históricos intactos.
  Las trazas parciales deaprobación/factura anteriores a fallos del arnés se
  conservan;no se afirma recorrido writer completo de aprobación en esta variante.
  Sin pago,nueva declaracióntributaria,instalador,aceptaciónSUNAT ni global.
- La recepción del asistente conserva intención privada v1 por empresa/actor/orden
  con etapas CREATE/CLOSE. Verifica mismos bytes antes de cada POST; sólo una
  creación completa permite guardar la identidad y avanzar a CLOSE. Reintento
  CLOSE envía únicamente el cierre de la misma recepción, con el cuerpo original.
  Verifica empresa/creador/orden/clave/estado, tiempos, items/detalles/productos,
  cantidades/calidad/precio/clasificación/destino e identidad estable del cierre.
  No recalcula criptográficamente create_fingerprint. Sólo cierre completo y
  retiro verificado del storage anuncian éxito; recarga/Volver no envían solos.
  Corrupción, cambio concurrente y fallos de transición/remoción conservan datos;
  acuse tardío tras salida no avanza ni limpia. Alta/cierre fuera de cola web/Rust.
  109 pasos por interfaz y reinicios reales CREATE/CLOSE2/3 pasan con mismo perfil,
  ocho colas0 ysin intención residual. Fixtures antesAPI, cero escritura nueva;
  recepción histórica CERRADA y143GL/18CxP/24CPE/5GRE exactos. 1692fuentes,
  91checks/Rust14,API3518/331/SQL80 porhuella. Otras variantes empresariales,
  múltiples ventanas y cambio de sesión retenido siguen pendientes; NO_GO global.
  Evidencia en `purchase-receipt-operation-postconditions.json`.
- El alta de orden desde el asistente conserva una intención privada v1 por
  empresa/actor con cuerpo,clave,tasa y afectaciones congeladas antes del POST.
  Recarga y Volver recuperan sin envío automático; retry manual requiere create.
  Sólo recibo completo BORRADOR de mismos empresa/actor,fechas,moneda,importes,
  detalles/items y clave permite limpiar; verifica retirada real del storage.
  No recalcula criptográficamente request_fingerprint. Caché/cola/recibos ajenos
  o incompletos conservan intención; altaOC excluida de cola genérica web/Rust.
  Corrupción y fallos de storage bloquean reemplazo; acuse tardío tras Volver no
  anuncia éxito. Cambio de empresa/actor oculta inmediatamente el cuerpo previo.
  81 pasos por interfaz y reinicioWindows2/3 con intención fixture pasan;
  cero nueva escritura empresarial,8colas0,2478 huellas/corte143 exactos.
  Nuevo binario/1691fuentes,76checks/Rust13;API3518/331/SQL80 por huella.
  Otras variantes de recepción/writers,múltiples ventanas y cambio de sesión retenido siguen
  pendientes; no extrapolar este alcance. Evidencia en postcondiciones de altaOC.
- El asistente de orden valida producto, cantidad y precio dentro de la página;
  corregir esos datos no depende de cerrar alertas nativas del navegador.
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
- La configuración de una empresa peruana provisiona las cuentas 4699 y 63
  que faltan para recibir bienes y servicios. Conserva las cuentas existentes,
  incluso si fueron personalizadas o desactivadas; una cuenta no apta sigue
  bloqueando el asiento hasta que se corrija la configuración contable.
- Editar una recepción en borrador usa `actualizar_recepcion_tx_568`: valida
  actor, tenant y estado con bloqueo; el backend no tiene DML directo sobre
  recepciones. Repetir el mismo texto es idempotente; cerrada responde 400.
- Rechazar o cancelar una OC la deja `ANULADA` con su actor y motivo.
- Lecturas de compras indisponibles responden 503 (también resumen, listado,
  reporte, productos y detalle heredados de `/api/compras`); nunca cifras en
  cero, lista vacía ni `success:false` con HTTP 200. Inexistente es 404. Las
  rutas heredadas de escritura responden 410.

Código principal: `apps/erp-api/src/modules/compras`.

## Inventario y logística

Reinicio físico Windows24004→18548: mismo binario/perfil, pendiente y archivo
reales exactos; sin envío automático, recuperación manual sin sobrescritura.
Dos pestañas web: segunda archiva/retira, respuesta tardía no altera el archivo
ni recrea pendiente; recarga sincroniza la primera.9 pasos/3 resoluciones
existentes, ledger privado2 sin filas nuevas ni stock/dinero. Fuente/gates
sin cambios, C6/PG intactos. `inventory-resolution-restart-context-postconditions.json`.
No se afirma dos pestañas nativas; otros módulos/variantes pendientes.

Abandono seguro original UI: 46 pasos controlados y 9 reales por superficie
web/Windows. El contexto de empresa/usuario capturado se comprueba en API
antes de resolver; cuerpo y clave originales íntegros, sin catálogo ni envío
automático. Recibo completo de commit o abandono se archiva y lee antes de
retirar los mismos bytes. Fallos de identidad/cache/almacenamiento o respuesta
tardía conservan el pendiente. Dos filas privadas de abandono desde UI web,
recuperadas en Windows; ACK real anterior recuperado sin repetir stock.
6 llamadas reales al resolutor, 0 RPC de stock/cambios de dinero o existencias.
Guard23 habilita sólo los dos POST de resolución; otros writers siguen423.
API4.888/367, contratos58, cola JS64 y Rust37; nativo24004 nuevo y C6 intacto.
Los archivos nativos de fixtures controlados se preservan en espacio QA;
archivos reales anteriores intactos. `inventory-operation-resolution-ui-postconditions.json`.
Reinicio físico/two-tab y variantes adicionales conservan pendientes. NO_GO.

La API ofrece resolución original autenticada mediante POST movimientos/resolver
y transferencias/resolver, con permiso vigente y no-store. Una llamada al
resolutor, sin writer de stock ni catálogo; el commit conserva su recibo completo
y el abandono debe coincidir con la identidad y el cuerpo original. Respuesta
parcial, ajena, cacheada o desconocida no confirma. 185 pruebas dirigidas,
API 4.884/367 y 16 cotejos compilados de filas aisladas pasaron. Un writer tardío
rechazado por el fence devuelve 409. UI, archivo durable y exclusión de cola
siguen pendientes; guard activo, ledger principal vacío y 0 cambios de negocio.
`inventory-operation-resolution-api-postconditions.json`: sólo soporte técnico.

El abandono explícito de ajustes y transferencias cuenta con un resolutor SQL
y un ledger privado en la 583 local. Comparte el bloqueo original de empresa,
tipo y clave, conserva actor y cuerpo canónico, y bloquea ambos writers
legados después del abandono. Un commit anterior devuelve su recibo original.
Vuelve a comprobar el permiso después de esperar. 20 carreras reales y los
80 verificadores SQL pasaron; DDL respaldada y rollback probado, sin cambios
de negocio ni backfill, ledger local vacío. El conflicto de cuerpo del writer
legado conserva su código 23505. API/UI de abandono y archivo durable siguen
pendientes. `inventory-operation-abandonment-sql-postconditions.json` acredita
sólo soporte técnico; guard local activo y NO_GO global.

Controles de catálogo y rutas manuales de alta/edición revalidados con lector
real yOWNER:7 pasos porinterfaz, sin submit ni repetir altas/edición/baja.
El lector no ve Nuevo/Editar/Dar de baja ni formularios; OWNER conserva los
controles. No cambió código. La intención privada presupuestal se mantuvo
exacta durante sesiones. `inventory-reader-controls-current-postconditions.json`.
Otros perfiles yrevocación instantánea conservan alcance pendiente.

Baja de producto consulta los45campos públicos en vivo y exige coincidencia
con selección. Fotografía completa, claveUUID/bodyDELETE vacío por
empresa/actor, persistidos/verificados antes de enviar.
Recarga/salida/reinicio no envían; retry manual mantiene clave. Sólo INACTIVO
con mismos45campos salvo estado/activo/actualizador/timestamp, metadata460 y
respuesta viva permite retirar los mismos bytes con readback vacío y anunciar.
Costo promedio conserva precisión ponderada. Fallos/corrupción/concurrencia
del almacenamiento y consultas/recibos tardíos conservan sin reemplazar. Baja
fuera de cola JS/Rust por URL/endpoint/aliases. Crear/editar/baja por permiso;
lector no ve escritores ni intención OWNER.

Catálogo consulta activos e inactivos completos en vivo; fallo de una
partición retira filas/controles y permite retry. INACTIVO/Todos muestran el
registro retenido.134pasosweb/145nativos,132checks/24offline/23Rust,
fuente1704/export136/debug nuevos, doce pruebasUI actuales y diez colas0.
Intentos de precisión ponderada/selector/arnés conservados.

F570-NOSTOCK-20261011 quedó INACTIVO por una baja UI Windows200 única, ACK503
tras commit, reinicio y un replayUI200 idempotent=true. Unledger460/una
auditoríaUPDATE, historial y45campos preservados salvo cambios de baja; los
otros seis maestros y fuentes financieras152 exactas. No se repitió
alta/edición ni se borraron datos. Fingerprint no recalculado por UI:
identidad/fotografía/metadata validadas y ledger/clave/auditoría readonly.
Otros maestros/perfiles/variantes/concurrencia/módulos y aceptación externa
continúan. Ver `product-deactivate-operation-postconditions.json`.


- La edición de producto exige lectura viva y recibo completos ligados al producto,
  empresa, actor y fotografía original. La intención privada UPDATE, IMAGE_UPLOAD
  o IMAGE_DELETE conserva DTO, clave y bytes/SHA256. Tras confirmar el maestro,
  sólo reintenta el paso de imagen. Fallos, recarga, Volver y reinicio conservan
  el cambio; respuestas tardías tras desmontar no avanzan ni borran la intención.
  Lecturas fallidas muestran error propio y reintento sin habilitar un formulario
  vacío. Los lectores no ven editor ni intención OWNER. La unidad histórica nula
  se conserva salvo regularización explícita. PUT de maestro y DELETE de imagen
  quedan fuera de la cola genérica.
- `product-update-operation-postconditions.json`: 139 pasos por interfaz,
  100 checks, Rust 16 y tres reinicios con 2 pasos antes y 3 después. La marca del
  F570-NOSTOCK-20261011 se actualizó una vez a UAT570 físico validado desde Windows:
  200 real, ACK 503 y reintento 200. Un UPDATE, un ledger y un audit; sólo cambian
  marca, fecha y actor. Siete productos, stock, 143 GL y demás maestros conservados;
  ocho colas en cero. 1694 fuentes, debug y export 136. API 3518 y SQL 80 por huella.
  El ayudante de alta cambia sólo tipos y su JavaScript generado es idéntico.
  Imagen y retirada sólo tienen fixtures, sin Storage externo positivo. Bajas,
  otros maestros, escritores, concurrencia y resto funcional siguen pendientes.

- El alta de producto conserva intención privada tenant/actor CREATE/IMAGE,
  DTO yclave; no entra en cola offline genérica web/SQLite. Requiere recibo vivo
  completo del maestro ydeimagen; IMAGE sólo reintenta la foto conlos bytes y
  SHA256 originales, nunca crea otro producto. Fallos/recarga/Volver/reinicio
  conservan intención; recibos tardíos tras desmontar no la avanzan ni borran.
  Catálogos fallidos/incompletos tienen error propio yrecuperación manual.
  El lector no ve formulario dealta ni intención privada del OWNER.
- Evidencia `product-create-operation-postconditions.json`:105pasos web y105
  Windows en8suites interceptadas,79checks yRust15; dos reinicios reales2/3.
  Alta física NIU/sincontrolstock/stock0 F570-NOSTOCK-20261011 real una vez,
  conACK503/replay201 misma clave/cuerpo. Unproducto/unledger/unINSERTaudit;
  7productos, maestros históricos yfuentes143 financieras exactas. API3518/
  SQL80 porhuella,1693fuentes/export136/debug nuevos, ocho colas0.
  La huella/op del maestro se valida porforma yledgerreadonly; no se afirma
  recalculación criptográfica. Foto sólo fixture; Storage positivo externo,
  edición/otros maestros/concurrencia yresto funcional siguen pendientes.


- Operaciones de inventario exige productos físicos/almacenes yguías completos
  en vivo; carga/error/caché retiran acciones ypermitenretry, sin falso vacío.
  Descarta respuestas deconsultas/actores anteriores. Ajustes/traslados no crean
  nuevas colas offline. La confirmación valida identidad, cantidad, almacenes,
  stock/costo/valor ymetadata deestablecimientos antes de anunciar éxito.
- Una operación ambigua conserva payload/clave en localStorage por tenant/actor,
  incluso tras recarga oreinicio; congela campos yotro modo yexige reintento
  manual. Un400, incluso INVENTORY_NOT_APPLIED, conserva el intento incierto;
  sólo la resolución explícita y atómica del original permite retirarlo. Un
  abandono ABANDONED verificado se archiva antes de liberar la edición y conserva
  producto, almacenes, cantidad y motivo; una confirmación COMMITTED conserva el
  comportamiento de limpiar cantidad y motivo. No hay nuevo envío automático.
  Reenviar recupera el resultado canónico sin repetir sus efectos.
  El caso local cerró traslado0.25 yconteo-.25 conACK perdido/reinicio: dos
  operaciones/tresmovimientos/un asiento0.26;stock2.00=Lima1.75+AQP0.25/costo1.04.
  GRE obligatorio depende dela configuración; traslado sinGRE con switchfalse
  no acredita aceptaciónSUNAT. El intento legacy sepreservó técnicamente al
  cambiar binario; el nuevo ajuste acredita persistencia automática trasreinicio.
  Web/nativo61recuperación/9tardías/5roles yKardex44 corroborados en
  `inventory-operations-postconditions.json`; otros escritores/variantes abiertos.
- Productos, el panel de inventario y Kardex distinguen un fallo de lectura de
  un vacío válido. Retiran datos anteriores, validan las respuestas completas y
  permiten reintentar con los filtros vigentes; las consultas anteriores no
  reemplazan el corte actual. Kardex bloquea filtros y consulta si falla uno de
  sus dos catálogos. El panel conserva cada sección leída correctamente y
  muestra indicadores desconocidos cuando faltan sus datos. Consulta primero
  indicadores y después productos: un403 de indicadores no invalida la lectura
  autorizada del catálogo, conservando la protección de caché tras denegaciones.
  No se localizaron controles de importación, exportación o impresión en esas
  tres pantallas.
- El saldo físico vive en `producto_existencias`.
- Los movimientos conservan almacén, producto, cantidad, costo, referencia e
  idempotencia.
- Reservar no descuenta físico; despachar/facturar aplica el movimiento
  autoritativo.
- Ajustes, transferencias, recepciones y POS usan el mismo writer.
- Las ubicaciones de un almacén ajeno responden 404 y las consultas de
  ubicaciones, movimientos y estadísticas responden 503 si no pueden leer,
  nunca 200 vacío ni 500. En logística, eventos y backorders de un pedido
  ajeno responden 404 y sus lecturas indisponibles 503.
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
- Registro de entrega del pedido usa el endpoint dedicado `registrar-entrega`
  y la función controlada 583, conservando tracking/RPC550 anteriores. Compara
  fotografía completa y congela pedido/detalle/evento/auditoría; recuperación
  de la misma clave devuelve el recibo original incluso si cambian luego las filas.
  UI conserva intención por empresa/actor/pedido antes del POST, sin envío
  automático al recargar o reiniciar. Recibos inciertos, almacenamiento,
  permisos y respuesta tardía no retiran la intención. Cola genérica bloqueada.
  Una entrega real Windows de PED-2026-0005 (73.16), con ACK perdido y reinicio,
  pasó a COMPLETADO/ENTREGADO: un evento y una auditoría, despacho/factura/
  inventario/153 GL/bancos exactos. No repetir. Fill-rate/OTIF real sigue
  deshabilitado; cálculo readonly del servicio con bandera sólo en memoria y
  positivo UI interceptado confirman 2/2, 100%, cuatro días Perú y SLA5.
  57 pasos web/62 Windows, 89 contratos, API3641/336, SQL80 fresco/restauración,
  Rust29, 1728 fuentes, export136/debug y11colas0. Evidencia:
  `sales-delivery-operation-postconditions.json`. Reconciliación409,
  concurrencia global, variantes y entrega física/SUNAT requieren casos propios.
- Picking, packing, despacho, backorders y GRE mantienen referencia al pedido.
  Preparación, packing, tracking, eventos manuales y reprogramación usan
  `operar_logistica_tx` (550): bloqueo de pedido, actor activo del tenant,
  fingerprint y clave idempotente; cambio, evento y auditoría se confirman juntos.
  El despacho físico conserva su RPC canónico. Un evento manual no puede
  fabricar un despacho, ni marcar entrega antes de éste o retroceder una entrega.
  La UI de despacho permite cantidades por línea física pendiente: cero omite
  una línea, exige al menos una cantidad positiva, hasta dos decimales y no
  superar el pendiente. API y writer rechazan cantidades explícitas nulas,
  no numéricas, no positivas o con sobreprecisión antes de generar efectos.
  La UI conserva clave y cantidades por empresa/actor/pedido ante errores
  ambiguos o recarga. El rechazo de cantidad transaccional `DISPATCH_NOT_APPLIED`
  acredita que esa intención no se aplicó: cierra el formulario, libera sólo
  ese intento y consulta otra vez el pendiente para permitir revisarlo.
  El writer consulta el recibo idempotente antes de validar cantidades; un
  despacho ya aplicado recupera su resultado. Un400 sin ese marcador o un503
  conserva la intención y no habilita otra escritura con datos distintos.
  Dos ventanas del mismo actor repitieron la carrera; navegador y ejecutable
  embebido completaron0.5/0.25/0.25 conACK perdido y replay sin otra salida.
  El replay recupera el resultado sin duplicar salida, auditoría ni notificación.
  Una preparación interrumpida permanece visible para continuarla; un fallo
  de consulta muestra error y reintento en vez de afirmar que no quedan pedidos.
  La 552 concede al backend lectura de historial y backorders, manteniendo
  RLS y los escritores cerrados.
- Stock inicial exige `almacen_id` válido.
- La transferencia entre almacenes permite seleccionar una GRE firmada de
  traslado entre establecimientos. El writer valida tenant, estado y los
  establecimientos de partida/llegada, y bloquea la guía durante el movimiento.
  Si la empresa exige GRE, el traslado entre establecimientos la requiere;
  referenciar una guía no acredita aceptación SUNAT. El mismo intento tras una
  respuesta perdida recupera la operación sin repetir salida ni entrada.
- Alta y edición de producto envían `es_servicio` y `controla_stock` elegidos.
  Elegir Servicio(ZZ) marca servicio sinstock; la edición carga las banderas
  guardadas y no convierte un ZZ histórico físico al abrirlo. Servicio/no-stock
  exige stock inicial0. Web/Windows:25 pasos y22 POST/PUT interceptados; servicio
  real S570-SERVICE-20261011 creado Windows201 y descripción editada web200,
  dos operaciones/auditorías460, stock/reservado0, sin movimientos ni GL.
  Conversión de físico con existencias400, lectorGET200/PUT403, empresa2producto
  404/regresoOWNER y reinicio2 pasan. Los controles del catálogo del lector
  se corrigieron después en la fase de baja, sin modificar permisos del backend.
  GET individual devuelve404 para ajeno/inexistente y503 ante fallo, incluidos
  precios/stock por sucursal con empresa y listas verificadas. API9tests;
  el listado `includeSucursal=true` también propaga503 al fallar una fuente,
  sin convertirlo en200 con datos vacíos. Es un enriquecido opcional de
  proyecciones históricas; el stock operativo conserva su fuente canónica.
  recuperación UI ante fallo y contrato completo de lectura/recibo de maestros
  siguen pendientes. Compra/recepción/CxP de este servicio verificadas en el flujo de Compras.
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

- Lotes y vencimientos (F02, migración 574): un producto puede activar control
  de lote con vencimiento obligatorio y vida útil mínima. Activarlo exige que
  no haya reservas y el stock existente queda sin lote, visible y pendiente de
  regularización explícita con motivo; la regularización no mueve el kardex
  físico. Desactivarlo exige que no haya stock ni reservas por lote.
- Con control de lote, el writer único reparte cada movimiento entre saldos
  por lote y ubicación y deja el detalle en un ledger por lote. Por almacén,
  la suma por lote nunca supera el físico y lo reservado por lote coincide con
  lo reservado. El stock sin lote no se reserva ni despacha. Los productos sin
  política conservan el comportamiento previo.
- Recepción y ajuste manual exigen lote. Reservas y salidas sin lote indicado
  eligen FEFO entre lotes vigentes con la vida útil mínima medida contra la
  entrega programada del contrato (o hoy). Ajustes, transferencias y
  devoluciones pueden mover lotes vencidos. El despacho libera y descuenta
  exactamente los lotes reservados por el pedido; anulaciones, RMA,
  transferencias y notas de crédito con un único lote de origen vuelven a ese
  lote, y lo no atribuible queda sin lote. Una liberación sin documento de
  referencia se rechaza.
- La reserva de un pedido puede reasignarse o dividirse entre lotes con
  motivo, conservando la cantidad. `/dashboard/inventario/lotes` muestra
  saldos, reservas por documento, stock sin lote, kardex por lote y lotes por
  vencer. Permisos `inventario.lotes.read` y `inventario.lotes.manage`.

Código principal: `apps/erp-api/src/modules/inventario`,
`apps/erp-api/src/modules/logistica`.

## Finanzas y tesorería

CxC conserva en listado e historial el número original de los saldos de apertura
importados, también alfanumérico. Esta variante exige el origen canónico
`migracion.apertura`, el identificador externo y sus metadatos de importación.
Los documentos ordinarios conservan la validación de consecutivo positivo;
empresa, cliente, moneda, importes y pagos siguen validándose íntegramente.
El estado canónico `VENCIDA` se presenta como `VENCIDO` en el modelo de la UI.
El filtro de vencidas consulta ambas variantes; SQL conserva su estado original
y los estados desconocidos siguen invalidando la respuesta completa.

- Reprogramación ynota CxC conservan intención originalv1 por empresa/actor/
  cuenta/acción antes del POST,con lectura confirmada. Panel recupera cuerpo,
  clave,país ycuenta congelados tras cierre/recarga/navegación/reinicio,sin autoenvío
  ni depender de lista actual. Sólo recibo correlacionado al ledger retira original;
  nota confirma borrador neutral,sin reducción previa a aceptación fiscal.
  Almacenamiento corrupto/no disponible bloquea alta yconserva original;fallos
  de lectura/escritura/readback/retiro probados. WebLock impide doble envío entre
  pestañas web;concurrencia nativa usa iframe/handlers,sin probar dos ventanas.
  Bloqueo fiscal global conserva original hasta recuperar lectura de país.
  Fecha ISO con hora se canoniza como día civil antes de RPC;calendario inválido
  falla antes del writer.234pasos web/Windows incluidos ambos originales tras
  reinicio;106contratos,API4.952/369,SQL80/Rust40por huella. POST controlados;
  no nuevo ajuste real ni aceptación fiscal. `cxc-adjustment-durable-context-postconditions.json`.

- Cobro CxC conserva una solicitud original v1 por empresa/actor/cuenta antes
  del POST y confirma su lectura local. Error mantiene cuerpo/clave; recuperación
  manual desde panel tras cierre/recarga/navegación/reinicio, aun con lista o
  catálogo actual fallido. Campos congelados y WebLock por cuenta impiden otro
  envío simultáneo. Almacenamiento corrupto/no disponible bloquea el alta sin
  reemplazarlo; sólo un recibo ligado retira el pendiente original. Medios
  EFECTIVO/TRANSFERENCIA/CHEQUE/TARJETA siguen el writer, sin catálogo POS.
  Bancos nuevos exigen catálogo completo en vivo, conteo exacto, IDs únicos,
  empresa/actividad/moneda válidas; fallo ofrece reintento. El pendiente bancario
  usa su cuerpo original, sin cambiarlo por opciones presentes.222pasos web/
  Windows (incluido reinicio y regresión de lecturas),66contratos/98recibos,
  más4pasos de recuperación del arnés. Dos pestañas web; concurrencia nativa
  comprobada con iframe y handlers UI, sin acreditar dos ventanas Windows;
  API4.899/368. Todos los POST de cobro controlados; no nuevo pago real.
  `cxc-collection-durable-context-postconditions.json`: alcance local acotado;
  otras operaciones/variantes y aceptación externa siguen pendientes.

- Cobro CxC: éxito sólo con recibo en vivo que vincule empresa, actor, cuenta,
  cliente, moneda, importe, fecha y clave al pago y al movimiento de caja o
  banco mediante IDs/fingerprint. Vacío/parcial/caché/cola no cierra el formulario
  ni anuncia éxito; conserva datos/clave para reintento dentro del formulario.
  Bloqueo síncrono contra doble submit y callbacks retirados al navegar; exceso
  de un centavo bloqueado.68pasos web/Windows con POST interceptados,98contratos
  y13recibos históricos de sólo lectura. Sin nuevo pago ni replay empresarial.
  La cola genérica JS/Rust rechaza cobros y su reenvío automático; lectura legacy
  conserva cuerpo/clave. Dos entradas de prueba detectadas antes de la corrección
  quedaron respaldadas y retiradas por UI; sus dos registros de cache conservan
  los datos con baja lógica.39Rust yregresión offline,11colasSQLite0 finales.
  `cxc-collection-receipt-postconditions.json`: recibo yexclusión de cola.
  Persistencia ycatálogos de cobro se verifican en
  `cxc-collection-durable-context-postconditions.json`; otros contextos siguen acotados.

- La lista CxC y su historial requieren una respuesta completa en vivo y de la
  empresa solicitada. Validan identidad, importes, fechas, clientes y todos los
  bloques paginados antes de mostrar, habilitar acciones o exportar. Un fallo,
  caché o fila ajena retira datos anteriores; el historial ofrece reintento y
  nunca convierte una respuesta parcial en cero o ausencia de cobros. Saldos
  nominales por moneda; documento de cliente legado nulo/numérico permitido
  explícitamente. Cambio de empresa, actor o filtro invalida lecturas previas.
  194 pasos web/Windows y 65 controles compilados; CxC14/CxP20, doce CSV (dos
  fixtures de moneda), paginación controlada51, lectores403/empresa secundaria
  vacía y regreso OWNER. Fuentes de negocio/archivo/11colasSQLite0 intactos.
  `cxc-live-reads-postconditions.json`: no acredita contextos de writer ni
  snapshot transaccional de fuentes cambiantes con igual cardinalidad.

- Refresco de sólo lectura tras delta auditado: 182 pasos web/Windows para cinco
  reportes financieros y diez vistas contables, impuestos de octubre de 2026,
  anual 2025 y anual 2026 explícito. Datos de deuda, bancos y proyección cotejados
  con SQL; errores 503/incompletos/red no permiten imprimir datos anteriores.
  Libros/tributos ocultan acciones obsoletas y recuperan filtros/ajustes
  guardados sin versiones nuevas. Seis Excel/seis PDF (doce páginas revisadas,
  Windows idéntico a web) y cinco PLE por cliente: 124 asientos, 329 líneas,
  debe/haber S/ 91.076,55, 35 cuentas, 17 compras y 23 ventas. Cero escrituras
  empresariales, refrescos materializados o cambios de fuentes; época auditada
  y dos registros privados de abandono intactos.
  `audited-current-finance-books-exports-postconditions.json`: alcance acotado.
  Contextos adicionales, SIRE/RCE/RVIE y otras variantes mantienen casos
  propios; sin PVS/SUNAT ni aceptación global.

- CxC y CxP gestionan saldo, vencimiento, pagos y estados.
- Las consultas de CxP, bancos y tesorería responden 503 cuando no pueden leer,
  nunca 400. Editar o anular una CxP inexistente o de otra empresa responde 404;
  una regla del writer (pagada, anulada, con pagos) responde 400. El pago en
  lote se aplica una vez por llave y rechaza el exceso sin tocar la deuda.
- El alta de factura de proveedor conserva destino del crédito fiscal, código
  de detracción y tipo de cambio de origen dentro de la transacción de deuda y
  outbox. Repetir la misma intención devuelve la factura existente; cambiar
  importes o contexto fiscal devuelve conflicto. Las elecciones históricas
  perdidas no se reconstruyen ni se sobrescriben mediante un reintento.
- El alta de proveedor conserva una intención v1 por empresa/actor antes del
  POST. Recarga, Volver yreinicio real del escritorio restauran el mismo cuerpo
  congelado; el envío se reintenta manualmente yse elimina sólo con recibo
  completo ybytes coincidentes. Corrupción yfallos del almacenamiento bloquean
  el alta ypreservan datos; cambio de sesión/empresa no revela ni envía la
  intención ajena. POST colecciónCxP no entra en la cola genérica por endpoint
  oURL, tanto en TS como Rust. Ciclo7/corrupción11/fallos6/race5/offline4/Volver5/
  recibos99/catálogos33/roles7/intenciónconroles7 por interfaz; reinicio2+3,
  42checks yRust11. Fixtures interceptados, cero nuevo writer y corte141 exacto.
  Pendientes: variantes empresariales,desconexión física,NC/servicio, cambio de
  sesión mientras POST retenido yconciliación/abandono de un alta rechazada.
- El recibo de alta de proveedor debe confirmar empresa, actor, proveedor,
  orden/recepción, documento, fechas, importes, cambio, contexto fiscal y evento/
  clave/huella coherentes. ID aislado, scope ajeno, importes distintos y caché/
  encolado no confirman el alta. La UI conserva campos y muestra error; durante
  el envío congela el formulario y al salir invalida el callback tardío.
  49 negativos/reintentos,99 pasos por interfaz y55checks técnicos: POST
  interceptados sin llegar al servidor, recuperación con GET real del documento
  existente. No son una nueva factura ni replay empresarial. Volver3 controles,
  catálogos33 yroles7 por interfaz,reinicio2PASS,corte141 exacto y ocho colas0.
  El acuse tardío P1 se reprodujo web; la corrección se verificó en ambos clientes.
  Cambio real de sesión con POST retenido, intención durable,cola real y variantes
  de writer/NC permanecen pendientes; reportes141 sólo reutilizados por huella.
- La nota de crédito recibida exige su comprobante original. Si corresponde a
  una devolución emitida, sólo documenta el ajuste ya aplicado a stock, deuda
  y contabilidad. Si es descuento o anulación, reduce la compra y la deuda una
  vez, con contrapartida contable explícita; el exceso sobre la deuda pendiente
  queda como crédito del proveedor. La UI permite aplicarlo a otra factura del
  mismo proveedor y moneda o registrar un reembolso bancario real. Las
  operaciones bloquean los saldos, conservan actor e intención y publican su
  contabilidad en el mismo commit; una NC nunca crea otra deuda positiva.
- RCE, PLE 8.1 e impuestos mensuales conservan los importes originales de la
  factura y anotan la NC separada con signo negativo. La cancelación de la
  obligación por devolución o NC no elimina el comprobante original. El legado
  ajustado sólo se reconstruye con su evento original y cadena comprobable de
  ajustes; sin esa evidencia se exige reconciliación y se bloquea la generación.
- El pago parcial bancario conserva la moneda e importe original de la deuda
  y su tipo de cambio documental; la liquidación registra la diferencia
  realizada por separado. Caso local: factura USD 4.00 a TC 4.00, primer pago
  Windows USD 2.00 a 3.75 con ganancia PEN 0.50 y segundo web USD 2.00 a 4.25
  con pérdida PEN 0.50. Deuda pasó 4→2→0, banco USD 8.20→6.20→4.20;
  dos cargos y dos asientos únicos, estado final PAGADA. La tasa manual nueva
  se corrigió y desactivó desde UI, sin alterar tasas ni pagos históricos.
  La factura manual contabiliza mercaderías 13.56 e IGV 2.44, sin movimiento
  físico. Corte 136: cinco vistas y siete ratios contrastados contra diario
  crudo por interfaz; seis Excel/seis PDF/doce páginas revisadas y cinco PLE
  actuales descargados web. IGV por pagar 0 / saldo a favor 0.52, renta 10.51
  y resultado anual -12868.59; versiones tributarias 5/4 sin reescribir.
  El cálculo mensual toma ventas y otros ingresos manuales revisados; la
  ganancia cambiaria del diario no se incorpora automáticamente a esa base.
  Lectores 403/segunda empresa vacía/regreso OWNER en cinco reportes por
  interfaz, sin nuevos pagos. Es evidencia local de este caso, sin SUNAT/PVS.
- El detalle CxP exige lectura viva de cuenta/empresa, proveedor, moneda,
  estado, fechas e importes. Su historial exige también empresa/cuenta/moneda,
  conteos exactos de banco y efectivo, fuentes completas y filas únicas ligadas.
  Ambas fuentes recorren páginas de 1.000, verificando conteo e identidad antes
  de confirmar. Un error de lectura es 503; sólo cuenta ausente confirmada es 404.
  Datos parciales/ajenos/cacheados retiran tabla y total; ofrecen reintento sin
  inventar ausencia de pagos. Aplicar Pago requiere historial completo actual;
  recuperarlo no abre el modal. Respuestas retiradas no cambian otra cuenta.
  144 pasos web/Windows: 47 negativos/recuperación y 25 de 20 cuentas/roles por cliente.
  IDs actuales coinciden con SQL readonly; facturas/NC, PEN/USD y pagoEFECTIVO
  histórico preservados; lectores 403, empresa secundaria 404 y regreso OWNER verificados.
  60 contratos, 93 pruebas dirigidas y API 5.012/370; otros 23 métodos intactos.
  No pagos nuevos, snapshot transaccional ni aceptación de todos los writers.
  `cxp-history-source-postconditions.json` conserva el alcance y los fallos del arnés.

- Un abono parcial de una factura vencida mantiene VENCIDA según el trigger131.
  Su recibo completo permite confirmar el pago cuando el saldo es positivo y
  menor al total; VENCIDA no equivale a pago sin aplicar. Caso local: apertura
  PEN100, pago EFECTIVO PEN0,10 desde Windows con ACK perdido, reinicio real,
  recuperación idempotente del mismo pago y cierre PEN99,90. Saldo23,50;
  un pago APLICADO, un retiro−0,10, un asiento y un corte, sin repetir writers.
  El primer recibo bloqueado y los fallos del arnés se conservan. Cierre201
  confirmado por UI/DB readonly tras timeout del matcher/backend; no se
  capturaron su cuerpo ni reciboJSON. Historial de efectivo y permisos reales
  pasan seis pasos por interfaz; regresión18/16 y reportes/PLE/tributos137.
  Contabilidad sin banco conserva10 genérica: D42/H10 por0,10; el saldo
  acreedor se presenta en OtrosPasivos. Desglose por caja operativa pendiente,
  sin modificar asientos históricos. Cierre sin diferencia no añade otroGL.
- Aplicar Pago conserva una intención durable por cuenta, empresa y actor:
  cuerpo y clave se guardan antes del envío; los campos quedan congelados
  mientras no exista confirmación completa. Cancelar, reabrir, recargar,
  navegar o reiniciar permite Reintentar pago pendiente con los mismos datos,
  sin reintento automático ni una nueva clave. PagoCxP bloquea cola genérica en frontend e IPC nativo; perder red conserva sólo la intención del formulario. Se exige recibo en vivo de
  deuda/pago/movimiento/actor/importes/fecha/método/cuenta/huella coherentes.
  Revisar pago pendiente permite recuperar un resultado aun con saldo0;
  una intención dañada o ajena bloquea otra escritura y se conserva.
  Caso local:18recovery/16almacenamiento roles porinterfaz, lectores403/
  empresa2real404/regresoOWNER y reinicio real Windows2/3pasos, cero pagos
  nuevos. El positivoEFECTIVO conACKreal se mantiene pendiente;80contratos
  técnicos sobre dos recibos históricos no sustituyen su recorrido funcional.
- El total pagado de CxP se obtiene de pagos confirmados de banco o caja;
  aplicar una NC, devolver mercadería o reclasificar impuestos no cuenta como
  un pago realizado al proveedor.
  El backend dispone de lectura explícita del historial de pagos de caja en
  una reconstrucción completa (583). Si falla la consulta, la interfaz muestra
  el historial como no disponible y permite reintentar; no lo representa como
  cero pagado. La conciliación bancaria es un estado separado del pago aplicado.
  Aplicaciones y reembolsos de crédito conservan la intención mientras se
  reintenta el mismo contenido; cambiar el contenido inicia otra intención.
- Registrar cobros, aplicar notas y reprogramar una CxC exige
  `finanzas.cxc.cobros.write`; emitir CPE es una capacidad fiscal separada y no
  autoriza por sí sola acciones de cobranza.
- Un CPE directo Perú al contado crea su CxC si se selecciona un cliente
  maestro. Conserva la forma fiscal `CONTADO`, vence el día de emisión y
  permanece por cobrar hasta registrar un cobro real desde Finanzas. No se
  presume efectivo recibido por firmar el XML. El centro CPE muestra el saldo
  y abre la cobranza del documento. Un receptor ingresado manualmente queda
  visible como pendiente de vincular: el usuario selecciona un maestro con el
  mismo documento y tipo, y el writer 583 crea la deuda contra el asiento
  original confirmado, sin otra venta, CPE ni outbox. Exige permiso de cobranza,
  actor y tenant activos, comprobante directo vigente sin notas y una intención
  durable. Reintentar después de un cobro devuelve el comprobante original
  con su CxC actual; no compara la deuda pagada contra su saldo inicial ni
  sobrescribe el XML firmado. La vinculación no cambia la identidad histórica.
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
- Los movimientos bancarios nuevos se crean activos por defecto; una
  inactivación explícita conserva su estado. Los registros históricos no se
  reactivan automáticamente, pues el valor anterior no distingue por sí solo
  una inactivación intencional del antiguo valor predeterminado.
- Cada cuenta bancaria debe mapear una cuenta contable de movimiento. Un
  movimiento manual exige moneda, categoría, contracuenta, actor e intención
  idempotente; movimiento, tres saldos y outbox contable se confirman en una
  sola transacción. Las transferencias internas crean un par cargo/abono
  inseparable, bloqueando ambas cuentas en orden estable.
- La configuración peruana provisiona 6391 (Gastos bancarios) para registrar
  comisiones por servicios bancarios desde la UI. Conserva cualquier cuenta
  6391 existente, incluyendo su configuración y estado. La clasificación
  corresponde al [PCGE del MEF](https://mef.gob.pe/contenidos/conta_publ/pcge/PCGE_2019.pdf);
  los intereses de financiamiento se registran con su contracuenta propia.
- El CSV bancario conserva la fecha documental del movimiento y usa la zona
  del país para la hora de registro. Todas las celdas escapan comillas y
  separadores; las fórmulas de hoja de cálculo se neutralizan también en
  descripciones, referencias y nombres. Los filtros de conciliación se conservan.
  El historial de la cuenta y su CSV muestran sólo movimientos del sistema;
  las filas de extracto se consultan en conciliación y no duplican la tesorería.
- La conciliación opera por RPCs reservadas al servicio: período mensual único,
  importación CSV como lote atómico con saldos inicial/final comprobables,
  match exacto manual/automático/por lote y cierre sin excepción forzada. Toda
  diferencia se resuelve antes mediante un ajuste bancario explícito con
  contracuenta y outbox; un período cerrado y sus movimientos son inmutables,
  incluso frente a escrituras tardías sin `conciliacion_id`.
  Las lecturas fallidas de movimientos o extracto se distinguen de listas vacías:
  la vista y el match manual bloquean la operación y permiten reintentar ambas
  fuentes. Un ACK perdido del match conserva selección e intención para retry.
  La vista previa y el servidor conservan registros con comas, comillas
  escapadas y saltos de línea dentro de campos. Un registro con cargo y abono
  separados produce ambos movimientos; comillas sin cerrar bloquean el lote.
- Cobranzas y pagos por lote requieren referencias idempotentes.
- La pantalla de ajustes fiscales conserva campos e intención hasta recibir éxito. Ante una respuesta perdida de anticipo, ajuste o depósito muestra el error y permite recuperar la misma operación; captura el rechazo de la petición sin duplicar banco/deuda.
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
- La UI puede revertir una detracción de proveedor aún no depositada, con
  fecha, motivo e intención idempotente: restaura deuda, marca la operación
  `ANULADO` y publica `cxp.ajuste.revertido` (Dr 421 / Cr 42), sin banco. Una NC
  exige resolver esa detracción pendiente primero. Retenciones, percepciones
  y depósitos efectuados permanecen registrados; recibir una NC no simula su
  devolución ni cancela comprobantes tributarios ya efectuados.
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
- Lista CxP consulta todas las páginas y valida documentos, proveedor, fechas,
  moneda, saldos y paginación antes de mostrar filas/métricas o habilitar CSV.
  Carga/error retiran datos anteriores, conservan filtros y ofrecen Reintentar;
  respuestas tardías de otros filtros se descartan. Proveedores y Vencimientos
  tienen errores persistentes y reintento por sección; el catálogo ausente bloquea
  el selector, mientras un listado válido puede seguir visible. Vencimientos
  conserva los días calculados por el backend y separa sus totales por moneda;
  los indicadores de saldo pendiente/vencido tampoco suman nominalmente divisas.
- Lista CxP, Aging inline y los cinco reportes financieros exigen respuesta en
  vivo: una respuesta recuperada de caché ante pérdida de red se rechaza antes de
  presentar datos actuales o habilitar CSV/impresión. Ofrecen error/retry con los
  filtros conservados; esta opción no cambia el comportamiento por defecto de
  consultas de otros módulos.
- Las cinco vistas de reportes financieros exigen respuestas completas y
  válidas antes de habilitar impresión. Carga/error retiran los datos anteriores,
  distinguen fallo de vacío real y ofrecen Reintentar; las respuestas de consultas
  reemplazadas o vistas desmontadas se descartan. Las restricciones de lectura
  no permiten recuperar un reporte previo de otro actor o empresa desde caché.
- Aging agrupa el detalle documental por moneda antes de presentar rangos y
  totales. Ranking valida `data.proveedores` junto con el detalle Aging y la deuda
  por moneda; aplica límite después de seleccionar moneda, sin sumar nominalmente
  PEN y USD. Las fechas/estados documentales conservan la autoridad del backend.
  Aging dentro deCxP usa el mismo contrato y conserva el proveedor al reintentar.
  El corte local116 verificó obligaciones positivasPEN31–60/61–90/+90 por
  1.18/2.36/3.54 yUSDvencida1.18, además delPEN0–30 previamente verificado.
  PendientePEN48.38/USD7.08 y vencidoPEN30.68/USD1.18 se presentan separados;
  las cuatro nuevas altas no modificaron obligaciones, pagos, stock ni banco
  anteriores. Evidencia: `finance-range-income-postconditions.json`.
- Movimientos del reporte recorre todas las páginas con `es_extracto=false`,
  valida identidad y paginación, y resuelve moneda/nombre/banco desde la cuenta.
  Una página incompleta rechaza el conjunto. Los filtros de tipo/conciliado y
  subtotales por moneda se aplican al conjunto completo; se conservan al reintentar.
- Conciliaciones pendientes utiliza `estadisticas` y la relación de cuenta que
  entrega la API. El avance usa pares conciliados frente al mayor conjunto;
  el contador de items muestra la suma de filas de sistema y extracto conciliadas.
  Flujo de caja valida período/cuentas/resumen/proyección/estadísticas y conserva
  moneda al recuperar una lectura; un período sin vencimientos no implica una
  fila proyectada por cada día del calendario.
  Una consulta fallida de CxC tampoco equivale a cero ingresos: la API rechaza
  la proyección completa con503, igual que ante fallo de CxP o bancos. Error de
  base, transporte o datos CxC ausentes nunca producen un reporte200 imprimible;
  el reintento vuelve a consultar las fuentes vigentes.
  La vista semanal agrupa fechas calendario en tramos de siete días desde el
  inicio del período; no agrupa cada siete filas de eventos. Muestra sólo semanas
  con eventos, conservando su número calendario y límites recortados al período;
  ordena fechas y suma ingresos/egresos/neto en centavos, con saldo del último día.
  Un servicioCPE local a crédito generóCxC4.72 con vencimiento15oct y verificó
  ingreso positivoPEN junto con pago11.80 del mismo día: neto-7.08, semanas1/4
  y saldo proyectado25215.05. USD conserva su resumen separado2.30. El contrato
  `total_movimientos` cuenta gruposfecha/moneda:3grupos con4documentos en este
  caso. `CpeModal` paraPerú ofrece sóloPEN; no se acredita alta de ingresosUSD
  desde ese formulario. Web/nativo, dos lectores403, empresa2vacía, CSV13filas y
  seisPDF/oncepáginas quedaron cotejados; no impresoraSO ni descargas nativas.
  Las vistas directas `/finanzas/tesoreria` y `/finanzas/tesoreria/flujo-caja`
  exigen contratos completos y lecturas en vivo. El dashboard valida bancos,
  programación y flujo como conjunto antes de publicar métricas; un fallo de
  cualquiera retira el conjunto y permite Reintentar. No normaliza respuestas
  incompletas como vacío ni conserva el corte anterior tras503. Las generaciones
  descartan consultas reemplazadas y preservan filtros al recuperar. Los tresP1
  se reprodujeron y corrigieron;55pasos web y55del nuevo debug incluyen lectores403
  y empresa2vacía (`treasury-direct-postconditions.json`), sin escrituras.
- Programación exige documentos/proveedores/importes/paginación completos en
  vivo; carga o error retiran filas, totales, selección y acciones. Reintentar
  conserva filtros; consultas reemplazadas no publican respuestas antiguas.
  Los totales visibles corresponden a la página y filtro de urgencia mostrado.
  Pago Masivo valida bancos y todas las páginas de obligaciones conjuntamente,
  incluye vencidas y conserva los documentos seleccionados desde Programación.
  Una página faltante impide publicar el lote. No presenta errores como ausencia
  de deuda. Volumen101 se verificó con dobles del contrato, sin101facturas porUI.
  Importes no positivos, superiores al saldo o con más de dos decimales impiden
  Confirmar; volver conserva selección e importes y cambiar banco retira deudas
  de otra moneda. El writer conserva clave para la misma intención; el resultado
  exige confirmación real del banco/lote/importes, sin éxito ni cola local nueva.
  Los saldos anteriores/nuevos de cada respuesta452 son **bancarios** y pueden
  llegar como decimales textuales: se validan y presentan con esa semántica.
  Se muestra la referencia comercial del lote; ACK perdido reintenta la misma
  clave y confirma el resultado ya registrado. El corte126 verificó dos facturas
  PEN2.36/3.54, tres lotes y cuatro cargos5.90, banco21233.13, sin duplicados.
  El primer pago real cuyo resultado visual falló se conservó y verificó por
  lectura; no se repitió. Evidencia `treasury-batch-postconditions.json`.
- Imprimir/PDF de Finanzas usa el reporte completo vigente, oculta navegación
  y acciones, presenta texto negro y repite cabeceras bancarias sin cortar filas.
  Conserva cada bloque semanal y tarjeta de proveedor completos en una página
  cuando caben, incluyendo título/fechas/importes o advertencias de vencimiento.
  La acción abre la impresión del navegador; no equivale a una descarga propia
  ni a confirmación de una impresora o presentación tributaria.
- La ruta raíz de Finanzas funciona como centro operativo y enlaza CxC, CxP,
  bancos, tesorería, conciliación y reportes; no debe renderizar una superficie
  vacía ni depender de una redirección cliente.

Código principal: `apps/erp-api/src/modules/finanzas`,
`apps/erp-api/src/modules/retenciones`, `apps/erp-api/src/modules/cajas`.

## Contabilidad

- El listado de asientos carga todas las páginas antes de aplicar sus filtros
  locales y mostrar estadísticas. Una página fallida o cacheada no se presenta
  como catálogo completo; cambiar de empresa o sesión descarta lecturas anteriores.
La estimación usa el RPC583 controlado del backend. Verifica actor activo con
permiso, empresa, período abierto y criterio entero; bloquea el período y los
saldos elegibles. SQL509 conserva su definición y ACL anteriores. Sólo el
nuevo RPC concede EXECUTE a service_role; tablas/RLS/policies permanecen
exactos y no hay backfill ni operación remota. Se rechaza atómicamente deuda
noPEN porque no está definida una conversión de sus importes nominales.

Una intención v1 privada por empresa/actor conserva período, criterio y clave
antes delPOST y verifica sus bytes. Recarga/Volver no envían automáticamente;
recuperación manual reutiliza la misma identidad. Recibo completo vivo exige
tenant/actor/período/clave/payload/operationID, cero coherente o
asientoCONFIRMADO68Dr/19Cr con dos líneas y detalle de documentos cuya suma
coincide. Flags/cache/cola, incompletitud, storage/corrupción y cambios
concurrentes conservan datos y bloquean falso éxito; scope/epoch/permisos
descartan confirmaciones tardías. Fingerprint se contrasta porforma y
ledgerreadonly, no se recalcula criptográficamente encliente.

El ledger guarda el resultado original, incluso el cero, con
actor/criterio/clave. Replay devuelve esa fotografía con idempotent=true, sin
recalcular elegibilidad; puede confirmar un resultado previo aunque después se
cierre el período. Prueba realWindows: una estimación de tres documentos
PEN7.08 a corte31oct2026/criterio1día, unGL68/19,
doslíneas/tresprovisiones/unledger. ACK503 después delcommit, reinicio real
del mismo binario/perfil y reintentoUI con la misma clave recuperaron el
recibo original. No repetir esta provisión ni alta/cierre/reapertura de
los14períodos anteriores.

Corte153GL confirmados/155filas totales,14períodos exactos,
bancosPEN20184.70/USD4.20 y otras fuentes sin cambios. Reportesweb/nativo y
seisPDF/seisXLS actualizados,12páginasrevisadas. Resultado
acumuladoOct−12879.42/activo21978.89; anual−14187.42/activo20934.89;
balancecuadra yambos bajan7.08.
PLEOct123asientos/327líneas/35cuentas,Debe=Haber91076.29,17compras/23ventas;
archivosweb/nativo idénticos. Historia152 y operaciones previas preservadas.
P2evaluado: continuaciónpágina3 balancecomprobación con margen superior
estrecho/sin encabezadorepetido, importeslegibles; mejora registrada sin
afirmar impresión física.

Los contratos previos de días/cero y presentación de transiciones pendientes
permanecen cubiertos en
`period-provision-receipt-controls-postconditions.json` y
`period-pending-snapshot-p2-resolution.json`; sus fixtures no se confunden con
la estimación real actual. Durabilidad ypositivoPEN se acreditan en
`period-provision-operation-postconditions.json`; otras variantes y
**NO_GOglobal** continúan pendientes.

Cierre y reapertura conservan una intención privada por empresa, actor,
período y acción, con fotografía completa persistida y verificada antes del
envío. La recuperación manual consulta el período en vivo: si está en el
estado objetivo, exige el recibo completo con actor/tiempo/metadatos previstos
y retira la intención sin repetir el POST. Si conserva el estado anterior,
exige la misma fotografía y un nuevo preflight elegible para cerrar. Cambios
concurrentes, corrupción, caché/cola, fallos de almacenamiento o red conservan
datos y bloquean una nueva transición.

La reapertura cierra el diálogo de confirmación al terminar el intento. Si el
servidor lo rechaza, la página muestra su error junto al período y conserva el
control de recuperación de la intención original; no habilita otro envío.

El cierre exige CERRADO, fecha civil y actor en columnas/metadatos, cerrado_en
equivalente a updated_at, siguiente cierre_sequence y cierre_asiento_id.
Reapertura exige ABIERTO, columnas de cierre vacías y reabierto_por/en
coherentes, conservando metadatos históricos. Sólo se confirma después de
verificar el retiro de los mismos bytes. Permisos y guards de
epoch/scope/inflight evitan envíos o confirmaciones tardías;
POSTcerrar/reabrir no entra en cola por endpoint/URL/aliases ni entrada
pública, sin purgar historia.

El P2 de fotografía pendiente fue evaluado en `period-transition-pending-snapshot-p2-evaluation.json` y corregido después confixtures en `period-pending-snapshot-p2-resolution.json`, sin repetir transiciones reales.

Validación real del período nuevo2024-11: un cierre OWNER y una reapertura
SUPER201; ACK503 posteriores, dos reinicios reales mismo perfil, dos
recuperaciones manuales porGET sin segundoPOST. Trece períodos
previos/152GL/bancos/otras fuentes exactos. No ledger/audit_log de transición
por contrato458/557/570; actor y secuencia acreditados en metadata. Sólo
selección real de Empresa activa delSUPER añade auditorías exactas
user_sessions; once scopes nativos con colas vacías, diez anteriores
preservados. Ver `period-transition-operation-postconditions.json`.
RPCsinclave no acredita asociación criptográfica ni idempotencia
global/concurrencia múltiple. Estimación y otras variantes siguen pendientes;
NO_GO global.



La creación de período exige permiso real y una intención privada por empresa
y actor: año, mes, fecha y clave única se persisten y verifican antes del
POST. Recarga y regreso recuperan sus datos sin envío automático. El reintento
conserva cuerpo y clave; corrupción y fallos de almacenamiento o cambios
concurrentes bloquean reemplazo. El recibo debe ser vivo y completo, con trece
campos, empresa/año/mes/código válidos, ABIERTO, creador solicitado y
fechas/cierre coherentes. Sólo después de confirmar y verificar el retiro de
los mismos bytes se navega.

El formulario se desmonta al cambiar de empresa/actor y oculta controles a
lectores. Guards de permiso, epoch y solicitud en curso impiden envíos
duplicados o confirmaciones tardías tras salir. POSTcolección de períodos
requiere conexión y no entra en cola por endpoint, URL ni aliases; tampoco se
purga historia.

Creación real única2024-11: commit201 desde UIWindows, ACK503 inducido
después, reinicio real mismo perfil y reintentoUI201 con idénticos datos. Una
fila y una operación482 con actor/recibo; trece originales y otras fuentes
intactos. El servidor no devuelve clave/operationID/idempotent; unicidad
corroborada readonly en financial_master_operations, sin asociación
criptográfica ni eco inventados. Períodos no tienen trigger audit_log: otras
auditorías se preservan exactamente. Ver
`period-create-operation-postconditions.json`. Cierre/reapertura/estimación y
otras variantes siguen pendientes; NO_GO global.



El catálogo y el detalle de períodos publican sólo respuestas vivas y
completas: trece campos públicos, empresa e ID exactos, calendario, estado y
fechas válidos, recibo de cierre coherente e identidades y meses únicos.
`fecha_cierre` se valida como fecha civil de PostgreSQL, y `created_at` y
`updated_at` como marcas de tiempo. Un fallo 503, 403, incompletitud,
inconsistencia, caché o cola retira filas, cifras y acciones y permite
reintentar. Un catálogo realmente vacío se muestra distinto. Crear, Cerrar y
Estimar respetan sus permisos. Cerrar exige validar y cerrar; Reabrir exige su
permiso y un superadministrador real. OWNER ordinario no ofrece reapertura.

El preflight comprueba seis condiciones, cantidades y períodos anteriores del
mismo año, abiertos, anteriores al mes y sin identidades repetidas. Booleanos
true con períodos anteriores abiertos no habilitan el cierre. SQL puede
devolver una cantidad de asientos inválidos mayor que cero con una lista de
detalles vacía: es un bloqueo válido, sin inventar detalles. El cuerpo de
SQL583 no incluye ID ni empresa; se comprueba la asociación de consulta,
epoch, sesión y período y su consistencia, sin afirmar una identidad ausente.
El cierre revalida en SQL. GET y HEAD de validación de cierre requieren
conexión en vivo y no entran en la cola de validaciones externas, tampoco por
la API pública de encolado. No se purgan colas históricas.

Fase local de lectura: 79 pasos web y 79 nativos, 110 checks, 18 regresiones y
suite offline con dobles, 1.705 fuentes, build, tipos, lint, export de 136
páginas y nuevo escritorio debug. API: 3.535 pruebas y 331 suites; Rust: 23;
SQL: 80, por huellas exactas. Los trece períodos abiertos completos,
metadatos, fechas, 152 asientos, bancos y maestros permanecen intactos; cero
escritores nuevos. Los positivos CERRADO, BLOQUEADO y elegible se probaron
sólo con fixtures GET interceptados antes de la API. Dos lectores con 403,
segunda empresa vacía y detalle principal con 404 se comprobaron realmente;
OWNER quedó restaurado. Las consultas retenidas retiran snapshots; respuestas
tardías de lista tras SPA y de preflight tras Atrás no publican. Ver
`period-live-read-controls-postconditions.json`. Siguen pendientes recibos e
intención durable de escritores de período y estimación, así como otras
variantes. NO_GO global.



- Plan de cuentas, períodos, centros de costo y presupuestos son catálogos
  tenant-scoped.
- El alta de asientos manuales exige crear explícitamente el período desde
  `Contabilidad > Periodos` y que esté `ABIERTO`. Si falta, el formulario
  conserva los datos y presenta el motivo del rechazo con acceso a períodos
  en otra pestaña. Los writers operativos que usan la barrera SQL 458 pueden
  crear el período abierto de forma idempotente; nunca eluden un cierre o
  bloqueo existente ni trabajan bajo un período abierto invisible.
- Reabrir un período requiere superadministrador tanto en servidor como en
  la acción disponible en pantalla. Un rechazo de reapertura conserva el
  detalle y su estado cerrado, mostrando el motivo sin aparentar éxito.
- El asistente de cierre consulta la misma función de condiciones que el
  writer: estado abierto, períodos anteriores del año cerrados, ausencia de
  borradores, detalle confirmado balanceado y eventos contables procesados por
  fecha de negocio. Un fallo de lectura bloquea el cierre y permite reintentar.
- El catálogo inicial Perú incluye 89 y 59 para el cierre anual. El alta y
  configuración completan sólo códigos ausentes, conservando las cuentas
  personalizadas o inactivas. El balance conserva el signo de resultados
  acumulados, incluida una pérdida deudora, y el resultado del nuevo ejercicio
  se calcula por separado. Reabrir anula el asiento de cierre anterior; recerrar
  genera una nueva secuencia sin dos cierres activos.
- El patrimonio operativo incluye los resultados de ejercicios anteriores
  aún sin cierre anual, calculados con las mismas reglas del ER. Cuando existe
  cierre confirmado, su resultado ya está en 59 y no se añade otra vez.
  Reabrir anula ese cierre y recupera el resultado histórico en la proyección;
  consultar el reporte no crea asientos ni cierra períodos.
- Alta de presupuesto: intención privada empresa/actor persiste y verifica
  cuerpo/clave antes delPOST; recarga/Volver no envían y recuperación es manual.
  Recibo completo exige actor/empresa/operationID/clave/payload y fila coherente;
  fallos/caché/cola/storage/corrupción/tardías conservan operación. RPC583
  sólo service_role comprueba permiso/períodoABIERTO, usa SQL480 privado y
  conserva recibo original durable. Replay tras edición/borrado/bloqueo devuelve
  resultado previo, sin volver a crear. Alta excluida de cola genérica navegador
  y Rust. Una alta real3.17 noviembre2026 conACK503/reinicioreal/misma clave
  acreditada; presupuesto anterior1456.78 y153GL exactos. No repetir altas.
  Evidencia `budget-create-operation-postconditions.json`; edición/baja,
  ejecución/reversas y concurrencia global pendientes;NO_GOglobal.
- La edición de presupuesto conserva intención privada yfotografía previa
  antes delPUT, conpermiso canónicoactualizar. Recarga/Volver no autoenvían;
  recibo completo/vivo,identidad,payload ycampos inmutables preceden retiro.
  Error,caché/cola,storage,corrupción,cambio concurrente ytardías conservan
  intención. Lectores403 sinoperaciónOWNER; PUT no entra encola genérica.
  RPC583 sólo service_role exige actor/permisos/períodoABIERTO ycompare de
  fotografía:409 sinledger ni efecto cuando cambió. Ledger devuelve recibo
  original enreplay incluso tras cambios/borrado/bloqueo posteriores.
  SQL480/creación583/ACL/RLS preservados. Una edición realWindows3.17→3.29,
  ACK503/reinicio mismo binario/perfil yreplay manual200/idempotenttrue sin
  otroefecto: histórico1456.78 intacto,dos presupuestos,153GL ybancos exactos.
  44pasosfixture porinterfaz/68contratos,3586API/334,80SQLfresh/restore,
  28Rust/offline12edición,1720fuentes/export136/nuevo debug;11colas0.
  Evidencia `budget-update-operation-postconditions.json`. Baja/ejecución/
  reversas yconciliación/abandono de409 siguen pendientes;NO_GOglobal.
- Alertas de presupuesto permite elegir período o consultar el último abierto.
  Resumen y catálogo vivos identifican empresa, período y cantidad activa;
  fuentes incompletas no confirman vacío, y período ajeno/inexistente es 404.
  No período abierto, cero presupuestos activos y cero alertas son estados
  diferentes. Un filtro vacío conserva las cantidades de la otra categoría y
  no anuncia normalidad global. Error/caché/cola/desmontaje retiran resultados;
  selección previa bloqueada permanece visible mientras se reconsulta.
  Lectores 403, empresa secundaria sin períodos abiertos y reinicio limpio
  real comprobados; 39 pasos web/51 Windows, 33 contratos, API 3606/335 frescos,
  SQL 80/Rust 28/offline por huellas, 1722 fuentes y nuevo debug/export 136.
  Cero writers: presupuestos 1456.78/3.29, 153 GL y bancos exactos, 11 colas 0.
  Evidencia `budget-alert-scope-postconditions.json`; fixtures 95/101 no son
  ejecución empresarial positiva. Reversas/ventana calendario y concurrencia
  global requieren casos propios; NO_GO global.
- Ejecución presupuestal filtra el mes civil del país de la empresa, desde
  medianoche del primer día hasta el primer día siguiente exclusivo. País
  completo se consulta en vivo; error/ausencia/incompletitud es503 antes de
  movimientos. Último milisegundo incluido y meses vecinos excluidos; mismo
  3.33 con hostUTC/Lima/Tokio, septiembreChile con offsets distintos, febrero
  bisiesto y cruce de año comprobados. API3671/337,69 dirigidas, dos presupuestos
  reales readonly y11pasos por interfaz;1730fuentes, SQL80/Rust29/binario/export
  por huellas,11colas0. Cero writers,153GL/bancos/entregaJ exactos.
  `budget-period-calendar-window-postconditions.json`. Neto absoluto/reversas,
  volumen y ejecución empresarial positiva siguen pendientes;NO_GOglobal.
- Ejecución lee todas las páginas de movimientos con conteo exacto estable,
  IDs UUID únicos en orden y centavos verificados. Fallo/incompletitud de una
  página posterior, conteo ausente/cambiante o duplicados no confirman subtotal
  o cero:503. Doce escenarios compilados con0/1000/1001/2001filas enUTC/Lima/
  Tokio y101dirigidas pasan; API3703/338, dos presupuestos reales readonly y
  11pasos por interfaz.1731fuentes, SQL80/Rust29/binario/export136 porhuellas,
  11colas0;153GL,bancos/calendarioK/entregaJ exactos, cero writers.
  `budget-execution-pagination-postconditions.json`. Neto absoluto/reversas,
  positivo empresarial,baja yconcurrencia global mantienen casos propios;
  conteo estable no equivale a snapshot transaccional ante igual cardinalidad.
- Gasto presupuestal suma debe menos haber confirmado y aplica suelo cero al
  neto final verificado; una reversa no se convierte en nuevo consumo por valor
  absoluto. Normalizador vigente, trigger activo y cuenta GASTO contrastados.
  Parcial/completa/excesiva, centavos, filtros y segunda página: 23 pruebas
  nuevas, 124 dirigidas, API3726/339 y cuatro contratos compilados. Un fallo de
  lectura o precisión no confirma cero. Dos presupuestos reales mantienen cero;
  11 pasos por interfaz, 1732 fuentes, SQL80/Rust29/binario/export136 por hashes,
  11 colas vacías y 153 GL/calendarioK/paginaciónL/entregaJ exactos, sin writers.
  `budget-reversal-net-postconditions.json`. Dobles no acreditan reversa nueva
  desde UI, ingresos/naturaleza acreedora o jerarquía de cuentas; positivo
  empresarial, baja y concurrencia global conservan casos propios.
- Positivo real: un único presupuesto mayo36.00 Windows para gasto histórico
  confirmado36.35 (cuenta63/ADM-LIM570), sin nuevos asientos. Alertas scoped y
  comparación:100.97%,disponible-0.35,sobregiroCRITICO0.35. Tres presupuestos;
  históricos1456.78/3.29 y153GL intactos. No repetir alta
  c8b89c53-4ded-4a96-baea-56a5f6089376. Recibo201/intención retirada/un ledger;
  error,reintento ylectores403 enweb/Windows. Evidencia:
  `budget-positive-execution-postconditions.json`. Los hallazgos P1 de vista
  actual yP2 de mensaje/leyenda se corrigieron en la fase siguiente.
- Lista/detalle consultan vistas de ejecución actual readonly con fuente y
  fecha de cálculo obligatorias. Paginación completa,conteo exacto,IDs únicos
  yrelaciones/importes validados;fallo de fuente no confirma cero o subtotal.
  Raw almacenado0 se conserva exclusivamente para la fotografía del writer,
  enlazada porID/empresa/centro/cuenta/período/monto/estado/notas/timestamps.
  Panel actual muestra36.00/36.35/-0.35/100.97% ySobregiro; el formulario
  conserva monto36. Mensaje distingue utilizado100.97% yexcedido0.97%.
  Leyenda ybarras verificadas en tema oscuro,web/Windows.
  39 pasos por interfaz,21checks,37 pruebas nuevas,API3763/340,build/tipos/lint
  y nuevo debug. PUT interceptado antes de API conserva raw0,intención,
  recarga yretiro sólo porrecibo válido;no modifica presupuesto empresarial.
  1734 fuentes,SQL80/Rust29 por hashes,11 colas0 y tres presupuestos/153GL/
  14 períodos exactos. `budget-live-execution-view-postconditions.json`.
  Baja,409,jerarquía,ingresos/reversa empresarial,otras monedas yconcurrencia
  global pendientes. Revisión visual sólo tema oscuro/anchuras probadas.
  NO_GO global;sin nueva escritura de caché ni asientos.
- Resolución explícita de edición pendiente: POST `resolver-edicion` reutiliza
  exactamente cuerpo, clave y fotografía. La RPC service_role, con permisos
  antes y después de esperar el mismo bloqueo que PUT, devuelve el recibo
  confirmado original o registra `ABANDON_UPDATE` durable. Un PUT tardío de
  esa clave queda bloqueado; abandono no revierte una edición ya confirmada.
  Web/Windows validan identidad/payload/recibo vivo completo y archivan antes
  de retirar. Desconocido, error, caché, cola, recibo ajeno/incompleto o fallo
  de almacenamiento conservan intención. La siguiente edición requiere una
  nueva lectura; sin autoenvío ni rebasing del cuerpo pendiente.36 pasos web
  y42 Windows PASS con fixtures antes de API, OWNER/dos lectores, tardías y
  reinicio físico del perfil separado. Dos conexiones SQL aisladas prueban
  ambos órdenes de carrera y un único ledger por clave. Cero escrituras en
  presupuestos cerrados; API3831/342,SQL80/restauración,Rust31 y1739 fuentes.
  `budget-update-resolution-postconditions.json`. Otros actores/escritores y
  múltiples ventanas nativas pendientes; NO_GO global,PROD569 intacto.
- Edición rechazada conserva intención exacta ante409/400/403/503,aborto y
  recibos incompletos oactor ajeno.12 pasos web/20 Windows acreditan recarga
  yreinicio real del mismo debug/perfil sin envío automático; reintento manual
  sólo retira con recibo completo fixture coincidente. Cero edición real,
  tres presupuestos153GL14períodos exactos;11colas0. El cierre fue manual por
  el usuario después de dos rechazos del ejecutor con motivo genérico. La causa
  interna no está expuesta; la sesión separada posterior permite reinicios propios. No acredita conciliación ni
  abandono seguro409. `budget-update-conflict-recovery-postconditions.json`.
- Baja de presupuesto corregida: fotografía raw completa antes deDELETE,
  intención privada persistida/verificada por empresa/actor ymisma clave/cuerpo.
  Sólo recibo completo ligado permite retiro;409/403/503,aborto,caché/cola,
  recibos vacíos/ajenos,fallos de almacenamiento yrespuestas tardías conservan
  datos oimpiden enviar.71pasos web/71Windows,6suites porinterfaz. NuevaRPC583
  bloquea fotografía obsoleta ycongela el recibo para replay aun sinlafila.
  PositivoUI: presupuesto nuevoJun2026 por0.11 creado yeliminado una vez;
  ACK503 posterior alcommit,reinicio físico deWindows separado yreplay200
  idempotenttrue conmisma identidad. Dosledger; trespresupuestos anteriores,
  153GL14períodos yotrasfuentes exactos. TrazaDELETE parcial porKeyError de
  arnés recuperada readonly; no repetirla. Perfil yproceso original intactos.
  `budget-delete-operation-postconditions.json`. Otrosroles/concurrencia y
  reinicio delperfil original no acreditados; NO_GOglobal.
- Baja de presupuesto entre pestañas: un bloqueo exclusivo por origen, perfil
  y empresa/actor cubre lectura, persistencia, envío y confirmación. Otra ventana
  ocupada o una adquisición fallida bloquean el envío y conservan la intención.
  La prueba con dos lecturas simultáneas reproduce y corrige el reemplazo de
  identidad; 92 pasos web y 90 Windows PASS, sin escrituras nuevas. WebView2
  acredita contención real del bloqueo y reinicio de la sesión separada con
  mismos bytes, sin envío automático. No acredita dos ventanas nativas, otros
  actores ni escritores. `budget-delete-simultaneous-postconditions.json`.
- Dos pestañas web del mismo OWNER comparten la intención de baja: estado
  desactualizado bloquea reemplazo y segundo DELETE; recarga retoma la misma clave,
  la confirmación fixture retira y la pestaña anterior no la recrea. 9 pasos PASS,
  0 escrituras; sólo la secuencia de pestañas, sin intercalado simultáneo ni múltiples
  ventanas nativas. `budget-delete-cross-window-postconditions.json`.
- Presupuestos: lista/comparación/alertas/detalle y catálogos requieren datos
  completos y vivos por empresa/actor/período. Se validan relaciones, importes,
  sumas, porcentajes y unicidad;503/caché/cola/incompletitud retiran resultados
  y exportaciones. Refresco/desmontaje descartan respuestas tardías.
  Catálogos fallidos conservan el formulario y bloquean guardado hasta
  reintentar la carga completa. Ejecución sólo lee movimientos íntegros de
  asientosCONFIRMADO de empresa/período; fallo de fuente devuelve error,
  nunca0 sintético. Umbrales:90Normal,100Advertencia,>100Sobregiro.
  Lectores403/empresa2vacía/detalle404 y reinicio limpio Windows corroborados;
  presupuesto1456.78/ejecutado0 y fuentes153 exactos, sin nuevas escrituras.
  Evidencia inicial: `budget-live-read-controls-postconditions.json`.
  Alta/edición durables,alcance de alertas,ventana civil,paginación yneto de
  reversas tienen fases específicas posteriores descritas arriba. Baja y
  otras variantes mantienen sus propios casos pendientes. Las rutas de
  alertas yvista-ejecucion preceden `presupuestos/:id`.
- Monitoreo contable consulta cuatro fuentes en vivo de la empresa actual.
  Error, caché/cola, payload desconocido o incoherente retira métricas/eventos
  y controles; sólo vacío confirmado informa ausencia de errores. Ventanas
  muestran últimos10 errores de eventos contables, no toda la cola histórica;
  distribución incluye todos los estados de asientos y no sólo confirmados.
  Estadísticas sin payload y RPC de distribución fallido/incompleto no usan
  ceros ni fallback parcial. Respuestas de pantalla/empresa/actor anteriores se
  descartan; reintento exige contabilidad.eventos.reintentar y lectura actual.
  115 pasos web/121 Windows PASS,75 contratos, API3919/345 y reinicio
  separado; todos los eventos/155 asientos por hash y153 confirmados exactos,
  sin claim/drenaje/reintento ni writer nuevo. Conteos/ventanas de consultas
  separadas no garantizan snapshot transaccional bajo toda concurrencia;
  recibo/intención durable del reintento y otros actores/ventanas pendientes.
  `monitor-live-read-postconditions.json`.
- Asientos se originan en eventos de ventas, compras, POS, caja, RRHH y activos.
- Debe/haber debe cuadrar y el período debe permitir la operación.
- Libros, estados financieros y materialized views son proyecciones.
- El formato monetario PDF normaliza sólo el cero que ya resulta del formato
  regional: si el importe se representa igual que -0, muestra0 sin signo.
  Conserva el saldo original, moneda/locale ylos negativos visibles. P2 de
  saldo inicial total casi0 en Balance de Comprobación corregido; descargas
  históricas con -PEN0.00 intactas. UI7web/7Windows,6PDF/12páginas y66checks;
  raw143 yfuentes exactas, sin escrituras. Nuevo debug/1692fuentes; API3518/331,
  SQL80 yRust14 porhuella. Evidencia `pdf-negative-zero-postconditions.json`;
  sin impresión física ni certificación contable/fiscal.
- Las exportaciones Excel de estados conservan importes y porcentajes como
  números, signos negativos y códigos de cuenta como texto; la moneda se indica
  en sus columnas. Los PDF usan la moneda y formato regional del tenant,
  conservan contraste en encabezados y no calculan porcentajes sobre ingresos
  inexistentes (`No aplica`), evitando `NaN` y un 100% ficticio.
- El Balance de Comprobación y el Balance General son estados a fecha de cierre:
  conservan el último saldo de cuentas sin movimiento en el mes y respetan la
  naturaleza deudora o acreedora. La pantalla de estados incluye comprobación,
  resultados, situación financiera, flujo de efectivo indirecto e indicadores;
  estos dos últimos explicitan sus supuestos y no se presentan como EBITDA
  auditado ni como sustituto de conciliación bancaria.
  El flujo compara cierres consecutivos y usa la utilidad del mes, obtenida por
  diferencia de resultados acumulados del mismo ejercicio; enero inicia su
  propio acumulado. Pagar una obligación devengada en meses anteriores afecta
  caja y pasivo una vez, sin volver a descontar el gasto histórico.
- Las cinco vistas de Estados Financieros exigen lectura en vivo y contratos
  completos: números finitos, cuentas únicas y período coincidente cuando la
  respuesta lo declara. Carga/error retiran datos y exportaciones; Reintentar
  mantiene el período y la comparación. Una comparación solicitada se publica
  sólo cuando ambas lecturas son válidas. Cambiar período o desmontar invalida
  las respuestas anteriores; desconexión no publica caché como estado vigente.
  Enero compara con diciembre del año anterior. Refrescar vistas envía año/mes
  en el cuerpo y sólo remonta después de confirmar éxito y período; un rechazo
  conserva error persistente. El refresco usa la RPC existente de las tres
  proyecciones en una transacción; un error de permisos, catálogo o SQL devuelve
  error y nunca se representa como ausencia confirmada de vistas. Las lecturas
  de reportes siguen consultando el libro confirmado en vivo. La nueva prueba
  positiva de refresco pasó en Web y Windows: tres proyecciones regeneradas,
  filas empresariales y numeración intactas. La recertificación integral del
  candidato corregido permanece pendiente.
  El corte131 fue corroborado desdeUI web/nativo, con tresExcel/tresPDF y seis
  páginas revisadas; los cortes107/111/116/120/126/130 permanecen históricos, sin
  sobrescribirlos. Caja final21932.16 incluye509inicial; variación21423.16.
- Los siete indicadores usan saldos de cierre. Activo corriente suma prefijos
  10/11/12/13/14/20; pasivo corriente normaliza40/41/42/43; inventario20,
  CxC12 y CxP42. Margen operativo usa ingresos/costos/gastos acumulados del ER
  del ejercicio hasta el mes. DSO/DPO/DIO aplican base30días sobre esos ingresos
  o costos acumulados, sin promediar saldos; rotación usa costo/max(inventario,
  0.000001). Denominadores sin base positiva devuelven0 según el contrato actual.
  Las fórmulas se contrastaron con el diario al corte131; siguen siendo
  estimaciones gerenciales y no EBITDA auditado ni certificación financiera.
- La descarga PLE de Diario y Mayor filtra exclusivamente asientos
  `CONFIRMADO`. El Balance de Comprobación electrónico es el formato SUNAT 3.17
  (`031700`), con período `AAAAMMDD` al cierre y 19 campos posicionales; el
  formato 3.1 pertenece al Estado de Situación Financiera y no se usa para este
  reporte. Los TXT son insumos para PVS: el ERP no los presenta ni sustituye la
  validación oficial.
  El corte local131 descargó desdeUI102asientos de octubre/276líneas,
  89975.29Debe=Haber y32cuentas; compras12documentos384.00/69.13/453.13,
  ventas21documentos392.73/70.69/494.33. Diez libros y cálculos tributarios
  actuales se cotejaron sin guardar nuevas declaraciones: IGV1.56/renta mensual
  10.47/anual0, activos21987.01/ITAN0, conservando versiones5/4 y sus fotografías.
  Evidencias `inventory-current-accounting-books-postconditions.json`,
  `inventory-current-accounting-ple-ple-postconditions.json` y
  `inventory-current-accounting-tax-postconditions.json`; sin presentación fiscal.
  Diario, Mayor y los registros 8.1/14.1 recorren todas las páginas con orden
  estable; una página fallida rechaza la descarga completa. Las fuentes del
  cálculo mensual, de doce meses y anual usan el mismo criterio.
- En el Registro de Compras 8.1, las notas de crédito invierten base, IGV y
  total, conservan la referencia SUNAT del comprobante modificado y una compra
  en moneda extranjera se rechaza si no tiene tipo de cambio de origen; nunca se
  inventa 1.000 para USD u otra divisa.
- El Registro de Ventas 14.1 aplica el signo de la nota a cada base, IGV y
  total. Un comprobante anulado conserva su identificación y estado con
  importes cero. Las notas recuperan fecha, tipo, serie y número del documento
  original de la misma empresa, incluida la referencia congelada de RMA;
  una referencia ausente o ajena bloquea la descarga.
  Los borradores de venta se excluyen antes de resolver referencias y calcular
  importes; crear una solicitud NC todavía no rectifica el documento emitido.
- El Registro de Compras de la pantalla contable toma los comprobantes de CxP,
  no las órdenes. Conserva el importe fiscal original tras devoluciones o
  descuentos y muestra cada nota de crédito con signo negativo y referencia.
  La consulta por período recorre todas las páginas y mantiene subtotales por
  moneda. El detalle y su descarga Excel incluyen los mismos documentos e
  importes numéricos; una compra ajustada sin original verificable bloquea el
  reporte en vez de inferir un importe a partir del saldo de deuda.
- Las diez vistas de la pantalla principal contable mantienen carga y secuencia
  de consulta independientes. Una consulta fallida o respuesta incompleta retira
  datos, métricas y acciones de descarga, muestra error y permite Reintentar;
  estado/cuadre quedan sin evaluar. Cambiar el período invalida los datos y
  las respuestas anteriores antes de consultar. El filtro sigue disponible
  ante fallo y el Excel sólo usa filas válidas del período actual; un vacío
  válido conserva su tratamiento propio y no permite exportar compras ausentes.
  Se verificaron503/200 incompleto/retry de las diez vistas, respuesta tardía y
  cargas cruzadas, cambio de empresa y lecturas autorizadas/403, en navegador
  y debug nativo actualizado. Los totales de compras siguen separados por moneda.
- El asiento manual nace en `BORRADOR` o `CONFIRMADO`; un confirmado es
  inmutable y se corrige mediante un contra-asiento enlazado, nunca reescribiendo
  silenciosamente el original. La captura sólo comunica un asiento balanceado
  cuando debe y haber tienen importes positivos y ambos totales coinciden al
  céntimo, como en el writer. Un formulario 0/0 permanece pendiente; un céntimo
  de diferencia no se oculta por el redondeo binario del navegador.
- La creación manual acepta `Idempotency-Key`: la misma intención y actor
  devuelve el mismo asiento; una clave reutilizada con otro contenido se
  rechaza. El formulario conserva la clave al recuperar una respuesta perdida.
  El recibo y el asiento se confirman juntos; un replay puede recuperar el
  resultado aunque el período se haya cerrado después del commit original.
  La fecha inicial del formulario corresponde al calendario fiscal del país
  de la empresa, incluso cuando UTC ya cambió de día.
- Cabecera y detalle de asientos, confirmación, reversión, conciliación,
  distribución analítica, devengos, depreciaciones y bajas usan operaciones
  atómicas; sus barreras de idempotencia también viven en la base.
- Multi-moneda conserva importe de origen y cotización, revalúa saldos abiertos
  y reconoce diferencias realizadas en pagos sin duplicar el asiento.
  Las cotizaciones manuales se identifican como MANUAL, admiten hasta seis
  decimales y se excluyen al desactivarlas. Lecturas fallidas bloquean acciones
  y ofrecen reintento. Cada acción exitosa libera su intención; reintentar una
  respuesta perdida conserva la misma clave.
  La simulación excluye obligaciones emitidas después del corte. Cambiar la
  fecha invalida el preview y descarta respuestas tardías. Registrar valida ese
  snapshot y confirma recibo/asiento en una transacción. Sólo admite un ajuste
  activo por empresa: hay que reversarlo antes de otro corte o de liquidar una
  obligación afectada. La reversa conserva ambos asientos y permite un nuevo
  ajuste revisado del mismo corte.
  PLE e impuestos mensuales/anuales convierten importes fiscales por documento
  a PEN con el cambio de origen y redondeo a dos decimales. Pago y revaluación no
  alteran esa fotografía. Reportes operativos conservan los importes originales
  y separan sus totales por divisa.
- El evento de factura de proveedor conserva montos documentales y cotización
  de origen. El listener convierte base, IGV, saldo y ajustes a moneda local
  usando esa cotización congelada; la deuda conserva su moneda original. Un
  evento extranjero sin cotización válida no genera asiento. No se recalcula
  con una cotización actual ni se reescribe un asiento confirmado histórico.
- El registro de activos y centros de costo exige lecturas en vivo y filas
  completas de la empresa actual, IDs únicos, nombres y cifras/fechas válidos.
  Cache/cola/flags no vivos, datos incompletos o ajenos ocultan el registro y
  bloquean alta/depreciación; recuperación manual con respuesta completa.
  Época/scope descartan lecturas anteriores tras cambio de sesión/salida.
  56pasos web/Windows y35checks preservan activos/depreciaciones y corte152;
  lector consulta cronograma histórico y empresa2 ve vacío real. Controles de
  escritura visibles del lector continúan comoP2, sin nuevo escritor.
  Evidencia `asset-register-live-read-postconditions.json`; reportes152 exactos
  por datos/huella, cronograma/escritores restantes y NO_GO global pendientes.
- El cronograma exige respuesta viva y completa: períodos válidos, ordenados
  y únicos; cuotas/acumulada/neto finitos, no negativos y coherentes; registrada
  booleana cuando existe. Rechaza flags cached/queued/offline/pending.
  Fallo oculta la tabla previa y sólo reintento manual completo recupera.
  Época por selección, carga, salida y apertura de formularios impide que una
  respuesta tardía reemplace otra selección o cierre edición/retiro sin guardar.
  60pasos web/Windows y29checks específicos/35regresión preservan corte152 y
  activos/depreciaciones. Edición de formulario usa sólo fixtureGET ACTIVO
  sobre bien real DEPRECIADO; no writer y lectura real restaurada al salir.
  Controles de escritura del lector siguenP2; escritores restantes pendientes.
  Evidencia `asset-schedule-live-read-postconditions.json`; NO_GO global.
- Alta, edición, depreciación y retiro de activos muestran sus controles y
  formularios sólo con permiso crear/actualizar/depreciar/baja deactivos; cada
  handler comprueba también el permiso. El lector conserva registro ycronograma
  sin controles escritores ni formularios/borradores delOWNER. Empresa/actor
  distintos remontan el área; empresa2 vacía y regresoOWNER se verificaron.
  68pasos web/Windows con regresiones decronograma/registro/formularios tardíos
  preservan corte152. Edición de formulario sólofixtureGET ACTIVO sobrebien
  real DEPRECIADO; noformulario guardado yGET real restaurado.
  Evidencia `asset-writer-controls-postconditions.json`; otrosroles granulares,
  revocación inmediata y escritores retenidos siguen requiriendo sus casos.
- Fechas iniciales de adquisición, inicio de depreciación, baja y período
  usan el día civil del país confirmado. Sin país/moneda conocidos no se
  inicializan ni habilitan esos escritores. Valores editados manualmente se
  conservan al cerrar/abrir. Cuatro cuerpos de solicitudes permanecen exactos.
 39pasos web Lima/UTC/Tokio y13Windows con reloj constructor controlado y
  Date.now real: después de19 Lima, cambio de año y bisiesto. Sin alta,
  edición, depreciación ni retiro enviados; tres activos/diez depreciaciones
  preservados. Evidencia `asset-calendar-defaults-postconditions.json`;
  alcance UI acotado de calendario, sin reinicio físico en esta fase.
  Recibos/intenciones durables, país fallido, otros actores y operación/lote
  positivo tienen casos propios. NO_GO global.
- Alta de activo conserva cuerpo/clave por empresa/actor antes delPOST con
  archivo inmutable. País/moneda/centro confirmados; campos congelados mientras
  existe intención incierta. Recarga/navegación/reinicio recuperan sin autoenvío;
  sólo retry manual. Recibo económico original/operación completos yarchivo
  verificado antes de retirar pendiente. Parcial/caché/cola/409/cuota/corrupción
  conservan intención. Puntero ausente recuperado por lectura; bloquea otra alta.
  Sesión/permiso vigentes, lectores/secundaria yrespuestas tardías de pantalla/
  actor no exponen ni retiran la intención privada OWNER. WebLocks por origen
  yactor; otras ventanas/perfiles tienen sus propios casos de concurrencia.
 47pasos web/52Windows,89contratos/Rust33. TodoPOST de alta
  interceptado antes de API; no cuarto activo ni ledger/GL/outbox nuevo.
  `asset-create-operation-postconditions.json`; API4290/354 ySQL80 por huellas.
  Nuevo positivo empresarial, rechazo/abandono seguro, edición/baja/depreciación,
  otras monedas/ventanas y módulos restantes siguen pendientes. NO_GO global.
- Alta de activo devuelve recibo completo de operación después del RPC atómico
  previo. Ledger/actor/empresa/clave/huella y fotografía económica original
  deben coincidir. Referencia actual scoped yconteo exacto1; original ACTIVO
  separado de situación actual DEPRECIADO/BAJA/VENDIDO. Datos parciales,
  cacheados/encolados o fuentes desconocidas producen503 sin confirmar éxito;
  conservar solicitud/misma clave. RPC/cuerpo/clave y12 métodos previos exactos.
 135 dirigidas/ocho controles compilados sobre tres recibos históricos readonly,
  solicitud recuperada sólo si coincide huella SQL. API4290/354,1762fuentes;
  web/export/binario/prueba calendario actual, SQL80 y Rust32 por huellas.
  `asset-create-receipt-postconditions.json` sólo soporte técnico;ui_complete:false.
  Cero alta/edición/baja/depreciación nueva. Intención/recibo durable UI,
  transporte/reinicio, rechazo y nuevo positivo con casos propios. NO_GO global.
  El código del registro sigue la normalización SQL a mayúsculas y sin espacios
  exteriores. Servidor y navegador contrastan esa representación sin modificar
  el cuerpo original ni su clave/huella; un código distinto sigue rechazado.
  El UAT integrado descubrió un alta efectivamente comprometida cuyo recibo
  devolvía503 por comparar mayúsculas con el original mixto. La regresión API y
  cliente reproduce y corrige ese fallo; el recorrido empresarial completo sigue
  en ejecución, sin promover esa prueba técnica a aceptación UI.
- Candidatos de depreciación: fuente completa paginada1000 con conteos estables,
  IDs únicos y empresa/ACTIVO, cifras/vida/fecha conocidos antes del primer RPC.
  Desconocido/truncado/duplicado/ajeno/fallo en otra página bloquea cualquier
  writer, sin perder activo1001 ni confirmar cero falso. Período válido antes
  de lectura; inicio nullable conocido mantiene fallback de adquisición.
  Aritmética yparametrización del RPC por activo/10 otros métodos exactos.
  64 dirigidas/3 controles compilados: fuentes actuales vacías de dos empresas
  contra SQL readonly y1001st elegible técnico. API4219/353,1760fuentes;
  web/nativo/SQL80/Rust32 por huellas exactas. Tres activos/diez depreciaciones
  y negocios intactos, cero depreciación/GL/outbox nuevos.
  `asset-depreciation-source-postconditions.json` acredita soporte técnico,
  ui_complete:false. Atomicidad/recibos/intenciones del lote, errores parciales,
  fuente positiva/UI, carga y snapshots de igual cardinalidad requieren casos
  propios. NO_GO global; no repetir depreciaciones cerradas.
- Edición, baja y venta conservan intención original durable por empresa/actor,
  cuerpo/fotografía/UUID/país antes del writer. Reintento manual aun si el catálogo
  falla o cambió; recibo económico completo archivado y releído antes de retirar
  pendiente. Baja/venta incluyen asiento confirmado y detalles balanceados. El
  ledger privado y writer comparten transacción y contraste completo bajo lock;
  un fallo revierte activo/asiento/detalles. Reglas/cálculos anteriores preservados.
  Lectores, secundaria, país fallido, respuestas tardías y errores conservan datos.
  JS/Rust impiden cola/replay genérico sin purgar legacy.274pasos web/Windows con
  dos reinicios físicos;58regresiones de depreciación. API5183/372,235dirigidas,
  98contratos,Rust44,SQL80fresco/restaurado y DDL aditivo local;ambos ledgers0.
  `asset-lifecycle-original-postconditions.json`: escritores sólo controlados;
  nuevos positivos UI/API/GL aislados y otras variantes mantienen casos propios.
- El lote de depreciación conserva intención durable original por empresa/actor,
  período/cuerpo/UUID/país, con reintento manual y recibo completo archivado antes
  de retirar pendiente. Un único RPC confirma cuotas, outbox y ledger privado;
  cualquier fallo revierte todo el lote. Candidatos completos contrastados bajo
  lock acotado y período protegido; replay devuelve el original aunque las fuentes
  cambien. Cuotas históricas no se reparan ni se repiten desde este lote.
  99 pasos web/Windows/reinicio, dos pestañas web e iframe nativo con handlers;
  lectores/secundaria/país fallido/tardías/cuota/corrupción/cache/cola conservan el
  original. JS/Rust rechazan encolado/reenvío genérico y preservan solicitudes legacy.
  API5064/371,116dirigidas,50contratos,Rust42,SQL80 fresco/restauración aislada;
  DDL local aditivo, ledger0 y tres activos/diez depreciaciones intactos. POST sólo
  controlado antes deAPI. `asset-depreciation-batch-postconditions.json` acredita
  ese contexto; nuevos positivos UI/GL, dos ventanas Windows y otras variantes
  mantienen casos propios. La meta global continúa ACTIVA, NO_GO global.
- Plantillas recurrentes generan una sola instancia por período. Activos fijos
  conservan cronograma, depreciación, valor residual y baja; la última cuota
  ejecutada absorbe el pendiente sin depreciar por debajo del residual.
  El detalle y cronograma distinguen ausencia (404) de lectura caída (503).
  Alta/edición rechazan duplicados o colisiones de intención con 409, ediciones
  ajenas con 404 y writers indisponibles con 503. Una falla de infraestructura
  al depreciar no se anuncia como éxito con activos omitidos: responde 503 y
  permite recuperar el mismo lote original sin duplicar cuotas ni eventos.
  El lote583 confirma todos sus activos, cuotas, eventos y recibo en una única
  transacción; cualquier fallo revierte el conjunto.
  La pantalla conserva un error de carga con reintento y muestra los importes
  como no disponibles hasta recuperar la consulta; una caída no equivale a
  saldos cero ni a un registro vacío.
  Los saldos vigentes excluyen los activos dados de baja o vendidos; el registro
  histórico conserva su costo, depreciación y valor neto para trazabilidad.
  Revisar vida útil o residual congela una base prospectiva desde el período
  siguiente a la última cuota registrada (585): pendiente y meses restantes,
  cuota constante y ajuste de céntimos al final. El cronograma muestra las cuotas
  históricas reales y proyecta sólo lo pendiente. El writer rechaza una cuota
  calculada con una revisión anterior; nombre/centro no reinician la base.
  El cronograma muestra las cuotas registradas con sus importes históricos y
  proyecta sólo las posteriores a la última registrada según la estimación
  vigente; no sustituye cuotas previas ni proyecta bienes retirados/depreciados.
  Cambiar vida útil/residual conserva lo ya registrado. La pantalla permite
  retirar también un bien `DEPRECIADO`; baja/venta generan un único asiento.
  Los indicadores de adquisición, depreciación acumulada y neto corresponden
  sólo a bienes ACTIVO o DEPRECIADO del registro vigente. Las bajas y ventas
  conservan sus filas históricas sin seguir sumando en esos indicadores. Estos
  valores del catálogo no sustituyen la conciliación con el mayor contable.
  Alta de activos y diferidos registra el catálogo, sin asiento de adquisición
  ni pago/cobro inicial. La venta del activo reconoce cuentas12/75 sin emitirCPE
  ni cobrar en esta pantalla. Diferidos devenga gastos desde18 e ingresos desde49
  hacia las cuentas de resultado elegidas; cancelar conserva los devengos y
  suspende los posteriores. No ofrece edición ni cronograma individual en el listado.
  El lector contable propio consultó registros y cronograma, pero recibió403
  en alta/retiro/depreciación de activo, alta/devengo y cancelación de diferido
  vigente, conservando datos y formularios. Los controles visibles se evaluaronP2;
  los deactivos y diferidos se corrigieron después con permisos y scope.
  Dos operadores despacharon devengo/cancelación solapados desdeUI: al ganar
  cancelación, conservaron cancelado0devengado/2pendiente, sin cuota ni asiento.
  Cambios de estado/saldo detectados por el RPC se traducen a409 y requieren
  actualizar antes de reintentar; esa rama se verificó en regresiones técnicas.
  El replayUI devolvió201sin devengos y no acredita observar409 en navegador.
  Activos/diferidos cargan conjuntamente sus catálogos; error o respuesta
  incompleta muestra reintento y bloquea operaciones, sin presentar cifras cero.
  El backend583 lee el historial de depreciación conSELECT de servicio; no añadeDML.
  Crear período sólo vuelve al listado tras confirmar identidad/año/mes;
  un fallo conserva el formulario para reintentar.
  Las partidas de
  terceros pueden conciliarse total o parcialmente y deshacerse sin alterar el
  asiento. En Perú, las cuentas 12, 16, 42 y 46 nacen conciliables (569); un
  tenant CO no se marca. Conciliar acepta `Idempotency-Key`: el reintento
  devuelve la conciliación registrada, una clave con otra selección responde
  409 y dos conciliaciones simultáneas de las mismas partidas aplican una sola
  (la otra, 400/409). El listado de conciliaciones lee la tabla con SELECT de
  servicio; las intenciones son privadas.
- Libros, estados, plan de cuentas, asientos y partidas responden 503 cuando no
  pueden leer sus datos, nunca un 200 vacío; la pantalla de contabilidad muestra
  el error de la vista activa. `anio`/`mes` inválidos responden 400; en los
  libros por fechas se traducen al rango del mes salvo fechas explícitas.
- Devengar diferidos congela por empresa/actor el cuerpo anio/mes y la
  fotografía completa previa. Nueva operación requiere registro vivo sin
  cambios y ausencia de asiento. Retry consulta primero el asiento del período:
  confirmado, cuotas/líneas/totales y registro posterior exactos permiten
  recuperar sin repetir POST. Sólo si está ausente y el registro previo sigue
  exacto se envía el mismo período. Resumen vivo no basta; exige asiento completo
  con source_event_id determinista SHA256, empresa, fecha/origen/estado/actor,
  líneas GASTO/INGRESO y acumulados. Cero cuotas con resumen0/registro exacto
  sin asiento es una operación sin devengo. Mismos bytes y retirada comprobada
  preceden al resultado. Recarga/navegación/reinicio no envían; corrupción/fallo/
  concurrencia/callback tardío conserva. Período y otros escritores bloqueados;
  fuera de cola JS/Rust.278pasos web/Windows más reinicio5,134checks/Rust22;
  cinco diferidos históricos y devengos intactos, POST/DELETE fixtures antes de
  API. Servidor usa período/source_event_id, no Idempotency-Key en devengo.
  Evidencia `deferred-accrue-operation-postconditions.json`; otros períodos,
  actores/concurrencia y restantes módulos/variantes requieren casos propios.
- Cancelar diferidos consulta primero la fila completa en vivo, sin cambios
  desde la selección, y conserva fotografía, clave UUID y cuerpo DELETE vacío
  privados por empresa/actor antes de enviar. Recarga/navegación/reinicio no
  envían automáticamente; retry exige permiso cancelar. Recibo completo vivo
  del mismo registro CANCELADO y sus datos/importes/devengos intactos,
  updated_at no anterior, mismos bytes y retirada comprobada preceden al éxito.
  Fallo/corrupción/concurrencia/callback tardío conserva; fuera de cola JS/Rust.
  Alta/devengo/otra selección se bloquean con intención pendiente o writer
  ocupado; cada intención de alta previa conserva su recuperación.209pasos
  web/Windows más reinicio5 y recuperación de fixture del arnés3,97checks y
  Rust21. Cinco diferidos históricos sin cancelar otra vez; DELETE/POST
  exclusivamente fixtures antes de API, sin claim de replay empresarial ni
  fingerprint/actor del ledger en fila pública. Evidencia
  `deferred-cancel-operation-postconditions.json`; otros períodos/actores y variantes
  requieren sus propios casos.
- El alta de diferido guarda cuerpo, clave UUID y contexto comercial privado
  por empresa/actor y verifica almacenamiento antes de POST; el servidor ya
  admite la clave en el ledger479. Se recupera tras recarga/navegación/reinicio,
  sin envío automático y con permiso crear para retry. Recibo completo en vivo
  exige empresa/creador, todos los datos solicitados, VIGENTE/devengado0 y
  timestamps; sólo mismos bytes y retirada comprobada permiten anunciar éxito.
  Fallos/corrupción/cambio concurrente y respuesta tras desmontar conservan la
  intención; alta fuera de cola genérica JS/Rust.171pasos web/Windows más
  reinicio nativo2before/3after,98checks y Rust20; cinco diferidos históricos
  sin repetir altas/devengos/cancelaciones. Los POST son fixtures antes de API,
  sin prueba de replay empresarial ni fingerprint en la fila pública.
  Evidencia `deferred-create-operation-postconditions.json`; otros períodos de devengo,
  perfiles y variantes requieren casos propios.
- El registro de diferidos y los catálogos de cuentas/centros requieren respuesta
  completa en vivo de la empresa: identidad, estados/fechas y dinero coherentes,
  sin IDs/códigos duplicados. Error retira filas/métricas y bloquea escritores
  hasta reintento manual. No se confunde una lectura fallida con vacío válido.
  Crear, devengar y cancelar comprueban sus permisos en controles, formularios
  y handlers. Empresa/actor distintos remontan el área, sin borrador OWNER para
  lector/empresa2; una consulta retenida del actor anterior no reemplaza filas.
  78 pasos web/Windows: recuperación63 y roles/formulario/GET tardío15,61checks
  nuevos y35 de centros por helper idéntico. Se conservan cinco diferidos y
  todos sus devengos/cancelaciones; evaluar Cancelar usa exclusivamente estado
  VIGENTE en GET fixture, sin nuevo writer. Evidencia
  `deferred-live-read-controls-postconditions.json`; recibos/intenciones de los
  otros períodos de devengo, perfiles y variantes requieren sus propios casos.
- La distribución analítica reparte una línea por varios ejes independientes.
  Ingresos y gastos diferidos se reconocen por período y la última cuota absorbe
  residuos de redondeo.
- El detalle del asiento permite registrar y mantener esa distribución
  analítica por línea. El registro de consignaciones calcula el total en el
  servidor, toma el tenant del contexto autenticado y limita sus cambios a
  estados válidos; el cliente no puede imponer tenant, total ni estado inicial.
  La web conserva la intención durante un fallo y la libera tras confirmar el
  alta, de modo que una nueva entrega idéntica obtiene su propio registro.
  Registro y productos se cargan atómicamente: un fallo muestra indisponibilidad
  y bloquea altas/cambios hasta reintentar. DEVUELTA, CERRADA y ANULADA son
  terminales; VENDIDA admite cierre. El registro por sí mismo no mueve stock,
  emite CPE, cobra ni genera asiento. La UI limita ahora los destinos al estado actual y permiso, según el
  contraste posterior descrito abajo.
- Consignaciones: registro y catálogo propio completo en vivo con conteos
  exactos, IDs únicos y empresa coincidente. Error/caché/cola/incompletitud
  retira filas/métricas y bloquea escritores; el borrador no enviado permanece
  durante error de lectura. PEN/USD se totalizan por separado. Permisos de
  crear/actualizar en controles y handlers; PENDIENTE admite VENDIDA/DEVUELTA/
  ANULADA, VENDIDA sólo CERRADA y estados terminales carecen de selector.
  Filtro/empresa/actor distintos descartan consultas anteriores.59 pasos web
  y65 Windows PASS con fixtures antes de API, dos lectores reales y reinicio
  separado. API3852/343,47 contratos y1741 fuentes; SQL80/Rust31 por huellas.
  Tres registros/siete recibos/0 movimientos y153GL14períodos preservados.
  `consignment-live-read-postconditions.json`. Conteo estable/paginación no
  garantiza snapshot transaccional si cambia contenido con igual cardinalidad;
  recibos/intenciones durables de escritores y otros actores/ventanas pendientes.
- Diferencia de cambio: simulación completa/viva con conteos exactos y IDs
  únicos por empresa para CXC/CXP; saldo/estado/moneda/fecha civil/origen
  confirmados. Cotización activa por par/corte con conteo y desempate por ID;
  desconocidos fallan cerrado, ausencia confirmada de origen/lado/cotización
  conserva exclusión motivada. Saldo/tipos y valoración/diferencia/totales
  coinciden en céntimos con redondeo decimal half-up. Metadata de completitud
  fuera de la fotografía económica que recibe la RPC; parametrización y RPC
  atómica conservadas.
  Caché/cola/error/incompleto/ajeno retira simulación y bloquea registro; permisos
  en controles y handlers, actor/empresa actual, reintento manual y tardías de
  fecha/pantalla descartadas. Revaluación y Consolidación proponen fecha/año
  civil del país confirmado; día Perú después de19:00 Lima en web/Windows.
  57 pasos web/63 Windows PASS, secundaria real,
  dos roles y reinicio físico; dos posiciones primarias/vacío secundario coinciden
  exactamente con SQL readonly.64 contratos, API4073/348,1751 fuentes.
  `revaluation-live-read-postconditions.json`; cero registro/reversa nuevos,
  negocios/colas/PG y perfiles exactos. El recibo API de registro ahora exige
  fotografía económica completa, huella exacta jsonb SQL477, identidad de ledger/
  empresa/actor/clave/registro y asiento original con fuentes conteo1. Desconocido,
  parcial/caché/cola/ajeno no confirma; RPC atómica y16 métodos existentes exactos.
  Commit original se recupera incluso con asiento actual ANULADO, identificado
  aparte; no inventa idempotent a partir de una consulta posterior.110 dirigidas,
  8 controles compilados con cuatro textos/huellas contra SQL readonly y dos
  recibos existentes/solicitudes probadas por huella; cero registro/reversa.
  API4188/352,1758 fuentes; web/nativo/SQL80/Rust31 por huellas exactas.
  `revaluation-registration-receipt-postconditions.json` es soporte técnico,
  ui_complete:false. UI parcial y pérdida de clave tras recarga reproducidas;
  La UI ya conserva intención privada por empresa/actor, cuerpo/clave/fuentes
  antes delPOST y solicitud inmutable. Recarga/navegación/reinicio recuperan sin
  autoenvío; fecha/simulación congeladas. Recibo completo/vivo exige identidad,
  payload/economía y asiento original; archivo verificado antes del retiro.
  Parcial/caché/cola/409/transporte/cuota/corrupción conservan intención; revisión
  manual y recuperación desde archivo sin puntero. Tardía de pantalla/actor no
  retira ni expone OWNER; dos lectores y secundaria reales. Lock de origen/actor,
  POST excluido de cola genérica navegador/Rust. 48 web/53
  Windows,80 contratos/Rust32 fresco,1759fuentes/export136páginas135HTML;
  API4188/352 ySQL80/restauración por huellas exactas. Reinicio físico separado
  con mismos bytes/body/key y retry manual.81ledger153GL14períodos/12solicitudes,
  PG/perfiles/WIP/evidencias y colas intactos; cero registro/reversa nuevos.
  `revaluation-registration-operation-postconditions.json`; todas las respuestas
  de registro UI interceptadas antes de API. Positivo empresarial, conciliación/
  abandono seguro de rechazo, nuevas ventanas/actores y concurrencia conservan
  caso propio; sin claim exactly-once ni autoridad fiscal. Writer durante cambio
  de actor, otras monedas/calendarios, carga UI y snapshot bajo reemplazo de
  igual cardinalidad siguen pendientes; NO_GO global.
- Generación financiera en lectura: resultado completo y fuentes actuales,
  mismas empresas/definición/fechas/moneda, líneas únicas y exactas. Cada importe
  requiere número finito en céntimos; cuentas coinciden con su desglose por
  empresa/ajuste y fórmulas coinciden con coeficientes/signo y redondeo decimal
  simétrico. Fuentes de asientos CONFIRMADOS paginadas con conteo estable, IDs
  únicos, pertenencia de hijo/asiento/cuenta y límites civiles de cada empresa;
  Perú preserva fecha civil UTC e incluye instantes hasta la medianoche local
  siguiente. Configuración, moneda, factor/tasa, mapeo y ajuste desconocidos
  impiden confirmar el resultado. Mapeos ambiguos se rechazan. Nulo/caché/cola/
  error retira importes; reintento manual y respuestas antiguas de fecha/pantalla
  descartadas. 57 pasos web/63 Windows PASS, reporte
  individual y ambos grupos existentes consultados sin alta repetida, lector contable/lector genérico sin permiso,
  secundaria real y reinicio físico separado.63 contratos, API4025/347,1749 fuentes.
  `consolidation-financial-read-postconditions.json`, cero escritores nuevos,
  cuerpos económicos intactos. Otras monedas/composiciones/calendarios, carga UI,
  snapshot transaccional bajo reemplazo de igual cardinalidad y durabilidad de
  escritores siguen pendientes; NO_GO global.
- Catálogos de consolidación: paginación/conteo exacto por membresía, grupo,
  configuración de empresa, definición y línea. IDs únicos y pertenencia
  actual obligatorios, incluyendo controladora extranjera cuando la empresa
  tiene membresía PENDIENTE/ACTIVO; RECHAZADO no concede acceso. Fórmulas
  incompletas, referencias ajenas/ciclos, caché/cola o fuente desconocida retiran
  catálogos/resultados y bloquean escritores/generación. Permiso reportes.actualizar
  en controles/handlers; ajustes/tasas/mapeos sólo grupo activo/controladora;
  invitación pendiente corresponde a la empresa actual. Borrador no enviado
  conservado ante503 y lecturas anteriores descartadas. 73 pasos web/
  79 Windows PASS, secundaria real, dos lectores y reinicio separado;
  73 contratos, API3947/346,1747 fuentes. Siete tablas y153GL14períodos por
  huellas intactos, cero writers nuevos. `consolidation-live-read-postconditions.json`.
  Conteos estables no garantizan snapshot transaccional bajo toda concurrencia;
  volumen1001 con dobles es soporte técnico. Durabilidad de writers y contrato
  completo de fuentes/resultados de generación financiera siguen pendientes.
- Consolidación agrupa empresas legalmente separadas solo después de que cada
  miembro acepta la invitación. Homologa códigos de cuenta, exige tasas de
  cierre/promedio/históricas cuando cambia la moneda y aplica eliminaciones o
  reclasificaciones en una capa de reporte que no toca los libros legales.
  Las fuentes de consolidación tienen lectura de servicio y conservan la
  escritura exclusivamente por RPC. El selector de tasas incluye a la
  controladora cuando su moneda funcional difiere de la de presentación.
  Las colisiones de intención, falta de pertenencia y estados inválidos se
  distinguen de la indisponibilidad del servicio.
  Tasas, mapeos y ajustes conservan UUID durante un fallo y liberan la intención
  tras confirmar: volver A→B→A guarda A y una nueva eliminación idéntica crea
  otro ajuste. Cambiar estos datos invalida el resultado visible. UI/API rechazan
  ajustes con más de dos decimales y tasas con más de diez; la función484
  privilegiada mantiene su contrato histórico. Una invitación rechazada deja
  de aparecer para el miembro y no participa en el informe; su otra membresía
  aceptada se conserva. Participación no selecciona automáticamente un método
  contable de consolidación.
- Los reportes configurables admiten líneas por prefijos de cuentas y fórmulas
  entre líneas, con alcance de período o acumulado. Las fórmulas son estructuras
  validadas con detección de ciclos; nunca SQL suministrado por el usuario.
  Acumulación, conversión, ajustes y fórmulas usan Decimal con ROUND_HALF_UP:
  cada empresa se redondea a dos decimales antes de sumar el consolidado;
  saldos acreedores y deudores siguen el mismo criterio al medio céntimo.
  Lecturas incompletas bloquean el diseñador y la generación. Cambiar empresa,
  reporte o fechas descarta el resultado previo. Un alta comprometida con ACK
  perdido se recupera sólo con código, contenido y actor idénticos; un conflicto
  distinto conserva el registro. El modelo inicial HABER7/DEBE6 suma movimientos
  brutos y no equivale al estado de resultados neto canónico. Su nombre inicial
  requiere aclaración; las definiciones históricas se preservan. No hay edición
  de definición existente ofrecida en esta pantalla.
- `Contabilidad > Impuestos Perú` prepara el borrador mensual de IGV y renta
  para NRUS, RER, RMT y Régimen General. Ventas salen de CPE, compras de CxP y
  los créditos manuales quedan en una versión con corte y conteos de origen.
  Si falla la lectura del saldo previo o la declaración vigente, devuelve
  indisponibilidad y bloquea guardar un borrador basado en información incompleta.
  Recuperar el acceso conserva el crédito persistido del período anterior.
- Los formularios mensual y anual sólo habilitan la revisión y sus acciones
  después de consultar cálculo e historial completos para el período actual.
  Cambiar período invalida datos y mensajes previos; una respuesta tardía de
  otra consulta se descarta. Ante fallo o contrato incompleto retiran cálculos,
  ajustes e historial visibles, conservan el selector y ofrecen Reintentar.
  Las cargas reemplazadas no alteran la carga vigente. Durante recálculo o
  guardado se bloquean cambio de período y actualización. Un fallo de recálculo
  o guardado conserva los campos para reintentar en el mismo formulario.
  Navegador y debug nativo verificaron esas lecturas/carreras; inventario recibió
  403 y el lector contable consultó200 pero su guardado recibió403 sin versión.
  El navegador verificó además empresa2 vacía y dos guardados conACK perdido/
  replay, una versión mensual5 y anual4, preservando todas las fotografías previas.
- El cálculo aplica IGV, saldos, retenciones y percepciones; NRUS categoriza las
  cuotas S/ 20 y S/ 50, RER calcula 1,5 %, RMT usa 1 % hasta 300 UIT y luego el
  mayor entre coeficiente y 1,5 %, y General usa el mayor entre coeficiente y
  1,5 %. La UIT corresponde al ejercicio del período: S/ 5.150 para 2024,
  S/ 5.350 para 2025 y S/ 5.500 para 2026. Los ejercicios sin UIT verificada
  se rechazan; una rectificación histórica conserva su parámetro.
- Este espacio no presenta FV 621 ni FV 1611. El contador contrasta contra
  RVIE/RCE, presenta en SUNAT y registra la constancia externa; cada corrección
  crea otra versión y conserva el historial.
- Los cuatro guardados de versión/constancia mensual y anual exigen
  `Idempotency-Key`. La intención, versión y respuesta se confirman en una
  transacción. Repetir la misma solicitud/actor devuelve el corte congelado;
  cambiarla con la misma clave devuelve conflicto sin otra versión. Cada replay
  valida nuevamente actor activo y permiso de actualización. La web conserva
  clave y campos durante el reintento del mismo formulario, y libera la clave
  después de confirmar éxito. Una nueva versión conserva la constancia previa
  hasta registrar la constancia de la corrección.
- `Contabilidad > Renta anual e ITAN` toma el resultado y los activos del cierre
  contable y prepara la conciliación del FV 710 para Régimen General/RMT. General
  aplica 29,5 %; RMT aplica 10 % hasta 15 UIT y 29,5 % al exceso. Selecciona el
  formulario Completo al superar 1.700 UIT y calcula ITAN al 0,4 % sobre el
  exceso de activos netos ajustados sobre S/ 1.000.000.
- Adiciones, deducciones, pérdidas, créditos y exclusiones ITAN son entradas
  explícitas con papel de trabajo. Un ejercicio abierto o balance descuadrado
  bloquea registrar la constancia. El ERP no presenta FV 710 ni ITAN.
- Los cálculos mensual y anual recuperan los ajustes de la versión vigente
  al recargar. Una corrección explícita, incluido cero, los reemplaza sin
  alterar las versiones anteriores. El formulario mensual adopta el saldo
  anterior calculado al iniciar un período sin declaración; cambiar a otro
  ejercicio anual no conserva ajustes del ejercicio anterior.
- La renta mensual admite otros ingresos gravables fuera de CPE, revisados
  expresamente por el contador, con importe del mes, acumulado del ejercicio y
  referencia obligatoria. No clasifica automáticamente cuentas 75/77 ni altera
  ventas o IGV. El snapshot conserva esos datos; el acumulado se arrastra desde
  el mes previo y se reinicia en enero. Esos ingresos forman parte de los
  ingresos netos del artículo 85 de la
  [Ley del Impuesto a la Renta](https://www.sunat.gob.pe/legislacion/renta/ley/capxi.pdf).
- El anual suma los incrementos mensuales revisados al ingreso documental para
  seleccionar el formulario. La renta imponible parte del resultado contable,
  que ya incluye esos ingresos, y no vuelve a adicionarlos. Las versiones
  anteriores mantienen el cálculo y la referencia de su propio corte.
- Los ingresos anuales netean notas de crédito y excluyen tickets y documentos
  anulados con las mismas reglas fiscales que el cálculo mensual. La base de
  activos al 31 de diciembre del ejercicio corresponde al ITAN del ejercicio
  siguiente, que se identifica en pantalla.
  Mensual, anual y PLE excluyen ventas/NC en BORRADOR. Mensual y anual también
  excluyen notas sin documento emitido: pasar a FIRMADO por firma técnica no
  rebaja IGV ni renta mientras el libro conserva la factura. Las notas emitidas
  mantienen su signo y las compras mantienen la política vigente. Se contrastó
  el corte133 desde ambas interfaces: IGV1.92/ingreso525.64/renta10.51 contra
  PLE/diario, sin reescribir versiones guardadas5/4 ni la CxC1.18 del original.

Código principal: `apps/erp-api/src/modules/contabilidad`.

## Recursos humanos

Las lecturas de beneficios, capacitaciones y expediente acreditan primero el
empleado de la empresa. Sus catálogos se consultan completos, con relaciones
explícitas y permisos de sólo lectura al servicio en la586. Un padre ajeno o
inexistente es404; una fuente fallida es503 y nunca una colección vacía. El
detalle de planilla aplica la misma comprobación del padre.
- RPC495 devuelve huella de pago MD5 de32hex y huella de tesorería SHA256 de64hex;
  ambas se validan por forma, sin recálculo. Un replay cacheado puede conservar
  pagosInsertados1 junto a idempotenttrue. Recibo inicial y replay reales1044
  verifican este contrato; los fixtures previos de tesorería32 quedan históricos.
  Noviembre2026, ligado a vacaciones existentes, quedó pagada una vez, con RRHH
  aprobador/pagador distintos del calculador y cálculo original preservado.
  Reinicio real conserva intención; mismo cuerpo/clave manual confirman el mismo
  pago/cargo/evento y retiran bytes exactos, sin autoenvío. No repetirlo.
  Evidencia `rrhh-vacation-settlement-postconditions.json`; 152global/151octubre,
  banco20184.70, tributos5/4 intactos, NO_GO global y restantes módulos pendientes.

- Los destinos bancarios/caja del pago rechazan cached/queued/offline/pending
  en body superior/anidado y headers de cache/cola antes de habilitar el control.
  La recuperación exige consulta manual en vivo.57pasos por interfaz cubren
  destinos19, ciclo pago7, lecturas27 y aprobación4 sin writers empresariales.
  Ver `payroll-destination-live-postconditions.json`; noviembre calculada1044
  y NO_GO global conservados.

- La aprobación de planilla conserva intención privada por empresa/actor con
  fotografía del cálculo, empleados, conceptos e importes. El calculador debe
  ser distinto del aprobador. Un recibo445 íntegro sólo pasa a VERIFY; se confirma
  con cabecera/detalle vivos coincidentes y metadata de aprobador/evento.
  Recarga y reinicio no envían automáticamente. APPROVE retoma manualmente el
  mismo UUID y cuerpo vacío; VERIFY sólo consulta GET, sin repetir el POST.
  Fallos de storage/recibos/cache/colas/sesión, salida y cambios concurrentes
  conservan los mismos bytes. JS/Rust excluyen acciones/aliases de aprobación y
  legacy PUT estado aprobada de la cola; las colas legacy quedan fallidas para
  conciliación sin enviarlas. Recibo445 no contiene importes/empresa/actor/clave;
  se vincula con lectura viva, sin añadir clave API ni prometer un único UPDATE
  del replay.105pasos por interfaz, regresión pago27 y dos reinicios2/3;
  fixtures antes de API, noviembre calculada1044 sin writer empresarial nuevo.
  Ver `payroll-approval-operation-postconditions.json`; NO_GO global.

- El pago de planilla conserva una intención privada por empresa/actor con la
  fotografía de empleados/importes y destino, referencia y clave. El país fiscal
  consultado en vivo se conserva en las intenciones de pagos nuevos.
  La fecha civil del recibo495 se contrasta con los días locales del país al
  crear y recuperar la operación; no con cortes UTC. Los pendientesv1 anteriores
  mantienen sus bytes y usan el país vigente del mismo scope. La regresión
  de medianoche cubre PE/CO/AR, fechas ajenas y replay con la misma clave.
  Se consultan cabecera, detalle y tesorería en vivo antes de habilitarlo. Un recibo incompleto,
  ajeno, cached/queued/offline o fallos de almacenamiento conserva el intento;
  recarga, cancelar y reinicio ofrecen Retomar pago pendiente y retry manual.
  Un estado pagada sólo permite recuperar el intento existente, nunca otro pago.
  El retiro se verifica sobre los mismos bytes; salida/cambio de sesión o cambio
  concurrente no confirma ni borra. Se excluye de la cola genérica web/Rust y sus
  aliases backend. El recibo495 confirma planilla/período/método/importes/pagos/
  evento y destino/movimiento; pago MD5_32 y tesorería SHA256_64 sólo por forma.
  No contiene tenant/actor/referencia/clave, vinculados a lectura viva e intención.
  Siete suites97pasos por interfaz y reinicio2/3, fixtures sin writers empresariales;
  noviembre2026 sigue calculada1044 y salarios históricos intactos. Aprobador y
  pagador reales distintos no recuperan intención OWNER. Ver
  `payroll-payment-operation-postconditions.json`; aceptación global NO_GO.


- La variante real verificó cuatro tipos adicionales con Mario activo:
  descanso médico31oct–2nov/3d, licencia4–5nov/2d y compensación6nov/1d aprobados;
  otro7nov/1d rechazado con motivo. Hay12 solicitudes y seis tipos; ocho filas
  previas exactas. Alta y aprobación médica Windows recuperaron commits201/200
  tras ACK503 y reinicio antes del retry, con mismo cuerpo/clave/respuesta475.
  Las otras tres variantes fueron seis writers web. Total ocho operaciones
  únicas,10 llamadas con dos replays y ocho ledger/auditorías. Corpus9 y roles6
  por interfaz acreditan fechas civiles, días y decisión sin nuevos writers.
  Contratos, asistencia, planillas, CTS, liquidaciones, pagos, stock y GL intactos;
  colas SQLite8actores0 y sin intención pendiente. Pendientes: cálculo/pago con
  estas solicitudes, empleado inactivo, volumen y dos empresas pobladas.
- Alta y decisión de solicitudes guardan cuerpo y clave por empresa y actor
  antes de POST/PUT. Recarga, Volver y reinicio del proceso restauran la operación
  congelada; su reintento es manual. La UI limpia únicamente con recibo válido
  y los mismos bytes: empresa, solicitud, empleado, tipo, fechas, días, motivo,
  estado, activo, tiempos y decisión/actor/observaciones. La fila475 no acredita
  clave, huella ni actor creador; no se afirma un recibo criptográfico. TS/Rust
  impiden cola genérica de alta y aprobar/rechazar por endpoint o URL. El acuse
  tardío tras salir no limpia ni avisa éxito. Corrupción y fallos de almacenamiento
  bloquean o conservan datos. Roles y empresa aíslan la intención sin envío
  automático. Web/Windows: recibos53/ciclo16/offline10/almacenamiento20/Volver10/
  lectura38/carga5/roles6/intención con roles8; reinicio2+3,61checks y Rust12.
  La fase anterior de contrato usó fixtures; corte141 intacto. Pendientes:
  recibo con clave/huella, desconexión física, múltiples ventanas, cambio de
  sesión con writer retenido y conciliación o abandono de rechazo definitivo.
- Solicitudes publica conjuntamente solicitudes y empleados verificados en
  vivo por empresa/actor. Caché, respuesta incompleta, duplicados, relación
  ajena, fechas/días o decisión inválidos retiran filas y conteos y bloquean
  campos, alta y decisiones; Actualizar recupera las fuentes sin perder el
  formulario. Carga y error no afirman vacío ni ausencia de empleados activos.
  Web/Windows:18 fallos y recuperación38, carga/vacío5, roles6; OWNER8 solicitudes,
  ocho empleados/cinco activos y empresa secundaria vacía real. Reinicio2 y
  40checks, cero escritura nueva, corte141 exacto. Mario5 aprobado/permiso1
  rechazado se consultan otra vez; las cuatro acciones previas475 se corroboran
  por huella/traza parcial sin repetirlas. Esta evidencia acredita lectura;
  la recuperación de alta/decisión se describe en el contrato anterior.
- Empleados, contratos, asistencia, vacaciones y conceptos alimentan planillas.
- Remuneraciones exigen `rrhh.planillas.read`: historial de pagos, comprobante
  y boleta mensual no se abren sólo con `rrhh.access`. Una planilla o un
  empleado de otra empresa responden 404 y las consultas de planillas, pagos,
  asistencia, candidatos y vacantes responden 503 si no pueden leer. El estado
  de un candidato sólo admite postulante, entrevista, seleccionado, rechazado,
  contratado o descartado.
  Si falla la lectura de vacaciones, el cálculo devuelve indisponibilidad;
  no interpreta un fallo de permisos o conexión como cero días.
  El cálculo personalizado usado por la UI también consulta solicitudes
  aprobadas de la empresa y separa sueldo y remuneración vacacional (008),
  manteniendo el ingreso y la base de aportes del mes. Una planilla aprobada
  o pagada conserva sus conceptos y no se recalcula silenciosamente.
  El catálogo padre de empleados pagina1000 con conteos exactos estables,
  IDs únicos yempresa explícita. Fallo/desconocido/truncado/duplicado/ajeno no
  confirma cero ni catálogo parcial; conserva la fila1001. Proyección anidada
  original sin cambios;fuentes_empleados.complete corresponde sólo al padre,
  sin asegurar catálogos hijos de contratos/fichas/horarios.56 dirigidas/cuatro
  controles compilados ydosGET reales tras login UI contra todos los campos
  SQL de8/0 empleados.79 métodos restantes/cálculos/escritores exactos.
  API4319/355,1764fuentes; web/nativo/SQL80/Rust33 por huellas. Ocho empleados/
  ocho contratos y12solicitudes/planillas/pagos intactos; cero writers.
  `rrhh-employee-source-postconditions.json` sólo soporte técnico,ui_complete:false.
  Contrato vigente/calculadora, catálogos hijos/recibos/intenciones ycaso ligado
  a12solicitudes pendientes; no recalcular aprobadas/pagadas. NO_GO global.
  Contratos padre paginan1000 con conteos exactos estables, IDs únicos yempresa/
  empleado solicitado antes de leer. Fuente desconocida/nula/fallida, truncada,
  duplicada oajena no confirma vacío ni catálogo parcial. Ordenfecha_inicio
  descendente previo ydesempateID; array original/proyección de empleado
  conservados. Endpointfuentes_contratos.complete sólo cubre contratos padre.
 88dirigidas/cinco controles compilados/9GET reales tras login contra campos/
  orden SQL de8/0 contratos ycada empleado primario;79 métodos/81endpoints
  restantes exactos. API4351/356,1765fuentes; web/nativo/SQL80/Rust33 por huellas.
  `rrhh-contract-source-postconditions.json` soporte técnico,ui_complete:false;
  selección vigente/calculadora/recibos/intenciones yrelación anidada pendientes.
  Ocho empleados/ocho contratos y12solicitudes/planillas/pagos intactos, cero
  creación/renovación/finalización/cálculo/pago. NO_GO global.
  La calculadora requiere fuentes completas y actuales de empleados y
  contratos planos de la empresa; selecciona el contrato vigente en el período
  con las reglas mensuales del servidor. Datos ajenos, incompletos, fechas
  ambiguas y sueldos desconocidos bloquean el cálculo sin inventar cero.
  Un fallo/reintento conserva días, horas, tardanzas, faltas, bonos e inclusión
  del mismo borrador; actualiza el sueldo confirmado. Una respuesta tardía
  tras cerrar/abrir no reemplaza las fuentes vigentes. Lectores sin permiso
  de cálculo no abren el modal.32 pasos web/32 Windows y49 verificaciones;
  cinco sueldos elegibles de fuentes actuales8/8 coinciden con sus contratos.
  Fórmula, cuerpo operativo y writer exactos. Borrador de lista GET interceptado,
  sin recalcular planillas cerradas ni liquidar12solicitudes. Evidencia
  `rrhh-calculation-source-postconditions.json`, aceptación UI sólo de fuentes.
  Recibos/intenciones de cálculo y variantes operativas conservan pendientes.
  El catálogo padre de planillas pagina1000 con conteos estables, IDs únicos
  y empresa obligatoria antes de ofrecer saldos EPS. Incluye la fila1001 y
  su consumo de crédito; datos ajenos, nulos, fallidos o truncados no confirman
  vacío ni lista parcial. Orden período descendente y desempateID. Aritmética
  EPS y41 métodos restantes exactos. Metadatafuentes_planillas.complete sólo
  cubre el catálogo padre.35 dirigidas/cinco controles compilados/dos GET
  tras login contra todos los campos/orden/arrastre SQL de11/0 planillas.
  API4375/357 y1767 fuentes; web/nativo/SQL80/Rust33 por huellas.
  `rrhh-payroll-source-postconditions.json` sólo soporte,ui_complete:false;
  listado/selección EPS y recibos/intenciones conservan pendientes UI.
  Ocho empleados/ocho contratos y12solicitudes/planillas/pagos intactos,
  cero creación/cálculo/aprobación/pago; NO_GO global.
  Listado y fuentes EPS requieren catálogo padre completo, conteo exacto y
  empresa del actor incluso para un vacío confirmado. Fuente truncada, vacía
  desconocida o ajena y datos cacheados bloquean sin presentar cero ni filas
  parciales. Reintento manual recupera11 planillas actuales; empresa secundaria0.
  Ante fallo EPS se conservan campos y selección, con cálculo bloqueado;
  saldo elegido no disponible también bloquea hasta confirmar un origen actual.
 40 pasos web/40 Windows y44 comprobaciones; detalle/boleta/destinos y demás
  controles del lector exactos. Listados11/0 reales; borrador y crédito25 son
  fixtures GET. `rrhh-payroll-completeness-postconditions.json`, aceptación UI
  acotada a lecturas. Sin cálculo/aprobación/pago ni liquidar12solicitudes.
  Recibos/intenciones de cálculo, detalle paginado y variantes quedan pendientes.
  Detalle padre de empleado_planilla pagina1000 con conteos estables, IDs
  únicos y empresa/planilla obligatorias; conserva empleado1001. Fuente
  desconocida, truncada, duplicada o ajena no confirma vacío ni parcial.
  Orden estableID; array, proyección y tipo de conceptos originales exactos.
  No afirma completitud de relaciones de empleado/conceptos anidados.
 42 dirigidas/15 controles compilados/12 GET tras login:12 filas padre de11
  planillas y secundaria sin filas contra campos/orden/multiset actuales SQL.
 41 métodos restantes exactos; API4406/358 y1768 fuentes, sin escritores.
  `rrhh-payroll-detail-source-postconditions.json` sólo soporte,ui_complete:false.
  Metadata de fuentes/validación de detalle en UI, conceptos hijos y
  recibos/intenciones mantienen sus pendientes. No recalcular aprobadas/pagadas.
  Los conceptos del detalle se leen desde fuentes planas por empresa y
  empleado de planilla, con páginas de1000, conteos estables e IDs únicos.
  Fallo, desconocido, truncado, duplicado o ajeno rechaza el detalle entero;
  un fallo posterior no publica empleados anteriores como completos.
  Lectura padre y mapeo final originales; monto/observaciones/definición sin
  exponer IDs de control.41 otros métodos exactos.71 dirigidas/19 controles
  compilados/12 GET tras login:50 conceptos de12 padres en11 planillas contra
  SQL readonly. Concepto1001 sólo en doble de truncado anidado modelado.
  API4435/359 y1769 fuentes, cero escritores. Evidencia
  `rrhh-payroll-concept-source-postconditions.json` sólo soporte,ui_complete:false.
  Metadata UI/boleta/recibos/intenciones, escalabilidad por padre y snapshot
  de igual cardinalidad conservan pendientes. No recalcular aprobadas/pagadas.
  Detalle y boleta exigen fuentes completas de empleados y conceptos por
  empleado. Conteo incompleto, fuente ajena/desconocida/cacheada bloquea
  la presentación y descarga; reintento explícito recupera la lectura actual.
  Detalle ?fuentes=complete-v1 publica fuentes; sin versión conserva el array
  para clientes anteriores. Boleta confirma empresa/empleado/planilla y lee
  conceptos desde fuentes planas. Campos/mapeos económicos y40 métodos de
  cálculo/escritura restantes exactos;81 otros endpoints exactos.
 69 pasos web/69 Windows,110 dirigidas API/102 del lector y26 GET readonly.
 11 planillas/12 empleados de planilla/50 conceptos actuales;12 boletas HTML
  y8 reintentos por superficie, conceptos/códigos/nombres/importes/empresa/
  empleado/neto verificados. Fuente inválida no genera archivo.
  Evidencia `rrhh-detail-boleta-completeness-postconditions.json`, aceptación
  UI de lectura/descarga. Sin impresión física ni cálculo/aprobación/pago;
  12solicitudes y recibos/intenciones conservan casos propios. NO_GO global.
  El helper de cálculo sólo acepta recibo RPC completo: planilla coincidente,
  idempotent conocido, número exacto de empleados y cuatro importes iguales
  al cuerpo calculado. Fuente desconocida bloquea antes de RPC; recibo parcial,
  ajeno/cacheado/discrepante produce503 sin retry ni inventar cero. Redondeo
  por empleado HALF_UP a centavos como RPC425, verificado SQL10,22/10,21.
  Tres cuerpos/selecciones RPC y42 métodos de cálculo/escritura restantes
  exactos.144 dirigidas/19 controles compilados;11 cabeceras/12 detalles con
  actores durables son fixtures readonly, sin replay ni cálculo real.
  API4526/361 y1772 fuentes. `rrhh-calculation-receipt-postconditions.json`
  soporte,ui_complete:false. No acredita intención original/UUID durable ni
  snapshot tras cambiar fuentes; recuperación/409/conciliación y12solicitudes
  tienen casos propios. No recalcular aprobadas/pagadas; NO_GO global.
  La intención original de cálculo con UUID explícito conserva cuerpo validado,
  actor/empresa/planilla y snapshot calculado completo/EPS/gratificación con la
  transacción de cálculo. Replay lee recibo antes de fuentes/estado; no recalcula
  tras aprobar ocambiar una fuente. Clave ajena409; nueva clave no atribuye un
  cálculo previo. Resolución confirma cálculo ya sellado oabandono atómico que
  impide latePOST. Permiso revalidado después de lock. Tabla app privadaRLSFORCE
  sin grants directos; tresRPC públicas service_role yhelper privado. Sin backfill:
  once lookups readonly de actuales dan null,ledgerUAT0; cero cálculos/replays/
  resoluciones reales. Headerless conserva flujo anterior y tresRPC exactas.
  Fuentes/fórmulas exactas,41otros métodos service/81controller.205 dirigidas/
  21compiladas y seis carreras reales aisladas incluyendo actor/permiso retirado.
  API4587/362,SQL80fresh/restore545productos85687grants,1774fuentes. Respaldo
  privado8,7MB/preflightreadonly/rollback antes deDDL aditivo UAT y filas de negocio
  exactas. Excepción auth corroborada: una sesión de2275 sólo actualizó actividad/
  updated_at; campos privados/identidades restantes exactos frente al respaldo.
  Web/export/nativo/Rust33 por huellas. Evidencia
  `rrhh-calculation-operation-postconditions.json` soporte,ui_complete:false.
  UI privada durable/recibo/retry/recarga/409/conciliación/abandono/actor/reinicio
  y vínculo de12solicitudes siguen pendientes; no recalcular11cerradas. NO_GO global.
  La UI de cálculo conserva bytes del cuerpo operativo original yUUID por
  empresa/actor antes dePOST; no reintenta automáticamente. Recibo parcial/ajeno/
  cuerpo/importes/cache,409/503 preservan pendiente. Recarga/navegación/usuario
  recuperan mismos datos aun con cabecera pagada/ausente ofuentes caídas.
  Confirmación exige acción/ámbito/cuerpo/empleados/campos/importes/conceptos
  completos; archivo del recibo antes de retirar. Corrupción/fallo dearchivo
  conserva intento. Resolver sólo confirma cálculo original oabandono completo.
  Late reply después decerrar ignorada yWeb Locks evita segundoPOST entrepestañas.
  Dosroleslectores reales no retoman intención owner.54pasos:20web/20Windows/
  9late-lock/2antes/3después dereinicio físico19740→1832 mismo binario/perfil,
  cuerpo17días idéntico.30POST interceptados antesdeAPI; cero cálculo/replay/
  abandono real.66contratos/16rechazoscolaJS, Rust34nuevos; cálculo/resolver fuera
  de cola genérica send/enqueue/drainJS/native. Preview/cuerpoAST/lector fuentes
  exactos. Web/tipos/lint/export135HTML/nativo nuevos,1776fuentes; API4587/362 y
  SQL80fresh/restore porhuellas. PG/perfiles/original1768/C6/11SQLite/colas0 intactos.
  `rrhh-calculation-recovery-postconditions.json` UI acotada aconfirmación y
  recuperación. Cálculo/aprobación/pago ligado a12solicitudes yvariantes reales
  siguen con casos propios; no recalcular11cerradas. NO_GO global.
  Nueva planilla también requiere empleados/contratos planos completos/live
  por empresa/período ysueldo vigente conocido readonly. Fuentes ajenas/parciales/
  desconocidas/cache/sueldoNULL/contratoambiguo bloquean alta/cálculo sin0 ni preview
  parcial. Permisos creación+cálculo. Reintento mismo período conserva días21,
  bonos3,17/selección/notas; nuevo período permanece seleccionado yusa contrato
  mensual con preview nuevo. Fuente tardía999 deaperturaanterior no sustituye2,22.
 24web/24Windows+3late/3late,54pasos;8empleados/8contratos y5sueldos actuales
  confirmados.49controles compartidos porhash exacto; fórmula ydos POST AST exactos.
  Web/tipos/lint/export135HTML/nativo22128 nuevos;1776fuentes. API4587/362,SQL80 y
  Rust34 porhuellas. Negocios/12solicitudes/11planillas/PG/perfiles/colas0 intactos;
  ceroPOST. `rrhh-payroll-create-source-postconditions.json` UI sólofuentes.
  DosPOST alta→cálculo aún requieren recibo de creación completo,intención durable/
  409/503/recarga/reinicio ycasos reales.12solicitudes enagosto-noviembre yaocupados:
  no reescribir nirecalcular para forzar caso nuevo. NO_GOglobal.
  La RPC495 de creación sólo confirma un recibo completo: success estricto,
  ID/empresa, período/país/moneda coincidentes, estados originales borrador/
  pendiente, idempotent booleano, actor/fecha durables y metadata original.
  SQL establece creador y fecha. Recibos parciales, ajenos, desconocidos,
  cacheados o discrepantes producen503 sin reintento; contexto/moneda/clave
  desconocidos bloquean antes de la RPC. Su cuerpo y selección permanecen
  exactos, igual que los otros43 métodos, fórmulas y escritores.70 dirigidas/
  19 compiladas y11 ledgers originales readonly; ninguna creación ni replay.
  El contexto del ledger no reconstruye el cuerpo original de la UI. El mock
  completo conserva el descarte de estados/totales enviados por el cliente.
  API4646/363,1778 fuentes; web/nativo22128/SQL80/Rust34 por huellas.
  `rrhh-payroll-create-receipt-postconditions.json` es soporte,ui_complete:false.
  El ack no sella UUID/cuerpo UI durable. Alta→cálculo, resolución,409/503,
  recarga y reinicio conservan una fase propia. Las12 solicitudes en períodos
  ocupados no se reescriben ni se recalculan planillas cerradas. NO_GO global.
  Alta con cálculo reservado: ledger privado del cuerpo completo y dos
  UUID distintos por empresa/actor; creación confirma sólo la cabecera.
  Replay recupera el recibo inmutable antes de leer fuentes actuales; resolución
  explícita devuelve el alta confirmada o bloquea la clave abandonada y el POST
  tardío por RPC495. El cálculo reservado exige cabecera/actor/cuerpo exactos
  antes y después del lock. Diez carreras reales aisladas,240 dirigidas y24
  compiladas; API4699/364,1781 fuentes,SQL80 fresh/restore. El primer fallo de
  concurrencia y sus fixtures se conservan; el guard completo tras el lock pasó.
  Cinco funciones nuevas, cuatro guardadas, ledger RLS FORCE sin acceso directo;
  ambos ledgers0. Respaldo y rollback local previos; negocios/ACL/RLS/políticas/
  outbox exactos. Sesiones comparadas salvo last_activity/updated_at. No se
  atribuyen cuerpos nuevos a once claves históricas ni se hace backfill.
  `rrhh-payroll-create-operation-postconditions.json`: soporte,ui_complete:false.
  Persistencia privada y recuperación UI por etapas,409/503/recarga/reinicio
  pendientes. Once altas y doce solicitudes preservadas; NO_GO global.
  Alta y cálculo por etapas: dos UUID y cuerpos originales privados por
  empresa/actor antes del POST. Recibo de alta archivado y etapa confirmada
  persistida/releída antes del cálculo reservado. Recarga/cierre/409/503 y
  recibos parciales/ajenos/discrepantes/cacheados conservan datos. Resolver alta
  confirma cabecera sin cálculo automático o sella abandono; el cálculo se
  concilia por separado. Archivo completo antes de retirar; corrupción y cuota
  insuficiente conservan pendiente. Respuestas tardías ignoradas y dos lectores
  reales bloqueados.108 pasos web/Windows/reinicio,130 POST interceptados,0
  escritores empresariales. Binario23164→24140, mismo perfil, ambos UUID/cuerpos
  y etapa de17 días; reintento sólo del cálculo. Concurrencia entre pestañas
  acreditada en web; el target CDP extra no sirve el protocolo Tauri nativo.
  70 contratos,24 guardas de cola,16 de cálculo,Rust35; fórmulas/cuerpo del cálculo/
  selección EPS e histórica y validador monetario intactos. Build/export/tipos/lint
  nuevos,1783 fuentes; API4699/364 ySQL80 por huellas. Original1768, PostgreSQL,
  perfiles,11 SQLite/colas0 y evidencias intactos; ambos ledgers0 y once planillas.
  `rrhh-payroll-create-recovery-postconditions.json`: PASS_SCOPED,ui_complete:true
  para recuperación/recibos/resolución/roles/reinicio interceptados. Altas y
  cálculos empresariales positivos y variantes mantienen casos propios. NO_GO.
  Transporte y sesión del alta/cálculo:12 pasos web+12 Windows,22 POST
  interceptados,4 fallos TCP reales contra sink efímero local que no responde
  HTTP; API/PG sin detener. Cuerpo, dos UUID y etapa originales conservados,
  recarga sin envío automático y archivo/resolución completos. Login UI real
  OWNER→lectores con respuesta retenida no avanza/retira/archiva intención ajena
  ni envía hijo; al volver OWNER concilia fixture inmutable sin replay. Sin
  claim de desconexión física/host externo o procesamiento del ACK por el
  documento cancelado. Producto sin cambios,1783 fuentes; gates por huellas,
  actual24140/9f y original1768 preservados;11 SQLite/colas0 y ambos ledgers0.
  `rrhh-payroll-create-transport-postconditions.json`: PASS_SCOPED,ui_complete:true
  para transporte/sesión controlados antes de API; no writer empresarial. NO_GO.
  La fuente de vacaciones aprobadas pagina1000 con conteo estable e identidades
  únicas; empresa/empleado/tipo/estado y fechas deben estar confirmados. Evita
  omitir la solicitud1001 y calcular cero; fallo en cualquier página bloquea
  antes del writer.37 pruebas dirigidas y5 controles del lector compilado,
  incluidos siete registros aprobados actuales/cuatro períodos contra fechas
  distintas en SQL independiente; doce solicitudes y negocios intactos.
  API4097/349,1752 fuentes; web/nativo/SQL80/Rust31 por huellas exactas.
  `rrhh-vacation-source-pagination-postconditions.json` acredita soporte técnico
  de lectura, con cero writers; cálculo/pago UI ligado a las12 solicitudes,
  carga real, concurrencia de igual cardinalidad y otras variantes siguen
  pendientes. Cuerpos de cálculo y escritores sin cambio; NO_GO global.
  Las solicitudes superpuestas o duplicadas cuentan cada fecha una vez dentro
  del mes; una fuente incompleta o con empleado/fechas no verificables bloquea
  el cálculo antes del writer. La calculadora de borrador permite seleccionar
  personas, exige al menos una y valida su lectura en vivo con error/retry y
  descarte de consultas reemplazadas. El sueldo y las tasas se resuelven en
  servidor; los importes de pantalla son estimados.
  El writer495 mantiene cerrada una planilla calculada: sólo admite replay del
  mismo actor/huella, y otro cálculo devuelve409. No hay control de recálculo.
  El caso local creó contratos agosto3000/septiembre3300 y dos solicitudes
  superpuestas29ago–3sep: septiembre2970regular/330vacacional/neto2871. Agosto
  conserva el negativo previo2500/500 sin reescribir ni aprobar. El nuevo debug
  calculó un caso independienteAFPnoviembre2025Ana1800/neto1567.44, sin pago.
  Tres planillas nuevas permanecen calculadas; las fotografías anteriores,
  banco/diario/tributos quedaron intactos (`rrhh-cross-postconditions.json`).
- El listado de planillas requiere una respuesta en vivo completa; un error
  retira filas, métricas y controles de alta y permite reintentar. Sólo una lista
  vacía confirmada ofrece la primera planilla. Detalle exige empleado, conceptos,
  importes y la identidad del período/empresa; una calculada o pagada sin detalle
  verificable presenta error, nunca “sin calcular”. Reporte y boleta validan
  también la identificación empresarial antes de descargar y ofrecen reintento
  persistente. Cerrar el detalle o salir invalida sus consultas y descargas tardías.
  Ocho fotografías4pagadas/4calculadas contrastadas desde web/nativo, roles de
  aprobación/pago, lector403 y empresa2vacía; cero escrituras y fuentes exactas
  (`rrhh-payroll-reads-postconditions.json`). Los HTML reales de diciembre conservan
  ingresos3762/descuentos232.56/neto3529.44 y la boleta separa aporte patronal162.
  Dos páginas derivadas de esosHTML revisadas individualmente; estilo simpleP3
  del reporte e impresión/archivo nativo pendientes.
- Configuración laboral, maestros, reclutamiento, asistencia, solicitudes,
  beneficios, evaluaciones, capacitaciones, horarios, expediente, contratos y
  ficha PLAME convergen en un writer operativo con actor, permiso, huella e
  idempotencia. El job de ausencias exige un actor técnico explícito y falla
  cerrado si no está configurado.
- El alta y edición de empleados recuperan la intención en el writer antes de
  comprobar duplicados; la unicidad documental permanece en la transacción y
  el índice de base de datos. Un reintento del alta devuelve el mismo empleado.
  En Perú, guardar explícitamente `tiene_hijos=false` y `cantidad_hijos=0`
  retira el indicador derivado de asignación familiar; editar otros datos lo
  conserva. El formulario mantiene sus campos ante un fallo de guardado y sólo
  se cierra cuando la operación devuelve éxito.
- Reclutamiento conserva los años de experiencia y el estado civil opcional
  del candidato al crear y editar (writer 543). No completa datos personales
  ausentes por defecto. La lista y el filtro usan la vacante persistida; un
  fallo o respuesta incompleta en candidatos, vacantes o departamentos retira
  las filas, métricas y formularios y permite reintentar. Sólo publica los tres
  catálogos cuando la carga completa es válida; descarta consultas obsoletas.
  Rechazado y contratado son estados de selección, sin alta automática de
  empleado o contrato. No hay control UI de baja de candidato localizado.
- Reportes RRHH consulta empleados y departamentos juntos. Una lectura fallida
  o incompleta muestra indicadores no evaluados y retira la distribución;
  Actualizar recupera la consulta. Distingue una empresa vacía real de un fallo
  y respeta el acceso por actor. La inactivación conserva a la persona en el
  total histórico y en su departamento, separada del personal activo. El reporte
  ofrecido no tiene exportación o impresión propias.
- El país del tenant selecciona el motor normativo; no se mezclan reglas entre
  Perú, Argentina y Colombia.
- Calcular una liquidación PE/AR/CO sólo congela el cálculo: no inactiva al
  empleado ni termina su contrato. La confirmación explícita exige actor y
  aplica cese, devengo y outbox en una frontera transaccional e idempotente. El
  asiento separa beneficios sociales en `Dr 629` y el resto remunerativo en
  `Dr 621`, contra `Cr 411`, usando componentes congelados del cálculo.
  En Perú, el récord de vacaciones comprende desde ingreso hasta cese inclusivo;
  solicitudes aprobadas intersectadas se recortan a esos límites y cada fecha
  cuenta una vez, también al cruzar aniversarios. No suma descansos médicos,
  permisos ni licencias. Fuente incompleta, fechas inválidas o fallo de lectura
  bloquean el cálculo sin crear fotografía; el formulario conserva sus datos.
  UI web acreditó cese9oct2026:9fechas/vacaciones1450/total4590; nativo cese6oct:
  6fechas/vacaciones1633.33/total4756.66. Contrato2000, ingreso1oct2025 y declaración
  previa de gratificación0 con fecha/referencia; no genera un pago externo.
  El baseline7oct negativo se conserva y no se recalcula, confirma ni paga.
  Tres fotografías nuevas sólo calculadas; empleado/contrato activos y fuentes
  anteriores exactas (`rrhh-liquidation-cross-postconditions.json`).
- El mismo calculador puede reemplazar una liquidación que aún está calculada:
  el borrador anterior queda anulado con actor/fecha de recálculo y se crea una
  fotografía nueva. Una aprobada o pagada conserva su protección. La prueba449
  valida el contrato vigente y revierte su sonda de recálculo para conservar
  el resto de sus casos de confirmación/pago; no recalcula históricos UAT.
- Una liquidación aprobada se paga completa. La transferencia registra la
  evidencia laboral, el cargo bancario y el evento de pago en el mismo commit;
  su asiento es `Dr 411` contra la cuenta bancaria exacta congelada, no contra
  una cuenta genérica. La reversa restaura el mismo banco y obligación aunque
  el banco o la cuenta contable se desactiven después, crea el contra-asiento y
  conserva el pago original como evidencia `REVERTIDO`. Nuevos pagos de
  liquidación son sólo por transferencia; efectivo legacy sin sesión/movimiento
  inequívocos falla cerrado y exige regularización.
  Los selectores de destino bancario laboral exigen exclusivamente
  `rrhh.liquidaciones.pay` o `rrhh.cts.deposit`, según la operación. Devuelven
  cuentas activas del mismo tenant sin saldos ni movimientos y no conceden
  acceso general a Finanzas. Un fallo de lectura es recuperable desde la UI.
- Liquidaciones/CTS consulta empleados, liquidaciones, depósitos y destinos
  bancarios juntos en vivo. Valida identidad, empresa, importes, estados y
  relaciones; carga/error retiran filas y acciones, con reintento que conserva
  el formulario. Una respuesta incompleta no acredita ausencia de registros.
  Cálculo, confirmación, pago, depósito y reversa se ofrecen por su permiso;
  los destinos sólo se consultan para quien puede pagar/depositar. La caché
  distingue actor y empresa. Web/nativo verificaron 24 variantes de fallo,
  recuperación, roles, empresa secundaria vacía, navegación tardía y cinco
  liquidaciones/tres CTS contra filas crudas, sin writers en esta fase
  (`rrhh-benefits-reads-postconditions.json`).
- CTS usa un libro independiente: recalcular sólo modifica filas `CALCULADO`,
  nunca reabre un depósito realizado. Depositar exige cuenta bancaria, actor y
  referencia, y genera tesorería/outbox/asiento atómicos (`Dr 629` contra la
  cuenta tesorera exacta, mientras no exista un evento separado de provisión).
  Una CTS pendiente que
  ya se incorpora a la liquidación final queda consumida para impedir doble
  pago.
- Perú calcula AFP/ONP, EsSalud, quinta categoría, gratificaciones, CTS,
  vacaciones y liquidación peruana con sus topes y libros idempotentes.
- La CTS incorpora un sexto de la gratificación efectivamente percibida,
  excluyendo la bonificación extraordinaria. Usa conceptos de planillas
  pagadas y admite una fuente externa declarada con importe, fecha,
  referencia y actor si falta historia del ERP. Esa declaración no registra
  un pago ni sustituye una lectura fallida. Criterio:
  [TUO CTS, art. 18](https://cdn.www.gob.pe/uploads/document/file/229267/TUO_Compensacion_por_Tiempo_de_Servicios_-_D.S_001-97-TR.pdf?v=1542374771).
- La base computable de CTS semestral corresponde a abril u octubre. El
  contrato histórico del mes se conserva aunque haya un aumento posterior.
  Si falta historia o contiene variables anteriores al ERP, la interfaz admite
  una base computable explícita por trabajador, con período, referencia y actor;
  excluye el sexto de gratificación, que se incorpora por su fuente separada.
- La gratificación ordinaria de julio/diciembre toma la remuneración histórica
  de junio/noviembre, también en planillas personalizadas. La base computable
  declarada conserva referencia y actor en un snapshot atómico; no cambia el
  salario contractual vigente. Criterio:
  [MTPE, remuneración al 30 de junio/noviembre](https://www.gob.pe/institucion/mtpe/noticias/567385-navidad-2021-gratificacion-se-debe-de-pagar-en-la-quincena-de-diciembre).
- La gratificación trunca cuenta meses calendario completos incluyendo el
  último día trabajado. La base corresponde al mes anterior al cese: contrato
  histórico o base computable externa declarada y auditada; no usa un aumento
  del mes del cese como base anterior. Descuenta gratificación y bonificación
  de diciembre ya percibidas para evitar doble pago. Criterio:
  [Guía MTPE, sección III](https://cdn.www.gob.pe/uploads/document/file/3321103/guia_gratificaciones.pdf).
- La bonificación de gratificación usa ficha SUNAT: EsSalud regular (Tabla 32,
  `00`) aplica 9%; EsSalud y EPS (`01`) aplica 6,75% y exige entidad de Tabla
  14. Sin ficha se conserva EsSalud del contrato previo. Los códigos de salud
  especiales bloquean ese cálculo en lugar de aplicar una tasa general.
  [SUNAT, régimen de salud](https://www.sunat.gob.pe/ayuda/tributos/tregistro-E-P/T-RegistroTrabajadorPrivado-H04.html),
  [SUNAFIL, bonificación y meses completos](https://www.gob.pe/institucion/sunafil/noticias/986315-el-pago-por-horas-extras-ingresa-dentro-del-calculo-para-la-gratificacion-de-julio).
- El motor verificado de beneficios corresponde al régimen laboral general.
  El devengo contable peruano lee los conceptos de `empleado_planilla`, separa
  AFP, ONP y quinta categoría, y reduce remuneraciones por faltas/tardanzas;
  compara los totales persistidos con el evento antes de contabilizar. El
  aporte EsSalud neto de crédito EPS es patronal y se imprime separado del
  descuento salarial en la boleta de la empresa correspondiente.
  No se acredita cálculo de beneficios especiales REMYPE por el hecho de
  exportar una ficha PLAME/T-Registro.
- El crédito EPS patronal se parametriza por cobertura, pago efectivo, fecha
  y referencia. Aplica los límites 25% del aporte de cubiertos, importe pagado
  y 10% UIT por cubierto; en cobertura anterior conserva base, cubiertos y UIT
  de origen. El snapshot auditado guarda crédito generado/aplicado/saldo y neto
  EsSalud sin modificar el neto salarial. Un saldo ERP se selecciona por
  planilla origen y no puede omitirse ni consumirse dos veces; una fuente externa
  previa exige referencia explícita. La declaración no registra un pago a EPS.
  [SUNAT088-2004](https://www.sunat.gob.pe/legislacion/oficios/2004/oficios/i0882004.htm).
- El origen del saldo EPS exige una lectura completa en vivo, separada por
  actor/empresa/período. Error o carga ocultan el selector y bloquean alta y
  cálculo; el reintento conserva los campos y la fuente. Una selección que
  dejó de estar disponible exige elegir otro origen explícitamente.
  DesdeUI: cobertura histórica generó500/aplicó180/saldo320; marzo sin
  afiliados actuales aplicó180/saldo140 y abril aplicó140/EsSalud40/saldo0.
  Un segundo formulario preparado con el origen ya consumido recibió409,
  conservó un borrador sin detalles y recuperó ese mismo borrador con marzo.
  Tres netos1740, seisHTML reales y seisPDF revisados, sin aprobación/pagos
  (`rrhh-eps-carry-postconditions.json`).
- El modal de pago consulta detalle y destinos completos en vivo y publica
  ambos juntos. Carga/error retiran importes, cuenta y acción de pago;
  retry conserva cuenta/referencia y descarta respuestas anteriores al cierre.
  Una fuente bancaria o de caja fallida/incompleta devuelve503, nunca un vacío
  que permita pagar con una cuenta retenida.
  Pagos/reversas laborales requieren confirmación en vivo: no entran en la
  cola offline ni producen éxito local. Una intención de versiones anteriores
  se conserva para confirmación explícita desdeUI; se envía el DTO admitido
  con la clave idempotente original. El reintento no agrega cargos ni eventos.
  Marzo/abril EPS aprobados/pagados desdeUI con tres actores separados:
  neto1740 cada uno, EsSalud0/40 y dos cargos únicos. Cuatro asientos confirmados
  cuadran2000/2040 de devengo y1740 por pago; boletas pagadas, banco y ledger
  cotejados en web/nativo, ochoPDF revisados (`rrhh-eps-settlement-postconditions.json`).
- En la planilla peruana mensual, una remuneración asegurable positiva menor
  que la RMV usa esta última como base mínima de EsSalud, incluso por un mes
  incompleto. Un mes sin remuneración no genera ese aporte. La corrección se
  aplica al cálculo ordinario y al personalizado; no incrementa AFP/ONP ni
  descuenta la diferencia al trabajador. Criterio:
  [Informe 003-2007-SUNAT/2B0000](https://www.sunat.gob.pe/legislacion/oficios/2007/oficios/i0032007.htm).
- La configuración laboral Perú expone la normativa efectiva del período
  (UIT, RMV, asignación familiar, AFP/ONP, EsSalud, horas y sobretasas). Los
  contratos AFP conservan administradora, esquema de comisión y tasas
  individuales; la planilla usa esos valores y recurre a la normativa vigente
  sólo como respaldo.
- `Configuración > RRHH` permite a ADMIN de la empresa registrar y revisar
  normativa mensual histórica o futura, con referencia, versiones y auditoría.
  No modifica valores globales. El período queda bloqueado si existe una
  planilla calculada, aprobada o pagada; junio y noviembre también se bloquean
  cuando la gratificación del mes siguiente fue calculada. El cálculo fija la
  norma usada y rechaza una versión que cambió entre lectura y persistencia.
- El máximo mensual asegurable AFP se configura con sustento para ese período.
  Limita únicamente la prima del seguro; no limita aporte obligatorio ni
  comisión de flujo. Sin ese parámetro, sólo se bloquea un cálculo AFP con prima
  positiva. ONP no lo requiere y nunca se hereda el tope de otro período.
- La quinta categoría proyecta las gratificaciones proporcionales que
  corresponden a la fecha de ingreso, con bonificación de EsSalud o EPS.
  Para septiembre, octubre y noviembre deduce retenciones hasta agosto;
  una lectura fallida del historial devuelve indisponibilidad y no inventa
  ingresos o retenciones previos iguales a cero.
- El cálculo de planilla exige normativa peruana activa del período, propia o
  global configurada. Una fila ausente o incompleta bloquea el cálculo; un
  fallo de lectura devuelve indisponibilidad. No sustituye esos casos por tasas
  constantes de otro período.
- El sueldo y régimen pensionario peruanos se seleccionan entre contratos
  vigentes que intersectan el mes liquidado: una renovación futura o una fecha
  de fin anterior al mes no sustituyen el contrato correspondiente. Esto no
  implementa prorrateo de varios contratos ni recalculo de empleados inactivos.
- Los conceptos de gratificación, bonificación extraordinaria y remuneración
  vacacional se aprovisionan para Perú al configurar la empresa (544), sin
  sobrescribir conceptos existentes. La consulta de conceptos no inserta filas;
  informa si faltan conceptos activos antes de procesar una planilla.
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
- Congelar un paquete conserva una intención por tenant, actor, planilla y notas.
  Reintentar con la misma clave devuelve la respuesta original aunque cambien la
  jornada o el corte; una intención nueva crea otra versión. La clave no puede
  reutilizarse con otro actor o notas. El actor debe seguir activo y autorizado
  en cada reintento; el writer interno sólo se invoca desde el wrapper autorizado.
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

Al iniciar sesión se conserva el destino `redirect` dentro del espacio autorizado
del actor: `/dashboard` o `/superadmin`. Se mantienen filtros y anclas, mientras
que destinos externos, rutas de otro espacio y caracteres de control vuelven al
dashboard correspondiente. La navegación completa mantiene la cookie HttpOnly.

El reinicio confirmado del asistente descarta sus claves anteriores de pasos,
cierre y logo. Una respuesta fallida conserva la intención de reinicio para
reintentar; tras confirmarla, una configuración nueva obtiene otro intento de
cierre y no reutiliza el recibo anterior. No borra intenciones de otros módulos.
El resumen admite una serie de notas de crédito todavía nula y la muestra como
pendiente, conforme al campo opcional del alta. Sigue rechazando una respuesta
sin esa propiedad o con un tipo inválido, y valida los demás datos empresariales.

El panel publica métricas y actividades juntas después de validar ambas lecturas
en vivo. Carga/error retiran métricas, gráficos y fecha de sincronización, con
reintento; respuestas reemplazadas o posteriores al desmontaje se descartan.
Una fuente backend fallida o incompleta devuelve503 antes de publicar o guardar
caché de estadísticas. Los vacíos válidos de otra empresa se conservan como tal.
El corte local corroboró siete fuentes fallidas/retry y22documentos contra filas
crudas, web/nativo68pasos, lectores403 y empresa2vacía, sin escrituras
(`operational-reads-postconditions.json`).

Ayuda conserva fichas locales por país y tours optativos. La lectura de temas
fallida muestra aviso y reintento; un catálogo vacío sólo se trata como tal tras
respuesta válida. El backend informa503 ante indisponibilidad sin revelar el
diagnósticoSQL. Las respuestas locales del panel se separan por empresa/actor y
se descartan consultas de temas anteriores al cambiar el contexto. Las RPC de
ayuda mantienen su filtro tenant/global;583 agrega sóloSELECT del backend sobre
knowledge_base, conservando filas, RLS, propietario y demás concesiones.

Los tours aplican sus coordenadas, miden el cuadro real y lo centran cuando
su elemento no existe o no es visible en la pantalla. Avanzar/retroceder,
finalizar, repetir, saltar/cerrar y resetear guardan progreso en este navegador.
Los recorridos de administrador7pasos, vendedor7 y cajero8 se verificaron;
los dos últimos también en390×844. Instrucciones centradas desdeAyuda no
acreditan operar el negocio explicado ni destacar elementos en otras pantallas.
Ayuda en Windows corroboró ADMIN/VENDEDOR/CAJERO y su tour correspondiente,
catálogo503/retry200 vacío,35fichas por país y navegación contable readonly.
Los tres tours nativos recorren22pasos con geometría/controles y regreso, hasta
Finalizar. Finalización de tres tours, repetición/salto/cierre y reset con recarga
también comprobados por UI nativa; sólo esa preferencia de fixture reversible
se restituyó al valor anterior byte exacto.
P2 corregidos: menú Ventas desplegable sin data-tour, reproducido web/nativo;
capas de resaltado0x0, ahora rectángulo/borde/sombra sin interceptar clics;
descripción/Anterior gris fijo poco legible sobre card oscuro, contraste2.41
nativo, ahora colores semánticos medidos en ambas interfaces.12pasosweb y58
nativos del nuevo binario, diez colas0 (ocho previas y dos de VENDEDOR/CAJERO) y todas las fuentes empresariales intactas.
Detalle positivo/503/nulo/retry/cierre se comprobó sólo con GETfixtures antes
de API; no constituye artículo empresarial real. Otras variantes de progreso nativo
y elementos de tours en sus pantallas/estados requieren casos propios.
P3 observado por UI nativa: completar/saltar de nuevo añade un ID ya registrado; no se
limpió el perfil. Evidencia `help-native-postconditions.json`.
El catálogo local no contiene artículos: apertura y recuperación de un detalle
real permanecen pendientes.

Offline actualiza consultas generales disponibles por empresa y usuario. El scope de
cachéHTTP viene explícitamente de la sesión; sin empresa o usuario activos no consulta ni
almacena contenido, y el backend sigue resolviendo el tenant desdeJWT. El fallback
del navegador sólo lee respuestas del mismo actor/empresa; entradas antiguas
sin usuario no se entregan. ADMIN→lector inventario de la misma empresa repitió
403 online y fallo de red sin recibir clientes del administrador. El cambio
principal→empresa2→principal preservó cada catálogo y su caché autorizada. Login
nuevo y401/403 invalidan las lecturas del actor, manteniendo operaciones
pendientes.76snapshots
repitieron empresa y actor correctos. No acredita proyecciones/binarios nativos
SQLite/Tauri. El cambio real de permisos del mismo actor se verificó en el
navegador:403 invalida las lecturas, y respuestas iniciadas antes de ese rechazo
se descartan sin repoblar la caché. La cola pendiente se conserva.
Se retiraron rutas históricas, consultas que necesitanID y administración global
del lote predeterminado; detalle por registro se conserva al consultarlo en su
pantalla. ADMIN completó76/76snapshots sin entradas nuevas anónimas. La cola
vacía impide sincronizar y perder conexión bloquea snapshots/sincronización;
volver online permite refrescar. Edición de cliente reconoce202 con cola durable:
informa cambio pendiente en el navegador, conserva el formulario y bloquea otro
envío. Recargar recupera el cuerpo pendiente sin afirmar actualización del
servidor; el enlace lleva a la cola para sincronizar. El casoUI con desconexión,
503 previo al commit y reintento conservó el mismo elemento y confirmó el teléfono
tras recarga; PostgreSQL verificó una alta y tres actualizaciones para tres
intenciones independientes, sin efectos financieros. No acredita POS/fiscal
offline, resolución de conflictos ni ACK perdido tras actualización.

El caso nativo posterior usó Tauri2/WebView2 e IPC reales. ADMIN→lector→ADMIN
verificó SQLite separado por empresa/actor:403 y fallo de red no entregaron
clientes ajenos; login nuevo exigió lectura autorizada antes del fallback.
Una lectura200 real demorada tras revocación y403 quedó descartada sin repoblar
la caché. La edición informó pendiente202, conservó formulario/cola al recargar
y bloqueó otro envío. El lector no pudo ver ni sincronizar la intención del
dueño; volver al ADMIN conservó su ID. La intención anterior rechazada400 por
campos locales se recuperó con el mismo cuerpo durable y DTO correcto.
Otro pendiente conservó su ID tras503 previo al commit y se confirmó200 al
reintentar; recarga mostró987570008. PostgreSQL y SQLite corroboraron tres
intenciones nativas sincronizadas, una alta y siete actualizaciones totales
(incluida una actualización online durante un fallo del harness),102asientos
y cerooutbox. Evidencia: `native-actor-final-postconditions.json` y los casos
nativos en la matriz. No acredita instalador, otros
catálogos/binarios, cambio de actor durante sincronización en vuelo ni pendientes
legacy reales: estos últimos sólo se comprobaron técnicamente con SQLite aislado.

El ejecutable posterior con frontend embebido verificó edición de cliente,
recarga y vuelta al detalle; RMA existente y el rechazo de editar un asiento
inmutable también conservaron IDs reales. Las dos rutas antes no exportables
recibieron wrappers estáticos, manteniendo sus pantallas. La restauración segura
previa a consultas iniciales evitó401 falso de país y desvío al asistente.
ADMIN→lector→ADMIN repitió403/red perdida y fallback propio: SQLite5/0clientes.
La ficha de cliente interpretó el contenedor nativo y conservó el registro al
recargar con GET bloqueado. `native-static-postconditions.json` confirmó cero
escrituras empresariales nuevas, siete actualizaciones previas y102asientos.
Esto acredita las rutas comprobadas en un ejecutable debug Windows, no el
instalador, otros sistemas operativos ni todos los recorridos offline.

El resumen de Configuración marca SUNAT preparado sólo cuando el estado fiscal
canónico y la verificación de configuración están listos. La mera presencia de
un archivo PFX no acredita vigencia ni conectividad. RRHH Perú refleja la
normativa del período consultado; no muestra configuración laboral completa
si ese período carece de normativa aplicable.
Empresa, estado fiscal y OSE distinguen errores de lectura de configuración
incompleta;503 inducido yreintento recuperaron cada lectura real. Principal y
segunda empresa mostraron sus identidades tras cambio de sesión yrecarga.
El selector de logo bloqueó MIME y tamaño no admitidos sin enviar solicitudes;
contenido PNG inválido recibió400 y conservó configuración yreintento. Carga,
reemplazo yborrado positivos enStorage siguen sin aceptación funcional actual.
Las lecturas opcionales deRRHH requieren su permiso y se consultan sólo en
Resumen/RRHH. El lector con `configuracion.read` puede consultar Empresa y
Ventas sin ese permiso; Resumen muestra RRHH “No evaluado”. El PNG válido del
lector recibió403 y la empresa conservó su identidad, sin assets ni auditorías
de escritura. El control de carga todavía resulta visible para ese lector.

- Tenants, usuarios, roles y permisos determinan acceso.
La edición posterior al onboarding de Empresa ofrece razón social, nombre
comercial, dirección fiscal, teléfono y correo sólo con `configuracion.write`.
Razón y dirección son obligatorias. Vaciar teléfono/correo guarda NULL; vaciar
nombre comercial restablece el nombre registrado mediante el trigger vigente.
Omitir un campo conserva su valor. UI confirmó vaciado/restauración200 reales
y replay de clave original sin otra auditoría/intención/evento:dos operaciones,
originales restaurados, configuración fiscal/empresa2 y negocio preservados.
El primer200 tuvo FAIL del arnés por asumir nombre comercialNULL, conservado.

La confirmación exige recibo completo en vivo de empresa/valores esperados;
200 incompleto, caché/offline/pending/queued conservan borrador y retry. Clave,
cuerpo y formulario se guardan por empresa/actor; campos pendientes congelados
y reintento manual sobreviven cancelar/reabrir/recargar/reinicio realWindows.
Seis corrupciones bloquean guardado sin borrar o reemplazar intención; error
JSON usa mensaje recuperable en español. Lector sin editor y empresa2 con
perfil propio no exponen borradorOWNER; regresoUI recupera original. Se abandona
modal antes de logout, sin acreditar cambio de actor en vuelo del componente.

La recuperación real del intento legacy requirió copia técnica explícita desde
solicitudUI y huella antes de actualizar binario; no acredita cuerpo persistido
en el legacy. Positivos reales previos se reutilizan por equivalencia exacta
del editor y función de recibo; negativos/roles/lecturas/reinicio se repitieron
en el binario actual. No se repiten operaciones confirmadas ni se fabrican
recibos. El asistente completado queda para consulta; rotación de certificado
y parámetros fiscales conservan sus pendientes.

La cola de navegador exige empresa/usuario para listado, contadores,
sincronización yborrado. UI conservó el pendiente ADMIN, ocultándolo al lector
de su empresa, y lo sincronizó con el mismoID al volver aldueño. El corte actual
de cliente es987570009/nueve actualizaciones, con102asientos ysin escrituras
del lector. UnACK perdido por elharness tras commit produjo otraUPDATE de
auditoría al reintentar; no acredita exactamente una ejecución delPUT.
La respuesta en vuelo mantiene elscope que originó la solicitud y detiene el
resto del lote al cambiar actor; esa carrera sólo está acreditada técnicamente.
Evidencia: `queue-company-editor-postconditions.json`.

- Crear rol requiere consultar íntegramente sus permisos: falla o contrato
  inválido muestra error/reintento y bloquea el alta; recuperar conserva nombre
  y descripción. Cancelar/reabrir descarta respuestas anteriores. Éxito sólo se
  informa al recibir elID del rol; el retry conserva la llave y los campos.
  Un rol propio con dos permisos de lectura de inventario completó alta conACK
  perdido/retry mismoID, duplicado409 sin sustitución, asignación a usuario,
  login/lectura y Accesodenegado enUsuarios; empresa2 no muestra rol/usuario.
  Un rol y un usuario, auditoría única poralta y102asientos conservados. La UI
  ofrece crear/listar/asignar; no se localizaron controles para editar/desactivar
  el rol o reemplazar sus permisos aunque existan endpoints técnicos.
- La pantalla de usuarios sólo habilita gestión cuando usuarios, roles y
  métricas se consultan íntegramente. Un fallo de lectura muestra error y
  reintento; no se presenta como catálogo vacío ni como alta del primer usuario.
- Login limita por cuenta/IP y por IP de oficina. Ambos bloqueos publican
  `Retry-After` estándar; el agregado conserva también `Retry-After-Office`.
  Respetar ese plazo permite reintentar sin desactivar las defensas.
- En demo, `ADMIN_DEMO` puede crear usuarios y roles operativos del propio
  tenant para probar segregación y permisos. No puede delegar `users.manage`,
  conceder permisos globales ni crear otro `ADMIN_DEMO` mediante un writer
  alterno; el actor debe poseer autorización administrativa real.
- El alta administrativa usa la identidad local canónica del ERP: contraseña
  cifrada en `usuarios_sistema`, roles y auditoría se confirman en una sola
  transacción. No se crea una segunda cuenta en el proveedor de autenticación.
  `/usuarios-sistema` (pantalla vigente) y `/users` (compatibilidad) delegan al
  mismo writer; creación exige llave idempotente y actor activo del tenant.
  La respuesta sólo incluye `temporaryPassword` cuando el servidor la generó y
  el usuario se acaba de crear: la contraseña elegida por el administrador no se
  devuelve y un reintento no inventa otra distinta de la guardada.
- Cambiar datos/estado/roles revoca sesiones al inactivar, impide la
  auto-desactivación y protege al último superadministrador. Roles y permisos
  también se crean o reemplazan atómicamente, los roles de sistema son
  inmutables y un rol no puede desactivarse si dejaría un usuario activo sin
  acceso. Las decisiones RBAC no usan caché local entre réplicas.
  La baja desde otra ventana se verificó con un vendedor conectado y leyendo
  clientes: siguiente consulta401, regreso al login y nuevo acceso bloqueado.
  La cuenta quedó inactiva con rol y teléfono originales, sin efectos físicos
  ni contables. El reemplazo temporal del lector contable por inventario se
  verificó desde Usuarios con dos sesiones abiertas, navegador y escritorio:
  consulta siguiente403 sin cálculo previo; al restaurar el rol, Reintentar200
  en las mismas sesiones. Fallo503 de edición conserva rol elegido y no cambia
  datos. Dos cambios restauraron identidad/rol originales, sin efectos físicos,
  contables ni nuevas versiones tributarias. Múltiples roles y retirada de
  permiso durante una escritura permanecen sin aceptación.
- Un login normaliza el email y crea la sesión en la misma transacción que
  valida usuario y tenant, limpia bloqueos y registra el último acceso. Un
  tenant demo sólo inicia sesión mientras su período de prueba siga vigente.
  Las sesiones revocadas se rechazan en el request siguiente, sin una ventana
  de caché positivo; los tokens de reset nunca se exponen en respuestas HTTP.
- Países operativos: Perú, Argentina y Colombia. El selector inicial y la demo
  crean el tenant con su país, moneda, impuesto, autoridad fiscal, documentos y
  opciones de módulos; el contexto se vuelve a resolver desde el tenant.
- El alta administrativa de empresa, su primer administrador y el RBAC
  operativo se confirman en una sola transacción idempotente. El primer usuario
  administra sólo su tenant: el bootstrap no concede `is_super_admin` ni omite
  el asistente fiscal. Los reintentos no
  duplican tenants; activar o desactivar sincroniza `tenants` y
  `empresa_config`, y la desactivación revoca las sesiones sin borrar su
  evidencia.
- `/configuracion` y `/configuration` conservan compatibilidad HTTP, pero sus
  escrituras convergen en las mismas fronteras SQL: empresa, parámetros, GRE,
  wizard, series y preferencia de país exigen actor y llave idempotente, toman
  locks por tenant y dejan auditoría. Crear o editar una serie usa el mismo
  contrato, sin recuperar el upsert directo anterior. Los tipos de serie se validan contra los contratos operativos y fiscales vigentes; formato/límites inválidos retornan 400 y una intención reutilizada con otro cuerpo retorna 409, sin persistir residuos. La lectura de parámetros respeta cero decimales y los booleanos false; el valor por defecto sólo sustituye campos ausentes.
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
  La validación previa del PFX contrasta el RUC que el cliente está introduciendo,
  sin cambiar el emisor persistido; al completar el alta se vuelve a validar el
  certificado contra la identidad definitiva antes de guardar y cifrar.
- El asistente distingue identidad básica preparada de progreso finalizado.
  Restaura el progreso público y sólo muestra resumen cuando el servidor confirma
  el cierre. Una consulta fallida bloquea avanzar y permite reintentar; conserva
  la misma intención ante respuestas perdidas de paso o cierre. La consulta
  autenticada del estado demo sigue disponible con la creación demo desactivada.
  Estado, progreso, empresa y demo requieren sus contratos públicos completos;
  una respuesta200 incompleta no habilita resumen, avance ni escrituras
  automáticas. La confirmación del paso debe identificar el paso guardado y el
  cierre debe incluir fecha de finalización válida. Carga/error retiran datos y
  acciones; el reintento descarta respuestas anteriores o de otro actor.
  Web y nuevo debug aprobaron52pasos cada uno, lectores403 y resumen propio de
  empresa2, sin escrituras durante retest (`wizard-reads-postconditions.json`).
  Ambas empresas ya estaban completadas: Welcome se probó con progreso null
  inducido, sin reiniciar el asistente. El baseline previo produjo dos escrituras
  automáticas de configuración, registradas y preservadas en su checkpoint.
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
  los lee. El listado administrativo puede incluir anexos inactivos para reactivarlos, manteniendo el mismo alcance del usuario; la consulta por identificador no permite saltar su asignación. Alta, edición, desactivación y asignación se confirman con actor/permiso vigente, intención y auditoría dentro de una transacción. El reemplazo de asignación conserva la anterior si falla; una lista vacía válida restituye el alcance total. La UI conserva campos e intención tras una respuesta perdida y sólo cierra el editor después del éxito.
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

El dashboard operativo presenta ventas registradas netas por moneda: notas de
crédito restan, CPE borrador/anulado/cancelado/rechazado/error no suma y POS
conCPE no se duplica. Compras muestra órdenes vigentes, excluyendo
anuladas/canceladas/rechazadas. La base es explícita; otros importes se
separan por moneda original, sin conversión. Actividades mantienen moneda e
importe firmado; OCRECIBIDA apareceCompletado. La tasa comercial incluye
cotizaciones aceptadas o convertidas, sin afirmar venta facturada/cobrada. La
UI no anuncia un crecimiento0% sin cálculo.

Las métricas y actividades aceptan los códigos SUNAT01/03/07/08 y sus nombres
persistidos FACTURA/BOLETA/NOTA_CREDITO/NOTA_DEBITO, con el mismo signo e importe.
Tipos desconocidos siguen produciendo error sin publicar ni cachear parciales.

Métricas/actividades completas y vivas se publican juntas. Flags
cached/queued/offline/pending en envoltorio/datos/filas se rechazan;
headercache/queue se rechaza por requireLive. Fallo retira indicadores/sync,
retry manual recupera; consulta retenida bloquea Actualizar y sólo ambas
completas publican. NavegaciónSPA invalida respuestas tardías. El
snapshotbackend breve/versionado conserva ultimaActualizacion y scope por
empresa; no se confundió con datos de cachéoffline.

79pasosweb/79nativos,107checks/API3535/331 fresh y
webbuild/tipos/lint/export136/debugnuevo;1704fuentes,Rust23/SQL80 por hashes
exactos. VentasPEN496.03/comprasvigentes572.02 corroboradas contra
SQLreadonly;24CPE,seis activos/siete maestros/152GL y bancos exactos,0writers.
USD y neto negativo positivos sólo GETfixtures antes deAPI. Dos lectores
yempresa2vacía reales/regresoOWNER, perfil y diez colas0
conservados;3180evidencias previas intactas. Indicadores heurísticos/fecha
diaria/fronteras,volumen,otrasmonedas reales y restantes dominios/externos
siguenpendientes. Ver `dashboard-operational-postconditions.json`; aceptación
globalNO_GO.



- Analytics consume métricas tenant-scoped.
- Reportes exportan sin duplicar reglas de negocio.
- Auditoría registra actor, tenant, acción, entidad, resultado y correlación.
- La evidencia complementaria de auditoría e integraciones usa el append
  canónico `registrar_auditoria_backend_tx`: valida empresa/actor, conserva
  un identificador al reintentar, rechaza cambios en el mismo evento y depura
  secretos. Las operaciones de negocio mantienen su propia auditoría atómica.
  Alertas de integración, recepciones, CxC, CxP, inventario y jobs de la API
  utilizan también ese append mediante un adaptador compartido: requieren
  confirmación del evento y conservan su UUID ante una respuesta perdida.
  Los errores del proveedor se depuran antes de persistir o notificar.
  El historial de un recurso incluye `record_id` además del identificador
  legado dentro del JSON; la lectura filtra por empresa y exige
  `security.audit.read`. La paginación unificada recorre los bloques de cada
  fuente y el filtro de usuario se aplica antes de paginar sus intentos de login.
  La pantalla advierte fuentes incompletas, permite reintentar y muestra las
  fechas de consulta con la zona del navegador. La búsqueda de texto indica
  expresamente que se aplica a la página visible.
- Métricas, logs y notificaciones no contienen secretos.
- El panel global de seguridad requiere superadmin y `security.audit.read`. Sus
  estadísticas usan conteos SQL de todo el período; un fallo o informe parcial
  produce un error visible con reintento, sin mostrar ceros ni datos anteriores.
  Las siete fuentes requieren la588, con SELECT exclusivo del backend y sin
  permisos de escritura ni cambios en las políticas RLS.
- Una lectura fallida de notificaciones muestra error y permite reintentar;
  no aparece como una bandeja vacía. Marcar como leído, marcar todas y eliminar
  sólo actualizan la pantalla tras confirmación del servidor. Ante fallo,
  conservan la bandeja y el estado previo; las acciones quedan bloqueadas
  mientras hay una mutación en curso. Un pedido creado, confirmado y cancelado
  desdeUI generó dos avisos reales: lectura individual503 conservó el pendiente,
  reintento con teclado y recarga confirmaron uno leído y otro sin leer, sin
  alterar18avisos ajenos. Esos avisos no ofrecen enlace de acción; no acredita
  navegación desde acciones ni todos los productores de notificaciones.
- Auditoría y notificaciones repitieron principal→empresa2→principal mediante
  logout/login en el mismo navegador, sin limpiar cookies manualmente. El
  historial, actores y bandejas conservaron su empresa. Las páginas1/2 reales
  de logins,503 de página2 yActualizar recuperaron registros distintos. El aviso
  de fuentes incompletas preserva las filas disponibles y desaparece al recuperar
  la consulta; esa variante se indujo sólo enmetadata, sin afirmar caída real del
  backend de una fuente.

## Reglas transversales

- Dinero usa precisión decimal y redondeo explícito.
- Fechas de negocio no se interpretan como UTC si representan día local.
- Estados se normalizan y validan en los límites.
- Toda escritura sensible requiere tenant, autorización e idempotencia.
- Un cambio de flujo debe actualizar pruebas y este documento si altera el
  contrato funcional.
