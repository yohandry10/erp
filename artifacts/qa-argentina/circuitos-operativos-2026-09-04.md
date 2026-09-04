# Circuitos operativos Argentina — en curso

Complementa la matriz de `validacion-funcional-2026-09-04.md`. Navegador
integrado sobre demo autorizada; no se usan SQL ni runners de escritura en
PROD. No hay alta de módulos por navegación, usuarios creados o mocks.

## Responsables

Desde ADMIN_DEMO se crearon y verificaron ACTIVO, con un rol cada uno:
CONTADOR, COMPRAS, ALMACEN, FINANZAS, VENDEDOR, CAJERO, RRHH, AUDITOR y
GERENCIA. Correos `qa-<rol>-ar-4f6e9552@temp.local` (ventas usa `vendedor`).
Las credenciales temporales están sólo en la sesión de trabajo, no aquí.
Usuarios confirma 11 registros: esos nueve, administrador demo y aprobador
preexistente. Login real comprobado de CONTADOR, ADMIN_DEMO y COMPRAS.

## Hallazgo: actualización del tablero

Luego de crear once usuarios, la sesión nueva COMPRAS muestra USUARIOS 3.
Actualizar termina, cambia Sync a 16:57:11 America/Lima y mantiene 3.
Código contrastado: `DashboardMetricsService.STATS_CACHE_TTL_SECONDS` es
600 segundos; el botón invoca `fetchDashboardData(false)` y no fuerza la
invalidación. Pendiente confirmar contrato completo y corregir/retestear el
refresco sin eludir permisos ni quitar toda la caché por defecto.
Después de vencer el TTL, un nuevo login CONTADOR sí muestra 11 usuarios:
confirma que la lista no perdió los registros, pero no resuelve la expectativa
del botón Actualizar durante la vigencia de la caché.

## Compra — rol COMPRAS

- Punto de partida: 0 órdenes, 2 proveedores; inventario demo 6 productos,
  valor mostrado 5370,50 ARS (todavía no reconciliado con kardex).
- Alta de proveedor desde Compras > Agregar. CUIT `123` rechazado con mensaje
  de once dígitos y verificador válido; razón social, condiciones y dirección
  permanecen. Email es obligatorio aunque su etiqueta no lo marca con `*`.
- CUIT de once dígitos con DV incorrecto `30999888776` y `30999888777`
  rechazados. El primer cálculo manual del dato QA era incorrecto; cálculo
  contrastado con el validador: suma ponderada 278, dígito correcto 8. No se
  atribuye al producto el rechazo de esos dos datos inválidos.
- Enviado el alta con CUIT válido `30999888778`, nombre
  `Proveedor QA Argentina S.R.L. (demo)`, crédito 15 días,
  correo `proveedor-qa@example.test` y domicilio explícitamente de prueba.
  Persistencia confirmada: 3 proveedores, ID
  `35d26be5-66a9-486f-ad46-12870cfba62d`.
- Edición: contacto `Contacto QA editado`, teléfono `1155550100`, correo
  conservado. GET real confirma esos datos y una edición sin volver a escribir
  correo termina HTTP 200. La inspección AX/DOM devolvía vacíos para correo y
  teléfono; no se declara pérdida de datos del ERP a partir de esa lectura.
- Alta de orden `OC-2026-001`: Café Molido Premium 250g
  (`680111fc-e425-48ba-a972-b809fec4fa83`), 10 unidades a ARS 100,
  fecha 04/09, entrega 07/09. UI calcula 1000 + IVA 210 = 1210.
  Cantidad cero y cantidad diez reciben HTTP 400; el listado refrescado sigue
  con cero órdenes. El intento válido NO se considera completado.
- Evidencia de red: ambos POST omiten `idempotency_key`. DTO la exige; el
  modal captura el fallo sin explicación persistente. Respuesta HTTP real sólo
  dice `Bad Request`. Corrección en curso: clave estable, rechazo inline,
  moneda aceptada por DTO/enviada por UI (antes se seleccionaba pero se omitía),
  cantidades fraccionarias, recálculo al elegir producto y reapertura limpia.
  La RPC 453 ya admite moneda; no se modifica SQL ni se aplica migración.
- Primera regresión del modal detecta, a 1280×720, Guardar fuera del viewport
  sin scroll alcanzable. Se añade altura máxima con scroll interno; pendiente
  repetición de la misma prueba, sin forzar clicks fuera de pantalla.
- Regresión local anterior a este cambio: 95/96 pasan; monitoreo outbox falla
  antes de su pantalla en `Preparando configuración fiscal del tenant…`.
  CI del commit de #107 dio 24/24 checks verdes. Se conserva la discrepancia;
  repetir el perfil aislado completo, sin atribuirla aún al negocio.

## Pendientes inmediatos

Proveedor persistido y duplicados; cotización/orden, aprobación por otro
actor, recepción parcial/final, stock/kardex, factura de proveedor/IVA/CxP,
pago parcial/final con FINANZAS y conciliación contable con CONTADOR.

La reapertura exitosa de agosto requiere un superadministrador; no se elevó
ningún usuario de la demo. Septiembre permanece ABIERTO.

## Retesteo publicado #107

- Login real CONTADOR: agosto sigue CERRADO y ya no se ofrece Reabrir.
- Balance de comprobación real: 2 cuentas, Caja y Capital con debe/haber
  1700 cada una; totales 3400/3400 y saldo final cero (incluye reversión del
  intento QA de fecha equivocada, además del aporte/reversión de 1200).
- Descargas iniciadas por UI generan `Page.downloadWillBegin`, pero el navegador
  integrado cancela la descarga (`Page.downloadProgress: canceled`). Esperar
  el evento de descarga tampoco entrega archivo. No se atribuye al ERP una
  falla de generación, ni se cuentan los archivos viejos como retesteo publicado.
  Exportaciones del commit probadas localmente, retesteo de archivo publicado
  aún pendiente por esta limitación de captura.
