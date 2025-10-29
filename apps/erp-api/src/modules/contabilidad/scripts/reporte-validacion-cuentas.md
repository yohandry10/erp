# Reporte de Validación de Clasificación de Cuentas

**Fecha:** 2025-01-28  
**Módulo:** Contabilidad  
**Validador:** Sistema Automático de Validación PCGE

---

## Resumen Ejecutivo

✅ **TODAS LAS CUENTAS Y ASIENTOS ESTÁN CORRECTAMENTE CLASIFICADOS**

- **Cuentas validadas:** 12
- **Cuentas válidas:** 12 (100%)
- **Cuentas inválidas:** 0
- **Asientos validados:** 8
- **Asientos válidos:** 8 (100%)

---

## Cuentas Validadas

### Activos (Cuentas 10-39)

| Código | Nombre | Tipo | Naturaleza | Estado |
|--------|--------|------|------------|--------|
| 10 | Efectivo y Equivalentes de Efectivo | ACTIVO | DEUDORA | ✅ VÁLIDO |
| 12 | Cuentas por Cobrar Comerciales - Terceros | ACTIVO | DEUDORA | ✅ VÁLIDO |
| 20 | Mercaderías | ACTIVO | DEUDORA | ✅ VÁLIDO |
| 39 | Depreciación, Amortización y Agotamiento Acumulados | ACTIVO | ACREEDORA | ✅ VÁLIDO |

### Pasivos (Cuentas 40-49)

| Código | Nombre | Tipo | Naturaleza | Estado |
|--------|--------|------|------------|--------|
| 40 | Tributos, Contraprestaciones y Aportes | PASIVO | ACREEDORA | ✅ VÁLIDO |
| 41 | Remuneraciones y Participaciones por Pagar | PASIVO | ACREEDORA | ✅ VÁLIDO |
| 42 | Cuentas por Pagar Comerciales - Terceros | PASIVO | ACREEDORA | ✅ VÁLIDO |

### Gastos (Cuentas 60-69)

| Código | Nombre | Tipo | Naturaleza | Estado |
|--------|--------|------|------------|--------|
| 62 | Gastos de Personal, Directores y Gerentes | GASTO | DEUDORA | ✅ VÁLIDO |
| 68 | Valuación y Deterioro de Activos y Provisiones | GASTO | DEUDORA | ✅ VÁLIDO |
| 69 | Costo de Ventas | GASTO | DEUDORA | ✅ VÁLIDO |

### Ingresos (Cuentas 70-79)

| Código | Nombre | Tipo | Naturaleza | Estado |
|--------|--------|------|------------|--------|
| 70 | Ventas | INGRESO | ACREEDORA | ✅ VÁLIDO |
| 76 | Ganancia por Medición de Activos no Financieros | INGRESO | ACREEDORA | ✅ VÁLIDO |

---

## Asientos Contables Validados

### 1. Venta (Factura CPE) ✅

**Regla Contable:**
```
Dr 12 Clientes           [total]
  Cr 70 Ventas           [base]
  Cr 40 IGV por Pagar    [igv]
Dr 69 Costo de Ventas    [costo]
  Cr 20 Mercaderías      [costo]
```

**Cuentas utilizadas:**
- 12 - Cuentas por Cobrar (DEBE): Clientes - Venta
- 70 - Ventas (HABER): Ventas
- 40 - Tributos (HABER): IGV por Pagar
- 69 - Costo de Ventas (DEBE): Costo de Ventas
- 20 - Mercaderías (HABER): Mercaderías

### 2. Cobro CxC ✅

**Regla Contable:**
```
Dr 10 Bancos/Caja        [monto]
  Cr 12 Clientes         [monto]
```

**Cuentas utilizadas:**
- 10 - Efectivo (DEBE): Bancos/Caja
- 12 - Cuentas por Cobrar (HABER): Clientes

### 3. Compra (Recepción) ✅

**Regla Contable:**
```
Dr 20 Mercaderías        [costo]
Dr 40 IGV Crédito Fiscal [igv]
  Cr 42 Proveedores      [total]
```

**Cuentas utilizadas:**
- 20 - Mercaderías (DEBE): Mercaderías
- 40 - Tributos (DEBE): IGV Crédito Fiscal
- 42 - Cuentas por Pagar (HABER): Proveedores

### 4. Pago CxP ✅

**Regla Contable:**
```
Dr 42 Proveedores        [monto]
  Cr 10 Bancos           [monto]
```

**Cuentas utilizadas:**
- 42 - Cuentas por Pagar (DEBE): Proveedores
- 10 - Efectivo (HABER): Bancos

### 5. Ajuste Inventario (Sobrante) ✅

**Regla Contable:**
```
Dr 20 Mercaderías        [valor]
  Cr 76 Ingresos Diversos [valor]
```

**Cuentas utilizadas:**
- 20 - Mercaderías (DEBE): Mercaderías - Sobrante
- 76 - Ganancia por Medición (HABER): Ingresos Diversos

### 6. Ajuste Inventario (Faltante) ✅

**Regla Contable:**
```
Dr 68 Valuación Activos  [valor]
  Cr 20 Mercaderías      [valor]
```

**Cuentas utilizadas:**
- 68 - Valuación y Deterioro (DEBE): Valuación de Activos
- 20 - Mercaderías (HABER): Mercaderías - Faltante

### 7. Planilla ✅

**Regla Contable:**
```
Dr 62 Gastos Personal    [sueldos + aportes]
  Cr 40 Tributos         [aportes + retenciones]
  Cr 41 Remuneraciones   [neto a pagar]
```

**Cuentas utilizadas:**
- 62 - Gastos de Personal (DEBE): Gastos de Personal
- 40 - Tributos (HABER): Tributos por Pagar
- 41 - Remuneraciones (HABER): Remuneraciones por Pagar

### 8. Depreciación ✅

**Regla Contable:**
```
Dr 68 Depreciación       [monto]
  Cr 39 Deprec. Acumulada [monto]
```

**Cuentas utilizadas:**
- 68 - Valuación y Deterioro (DEBE): Depreciación
- 39 - Depreciación Acumulada (HABER): Depreciación Acumulada

---

## Conclusiones

### ✅ Validaciones Exitosas

1. **Clasificación según PCGE Perú:** Todas las cuentas están correctamente clasificadas según el Plan Contable General Empresarial.

2. **Naturaleza de las cuentas:** Los movimientos (debe/haber) son coherentes con la naturaleza de cada cuenta (deudora/acreedora).

3. **Asientos balanceados:** Todos los asientos cumplen con el principio de partida doble (Debe = Haber).

4. **Cumplimiento normativo:** La implementación cumple con:
   - Resolución CNC N° 043-2010-EF/94
   - Resolución CNC N° 045-2011-EF/94
   - Normas Internacionales de Información Financiera (NIIF)

### 📋 Recomendaciones

1. **Mantener actualizado:** Revisar periódicamente las actualizaciones del PCGE.

2. **Documentación:** Mantener esta validación como parte de la documentación del sistema.

3. **Auditoría:** Realizar validaciones periódicas con contador profesional.

4. **Capacitación:** Asegurar que el equipo conozca las reglas contables implementadas.

---

## Referencias Normativas

- **Plan Contable General Empresarial (PCGE)**
  - Resolución CNC N° 043-2010-EF/94
  - Modificado por Resolución CNC N° 045-2011-EF/94
  - Aplicable desde: 01 de enero de 2011
  - Base: Normas Internacionales de Información Financiera (NIIF)

---

**Validado por:** Sistema Automático de Validación PCGE  
**Fecha de validación:** 2025-01-28  
**Estado:** ✅ APROBADO
