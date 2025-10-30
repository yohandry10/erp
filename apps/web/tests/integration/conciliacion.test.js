/**
 * Integration Test: Conciliación Bancaria
 * 
 * Este test verifica el flujo completo de conciliación bancaria
 * haciendo llamadas directas a la API.
 * 
 * Para ejecutar: node apps/web/tests/integration/conciliacion.test.js
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:3002';

// Variable global para almacenar el token JWT y tenant
let authToken = '';
let tenantId = '';

// Helper para hacer requests
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Agregar token si existe
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
    headers['x-supabase-access-token'] = authToken;
  }
  
  // Agregar tenant_id si existe (aunque el backend lo saca del JWT)
  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`API Error: ${data.message || response.statusText}`);
  }

  return data;
}

// Test principal
async function testConciliacionFlow() {
  console.log('🧪 Iniciando test de conciliación bancaria...\n');

  try {
    // 0. Login
    console.log('🔐 Paso 0: Autenticando...');
    const loginResponse = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'superadmin@neon.com',
        password: '6559234.Yoandri1',
      }),
    });
    
    // Guardar el token y tenant
    if (loginResponse.access_token) {
      authToken = loginResponse.access_token;
    }
    if (loginResponse.user && loginResponse.user.tenant_id) {
      tenantId = loginResponse.user.tenant_id;
    } else {
      // Usar tenant por defecto
      tenantId = '550e8400-e29b-41d4-a716-446655440000';
    }
    console.log(`✅ Autenticado correctamente (Tenant: ${tenantId})\n`);

    // 1. Obtener cuentas bancarias disponibles
    console.log('📋 Paso 1: Obteniendo cuentas bancarias...');
    const cuentasResponse = await apiRequest('/api/api/finanzas/bancos/cuentas');
    const cuentas = cuentasResponse.data;

    if (!cuentas || cuentas.length === 0) {
      throw new Error('No hay cuentas bancarias disponibles');
    }

    const cuentaBancaria = cuentas[0];
    console.log(`✅ Cuenta bancaria encontrada: ${cuentaBancaria.banco} - ${cuentaBancaria.numero_cuenta}\n`);

    // 2. Crear una nueva conciliación
    console.log('📋 Paso 2: Creando nueva conciliación...');
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const conciliacionData = {
      cuenta_bancaria_id: cuentaBancaria.id,
      fecha_desde: firstDay.toISOString().split('T')[0],
      fecha_hasta: lastDay.toISOString().split('T')[0],
    };

    const conciliacionResponse = await apiRequest('/api/api/finanzas/conciliacion', {
      method: 'POST',
      body: JSON.stringify(conciliacionData),
    });

    const conciliacion = conciliacionResponse.data;
    console.log(`✅ Conciliación creada: ID ${conciliacion.id}, Estado: ${conciliacion.estado}\n`);

    // 3. Importar extracto CSV
    console.log('📋 Paso 3: Importando extracto CSV...');
    const csvData = [
      {
        fecha: '2024-01-15',
        descripcion: 'TRANSFERENCIA RECIBIDA',
        referencia: 'REF001',
        tipo: 'ABONO',
        monto: 1500.00,
      },
      {
        fecha: '2024-01-16',
        descripcion: 'PAGO PROVEEDOR',
        referencia: 'REF002',
        tipo: 'CARGO',
        monto: 800.00,
      },
      {
        fecha: '2024-01-17',
        descripcion: 'DEPOSITO',
        referencia: 'REF003',
        tipo: 'ABONO',
        monto: 2000.00,
      },
      {
        fecha: '2024-01-18',
        descripcion: 'COMISION BANCARIA',
        referencia: 'REF004',
        tipo: 'CARGO',
        monto: 25.00,
      },
    ];

    const importResponse = await apiRequest(
      `/api/api/finanzas/conciliacion/${conciliacion.id}/importar-csv`,
      {
        method: 'POST',
        body: JSON.stringify({ movimientos: csvData }),
      }
    );

    console.log(`✅ Extracto importado: ${importResponse.data.movimientos_importados} movimientos\n`);

    // 4. Obtener movimientos del sistema y del extracto
    console.log('📋 Paso 4: Obteniendo movimientos...');
    const movimientosSistemaResponse = await apiRequest(
      `/api/finanzas/bancos/cuentas/${cuentaBancaria.id}/movimientos?` +
      `fecha_desde=${conciliacionData.fecha_desde}&fecha_hasta=${conciliacionData.fecha_hasta}&es_extracto=false`
    );

    const movimientosExtractoResponse = await apiRequest(
      `/api/finanzas/bancos/cuentas/${cuentaBancaria.id}/movimientos?` +
      `fecha_desde=${conciliacionData.fecha_desde}&fecha_hasta=${conciliacionData.fecha_hasta}&es_extracto=true&conciliacion_id=${conciliacion.id}`
    );

    const movimientosSistema = movimientosSistemaResponse.data || [];
    const movimientosExtracto = movimientosExtractoResponse.data || [];

    console.log(`✅ Movimientos del Sistema: ${movimientosSistema.length}`);
    console.log(`✅ Movimientos del Extracto: ${movimientosExtracto.length}\n`);

    // 5. Realizar match manual (si hay movimientos)
    if (movimientosSistema.length > 0 && movimientosExtracto.length > 0) {
      console.log('📋 Paso 5: Realizando match manual...');
      
      const matchResponse = await apiRequest(
        `/api/finanzas/conciliacion/${conciliacion.id}/marcar-item`,
        {
          method: 'POST',
          body: JSON.stringify({
            movimiento_sistema_id: movimientosSistema[0].id,
            movimiento_extracto_id: movimientosExtracto[0].id,
          }),
        }
      );

      console.log(`✅ Match realizado exitosamente\n`);
    } else {
      console.log('⚠️  No hay movimientos para hacer match\n');
    }

    // 6. Obtener reporte de diferencias
    console.log('📋 Paso 6: Obteniendo reporte de diferencias...');
    const diferenciasResponse = await apiRequest(
      `/api/finanzas/conciliacion/${conciliacion.id}/diferencias`
    );

    const reporte = diferenciasResponse.data;
    console.log('✅ Reporte de diferencias:');
    console.log(`   - Saldo Libro: ${reporte.saldos.saldo_libro}`);
    console.log(`   - Saldo Banco: ${reporte.saldos.saldo_banco}`);
    console.log(`   - Diferencia: ${reporte.saldos.diferencia_neta}`);
    console.log(`   - Sistema: ${reporte.movimientos_sistema.conciliados}/${reporte.movimientos_sistema.total} conciliados`);
    console.log(`   - Extracto: ${reporte.movimientos_extracto.conciliados}/${reporte.movimientos_extracto.total} conciliados`);
    console.log(`   - Porcentaje General: ${reporte.metricas.porcentaje_conciliado_general.toFixed(1)}%\n`);

    // 7. Intentar cerrar conciliación
    console.log('📋 Paso 7: Cerrando conciliación...');
    
    const hasPendientes = reporte.movimientos_sistema.pendientes > 0 || 
                          reporte.movimientos_extracto.pendientes > 0;

    if (hasPendientes) {
      console.log('⚠️  Hay movimientos pendientes. Se requiere forzar cierre.');
      
      const cerrarResponse = await apiRequest(
        `/api/finanzas/conciliacion/${conciliacion.id}/cerrar`,
        {
          method: 'POST',
          body: JSON.stringify({ forzar_cierre: true }),
        }
      );

      console.log(`✅ Conciliación cerrada (forzada): ${cerrarResponse.data.estado}\n`);
    } else {
      const cerrarResponse = await apiRequest(
        `/api/finanzas/conciliacion/${conciliacion.id}/cerrar`,
        {
          method: 'POST',
          body: JSON.stringify({ forzar_cierre: false }),
        }
      );

      console.log(`✅ Conciliación cerrada: ${cerrarResponse.data.estado}\n`);
    }

    // 8. Verificar estado final
    console.log('📋 Paso 8: Verificando estado final...');
    const finalResponse = await apiRequest(`/api/finanzas/conciliacion/${conciliacion.id}`);
    const finalConciliacion = finalResponse.data;

    console.log(`✅ Estado final: ${finalConciliacion.estado}`);
    console.log(`✅ Diferencia final: ${finalConciliacion.diferencia}\n`);

    console.log('🎉 ¡Test completado exitosamente!\n');
    console.log('Resumen:');
    console.log(`- Conciliación ID: ${conciliacion.id}`);
    console.log(`- Movimientos importados: ${csvData.length}`);
    console.log(`- Estado final: ${finalConciliacion.estado}`);
    console.log(`- Diferencia: ${finalConciliacion.diferencia}`);

    return {
      success: true,
      conciliacionId: conciliacion.id,
      estado: finalConciliacion.estado,
    };

  } catch (error) {
    console.error('❌ Error en el test:', error.message);
    console.error(error.stack);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Ejecutar test
if (require.main === module) {
  testConciliacionFlow()
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { testConciliacionFlow };
