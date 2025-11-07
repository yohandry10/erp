# 🇨🇴 Implementación Colombia - DIAN

## ✅ Paso 1: Integración con DIAN - COMPLETADO

### Archivos Creados

#### 1. Módulo Colombia (Servicios Especializados)
```
apps/erp-api/src/modules/fiscal/colombia/
├── dian-xml-builder.service.ts      # Generación de XML UBL 2.1 DIAN
├── dian-signer.service.ts           # Firma digital con certificados .p12
├── dian-api-client.service.ts       # Cliente HTTP para servicios DIAN
└── colombia-fiscal.module.ts        # Módulo que agrupa servicios Colombia
```

**Características:**
- ✅ Generación de XML para Factura, Nota Crédito y Nota Débito
- ✅ Firma digital XML-DSig según estándares DIAN
- ✅ Cliente API para envío y consulta de documentos
- ✅ Generación de CUFE (Código Único de Factura Electrónica)
- ✅ Validación de numeración autorizada
- ✅ Consulta de rangos autorizados
- ✅ Envío de eventos (acuse, aceptación, rechazo)

#### 2. Servicio DIAN Principal Actualizado
```
apps/erp-api/src/modules/fiscal/dian-fiscal.service.ts
```

**Mejoras:**
- ✅ Integra los 3 servicios especializados (XML Builder, Signer, API Client)
- ✅ Implementa todos los métodos abstractos de `FiscalServiceAbstract`
- ✅ Maneja tipos de documento: 01 (Factura), 91 (NC), 92 (ND)
- ✅ Genera ApplicationResponse requerido por DIAN
- ✅ Validaciones específicas de Colombia (NIT 9-10 dígitos, moneda COP/USD)

#### 3. Adaptador Multi-País para CPE
```
apps/erp-api/src/modules/cpe/fiscal-adapter.service.ts
```

**Funcionalidad:**
- ✅ Detecta automáticamente el país del tenant desde `empresa_config.pais_id`
- ✅ Delega al servicio fiscal correcto (SUNAT o DIAN)
- ✅ Cache de país por tenant para performance
- ✅ Métodos helper: `obtenerNombreServicioFiscal()`, `requiereGRE()`, etc.
- ✅ Interfaz unificada para envío y consulta de documentos

#### 4. Migración de Base de Datos
```
supabase/migrations/083__seed_colombia_catalogos.sql
```

**Contenido:**
- ✅ Tipos de documentos fiscales Colombia:
  - 01: Factura de Venta
  - 91: Nota Crédito
  - 92: Nota Débito
  - 02: Factura de Exportación
  - 05: Documento Soporte (DSA)

- ✅ Tipos de impuestos Colombia:
  - IVA 19% (tarifa general)
  - IVA 5% (tarifa reducida)
  - IVA 0% (exento)
  - INC 8% y 4% (Impuesto Nacional al Consumo)
  - Retención en la Fuente 2.5%
  - ReteIVA 15%

- ✅ Configuración fiscal Colombia:
  - Impuesto principal: IVA 19%
  - Documento identidad: NIT (9 dígitos)
  - Libros requeridos: Diario, Mayor, Inventarios, Compras, Ventas, Mayor y Balances, Societarios
  - URLs DIAN: Producción y Habilitación

---

## 📋 Próximos Pasos

### Paso 2: Adaptar Módulo CPE (EN PROGRESO)
- [ ] Modificar `cpe.service.ts` para usar `FiscalAdapterService`
- [ ] Reemplazar llamadas directas a `oseService` por `fiscalAdapter.enviarDocumento()`
- [ ] Actualizar método `sendToOse()` para ser agnóstico al país
- [ ] Agregar detección de país en validaciones

### Paso 3: Refactorizar Campos Específicos de Perú
- [ ] Renombrar campos en `empresa_config`:
  - `envio_automatico_sunat` → `envio_automatico_fiscal`
  - `validar_ruc_sunat` → `validar_documento_fiscal`
  - `habilitar_dashboards_sunat` → `habilitar_dashboards_fiscal`
- [ ] Crear vista `v_empresa_config_fiscal` para compatibilidad

### Paso 4: Adaptar Frontend
- [ ] Componente dinámico para mostrar "RUC" o "NIT"
- [ ] Componente dinámico para mostrar "IGV" o "IVA"
- [ ] Ocultar GRE si país != Perú
- [ ] Wizard de configuración multi-país
- [ ] Dashboards con nombre dinámico del servicio fiscal

### Paso 5: Módulo GRE Condicional
- [ ] Agregar validación: `if (paisId === 1) { mostrarGRE() }`
- [ ] Crear servicio `gre-adapter.service.ts` similar a fiscal-adapter
- [ ] Documentar que GRE es exclusivo de Perú

### Paso 6: Testing
- [ ] Tests unitarios para `DianXmlBuilderService`
- [ ] Tests unitarios para `DianSignerService`
- [ ] Tests unitarios para `DianApiClientService`
- [ ] Tests de integración para `FiscalAdapterService`
- [ ] Tests E2E: Crear tenant Colombia y emitir factura

---

## 🔧 Configuración Requerida

### Variables de Entorno (.env)

```bash
# ========== COLOMBIA (DIAN) ==========
DIAN_URL=https://vpfe-hab.dian.gov.co
DIAN_ENVIRONMENT=habilitacion  # o 'produccion'
DIAN_USUARIO=usuario_dian
DIAN_PASSWORD=password_dian
DIAN_CERTIFICATE_PATH=/certificates/dian.p12
DIAN_CERTIFICATE_PASSWORD=password_certificado
DIAN_SOFTWARE_ID=software_id_dian
DIAN_SOFTWARE_PIN=pin_software
DIAN_TEST_SET_ID=test_set_id  # Solo para habilitación

# ========== PERÚ (SUNAT) - Existentes ==========
OSE_URL=https://api-cpe.sunat.gob.pe
OSE_USUARIO=usuario_ose
OSE_PASSWORD=password_ose
CERTIFICATE_PATH=/certificates/sunat.pfx
CERTIFICATE_PASSWORD=password_certificado
SUNAT_ENVIRONMENT=homologacion  # o 'produccion'
```

### Certificados Digitales

**Perú (SUNAT):**
- Formato: `.pfx` (PKCS#12)
- Emisor: Entidades autorizadas por SUNAT
- Ubicación: `/certificates/sunat.pfx`

**Colombia (DIAN):**
- Formato: `.p12` (PKCS#12)
- Emisor: Entidades autorizadas por DIAN (Certicámara, GSE, etc.)
- Ubicación: `/certificates/dian.p12`

---

## 🎯 Cómo Funciona el Sistema Multi-País

### Flujo de Emisión de Factura

```typescript
// 1. Usuario crea factura en el frontend
POST /api/cpe/facturas
{
  "cliente_id": "...",
  "items": [...],
  "total": 1000
}

// 2. CPE Service recibe la solicitud
cpeService.create(dto, tenantId)

// 3. Fiscal Adapter detecta el país
const paisId = await fiscalAdapter.obtenerPaisTenant(tenantId)
// paisId = 1 (Perú) o 2 (Colombia)

// 4. Fiscal Service Factory selecciona el servicio
const fiscalService = fiscalServiceFactory.getServiceByPaisId(paisId)
// Retorna: SunatFiscalService o DianFiscalService

// 5. Servicio específico procesa el documento
if (paisId === 1) {
  // PERÚ: Genera XML UBL 2.1 SUNAT, firma, envía a OSE
  sunatService.enviarDocumento(documento)
} else if (paisId === 2) {
  // COLOMBIA: Genera XML UBL 2.1 DIAN, firma, envía a DIAN
  dianService.enviarDocumento(documento)
}

// 6. Respuesta unificada
{
  "success": true,
  "codigoRespuesta": "00",
  "descripcionRespuesta": "Aceptado por DIAN/SUNAT",
  "hash": "CUFE o hash CPE",
  "cdr": "CDR XML"
}
```

### Detección Automática de País

```typescript
// El país se obtiene de empresa_config
SELECT pais_id FROM empresa_config WHERE tenant_id = ?

// Mapeo de países:
1 = Perú (PE)    → SUNAT → SunatFiscalService
2 = Colombia (CO) → DIAN  → DianFiscalService
3 = Chile (CL)    → SII   → SiiFiscalService (futuro)
4 = México (MX)   → SAT   → SatFiscalService (futuro)
```

---

## 📊 Estado de Implementación

| Componente | Estado | Comentario |
|------------|--------|------------|
| **Backend - Integración DIAN** | ✅ 100% | Servicios completos |
| **Backend - Adaptador Multi-País** | ✅ 100% | FiscalAdapter listo |
| **Backend - CPE Refactor** | 🟡 30% | Falta usar FiscalAdapter |
| **Base de Datos - Catálogos CO** | ✅ 100% | Migración 083 lista |
| **Base de Datos - Refactor Campos** | ❌ 0% | Pendiente |
| **Frontend - UI Dinámica** | ❌ 0% | Pendiente |
| **Frontend - Wizard Multi-País** | ❌ 0% | Pendiente |
| **Testing** | ❌ 0% | Pendiente |
| **Documentación** | ✅ 80% | Este archivo |

---

## 🚀 Cómo Probar

### 1. Ejecutar Migración
```bash
# Aplicar migración de catálogos Colombia
psql -U postgres -d erp_db -f supabase/migrations/083__seed_colombia_catalogos.sql
```

### 2. Crear Tenant Colombia
```sql
-- Insertar empresa colombiana
INSERT INTO empresa_config (
  tenant_id,
  pais_id,
  ruc,
  razon_social,
  direccion_fiscal,
  email
) VALUES (
  'tenant-colombia-001',
  2, -- Colombia
  '900123456', -- NIT 9 dígitos
  'Empresa Demo Colombia SAS',
  'Calle 100 #10-20, Bogotá',
  'contacto@empresacolombia.co'
);
```

### 3. Emitir Factura (Cuando CPE esté adaptado)
```bash
curl -X POST http://localhost:3000/api/cpe/facturas \
  -H "Authorization: Bearer TOKEN" \
  -H "x-tenant-id: tenant-colombia-001" \
  -d '{
    "cliente_id": "cliente-001",
    "tipo_documento": "01",
    "moneda": "COP",
    "items": [
      {
        "descripcion": "Producto Test",
        "cantidad": 1,
        "precio_unitario": 100000
      }
    ]
  }'
```

### 4. Verificar Logs
```bash
# Buscar logs de DIAN
grep "🇨🇴" logs/app.log
grep "DIAN" logs/app.log

# Verificar que NO se envió a SUNAT
grep "SUNAT" logs/app.log | grep "tenant-colombia-001"
# No debería haber resultados
```

---

## 📚 Referencias

### DIAN Colombia
- [Portal DIAN](https://www.dian.gov.co/)
- [Facturación Electrónica](https://www.dian.gov.co/impuestos/factura-electronica)
- [Especificaciones Técnicas UBL 2.1](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Anexo_tecnico_factura_electronica_vr_1_8_2021.pdf)
- [Ambientes de Prueba](https://catalogo-vpfe-hab.dian.gov.co/)

### SUNAT Perú
- [Portal SUNAT](https://www.sunat.gob.pe/)
- [Facturación Electrónica](https://cpe.sunat.gob.pe/)
- [Especificaciones Técnicas](https://cpe.sunat.gob.pe/sites/default/files/inline-files/Anexos-GRE-V2.pdf)

---

## 🎉 Resumen

### Lo que ya funciona:
✅ Servicios DIAN completos (XML, Firma, API)  
✅ Adaptador multi-país con detección automática  
✅ Catálogos Colombia en base de datos  
✅ Factory pattern para seleccionar servicio fiscal  
✅ Módulos organizados y separados  

### Lo que falta:
❌ Integrar FiscalAdapter en CPE Service  
❌ Refactorizar campos hardcoded de Perú  
❌ Adaptar frontend para multi-país  
❌ Tests completos  

### Próximo comando:
```bash
# Continuar con Paso 2: Adaptar CPE Service
# Modificar apps/erp-api/src/modules/cpe/cpe.service.ts
```

---

**Autor:** ERP Suite Team  
**Fecha:** 2025-01-XX  
**Versión:** 1.0.0
