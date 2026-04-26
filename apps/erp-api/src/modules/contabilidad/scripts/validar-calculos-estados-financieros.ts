/**
 * Script de validación de cálculos de estados financieros
 * Valida que los cálculos del Balance de Comprobación, Estado de Resultados y Balance General sean correctos
 * 
 * Uso: npx ts-node apps/erp-api/src/modules/contabilidad/scripts/validar-calculos-estados-financieros.ts
 */

import axios from 'axios';

interface BalanceComprobacionItem {
  cuenta: string;
  nombre: string;
  saldo_inicial: number;
  debe: number;
  haber: number;
  saldo_final: number;
}

interface EstadoResultados {
  ingresos: {
    ventas: number;
    otros_ingresos: number;
    total_ingresos: number;
  };
  costos: {
    costo_ventas: number;
    utilidad_bruta: number;
  };
  gastos: {
    gastos_administrativos: number;
    gastos_ventas: number;
    gastos_financieros: number;
    total_gastos: number;
  };
  utilidad_neta: number;
}

interface BalanceGeneral {
  activos: {
    corrientes: {
      efectivo: number;
      cuentas_por_cobrar: number;
      inventarios: number;
      otros_activos: number;
      total_corrientes: number;
    };
    no_corrientes: {
      activos_fijos: number;
      depreciacion_acumulada: number;
      activos_fijos_neto: number;
      otros_activos: number;
      total_no_corrientes: number;
    };
    total_activos: number;
  };
  pasivos: {
    corrientes: {
      cuentas_por_pagar: number;
      tributos_por_pagar: number;
      remuneraciones_por_pagar: number;
      otros_pasivos: number;
      total_corrientes: number;
    };
    no_corrientes: {
      deudas_largo_plazo: number;
      otros_pasivos: number;
      total_no_corrientes: number;
    };
    total_pasivos: number;
  };
  patrimonio: {
    capital: number;
    resultados_acumulados: number;
    resultado_ejercicio: number;
    total_patrimonio: number;
  };
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TENANT_ID = process.env.TENANT_ID || 'vierdes-tenant-id';
const ANIO = parseInt(process.env.ANIO || '2024');
const MES = parseInt(process.env.MES || '10');

async function fetchBalanceComprobacion(): Promise<BalanceComprobacionItem[]> {
  const response = await axios.get(
    `${API_URL}/api/contabilidad/estados/balance-comprobacion`,
    {
      params: { anio: ANIO, mes: MES },
      headers: { 'x-tenant-id': TENANT_ID }
    }
  );
  return response.data;
}

async function fetchEstadoResultados(): Promise<EstadoResultados> {
  const response = await axios.get(
    `${API_URL}/api/contabilidad/estados/estado-resultados`,
    {
      params: { anio: ANIO, mes: MES },
      headers: { 'x-tenant-id': TENANT_ID }
    }
  );
  return response.data;
}

async function fetchBalanceGeneral(): Promise<BalanceGeneral> {
  const response = await axios.get(
    `${API_URL}/api/contabilidad/estados/balance-general`,
    {
      params: { anio: ANIO, mes: MES },
      headers: { 'x-tenant-id': TENANT_ID }
    }
  );
  return response.data;
}


/**
 * Valida que el Balance de Comprobación esté cuadrado (Debe = Haber)
 */
function validateBalanceComprobacion(balance: BalanceComprobacionItem[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const totalDebe = balance.reduce((sum, item) => sum + item.debe, 0);
  const totalHaber = balance.reduce((sum, item) => sum + item.haber, 0);
  const diferencia = Math.abs(totalDebe - totalHaber);

  console.log('\n📊 VALIDACIÓN 1: Balance de Comprobación');
  console.log(`  Total Debe:  ${totalDebe.toFixed(2)}`);
  console.log(`  Total Haber: ${totalHaber.toFixed(2)}`);
  console.log(`  Diferencia:  ${diferencia.toFixed(2)}`);

  if (diferencia >= 0.01) {
    errors.push(`Balance de Comprobación descuadrado. Diferencia: ${diferencia.toFixed(2)}`);
    console.log('  ❌ Balance descuadrado');
  } else {
    console.log('  ✅ Balance cuadrado');
  }

  // Validar que cada cuenta tenga saldo_final correcto
  balance.forEach(item => {
    const saldoCalculado = item.saldo_inicial + item.debe - item.haber;
    const diferenciaSaldo = Math.abs(saldoCalculado - item.saldo_final);
    
    if (diferenciaSaldo >= 0.01) {
      errors.push(
        `Cuenta ${item.cuenta}: Saldo final incorrecto. ` +
        `Esperado: ${saldoCalculado.toFixed(2)}, Obtenido: ${item.saldo_final.toFixed(2)}`
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Valida los cálculos del Estado de Resultados
 */
function validateEstadoResultados(estado: EstadoResultados): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n📈 VALIDACIÓN 2: Estado de Resultados');

  // Validar Total Ingresos
  const totalIngresosCalculado = estado.ingresos.ventas + estado.ingresos.otros_ingresos;
  if (Math.abs(totalIngresosCalculado - estado.ingresos.total_ingresos) >= 0.01) {
    errors.push(
      `Total Ingresos incorrecto. Esperado: ${totalIngresosCalculado.toFixed(2)}, ` +
      `Obtenido: ${estado.ingresos.total_ingresos.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Total Ingresos correcto');
  }

  // Validar Utilidad Bruta
  const utilidadBrutaCalculada = estado.ingresos.total_ingresos - estado.costos.costo_ventas;
  if (Math.abs(utilidadBrutaCalculada - estado.costos.utilidad_bruta) >= 0.01) {
    errors.push(
      `Utilidad Bruta incorrecta. Esperado: ${utilidadBrutaCalculada.toFixed(2)}, ` +
      `Obtenido: ${estado.costos.utilidad_bruta.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Utilidad Bruta correcta');
  }

  // Validar Total Gastos
  const totalGastosCalculado = 
    estado.gastos.gastos_administrativos + 
    estado.gastos.gastos_ventas + 
    estado.gastos.gastos_financieros;
  
  if (Math.abs(totalGastosCalculado - estado.gastos.total_gastos) >= 0.01) {
    errors.push(
      `Total Gastos incorrecto. Esperado: ${totalGastosCalculado.toFixed(2)}, ` +
      `Obtenido: ${estado.gastos.total_gastos.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Total Gastos correcto');
  }

  // Validar Utilidad Neta
  const utilidadNetaCalculada = estado.costos.utilidad_bruta - estado.gastos.total_gastos;
  if (Math.abs(utilidadNetaCalculada - estado.utilidad_neta) >= 0.01) {
    errors.push(
      `Utilidad Neta incorrecta. Esperado: ${utilidadNetaCalculada.toFixed(2)}, ` +
      `Obtenido: ${estado.utilidad_neta.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Utilidad Neta correcta');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}


/**
 * Valida los cálculos del Balance General
 */
function validateBalanceGeneral(balance: BalanceGeneral): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n🏦 VALIDACIÓN 3: Balance General');

  // Validar Total Activos Corrientes
  const totalActivosCorrientesCalculado = 
    balance.activos.corrientes.efectivo +
    balance.activos.corrientes.cuentas_por_cobrar +
    balance.activos.corrientes.inventarios +
    balance.activos.corrientes.otros_activos;

  if (Math.abs(totalActivosCorrientesCalculado - balance.activos.corrientes.total_corrientes) >= 0.01) {
    errors.push(
      `Total Activos Corrientes incorrecto. Esperado: ${totalActivosCorrientesCalculado.toFixed(2)}, ` +
      `Obtenido: ${balance.activos.corrientes.total_corrientes.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Total Activos Corrientes correcto');
  }

  // Validar Activos Fijos Neto
  const activosFijosNetoCalculado = 
    balance.activos.no_corrientes.activos_fijos - 
    balance.activos.no_corrientes.depreciacion_acumulada;

  if (Math.abs(activosFijosNetoCalculado - balance.activos.no_corrientes.activos_fijos_neto) >= 0.01) {
    errors.push(
      `Activos Fijos Neto incorrecto. Esperado: ${activosFijosNetoCalculado.toFixed(2)}, ` +
      `Obtenido: ${balance.activos.no_corrientes.activos_fijos_neto.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Activos Fijos Neto correcto');
  }

  // Validar Total Activos No Corrientes
  const totalActivosNoCorrientesCalculado = 
    balance.activos.no_corrientes.activos_fijos_neto +
    balance.activos.no_corrientes.otros_activos;

  if (Math.abs(totalActivosNoCorrientesCalculado - balance.activos.no_corrientes.total_no_corrientes) >= 0.01) {
    errors.push(
      `Total Activos No Corrientes incorrecto. Esperado: ${totalActivosNoCorrientesCalculado.toFixed(2)}, ` +
      `Obtenido: ${balance.activos.no_corrientes.total_no_corrientes.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Total Activos No Corrientes correcto');
  }

  // Validar Total Activos
  const totalActivosCalculado = 
    balance.activos.corrientes.total_corrientes +
    balance.activos.no_corrientes.total_no_corrientes;

  if (Math.abs(totalActivosCalculado - balance.activos.total_activos) >= 0.01) {
    errors.push(
      `Total Activos incorrecto. Esperado: ${totalActivosCalculado.toFixed(2)}, ` +
      `Obtenido: ${balance.activos.total_activos.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Total Activos correcto');
  }

  // Validar Total Pasivos Corrientes
  const totalPasivosCorrientesCalculado = 
    balance.pasivos.corrientes.cuentas_por_pagar +
    balance.pasivos.corrientes.tributos_por_pagar +
    balance.pasivos.corrientes.remuneraciones_por_pagar +
    balance.pasivos.corrientes.otros_pasivos;

  if (Math.abs(totalPasivosCorrientesCalculado - balance.pasivos.corrientes.total_corrientes) >= 0.01) {
    errors.push(
      `Total Pasivos Corrientes incorrecto. Esperado: ${totalPasivosCorrientesCalculado.toFixed(2)}, ` +
      `Obtenido: ${balance.pasivos.corrientes.total_corrientes.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Total Pasivos Corrientes correcto');
  }

  // Validar Total Pasivos No Corrientes
  const totalPasivosNoCorrientesCalculado = 
    balance.pasivos.no_corrientes.deudas_largo_plazo +
    balance.pasivos.no_corrientes.otros_pasivos;

  if (Math.abs(totalPasivosNoCorrientesCalculado - balance.pasivos.no_corrientes.total_no_corrientes) >= 0.01) {
    errors.push(
      `Total Pasivos No Corrientes incorrecto. Esperado: ${totalPasivosNoCorrientesCalculado.toFixed(2)}, ` +
      `Obtenido: ${balance.pasivos.no_corrientes.total_no_corrientes.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Total Pasivos No Corrientes correcto');
  }

  // Validar Total Pasivos
  const totalPasivosCalculado = 
    balance.pasivos.corrientes.total_corrientes +
    balance.pasivos.no_corrientes.total_no_corrientes;

  if (Math.abs(totalPasivosCalculado - balance.pasivos.total_pasivos) >= 0.01) {
    errors.push(
      `Total Pasivos incorrecto. Esperado: ${totalPasivosCalculado.toFixed(2)}, ` +
      `Obtenido: ${balance.pasivos.total_pasivos.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Total Pasivos correcto');
  }

  // Validar Total Patrimonio
  const totalPatrimonioCalculado = 
    balance.patrimonio.capital +
    balance.patrimonio.resultados_acumulados +
    balance.patrimonio.resultado_ejercicio;

  if (Math.abs(totalPatrimonioCalculado - balance.patrimonio.total_patrimonio) >= 0.01) {
    errors.push(
      `Total Patrimonio incorrecto. Esperado: ${totalPatrimonioCalculado.toFixed(2)}, ` +
      `Obtenido: ${balance.patrimonio.total_patrimonio.toFixed(2)}`
    );
  } else {
    console.log('  ✅ Total Patrimonio correcto');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}


/**
 * Valida la ecuación contable fundamental: Activos = Pasivos + Patrimonio
 */
function validateEcuacionContable(balance: BalanceGeneral): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n⚖️  VALIDACIÓN 4: Ecuación Contable Fundamental');
  console.log('  Verificando: ACTIVOS = PASIVOS + PATRIMONIO');

  const totalPasivosPatrimonio = balance.pasivos.total_pasivos + balance.patrimonio.total_patrimonio;
  const diferencia = Math.abs(balance.activos.total_activos - totalPasivosPatrimonio);

  console.log(`  Total Activos:              ${balance.activos.total_activos.toFixed(2)}`);
  console.log(`  Total Pasivos + Patrimonio: ${totalPasivosPatrimonio.toFixed(2)}`);
  console.log(`  Diferencia:                 ${diferencia.toFixed(2)}`);

  if (diferencia >= 0.01) {
    errors.push(
      `Ecuación contable NO balanceada. Diferencia: ${diferencia.toFixed(2)}`
    );
    console.log('  ❌ Ecuación contable NO balanceada');
  } else {
    console.log('  ✅ Ecuación contable balanceada');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Valida la consistencia entre Estado de Resultados y Balance General
 */
function validateConsistenciaEstados(
  estadoResultados: EstadoResultados,
  balanceGeneral: BalanceGeneral
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n🔗 VALIDACIÓN 5: Consistencia entre Estados');
  console.log('  Verificando que el Resultado del Ejercicio coincida');

  const diferencia = Math.abs(
    estadoResultados.utilidad_neta - 
    balanceGeneral.patrimonio.resultado_ejercicio
  );

  console.log(`  Utilidad Neta (Estado de Resultados): ${estadoResultados.utilidad_neta.toFixed(2)}`);
  console.log(`  Resultado Ejercicio (Balance General): ${balanceGeneral.patrimonio.resultado_ejercicio.toFixed(2)}`);
  console.log(`  Diferencia:                            ${diferencia.toFixed(2)}`);

  if (diferencia >= 0.01) {
    errors.push(
      `Resultado del ejercicio NO consistente entre estados. Diferencia: ${diferencia.toFixed(2)}`
    );
    console.log('  ❌ Resultado del ejercicio NO consistente');
  } else {
    console.log('  ✅ Resultado del ejercicio consistente');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Función principal de validación
 */
async function main() {
  console.log('========================================');
  console.log('VALIDACIÓN DE ESTADOS FINANCIEROS');
  console.log('========================================');
  console.log(`\nTenant: ${TENANT_ID}`);
  console.log(`Período: ${ANIO}-${MES}`);
  console.log('');

  try {
    // Obtener datos
    console.log('Obteniendo datos de estados financieros...');
    const balanceComprobacion = await fetchBalanceComprobacion();
    const estadoResultados = await fetchEstadoResultados();
    const balanceGeneral = await fetchBalanceGeneral();
    console.log('✅ Datos obtenidos correctamente\n');

    // Ejecutar validaciones
    const results: ValidationResult[] = [];

    results.push(validateBalanceComprobacion(balanceComprobacion));
    results.push(validateEstadoResultados(estadoResultados));
    results.push(validateBalanceGeneral(balanceGeneral));
    results.push(validateEcuacionContable(balanceGeneral));
    results.push(validateConsistenciaEstados(estadoResultados, balanceGeneral));

    // Consolidar resultados
    const allErrors = results.flatMap(r => r.errors);
    const allWarnings = results.flatMap(r => r.warnings);

    // Mostrar resumen
    console.log('\n========================================');
    console.log('RESUMEN DE VALIDACIÓN');
    console.log('========================================\n');

    if (allErrors.length === 0 && allWarnings.length === 0) {
      console.log('✅ TODOS LOS CÁLCULOS SON CORRECTOS\n');
      console.log('Los estados financieros cumplen con todas las validaciones contables:');
      console.log('  ✓ Balance de Comprobación cuadrado (Debe = Haber)');
      console.log('  ✓ Estado de Resultados con cálculos correctos');
      console.log('  ✓ Balance General con subtotales correctos');
      console.log('  ✓ Ecuación contable balanceada (Activos = Pasivos + Patrimonio)');
      console.log('  ✓ Consistencia entre estados financieros\n');
      console.log('✅ APROBADO PARA USO CONTABLE');
      process.exit(0);
    } else {
      console.log('❌ SE ENCONTRARON ERRORES EN LOS CÁLCULOS\n');

      if (allErrors.length > 0) {
        console.log(`ERRORES CRÍTICOS (${allErrors.length}):`);
        allErrors.forEach(error => console.log(`  • ${error}`));
        console.log('');
      }

      if (allWarnings.length > 0) {
        console.log(`ADVERTENCIAS (${allWarnings.length}):`);
        allWarnings.forEach(warning => console.log(`  • ${warning}`));
        console.log('');
      }

      console.log('❌ NO APROBADO - REQUIERE CORRECCIONES');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error ejecutando validación:', error);
    process.exit(1);
  }
}

// Ejecutar validación
main();
