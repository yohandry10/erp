# Guías de operación por responsabilidad

Estas guías organizan el trabajo por responsabilidad. Los nombres de rol pueden personalizarse; la autorización efectiva depende de los permisos, empresa, sucursal y estado actuales. No asigne automáticamente todos los permisos de un área a quien sólo deba consultarla. La referencia exacta de permisos continúa siendo el código de decorators y guards y el catálogo vigente; este documento no crea una segunda matriz normativa.

Las rutas indicadas existen en el producto y un control automático lo comprueba. Su existencia no demuestra acceso con cualquier cuenta. Un segmento `[id]` representa el identificador de un registro: se accede desde el listado, no escribiendo literalmente los corchetes.

## Administrador de empresa

**Objetivo:** dejar preparada la empresa y repartir responsabilidades sin conceder privilegios globales involuntarios.

**Entradas:** identidad legal, país, moneda, datos de establecimientos y tareas de cada puesto. **Pantallas:** `/dashboard/configuracion/empresa`, `/dashboard/configuracion/sucursales`, `/dashboard/usuarios` y `/dashboard/wizard`.

1. Compruebe el contexto de empresa y complete el asistente confirmado por el servidor.
2. Revise identidad, logo y configuración del país. El logo admite PNG/JPEG de hasta 2 MiB y sus límites de resolución; no sustituya credenciales fiscales por un archivo gráfico.
3. Prepare sucursales, almacenes, cajas y series coherentes antes de asignar operadores.
4. Asigne los roles y sucursales necesarios desde la administración de usuarios.
5. Compruebe el acceso con la cuenta destinataria y una denegación fuera de su responsabilidad.
6. Si retira acceso, compruebe la revocación en una sesión abierta. Una ventana anterior no conserva autorización indefinidamente.

**Decisión delicada:** una lista vacía de sucursales devuelve alcance a todas las sucursales de la empresa; no significa ningún acceso. No comparta la sesión del administrador para suplir una aprobación.

**Cierre de tarea:** la configuración persiste, cada usuario mantiene el alcance previsto y los secretos permanecen en los mecanismos autorizados. La empresa creada no queda fiscalmente habilitada por ese hecho.

Consulte los capítulos 02–04 y 36–39 del manual para configuración fiscal, sesión y recuperación.

## Ventas y atención al cliente

**Objetivo:** convertir una necesidad comercial en una operación trazable, sin confundir aprobación, despacho, emisión y cobro.

**Pantallas:** `/dashboard/ventas/clientes`, `/dashboard/ventas/comercial`, `/dashboard/ventas/cotizaciones`, `/dashboard/ventas/pedidos`, `/dashboard/ventas/aprobaciones` y `/dashboard/ventas/rma`.

1. Consulte o registre al cliente y verifique identidad y empresa.
2. Prepare la cotización con moneda, cantidades, precios e impuestos por línea.
3. Guarde, revise el documento persistido y envíe a decisión cuando corresponda.
4. Solicite aprobación al actor autorizado; la excepción de autoaprobación administrativa no se extiende a cualquier vendedor.
5. Convierta la cotización elegible y entregue a logística la referencia del pedido confirmado.
6. Siga despacho y emisión desde sus vínculos. Si falta el cobro, derive la deuda a la persona autorizada en finanzas.

**Variantes:** una excepción comercial pendiente y un bloqueo crediticio tienen resoluciones distintas. Un despacho parcial no habilita a declarar toda la entrega como realizada. En una devolución, identifique documento y líneas de origen, obtenga la aprobación exigida y registre sólo lo recibido.

**Cierre de tarea:** cliente, propuesta, pedido y documentos vinculados son coherentes. Una impresión fallida o respuesta perdida se recupera sobre su original; no crea otra venta. La comisión conserva su regla histórica y no nace sólo por aprobar una propuesta.

Consulte los capítulos 05, 08–10, 15 y 18. El cobrador necesita su autorización financiera propia.

## Compras y recepción de servicios

**Objetivo:** adquirir bienes o servicios, controlar cumplimiento y entregar a finanzas una obligación sustentada.

**Pantallas:** `/dashboard/compras/proveedores`, `/dashboard/compras/cotizaciones`, `/dashboard/compras/ordenes`, `/dashboard/compras/recepciones` y `/dashboard/compras/devoluciones`.

1. Compruebe proveedor y condiciones de la negociación.
2. Registre la cotización u orden disponible, con naturaleza, unidad, cantidad, precio y afectación de cada línea.
3. Obtenga la aprobación que corresponda; conserve la decisión, actor y referencia.
4. Entregue a almacén o al responsable del servicio una orden elegible con saldo verificable.
5. Revise recepción, observaciones y cumplimiento antes de entregar la referencia para registrar la factura real.
6. Si hay devolución, conserve sus cantidades y documento de origen y siga la transición permitida.

**Límite del flujo documentado:** no se presupone un módulo independiente de requisiciones o solicitud interna de compra. El recorrido parte de las cotizaciones y órdenes implementadas. Si su organización exige un requerimiento previo, su procedimiento debe identificarse aparte sin presentarlo como una pantalla ya disponible.

**Variantes:** aceptar un servicio cumple la orden sin crear stock físico. Rechazar cantidades no las convierte en aceptadas. Una orden parcial conserva el saldo de cada línea; no se recibe de nuevo una cantidad cuya confirmación se está recuperando.

**Cierre de tarea:** orden, recepciones y factura tienen vínculos comprobables. Pagar corresponde a tesorería, no se presume autorizado por poder crear la compra.

Consulte los capítulos 05, 13–14 y 19–22.

## Almacén y logística

**Objetivo:** mantener una explicación verificable de reservas, entradas, salidas y traslados.

**Pantallas:** `/dashboard/inventario/productos`, `/dashboard/inventario/almacenes`, `/dashboard/inventario/operaciones`, `/dashboard/inventario/kardex`, `/dashboard/inventario/logistica/ordenes-pendientes` y `/dashboard/inventario/logistica/listo-despacho`.

1. Compruebe empresa, sucursal, almacén, producto y unidad.
2. Revise saldos físicos, reservas y cantidades pendientes del origen.
3. Registre recepción, preparación, despacho, ajuste o transferencia mediante su operación específica.
4. En un traslado, revise origen, destino y guía compatible cuando se exige.
5. Confirme una vez y consulte el movimiento y su referencia en el kardex.
6. En una confirmación perdida, consulte el recibo original sin fabricar un ajuste compensatorio.

**Distinciones:** reservar no equivale a descontar físico. Una cantidad de KGM no se suma con NIU para anunciar existencias totales. Un servicio no se recibe como mercadería. El costo del movimiento histórico no se reconstruye con el promedio de hoy.

**Entrega a otra área:** comunique las referencias confirmadas del despacho o recepción y las cantidades aceptadas, no sólo una captura del formulario.

**Cierre de tarea:** puede explicarse qué cantidad se movió, entre qué recursos y por qué documento. Un evento manual de tracking no sustituye un despacho real.

Consulte los capítulos 06–07, 09, 14 y 16.

## Cajero y supervisor

**Objetivo:** registrar ventas y explicar el efectivo físico de una sesión y su corte.

**Pantallas:** `/dashboard/pos` y `/dashboard/cajas`.

1. Abra o consulte la sesión correcta, comprobando sucursal y almacén heredados de la caja.
2. Prepare carrito, receptor y salida documental; revise precio e importe antes de cobrar.
3. Distribuya medios de pago. En mixtos, sólo la parte en efectivo afecta el cajón.
4. Confirme y compruebe la venta existente antes de reimprimir o recuperar una emisión.
5. Registre ingresos, gastos, retiros o turnos con sus destinos y referencias propios.
6. Para cerrar, obtenga la vista previa vigente, introduzca el conteo real y revise la diferencia.
7. Solicite supervisión cuando se exija y consulte el corte congelado antes de descargar sus archivos.

**Supervisor:** debe ser distinto del actor de cierre y del cajero responsable. El PIN tiene seis dígitos; cinco fallos bloquean la credencial quince minutos. No se entrega el PIN al cajero ni se incluye en la observación.

**Redondeo:** una diferencia pequeña no se clasifica automáticamente como ajuste de efectivo. Debe corresponder a las ventas y ajustes documentados. Un ticket interno puro y una emisión fiscal reservada pendiente no tienen el mismo efecto sobre el cierre.

**Cierre de tarea:** ventas, movimientos, conteo y corte se explican entre sí. Una impresora sin papel requiere reimprimir; no volver a vender.

Consulte los capítulos 11–12 y 38.

## Cobranza y tesorería

**Objetivo:** reducir la obligación correcta y conservar su movimiento financiero sin pagos o cobros duplicados.

**Pantallas:** `/dashboard/finanzas/cxc`, `/dashboard/finanzas/cxp`, `/dashboard/finanzas/ajustes-fiscales`, `/dashboard/finanzas/bancos`, `/dashboard/finanzas/conciliacion` y `/dashboard/finanzas/tesoreria/programacion`.

1. Consulte tercero, documento, moneda, saldo e historial antes de operar.
2. Distinga un pago o cobro de una aplicación de anticipo, crédito o ajuste documental.
3. Seleccione importe dentro del saldo, medio, destino y referencia.
4. Confirme una vez y compruebe el resultado del mismo intento y el nuevo saldo.
5. Para lotes, revise cada obligación e importe y compruebe el resultado de cada selección.
6. Concilie banco y extracto mediante pares válidos; resuelva diferencias por ajustes explícitos antes de cerrar.

**Variantes:** pago parcial y saldo final son decisiones distintas. Una detracción pendiente de depósito no se paga volviendo a reducir la CxP. Una transferencia tiene cargo y abono vinculados; no registre manualmente una segunda para completarla.

**Criterio de interrupción:** una confirmación perdida puede ocultar un pago ya realizado. Conserve la intención y consulte el original. Una cuenta o catálogo fallidos no se sustituyen por saldo cero.

**Cierre de tarea:** el saldo de la obligación y el historial explican el dinero realmente aplicado. El resultado puede revisarse en movimiento y asiento vinculados, sin recrearlos manualmente.

Consulte los capítulos 18–22, 29 y 38.

## Contabilidad y responsable fiscal

**Objetivo:** revisar el reconocimiento de operaciones y los papeles de trabajo del mismo corte, separando registro interno y evidencia externa.

**Pantallas:** `/dashboard/contabilidad/asientos`, `/dashboard/contabilidad/periodos`, `/dashboard/contabilidad/estados`, `/dashboard/contabilidad/impuestos`, `/dashboard/contabilidad/impuestos/anual`, `/dashboard/cpe`, `/dashboard/documentos` y `/dashboard/sire`.

1. Revise que las operaciones de origen estén completas y que los eventos fallidos tengan resolución.
2. Consulte el diario y los asientos del período. Un confirmado no se reescribe: su corrección utiliza el flujo enlazado.
3. Revise activos, diferidos, partidas, moneda y presupuestos cuando correspondan al corte.
4. Prepare libros y estados con fuentes completas, moneda y fechas coherentes.
5. Prepare las versiones tributarias con sus fuentes y ajustes sustentados.
6. Para cierre, resuelva la comprobación previa; solicite la autorización específica si requiere reapertura.
7. En fiscal, distinga creación, firma, envío, ticket, aceptación y CDR o constancia.

**Nota referenciada 07/08:** crear o firmar no anticipa el efecto financiero pendiente de aceptación fiscal. **RA/RC:** no sustituyen la anulación y reversa comercial previas. **SIRE:** un número de ticket no acredita trabajo terminado.

**Cierre de tarea:** puede reconstruirse cada cifra relevante hasta su origen y cada aceptación hasta su evidencia. Descargar PLE o un paquete laboral no acredita presentación oficial.

Consulte los capítulos 15–17 y 23–32. Ser lector contable no concede facultad de escritura o pago.

## Recursos humanos y responsable de remuneraciones

**Objetivo:** mantener las fuentes laborales y obtener una remuneración calculada, aprobada y pagada con las segregaciones exigidas.

**Pantallas:** `/dashboard/rrhh/candidatos`, `/dashboard/rrhh/contratos`, `/dashboard/rrhh/asistencia`, `/dashboard/rrhh/solicitudes`, `/dashboard/rrhh/planillas`, `/dashboard/rrhh/pagos`, `/dashboard/rrhh/liquidaciones` y `/dashboard/rrhh/planilla-electronica`.

1. Compruebe persona, contrato del período, normativa y conceptos completos.
2. Revise asistencia, solicitudes y decisiones que alimentan el cálculo.
3. Cree y calcule la planilla; compruebe conceptos y neto por trabajador.
4. Obtenga aprobación por el actor autorizado distinto del calculador.
5. Derive a pago y compruebe el destino, historial, boleta y asiento vinculados.
6. Prepare el paquete laboral y atienda bloqueos antes de congelar su versión.
7. Continúe la validación y presentación externas por el procedimiento oficial autorizado.

**Límites:** la selección de un contrato no prorratea varios contratos del mes. Un empleado inactivo puede conservar historia sin volverse elegible automáticamente para una planilla nueva. «Finalizar Contrato» toma el día actual del navegador; no es un selector de cese retroactivo.

**Beneficios:** cálculo, confirmación de cese y pago de liquidación son etapas diferentes. La CTS consumida en la liquidación no debe depositarse otra vez de forma independiente.

**Cierre de tarea:** fuentes, cálculo, aprobación y salida financiera tienen referencias comprobables. La constancia PLAME y el ticket/CIR de T-Registro se conservan como evidencias distintas.

Consulte los capítulos 33–36 y 38–39.

## Soporte y auditoría transversal

La responsabilidad de soporte se superpone a las anteriores sin heredar sus permisos de escritura. Identifique recurso, versión, empresa, usuario o rol, acción, hora local, último resultado confirmado y mensaje. Consulte auditoría e historial autorizados y distinga un fallo de lectura de una escritura con respuesta perdida. Preserve los pendientes y el perfil; no vacíe almacenamiento ni repita pagos para reproducir el error.

Para operar servicios, respaldos y despliegues, continúe en `GUIA_TECNICA_Y_OPERATIVA.md`. El cambio empresarial que eventualmente resuelva un incidente requiere su operación y autorización propias.

## Responsable de suministro

**Objetivo:** cumplir lo contratado con el cliente y poder explicar en todo momento qué se entregó, qué se aceptó y qué falta facturar.

**Perfil:** `SUMINISTRO`. **Pantallas:** `/dashboard/ventas/contratos`, `/dashboard/alertas`, `/dashboard/tablero-suministro`.

1. Registre el contrato con sus líneas y actívelo.
2. Registre cada OC del cliente y programe sus entregas.
3. Vincule el pedido de cada entrega para despacharla.
4. Revise el estado de cuenta y la base de facturación.
5. Configure las reglas de penalidad y calcule al corte. La aprueba otra persona.
6. Configure y atienda alertas.
7. Siga el tablero y exporte el corte.

**Decisión delicada:** contra conformidad no se puede facturar hasta que lo aceptado cubra todas las líneas del pedido. Marcar una entrega como entregada no equivale a que el cliente la aceptó.

**Cierre de tarea:** contratado, en OC, programado, despachado, aceptado y facturado se explican entre sí en el estado de cuenta. Consulte el capítulo 43.

## Migración de datos

**Objetivo:** pasar a una empresa desde su sistema anterior sin duplicar ni adivinar datos.

**Perfil:** `ADMIN`. **Pantalla:** `/dashboard/migracion`.

1. Pida el extracto y prepare el mapeo.
2. Cargue el archivo íntegro.
3. Ensaye hasta tener cero errores y conciliación cuadrada.
4. Con el sistema anterior en solo lectura, importe en el orden indicado.
5. Concilie con el mismo `control.json`.
6. Pida a otra persona que apruebe las órdenes de compra migradas.

**Cierre de tarea:** sin conciliación cuadrada no se libera el corte. Consulte el capítulo 45.
