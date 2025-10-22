# Roadmap P3: RMA, Multialmacén y Dashboards OTIF/SUNAT

## 1. RMA y gestión postventa
- **Estado actual:** no existen tablas ni endpoints para devoluciones.
- **Siguiente iteración:**
  1. Crear tablas `rma_solicitudes`, `rma_items`, `rma_movimientos` con RLS.
  2. Flujo básico: solicitud → inspección → aprobación → reintegro a inventario.
  3. Integrar con `pedido_despachos` para identificar qué unidades regresan.
  4. Nuevos estados en `EstadoPedido` para diferenciar cierre con RMA.

## 2. Multialmacén y ubicaciones
- **Estado actual:** inventario único por producto.
- **Siguiente iteración:**
  1. Tablas `almacenes`, `ubicaciones` y `inventario_saldo` por almacén.
  2. Ajustar RPC (`incrementar_stock_reservado`, `descontar_stock_y_liberar_reserva`) para operar por almacén.
  3. Extender UI de logística para selección de almacén y ubicación.
  4. Métricas de rotación por almacén (base para FEFO/FIFO).

## 3. Dashboards SUNAT / OTIF
- **Estado actual:** reportes individuales (`FillRate`, `integration_logs`).
- **Siguiente iteración:**
  1. Crear vistas materializadas para KPIs SUNAT (tasa aceptación, tiempos de envío).
  2. Consolidar OTIF con `pedido_despachos`, `pedido_backorders` y futuras RMA.
  3. Backend: endpoint `/api/analytics/operaciones` con cache.
  4. Frontend: tablero en `apps/web/app/dashboard/analytics/` reutilizando `sectionCardStyle` para consistencia.

> **Notas:** cada entrega debe mantener la disciplina multi-tenant descrita en `docs/multi-tenant-headers.md` y añadir pruebas unitarias/mocks para nuevos servicios.