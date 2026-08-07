import { BadRequestException } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { PedidosService } from '../pedidos/pedidos.service';
import { EstadoCotizacion } from './entities';

describe('CotizacionesService.update', () => {
  it('usa `cotizacion_detalles` y actualiza `observaciones` cuando llega `notas`', async () => {
    const tenantId = 'tenant-123';

    const fromCalls: string[] = [];

    const mockClient: any = {
      from: jest.fn().mockImplementation((table: string) => {
        fromCalls.push(table);
        return mockClient;
      }),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'cot-1' }, error: null }),
    };

    const supabaseService = { getClient: () => mockClient } as any as SupabaseService;
    const notificationsService = { createNotification: jest.fn() } as any as NotificationsService;
    const auditService = { getResourceAuditLogs: jest.fn() } as any as AuditService;
    const taxCalculator = { calcularImpuestos: jest.fn() } as any as TaxCalculatorService;
    const pedidosService = {} as any as PedidosService;

    const service = new CotizacionesService(
      supabaseService,
      notificationsService,
      auditService,
      taxCalculator,
      pedidosService,
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

    expect(fromCalls).toContain('cotizacion_detalles');
    expect(fromCalls).not.toContain('cotizaciones_detalle');

    expect(mockClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        observaciones: 'Nueva nota',
      }),
    );
  });

  it('lanza BadRequestException si falla el delete de detalle anterior', async () => {
    const tenantId = 'tenant-123';

    const mockClient: any = {
      from: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'cot-1' }, error: null }),
    };

    const supabaseService = { getClient: () => mockClient } as any as SupabaseService;

    const service = new CotizacionesService(
      supabaseService,
      { createNotification: jest.fn() } as any,
      { getResourceAuditLogs: jest.fn() } as any,
      { calcularImpuestos: jest.fn() } as any,
      {} as any,
    );

    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'cot-1',
      estado: EstadoCotizacion.BORRADOR,
      detalle: [{ id: 'det-1' }],
    } as any);

    jest.spyOn(service as any, 'calcularTotales').mockResolvedValue({ subtotal: 10, igv: 1.8, total: 11.8 });

    // Simular delete error después de aplicar ambos límites de aislamiento:
    // cotización y tenant.
    mockClient.eq.mockImplementationOnce(() => ({
      eq: jest.fn().mockResolvedValue({ error: { message: 'delete failed' } }),
    }));

    await expect(
      service.update(
        'cot-1',
        { detalle: [{ producto_id: 'p1', cantidad: 1, precio_unitario: 10, descripcion: 'Item' }] } as any,
        tenantId,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
