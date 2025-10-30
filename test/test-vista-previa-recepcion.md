# Test: Vista Previa antes de Cerrar Recepción

## Objetivo
Verificar que la vista previa (Step 4) del RecepcionWizard muestra correctamente toda la información antes de confirmar la recepción.

## Precondiciones
1. Tener una orden de compra en estado APROBADA con items pendientes de recibir
2. Acceder al wizard de recepción desde la página de órdenes
3. Sistema debe tener almacenes configurados

## Pasos de Prueba

### Test 1: Vista Previa con Items OK
**Pasos:**
1. Iniciar wizard desde una orden con 3+ items
2. Step 1: Ingresar cantidades para todos los items
3. Step 2: Dejar todos los items en calidad "OK"
4. Step 3: Asignar almacén a todos los items
5. Hacer clic en "Siguiente"

**Resultado Esperado:**
- Se muestra Step 4 "Confirmar Recepción"
- Card "Total Items" muestra la suma correcta
- Card "OK" muestra la suma de todos los items
- Cards "Observados" y "Rechazados" muestran 0
- Tabla muestra todos los items con:
  - Nombre y código de producto
  - Cantidad en azul
  - Badge verde "OK"
  - Almacén asignado
  - "-" en observaciones

### Test 2: Vista Previa con Calidades Mixtas
**Pasos:**
1. Iniciar wizard desde una orden con 5+ items
2. Step 1: Ingresar cantidades para todos los items
3. Step 2: 
   - 2 items en "OK"
   - 2 items en "OBSERVADO" con observaciones
   - 1 item en "RECHAZADO" con observaciones
4. Step 3: Asignar almacén a todos los items
5. Hacer clic en "Siguiente"

**Resultado Esperado:**
- Card "Total Items" muestra suma total
- Card "OK" muestra 2 items
- Card "Observados" muestra 2 items
- Card "Rechazados" muestra 1 item
- Tabla muestra:
  - Items OK con badge verde
  - Items OBSERVADO con badge amarillo y observaciones
  - Items RECHAZADO con badge rojo y observaciones
- Colores consistentes entre cards y badges

### Test 3: Vista Previa con Lotes y Series
**Pasos:**
1. Iniciar wizard desde una orden con 3 items
2. Step 1: Ingresar cantidades
3. Step 2: Todos en "OK"
4. Step 3: 
   - Item 1: Almacén + Ubicación + Lote
   - Item 2: Almacén + Serie
   - Item 3: Almacén + Lote + Fecha Expiración
5. Hacer clic en "Siguiente"

**Resultado Esperado:**
- Tabla muestra en columna "Almacén/Ubicación/Lote":
  - Item 1: Almacén, Ubicación, Lote
  - Item 2: Almacén, Serie
  - Item 3: Almacén, Lote, Exp: [fecha]
- Formato legible con labels (Almacén:, Ubicación:, Lote:, Serie:, Exp:)

### Test 4: Navegación desde Vista Previa
**Pasos:**
1. Llegar a Step 4 (vista previa)
2. Hacer clic en "Anterior"
3. Verificar que vuelve a Step 3
4. Modificar un lote
5. Hacer clic en "Siguiente"
6. Verificar Step 4 nuevamente

**Resultado Esperado:**
- Navegación funciona correctamente
- Los datos se mantienen al navegar
- Los cambios en Step 3 se reflejan en Step 4
- No se pierden datos al navegar

### Test 5: Recepción Parcial
**Pasos:**
1. Iniciar wizard desde orden con 5 items
2. Step 1: Ingresar cantidades solo para 3 items (dejar 2 en 0)
3. Step 2: Asignar calidades a los 3 items con cantidad
4. Step 3: Asignar almacenes a los 3 items
5. Hacer clic en "Siguiente"

**Resultado Esperado:**
- Vista previa muestra SOLO los 3 items con cantidad > 0
- Los 2 items con cantidad 0 NO aparecen en la tabla
- Cards muestran totales correctos solo de los 3 items
- Tabla no tiene filas vacías

### Test 6: Validación Visual de Colores
**Pasos:**
1. Llegar a Step 4 con items de diferentes calidades
2. Verificar colores de cards
3. Verificar colores de badges en tabla

**Resultado Esperado:**
- Card "Total Items": Fondo azul claro (#eff6ff), texto azul (#3b82f6)
- Card "OK": Fondo verde claro (#f0fdf4), texto verde (#10b981)
- Card "Observados": Fondo amarillo claro (#fffbeb), texto amarillo (#f59e0b)
- Card "Rechazados": Fondo rojo claro (#fef2f2), texto rojo (#ef4444)
- Badges en tabla usan los mismos colores
- Iconos apropiados: CheckCircle (OK), AlertCircle (OBSERVADO), XCircle (RECHAZADO)

### Test 7: Responsividad
**Pasos:**
1. Llegar a Step 4
2. Reducir ancho de ventana
3. Verificar adaptación de layout

**Resultado Esperado:**
- Cards se reorganizan en columnas según espacio disponible
- Tabla mantiene scroll horizontal si es necesario
- Texto no se corta ni se superpone
- Todo sigue siendo legible

### Test 8: Confirmación de Recepción
**Pasos:**
1. Llegar a Step 4
2. Revisar toda la información
3. Hacer clic en "Completar Recepción"
4. Esperar respuesta del servidor

**Resultado Esperado:**
- Botón muestra "Procesando..." con spinner
- Botón se deshabilita durante el proceso
- Al completar, muestra mensaje de éxito
- Ejecuta callback onComplete()
- Cierra el wizard o redirige según configuración

## Casos Edge

### Edge 1: Un Solo Item
- Vista previa debe funcionar correctamente con 1 solo item
- Cards muestran valores correctos
- Tabla tiene 1 sola fila

### Edge 2: Muchos Items (20+)
- Tabla debe tener scroll vertical
- Performance debe ser aceptable
- Cards calculan totales correctamente

### Edge 3: Items sin Datos Opcionales
- Items sin ubicación, lote, serie, fecha: mostrar "-"
- No dejar espacios vacíos confusos
- Mantener alineación de tabla

### Edge 4: Observaciones Largas
- Texto largo en observaciones debe ser visible
- Considerar truncado o wrap según diseño
- No romper layout de tabla

## Criterios de Éxito
- ✅ Todos los tests pasan sin errores
- ✅ Información mostrada es precisa y completa
- ✅ Colores y estilos son consistentes
- ✅ Navegación funciona correctamente
- ✅ No hay errores en consola
- ✅ UX es intuitiva para operarios

## Notas de Implementación
- Componente: `apps/web/components/compras/RecepcionWizard.tsx`
- Step: 4 (currentStep === 4)
- Funciones clave:
  - `getTotalItems()`: Calcula total de items
  - `getCalidadColor()`: Retorna color según calidad
  - `getCalidadIcon()`: Retorna icono según calidad
- Filtrado: `items.filter(item => item.cantidad_recibir > 0)`

## Estado
✅ **IMPLEMENTACIÓN COMPLETA**

La vista previa está completamente funcional y cumple con todos los requisitos de UX para el proceso de recepción de mercancía.
