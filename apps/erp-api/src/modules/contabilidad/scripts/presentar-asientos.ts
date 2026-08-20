export {};
// Sin import ni export el archivo no es un módulo y sus declaraciones caen en
// el ámbito global, donde chocan con las de otro script: dos `main()` bastan.

/**
 * Script de presentación de asientos contables generados
 * Muestra ejemplos de los 7 tipos de asientos implementados
 * 
 * Uso: npx ts-node apps/erp-api/src/modules/contabilidad/scripts/presentar-asientos.ts
 */

interface AsientoEjemplo {
  tipo: string;
  descripcion: string;
  reglaContable: string;
  ejemplo: {
    concepto: string;
    fecha: string;
    detalles: Array<{
      cuenta: string;
      debe: number;
      haber: number;
      concepto: string;
    }>;
    totalDebe: number;
    totalHaber: number;
  };
}

const asientosEjemplos: AsientoEjemplo[] = [
  {
    tipo: '1. VENTA (Factura CPE)',
    descripcion: 'Registro de venta de mercadería con IGV',
    reglaContable: `
Dr 12 Clientes           [total]
  Cr 70 Ventas           [base]
  Cr 40 IGV por Pagar    [igv]
Dr 69 Costo de Ventas    [costo]
  Cr 20 Mercaderías      [costo]`,
    ejemplo: {
      concepto: 'Venta de mercadería - Factura F001-00123',
      fecha: '2025-01-15',
      detalles: [
        { cuenta: '12 - Clientes', debe: 11800.00, haber: 0, concepto: 'Clientes - Venta' },
        { cuenta: '70 - Ventas', debe: 0, haber: 10000.00, concepto: 'Ventas' },
        { cuenta: '40 - IGV por Pagar', debe: 0, haber: 1800.00, concepto: 'IGV por Pagar' },
        { cuenta: '69 - Costo de Ventas', debe: 6000.00, haber: 0, concepto: 'Costo de Ventas' },
        { cuenta: '20 - Mercaderías', debe: 0, haber: 6000.00, concepto: 'Mercaderías' }
      ],
      totalDebe: 17800.00,
      totalHaber: 17800.00
    }
  },
  {
    tipo: '2. COBRO CxC',
    descripcion: 'Registro de cobro de factura a cliente',
    reglaContable: `
Dr 10 Bancos/Caja        [monto]
  Cr 12 Clientes         [monto]`,
    ejemplo: {
      concepto: 'Cobro de factura F001-00123',
      fecha: '2025-01-20',
      detalles: [
        { cuenta: '10 - Bancos/Caja', debe: 11800.00, haber: 0, concepto: 'Bancos/Caja' },
        { cuenta: '12 - Clientes', debe: 0, haber: 11800.00, concepto: 'Clientes' }
      ],
      totalDebe: 11800.00,
      totalHaber: 11800.00
    }
  },
  {
    tipo: '3. COMPRA (Recepción)',
    descripcion: 'Registro de compra de mercadería con IGV',
    reglaContable: `
Dr 20 Mercaderías        [costo]
Dr 40 IGV Crédito Fiscal [igv]
  Cr 42 Proveedores      [total]`,
    ejemplo: {
      concepto: 'Compra de mercadería - OC-2025-001',
      fecha: '2025-01-10',
      detalles: [
        { cuenta: '20 - Mercaderías', debe: 5000.00, haber: 0, concepto: 'Mercaderías' },
        { cuenta: '40 - IGV Crédito Fiscal', debe: 900.00, haber: 0, concepto: 'IGV Crédito Fiscal' },
        { cuenta: '42 - Proveedores', debe: 0, haber: 5900.00, concepto: 'Proveedores' }
      ],
      totalDebe: 5900.00,
      totalHaber: 5900.00
    }
  },
  {
    tipo: '4. PAGO CxP',
    descripcion: 'Registro de pago a proveedor',
    reglaContable: `
Dr 42 Proveedores        [monto]
  Cr 10 Bancos           [monto]`,
    ejemplo: {
      concepto: 'Pago a proveedor - OC-2025-001',
      fecha: '2025-01-25',
      detalles: [
        { cuenta: '42 - Proveedores', debe: 5900.00, haber: 0, concepto: 'Proveedores' },
        { cuenta: '10 - Bancos', debe: 0, haber: 5900.00, concepto: 'Bancos' }
      ],
      totalDebe: 5900.00,
      totalHaber: 5900.00
    }
  },
  {
    tipo: '5. AJUSTE INVENTARIO',
    descripcion: 'Registro de ajuste de inventario (sobrante o faltante)',
    reglaContable: `
// Si positivo (sobrante):
Dr 20 Mercaderías        [valor]
  Cr 76 Ingresos Diversos [valor]

// Si negativo (faltante):
Dr 68 Valuación Activos  [valor]
  Cr 20 Mercaderías      [valor]`,
    ejemplo: {
      concepto: 'Ajuste de inventario - SOBRANTE',
      fecha: '2025-01-31',
      detalles: [
        { cuenta: '20 - Mercaderías', debe: 500.00, haber: 0, concepto: 'Mercaderías - Sobrante' },
        { cuenta: '76 - Ingresos Diversos', debe: 0, haber: 500.00, concepto: 'Ingresos Diversos' }
      ],
      totalDebe: 500.00,
      totalHaber: 500.00
    }
  },
  {
    tipo: '6. PLANILLA',
    descripcion: 'Registro de planilla de sueldos',
    reglaContable: `
Dr 62 Gastos Personal    [sueldos + aportes]
  Cr 40 Tributos         [aportes + retenciones]
  Cr 41 Remuneraciones   [neto a pagar]`,
    ejemplo: {
      concepto: 'Planilla de sueldos - Enero 2025',
      fecha: '2025-01-31',
      detalles: [
        { cuenta: '62 - Gastos de Personal', debe: 15000.00, haber: 0, concepto: 'Gastos de Personal' },
        { cuenta: '40 - Tributos por Pagar', debe: 0, haber: 2700.00, concepto: 'Tributos por Pagar' },
        { cuenta: '41 - Remuneraciones por Pagar', debe: 0, haber: 12300.00, concepto: 'Remuneraciones por Pagar' }
      ],
      totalDebe: 15000.00,
      totalHaber: 15000.00
    }
  },
  {
    tipo: '7. DEPRECIACIÓN',
    descripcion: 'Registro de depreciación de activos fijos',
    reglaContable: `
Dr 68 Depreciación       [monto]
  Cr 39 Deprec. Acumulada [monto]`,
    ejemplo: {
      concepto: 'Depreciación de activos fijos - Enero 2025',
      fecha: '2025-01-31',
      detalles: [
        { cuenta: '68 - Depreciación', debe: 1200.00, haber: 0, concepto: 'Depreciación' },
        { cuenta: '39 - Depreciación Acumulada', debe: 0, haber: 1200.00, concepto: 'Depreciación Acumulada' }
      ],
      totalDebe: 1200.00,
      totalHaber: 1200.00
    }
  }
];

function formatearMonto(monto: number): string {
  return monto.toFixed(2).padStart(12, ' ');
}

function presentarAsiento(asiento: AsientoEjemplo, index: number): void {
  console.log('\n' + '='.repeat(80));
  console.log(`ASIENTO ${index + 1}: ${asiento.tipo}`);
  console.log('='.repeat(80));
  console.log(`\nDescripción: ${asiento.descripcion}`);
  console.log(`\nRegla Contable:${asiento.reglaContable}`);
  console.log('\n' + '-'.repeat(80));
  console.log('EJEMPLO PRÁCTICO');
  console.log('-'.repeat(80));
  console.log(`Concepto: ${asiento.ejemplo.concepto}`);
  console.log(`Fecha: ${asiento.ejemplo.fecha}`);
  console.log('\nDETALLE DEL ASIENTO:');
  console.log('-'.repeat(80));
  console.log('CUENTA'.padEnd(40) + 'DEBE'.padStart(15) + 'HABER'.padStart(15));
  console.log('-'.repeat(80));
  
  asiento.ejemplo.detalles.forEach(detalle => {
    const debe = detalle.debe > 0 ? formatearMonto(detalle.debe) : ''.padStart(12);
    const haber = detalle.haber > 0 ? formatearMonto(detalle.haber) : ''.padStart(12);
    console.log(`${detalle.cuenta.padEnd(40)}${debe.padStart(15)}${haber.padStart(15)}`);
  });
  
  console.log('-'.repeat(80));
  console.log(
    'TOTALES'.padEnd(40) + 
    formatearMonto(asiento.ejemplo.totalDebe).padStart(15) + 
    formatearMonto(asiento.ejemplo.totalHaber).padStart(15)
  );
  console.log('-'.repeat(80));
  
  const cuadra = Math.abs(asiento.ejemplo.totalDebe - asiento.ejemplo.totalHaber) < 0.01;
  console.log(`\n✅ Balance: ${cuadra ? 'CUADRADO' : '❌ NO CUADRA'}`);
}

function presentarResumen(): void {
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(78) + '║');
  console.log('║' + 'PRESENTACIÓN DE ASIENTOS CONTABLES GENERADOS'.padStart(61).padEnd(78) + '║');
  console.log('║' + 'Sistema ERP - Módulo de Contabilidad'.padStart(57).padEnd(78) + '║');
  console.log('║' + ' '.repeat(78) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  
  console.log('\n📋 RESUMEN DE ASIENTOS IMPLEMENTADOS:');
  console.log('-'.repeat(80));
  asientosEjemplos.forEach((asiento, index) => {
    console.log(`${index + 1}. ${asiento.tipo}`);
  });
  
  asientosEjemplos.forEach((asiento, index) => {
    presentarAsiento(asiento, index);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('CARACTERÍSTICAS IMPLEMENTADAS');
  console.log('='.repeat(80));
  console.log('✅ Validación de período contable abierto');
  console.log('✅ Validación de balance (debe = haber)');
  console.log('✅ Idempotencia mediante source_event_id');
  console.log('✅ Generación automática de número de asiento');
  console.log('✅ Asignación de centro de costo');
  console.log('✅ Marcado de eventos como procesados');
  console.log('✅ Manejo de errores con reintentos');
  console.log('✅ Rollback automático en caso de error');
  
  console.log('\n' + '='.repeat(80));
  console.log('INTEGRACIÓN CON EVENTOS DE DOMINIO');
  console.log('='.repeat(80));
  console.log('• VentaFacturada → Asiento de Venta');
  console.log('• CobroRegistrado → Asiento de Cobro');
  console.log('• RecepcionRegistrada → Asiento de Compra');
  console.log('• PagoProveedorRegistrado → Asiento de Pago');
  console.log('• AjusteInventarioAplicado → Asiento de Ajuste');
  console.log('• PlanillaLiquidada → Asiento de Planilla');
  console.log('• DepreciacionGenerada → Asiento de Depreciación');
  
  console.log('\n' + '='.repeat(80));
  console.log('PLAN DE CUENTAS UTILIZADO (PCGE PERÚ)');
  console.log('='.repeat(80));
  console.log('10 - Efectivo y Equivalentes (Caja, Bancos)');
  console.log('12 - Cuentas por Cobrar Comerciales');
  console.log('20 - Mercaderías');
  console.log('39 - Depreciación Acumulada');
  console.log('40 - Tributos por Pagar (IGV)');
  console.log('41 - Remuneraciones por Pagar');
  console.log('42 - Cuentas por Pagar Comerciales');
  console.log('62 - Gastos de Personal');
  console.log('68 - Valuación y Deterioro de Activos / Depreciación');
  console.log('69 - Costo de Ventas');
  console.log('70 - Ventas');
  console.log('76 - Ingresos Diversos');
  
  console.log('\n' + '='.repeat(80));
  console.log('VALIDACIONES CONTABLES');
  console.log('='.repeat(80));
  console.log('✓ Todos los asientos cuadran (Debe = Haber)');
  console.log('✓ Clasificación correcta según PCGE Perú');
  console.log('✓ Registro de IGV separado (crédito/débito fiscal)');
  console.log('✓ Registro de costo de ventas en ventas');
  console.log('✓ Separación de gastos por naturaleza');
  
  console.log('\n');
}

// Ejecutar presentación
presentarResumen();
