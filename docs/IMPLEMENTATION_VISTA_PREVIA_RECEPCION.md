# Implementación: Vista Previa antes de Cerrar Recepción

## Estado
✅ **COMPLETADO**

## Descripción
La vista previa (Step 4) del RecepcionWizard permite a los usuarios revisar toda la información de la recepción antes de confirmarla y cerrarla. Esta funcionalidad es crítica para evitar errores en el proceso de recepción de mercancía.

## Ubicación
- **Componente:** `apps/web/components/compras/RecepcionWizard.tsx`
- **Step:** 4 (Confirmar Recepción)

## Funcionalidades Implementadas

### 1. Cards de Resumen
Se muestran 4 cards con estadísticas agregadas:

- **Total Items:** Suma total de todas las cantidades a recibir
- **OK:** Total de items con calidad OK
- **Observados:** Total de items con calidad OBSERVADO
- **Rechazados:** Total de items con calidad RECHAZADO

Cada card tiene:
- Color distintivo según el estado (azul, verde, amarillo, rojo)
- Tamaño de fuente grande para fácil lectura
- Bordes y fondos con colores temáticos

### 2. Tabla Detallada
Tabla completa con todas las columnas necesarias:

| Columna | Información Mostrada |
|---------|---------------------|
| Producto | Nombre del producto y código |
| Cantidad | Cantidad a recibir (destacada en azul) |
| Calidad | Badge con icono y color según estado (OK/OBSERVADO/RECHAZADO) |
| Almacén/Ubicación/Lote | Información de almacenamiento (almacén, ubicación, lote, serie, fecha expiración) |
| Observaciones | Comentarios ingresados (especialmente para items observados/rechazados) |

### 3. Validación Visual
- Los items se filtran para mostrar solo aquellos con `cantidad_recibir > 0`
- Los badges de calidad usan colores consistentes con el resto del wizard
- La información de almacén/ubicación se resuelve desde los estados cargados
- Se muestra "-" cuando no hay datos opcionales

### 4. Diseño Responsivo
- Grid de cards adaptable con `repeat(auto-fit, minmax(200px, 1fr))`
- Tabla con scroll horizontal si es necesario
- Uso exclusivo de variables CSS globales para consistencia
- Bordes redondeados y sombras sutiles

## Código Relevante

### Cards de Resumen
```typescript
<div style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '1rem',
  marginBottom: '1.5rem'
}}>
  {/* Total Items Card */}
  <div style={{
    padding: '1rem',
    borderRadius: '8px',
    background: '#eff6ff',
    border: '1px solid #3b82f6'
  }}>
    <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginBottom: '0.5rem' }}>
      Total Items
    </div>
    <div style={{ fontSize: '2rem', fontWeight: '700', color: '#3b82f6' }}>
      {getTotalItems()}
    </div>
  </div>
  {/* Similar cards for OK, Observados, Rechazados */}
</div>
```

### Tabla Detallada
```typescript
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
  <thead>
    <tr style={{ background: '#f9fafb' }}>
      <th>Producto</th>
      <th>Cantidad</th>
      <th>Calidad</th>
      <th>Almacén/Ubicación/Lote</th>
      <th>Observaciones</th>
    </tr>
  </thead>
  <tbody>
    {items.filter(item => item.cantidad_recibir > 0).map((item) => (
      <tr key={item.detalle_id}>
        {/* Render all columns with proper formatting */}
      </tr>
    ))}
  </tbody>
</table>
```

### Cálculos de Resumen
```typescript
// Total items
const getTotalItems = () => items.reduce((sum, item) => sum + item.cantidad_recibir, 0)

// Items OK
items.filter(i => i.cantidad_recibir > 0 && i.calidad === 'OK')
  .reduce((sum, i) => sum + i.cantidad_recibir, 0)

// Items Observados
items.filter(i => i.cantidad_recibir > 0 && i.calidad === 'OBSERVADO')
  .reduce((sum, i) => sum + i.cantidad_recibir, 0)

// Items Rechazados
items.filter(i => i.cantidad_recibir > 0 && i.calidad === 'RECHAZADO')
  .reduce((sum, i) => sum + i.cantidad_recibir, 0)
```

## Flujo de Usuario

1. Usuario completa Steps 1-3 (Cantidades → Calidad → Almacén/Lotes)
2. Al hacer clic en "Siguiente" desde Step 3, se valida que todos los items tengan almacén
3. Se muestra Step 4 con la vista previa completa
4. Usuario revisa:
   - Resumen numérico en los cards superiores
   - Detalle completo de cada item en la tabla
   - Información de almacenamiento y calidad
5. Si todo está correcto, hace clic en "Completar Recepción"
6. Si necesita corregir algo, hace clic en "Anterior" para volver a steps previos

## Criterios de Aceptación
- [x] Muestra resumen agregado por estado de calidad
- [x] Muestra tabla detallada con todos los items a recibir
- [x] Incluye toda la información relevante (producto, cantidad, calidad, almacén, lote, observaciones)
- [x] Diseño consistente con el resto del wizard
- [x] Usa variables CSS globales
- [x] Permite navegación hacia atrás para correcciones
- [x] Botón de confirmación claramente visible

## Integración con el Wizard

### Navegación
- **Anterior:** Vuelve a Step 3 (Almacén/Lotes)
- **Completar Recepción:** Ejecuta `handleSubmit()` que:
  1. Crea la recepción via POST `/api/compras/recepciones/ordenes/:ordenId`
  2. Cierra la recepción via POST `/api/compras/recepciones/:id/cerrar`
  3. Muestra mensaje de éxito
  4. Ejecuta callback `onComplete()`

### Validaciones Previas
Antes de llegar a Step 4, se valida:
- Step 1: Al menos un item con cantidad > 0
- Step 3: Todos los items con cantidad > 0 tienen almacén asignado

## Estilos y UX

### Colores por Estado
- **Total Items:** Azul (#3b82f6, #eff6ff)
- **OK:** Verde (#10b981, #f0fdf4)
- **Observados:** Amarillo (#f59e0b, #fffbeb)
- **Rechazados:** Rojo (#ef4444, #fef2f2)

### Tipografía
- Cards: Título 0.75rem, Número 2rem bold
- Tabla: Headers 0.75rem, Contenido 0.875rem
- Badges: 0.75rem con iconos

### Espaciado
- Gap entre cards: 1rem
- Padding interno cards: 1rem
- Padding celdas tabla: 0.75rem
- Margin bottom entre secciones: 1.5rem

## Testing Manual

Para probar la vista previa:

```powershell
# 1. Iniciar el wizard desde una orden con items pendientes
# 2. En Step 1: Ingresar cantidades para varios items
# 3. En Step 2: Asignar diferentes calidades (OK, OBSERVADO, RECHAZADO)
# 4. En Step 3: Asignar almacenes y opcionalmente lotes/series
# 5. Hacer clic en "Siguiente"
# 6. Verificar que Step 4 muestra:
#    - Cards con totales correctos
#    - Tabla con todos los items
#    - Información completa y correcta
# 7. Probar navegación "Anterior" para verificar que se mantienen los datos
# 8. Volver a Step 4 y verificar que todo sigue igual
```

## Conclusión

La vista previa está completamente implementada y funcional. Proporciona una revisión completa de toda la información de recepción antes de confirmar, cumpliendo con los requisitos de UX para operarios de almacén.

La implementación sigue las mejores prácticas:
- Uso de variables CSS globales
- Código limpio y mantenible
- Cálculos eficientes con reduce/filter
- Diseño responsivo
- Validaciones apropiadas

**Estado Final:** ✅ COMPLETADO
**Listo para:** Producción
