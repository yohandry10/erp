import { register } from 'prom-client';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  beforeEach(() => {
    register.clear();
  });

  afterEach(() => {
    register.clear();
  });

  it('registra métricas de negocio y las expone en el resumen', async () => {
    const service = new MetricsService();

    service.recordOrdenCompraCreada('tenant-1', 'APROBADA');
    service.recordFacturaEmitida('tenant-1', 'FACTURA');
    service.recordPagoRegistrado('tenant-1', 'EFECTIVO');
    service.recordInventarioMovimiento('tenant-1', 'ENTRADA');

    const summary = await service.getBusinessMetricsSummary();

    expect(summary.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(summary.metrics.erp_ordenes_compra_creadas_total[0].value).toBe(1);
    expect(summary.metrics.erp_facturas_emitidas_total[0].labels.tipo_documento).toBe('FACTURA');
    expect(summary.metrics.erp_pagos_registrados_total[0].labels.metodo_pago).toBe('EFECTIVO');
    expect(summary.metrics.erp_inventario_movimientos_total[0].labels.tipo_movimiento).toBe('ENTRADA');
  });
});
