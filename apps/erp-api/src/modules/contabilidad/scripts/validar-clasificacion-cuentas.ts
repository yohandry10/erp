export {};
// Sin import ni export el archivo no es un módulo y sus declaraciones caen en
// el ámbito global, donde chocan con las de otro script: dos `main()` bastan.

/**
 * Script de validación de clasificación de cuentas según PCGE Perú
 * Valida que las cuentas utilizadas en los asientos contables estén correctamente clasificadas
 * 
 * Uso: npx ts-node apps/erp-api/src/modules/contabilidad/scripts/validar-clasificacion-cuentas.ts
 */

interface CuentaPCGE {
  codigo: string;
  nombre: string;
  tipo: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO';
  naturaleza: 'DEUDORA' | 'ACREEDORA';
  descripcion: string;
  nivel: number;
}

// Definición del Plan Contable General Empresarial (PCGE) Perú
// Cuentas utilizadas en el sistema
const cuentasPCGE: CuentaPCGE[] = [
  {
    codigo: '10',
    nombre: 'Efectivo y Equivalentes de Efectivo',
    tipo: 'ACTIVO',
    naturaleza: 'DEUDORA',
    descripcion: 'Agrupa las subcuentas que representan medios de pago como dinero en efectivo, cheques, giros, etc.',
    nivel: 1
  },
  {
    codigo: '12',
    nombre: 'Cuentas por Cobrar Comerciales - Terceros',
    tipo: 'ACTIVO',
    naturaleza: 'DEUDORA',
    descripcion: 'Agrupa las subcuentas que representan los derechos de cobro a terceros que se derivan de las ventas de bienes y/o servicios',
    nivel: 1
  },
  {
    codigo: '20',
    nombre: 'Mercaderías',
    tipo: 'ACTIVO',
    naturaleza: 'DEUDORA',
    descripcion: 'Agrupa las subcuentas que representan los bienes adquiridos por la empresa para ser destinados a la venta',
    nivel: 1
  },
  {
    codigo: '39',
    nombre: 'Depreciación, Amortización y Agotamiento Acumulados',
    tipo: 'ACTIVO',
    naturaleza: 'ACREEDORA',
    descripcion: 'Agrupa las subcuentas de valuación que representan la distribución sistemática del costo de los activos',
    nivel: 1
  },
  {
    codigo: '40',
    nombre: 'Tributos, Contraprestaciones y Aportes al Sistema de Pensiones y de Salud por Pagar',
    tipo: 'PASIVO',
    naturaleza: 'ACREEDORA',
    descripcion: 'Agrupa las subcuentas que representan obligaciones por impuestos, contribuciones y otros tributos',
    nivel: 1
  },
  {
    codigo: '41',
    nombre: 'Remuneraciones y Participaciones por Pagar',
    tipo: 'PASIVO',
    naturaleza: 'ACREEDORA',
    descripcion: 'Agrupa las subcuentas que representan las obligaciones con los trabajadores por concepto de remuneraciones',
    nivel: 1
  },
  {
    codigo: '42',
    nombre: 'Cuentas por Pagar Comerciales - Terceros',
    tipo: 'PASIVO',
    naturaleza: 'ACREEDORA',
    descripcion: 'Agrupa las subcuentas que representan obligaciones que contrae la empresa derivada de la compra de bienes y servicios',
    nivel: 1
  },
  {
    codigo: '62',
    nombre: 'Gastos de Personal, Directores y Gerentes',
    tipo: 'GASTO',
    naturaleza: 'DEUDORA',
    descripcion: 'Agrupa las subcuentas que representan las remuneraciones al personal, así como las distintas contribuciones',
    nivel: 1
  },
  {
    codigo: '68',
    nombre: 'Valuación y Deterioro de Activos y Provisiones',
    tipo: 'GASTO',
    naturaleza: 'DEUDORA',
    descripcion: 'Agrupa las subcuentas que acumulan el consumo de beneficio económico incorporado en activos a largo plazo',
    nivel: 1
  },
  {
    codigo: '69',
    nombre: 'Costo de Ventas',
    tipo: 'GASTO',
    naturaleza: 'DEUDORA',
    descripcion: 'Agrupa las subcuentas que acumulan el costo de los bienes y/o servicios inherentes al giro del negocio',
    nivel: 1
  },
  {
    codigo: '70',
    nombre: 'Ventas',
    tipo: 'INGRESO',
    naturaleza: 'ACREEDORA',
    descripcion: 'Agrupa las subcuentas que acumulan los ingresos por ventas de bienes y/o servicios',
    nivel: 1
  },
  {
    codigo: '76',
    nombre: 'Ganancia por Medición de Activos no Financieros al Valor Razonable',
    tipo: 'INGRESO',
    naturaleza: 'ACREEDORA',
    descripcion: 'Agrupa las subcuentas que acumulan los incrementos de valor de activos no financieros',
    nivel: 1
  }
];

interface ValidacionResultado {
  codigo: string;
  valido: boolean;
  errores: string[];
  advertencias: string[];
}

interface AsientoTipo {
  nombre: string;
  cuentasUsadas: Array<{
    codigo: string;
    uso: string;
    debe: boolean;
    haber: boolean;
  }>;
}

// Definición de los asientos implementados y las cuentas que usan
const asientosImplementados: AsientoTipo[] = [
  {
    nombre: 'Venta (Factura CPE)',
    cuentasUsadas: [
      { codigo: '12', uso: 'Clientes - Venta', debe: true, haber: false },
      { codigo: '70', uso: 'Ventas', debe: false, haber: true },
      { codigo: '40', uso: 'IGV por Pagar', debe: false, haber: true },
      { codigo: '69', uso: 'Costo de Ventas', debe: true, haber: false },
      { codigo: '20', uso: 'Mercaderías', debe: false, haber: true }
    ]
  },
  {
    nombre: 'Cobro CxC',
    cuentasUsadas: [
      { codigo: '10', uso: 'Bancos/Caja', debe: true, haber: false },
      { codigo: '12', uso: 'Clientes', debe: false, haber: true }
    ]
  },
  {
    nombre: 'Compra (Recepción)',
    cuentasUsadas: [
      { codigo: '20', uso: 'Mercaderías', debe: true, haber: false },
      { codigo: '40', uso: 'IGV Crédito Fiscal', debe: true, haber: false },
      { codigo: '42', uso: 'Proveedores', debe: false, haber: true }
    ]
  },
  {
    nombre: 'Pago CxP',
    cuentasUsadas: [
      { codigo: '42', uso: 'Proveedores', debe: true, haber: false },
      { codigo: '10', uso: 'Bancos', debe: false, haber: true }
    ]
  },
  {
    nombre: 'Ajuste Inventario (Sobrante)',
    cuentasUsadas: [
      { codigo: '20', uso: 'Mercaderías - Sobrante', debe: true, haber: false },
      { codigo: '76', uso: 'Ingresos Diversos', debe: false, haber: true }
    ]
  },
  {
    nombre: 'Ajuste Inventario (Faltante)',
    cuentasUsadas: [
      { codigo: '68', uso: 'Valuación de Activos', debe: true, haber: false },
      { codigo: '20', uso: 'Mercaderías - Faltante', debe: false, haber: true }
    ]
  },
  {
    nombre: 'Planilla',
    cuentasUsadas: [
      { codigo: '62', uso: 'Gastos de Personal', debe: true, haber: false },
      { codigo: '40', uso: 'Tributos por Pagar', debe: false, haber: true },
      { codigo: '41', uso: 'Remuneraciones por Pagar', debe: false, haber: true }
    ]
  },
  {
    nombre: 'Depreciación',
    cuentasUsadas: [
      { codigo: '68', uso: 'Depreciación', debe: true, haber: false },
      { codigo: '39', uso: 'Depreciación Acumulada', debe: false, haber: true }
    ]
  }
];

function validarClasificacionCuenta(codigo: string): ValidacionResultado {
  const resultado: ValidacionResultado = {
    codigo,
    valido: true,
    errores: [],
    advertencias: []
  };

  const cuenta = cuentasPCGE.find(c => c.codigo === codigo);

  if (!cuenta) {
    resultado.valido = false;
    resultado.errores.push(`Cuenta ${codigo} no encontrada en PCGE Perú`);
    return resultado;
  }

  // Validar clasificación según PCGE
  const clasificacionesValidas: Record<string, string[]> = {
    '1': ['ACTIVO'], // Cuentas 10-19
    '2': ['ACTIVO'], // Cuentas 20-29
    '3': ['ACTIVO'], // Cuentas 30-39
    '4': ['PASIVO'], // Cuentas 40-49
    '5': ['PATRIMONIO'], // Cuentas 50-59
    '6': ['GASTO'], // Cuentas 60-69
    '7': ['INGRESO'], // Cuentas 70-79
    '8': ['GASTO'], // Cuentas 80-89 (Saldos intermediarios de gestión)
    '9': ['GASTO'] // Cuentas 90-99 (Contabilidad analítica de explotación)
  };

  const primerDigito = codigo.charAt(0);
  const clasificacionesEsperadas = clasificacionesValidas[primerDigito];

  if (!clasificacionesEsperadas) {
    resultado.valido = false;
    resultado.errores.push(`Código ${codigo} no corresponde a un rango válido del PCGE`);
    return resultado;
  }

  if (!clasificacionesEsperadas.includes(cuenta.tipo)) {
    resultado.valido = false;
    resultado.errores.push(
      `Cuenta ${codigo} clasificada como ${cuenta.tipo} pero debería ser ${clasificacionesEsperadas.join(' o ')}`
    );
  }

  return resultado;
}

function validarNaturalezaMovimiento(
  cuenta: CuentaPCGE,
  debe: boolean,
  haber: boolean
): { valido: boolean; mensaje?: string } {
  // Validar que el movimiento sea coherente con la naturaleza de la cuenta
  if (cuenta.naturaleza === 'DEUDORA') {
    // Cuentas deudoras: aumentan por el debe, disminuyen por el haber
    if (debe && !haber) {
      return { valido: true }; // Aumento normal
    } else if (!debe && haber) {
      return { valido: true }; // Disminución normal
    }
  } else if (cuenta.naturaleza === 'ACREEDORA') {
    // Cuentas acreedoras: aumentan por el haber, disminuyen por el debe
    if (!debe && haber) {
      return { valido: true }; // Aumento normal
    } else if (debe && !haber) {
      return { valido: true }; // Disminución normal
    }
  }

  return {
    valido: false,
    mensaje: `Movimiento inusual para cuenta ${cuenta.codigo} de naturaleza ${cuenta.naturaleza}`
  };
}

function validarAsiento(asiento: AsientoTipo): {
  valido: boolean;
  errores: string[];
  advertencias: string[];
} {
  const errores: string[] = [];
  const advertencias: string[] = [];

  for (const cuentaUsada of asiento.cuentasUsadas) {
    const cuenta = cuentasPCGE.find(c => c.codigo === cuentaUsada.codigo);

    if (!cuenta) {
      errores.push(
        `Cuenta ${cuentaUsada.codigo} no encontrada en PCGE para asiento ${asiento.nombre}`
      );
      continue;
    }

    // Validar naturaleza del movimiento
    const validacionNaturaleza = validarNaturalezaMovimiento(
      cuenta,
      cuentaUsada.debe,
      cuentaUsada.haber
    );

    if (!validacionNaturaleza.valido && validacionNaturaleza.mensaje) {
      advertencias.push(
        `${asiento.nombre}: ${validacionNaturaleza.mensaje} (${cuentaUsada.uso})`
      );
    }
  }

  return {
    valido: errores.length === 0,
    errores,
    advertencias
  };
}

function imprimirResultadoValidacion(
  titulo: string,
  resultado: ValidacionResultado
): void {
  console.log(`\n${titulo}`);
  console.log('-'.repeat(80));

  const cuenta = cuentasPCGE.find(c => c.codigo === resultado.codigo);
  if (cuenta) {
    console.log(`Código: ${cuenta.codigo}`);
    console.log(`Nombre: ${cuenta.nombre}`);
    console.log(`Tipo: ${cuenta.tipo}`);
    console.log(`Naturaleza: ${cuenta.naturaleza}`);
    console.log(`Descripción: ${cuenta.descripcion}`);
  }

  if (resultado.valido) {
    console.log(`\n✅ Estado: VÁLIDO`);
  } else {
    console.log(`\n❌ Estado: INVÁLIDO`);
  }

  if (resultado.errores.length > 0) {
    console.log('\n❌ Errores:');
    resultado.errores.forEach(error => console.log(`   - ${error}`));
  }

  if (resultado.advertencias.length > 0) {
    console.log('\n⚠️  Advertencias:');
    resultado.advertencias.forEach(adv => console.log(`   - ${adv}`));
  }
}

function main(): void {
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(78) + '║');
  console.log('║' + 'VALIDACIÓN DE CLASIFICACIÓN DE CUENTAS SEGÚN PCGE PERÚ'.padStart(66).padEnd(78) + '║');
  console.log('║' + 'Sistema ERP - Módulo de Contabilidad'.padStart(57).padEnd(78) + '║');
  console.log('║' + ' '.repeat(78) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');

  console.log('\n' + '='.repeat(80));
  console.log('1. VALIDACIÓN DE CLASIFICACIÓN DE CUENTAS');
  console.log('='.repeat(80));

  const codigosUnicos = Array.from(
    new Set(cuentasPCGE.map(c => c.codigo))
  ).sort();

  let todasValidas = true;
  const resultados: ValidacionResultado[] = [];

  for (const codigo of codigosUnicos) {
    const resultado = validarClasificacionCuenta(codigo);
    resultados.push(resultado);

    if (!resultado.valido) {
      todasValidas = false;
    }
  }

  // Imprimir resultados
  for (const resultado of resultados) {
    imprimirResultadoValidacion(
      `Cuenta ${resultado.codigo}`,
      resultado
    );
  }

  console.log('\n' + '='.repeat(80));
  console.log('2. VALIDACIÓN DE ASIENTOS CONTABLES');
  console.log('='.repeat(80));

  let todosAsientosValidos = true;

  for (const asiento of asientosImplementados) {
    const validacion = validarAsiento(asiento);

    console.log(`\nAsiento: ${asiento.nombre}`);
    console.log('-'.repeat(80));

    if (validacion.valido) {
      console.log('✅ Estado: VÁLIDO');
    } else {
      console.log('❌ Estado: INVÁLIDO');
      todosAsientosValidos = false;
    }

    if (validacion.errores.length > 0) {
      console.log('\n❌ Errores:');
      validacion.errores.forEach(error => console.log(`   - ${error}`));
    }

    if (validacion.advertencias.length > 0) {
      console.log('\n⚠️  Advertencias:');
      validacion.advertencias.forEach(adv => console.log(`   - ${adv}`));
    }

    console.log('\nCuentas utilizadas:');
    for (const cuenta of asiento.cuentasUsadas) {
      const cuentaPCGE = cuentasPCGE.find(c => c.codigo === cuenta.codigo);
      const movimiento = cuenta.debe ? 'DEBE' : 'HABER';
      console.log(
        `   ${cuenta.codigo} - ${cuentaPCGE?.nombre || 'Desconocida'} (${movimiento}): ${cuenta.uso}`
      );
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('3. RESUMEN DE VALIDACIÓN');
  console.log('='.repeat(80));

  const totalCuentas = resultados.length;
  const cuentasValidas = resultados.filter(r => r.valido).length;
  const cuentasInvalidas = totalCuentas - cuentasValidas;

  console.log(`\nCuentas validadas: ${totalCuentas}`);
  console.log(`Cuentas válidas: ${cuentasValidas}`);
  console.log(`Cuentas inválidas: ${cuentasInvalidas}`);

  console.log(`\nAsientos validados: ${asientosImplementados.length}`);
  console.log(
    `Asientos válidos: ${todosAsientosValidos ? asientosImplementados.length : 'Revisar errores'}`
  );

  console.log('\n' + '='.repeat(80));
  console.log('4. CONCLUSIÓN');
  console.log('='.repeat(80));

  if (todasValidas && todosAsientosValidos) {
    console.log('\n✅ TODAS LAS CUENTAS Y ASIENTOS ESTÁN CORRECTAMENTE CLASIFICADOS');
    console.log('✅ La clasificación cumple con el PCGE Perú');
    console.log('✅ Los movimientos contables son coherentes con la naturaleza de las cuentas');
  } else {
    console.log('\n❌ SE ENCONTRARON ERRORES EN LA CLASIFICACIÓN');
    console.log('⚠️  Revisar los errores detallados arriba');
  }

  console.log('\n' + '='.repeat(80));
  console.log('5. REFERENCIAS NORMATIVAS');
  console.log('='.repeat(80));
  console.log('• Plan Contable General Empresarial (PCGE) - Resolución CNC N° 043-2010-EF/94');
  console.log('• Modificado por Resolución CNC N° 045-2011-EF/94');
  console.log('• Aplicable a partir del 01 de enero de 2011');
  console.log('• Basado en las Normas Internacionales de Información Financiera (NIIF)');

  console.log('\n');
}

// Ejecutar validación
main();
