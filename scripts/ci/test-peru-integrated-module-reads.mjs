import assert from 'node:assert/strict';

// Se ejecuta con el usuario operativo de la empresa, sin bypass de superadmin.
export async function testModuleReads({ request, results, tenantId }) {
  const failures = [];
  for (const endpoint of [
    'rrhh/configuracion-laboral', 'rrhh/empleados', 'rrhh/departamentos',
    'rrhh/candidatos', 'rrhh/vacantes', 'rrhh/asistencias?fecha=2026-09-06',
    'contabilidad/activos-fijos', 'contabilidad/centros-costo',
    'contabilidad/registro-consignaciones', 'contabilidad/consolidacion/grupos',
    'contabilidad/reportes-configurables', 'contabilidad/diferidos',
    'contabilidad/plantillas-asientos', 'contabilidad/presupuestos',
    'contabilidad/tipos-cambio', 'contabilidad/eventos/estadisticas',
    'contabilidad/eventos/fallidos', 'contabilidad/eventos/dead-letter',
    'ventas/cotizaciones', 'documentos/lista', 'cpe/baja/lotes?tipo=RA', 'cpe/baja/lotes?tipo=RC',
    'finanzas/conciliacion', 'finanzas/cxp/detracciones/tasas',
    'inventario/logistica/listo-despacho', 'inventario/logistica/ordenes-pendientes',
    'inventario/recepciones',
    'ventas/pedidos', 'ventas/pedidos/aprobaciones/pendientes',
    'ventas/comercial/catalogos', 'ventas/rma', 'ventas/rma/saldos-favor',
    'ventas/rma/candidatos',
  ]) {
    try {
      const response = await request(endpoint);
      assert.notEqual(response?.success, false, `${endpoint}: no puede ocultar un fallo con HTTP 200`);
      // Las filas operativas no pueden pertenecer a otra empresa. Los grupos
      // consolidan miembros autorizados y tienen su contrato independiente.
      if (!endpoint.includes('consolidacion')) {
        const checkScope = value => {
          if (!value || typeof value !== 'object') return;
          if ('tenant_id' in value && value.tenant_id !== null) assert.equal(value.tenant_id, tenantId, endpoint);
          for (const nested of Object.values(value)) checkScope(nested);
        };
        checkScope(response);
      }
      results.push({ scenario: `lectura operativa ${endpoint}`, passed: true });
    } catch (error) {
      failures.push(`${endpoint}: ${error.message}`);
      results.push({ scenario: `lectura operativa ${endpoint}`, passed: false, error: error.message });
    }
  }
  assert.deepEqual(failures, [], 'Las lecturas operativas deben cargar y conservar su empresa');
}
