# Revisión de omisiones del manual de producto

Se encontraron y corrigieron 13 omisiones o explicaciones insuficientes. Cada corrección está contrastada con código o migraciones del candidato congelado, sin ejecutar operaciones empresariales ni alterar la aceptación UAT.

| ID | Capítulo | Omisión o ambigüedad corregida |
|---|---:|---|
| O01 | 04 | La expresión «alcance central» no explicaba que una asignación vacía devuelve acceso a todas las sucursales. |
| O02 | 04 | El logo se describía con «formato y tamaño admitidos», sin especificar sus límites ni distinguirlo de la foto de producto. |
| O03 | 05 | Se mencionaban campos CSV demasiado largos sin indicar el límite del parser. |
| O04 | 11 | El redondeo se describía de forma general, sin explicar el décimo inferior ni el caso de efectivo físico cero. |
| O05 | 12 | El PIN y su bloqueo se mencionaban sin longitud, duración ni administración de la credencial. |
| O06 | 15 | La explicación no detallaba que crear o firmar una nota referenciada 07/08 deja su efecto financiero pendiente hasta la aceptación fiscal. |
| O07 | 17 | RA y RC se describían por sus acciones, sin explicar que requieren la anulación y reversa comercial previas. |
| O08 | 32 | No se distinguía con precisión la activación propia de SIRE ni el ticket pendiente del resultado Terminado. |
| O09 | 15 | Faltaban tamaño y escala de impresión de la representación A4 del producto. |
| O10 | 33 | La renovación y finalización se mencionaban sin explicar sus diálogos ni la fecha que captura la finalización. |
| O11 | 34 | La explicación del contrato vigente podía interpretarse como prorrateo de varios contratos o cálculo general de empleados inactivos. |
| O12 | 21 | No se explicaba que el nuevo valor activo por defecto no repara ni reclasifica movimientos bancarios históricos. |
| O13 | 33 | Se listaban los estados de candidatos sin dar una secuencia área–vacante–candidato ni explicar la relación con el alta laboral. |

## O01 · Qué ocurre al quitar todas las sucursales asignadas

Un usuario sin sucursales asignadas alcanza todas las sucursales de su empresa, siempre dentro de sus permisos. La lista vacía no significa «ningún local». Asignar una o varias lo restringe a esas; retirar todas las asignaciones restituye el alcance total.

Antes de confirmar un cambio, revise si pretende restringir al usuario o devolverle alcance central. Compruebe el resultado con su cuenta. Si falla el reemplazo de asignaciones, debe conservarse el alcance anterior; no interprete el fallo como una restricción ya aplicada.

Fuentes verificadas: `apps/erp-api/src/modules/sucursales/sucursales.service.ts`.

## O02 · Límites del logo empresarial

El logo admite PNG o JPEG de hasta **2 MiB**, con un máximo de **4.096 píxeles por dimensión** y **16.000.000 de píxeles en total**. Debe cumplir todos los límites; un archivo pequeño en bytes puede exceder el máximo de resolución. Cambiar la extensión no convierte su contenido en una imagen válida.

Estos límites son distintos de los de la fotografía de producto, que admite también WebP en su flujo de inventario. Si la carga del logo se rechaza, corrija el archivo y vuelva a cargarlo desde Configuración. No lo sustituya por una dirección web arbitraria ni pegue una imagen codificada en los campos de empresa. El logo es opcional y no acredita habilitación fiscal.

Fuentes verificadas: `apps/erp-api/src/modules/configuracion/company-logo.service.ts`.

## O03 · Límite de longitud por campo CSV

Cada campo del CSV admite como máximo **4.096 caracteres**. El límite se aplica a una celda, no al registro completo, y es independiente del tamaño máximo de archivo. Un campo que lo excede se rechaza; no se recorta automáticamente para importar una versión incompleta del dato.

Si el error afecta una descripción o dirección extensa, revise el contenido y prepare una corrección consciente. No divida una celda mediante comas sin conservar el formato CSV, porque desplazaría las columnas restantes. Mantenga la identificación del registro para verificar luego la fila corregida.

Fuentes verificadas: `apps/erp-api/src/modules/migration/util/csv-parser.util.ts`.

## O04 · Interpretar el redondeo y el efectivo físico

En el contrato peruano documentado, una venta en PEN pagada íntegramente en efectivo puede redondear a favor del consumidor al **décimo inferior**. El ajuste de cada venta está entre **0,01 y 0,09**, cuando corresponde; el importe documental y el efectivo físico siguen distinguiéndose. No se aplica a pagos mixtos, tarjeta, otras monedas ni otros países.

**Ejemplo del flujo:** un ticket de 0,52 puede representar 0,50 de efectivo físico y 0,02 de ajuste documentado. Un total inferior a 0,10 puede llegar a 0,00 de efectivo físico sin borrar la venta ni su importe documental. Consulte el ajuste registrado por el producto; no lo escriba como descuento o pago inventado. Varias ventas pueden acumular más de 0,09 de redondeo durante una sesión.

Fuentes verificadas: `supabase/migrations/518__redondeo_legal_del_efectivo_en_cierre_de_caja.sql`, `apps/erp-api/src/modules/cajas/cash-rounding.util.ts`.

## O05 · PIN de supervisor y diferencia del cierre

El PIN de supervisor contiene exactamente **seis dígitos**. Su alta o rotación se realiza desde Gestión de Cajas con el permiso administrativo de gestión de usuarios. El PIN no se consulta después como un dato visible ni se escribe en la observación del corte.

**Cinco fallos** bloquean la credencial durante **quince minutos**. Mientras el bloqueo esté vigente, el supervisor no aparece como elegible; al vencer vuelve a ser elegible si conserva las demás condiciones. El supervisor debe ser distinto tanto del actor que ejecuta el cierre como del cajero responsable. Incluso una selección de supervisor aparentemente innecesaria debe ser válida.

Un faltante pequeño no se convierte automáticamente en redondeo. La excepción requiere que la diferencia negativa coincida con los ajustes de efectivo documentados. Un sobrante o un faltante sin esa evidencia conserva el control de autorización que corresponda.

Fuentes verificadas: `apps/erp-api/src/modules/cajas/dto/supervisor-pin.dto.ts`, `supabase/migrations/497__demo_pos_canonical_writer_and_supervisor_pin.sql`.

## O06 · Cuándo una nota fiscal referenciada afecta la deuda

Para las notas peruanas referenciadas **07/08** creadas por el flujo de notas del Centro CPE, crear o firmar conserva el efecto financiero en **pendiente de aceptación fiscal**. Esas etapas no modifican por sí solas la CxC, el saldo a favor ni la contabilidad. La aplicación requiere que la nota y su documento origen estén aceptados y exista la evidencia CDR exigida; el efecto se registra una sola vez. Un rechazo o reintento técnico no anticipa ese efecto.

Antes de dar una deuda por reducida, consulte el estado financiero de esa nota y el historial de la obligación. No registre un cobro, crédito o asiento paralelo para sustituir una aceptación que todavía falta. Distinga este flujo fiscal del cierre interno de una devolución RMA descrito en el capítulo 10: cada uno tiene su propio resultado y referencias; no traslade automáticamente el estado de uno al otro.

Fuentes verificadas: `supabase/migrations/494__referenced_notes_fiscal_acceptance_gate.sql`, `apps/erp-api/src/modules/cpe/referenced-notes.service.ts`.

## O07 · Requisitos de selección para RA y RC

La **RA de facturas** y la **RC con operación de baja de boletas** trabajan sobre comprobantes elegibles que el flujo previo dejó anulados, con su reversa comercial confirmada. No son el botón para anular por primera vez una venta vigente ni un mecanismo para borrar deuda, stock o ingreso.

Si el documento no aparece en la selección, revise tipo, empresa, estado y evidencia de la anulación de origen. No cree un lote manual alternativo para eludir la elegibilidad. Crear o firmar el lote tampoco equivale a su aceptación: revise envío, ticket y resultado con CDR. Un resultado terminal se recupera sobre el mismo lote, sin producir otra reversa comercial.

Fuentes verificadas: `apps/erp-api/src/modules/cpe/comunicacion-baja.service.ts`.

## O08 · Activación SIRE, ticket y finalización

GRE y SIRE pueden compartir credenciales de API SUNAT, pero **activar o configurar GRE no activa por sí solo SIRE**. La aceptación de una propuesta oficial exige la activación SIRE y las condiciones reales del contribuyente y entorno autorizado. Una demo o una comparación local no acreditan una aceptación oficial.

Recibir un número de ticket deja el reporte **pendiente**. Consulte ese ticket hasta que la respuesta oficial y su persistencia confirmen el resultado; el código **06, Terminado**, es el que permite reconocer la finalización del trabajo correspondiente. No lo deduzca de una descarga disponible ni de una respuesta HTTP exitosa. La generación final del registro continúa en SUNAT Operaciones en Línea. Si falla la consulta, conserve ticket e intención y recupere la misma operación.

Fuentes verificadas: `apps/erp-api/src/modules/sire/sire.service.ts`, `supabase/migrations/463__gre_sire_atomic_lifecycle.sql`.

## O09 · Imprimir el PDF fiscal sin alterar su escala

La representación PDF del ERP utiliza **A4, 210 × 297 mm**. Para imprimir ese archivo seleccione papel A4 y escala **100 %**, sin la opción «ajustar a página». Revise todas sus páginas y compruebe que líneas, totales y QR permanezcan completos y legibles. Esta es la salida física elegida por el producto; no significa que la autoridad imponga ese formato único de papel.

Use el PDF generado por el backend como representación del comprobante y la vista HTML para revisarlo cuando el visor nativo no esté disponible. Una impresión cortada exige corregir la salida o reimprimir el archivo correcto, no emitir otro comprobante. La impresión no cambia el estado fiscal ni fabrica una aceptación.

Fuentes verificadas: `apps/erp-api/src/modules/cpe/pdf-generator.service.ts`.

## O10 · Renovar y finalizar un contrato desde su listado

Para renovar, abra la acción **Renovar Contrato**, indique los meses admitidos y confirme. Después recargue y revise la vigencia del contrato resultante y su historia. La selección de contrato para planilla utiliza sus fechas; no presuponga que una renovación futura reemplazó el sueldo de meses anteriores.

Para finalizar, abra **Finalizar Contrato**, indique el motivo y confirme. En la interfaz documentada esa acción captura **el día actual del navegador** como fecha de finalización; el diálogo no ofrece un selector para elegir otra fecha. Compruebe fecha y zona del equipo antes de confirmar. Si necesita tratar una fecha distinta, resuelva el caso por el procedimiento autorizado; no use este diálogo suponiendo que está registrando un cese retroactivo elegido.

Un error conserva la situación sin una confirmación válida de cambio. Recuperar la misma solicitud y revisar el contrato evita interpretar la desaparición de un diálogo como renovación o finalización aplicada.

Fuentes verificadas: `apps/web/app/dashboard/rrhh/contratos/page.tsx`, `apps/erp-api/src/modules/rrhh/planillas.service.ts`.

## O11 · Límites de selección contractual y empleados inactivos

Para la planilla peruana del período, se consideran contratos vigentes que intersectan ese mes. Si hay varios elegibles, la selección prioriza el de fecha de inicio más reciente. Esta selección **no implementa un prorrateo de varios contratos dentro del mes**. No prepare un pago suponiendo que la existencia de dos contratos ya repartió automáticamente los días e importes entre ambos.

La conservación del historial de un empleado inactivo en los reportes tampoco significa que una planilla nueva lo incorpore automáticamente para recalcular sus meses históricos. Revise elegibilidad, estado, período y resultado explícito del proceso. Una renovación futura o una ficha visible no sustituyen esas comprobaciones.

Fuentes verificadas: `apps/erp-api/src/modules/rrhh/planillas.service.ts`.

## O12 · Estado de movimientos bancarios históricos

El candidato documentado utiliza activo como valor predeterminado para nuevos movimientos bancarios cuando la operación no declara otro estado. **Eso no reactiva ni reclasifica movimientos históricos inactivos** y tampoco cambia un registro marcado explícitamente inactivo.

Si un movimiento antiguo no participa en una consulta o conciliación, revise su estado y evidencia de origen antes de atribuirle un saldo o darlo por reparado. Un estado histórico puede reflejar una decisión válida o una condición anterior que necesita investigación. La actualización del producto no permite distinguir ambas por sí sola. Cualquier regularización debe seguir su procedimiento autorizado y conservar la historia; no se documenta como un efecto automático de esta versión.

Fuentes verificadas: `supabase/migrations/577__bank_movement_default_active.sql`.

## O13 · Desde el área y la vacante hasta el candidato

Prepare primero el área que utilizará la vacante y compruebe que su alta esté confirmada. Registre la vacante con sus datos y revise que aparezca en el catálogo antes de asignarla a un candidato. Después cree la ficha del candidato, mantenga los años de experiencia y el estado civil opcional que se hayan declarado y registre el estado de selección que corresponda.

Al editar, verifique después de recargar que la vacante y los datos personales persistieron. Una consulta fallida del catálogo no equivale a no tener vacantes disponibles. Pasar al estado de entrevista, seleccionado o contratado no sustituye por sí mismo la creación y revisión del empleado y de su contrato para calcular remuneraciones.

Fuentes verificadas: `apps/web/app/dashboard/rrhh/candidatos/page.tsx`.

Los hashes y las correspondencias de esta revisión se conservan en `omission-review.json`. Esta revisión dirigida no demuestra la inexistencia de cualquier otra omisión futura.
