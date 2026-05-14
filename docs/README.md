# ERP Documentation Hub

Bienvenido a la documentación central del sistema ERP. Aquí encontrará toda la información técnica, manuales de módulos y guías de arquitectura.

## 📚 Arquitectura y Referencia Técnica

Documentos fundamentales para entender la estructura del sistema. Los manuales creados en enero 2026 se mantienen como referencia historica hasta consolidarlos contra `PROJECT_REVIEW_INDEX.md` y `db_rebuild_status.md`.

*   **[Arquitectura del Sistema](manuals/SYSTEM_ARCHITECTURE.md)**: Referencia historica de arquitectura; validar contra `../PROJECT_REVIEW_INDEX.md`.
*   **[Referencia de Base de Datos](manuals/DATABASE_REFERENCE.md)**: Referencia historica; la fuente vigente de BD es `db_rebuild_status.md`.
*   **[Guía del Desarrollador](manuals/DEVELOPER_GUIDE.md)**: Guia historica; validar setup actual contra `../README.md`, `configuration.md` y `ops/docker.md`.

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

*   **[Matriz de rutas API](security/route-access-matrix.md)**: Fuente vigente de autorizacion por endpoint.
*   **[Sesión y autenticación](security/session-auth.md)**: Contrato actual de cookies HttpOnly y sesion.
*   **[Rate limiting](security/rate-limiting.md)**: Configuracion vigente de throttling.
*   **[Auditoría de acceso Supabase](security/supabase-access-audit.md)**: Uso de service role y controles de acceso.
*   **[Dashboard de Seguridad](security/security-dashboard.md)**: Referencia del panel; revisar junto con la cuarentena documental.

## 📈 Estado del Proyecto

*   **[Estado operativo vigente](../PROJECT_STATUS.md)**: Estado actualizado de build, type-check, riesgos y proximas rondas de revision.
*   **[Indice maestro de revision](../PROJECT_REVIEW_INDEX.md)**: Matriz de cobertura para revisar exhaustivamente todo el proyecto.
*   **[Cuarentena documental](DOCUMENTATION_QUARANTINE.md)**: Candidatos a consolidacion o borrado, sin eliminaciones automaticas.
*   **[Estado de reconstruccion de BD](db_rebuild_status.md)**: Fuente vigente de migraciones `000..302`, validadores y riesgos pendientes.
*   **[Estado historico 2026-01](manuals/PROJECT_STATUS.md)**: Documento anterior a la reconstruccion `000..301`; usar solo como referencia historica.
*   **[Análisis Inicial](analisis.md)**: Auditoría completa inicial del código legado.
