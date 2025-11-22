# Plan de mejoras POS y ventas (para superar Senda)



recomiendo, no incluir nada en el archivo pos o los archivos pos ya sea controlador, page, o cualquiera que supere las 500 lineas, porque serian imposibles de mantenener, propongo crear en la misma carpeta de pos componentes que complementen y del archivo pos se llamen a esos componentes y asi sea mas facil de mantener y lo hacemos con buenas practicas. 

## Prioridad 1 (corto plazo)
- Importar/Exportar masivo de comprobantes y catálogos (plantillas Excel/CSV, validación previa, vista previa de errores, resumen de importación).
- Filtros avanzados de comprobantes (fecha/mes, tipo, serie, estado CPE/GRE, moneda) y exportación desde “Mis Comprobantes”.
- Emisión avanzada: serie/correlativo editables, tipo documento SUNAT, afectación IGV por ítem, condición de pago, moneda y tipo de cambio, vendedor, sucursal, almacén, O/C y glosa. Botones Emitir / Emitir+Imprimir / Emitir+WhatsApp / Guardar borrador.
- Normalización de comprobante en POS: generar serie/correlativo válidos y enviar tipo de comprobante (Factura/Boleta/Nota).
**Estado**: completado (backend + frontend CPE)

## Prioridad 2 (medio plazo)
- Catálogo unificado Productos/Servicios:
  - Flags `es_servicio`, `controla_stock`, `afectacion_igv`, `tipo_operacion`, clasificadores SUNAT, fotos.
  - Multi-sucursal: precio por sucursal, stock por sucursal (si controla stock).
  - Servicios vendibles en POS (sin stock por defecto, opcional stock virtual/cupos), modificadores/grupos.
  - Import/export de catálogo con servicios.
- Cajas y tesorería POS:
  - Catálogo de cajas (sucursal, almacén, dispositivo, tipo, estado).
  - Apertura: selección de cajero (autoseleccionar si hay uno), monto inicial, dispositivo/terminal.
  - Cierre: reporte por cajero (ventas, medios de pago, anulaciones/NC, sobrantes/faltantes).
  - Resumen de cajas: filtros por fecha/estado/moneda/cajero, totales, reimpresión de reportes.

**Estado**: Implementado en código (migraciones 109/110, API de inventario con campos nuevos y multi-sucursal, import/export, vistas POS, endpoints de cajas/sesiones, POS refactor con componentes).  
**Pendientes para cerrar**:
- Validar manualmente create/update de producto con `precios_sucursal` y `stock_sucursal`, y `es_servicio=true` (no debe tocar stock).
- Dejar tests del API en verde: corregir mocks en specs de EmailService (SMTP/config, texto esperado), añadir provider de EventBusService en contabilidad, ampliar mocks de Supabase en CxC y Recepciones para `single/maybeSingle`, ajustar urgencia en tesorería.

## Prioridad 3 (después de estabilizar)
- Reportes de ventas (por fecha, vendedor, sucursal, almacén, medio de pago) con exportación.
- Descargas de CPE (XML/PDF) históricas (“Mis Descargas”).
- Acciones rápidas en emisión: plantillas de WhatsApp/Email con links a CPE/GRE.
- Mejoras de UX en POS:
  - Buscador de productos/servicios con autocompletar y stock/afectación visible.
  - Cliente rápido (DNI/RUC) con búsqueda y creación inline.
  - Descuentos por ítem y por documento; notificaciones de stock mínimo; indicadores GRE automáticas.
**Estado**: Completado en código (reporte de ventas con resumen + UI, descargas CPE históricas, acciones rápidas WhatsApp/Email, cliente rápido, autocompletar, descuentos rápidos y avisos de stock en POS). Validar en entorno.

### Tests pendientes (documentado)
- email.service.spec.ts: mock SMTP/config y texto “Restablecer contraseña”; evitar loop en config para sendgrid/aws-ses.
- contabilidad-events.listener.spec.ts: inyectar mock de EventBusService.
- cxc-factura-event.spec.ts / cxc-cobro-event.spec.ts: mocks de Supabase con `maybeSingle`/`single` en todas las ramas.
- recepciones.service.spec.ts y recepciones-inventario-integration.spec.ts: mocks de Supabase con `single`/`maybeSingle`; asserts de estados (APROBADA/PARCIAL).
- tesoreria.service.spec.ts: urgencia HOY vs VENCIDA (ajustar fixture/función).

### Informe de riesgos/incompletos detectados
- Flujo SUNAT/OSE en worker: `apps/worker/src/index.ts` (procesos CPE/GRE devuelven false, TODO sin implementar). Sin integración real ni backoff → CPE/GRE quedan en PENDIENTE_ENVIO.
- Worker no agenda `procesarVentasPendientesFacturacion` del POS → ventas no se facturan automáticamente.
- Outbox: `apps/worker/src/processors/outbox-processor.ts` importa `OutboxService` comentado, tipo any; `enhanced-worker.ts` con event bus comentado. Sin idempotencia/concurrencia → eventos no procesan o duplican.
- Impuestos compras: `supabase/migrations/107__compras_totales_dynamic_tax.sql` ignora `empresa_config.igv_porcentaje` y usa fallback 18% si país no encontrado. Debe priorizar configuración por tenant.
- POS backend: `apps/erp-api/src/modules/pos/pos.service.ts` no guarda ítems en `detalle_ventas_pos` (solo observaciones). Se pierde trazabilidad contable/stock por línea.
- Frontend CxC: `apps/web/components/finanzas/cxc/CobroModal.tsx` usa métodos de pago hardcodeados; puede desalinearse con catálogo por tenant.
- Wizard: `apps/web/app/dashboard/wizard/WizardContext.tsx` y `page.tsx` tienen paso SUNAT desactivado; onboarding puede cerrar sin credenciales/certificado.
- Monitoreo worker: sin logging/audit para reintentos SUNAT ni métricas; riesgo de silenciamiento.
- Outbox: falta locking/idempotencia en processor → reenvíos duplicados.

Correcciones sugeridas
- Implementar cliente SUNAT en worker y cron de `procesarVentasPendientesFacturacion` con backoff/métricas.
- Conectar OutboxProcessor a servicio real y añadir idempotencia/locking.
- Ajustar `obtener_impuesto_principal_porcentaje` para usar `empresa_config` y luego `configuracion_fiscal` (manejar nulos/país no encontrado).
- Persistir detalles POS en tabla dedicada y emitir eventos de inventario/contabilidad por línea.
- Consumir `metodos_pago` desde API en CobroModal y reactivar paso SUNAT en wizard con validaciones.

## Referencias de gaps detectados vs Senda
- Import/export masivo de comprobantes y catálogos (ellos lo tienen).
- Formularios completos de emisión con campos fiscales y opciones de impresión/WhatsApp.
- Gestión de cajas con resumen por cajero y reporte de cierre.
- Catálogo enriquecido (afectación IGV, clasificadores SUNAT, fotos, multi-sucursal, stock mínimo, favoritos, modificadores).
- Servicios vendibles desde POS (flexibilidad laboratorio/servicios).



CONECTARSE AL API DE RENIEC PARA QUE SALGA LA INFORMACION DE USUARIO, PERSONA O PACIENTE/CLIENTE 
