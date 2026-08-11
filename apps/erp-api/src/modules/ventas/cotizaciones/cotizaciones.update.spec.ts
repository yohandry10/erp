import { BadRequestException } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { EstadoCotizacion } from './entities';

describe('CotizacionesService.update', () => {
  it('actualiza cabecera y detalle mediante la RPC transaccional', async () => {
    const tenantId = 'tenant-123';

    const mockClient: any = {
      rpc: jest.fn().mockResolvedValue({ data: { id: 'cot-1' }, error: null }),
    };

    const supabaseService = { getClient: () => mockClient } as any as SupabaseService;
    const notificationsService = { createNotification: jest.fn() } as any as NotificationsService;
    const auditService = { getResourceAuditLogs: jest.fn() } as any as AuditService;
    const taxCalculator = { calcularImpuestos: jest.fn() } as any as TaxCalculatorService;
    const service = new CotizacionesService(
      supabaseService,
      notificationsService,
      auditService,
      taxCalculator,
    );

    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'cot-1',
      estado: EstadoCotizacion.BORRADOR,
      detalle: [{ id: 'det-1', producto_id: 'p1', cantidad: 1, precio_unitario: 10 }],
    } as any);

    jest.spyOn(service as any, 'calcularTotales').mockResolvedValue({ subtotal: 10, igv: 1.8, total: 11.8 });

    await service.update(
      'cot-1',
      {
        notas: 'Nueva nota',
        detalle: [{ producto_id: 'p1', cantidad: 1, precio_unitario: 10, descripcion: 'Item' }],
      } as any,
      tenantId,
    );

    expect(mockClient.rpc).toHaveBeenCalledWith(
      'actualizar_cotizacion_comercial_tx',
      expect.objectContaining({
        p_cotizacion_id: 'cot-1',
        p_tenant_id: tenantId,
        p_patch: expect.objectContaining({ observaciones: 'Nueva nota' }),
        p_detalle: [expect.objectContaining({
          producto_id: 'p1',
          cantidad: 1,
          precio_unitario: 10,
          orden: 1,
        })],
      }),
    );
  });

  it('lanza BadRequestException si falla la actualización transaccional', async () => {
    const tenantId = 'tenant-123';

    const mockClient: any = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'transaction failed' },
      }),
    };

    const supabaseService = { getClient: () => mockClient } as any as SupabaseService;

    const service = new CotizacionesService(
      supabaseService,
      { createNotification: jest.fn() } as any,
      { getResourceAuditLogs: jest.fn() } as any,
      { calcularImpuestos: jest.fn() } as any,
    );

    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'cot-1',
      estado: EstadoCotizacion.BORRADOR,
      detalle: [{ id: 'det-1' }],
    } as any);

    jest.spyOn(service as any, 'calcularTotales').mockResolvedValue({ subtotal: 10, igv: 1.8, total: 11.8 });

    await expect(
      service.update(
        'cot-1',
        { detalle: [{ producto_id: 'p1', cantidad: 1, precio_unitario: 10, descripcion: 'Item' }] } as any,
        tenantId,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
