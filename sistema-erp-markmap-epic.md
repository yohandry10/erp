---
markmap:
  colorFreezeLevel: 3
  duration: 800
  maxWidth: 400
  initialExpandLevel: 3
  pan: true
  zoom: true
  spacingVertical: 15
  spacingHorizontal: 120
  paddingX: 8
  autoFit: true
---

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* Variables CSS para consistencia */
:root {
  --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --success-gradient: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  --warning-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  --info-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  --dark-gradient: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  --gold-gradient: linear-gradient(135deg, #f7971e 0%, #ffd200 100%);
  --purple-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --cyan-gradient: linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%);
  --red-gradient: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
  --green-gradient: linear-gradient(135deg, #56ab2f 0%, #a8e6cf 100%);
}

/* Configuración global del markmap */
svg {
  background: radial-gradient(circle at 50% 50%, #f8fafc 0%, #e2e8f0 100%);
  border-radius: 20px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

/* Estilos base para todos los nodos */
.markmap-node {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1));
}

.markmap-node:hover {
  transform: scale(1.08) rotate(1deg);
  filter: drop-shadow(0 10px 25px rgba(0, 0, 0, 0.2));
}

/* Círculos de nodos con gradientes y efectos */
.markmap-node-circle {
  stroke-width: 4px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  transition: all 0.3s ease;
}

/* NIVEL 0 - RAÍZ (Sistema Principal) */
.markmap-node[data-depth="0"] > .markmap-node-circle {
  fill: url(#gradient-root);
  stroke: #1e40af;
  stroke-width: 6px;
  r: 20;
  filter: drop-shadow(0 8px 16px rgba(30, 64, 175, 0.4));
}

/* NIVEL 1 - MÓDULOS PRINCIPALES */
.markmap-node[data-depth="1"] > .markmap-node-circle {
  fill: url(#gradient-modules);
  stroke: #059669;
  stroke-width: 5px;
  r: 16;
  filter: drop-shadow(0 6px 12px rgba(5, 150, 105, 0.3));
}

/* NIVEL 2 - SECCIONES */
.markmap-node[data-depth="2"] > .markmap-node-circle {
  fill: url(#gradient-sections);
  stroke: #7c3aed;
  stroke-width: 4px;
  r: 12;
  filter: drop-shadow(0 4px 8px rgba(124, 58, 237, 0.3));
}

/* NIVEL 3 - CARACTERÍSTICAS */
.markmap-node[data-depth="3"] > .markmap-node-circle {
  fill: url(#gradient-features);
  stroke: #dc2626;
  stroke-width: 3px;
  r: 10;
  filter: drop-shadow(0 3px 6px rgba(220, 38, 38, 0.3));
}

/* NIVEL 4+ - DETALLES */
.markmap-node[data-depth="4"] > .markmap-node-circle,
.markmap-node[data-depth="5"] > .markmap-node-circle {
  fill: url(#gradient-details);
  stroke: #ea580c;
  stroke-width: 2px;
  r: 8;
  filter: drop-shadow(0 2px 4px rgba(234, 88, 12, 0.3));
}

/* Texto con estilos modernos */
.markmap-node-text {
  font-weight: 600;
  fill: #1f2937;
  font-size: 13px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  dominant-baseline: middle;
}

.markmap-node[data-depth="0"] .markmap-node-text {
  font-size: 18px;
  font-weight: 800;
  fill: #1e40af;
  text-shadow: 0 2px 4px rgba(30, 64, 175, 0.3);
}

.markmap-node[data-depth="1"] .markmap-node-text {
  font-size: 15px;
  font-weight: 700;
  fill: #059669;
}

.markmap-node[data-depth="2"] .markmap-node-text {
  font-size: 13px;
  font-weight: 600;
  fill: #7c3aed;
}

/* Enlaces con gradientes y animaciones */
.markmap-link {
  stroke-width: 3px;
  opacity: 0.8;
  stroke: url(#gradient-link);
  transition: all 0.3s ease;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.markmap-link:hover {
  stroke-width: 5px;
  opacity: 1;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

/* Estilos especiales para módulos destacados */
.markmap-node:has(.markmap-node-text:contains("🚀")) > .markmap-node-circle,
.markmap-node:has(.markmap-node-text:contains("⚡")) > .markmap-node-circle,
.markmap-node:has(.markmap-node-text:contains("🎯")) > .markmap-node-circle {
  fill: url(#gradient-special) !important;
  stroke: #f59e0b !important;
  stroke-width: 5px !important;
  animation: pulse 2s infinite;
}

/* Animación de pulso para elementos especiales */
@keyframes pulse {
  0%, 100% { 
    transform: scale(1);
    opacity: 1;
  }
  50% { 
    transform: scale(1.1);
    opacity: 0.8;
  }
}

/* Efectos de hover avanzados */
.markmap-node:hover .markmap-node-circle {
  stroke-width: 6px;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.3)) brightness(1.1);
}

.markmap-node:hover .markmap-node-text {
  font-weight: 700;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Responsive design */
@media (max-width: 768px) {
  .markmap-node-text {
    font-size: 11px;
  }
  .markmap-node[data-depth="0"] .markmap-node-text {
    font-size: 14px;
  }
}

/* Definición de gradientes SVG */
</style>

<svg style="width: 0; height: 0; position: absolute;">
  <defs>
    <linearGradient id="gradient-root" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea"/>
      <stop offset="100%" style="stop-color:#764ba2"/>
    </linearGradient>
    
    <linearGradient id="gradient-modules" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#11998e"/>
      <stop offset="100%" style="stop-color:#38ef7d"/>
    </linearGradient>
    
    <linearGradient id="gradient-sections" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4facfe"/>
      <stop offset="100%" style="stop-color:#00f2fe"/>
    </linearGradient>
    
    <linearGradient id="gradient-features" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f093fb"/>
      <stop offset="100%" style="stop-color:#f5576c"/>
    </linearGradient>
    
    <linearGradient id="gradient-details" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f7971e"/>
      <stop offset="100%" style="stop-color:#ffd200"/>
    </linearGradient>
    
    <linearGradient id="gradient-link" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea"/>
      <stop offset="100%" style="stop-color:#764ba2"/>
    </linearGradient>
    
    <linearGradient id="gradient-special" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ff6b6b"/>
      <stop offset="50%" style="stop-color:#ffd93d"/>
      <stop offset="100%" style="stop-color:#6bcf7f"/>
    </linearGradient>
  </defs>
</svg>

# 🚀 **SISTEMA ERP CABIMAS** - *Revolución Digital Empresarial*

## 🎨 **FRONTEND NEXT.JS** - *Interface del Futuro*
### ⚡ **UX/UI Revolucionario**
- **🎯 Dashboard Inteligente**
  - 📊 Analytics en Tiempo Real
  - 🔥 Métricas Dinámicas
  - 🎪 Visualizaciones Interactivas
  - 🚀 Acceso Instantáneo
- **🌟 Navegación Cuántica**
  - 📱 Responsive Total
  - 🔍 Búsqueda Inteligente
  - 🎛️ Filtros Avanzados
  - 🧭 Breadcrumbs Dinámicos

### 🛡️ **Seguridad Blockchain-Level**
- **🔐 Autenticación Militar**
  - 🎫 JWT Ultra-Seguro
  - 🔄 Refresh Tokens
  - 👑 Roles Granulares
  - 🛡️ Guards Inteligentes
- **🚨 Protección Multicapa**
  - 🔒 Middleware Avanzado
  - 🎯 Rate Limiting
  - 🛡️ CSRF Protection
  - 📊 Audit Logs

## 🎯 **MÓDULOS GALÁCTICOS** - *Ecosistema Completo*

### 💰 **POS QUANTUM** - *Ventas del Futuro*
- **⚡ Características Revolucionarias**
  - 🚀 Ventas Instantáneas
  - 💳 Multi-Payment Engine
  - 🖨️ Impresión Automática
  - 📱 Interface Táctil Pro
- **🎪 Gestión Inteligente**
  - 💰 Control de Cajas
  - ⏰ Sesiones Automáticas
  - 📈 Reportes Live
  - 🔄 Sincronización Real-Time

### 📦 **INVENTARIO AI** - *Stock Inteligente*
- **🤖 Automatización Total**
  - 🎯 Stock Auto-Update
  - ⚠️ Alertas Predictivas
  - 💎 Valorización Dinámica
  - 🔍 Trazabilidad Completa
- **🌟 Integración Mágica**
  - 🛒 Sync con Compras
  - 💰 Sync con Ventas
  - 📊 Movimientos Live
  - 🎪 Dashboard Visual

### 🛒 **COMERCIAL SUITE** - *Ventas Estratégicas*

#### 🚀 **Compras Automatizadas**
- **⚡ Motor de Compras IA**
  - 🎯 Órdenes Inteligentes
  - 🤖 Auto-Creación Productos
  - 📈 Stock Auto-Update
  - 🔄 Flujo Automatizado
- **💎 Características Premium**
  - 🏷️ Numeración Auto (OC-YYYY-XXXX)
  - ✅ Validaciones Inteligentes
  - 📦 Tracking Entregas
  - 🎪 Dashboard Proveedores

#### 💼 **Cotizaciones Pro**
- **🎯 Gestión Estratégica**
  - 📋 Creación Intuitiva
  - 📊 Estados Dinámicos
  - 🔄 Conversión Automática
  - 📈 Analytics Conversión

### 🧮 **CONTABILIDAD QUANTUM** - *Finanzas del Futuro*
- **💎 Plan de Cuentas PCGE**
  - 🏗️ Estructura Peruana
  - 📊 29 Cuentas Configuradas
  - 🌳 Jerarquía Multinivel
  - 🎯 Clasificación Inteligente
- **⚡ Asientos Automáticos**
  - 🤖 Registro Auto
  - 🔄 Conciliación Live
  - 📈 Estados Financieros
  - 📊 Reportes SUNAT

### 💼 **FINANZAS AI** - *Inteligencia Financiera*
- **🚀 Motor Financiero**
  - 💰 Flujo de Caja Predictivo
  - 📊 Proyecciones IA
  - 🎯 Control Presupuestario
  - 📈 Análisis Rentabilidad

### 👥 **RRHH REVOLUCIONARIO** - *Gestión Humana Automatizada*

#### 🚀 **Sistema Un-Click**
- **⚡ Automatización Total**
  - 🎯 Botón "Crear y Calcular"
  - 🤖 Detección Auto Empleados
  - 📅 Período Auto-Generado
  - 💰 Cálculo Instantáneo
- **🇵🇪 Cumplimiento Legal Perú**
  - 🏦 AFP vs ONP Automático
  - 🏥 ESSALUD 9% Auto
  - 👨‍👩‍👧‍👦 Asignación Familiar S/ 102.50
  - ⏰ Horas Extras 25% y 35%
  - 💰 CTS y Gratificaciones
  - 📊 Impuesto Renta 5ta

#### 📊 **Reportes Hollywood**
- **🎪 Diseño Profesional**
  - 📄 Boletas HTML Premium
  - 📈 Reportes Corporativos
  - 💎 Resumen Ejecutivo
  - 📱 Descarga Automática

### 📄 **FACTURACIÓN ELECTRÓNICA** - *Cumplimiento SUNAT*

#### ⚡ **CPE Quantum**
- **🎯 Comprobantes Inteligentes**
  - 📋 Facturas Electrónicas
  - 🎫 Boletas Premium
  - 📝 Notas Crédito/Débito
  - ✅ Validación SUNAT Auto
- **🚀 Integración SUNAT**
  - 🔐 Firma Digital Auto
  - 📤 Envío Instantáneo
  - ⚡ Validación Real-Time
  - 📋 CDR Automático

#### 🚛 **GRE Smart**
- **📦 Logística Inteligente**
  - 📋 Guías Electrónicas
  - 🛣️ Trazabilidad Total
  - 🚚 Integración Transportistas
  - 🗺️ Validación Rutas

#### 📊 **SIRE Optimizado**
- **⚡ Generación Cuántica**
  - 🤖 Proceso Automático
  - 🔄 Estados: GENERANDO → GENERADO
  - ⏱️ Polling cada 2s
  - 🚀 Procesamiento 1s
  - 🔄 Recarga Auto

### ⚙️ **CONFIGURACIÓN MASTER** - *Control Total*
- **🏢 Datos Empresariales**
  - 📋 Info Fiscal Completa
  - 🧮 Config Tributaria
  - 🔢 Series Comprobantes
  - ⚡ Parámetros Sistema
- **🔗 Integración OSE**
  - 🌐 Conexión Proveedores
  - 🔐 Certificados Digitales
  - 🏛️ Config SUNAT

### 👤 **USUARIOS ELITE** - *Gestión de Accesos*
- **🎯 Sistema Completo**
  - 👥 4 Usuarios Activos
  - 👑 Roles: ADMIN, CONTADOR, VENDEDOR, ALMACENERO
  - 🔐 Permisos Granulares
  - 🔄 Estados Dinámicos

## 🔧 **BACKEND NESTJS** - *Motor de Alta Performance*

### 🏗️ **Arquitectura Galáctica**
- **⚡ Controladores Especializados**
  - 🎯 15+ Módulos Independientes
  - ✅ Validaciones Auto
  - 🛡️ Error Handling Pro
  - 📊 Logging Detallado
- **🔗 Servicios de Integración**
  - 🧮 Accounting Integration
  - 💰 Financial Integration
  - 📊 Dashboard Integration
  - 📦 Inventory Integration

### 🔌 **APIs RESTful** - *Endpoints del Futuro*
- **🎯 Organización Perfecta**
  - 📦 `/api/inventario/*` - Productos
  - 🛒 `/api/compras/*` - Órdenes
  - 👥 `/api/rrhh/*` - Recursos Humanos
  - 📄 `/api/cpe/*` - Comprobantes
  - ⚙️ `/api/configuracion/*` - Sistema
  - 👤 `/api/usuarios-sistema/*` - Usuarios

### 🛡️ **Seguridad Militar**
- **🔒 Protección Multicapa**
  - 🎫 JWT Guards Globales
  - 👑 Validación Roles
  - ⚡ Rate Limiting (100/min)
  - 🧹 Sanitización Datos

## 💾 **BASE DE DATOS SUPABASE** - *Almacenamiento Cuántico*

### 🗄️ **Estructura Galáctica**

#### 💰 **Módulo POS**
- 🏪 `cajas` - Registradoras Inteligentes
- 💳 `ventas_pos` - Transacciones Live
- 💰 `metodos_pago` - Payment Engine
- ⏰ `sesiones_caja` - Control Temporal

#### 📦 **Módulo Inventario**
- 🎯 `productos` - Catálogo (5 productos)
- 📊 `movimientos_stock` - Trazabilidad
- 🏷️ `categorias` - Clasificación

#### 🛒 **Módulo Comercial**
- 👥 `clientes` - Base Clientes (5)
- 🏭 `proveedores` - Gestión (2 activos)
- 💼 `cotizaciones` - Comerciales
- 📋 `ordenes_compra` - Órdenes

#### 🧮 **Módulo Contabilidad**
- 📊 `plan_cuentas` - PCGE (29 cuentas)
- 📋 `asientos_contables` - Registros
- 📝 `detalle_asientos` - Movimientos

#### 👥 **Módulo RRHH**
- 👤 `empleados` - Personal
- 🏢 `departamentos` - Estructura
- 📋 `contratos` - Laborales
- 💰 `planillas` - Períodos Pago
- 👥 `empleado_planilla` - Detalle
- 💰 `conceptos_planilla` - Ingresos/Descuentos

#### 📄 **Módulo Electrónico**
- 📋 `cpe` - Comprobantes
- 🚛 `gre` - Guías Remisión
- 📊 `sire_files` - Reportes

#### 🎯 **Sistema Core**
- 👤 `users` - Auth (4 usuarios)
- 👑 `roles` - Sistema (4 roles)
- 🔗 `user_roles` - Asignaciones
- 🏢 `empresa_config` - Configuración
- 🏠 `tenants` - Multi-tenancy

### 🔄 **Integraciones Mágicas**
- **🛒 → 📦 Compras → Inventario**
  - ⚡ Stock Auto-Update
  - 🎯 Productos Auto-Creación
  - ✅ Validaciones Integridad
- **💰 → 🧮 Ventas → Contabilidad**
  - 📋 Asientos Automáticos
  - 🔄 Conciliación Real-Time
- **👥 → 💰 RRHH → Finanzas**
  - 💰 Provisiones Auto
  - 📊 Cálculos Tributarios

## 🚀 **CARACTERÍSTICAS TÉCNICAS** - *Tecnología Cuántica*

### ⚡ **Performance Extremo**
- **🎨 Frontend Optimizado**
  - 🚀 SSR (Server-Side Rendering)
  - 📱 Lazy Loading Inteligente
  - 💾 Caching Avanzado
  - 🗜️ Compresión Assets
- **🔧 Backend Turbo**
  - 🎯 Query Optimization
  - 🔗 Connection Pooling
  - ⚡ Rate Limiting
  - 💾 Response Caching

### 📊 **Analytics & Monitoreo**
- **📈 Métricas Real-Time**
  - 🎪 Dashboard Ejecutivo
  - 🎯 KPIs Automáticos
  - 🚨 Alertas Inteligentes
  - 📊 Reportes Personalizados

### 🔒 **Cumplimiento Legal**
- **🇵🇪 Normativa Peruana**
  - 📊 PCGE Completo
  - 📚 Libros Electrónicos
  - 🏛️ Reportes SUNAT
  - 📄 Facturación Obligatoria

## 🎯 **FLUJOS DE PROCESO** - *Workflows Inteligentes*

### 💼 **Flujo Ventas Cuántico**
1. **🛒 Cliente → POS**
2. **📦 Auto-Update Inventario**
3. **📄 Genera CPE**
4. **🏛️ Envía SUNAT**
5. **🧮 Registra Contabilidad**
6. **📊 Actualiza Dashboard**

### 📦 **Flujo Compras IA**
1. **📋 Crear Orden**
2. **✅ Valida Proveedores**
3. **📦 Marca "ENTREGADO":**
   - ⚡ Stock Auto-Update
   - 🎯 Productos Auto-Creación
   - 📊 Registra Movimientos
4. **🧮 Genera Asientos**
5. **💰 Actualiza Valuación**

### 💰 **Flujo Planillas Automático**
1. **🚀 Click "Crear y Calcular"**
2. **🤖 Detecta Empleados Activos**
3. **📅 Crea Período Auto**
4. **💰 Calcula Normativa Peruana:**
   - 💰 Sueldo Proporcional
   - ⏰ Horas Extras 25% y 35%
   - 🏦 Descuentos AFP/ONP
   - 🏥 ESSALUD 9%
   - 👨‍👩‍👧‍👦 Asignación Familiar
   - 📊 Impuesto Renta
5. **📊 Genera Reportes Pro**
6. **📄 Boletas Individuales**

### 📄 **Flujo Facturación Electrónica**
1. **📋 Generar Comprobante**
2. **🔢 Numeración Auto**
3. **🔐 Firma Digital**
4. **🏛️ Envía SUNAT**
5. **📋 Recibe CDR**
6. **🧮 Registra Contabilidad**
7. **📤 Notifica Cliente**

## 🌟 **INNOVACIONES REVOLUCIONARIAS** - *Características Únicas*

### 🤖 **Automatización Cuántica**
- **⚡ RRHH Un-Click:** Planilla completa en 1 segundo
- **🛒 Compras IA:** Stock se actualiza mágicamente
- **📄 Facturación Instant:** Venta → SUNAT en tiempo real
- **🧮 Contabilidad Auto:** Asientos se generan solos

### 🎨 **UX/UI Galáctico**
- **💎 Diseño Corporativo:** Interface del futuro
- **📱 Responsivo Total:** Móvil, tablet, desktop
- **⚡ Feedback Visual:** Estados y animaciones
- **♿ Accesibilidad:** Estándares WCAG

### 🏗️ **Arquitectura Escalable**
- **🔧 Microservicios:** Módulos independientes
- **🏠 Multi-tenant:** Múltiples empresas
- **☁️ Cloud-ready:** Deploy en cualquier cloud
- **🔌 API-first:** Integrable con todo

## 📈 **ESTADÍSTICAS ÉPICAS** - *Números Impresionantes*

### 📊 **Datos Actuales**
- **👥 Usuarios Activos:** 4 (Admin, Contador, Vendedor, Almacenero)
- **📦 Productos Catálogo:** 5 productos premium
- **👥 Clientes Registrados:** 5 clientes estratégicos
- **🏭 Proveedores Activos:** 2 proveedores confiables
- **📊 Plan Cuentas:** 29 cuentas PCGE
- **👑 Roles Configurados:** 4 roles especializados
- **🎯 Módulos Operativos:** 10+ módulos funcionales

### 🚀 **Capacidades Técnicas**
- **🔌 APIs Disponibles:** 50+ endpoints
- **🗄️ Tablas BD:** 25+ tablas organizadas
- **🔧 Controladores:** 15+ especializados
- **🔗 Servicios Integración:** 4 automáticos
- **📄 Tipos Comprobantes:** Facturas, Boletas, NC, ND, GRE
- **📊 Reportes SIRE:** Optimización cuántica

## 🔮 **ROADMAP FUTURO** - *Visión 2025*

### 🚀 **Próximas Características**
- **🧠 BI con IA:** Dashboards con Machine Learning
- **📱 Mobile App:** App nativa iOS/Android
- **🌐 API Gateway:** Gestión centralizada
- **🔄 Workflow Engine:** Automatización total
- **👥 CRM Integrado:** Relaciones cliente 360°
- **🛒 E-commerce:** Tienda online integrada
- **🤖 Chatbot IA:** Asistente virtual empresarial
- **📊 Blockchain:** Trazabilidad inmutable 