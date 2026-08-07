# Test Manual: Importar Extracto y Conciliar

<!-- DOC-NAV:START -->
> Documentación canónica: `docs/README.md`. Estado vigente: `docs/CURRENT_STATE.md`.
<!-- DOC-NAV:END -->

## Objetivo
Verificar el flujo completo de conciliación bancaria: importar extracto CSV, realizar match automático/manual y cerrar la conciliación.

## Pre-requisitos
- Sistema corriendo (backend y frontend)
- Usuario autenticado
- Al menos una cuenta bancaria configurada
- Movimientos bancarios del sistema registrados

## Pasos del Test

### 1. Navegar a Conciliación
1. Ir a `/dashboard/finanzas/conciliacion`
2. **Verificar**: Se muestra la lista de conciliaciones
3. **Captura**: `conciliacion-list.png`

### 2. Crear o Seleccionar Conciliación
**Opción A - Crear Nueva:**
1. Click en "Nueva Conciliación"
2. Seleccionar cuenta bancaria
3. Establecer rango de fechas (mes actual)
4. Click en "Crear"
5. **Verificar**: Redirige a página de detalle

**Opción B - Usar Existente:**
1. Click en una conciliación con estado "ABIERTA"
2. **Verificar**: Redirige a página de detalle

### 3. Importar Extracto CSV
1. Click en botón "Importar Extracto CSV"
2. **Verificar**: Se abre modal de importación
3. **Captura**: `conciliacion-import-modal.png`
4. Seleccionar archivo CSV con formato:
   ```csv
   Fecha,Descripcion,Referencia,Abono,Cargo
   2024-01-15,TRANSFERENCIA RECIBIDA,REF001,1500.00,
   2024-01-16,PAGO PROVEEDOR,REF002,,800.00
   2024-01-17,DEPOSITO,REF003,2000.00,
   2024-01-18,COMISION BANCARIA,REF004,,25.00
   ```
5. **Verificar**: Se muestra preview de los datos
6. **Captura**: `conciliacion-csv-preview.png`
7. Click en "Importar"
8. **Verificar**: Modal se cierra y datos se cargan
9. **Captura**: `conciliacion-after-import.png`

### 4. Verificar Vista de Tablas Duales
1. **Verificar**: Se muestran dos tablas lado a lado:
   - Movimientos del Sistema (izquierda)
   - Movimientos del Extracto (derecha)
2. **Verificar**: Los movimientos conciliados están marcados
3. **Captura**: `conciliacion-dual-table.png`

### 5. Match Automático (Opcional)
1. Click en botón "Match Automático"
2. **Verificar**: Sistema busca coincidencias automáticas
3. **Verificar**: Movimientos coincidentes se marcan como conciliados
4. **Captura**: `conciliacion-after-auto-match.png`

### 6. Match Manual
1. Click en botón "Match Manual"
2. **Verificar**: Se abre modal con movimientos pendientes
3. **Captura**: `conciliacion-match-manual-modal.png`
4. Seleccionar un movimiento del sistema
5. Seleccionar un movimiento del extracto correspondiente
6. Click en "Confirmar Match"
7. **Verificar**: Los movimientos se marcan como conciliados
8. **Verificar**: Modal se actualiza
9. Cerrar modal
10. **Captura**: `conciliacion-after-manual-match.png`

### 7. Revisar Diferencias y Cerrar
1. Click en botón "Cerrar Conciliación"
2. **Verificar**: Se abre modal de confirmación
3. **Captura**: `conciliacion-close-confirmation.png`
4. **Verificar**: Se muestra resumen:
   - Período de conciliación
   - Cuenta bancaria
   - Saldo Libro
   - Saldo Banco
   - Diferencia
5. **Verificar**: Se muestran estadísticas:
   - Movimientos del Sistema (total, conciliados, pendientes)
   - Movimientos del Extracto (total, conciliados, pendientes)
   - Porcentajes de conciliación

**Caso A - Sin Movimientos Pendientes:**
1. **Verificar**: Mensaje "✓ Listo para Cerrar"
2. **Verificar**: Botón "Cerrar Conciliación" habilitado
3. Click en "Cerrar Conciliación"
4. **Verificar**: Alert de éxito
5. **Verificar**: Estado cambia a "CERRADA"
6. **Captura**: `conciliacion-closed.png`

**Caso B - Con Movimientos Pendientes:**
1. **Verificar**: Advertencia "⚠️ Movimientos Pendientes"
2. **Verificar**: Lista de movimientos pendientes
3. **Verificar**: Botón "Forzar Cierre" disponible
4. **Verificar**: Botón "Cerrar Conciliación" deshabilitado
5. **Captura**: `conciliacion-pending-warning.png`

## Resultados Esperados

### ✅ Éxito
- CSV importado correctamente
- Movimientos visibles en ambas tablas
- Match automático/manual funciona
- Resumen de diferencias correcto
- Conciliación se puede cerrar cuando todo está conciliado
- Estado cambia a CERRADA

### ❌ Fallos Comunes
- Error al importar CSV (formato incorrecto)
- No se muestran movimientos
- Match no funciona
- Diferencias incorrectas
- No se puede cerrar conciliación

## Datos de Prueba

### CSV de Ejemplo (extracto-test.csv)
```csv
Fecha,Descripcion,Referencia,Abono,Cargo
2024-01-15,TRANSFERENCIA RECIBIDA,REF001,1500.00,
2024-01-16,PAGO PROVEEDOR,REF002,,800.00
2024-01-17,DEPOSITO,REF003,2000.00,
2024-01-18,COMISION BANCARIA,REF004,,25.00
2024-01-19,TRANSFERENCIA ENVIADA,REF005,,1200.00
2024-01-20,INTERES GANADO,REF006,50.00,
```

## Notas
- Este test debe ejecutarse manualmente hasta que Playwright esté configurado correctamente
- Guardar todas las capturas de pantalla en `tests/screenshots/`
- Documentar cualquier error o comportamiento inesperado
- Verificar que los saldos calculados sean correctos
