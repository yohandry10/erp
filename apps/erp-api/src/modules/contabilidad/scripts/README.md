# Scripts de Presentación de Asientos Contables

Este directorio contiene herramientas para presentar y validar los asientos contables generados por el sistema.

## 📋 Archivos Disponibles

### 1. `presentar-asientos.ts`
Script de consola que muestra todos los tipos de asientos contables implementados con ejemplos detallados.

**Uso:**
```bash
# Desde la raíz del proyecto
npm run presentar:asientos

# O directamente con ts-node
cd apps/erp-api
npx ts-node src/modules/contabilidad/scripts/presentar-asientos.ts
```

**Salida:**
- Resumen de los 7 tipos de asientos implementados
- Reglas contables para cada tipo
- Ejemplos prácticos con montos
- Validación de balance (debe = haber)
- Características implementadas
- Integración con eventos de dominio
- Plan de cuentas utilizado (PCGE Perú)

### 2. `presentar-asientos.html`
Versión HTML interactiva de la presentación, ideal para compartir con contadores o stakeholders.

**Uso:**
```bash
# Abrir directamente en el navegador
start apps/erp-api/src/modules/contabilidad/scripts/presentar-asientos.html

# O con un servidor local
npx http-server apps/erp-api/src/modules/contabilidad/scripts -p 8080
```

**Características:**
- Diseño profesional y responsive
- Tarjetas interactivas para cada tipo de asiento
- Tablas formateadas con debe/haber
- Código de colores para mejor visualización
- Listo para imprimir o exportar a PDF

## 🎯 Propósito

Estos scripts fueron creados para la **TASK 4.14: Validación con Contador**, específicamente para la actividad "Presentar asientos generados".

Permiten:
1. ✅ Mostrar de forma clara los 7 tipos de asientos implementados
2. ✅ Validar que las reglas contables son correctas según PCGE Perú
3. ✅ Facilitar la revisión por parte de un contador profesional
4. ✅ Documentar los ejemplos de uso para el equipo

## 📊 Tipos de Asientos Incluidos

1. **Venta (Factura CPE)** - Registro de ventas con IGV y costo de ventas
2. **Cobro CxC** - Registro de cobros a clientes
3. **Compra (Recepción)** - Registro de compras con IGV crédito fiscal
4. **Pago CxP** - Registro de pagos a proveedores
5. **Ajuste Inventario** - Registro de sobrantes y faltantes
6. **Planilla** - Registro de sueldos y aportes
7. **Depreciación** - Registro de depreciación de activos fijos

## ✅ Validaciones Incluidas

- ✓ Todos los asientos cuadran (Debe = Haber)
- ✓ Clasificación correcta según PCGE Perú
- ✓ Registro de IGV separado (crédito/débito fiscal)
- ✓ Registro de costo de ventas en ventas
- ✓ Separación de gastos por naturaleza

## 🔗 Integración

Los asientos se generan automáticamente a partir de eventos de dominio:
- `VentaFacturada` → Asiento de Venta
- `CobroRegistrado` → Asiento de Cobro
- `RecepcionRegistrada` → Asiento de Compra
- `PagoProveedorRegistrado` → Asiento de Pago
- `AjusteInventarioAplicado` → Asiento de Ajuste
- `PlanillaLiquidada` → Asiento de Planilla
- `DepreciacionGenerada` → Asiento de Depreciación
