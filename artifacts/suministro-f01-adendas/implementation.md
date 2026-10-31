# suministro · F01, segundo incremento

Trabajo local como feature, separado de la matriz de aceptación existente. No se
han aplicado migraciones, publicado servicios ni escrito datos en PROD.

## Implementado

- Adendas de contratos activos con versión, referencia única por tipo/recurso,
  motivo, responsable, observaciones y snapshots anteriores/nuevos. Permiten
  ajustar asunto, fin de vigencia, cantidades, precios y añadir productos.
  Conservan cliente, número, moneda, inicio y la identidad de líneas existentes.
- Modificación de OC con versión, referencia y motivo. Mantiene identidades,
  precios y líneas con entregas históricas; cantidades y fechas respetan las
  programaciones vigentes y los límites del contrato.
- Anulación de OC sin programaciones vigentes. Conserva sus registros e historial
  y libera las cantidades contractuales. Bloquea nuevas programaciones en esa OC.
- Precio unitario congelado al incorporar cada línea de OC. Una adenda cambia
  precios de futuras líneas; modificar cantidades no revaloriza las existentes.
- Pantalla de adendas y controles de modificación/anulación de OC, con comparación
  de cambios en historial. Recuperación de respuestas inciertas con idéntica
  solicitud y clave, mientras la página permanece abierta.

## Migración y seguridad

La 571 reemplaza explícitamente las funciones de detalle y escritura 570,
conservando sus firmas, propietario, ACL, permiso por actor y aislamiento por
empresa. Todas las acciones comparten el mismo lock de contrato e intención
idempotente. No se añade acceso directo a las siete tablas privadas.

Se añaden estado/versión de OC, precio unitario de línea OC y referencia del
historial con índice único. El backfill toma el precio del contrato: la 570 no
permite cambiarlo después de activar, por lo que no había revalorizaciones
previas. La migración es transaccional con lock_timeout de 10 segundos.
El rollback operativo deshabilita las nuevas acciones y conserva los datos;
no se propone borrar columnas, reactivar OC ni restaurar precios silenciosamente.

## Verificación

- PostgreSQL 16 local efímero: 567 migraciones hasta 571, 80 verificadores actuales
  y 67 históricos. ACL/RLS, actor/empresa, cantidades, fechas, conservación del
  precio, referencias duplicadas, rechazo sin residuos y replay posterior a
  anulaciones. Registro: `fresh-sql.log`.
- Ocho escenarios de concurrencia real como service_role: `concurrency.json`.
  Incluye reducir un contrato frente a asignar OC, dos adendas de igual versión,
  modificar frente a anular OC, y anular frente a programar entrega.
- API: 48 pruebas en tres suites, con validación HTTP de revisiones y permisos:
  `api-tests.log`. Comprobación de tipos y compilación API aprobadas.
- Navegador aislado: tres recorridos, escritorio claro y móvil oscuro, respuesta
  perdida de adenda, recuperación de clave, cambio de cantidades con precio
  original, bloqueo de anulación con programación, cancelación posterior,
  historial legible y lector sin escritura: `browser-final.log`.
- Etiquetas: 1025 controles con nombre programático; política offline y contrato
  documental de seis archivos aprobados. Detector mecánico UI sin hallazgos.
  Compilación Web y tipos aprobados; quedan advertencias ESLint de refs/hooks e
  imágenes descritas en `verification.json`.
  Capturas finales en `browser-final/`; revisión visual de formulario e historial.

## Lo que sigue

F01 aún requiere vincular pedidos operativos y adjuntos del expediente. Una
referencia de adenda no acredita archivo, firma, aprobación legal ni aceptación
del cliente. No se crean reservas físicas, entregas ejecutadas, facturas,
conformidades, penalidades ni asientos. F02 lotes y las siguientes features
continúan pendientes según el plan de `../suministro-f01/implementation.md`.

La promoción de 570–571 y del runtime que exige 571 sigue pendiente. Antes de
operar PROD: releer OPERATIONS, revisar rango vigente/prefijos, preflight,
respaldo, ensayo local de preservación, permisos/RLS/locks y despliegue coordinado.
