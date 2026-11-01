# Procesos empresariales entre módulos

Cada recorrido identifica origen, responsable, resultado y punto de entrega. Los estados que se nombran son los conceptos del flujo; el nombre exacto de cada estado y acción debe leerse en su recurso. No se agregan etapas no implementadas para reproducir un ERP genérico. Un error de lectura impide dar por vacío un origen; una confirmación perdida se recupera sobre el mismo intento.

## Compra de bienes hasta su pago

**Preparación:** proveedor, producto y unidad, moneda, afectación por línea, almacén cuando corresponda y usuarios con las facultades de crear, aprobar, recibir y pagar.

| Etapa y responsable | Decisión y datos | Resultado y entrega |
|---|---|---|
| Compras: cotización u orden | Proveedor, líneas, cantidades, precios, impuestos y condiciones. | Borrador confirmado y referencia para revisión. |
| Aprobador | Elegibilidad, importe y decisión segregada cuando se exige. | Orden aprobada o rechazada con actor y motivo. |
| Almacén: recepción | Cantidad realmente aceptada por línea dentro del pendiente. | Recepción identificada; alta y cierre son etapas distintas. |
| Almacén: cierre | Revisa aceptación y observaciones. | Cumplimiento de la orden, inventario aplicable y evento contable. |
| Cuentas por pagar | Factura real, recepción elegible, vencimiento, moneda y ajustes. | Obligación y documento vinculados; el crédito fiscal no se presume por recibir. |
| Tesorería | Saldo, importe, destino y referencia. | Pago confirmado y nuevo saldo comprobable. |
| Contabilidad | Revisa eventos, asiento y corte. | Reconocimiento trazable sin volver a crear la compra. |

**Parcial:** una recepción aceptada no consume el saldo que todavía falta. **Rechazo:** la cantidad rechazada no equivale a cumplimiento aceptado. **Devolución:** se tramita vinculada al origen y conserva su efecto y eventual nota del proveedor.

**Fallo entre etapas:** si la recepción se creó y falta su cierre, recupere el cierre; no cree otra cabecera. Si el pago quedó incierto, consulte el original sin registrar otra factura ni otra salida bancaria.

**Criterio final:** cantidades recibidas y pendientes, factura, saldo, pago y asiento tienen explicación por sus referencias. No se presupone una pantalla de requisición interna anterior a las cotizaciones y órdenes disponibles.

## Compra de un servicio

Utiliza la negociación, aprobación, recepción, factura y pago del recorrido anterior, pero cambia el efecto físico.

1. Compras identifica un servicio y su unidad y cantidades admitidas.
2. El aprobador decide la orden elegible.
3. El responsable del servicio registra y cierra la aceptación real, incluida una parte cuando corresponda.
4. La aceptación cumple la orden sin crear existencias ni kardex de mercadería.
5. Se registra la factura real, con obligación y tratamiento fiscal propios.
6. Tesorería paga la obligación y contabilidad revisa sus efectos vinculados.

**Comprobación:** una orden de servicio por 0,75 aceptada por 0,25 mantiene un saldo de 0,50 mientras no haya otra aceptación válida. Una cantidad rechazada no debe usarse para cerrar artificialmente el servicio. La prestación aceptada y la factura recibida son evidencias distintas.

## Venta a crédito, despacho y cobro

**Preparación:** cliente válido, precios y afectaciones, stock o tratamiento de servicio, sucursal y actores autorizados.

| Etapa y responsable | Cambio que se confirma | Comprobación antes de entregar a la siguiente área |
|---|---|---|
| Ventas | Cotización con fotografía de precios y posterior decisión. | Cliente, moneda, cantidades y elegibilidad para convertir. |
| Ventas | Pedido confirmado o detenido por el motivo correspondiente. | Distingue excepción comercial de bloqueo crediticio. |
| Logística | Reserva, preparación y despacho permitido. | Reserva no es salida física; revisa cantidades pendientes. |
| Facturación | Documento y CPE vinculados al origen. | Numeración, receptor, líneas y condición de pago. |
| Cobranza | Cobro parcial o total sobre la CxC. | Importe, moneda, destino y referencia; saldo recargado. |
| Contabilidad | Reconocimiento y eventual recuperación del evento. | Asiento y diario ligados a la operación original. |

**Parcial:** un despacho de una unidad sobre dos no autoriza otro descuento al recuperar su confirmación. Un cobro parcial conserva el saldo restante. El aging reconstruye deuda a una fecha de corte, que puede ser distinta del saldo de hoy.

**Límite:** entrega física, pago y aceptación fiscal son dimensiones independientes. No se inventa un cobro para cerrar comercialmente una entrega ni una aceptación para imprimir el documento.

## Venta POS, canje y cierre de caja

1. El cajero abre una sesión y comprueba caja, establecimiento y almacén.
2. Prepara carrito, receptor y medios de pago y confirma la misma fotografía de venta.
3. La venta conserva pagos, efecto de stock aplicable y ticket o documento vinculados.
4. Si nació ticket interno puro, el canje fiscal elegible usa la venta congelada: no vuelve a cobrar, descontar stock ni crear otra comisión.
5. Los movimientos de sesión y cambios de turno conservan sus destinos y confirmaciones.
6. Al cerrar se compara conteo real con expectativa vigente; redondeos requieren evidencia y las diferencias conservan su autorización.
7. El corte congelado es el origen de PDF y CSV posteriores.

**Fallo:** una impresora sin papel se atiende reimprimiendo. Una emisión fiscal reservada pendiente se recupera antes de intentar cerrar cuando el control lo exige. Un ticket interno puro no se trata como CPE pendiente.

**Criterio final:** el efectivo físico incluye sólo la parte en efectivo, los retiros y ajustes documentados. Un supervisor no puede ser el propio actor de cierre ni el cajero responsable.

## Devolución de cliente y resolución del crédito

**RMA:** solicitud vinculada al origen → aprobación segregada → recepción permitida → revisión o reversa anterior al cierre → cierre y crédito confirmado de ese flujo → aplicación o reembolso elegibles.

El responsable comercial identifica motivo y líneas; almacén confirma bienes realmente recibidos; finanzas comprueba crédito disponible y destino de su aplicación o reembolso. Las líneas conservan su clasificación original: servicios y productos sin stock no fabrican una devolución física.

**Distinción fiscal:** crear o firmar una nota peruana referenciada 07/08 desde Centro CPE mantiene pendiente su efecto financiero hasta las condiciones de aceptación y CDR. Ese flujo no se equipara automáticamente al cierre interno de la RMA. Consulte su estado y referencias antes de reducir deuda por una interpretación genérica de «nota creada».

**Ejemplo aritmético:** un crédito confirmado de 58,40 aplicado por 20,00 a una deuda de 23,60 deja 3,60 por cobrar y 38,40 de crédito, si no existen otros movimientos. Aplicar crédito, cobrar el saldo y reembolsar el remanente son decisiones distintas.

**Criterio final:** se pueden explicar cantidades devueltas, nota, reducción de deuda, crédito y reembolso sin anular indebidamente toda la factura de origen.

## Remuneraciones y declaración laboral

| Etapa | Responsable y entrada | Resultado que permite continuar |
|---|---|---|
| Fuentes | RRHH: empleado, contrato del mes, asistencia, solicitudes, normativa y conceptos. | Conjunto completo y coherente del período. |
| Alta y cálculo | Calculador autorizado. | Planilla identificada y detalle por empleado; no implica pago. |
| Revisión y aprobación | Actor autorizado distinto del calculador. | Cálculo aprobado y referencia para pago. |
| Pago | Pagador autorizado: destino y referencia. | Salida financiera, historial y evidencia laboral vinculados. |
| Contabilidad | Evento y asiento del devengo o pago que corresponde. | Reconocimiento verificable sobre componentes congelados. |
| Paquete laboral | Responsable laboral: identidad, códigos y jornada. | Versión y archivos de trabajo sin bloqueos. |
| Validación externa | Usuario autorizado en PVS/SOL u otro sistema del país. | Evidencias oficiales distintas y conservadas por versión. |

**Variantes:** las vacaciones aprobadas alimentan su período; las fechas superpuestas no se cuentan doble cuando el cálculo exige fechas únicas. Una liquidación calculada no inactiva por sí sola al trabajador. La CTS consumida en la liquidación no se paga de nuevo como depósito independiente.

**Fallo:** si la planilla existe y falla su cálculo, recupere esa etapa. Si el pago pudo confirmarse, revise el original antes de volver a transferir. La recuperación del evento contable no requiere generar otra nómina.

**Criterio final:** fuentes, cálculo, autorización, pago, boleta y evidencia externa mantienen sus identidades. El ZIP de trabajo del ERP no se presenta como ZIP de carga validado por PVS.

## Cierre contable y lectura gerencial

1. Los responsables operativos resuelven documentos y confirmaciones pendientes del período.
2. Tesorería explica bancos, conciliaciones y obligaciones; no sustituye una fuente fallida por saldo cero.
3. Contabilidad revisa asientos, partidas, depreciaciones, diferidos y diferencias de moneda que correspondan.
4. Obtiene estados y libros sobre el mismo corte y revisa su comprobación previa.
5. Resuelve bloqueos y confirma el cierre con su autorización.
6. Si requiere corrección, sigue la reapertura autorizada o la corrección pertinente; no cambia fechas para ocultar el período real.
7. Los reportes de grupo utilizan miembros aceptados, homologación y tasas; sus eliminaciones no reescriben libros individuales.

**Criterio final:** las cifras relevantes pueden seguirse hasta el origen y el estado cerrado conserva su historia. Readiness del servicio, descarga de archivos o un total balanceado aislado no sustituyen esta revisión empresarial.

## Contrato de suministro hasta el cobro

| Etapa y responsable | Decisión y datos | Resultado y entrega |
|---|---|---|
| Suministro: contrato | Cliente, moneda, vigencia, líneas y base de facturación. | Contrato activo con precios congelados por línea. |
| Suministro: OC del cliente | Reparto de cantidades por línea, sin superar lo contratado. | OC con el precio del contrato congelado. |
| Suministro: programación | Cantidad, fecha y destino de cada entrega. | Cronograma; todavía no reserva stock. |
| Suministro: pedido | Vincula un pedido del mismo cliente y moneda. | Cada línea asignada a una programación. |
| Almacén: despacho | Lotes asignados por vencimiento. | Salida física y lotes descontados. |
| Almacén: recepción del cliente | Recibido, aceptado, rechazado, guía, PECOSA y conformidad. | Lo aceptado cuenta como cumplido. |
| Finanzas: factura y cobro | Pedido facturado una sola vez; contra conformidad, con aceptación total. | CxC, cobros y notas. |
| Suministro y finanzas: estado de cuenta | Compara contratado, aceptado, facturado y cobrado. | Diferencias señaladas por comprobante. |

**Rechazo:** lo rechazado vuelve a quedar por aceptar y libera saldo para un pedido de reposición; la devolución física sigue RMA. **Atraso:** el cálculo de penalidad es una instantánea por corte; aprobarla exige otra persona y no genera asientos, notas ni descuentos por sí sola.

**Criterio final:** cada unidad contratada puede seguirse hasta su aceptación, su comprobante y su cobro.

## Migración desde otro sistema

| Etapa | Responsable y entrada | Resultado que permite continuar |
|---|---|---|
| Extracto | Cliente: un archivo por tabla. | Perfil de volumen, claves y columnas sensibles. |
| Mapeo y transformación | Consultor: mapeo del sistema de origen. | Plantillas en orden y `control.json`. |
| Archivo íntegro | ADMIN: extracto completo. | Lote inmutable que cierra por conteo. |
| Ensayo | ADMIN: plantillas, fecha de corte y control. | Cero errores y conciliación cuadrada; nada queda escrito. |
| Corte | Cliente: sistema anterior en solo lectura. | Extracto definitivo. |
| Importación | ADMIN: en el orden indicado. | Datos abiertos cargados sin duplicar en un reintento. |
| Conciliación | Con `migration.validar.read`. | Totales y bancos cuadrados contra el extracto. |

**Fallo:** los errores del ensayo se corrigen en el sistema de origen y se reentrega el extracto. **Criterio final:** sin conciliación cuadrada no se libera el corte, y el sistema anterior queda consultable en solo lectura.
