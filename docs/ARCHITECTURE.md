# Arquitectura y seguridad

## Vista general

El ERP es un monorepo TypeScript con estas unidades desplegables:

| Unidad         | Responsabilidad                                    |
| -------------- | -------------------------------------------------- |
| `apps/web`     | Next.js 15, UI web y cliente Tauri                 |
| `apps/erp-api` | API NestJS y reglas de negocio                     |
| `apps/worker`  | Jobs asíncronos, colas e integraciones             |
| `libs/*`       | DTO, criptografía y contratos compartidos          |
| `supabase`     | PostgreSQL, migraciones, RLS, RPC y almacenamiento |

Dependencias principales:

```text
Web/Tauri -> API -> Supabase/PostgreSQL
                 -> Redis/BullMQ -> Worker
API/Worker -> servicios fiscales y externos
Web/API/Worker -> libs compartidas
```

El dominio no debe depender de componentes UI ni de detalles del cliente
Supabase. Las operaciones que requieren atomicidad viven en RPC SQL o en una
transacción explícita.

## Multi-tenant y datos

- Toda entidad empresarial pertenece a un `tenant_id`, salvo catálogos globales
  explícitos.
- RLS debe permanecer habilitado y forzado en tablas expuestas.
- Los embeds y relaciones PostgREST deben conservar consistencia tenant.
- Funciones `SECURITY DEFINER` fijan `search_path`, revocan ejecución pública y
  conceden sólo los roles necesarios.
- El backend con service role siempre aplica el tenant de la sesión; nunca acepta
  un tenant arbitrario del body.

El único proyecto remoto operativo es PROD: `wypnbcptofqdmoynlonq`. El esquema
de entorno y el build del frontend rechazan cualquier otro project ref —también
bajo `NODE_ENV=test`, que es el único modo en el que el resto de reglas se
relajan—. Es una lista blanca de un solo proyecto, no una lista de prohibidos:
protege igual de un entorno que ya no existe que de uno que aparezca mañana. Las
pruebas con escritura sólo pueden usar dobles o una infraestructura local efímera
sin datos de clientes.

## Autenticación y autorización

- Web mantiene sesión mediante cookie HttpOnly.
- Las consultas de perfil comparten un vuelo sólo dentro de la misma revisión
  de sesión. Login, instalación de sesión y logout invalidan el vuelo anterior;
  un perfil tardío, incluso 401, no reinstala ni elimina la identidad nueva.
  La regresión determinista está en `tests/auth/verify-session-profile-races.mjs`.
- El login mantiene sus controles deshabilitados hasta hidratar y resolver la
  sesión inicial. Así no pierde valores escritos antes de activar los handlers.
  La confirmación y el efecto de sesión comparten una única redirección completa,
  conservando el reenvío de la cookie sin interrumpir la siguiente navegación.
- Cerrar sesión desde el menú usa AuthContext para limpiar identidad y permisos,
  y navega completamente a login. Así una ruta precargada o un contexto React
  anterior no redirige al dashboard ni interrumpe el acceso de otra cuenta.
  El recorrido principal→empresa2→principal se repitió en el mismo navegador,
  con auditoría y notificaciones aisladas y sin borrar cookies manualmente.
- Tauri usa Bearer local cifrado; no se persiste en claro.
- Las rutas públicas del paquete estático restauran ese almacén y confirman el
  perfil. No aplican el atajo del middleware web ni borran la identidad compartida
  mientras otra ventana nativa tiene una sesión válida; revocada o ausente sigue
  sin autenticar al usuario.
- Los passwords, JWT, service-role keys y headers de autorización no entran en
  localStorage, sessionStorage, logs ni outbox.
- Los controllers aplican autenticación, tenant actual y permisos por recurso.
- La matriz exacta de permisos se deriva de decorators, guards y pruebas; no se
  mantiene una segunda tabla manual en documentación.
- Los endpoints públicos son excepciones explícitas, limitadas y protegidas con
  rate limiting cuando corresponde.
- Las rutas con `AuthRateLimitGuard` usan sus límites por cuenta+IP (cinco
  intentos/minuto en login) y por oficina (veinte). El guard global delega sólo
  cuando ese guard está declarado; así no colapsa cuentas distintas en el
  límite estricto de una sola cuenta. Las demás rutas conservan el límite global.
- El JWT se contrasta con identidad, sesión revocable, contexto empresarial y
  privilegio de superadministrador vigentes; una sesión válida de otro usuario
  o contexto no autentica el token. El cambio de empresa crea sesión y auditoría
  en `cambiar_contexto_sesion_auth_tx`, sin modificar la pertenencia original del
  usuario. El destino vive en metadatos escritos por el RPC; la renovación y la
  validación del token conservan ese destino. La UI instala la nueva sesión antes
  de recargar y vacía sus consultas de la empresa anterior.
  Un administrador global sin empresa propia mantiene sesión revocable con
  pertenencia nula; sólo el writer de cambio asigna su contexto operativo.
  Usuarios ordinarios sin empresa y privilegios globales retirados fallan cerrados.
  En Tauri, instalar una sesión espera la escritura en el almacén seguro antes
  de permitir la recarga; un fallo de persistencia se comunica al operador.
- El selector de auditoría consulta `audit-logs/actors` con
  `security.audit.read`: sólo recibe identificador, nombre y correo de usuarios
  de la empresa actual, incluidos los históricos inactivos. No exige administrar
  usuarios ni concede ese permiso a un auditor.

## Fiscal

Los parches de dependencias sin versión publicada viven en `patches/` y se
instalan mediante `pnpm.patchedDependencies` en desarrollo, CI y las tres
imágenes Docker. `node-forge` 1.4.2 ya publica la corrección de GHSA-86w9-cpqp-85rv:
no lleva parche, pero el gate sigue comprobando sobre la copia instalada que rechaza
la firma falsificada. Para `braces@3.0.3`,
GHSA-vfj7-8cjw-p6xm se corrige limitando a 128 la profundidad del parser y los
tres recorridos recursivos, incluidos los AST entregados directamente.
`scripts/ci/audit-dependencies.mjs` conserva los avisos del registro, verifica
SHA-256 normalizados a LF y regresiones de todas las copias instaladas antes de
considerar mitigados esos dos identificadores y versiones exactos. Cualquier
otro aviso alto o crítico falla. Estos parches deben retirarse al adoptar
versiones oficiales corregidas; no equivalen a un audit del registro con cero
hallazgos.

- El país operativo se resuelve desde `empresa_config.pais_id`; los catálogos,
  moneda, identificación, tasa y autoridad fiscal nunca se infieren desde la
  ubicación del navegador.
- Perú soporta factura `01`, boleta `03`, nota de crédito `07` y nota de débito
  `08`, además de RA, RC, GRE y SIRE.
- La fachada CPE delega construcción UBL, firma, transporte, cancelación,
  reportes y sincronización con Documentos.
- El UBL 2.1 incluye totales legales, afectación tributaria por línea, firma y
  datos SUNAT.
- SUNAT directo usa WS-Security UsernameToken, sin HTTP Basic para hosts
  `*.sunat.gob.pe`. Usuario, clave SOL y referencias se codifican como texto XML
  en envíos y consultas para preservar caracteres especiales sin romper SOAP.
- Producción valida el RUC del certificado antes de firmar o enviar. La firma
  comprueba su vigencia al cargar el PFX y en cada operación; un certificado
  vencido o todavía no vigente nunca se sustituye por una firma demo.
- SUNAT SOAP, GRE REST y OSE API comparten el lector del CDR. Sólo un ZIP
  íntegro, acotado a 5 MiB descomprimidos, con un único ApplicationResponse y
  `DocumentResponse/Response/ResponseCode` igual a `0` acredita aceptación.
  HTTP 200, un mensaje favorable, un ticket o un base64 ilegible no bastan.
  Una respuesta incompleta queda como error técnico consultable, sin inventar
  aceptación ni rechazo definitivo. OSE API exige CDR ZIP base64, tiene timeout
  de 120 segundos y no sigue redirecciones con credenciales.
- Argentina usa CUIT/ARS/IVA y el adaptador ARCA: firma CMS del TRA para WSAA,
  autorización secuencial y consulta por WSFEv1, CAE y QR. Los códigos WSFE de
  Facturas A/B/C/E/M y sus notas viven en catálogos por país.
- El aprovisionamiento automático de demos y QA remoto está deshabilitado. No se
  crean tenants sintéticos en PROD ni se simulan transportes fiscales allí.
- GRE puede usar Plataforma Nueva REST; un ticket de envío no equivale a CDR
  aceptado.
- Los rechazos, timeouts y estados asíncronos se registran sin declarar éxito
  prematuro.

## Inventario y transacciones

- `producto_existencias` conserva el saldo físico por almacén.
- `productos.stock_*` y proyecciones por sucursal son derivados.
- `aplicar_movimiento_inventario_tx` centraliza entradas, salidas, reservas y
  liberaciones.
- POS obtiene almacén desde la caja abierta.
- `cerrar_recepcion_tx` y `reservar_pedido_stock_tx` son primitivas canónicas.
- Idempotency keys y locks evitan duplicar ventas, recepción, reservas y jobs.

## Contabilidad

Los endpoints se distribuyen por recurso: períodos, presupuestos, centros de
costo, estados financieros, asientos, libros y eventos. Los controladores
orquestan; servicios y generadores contienen reglas. Todo asiento debe:

- pertenecer al tenant correcto;
- cuadrar debe/haber;
- enlazar su evento o referencia de negocio;
- respetar período y estado contable;
- poder auditarse desde el documento origen.

## Desktop y offline

- Tauri2 se reconoce por `__TAURI_INTERNALS__`; login espera la persistencia
  del token en el almacén seguro antes de notificar la sesión y navegar.
  Las consultas iniciales esperan una restauración compartida del token antes
  de enviar headers, sin consultar el perfil por cada petición. Logout o login
  nuevos descartan una lectura protegida anterior que llegue tarde.
- Las proyecciones, snapshots, binarios y cola nativos usan un archivo SQLite
  por empresa/usuario, identificado por hash de ambos. No importan lecturas del
  archivo compartido anterior. Las operaciones legacy sólo se consultan y
  modifican cuando coinciden sus dos propietarios; se conservan en su archivo.
- La outbox es durable, idempotente y no guarda secretos.
- El bus registra el tipo y la entrega del evento sin volcar el payload:
  documentos, datos personales y remuneraciones permanecen fuera de esos logs.
- La cachéHTTP del navegador y sus snapshots exigen empresa y usuario de la
  sesión. Escritura, reemplazo y fallback usan ambos identificadores; sin ellos
  no almacenan ni entregan contenido. Las entradas antiguas sin usuario quedan
  inaccesibles y se recuperan mediante una lectura autorizada nueva. Un lector
  con403 no puede recibir respuestas guardadas por otro actor de su empresa
  cuando falla la red. Login nuevo y rechazos401/403 invalidan la cachéHTTP del
  actor; no borran la cola de operaciones ni las respuestas de otros usuarios.
  Una revisión de autorización por actor descarta consultas iniciadas antes de
  esa invalidación: una respuesta tardía no puede repoblar la caché ni entregarse
  como lectura vigente. El listado de clientes descarta respuestas anteriores
  y retira filas y métricas cuando falla la consulta, incluido un403 real tras
  cambiar el rol del mismo usuario en otra sesión.
  SQLite aplica una revisión de autorización por actor. Login y401/403 eliminan
  snapshots/binarios y cambian la revisión en una transacción que conserva la
  cola. Una respuesta vieja no puede autorizar ni hidratar de nuevo las lecturas.
  Las proyecciones retenidas requieren un snapshot autorizado de la sesión
  vigente para servir como fallback. UI nativa de clientes verificó rechazo,
  respuesta tardía, recarga y conservación de pendientes; otros catálogos y
  binarios no reciben aceptación funcional por ese caso.
- Las escrituras offline se sincronizan con contratos explícitos.
- Firma y envío del Centro de Documentos exigen confirmación en vivo, igual
  que su writer fiscal canónico. No entran en la cola genérica por las rutas
  `documentos/:id/generar-xml` o `enviar-sunat`. Los originales legacy se
  conservan con su empresa/actor y cuerpo/clave para revisión manual; leer o
  sincronizar la cola no autoriza reenviarlos. Los borradores conservan su
  contrato no fiscal.
- La cola del navegador también exige empresa y usuario de sesión para listar,
  contar, sincronizar, cambiar estado o eliminar. Los pendientes de otros actores
  y los legacy sin propietario se conservan sin exponerse. La sincronización
  captura al dueño antes de leer su cola y mappings; persiste el ACK o fallo de
  la solicitud ya enviada en ese mismo scope y detiene el siguiente envío si
  cambia el actor o su revisión de autorización. Estas carreras se verificaron
  técnicamente; el aislamiento del pendiente se repitió desdeUI en navegador.
- Edición nativa de cliente y su cola se confirman localmente en una transacción
  y responden202 pendiente. La sincronización mantiene metadatos en headers y
  excluye del DTO de transporte los campos locales generados de cliente,
  conservando el cuerpo durable para recuperar intenciones anteriores.
- Los correlativos fiscales locales no sustituyen la validación del backend.
- El runtime no habilita shell arbitrario.
- El frontend de escritorio se exporta como archivos estáticos. Las ventanas
  se crean desde su configuración con un hook de recursos nativos que resuelve
  sólo plantillas de negocio exportadas. Sustituye el segmento de ID en HTML/RSC,
  sin consultar archivos arbitrarios, y conserva la CSP actualizando el hash del
  script cuyo contenido cambia. Navegación y recarga con IDs reales se comprobaron
  en clientes, RMA y el guard de edición de asiento inmutable en Windows.

## Frontend

- La edición posterior al onboarding de datos básicos de empresa usa el writer
  atómico existente y `configuracion.write`. Sólo envía los campos modificados.
  La clave de intención se conserva por empresa/actor para reintentar el mismo
  payload; sessionStorage guarda únicamente su huella eID, sin campos ni secretos.
  El asistente completado se ofrece para consulta. Certificado, país/RUC y
  parámetros fiscales conservan sus flujos propios.

- Stack visual: Tailwind CSS 3.4 + shadcn/ui/Radix.
- El layout de dashboard es propietario del único landmark `main`. `PageShell`
  usa `div` por defecto para no anidarlo; el dashboard de superadmin, cuyo
  layout carece de `main`, lo solicita explícitamente mediante `as="main"`.
- `globals.css` contiene únicamente Tailwind, tokens y base.
- El tema vive en `<html>` y usa tokens semánticos.
- Dialog y AlertDialog usan primitivas accesibles, no overlays manuales.
- No se aceptan hojas de compatibilidad para clases legacy ni colores puente.
- El POS de escritorio conserva dos zonas persistentes: catálogo y venta activa.
- Menús, documento fiscal, impuesto, moneda y formato regional derivan del
  contexto del tenant; la clave de caché incluye `tenant_id` para impedir
  reutilización cruzada entre sesiones PE y AR.

## Integraciones y observabilidad

`configuracion.empresa.actualizada` es una constancia sin suscriptor: el RPC
464 ya confirma empresa, tenant y auditoría en una transacción. El worker
cierra su claim sin repetir escrituras; las integraciones desconocidas
conservan el fallo cerrado por falta de handler.

- Redis/BullMQ coordina jobs, locks y reintentos.
- Logs estructurados incluyen correlación y tenant sin exponer secretos.
- Health checks distinguen proceso vivo, disponibilidad y dependencias.
- Métricas y auditoría no deben alterar el flujo de negocio.
- Integraciones externas usan adaptadores y fallan cerrado en operaciones
  fiscales o financieras.

Migración desde otro sistema (580): sustitución con fecha de corte, no convivencia. Un
sistema anterior no tiene por qué exponer una API transaccional y mantener ambos exigiría definir
dueño por dato, dirección de intercambio y resolución de conflictos sobre
saldos que cambian a diario. Se migran saldos abiertos por los writers vigentes
(contratos 570 e inventario) y la historia queda consultable en el sistema anterior. Cada
registro de origen se enlaza a su par del ERP con la huella de su contenido;
un reintento idéntico no duplica y un cambio en el origen se rechaza. El
ensayo completo corre en la base y se revierte, de modo que puede repetirse
sin escribir. El proceso no conoce ningún sistema en particular: el origen es un
dato que acompaña a cada migración, los registros de dos orígenes no se pisan y lo
propio de cada sistema queda en un mapeo fuera del código.

La 582 completa la sustitución en dos capas:

- Archivo íntegro: un lote inmutable por extracto, que cierra sólo si lo
  cargado coincide con lo leído, para que nada del sistema anterior se pierda aunque no
  tenga equivalente operativo. Es consulta pura y sin efectos; las credenciales
  se redactan antes de cargar porque el archivo lo leen auditoría y gerencia.
- Migración operativa: entra sólo por los writers vigentes, y el ERP adopta lo
  que ya tiene antes de crear. Nunca adivina: un código ambiguo o dos registros
  de origen sobre un mismo registro del ERP son errores del registro.

Reglas de cada saldo migrado:

- Bancos: el saldo de apertura es un movimiento migrado sin asiento, porque la
  contabilidad llega en el balance de apertura. Lleva su valor en moneda local
  y se cruza por cuenta contable con ese asiento.
- Pedidos de venta: se crean con el writer base y no con el comercial, para
  conservar el precio pactado en el sistema anterior.
- OC de compra: llegan en borrador para respetar la segregación de
  aprobación.

## Decisiones e invariantes vigentes

- **Convertir la zona horaria de una fecha pura la retrasa un día.** `new
  Date('2026-08-28')` es medianoche UTC, que en Lima son las 19:00 del 27.
  `cpe.fecha_emision` se guarda como fecha pura, así que el listado de
  comprobantes mostraba 2026-08-27 para una boleta cuyo XML declaraba
  2026-08-28. La conversión no se puede quitar sin más —se introdujo por el
  problema contrario, un comprobante emitido a las 20:15 de Lima salía fechado
  al día siguiente—, hay que distinguir la fecha del instante:
  `fechaDeDocumentoEnPais` devuelve tal cual lo que ya es una fecha y sólo
  convierte lo que es un instante. **La columna es `timestamptz`**, así que
  PostgREST la serializa como `2026-08-28T00:00:00+00:00`: hay que aceptar
  también esa forma. El primer intento sólo cubría la fecha pelada y el listado
  siguió restando un día hasta que se comprobó de punta a punta contra el XML.
  Medianoche **en UTC** es como Postgres guarda aquí una fecha pura; medianoche
  en otro huso sí es un instante y se convierte. El XML y la vista A4 nunca estuvieron afectados:
  la A4 formatea por texto, sin `new Date`.
- **La semilla de demo es el único escritor que no declara la afectación.**
  `demo_business_seed_v1` (migración 519) escribe `documento_detalles` sin
  `afectacion_igv` en el metadata, igual que hacía el POS antes de la 521. Hoy
  es inofensivo porque **todas sus líneas son gravadas** —67 en producción, 0
  sin IGV—, así que el respaldo `igv > 0 ? '10' : '20'` acierta. Dejaría de
  serlo en cuanto la semilla incluya un producto exonerado, inafecto o de
  exportación: una nota de crédito sobre esa factura demo lo declararía como
  exonerado. Sólo afecta a contribuyentes de demostración.
- **El detalle del documento guarda su afectación (migración 521).**
  `crear_nota_referenciada_legacy_494` clasifica cada línea de una nota leyendo
  `documento_detalles.metadata->>'afectacion_igv'`, y el camino del POS
  (migración 476) **no la escribía ahí** —sólo `source` y el fingerprint; la
  afectación vivía en `cpe.items`—, así que siempre disparaba su respaldo
  `igv > 0 ? '10' : '20'`. Lo gravado y lo exonerado salían bien por
  casualidad; **inafecto (30) y exportación (40) también tienen IGV cero**, de
  modo que una nota sobre una venta con esos ítems los declaraba exonerados
  (9997/E en vez de 9998/O o 9995). La 521 recrea `finalizar_cpe_pos_tx`
  literal con un único cambio —el `jsonb_build_object` del metadata— y rellena
  lo ya emitido desde `cpe.items`. El emparejamiento del relleno tiene que
  mirar las dos claves de código: la 476 escribe `codigo_producto` y la RPC de
  venta del POS (451) escribe `codigo`; con una sola se quedaban sin rellenar
  justamente las boletas del POS.

- **El resumen del comprobante declara todas las bases, y se construye desde
  `ESQUEMA_TRIBUTARIO`.** Los códigos de SUNAT (1000 IGV, 9997 EXO, 9998 INA,
  9995 EXP) estaban escritos a mano en tres sitios del generador de XML, y eso
  produjo dos huecos del mismo tipo: (a) la rama de **notas de crédito y débito**
  emitía un único `TaxSubtotal` fijo en categoría `S` y ponía en
  `LineExtensionAmount` sólo `total_gravadas`, de modo que una nota sobre un
  comprobante con operaciones exoneradas declaraba 100,00 donde sus líneas
  sumaban 200,00 —descuadre que SUNAT rechaza— y hacía desaparecer la base
  exonerada; (b) la **exportación** entraba en `totalBaseImponible` y se
  clasificaba bien en cada línea, pero ningún `TaxSubtotal` la declaraba. En los
  dos casos las líneas estaban bien, que es lo que los hacía difíciles de ver.
  Ahora las dos ramas usan `buildTaxSubtotalsXml` y `totalBaseImponible`, y esos
  recorren el catálogo en vez de repetir los códigos.
- **Los importes del XML son siempre positivos.** Una nota de crédito llega con
  los totales en negativo; SUNAT no admite importes negativos, el signo lo lleva
  el tipo de documento. Las líneas ya lo normalizaban con `Math.abs` y la
  cabecera lo hacía con `formatAbsAmount`; al unificar las dos ramas hubo que
  llevar esa normalización a los ayudantes comunes (`baseAbsoluta`).

- **`TaxCalculatorService` también lee la del contribuyente.** La 522 unificó el
  lado SQL, pero el calculador de TypeScript seguía leyendo sólo
  `configuracion_fiscal`, y es el que usan cotizaciones, pedidos y la
  construcción del CPE desde un pedido. Ahora la tasa del contribuyente manda
  y `configuracion_fiscal` aporta el país, la moneda, el nombre del impuesto y
  la tasa por defecto. También cuando el llamante pasa `paisId` explícito, vía
  por la que se saltaba la consulta (hoy nadie lo pasa, pero era el mismo hueco
  latente).
- **`GET /api/configuracion-fiscal` tiene una rama muerta.** Devuelve
  directamente la fila de `configuracion_fiscal` del tenant si existe, saltándose
  el calculador. No existe: las 5 filas son globales (`tenant_id IS NULL`) y
  **nada en el código crea filas por tenant** —los únicos INSERT son las semillas
  por país—. Si algún día se crearan, esa rama volvería a introducir una segunda
  fuente para la tasa.
- **La tasa de impuesto tiene una sola fuente: `empresa_config.igv_porcentaje`
  (migración 522).** Había **tres** ramas leyéndola de sitios distintos: la RPC
  de venta del POS (451) de `empresa_config`; las cotizaciones y pedidos de
  venta (441) y toda la cadena de compras (439/440/444/453) de
  `app.tasa_impuesto_tenant`, que prefería `configuracion_fiscal` por país; y el
  navegador de una constante de `lib/initial-country`. Comprobado en producción
  el 2026-08-28 con un tenant al 10 %: ventas 10,00 y compras 18,00 en el mismo
  instante. Que discrepen es peor que cualquiera por separado, porque el crédito
  fiscal de las compras deja de cuadrar con el débito de las ventas y nadie
  denuncia el descuadre. La 522 invierte la preferencia de
  `app.tasa_impuesto_tenant`: primero la del contribuyente —con `IS NOT NULL`, no
  `coalesce`, porque **0 es una tasa** (Ley de Amazonía) y no un hueco— y
  `configuracion_fiscal` como valor por defecto del país. La migración y su
  verificador prueban que las ramas convergen y que 0 sigue siendo una tasa
  válida; la cifra histórica de «79 contribuyentes alineados» no cuenta como
  evidencia reproducible por sí sola y no debe usarse como garantía. El rango
  imposible no lo guarda ni la tabla
  (`ck_empresa_config_financial_runtime` acota a 0..100).
- **La tasa que se exhibe es la misma que se cobra.**
  La RPC de venta del POS siempre calculó con ella; el navegador usaba una
  constante por país en `lib/initial-country`. Mientras coincidieran no se
  notaba, y por defecto coinciden (PE 18, AR 21, CO 19). En cuanto no —el
  asistente inicial deja escribir el porcentaje y `PUT /configuration/empresa`
  deja cambiarlo— **el POS exhibía y cobraba un total y registraba otro**:
  comprobado en un tenant puesto al 10 %, el botón decía «Cobrar S/ 118,00», el
  cajero cobraba 118 y la venta quedaba grabada como «Subtotal 100,00 · IGV
  (18%) S/ 10,00 · TOTAL 110,00». La venta **no fallaba**: el guard
  `POS_ITEM_TAX_INVALID` de la RPC no protege de esto, porque el backend
  recalcula los ítems con la tasa del tenant antes de llamarla y entonces las
  dos cifras que compara ya coinciden. Ahora
  `/configuration/context/country` devuelve `igvPorcentaje` y
  `lib/tasa-impuesto` la impone sobre la constante, que queda sólo como
  respaldo. El rótulo se deriva de la misma tasa: antes un ticket podía decir
  «IGV (18%)» junto a un importe del 10 %.
- **`null` no es `0` al resolver la tasa.** `Number(null)` y `Number('')` valen
  `0`, así que un tenant sin tasa guardada habría exhibido 0 % mientras el
  servidor aplicaba el 18 % de su `coalesce`. `resolverTasaImpuesto` distingue
  «no hay dato» de un 0 escrito a propósito, que es legítimo (Ley de Amazonía).
  Lo cazó el verificador, no la revisión.

- **La tasa de IGV no se elige por producto; la afectación sí.** El porcentaje
  sale siempre de `empresas.igv_porcentaje` (el del asistente inicial), y qué
  productos lo pagan lo decide `productos.afectacion_igv` (Catálogo 07 de SUNAT).
  La columna `productos.impuesto` existe y se guarda, pero **ningún cálculo la
  lee**: ni la RPC de venta del POS, ni el ticket, ni el precio exhibido en el
  catálogo, ni la construcción del XML. Era un campo editable en el alta y la
  edición de producto, de modo que escribir `0` ahí parecía eximir al producto y
  no eximía de nada; ahora se muestra derivado y de sólo lectura. Los productos
  creados antes conservan el valor incoherente (un exonerado con `impuesto = 18`)
  y no se ha migrado a propósito: nadie lo lee, y tocar datos de producción por
  una columna inerte no compensa.

- **El padrón de RUC avisa, no impide, y `null` significa «no se pudo
  comprobar».** `PadronRucService` (migración 520, tabla global `padron_ruc`)
  consulta actualmente `api.apis.net.pe/v1/ruc` y conserva una caché local; no
  descarga ni consulta directamente el padrón reducido oficial de SUNAT. Por
  tanto, la UI debe presentarlo como una comprobación auxiliar y no como una
  certificación oficial de SUNAT. El servicio
  devuelve `null` tanto si la fuente no responde como si el RUC no aparece, y
  ninguno de los dos casos puede bloquear el alta de un proveedor: si la fuente
  se cae, el registro sigue. Cuando la fuente falla se devuelve el último dato
  conocido aunque haya envejecido, porque para avisar de una baja un dato de hace
  dos meses vale más que ninguno. La condición **NO HABIDO** se muestra en ámbar
  y deja continuar: un contador puede tener motivos para registrar a ese
  proveedor; lo que no puede es enterarse tres meses después, cuando el crédito
  fiscal ya se objetó.
- **El endpoint del padrón no lleva `@RequirePermission` a propósito.** Lo
  consultan compras, ventas y el asistente inicial, y no existe un permiso que
  tengan los tres: `contabilidad.tipos_cambio.crear` no lo tiene COMPRAS y
  `validations.run` sólo lo tienen ADMIN y ADMIN_DEMO. El dato es público y sólo
  se devuelve **el RUC que el usuario teclea**, nunca un listado, así que la
  sesión que ya exige el guard global es frontera suficiente.

- **Hay tablas que el rol del API no puede escribir directamente, y es
  deliberado.** `centros_costo`, `periodos_contables`, `tipos_cambio`,
  `financial_master_operations`, `outbox_events` y las de operaciones atómicas
  tienen el `INSERT/UPDATE/DELETE` revocado a `service_role` (migraciones `477`,
  `482` y siguientes): la única entrada es la función `SECURITY DEFINER`, que
  registra la operación, la hace idempotente y comprueba el autor. Un
  `permission denied` sobre una de ellas **no es un privilegio olvidado**: es el
  contrato funcionando. La respuesta correcta es llamar a la RPC, nunca ampliar
  el `GRANT`.
- **El autor de un maestro contable tiene que ser un usuario activo del propio
  contribuyente.** Lo exige `assert_financial_master_actor_477`, que rechaza
  nulos y centinelas. Un proceso desatendido no puede inventarse un autor: tiene
  que resolver una persona real —el contador, y si no lo hay el administrador— o
  no escribir.
- **Una función pública que el API llame tiene que declarar sus parámetros con
  nombre.** PostgREST no sabe llamar posicionalmente. Un verificador que la
  pruebe desde SQL no detecta el fallo, porque desde SQL sí funciona.
- **Un comprobante UBL lleva un `<cac:Signature>` que NO es una firma.** Es un
  metadato que el esquema de SUNAT exige. Cualquier comprobación que cuente
  firmas debe hacerlo por el espacio de nombres XMLDSig
  (`http://www.w3.org/2000/09/xmldsig#`), nunca por el nombre del elemento. Y
  una prueba de firma que use un XML mínimo sin ese bloque no prueba el caso
  real.
- **El tipo de cambio sale del BCRP** (series `PD04639PD` compra y `PD04640PD`
  venta, sistema bancario SBS, que es la que SUNAT republica). SUNAT no tiene
  API de tipo de cambio: lo único disponible es el endpoint interno de su página
  de consulta, que exige simular un navegador y enviar un token de captcha
  falso, y por eso se descartó. `apis.net.pe` queda de respaldo — daba la serie
  interbancaria en el lado de la compra, no la del sistema bancario.
- **Nombrar una clave ajena en un `select` de PostgREST es una dependencia contra
  el esquema.** `tabla!nombre_de_la_restriccion(...)` deja de funcionar si esa
  restricción se renombra o se retira, y como vive dentro de una cadena de texto
  no la ve el compilador ni el tipado. Los 35 nombres en uso están vigilados por
  el verificador `516` y por `nombres-clave-ajena.spec.ts`; al añadir uno nuevo
  hay que sumarlo a la lista o la prueba falla.
- **Una cuenta bancaria sin `cuenta_contable_id` no puede registrar movimientos.**
  Lo exige `assert_postable_account_457`, y la cuenta tiene que ser una corriente
  operativa (`1041`, o `104` donde exista): la `1042` es la de detracciones y
  lleva su propio saldo. El alta por API ya lo pide obligatorio; lo que fallaba
  era la siembra.
- `producto_existencias` es la fuente física de stock por almacén.
- `aplicar_movimiento_inventario_tx` es el writer canónico de movimientos.
- POS deriva `almacen_id` de la caja de la sesión.
- Series fiscales `Bxxx/Fxxx` comparten una sola secuencia por tenant; `Txxx` es
  ticket interno.
- Recepciones y reservas usan RPC transaccionales e idempotentes.
- CPE y GRE fallan cerrado ante firma, credenciales o respuesta inválidas.
- SIRE real sólo puede ejecutarse cuando `EXPECTED_SUPABASE_PROJECT_REF` apunta
  a PROD. Un ticket queda pendiente y sólo el estado SUNAT `06 Terminado` se
  presenta como propuesta aceptada; la generación final del libro sigue en SOL.
- El adaptador fiscal se resuelve por país: SUNAT para PE, ARCA WSAA/WSFEv1
  para AR y DIAN para CO; el modo demo colombiano es explícitamente simulado y
  el caché de contexto web incluye `tenant_id`.
- SUNAT producción exige que el certificado contenga el RUC esperado, salvo una
  excepción explícita y documentada.
- Web usa cookie HttpOnly; no se guardan JWT ni contraseñas en Web Storage.
- Tauri protege secretos locales con DPAPI. Las mutaciones de auth,
  configuración, conversión demo y material fiscal sensible requieren respuesta
  en vivo, nunca se encolan y purgan cualquier residuo legacy tanto de la outbox
  web como de SQLite Tauri.
- El frontend usa Tailwind 3.4, shadcn/Radix y tokens semánticos.
- `ADMIN_DEMO` puede crear usuarios y roles operativos dentro de su propio
  tenant para probar el sistema. `users.manage` no es delegable a roles custom,
  los permisos globales permanecen prohibidos y ningún writer alterno puede
  asignar `ADMIN_DEMO` sin la autorización administrativa real del actor.

## Reglas para cambios arquitectónicos

1. Buscar primero el contrato existente en código y pruebas.
2. Mantener una sola fuente de verdad por concepto.
3. No introducir escrituras paralelas a un ledger o agregado.
4. No crear dependencias desde dominio hacia UI o infraestructura concreta.
5. Añadir pruebas de contrato cuando se modifiquen límites de módulos.
6. Actualizar este documento sólo si cambia un invariante estable.
