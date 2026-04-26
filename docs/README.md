# ERP Documentation Hub

Bienvenido a la documentación central del sistema ERP. Aquí encontrará toda la información técnica, manuales de módulos y guías de arquitectura.

## 📚 Arquitectura y Referencia Técnica

Documentos fundamentales para entender la estructura del sistema.

*   **[Arquitectura del Sistema](manuals/SYSTEM_ARCHITECTURE.md)**: Visión general del stack tecnológico (NestJS + Supabase), patrones de diseño (Hexagonal, Event-Driven) y estructura del monorepo.
*   **[Referencia de Base de Datos](manuals/DATABASE_REFERENCE.md)**: Esquema de datos, funciones RPC, Row Level Security (RLS) y triggers.
*   **[Guía del Desarrollador](manuals/DEVELOPER_GUIDE.md)**: Guía para configurar el entorno local, estándares de código y flujo de trabajo.

## 📦 Módulos Funcionales (Manuales Detallados)

Documentación profunda de la lógica de negocio, flujos de trabajo e implementaciones por área.

### Comercial y Fiscal
*   **[Ventas, POS y Fiscal](manuals/modules/VENTAS_POS_FISCAL.md)**
    *   **Ventas**: Ciclo de pedido, cotizaciones, validaciones de stock y crédito.
    *   **POS**: Venta rápida, sesiones de caja, manejo de concurrencia y modo offline.
    *   **Fiscal (CPE)**: Facturación electrónica SUNAT/OSE, firma digital y generación de XML.
    *   **RMA**: Gestión de devoluciones y notas de crédito.

### Logística y Operaciones
*   **[Compras e Inventario](manuals/modules/COMPRAS_INVENTARIO.md)**
    *   **Compras**: Flujos de aprobación, órdenes de compra y gestión de proveedores.
    *   **Inventario**: Modelo de stock real vs reservado, movimientos atómicos (RPC) y gestión de almacenes.
    *   **Logística**: Picking, Packing y Despacho de pedidos.

### Finanzas
*   **[Finanzas y Contabilidad](manuals/modules/FINANZAS_CONTABILIDAD.md)**
    *   **Tesorería (Cajas)**: Apertura/cierre de cajas, arqueos y conciliación.
    *   **Cuentas por Cobrar (CxC)**: Gestión de deuda, retenciones/detracciones y pagos.
    *   **Contabilidad**: Motor de asientos automáticos (`AsientosGenerator`), plan de cuentas y periodos fiscales.

## 🔐 Seguridad y Auditoría

Documentación específica sobre el sistema de seguridad y cumplimiento.

*   **[Auditoría y RLS](security/IMPLEMENTACION-AUDITORIA-RLS.md)**: Implementación técnica del sistema de auditoría y políticas de seguridad a nivel de fila.
*   **[Guía de Alertas RLS](security/rls-alerts-guide.md)**: Configuración y respuesta ante incidentes de seguridad.
*   **[Dashboard de Seguridad](security/security-dashboard.md)**: Arquitectura del panel de monitoreo de seguridad.

## 📈 Estado del Proyecto

*   **[Estado Actual y Análisis](manuals/PROJECT_STATUS.md)**: Resumen del avance, deuda técnica identificada y próximos pasos.
*   **[Análisis Inicial](analisis.md)**: Auditoría completa inicial del código legado.
