# Operaciones del API y permisos

Generado desde los decoradores de los controladores con `node scripts/manual/generar-referencias.mjs`; no se edita a mano. 806 operaciones. Si difiere del código, manda el código.

"-" significa que el controlador no declara un permiso con ese decorador: puede ser pública, usar otro guard o validar el permiso dentro de la operación. No debe leerse como acceso libre (62 casos). El permiso declarado no es lo único que se exige: también cuentan la empresa, la sucursal y el estado del registro.

## alertas

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/alertas/mias` | - |
| POST | `/api/alertas/:id/reconocer` | - |
| GET | `/api/alertas` | `alertas.suministro.ver` |
| GET | `/api/alertas/reglas` | `alertas.suministro.ver` |
| PUT | `/api/alertas/reglas/:tipo` | `alertas.suministro.gestionar` |
| POST | `/api/alertas/evaluar` | `alertas.suministro.gestionar` |

## analytics.controller.ts

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/analytics/ventas-tiempo` | `analytics.ventas.read` |
| GET | `/api/analytics/deudas-clientes` | `analytics.cobranza.read` |
| GET | `/api/analytics/deudas-proveedores` | `analytics.cobranza.read` |
| GET | `/api/analytics/ventas-categoria` | `analytics.ventas.read` |
| GET | `/api/analytics/kpis-visuales` | `analytics.finanzas.read` |
| GET | `/api/analytics/rentabilidad-productos` | `analytics.rentabilidad.read` |
| GET | `/api/analytics/punto-equilibrio` | `analytics.finanzas.read` |
| GET | `/api/analytics/escenarios-financieros` | `analytics.finanzas.read` |

## audit

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/audit-logs` | `security.audit.read` |
| GET | `/api/audit-logs/actors` | `security.audit.read` |
| GET | `/api/audit-logs/user/:userId` | `security.audit.read` |
| GET | `/api/audit-logs/resource/:tableName/:resourceId` | `security.audit.read` |
| GET | `/api/audit-logs/integrations` | `security.audit.read` |

## auth

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/auth/login` | - |
| GET | `/api/auth/profile` | - |
| POST | `/api/auth/refresh` | - |
| POST | `/api/auth/validate` | - |
| GET | `/api/auth/config-status` | - |
| POST | `/api/auth/password-reset/request` | - |
| POST | `/api/auth/password-reset/validate` | - |
| POST | `/api/auth/password-reset/confirm` | - |
| POST | `/api/auth/switch-tenant` | `tenants.manage` |
| POST | `/api/auth/logout` | - |
| POST | `/api/auth/logout-all` | - |

## cajas

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/cajas` | `cajas.ver` |
| POST | `/api/cajas` | `cajas.crear` |
| PUT | `/api/cajas/supervisores/:supervisorId/pin` | `users.manage` |
| PUT | `/api/cajas/:id` | `cajas.editar` |
| GET | `/api/cajas/opciones-contables` | `cajas.ver` |
| POST | `/api/cajas/:id/apertura` | `cajas.apertura` |
| POST | `/api/cajas/:id/cierre` | `cajas.cierre` |
| GET | `/api/cajas/sesiones` | `cajas.sesiones.ver` |
| GET | `/api/cajas/cortes` | `cajas.cortes.ver` |
| GET | `/api/cajas/cortes/:corteId` | `cajas.cortes.ver` |
| GET | `/api/cajas/cortes/:corteId/pdf` | `cajas.cortes.exportar_pdf` |
| GET | `/api/cajas/cortes/:corteId/csv` | `cajas.cortes.exportar_csv` |
| GET | `/api/cajas/validar-precierre/:sesionId` | `cajas.precierre.ver` |
| GET | `/api/cajas/saldo-esperado/:sesionId` | `cajas.saldo_esperado.ver` |
| GET | `/api/cajas/movimientos/:sesionId` | `cajas.sesiones.ver` |
| POST | `/api/cajas/validar-cierre/:sesionId` | `cajas.precierre.ver` |
| GET | `/api/cajas/supervisores-autorizados/:sesionId` | `cajas.cierre` |
| GET | `/api/cajas/supervisores-gestion-pin` | `users.manage` |
| POST | `/api/cajas/cerrar/:sesionId` | `cajas.cierre` |
| POST | `/api/cajas/retiros/:sesionId` | `cajas.retiros.crear` |
| POST | `/api/cajas/retiros/:retiroId/conciliar` | `cajas.retiros.conciliar` |
| POST | `/api/cajas/cambio-turno/iniciar/:sesionId` | `cajas.cambios_turno.iniciar` |
| POST | `/api/cajas/cambio-turno/completar/:cambioId` | `cajas.cambios_turno.completar` |
| POST | `/api/cajas/cambio-turno/cancelar/:cambioId` | `cajas.cambios_turno.cancelar` |
| GET | `/api/cajas/sesiones/:sesionId/candidatos-turno` | `cajas.cambios_turno.iniciar` |
| GET | `/api/cajas/sesiones/:sesionId/cambios-turno` | `cajas.cambios_turno.ver` |
| POST | `/api/cajas/movimientos/manual/:sesionId` | `cajas.movimientos.manual` |
| POST | `/api/cajas/sesiones/:sesionId/cierre-administrativo` | `cajas.cierre_administrativo` |
| GET | `/api/cajas/:id/corte-z` | `cajas.corte_z.ver` |

## compras

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/compras/cotizaciones` | `compras.cotizaciones.crear` |
| GET | `/api/compras/cotizaciones` | `compras.cotizaciones.ver` |
| GET | `/api/compras/cotizaciones/:id` | `compras.cotizaciones.ver` |
| PUT | `/api/compras/cotizaciones/:id` | `compras.cotizaciones.editar` |
| POST | `/api/compras/cotizaciones/:id/enviar` | `compras.cotizaciones.enviar` |
| POST | `/api/compras/cotizaciones/:id/aprobar` | `compras.cotizaciones.aprobar` |
| POST | `/api/compras/cotizaciones/:id/rechazar` | `compras.cotizaciones.rechazar` |
| POST | `/api/compras/cotizaciones/:id/convertir-oc` | `compras.cotizaciones.convertir_orden` |
| POST | `/api/compras/devoluciones` | `compras.devoluciones.crear` |
| GET | `/api/compras/devoluciones` | `compras.devoluciones.ver` |
| GET | `/api/compras/devoluciones/:id` | `compras.devoluciones.ver` |
| POST | `/api/compras/devoluciones/:id/emitir` | `compras.devoluciones.emitir` |
| POST | `/api/compras/devoluciones/:id/anular` | `compras.devoluciones.emitir` |
| POST | `/api/compras/ordenes` | `compras.ordenes.crear` |
| GET | `/api/compras/ordenes` | `compras.ordenes.ver` |
| GET | `/api/compras/ordenes/:id` | `compras.ordenes.ver` |
| PUT | `/api/compras/ordenes/:id` | `compras.ordenes.actualizar` |
| POST | `/api/compras/ordenes/:id/aprobar` | `compras.ordenes.aprobar` |
| POST | `/api/compras/ordenes/:id/rechazar` | `compras.ordenes.rechazar` |
| POST | `/api/compras/ordenes/:id/cancelar` | `compras.ordenes.cancelar` |
| POST | `/api/compras/ordenes/:id/recepciones` | `compras.recepciones.crear` |
| GET | `/api/compras/ordenes/:id/recepciones` | `compras.ordenes.ver` |
| GET | `/api/compras/ordenes/:id/aprobaciones` | `compras.ordenes.ver` |
| POST | `/api/compras/proveedores` | `compras.proveedores.crear` |
| GET | `/api/compras/proveedores` | `compras.proveedores.ver` |
| GET | `/api/compras/proveedores/buscar-ruc/:ruc` | `compras.proveedores.ver` |
| GET | `/api/compras/proveedores/:id` | `compras.proveedores.ver` |
| PUT | `/api/compras/proveedores/:id` | `compras.proveedores.editar` |
| DELETE | `/api/compras/proveedores/:id` | `compras.proveedores.eliminar` |
| GET | `/api/compras/recepciones` | `compras.recepciones.ver` |
| GET | `/api/compras/recepciones/:id` | `compras.recepciones.ver` |
| POST | `/api/compras/recepciones/ordenes/:ordenId` | `compras.recepciones.crear` |
| PUT | `/api/compras/recepciones/:id` | `compras.recepciones.editar` |
| POST | `/api/compras/recepciones/:id/cerrar` | `compras.recepciones.cerrar` |

## compras.controller.ts

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/compras/stats` | `compras.ordenes.ver` |
| GET | `/api/compras` | `compras.ordenes.ver` |
| GET | `/api/compras/next-number` | `compras.ordenes.crear` |
| POST | `/api/compras` | `compras.ordenes.crear` |
| PUT | `/api/compras/:id/recibir` | `compras.ordenes.actualizar` |
| PUT | `/api/compras/:id/cancelar` | `compras.ordenes.cancelar` |
| GET | `/api/compras/reporte-compras` | `compras.ordenes.ver` |
| GET | `/api/compras/productos` | `compras.ordenes.ver` |
| GET | `/api/compras/:id` | `compras.ordenes.ver` |

## configuracion

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/configuracion-fiscal` | - |
| GET | `/api/configuration/context/status` | - |
| GET | `/api/configuration/context/country` | - |
| POST | `/api/configuration/colombia/dian/test` | `configuracion.write` |
| POST | `/api/configuration/colombia/dian/habilitacion` | `configuracion.write` |
| GET | `/api/configuration/status` | `configuracion.read` |
| POST | `/api/configuration/wizard/validate-certificate` | `configuracion.write` |
| GET | `/api/configuration/wizard/progress` | `configuracion.read` |
| POST | `/api/configuration/wizard/step` | `configuracion.write` |
| POST | `/api/configuration/wizard/reset` | `configuracion.write` |
| POST | `/api/configuration/complete` | `configuracion.write` |
| PUT | `/api/configuration/gre-thresholds` | `configuracion.write` |
| GET | `/api/configuration/gre-thresholds` | `pos.read` |
| GET | `/api/configuration/empresa` | `configuracion.read` |
| POST | `/api/configuration/empresa/logo` | `configuracion.write` |
| DELETE | `/api/configuration/empresa/logo` | `configuracion.write` |
| PUT | `/api/configuration/empresa` | `configuracion.write` |

## configuracion.controller.ts

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/configuracion` | `configuracion.read` |
| GET | `/api/configuracion/ose` | `configuracion.read` |
| POST | `/api/configuracion/ose/verificar` | `configuracion.write` |
| GET | `/api/configuracion/empresa` | `configuracion.read` |
| PUT | `/api/configuracion/empresa` | `configuracion.write` |
| GET | `/api/configuracion/series` | `configuracion.read` |
| PUT | `/api/configuracion/series/:tipo` | `configuracion.write` |
| GET | `/api/configuracion/parametros-facturacion` | `configuracion.read` |
| PUT | `/api/configuracion/parametros-facturacion` | `configuracion.write` |
| POST | `/api/configuracion/certificado/upload` | `configuracion.write` |
| GET | `/api/configuracion/test-integracion` | `system.debug` |
| GET | `/api/configuracion/test-firma-xml` | `system.debug` |
| POST | `/api/configuracion/test-firma-xml` | `system.debug` |

## contabilidad

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/contabilidad/activos-fijos` | `contabilidad.activos.read` |
| GET | `/api/contabilidad/activos-fijos/:id` | `contabilidad.activos.read` |
| GET | `/api/contabilidad/activos-fijos/:id/cronograma` | `contabilidad.activos.read` |
| POST | `/api/contabilidad/activos-fijos` | `contabilidad.activos.crear` |
| PUT | `/api/contabilidad/activos-fijos/:id` | `contabilidad.activos.actualizar` |
| POST | `/api/contabilidad/activos-fijos/depreciar` | `contabilidad.activos.depreciar` |
| POST | `/api/contabilidad/activos-fijos/:id/baja` | `contabilidad.activos.baja` |
| GET | `/api/contabilidad/distribucion-analitica/:detalleId` | `contabilidad.distribucion.read` |
| POST | `/api/contabilidad/distribucion-analitica` | `contabilidad.distribucion.asignar` |
| DELETE | `/api/contabilidad/distribucion-analitica/:detalleId` | `contabilidad.distribucion.asignar` |
| GET | `/api/contabilidad/diferidos` | `contabilidad.diferidos.read` |
| GET | `/api/contabilidad/diferidos/:id` | `contabilidad.diferidos.read` |
| POST | `/api/contabilidad/diferidos` | `contabilidad.diferidos.crear` |
| POST | `/api/contabilidad/diferidos/devengar` | `contabilidad.diferidos.devengar` |
| DELETE | `/api/contabilidad/diferidos/:id` | `contabilidad.diferidos.cancelar` |
| POST | `/api/contabilidad/asiento-contable` | `contabilidad.asientos.crear` |
| GET | `/api/contabilidad/asientos-contables` | `contabilidad.asientos.read` |
| GET | `/api/contabilidad/asientos-contables/:id` | `contabilidad.asientos.read` |
| GET | `/api/contabilidad/asientos` | `contabilidad.asientos.read` |
| GET | `/api/contabilidad/asientos/estadisticas/por-tipo` | `contabilidad.asientos.read` |
| GET | `/api/contabilidad/asientos/:id` | `contabilidad.asientos.read` |
| PUT | `/api/contabilidad/asientos/:id` | `contabilidad.asientos.actualizar` |
| DELETE | `/api/contabilidad/asientos/:id` | `contabilidad.asientos.eliminar` |
| POST | `/api/contabilidad/asientos/:id/confirmar` | `contabilidad.asientos.confirmar` |
| POST | `/api/contabilidad/asientos/:id/anular` | `contabilidad.asientos.anular` |
| POST | `/api/contabilidad/asientos/:id/reversar` | `contabilidad.asientos.reversar` |
| GET | `/api/contabilidad/centros-costo` | `contabilidad.centros_costo.read` |
| GET | `/api/contabilidad/centros-costo/:id` | `contabilidad.centros_costo.read` |
| POST | `/api/contabilidad/centros-costo` | `contabilidad.centros_costo.crear` |
| PUT | `/api/contabilidad/centros-costo/:id` | `contabilidad.centros_costo.actualizar` |
| GET | `/api/contabilidad/centros-costo/:id/asientos` | `contabilidad.centros_costo.read` |
| GET | `/api/contabilidad/centros-costo/:id/reporte-gastos` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/partidas-abiertas` | `contabilidad.partidas.read` |
| GET | `/api/contabilidad/conciliaciones-partidas` | `contabilidad.partidas.read` |
| POST | `/api/contabilidad/conciliaciones-partidas` | `contabilidad.partidas.conciliar` |
| DELETE | `/api/contabilidad/conciliaciones-partidas/:id` | `contabilidad.partidas.desconciliar` |
| GET | `/api/contabilidad/consolidacion/grupos` | `contabilidad.reportes.read` |
| POST | `/api/contabilidad/consolidacion/grupos` | `contabilidad.reportes.actualizar` |
| POST | `/api/contabilidad/consolidacion/grupos/:grupoId/invitaciones` | `contabilidad.reportes.actualizar` |
| POST | `/api/contabilidad/consolidacion/grupos/:grupoId/respuesta` | `contabilidad.reportes.actualizar` |
| POST | `/api/contabilidad/consolidacion/grupos/:grupoId/tasas` | `contabilidad.reportes.actualizar` |
| POST | `/api/contabilidad/consolidacion/grupos/:grupoId/mapeos-cuentas` | `contabilidad.reportes.actualizar` |
| POST | `/api/contabilidad/consolidacion/grupos/:grupoId/ajustes` | `contabilidad.reportes.actualizar` |
| GET | `/api/contabilidad/reportes-configurables` | `contabilidad.reportes.read` |
| POST | `/api/contabilidad/reportes-configurables` | `contabilidad.reportes.actualizar` |
| GET | `/api/contabilidad/reportes-configurables/:reporteId/generar` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/estados/balance-comprobacion` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/estados/estado-resultados` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/estados/balance-general` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/estados/balance-comprobacion/formatted` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/estados/estado-resultados/formatted` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/estados/balance-general/formatted` | `contabilidad.reportes.read` |
| POST | `/api/contabilidad/estados/refrescar` | `contabilidad.reportes.actualizar` |
| GET | `/api/contabilidad/balance-general` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/flujo-efectivo` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/plan-cuentas` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/ratios-financieros` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/eventos/estadisticas` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/eventos/fallidos` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/eventos/dead-letter` | `contabilidad.reportes.read` |
| POST | `/api/contabilidad/eventos/:eventId/reintentar` | `contabilidad.eventos.reintentar` |
| GET | `/api/contabilidad/eventos/estadisticas-fallidos` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/libro-mayor/:cuentaCodigo` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/libro-mayor-completo` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/balance-comprobacion` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/kardex-valorizado` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/libro-caja-bancos` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/registro-activos-fijos` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/libro-planillas` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/libro-inventarios-balances` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/registro-costos` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/libros-electronicos-sunat` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/libro-diario` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/registro-ventas` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/registro-compras` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/registro-consignaciones` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/registro-consignaciones/productos` | `inventario.productos.read` |
| POST | `/api/contabilidad/registro-consignaciones` | `contabilidad.consignaciones.crear` |
| POST | `/api/contabilidad/registro-consignaciones/:id/estado` | `contabilidad.consignaciones.actualizar` |
| GET | `/api/contabilidad/ple/:libro` | `contabilidad.reportes.read` |
| GET | `/api/contabilidad/tipos-cambio` | `contabilidad.tipos_cambio.read` |
| GET | `/api/contabilidad/tipos-cambio/vigente` | `contabilidad.tipos_cambio.read` |
| GET | `/api/contabilidad/moneda-local` | `contabilidad.tipos_cambio.read` |
| POST | `/api/contabilidad/tipos-cambio` | `contabilidad.tipos_cambio.crear` |
| DELETE | `/api/contabilidad/tipos-cambio/:id` | `contabilidad.tipos_cambio.eliminar` |
| POST | `/api/contabilidad/tipos-cambio/importar` | `contabilidad.tipos_cambio.crear` |
| GET | `/api/contabilidad/padron-ruc/:ruc` | - |
| GET | `/api/contabilidad/revaluacion/simular` | `contabilidad.revaluacion.simular` |
| POST | `/api/contabilidad/revaluacion` | `contabilidad.revaluacion.ejecutar` |
| POST | `/api/contabilidad/periodos` | `contabilidad.periodos.crear` |
| GET | `/api/contabilidad/periodos` | `contabilidad.periodos.read` |
| GET | `/api/contabilidad/periodos/:id` | `contabilidad.periodos.read` |
| GET | `/api/contabilidad/periodos/:id/validar-cierre` | `contabilidad.periodos.validar` |
| POST | `/api/contabilidad/periodos/:id/cerrar` | `contabilidad.periodos.cerrar` |
| POST | `/api/contabilidad/periodos/:periodo/provision-cobranza-dudosa` | `contabilidad.asientos.crear` |
| POST | `/api/contabilidad/periodos/:id/reabrir` | `contabilidad.periodos.reabrir` |
| POST | `/api/contabilidad/periodos/:id/bloquear` | `contabilidad.periodos.bloquear` |
| POST | `/api/contabilidad/cierre-contable` | `contabilidad.cierre.ejecutar` |
| GET | `/api/contabilidad/plantillas-asientos` | `contabilidad.plantillas.read` |
| GET | `/api/contabilidad/plantillas-asientos/:id` | `contabilidad.plantillas.read` |
| POST | `/api/contabilidad/plantillas-asientos` | `contabilidad.plantillas.crear` |
| PUT | `/api/contabilidad/plantillas-asientos/:id` | `contabilidad.plantillas.actualizar` |
| DELETE | `/api/contabilidad/plantillas-asientos/:id` | `contabilidad.plantillas.eliminar` |
| POST | `/api/contabilidad/plantillas-asientos/:id/generar` | `contabilidad.plantillas.generar` |
| POST | `/api/contabilidad/presupuestos` | `contabilidad.presupuestos.crear` |
| GET | `/api/contabilidad/presupuestos` | `contabilidad.presupuestos.read` |
| GET | `/api/contabilidad/presupuestos/alertas` | `contabilidad.presupuestos.read` |
| GET | `/api/contabilidad/presupuestos/alertas/resumen` | `contabilidad.presupuestos.read` |
| GET | `/api/contabilidad/presupuestos/vista-ejecucion` | `contabilidad.presupuestos.read` |
| GET | `/api/contabilidad/presupuestos/:id/vista-ejecucion` | `contabilidad.presupuestos.read` |
| GET | `/api/contabilidad/presupuestos/:id` | `contabilidad.presupuestos.read` |
| PUT | `/api/contabilidad/presupuestos/:id` | `contabilidad.presupuestos.actualizar` |
| POST | `/api/contabilidad/presupuestos/:id/resolver-edicion` | `contabilidad.presupuestos.actualizar` |
| DELETE | `/api/contabilidad/presupuestos/:id` | `contabilidad.presupuestos.eliminar` |
| GET | `/api/contabilidad/presupuestos/centro/:centroId/periodo/:periodoId` | `contabilidad.presupuestos.read` |
| GET | `/api/contabilidad/presupuestos/comparacion/:periodoId` | `contabilidad.presupuestos.read` |
| POST | `/api/contabilidad/presupuestos/:id/actualizar-ejecucion` | `contabilidad.presupuestos.ejecucion` |
| POST | `/api/contabilidad/presupuestos/periodo/:periodoId/actualizar-ejecucion` | `contabilidad.presupuestos.ejecucion` |
| GET | `/api/contabilidad/impuestos/mensual` | `contabilidad.reportes.read` |
| POST | `/api/contabilidad/impuestos/mensual/calcular` | `contabilidad.reportes.read` |
| POST | `/api/contabilidad/impuestos/mensual` | `contabilidad.reportes.actualizar` |
| GET | `/api/contabilidad/impuestos/declaraciones` | `contabilidad.reportes.read` |
| POST | `/api/contabilidad/impuestos/declaraciones/:id/constancia` | `contabilidad.reportes.actualizar` |
| GET | `/api/contabilidad/impuestos/anual` | `contabilidad.reportes.read` |
| POST | `/api/contabilidad/impuestos/anual/calcular` | `contabilidad.reportes.read` |
| POST | `/api/contabilidad/impuestos/anual` | `contabilidad.reportes.actualizar` |
| GET | `/api/contabilidad/impuestos/anuales` | `contabilidad.reportes.read` |
| POST | `/api/contabilidad/impuestos/anuales/:id/constancia` | `contabilidad.reportes.actualizar` |

## cpe

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/cpe/baja/elegibles` | `cpe.comprobantes.anular` |
| GET | `/api/cpe/baja/lotes` | `cpe.comprobantes.consultar` |
| POST | `/api/cpe/baja/comunicacion` | `cpe.comprobantes.anular` |
| POST | `/api/cpe/baja/comunicacion/:id/enviar` | `cpe.comprobantes.enviar` |
| GET | `/api/cpe/baja/comunicacion/:id/estado` | `cpe.comprobantes.consultar` |
| POST | `/api/cpe/baja/resumen` | `cpe.comprobantes.anular` |
| POST | `/api/cpe/baja/resumen/:id/enviar` | `cpe.comprobantes.enviar` |
| GET | `/api/cpe/baja/resumen/:id/estado` | `cpe.comprobantes.consultar` |
| POST | `/api/cpe/worker/create` | - |
| POST | `/api/cpe/worker/:id/enviar-sunat` | - |
| GET | `/api/cpe/worker/:id/status` | - |
| GET | `/api/cpe/worker/comprobantes/:id/pdf` | - |
| POST | `/api/cpe` | `cpe.comprobantes.emitir` |
| GET | `/api/cpe` | `cpe.comprobantes.listar` |
| GET | `/api/cpe/notas-referenciadas/origenes` | `cpe.comprobantes.ver` |
| POST | `/api/cpe/notas-referenciadas` | `cpe.comprobantes.emitir` |
| POST | `/api/cpe/notas-referenciadas/:id/firmar` | `cpe.comprobantes.emitir` |
| GET | `/api/cpe/stats` | `cpe.reportes.ver` |
| POST | `/api/cpe/comprobantes` | `cpe.comprobantes.emitir` |
| GET | `/api/cpe/receptores` | `cpe.comprobantes.emitir` |
| GET | `/api/cpe/receptores/:clienteId` | `cpe.comprobantes.emitir` |
| POST | `/api/cpe/desktop/signed` | `cpe.comprobantes.emitir` |
| GET | `/api/cpe/comprobantes` | `cpe.comprobantes.listar` |
| POST | `/api/cpe/comprobantes/:id/vincular-cxc` | `finanzas.cxc.cobros.write` |
| GET | `/api/cpe/comprobantes/export` | `cpe.comprobantes.listar` |
| GET | `/api/cpe/comprobantes/:id` | `cpe.comprobantes.ver` |
| GET | `/api/cpe/comprobantes/:id/pdf` | `cpe.comprobantes.descargar_pdf` |
| POST | `/api/cpe/comprobantes/:id/enviar-sunat` | `cpe.comprobantes.enviar` |
| POST | `/api/cpe/:id/dian/eventos` | `cpe.dian.eventos_034.emitir` |
| POST | `/api/cpe/dian/eventos/:operationId/reintentar` | `cpe.dian.eventos_034.emitir` |
| POST | `/api/cpe/dian/facturas-recibidas/importar` | `cpe.dian.facturas_recibidas.gestionar` |
| POST | `/api/cpe/dian/facturas-recibidas/:id/eventos` | `cpe.dian.facturas_recibidas.gestionar` |
| POST | `/api/cpe/dian/facturas-recibidas/eventos/:operationId/reintentar` | `cpe.dian.facturas_recibidas.gestionar` |
| GET | `/api/cpe/dian/facturas-recibidas` | `cpe.dian.facturas_recibidas.ver` |
| GET | `/api/cpe/:id/anulacion-financiera` | `finanzas.cxc.cobros.revertir` |
| POST | `/api/cpe/:id/cobros/:pagoId/revertir` | `finanzas.cxc.cobros.revertir` |
| POST | `/api/cpe/:id/ajustes/:operacionId/revertir` | `finanzas.cxc.cobros.revertir` |
| POST | `/api/cpe/:id/anulacion/finalizar` | `cpe.comprobantes.anular` |
| GET | `/api/cpe/:id` | `cpe.comprobantes.ver` |
| GET | `/api/cpe/:id/xml` | `cpe.comprobantes.descargar_xml` |
| POST | `/api/cpe/:id/resend` | `cpe.comprobantes.reenviar` |
| GET | `/api/cpe/:id/status` | `cpe.comprobantes.consultar` |
| POST | `/api/cpe/:id/enviar-sunat` | `cpe.comprobantes.enviar` |
| POST | `/api/cpe/:id/anular` | `cpe.comprobantes.anular` |

## dashboard.controller.ts

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/dashboard/stats` | - |
| GET | `/api/dashboard/activities` | - |
| POST | `/api/dashboard/cache/invalidate` | `dashboard.stats.read` |

## demo

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/demo/create` | - |
| GET | `/api/demo/status` | - |
| GET | `/api/demo/planes` | - |
| POST | `/api/demo/convert-to-real` | - |
| GET | `/api/demo/conversiones-pendientes/:id/estado` | - |
| GET | `/api/demo/conversiones-pendientes` | - |
| POST | `/api/demo/conversiones-pendientes/:id/aprobar` | - |
| POST | `/api/demo/conversiones-pendientes/:id/rechazar` | - |
| POST | `/api/webhooks/stripe` | - |

## documentos.controller.ts

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/documentos/stats` | `documentos.stats.read` |
| GET | `/api/documentos/lista` | `documentos.read` |
| GET | `/api/documentos/config/series` | `documentos.series.read` |
| POST | `/api/documentos/config/series` | `documentos.series.write` |
| POST | `/api/documentos/validar-ruc` | `documentos.validations.run` |
| POST | `/api/documentos/validar-documento` | `documentos.validations.run` |
| POST | `/api/documentos/crear` | `documentos.create` |
| GET | `/api/documentos/:id` | `documentos.read` |
| PUT | `/api/documentos/:id` | `documentos.update` |
| POST | `/api/documentos/:id/generar-xml` | `documentos.generate_xml` |
| POST | `/api/documentos/:id/enviar-sunat` | `documentos.enviar_sunat` |
| GET | `/api/documentos/:id/descargar-pdf` | `documentos.download` |
| GET | `/api/documentos/:id/descargar-xml` | `documentos.download` |
| GET | `/api/documentos/:id/auditoria` | `documentos.audit.read` |
| POST | `/api/documentos/:id/anular` | `documentos.cancel` |

## finanzas

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/finanzas/bancos/cuentas` | `finanzas.bancos.ver` |
| GET | `/api/finanzas/bancos/cuentas/:id` | `finanzas.bancos.ver` |
| POST | `/api/finanzas/bancos/cuentas` | `finanzas.bancos.gestionar` |
| PUT | `/api/finanzas/bancos/cuentas/:id` | `finanzas.bancos.gestionar` |
| GET | `/api/finanzas/bancos/cuentas/:id/movimientos` | `finanzas.bancos.ver` |
| POST | `/api/finanzas/bancos/movimientos` | `finanzas.bancos.gestionar` |
| POST | `/api/finanzas/bancos/transferencias` | `finanzas.bancos.gestionar` |
| GET | `/api/finanzas/bancos/saldos` | `finanzas.bancos.ver` |
| GET | `/api/finanzas/bancos/cuentas/:id/movimientos/exportar` | `finanzas.bancos.ver` |
| GET | `/api/finanzas/bancos/movimientos/periodo` | `finanzas.bancos.ver` |
| GET | `/api/finanzas/conciliacion` | `finanzas.conciliacion.ver` |
| GET | `/api/finanzas/conciliacion/pendientes` | `finanzas.conciliacion.ver` |
| GET | `/api/finanzas/conciliacion/plantillas-csv` | `finanzas.conciliacion.ver` |
| POST | `/api/finanzas/conciliacion/plantillas-csv` | `finanzas.conciliacion.gestionar` |
| GET | `/api/finanzas/conciliacion/:id` | `finanzas.conciliacion.ver` |
| POST | `/api/finanzas/conciliacion` | `finanzas.conciliacion.gestionar` |
| POST | `/api/finanzas/conciliacion/:id/importar-csv` | `finanzas.conciliacion.gestionar` |
| POST | `/api/finanzas/conciliacion/:id/match-automatico` | `finanzas.conciliacion.gestionar` |
| POST | `/api/finanzas/conciliacion/:id/marcar-item` | `finanzas.conciliacion.gestionar` |
| POST | `/api/finanzas/conciliacion/:id/match-lote` | `finanzas.conciliacion.gestionar` |
| GET | `/api/finanzas/conciliacion/:id/diferencias` | `finanzas.conciliacion.ver` |
| POST | `/api/finanzas/conciliacion/:id/cerrar` | `finanzas.conciliacion.gestionar` |
| GET | `/api/finanzas/cxc` | `finanzas.cxc.read` |
| GET | `/api/finanzas/cxc/:id` | `finanzas.cxc.read` |
| POST | `/api/finanzas/cxc/:id/pagos` | `finanzas.cxc.cobros.write` |
| POST | `/api/finanzas/cxc/:id/notas-credito` | `finanzas.cxc.cobros.write` |
| POST | `/api/finanzas/cxc/:id/reprogramar` | `finanzas.cxc.cobros.write` |
| GET | `/api/finanzas/cxp` | `finanzas.cxp.ver` |
| GET | `/api/finanzas/cxp/aging` | `finanzas.cxp.ver` |
| GET | `/api/finanzas/cxp/vencimientos` | `finanzas.cxp.ver` |
| GET | `/api/finanzas/cxp/proveedores-mayor-deuda` | `finanzas.cxp.ver` |
| GET | `/api/finanzas/cxp/detracciones/tasas` | `finanzas.cxp.ver` |
| GET | `/api/finanzas/cxp/devoluciones-nota-credito` | `finanzas.cxp.ver` |
| GET | `/api/finanzas/cxp/:id` | `finanzas.cxp.ver` |
| POST | `/api/finanzas/cxp` | `finanzas.cxp.gestionar` |
| PUT | `/api/finanzas/cxp/:id` | `finanzas.cxp.gestionar` |
| POST | `/api/finanzas/cxp/:id/aplicar-pago` | `finanzas.cxp.gestionar` |
| GET | `/api/finanzas/cxp/:id/credito-movimientos` | `finanzas.cxp.ver` |
| POST | `/api/finanzas/cxp/:id/usar-credito` | `finanzas.cxp.gestionar` |
| POST | `/api/finanzas/cxp/:id/anular` | `finanzas.cxp.gestionar` |
| GET | `/api/finanzas/cxp/:id/pagos` | `finanzas.cxp.ver` |
| POST | `/api/finanzas/tesoreria/pagos` | `finanzas.tesoreria.gestionar` |
| GET | `/api/finanzas/tesoreria/pagos` | `finanzas.tesoreria.ver` |
| GET | `/api/finanzas/tesoreria/programacion` | `finanzas.tesoreria.ver` |
| POST | `/api/finanzas/tesoreria/lote` | `finanzas.tesoreria.gestionar` |
| GET | `/api/finanzas/tesoreria/flujo-caja` | `finanzas.tesoreria.ver` |

## finanzas.controller.ts

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/finanzas/dashboard` | `finanzas.read` |
| GET | `/api/finanzas/flujo-efectivo/proyectado` | `finanzas.read` |
| POST | `/api/finanzas/analisis-credito` | `finanzas.write` |
| GET | `/api/finanzas/historico/ventas` | `finanzas.read` |
| GET | `/api/finanzas/historico/gastos` | `finanzas.read` |
| GET | `/api/finanzas/historico/utilidad` | `finanzas.read` |

## general

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/` | - |
| GET | `/api/health` | - |
| GET | `/api/health/live` | - |
| GET | `/api/health/ready` | - |
| GET | `/api/health/version` | - |
| POST | `/api/test-connection` | `system.debug` |
| GET | `/api/info` | - |
| POST | `/api/retenciones/calcular` | `finanzas.read` |
| GET | `/api/retenciones` | `finanzas.read` |
| GET | `/api/retenciones/anticipos` | `finanzas.read` |
| POST | `/api/retenciones/anticipos` | `finanzas.write` |
| POST | `/api/retenciones/ajustes` | `finanzas.write` |
| POST | `/api/retenciones/:id/depositar-detraccion` | `finanzas.write` |
| POST | `/api/retenciones/:id/revertir-detraccion-proveedor` | `finanzas.cxp.gestionar` |
| POST | `/api/retenciones/:id/revertir-ajuste-cxc` | `finanzas.write` |
| GET | `/api/retenciones/:id` | `finanzas.read` |
| GET | `/api/observability/metrics` | - |
| GET | `/api/observability/health` | - |
| GET | `/api/observability/performance` | - |
| GET | `/api/observability/business` | - |
| GET | `/api/observability/trace` | - |

## gre

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/gre/guias` | `gre.guias.ver` |
| GET | `/api/gre/guias/catalogo-traslados` | `gre.guias.ver` |
| GET | `/api/gre/guias/:id` | `gre.guias.ver` |
| POST | `/api/gre/guias` | `gre.guias.emitir` |
| POST | `/api/gre/guias/:id/firmar` | `gre.guias.emitir` |
| POST | `/api/gre/guias/:id/enviar-sunat` | `gre.guias.enviar` |
| POST | `/api/gre/guias/:id/reenviar` | `gre.guias.reenviar` |
| POST | `/api/gre/guias/:id/consultar-sunat` | `gre.guias.consultar` |
| POST | `/api/gre/guias/:id/anular` | `gre.guias.emitir` |
| GET | `/api/gre/guias/:id/estado-sunat` | `gre.guias.ver` |
| GET | `/api/gre/guias/:id/xml` | `gre.guias.descargar_xml` |
| GET | `/api/gre/guias/:id/pdf` | `gre.guias.ver` |
| GET | `/api/gre/reporte` | `gre.reportes.ver` |
| GET | `/api/gre/stats` | `gre.reportes.ver` |
| POST | `/api/gre/evaluate-auto-creation` | `gre.configuracion.evaluar` |
| GET | `/api/gre/auto-config` | `gre.configuracion.ver` |
| POST | `/api/gre/auto-config` | `gre.configuracion.actualizar` |
| POST | `/api/gre/worker/:id/enviar-sunat` | - |

## help

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/help/search` | - |
| GET | `/api/help/sugerencias` | - |

## import-export

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/import-export/templates/comprobantes` | `import-export.templates.read` |
| POST | `/api/import-export/comprobantes/preview` | `import-export.comprobantes.preview` |
| GET | `/api/import-export/templates/catalogo` | `import-export.templates.read` |
| POST | `/api/import-export/catalogo/preview` | `import-export.catalogo.preview` |
| POST | `/api/import-export/catalogo/import` | `import-export.catalogo.import` |

## inventario

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/inventario/almacenes` | `inventario.almacenes.read` |
| POST | `/api/inventario/almacenes` | `inventario.almacenes.create` |
| PUT | `/api/inventario/almacenes/:almacenId` | `inventario.almacenes.update` |
| DELETE | `/api/inventario/almacenes/:almacenId` | `inventario.almacenes.delete` |
| GET | `/api/inventario/almacenes/:almacenId/ubicaciones` | `inventario.ubicaciones.read` |
| POST | `/api/inventario/almacenes/:almacenId/ubicaciones` | `inventario.ubicaciones.create` |
| PUT | `/api/inventario/almacenes/:almacenId/ubicaciones/:ubicacionId` | `inventario.ubicaciones.update` |
| DELETE | `/api/inventario/almacenes/:almacenId/ubicaciones/:ubicacionId` | `inventario.ubicaciones.delete` |
| GET | `/api/inventario/recepciones` | `inventario.ingresos.write` |
| GET | `/api/inventario/recepciones/:id` | `inventario.ingresos.write` |
| GET | `/api/inventario/kardex` | `inventario.kardex.read` |
| GET | `/api/inventario/stats` | `inventario.stats.read` |
| GET | `/api/inventario/productos` | `inventario.productos.read` |
| POST | `/api/inventario/productos` | `inventario.productos.create` |
| GET | `/api/inventario/movimientos` | `inventario.movimientos.read` |
| POST | `/api/inventario/movimientos/resolver` | `inventario.movimientos.create` |
| POST | `/api/inventario/transferencias/resolver` | `inventario.movimientos.create` |
| GET | `/api/inventario/movimientos/recibo` | `inventario.movimientos.create` |
| GET | `/api/inventario/transferencias/recibo` | `inventario.movimientos.create` |
| POST | `/api/inventario/movimientos` | `inventario.movimientos.create` |
| POST | `/api/inventario/transferencias` | `inventario.movimientos.create` |
| GET | `/api/inventario/productos/:id` | `inventario.productos.read` |
| DELETE | `/api/inventario/productos/:id` | `inventario.productos.delete` |
| PUT | `/api/inventario/productos/:id` | `inventario.productos.update` |
| POST | `/api/inventario/productos/:id/imagen` | `inventario.productos.update` |
| DELETE | `/api/inventario/productos/:id/imagen` | `inventario.productos.update` |
| GET | `/api/inventario/categorias` | `inventario.productos.read` |
| POST | `/api/inventario/categorias` | `inventario.productos.create` |
| PUT | `/api/inventario/categorias/:id` | `inventario.productos.update` |
| DELETE | `/api/inventario/categorias/:id` | `inventario.productos.delete` |
| GET | `/api/inventario/logistica/ordenes-pendientes` | `inventario.logistica.ver` |
| GET | `/api/inventario/logistica/listo-despacho` | `inventario.logistica.ver` |
| POST | `/api/inventario/logistica/:pedidoId/preparar` | `inventario.logistica.preparar` |
| POST | `/api/inventario/logistica/:pedidoId/marcar-listo` | `inventario.logistica.preparar` |
| POST | `/api/inventario/logistica/:pedidoId/confirmar-despacho` | `inventario.logistica.despachar` |
| GET | `/api/inventario/logistica/:pedidoId/backorders` | `inventario.logistica.ver` |
| POST | `/api/inventario/logistica/:pedidoId/backorders/:detalleId/reprogramar` | `inventario.logistica.despachar` |
| POST | `/api/inventario/logistica/:pedidoId/registrar-entrega` | `inventario.logistica.despachar` |
| POST | `/api/inventario/logistica/:pedidoId/tracking` | `inventario.logistica.despachar` |
| GET | `/api/inventario/logistica/:pedidoId/eventos` | `inventario.logistica.ver` |
| POST | `/api/inventario/logistica/:pedidoId/eventos` | `inventario.logistica.despachar` |
| GET | `/api/inventario/lotes/productos` | `inventario.lotes.read` |
| GET | `/api/inventario/lotes/por-vencer` | `inventario.lotes.read` |
| GET | `/api/inventario/lotes/productos/:id` | `inventario.lotes.read` |
| GET | `/api/inventario/lotes/productos/:id/movimientos` | `inventario.lotes.read` |
| PUT | `/api/inventario/lotes/productos/:id/politica` | `inventario.lotes.manage` |
| POST | `/api/inventario/lotes/productos/:id/regularizaciones` | `inventario.lotes.manage` |
| POST | `/api/inventario/lotes/productos/:id/reservas/reasignar` | `inventario.lotes.manage` |

## metrics

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/metrics/summary` | - |
| GET | `/api/metrics/health` | - |

## migration

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/migration/templates/:runType` | `migration.templates.read` |
| POST | `/api/migration/preview` | `migration.preview` |
| POST | `/api/migration/clientes/import` | `migration.clientes.import` |
| POST | `/api/migration/proveedores/import` | `migration.proveedores.import` |
| POST | `/api/migration/cxc/import` | `migration.cxc.import` |
| POST | `/api/migration/cxp/import` | `migration.cxp.import` |
| POST | `/api/migration/balance-apertura/import` | `migration.balance_apertura.import` |
| POST | `/api/migration/stock-inicial/import` | `migration.stock_inicial.import` |
| POST | `/api/migration/comprobantes/import` | `migration.comprobantes.import` |
| POST | `/api/migration/contratos-suministro/import` | `migration.suministro.import` |
| POST | `/api/migration/oc-suministro/import` | `migration.suministro.import` |
| POST | `/api/migration/cronograma-suministro/import` | `migration.suministro.import` |
| POST | `/api/migration/origen/:runType/import` | `migration.origen.import` |
| POST | `/api/migration/origen/archivo/lotes` | `migration.archivo.import` |
| POST | `/api/migration/origen/archivo/lotes/:id/filas` | `migration.archivo.import` |
| POST | `/api/migration/origen/archivo/lotes/:id/cerrar` | `migration.archivo.import` |
| POST | `/api/migration/origen/archivo/lotes/:id/descartar` | `migration.archivo.import` |
| GET | `/api/migration/origen/archivo` | `migration.archivo.read` |
| POST | `/api/migration/origen/ensayo` | `migration.origen.import` |
| POST | `/api/migration/origen/conciliacion` | `migration.validar.read` |
| GET | `/api/migration/runs` | `migration.runs.read` |
| GET | `/api/migration/runs/:id` | `migration.runs.read` |
| GET | `/api/migration/validar-apertura` | `migration.validar.read` |

## notifications.controller.ts

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/notifications` | - |
| GET | `/api/notifications/unread` | - |
| GET | `/api/notifications/unread-count` | - |
| POST | `/api/notifications` | `notifications.create` |
| PUT | `/api/notifications/:id/read` | - |
| PUT | `/api/notifications/mark-all-read` | - |
| DELETE | `/api/notifications/:id` | `notifications.delete` |

## paises

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/paises` | - |
| GET | `/api/paises/:codigo/configuracion-fiscal` | - |
| GET | `/api/paises/:codigo/libros-requeridos` | - |
| GET | `/api/paises/:id/configuracion` | - |
| GET | `/api/paises/usuario/configuracion` | `paises.usuario.read` |
| PUT | `/api/paises/usuario/configuracion` | `paises.usuario.update` |
| GET | `/api/paises/:codigo/validar-documento/:documento` | - |

## permissions

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/permissions` | `users.manage` |
| GET | `/api/roles` | `users.manage` |
| GET | `/api/roles/:id` | `users.manage` |
| POST | `/api/roles` | `users.manage` |
| PUT | `/api/roles/:id` | `users.manage` |
| DELETE | `/api/roles/:id` | `users.manage` |
| GET | `/api/roles/:id/permissions` | `users.manage` |
| POST | `/api/roles/:id/permissions` | `users.manage` |
| DELETE | `/api/roles/:id/permissions/:permissionId` | `users.manage` |
| GET | `/api/roles/:id/users` | `users.manage` |

## pos

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/pos/productos` | `pos.read` |
| GET | `/api/pos/clientes` | `pos.read` |
| GET | `/api/pos/metodos-pago` | `pos.read` |
| GET | `/api/pos/empresa-config` | `pos.read` |
| GET | `/api/pos/sesion-caja` | `pos.read` |
| GET | `/api/pos/ventas-recientes` | `pos.read` |
| POST | `/api/pos/venta` | `pos.vender` |
| POST | `/api/pos/ventas/:ventaId/canjear-ticket` | `pos.ticket.canjear` |
| POST | `/api/pos/caja/abrir` | `pos.caja.write` |
| POST | `/api/pos/caja/cerrar` | `pos.caja.write` |
| GET | `/api/pos/detalles-venta/:id` | `pos.read` |
| POST | `/api/pos/configurar-certificado` | `pos.configuracion.write` |
| GET | `/api/pos/configuration-status` | `pos.read` |
| GET | `/api/pos/ventas-pendientes-facturacion` | `pos.read` |
| GET | `/api/pos/facturacion/:ventaId` | `pos.read` |
| POST | `/api/pos/reintentar-facturacion/:ventaId` | `pos.vender` |
| POST | `/api/pos/worker/procesar-pendientes` | - |

## reports.controller.ts

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/reports/ventas` | `reports.ventas.read` |
| GET | `/api/reports/ventas/export/excel` | `reports.ventas.export` |
| GET | `/api/reports/inventario` | `reports.inventario.read` |

## rrhh

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/rrhh/empleados` | `rrhh.access` |
| GET | `/api/rrhh/departamentos` | `rrhh.access` |
| GET | `/api/rrhh/configuracion-laboral` | `rrhh.access` |
| GET | `/api/rrhh/configuracion-laboral/peru/normativa` | `configuracion.read` |
| PUT | `/api/rrhh/configuracion-laboral/peru/normativa` | `configuracion.write` |
| PUT | `/api/rrhh/configuracion-laboral/argentina` | `rrhh.access` |
| PUT | `/api/rrhh/configuracion-laboral/colombia` | `rrhh.access` |
| POST | `/api/rrhh/configuracion-laboral/colombia/pila/test` | `rrhh.access` |
| POST | `/api/rrhh/empleados` | `rrhh.access` |
| PUT | `/api/rrhh/empleados/:id` | `rrhh.access` |
| DELETE | `/api/rrhh/empleados/:id` | `rrhh.access` |
| POST | `/api/rrhh/departamentos` | `rrhh.access` |
| GET | `/api/rrhh/planillas` | `rrhh.planillas.read` |
| GET | `/api/rrhh/planillas/tesoreria/destinos` | `rrhh.planillas.pay` |
| POST | `/api/rrhh/planillas` | `rrhh.planillas.create` |
| POST | `/api/rrhh/planillas/crear-con-calculo` | `rrhh.planillas.create` |
| POST | `/api/rrhh/planillas/crear-con-calculo/resolver` | `rrhh.planillas.create` |
| POST | `/api/rrhh/planillas/:id/calcular` | `rrhh.planillas.calculate` |
| GET | `/api/rrhh/planillas/:id/detalle` | `rrhh.planillas.read` |
| GET | `/api/rrhh/boleta/:empleadoPlanillaId` | `rrhh.planillas.read` |
| PUT | `/api/rrhh/planillas/:id` | `rrhh.planillas.create` |
| POST | `/api/rrhh/planillas/:id/aprobar` | `rrhh.planillas.approve` |
| DELETE | `/api/rrhh/planillas/:id` | `rrhh.planillas.create` |
| GET | `/api/rrhh/conceptos` | `rrhh.access` |
| POST | `/api/rrhh/planillas/:id/calcular-personalizada` | `rrhh.planillas.calculate` |
| POST | `/api/rrhh/planillas/:id/calcular-personalizada/resolver` | `rrhh.planillas.calculate` |
| GET | `/api/rrhh/pagos` | `rrhh.planillas.read` |
| PUT | `/api/rrhh/pagos/:id/procesar` | `rrhh.planillas.pay` |
| POST | `/api/rrhh/planillas/:id/pagar` | `rrhh.planillas.pay` |
| POST | `/api/rrhh/planillas/:id/pagar-empleados` | `rrhh.planillas.pay` |
| POST | `/api/rrhh/planillas/:id/generar-asientos` | `rrhh.planillas.accounting` |
| GET | `/api/rrhh/peru/planilla-electronica/:planillaId/preview` | `rrhh.planilla_electronica.read` |
| PUT | `/api/rrhh/peru/planilla-electronica/empleados/:empleadoId/ficha` | `rrhh.planilla_electronica.write` |
| PUT | `/api/rrhh/peru/planilla-electronica/detalles/:detalleId/jornada` | `rrhh.planilla_electronica.write` |
| POST | `/api/rrhh/peru/planilla-electronica/:planillaId/paquetes` | `rrhh.planilla_electronica.write` |
| GET | `/api/rrhh/peru/planilla-electronica/paquetes/historial` | `rrhh.planilla_electronica.read` |
| POST | `/api/rrhh/peru/planilla-electronica/paquetes/:id/evidencia` | `rrhh.planilla_electronica.write` |
| GET | `/api/rrhh/peru/planilla-electronica/paquetes/:id/descargar` | `rrhh.planilla_electronica.read` |
| GET | `/api/rrhh/planillas/:id/historial-pagos` | `rrhh.planillas.read` |
| GET | `/api/rrhh/pagos/:id/comprobante` | `rrhh.planillas.read` |
| GET | `/api/rrhh/empleados/:id/boleta-pago/:mes` | `rrhh.planillas.read` |
| GET | `/api/rrhh/contratos` | `rrhh.access` |
| POST | `/api/rrhh/contratos` | `rrhh.access` |
| POST | `/api/rrhh/contratos/:id/renovar` | `rrhh.access` |
| PUT | `/api/rrhh/contratos/:id/finalizar` | `rrhh.access` |
| GET | `/api/rrhh/contratos/:id/generar` | `rrhh.access` |
| GET | `/api/rrhh/asistencias` | `rrhh.access` |
| POST | `/api/rrhh/asistencias/marcar` | `rrhh.access` |
| GET | `/api/rrhh/vacantes` | `rrhh.access` |
| POST | `/api/rrhh/vacantes` | `rrhh.access` |
| GET | `/api/rrhh/candidatos` | `rrhh.access` |
| POST | `/api/rrhh/candidatos` | `rrhh.access` |
| PUT | `/api/rrhh/candidatos/:id` | `rrhh.access` |
| PUT | `/api/rrhh/candidatos/:id/estado` | `rrhh.access` |
| POST | `/api/rrhh/asistencia/entrada/:empleadoId` | `rrhh.access` |
| POST | `/api/rrhh/asistencia/salida/:empleadoId` | `rrhh.access` |
| GET | `/api/rrhh/asistencia` | `rrhh.access` |
| GET | `/api/rrhh/solicitudes` | `rrhh.access` |
| POST | `/api/rrhh/solicitudes` | `rrhh.access` |
| PUT | `/api/rrhh/solicitudes/:id/aprobar` | `rrhh.access` |
| PUT | `/api/rrhh/solicitudes/:id/rechazar` | `rrhh.access` |
| GET | `/api/rrhh/beneficios` | `rrhh.access` |
| GET | `/api/rrhh/empleados/:id/beneficios` | `rrhh.access` |
| POST | `/api/rrhh/empleados/:id/beneficios` | `rrhh.access` |
| GET | `/api/rrhh/evaluaciones` | `rrhh.access` |
| POST | `/api/rrhh/evaluaciones` | `rrhh.access` |
| PUT | `/api/rrhh/evaluaciones/:id` | `rrhh.access` |
| GET | `/api/rrhh/capacitaciones` | `rrhh.access` |
| GET | `/api/rrhh/empleados/:id/capacitaciones` | `rrhh.access` |
| POST | `/api/rrhh/empleados/:id/capacitaciones` | `rrhh.access` |
| GET | `/api/rrhh/liquidaciones/tesoreria/destinos` | `rrhh.liquidaciones.pay` |
| GET | `/api/rrhh/cts/tesoreria/destinos` | `rrhh.cts.deposit` |
| GET | `/api/rrhh/liquidaciones` | `rrhh.planillas.read` |
| POST | `/api/rrhh/empleados/:id/liquidacion` | `rrhh.liquidaciones.calculate` |
| POST | `/api/rrhh/liquidaciones/:id/confirmar` | `rrhh.liquidaciones.approve` |
| POST | `/api/rrhh/liquidaciones/:id/pagar` | `rrhh.liquidaciones.pay` |
| POST | `/api/rrhh/liquidaciones/:id/pago/revertir` | `rrhh.liquidaciones.reverse` |
| GET | `/api/rrhh/cts/depositos` | `rrhh.planillas.read` |
| POST | `/api/rrhh/cts/depositos` | `rrhh.cts.calculate` |
| POST | `/api/rrhh/cts/depositos/:id/depositar` | `rrhh.cts.deposit` |
| GET | `/api/rrhh/horarios` | `rrhh.access` |
| POST | `/api/rrhh/empleados/:id/horario` | `rrhh.access` |
| GET | `/api/rrhh/empleados/:id/expediente` | `rrhh.access` |
| POST | `/api/rrhh/empleados/:id/expediente` | `rrhh.access` |
| GET | `/api/rrhh/dashboard` | `rrhh.access` |

## security

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/security/dashboard/stats` | `security.audit.read` |
| GET | `/api/security/dashboard/violations-by-table` | `security.audit.read` |
| GET | `/api/security/dashboard/violations-recent` | `security.audit.read` |
| GET | `/api/security/dashboard/violations-by-user` | `security.audit.read` |
| GET | `/api/security/dashboard/violations-hourly` | `security.audit.read` |
| GET | `/api/security/dashboard/alerts-recent` | `security.audit.read` |
| GET | `/api/security/rls/violations` | `security.audit.read` |
| GET | `/api/security/dashboard/alerts-unacknowledged` | `security.audit.read` |
| GET | `/api/security/dashboard/security-report` | `security.audit.read` |

## sire

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/sire/stats` | `sire.read` |
| GET | `/api/sire/reportes` | `sire.read` |
| POST | `/api/sire/generar-reporte` | `sire.emitir` |
| GET | `/api/sire/reportes/:id/download` | `sire.read` |
| POST | `/api/sire/reportes/:id/enviar-sunat` | `sire.emitir` |
| POST | `/api/sire/reportes/:id/consultar-ticket` | `sire.emitir` |
| GET | `/api/sire/reportes/:id/operaciones` | `sire.read` |

## sucursales

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/sucursales` | `configuracion.sucursales.read` |
| GET | `/api/sucursales/resumen` | `configuracion.sucursales.read` |
| GET | `/api/sucursales/:id` | `configuracion.sucursales.read` |
| POST | `/api/sucursales` | `configuracion.sucursales.create` |
| PUT | `/api/sucursales/:id` | `configuracion.sucursales.update` |
| POST | `/api/sucursales/:id/series` | `configuracion.sucursales.update` |
| DELETE | `/api/sucursales/:id` | `configuracion.sucursales.delete` |
| GET | `/api/sucursales/usuarios/:usuarioId` | `configuracion.sucursales.assign` |
| PUT | `/api/sucursales/usuarios/:usuarioId` | `configuracion.sucursales.assign` |

## tableros

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/reportes/suministro` | `reports.suministro.read` |
| POST | `/api/reportes/suministro/cortes` | `reports.suministro.export` |
| GET | `/api/reportes/suministro/cortes/:id/excel` | `reports.suministro.export` |
| GET | `/api/integraciones/bi/credenciales` | `integraciones.bi.gestionar` |
| POST | `/api/integraciones/bi/credenciales` | `integraciones.bi.gestionar` |
| POST | `/api/integraciones/bi/credenciales/:id/revocar` | `integraciones.bi.gestionar` |
| GET | `/api/:dataset` | - |

## tenants

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/tenants` | `tenants.manage` |
| GET | `/api/tenants/me` | - |
| GET | `/api/tenants/:id` | - |
| POST | `/api/tenants` | `tenants.manage` |
| PUT | `/api/tenants/:id` | `tenants.manage` |
| POST | `/api/tenants/:id/activate` | `tenants.manage` |
| POST | `/api/tenants/:id/deactivate` | `tenants.manage` |
| GET | `/api/tenants/:id/users` | `tenants.manage` |
| GET | `/api/tenants/:id/stats` | `tenants.manage` |
| POST | `/api/tenants/:id/demo/activate` | `tenants.manage` |
| POST | `/api/tenants/:id/demo/deactivate` | `tenants.manage` |

## usuarios

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/users` | `users.manage` |
| GET | `/api/users/:id` | `users.manage` |
| POST | `/api/users` | `users.manage` |
| PUT | `/api/users/:id` | `users.manage` |
| DELETE | `/api/users/:id` | `users.manage` |
| POST | `/api/users/:id/activate` | `users.manage` |
| POST | `/api/users/:id/deactivate` | `users.manage` |
| POST | `/api/users/:id/reset-password` | `users.manage` |
| GET | `/api/users/:id/roles` | `users.manage` |
| POST | `/api/users/:id/roles` | `users.manage` |
| DELETE | `/api/users/:id/roles/:roleId` | `users.manage` |
| GET | `/api/users/:id/permissions` | `users.manage` |
| GET | `/api/users/:id/audit-logs` | `users.manage` |

## usuarios.controller.ts

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/` | `configuracion + ver + usuarios` |
| GET | `/api/stats` | `configuracion + ver + usuarios` |
| GET | `/api/roles` | `configuracion + ver + usuarios` |
| POST | `/api/crear` | `users.manage` |
| PUT | `/api/:id` | `users.manage` |
| PUT | `/api/:id/estado` | `users.manage` |
| DELETE | `/api/:id` | `users.manage` |
| GET | `/api/me/permissions` | - |
| GET | `/api/:id/permissions` | `configuracion + ver + usuarios` |
| GET | `/api/:id` | `configuracion + ver + usuarios` |

## validations

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/validations/certificate` | `validations.run` |
| POST | `/api/validations/ruc` | `validations.run` |
| POST | `/api/validations/document` | `validations.run` |
| GET | `/api/validations/status` | `validations.run` |
| POST | `/api/validations/dni-lookup` | `validations.run` |

## ventas

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/ventas/clientes` | `ventas.clientes.ver` |
| POST | `/api/ventas/clientes` | `ventas.clientes.crear` |
| GET | `/api/ventas/clientes/:id` | `ventas.clientes.ver` |
| PUT | `/api/ventas/clientes/:id` | `ventas.clientes.editar` |
| DELETE | `/api/ventas/clientes/:id` | `ventas.clientes.eliminar` |
| POST | `/api/ventas/clientes/validar-ruc` | `ventas.clientes.validar_ruc` |
| GET | `/api/ventas/comercial/catalogos` | `ventas.precios.ver` |
| GET | `/api/ventas/comercial/listas-precios` | `ventas.precios.ver` |
| POST | `/api/ventas/comercial/listas-precios` | `ventas.precios.gestionar` |
| PATCH | `/api/ventas/comercial/listas-precios/:id/estado` | `ventas.precios.gestionar` |
| POST | `/api/ventas/comercial/precios/resolver` | `ventas.precios.ver` |
| GET | `/api/ventas/comercial/comisiones/reglas` | `ventas.comisiones.ver` |
| POST | `/api/ventas/comercial/comisiones/reglas` | `ventas.comisiones.gestionar` |
| PATCH | `/api/ventas/comercial/comisiones/reglas/:id/estado` | `ventas.comisiones.gestionar` |
| GET | `/api/ventas/comercial/comisiones/movimientos` | `ventas.comisiones.ver` |
| GET | `/api/ventas/comercial/consolidados/candidatos` | `ventas.consolidados.crear` |
| GET | `/api/ventas/comercial/consolidados` | `ventas.consolidados.ver` |
| GET | `/api/ventas/comercial/consolidados/:id` | `ventas.consolidados.ver` |
| POST | `/api/ventas/comercial/consolidados` | `ventas.consolidados.crear` |
| GET | `/api/ventas/contratos` | `ventas.contratos.ver` |
| GET | `/api/ventas/contratos/catalogos/:tipo` | `ventas.contratos.ver` |
| GET | `/api/ventas/contratos/:id` | `ventas.contratos.ver` |
| POST | `/api/ventas/contratos` | `ventas.contratos.gestionar` |
| PUT | `/api/ventas/contratos/:id` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/:id/activar` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/:id/anular` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/:id/ordenes-cliente` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/:id/adendas` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/ordenes-cliente/:id/modificar` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/ordenes-cliente/:id/anular` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/:id/entregas` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/entregas/:id/reprogramar` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/entregas/:id/anular` | `ventas.contratos.gestionar` |
| GET | `/api/ventas/contratos/:id/ejecucion` | `ventas.contratos.ver` |
| GET | `/api/ventas/contratos/:id/estado-cuenta` | `ventas.contratos.ver` |
| PUT | `/api/ventas/contratos/:id/facturacion` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/:id/recepciones` | `ventas.contratos.conformar` |
| POST | `/api/ventas/contratos/:id/recepciones/:recepcionId/anular` | `ventas.contratos.conformar` |
| POST | `/api/ventas/contratos/:id/recepciones/:recepcionId/adjuntos` | `ventas.contratos.conformar` |
| GET | `/api/ventas/contratos/origen-pedido/:pedidoId` | `ventas.pedidos.ver` |
| GET | `/api/ventas/contratos/:id/pedidos` | `ventas.contratos.ver` |
| GET | `/api/ventas/contratos/:id/pedidos/candidatos` | `ventas.contratos.ver` |
| GET | `/api/ventas/contratos/:id/pedidos/candidatos/:pedidoId` | `ventas.contratos.ver` |
| POST | `/api/ventas/contratos/:id/pedidos/:pedidoId/vincular` | `ventas.contratos.gestionar` |
| POST | `/api/ventas/contratos/:id/pedidos/:pedidoId/desvincular` | `ventas.contratos.gestionar` |
| GET | `/api/ventas/contratos/:id/adjuntos` | `ventas.contratos.ver` |
| POST | `/api/ventas/contratos/:id/adjuntos` | `ventas.contratos.gestionar` |
| GET | `/api/ventas/contratos/:id/adjuntos/:adjuntoId/descarga` | `ventas.contratos.ver` |
| POST | `/api/ventas/contratos/:id/adjuntos/:adjuntoId/retirar` | `ventas.contratos.gestionar` |
| GET | `/api/ventas/contratos/:id/penalidades` | `ventas.penalidades.ver` |
| POST | `/api/ventas/contratos/:id/penalidades/reglas` | `ventas.penalidades.gestionar` |
| POST | `/api/ventas/contratos/:id/penalidades/reglas/:grupoId/anular` | `ventas.penalidades.gestionar` |
| POST | `/api/ventas/contratos/:id/penalidades/excepciones` | `ventas.penalidades.gestionar` |
| POST | `/api/ventas/contratos/:id/penalidades/calcular` | `ventas.penalidades.gestionar` |
| POST | `/api/ventas/contratos/:id/penalidades/calculos/:calculoId/revisar` | `ventas.penalidades.aprobar` |
| GET | `/api/ventas/cotizaciones` | `ventas.cotizaciones.ver` |
| POST | `/api/ventas/cotizaciones` | `ventas.cotizaciones.crear` |
| GET | `/api/ventas/cotizaciones/:id` | `ventas.cotizaciones.ver` |
| PUT | `/api/ventas/cotizaciones/:id` | `ventas.cotizaciones.editar` |
| DELETE | `/api/ventas/cotizaciones/:id` | `ventas.cotizaciones.eliminar` |
| POST | `/api/ventas/cotizaciones/:id/enviar` | `ventas.cotizaciones.editar` |
| POST | `/api/ventas/cotizaciones/:id/aprobar` | `ventas.cotizaciones.approve` |
| POST | `/api/ventas/cotizaciones/:id/rechazar` | `ventas.cotizaciones.approve` |
| POST | `/api/ventas/cotizaciones/:id/convertir-pedido` | `ventas.cotizaciones.convertir_pedido` |
| GET | `/api/ventas/cotizaciones/:id/historial` | `ventas.cotizaciones.ver` |
| GET | `/api/ventas/pedidos` | `ventas.pedidos.ver` |
| POST | `/api/ventas/pedidos` | `ventas.pedidos.crear` |
| GET | `/api/ventas/pedidos/aprobaciones/pendientes` | `ventas.pedidos_aprobaciones.ver` |
| GET | `/api/ventas/pedidos/:id/aprobaciones` | `ventas.pedidos_aprobaciones.ver` |
| POST | `/api/ventas/pedidos/:id/aprobaciones/decision` | `ventas.pedidos_aprobaciones.resolver` |
| GET | `/api/ventas/pedidos/:id` | `ventas.pedidos.ver` |
| PUT | `/api/ventas/pedidos/:id` | `ventas.pedidos.editar` |
| POST | `/api/ventas/pedidos/:id/confirmar` | `ventas.pedidos.confirmar` |
| POST | `/api/ventas/pedidos/:id/cancelar` | `ventas.pedidos.cancelar` |
| POST | `/api/ventas/pedidos/:id/generar-factura` | `ventas.pedidos.generar_factura` |
| GET | `/api/ventas/pedidos/:id/historial` | `ventas.pedidos.ver_historial` |
| GET | `/api/ventas/pedidos/:id/gres` | `ventas.pedidos.ver_gre` |
| POST | `/api/ventas/pedidos/:id/generar-documento` | `ventas.pedidos.generar_factura` |
| GET | `/api/ventas/reportes/ventas-por-cliente` | `ventas.reportes.ver` |
| GET | `/api/ventas/reportes/cotizaciones-pendientes` | `ventas.reportes.ver` |
| GET | `/api/ventas/reportes/pedidos-por-estado` | `ventas.reportes.ver` |
| GET | `/api/ventas/reportes/productos-mas-vendidos` | `ventas.reportes.ver` |
| GET | `/api/ventas/reportes/top-clientes` | `ventas.reportes.ver` |
| GET | `/api/ventas/reportes/lead-time` | `ventas.reportes.ver` |
| GET | `/api/ventas/reportes/pipeline` | `ventas.reportes.ver` |
| GET | `/api/ventas/reportes/fill-rate` | `ventas.reportes.ver` |
| GET | `/api/ventas/reportes/cxc-aging` | `ventas.reportes.ver` |
| GET | `/api/ventas/reportes/sunat-kpis` | `ventas.reportes.ver` |
| GET | `/api/ventas/rma` | `ventas.rma.ver` |
| GET | `/api/ventas/rma/saldos-favor` | `ventas.rma.ver` |
| GET | `/api/ventas/rma/candidatos` | `ventas.rma.crear` |
| GET | `/api/ventas/rma/recursos-recepcion` | `ventas.rma.recepcionar` |
| GET | `/api/ventas/rma/medios-reembolso` | `ventas.rma.reembolsar` |
| GET | `/api/ventas/rma/saldos-favor/:id/cxc-aplicables` | `ventas.rma.generar_nota_credito` |
| GET | `/api/ventas/rma/saldos-favor/:id` | `ventas.rma.ver` |
| GET | `/api/ventas/rma/:id` | `ventas.rma.ver` |
| POST | `/api/ventas/rma` | `ventas.rma.crear` |
| POST | `/api/ventas/rma/:id/aprobar` | `ventas.rma.aprobar` |
| POST | `/api/ventas/rma/:id/recepcionar` | `ventas.rma.recepcionar` |
| POST | `/api/ventas/rma/:id/revertir-recepcion` | `ventas.rma.recepcionar` |
| POST | `/api/ventas/rma/:id/nota-credito` | `ventas.rma.generar_nota_credito` |
| POST | `/api/ventas/rma/saldos-favor/:id/aplicar` | `ventas.rma.generar_nota_credito` |
| POST | `/api/ventas/rma/saldos-favor/:id/reembolsar` | `ventas.rma.reembolsar` |
| POST | `/api/ventas/rma/saldos-favor/:id/reembolsos/:movimientoId/revertir` | `ventas.rma.revertir_reembolso` |
