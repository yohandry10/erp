# Procedimientos ampliados del manual de producto

Los casos numéricos siguientes son ejemplos de uso. No representan saldos productivos ni determinan tasas legales. Las opciones disponibles dependen de los permisos, país, configuración y estado que confirme el producto.

## 01. El producto y sus conceptos básicos

### Cómo ubicar una operación en el ERP

Antes de actuar, identifique cuatro datos: empresa, documento de origen, etapa del proceso y responsable de la siguiente decisión. Esta identificación evita confundir un documento comercial con su movimiento físico, financiero o fiscal.

| Pregunta | Dónde comprobarla |
|---|---|
| ¿Qué se acordó con el tercero? | Cotización, pedido u orden de compra. |
| ¿Qué salió o se recibió físicamente? | Despacho, recepción y kardex del almacén. |
| ¿Qué importe queda pendiente? | Cuenta por cobrar o pagar y su historial. |
| ¿Qué se cobró o pagó? | Pago vinculado, sesión de caja o movimiento bancario. |
| ¿Qué se reconoció contablemente? | Asiento de origen y diario del período. |
| ¿Qué aceptó la autoridad? | Estado fiscal y evidencia externa del documento. |

**Ejemplo de lectura del proceso.** Una orden por diez unidades puede tener cuatro recibidas, una factura por esas cuatro y un pago parcial. La orden sigue pendiente por seis unidades aunque la factura de las cuatro esté pagada. Consulte cada saldo en su recurso; no cierre la orden porque una deuda se haya cancelado.

**Resultado de esta revisión:** debe poder explicar qué etapa está confirmada, cuál está pendiente y quién puede continuarla. Si sólo se conoce un importe agregado, abra su detalle antes de modificar datos.

## 02. Primer acceso y preparación de la empresa

### Lista de preparación para el responsable de alta

Tenga disponibles los datos legales de la empresa, su país, la moneda que corresponda y una cuenta cuyo correo pueda controlar. Prepare el logo únicamente si va a utilizarlo. La activación de integraciones fiscales se trata después con sus credenciales reales.

| Dato | Revisión previa |
|---|---|
| Empresa y documento legal | Deben identificar a la entidad que operará, no al usuario que está creando la cuenta. |
| País y moneda | Determinan el contexto del producto; verifique ambos antes de registrar operaciones. |
| Usuario propietario | Debe conservar acceso al correo y una contraseña propia. |
| Progreso del asistente | Cada paso debe constar como confirmado antes de continuar. |

1. Inicie sesión y compruebe que el asistente pertenece a la empresa esperada.
2. Complete los campos del paso y revise el resumen antes de guardar.
3. Espere la confirmación; si falla la consulta, recupere el progreso existente.
4. Continúe con el siguiente paso y revise el resumen final.
5. Salga y vuelva a ingresar para comprobar el acceso y la configuración persistidos.

**Criterio de finalización:** el servidor confirma el cierre del asistente y la empresa conserva los datos al volver. Un paso visible en pantalla o un archivo seleccionado todavía no guardado no cumplen ese criterio. Un reinicio de configuración exige revisar su confirmación y recuperar cualquier resultado incierto antes de volver a solicitarlo.

## 03. Usuarios, roles, permisos y sesiones

### Diseñar y comprobar un acceso operativo

El administrador prepara la cuenta; el responsable de área define las tareas que necesita. Evite asignar un rol amplio sólo para resolver una denegación puntual: compruebe primero qué capacidad concreta falta.

| Capacidad solicitada | Comprobación funcional |
|---|---|
| Consultar | Puede leer el listado y el detalle autorizados. |
| Crear o editar | Puede abrir y confirmar el formulario correspondiente. |
| Aprobar | Puede decidir sobre el estado elegible y respeta la segregación del proceso. |
| Pagar o cobrar | Tiene la facultad financiera y el destino habilitado. |
| Operar una sucursal | La asignación y los recursos de esa sucursal son coherentes. |

1. Enumere las tareas del puesto y cree o elija el rol adecuado.
2. Asigne el rol y, cuando corresponda, las sucursales.
3. Compruebe con la cuenta destinataria una consulta y una acción permitidas.
4. Compruebe que una acción fuera de su responsabilidad permanezca denegada.
5. Si cambia o revoca el rol, vuelva a consultar desde una sesión que ya estuviera abierta.

**Ejemplo:** un lector contable puede consultar un registro sin recibir autorización para vender un activo o pagar una planilla. Que un menú sea visible no prueba que pueda ejecutar su acción.

**Resultado esperado:** los permisos efectivos coinciden con el puesto y los datos de otro usuario o empresa no permanecen visibles tras el cambio de sesión. Una denegación se resuelve revisando la asignación; no compartiendo la contraseña del administrador.

## 04. Identidad, parámetros, sucursales y series

### Preparar un nuevo establecimiento

Coordine esta preparación entre administración, logística y caja. Deben existir los recursos asociados antes de habilitar al personal para vender o mover existencias en el nuevo local.

| Elemento | Relación que debe conservar |
|---|---|
| Establecimiento | Código y datos de la sede correcta. |
| Almacén | Pertenencia al establecimiento donde se controla físicamente el stock. |
| Caja | Establecimiento y almacén que utilizará la sesión. |
| Serie | Tipo de comprobante y establecimiento compatibles. |
| Usuario | Asignación de sucursales y permisos de operación. |

1. Registre la sucursal y confirme que aparece después de recargar.
2. Prepare su almacén y los recursos de caja que vaya a utilizar.
3. Cree o seleccione las series correspondientes al local y documento.
4. Asigne los usuarios autorizados y compruebe el contexto con una de esas cuentas.
5. Antes de operar, revise qué sucursal deriva la pantalla del almacén, caja o serie seleccionados.

**Ejemplo:** una caja de Arequipa no debe utilizarse como atajo para descontar existencias de Lima. Corrija la configuración o seleccione el recurso correcto antes de confirmar.

**Comprobación final:** los vínculos persisten y los usuarios restringidos sólo operan el alcance asignado. Si falla una actualización, conserve los campos y recupere la misma solicitud; no cree una sucursal o serie equivalente con otro código para eludir el fallo.

## 05. Clientes, proveedores e importaciones

### Preparar una importación controlada

El responsable del maestro revisa primero una muestra del archivo y sus columnas. La importación masiva y el alta individual tienen permisos y controles propios; elegir un archivo no registra todavía sus filas.

| Elemento del CSV | Qué revisar |
|---|---|
| Encabezado | Coincide con la plantilla y no repite columnas. |
| Identidad documental | Tipo y número compatibles con el contexto peruano del importador. |
| Texto | UTF-8, separadores y comillas conservados, sin columnas desplazadas. |
| Identificador externo | Se conserva cuando se necesita recuperar la misma importación. |

1. Obtenga la plantilla desde el listado y prepare una copia de trabajo.
2. Cargue el CSV y revise la vista previa sin confirmar escrituras.
3. Corrija las filas con errores; distinga el número de registro CSV de una línea física con saltos internos.
4. Confirme la importación cuando la revisión sea satisfactoria.
5. Consulte el resultado completo, parcial o fallido y verifique los registros persistidos.

**Ejemplo:** si una fila tiene una dirección entre comillas con una coma, conserve las comillas del formato CSV; no elimine la coma alterando el domicilio para hacerla pasar.

**Recuperación:** no vuelva a cargar indiscriminadamente todo el archivo después de un resultado parcial. Revise las filas confirmadas y la identidad externa de la operación. La exportación del listado puede representar sólo la página visible; no la trate como respaldo íntegro del maestro.

## 06. Productos, servicios y maestros de inventario

### Ficha mínima antes de habilitar un artículo

La persona responsable del catálogo debe acordar con compras, ventas y almacén si se trata de un bien físico o un servicio y cómo se mide. Esta decisión influye en recepciones, despachos y valorización.

| Campo o decisión | Consecuencia operativa |
|---|---|
| Código y nombre | Permiten encontrar e identificar el artículo; respete su unicidad. |
| Unidad | Determina la interpretación de cantidades y comparaciones físicas. |
| Control de stock | Define si las operaciones compatibles producen existencias. |
| Marca y categoría | Alimentan búsqueda y reglas comerciales futuras. |
| Afectación y precio | Deben ser coherentes con las líneas de venta o compra. |

1. Revise que no exista el artículo con una variante del mismo código.
2. Complete clasificación, unidad y campos exigidos; no infiera una unidad ausente de un registro histórico.
3. Guarde y recargue su ficha.
4. Si utiliza imagen, cargue JPG, PNG o WebP dentro del máximo de 5 MB y compruebe el resultado.
5. Si solicita desactivación, revise previamente stock, reservas y dependencias que puedan bloquearla.

**Ejemplo:** recibir 0,75 de un servicio no crea 0,75 unidades de mercadería. La unidad y el control de stock deben reflejar esa naturaleza desde el maestro.

**Resultado esperado:** el catálogo persiste sin duplicados y los cambios de marca o precio afectan operaciones futuras, conservando las fotografías de ventas ya confirmadas.

## 07. Existencias, kardex, ajustes y transferencias

### Preparación y comprobación de un movimiento

El almacenero confirma el hecho físico; quien tenga permiso registra el movimiento. Tenga identificados el producto, su unidad, almacén, ubicación cuando aplique y motivo del ajuste o traslado.

| Dato | Pregunta que debe responder |
|---|---|
| Existencia consultada | ¿Corresponde al producto y almacén de esta operación? |
| Cantidad | ¿Es un conteo, una diferencia o una cantidad a trasladar según el formulario? |
| Dirección | ¿Produce entrada, salida o traslado entre dos almacenes distintos? |
| Referencia y motivo | ¿Permiten explicar el hecho físico después de confirmarlo? |

1. Recupere la consulta actual y compruebe las cantidades disponibles y reservadas.
2. Complete la operación con su signo y precisión admitidos.
3. Revise los dos almacenes en una transferencia y la guía aplicable cuando corresponda.
4. Confirme una vez y consulte el movimiento y su referencia en el kardex.
5. Compare la variación del origen y destino sin registrar manualmente otro ajuste para completar el traslado.

**Ejemplo:** trasladar 0,25 de una unidad divisible requiere esa misma unidad en el origen y destino. No sume el resultado con unidades de otro producto para presentar un stock global.

**Resultado esperado:** el traslado tiene salida y entrada vinculadas; el ajuste conserva su motivo. Si se pierde la respuesta, consulte el original. El costo recuperado pertenece a ese movimiento y no se recalcula con el promedio de hoy.

## 08. Gestión comercial: precios, comisiones y cotizaciones

### Revisar una cotización antes de enviarla

Ventas prepara la propuesta y el aprobador toma la decisión que permita su rol. Verifique la empresa y el cliente antes de seleccionar precios o copiar condiciones de otra propuesta.

| Dato | Revisión necesaria |
|---|---|
| Moneda y vigencia | Deben corresponder a la propuesta negociada. |
| Producto, marca y cantidad | Pueden determinar qué regla de precio es aplicable. |
| Precio e impuesto por línea | Revise la base y afectación de cada artículo. |
| Cliente y vendedor | Conservan el alcance comercial utilizado al confirmar. |

1. Complete el cliente y agregue las líneas de la propuesta.
2. Revise la regla de precio obtenida para las cantidades y fecha elegidas.
3. Guarde y compruebe el borrador antes de enviarlo.
4. Envíe la propuesta y solicite la aprobación correspondiente.
5. Convierta a pedido desde la propuesta elegible y compruebe el vínculo creado.

**Ejemplo:** una regla para producto exacto prevalece sobre una regla por marca cuando ése sea el alcance aplicable. Al convertir una cotización, el pedido conserva la fotografía de precios de origen; editar hoy el catálogo no revaloriza la propuesta histórica.

**Comprobación final:** propuesta, decisión y pedido corresponden al mismo cliente y moneda. Las comisiones se consultan desde las ventas que realmente las devengan; aprobar una cotización por sí solo no equivale a cobrar ni a devengar una comisión de venta confirmada.

## 09. Pedidos, reservas, preparación y entrega

### Controlar una entrega parcial de principio a fin

Coordine ventas y almacén sobre las cantidades disponibles. Un pedido confirmado puede reservar stock; la reserva y la salida física se comprueban por separado.

| Cantidad | Interpretación |
|---|---|
| Pedida | Compromiso del pedido original. |
| Reservada | Existencia comprometida, todavía distinta de un despacho físico. |
| Despachada | Cantidad cuya salida ya está confirmada. |
| Pendiente | Saldo que aún puede prepararse o despacharse según el estado. |

1. Abra el pedido y revise su aprobación, crédito y saldos por línea.
2. Confirme o continúe la preparación y embalaje permitidos.
3. Seleccione las líneas por su identidad y la cantidad que efectivamente saldrá.
4. Confirme el despacho y revise su historial y movimiento físico.
5. Registre entrega o seguimiento sólo sobre las etapas ya realizadas.

**Ejemplo:** en un pedido de dos unidades, un primer despacho de una deja otra pendiente. Recuperar la confirmación del primer despacho no debe descontar la segunda. Un nuevo despacho posterior utiliza su propia operación sobre el saldo vigente.

**Si no permite continuar:** distinga una excepción comercial pendiente, un bloqueo crediticio, falta de stock o un estado incompatible. Cada situación tiene su resolución propia. No cambie una cantidad o fecha para ocultar el motivo ni utilice un evento manual para fingir una entrega.

## 10. Devoluciones de clientes, notas y saldo a favor

### Separar recepción física y resolución financiera

El responsable comercial identifica el documento y motivo; almacén confirma los bienes realmente recibidos; finanzas decide la aplicación o reembolso del crédito disponible.

| Elemento | Qué revisar antes de confirmar |
|---|---|
| Documento origen | Cliente, líneas y cantidades elegibles. |
| Decisión | Aprobación de un actor autorizado distinto del creador cuando se exige. |
| Recepción | Cantidad aceptada y clasificación original de bien o servicio. |
| Nota y crédito | Importe que reduce deuda y eventual excedente a favor. |

1. Registre la solicitud y obtenga su decisión antes de recibir una solicitud aún creada.
2. Registre las recepciones parciales o completas permitidas.
3. Revise cantidades y corrija mediante la reversa disponible antes de cerrar la nota.
4. Cierre y consulte el documento de crédito y sus vínculos.
5. En finanzas, aplique o reembolse únicamente el crédito disponible.

**Comprobación final:** la cantidad devuelta no supera la elegible, la factura original sigue identificada y la deuda no queda negativa por absorber el excedente. El crédito disponible debe poder explicarse por sus movimientos.

**Recuperación:** si falla el reembolso, conserve su destino y referencia originales y consulte el historial. No emita otra nota para resolver un pago incierto ni repita una recepción para recuperar la nota ya creada.

## 11. Punto de venta

### Revisión del cajero antes y después de cobrar

Antes de empezar, compruebe usuario, caja, sesión abierta, establecimiento, almacén y conectividad necesaria. Durante la venta, mantenga el carrito estable mientras confirma el precio y el pago.

| Dato | Control del cajero |
|---|---|
| Productos y cantidades | Coinciden con lo entregado al cliente. |
| Receptor y tipo de documento | Corresponden al ticket o CPE que se solicitará. |
| Medios e importes | La distribución cubre el importe que confirma el producto. |
| Efectivo recibido y vuelto | Sólo se interpretan sobre la parte en efectivo. |

1. Prepare el carrito y revise precios, impuestos y cantidades.
2. Seleccione receptor y salida documental.
3. Distribuya los medios de pago admitidos y compruebe el vuelto mostrado.
4. Confirme una vez y espere el resultado de la misma venta.
5. Consulte el historial antes de repetir una acción cuyo resultado quedó incierto.

**Ejemplo aritmético:** para una venta de 47,20 pagada en efectivo con 50,00, el vuelto es 2,80, sin considerar un ajuste adicional. Si se paga una parte con tarjeta, no se registra todo el total como efectivo físico.

**Resultado esperado:** venta, pagos y ticket o CPE quedan vinculados. Una impresora sin papel requiere reimprimir; no volver a cobrar. Si el CPE sigue pendiente, recupere su emisión desde la venta existente.

## 12. Cajas, arqueos, turnos y cortes

### Preparar un arqueo explicable

El cajero cuenta el efectivo real; el supervisor interviene cuando lo exige la operación. Prepare el conteo y revise los movimientos antes de cerrar, sin confundir el total vendido con efectivo disponible.

| Componente | Tratamiento |
|---|---|
| Apertura | Conteo inicial confirmado de la sesión. |
| Ventas en efectivo | Afectan el efectivo físico por su parte correspondiente. |
| Tarjeta o transferencia | No se suman al cajón como billetes recibidos. |
| Ingresos, gastos y retiros | Deben explicar su importe, destino y referencia. |
| Conteo y diferencia | Comparan efectivo real con la expectativa vigente del cierre. |

1. Revise la sesión activa y sus movimientos.
2. Obtenga la vista previa actual de cierre.
3. Introduzca el conteo real, no un valor calculado para eliminar la diferencia.
4. Revise redondeos admitidos y diferencias que requieran explicación o supervisor.
5. Confirme y consulte el corte congelado antes de descargar sus archivos.

**Ejemplo:** un retiro bancario reduce el efectivo de la caja y debe conservar el destino. No se registra después un gasto por el mismo importe para volver a explicar esa salida.

**Comprobación final:** PDF y CSV corresponden al mismo corte. Si falla la descarga, repítala desde el corte existente. Si el cierre quedó incierto, consulte la sesión antes de iniciar otra apertura o cierre.

## 13. Compras: cotización y orden

### Preparar líneas que puedan recibirse y facturarse

Compras define proveedor, condiciones y artículos; el aprobador revisa la decisión y almacén o el responsable del servicio recibe lo efectivamente entregado.

| Dato | Control previo |
|---|---|
| Proveedor y moneda | Identifican la negociación y la deuda futura. |
| Cantidad y unidad | Permiten controlar recepción y saldo por línea. |
| Precio | Puede ser cero cuando la línea válida lo permite; no se confunde con ausencia de dato. |
| Afectación tributaria | Se revisa por línea, incluidos servicios y bienes exonerados. |

1. Cree o complete la cotización y revise cada línea.
2. Envíe y obtenga la aprobación que corresponda al flujo.
3. Convierta a orden o registre la orden mediante el alta disponible.
4. Verifique cabecera, moneda, total calculado y vínculo con la cotización.
5. Entregue la referencia de la orden al responsable de recepción.

**Ejemplo:** una orden puede incluir un bien físico y un servicio. Ambos pueden contribuir al cumplimiento, pero su recepción no produce el mismo efecto de inventario. No cambie el servicio por un producto de stock para poder cerrar la compra.

**Resultado esperado:** una sola orden por la conversión confirmada, con líneas y saldo verificables. Ante un rechazo o cancelación, consulte su actor y motivo; no interprete la desaparición de un botón como decisión confirmada.

## 14. Recepciones y devoluciones al proveedor

### Resolver cantidades aceptadas, observadas y rechazadas

Prepare la orden, el detalle de lo recibido y las observaciones. El responsable debe distinguir cuánto llegó de cuánto fue aceptado y de cuánto falta por cumplir.

| Situación | Efecto que debe revisar |
|---|---|
| Recepción parcial aceptada | Incrementa el cumplimiento por su cantidad válida. |
| Bien con stock | Produce el movimiento físico aplicable al cerrar. |
| Servicio aceptado | Cumple la orden sin fabricar existencias de mercadería. |
| Cantidad rechazada | No se contabiliza como cumplimiento aceptado ni como stock recibido. |

1. Consulte la orden aprobada o parcial y confirme el saldo vigente.
2. Capture cantidades y observaciones de cada línea.
3. Guarde la recepción y revise su identidad antes de cerrar.
4. Cierre la recepción elegible y compruebe cumplimiento e historial.
5. Registre la factura real del proveedor en su etapa financiera, sin suponer que nació con la recepción.

**Ejemplo:** si una línea de servicio tiene 0,75 pendientes y se aceptan 0,25, revise el saldo de 0,50. Un rechazo de 0,25 no debe considerarse otro cuarto aceptado para completar el servicio.

**Recuperación:** si la cabecera ya está creada y falla el cierre, recupere el cierre del mismo registro. Verifique las recepciones existentes antes de registrar una nueva para evitar duplicar la aceptación física o del servicio.

## 15. Comprobantes electrónicos y ciclo fiscal

### Revisar la emisión y su evidencia por etapas

La persona autorizada para emitir prepara el documento; quien administra la integración verifica credenciales y canal externo. Emitir no concede automáticamente permisos para cobrar su deuda.

| Dato | Revisión anterior a emitir |
|---|---|
| Tipo y serie | Son compatibles con el país, establecimiento y comprobante. |
| Receptor | Identidad y documento coinciden con el cliente de la operación. |
| Líneas | Cantidad, precio y afectación producen la base y total esperados. |
| Moneda y fechas | Corresponden al documento y su condición de pago. |
| Documento origen | Se conserva cuando la emisión nace de pedido, venta o nota. |

1. Complete los datos y recupere cualquier fuente incompleta.
2. Revise el resumen y confirme una vez.
3. Compruebe el documento registrado y su referencia de origen.
4. Consulte por separado firma, envío, ticket y resultado de aceptación.
5. Descargue la representación y la evidencia que existan para ese estado.

**Ejemplo:** un XML firmado con envío pendiente todavía no permite afirmar que SUNAT aceptó la factura. El PDF debe leerse junto al estado fiscal, no como sustituto del resultado externo.

**Si hay un error:** distinga una validación que explícitamente rechazó el contenido de una pérdida de respuesta después de enviar. En el segundo caso, conserve el original y consulte su resultado antes de emitir otro documento.

## 16. Guías de remisión y traslado

### Preparar un traslado con sus referencias completas

Logística verifica el origen y destino físicos; el emisor autorizado prepara la guía. Si nace de un pedido o despacho, utilice ese origen para conservar cantidades y referencias.

| Dato | Qué debe coincidir |
|---|---|
| Emisor y destinatario | Empresas o terceros que corresponden al traslado. |
| Puntos y motivo | Origen, destino y razón del movimiento. |
| Líneas y peso | Productos, cantidades y unidad de medida del traslado. |
| Modalidad | Datos de transporte público o privado exigidos por la selección. |
| Vinculación | Pedido, despacho y capacidad ya utilizada de la guía, si aplica. |

1. Abra el origen o inicie la guía manual autorizada.
2. Revise los datos heredados y complete el transporte.
3. Confirme la creación y compruebe las líneas y fecha del documento.
4. Revise la etapa fiscal y los archivos disponibles.
5. Antes de asociarla a un movimiento, confirme que la guía y su capacidad son compatibles.

**Ejemplo:** una guía preparada para un producto no habilita trasladar otro. Si una parte de su capacidad ya está aplicada, utilice el saldo permitido; no asuma que el total del PDF sigue disponible.

**Resultado esperado:** la guía mantiene su vínculo y tratamiento fiscal propios. Anular la guía o consultar su estado no sustituye la cancelación o reversa del movimiento físico relacionado.

## 17. Centro de documentos, archivos y bajas RA/RC

### Encontrar y utilizar el archivo correcto

El operador debe conocer empresa, tipo documental, serie o referencia y período aproximado. El centro permite consultar recursos de distinto origen; no todos tienen las mismas acciones fiscales.

| Elemento visible | Revisión antes de descargar o actuar |
|---|---|
| Identidad documental | Es el documento buscado y pertenece a la empresa actual. |
| Procedencia | Distingue emisión del ERP, documento manual e histórico migrado. |
| Estado | Determina si existe firma, envío o evidencia oficial. |
| Archivo | Su tipo, contenido y referencia coinciden con la acción seleccionada. |

1. Aplique filtros y espere el resultado completo.
2. Abra el documento y contraste identidad, importes y vínculos.
3. Descargue el archivo disponible para ese estado.
4. Para RA/RC, revise la selección y confirmación específicas antes de solicitar la operación.
5. Conserve la referencia del trabajo o ticket y consulte su evolución.

**Ejemplo:** un documento histórico con PDF no adquiere un CDR nuevo por volver a descargarlo. Una comunicación de baja solicitada no equivale a la baja aceptada mientras no exista el resultado correspondiente.

**Si falla la descarga:** reintente el archivo desde el documento correcto. No guarde una página de error con extensión XML o PDF. Si cambia el filtro, compruebe que el archivo posterior pertenece a la selección nueva y no a una respuesta anterior.

## 18. Cuentas por cobrar y recuperación de cartera

### Registrar un cobro y explicar el saldo

El cobrador necesita el permiso financiero, la deuda correcta y el destino del dinero. Consulte primero el historial para distinguir pagos, aplicaciones de crédito y ajustes documentales.

| Dato | Control antes de confirmar |
|---|---|
| Cliente y documento | La deuda pertenece al tercero que está pagando. |
| Moneda y saldo | El importe se interpreta en la moneda de la obligación. |
| Medio y destino | Identifican la caja o cuenta bancaria correspondiente. |
| Fecha y referencia | Permiten reconocer el cobro y su evidencia. |

1. Abra el detalle y revise saldo e historial actuales.
2. Introduzca un importe dentro del saldo permitido.
3. Seleccione medio, destino y referencia y revise el resumen.
4. Confirme y compruebe el pago y el nuevo saldo en el detalle recargado.
5. Si corresponde, consulte su movimiento y asiento vinculados.

**Ejemplo aritmético:** una deuda de 100,00 con un cobro confirmado de 30,00 deja 70,00, si no existen otros movimientos. Una aplicación de saldo a favor debe identificarse como tal; no se registra además como efectivo recibido.

**Revisión de cartera:** el aging responde a una fecha de corte. Un cobro posterior no debe reescribir la mora de un corte anterior. Si una fuente de reconstrucción no es confiable, revise su advertencia antes de usar el total.

## 19. Facturas de proveedor y cuentas por pagar

### Registrar y pagar una obligación verificable

Compras o contabilidad incorpora la factura real; tesorería paga la deuda confirmada. Tenga disponibles la identidad del proveedor, documento, moneda, vencimiento y recepción cuando el flujo la requiere.

| Dato | Revisión |
|---|---|
| Serie y número | Identifican la factura del proveedor; revise posibles duplicados. |
| Base, impuesto y total | Deben ser coherentes con el documento y sus ajustes. |
| Crédito fiscal y detracción | Conserve la elección fiscal explícita del documento. |
| Moneda y cotización | La deuda conserva la moneda de origen y su conversión documental. |
| Anticipo | Debe existir y disponer de saldo antes de declararlo aplicado. |

1. Registre la factura y compruebe su recibo y vínculo de origen.
2. Recargue el detalle y revise saldo, vencimiento y ajustes.
3. Para pagar, confirme el importe, banco o caja admitidos y referencia.
4. Verifique el historial y el nuevo saldo sin repetir el alta de la factura.

**Ejemplo:** recibir un servicio acredita su cumplimiento; la obligación financiera nace al registrar la factura real en su flujo. No cree una segunda factura para solucionar un fallo del historial de pagos.

**Recuperación:** una respuesta incompleta de alta o pago mantiene el intento. Cambiar importes, moneda o ajustes fiscales no constituye un reintento exacto; revise y resuelva la intención anterior antes de preparar otra solicitud.

## 20. Anticipos y ajustes fiscales financieros

### Distinguir el documento del movimiento de dinero

El responsable financiero identifica el ajuste aplicable y su sustento. Antes de confirmar, determine si está registrando dinero recibido o entregado, aplicando un saldo existente o realizando un depósito pendiente.

| Operación | Comprobación esencial |
|---|---|
| Alta de anticipo | Existe un abono o cargo ligado al tercero y destino elegidos. |
| Aplicación de anticipo | Consume saldo disponible del anticipo identificado. |
| Ajuste documental | Afecta la deuda según su clase; no se presume un pago bancario. |
| Depósito de detracción | Resuelve la obligación tesorera pendiente sin volver a reducir la misma CxP. |

1. Consulte tercero, deuda y anticipo cuando corresponda.
2. Seleccione la clase de operación y complete importe y sustento.
3. Revise el efecto sobre saldo y el movimiento financiero esperado.
4. Confirme y compruebe cada vínculo en su historial.
5. Si debe revertir un ajuste elegible, utilice su acción y motivo explícitos.

**Ejemplo aritmético:** aplicar 20,00 de un anticipo disponible de 50,00 deja 30,00 por aplicar. Esa aplicación no representa una segunda entrada de 20,00 al banco.

**Resultado esperado:** saldo, anticipo y eventual depósito conservan su relación. La reversa de un ajuste documental no debe interpretarse como devolución de efectivo si su flujo no genera caja ni banco.

## 21. Bancos y conciliación

### Completar una conciliación mensual

Tesorería prepara el extracto y verifica cuenta bancaria, moneda y período. La cuenta debe conservar su relación contable de movimiento antes de registrar operaciones que la utilicen.

| Dato | Revisión |
|---|---|
| Cuenta y moneda | Coinciden con el extracto importado. |
| Período | Corresponde al mes que se conciliará. |
| Fechas y referencias | Se leen como datos documentales, sin desplazar el día. |
| Saldos inicial y final | Pueden explicarse por los movimientos del lote. |
| Diferencias | Tienen un ajuste explícito o un emparejamiento válido. |

1. Abra o seleccione el período de conciliación de la cuenta.
2. Importe el CSV válido y revise el lote y sus saldos.
3. Empareje los movimientos exactos mediante las acciones manuales o automáticas ofrecidas.
4. Investigue partidas pendientes y registre ajustes bancarios justificados cuando corresponda.
5. Cierre sólo cuando la comprobación permita resolver todas las diferencias.

**Ejemplo:** una comisión del extracto ausente en el ERP requiere su ajuste con contrapartida. No se concilia contra un movimiento de otro importe para hacer desaparecer la diferencia.

**Resultado esperado:** extracto, movimientos y cierre son coherentes. Una transferencia interna conserva su par de cargo y abono; no se completa con una segunda transferencia manual. El período cerrado mantiene sus restricciones ante solicitudes tardías.

## 22. Tesorería y programación de pagos

### Pasar de la programación al lote confirmado

El pagador revisa las obligaciones y los destinos disponibles. La programación es una propuesta sobre datos actuales; no significa que el dinero ya haya salido.

| Dato | Control del lote |
|---|---|
| Documentos seleccionados | Son las deudas que se pretende pagar, incluidas vencidas cuando corresponda. |
| Saldo e importe | Cada pago respeta el saldo actual y la precisión admitida. |
| Moneda | No se suman importes nominales de distintas divisas. |
| Banco y referencia | Identifican el destino de la salida de dinero. |

1. Consulte la programación y recupere todas sus fuentes.
2. Seleccione obligaciones y revise los importes individuales.
3. Abra el pago y confirme destino y referencia.
4. Verifique el resultado del lote y el estado de cada deuda.
5. Consulte movimientos bancarios y asientos cuando se necesite revisar sus efectos.

**Ejemplo:** pagar 1,18 de una deuda de 2,36 deja 1,18 pendiente. Un lote posterior puede pagar ese saldo; recuperar la confirmación del primero no debe volver a cargarlo.

**Si falla la lectura:** retire la conclusión sobre totales y espere la recuperación. Si falla la confirmación, conserve el mismo intento. Una proyección con bancos inaccesibles no se interpreta como falta de fondos confirmada ni como saldo cero fiable.

## 23. Contabilidad: asientos, partidas y plantillas

### Preparar y comprobar un asiento manual

El contador necesita permiso de escritura, cuentas aptas y un período explícitamente abierto. Los asientos automáticos se revisan por su origen; no se duplican manualmente para hacer aparecer una operación que todavía debe recuperarse.

| Dato | Control |
|---|---|
| Fecha y período | La fecha civil pertenece al período contable habilitado. |
| Concepto | Explica el hecho económico y su referencia. |
| Cuentas y tercero | Son válidos para las líneas de la empresa. |
| Debe y haber | Tienen importes positivos y balancean según el control del formulario. |
| Analítica | La distribución corresponde a la línea y eje elegidos. |

1. Compruebe o cree el período desde su pantalla autorizada.
2. Capture cabecera y líneas y revise la diferencia.
3. Guarde en el estado permitido y consulte el detalle recargado.
4. Obtenga la confirmación por el actor que corresponda al control aplicado.
5. Revise el asiento confirmado en el diario y su referencia.

**Ejemplo:** debe 100,00 y haber 99,99 requieren corregir el descuadre; un formulario con ambos totales en cero no acredita un asiento válido.

**Correcciones:** edite o elimine únicamente un borrador elegible. Un confirmado se corrige mediante el contra-asiento enlazado. Conciliar partidas modifica su emparejamiento, no reescribe el importe histórico del asiento.

## 24. Períodos y cierre contable

### Preparar una decisión de cierre

El responsable contable revisa integridad, operaciones pendientes y resultados antes de solicitar el cierre. La autorización de reapertura es más restringida y debe comprobarse antes de planificar una corrección.

| Revisión | Evidencia de trabajo |
|---|---|
| Operaciones del período | Documentos y movimientos de origen completos. |
| Asientos | Confirmaciones, balance y errores de generación atendidos. |
| Bancos y partidas | Conciliaciones y diferencias explicadas. |
| Activos y diferidos | Cuotas y devengos del período revisados. |
| Reportes | Libros y estados consultados sobre el mismo corte. |

1. Abra el período y obtenga la comprobación previa actual.
2. Resuelva los bloqueos indicados y vuelva a comprobar.
3. Revise el efecto esperado del cierre y confirme con permiso suficiente.
4. Recargue y compruebe el estado cerrado y los asientos que correspondan.
5. Para una corrección posterior, solicite reapertura al superadministrador autorizado.

**Ejemplo:** un período cerrado que rechaza un asiento nuevo no se resuelve moviendo artificialmente la fecha a otro mes. La corrección exige tratar el período de acuerdo con su autorización.

**Resultado esperado:** no quedan dos cierres activos para la misma secuencia. Reabrir y recerrar conserva la historia y genera su tratamiento de cierre nuevo; no borra el cierre anterior como si nunca hubiera existido.

## 25. Centros de costo, presupuestos y alertas

### Revisar presupuesto, ejecución y sobreconsumo

El responsable del área define el presupuesto; contabilidad valida centro, cuenta y período. Antes de guardar, espere la carga completa de los catálogos necesarios.

| Dato | Interpretación |
|---|---|
| Centro y cuenta | Identifican el alcance del importe presupuestado. |
| Período | Responde al calendario de la empresa. |
| Presupuesto | Importe autorizado para ese alcance. |
| Ejecución | Resultado de movimientos válidos y completos, no de una página aislada. |
| Alerta | Depende del umbral y de un alcance consultado de forma fiable. |

1. Seleccione período, centro y cuenta y registre el importe.
2. Guarde y recargue el detalle para verificar la cifra.
3. Consulte la ejecución y compruebe que las fuentes terminaron de cargar.
4. Revise alertas y comparación con el mismo alcance.
5. Edite o solicite baja sólo desde un detalle vigente y elegible.

**Ejemplo aritmético:** presupuesto de 36,00 y ejecución confirmada de 36,35 representan un exceso de 0,35. Una consulta fallida no permite concluir que la ejecución es cero o que no hay alertas.

**Conflictos:** si otra ventana modificó el presupuesto, conserve su solicitud y concilie el resultado. Un fallo al obtener el bloqueo o un recibo incompleto no confirma la baja ni autoriza eliminar el pendiente local.

## 26. Activos fijos

### Separar alta, depreciación y disposición

El responsable patrimonial valida el bien y sus fechas; contabilidad revisa costo, residual y parámetros de depreciación. La venta y la baja necesitan su propia decisión y fecha.

| Dato | Revisión |
|---|---|
| Identificación y adquisición | Permiten reconocer el activo y su fecha civil. |
| Costo y residual | Definen el importe sujeto al tratamiento del cronograma. |
| Vida o método | Son los admitidos y elegidos para ese activo. |
| Inicio y período | Determinan qué cuota se revisará. |
| Centro | Mantiene la clasificación que corresponda al bien. |

1. Registre el alta y compruebe su identidad y cronograma.
2. Consulte el activo y período antes de seleccionar el lote de depreciación.
3. Revise candidatos completos y confirme una vez el lote elegible.
4. Consulte cuotas y asiento del original confirmado.
5. Para vender o dar de baja, utilice la acción específica y revise sus importes y asiento.

**Ejemplo aritmético:** con costo 1.200,00 y residual 200,00, la diferencia es 1.000,00. El cronograma depende del método y parámetros seleccionados; esa resta no determina por sí sola la cuota mensual.

**Resultado esperado:** no se duplica una cuota al recuperar un lote y no se deprecia por debajo del residual. Una nueva estimación modifica el tratamiento futuro permitido, conservando las cuotas históricas confirmadas.

## 27. Ingresos y gastos diferidos

### Comprobar el calendario de reconocimiento

Contabilidad define la naturaleza del diferido, las cuentas y los períodos. Prepare el documento de sustento y compruebe la moneda y el importe a distribuir antes de crear el programa.

| Dato | Control |
|---|---|
| Tipo | Distingue ingreso y gasto diferidos. |
| Importe y moneda | Corresponden al monto que se distribuirá. |
| Cuentas | Reflejan el saldo diferido y su reconocimiento. |
| Calendario y centro | Identifican períodos y clasificación del devengo. |

1. Registre el diferido con sus fuentes completas.
2. Consulte el programa creado y revise cuotas y períodos.
3. Seleccione el devengo elegible y confirme su operación.
4. Compruebe cuota, saldo y asiento después de recargar.
5. Si necesita cancelar, revise primero las cuotas confirmadas y la acción permitida.

**Ejemplo aritmético:** distribuir 100,00 en tres cuotas puede exigir absorber un céntimo de redondeo en la última. La suma del calendario debe coincidir con el importe original; no cree un devengo manual adicional para compensar un residuo ya tratado por el programa.

**Concurrencia:** si otro usuario devenga mientras se intenta cancelar, recupere el estado vigente antes de decidir. La recuperación de la cuota original no inicia una cuota nueva ni borra las anteriores.

## 28. Consignaciones

### Explicar el saldo de una entrega

El responsable de consignaciones identifica destinatario y artículos. Las cantidades entregadas, vendidas y devueltas deben poder conciliarse sobre la misma entrega.

| Dato | Control |
|---|---|
| Destinatario | Corresponde al tercero del registro. |
| Productos y cantidades | Identifican los bienes de la entrega. |
| Moneda y valor | Conservan la unidad monetaria del documento. |
| Estado | Determina si se puede vender, devolver, cerrar o anular. |

1. Registre y confirme la entrega.
2. Consulte su detalle antes de registrar una venta o devolución.
3. Capture la cantidad realmente vendida o devuelta dentro del saldo permitido.
4. Revise el saldo y el historial después de confirmar.
5. Cierre o anule únicamente si el estado y controles lo permiten.

**Ejemplo aritmético:** diez unidades entregadas, tres vendidas y dos devueltas dejan cinco por resolver, si no existen otros movimientos. Ese saldo debe explicarse por la misma consignación, no por otra entrega del destinatario.

**Identidad de operación:** recuperar una entrega confirmada conserva su registro. Una entrega nueva, aunque repita destinatario y productos, es otro hecho empresarial y debe iniciar su propia operación. No reutilice una confirmación antigua para justificar una salida física nueva.

## 29. Monedas, tipos de cambio y revaluación

### Revisar tres cotizaciones con funciones distintas

El responsable financiero debe distinguir la cotización documental, la de liquidación y la utilizada para evaluar saldos abiertos. Que tengan el mismo valor en un caso no las convierte en una sola fuente.

| Cotización | Para qué se conserva |
|---|---|
| Documento | Conversión histórica del importe de origen. |
| Pago | Tratamiento de la liquidación y diferencia realizada cuando corresponda. |
| Revaluación | Evaluación de saldos abiertos a una fecha de corte. |

1. Consulte la deuda en su moneda de origen y su fotografía documental.
2. Verifique la cotización aplicable al pago o evaluación que va a realizar.
3. Genere la simulación de revaluación con fecha y fuentes completas.
4. Revise el alcance y confirme el registro autorizado.
5. Consulte el asiento y recibo originales después de registrar o recuperar.

**Ejemplo aritmético:** USD 100,00 a una cotización documental de 3,70 equivalen a 370,00 en la moneda base del ejemplo. Una cotización posterior de 3,80 no reescribe esa factura histórica; el tratamiento de pago o revaluación registra su diferencia en el flujo correspondiente.

**Si falta una tasa:** recupere o complete la fuente autorizada. No utilice 1,00 como reemplazo de un dato desconocido ni sume directamente deudas PEN y USD para presentar un total.

## 30. Consolidación y reportes configurables

### Generar un reporte reproducible de grupo

La controladora prepara la definición y cada empresa miembro autoriza su participación. Antes de generar, confirme membresía, homologación, moneda de presentación y tasas necesarias.

| Elemento | Decisión que debe quedar clara |
|---|---|
| Miembros | Qué empresas aceptaron la invitación y forman parte del alcance. |
| Homologación | Cómo se relacionan cuentas de origen y presentación. |
| Líneas y fórmulas | Qué saldo o movimiento representan y de qué líneas dependen. |
| Tasas | Qué fuente de cierre, promedio o histórica requiere cada conversión. |
| Ajustes | Qué eliminación o reclasificación pertenece sólo al reporte. |

1. Revise los miembros aceptados del grupo.
2. Complete homologación y definición del reporte, evitando dependencias circulares.
3. Seleccione período y moneda y complete las tasas exigidas, incluida la controladora si aplica.
4. Genere y revise las líneas y sus signos.
5. Aplique ajustes autorizados y vuelva a comprobar el resultado del mismo alcance.

**Ejemplo:** una línea de ingresos del mes y otra de saldo acumulado no responden a la misma base temporal. Revise su definición antes de sumarlas en una fórmula.

**Resultado esperado:** el reporte puede explicarse por miembros, cuentas, período y tasas. Sus eliminaciones no alteran los libros legales individuales. Una invitación pendiente o una tasa ausente no se resuelven omitiendo silenciosamente la empresa.

## 31. Libros, estados financieros y reportes operativos

### Protocolo de revisión antes de distribuir un reporte

Quien prepara el reporte define la pregunta y el corte; quien lo recibe debe poder identificar alcance, moneda y fuentes. Descargar un archivo no corrige una consulta incompleta.

| Control | Qué revisar |
|---|---|
| Fecha o período | Corresponde a la decisión que se quiere tomar. |
| Empresa y filtros | Son los mismos en pantalla y archivo. |
| Moneda y unidades | Están indicadas y no mezclan nominales incompatibles. |
| Completitud | Incluye todas las páginas o fuentes requeridas por el reporte. |
| Comparación | Actual y anterior usan el alcance temporal previsto. |

1. Seleccione el reporte y establezca sus filtros.
2. Recupere cualquier fuente fallida antes de interpretar totales.
3. Abra el detalle que explica una cifra relevante y revise su signo y moneda.
4. Exporte o imprima desde ese corte confirmado.
5. Abra el archivo y revise encabezados, cifras, columnas y páginas.

**Ejemplo:** un estado de situación al cierre conserva cuentas con saldo aunque no tengan movimiento en el mes. Un reporte de movimiento mensual puede mostrar otro conjunto sin que ello autorice a comparar ambos totales como si fueran equivalentes.

**Incidencias:** si cambia período y falla la consulta, no distribuya las filas del período anterior. Un porcentaje sin base se interpreta como no aplicable. Los TXT PLE descargados siguen siendo insumos de validación, no constancias de presentación.

## 32. Impuestos y SIRE

### Conservar el papel de trabajo y sus versiones

El contador revisa fuentes y ajustes del ejercicio consultado. Las tasas y parámetros deben provenir de la configuración normativa aplicable; los ejemplos del manual no sustituyen esa fuente.

| Elemento | Revisión |
|---|---|
| Período y régimen | Definen la evaluación que se está preparando. |
| Ventas y compras | Deben estar completas y conservar su origen. |
| Saldos y créditos | Se sustentan con el corte anterior y las entradas admitidas. |
| Ajustes manuales | Tienen sustento y no reemplazan una fuente fallida. |
| Versión y constancia | Distinguen corte guardado y evidencia de presentación externa. |

1. Consulte el período y recupere fuentes y saldo anterior.
2. Complete ajustes sustentados y recalcule.
3. Revise el papel de trabajo antes de guardar una versión.
4. Si hay una corrección posterior, conserve el historial y genere la versión que corresponda.
5. En SIRE, consulte reporte, ticket y bitácora de su propio flujo sin confundir un pendiente con aceptación.

**Ejemplo:** guardar una versión mensual no equivale a presentar la declaración. Una constancia local simulada en certificación tampoco acredita una presentación del contribuyente.

**Recuperación:** un guardado con respuesta perdida se recupera con la misma intención. No cambie créditos ni genere otra versión sólo para averiguar si la primera quedó registrada. Una descarga SIRE congelada conserva el contenido de esa versión, no una regeneración silenciosa con datos actuales.

## 33. Recursos humanos: personas, contratos y solicitudes

### Preparar fuentes laborales coherentes

Recursos humanos mantiene la ficha del empleado, contrato y solicitudes; el aprobador decide las solicitudes que permita su rol. Compruebe el período que utilizará la planilla antes de modificar una vigencia.

| Fuente | Dato que debe verificarse |
|---|---|
| Empleado | Identidad, empresa y estado correspondientes. |
| Contrato | Fechas, remuneración y régimen aplicables al período. |
| Asistencia | Entradas y salidas o correcciones explícitas del trabajo registrado. |
| Solicitud | Tipo, fechas y decisión persistida. |
| Reclutamiento | Vacante y estado reales del candidato. |

1. Revise o registre la persona sin duplicar su identidad documental.
2. Mantenga el contrato y sus vigencias con los datos del caso.
3. Registre asistencia y solicitudes por sus acciones correspondientes.
4. Obtenga la aprobación o rechazo y recargue para comprobar la decisión.
5. Antes del cálculo laboral, confirme que las fuentes del período estén completas.

**Ejemplo:** una renovación que comienza el mes siguiente no debe reemplazar el sueldo del contrato que intersecta el mes liquidado. Una solicitud rechazada tampoco se suma como vacaciones aprobadas.

**Si falla una fuente:** conserve el formulario y recupere la consulta. No complete días, hijos, estado civil ni salario por deducción para hacer avanzar un cálculo. Los datos opcionales ausentes se mantienen como tales hasta que exista una edición explícita.

## 34. Planilla, vacaciones remuneradas y EPS

### Organizar cálculo, aprobación y pago

Prepare empleados, contratos vigentes, normativa activa, conceptos, asistencia y solicitudes del período. El calculador, aprobador y pagador deben conservar la separación exigida por el flujo.

| Revisión | Qué debe quedar confirmado |
|---|---|
| Fuentes | Están completas por empresa y período, incluidos conceptos de detalle. |
| Cálculo | Ingresos, descuentos, aportes y neto tienen explicación por trabajador. |
| Aprobación | Corresponde al cálculo vigente y al actor autorizado. |
| Pago | Destino y referencia corresponden a la obligación aprobada. |
| Boleta | Identifica trabajador, período y resultado de la planilla. |

1. Cree la planilla y compruebe su identidad de borrador.
2. Revise las fuentes y ejecute el cálculo autorizado.
3. Compruebe por empleado los conceptos y totales antes de pedir aprobación.
4. Obtenga la aprobación segregada.
5. El pagador confirma el destino y ejecuta el pago permitido.
6. Revise historial, banco, boletas y asiento vinculados.

**Ejemplo de lectura:** sueldo, vacaciones remuneradas, descuento pensionario y aporte patronal son componentes distintos. Un aporte del empleador no se descuenta al trabajador sólo porque forme parte del costo de la planilla.

**Recuperación:** si ya existe la planilla y falla el cálculo, recupere esa etapa. Si se perdió la respuesta del pago, conserve el intento y verifique la salida bancaria antes de volver a pagar. El paquete PLAME continúa por el procedimiento del capítulo 36.

## 35. CTS y liquidaciones

### Completar un beneficio sin duplicar su pago

Recursos humanos valida fechas y fuentes históricas; el confirmador aplica la decisión laboral y tesorería registra el pago autorizado. El cálculo no produce por sí solo el cese del empleado.

| Dato | Revisión |
|---|---|
| Trabajador y fecha | Corresponden al caso y al corte de beneficio o cese. |
| Historia | CTS, gratificaciones y vacaciones tienen fuentes comprobables. |
| Componentes | Explican el total congelado del cálculo. |
| Confirmación | Separa revisión del cálculo y aplicación del cese cuando corresponda. |
| Pago o depósito | Cuenta, referencia y evidencia corresponden al beneficio. |

1. Consulte las fuentes completas y genere o revise el cálculo.
2. Resuelva faltantes antes de confirmar.
3. Obtenga la decisión del actor autorizado.
4. Deposite CTS o pague la liquidación aprobada mediante la acción correspondiente.
5. Compruebe el historial y movimiento bancario y, cuando corresponda, el asiento.

**Ejemplo:** una CTS pendiente incorporada en la liquidación final no debe pagarse además como depósito independiente. Revise el estado consumido o vinculado antes de operar.

**Correcciones:** un depósito realizado no se reabre por recalcular. La reversa de un pago conserva el original como revertido y restablece su obligación según el flujo. Un nuevo pago después de una reversa es otra operación, no el reintento de la transferencia antigua.

## 36. PLAME, T-Registro y contexto por país

### Preparar un paquete y reconocer qué falta fuera del ERP

El responsable laboral prepara las fuentes y el usuario autorizado realiza la validación y presentación externas. Compruebe que la empresa y planilla pertenecen al país cuyo paquete necesita.

| Elemento | Control |
|---|---|
| Identificación patronal y personal | RUC e identidades están completos para el paquete peruano. |
| Contratos y códigos | La ficha contiene los códigos paramétricos exigidos. |
| Jornada | Procede de asistencia o corrección manual explícita y auditable. |
| Versión | Conserva el corte y los archivos congelados. |
| Evidencia externa | Distingue constancia PLAME, ticket y CIR de T-Registro. |

1. Seleccione la planilla calculada y revise los bloqueos de preparación.
2. Corrija las fuentes señaladas desde su ficha o procedimiento autorizado.
3. Congele el paquete cuando la validación lo permita.
4. Descargue los archivos y conserve la versión.
5. Valide las fuentes en PVS y continúe la carga en SOL mediante el proceso oficial autorizado.
6. Registre las evidencias externas que correspondan sin reemplazar las anteriores.

**Distinción práctica:** el ZIP de trabajo del ERP no es por sí mismo el ZIP validado de carga. Una constancia PLAME y un CIR registral acreditan cosas distintas.

**Cambios posteriores:** si cambia la fuente de un trabajador, revise su novedad registral y la versión nueva. No reutilice una evidencia anterior para afirmar que una modificación posterior ya fue presentada.

## 37. Auditoría, notificaciones y ayuda

### Investigar una acción desde su contexto

El responsable autorizado consulta auditoría para reconstruir quién hizo qué, sobre qué recurso y cuándo. Un registro de auditoría acompaña al hecho; no sustituye el estado actual del recurso.

| Filtro o dato | Uso |
|---|---|
| Empresa y actor | Delimitan las acciones que se investigan. |
| Tipo de operación | Separa altas, cambios y bajas. |
| Fecha | Se interpreta en el contexto horario mostrado. |
| Recurso | Permite contrastar el evento con el documento o maestro. |
| Páginas | Aseguran revisar todo el alcance necesario. |

1. Defina el recurso y período de la incidencia.
2. Aplique filtros y recupere catálogos o páginas fallidos.
3. Abra el detalle del evento y contraste actor, acción y referencia.
4. Consulte el recurso original para comprobar el resultado persistido.
5. Registre la conclusión y use la ayuda del módulo si necesita continuar el proceso.

**Ejemplo:** recibir una notificación de una operación no garantiza que su consulta posterior haya terminado de cargar. Abra el recurso y compruebe su estado; no repita la operación desde la notificación.

**Integraciones:** una prueba de conexión satisfactoria no acredita la entrega o aceptación de cada documento. Consulte la bitácora y evidencia del envío concreto cuando se investigue una transmisión.

## 38. Lecturas, borradores y operaciones interrumpidas

### Árbol de decisión ante una interrupción

Identifique la última acción antes de pulsar otro botón. Una consulta puede repetirse; una escritura con resultado incierto requiere preservar su identidad.

| Pregunta | Siguiente acción |
|---|---|
| ¿Sólo estaba consultando? | Recupere la lectura del mismo alcance y revise el resultado nuevo. |
| ¿Todavía no había confirmado el formulario? | Revise el borrador conservado y continúe cuando sus fuentes sean fiables. |
| ¿Ya confirmó y perdió la respuesta? | Abra el pendiente original y consulte o reintente su recuperación. |
| ¿Existe un recibo completo? | Compruebe su recurso y complete la verificación pendiente. |
| ¿Hay conflicto o datos dañados? | Conserve evidencia y use resolución explícita o soporte. |

1. Anote recurso, usuario, empresa y último resultado confirmado.
2. Vuelva al contexto original sin cambiar importe o destinatario.
3. Revise la intención conservada y utilice la recuperación ofrecida.
4. Compruebe el resultado en su historial y sus efectos vinculados.
5. Prepare una operación distinta sólo después de resolver la anterior.

**Ejemplo:** una transferencia con respuesta perdida puede haber generado ya el cargo y abono. Si se crea otra para comprobarlo, se corre el riesgo de transferir dos veces. La recuperación debe devolver el original.

**Criterio de salida:** existe un resultado completo y coherente, o un rechazo o abandono explícitamente confirmado que permite decidir el paso siguiente. Cerrar una ventana o esperar un tiempo no demuestra ninguno de esos resultados.

## 39. Trabajo sin conexión y escritorio Windows

### Preparar y recuperar una sesión de escritorio

El usuario conserva su perfil y opera únicamente las capacidades compatibles con persistencia local. Administradores y soporte deben preservar ese perfil cuando contiene pendientes; reinstalar o vaciar datos no es un procedimiento de recuperación ordinario.

| Situación | Interpretación |
|---|---|
| Dato local consultable | Es una copia autorizada del alcance disponible, no necesariamente todo el servidor. |
| Entrada en cola compatible | Está pendiente hasta que la sincronización se confirme. |
| Pago o emisión inciertos | Conservan recuperación propia; no se convierten en cola genérica. |
| Cambio de actor o rol | Puede retirar acceso a datos y pendientes locales. |

1. Identifique cuenta, empresa y operación antes de salir.
2. Al reiniciar Windows o el ERP, vuelva al contexto propietario.
3. Revise los pendientes sin asumir que se enviaron automáticamente.
4. Restablezca la conexión y utilice sincronización o recuperación según la clase de operación.
5. Compruebe el resultado del servidor y el retiro o actualización del pendiente correspondiente.

**Ejemplo:** una edición de cliente compatible puede quedar en cola; un pago de planilla no se considera realizado por estar conservado localmente. Cada uno se recupera con su mecanismo.

**Si cambia de usuario:** el nuevo actor no adquiere acceso al pendiente privado del anterior. El propietario debe recuperar su contexto; compartir el perfil no sustituye la autorización.

## 40. Recorridos completos de trabajo

### Puntos de entrega entre responsables

Cada área debe entregar una referencia confirmada a la siguiente. No basta una captura de un formulario sin guardar ni una promesa de que la operación se completará después.

| Recorrido | Entrega que habilita continuar |
|---|---|
| Ventas a almacén | Pedido elegible con cantidades y reservas revisadas. |
| Almacén a facturación | Despacho y cantidades confirmados en su origen. |
| Recepción a cuentas por pagar | Referencia de cumplimiento y factura real del proveedor. |
| Cálculo a aprobación laboral | Planilla completa y revisada del período. |
| Aprobación a tesorería | Obligación aprobada, importe y destino identificados. |
| Operaciones a cierre contable | Documentos y efectos recuperados, diferencias explicadas. |

1. Identifique el recorrido y sus responsables antes de comenzar.
2. Registre la referencia confirmada al terminar cada etapa.
3. En el siguiente módulo, compruebe origen, importe y estado antes de continuar.
4. Si una etapa falla, resuelva esa etapa sin recrear las anteriores.
5. Cierre el recorrido cuando sus estados físicos, financieros y contables sean coherentes.

**Ejemplo:** una venta a crédito puede terminar la entrega física y mantener saldo pendiente de cobro. No se registra un cobro ficticio para declarar completo el recorrido comercial.

**Comprobación final:** debe ser posible seguir las referencias desde el origen hasta el resultado. La aceptación fiscal externa, cuando corresponda, conserva su propia etapa y evidencia.

## 41. Incidencias frecuentes y soporte funcional

### Preparar un caso de soporte que permita decidir

Recopile el contexto visible sin repetir operaciones sensibles para reproducir el error. El objetivo es identificar el resultado de la operación original y el procedimiento que permite continuar.

| Información | Qué aportar |
|---|---|
| Contexto | Empresa, módulo, usuario o rol y versión visible. |
| Recurso | Identificador, serie o referencia que se estaba usando. |
| Secuencia | Acción intentada y último resultado confirmado. |
| Momento | Fecha y hora local aproximadas y posibles cortes de conexión. |
| Evidencia | Mensaje o captura sin secretos y estado del pendiente. |

1. Conserve el formulario y el perfil si existe una operación pendiente.
2. Consulte el historial cuando esa lectura esté disponible y autorizada.
3. Describa qué esperaba y qué observó, sin afirmar ausencia de efecto sólo por un error.
4. Entregue el caso a soporte y siga la resolución del original.
5. Compruebe el resultado y cierre el incidente cuando pueda continuar sin duplicar efectos.

**Ejemplo de descripción útil:** «Confirmé el pago de la factura identificada, se interrumpió la conexión y el formulario conserva el intento; el último historial confirmado era anterior al pago». Esto distingue una confirmación perdida de un rechazo de validación.

**Protección de información:** excluya contraseñas, PIN, tokens y claves privadas. Si soporte necesita una corrección empresarial, debe quedar diferenciada de la mera consulta del incidente.

## 42. Glosario y alcance de esta edición

### Cómo interpretar el alcance de la documentación


| Documento o término | Interpretación correcta |
|---|---|
| Capítulo del manual | Explica el proceso, su preparación, decisiones y recuperación. |
| Ficha de referencia | Identifica una operación o variante concreta y su respaldo. |
| Criterio original | Conserva la aserción y datos de una evidencia local. |
| Certificación local | Dictamen de preparación del candidato, distinto de su activación productiva. |
| Evidencia externa | Resultado verificable de la autoridad o servicio correspondiente. |

1. Busque primero el proceso que quiere realizar.
2. Si necesita una variante específica, consulte su ficha y vuelva al procedimiento del capítulo.
3. Distinga datos ilustrativos de campos y reglas que deba completar con información real.
4. Para una discrepancia, identifique la versión y la fuente antes de interpretar el resultado.


**Límite de interpretación:** esta edición no añade funciones por describirlas ni convierte una prueba local en habilitación fiscal o despliegue. La referencia funcional y las fuentes preservadas permiten verificar qué comportamiento respalda cada explicación.
