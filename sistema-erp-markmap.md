---
markmap:
  colorFreezeLevel: 2
  duration: 500
  maxWidth: 300
  initialExpandLevel: 2
---

<style>
.markmap-node {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-weight: 600;
}

.markmap-node-circle {
  stroke-width: 3px;
}

/* Colores por nivel */
.markmap-node[data-depth="0"] > .markmap-node-circle {
  fill: #1e40af;
  stroke: #1d4ed8;
}

.markmap-node[data-depth="1"] > .markmap-node-circle {
  fill: #059669;
  stroke: #047857;
}

.markmap-node[data-depth="2"] > .markmap-node-circle {
  fill: #7c3aed;
  stroke: #6d28d9;
}

.markmap-node[data-depth="3"] > .markmap-node-circle {
  fill: #dc2626;
  stroke: #b91c1c;
}

.markmap-node[data-depth="4"] > .markmap-node-circle {
  fill: #ea580c;
  stroke: #c2410c;
}

/* Estilos de texto */
.markmap-node-text {
  font-size: 14px;
  fill: #1f2937;
  font-weight: 600;
}

/* Enlaces más gruesos */
.markmap-link {
  stroke-width: 3px;
  opacity: 0.8;
}

/* Animaciones suaves */
.markmap-node {
  transition: all 0.3s ease;
}

.markmap-node:hover {
  transform: scale(1.05);
}

/* Colores específicos para módulos importantes */
.markmap-node:contains("RRHH") > .markmap-node-circle {
  fill: #10b981 !important;
  stroke: #059669 !important;
  stroke-width: 4px;
}

.markmap-node:contains("Automatizado") > .markmap-node-circle {
  fill: #f59e0b !important;
  stroke: #d97706 !important;
  stroke-width: 4px;
}

.markmap-node:contains("Backend") > .markmap-node-circle {
  fill: #3b82f6 !important;
  stroke: #2563eb !important;
}

.markmap-node:contains("Base de Datos") > .markmap-node-circle {
  fill: #8b5cf6 !important;
  stroke: #7c3aed !important;
}
</style>

# 🏢 Sistema ERP Integrado CABIMAS
## 📱 **Frontend Next.js**
### 🎨 **Interface de Usuario**
- **Dashboard Principal**
  - Estadísticas en tiempo real
  - Gráficos interactivos
  - Métricas de negocio
  - Acceso rápido a módulos
- **Navegación Inteligente**
  - Sidebar responsivo
  - Breadcrumbs dinámicos
  - Búsqueda global
  - Filtros avanzados

### 🔐 **Autenticación y Seguridad**
- **Sistema de Login**
  - JWT Authentication
  - Sesiones seguras
  - Refresh tokens
  - Roles y permisos
- **Protección de Rutas**
  - Guards por módulo
  - Verificación de roles
  - Middleware de seguridad

## 🎯 **Módulos Principales**
### 💰 **POS (Punto de Venta)**
- **Funciones Principales**
  - Ventas en tiempo real
  - Manejo de efectivo
  - Múltiples métodos de pago
  - Impresión de tickets
- **Características**
  - Interface táctil optimizada
  - Gestión de cajas
  - Control de sesiones
  - Reportes de ventas diarias

### 📦 **Inventario Inteligente**
- **Gestión de Productos**
  - Catálogo completo
  - Control de stock automático
  - Alertas de stock mínimo
  - Valorización de inventario
- **Integración Automática**
  - Actualización por compras
  - Sincronización con ventas
  - Movimientos de stock
  - Trazabilidad completa

### 🛒 **Módulo Comercial**
#### **Compras Automatizadas**
- **Características Avanzadas**
  - Órdenes de compra inteligentes
  - Integración automática con inventario
  - Gestión de proveedores
  - Seguimiento de entregas
- **Automatización**
  - Productos nuevos se crean automáticamente
  - Stock se actualiza al marcar "ENTREGADO"
  - Generación automática de números OC-YYYY-XXXX
  - Validaciones inteligentes

#### **Cotizaciones Profesionales**
- **Gestión Completa**
  - Creación de cotizaciones
  - Seguimiento de estados
  - Conversión a órdenes
  - Reportes de conversión

### 🧮 **Contabilidad Integral**
- **Plan de Cuentas**
  - Estructura contable peruana
  - 29 cuentas configuradas
  - Jerarquía multinivel
- **Asientos Contables**
  - Registro automático
  - Conciliación bancaria
  - Estados financieros
  - Reportes tributarios

### 💼 **Finanzas Avanzadas**
- **Gestión Financiera**
  - Flujo de caja
  - Proyecciones financieras
  - Control presupuestario
  - Análisis de rentabilidad

### 👥 **RRHH Automatizado**
#### **Sistema Revolucionario**
- **Proceso Un Solo Click**
  - Botón "Crear y Calcular Automático"
  - Detecta empleados activos automáticamente
  - Crea planilla del período actual
  - Calcula todos los sueldos instantáneamente
- **Cumplimiento Legal Perú**
  - AFP vs ONP automático
  - ESSALUD 9% empleador
  - Asignación familiar S/ 102.50
  - Horas extras 25% y 35%
  - CTS y gratificaciones
  - Impuesto a la renta 5ta categoría
- **Reportes Profesionales**
  - Boletas de pago HTML
  - Reportes de planilla corporativos
  - Resumen ejecutivo con totales
  - Descarga automática

### 📄 **Facturación Electrónica**
#### **CPE (Comprobantes Electrónicos)**
- **Tipos de Comprobantes**
  - Facturas electrónicas
  - Boletas de venta
  - Notas de crédito/débito
  - Validación SUNAT automática
- **Integración SUNAT**
  - Firma digital automática
  - Envío a SUNAT
  - Validación en tiempo real
  - CDR (Constancia de Recepción)

#### **GRE (Guías de Remisión)**
- **Gestión de Transportes**
  - Guías electrónicas
  - Trazabilidad de mercancías
  - Integración con transportistas
  - Validación de rutas

#### **Reportes SIRE**
- **Sistema Optimizado**
  - Generación automática
  - Estados: GENERANDO → GENERADO
  - Auto-polling cada 2 segundos
  - Tiempo de procesamiento: 1 segundo
  - Recarga automática

### ⚙️ **Configuración Integral**
- **Datos de Empresa**
  - Información fiscal completa
  - Configuración tributaria
  - Series de comprobantes
  - Parámetros del sistema
- **Integración OSE**
  - Conexión con proveedores
  - Certificados digitales
  - Configuración SUNAT

### 👤 **Gestión de Usuarios**
- **Sistema Completo**
  - 4 usuarios activos
  - Roles: ADMIN, CONTADOR, VENDEDOR, ALMACENERO
  - Permisos granulares
  - Estados activar/desactivar

## 🔧 **Backend NestJS**
### 🏗️ **Arquitectura Robusta**
- **Controladores Especializados**
  - 15+ controladores modulares
  - Validaciones automáticas
  - Manejo de errores
  - Logging detallado
- **Servicios de Integración**
  - Accounting Integration Service
  - Financial Integration Service
  - Dashboard Integration Service
  - Inventory Integration Service

### 🔌 **APIs RESTful**
- **Endpoints Organizados**
  - `/api/inventario/*` - Gestión de productos
  - `/api/compras/*` - Órdenes y proveedores
  - `/api/rrhh/*` - Recursos humanos
  - `/api/cpe/*` - Comprobantes electrónicos
  - `/api/configuracion/*` - Parámetros sistema
  - `/api/usuarios-sistema/*` - Gestión usuarios

### 🛡️ **Seguridad Avanzada**
- **Protección Multicapa**
  - JWT Guards en todos los endpoints
  - Validación de roles
  - Rate limiting (100 req/min)
  - Sanitización de datos

## 💾 **Base de Datos Supabase**
### 🗄️ **Estructura Completa**
#### **Módulo POS**
- `cajas` - Gestión de cajas registradoras
- `ventas_pos` - Transacciones de venta
- `metodos_pago` - Formas de pago disponibles
- `sesiones_caja` - Control de sesiones

#### **Módulo Inventario**
- `productos` - Catálogo de productos (5 productos activos)
- `movimientos_stock` - Trazabilidad de inventario
- `categorias` - Clasificación de productos

#### **Módulo Comercial**
- `clientes` - Base de clientes (5 registros)
- `proveedores` - Gestión de proveedores (2 activos)
- `cotizaciones` - Cotizaciones comerciales
- `ordenes_compra` - Órdenes de compra

#### **Módulo Contabilidad**
- `plan_cuentas` - Plan contable (29 cuentas)
- `asientos_contables` - Registros contables
- `detalle_asientos` - Movimientos detallados

#### **Módulo RRHH**
- `empleados` - Personal de empresa
- `departamentos` - Estructura organizacional
- `contratos` - Contratos laborales
- `planillas` - Períodos de pago
- `empleado_planilla` - Detalle por empleado
- `conceptos_planilla` - Ingresos/descuentos

#### **Módulo Electrónico**
- `cpe` - Comprobantes electrónicos
- `gre` - Guías de remisión
- `sire_files` - Reportes SIRE

#### **Sistema Core**
- `users` - Autenticación (4 usuarios)
- `roles` - Roles del sistema (4 roles)
- `user_roles` - Asignación roles-usuarios
- `empresa_config` - Configuración empresarial
- `tenants` - Multi-tenancy (1 tenant activo)

### 🔄 **Integraciones Automáticas**
- **Compras → Inventario**
  - Stock se actualiza automáticamente
  - Productos nuevos se crean solos
  - Validaciones de integridad
- **Ventas → Contabilidad**
  - Asientos automáticos
  - Conciliación en tiempo real
- **RRHH → Finanzas**
  - Provisiones automáticas
  - Cálculos tributarios

## 🚀 **Características Técnicas**
### ⚡ **Performance**
- **Optimizaciones Frontend**
  - Server-side rendering (SSR)
  - Lazy loading de componentes
  - Caching inteligente
  - Compresión de assets
- **Optimizaciones Backend**
  - Query optimization
  - Connection pooling
  - Rate limiting
  - Caching de respuestas

### 📊 **Monitoreo y Analytics**
- **Métricas en Tiempo Real**
  - Dashboard ejecutivo
  - KPIs automáticos
  - Alertas inteligentes
  - Reportes personalizados

### 🔒 **Cumplimiento Legal**
- **Normativa Peruana**
  - Estructura contable PCGE
  - Libros electrónicos
  - Reportes SUNAT
  - Facturación electrónica obligatoria

## 🎯 **Flujos de Proceso**
### 💼 **Flujo de Ventas**
1. **Cliente realiza compra en POS**
2. **Sistema actualiza inventario automáticamente**
3. **Genera comprobante electrónico**
4. **Envía a SUNAT para validación**
5. **Registra asiento contable**
6. **Actualiza métricas del dashboard**

### 📦 **Flujo de Compras**
1. **Crear orden de compra**
2. **Sistema valida proveedores**
3. **Al marcar "ENTREGADO":**
   - Stock se actualiza automáticamente
   - Productos nuevos se crean
   - Se registran movimientos
4. **Genera asientos contables**
5. **Actualiza valuación de inventario**

### 💰 **Flujo de Planillas**
1. **Click "Crear y Calcular Automático"**
2. **Sistema detecta empleados activos**
3. **Crea período actual automáticamente**
4. **Calcula sueldos con normativa peruana:**
   - Sueldo básico proporcional
   - Horas extras 25% y 35%
   - Descuentos AFP/ONP
   - ESSALUD 9%
   - Asignación familiar
   - Impuesto a la renta
5. **Genera reportes profesionales**
6. **Boletas de pago individuales**

### 📄 **Flujo Facturación Electrónica**
1. **Generar comprobante**
2. **Aplicar numeración automática**
3. **Firmar digitalmente**
4. **Enviar a SUNAT**
5. **Recibir CDR (Constancia)**
6. **Registrar en contabilidad**
7. **Notificar al cliente**

## 🌟 **Innovaciones Destacadas**
### 🤖 **Automatización Inteligente**
- **RRHH Automático:** Un solo botón calcula toda la planilla
- **Compras Inteligentes:** Stock se actualiza solo al recibir
- **Facturación Inmediata:** De venta a SUNAT en segundos
- **Contabilidad Automática:** Asientos se generan solos

### 🎨 **UX/UI Profesional**
- **Diseño Corporativo:** Interfaz moderna y profesional
- **Responsivo Total:** Funciona en móvil, tablet, desktop
- **Feedback Visual:** Estados claros y animaciones suaves
- **Accesibilidad:** Cumple estándares WCAG

### 🔧 **Arquitectura Escalable**
- **Microservicios:** Módulos independientes
- **Multi-tenant:** Soporte múltiples empresas
- **Cloud-ready:** Desplegable en cualquier cloud
- **API-first:** Integrable con sistemas externos

## 📈 **Estadísticas del Sistema**
### 📊 **Datos Actuales**
- **Usuarios Activos:** 4 (Admin, Contador, Vendedor, Almacenero)
- **Productos en Catálogo:** 5 productos
- **Clientes Registrados:** 5 clientes
- **Proveedores Activos:** 2 proveedores  
- **Plan de Cuentas:** 29 cuentas contables
- **Roles Configurados:** 4 roles con permisos específicos
- **Módulos Operativos:** 10+ módulos completamente funcionales

### 🚀 **Capacidades Técnicas**
- **APIs Disponibles:** 50+ endpoints
- **Tablas de BD:** 25+ tablas organizadas
- **Controladores Backend:** 15+ controladores especializados
- **Servicios de Integración:** 4 servicios automáticos
- **Tipos de Comprobantes:** Facturas, Boletas, NC, ND, GRE
- **Reportes SIRE:** Generación automática optimizada

## 🎯 **Próximas Características**
### 🔮 **Roadmap de Desarrollo**
- **BI Avanzado:** Dashboards ejecutivos con IA
- **Mobile App:** Aplicación móvil nativa
- **API Gateway:** Gestión centralizada de APIs
- **Workflow Engine:** Automatización de procesos
- **CRM Integrado:** Gestión de relaciones con clientes
- **E-commerce:** Tienda online integrada 