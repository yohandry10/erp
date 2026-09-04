# Validación funcional Argentina — trabajo en curso

La navegación de 33 módulos y los contratos Playwright aislados no equivalen
a validar sus funciones ni a dar el alta operativa. El usuario exige circuitos
completos con roles separados, priorizando al contador. Ningún circuito de esta
tabla se considera aprobado por abrir su pantalla.

Entorno: navegador integrado, frontend productivo y API Render; únicamente
empresas demo argentinas autorizadas. Preflight PROD del 2026-09-04 correcto:
`wypnbcptofqdmoynlonq`, política demo habilitada. Las pruebas automatizadas con
escritura usan dobles o infraestructura local; no se ejecuta el runner E2E
contra PROD. No se transmiten comprobantes demo a ARCA.

| Circuito / responsable | Operaciones y criterios de aceptación | Estado |
| --- | --- | --- |
| Contador — operación de compra | Proveedor, cotización/orden, aprobación por otro usuario, recepción parcial/final, stock y kardex, factura proveedor, IVA, CxP, pago parcial/final, banco, asiento y mayor coherentes | PENDIENTE |
| Contador — libros y cierre | Plan de cuentas argentino, período, asiento manual válido/descuadrado, confirmar/revertir, diario/mayor, balance de comprobación, resultados/situación, exportaciones, cierre y bloqueo de movimientos tardíos | PENDIENTE |
| Contador — contabilidad avanzada | Centros de costo/distribución, presupuesto, recurrentes, devengos, activos/depreciación/baja, partidas de terceros, moneda extranjera/revaluación, reportes configurables y consignación | PENDIENTE |
| Finanzas | CxC/CxP, cobros/pagos parciales, reversa y motivo, anticipos/aplicación, movimientos/transferencias bancarias, importar extracto, conciliar y cerrar sin diferencia | PENDIENTE |
| Ventas + aprobación + almacén | Cliente, cotización, descuento/rechazo/aprobación segregada, pedido, reserva, preparación, despacho, factura/muestra, cobranza, devolución/RMA y efecto fiscal permitido | PENDIENTE |
| Cajero | Abrir caja, venta mixta y cambio, comprobante/ticket, recuperación de error, cierre/cuadre, cambio de turno, permisos de supervisor, operación offline y sincronización permitida | PENDIENTE |
| Inventario | Producto/categoría/almacén/ubicación, recepción, ajuste, transferencia, lotes/series cuando aplique, reserva/liberación, kardex y costos | PENDIENTE |
| RRHH | Empleado/contrato argentino, asistencia, novedades, cálculo/revisión/aprobación de nómina, asiento, vacaciones/ausencias y liquidación final | PENDIENTE |
| Administración | Alta/edición/inactivación de usuarios, roles/permisos, login/revocación, empresa/configuración/series, navegación y acciones autorizadas y denegadas por rol | EN CURSO: usuario CONTADOR creado y persistido en demo inicial |
| Gerencia / auditor | Dashboard y analytics reconciliados con las operaciones anteriores, filtros/exportaciones, trazabilidad y lectura sin permisos de escritura | PENDIENTE |
| Fiscal ARCA | Clases A/B/C, notas referenciadas, IVA/conceptos/fechas/ARS/USD, A4, procedencia demo, errores y bloqueos; emisión real requiere credenciales/habilitación del contribuyente | PARCIAL: muestra A4 comprobada; resto del circuito funcional pendiente |

## Hallazgos reproducidos

- Demo de circuitos creada desde la interfaz: `demo-ar-4f6e9552@temp.local`,
  país AR, moneda ARS, 14 días. Se conservan credenciales sólo en la sesión de
  trabajo. Alta desde Usuarios de `qa-contador-ar-4f6e9552@temp.local` con rol
  CONTADOR: aparece ACTIVO y el total sube de 2 a 3. Cierre de sesión de ADMIN
  devuelve al login argentino; ingreso como CONTADOR correcto. El menú no
  ofrece Usuarios, Configuración, POS, Compras ni RRHH a este rol.

- Documentos convertía `FACTURA` en Factura A y `BOLETA` en Factura B, aunque
  el CPE demo era B; mostraba estado emitido y un envío heredado. Corrección en
  PR #106: proyección tenant-scoped desde CPE, estado de muestra y bloqueo del
  endpoint heredado. Pruebas unitarias 18/18, CI 24/24 y merge
  `c809991e3f594eb7baf8a3bdcf9d01096557c4cd`. API sirviendo ese SHA a las
  21:28 UTC. Retest funcional de Documentos pendiente.
- La demo inicial conserva su evidencia A4 `00001-00000002`, ARS 1210, IVA 210;
  esta evidencia no demuestra ventas, cobranza ni contabilidad completa.

Cada cierre debe registrar rol, documentos utilizados, importes/cantidades
iniciales y finales, resultado visible, evidencia técnica, defecto encontrado
y retest sobre el despliegue que lo corrige. No registrar contraseñas ni tokens.

## Circuito manual ejecutado como CONTADOR

- Septiembre 2026 no existía: el writer rechazó el asiento y el formulario
  conservó sus datos. La alerta nativa era genérica y el mensaje útil sólo
  aparecía en un toast. Corrección local: error persistente y acceso a Períodos
  en otra pestaña, pendiente de despliegue/retest.
- Creado período septiembre 2026 desde la UI, `ABIERTO`, prefijo `b3857031`.
- Referencia `QA-AR-CONT-001`: Caja 101 debe 1000 / Capital 50 haber 900
  deshabilita guardar y explica diferencia 100. Con 1000/1000 guarda borrador.
  HTTP 201; asiento 1, ID `4cb1127a-81ff-46d2-8265-06018ddd9a2d`.
- Editado el mismo borrador a 1200/1200 y concepto corregido. Persistió como
  BORRADOR; el resumen de libros todavía mostraba 0 asientos / 0 líneas.
- Confirmado desde detalle. Desaparecen Editar, Eliminar y Confirmar. Balance
  de comprobación: Caja +1200, Capital -1200, debe/haber 1200, neto 0. Balance
  general: activo 1200, pasivo 0, patrimonio 1200, cuadrado.
- Reversión con fecha 2026-09-04 y motivo explícito: asiento 2,
  `2c484d7d-3a5e-45fa-acb4-7336e02069cb`, `REV-QA-AR-CONT-001`, CONFIRMADO.
  Capital debe 1200, Caja haber 1200. Enlace al original y enlace inverso
  comprobados; el original ya no ofrece Reversar. Diario muestra ambos.
- Balance posterior: cada cuenta tiene debe 1200 / haber 1200 / saldo 0;
  totales debe 2400 / haber 2400 / neto 0. Estado de resultados sin ingresos,
  gastos ni utilidad: el aporte no generó resultado.
- Descargas reales: Balance General XLS 5459 bytes y PDF 21701 bytes. El XLS
  contenía importes como `ss:Type="String"`, sin moneda en columna. PDF con
  encabezado blanco sobre gris claro y formato numérico peruano aunque ARS.
  Estado de Resultados PDF 13529 bytes muestra `NaN%` cuando ingresos son cero
  y `100.00%` sobre total cero. Correcciones locales y regresiones en curso.

Este circuito demuestra el ciclo manual básico, no aprueba todavía todo el
módulo: quedan cierre/bloqueo/reapertura, plan, mayor/libros IVA, automatismos,
compras/ventas/pagos, analítica y el resto de funciones de la matriz.
