# Módulo de Reportes y Estadísticas de Ventas

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `frontend_local`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Descripción

Este módulo implementa un sistema completo de reportes y estadísticas para el módulo de ventas, permitiendo a los gerentes y usuarios visualizar métricas clave y tomar decisiones informadas.

## Componentes Implementados

### Frontend (Next.js)

#### Página Principal
- **`/app/dashboard/ventas/reportes/page.tsx`**: Página principal con tabs para diferentes reportes
  - Filtros globales (fecha desde/hasta, cliente, estado)
  - Sistema de tabs para navegar entre reportes
  - Diseño responsive

#### Componentes de Reportes

1. **VentasPorClienteReport.tsx**
   - Muestra ventas agrupadas por cliente
   - Incluye: cliente, documento, periodo, moneda, estado, total, pedidos, facturas
   - Permite ordenar por total o cantidad
   - Exportación a CSV
   - Tarjetas de resumen con totales

2. **CotizacionesPendientesReport.tsx**
   - Lista cotizaciones en estado BORRADOR o ENVIADA
   - Muestra vigencia y días restantes
   - Alertas para cotizaciones por vencer o vencidas
   - Indicador de probabilidad (opcional)
   - Navegación directa a detalle de cotización

3. **PedidosPorEstadoReport.tsx**
   - Dashboard visual con distribución de pedidos por estado
   - Gráfico de barras con colores por estado
   - Tabla detallada con cantidad, porcentaje, monto y promedio
   - Tarjetas de resumen

4. **ProductosMasVendidosReport.tsx**
   - Ranking de productos por unidades vendidas e importe
   - Permite ordenar por unidades o importe
   - Muestra: producto, código, unidades, importe, pedidos, precio promedio
   - Numeración de ranking visual

5. **TopClientesReport.tsx**
   - Top clientes por facturación
   - Opciones: Top 10, 20 o 50
   - Gráfico de barras horizontal
   - Métricas: facturación, % del total, pedidos, facturas, ticket promedio
   - Navegación a detalle de cliente

6. **LeadTimeReport.tsx**
   - Métrica de lead time comercial (cotización → factura)
   - Estadísticas: promedio, mediana, mínimo, máximo
   - Distribución por rangos de tiempo
   - Análisis de tendencia temporal
   - Insights automáticos

7. **PipelineReport.tsx**
   - Pipeline completo desde cotización hasta facturación
   - Conversiones porcentuales entre etapas comerciales
   - Distribución de estados y tendencias mensuales

8. **FillRateReport.tsx**
   - Fill-rate global y OTIF del flujo logístico
   - Métricas de SLA con pedidos sin entrega y fuera de plazo
   - Tabla priorizada de incidentes para seguimiento operativo

9. **AgingCxcReport.tsx**
   - Aging de cuentas por cobrar agrupado por buckets de mora
   - Ranking de clientes y documentos con mayor exposición
   - Indicadores de concentración y riesgo de cartera

10. **SunatMetricsReport.tsx**
    - KPIs de aceptación SUNAT/OSE (rechazos, observados, pendientes)
    - Historial de incidencias con detalles de error
    - Tendencia mensual de estados electrónicos

### Backend (NestJS)

#### Controlador
- **`reportes.controller.ts`**: Endpoints REST para todos los reportes
  - `GET /api/ventas/reportes/ventas-por-cliente`
  - `GET /api/ventas/reportes/cotizaciones-pendientes`
  - `GET /api/ventas/reportes/pedidos-por-estado`
  - `GET /api/ventas/reportes/productos-mas-vendidos`
  - `GET /api/ventas/reportes/top-clientes`
  - `GET /api/ventas/reportes/lead-time`

#### Servicio
- **`reportes.service.ts`**: Lógica de negocio para generar reportes
  - Consultas optimizadas a Supabase
  - Agrupación y cálculos estadísticos
  - Filtrado por fecha, cliente y estado

#### Módulo
- **`reportes.module.ts`**: Módulo NestJS que encapsula el sistema de reportes
- Integrado en `app.module.ts`

## Características

### Filtros Globales
- Fecha desde / hasta
- Cliente (opcional)
- Estado (opcional)

### Funcionalidades
- ✅ Visualización de datos en tablas
- ✅ Gráficos visuales (barras, distribución)
- ✅ Tarjetas de resumen con métricas clave
- ✅ Exportación a CSV (ventas por cliente)
- ✅ Ordenamiento dinámico
- ✅ Navegación a detalles
- ✅ Diseño responsive
- ✅ Estados de carga
- ✅ Manejo de errores

### Permisos
Todos los endpoints requieren el permiso: `ventas.reportes.ver`

## Requisitos Cumplidos

- ✅ **16.1**: Reporte de ventas por cliente con totales y estadísticas
- ✅ **16.2**: Reporte de cotizaciones pendientes con vigencia
- ✅ **16.3**: Dashboard de pedidos por estado con gráficos
- ✅ **16.4**: Reporte de productos más vendidos
- ✅ **16.5**: Reporte de top clientes con mayor facturación
- ✅ **16.6**: Métrica de lead time comercial
- ✅ **16.7**: Filtros por rango de fechas, vendedor, cliente, estado
- ✅ **P2 Logística**: Pipeline, fill-rate/OTIF y aging CxC listos para auditoría.
- ✅ **KPIs SUNAT**: Tasa de rechazo, observación y seguimiento de incidencias.

## Uso

### Acceso
Navegar a: `/dashboard/ventas/reportes`

### Filtros
1. Seleccionar rango de fechas en los filtros globales
2. Opcionalmente filtrar por cliente o estado
3. Los filtros se aplican a todos los reportes

### Navegación
Usar los tabs para cambiar entre diferentes reportes:
- Ventas por Cliente
- Cotizaciones
- Pedidos
- Productos
- Top Clientes
- Lead Time
- Pipeline
- Fill-rate & OTIF
- Aging CxC
- SUNAT KPIs

### Exportación
En el reporte de "Ventas por Cliente", hacer clic en "Exportar CSV" para descargar los datos.

## Notas Técnicas

### Frontend
- Usa React Hooks (useState, useEffect)
- Integración con `useApi` hook personalizado
- Componentes de UI de shadcn/ui
- Formateo de fechas con date-fns
- Iconos de lucide-react

### Backend
- Consultas optimizadas con Supabase
- Filtrado a nivel de base de datos
- Cálculos agregados eficientes
- Soporte para multi-tenant (RLS)

## Mejoras Futuras

- [ ] Gráficos más avanzados (líneas, pie charts)
- [ ] Exportación a Excel con formato
- [ ] Programación de reportes automáticos
- [ ] Envío de reportes por email
- [ ] Comparación entre periodos
- [ ] Filtros adicionales (vendedor, sucursal)
- [ ] Guardado de filtros favoritos
- [ ] Dashboard personalizable
