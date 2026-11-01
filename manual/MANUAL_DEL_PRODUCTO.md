# Manual funcional y operativo del ERP

Guía de producto para usuarios, responsables de área, administradores y soporte funcional.

**Edición:** 31 de octubre de 2026. **Versión del producto:** `ba9493a2`, esquema de base de datos 590.

Este manual explica qué hace el producto y cómo se trabaja con él: configuración, ventas, contratos de suministro, compras, inventario y lotes, caja, finanzas, contabilidad, obligaciones fiscales, recursos humanos, migración desde otro sistema, escritorio Windows y recuperación de operaciones.

Un documento fiscal preparado por el sistema no implica presentación, aceptación ni habilitación ante una autoridad tributaria. Cada contribuyente activa eso con sus propias credenciales.

Los ejemplos numéricos son ilustrativos: no representan saldos reales, límites del sistema ni tasas legales. Verifique los parámetros vigentes del período y el resultado que confirme el producto.

Los permisos exactos de cada operación están en [REFERENCIA_API_Y_PERMISOS.md](REFERENCIA_API_Y_PERMISOS.md) y las pantallas en [INVENTARIO_DE_PANTALLAS.md](INVENTARIO_DE_PANTALLAS.md).

## 01. El producto y sus conceptos básicos

### Para qué sirve

El ERP conecta la operación comercial con inventario, tesorería y contabilidad. Una venta puede recorrer cotización, pedido, reserva, despacho, comprobante y cobro; una compra puede recorrer cotización, aprobación, orden, recepción, factura del proveedor y pago. Recursos humanos mantiene las fuentes de la remuneración y separa su cálculo, aprobación y pago. Los reportes permiten revisar esos procesos sin volver a ejecutarlos.

Una misma acción puede producir varios resultados relacionados: registrar un documento, modificar una obligación, generar un movimiento y dejar evidencia contable. El usuario confirma la operación empresarial; no debe repetirla por separado en cada módulo para completar sus efectos.

### Empresa, establecimiento, almacén y caja

| Concepto | Qué representa | Consecuencia para el usuario |
|---|---|---|
| Empresa | Identidad legal y ámbito de datos de la organización | Sus clientes, empleados, documentos, permisos y saldos no se mezclan con otra empresa. |
| Establecimiento o sucursal | Un local del mismo contribuyente | Determina el alcance de series, cajas, almacenes y usuarios asignados. |
| Almacén | Lugar de control físico de existencias | Una reserva, recepción o salida debe respetar su almacén. |
| Caja | Punto de manejo de efectivo | Opera mediante una sesión abierta y conserva su arqueo y cierre. |
| Cuenta bancaria | Destino u origen bancario explícito | Los cobros y pagos se vinculan a la cuenta elegida y a su moneda. |
| Centro de costo | Clasificación analítica | Permite analizar resultados sin convertir una sucursal en una contabilidad legal independiente. |

La contabilidad y los libros legales pertenecen a la empresa. Para llevar libros legalmente separados se requiere otra empresa; para reunir sus resultados existe consolidación.

### Documento, movimiento y comprobante fiscal

Un pedido no es una factura; una recepción no es una factura del proveedor; una firma electrónica no es una aceptación fiscal. Una deuda puede existir sin estar pagada y un documento puede estar registrado sin que su envío a una autoridad esté aceptado.

El historial conserva estas diferencias. Consulte el estado de cada recurso y su relación con los demás antes de decidir la siguiente acción.

### Dos formas de acceso

El navegador y el escritorio Windows comparten reglas empresariales, permisos y estados del servidor. El escritorio incorpora persistencia local y recuperación de rutas y operaciones compatibles. Esta persistencia no habilita pagos ni transmisiones fiscales sin confirmación del servidor.

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

### Iniciar sesión

1. Abra el acceso al ERP e introduzca el correo y la contraseña de su cuenta.
2. Compruebe la empresa y el país cargados antes de operar.
3. Si el acceso está temporalmente limitado por intentos fallidos, respete el plazo indicado antes de volver a intentarlo.
4. Si su usuario fue desactivado o su sesión revocada, solicite la revisión del administrador. Recargar o abrir otra ventana no restituye el permiso.

Una sesión no convierte al usuario en administrador. Cada módulo y cada acción conservan sus permisos propios.

### Completar el asistente inicial

El asistente prepara la identidad y configuración de la empresa. Revise los datos legales, país, moneda, información fiscal y los pasos que el producto solicite para ese contexto. Cargar datos básicos y probar flujos internos no exige haber obtenido una habilitación fiscal real.

Guarde cada paso y avance cuando la pantalla confirme su resultado. Si la consulta del estado falla, utilice **Reintentar**; no suponga que el paso no existe ni que la empresa necesita crearse otra vez. Una respuesta perdida conserva la operación para recuperarla.

El resumen final sólo acredita que el servidor confirmó el cierre del asistente. Estar en el último paso, tener un certificado seleccionado o ver datos en un formulario no equivale a haber completado el proceso.

### Corregir o reiniciar la configuración inicial

Si la interfaz ofrece reiniciar la configuración, revise la confirmación antes de aceptarla. Cancelar esa confirmación no debe cambiar el progreso. Si la respuesta se pierde después de confirmar, recupere el mismo intento; no encadene nuevos reinicios para forzar el estado.

Un error al resolver el país o la configuración no se interpreta como una empresa peruana nueva. La pantalla conserva el error y permite recuperar el contexto. Sólo una ausencia explícita y válida conduce al asistente correspondiente.

### Demostración y cuenta real

La demostración mantiene datos y credenciales temporales en su propio contexto. Para convertirla, defina y confirme un correo y una contraseña permanentes y elija la opción de datos que presente el producto. Una conversión confirmada no debe ejecutarse por segunda vez.

Los documentos nacidos como demostración conservan esa procedencia. Convertir la cuenta o cargar credenciales reales no transforma comprobantes de muestra en documentos fiscalmente aceptados.

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

### Organizar responsabilidades

| Responsabilidad | Trabajo habitual | Separación que debe conservar |
|---|---|---|
| Administración | Empresa, usuarios, roles, sucursales y parámetros | No comparte su sesión para sustituir aprobaciones operativas. |
| Ventas | Clientes, cotizaciones, pedidos y seguimiento | Emitir comprobantes no concede automáticamente permisos de cobranza. |
| Compras | Proveedores, cotizaciones, órdenes y recepciones | Aprobar y pagar son capacidades distintas de crear una compra. |
| Inventario y logística | Maestros, existencias, preparación y despacho | Leer stock no habilita ajustes ni cambios de maestros. |
| Caja y tesorería | Sesiones, arqueos, bancos, cobros y pagos | Debe identificar el destino y confirmar el resultado de cada operación. |
| Contabilidad | Asientos, períodos, libros, impuestos y análisis | Un lector contable no recibe por ello permisos de escritura. |
| Recursos humanos | Empleados, contratos, solicitudes y cálculo | Cálculo, aprobación y pago de nómina mantienen actores separados. |
| Lectura | Consultas autorizadas | No habilita formularios ni reintentos de operaciones privadas de otro usuario. |

Los nombres de roles pueden personalizarse. La autorización efectiva procede de los permisos asignados, del estado del usuario y de su alcance empresarial. Un administrador de demostración no tiene las mismas facultades que un administrador global.

### Crear un rol y asignarlo

1. Entre en la administración de roles con un usuario autorizado.
2. Espere a que se cargue el catálogo de permisos. Si falla, reintente antes de guardar.
3. Defina el nombre y seleccione sólo las capacidades necesarias.
4. Guarde y confirme que el rol existe antes de asignarlo al usuario.
5. Desde la gestión de usuarios, asigne el rol y compruebe el acceso con la cuenta destinataria.

Un nombre duplicado o una configuración no permitida se rechazan sin crear una autorización parcial. Los roles de sistema no son editables libremente. No se debe desactivar un rol si con ello un usuario activo pierde su acceso obligatorio.

### Crear, editar y dar de baja usuarios

Complete la identidad y credenciales desde la pantalla administrativa. Si el administrador eligió la contraseña, el sistema no debe devolverla como dato de consulta. Cuando se genera una credencial temporal, un reintento no crea otra diferente para el mismo alta.

Al editar rol, teléfono o estado, espere la confirmación. Un fallo conserva el editor. Desactivar un usuario revoca sus sesiones; el acceso siguiente debe quedar rechazado. El sistema protege la auto-desactivación y al último administrador protegido por su contrato.

### Cambios de permiso con sesiones abiertas

Un cambio de rol puede retirar una capacidad en la consulta siguiente aunque el usuario conserve la ventana abierta. Los datos previamente autorizados no deben reaparecer por una respuesta demorada ni por perder la red después de la revocación.

Salir e ingresar como otro usuario o empresa no transfiere los borradores, cobros o pagos pendientes del anterior. Al volver el propietario, su operación puede seguir disponible para recuperación manual.

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

### Mantener el perfil empresarial

Desde **Configuración > Empresa**, consulte y edite los campos que su permiso habilite: razón social, nombre comercial, dirección, teléfono y correo. Revise los obligatorios antes de guardar. Cancelar debe conservar los valores persistidos.

Los campos opcionales pueden limpiarse explícitamente conforme a sus reglas. El formulario no debe interpretar un vacío accidental como una actualización confirmada. Si el guardado queda incierto, conserve el borrador y recupere la misma operación antes de cambiar de nuevo los datos.

Para cargar o sustituir el logo, elija un archivo de formato y tamaño admitidos por la pantalla. Un archivo con extensión válida pero contenido inválido puede ser rechazado por el servidor. El logo anterior o los demás datos no deben perderse por un fallo de la carga. Quitar el logo es una acción independiente que debe confirmarse.

### País y configuración fiscal

El país de la empresa determina moneda base, documentos, autoridad y opciones normativas. No cambie el país para eludir una validación. Un comprobante histórico conserva la identidad y el país de su emisión, aunque la configuración actual haya cambiado.

Los parámetros deben preservar valores válidos como cero o desactivado. Un campo ausente no significa lo mismo que un booleano falso. Consulte el resumen para identificar qué configuraciones están preparadas, incompletas o no evaluadas.

### Establecimientos y alcance

La casa matriz utiliza el código `0000` y no se desactiva. Los anexos conservan el código de cuatro dígitos de su identificación empresarial. Una vez utilizado, ese código no se reescribe como si fuera sólo una etiqueta.

1. Cree el establecimiento con sus datos y código correctos.
2. Vincule los almacenes, cajas y series que le correspondan.
3. Asigne sucursales a los usuarios que deban operar sólo en determinados locales.
4. Verifique el alcance con el usuario operativo antes de usar la nueva serie o caja.

Un usuario sin asignaciones alcanza todas las sucursales de su empresa dentro de sus permisos; asignar locales lo restringe a esos locales. Una venta de POS hereda el establecimiento de su caja; un movimiento físico, de su almacén; un comprobante, de su serie. No se debe forzar manualmente un local incompatible con ese origen.

### Series y correlativos

Cree o edite series con permiso de configuración y con el tipo documental y establecimiento correctos. El formato y los límites se validan. Un reintento de la misma creación debe recuperar la serie existente, no reservar otra numeración.

Un ticket interno y una factura o boleta fiscal utilizan contratos diferentes. No cambie una serie para hacer pasar un ticket por un comprobante aceptado.

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

<!-- revision-omisiones-inicio -->
### Qué ocurre al quitar todas las sucursales asignadas

Un usuario sin sucursales asignadas alcanza todas las sucursales de su empresa, siempre dentro de sus permisos. La lista vacía no significa «ningún local». Asignar una o varias lo restringe a esas; retirar todas las asignaciones restituye el alcance total.

Antes de confirmar un cambio, revise si pretende restringir al usuario o devolverle alcance central. Compruebe el resultado con su cuenta. Si falla el reemplazo de asignaciones, debe conservarse el alcance anterior; no interprete el fallo como una restricción ya aplicada.
<!-- revision-omisiones-fin -->

<!-- revision-omisiones-inicio -->
### Límites del logo empresarial

El logo admite PNG o JPEG de hasta **2 MiB**, con un máximo de **4.096 píxeles por dimensión** y **16.000.000 de píxeles en total**. Debe cumplir todos los límites; un archivo pequeño en bytes puede exceder el máximo de resolución. Cambiar la extensión no convierte su contenido en una imagen válida.

Estos límites son distintos de los de la fotografía de producto, que admite también WebP en su flujo de inventario. Si la carga del logo se rechaza, corrija el archivo y vuelva a cargarlo desde Configuración. No lo sustituya por una dirección web arbitraria ni pegue una imagen codificada en los campos de empresa. El logo es opcional y no acredita habilitación fiscal.
<!-- revision-omisiones-fin -->

## 05. Clientes, proveedores e importaciones

### Alta y mantenimiento individual

Registre el tercero con su identidad, documento y datos de contacto. Compruebe los datos antes de usarlo en una cotización, pedido, cuenta o comprobante. Los documentos requeridos dependen del país y del tipo de operación.

Edite el registro desde su detalle. Una interrupción no debe provocar otro alta con la misma identidad. Al recuperar una actualización, compruebe el dato persistido y el historial antes de considerar que hace falta una operación nueva.

### Importar un CSV

El flujo admite la plantilla ofrecida, vista previa, validación por registro y confirmación. El archivo debe ser CSV UTF-8; la interfaz admite hasta 5 MiB. El importador masivo y sus validaciones documentales están sujetos al contexto peruano y al permiso de migración correspondiente; el alta individual sigue siendo un flujo distinto.

1. Descargue la plantilla del listado de clientes o proveedores.
2. Prepare las columnas respetando encabezados y tipos. Conserve el identificador externo cuando lo utilice para recuperar importaciones.
3. Cargue el archivo y revise la vista previa; todavía no equivale a una importación.
4. Corrija documentos, duplicados y filas que la pantalla marque como inválidas.
5. Confirme el lote y revise si el resultado es completo, parcial o fallido.
6. Si el resultado fue parcial, corrija las filas pendientes sin convertir las ya importadas en terceros nuevos.

Se preservan comas, comillas y saltos dentro de un campo correctamente citado. Se rechazan encabezados duplicados, columnas desalineadas, archivos vacíos, codificación inválida y campos que exceden el límite admitido. El número de error identifica el registro CSV; un salto de línea dentro de una celda no crea otro registro.

No se envían importaciones a la cola sin conexión. Si se pierde la respuesta, recupere el intento original con los mismos identificadores antes de confirmar otro lote.

### Exportar y consultar

Los listados de clientes y proveedores exportan la página actual con los filtros vigentes. Esta exportación no implica que se hayan exportado todas las páginas del catálogo. Las celdas se protegen frente a fórmulas de hoja de cálculo, sin alterar el sentido empresarial del dato.

Las consultas, búsquedas y fichas pertenecen a la empresa y permisos actuales. Un vacío confirmado es válido; un error de lectura no significa que no existan terceros.

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

<!-- revision-omisiones-inicio -->
### Límite de longitud por campo CSV

Cada campo del CSV admite como máximo **4.096 caracteres**. El límite se aplica a una celda, no al registro completo, y es independiente del tamaño máximo de archivo. Un campo que lo excede se rechaza; no se recorta automáticamente para importar una versión incompleta del dato.

Si el error afecta una descripción o dirección extensa, revise el contenido y prepare una corrección consciente. No divida una celda mediante comas sin conservar el formato CSV, porque desplazaría las columnas restantes. Mantenga la identificación del registro para verificar luego la fila corregida.
<!-- revision-omisiones-fin -->

## 06. Productos, servicios y maestros de inventario

### Clasificación del catálogo

| Clasificación | Uso | Efecto físico |
|---|---|---|
| Producto físico con control de stock | Compra, reserva, despacho y venta de bienes | Produce existencias y movimientos según la operación. |
| Producto sin control de stock | Operación comercial sin control físico de existencias | No debe inventar entradas o salidas. |
| Servicio | Prestación recibida o vendida | Su aceptación y facturación no generan kardex de bienes. |

Defina la clasificación al crear el artículo y compruébela antes de comprar o vender. Una edición de descripción no debe cambiarla accidentalmente. No se admite convertir un producto con existencias en un servicio para hacer desaparecer el control físico.

### Crear o editar un producto

1. Abra el alta del catálogo con permiso de mantenimiento.
2. Defina código, nombre, categoría, unidad y clasificación.
3. Complete marca, precio, costo y tratamiento de impuesto cuando correspondan.
4. Si registra stock inicial, seleccione un almacén válido.
5. Revise la precisión de cantidades y precios antes de guardar.
6. Espere la confirmación y abra el detalle para comprobar los datos persistidos.

El código es único dentro de la empresa sin distinguir mayúsculas. Un costo cero válido no es un costo desconocido. Una unidad histórica sin regularizar no se convierte automáticamente en unidades al editar el nombre o precio.

### Categorías, almacenes y ubicaciones

Mantenga los códigos y nombres únicos en su ámbito. Renombrar una categoría debe reflejarse en sus productos sin crear otra clasificación paralela. Las ubicaciones pertenecen a un almacén concreto; no se asignan a existencias de otro.

Las altas, ediciones, reactivaciones y desactivaciones respetan permisos. La desactivación es lógica y puede bloquearse por existencias, reservas, daños, productos o ubicaciones activas. Debe mantenerse un único almacén principal activo.

### Imagen del producto

El alta y la edición admiten JPG, PNG o WebP hasta 5 MB. Cargue, sustituya o quite la imagen desde la aplicación. La selección local de un archivo no prueba que la carga haya terminado. Si la respuesta se pierde, recupere la operación; no elimine el producto para volver a intentarlo.

Los fallos de carga, activación o retiro deben conservar el resto de la edición. No se deben sustituir referencias de imagen desconocidas ni repetir una eliminación incierta desde otra ventana.

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

### Entender los saldos

La existencia física, la cantidad reservada y la cantidad disponible no son intercambiables. Reservar aparta disponibilidad; no equivale a una salida física. El despacho y las demás operaciones físicas dejan movimientos con producto, almacén, cantidad, costo y referencia.

El kardex permite filtrar por producto, almacén y fechas. Con fecha inicial, distingue saldo inicial, movimiento neto y saldo final; cada fila conserva el saldo corrido. Si la vista limita el detalle, el resumen completo no debe confundirse con la suma de la página visible.

No sume cantidades de unidades diferentes para obtener una existencia total. Para un resumen físico comparable, filtre un producto o un conjunto agregable. Un dato sin costo o conversión confiable se presenta como pendiente, no como un valor cero confirmado.

### Registrar un ajuste

1. Seleccione el producto y almacén que va a contar o corregir.
2. Revise la existencia leída y la unidad.
3. Introduzca la cantidad o diferencia que solicite la pantalla y su motivo.
4. Compruebe el signo de entrada o salida y la precisión admitida.
5. Confirme una sola vez y verifique el movimiento en el kardex.

Si se pierde la respuesta, conserve el intento. Repetir con una nueva operación puede duplicar el ajuste. Utilice la recuperación o conciliación ofrecida; un rechazo explícito sin efecto no se trata igual que una desconexión después del envío.

### Transferir entre almacenes

Indique origen, destino, producto y cantidad. La transferencia debe producir una salida y su entrada vinculada, sin duplicarlas al recuperar la respuesta. El origen y destino deben ser distintos y válidos dentro del alcance del usuario.

Entre establecimientos diferentes el traslado identifica ambos códigos y el motivo correspondiente. Si la empresa exige GRE, debe existir una guía compatible antes de ejecutar el traslado. Una guía para otro producto o con capacidad agotada no habilita la operación.

### Revisar el panel y el kardex

Los indicadores y el catálogo pueden recuperarse de forma independiente cuando la pantalla ofrece reintentos específicos. Una carga fallida no anuncia stock cero. Al cambiar producto, fechas o almacén, una respuesta antigua no debe reemplazar el nuevo filtro.

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





### Costo histórico de una operación recuperada

Al recuperar un ajuste o traslado, revise el costo registrado en su operación original. No reconstruya ese costo con el precio, stock o promedio actuales. La presentación puede redondear una cifra; la recuperación debe conservar la precisión del valor registrado y su relación con el kardex.

### Resolver un intento de inventario abandonado

Use la resolución explícita de la operación pendiente. Si el servidor confirma abandono, el intento anterior queda cerrado y una petición tardía no debe ejecutarlo. El formulario conserva sus valores para revisión; un nuevo envío requiere una intención nueva. Abandonar no revierte un movimiento ya confirmado.

### Identidad y archivo del movimiento confirmado

Compruebe que el recibo pertenece al mismo ajuste o traslado, empresa, usuario, clave y datos enviados. La aplicación conserva la intención hasta archivar y verificar el recibo completo. Si falla el archivo, mantenga la operación recuperable; no vuelva a registrar el movimiento como una operación nueva.

### Consultar si el original fue confirmado o abandonado

La resolución distingue una operación confirmada de otra abandonada. Una respuesta incierta no se interpreta como ninguna de las dos. Mantenga el intento y consulte de nuevo con su contexto original. Un recibo confirmado recupera el movimiento existente; el abandono confirmado permite revisar los campos conservados.

### Recuperar el recibo sin ejecutar el movimiento

La consulta manual del recibo original no repite el ajuste ni la transferencia y puede recuperar el resultado aunque fallen los catálogos actuales. Si el recibo es ajeno, parcial o inválido, la operación continúa pendiente. No cambie producto o almacén para intentar recuperar otra operación.

### Stock y precios en la sucursal seleccionada

Compruebe empresa, sucursal y almacén antes de interpretar disponibilidad o precio. Las fuentes deben terminar de cargar todas sus páginas; no extrapole el stock de una primera página ni reutilice datos de otra sucursal. Si cambia el alcance, espere la nueva consulta y descarte la respuesta del alcance anterior.

## 08. Gestión comercial: precios, comisiones y cotizaciones

### Listas de precios

Las reglas comerciales pueden depender de vendedor, cliente, producto exacto o marca, moneda, cantidad mínima, vigencia y prioridad. Una regla de producto exacto prevalece sobre una regla de marca aplicable.

Antes de confirmar una cotización, pedido o venta de POS, revise el precio resuelto y su alcance. Si cambian la cantidad, las condiciones o la regla mientras se revisan los precios, vuelva a realizar la revisión que solicite la pantalla. Un precio mostrado antes del cambio no autoriza por sí solo el nuevo documento.

Una operación confirmada conserva su precio histórico. Convertir una cotización o recuperar una venta no la revaloriza con una lista creada, vencida o desactivada después.

### Cotizar

1. Seleccione cliente, moneda y fechas comerciales.
2. Agregue las líneas con sus cantidades y productos.
3. Revise precios e impuestos de cada línea y el total.
4. Guarde el borrador. Si la lectura de precios o catálogos falla, recupérela antes de confirmar.
5. Envíe la cotización cuando esté lista para revisión.
6. Un actor autorizado distinto puede aprobarla o rechazarla; compruebe el estado y el historial.

La excepción de autoaprobación se limita al administrador canónico que tenga permiso explícito y deja auditoría. No se extiende a cualquier rol operativo ni a rechazar su propia propuesta. Un borrador puede editarse o eliminarse cuando el estado y el permiso lo permitan; cancelar una confirmación de eliminación no borra nada.

### Convertir a pedido

Desde una cotización elegible y con permiso, convierta a pedido. Verifique el enlace y las líneas del documento generado. Si la respuesta se pierde, recupere la misma conversión; no cree un pedido manual adicional para sustituirla.

### Comisiones y consolidado comercial

Las comisiones se devengan sobre operaciones elegibles y conservan las reglas históricas de vendedor, producto y marca. Una nota o anulación produce la reversión correspondiente; editar después el maestro no debe reescribir la comisión original.

El consolidado comercial reúne de una a diez ventas o documentos válidos de la misma moneda. Conserva la fotografía y no crea por sí mismo otra venta, otro cobro ni otro asiento de ingreso. No se reutiliza una misma fuente para duplicar el consolidado.

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

### Confirmar el pedido

Revise cliente, moneda, precios, cantidades y condiciones. La confirmación puede reservar stock. Si aparece una excepción comercial pendiente de aprobación, siga la bandeja correspondiente. Si el bloqueo es crediticio, regularice la cuenta del cliente; no existe una confirmación forzada pública para eludirlo.

### Preparar y despachar

1. Abra el pedido o el tablero de logística con fuentes completas.
2. Consulte cantidades pedidas, reservadas, ya despachadas y pendientes.
3. Registre la preparación y el embalaje según los controles disponibles.
4. Seleccione las líneas y cantidades que realmente salen.
5. Revise la guía aplicable, si se requiere.
6. Confirme el despacho y compruebe su estado e historial.

Se admiten despachos parciales dentro del saldo de cada línea. Una cantidad mayor al pendiente o con precisión no admitida debe corregirse. Si otra ventana ya consumió parte del saldo, actualice el origen antes de insistir; no fuerce la cantidad antigua.

Un evento manual de seguimiento no fabrica una salida de stock ni autoriza declarar una entrega antes del despacho. Una preparación interrumpida permanece consultable para continuarla.

### Facturar desde el pedido

Abra la acción de facturación sobre un pedido vigente y completo. Revise el receptor y las líneas que la operación permite facturar. Confirme y verifique el documento y CPE vinculados. Una respuesta incierta debe recuperarse desde la intención original, incluso tras recarga o reinicio del escritorio.

No basta una notificación genérica: el resultado tiene que corresponder al pedido y comprobante correctos. Un permiso de lectura no habilita facturar ni reutilizar el intento privado de otro actor.

### Cancelar y registrar entrega

Una cancelación requiere el estado elegible y el motivo. Compruebe la liberación de la reserva y el historial. Para registrar una entrega, mantenga las referencias del pedido y despacho; no use el seguimiento para saltarse el flujo físico.

Los indicadores de entrega sólo se muestran como evaluados cuando existen configuración y fechas suficientes. Falta de información de entrega no es cumplimiento a tiempo confirmado.

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

### Tramitar una devolución

1. Abra una solicitud de devolución referida al documento origen.
2. Seleccione las líneas y cantidades y registre el motivo.
3. Solicite la decisión de un actor autorizado distinto del creador.
4. Después de la aprobación, registre las recepciones permitidas, parciales o completas.
5. Revise las cantidades aceptadas y, antes de la nota, corrija mediante la reversa admitida si corresponde.
6. Cierre el proceso para emitir la nota por las líneas devueltas y consulte sus vínculos.

No se recibe físicamente una solicitud que sigue creada. Los bienes con control de stock producen devolución física; los servicios y artículos sin stock avanzan con su tratamiento lógico. Se conserva la clasificación que tenían las líneas al originar la devolución.

### Efecto sobre deuda y crédito del cliente

En el cierre RMA confirmado descrito aquí, la nota reduce la cuenta por cobrar hasta cero. Si excede la deuda pendiente, el excedente constituye saldo a favor del cliente; no se pierde ni convierte en un cobro de signo contrario.

Desde el saldo a favor puede aplicarse un importe a otra cuenta elegible o reembolsarse por un destino tesorero explícito. Una reversa del reembolso restaura la obligación y conserva la evidencia original; un pago nuevo posterior es otra operación, no un reintento de la ya revertida.

**Ejemplo funcional:** un crédito de 58,40 puede aplicarse por 20,00 a una factura de 23,60, dejando 3,60 por cobrar y 38,40 de crédito. Aplicar crédito, cobrar los 3,60 y reembolsar los 38,40 son tres decisiones distintas. Los importes ilustran el flujo documentado, no saldos de una empresa real.

La nota interna o firmada conserva su estado fiscal propio. No anuncie aceptación tributaria porque la deuda o devolución ya tenga un resultado interno.

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

### Preparar la venta

Ingrese con permiso de POS y una sesión de caja abierta. La caja determina el establecimiento y almacén. Compruebe el contexto, productos, cantidades, precios y receptor antes de cobrar.

Si cambia el carrito mientras se consultan precios, revise nuevamente el precio aplicable. No debe confirmarse una combinación de cantidades nuevas con un precio autorizado para otra fotografía del carrito.

### Cobrar

Seleccione el medio que ofrece la empresa: efectivo, tarjeta, transferencia, billetera u otra combinación admitida. En un pago mixto, sólo la parte en efectivo afecta el efectivo físico de la caja. Registre el importe recibido y compruebe el vuelto cuando corresponda.

Al confirmar, venta, detalle, pagos, stock aplicable, efectivo y vínculos documentales deben corresponder a la misma operación. Si se pierde la respuesta, recupere esa venta antes de iniciar otra. Cambiar carrito, receptor, sesión o medio de pago convierte la operación en otra intención; no es un reintento exacto.

### Ticket y comprobante fiscal

El ticket interno no consume una serie fiscal cuando se selecciona la venta sin CPE. Puede canjearse una sola vez por el comprobante elegible. El canje toma las líneas e importes de la venta original: no vuelve a descontar stock, cobrar, mover caja o crear una comisión por segunda vez.

Una factura requiere el receptor y documento tributario exigidos por el producto. La boleta aplica sus reglas de identificación e importe. Si la emisión fiscal queda pendiente, recupérela desde su flujo; no repita la venta para obtener otro comprobante.

### Redondeo de efectivo e impresión

En la configuración peruana y PEN, una venta íntegramente en efectivo puede aplicar el redondeo admitido a favor del consumidor. El total documental, ajuste y efectivo entregado deben permanecer distinguibles. No se aplica esa excepción a tarjeta, pagos mixtos, otras monedas o países.

Imprima el ticket o descargue el comprobante desde su historial. Una impresión fallida no justifica registrar la venta otra vez. El documento fiscal conserva su estado de aceptación aunque tenga una representación imprimible.

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

<!-- revision-omisiones-inicio -->
### Interpretar el redondeo y el efectivo físico

En el contrato peruano documentado, una venta en PEN pagada íntegramente en efectivo puede redondear a favor del consumidor al **décimo inferior**. El ajuste de cada venta está entre **0,01 y 0,09**, cuando corresponde; el importe documental y el efectivo físico siguen distinguiéndose. No se aplica a pagos mixtos, tarjeta, otras monedas ni otros países.

**Ejemplo del flujo:** un ticket de 0,52 puede representar 0,50 de efectivo físico y 0,02 de ajuste documentado. Un total inferior a 0,10 puede llegar a 0,00 de efectivo físico sin borrar la venta ni su importe documental. Consulte el ajuste registrado por el producto; no lo escriba como descuento o pago inventado. Varias ventas pueden acumular más de 0,09 de redondeo durante una sesión.
<!-- revision-omisiones-fin -->

## 12. Cajas, arqueos, turnos y cortes

### Crear cajas y abrir una sesión

Un administrador autorizado vincula la caja a establecimiento y almacén. Puede editar una caja sin sesión cuando su estado lo permita. Para comenzar la jornada, el cajero registra el conteo inicial y confirma la apertura. Dos solicitudes concurrentes no deben producir dos sesiones abiertas de la misma caja.

Una apertura sin confirmación conserva el formulario y su intento; no se considera una caja abierta por haber guardado algo localmente.

### Ingresos, gastos, retiros y depósito

Registre el tipo, importe, motivo y destino. Un ingreso o gasto manual exige la contrapartida que solicita la operación. Un retiro a banco debe identificar una cuenta real; una salida a bóveda o gasto conserva su propio destino.

Revise el movimiento en la sesión antes de realizar otro. No utilice una operación de caja para sustituir un pago a proveedor que deba quedar ligado a su deuda.

### Cambio de turno

El cambio congela la sesión para el intercambio y solicita las confirmaciones de los participantes. Revise saldo de sistema y conteo. La diferencia, cuando exista, queda documentada sin rehacer todas las operaciones de la jornada.

Cancelar el cambio requiere confirmación del servidor antes de considerar que la caja puede seguir operando. Un botón pulsado con respuesta perdida no descongela por sí solo la sesión.

### Cierre y supervisión

1. Revise ventas, pagos, movimientos y pendientes de emisión.
2. Obtenga la vista previa de cierre actual.
3. Cuente el efectivo real e introduzca el monto contado.
4. Revise el redondeo documentado y la diferencia de arqueo.
5. Cuando se requiera, solicite un supervisor distinto del operador y cajero responsables.
6. Confirme y consulte el corte; descargue PDF o CSV si corresponde.

Una diferencia pequeña no se considera automáticamente redondeo legal. Debe coincidir con los ajustes admitidos de las ventas. Un faltante o sobrante conserva su tratamiento y autorización. Si se utiliza PIN de supervisor, no lo comparta ni lo registre como observación del corte; los intentos fallidos pueden bloquearlo temporalmente.

El cierre físico y el administrativo son acciones distintas. Consultar una sesión no debe cerrarla. Una sesión o período ya cerrado mantiene sus restricciones; no se debe prometer una reversa de caja chica si no existe ese control en la interfaz documentada.

El PDF y CSV del corte deben describir el mismo cierre congelado. Si la descarga llega incompleta, con formato incorrecto o falla la red, reintente la descarga, no el cierre.

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

<!-- revision-omisiones-inicio -->
### PIN de supervisor y diferencia del cierre

El PIN de supervisor contiene exactamente **seis dígitos**. Su alta o rotación se realiza desde Gestión de Cajas con el permiso administrativo de gestión de usuarios. El PIN no se consulta después como un dato visible ni se escribe en la observación del corte.

**Cinco fallos** bloquean la credencial durante **quince minutos**. Mientras el bloqueo esté vigente, el supervisor no aparece como elegible; al vencer vuelve a ser elegible si conserva las demás condiciones. El supervisor debe ser distinto tanto del actor que ejecuta el cierre como del cajero responsable. Incluso una selección de supervisor aparentemente innecesaria debe ser válida.

Un faltante pequeño no se convierte automáticamente en redondeo. La excepción requiere que la diferencia negativa coincida con los ajustes de efectivo documentados. Un sobrante o un faltante sin esa evidencia conserva el control de autorización que corresponda.
<!-- revision-omisiones-fin -->

## 13. Compras: cotización y orden

### Qué cubre y qué no

El recorrido parte de la cotización o de la orden de compra. El producto no tiene una pantalla de requisición interna previa: si su organización exige una solicitud anterior, debe llevarla aparte y no presentarla como parte del sistema.

Pantallas: `/dashboard/compras/cotizaciones`, `/dashboard/compras/ordenes` y el resumen `/dashboard/compras`.

### Quién hace qué

| Acción | Permiso que exige |
|---|---|
| Ver cotizaciones | `compras.cotizaciones.ver` |
| Crear o editar una cotización | `compras.cotizaciones.crear`, `compras.cotizaciones.editar` |
| Enviarla | `compras.cotizaciones.enviar` |
| Aprobarla o rechazarla | `compras.cotizaciones.aprobar`, `compras.cotizaciones.rechazar` |
| Convertirla en orden | `compras.cotizaciones.convertir_orden` |
| Ver órdenes | `compras.ordenes.ver` |
| Crear o editar una orden | `compras.ordenes.crear`, `compras.ordenes.actualizar` |
| Aprobar, rechazar o cancelar una orden | `compras.ordenes.aprobar`, `compras.ordenes.rechazar`, `compras.ordenes.cancelar` |

La decisión conserva la segregación respecto de quien creó el documento: tener el permiso de aprobar no autoriza a saltarse ese control.

### Estados de la orden

| Estado | Qué significa | Qué se puede hacer en el detalle |
|---|---|---|
| BORRADOR | En preparación | Editar líneas existentes; panel **Aprobación** |
| PENDIENTE o APROBACION | Esperando decisión | Panel **Aprobación**: **Aprobar Orden** o **Rechazar Orden** |
| APROBADA | Lista para recibir | **Crear Recepción**, si alguna línea tiene pendiente |
| PARCIAL | Recibida en parte | **Crear Recepción** por lo pendiente; **Ver Recepciones** |
| RECIBIDA | Sin pendiente | Consultar progreso y recepciones; ya no ofrece otra recepción |
| CERRADA | Terminada | Consultar |
| ANULADA | Cancelada o retirada | Consultar el historial y el motivo |

El historial de aprobaciones sigue consultable después de aprobar, recibir o anular. Recibir la orden no habilita nuevas decisiones de aprobación.

### Registrar una compra

1. Abra **Cotizaciones** u **Órdenes** y cree el documento.
2. Seleccione proveedor, moneda y fechas, y agregue las líneas con producto, cantidad, precio y afectación tributaria de cada una.
3. Guarde y revise el documento guardado, no solo el formulario.
4. En una cotización, envíela y obtenga su decisión. Una cotización aprobada se convierte en una orden vinculada.
5. En la orden, un usuario autorizado distinto de quien la creó usa **Aprobar Orden**.
6. Entregue la referencia de la orden a quien recibirá la mercadería o el servicio.

### Reglas que el sistema impone

- **Dos decimales en cantidad y precio.** Cotizaciones y órdenes rechazan más decimales antes de calcular, aunque el inventario físico admita más. Nunca guardan una cantidad redondeada con un subtotal calculado sobre el valor original.
- **Precio cero.** Es un valor válido y se transmite como costo cero confirmado a la recepción. No equivale a un dato faltante.
- **Líneas mixtas.** Una misma compra puede combinar bienes gravados, exonerados, servicios y líneas a precio cero. Cada línea lleva su afectación; no use una tasa global para simplificar.
- **Edición en borrador.** Se pueden rectificar cantidades y precios de las líneas existentes. Si falla, el formulario conserva producto, descripción y campos, y el diálogo solo se cierra con la confirmación del servidor. Los datos de cabecera se editan desde el listado.
- **Cancelar exige motivo.** El botón **Cancelar** pide el motivo y no hace nada sin él.
- **Conversión de líneas históricas.** Si el subtotal de una línea antigua no corresponde a cantidad por precio, la conversión se bloquea. El sistema no la reconstruye: hay que corregir el origen.

### Excepciones

| Situación | Qué hacer |
|---|---|
| Se perdió la respuesta al convertir o aprobar | Recargue y consulte el documento antes de repetir; una conversión confirmada no debe crear otra orden. |
| La orden no ofrece **Crear Recepción** | Compruebe que esté APROBADA o PARCIAL, que tenga pendiente y que su usuario tenga `compras.recepciones.crear`. |
| El panel **Aprobación** no aparece | Compruebe el estado de la orden y que su usuario tenga `compras.ordenes.aprobar`. |
| Una cantidad o un precio tiene más de dos decimales | Corrija el valor; el sistema no lo redondea por usted. |

**Efecto en otros módulos:** una orden aprobada todavía no mueve inventario ni crea deuda ni asiento. Esos efectos nacen en la recepción y en la factura del proveedor.

## 14. Recepciones y devoluciones al proveedor

### Quién hace qué

| Acción | Permiso que exige |
|---|---|
| Ver recepciones | `compras.recepciones.ver` |
| Crear una recepción | `compras.recepciones.crear` |
| Editar un borrador | `compras.recepciones.editar` |
| Cerrar la recepción | `compras.recepciones.cerrar` |
| Ver devoluciones | `compras.devoluciones.ver` |
| Crear una devolución | `compras.devoluciones.crear` |
| Emitir o anular una devolución | `compras.devoluciones.emitir` |

Pantallas: `/dashboard/compras/recepciones` y `/dashboard/compras/devoluciones`. Los usuarios de almacén también reciben desde `/dashboard/inventario/recepciones`.

### Recibir una orden

Crear y cerrar son dos pasos distintos: **el efecto ocurre al cerrar**.

1. Abra una orden APROBADA o PARCIAL con saldo y use **Crear Recepción**.
2. Para cada línea, registre lo que llegó, dentro de lo pendiente, y lo aceptado o rechazado.
3. Si el producto controla lotes, indique lote y vencimiento (capítulo 44).
4. Guarde: la recepción queda en BORRADOR y aún no produce efectos.
5. Revise y cierre. La recepción pasa a CERRADA y ya no se reescribe.
6. Compruebe el progreso en la orden, que pasa a PARCIAL si queda pendiente o a RECIBIDA si se completó.

### Qué produce el cierre

| Tipo de línea | Inventario | Contabilidad | Orden |
|---|---|---|---|
| Bien con control de stock | Entrada al almacén | Reconoce el costo pendiente de factura | Suma lo aceptado |
| Servicio | Sin existencias ni kardex | Reconoce el costo pendiente de factura | Suma lo aceptado |
| Cantidad rechazada | Sin movimiento | Sin asiento | No cuenta como cumplida |

La recepción valora con el precio congelado en la línea de la orden, no con el costo ni el precio actuales del catálogo. La deuda y el crédito fiscal no nacen aquí: se registran con la factura real del proveedor (capítulo 19).

**Ejemplo:** una orden de servicio por 0,75 con 0,25 rechazado y 0,25 aceptado conserva un pendiente de 0,50. El rechazo no acerca la orden a su cumplimiento.

### Devolver al proveedor

1. Cree la devolución vinculando las líneas y cantidades de origen.
2. Revise el borrador y emítalo. La emisión produce los efectos; un borrador anulado no los tiene.
3. Si procede, anule una devolución pendiente: la confirmación solo vale cuando el sistema responde con ese mismo documento en estado ANULADA.
4. Registre la nota del proveedor en su etapa financiera. Una nota de crédito de proveedor sigue el flujo de devolución, no el alta general de facturas.

### Excepciones

| Situación | Qué hacer |
|---|---|
| La recepción se creó y falló el cierre | Recupere ese mismo registro y ciérrelo; no cree otra cabecera. |
| No sabe si un cierre se confirmó | Consulte la recepción y el progreso de la orden antes de repetir. |
| Llegó más de lo pedido | El sistema no admite recibir por encima del pendiente; resuelva la diferencia con compras. |
| Un error de red al anular una devolución | No la dé por anulada: consulte o reintente hasta ver el estado confirmado. |

### Continuar una recepción parcial en Windows

Abra la orden parcial y revise lo recibido y el saldo por línea. Registre solo la cantidad pendiente. Si se pierde la confirmación, recupere el mismo intento y compruebe las recepciones existentes antes de recibir otra vez.

## 15. Comprobantes electrónicos y ciclo fiscal

### Emisión directa

Desde el flujo de comprobantes seleccione tipo, serie, receptor, moneda, fecha y líneas. Revise afectación tributaria y el vencimiento si corresponde. El receptor puede provenir del maestro o del registro manual que admita el formulario; las cobranzas requieren un vínculo válido con el cliente correspondiente.

El tratamiento gravado, exonerado, inafecto o de exportación depende de la línea y del documento; no se sustituye por una tasa única para todas las ventas. En una exportación revise el documento de identidad admitido del receptor y los datos del destino. Una línea de precio cero válida no autoriza una cantidad cero. Un comprobante al contado puede requerir la acción de cobranza correspondiente: revise la cuenta y el pago real antes de darlo por cancelado.

1. Complete el borrador y recupere cualquier catálogo u origen fallido.
2. Revise los datos y confirme la emisión una sola vez.
3. Compruebe que el documento creado corresponde al receptor, serie, líneas e importes enviados.
4. Consulte su estado fiscal y los archivos disponibles.
5. Si la respuesta se pierde, recupere el original antes de emitir nuevamente.

Una fecha manual válida debe conservarse durante el cierre y reapertura del formulario. Un borrador local dañado no se repara inventando receptor, moneda, fecha o líneas: conserva el bloqueo y debe resolverse por la recuperación prevista.

### Entender los estados fiscales

| Situación | Qué acredita | Qué no acredita |
|---|---|---|
| Borrador | Datos preparados | Emisión ni numeración fiscal definitiva. |
| Documento registrado | Identidad e importes guardados | Aceptación de SUNAT u otra autoridad. |
| XML firmado | Preparación técnica de firma | Transmisión aceptada ni CDR favorable. |
| Envío o ticket pendiente | Trabajo fiscal en curso | Aceptación definitiva. |
| Aceptación con evidencia oficial | Resultado externo validado para ese documento | Habilitación de otros documentos o empresas. |
| Histórico migrado | Procedencia e información histórica | Una constancia fiscal nueva generada por el ERP. |

El nombre concreto del estado puede variar por recurso; la distinción funcional se mantiene. Un PDF debe expresar la falta de aceptación cuando no está acreditada. No se registra una aceptación porque el servicio de firma esté listo.

### Notas de crédito y débito

Elija un documento origen válido y completo. Revise motivo, líneas e importes de la nota. El origen no se habilita si su consulta está fallida, incompleta o pertenece a otra empresa.

Crear o solicitar una nota, firmarla y enviarla son acciones separadas. Cada una conserva su recuperación. Una firma sin emisión efectiva no debe cambiar impuestos como si la nota ya estuviera emitida. Las notas emitidas conservan su signo y referencia al documento modificado.

### Enviar, consultar y corregir

Para enviar se requieren las credenciales y condiciones reales del contexto fiscal. Un rechazo explícito previo a aplicar la operación puede permitir corregir los datos que indique la pantalla. Un error genérico, desconexión o respuesta incierta no garantiza que no se haya reservado numeración o aplicado una etapa; conserve la intención.

Reintente manualmente desde el contexto original. Evite crear otra factura o nota para probar si la primera fue enviada. El historial y las consultas de estado son la referencia para distinguir registro, firma, ticket, CDR y aceptación.

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

<!-- revision-omisiones-inicio -->
### Cuándo una nota fiscal referenciada afecta la deuda

Para las notas peruanas referenciadas **07/08** creadas por el flujo de notas del Centro CPE, crear o firmar conserva el efecto financiero en **pendiente de aceptación fiscal**. Esas etapas no modifican por sí solas la CxC, el saldo a favor ni la contabilidad. La aplicación requiere que la nota y su documento origen estén aceptados y exista la evidencia CDR exigida; el efecto se registra una sola vez. Un rechazo o reintento técnico no anticipa ese efecto.

Antes de dar una deuda por reducida, consulte el estado financiero de esa nota y el historial de la obligación. No registre un cobro, crédito o asiento paralelo para sustituir una aceptación que todavía falta. Distinga este flujo fiscal del cierre interno de una devolución RMA descrito en el capítulo 10: cada uno tiene su propio resultado y referencias; no traslade automáticamente el estado de uno al otro.
<!-- revision-omisiones-fin -->

<!-- revision-omisiones-inicio -->
### Imprimir el PDF fiscal sin alterar su escala

La representación PDF del ERP utiliza **A4, 210 × 297 mm**. Para imprimir ese archivo seleccione papel A4 y escala **100 %**, sin la opción «ajustar a página». Revise todas sus páginas y compruebe que líneas, totales y QR permanezcan completos y legibles. Esta es la salida física elegida por el producto; no significa que la autoridad imponga ese formato único de papel.

Use el PDF generado por el backend como representación del comprobante y la vista HTML para revisarlo cuando el visor nativo no esté disponible. Una impresión cortada exige corregir la salida o reimprimir el archivo correcto, no emitir otro comprobante. La impresión no cambia el estado fiscal ni fabrica una aceptación.
<!-- revision-omisiones-fin -->

## 16. Guías de remisión y traslado

### Preparar una GRE

El flujo permite alta manual o desde un pedido/despacho. Revise emisor, destinatario, motivo de traslado, origen, destino, productos, cantidades, peso y datos de transporte que correspondan a la modalidad pública o privada.

En transporte privado se revisan conductor y placa. Un traslado entre establecimientos conserva los códigos de ambos locales y el motivo aplicable. La fecha documental y el peso del archivo deben coincidir con la guía consultada, no con una fecha derivada de abrir el PDF.

### Crear desde un pedido

1. Abra el pedido o despacho que origina el traslado.
2. Espere la carga completa de origen y destinatario.
3. Revise líneas, cantidades y datos de transporte.
4. Confirme y compruebe la guía vinculada.
5. Si queda una operación pendiente y cambia de despacho, vuelva al contexto original para recuperarla.

Un despacho distinto del mismo pedido no equivale al origen de la guía anterior. Si las referencias guardadas son inconsistentes, el producto bloquea el envío en vez de reemplazarlas silenciosamente.

### Utilizar y anular una guía

Una guía no habilita otro producto ni cantidades superiores a su capacidad disponible. Cuando una transferencia consume su capacidad, un reintento recupera el traslado ya aplicado; no resta capacidad otra vez.

La anulación exige la guía correcta y una confirmación completa del estado esperado. Si se pierde la respuesta, recupere la misma acción tras recarga o reinicio. Un rechazo inequívoco de transporte previo a aplicar puede liberar el intento conforme al mensaje; un error ambiguo no lo hace.

El CSV y PDF deben corresponder al filtro o guía actuales. Una respuesta demorada de una selección anterior no debe descargar otro documento.

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

### Encontrar y revisar documentos

Use los filtros de período, estado o contexto que ofrezca cada listado. Abra el detalle para comprobar emisor, receptor, moneda, líneas y relaciones. El panel documental y sus indicadores deben reconocer cuando una fuente está incompleta.

El Centro de Documentos y las descargas fiscales deben conservar el mismo contenido del XML firmado. Un histórico migrado se consulta y exporta con su procedencia, sin habilitarle nuevas acciones fiscales ficticias.

### Documentos manuales

Un documento manual puede crearse y editarse en borrador dentro de sus permisos. Revise su identidad e importes antes de firmar. La cancelación de un borrador conserva un motivo y no debe aparentar una anulación fiscal externa.

Un envío sin credenciales puede rechazarse correctamente aunque el documento esté firmado. Esa condición no exige crear otro documento para obtener un archivo imprimible.

### Resúmenes y comunicaciones de baja

RA y RC conservan reserva, firma, envío o consulta del ticket como etapas diferenciadas. Recupere la operación original si su respuesta se pierde. Leer el ticket no equivale a registrar una aceptación que la autoridad aún no devuelve.

### Descargar con seguridad funcional

Seleccione el documento y tipo de archivo. Un PDF, XML, CSV o ZIP debe ser del formato y contenido correspondientes. Una respuesta de error con nombre de archivo, un PDF truncado o metadatos incoherentes no deben presentarse como una descarga exitosa.

Reintente la descarga de ese documento. Cerrar la pantalla o cambiar empresa, filtro o recurso retira el contexto anterior; no debe aparecer después un archivo solicitado por otra selección.

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

<!-- revision-omisiones-inicio -->
### Requisitos de selección para RA y RC

La **RA de facturas** y la **RC con operación de baja de boletas** trabajan sobre comprobantes elegibles que el flujo previo dejó anulados, con su reversa comercial confirmada. No son el botón para anular por primera vez una venta vigente ni un mecanismo para borrar deuda, stock o ingreso.

Si el documento no aparece en la selección, revise tipo, empresa, estado y evidencia de la anulación de origen. No cree un lote manual alternativo para eludir la elegibilidad. Crear o firmar el lote tampoco equivale a su aceptación: revise envío, ticket y resultado con CDR. Un resultado terminal se recupera sobre el mismo lote, sin producir otra reversa comercial.
<!-- revision-omisiones-fin -->

## 18. Cuentas por cobrar y recuperación de cartera

### Consultar deuda

Abra **Finanzas > Cuentas por cobrar** y revise cliente, documento, moneda, fecha, vencimiento y saldo. Use los filtros y la consulta de historial antes de decidir un cobro, nota o reprogramación.

Una cuenta no es ajena o inexistente porque falle temporalmente la conexión; son situaciones distintas. Las deudas en PEN y USD se consultan por separado en sus importes nominales.

### Registrar un cobro

1. Abra una cuenta elegible con saldo confirmado.
2. Revise el historial y el importe pendiente.
3. Seleccione medio, destino de caja o banco, fecha y referencia.
4. Introduzca un importe válido dentro del saldo permitido.
5. Confirme y compruebe el cobro, nuevo saldo e historial.

Se admiten cobros parciales. Cobrar una parte no debe cerrar la cuenta completa. Un saldo importado vencido conserva su origen y se cobra mediante su operación correspondiente, sin reconstruir una venta ficticia.

Si el resultado se pierde, reabra la operación pendiente y recupere el mismo cobro. Un catálogo bancario que cambió después no debe convertir automáticamente el cobro ya confirmado en otro cobro. Una respuesta incompleta, de otra cuenta o meramente pendiente no confirma el resultado.

### Reprogramar, ajustar y aplicar notas

Cada acción tiene su permiso y confirmación. Reprogramar modifica el calendario de obligación conforme al contrato y deja trazabilidad; no es un ingreso de dinero. Un ajuste fiscal activo tampoco es un cobro aunque reduzca el saldo.

La reversa de un ajuste pide motivo, restituye los importes correspondientes y puede liberar un anticipo aplicado. No debe generar una entrada o salida bancaria inexistente. Los cobros y ajustes activos pueden impedir la anulación de un comprobante hasta que se regularicen por su flujo.

### Aging y proyección

El aging es una fotografía a una fecha de corte. Reconstruye pagos, reversas y aplicaciones existentes hasta esa fecha. No debe tomar únicamente el saldo actual para mostrar una mora histórica.

Revise vencido, por vencer y tramos de antigüedad. Una reconstrucción pendiente o una conversión de moneda desconocida no se trata como deuda cero. El CSV corresponde al corte filtrado; cambiar el corte exige una consulta nueva antes de exportar.

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

### Registrar la factura recibida

Seleccione proveedor, tipo y número de documento, fechas, moneda, impuestos y origen de compra o recepción cuando corresponda. Revise el destino del crédito fiscal, tipo de cambio documental y ajustes iniciales.

Una factura ligada a recepción sólo puede basarse en recepciones completas y elegibles. Una lectura fallida no habilita elegir un origen supuesto. Guardar registra la obligación y su trazabilidad; la recepción por sí sola no había creado ese crédito fiscal.

El alta conserva el origen fiscal y cambiario. Si se pierde la respuesta, recupere esa factura con la misma intención. No vuelva a crearla con otro número para eludir un conflicto.

### Consultar detalle e historial

Los listados incluyen estados, saldo, vencimientos y filtros de proveedor y fecha. El historial debe pertenecer a esa cuenta y moneda, con todos los pagos correspondientes. Si falla, la interfaz bloquea **Aplicar pago** hasta recuperar la información necesaria.

Un contador puede consultar proveedores para filtrar sin tener permiso de editar el maestro, recibir mercadería o pagar. Un lector no hereda el detalle del propietario al perder la conexión.

### Pagar

1. Consulte el saldo y el historial completos.
2. Abra **Aplicar pago** y seleccione método y destino real.
3. Registre fecha, importe y referencia.
4. Confirme una sola vez.
5. Revise el pago y el saldo reducido o cancelado.

Un pago parcial puede dejar una cuenta vencida con saldo positivo menor. No se debe rechazar un recibo correcto sólo porque no cambió a PAGADA. Un pago total debe dejar la cuenta liquidada conforme al estado confirmado.

Los pagos en efectivo requieren la sesión elegible y sólo afectan su importe real. Los bancarios conservan su cuenta. Un error, respuesta vacía o confirmación de otra deuda mantiene el intento pendiente; no se encola un pago genérico sin conexión.

### Notas, crédito y devoluciones del proveedor

Registre las notas y sus vínculos con el documento modificado. El crédito disponible puede aplicarse a otra factura elegible o seguir el reembolso que admita el flujo. Compruebe el crédito remanente y la deuda pendiente tras cada aplicación.

Las notas deben reflejarse con el signo correcto en el registro de compras. No se editan retrospectivamente las líneas de una factura confirmada para simular una nota posterior.

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

### Registrar y aplicar un anticipo

Primero registre el anticipo de cliente o proveedor con el origen o destino de dinero explícito. Después aplíquelo a una obligación. Escribir una cantidad en el campo anticipo de una factura no crea por sí solo dinero disponible.

La aplicación consume saldo y conserva su referencia. Una segunda aplicación no puede utilizar otra vez el saldo ya consumido por la primera.

### Retenciones, percepciones y detracciones

Seleccione la obligación y el ajuste permitido. Revise base, importe y saldo resultante. En el contrato del producto, la percepción incrementa la obligación y la retención, detracción o anticipo la reducen según el flujo.

Una detracción de proveedor puede quedar pendiente de tesorería. El depósito bancario posterior liquida esa obligación específica; no debe reducir otra vez la cuenta por pagar que ya fue ajustada.

### Revertir sin duplicar movimientos

Una reversa requiere motivo y confirmación explícitos. Compruebe si restaura deuda, libera anticipo o conserva el depósito previo. Un ajuste anulado no equivale a una reversión bancaria automática cuando no existió movimiento de banco.

Renta de quinta categoría pertenece a la planilla de recursos humanos, no se registra como un proveedor ordinario para sustituir ese tratamiento.

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

### Preparar cuentas

Configure la cuenta bancaria, moneda y su cuenta contable de movimiento. Registre capital o movimientos manuales con categoría, contracuenta y referencia. Compruebe que el importe corresponde a la moneda de la cuenta.

Una transferencia interna identifica ambas cuentas y produce el cargo y abono vinculados. Si se pierde la respuesta, recupere el par original; no registre por separado otro abono para completar una transferencia incierta.

### Importar el extracto

1. Abra el período de conciliación mensual correcto.
2. Utilice el formato CSV admitido y revise fechas, signos, importes y referencias.
3. Corrija fechas imposibles o columnas inválidas antes de confirmar.
4. Importe el lote y revise sus movimientos y saldos inicial y final.
5. Si la respuesta se pierde, recupere la importación original antes de cargar otra copia.

Los separadores y comillas dentro de las referencias se conservan. La fecha documental no debe desplazarse de día por abrir el archivo desde otra zona horaria.

### Conciliar y cerrar

Use la propuesta automática o seleccione los pares exactos para conciliación manual. Un movimiento del sistema y una línea del extracto son evidencias relacionadas; su existencia como dos filas no significa que se hayan realizado dos pagos.

Resuelva las diferencias mediante el ajuste bancario explícito permitido, con contracuenta. No cierre forzadamente un período que aún no cuadra. El cierre conserva la conciliación y bloquea nuevos movimientos incompatibles con ese período.

Los archivos exportados deben reflejar los movimientos y filtros consultados. Una vista de lectura no debe alterar el saldo ni regenerar la historia.

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

<!-- revision-omisiones-inicio -->
### Estado de movimientos bancarios históricos

El producto utiliza activo como valor predeterminado para nuevos movimientos bancarios cuando la operación no declara otro estado. **Eso no reactiva ni reclasifica movimientos históricos inactivos** y tampoco cambia un registro marcado explícitamente inactivo.

Si un movimiento antiguo no participa en una consulta o conciliación, revise su estado y evidencia de origen antes de atribuirle un saldo o darlo por reparado. Un estado histórico puede reflejar una decisión válida o una condición anterior que necesita investigación. La actualización del producto no permite distinguir ambas por sí sola. Cualquier regularización debe seguir su procedimiento autorizado y conservar la historia; no se documenta como un efecto automático de esta versión.
<!-- revision-omisiones-fin -->

## 22. Tesorería y programación de pagos

### Planificar

Desde tesorería consulte las obligaciones y vencimientos. Aplique el horizonte que ofrezca la vista —por ejemplo, 30, 60, 90 o 180 días— y la moneda. Una fecha futura sin obligaciones puede mostrar un vacío válido; una fuente fallida no significa que no haya pagos que atender.

El tablero financiero enlaza cuentas por cobrar, cuentas por pagar, bancos, conciliación y reportes. Los totales deben corresponder a fuentes completas del mismo contexto.

### Ejecutar un lote

1. Revise las deudas elegibles y sus saldos actuales.
2. Seleccione las obligaciones e importes y la cuenta bancaria admitida.
3. Registre una referencia del lote.
4. Compruebe el total y confirme.
5. Revise el resultado de cada obligación y el movimiento bancario correspondiente.

El lote no autoriza pagar por encima del saldo. Un reintento idéntico recupera la ejecución; no vuelve a pagar las facturas. Si una etapa quedó incierta, no trate todas las filas como pendientes nuevas sin consultar el resultado original.

### Verificar pagos y reportes

Compare lote, pagos por cuenta, saldos y banco. La consulta o exportación de un lote procesado es de lectura y no debe originar otro cargo. Una confirmación completa debe identificar el lote y su referencia; un indicador local de pendiente no acredita liquidación.

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

### Orígenes y diario

El diario recibe asientos de ventas, compras, POS, caja, bancos, recursos humanos, activos y operaciones manuales. Los módulos originan sus efectos; no se deben recrear manualmente porque la proyección tarde en actualizar.

Busque por referencias y revise la lista completa consultada. La búsqueda de asientos no debe limitarse silenciosamente a los primeros registros. Abra el detalle para comprobar fecha, estado, cuentas, debe, haber y origen.

### Asiento manual

1. Compruebe que existe un período abierto para la fecha.
2. Registre cabecera y líneas con cuentas elegibles.
3. Complete debe y haber positivos y balanceados.
4. Guarde en el estado permitido y revise el resultado.
5. Obtenga la confirmación o reversión segregada cuando el flujo la requiera.

Un formulario 0/0 no se anuncia balanceado como una operación económica válida. Una diferencia de céntimo debe corregirse. Si falta el período, conserve el formulario y créelo explícitamente desde períodos; no modifique la fecha sólo para eludir el bloqueo.

### Confirmar, corregir o eliminar

Un asiento confirmado es inmutable. Se corrige con un contra-asiento enlazado, no editando silenciosamente el original. Un borrador puede tener edición o eliminación según su contrato; cancelar la confirmación de eliminación conserva cabecera y detalle.

Recuperar un asiento ya confirmado puede ser posible aunque el período se haya cerrado después: se está recuperando el resultado anterior, no registrando una escritura nueva en el período cerrado.

### Partidas de terceros y distribución analítica

Seleccione partidas elegibles para conciliación total o parcial y compruebe el resultado. Repetir la misma selección recupera la conciliación; una selección distinta necesita otra operación. Deshacerla no debe alterar los importes del asiento original.

La distribución analítica se realiza sobre líneas y ejes permitidos. Asignar o quitar centros no debe modificar debe y haber. Un eje puede tener sus porcentajes propios sin confundirse con otro eje independiente.

### Plantillas recurrentes

Cree la plantilla, revise cuentas y período y genere la instancia correspondiente. El mismo período no debe producir otra instancia por un reintento. Mantener o eliminar una plantilla no elimina la evidencia histórica de los asientos que ya generó.

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

### Crear y consultar períodos

Use **Contabilidad > Períodos** para crear explícitamente el período necesario para operaciones manuales. Revise el estado y los datos de la empresa. Una consulta fallida debe impedir interpretar el período como abierto o ausente.

Las fechas iniciales de los formularios siguen el calendario empresarial. Verifique el período cuando opera cerca del cambio de día, mes o año, especialmente si el dispositivo tiene otra zona horaria.

### Cerrar

Realice la comprobación previa que ofrece el producto, revise las inconsistencias y confirme el cierre sólo cuando el alcance esté completo. El cierre puede generar su asiento y bloquea las escrituras que no estén permitidas en ese estado.

No ignore un fallo de consulta de la comprobación previa. Un resultado retenido de otro período no puede confirmar el actual. Las estimaciones o provisiones que ofrezca el período tienen su propia operación y recuperación.

### Reabrir

La reapertura requiere la facultad de superadministración definida por el contrato. Si el permiso se rechaza, el período conserva su estado cerrado. Reabrir anula el asiento de cierre anterior conforme al flujo; volver a cerrar no deja dos cierres activos.

Los resultados acumulados y el resultado del nuevo ejercicio se distinguen. No se descarta una pérdida deudora para forzar un balance visualmente favorable.

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

### Crear el presupuesto

Configure el centro de costo y seleccione período, cuenta, importe y demás clasificaciones habilitadas. Los catálogos deben cargarse completos antes de guardar. Una selección antigua no suple un catálogo fallido.

Guarde y revise el detalle. El presupuesto conserva su importe después de editar o recargar. Una cuenta se identifica por código y nombre; un identificador técnico por sí solo no sirve para validar la elección empresarial.

### Entender ejecución y alertas

La ejecución procede de movimientos contables elegibles y del alcance consultado, no de una suma parcial de páginas visibles. Las reversas se reflejan según el cálculo neto del contrato; una reversa no convierte automáticamente la ejecución de gasto en un gasto negativo artificial.

Las alertas distinguen falta de período, falta de presupuesto, ejecución conocida y fuente indisponible. Un presupuesto excedido no desaparece porque falle la consulta. Compruebe período, umbral, importe ejecutado y disponible antes de actuar.

### Editar, resolver un conflicto o dar de baja

Edite sobre el detalle vigente. Si otra ventana cambió el presupuesto, la aplicación puede devolver conflicto: conserve su intención y concilie el resultado antes de reemplazar el registro.

La baja puede requerir un bloqueo exclusivo y una lectura actual. Un fallo al adquirirlo no equivale a una eliminación realizada. Cerrar y volver o reiniciar el escritorio conserva la recuperación; no autoriza borrar el almacenamiento para desbloquear la acción.

El abandono seguro, cuando está ofrecido, conserva la evidencia del intento y su recibo. Es una resolución explícita del pendiente, no una eliminación directa de su historia.

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





### Confirmar la baja de un presupuesto

Cancelar la confirmación conserva el presupuesto. Al confirmar, un recibo vacío o perteneciente a otro presupuesto no acredita la baja. Conserve la intención, recupere su resultado y recargue el listado. No interprete una respuesta HTTP exitosa por sí sola como ausencia confirmada del presupuesto.

## 26. Activos fijos

### Dar de alta y consultar

Registre descripción, adquisición, costo, valor residual, vida o método y centro cuando corresponda. Revise las fechas civiles iniciales y conserve la fecha manual válida si modifica el formulario. Una adquisición guardada debe aparecer con su identidad y cronograma correctos.

El lector autorizado puede consultar registro y cronograma, pero no obtiene por ello las acciones de alta, edición, depreciación, venta o baja.

### Depreciar

Seleccione el período y activos elegibles, revise el cronograma y confirme el lote. La cuota final absorbe el residuo de redondeo sin llevar el valor por debajo del residual. Repetir el período o recuperar un lote confirmado no debe generar otra cuota.

Si cambia el activo mientras llega el cronograma anterior, la selección actual no debe quedar reemplazada. Si se pierde la respuesta del lote, recupere el original incluso después de reiniciar Windows.

### Cambiar estimación, vender o dar de baja

Cambie las estimaciones mediante la operación admitida y revise su efecto futuro; no reescriba cuotas históricas confirmadas. Una venta y una baja son decisiones distintas con sus fechas, importes y asiento cuando corresponda.

Compruebe que la confirmación conserva el activo y el asiento correcto. Un recibo incompleto o de otro activo no retira el pendiente. Dos ventanas no deben ejecutar simultáneamente la misma intención como operaciones diferentes.

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





### Confirmación del alta de un activo

Después de guardar, el alta sólo queda confirmada cuando el recibo corresponde al activo, empresa, usuario y solicitud originales. Una respuesta incompleta conserva el intento pendiente. Consulte o recupere ese mismo intento antes de crear otro activo.

### Seleccionar el lote completo de depreciación

Revise el período y los candidatos cargados por completo. Una página ausente o una lectura fallida no representa un lote vacío ni autoriza depreciar una selección parcial como si fuera completa. Recupere la consulta; después confirme el lote y conserve su recibo original.

## 27. Ingresos y gastos diferidos

### Registrar el diferido

Seleccione tipo, importe, moneda, cuentas, centro y calendario que solicite el formulario. Compruebe que las fuentes estén completas. Guardar crea el registro y su programa; no equivale a haber devengado todos los períodos.

### Devengar

Revise la cuota y período y confirme. El reintento conserva el mismo devengo; un período repetido no duplica el asiento. La última cuota absorbe el residuo admitido para que el total coincida con el importe a distribuir.

### Cancelar y resolver concurrencia

La cancelación respeta el estado y las cuotas ya confirmadas. Si otro operador devenga mientras se intenta cancelar, debe resolverse la operación vigente; no se aceptan dos historias incompatibles.

Una respuesta que llega después de salir de la pantalla no limpia la intención actual. Ante un resultado incierto, recupere el registro y recibo originales antes de iniciar una acción distinta.

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

### Entregar

Seleccione los productos, cantidades, moneda y destinatario. Revise el total calculado por el sistema y confirme. Una entrega con respuesta perdida debe recuperarse con su intención original.

Cuando la entrega ya quedó confirmada, otra entrega idéntica es una nueva operación empresarial y obtiene su propio registro. La recuperación no debe impedir para siempre entregas futuras con los mismos productos.

### Vender, devolver, cerrar o anular

Use sólo las transiciones disponibles para el estado vigente. Registre las cantidades realmente vendidas o devueltas y revise el saldo. Un cierre terminal o una devolución final no se reabre por recargar la pantalla.

Los importes PEN y USD se consultan separadamente. Los destinos admitidos y los catálogos deben estar completos antes de operar. Los lectores mantienen el acceso de consulta sin controles de transición.

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

### Mantener cotizaciones

Registre fecha, moneda, clase y factor admitidos. Respete la precisión del formulario. Un cambio A→B→A sigue siendo una edición nueva cuando ya se confirmó el estado intermedio; no debe confundirse con una respuesta antigua del primer valor.

Una cotización manual puede editarse o desactivarse conforme al permiso. No modifique cotizaciones históricas para hacer coincidir una deuda que conserva un tipo documental congelado.

### Comprar y pagar en moneda extranjera

La factura conserva su moneda original y cotización documental. La contabilidad local convierte con esa fotografía. Un pago posterior puede utilizar otra cotización y reconocer una diferencia realizada; no revaloriza retrospectivamente la base fiscal de la compra.

Los pagos parciales y finales deben reducir la deuda en su moneda original y el banco correcto. Una proyección no puede sumar nominalmente soles y dólares como si fueran la misma unidad.

### Revaluar saldos abiertos

Revise fecha de corte, cotizaciones vigentes y alcance de saldos. Genere la evaluación y registre sólo con datos completos. Una cotización cambiada por otra ventana puede exigir revisar de nuevo antes del registro.

El mismo corte no se registra dos veces por recuperar la respuesta. Una reversa o corrección conserva el vínculo con el ajuste anterior y no lo elimina de la historia.

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





### Recuperar una revaluación registrada

La simulación y el registro son pasos distintos. Después de registrar, el resultado recuperado debe corresponder a la fecha, simulación, solicitud y asiento originales. Una lectura actual del tipo de cambio no sustituye esa fotografía. Si falta la confirmación, recupere el original antes de registrar otra revaluación.

## 30. Consolidación y reportes configurables

### Formar un grupo

Cree el grupo con su empresa controladora, invite a las empresas y registre los porcentajes. Cada miembro acepta o rechaza desde su propio contexto autorizado. Una invitación no aceptada no concede acceso a sus libros ni los incorpora como si ya hubiera consentimiento.

Las definiciones y acciones de controladora no deben aparecer en otra empresa sólo por formar parte de un navegador que antes usó el administrador.

### Homologar y ajustar

Defina la relación entre cuentas de origen y cuentas de presentación. Las eliminaciones y reclasificaciones pertenecen a una capa del reporte consolidado; no reescriben los libros legales de cada miembro.

Respete la precisión monetaria: un importe con fracción inferior al céntimo debe corregirse cuando el formulario exige centavos. Elimine o cambie un ajuste mediante su acción explícita y compruebe el resultado después de recuperar una respuesta perdida.

### Diseñar un reporte

Defina líneas por prefijos de cuentas, alcance acumulado o movimiento del período y fórmulas entre líneas. El diseñador valida dependencias y rechaza ciclos. Una fórmula no es una consulta libre a la base de datos.

El saldo acumulado y el movimiento del período responden preguntas distintas. Verifique la naturaleza deudora o acreedora de cada línea para no interpretar el signo al revés.

### Generar en otra moneda

Seleccione fechas y moneda de presentación. Aporte las tasas de cierre, promedio o históricas que requiera el reporte, incluida la controladora cuando su moneda funcional también difiera de la presentación.

No se infiere un factor ausente. Cambiar miembro, fecha o tasa exige otra evaluación vigente. Una respuesta anterior no debe publicar un reporte con el nuevo encabezado y los importes de la selección antigua.

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

### Estados financieros

La consulta contable incluye balance de comprobación, resultados, situación financiera, flujo indirecto e indicadores. Seleccione período y moneda y recupere la carga antes de exportar. La comparación actual/anterior se publica como un conjunto; enero debe comparar con diciembre del ejercicio anterior cuando ése sea el alcance elegido.

Los estados a fecha de cierre conservan saldos de cuentas sin movimiento en el mes. Una pérdida no pierde su signo. Cuando un porcentaje no tiene base válida, se presenta como no aplicable; no como un porcentaje inventado.

### Libros y PLE

Entre las vistas se incluyen registros de compras, activos y costos, caja y bancos, planillas, inventarios y balances, kardex valorizado y balance de comprobación, además del panel de libros electrónicos.

Diario y Mayor electrónicos utilizan asientos confirmados. Las notas de crédito de compras conservan importes negativos y referencia al comprobante modificado. Las compras extranjeras requieren una cotización documental válida para sus equivalentes locales.

Descargue el libro individual o el conjunto ofrecido para el corte seleccionado. Los archivos son insumos de validación externa; descargarlos no presenta una declaración en SUNAT.

### Reportes comerciales

Use resumen de ventas, ventas por cliente, top de clientes, productos más vendidos, pedidos por estado, cotizaciones pendientes, pipeline, plazo comercial, aging, fill-rate e indicadores fiscales disponibles.

Revise los filtros de fecha, cliente, estado y límites de ranking. Los totales monetarios se separan por moneda. Los códigos de producto provienen del catálogo, y los plazos comerciales se relacionan con la emisión del comprobante enlazado, no con una fecha aproximada.

Fill-rate muestra cumplimiento de cantidades de acuerdo con los pedidos y despachos del alcance. Debe estar habilitado cuando así lo exige la configuración. OTIF u otro indicador de entrega no se anuncia evaluado si faltan fechas o fuentes suficientes.

### Reportes financieros y panel operativo

El aging de CxP, vencimientos, saldos, ranking y flujo de caja dependen de sus fuentes completas. Un banco indisponible no puede reemplazarse por saldo cero para publicar una proyección.

El panel operativo distingue cero real, ausencia de configuración y consulta fallida. Los indicadores de distintas fuentes se publican de forma coherente; no se mezclan cifras antiguas y nuevas para aparentar un resumen completo.

### Imprimir y exportar

Los filtros de la pantalla deben corresponder al archivo o impresión. Excel conserva importes numéricos y códigos como texto; PDF conserva signos, moneda y tablas legibles. El cero no debe imprimirse como un pequeño negativo residual.

Una impresión del navegador es una representación del contenido consultado, no una constancia de entrega física o aceptación tributaria. Si falla el reporte, no exporte un archivo con los datos del filtro anterior.

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

### Borrador tributario mensual

En **Contabilidad > Impuestos Perú**, seleccione período y régimen. Revise ventas, compras, créditos y saldo previo; complete los ajustes manuales que correspondan al papel de trabajo.

La normativa y parámetros pertenecen al ejercicio consultado. No utilice valores de otro año para corregir un período histórico. Si falta un parámetro aplicable o falla el saldo anterior, recupere la fuente antes de guardar.

Consultar o recalcular no crea por sí solo otra versión. Guardar congela el corte y sus fuentes. Una respuesta perdida recupera esa versión; una corrección confirmada crea una nueva y mantiene el historial. El coeficiente debe respetar el formato y rango que valide la pantalla.

### Renta anual e ITAN

Revise el ejercicio, resultado contable y activos, y complete adiciones, deducciones, pérdidas, créditos y exclusiones explícitas. Un ejercicio abierto o balance no cuadrado puede impedir registrar la constancia.

El espacio prepara papeles de trabajo; no presenta automáticamente los formularios de renta mensual, anual o ITAN. La constancia externa se registra después de realizar el proceso oficial, no para hacer desaparecer una advertencia de la aplicación.

### SIRE

SIRE mantiene reportes, estadísticas, bitácora, archivos y acciones de generación o aceptación que dependen de su configuración y permisos. Revise período, tipo de registro y estado antes de actuar.

Una descarga congelada conserva su contenido original y no debe regenerarse silenciosamente al abrirla. Un archivo alterado o incompleto se rechaza. Un ticket pendiente debe seguir consultándose mediante el intento que lo originó, no declararse aceptado por un reintento local.

Un reporte local de RCE o RVIE y sus cálculos no acreditan autenticación, presentación ni aceptación real de SUNAT. La bitácora debe identificar el reporte y empresa correctos; un fallo de lectura no representa una bitácora vacía.

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

<!-- revision-omisiones-inicio -->
### Activación SIRE, ticket y finalización

GRE y SIRE pueden compartir credenciales de API SUNAT, pero **activar o configurar GRE no activa por sí solo SIRE**. La aceptación de una propuesta oficial exige la activación SIRE y las condiciones reales del contribuyente y entorno autorizado. Una demo o una comparación local no acreditan una aceptación oficial.

Recibir un número de ticket deja el reporte **pendiente**. Consulte ese ticket hasta que la respuesta oficial y su persistencia confirmen el resultado; el código **06, Terminado**, es el que permite reconocer la finalización del trabajo correspondiente. No lo deduzca de una descarga disponible ni de una respuesta HTTP exitosa. La generación final del registro continúa en SUNAT Operaciones en Línea. Si falla la consulta, conserve ticket e intención y recupere la misma operación.
<!-- revision-omisiones-fin -->

## 33. Recursos humanos: personas, contratos y solicitudes

### Estructura y reclutamiento

Configure áreas o departamentos y vacantes antes de relacionarlos con candidatos o empleados. En selección registre los datos disponibles, experiencia y estado; no complete automáticamente información personal ausente.

Los estados admitidos del candidato incluyen postulante, entrevista, seleccionado, rechazado, contratado y descartado. Cambiar un estado de selección no sustituye el alta contractual que corresponda para operar remuneraciones.

### Empleados y contratos

Registre identidad, establecimiento, datos laborales y previsionales que exija el país. Revise asignación familiar, afiliación y ficha fiscal. Un documento duplicado debe regularizarse; recuperar el mismo alta no crea otro empleado.

El contrato conserva sueldo, vigencia y régimen. Renovar un temporal registra la extensión admitida; finalizar exige motivo y conserva la historia. Un contrato futuro no reemplaza el contrato que intersecta el período de una planilla histórica.

La inactivación no debe borrar los resultados históricos del empleado en reportes. No elimine a una persona para ocultar un error de cálculo o una obligación.

### Asistencia y solicitudes

Consulte empleados y solicitudes completos antes de registrar una ausencia. La interfaz contempla vacaciones, permisos, descansos médicos, licencias, compensaciones y otros tipos ofrecidos.

1. Seleccione empleado, tipo, fechas y motivo o datos requeridos.
2. Revise los días y el alcance de la solicitud.
3. Guarde y consulte la solicitud.
4. Un actor autorizado aprueba o rechaza según el flujo.
5. Compruebe el estado antes de incorporarla a la operación laboral.

Los registros de entrada y salida y las fechas civiles deben conservarse sin desplazamiento de zona horaria. Solicitudes superpuestas no justifican contar dos veces el mismo día en cálculos que requieren fechas únicas. El cálculo al cese debe respetar el corte aplicable.

### Recuperar decisiones

Crear, aprobar o rechazar una solicitud conserva su intención si se pierde la respuesta. Al reiniciar Windows, recupere la decisión antes de repetirla. La lectura por un usuario sin permiso no expone datos salariales ni la operación pendiente de otro actor.

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


<!-- revision-omisiones-inicio -->
### Renovar y finalizar un contrato desde su listado

Para renovar, abra la acción **Renovar Contrato**, indique los meses admitidos y confirme. Después recargue y revise la vigencia del contrato resultante y su historia. La selección de contrato para planilla utiliza sus fechas; no presuponga que una renovación futura reemplazó el sueldo de meses anteriores.

Para finalizar, abra **Finalizar Contrato**, indique el motivo y confirme. En la interfaz documentada esa acción captura **el día actual del navegador** como fecha de finalización; el diálogo no ofrece un selector para elegir otra fecha. Compruebe fecha y zona del equipo antes de confirmar. Si necesita tratar una fecha distinta, resuelva el caso por el procedimiento autorizado; no use este diálogo suponiendo que está registrando un cese retroactivo elegido.

Un error conserva la situación sin una confirmación válida de cambio. Recuperar la misma solicitud y revisar el contrato evita interpretar la desaparición de un diálogo como renovación o finalización aplicada.
<!-- revision-omisiones-fin -->

<!-- revision-omisiones-inicio -->
### Desde el área y la vacante hasta el candidato

Prepare primero el área que utilizará la vacante y compruebe que su alta esté confirmada. Registre la vacante con sus datos y revise que aparezca en el catálogo antes de asignarla a un candidato. Después cree la ficha del candidato, mantenga los años de experiencia y el estado civil opcional que se hayan declarado y registre el estado de selección que corresponda.

Al editar, verifique después de recargar que la vacante y los datos personales persistieron. Una consulta fallida del catálogo no equivale a no tener vacantes disponibles. Pasar al estado de entrevista, seleccionado o contratado no sustituye por sí mismo la creación y revisión del empleado y de su contrato para calcular remuneraciones.
<!-- revision-omisiones-fin -->




### Vacaciones y permisos con decisión persistida

Registre el tipo de solicitud y sus fechas, revise los días y envíe la decisión con el permiso correspondiente. Después de aprobar o rechazar, recargue y consulte el estado persistido. Una solicitud rechazada no se trata como vacaciones aprobadas. El registro de otra empresa no debe aparecer al cambiar de sesión.

## 34. Planilla, vacaciones remuneradas y EPS

### Preparar las fuentes

Antes del cálculo deben estar disponibles empresa, empleados, contratos del período, conceptos, normativa efectiva, solicitudes y las fuentes especiales que correspondan. Un sueldo desconocido o una lectura fallida de vacaciones no se sustituye por cero.

Compruebe la normativa del período: régimen pensionario y tasas contractuales, beneficios y aportes. El motor utiliza la vigencia correspondiente; no presupone constantes de otro año cuando falta la configuración.

### Crear y calcular

1. Seleccione período y modalidad de la planilla.
2. Espere la confirmación de empleados y contratos elegibles.
3. Complete observaciones y conceptos manuales admitidos.
4. Cree el borrador y ejecute el cálculo como etapas identificables.
5. Revise cada trabajador, ingresos, descuentos, aportes y neto.
6. Si una fuente falló, recupérela y concilie el cálculo original antes de crear otro borrador.

Una planilla personalizada permite los conceptos que ofrezca el formulario, sin borrar la trazabilidad de las fuentes. Vacaciones aprobadas alimentan la remuneración vacacional conforme a su período. El producto conserva conceptos y fotografías históricas para reportes y boletas.

### AFP, ONP, EsSalud y quinta categoría

Los descuentos del trabajador y aportes del empleador se presentan por separado. La base mínima aplicable a EsSalud no se convierte en un descuento adicional AFP/ONP ni en una reducción del neto del trabajador.

Las condiciones pensionarias proceden del contrato correspondiente y de la normativa efectiva cuando actúa como respaldo. Revise el detalle antes de aprobar: la suma de conceptos y el neto deben corresponder a todos los empleados, no a una página parcial.

### Crédito EPS y saldos históricos

Seleccione un origen disponible y completo cuando la planilla use saldo EPS. El origen debe conservar generación, aplicación y remanente. Un mismo saldo consumido no queda disponible para otra planilla sólo porque una segunda ventana mantuvo el formulario abierto.

Una cobertura histórica declarada se distingue de afiliaciones actuales. La cadena de aplicación conserva la fotografía de cada período aunque no existan trabajadores cubiertos en el período posterior. Un conflicto exige actualizar o recuperar la intención; no crear un saldo manual nuevo para duplicar el crédito.

### Aprobar

El calculador no aprueba su propia planilla. El aprobador revisa el detalle y confirma. La pantalla puede conservar una etapa de verificación después del recibo: consultar el resultado no debe repetir la aprobación.

### Pagar

Un pagador distinto del aprobador revisa detalle, neto total, empleados y destinos tesoreros. Complete método, cuenta o sesión aplicable, fecha y referencia, y confirme el pago completo admitido.

El pago debe conservar evidencia laboral, movimiento de tesorería y su resultado contable. Una notificación local, respuesta pendiente o desconexión no acredita pago. Si la planilla aparece pagada pero existe un intento pendiente por pérdida de respuesta, recupere el recibo original con la misma referencia; no introduzca otro pago.

### Reporte y boletas

Desde la planilla consulte reporte y boletas autorizados. Revise empresa, empleado, período, ingresos, descuentos, aportes y neto. Si falta una fuente, el producto no debe entregar una boleta aparentemente completa.

La descarga HTML y su impresión a PDF son representaciones de la fotografía laboral. No prueban una entrega física al empleado ni una presentación oficial. Los permisos de remuneraciones son más específicos que el acceso general al módulo.

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


<!-- revision-omisiones-inicio -->
### Límites de selección contractual y empleados inactivos

Para la planilla peruana del período, se consideran contratos vigentes que intersectan ese mes. Si hay varios elegibles, la selección prioriza el de fecha de inicio más reciente. Esta selección **no implementa un prorrateo de varios contratos dentro del mes**. No prepare un pago suponiendo que la existencia de dos contratos ya repartió automáticamente los días e importes entre ambos.

La conservación del historial de un empleado inactivo en los reportes tampoco significa que una planilla nueva lo incorpore automáticamente para recalcular sus meses históricos. Revise elegibilidad, estado, período y resultado explícito del proceso. Una renovación futura o una ficha visible no sustituyen esas comprobaciones.
<!-- revision-omisiones-fin -->




### Mantener la identidad del cálculo de planilla

El cálculo conserva su planilla, solicitud e identidad originales durante la recuperación. Si una fuente falla, el borrador no se considera calculado. Recupere las fuentes y el mismo intento; no cree otra planilla para resolver una respuesta perdida. La resolución de un abandono debe confirmarse antes de preparar un intento nuevo.

### Comprobar el resultado completo del cálculo

La confirmación debe corresponder a la planilla y sus empleados e importes calculados. Un total aislado no acredita un detalle completo. Ante un resultado incompleto, mantenga la solicitud y recupere su confirmación; revise el detalle y las fuentes antes de solicitar aprobación.

### Elegir el contrato vigente del período

La calculadora necesita los contratos completos de la empresa y del empleado, no sólo el primer resultado disponible. Verifique la vigencia en el período y el sueldo confirmado. Si falla una página, recupere la fuente; no complete el cálculo suponiendo que no hay contrato.

### Incluir a los empleados de la empresa

Espere la carga completa del catálogo de empleados antes de calcular. Una lista parcial no representa a toda la empresa y un error no significa ausencia de trabajadores. Cambiar de empresa exige volver a validar las fuentes y no debe conservar empleados del contexto anterior.

### Revisar todos los conceptos de remuneración

El detalle de una planilla debe incluir los conceptos completos de cada empleado. Cargar la cabecera o la lista de empleados no confirma que ingresos, descuentos y aportes estén completos. Ante un fallo, recupere el detalle antes de aprobar, pagar o emitir una boleta como definitiva.

### Confirmar la creación de la planilla

El recibo de creación debe corresponder a empresa, período, país, moneda, usuario y datos originales. La planilla creada se inicia en borrador y con pago pendiente; crear no equivale a calcular, aprobar ni pagar. Un recibo incompleto conserva la intención para recuperación.

### Recuperar el alta original de planilla

Al volver, recargar o recuperar la conexión, conserve la identidad y los datos del alta pendiente. La recuperación consulta o reintenta ese original; no crea automáticamente otra planilla. Si cambia el período, revise y resuelva primero la intención pendiente para no mezclar fuentes de dos meses.

### Consultar el detalle completo de planilla

La consulta debe terminar todas las páginas del detalle de la planilla seleccionada. Un subtotal de una página no acredita el total de trabajadores. Confirme además la completitud de los conceptos de cada empleado; la cabecera, los empleados y los conceptos son fuentes relacionadas con verificaciones distintas.

### Elegir una planilla desde un catálogo completo

Al seleccionar una planilla para una operación relacionada, compruebe empresa y período y espere el catálogo completo. Una lectura fallida no acredita que la planilla no exista ni habilita crear otra. Recupere la consulta y vuelva a revisar el vínculo antes de aplicar un beneficio o crédito.

### Usar las vacaciones aprobadas completas

El cálculo consume las solicitudes aprobadas pertinentes al período. Compruebe todas las páginas y fechas; una consulta fallida no equivale a cero vacaciones. Los solapamientos se revisan por fechas únicas y la liquidación limita las fechas al cese. Registrar o aprobar la solicitud no constituye por sí mismo el pago de vacaciones.

## 35. CTS y liquidaciones

### CTS

Seleccione período, empleados y base computable según el flujo. Revise la gratificación de origen cuando deba formar parte del cálculo. Una fuente externa declarada conserva su procedencia; no se presenta como un pago registrado automáticamente por la planilla.

El cálculo produce una obligación en el libro de CTS. Recalcular sólo modifica registros calculados elegibles; no reabre depósitos hechos. Para depositar, seleccione banco, fecha y referencia con el usuario pagador autorizado y compruebe el resultado.

Si una CTS pendiente ya se incorporó a una liquidación final, queda consumida para impedir pagar dos veces el mismo beneficio.

### Liquidación al cese

1. Seleccione empleado, fecha de cese y datos exigidos.
2. Revise contratos, vacaciones, CTS y gratificaciones utilizadas como fuentes.
3. Calcule y compruebe cada componente y el total.
4. Obtenga la confirmación segregada que aplica el cese.
5. Con usuario pagador autorizado, realice la transferencia de la liquidación aprobada.
6. Consulte la evidencia de pago y el estado laboral resultante.

Calcular no inactiva automáticamente al empleado ni termina el contrato. La confirmación explícita aplica el cese y su reconocimiento. No confunda simulación, aprobación y pago.

### Revertir y volver a pagar

La reversa conserva el pago original como revertido, restaura la obligación y el banco original de acuerdo con su evidencia, y deja el contra-asiento. No se borra la transferencia anterior para hacerla desaparecer.

Un nuevo pago después de la reversa es otra operación. Los nuevos pagos de liquidación usan transferencia en el contrato documentado; un efectivo histórico sin evidencia suficiente requiere regularización, no una confirmación inventada.

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





### Liquidación con historia de beneficios verificable

Indique la fecha de cese y revise CTS, gratificaciones y vacaciones con sus fuentes históricas. Si falta la historia necesaria, el conflicto conserva la revisión y no autoriza a suponer un beneficio pagado. El resultado depende de esas fechas y fuentes; los importes de una prueba antigua no son una fórmula ni un saldo aplicable a otro trabajador.

## 36. PLAME, T-Registro y contexto por país

### Preparar el paquete peruano

Complete RUC, identidad, contratos, códigos paramétricos, jornada y las fuentes de la planilla. Una jornada manual debe ser explícita y auditable; la ausencia de asistencia no se resuelve inventando horas ordinarias.

1. Abra **RRHH > PLAME / T-Registro** con la planilla elegible.
2. Revise validaciones y corrija bloqueos de ficha o fuente.
3. Congele una versión y compruebe su período y notas.
4. Descargue el paquete y conserve su referencia e integridad.
5. Valide las fuentes con el procedimiento externo correspondiente.
6. Después de presentar realmente, registre las constancias que exige el producto.

Un reintento del congelado conserva la versión original. Una nueva intención produce otra versión; no reemplaza el paquete anterior porque hayan cambiado asistencia o notas después.

### Archivos y evidencia oficial

El paquete contiene papeles de trabajo y fuentes registrales. El ZIP del ERP no es necesariamente el ZIP que se carga en SOL: la validación externa produce el artefacto de presentación correspondiente.

La constancia PLAME y el ticket/CIR de T-Registro son evidencias distintas. Si existen novedades registrales, el estado presentado requiere las evidencias pertinentes; no se sustituye una por la otra. Una ficha sin cambios respecto del último CIR no debe repetirse como novedad; un cambio real vuelve a exigir su tratamiento.

### Perú, Argentina y Colombia

El producto resuelve país y normativa desde la empresa. No se mezclan documentos, moneda ni reglas laborales entre países. Los flujos más desarrollados en esta edición son los de Perú. descritos; la existencia de motores o configuración de otros países no se presenta como certificación fiscal externa de esos países.

Argentina conserva sus datos de identificación y configuración contractual; Colombia, sus afiliaciones y configuración laboral y fiscal propias. Las presentaciones reales, portales e integraciones externas requieren datos patronales, credenciales y habilitación correspondientes. Una demostración o una prueba local no concede esas habilitaciones.

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

### Auditoría

Con permiso de auditoría consulte fechas, actor, operación, recurso y resultado. Use los filtros y paginación disponibles. El historial puede combinar varias fuentes; una fuente incompleta debe avisarse, no ocultarse como historial vacío.

La búsqueda de texto de la pantalla puede aplicarse a la página visible: respete el alcance que indique la interfaz y no concluya que no existe un evento sólo por no verlo en esa página. Cambiar filtros mientras llega otra consulta no debe restaurar el filtro anterior.

El registro sirve para seguir decisiones y correlaciones; no debe revelar contraseñas, certificados o secretos. Consultar auditoría no concede acceso de escritura al recurso auditado.

### Notificaciones

La bandeja muestra avisos propios y los globales o de rol que correspondan. Un vendedor puede tener notificaciones autorizadas; no se promete que toda su bandeja esté prohibida. Los avisos privados de otros usuarios o empresas permanecen separados.

Abra un aviso, márquelo o use las acciones colectivas permitidas. Si la lectura individual o una acción falla, reintente desde la misma interfaz. Recuperar un aviso no debe marcar otro pendiente como leído ni eliminarlo por accidente.

### Monitoreo de integraciones

Revise el monitor para distinguir una operación empresarial confirmada de una integración o proyección pendiente. Una fuente fallida no significa que todos los eventos estén procesados. Consulte el recurso, estado, error depurado y correlación que ofrezca la vista.

Cuando el producto ofrezca una acción autorizada de reencolado, por ejemplo para un evento contable de planilla fallido, recupere ese mismo evento y compruebe su procesamiento. No registre otra nómina ni cree un asiento manual paralelo para sustituir la recuperación del evento. La existencia de un evento en cola tampoco acredita que su asiento ya esté confirmado.

### Ayuda y recorridos

La ayuda ofrece catálogo, búsqueda y detalle de artículos según el contexto. Un fallo de carga se distingue de la ausencia de resultados. Cerrar un artículo mientras carga no debe abrir después información de una selección anterior.

Los recorridos permiten avanzar, retroceder, terminar, repetir, saltar o cerrar según los controles. El progreso se conserva sin duplicar finalizaciones. Reiniciar un recorrido restablece ese progreso, no cambia datos empresariales ni permisos.

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

### Tres situaciones que no deben confundirse

| Lo que ocurre | Qué significa | Qué hacer |
|---|---|---|
| Lista vacía confirmada | La consulta válida no devolvió registros del alcance | Revisar filtros o crear un registro si corresponde. |
| Error o fuente incompleta | No se conoce todavía el resultado completo | Reintentar; no tomar decisiones a partir de ceros o filas antiguas. |
| Escritura con respuesta perdida | La operación pudo aplicarse aunque no llegara su confirmación | Recuperar el intento original y verificar su resultado. |

Un código de error genérico no basta para determinar si hubo efecto. Un rechazo explícito de validación previo al efecto puede permitir corregir; una caída de red después de enviar exige conservar el intento. El producto diferencia ambos casos en los flujos que ofrecen esa recuperación.

### Recuperar sin duplicar

1. Mantenga la sesión y empresa que originaron la operación.
2. Abra la operación pendiente o regrese al contexto original.
3. Revise recurso, importe, referencia y datos congelados.
4. Use la consulta, verificación o reintento manual que ofrezca el flujo.
5. Considere terminada la recuperación sólo con un resultado completo del recurso esperado.
6. Inicie una operación nueva cuando la anterior esté resuelta, no para reemplazar un estado desconocido.

Cerrar un diálogo, navegar atrás, recargar o reiniciar el escritorio no significan cancelar el efecto que el servidor pudo confirmar. La aplicación conserva los intentos recuperables y no debe enviarlos automáticamente al abrirse.

### Etapas, conflictos y ventanas simultáneas

Alta, cálculo, aprobación, pago, verificación, archivo y cierre pueden ser etapas diferentes. Si el alta ya fue confirmada, recuperar el cálculo no debe repetirla. Si el recibo está confirmado y falta una consulta de verificación, se verifica, no se registra otra vez el negocio.

Un conflicto por otro usuario o ventana exige actualizar o conciliar. Los bloqueos evitan dos envíos simultáneos de la misma operación. Cambiar A→B→A en un formulario no habilita una respuesta antigua de A: la consulta vigente tiene su propio contexto.

### Almacenamiento dañado o no disponible

Si el producto no puede conservar de forma fiable la solicitud o comprobar su retiro, puede mantener el bloqueo para evitar perder la evidencia. No borre manualmente el almacenamiento, no cambie claves internas y no sobrescriba un pendiente con otro formulario.

Use la resolución o abandono seguro ofrecidos, que pueden archivar solicitud y recibo antes de retirar el pendiente. Si no existe esa acción o el contenido está dañado, entregue a soporte el contexto visible sin incluir secretos.

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

### Qué puede mantenerse localmente

Algunas consultas y actualizaciones compatibles, como determinados flujos de clientes, permiten persistencia local. Una edición sin red puede quedar **pendiente** para sincronización; eso no significa que el servidor ya la haya aplicado.

Las fichas y rutas compatibles pueden recuperarse desde los datos propios almacenados cuando el permiso lo permite. No se promete que todo el ERP funcione sin conexión ni que cualquier pantalla tenga una copia completa.

### Consultar y sincronizar una cola compatible

1. Compruebe la empresa y usuario propietarios del pendiente.
2. Revise la operación y su estado antes de sincronizar.
3. Restablezca la conexión y reintente la misma entrada.
4. Si falla antes del efecto, la entrada debe conservar su identidad.
5. Después de la confirmación, compruebe el dato del servidor y el estado sincronizado.

Otro usuario no puede ver, enviar o eliminar el pendiente del propietario aunque pertenezca a la misma empresa. Un cambio de rol puede retirar acceso a la copia local; un error de permisos no autoriza utilizarla como respaldo para saltarse la denegación.

### Qué exige confirmación en línea

Pagos, cobros, emisiones o envíos fiscales y otras operaciones sensibles mantienen su intento recuperable propio y no deben pasar por una cola genérica como si fueran un éxito diferido garantizado. Material fiscal y credenciales no se guardan en el almacenamiento de navegación o cola de negocio.

Los reinicios Windows conservan el perfil y los pendientes válidos según su flujo. No recree el perfil como primer paso de soporte: puede perder el contexto necesario para conciliar una operación incierta.

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

### Venta a crédito hasta el cobro

1. Administración prepara empresa, serie, almacén, usuarios y permisos.
2. Ventas registra o selecciona cliente y elabora la cotización con precio e impuesto revisados.
3. El actor autorizado aprueba y convierte a pedido.
4. Se confirma la reserva y logística prepara y despacha dentro del pendiente.
5. Se factura desde el origen y se revisan documento, estado fiscal y cuenta por cobrar.
6. Tesorería registra cobros parciales o total con destino explícito.
7. Contabilidad revisa asientos y reportes; los archivos se exportan sin repetir la venta.

**Puntos de control:** identidad del cliente, moneda, saldo de stock, cantidades despachadas, documento único, deuda pendiente y destino del cobro. Una interrupción se recupera en la etapa afectada.

### Compra de un bien hasta el pago

1. Compras selecciona proveedor y artículos y revisa precio e impuesto por línea.
2. Otro actor aprueba cuando corresponde y se genera la orden.
3. Almacén recibe y cierra cantidades parciales o completas.
4. Se registra la factura real vinculada a la recepción elegible.
5. Se revisa la cuenta por pagar, ajustes y vencimiento.
6. Tesorería aplica el pago individual o lote permitido.
7. Se consulta banco/caja, historial y asiento, sin recrear manualmente sus efectos.

**Variante servicio:** se cumple la recepción, se factura y se paga, pero no se genera stock ni kardex de bienes.

### Venta de mostrador y cierre

1. Abra caja con conteo inicial.
2. Prepare carrito, revise precios y seleccione medios.
3. Confirme una venta y su ticket o comprobante.
4. Recupere cualquier emisión pendiente sin volver a vender.
5. Registre movimientos manuales justificados de la sesión.
6. Arquee, revise redondeos y diferencias y obtenga supervisión cuando corresponda.
7. Cierre y descargue el corte confirmado.

### Nómina completa

1. Mantenga empleados, contratos, normativa y conceptos del período.
2. Registre asistencia y decisiones de solicitudes.
3. Cree y calcule la planilla con fuentes completas.
4. Revise conceptos y fuentes especiales, incluido EPS cuando aplique.
5. Obtenga aprobación por actor distinto.
6. Un pagador distinto confirma el destino y realiza el pago.
7. Consulte boletas, asiento, tesorería y paquete PLAME correspondiente.
8. La presentación y constancias externas continúan por su proceso oficial.

### Cierre de período y revisión gerencial

1. Verifique que las operaciones del período y sus proyecciones estén completas.
2. Revise bancos, conciliaciones, partidas y diferencias.
3. Ejecute depreciaciones, devengos y demás operaciones del período cuando correspondan.
4. Revise estados, libros y papeles tributarios del mismo corte.
5. Resuelva las inconsistencias de la comprobación previa y cierre con autorización.
6. Genere reportes gerenciales o consolidados sin alterar los libros legales.

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

| Situación | Acción recomendada | Evitar |
|---|---|---|
| No aparecen registros después de un error | Recuperar la consulta y comprobar filtros y empresa | Dar por hecho que el catálogo está vacío. |
| No llega el éxito de un cobro o pago | Recuperar el intento original y revisar historial/destino | Enviar otro pago con referencia nueva para probar. |
| Un permiso desaparece con la ventana abierta | Consultar con el administrador la asignación actual | Usar datos locales para eludir la denegación. |
| Una compra no permite recibir | Revisar aprobación, estado y saldo de líneas | Crear otra orden para saltar el control. |
| El reporte muestra información incompleta | Reintentar todas las fuentes necesarias | Exportar cifras antiguas como si fueran actuales. |
| La planilla no calcula | Revisar normativa, contrato y fuentes señaladas | Sustituir datos ausentes por tasas o días inventados. |
| El comprobante está firmado pero no aceptado | Revisar envío y evidencia oficial | Registrar aceptación manual sin constancia. |
| El banco no concilia | Revisar pares, saldos y ajustes explícitos | Forzar cierre o duplicar un movimiento. |
| El período está cerrado | Consultar el procedimiento autorizado de reapertura | Cambiar fechas para ocultar una operación del período. |
| Hay almacenamiento dañado o pendiente ajeno | Preservar evidencia y solicitar resolución autorizada | Borrar el perfil o manipular claves internas. |
| La descarga no es válida | Reintentar el archivo correcto desde su contexto | Guardar un mensaje de error con extensión PDF. |

Al solicitar soporte indique módulo, empresa, recurso visible, fecha local, acción que intentó, mensaje, último resultado confirmado y si hubo desconexión o cambio de sesión. No adjunte contraseñas, PIN, certificados privados ni tokens.

Un ejemplo con una persona, documento o importe sintéticos no demuestra que exista ese registro en una empresa operativa. El soporte debe consultar el contexto real autorizado.

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





### Distinguir consulta de modificación durante soporte

Una investigación de soporte debe declarar cualquier cambio que haya producido y conservar la evidencia anterior y posterior. Una prueba que modificó existencias no puede presentarse como consulta de sólo lectura. Para revisar un resultado use recibos y lecturas; una corrección del stock requiere su propia operación autorizada y trazable.

## 42. Glosario y alcance de esta edición

| Término | Significado operativo |
|---|---|
| Borrador | Datos preparados o guardados que todavía admiten las acciones de su estado. |
| Confirmación | Respuesta completa del servidor que vincula resultado y operación esperados. |
| Intento u operación pendiente | Solicitud conservada para resolver un resultado incierto sin duplicarlo. |
| Reintento | Recuperación de la misma operación y contenido; no una operación nueva equivalente. |
| Conciliación | Según contexto, comparación bancaria, emparejamiento de partidas o resolución de una solicitud incierta; no son la misma acción. |
| Fotografía histórica | Datos congelados de precios, impuestos, cálculo o emisión que no se sustituyen por maestros actuales. |
| Saldo a favor | Obligación reconocida a favor del tercero, disponible para aplicación o reembolso permitido. |
| Devengo | Reconocimiento contable del ingreso, gasto u obligación según el flujo. |
| CDR o constancia | Evidencia externa cuyo contenido y procedencia deben corresponder al documento o presentación. |
| Corte | Fecha o período al que responde una consulta; puede diferir del saldo actual. |
| Sólo lectura | Permiso para consultar el alcance autorizado sin facultad implícita de cambiarlo. |

El libro documenta producto, comportamiento y uso; el respaldo de aceptación se mantiene separado en [COBERTURA_UAT.md](COBERTURA_UAT.md) y en el expediente íntegro de criterios enlazado desde allí.

El producto no incluye por sí solo una habilitación fiscal real, un instalador firmado, disponibilidad sin conexión de todos los módulos ni rendimiento bajo una carga no medida.

### Cómo interpretar el alcance de la documentación

El manual explica tareas y decisiones del producto. Para mantener una operación concreta, la referencia exacta es el código vigente.

| Documento o término | Interpretación correcta |
|---|---|
| Capítulo del manual | Explica el proceso, su preparación, decisiones y recuperación. |
| Ficha de referencia | Identifica una operación o variante concreta y su respaldo. |
| Criterio original | Conserva la aserción y datos de una evidencia local. |
| Evidencia externa | Resultado verificable de la autoridad o servicio correspondiente. |

1. Busque primero el proceso que quiere realizar.
2. Si necesita una variante específica, consulte su ficha y vuelva al procedimiento del capítulo.
3. Distinga datos ilustrativos de campos y reglas que deba completar con información real.
4. Para una discrepancia, identifique la versión y la fuente antes de interpretar el resultado.


**Límite de interpretación:** esta edición no añade funciones por describirlas ni convierte una prueba local en habilitación fiscal o despliegue. La referencia funcional y las fuentes preservadas permiten verificar qué comportamiento respalda cada explicación.

## 43. Contratos de suministro con clientes

### Para qué sirve

Controla la venta por contrato: lo pactado con el cliente, sus órdenes de compra, las entregas programadas, lo que el cliente aceptó, lo facturado y lo cobrado, en un mismo expediente.

Pantallas: `/dashboard/ventas/contratos`, `/dashboard/alertas` y `/dashboard/tablero-suministro`. En **Ayuda › Ciclo de suministro por función** está el orden de trabajo de cada perfil.

Una "OC del cliente" es la orden que el cliente le emite a usted. No debe confundirse con una orden de compra emitida a un proveedor (capítulo 13).

### Quién hace qué

| Perfil | Qué puede hacer |
|---|---|
| SUMINISTRO | Contratos (ver, gestionar, conformar), pedidos (ver, editar), penalidades (ver, gestionar), lotes (leer), alertas (ver, gestionar), tablero (leer, exportar) |
| ALMACEN | Consultar contratos, registrar recepciones del cliente y gestionar lotes |
| FINANZAS, CONTADOR, AUDITOR | Consultar contratos. Quienes tengan esos permisos facturan y cobran desde sus propios módulos |
| VENDEDOR | Ver contratos y lotes |
| GERENCIA | Gestionar contratos y aprobar penalidades, pero no calcularlas |
| ADMIN | Además, credenciales de Power BI y migración |

Los permisos son `ventas.contratos.ver`, `ventas.contratos.gestionar`, `ventas.contratos.conformar`, `ventas.penalidades.ver`, `ventas.penalidades.gestionar` y `ventas.penalidades.aprobar`. Calcular y aprobar una misma penalidad exige dos personas distintas, aunque sean ADMIN.

### El recorrido

1. **Contrato.** Registre cliente, moneda, vigencia, responsable y líneas con producto, unidad, cantidad y precio sin impuestos. Código, descripción y unidad se congelan desde el maestro. Actívelo.
2. **OC del cliente.** Pertenece a un contrato activo y reparte cantidades por línea, sin superar lo contratado. Cada línea congela el precio del contrato.
3. **Programación.** Cada línea de OC admite varias entregas con cantidad, fecha y destino, sin superar la OC. Las fechas van dentro de la vigencia y no pueden preceder a la emisión de la OC. Programar **no** reserva stock ni despacha.
4. **Pedido.** Vincule un pedido pendiente del mismo cliente y moneda: cada línea se asigna a una programación con el mismo producto y precio de la OC. Reserva, despacho y facturación siguen el flujo normal del pedido (capítulo 9).
5. **Despacho.** Los lotes se asignan por vencimiento (capítulo 44).
6. **Recepción del cliente.** Registre por despacho y lote lo recibido, aceptado y rechazado con su motivo, la fecha, quien recibió, la guía, la PECOSA, el número de conformidad y las incidencias.
7. **Factura y cobro.** Cada pedido vinculado se factura una sola vez y genera su CxC, sus cobros y sus notas (capítulos 15 y 18).
8. **Estado de cuenta.** Compare contratado, en OC, programado, en pedidos, despachado, aceptado, facturado y por facturar.

### Cambios después de activar

| Qué cambia | Cómo se hace | Límite |
|---|---|---|
| Contrato activo | Adenda con referencia, motivo y versión | Cliente, número, moneda e inicio de vigencia no cambian; las cantidades no bajan de lo asignado a OC |
| OC | Modificación con referencia, motivo y versión | No baja de lo programado; las líneas con entregas históricas se conservan |
| OC anulada | Cancele primero todas sus programaciones | Libera cantidades; no se puede programar sobre ella |
| Entrega | Reprogramar con motivo | Conserva fecha original, anterior, actor e historial |
| Borrador de contrato | Edición directa o anulación | Solo en borrador |

Una adenda **no** revaloriza OC anteriores. Las líneas nuevas toman el precio vigente. Registrar una adenda tampoco firma ni aprueba legalmente el documento asociado.

### Conformidad: entregar no es cumplir

Solo lo aceptado cuenta como cumplido. Marcar el seguimiento como entregado no acredita conformidad.

- Lo recibido no puede superar lo despachado de cada lote, y la fecha no puede ser futura ni anterior al despacho.
- Lo rechazado vuelve a quedar por aceptar y libera saldo para vincular un pedido de reposición. La devolución física sigue el flujo de RMA (capítulo 10).
- Anular una recepción exige versión y motivo. Se rechaza si su rechazo ya fue repuesto.
- Un despacho con aceptación registrada no se anula cancelando el pedido.
- El ERP no emite PECOSAS: registra su número y su documento.

### Base de facturación

El contrato define su base, con versión y motivo: **por despacho completo** o **contra conformidad**. Contra conformidad, no se puede asignar comprobante a un pedido vinculado mientras lo aceptado no cubra todas sus líneas. Facturar por entrega es facturar el pedido de esa entrega. La facturación por hito no está disponible.

### Adjuntos

Se asocian a contrato, OC o adenda: PDF, DOCX sin macros, PNG y JPG, hasta 10 MiB. El permiso de conformar también adjunta guía, PECOSA o conformidad firmada a una recepción. Una descarga genera un enlace válido por 60 segundos. Retirar un adjunto exige motivo y bloquea enlaces nuevos, pero no lo borra físicamente.

### Penalidades

Se configuran por contrato, en la sección **Penalidades** del expediente.

- **Método:** mora 0,10 × base / (F × plazo), porcentaje diario, importe diario o único.
- **Base:** valor de la entrega o lo no aceptado al límite.
- **Plazo:** fijo o de la OC a la entrega, con tolerancia, en días calendario o hábiles. Los hábiles son de lunes a viernes y **no descuentan feriados**.
- **Tope:** porcentaje sobre el contrato o la entrega, descontando lo ya aprobado del mismo grupo de reglas.

Editar una regla crea otra versión. Las ampliaciones de plazo se registran por entrega como días excluidos. Calcular a un corte, nunca futuro, guarda una instantánea inmutable con la explicación del cálculo, y repetir el corte no duplica. El atraso corre desde la fecha programada más la tolerancia hasta la recepción que completa lo aceptado, o hasta el corte.

La revisión tiene los estados en revisión, observado, controversia, descartado y aprobado. Aprobar exige otra persona y un monto entre 0 y el estimado. **Aprobar no genera asientos, notas ni descuentos en la cobranza**: aplicarla es una decisión aparte.

### Alertas

En `/dashboard/alertas` hay una regla por tipo para entregas próximas sin despachar, atrasadas o incompletas, lotes por vencer o vencidos y cobranza contractual por vencer o vencida. Cada regla define anticipación, destinatarios, responsable, escalamiento y correo.

La evaluación corre cada hora y bajo demanda, y mantiene una sola alerta abierta por condición. Cada destinatario reconoce por sí mismo, y solo se escala una vez si nadie reconoce a tiempo. Si la condición desaparece, la alerta se resuelve. El correo necesita el servicio de correo productivo configurado. Ver las propias no exige permiso especial; ver todas exige `alertas.suministro.ver` y configurar exige `alertas.suministro.gestionar`.

### Tablero y Power BI

`/dashboard/tablero-suministro` muestra cumplimiento por OC, entregas a tiempo y completas, atrasos, cobertura de stock, lotes por vencer, por facturar, cobranza y penalidades. Cada indicador abre su detalle. Exige `reports.suministro.read` y exportar exige `reports.suministro.export`.

Un **corte** es una foto inmutable con su huella. Exportar registra un corte y descarga su Excel, y una tarea registra uno automático al día. Pantalla, Excel y Power BI leen el mismo corte, por lo que concilian entre sí.

Power BI usa una credencial de lectura de la empresa, creada por ADMIN con `integraciones.bi.gestionar`, con vencimiento de hasta un año y revocable. **El token se muestra una sola vez.**

### Excepciones

| Situación | Qué hacer |
|---|---|
| No se puede facturar un pedido vinculado | Revise la base de facturación: contra conformidad, lo aceptado debe cubrir todas las líneas. |
| El contrato tiene un precio de más de dos decimales | Ese pedido no se vincula, porque el pedido solo admite dos decimales en precio. |
| No se puede reducir una cantidad | Ya hay OC, programaciones o pedidos que la usan; libérelos primero. |
| Un correo de alerta no llega | Compruebe el servicio de correo; la notificación interna se crea igual. |
| El estado de cuenta señala un comprobante | Su total menos notas y cobros no coincide con el saldo de la CxC: revíselo en finanzas. |

**Efecto en otros módulos:** el estado de cuenta y el tablero leen documentos existentes. No crean efectos contables ni de inventario.

## 44. Lotes y vencimientos

### Para qué sirve

Controla por lote el stock de los productos que lo requieren y asigna primero lo que vence antes. Pantalla: `/dashboard/inventario/lotes`, con saldos, reservas por documento, stock sin lote, kardex por lote y lotes por vencer. Permisos: `inventario.lotes.read` y `inventario.lotes.manage`.

Los productos sin esta política siguen funcionando como antes.

### Activar el control en un producto

Defina vencimiento obligatorio y vida útil mínima. Activarlo exige que **no haya reservas**.

El stock que ya existía queda **sin lote**: visible y pendiente de regularizar. **Hasta regularizarlo no se puede reservar ni despachar.** Regularizar exige motivo y no mueve el kardex físico.

Desactivar el control exige que no haya stock ni reservas por lote.

### Cómo se asignan los lotes

| Operación | Qué exige o hace |
|---|---|
| Recepción y ajuste manual | Exigen indicar el lote |
| Reserva y salida sin lote indicado | Se asigna primero el que vence antes (FEFO), entre lotes vigentes con la vida útil mínima |
| Vida útil en un contrato | Se mide contra la entrega programada; sin contrato, contra hoy |
| Despacho | Libera y descuenta exactamente los lotes reservados por ese pedido |
| Ajuste, transferencia y devolución | Pueden mover lotes vencidos |
| Anulación, RMA, transferencia o nota de crédito | Vuelven al lote de origen si es único; lo no atribuible queda sin lote |
| Liberación sin documento de referencia | Se rechaza |

Una reserva puede reasignarse o dividirse entre lotes, con motivo y conservando la cantidad.

### Comprobaciones

Por almacén, la suma por lote nunca supera el físico, y lo reservado por lote coincide con lo reservado. Si un pedido no reserva aunque "hay stock", revise si ese stock está sin lote o si los lotes no cumplen la vida útil mínima.

## 45. Migración desde otro sistema

### Qué es

El proceso estándar para pasar a este ERP desde **cualquier** sistema anterior. Lo único propio de cada sistema es un archivo de mapeo. Pantalla: `/dashboard/migracion` (menú **Migración de datos**).

El proceso tiene dos capas con la misma fecha de corte:

- **Archivo íntegro:** guarda cada tabla del extracto tal cual, con los registros borrados en origen, en lotes inmutables consultables por texto, tabla y página. Las credenciales y los medios de pago se redactan al cargar.
- **Migración operativa:** carga terceros, maestros y saldos abiertos con las mismas reglas que el resto del ERP.

### Quién hace qué

| Acción | Permiso | Perfil inicial |
|---|---|---|
| Importar datos de migración | `migration.origen.import`, `migration.suministro.import` | ADMIN |
| Cargar el archivo íntegro | `migration.archivo.import` | ADMIN |
| Consultar el archivo íntegro | `migration.archivo.read` | ADMIN, GERENCIA, CONTADOR, AUDITOR |
| Conciliar | `migration.validar.read` | Con ese permiso |

Las órdenes de compra migradas quedan en borrador, y las aprueba alguien distinto de quien migró.

### El proceso

1. **Pida el extracto:** una carpeta con un archivo por tabla, en DBF, CSV, TSV, JSON, JSONL o Excel de una hoja. Si el cliente ya entrega sus datos en las plantillas del ERP, salte al paso 4 o 5.
2. **Perfile y mapee.** El perfil muestra formato, volumen, borrados, claves candidatas y columnas sensibles. El mapeo indica de qué tabla y campo sale cada dato; una unidad sin correspondencia detiene la transformación e indica el valor exacto.
3. **Transforme.** Produce las plantillas en orden y `control.json`, con los totales que se conciliarán. Los comandos están en `docs/OPERATIONS.md`.
4. **Cargue el archivo íntegro.** El lote cierra solo si lo cargado coincide con lo leído, y queda inmutable.
5. **Ensaye.** En la pantalla, indique el **Sistema de origen**, adjunte las plantillas, la fecha de corte y `control.json`. El ensayo corre todo y lo revierte. Repita hasta tener cero errores, conciliación cuadrada y cruce de bancos con el asiento de apertura cuadrado. La operación puede tardar hasta 15 minutos.
6. **El día del corte:** deje el sistema anterior en solo lectura, extraiga, transforme, archive, ensaye e importe.
7. **Importe en este orden:** clientes, proveedores, almacenes, plan de cuentas, productos, cuentas bancarias, listas de precios, CxC, CxP, balance de apertura, contratos, OC del cliente, cronograma, OC de compra, pedidos de venta y stock.
8. **Concilie** con el mismo `control.json`. Sin conciliación cuadrada no se libera el corte.

### Qué se migra

**Lo abierto al corte, no la historia operativa.** La historia queda consultable en el archivo íntegro.

| Dato | Qué entra |
|---|---|
| Contrato | Lo no ejecutado; las líneas agotadas no se migran |
| OC del cliente y cronograma | Lo pendiente de entregar |
| OC de compra | Lo pendiente de recibir, en borrador |
| Pedido de venta | Lo pendiente de despachar, al precio pactado |
| Stock inicial | Con lote y vencimiento si el producto los controla; un lote vencido también se registra |

Lo migrado de suministro no crea pedidos, despachos, comprobantes, cobranza ni asientos.

### Reglas ante datos dudosos

- Lo que ya existe en el ERP se adopta por código.
- Un código que coincide con dos registros, o un registro ya enlazado a otro código de origen, se **rechaza** en lugar de adivinar.
- Un reintento no duplica. Un dato cambiado en el sistema anterior se rechaza por registro.
- Los errores del ensayo se devuelven al cliente para corregir en su sistema y reentregar el extracto.

### Límites conocidos

| Límite | Consecuencia |
|---|---|
| Terceros, CxC, CxP y balance usan clave por empresa, no por sistema de origen | Migrar dos sistemas en una misma empresa exige códigos sin repetir en esas plantillas |
| Pedido de venta con precio de más de dos decimales | Se rechaza al importar |
| El extracto contiene datos del cliente | Se procesa fuera del repositorio y no se versiona |

## 46. Analytics financiero

### Para qué sirve

`/dashboard/analytics` da una lectura gerencial del período: evolución de ventas, ventas por categoría, cuentas por cobrar y por pagar, indicadores, una lectura ejecutiva, recomendaciones y señales de alerta.

Exige `analytics.ventas.read` para ventas y `analytics.cobranza.read` para deudas de clientes y proveedores. Los datos pertenecen a la empresa activa.

### Cómo leerlo

1. Elija el período y revise los indicadores.
2. Compare la evolución de ventas y las categorías que más aportan.
3. Revise qué clientes y proveedores concentran saldo pendiente.
4. Lea la lectura ejecutiva, las recomendaciones y las señales como orientación para decidir qué revisar.

### Qué no es

- **No sustituye los estados financieros ni los libros.** Para cifras contables use los capítulos 24 y 31.
- **Las recomendaciones y señales son orientativas.** No son una decisión, un dictamen contable ni una proyección garantizada.
- **Una gráfica vacía** indica que no hay datos en el período, según el mensaje de la pantalla. Si la consulta falla, debe tratarse como error, no como cero.
- **Un saldo aquí no reemplaza la CxC o la CxP.** Ante una diferencia, revise el documento en finanzas.

