# Guía técnica y operativa

Este punto de entrada conecta la documentación técnica del repositorio. No concede autorización para desplegar, restaurar o modificar producción.

## Responsables y fuentes canónicas

| Necesidad | Fuente incluida en el paquete |
|---|---|
| Estructura de aplicaciones, dependencias, autenticación y datos | [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) en el repositorio. |
| Flujos y decisiones funcionales vigentes | [docs/MODULES.md](../docs/MODULES.md). |
| Arranque, variables, DB, respaldo y observabilidad | [docs/OPERATIONS.md](../docs/OPERATIONS.md). |
| Gate, promoción, activación y rollback | [docs/RELEASE.md](../docs/RELEASE.md). |
| Corte actual y límites de la entrega | [docs/CURRENT_STATE.md](../docs/CURRENT_STATE.md). |
| Contrato y jerarquía de documentación | [docs/README.md](../docs/README.md). |

Dentro del repositorio, código y migraciones verificados prevalecen sobre un informe histórico. El manual describe la versión indicada en su portada; el estado de producción se consulta en `docs/CURRENT_STATE.md`.

## Cómo se ejecuta el producto

La interfaz Next.js y el cliente Tauri consumen la API NestJS. La API aplica identidad, sesión y permisos y accede a PostgreSQL/Supabase; las operaciones que requieren atomicidad utilizan sus fronteras transaccionales. Redis/BullMQ y el worker procesan trabajos asíncronos, entre ellos proyecciones e integraciones. Las bibliotecas compartidas contienen contratos y utilidades comunes.

No se debe diagnosticar una transacción mirando sólo un componente. Una venta puede estar confirmada y su evento contable necesitar recuperación. La respuesta de un worker debe contrastarse con la transición durable y el recurso empresarial, sin duplicar su escritura.

## Identidad, API y permisos

La sesión web usa cookie HttpOnly; el cliente Tauri conserva el Bearer mediante su almacenamiento seguro. El tenant procede del contexto autenticado y no se toma como autorización de un identificador arbitrario enviado por el usuario.

Para mantener una operación:

1. Localice su controller y ruta y revise autenticación, decorator de permisos y validación de entrada.
2. Siga el servicio y la RPC o transacción canónica.
3. Revise aislamiento, actor vigente, idempotencia y recibo de salida.
4. Contraste DTO, código SQL, pruebas existentes y consumidor UI antes de cambiar el contrato.
5. Actualice el documento canónico del dominio y seleccione las comprobaciones afectadas.

Las operaciones del API con su permiso están en [REFERENCIA_API_Y_PERMISOS.md](REFERENCIA_API_Y_PERMISOS.md), generada desde el código. El permiso declarado no es lo único que se exige.

**Alcance por sucursal:** un usuario sin asignaciones tiene alcance total dentro de su empresa. Si falla la lectura de sus asignaciones, el sistema registra el error y **continúa con alcance total**: es una decisión de diseño (`apps/erp-api/src/shared/tenant/sucursal-scope.service.ts`). La frontera entre empresas no depende de esto.

## Entorno y configuración

El único proyecto remoto permitido es PROD, `wypnbcptofqdmoynlonq`. No existe un remoto autorizado de QA o demo separado. Las pruebas con escritura usan dobles o infraestructura local efímera.

El runtime utiliza `.env.production` o secretos inyectados. `.env` y `.env.local` no son fuentes operativas. API y worker compilados usan Node 24; el worker requiere su configuración y readiness antes de iniciar consumidores. No arranque `pnpm dev` suponiendo que es el modo operativo permitido.

Antes de cualquier operación remota, lea el procedimiento canónico y ejecute el preflight prescrito. Un diagnóstico documental no debe obtener valores de secretos ni imprimir credenciales para comprobar que están presentes.

## Diagnóstico de un incidente

| Síntoma | Secuencia de diagnóstico |
|---|---|
| API no disponible | Distinguir proceso vivo de readiness; revisar versión y configuración sin registrar secretos. |
| Readiness fallido | Identificar DB, esquema requerido, Redis u outbox afectados; conservar error y no ocultarlo como éxito parcial. |
| Documento confirmado sin asiento visible | Revisar origen, evento, claim y resultado del worker; recuperar el evento autorizado, sin recrear el documento. |
| Pago con respuesta perdida | Consultar el original, deuda e historial y destino; no emitir otro pago de prueba. |
| Acceso denegado tras cambio de rol | Revisar sesión y permisos actuales; una caché anterior no restituye acceso. |
| Archivo fiscal o laboral incompleto | Revisar versión, fuente y generación; no guardar una respuesta de error con otra extensión. |
| Pendiente local dañado | Preservar perfil y evidencia; no borrar almacenamiento para desbloquear una transacción desconocida. |

Recoja identificador de recurso, correlación cuando exista, versión, momento y último resultado confirmado. Registre por separado una consulta de soporte y cualquier corrección empresarial que requiera autorización.

## Respaldo y restauración

Un dump y una prueba de restauración tienen alcances explícitos. El ensayo local citado en `OPERATIONS.md` verifica tablas y seguridad dentro de la infraestructura aislada descrita; no acredita automáticamente objetos externos de Storage, roles globales ni un RTO productivo.

Antes de usar un respaldo compruebe identidad, fecha, alcance y hash. La restauración de ensayo se realiza en un destino nuevo aislado. Un restore destructivo de PROD requiere autorización explícita, respaldo, transacción cuando corresponda y evidencia posterior; no es la respuesta automática a un fallo de aplicación.

La recuperación del escritorio también necesita considerar su perfil y pendientes propios. Restaurar sólo PostgreSQL no demuestra que hayan quedado recuperadas todas las intenciones locales de un equipo.

## Migraciones y entrega

Identifique commit y candidato; compruebe rango vigente, prefijos duplicados, dependencias, locks, RLS, permisos, backfill y rollback. El gate de release incluye build y comprobaciones pertinentes, imágenes, respaldo verificado, configuración real y plan de reversión.

La promoción exige su procedimiento y autorización, y verifica API, worker y web contra la versión esperada después de aplicar. Una promoción se hace con `scripts/promote-lote-prod.mjs` y su ensayo previo (`docs/RELEASE.md`). No basta con que el despliegue espere a CI: el esquema se promueve antes de fusionar a `main`. Si se pierde la respuesta del commit de una promoción, compruebe la historia remota antes de reintentar. Una corrección posterior debe evaluar datos creados después del cambio y normalmente utiliza una corrección hacia delante revisada.

## Dependencias externas y activación del cliente

Las pruebas locales no instalan credenciales ni completan una habilitación tributaria por contribuyente. SUNAT/SOL/SIRE, PVS/T-Registro, ARCA y DIAN conservan sus procedimientos, datos patronales y evidencias externas. Un canal técnico disponible, un PFX cargado o un HTTP exitoso no acreditan por sí solos aceptación oficial.

La activación debe revisar país, identidad, certificados y credenciales cifradas, numeración, permisos, impresora y dependencias contratadas que corresponda utilizar. No se incluyen secretos de clientes en este paquete.

## Límites

Esta guía no reemplaza los DTO vigentes. No se han medido carga ni RTO/RPO de producción. Para una intervención se siguen las fuentes canónicas y el contrato del entorno en ese momento.
