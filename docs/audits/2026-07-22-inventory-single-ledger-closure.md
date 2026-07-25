# Cierre single-ledger de inventario — 2026-07-22

## Alcance y entorno

- Entorno intervenido: DEV `hbueraexcbowpfnjlppi`.
- PROD `wypnbcptofqdmoynlonq`: no consultada ni modificada durante esta ejecución.
- Objetivo: verificar el hallazgo de doble saldo entre `productos.stock_*` y `producto_existencias`, hacer que la caja determine el almacén del POS y demostrar atomicidad, idempotencia y control de concurrencia.
- Preflight obligatorio: `scripts/db-environment-preflight.ps1 -Environment DEV -EnvFile .env.local`, OK antes de migrar y antes de las limpiezas selectivas.

## Diagnóstico confirmado

La función POS heredada de `327` descontaba `productos.stock_actual` e insertaba `movimientos_inventario`, pero no modificaba `producto_existencias` ni resolvía un almacén. En el estado previo existían cajas activas sin `almacen_id`, productos con saldo agregado sin existencia física y movimientos sin almacén. Una reproducción dentro de una transacción confirmó que una venta podía completar el agregado sin completar la existencia; la transacción de prueba se revirtió.

El análisis encontró además una tercera superficie de saldo, `producto_stock_sucursal`. Quedó clasificada como proyección derivada y protegida, no como ledger físico.

## Decisión de arquitectura

La única fuente física de verdad es `producto_existencias`, por `(tenant_id, producto_id, almacen_id)`. `productos.stock_actual`, `productos.stock` y `productos.stock_reservado` son agregados derivados. `producto_stock_sucursal` es una proyección opcional derivada de la existencia asociada a su `almacen_id`.

Toda entrada, salida, reserva o liberación pasa por `aplicar_movimiento_inventario_tx`. POS resuelve el almacén exclusivamente desde `sesiones_caja -> cajas.almacen_id`; no acepta un almacén elegido por el cliente. Si falta la RPC transaccional o ésta no confirma `impactos_aplicados=true`, la API bloquea la venta y no usa el fallback heredado.

## Migraciones DEV aplicadas

- `347__inventory_single_ledger_warehouse_pos.sql`: writer canónico, almacén obligatorio en caja, POS seguro, kardex idempotente y validador 6/6.
- `348__inventory_reservation_dispatch_single_writer.sql`: reserva, liberación y despacho por almacén.
- `349__inventory_order_reservation_release_tx.sql`: liberación atómica e idempotente de reservas de pedido.
- `350__inventory_derived_product_stock_guard.sql`: guarda de agregados derivados y ajuste por almacén.
- `351__inventory_manual_adjustment_and_projection_guard.sql`: ajuste absoluto canónico, validación de `cajas.almacen_id` y protección/sincronización de `producto_stock_sucursal`.
- `352__pos_inventory_legacy_bridge_guard.sql`: encapsula la implementación interna `327` dentro del wrapper POS. La función legacy no tiene `EXECUTE` para `service_role`, `authenticated`, `anon` ni `PUBLIC`; su cambio agregado temporal sólo se permite con una marca local de transacción y debe terminar en el writer canónico o todo se revierte.

Estas migraciones no se aplicaron a PROD. Su promoción requiere respaldo, ventana controlada, preflight PROD y smoke post-migración.

## Escritores migrados

- POS: venta sólo mediante `pos_registrar_venta_full_tx`; fallback legacy removido de la API.
- Demo y creación/edición/importación de productos: saldo inicial y ajuste por RPC canónica; se eliminó además el seed redundante en `stock_movimientos`.
- Recepciones, logística, pedidos y cancelaciones: reserva/despacho/liberación atómicos.
- Anulación CPE: entrada inversa en el mismo almacén de la salida original.
- Integración de inventario: exige almacén y llama a RPC canónica; GRE sólo enlaza un movimiento existente y nunca crea una segunda salida.
- `producto_stock_sucursal`: las rutas de catálogo/importación dejaron de escribir saldos independientes.
- POS: se eliminó el método privado inaccesible que todavía conservaba la antigua persistencia fragmentada de detalles, pagos y stock; no queda fallback de escritura en el servicio.

## Respaldo y limpieza autorizada

Antes de purgar DEV se generaron:

- Respaldo focal: `backups/dev-inventory-20260722/before-347.sql`, SHA-256 `A29320AB4AEA53971416B19BFB3D8AF1E416B7DE381B4C3DFF9772BF4068E1FD`.
- Respaldo completo PostgreSQL 17: `C:/Users/PC/AppData/Local/Temp/erp-dev-backups/20260722-inventory-single-ledger/before-dev-purge.dump`, SHA-256 `EB985FB020131C52D4F69176C38C73D75399439EEBE65CFD728B45F6BE2B4341`.

La purga DEV autorizada eliminó 36 tenants, 1 usuario Auth y 11.880 filas tenant-scoped; Storage ya estaba vacío. Luego se creó un tenant demo fresco. Estado inmediatamente posterior a la purga (antes de la prueba visual posterior):

- tenants: 1 (`Demo DEV Limpio`, `0708b87f-1d6a-45e5-85ab-a14451f635f2`);
- productos: 5;
- existencias: 5;
- cajas activas con almacén: 1;
- ventas POS: 0.

El tenant RBAC temporal y los tenants usados en pruebas fueron eliminados por ID en tres rondas de dependencias; el respaldo completo permite recuperación si fuera necesaria.

## Evidencia funcional

### Venta POS real

En un tenant demo de prueba se vendió una unidad del producto `976fc58b-2219-41a0-97f2-29e439370f80` mediante `POST /api/pos/venta`:

- venta: `7771f7cf-242f-4a0d-9b42-005b756e20f6`;
- stock agregado: `15 -> 14`;
- existencia del almacén de caja: `15 -> 14`;
- almacén de caja y movimiento: `c7eb7610-7311-426e-b376-3efc7041711b` en ambos;
- movimiento: una `SALIDA` de `1`, con `metadata.inventory_writer=aplicar_movimiento_inventario_tx`.

Repetir la misma `idempotency_key` devolvió la misma venta, mantuvo stock `14/14` y conservó una sola salida.

### Concurrencia

Se preparó una existencia con una unidad y se lanzaron dos ventas simultáneas con claves distintas:

- resultados de procesos: `[0, 1]`;
- ventas confirmadas: 1;
- ventas rechazadas: 1;
- saldo final agregado/existencia: `0/0`;
- movimientos SALIDA: 1.

No hubo overselling ni divergencia.

### Flujo visible de demo normal en navegador integrado

Se ejecutó además el flujo que recorre una persona usuaria, contra la Web y API locales conectadas a DEV:

1. creación de tenant demo desde `/demo/`, sin CAPTCHA;
2. autenticación con las credenciales temporales generadas;
3. ingreso al dashboard y apertura del POS con caja `CAJA-001` abierta;
4. selección de `Audífonos Bluetooth`, `Cliente General` y pago en efectivo;
5. confirmación visual del ticket `B001-00000001`, estado `PAGADA`, total `S/ 106.08` y stock `15 -> 14`.

La primera solicitud de venta fue rechazada con HTTP 400 antes de entrar al servicio porque la imagen Web saludable anterior enviaba snapshots informativos adicionales dentro de `comprobante` y `descuento_global`. El rechazo no creó venta, movimiento ni cambio de stock. Se agregó compatibilidad DTO estrictamente informativa para despliegues progresivos: el backend sigue recalculando precio, impuestos, total y stock desde la BD y no confía en esos snapshots.

La repetición del flujo terminó correctamente. La verificación directa posterior en DEV mostró:

- producto `DEMO-004`: `productos.stock_actual=14` y `productos.stock=14`;
- existencia del almacén de caja: `producto_existencias.stock_actual=14`, `stock_reservado=0`;
- caja `CAJA-001` y existencia con el mismo `almacen_id` `08312822-00fe-4a15-87da-b2f7a2bb5b5c`;
- venta `6f83861c-ab1c-4c30-9310-2e64d1a32eda`, ticket `B001-00000001`, estado `PAGADA`;
- exactamente un movimiento `SALIDA` de cantidad `1`, con `referencia_tipo=VENTA_POS`, `referencia_id` igual a la venta y `metadata.inventory_writer=aplicar_movimiento_inventario_tx`.

La decisión de producto es no usar CAPTCHA en este flujo normal. La creación de demos permanece limitada a DEV: exige `DEMO_API_ENABLED=true`, aplica throttle de 5 solicitudes por hora y se bloquea si `NODE_ENV=production` o `DEPLOYMENT_ENV=PROD`. PROD no fue consultada ni modificada.

### Rediseño operativo del POS y segunda prueba visible

La interfaz POS se reorganizó con el patrón de dos zonas aprobado para escritorio: catálogo flexible a la izquierda y venta activa persistente a la derecha. Cliente y tipo de comprobante forman parte de la venta; el medio de pago se solicita en un diálogo shadcn sólo al pulsar `Cobrar`; historial, cortes y cierre de caja quedan como acciones secundarias. Se eliminó el botón `Guardar`, que no tenía comportamiento, y se reemplazaron el tercer panel permanente, los espacios mínimos excesivos y los gradientes decorativos por superficies semánticas compatibles con dark/light.

La fuente modificada se sirvió en `http://localhost:13001` contra API/Redis locales y se recorrió en el navegador integrado:

1. POS cargado con caja abierta y cinco productos;
2. selección de `Cliente General` y `Azúcar Rubia 1kg`;
3. apertura del diálogo `Cobrar S/ 7.67` y selección de efectivo;
4. confirmación del ticket `B001-00000002`, estado `PAGADA`;
5. carrito limpio, historial con la venta y stock visible `120 -> 119`;
6. render verificado tanto en tema oscuro como claro.

El preflight volvió a confirmar DEV `hbueraexcbowpfnjlppi` y el contrato single-ledger terminó 6/6 OK después de esta venta. PROD no fue consultada ni modificada.

### Pulido empresarial posterior y cobro no destructivo

Una revisión visible adicional a 1280x720 eliminó dos decisiones decorativas impropias de una interfaz operativa: la categoría repetida dentro del placeholder y la paleta multicolor asignada a productos sin imagen. Las tarjetas finales son neutras, densas y reservan el color para acciones, estados y alertas funcionales. Las categorías rápidas se adaptan por filas sin scroll horizontal y el modo caja usa una superficie opaca por encima de la navegación general.

Se repitió el flujo con `Cliente General`, `Audífonos Bluetooth` y `Azúcar Rubia 1kg`, total visible `S/ 113.75`, medio `Efectivo`, recibido `S/ 120.00` y vuelto `S/ 6.25`. La prueba detectó y corrigió una diferencia entre el total interno con fracciones de IGV y el total monetario mostrado; el importe operativo se redondea ahora a dos decimales antes de validar el efectivo. El importe exacto `S/ 113.75` habilita correctamente `Confirmar cobro`. Una auditoría posterior del historial mostró que durante la sesión sí quedó registrada la venta DEV `B001-00000003`, estado `PAGADA`, por S/113.75; el stock visible de Audífonos bajó `14->13` y el de Azúcar `119->118`. No se borró ni revirtió esa venta. La consola no registró `warn/error` y la página no presentó desborde horizontal.

La inspección del ticket histórico detectó además que la vista previa usaba el fallback `Factura de venta / 001-0001` aunque el registro era una boleta `B001`. Se eliminó ese contenido ficticio: el rótulo se deriva del tipo documental o del prefijo real (`B`/`F`), el número prioriza `numero_ticket`, el cierre superior tiene nombre accesible y `Imprimir` ejecuta una acción real en lugar de ser un botón inerte.

La supervisión visual posterior corrigió tres problemas de composición adicionales. El catálogo dejó de forzar una altura mínima y el grid cambió de `auto-fill` a `auto-fit`, por lo que ya no reserva columnas vacías; las tarjetas sin imagen son compactas, no superponen categoría e icono y muestran el nombre completo hasta cuatro líneas. El panel de venta dejó de forzar altura de viewport: artículos, totales y `Cobrar` quedan consecutivos, con scroll sólo para listas largas. La operación de caja usa un menú opaco con descripciones; el diálogo de cierre presenta una acción destructiva, deshabilitada hasta registrar el conteo, y elimina el cálculo frontend incorrecto `contado - monto inicial`, pues la diferencia real corresponde al backend con ventas y movimientos. La vista previa del ticket también alinea `descripcion || nombre_producto || producto_nombre`, evitando filas sin nombre. Validación visible normal/enfocada: sin solapamientos, sin columnas reservadas, sin overflow horizontal y consola sin advertencias/errores.

### Contratos y pruebas

- `scripts/qa/inventory-single-ledger-contract.ps1 -EnvFile .env.local`: 6/6 OK sobre datos no vacíos.
- ESLint focalizado: `page.tsx`, `ProductGrid.tsx` y contrato E2E POS sin errores.
- Gate UI/CSS: sin críticos, sin `!important`, sin clases legacy o escalas no estándar.
- Contrato E2E actualizado para exigir `Punto de venta`, `Venta actual`, acceso a `Ventas del día` y ausencia del botón inerte `Guardar`.
- Web type-check: OK. Build optimizado Next.js: 111/111 páginas generadas, sin errores ni advertencias.
- El contrato prueba en transacción y revierte: ajuste absoluto canónico, igualdad agregado/existencia, rechazo de escritura directa, revocación de la función legacy y guard de proyección por sucursal.
- Backend type-check: OK.
- Jest focalizado final: 10 suites, 85/85 tests OK, incluidos los contratos de seguridad de demo sin CAPTCHA y compatibilidad DTO POS de despliegue progresivo.
- Barrido estático final sobre `apps/erp-api/src` y `apps/worker/src`: ninguna mutación directa de `producto_existencias`, `producto_stock_sucursal`, `movimientos_inventario` o `stock_movimientos` desde TypeScript.

## Stack local

Servicios activos y saludables:

- Web `http://localhost:13001`: 200 (fuente actual en Next dev para validación visible; el contenedor Web previo se detuvo de forma reversible).
- API live/ready `http://localhost:13002/api/health/*`: 200, imagen nueva.
- Worker `http://localhost:3050/health`: 200, imagen nueva.
- Redis `localhost:6381`: `PONG`.
- Prometheus `http://localhost:9091`: 200.
- Grafana `http://localhost:3300`: 200.

El primer build Web quedó bloqueado por seis importaciones `react-hot-toast` insertadas dentro de bloques de iconos Lucide en páginas de Compras. Se corrigió únicamente la posición de esas importaciones y se añadieron las dos dependencias `toast` faltantes en callbacks de `RecepcionWizard`. Resultado posterior: type-check Web OK, ESLint focalizado OK y build Next.js 111/111 sin advertencias. La compilación final se sirve en `http://localhost:13001`; API, worker y Redis conservan sus servicios locales.

## Resultado y límite de la afirmación

El hallazgo de Opus era cierto para el código/estado previo. En DEV, el riesgo queda cerrado con evidencia real, no sólo por inspección estática. No se declara cerrado en PROD hasta promover `347..352` con el runbook y ejecutar allí los validadores y un smoke autorizado.
