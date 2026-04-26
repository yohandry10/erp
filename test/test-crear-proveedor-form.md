# Test Manual: Crear Proveedor con Validación

## Objetivo
Verificar que el formulario de creación de proveedor funciona correctamente con todas las validaciones implementadas.

## Archivos Implementados
- ✅ `apps/web/components/compras/ProveedorForm.tsx` - Componente de formulario con validaciones
- ✅ `apps/web/app/dashboard/compras/proveedores/nuevo/page.tsx` - Página de nuevo proveedor

## Validaciones Implementadas

### 1. RUC (Campo Requerido)
- ✅ Validación: Campo requerido
- ✅ Validación: Solo números
- ✅ Validación: 11 dígitos (Perú) o 9 dígitos (Colombia)
- ✅ Mensaje de error en tiempo real
- ✅ Estilo de campo con borde rojo en error

**Casos de prueba:**
- RUC vacío → "El RUC es requerido"
- RUC con letras "ABC123" → "El RUC debe contener solo números"
- RUC con 8 dígitos "12345678" → "El RUC debe tener 11 dígitos (Perú) o 9 dígitos (Colombia)"
- RUC válido Perú "20123456789" → ✅ Válido
- RUC válido Colombia "123456789" → ✅ Válido

### 2. Razón Social (Campo Requerido)
- ✅ Validación: Campo requerido
- ✅ Validación: Mínimo 3 caracteres
- ✅ Validación: Máximo 200 caracteres
- ✅ Mensaje de error en tiempo real

**Casos de prueba:**
- Razón social vacía → Error implícito
- Razón social "AB" → "La razón social debe tener al menos 3 caracteres"
- Razón social válida "DISTRIBUIDORA ABC S.A.C." → ✅ Válido

### 3. Email (Campo Requerido)
- ✅ Validación: Campo requerido
- ✅ Validación: Formato de email válido
- ✅ Icono de email en el campo
- ✅ Mensaje de error en tiempo real

**Casos de prueba:**
- Email vacío → "El email es requerido"
- Email inválido "contacto@" → "Debe proporcionar un email válido"
- Email válido "contacto@abc.com" → ✅ Válido

### 4. Nombre Comercial (Campo Opcional)
- ✅ Validación: Máximo 200 caracteres
- ✅ Campo opcional (no requerido)

### 5. Dirección (Campo Opcional)
- ✅ Validación: Máximo 500 caracteres
- ✅ Campo textarea con icono de ubicación
- ✅ Campo opcional (no requerido)

### 6. Teléfono (Campo Opcional)
- ✅ Validación: Máximo 20 caracteres
- ✅ Icono de teléfono en el campo
- ✅ Campo opcional (no requerido)

### 7. Contacto (Campo Opcional)
- ✅ Validación: Máximo 200 caracteres
- ✅ Campo opcional (no requerido)

### 8. Condiciones de Pago
- ✅ Select con opciones predefinidas:
  - CONTADO
  - CREDITO_15 (Crédito 15 días)
  - CREDITO_30 (Crédito 30 días)
  - CREDITO_45 (Crédito 45 días)
  - CREDITO_60 (Crédito 60 días)
  - CREDITO_90 (Crédito 90 días)
- ✅ Valor por defecto: CONTADO

### 9. Límite de Crédito
- ✅ Validación: No puede ser negativo
- ✅ Campo numérico con decimales
- ✅ Se deshabilita cuando condiciones_pago = CONTADO
- ✅ Mensaje informativo cuando está deshabilitado
- ✅ Valor por defecto: 0

## Características de UX Implementadas

### Organización del Formulario
- ✅ Dividido en 3 secciones con tarjetas:
  1. Información Básica (RUC, Razón Social, Nombre Comercial, Email)
  2. Información de Contacto (Contacto, Teléfono, Dirección)
  3. Condiciones Comerciales (Condiciones de Pago, Límite de Crédito)

### Iconos
- ✅ Building2 - Información Básica
- ✅ User - Información de Contacto
- ✅ CreditCard - Condiciones Comerciales
- ✅ Mail - Campo de email
- ✅ Phone - Campo de teléfono
- ✅ MapPin - Campo de dirección

### Validación en Tiempo Real
- ✅ Validación con react-hook-form + zod
- ✅ Mensajes de error debajo de cada campo
- ✅ Bordes rojos en campos con error
- ✅ Validación al enviar el formulario

### Estados del Formulario
- ✅ Estado de carga (isLoading)
- ✅ Botones deshabilitados durante carga
- ✅ Texto "Guardando..." en botón de submit
- ✅ Confirmación antes de cancelar

### Página de Nuevo Proveedor
- ✅ Header con título y breadcrumb
- ✅ Botón "Volver a Proveedores" con icono
- ✅ Banner informativo con instrucciones
- ✅ Integración con API usando useApi hook
- ✅ Manejo de errores con alertas
- ✅ Redirección a lista después de crear
- ✅ Confirmación antes de cancelar

## Integración con Backend

### Endpoint
- POST `/api/compras/proveedores`

### Datos Enviados
```typescript
{
  ruc: string
  razon_social: string
  nombre_comercial?: string
  direccion?: string
  telefono?: string
  email: string
  contacto?: string
  condiciones_pago?: 'CONTADO' | 'CREDITO_15' | 'CREDITO_30' | 'CREDITO_45' | 'CREDITO_60' | 'CREDITO_90'
  limite_credito?: number
  dias_credito?: number
}
```

### Respuestas Esperadas
- ✅ Éxito: `{ success: true, id: string }` o `{ success: true, data: {...} }`
- ✅ Error: Mensaje de error mostrado en alerta

## Pasos para Probar Manualmente

1. **Iniciar la aplicación web:**
   ```bash
   cd apps/web
   npm run dev
   ```

2. **Navegar a la página:**
   - Ir a: http://localhost:3001/dashboard/compras/proveedores
   - Click en "Nuevo Proveedor"

3. **Probar validaciones de campos requeridos:**
   - Intentar enviar formulario vacío
   - Verificar que aparecen mensajes de error en RUC, Razón Social y Email

4. **Probar validación de RUC:**
   - Ingresar "ABC123" → Ver error "debe contener solo números"
   - Ingresar "12345678" → Ver error "debe tener 11 dígitos..."
   - Ingresar "20123456789" → Error desaparece

5. **Probar validación de Email:**
   - Ingresar "contacto@" → Ver error "email válido"
   - Ingresar "contacto@abc.com" → Error desaparece

6. **Probar límite de crédito:**
   - Seleccionar "Contado" → Campo límite de crédito se deshabilita
   - Seleccionar "Crédito 30 días" → Campo se habilita

7. **Crear proveedor válido:**
   - RUC: 20123456789
   - Razón Social: DISTRIBUIDORA ABC S.A.C.
   - Email: contacto@abc.com
   - Click en "Crear Proveedor"
   - Verificar mensaje de éxito
   - Verificar redirección a lista de proveedores

8. **Probar cancelación:**
   - Llenar algunos campos
   - Click en "Cancelar"
   - Verificar confirmación
   - Verificar redirección a lista

## Resultado Esperado

✅ **TODAS LAS VALIDACIONES FUNCIONAN CORRECTAMENTE**
- Validaciones en tiempo real con react-hook-form + zod
- Mensajes de error claros y específicos
- UX intuitiva con iconos y secciones organizadas
- Integración correcta con el backend
- Manejo de estados de carga y errores

## Compatibilidad con Backend DTO

El esquema de validación del frontend coincide exactamente con el DTO del backend:
- ✅ RUC: Validación idéntica (11 o 9 dígitos, solo números)
- ✅ Razón Social: Min 3, Max 200 caracteres
- ✅ Email: Validación de formato
- ✅ Límite de Crédito: >= 0
- ✅ Condiciones de Pago: Enum idéntico
- ✅ Todos los campos opcionales coinciden

## Estado de la Tarea

✅ **TAREA COMPLETADA**

La tarea "Crear proveedor con validación" ha sido implementada completamente con:
1. Componente ProveedorForm reutilizable con validaciones completas
2. Página de nuevo proveedor con integración al backend
3. Validaciones en tiempo real usando react-hook-form + zod
4. UX consistente con el resto del sistema
5. Manejo de errores y estados de carga
6. Compatibilidad 100% con el backend DTO
