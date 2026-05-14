# 🏢 ERP Suite - Sistema Empresarial Completo

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)
![NestJS](https://img.shields.io/badge/NestJS-11.x-red.svg)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-darkgreen.svg)
![License](https://img.shields.io/badge/license-Private-red.svg)

**Sistema ERP empresarial multi-tenant con facturación electrónica SUNAT/OSE, gestión comercial, inventarios, finanzas y contabilidad automatizada.**

[📚 Documentación](#-documentación) •
[🚀 Inicio Rápido](#-inicio-rápido) •
[🏗️ Arquitectura](#️-arquitectura) •
[📦 Módulos](#-módulos-del-sistema) •
[🔧 Desarrollo](#-desarrollo)

</div>

---

## 📋 Tabla de Contenidos

- [Descripción General](#-descripción-general)
- [Características Principales](#-características-principales)
- [Stack Tecnológico](#-stack-tecnológico)
- [Arquitectura del Sistema](#️-arquitectura)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Módulos del Sistema](#-módulos-del-sistema)
- [Inicio Rápido](#-inicio-rápido)
- [Configuración de Entorno](#-configuración-de-entorno)
- [Base de Datos](#-base-de-datos)
- [API Reference](#-api-reference)
- [Seguridad](#-seguridad)
- [Monitoreo y Observabilidad](#-monitoreo-y-observabilidad)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Documentación Detallada](#-documentación)
- [Contribución](#-contribución)

---

## 🎯 Descripción General

ERP Suite es un sistema de planificación de recursos empresariales (ERP) completo y moderno, diseñado para empresas que requieren:

- **Facturación Electrónica**: Integración completa con SUNAT (Perú) y DIAN (Colombia)
- **Gestión Comercial**: Ventas B2B, POS retail, cotizaciones y pedidos
- **Control de Inventarios**: Stock en tiempo real con reservas atómicas
- **Finanzas Integradas**: CxC, CxP, Tesorería y Contabilidad automatizada
- **Multi-Tenancy**: Aislamiento completo por empresa con Row Level Security

### ¿Para quién es este sistema?

- **Distribuidoras y mayoristas** que requieren control de inventario y facturación masiva
- **Empresas comerciales** con operaciones B2B y B2C simultáneas
- **Cadenas de retail** que necesitan POS integrado con facturación electrónica
- **Empresas de servicios** que requieren facturación profesional con detracciones

---

## ✨ Características Principales

### 🛒 Comercial
| Característica | Descripción |
|---------------|-------------|
| **Ventas B2B** | Ciclo completo: Cotización → Pedido → Despacho → Factura → Cobranza |
| **POS Retail** | Punto de venta rápido con operación offline-first |
| **Cotizaciones** | Gestión de propuestas con vencimiento y conversión automática |
| **Clientes** | CRM básico con línea de crédito y control de morosidad |

### 📦 Operaciones
| Característica | Descripción |
|---------------|-------------|
| **Inventario Dual** | Modelo stock_actual vs stock_reservado para prevenir sobreventas |
| **Logística** | Flujo Picking → Packing → Despacho con backorders |
| **Compras** | Órdenes de compra con flujo de aprobación por montos |
| **Recepciones** | Entrada de mercadería con integración contable automática |
| **Multi-Almacén** | Soporte para múltiples ubicaciones con transferencias |

### 💰 Finanzas
| Característica | Descripción |
|---------------|-------------|
| **Cuentas por Cobrar** | Generación automática desde facturas con aging report |
| **Cuentas por Pagar** | Programación de pagos y flujo de caja proyectado |
| **Tesorería** | Gestión de cajas con cierre ciego y hash de integridad |
| **Bancos** | Control de cuentas, movimientos y saldos consolidados |
| **Contabilidad** | Motor de asientos automáticos event-driven |

### 📄 Facturación Electrónica
| Característica | Descripción |
|---------------|-------------|
| **CPE SUNAT** | Facturas (01), Boletas (03), Notas Crédito/Débito |
| **GRE** | Guías de Remisión Electrónica con XML UBL 2.1 |
| **Firma Digital** | Soporte para certificados PFX con encriptación AES-256-GCM |
| **OSE Integration** | Envío asíncrono con reintentos automáticos |
| **Comunicación Baja** | Anulación de documentos con resumen diario |

### 🔐 Seguridad
| Característica | Descripción |
|---------------|-------------|
| **Multi-Tenancy** | Aislamiento por Row Level Security (RLS) |
| **Autenticación** | JWT con Supabase Auth |
| **Permisos Granulares** | Sistema RBAC con permisos por módulo/acción |
| **Auditoría** | Log completo de cambios con detección de anomalías |

---

## 🛠️ Stack Tecnológico

### Backend
```
┌─────────────────────────────────────────────────────────────┐
│  NestJS 11.x          │  Framework principal               │
│  TypeScript 5.4       │  Tipado estático                   │
│  Supabase             │  Base de datos (PostgreSQL 15)     │
│  Redis 7              │  Cache y colas de trabajo          │
│  BullMQ               │  Procesamiento de jobs asíncronos  │
└─────────────────────────────────────────────────────────────┘
```

### Frontend
```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 15           │  Framework React con SSR           │
│  TypeScript           │  Tipado estático                   │
│  TailwindCSS          │  Estilos utility-first             │
│  Supabase Client      │  Realtime y autenticación          │
└─────────────────────────────────────────────────────────────┘
```

### Infraestructura
```
┌─────────────────────────────────────────────────────────────┐
│  Docker Compose       │  Orquestación local                │
│  Prometheus           │  Métricas y alertas                │
│  Grafana              │  Dashboards de monitoreo           │
│  pnpm + Turborepo     │  Monorepo management               │
└─────────────────────────────────────────────────────────────┘
```

### Dependencias Clave
| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `@supabase/supabase-js` | 2.50.0 | Cliente de base de datos |
| `decimal.js` | 10.6.0 | Precisión monetaria |
| `xmlbuilder2` | 3.0.2 | Generación XML UBL |
| `node-forge` | 1.4.0 | Firma digital de documentos |
| `pdfkit` | 0.15.2 | Generación de PDFs |
| `ioredis` | 5.7.0 | Cliente Redis |
| `helmet` | 8.1.0 | Seguridad HTTP |

---

## 🏗️ Arquitectura

### Vista General del Sistema

```
                                    ┌─────────────────┐
                                    │   SUNAT / OSE   │
                                    │  (Facturación)  │
                                    └────────▲────────┘
                                             │ SOAP/REST
┌─────────────┐     ┌─────────────┐    ┌─────┴─────────┐     ┌─────────────┐
│             │     │             │    │               │     │             │
│  Frontend   │────▶│   ERP API   │───▶│    Worker     │────▶│   Redis     │
│  (Next.js)  │ REST│  (NestJS)   │    │  (BullMQ)     │     │   Queue     │
│             │     │             │    │               │     │             │
└─────────────┘     └──────┬──────┘    └───────────────┘     └─────────────┘
                           │
                           │ Supabase Client
                           ▼
              ┌────────────────────────┐
              │                        │
              │   Supabase (Postgres)  │
              │   ┌──────────────────┐ │
              │   │  Row Level       │ │
              │   │  Security (RLS)  │ │
              │   └──────────────────┘ │
              │                        │
              └────────────────────────┘
```

### Componentes Principales

| Componente | Path | Descripción |
|------------|------|-------------|
| **erp-api** | `apps/erp-api/` | Backend NestJS con toda la lógica de negocio |
| **web** | `apps/web/` | Frontend Next.js para usuarios finales |
| **worker** | `apps/worker/` | Procesador de tareas asíncronas (CPE, GRE, emails) |
| **libs/crypto** | `libs/crypto/` | Utilidades de encriptación compartidas |
| **libs/dtos** | `libs/dtos/` | DTOs y tipos compartidos |

### Patrones Arquitectónicos

#### 1. Multi-Tenancy con RLS
```sql
-- Todas las tablas incluyen tenant_id
-- RLS garantiza aislamiento automático
CREATE POLICY "tenant_isolation" ON productos
  USING (tenant_id = app.current_tenant_id());
```

#### 2. Patrón Outbox (Consistencia Eventual)
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Transacción    │     │  outbox_events  │     │    Worker       │
│  Principal      │────▶│  (pending)      │────▶│  Procesa        │
│  + Insert Event │     │                 │     │  Envía a SUNAT  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

#### 3. Event-Driven Contabilidad
```typescript
// Los asientos se generan automáticamente desde eventos
@OnEvent('documento.fiscal.generado')
async handleDocumentoFiscal(evento) {
  await this.generarAsientoVenta(evento);
}
```

---

## 📁 Estructura del Proyecto

```
erp/
├── 📂 apps/
│   ├── 📂 erp-api/              # Backend NestJS
│   │   ├── src/
│   │   │   ├── modules/         # Módulos de negocio
│   │   │   │   ├── ventas/      # Pedidos, cotizaciones, RMA
│   │   │   │   ├── pos/         # Punto de venta
│   │   │   │   ├── cpe/         # Facturación electrónica
│   │   │   │   ├── gre/         # Guías de remisión
│   │   │   │   ├── compras/     # Órdenes y recepciones
│   │   │   │   ├── inventario/  # Stock y logística
│   │   │   │   ├── finanzas/    # CxC, CxP, Bancos
│   │   │   │   ├── contabilidad/# Asientos y períodos
│   │   │   │   ├── cajas/       # Tesorería
│   │   │   │   └── ...
│   │   │   ├── shared/          # Servicios compartidos
│   │   │   └── common/          # Guards, interceptors
│   │   ├── tests/               # Tests E2E
│   │   └── package.json
│   │
│   ├── 📂 web/                  # Frontend Next.js
│   │   ├── src/
│   │   │   ├── app/             # App Router
│   │   │   ├── components/      # Componentes React
│   │   │   └── lib/             # Utilidades
│   │   └── package.json
│   │
│   └── 📂 worker/               # Background Jobs
│       └── src/
│
├── 📂 libs/                     # Librerías compartidas
│   ├── 📂 crypto/               # Encriptación
│   ├── 📂 dtos/                 # Data Transfer Objects
│   └── 📂 infra/                # Infraestructura
│
├── 📂 supabase/
│   ├── 📂 migrations/           # Migraciones activas 000..302
│   ├── 📂 seeds/                # Datos iniciales
│   └── 📂 verify/               # Scripts de verificación
│
├── 📂 docs/
│   ├── 📂 manuals/              # Documentación técnica
│   │   ├── 📂 modules/          # Docs por módulo
│   │   │   ├── VENTAS_POS_FISCAL.md
│   │   │   ├── COMPRAS_INVENTARIO.md
│   │   │   └── FINANZAS_CONTABILIDAD.md
│   │   └── ...
│   └── 📂 security/             # Docs de seguridad
│
├── 📂 monitoring/               # Prometheus + Grafana
│   ├── prometheus/
│   └── grafana/
│
├── 📂 scripts/                  # Scripts de utilidad
├── 📂 test/                     # Tests globales
├── docker-compose.yml           # Orquestación local
├── turbo.json                   # Config Turborepo
├── pnpm-workspace.yaml          # Workspaces
└── package.json                 # Root package
```

---

## 📦 Módulos del Sistema

### Módulo de Ventas (`/modules/ventas`)

**Propósito**: Gestión del ciclo comercial B2B completo.

| Submódulo | Servicio | Descripción |
|-----------|----------|-------------|
| Pedidos | `PedidosService` | Ciclo de vida del pedido con estados y aprobaciones |
| Cotizaciones | `CotizacionesService` | Propuestas comerciales con conversión a pedido |
| Clientes | `ClientesService` | CRM básico con línea de crédito |
| RMA | `RmaService` | Devoluciones y notas de crédito |

**Estados del Pedido**:
```
BORRADOR → PENDIENTE → CONFIRMADO → EN_PREPARACION → 
LISTO_DESPACHO → DESPACHADO → FACTURADO → COMPLETADO
```

📄 [Documentación completa: VENTAS_POS_FISCAL.md](docs/manuals/modules/VENTAS_POS_FISCAL.md)

---

### Módulo POS (`/modules/pos`)

**Propósito**: Punto de venta rápido para retail.

| Feature | Descripción |
|---------|-------------|
| **Venta Rápida** | Transacción atómica con idempotencia |
| **Sesiones de Caja** | Apertura/cierre con arqueo obligatorio |
| **Concurrencia** | Bloqueos pesimistas `pg_advisory_xact_lock` |
| **Offline-First** | Encola operaciones cuando no hay conexión |

**Seguridad Implementada**:
- Encriptación AES-256-GCM para certificados
- Aislamiento de tenant por transacción
- Hash SHA-256 de integridad en cierres

📄 [Documentación completa: VENTAS_POS_FISCAL.md](docs/manuals/modules/VENTAS_POS_FISCAL.md)

---

### Módulo CPE (`/modules/cpe`)

**Propósito**: Motor de facturación electrónica SUNAT.

| Documento | Código | Descripción |
|-----------|--------|-------------|
| Factura | 01 | Documento tributario principal |
| Boleta | 03 | Consumidor final |
| Nota Crédito | 07 | Anulaciones y devoluciones |
| Nota Débito | 08 | Cargos adicionales |

**Proceso de Emisión**:
```
Crear → Generar XML → Firmar → Encolar → Enviar OSE → Procesar CDR
```

---

### Módulo GRE (`/modules/gre`)

**Propósito**: Guías de Remisión Electrónica.

| Feature | Descripción |
|---------|-------------|
| **XML UBL 2.1** | Generación conforme a estándar SUNAT |
| **Auto-Generación** | Disparo automático al superar umbral de monto |
| **Firma Digital** | Mismo certificado que CPE |

---

### Módulo Compras (`/modules/compras`)

**Propósito**: Gestión de abastecimiento.

| Submódulo | Servicio | Descripción |
|-----------|----------|-------------|
| Órdenes | `OrdenesCompraService` | OC con flujo de aprobación |
| Recepciones | `RecepcionesService` | Entrada de mercadería |
| Proveedores | `ProveedoresService` | Catálogo de proveedores |
| Devoluciones | `DevolucionesProveedorService` | Retorno a proveedor |

**Estados de Orden de Compra**:
```
BORRADOR → PENDIENTE → APROBACION → APROBADA → PARCIAL → RECIBIDA
```

📄 [Documentación completa: COMPRAS_INVENTARIO.md](docs/manuals/modules/COMPRAS_INVENTARIO.md)

---

### Módulo Inventario (`/modules/inventario`)

**Propósito**: Control de existencias con operaciones atómicas.

| Conceptos Clave | Descripción |
|-----------------|-------------|
| `stock_actual` | Cantidad física real |
| `stock_reservado` | Comprometido en pedidos confirmados |
| `stock_disponible` | `actual - reservado` (calculado) |

**Tipos de Movimiento**:
| Tipo | Efecto |
|------|--------|
| ENTRADA | +stock_actual |
| SALIDA | -stock_actual |
| RESERVA | +stock_reservado |
| LIBERACION | -stock_reservado |
| TRANSFERENCIA | Cambia almacén |

📄 [Documentación completa: COMPRAS_INVENTARIO.md](docs/manuals/modules/COMPRAS_INVENTARIO.md)

---

### Módulo Finanzas (`/modules/finanzas`)

**Propósito**: Gestión financiera integral.

| Submódulo | Servicio | Descripción |
|-----------|----------|-------------|
| CxC | `CxcService` | Cuentas por cobrar con retenciones |
| CxP | `CxpService` | Cuentas por pagar con aging |
| Bancos | `BancosService` | Cuentas bancarias y movimientos |
| Tesorería | `TesoreriaService` | Flujo de caja y pagos en lote |

📄 [Documentación completa: FINANZAS_CONTABILIDAD.md](docs/manuals/modules/FINANZAS_CONTABILIDAD.md)

---

### Módulo Contabilidad (`/modules/contabilidad`)

**Propósito**: Motor contable automatizado.

| Servicio | Descripción |
|----------|-------------|
| `AsientosGeneratorService` | Generación automática desde eventos |
| `PeriodosService` | Control de períodos contables |
| `PlanCuentasService` | Catálogo de cuentas |
| `EstadosFinancierosService` | Balance y P&L |

**Eventos que Generan Asientos**:
- `documento.fiscal.generado` → Asiento de venta
- `cxc.cobro.registrado` → Asiento de cobro
- `recepcion.cerrada` → Asiento de compra
- `cxp.pago.aplicado` → Asiento de pago

📄 [Documentación completa: FINANZAS_CONTABILIDAD.md](docs/manuals/modules/FINANZAS_CONTABILIDAD.md)

---

### Módulo Cajas (`/modules/cajas`)

**Propósito**: Tesorería operativa.

| Feature | Descripción |
|---------|-------------|
| **Apertura** | Con monto inicial y denominaciones |
| **Cierre Ciego** | Cajero cuenta sin ver saldo esperado |
| **Hash Integridad** | SHA-256 de toda la sesión |
| **Cambio de Turno** | Sin cerrar sesión contable |
| **Cierre Administrativo** | Para sesiones "colgadas" |

---

## 🚀 Inicio Rápido

### Prerrequisitos

```bash
# Versiones requeridas
node >= 18.0.0
pnpm >= 8.0.0
docker >= 20.0.0
Docker Compose plugin >= 2.0.0
```

### 1. Clonar y Configurar

```bash
# Clonar repositorio
git clone <repository-url>
cd erp

# Instalar dependencias
pnpm install
```

### 2. Configurar Variables de Entorno

```bash
# Copiar template raiz para Compose
cp .env.example .env

# Para ejecucion directa del API, usar tambien la plantilla del API
cp apps/erp-api/.env.example apps/erp-api/.env.local

# Editar con tus credenciales
# Ver docs/configuration.md y docs/ops/docker.md para detalles
```

### 3. Iniciar Servicios con Docker

```bash
# Levantar todos los servicios
docker compose --env-file .env up --build

# Verificar estado
docker compose ps
```

### 4. Ejecutar Migraciones

```bash
# Validar primero el estado vigente
cat docs/db_rebuild_status.md

# Con Supabase CLI y entorno local disponible, aplicar 000..302 en orden
supabase db reset
```

### 5. Iniciar en Desarrollo

```bash
# Terminal 1: Backend
pnpm --filter @erp-suite/erp-api dev

# Terminal 2: Frontend
pnpm --filter @erp-suite/web dev

# O usar Turborepo para todo
pnpm dev
```

### 6. Acceder a la Aplicación

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:3002 |
| Swagger Docs | http://localhost:3002/api/docs |
| Grafana | http://localhost:3300 (admin/admin) |
| Prometheus | http://localhost:9091 |

---

## ⚙️ Configuración de Entorno

### Variables Requeridas

```env
# ============================================
# SUPABASE
# ============================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# ============================================
# JWT & AUTH
# ============================================
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret
SESSION_SECRET=your-session-secret
CSRF_SECRET=your-csrf-secret
AUTH_SIGNATURE_SECRET=your-auth-signature-secret

# ============================================
# CERTIFICADO DIGITAL (SUNAT)
# ============================================
CERT_ENCRYPTION_KEY=32-char-encryption-key-here
DB_ENCRYPTION_KEY=32-char-db-encryption-key-here
CERT_ENCRYPTION_KEY_OLD=  # Para rotación de claves
PFX_PATH=/path/to/certificate.pfx
PFX_PASS=certificate-password

# ============================================
# OSE (Facturación Electrónica)
# ============================================
OSE_URL=https://ose-provider.com/api
OSE_USERNAME=your-ose-username
OSE_PASSWORD=your-ose-password

# ============================================
# REDIS
# ============================================
REDIS_HOST=localhost
REDIS_PORT=6379
POS_WORKER_JWT_SECRET=replace_with_worker_jwt_secret_min_24_chars

# ============================================
# SERVER
# ============================================
PORT=3002
NODE_ENV=development
```

Plantillas vigentes:

- `.env.example` para `docker compose`.
- `apps/erp-api/.env.example` para ejecucion directa del API.
- `docs/configuration.md` para reglas de validacion del backend.
- `docs/ops/docker.md` para variables del stack API/worker.

---

## 🗄️ Base de Datos

### Esquema Principal

El sistema utiliza **PostgreSQL 15** via Supabase. La fuente vigente de reconstruccion indica migraciones activas `000..302` y 299 archivos SQL; ver `docs/db_rebuild_status.md` antes de aplicar o reconstruir BD.

| Categoría | Tablas Principales |
|-----------|-------------------|
| **Comercial** | `pedidos_venta`, `pedidos_venta_detalle`, `cotizaciones`, `clientes` |
| **POS** | `ventas_pos`, `ventas_pos_detalle`, `sesiones_caja`, `movimientos_caja` |
| **Fiscal** | `cpe`, `gre`, `comunicacion_baja` |
| **Compras** | `ordenes_compra`, `recepciones`, `proveedores` |
| **Inventario** | `productos`, `producto_existencias`, `movimientos_inventario` |
| **Finanzas** | `cuentas_por_cobrar`, `cuentas_por_pagar`, `cuentas_bancarias` |
| **Contabilidad** | `asientos_contables`, `detalle_asientos`, `periodos_contables` |
| **Sistema** | `tenants`, `users`, `roles`, `permisos`, `outbox_events` |

### Funciones RPC Clave

```sql
-- Stock atómico
registrar_entrada_stock_atomico(...)
reservar_stock(...)
descontar_stock(...)

-- POS transaccional
pos_registrar_venta_tx(...)

-- Contexto de tenant
app.set_tenant_context(...)
app.current_tenant_id()

-- Pedidos atómicos
crear_pedido_completo(...)
```

### Ejecutar Migraciones

```bash
# Usando Supabase CLI sobre una BD local/limpia
supabase db reset

# Verificar estado
supabase db status
```

No ejecutar SQL sueltos de raiz sin convertirlos antes en migraciones/seeds idempotentes. Algunos archivos estan marcados como forenses en `docs/DOCUMENTATION_QUARANTINE.md`.

---

## 📡 API Reference

### Autenticación

Todas las rutas requieren autenticación JWT:

```http
Authorization: Bearer <jwt-token>
X-Tenant-Id: <tenant-uuid>
```

### Endpoints Principales

#### Ventas
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/ventas/pedidos` | Listar pedidos |
| POST | `/api/ventas/pedidos` | Crear pedido |
| POST | `/api/ventas/pedidos/:id/confirmar` | Confirmar pedido |
| POST | `/api/ventas/pedidos/:id/generar-factura` | Facturar |

#### POS
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/pos/venta` | Procesar venta rápida |
| POST | `/api/pos/abrir-caja` | Abrir sesión |
| POST | `/api/pos/cerrar-caja` | Cerrar sesión |

#### CPE
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/cpe` | Crear comprobante |
| GET | `/api/cpe/:id/pdf` | Descargar PDF |
| POST | `/api/cpe/:id/enviar-sunat` | Enviar a OSE |

#### Inventario
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/inventario/productos` | Listar productos |
| GET | `/api/inventario/stock/:productoId` | Ver stock |
| POST | `/api/inventario/movimientos` | Registrar movimiento |

### Swagger Documentation

Acceder a documentación interactiva en:
```
http://localhost:3002/api/docs
```

---

## 🔐 Seguridad

### Multi-Tenancy

El sistema implementa aislamiento estricto por tenant usando Row Level Security:

```sql
-- Cada tabla tiene política RLS
CREATE POLICY "tenant_isolation" ON tabla
  USING (tenant_id = app.current_tenant_id());
```

### Autenticación

- **Provider**: Supabase Auth
- **Token**: JWT con claims de tenant y permisos
- **Expiración**: Configurable (default 24h)

### Autorización (RBAC)

```typescript
// Permisos granulares por acción
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('ventas.pedidos.crear')
async crearPedido() { }
```

### Encriptación

| Dato | Método |
|------|--------|
| Certificados PFX | AES-256-GCM |
| Passwords en BD | bcrypt |
| Sesiones de caja | Hash SHA-256 |

### Auditoría

```typescript
// Log automático de cambios
interface AuditLog {
  entity_type: string;
  entity_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  old_values: object;
  new_values: object;
  user_id: string;
  ip_address: string;
}
```

📄 [Más información: security/](docs/security/)

---

## 📊 Monitoreo y Observabilidad

### Stack de Monitoreo

```yaml
services:
  prometheus:     # Métricas (puerto 9091)
  grafana:        # Dashboards (puerto 3300)
  redis-exporter: # Métricas Redis
  node-exporter:  # Métricas de sistema
```

### Métricas Expuestas

El API expone métricas en `/metrics`:

```
# Requests HTTP
http_request_duration_seconds
http_requests_total

# Negocio
erp_ventas_total
erp_cpe_emitidos_total
erp_stock_movimientos_total

# Redis
redis_connected_clients
redis_used_memory_bytes
```

### Dashboards Grafana

1. **Overview**: KPIs principales del sistema
2. **API Performance**: Latencias y errores
3. **Business Metrics**: Ventas, facturación, inventario

---

## 🧪 Testing

### Estructura de Tests

```
apps/erp-api/
├── tests/           # Tests E2E legacy
├── src/
│   └── modules/
│       └── **/*.spec.ts  # Unit tests por servicio
└── jest.config.js
```

### Ejecutar Tests

```bash
# Unit tests
pnpm --filter @erp-suite/erp-api test

# Con coverage
pnpm --filter @erp-suite/erp-api test:cov

# Watch mode
pnpm --filter @erp-suite/erp-api test:watch

# E2E tests
pnpm --filter @erp-suite/erp-api test:e2e
```

### Cobertura Actual

Los módulos críticos tienen tests para:
- Validaciones de negocio
- Transiciones de estado
- Operaciones atómicas de stock
- Idempotencia de pagos
- Generación de asientos contables

---

## 🚢 Deployment

### Docker Build

```bash
# Build de imagen API
docker build -f apps/erp-api/Dockerfile -t erp-api:latest .

# Push a registry
docker tag erp-api:latest ghcr.io/org/erp-api:latest
docker push ghcr.io/org/erp-api:latest
```

### Docker Compose

```bash
# Validar configuracion sin secretos reales
docker compose --env-file .env.example config --quiet

# Con variables reales locales/produccion
docker compose --env-file .env up --build
```

### Kubernetes (Helm)

```bash
# Lint chart
pnpm k8s:lint

# Deploy
pnpm k8s:deploy
```

---

## 📚 Documentación

### Documentación Técnica

| Documento | Descripción |
|-----------|-------------|
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Estado operativo vigente, gates ejecutados, riesgos y bloqueantes |
| [PROJECT_REVIEW_INDEX.md](PROJECT_REVIEW_INDEX.md) | Índice maestro de revisión exhaustiva por rondas |
| [docs/db_rebuild_status.md](docs/db_rebuild_status.md) | Fuente vigente de reconstrucción BD `000..302` |
| [docs/DOCUMENTATION_QUARANTINE.md](docs/DOCUMENTATION_QUARANTINE.md) | Clasificación de docs/artefactos obsoletos antes de borrar |
| [VENTAS_POS_FISCAL.md](docs/manuals/modules/VENTAS_POS_FISCAL.md) | Módulos comerciales y fiscales (~600 líneas) |
| [COMPRAS_INVENTARIO.md](docs/manuals/modules/COMPRAS_INVENTARIO.md) | Compras, inventario y logística (~500 líneas) |
| [FINANZAS_CONTABILIDAD.md](docs/manuals/modules/FINANZAS_CONTABILIDAD.md) | Finanzas y contabilidad (~500 líneas) |
| [SYSTEM_ARCHITECTURE.md](docs/manuals/SYSTEM_ARCHITECTURE.md) | Arquitectura general histórica; validar contra el índice vigente |
| [DATABASE_REFERENCE.md](docs/manuals/DATABASE_REFERENCE.md) | Referencia histórica; usar `docs/db_rebuild_status.md` como fuente BD |
| [DEVELOPER_GUIDE.md](docs/manuals/DEVELOPER_GUIDE.md) | Guía histórica; validar comandos contra este README y docs ops |

### Documentación de Seguridad

| Documento | Descripción |
|-----------|-------------|
| [route-access-matrix.md](docs/security/route-access-matrix.md) | Matriz vigente de autorización por endpoint |
| [session-auth.md](docs/security/session-auth.md) | Sesión por cookie HttpOnly y auth actual |
| [rate-limiting.md](docs/security/rate-limiting.md) | Rate limiting global y configuración |
| [supabase-access-audit.md](docs/security/supabase-access-audit.md) | Auditoría de acceso Supabase/service role |
| [security-dashboard.md](docs/security/security-dashboard.md) | Dashboard de monitoreo; revisar junto con cuarentena |

---

## 🤝 Contribución

### Flujo de Trabajo

1. Crear branch desde `main`: `feature/nombre-feature`
2. Desarrollar con tests
3. Asegurar que pasan lint y tests
4. Crear Pull Request
5. Code review obligatorio
6. Merge a `main`

### Estándares de Código

```bash
# Lint
pnpm lint

# Type check
pnpm type-check

# Format
pnpm format
```

### Convenciones de Commits

```
feat: nueva funcionalidad
fix: corrección de bug
docs: cambios en documentación
refactor: refactorización sin cambio funcional
test: agregar o modificar tests
chore: tareas de mantenimiento
```

---

## 📞 Soporte

Para soporte técnico o consultas sobre el sistema, contactar al equipo de desarrollo.

---

<div align="center">

**ERP Suite** © 2025 - Sistema Empresarial Multi-Tenant

Construido con ❤️ usando NestJS + Supabase + Next.js

</div>
