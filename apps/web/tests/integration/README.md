# Tests de Integración - Finanzas

Este directorio contiene tests de integración que prueban el flujo completo de las funcionalidades de finanzas haciendo llamadas directas a la API.

## Tests Disponibles

### 1. Conciliación Bancaria (`conciliacion.test.js`)

Prueba el flujo completo de conciliación bancaria:
- Crear conciliación
- Importar extracto CSV
- Realizar match manual
- Obtener reporte de diferencias
- Cerrar conciliación

## Requisitos

- Node.js 18+
- Backend corriendo en `http://localhost:3002` (o configurar `API_URL`)
- Usuario autenticado (cookies de sesión)
- Base de datos con datos de prueba

## Ejecución

### Opción 1: Ejecutar directamente con Node

```bash
# Desde la raíz del proyecto
node apps/web/tests/integration/conciliacion.test.js
```

### Opción 2: Con variable de entorno

```bash
# Usar una URL diferente
API_URL=http://localhost:3000 node apps/web/tests/integration/conciliacion.test.js
```

### Opción 3: Agregar script en package.json

Agregar en `apps/web/package.json`:

```json
{
  "scripts": {
    "test:integration": "node tests/integration/conciliacion.test.js",
    "test:integration:conciliacion": "node tests/integration/conciliacion.test.js"
  }
}
```

Luego ejecutar:

```bash
cd apps/web
npm run test:integration:conciliacion
```

## Salida Esperada

```
🧪 Iniciando test de conciliación bancaria...

📋 Paso 1: Obteniendo cuentas bancarias...
✅ Cuenta bancaria encontrada: BCP - 1234567890

📋 Paso 2: Creando nueva conciliación...
✅ Conciliación creada: ID abc-123, Estado: ABIERTA

📋 Paso 3: Importando extracto CSV...
✅ Extracto importado: 4 movimientos

📋 Paso 4: Obteniendo movimientos...
✅ Movimientos del Sistema: 5
✅ Movimientos del Extracto: 4

📋 Paso 5: Realizando match manual...
✅ Match realizado exitosamente

📋 Paso 6: Obteniendo reporte de diferencias...
✅ Reporte de diferencias:
   - Saldo Libro: 5000.00
   - Saldo Banco: 4975.00
   - Diferencia: 25.00
   - Sistema: 1/5 conciliados
   - Extracto: 1/4 conciliados
   - Porcentaje General: 25.0%

📋 Paso 7: Cerrando conciliación...
⚠️  Hay movimientos pendientes. Se requiere forzar cierre.
✅ Conciliación cerrada (forzada): CERRADA

📋 Paso 8: Verificando estado final...
✅ Estado final: CERRADA
✅ Diferencia final: 25.00

🎉 ¡Test completado exitosamente!

Resumen:
- Conciliación ID: abc-123
- Movimientos importados: 4
- Estado final: CERRADA
- Diferencia: 25.00
```

## Notas

- Este test requiere que el backend esté corriendo
- El test crea datos reales en la base de datos
- Se recomienda ejecutar en un ambiente de desarrollo/testing
- El test NO limpia los datos después de ejecutarse (útil para inspección manual)

## Troubleshooting

### Error: "Cannot read properties of undefined (reading 'stdin')"

Este error ocurre con Playwright. Este test NO usa Playwright, usa fetch directo.

### Error: "API Error: Unauthorized"

Necesitas estar autenticado. Opciones:
1. Agregar token de autenticación en los headers
2. Usar cookies de sesión válidas
3. Modificar el test para hacer login primero

### Error: "No hay cuentas bancarias disponibles"

Necesitas crear al menos una cuenta bancaria en el sistema antes de ejecutar el test.

## Alternativa: Test Manual

Si prefieres probar manualmente, consulta:
`apps/web/tests/manual/conciliacion-flow.md`
