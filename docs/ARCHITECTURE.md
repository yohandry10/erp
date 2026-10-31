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
imágenes Docker. Para `node-forge@1.4.0`, el parche reproduce el cambio de
`digitalbazaar/forge#1152` contra GHSA-86w9-cpqp-85rv. Para `braces@3.0.3`,
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

Migración desde FOX (580): sustitución con fecha de corte, no convivencia. FOX
no expone una API transaccional y mantener ambos sistemas exigiría definir
dueño por dato, dirección de intercambio y resolución de conflictos sobre
saldos que cambian a diario. Se migran saldos abiertos por los writers vigentes
(contratos 570 e inventario) y la historia queda consultable en FOX. Cada
registro de origen se enlaza a su par del ERP con la huella de su contenido;
un reintento idéntico no duplica y un cambio en el origen se rechaza. El
ensayo completo corre en la base y se revierte, de modo que puede repetirse
sin escribir.

La 582 completa la sustitución en dos capas:

- Archivo íntegro: un lote inmutable por extracto, que cierra sólo si lo
  cargado coincide con lo leído, para que nada del FOX se pierda aunque no
  tenga equivalente operativo. Es consulta pura y sin efectos; las credenciales
  se redactan antes de cargar porque el archivo lo leen auditoría y gerencia.
- Migración operativa: entra sólo por los writers vigentes, y el ERP adopta lo
  que ya tiene antes de crear. Nunca adivina: un código ambiguo o dos registros
  FOX sobre un mismo registro del ERP son errores del registro.

Reglas de cada saldo migrado:

- Bancos: el saldo de apertura es un movimiento migrado sin asiento, porque la
  contabilidad llega en el balance de apertura. Lleva su valor en moneda local
  y se cruza por cuenta contable con ese asiento.
- Pedidos de venta: se crean con el writer base y no con el comercial, para
  conservar el precio pactado en FOX.
- OC de compra: llegan en borrador para respetar la segregación de
  aprobación.

## Reglas para cambios arquitectónicos

1. Buscar primero el contrato existente en código y pruebas.
2. Mantener una sola fuente de verdad por concepto.
3. No introducir escrituras paralelas a un ledger o agregado.
4. No crear dependencias desde dominio hacia UI o infraestructura concreta.
5. Añadir pruebas de contrato cuando se modifiquen límites de módulos.
6. Actualizar este documento sólo si cambia un invariante estable.
