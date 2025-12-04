# Demo System - Database Design

## Análisis de Tablas Involucradas

### 🎯 Decisión Arquitectónica Principal

**NO crear tabla separada `empresas_demo`**. 

**Usar la tabla `tenants` existente** con campos adicionales para identificar y gestionar demos.

### Razón:

1. **Simplicidad**: Un tenant demo ES un tenant normal con expiración
2. **RLS existente**: Aprovechamos todo el sistema multi-tenant ya implementado
3. **Cero duplicación**: No necesitamos replicar lógica de aislamiento
4. **Conversión fácil**: De demo a real es solo cambiar 2 campos

---

## 📊 Tabla Principal: `tenants`

### Estructura Actual (inferida del código)

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR,
  ruc VARCHAR,
  direccion TEXT,
  telefono VARCHAR,
  email VARCHAR,
  pais TEXT,
  moneda VARCHAR,
  estado TEXT,
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ,
  plan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### ✅ Campos a AGREGAR (Migración 142)

```sql
ALTER TABLE tenants 
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_extended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_conversion_attempted BOOLEAN DEFAULT false;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tenants_demo_active 
  ON tenants(is_demo, demo_expires_at) 
  WHERE is_demo = true AND demo_expires_at > NOW();

CREATE INDEX IF NOT EXISTS idx_tenants_demo_expired 
  ON tenants(demo_expires_at) 
  WHERE is_demo = true AND demo_expires_at < NOW();

-- Comentarios
COMMENT ON COLUMN tenants.is_demo IS 
  'Indica si este tenant es una demo temporal (true) o cuenta real (false)';

COMMENT ON COLUMN tenants.demo_expires_at IS 
  'Fecha de expiración de la demo. NULL si no es demo o si se convirtió a cuenta real';

COMMENT ON COLUMN tenants.demo_created_at IS 
  'Fecha de creación de la demo. Útil para analytics';

COMMENT ON COLUMN tenants.demo_extended IS 
  'Indica si la demo ya fue extendida una vez (máximo 1 extensión)';

COMMENT ON COLUMN tenants.demo_conversion_attempted IS 
  'Indica si el usuario intentó convertir la demo a cuenta real';
```

---

## 📋 Tabla Relacionada: `empresa_config`

Esta tabla ya existe y contiene la configuración de cada tenant.

### Campos Relevantes para Demo

```sql
-- Campos existentes que usaremos:
- tenant_id (FK a tenants)
- razon_social
- ruc
- direccion_fiscal
- logo_url
- certificado_pfx (NULL para demos)
- serie_factura, serie_boleta, etc.
- estado (ACTIVO, PRUEBA, etc.)
- configuracion_completa (boolean)
```

### ✅ Campos a AGREGAR (Migración 142)

```sql
ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS demo_seed_version VARCHAR(10),
  ADD COLUMN IF NOT EXISTS demo_seed_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN empresa_config.demo_seed_version IS 
  'Versión del seed de datos demo aplicado (ej: "1.0", "1.1")';

COMMENT ON COLUMN empresa_config.demo_seed_completed_at IS 
  'Timestamp de cuándo se completó el seed de datos demo';
```

---

## 🔐 Tabla: `usuarios_sistema`

Usuarios que acceden al sistema (ya existe).

### Campos Relevantes

```sql
-- Campos existentes:
- id UUID
- tenant_id UUID
- email VARCHAR
- password_hash VARCHAR (bcrypt)
- nombre VARCHAR
- rol VARCHAR (ADMIN, VENDEDOR, etc.)
- activo BOOLEAN
```

### ✅ Campos a AGREGAR (Migración 142)

```sql
ALTER TABLE usuarios_sistema
  ADD COLUMN IF NOT EXISTS is_demo_user BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_email_temp VARCHAR;

COMMENT ON COLUMN usuarios_sistema.is_demo_user IS 
  'Indica si este usuario fue creado automáticamente para una demo';

COMMENT ON COLUMN usuarios_sistema.demo_email_temp IS 
  'Email temporal generado para la demo (ej: demo-uuid@temp.local). Se reemplaza al convertir a cuenta real';
```

---

## 📦 Tablas que Recibirán Seeds de Demo

Estas tablas **NO necesitan modificación**, solo recibirán datos seed:

### 1. Catálogos Base
- ✅ `paises` (ya tiene datos)
- ✅ `tipos_documentos_fiscales` (ya tiene datos)
- ✅ `tipos_impuestos` (ya tiene datos)
- ✅ `plan_cuentas` (seed por tenant)

### 2. Maestros
- ✅ `clientes` (10 clientes demo)
- ✅ `proveedores` (5 proveedores demo)
- ✅ `productos` (20 productos demo)
- ✅ `cajas` (2 cajas POS demo)
- ✅ `cuentas_bancarias` (1 cuenta demo)

### 3. Transacciones Históricas
- ✅ `ventas` (15 ventas demo)
- ✅ `ventas_pos` (10 ventas POS demo)
- ✅ `cotizaciones` (5 cotizaciones demo)
- ✅ `asientos_contables` (generados automáticamente)
- ✅ `sesiones_caja` (3 sesiones demo)
- ✅ `cuentas_por_pagar` (5 CxP demo)

---

## 🔄 Tabla Nueva: `demo_analytics` (Opcional - Fase 6)

Para trackear uso de demos y métricas de conversión.

```sql
CREATE TABLE IF NOT EXISTS demo_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Métricas de uso
  total_sesiones INTEGER DEFAULT 0,
  total_ventas_creadas INTEGER DEFAULT 0,
  total_productos_creados INTEGER DEFAULT 0,
  total_clientes_creados INTEGER DEFAULT 0,
  
  -- Páginas visitadas (JSONB)
  paginas_visitadas JSONB DEFAULT '[]'::jsonb,
  
  -- Features usadas
  features_usadas JSONB DEFAULT '[]'::jsonb,
  
  -- Tiempo de uso
  primera_sesion TIMESTAMPTZ,
  ultima_sesion TIMESTAMPTZ,
  tiempo_total_minutos INTEGER DEFAULT 0,
  
  -- Conversión
  conversion_intentada BOOLEAN DEFAULT false,
  conversion_exitosa BOOLEAN DEFAULT false,
  conversion_fecha TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_demo_analytics_tenant ON demo_analytics(tenant_id);
CREATE INDEX idx_demo_analytics_conversion ON demo_analytics(conversion_exitosa);

COMMENT ON TABLE demo_analytics IS 
  'Métricas de uso y conversión de tenants demo para análisis de producto';
```

---

## 🧹 Función de Limpieza Automática

```sql
-- Función para marcar demos expirados como inactivos
CREATE OR REPLACE FUNCTION cleanup_expired_demo_tenants()
RETURNS TABLE(
  tenants_desactivados INTEGER,
  tenants_eliminados INTEGER
) AS $$
DECLARE
  v_desactivados INTEGER := 0;
  v_eliminados INTEGER := 0;
BEGIN
  -- Paso 1: Marcar como inactivos los demos expirados (hace menos de 30 días)
  UPDATE tenants 
  SET 
    estado = 'INACTIVO',
    updated_at = NOW()
  WHERE is_demo = true 
    AND demo_expires_at < NOW() 
    AND estado != 'INACTIVO'
    AND demo_expires_at > NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS v_desactivados = ROW_COUNT;
  
  -- Paso 2: Eliminar demos expirados hace más de 30 días
  -- (CASCADE eliminará todos los datos relacionados)
  DELETE FROM tenants
  WHERE is_demo = true
    AND demo_expires_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS v_eliminados = ROW_COUNT;
  
  RETURN QUERY SELECT v_desactivados, v_eliminados;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_expired_demo_tenants() IS 
  'Limpia demos expirados: marca como inactivos (<30 días) y elimina (>30 días)';
```

---

## 🔒 RLS (Row Level Security)

**NO necesitamos modificar RLS**. El sistema multi-tenant existente ya maneja:

```sql
-- Ejemplo de política existente (no modificar)
CREATE POLICY tenant_isolation ON productos
  FOR ALL
  USING (tenant_id = app.current_tenant_id());
```

Los tenants demo usan el **mismo RLS** que los tenants reales. Esto garantiza:
- ✅ Aislamiento total de datos
- ✅ No pueden ver datos de otros demos
- ✅ No pueden ver datos de tenants reales

---

## 📝 Restricciones para Demos

Estas restricciones se implementan en **backend (NestJS)**, NO en base de datos:

### Restricciones Aplicadas

```typescript
// apps/erp-api/src/modules/demo/demo.restrictions.ts

export const DEMO_LIMITS = {
  // Límites de registros
  MAX_PRODUCTOS: 100,
  MAX_CLIENTES: 50,
  MAX_VENTAS: 200,
  MAX_USUARIOS: 5,
  
  // Funciones deshabilitadas
  FACTURACION_REAL_SUNAT: false,
  ENVIO_EMAILS_REALES: false,
  INTEGRACION_BANCOS: false,
  EXPORTACION_MASIVA: false,
  
  // Restricciones de configuración
  CAMBIAR_RUC: false,
  SUBIR_CERTIFICADO_REAL: false,
  CAMBIAR_PAIS: false,
};
```

---

## 🎨 Vista para Dashboard de Demos (Superadmin)

```sql
CREATE OR REPLACE VIEW vw_demo_dashboard AS
SELECT 
  t.id,
  t.nombre,
  t.ruc,
  t.demo_created_at,
  t.demo_expires_at,
  EXTRACT(DAY FROM (t.demo_expires_at - NOW())) AS dias_restantes,
  t.demo_extended,
  t.demo_conversion_attempted,
  
  -- Métricas de uso
  da.total_sesiones,
  da.total_ventas_creadas,
  da.tiempo_total_minutos,
  da.conversion_exitosa,
  
  -- Estado
  CASE 
    WHEN t.demo_expires_at < NOW() THEN 'EXPIRADO'
    WHEN t.demo_expires_at < NOW() + INTERVAL '3 days' THEN 'POR_EXPIRAR'
    ELSE 'ACTIVO'
  END AS estado_demo,
  
  -- Usuario demo
  u.email AS usuario_email,
  u.nombre AS usuario_nombre,
  u.demo_email_temp
  
FROM tenants t
LEFT JOIN demo_analytics da ON da.tenant_id = t.id
LEFT JOIN usuarios_sistema u ON u.tenant_id = t.id AND u.is_demo_user = true
WHERE t.is_demo = true
ORDER BY t.demo_created_at DESC;

COMMENT ON VIEW vw_demo_dashboard IS 
  'Vista consolidada de demos para el dashboard de superadmin';
```

---

## 📊 Resumen de Cambios en Base de Datos

### Tablas Modificadas (3)
1. ✅ `tenants` - Agregar campos de demo
2. ✅ `empresa_config` - Agregar tracking de seed
3. ✅ `usuarios_sistema` - Agregar flag de usuario demo

### Tablas Nuevas (1 opcional)
1. ⚪ `demo_analytics` - Métricas de uso (Fase 6)

### Funciones Nuevas (1)
1. ✅ `cleanup_expired_demo_tenants()` - Limpieza automática

### Vistas Nuevas (1)
1. ✅ `vw_demo_dashboard` - Dashboard de demos

### Índices Nuevos (2)
1. ✅ `idx_tenants_demo_active` - Demos activos
2. ✅ `idx_tenants_demo_expired` - Demos expirados

---

## 🚀 Orden de Implementación

### Migración 142: Demo Tenant Support

```sql
-- 1. Modificar tenants
ALTER TABLE tenants ADD COLUMN ...

-- 2. Modificar empresa_config
ALTER TABLE empresa_config ADD COLUMN ...

-- 3. Modificar usuarios_sistema
ALTER TABLE usuarios_sistema ADD COLUMN ...

-- 4. Crear función de limpieza
CREATE OR REPLACE FUNCTION cleanup_expired_demo_tenants() ...

-- 5. Crear vista de dashboard
CREATE OR REPLACE VIEW vw_demo_dashboard ...

-- 6. Crear índices
CREATE INDEX ...
```

### Migración 143: Demo Analytics (Opcional - Fase 6)

```sql
-- 1. Crear tabla demo_analytics
CREATE TABLE demo_analytics ...

-- 2. Crear índices
CREATE INDEX ...
```

---

## ✅ Validación de Diseño

### ¿Por qué NO crear tabla `empresas_demo` separada?

❌ **Opción Rechazada**: Tabla separada
```sql
CREATE TABLE empresas_demo (
  id UUID,
  nombre VARCHAR,
  ...
  -- Duplica toda la estructura de tenants
);
```

**Problemas**:
- Duplicación de estructura
- RLS duplicado
- Lógica de negocio duplicada
- Conversión compleja (migrar datos entre tablas)

✅ **Opción Elegida**: Campos en `tenants`
```sql
ALTER TABLE tenants 
  ADD COLUMN is_demo BOOLEAN,
  ADD COLUMN demo_expires_at TIMESTAMPTZ;
```

**Ventajas**:
- Cero duplicación
- RLS existente funciona
- Conversión simple (UPDATE de 2 campos)
- Un solo código para demos y reales

---

## 🎯 Conclusión

**Tablas que necesitamos modificar**: Solo 3 (`tenants`, `empresa_config`, `usuarios_sistema`)

**Tablas que necesitamos crear**: 0 (1 opcional para analytics en Fase 6)

**Complejidad**: Baja - Solo agregar campos a tablas existentes

**Riesgo**: Mínimo - No afecta datos existentes

**Tiempo estimado**: 2-3 horas de implementación + testing

---

**Próximo paso**: Crear migración `142__demo_tenant_support.sql`




Database Tables

tenants

NameDescriptionData TypeFormatNullable

id

No description

uuiduuid

nombre

No description

character varyingvarchar

ruc

No description

character varyingvarchar

direccion

No description

texttext

telefono

No description

character varyingvarchar

email

No description

character varyingvarchar

pais

No description

texttext

moneda

No description

character varyingvarchar

estado

No description

texttext

fecha_inicio

No description

timestamp with time zonetimestamptz

fecha_fin

No description

timestamp with time zonetimestamptz

plan

No description

texttext

created_at

No description

timestamp with time zonetimestamptz

updated_at

No description

timestamp with time zonetimestamptz   Database Tables

empresa_config

New column

NameDescriptionData TypeFormatNullable

id

No description

uuiduuid

tenant_id

No description

uuiduuid

tipo_contribuyente

No description

character varyingvarchar

regimen_tributario

GENERAL, MYPE, RER, RUS

character varyingvarchar

certificado_pfx

No description

byteabytea

certificado_password

No description

character varyingvarchar

certificado_vigencia

No description

datedate

ose_url

No description

character varyingvarchar

ose_username

No description

character varyingvarchar

ose_password

No description

character varyingvarchar

ose_activo

No description

booleanbool

serie_factura

No description

character varyingvarchar

serie_boleta

No description

character varyingvarchar

serie_nota_credito

No description

character varyingvarchar

serie_nota_debito

No description

character varyingvarchar

serie_guia_remision

No description

character varyingvarchar

ultimo_numero_factura

No description

integerint4

ultimo_numero_boleta

No description

integerint4

ultimo_numero_nota_credito

No description

integerint4

ultimo_numero_nota_debito

No description

integerint4

ultimo_numero_guia_remision

No description

integerint4

created_at

No description

timestamp with time zonetimestamptz

updated_at

No description

timestamp with time zonetimestamptz

razon_social

Razón social de la empresa

character varyingvarchar

ruc

RUC de la empresa

character varyingvarchar

direccion_fiscal

Dirección fiscal de la empresa

texttext

telefono

Teléfono de contacto de la empresa

character varyingvarchar

email

Email de contacto de la empresa

character varyingvarchar

sitio_web

Sitio web de la empresa

character varyingvarchar

representante_legal

Representante legal de la empresa

character varyingvarchar

igv_porcentaje

Porcentaje de IGV (18% en Perú)

numericnumeric

retencion_renta_porcentaje

Porcentaje de retención de renta aplicado

numericnumeric

pais_id

No description

integerint4

nombre_comercial

No description

character varyingvarchar

ubigeo

No description

character varyingvarchar

departamento

No description

character varyingvarchar

provincia

No description

character varyingvarchar

distrito

No description

character varyingvarchar

dni_representante

No description

character varyingvarchar

actividad_economica

No description

texttext

percepcion_porcentaje

No description

numericnumeric

detraccion_porcentaje

No description

numericnumeric

moneda_defecto

No description

character varyingvarchar

redondeo_decimales

No description

integerint4

incluir_igv_en_precio

No description

booleanbool

envio_automatico_sunat

No description

booleanbool

generar_pdf_automatico

No description

booleanbool

enviar_email_cliente

No description

booleanbool

validar_ruc_sunat

No description

booleanbool

usar_codigos_barra

No description

booleanbool

formato_numeros

No description

character varyingvarchar

logo_url

URL o base64 del logo de la empresa para impresión en facturas, boletas y tickets (multi-tenant)

texttext

logo_base64

No description

texttext

color_primario

No description

character varyingvarchar

color_secundario

No description

character varyingvarchar

estado

Estado del tenant: ACTIVO, INACTIVO, SUSPENDIDO, PRUEBA

texttext

fecha_inicio

Fecha de inicio del tenant

timestamp with time zonetimestamptz

fecha_fin

Fecha de fin del tenant (si aplica)

timestamp with time zonetimestamptz

plan

Plan de suscripción del tenant

texttext

pais

Código de país (ISO 3166-1 alpha-2)

texttext

configuracion_completa

Indicates if the tenant has completed all required configuration

booleanbool

fecha_validacion_certificado

No description

timestamp without time zonetimestamp

certificado_expira_en

No description

datedate

umbral_gre_automatico

Monto en soles a partir del cual se sugiere generar GRE automáticamente (default: S/ 700)

numericnumeric

gre_automatico_habilitado

Si true, sugiere GRE automáticamente cuando se supera el umbral

booleanbool

ultima_validacion

No description

timestamp without time zonetimestamp

errores_configuracion

No description

jsonbjsonb

tipo_empresa

Tipo de empresa: MICRO, PEQUEÑA, MEDIANA o GRANDE. Determina configuración por defecto

character varyingvarchar

usar_flujo_logistica

Si true, usa flujo completo con preparación y despacho. Si false, flujo simplificado directo a facturación

booleanbool

gre_obligatorio

Si true, exige GRE para todas las ventas. Si false, es opcional

booleanbool

monto_maximo_sin_aprobacion

No description

numericnumeric

porcentaje_descuento_maximo

No description

numericnumeric

requiere_aprobacion_descuento

No description

booleanbool

aplicar_limite_credito

No description

booleanbool

dias_gracia_morosidad

No description

integerint4

dias_vencimiento_factura

No description

integerint4

aplicar_retencion

No description

booleanbool

retencion_tasa

No description

numericnumeric

aplicar_percepcion

No description

booleanbool

percepcion_tasa

No description

numericnumeric

aplicar_detraccion

No description

booleanbool

detraccion_tasa

No description

numericnumeric

detraccion_codigo

No description

texttext

habilitar_rma

Si true, habilita el flujo de devoluciones (RMA) con retorno físico a inventario.

booleanbool

dias_maximos_rma

Cantidad máxima de días desde la venta para aceptar una solicitud RMA.

integerint4

rma_requiere_control_calidad

Si true, requiere control de calidad antes de reincorporar stock devuelto.

booleanbool

habilitar_multialmacen

Si true, habilita la gestión de múltiples almacenes por tenant.

booleanbool

requiere_ubicaciones_inventario

Si true, exige registrar ubicaciones/pasillos en los almacenes.

booleanbool

requiere_lotes_series

Si true, exige control de lotes/series y compatibilidad FEFO.

booleanbool

politica_rotacion_inventario

Política de rotación aplicada al despacho de inventario (FIFO o FEFO).

character varyingvarchar

habilitar_dashboards_sunat

Si true, expone dashboards multi-tenant con KPIs de cumplimiento SUNAT.

booleanbool

habilitar_dashboards_otif

Si true, habilita paneles OTIF (On-Time, In-Full) para monitorear entregas.

booleanbool

objetivo_otif

Porcentaje objetivo OTIF definido por el tenant.

numericnumeric

frecuencia_actualizacion_dashboards

Frecuencia (en minutos) para actualizar datasets de dashboards SUNAT/OTIF.

integerint4

monto_aprobacion_compras

Monto mínimo (en moneda local) que requiere aprobación para órdenes de compra. Si el total de la OC excede este monto, el estado inicial será APROBACION. Si es 0 o NULL, no se requiere aprobación.

numericnumeric

generar_cxp_en

No description

character varyingvarchar

pfx_encrypted

Certificado PFX cifrado con AES-256-GCM (base64)

texttext

pfx_password_encrypted

Contraseña del PFX cifrada con AES-256-GCM (base64)

texttext  Database Tables

usuarios_sistema

New column

NameDescriptionData TypeFormatNullable

id

No description

uuiduuid

tenant_id

No description

uuiduuid

nombre

No description

texttext

email

No description

texttext

telefono

No description

texttext

cargo

No description

texttext

departamento

No description

texttext

estado

No description

texttext

fecha_ultimo_acceso

No description

timestamp with time zonetimestamptz

created_at

No description

timestamp with time zonetimestamptz

updated_at

No description

timestamp with time zonetimestamptz

apellido

Apellido del usuario

texttext

nombre_usuario

Nombre de usuario para login

texttext

password_hash

Hash de la contraseña (bcrypt)

texttext

is_super_admin

Indica si el usuario es super-administrador del sistema

booleanbool

password_reset_token

Token para reseteo de contraseña

texttext

password_reset_expires

Fecha de expiración del token de reseteo

timestamp with time zonetimestamptz

failed_login_attempts

Número de intentos fallidos de login

integerint4

locked_until

Fecha hasta la cual la cuenta está bloqueada

timestamp with time zonetimestamptz

activo

Indica si el usuario está activo (compatibilidad)

booleanbool  Database Tables

usuario_configuracion

New column

NameDescriptionData TypeFormatNullable

id

No description

uuiduuid

usuario_id

No description

uuiduuid

pais_preferido_id

No description

integerint4

idioma

No description

character varyingvarchar

zona_horaria

No description

character varyingvarchar

formato_fecha

No description

character varyingvarchar

formato_moneda

No description

character varyingvarchar

created_at

No description

timestamp with time zonetimestamptz

updated_at

No description

timestamp with time zonetimestamptz

tenant_id

ID del tenant para aislamiento multi-tenant

uuiduuid  