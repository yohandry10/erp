import { Test, TestingModule } from '@nestjs/testing';
import { ContabilidadEventsListener } from './contabilidad-events.listener';
import { AsientosGeneratorService } from '../services/asientos-generator.service';
import { OutboxEventsService, OutboxEvent } from '../services/outbox-events.service';

describe('ContabilidadEventsListener', () => {
  let listener: ContabilidadEventsListener;
  let asientosGenerator: jest.Mocked<AsientosGeneratorService>;
  let outboxEventsService: jest.Mocked<OutboxEventsService>;

  beforeEach(async () => {
    const mockAsientosGenerator = {
      generarAsientoVenta: jest.fn(),
      generarAsientoCobro: jest.fn(),
      generarAsientoCompra: jest.fn(),
      generarAsientoPago: jest.fn(),
      generarAsientoAjusteInventario: jest.fn(),
      generarAsientoPlanilla: jest.fn(),
      generarAsientoDepreciacion: jest.fn(),
      marcarEventoComoFallido: jest.fn()
    };

    const mockOutboxEventsService = {
      leerEventosPendientesConReintentos: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContabilidadEventsListener,
        {
          provide: AsientosGeneratorService,
          useValue: mockAsientosGenerator
        },
        {
          provide: OutboxEventsService,
          useValue: mockOutboxEventsService
        }
      ]
    }).compile();

    listener = module.get<ContabilidadEventsListener>(ContabilidadEventsListener);
    asientosGenerator = module.get(AsientosGeneratorService);
    outboxEventsService = module.get(OutboxEventsService);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('procesarEventosPendientes', () => {
    it('should process pending events successfully', async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: '1',
          event_id: 'evt-001',
          correlation_id: 'corr-001',
          aggregate_type: 'venta',
          aggregate_id: 'venta-001',
          event_type: 'venta.procesada',
          event_data: {
            tenantId: 'tenant-001',
            fecha: '2025-01-15',
            total: 118,
            subtotal: 100,
            impuestos: 18,
            costo_ventas: 60,
            numeroTicket: 'T-001'
          },
          event_version: 1,
          created_at: '2025-01-15T10:00:00Z',
          processed_at: null,
          retry_count: 0,
          status: 'pending',
          error_message: null
        }
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(mockEventos);
      asientosGenerator.generarAsientoVenta.mockResolvedValue({
        id: 'asiento-001',
        tenant_id: 'tenant-001',
        numero_asiento: 'A-202501-0001',
        fecha: '2025-01-15',
        concepto: 'Venta de mercadería',
        total_debe: 118,
        total_haber: 118,
        estado: 'CONFIRMADO'
      });

      await listener.procesarEventosPendientes();

      expect(outboxEventsService.leerEventosPendientesConReintentos).toHaveBeenCalledWith(3, 50);
      expect(asientosGenerator.generarAsientoVenta).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-001',
          total: 118,
          event_id: 'evt-001'
        })
      );
    });

    it('should handle no pending events', async () => {
      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue([]);

      await listener.procesarEventosPendientes();

      expect(outboxEventsService.leerEventosPendientesConReintentos).toHaveBeenCalled();
      expect(asientosGenerator.generarAsientoVenta).not.toHaveBeenCalled();
    });

    it('should mark event as failed on error with retry message', async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: '1',
          event_id: 'evt-002',
          correlation_id: 'corr-002',
          aggregate_type: 'venta',
          aggregate_id: 'venta-002',
          event_type: 'venta.procesada',
          event_data: {
            tenantId: 'tenant-001',
            fecha: '2025-01-15',
            total: 118
          },
          event_version: 1,
          created_at: '2025-01-15T10:00:00Z',
          processed_at: null,
          retry_count: 0,
          status: 'pending',
          error_message: null
        }
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(mockEventos);
      asientosGenerator.generarAsientoVenta.mockRejectedValue(new Error('Test error'));

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.marcarEventoComoFallido).toHaveBeenCalledWith(
        'evt-002',
        'Test error - Se reintentará'
      );
    });

    it('should mark event as permanently failed after max retries', async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: '1',
          event_id: 'evt-007',
          correlation_id: 'corr-007',
          aggregate_type: 'venta',
          aggregate_id: 'venta-007',
          event_type: 'venta.procesada',
          event_data: {
            tenantId: 'tenant-001',
            fecha: '2025-01-15',
            total: 118
          },
          event_version: 1,
          created_at: '2025-01-15T10:00:00Z',
          processed_at: null,
          retry_count: 2, // Already retried twice
          status: 'pending',
          error_message: null
        }
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(mockEventos);
      asientosGenerator.generarAsientoVenta.mockRejectedValue(new Error('Test error'));

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.marcarEventoComoFallido).toHaveBeenCalledWith(
        'evt-007',
        'Test error - Máximo de reintentos alcanzado'
      );
    });

    it('should mark event as permanently failed for non-retryable errors', async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: '1',
          event_id: 'evt-008',
          correlation_id: 'corr-008',
          aggregate_type: 'venta',
          aggregate_id: 'venta-008',
          event_type: 'venta.procesada',
          event_data: {
            tenantId: 'tenant-001',
            fecha: '2025-01-15',
            total: 118
          },
          event_version: 1,
          created_at: '2025-01-15T10:00:00Z',
          processed_at: null,
          retry_count: 0,
          status: 'pending',
          error_message: null
        }
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(mockEventos);
      asientosGenerator.generarAsientoVenta.mockRejectedValue(new Error('Período contable cerrado'));

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.marcarEventoComoFallido).toHaveBeenCalledWith(
        'evt-008',
        'Período contable cerrado - Error no recuperable'
      );
    });
  });

  describe('event handlers', () => {
    it('should handle cobro registrado event', async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: '1',
          event_id: 'evt-003',
          correlation_id: 'corr-003',
          aggregate_type: 'cobro',
          aggregate_id: 'cobro-001',
          event_type: 'cobro.registrado',
          event_data: {
            tenantId: 'tenant-001',
            fecha: '2025-01-15',
            monto: 100,
            numeroDocumento: 'COB-001'
          },
          event_version: 1,
          created_at: '2025-01-15T10:00:00Z',
          processed_at: null,
          retry_count: 0,
          status: 'pending',
          error_message: null
        }
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(mockEventos);
      asientosGenerator.generarAsientoCobro.mockResolvedValue({
        id: 'asiento-002',
        tenant_id: 'tenant-001',
        numero_asiento: 'A-202501-0002',
        fecha: '2025-01-15',
        concepto: 'Cobro de factura',
        total_debe: 100,
        total_haber: 100,
        estado: 'CONFIRMADO'
      });

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoCobro).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-001',
          monto: 100,
          event_id: 'evt-003'
        })
      );
    });

    it('should handle recepcion registrada event', async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: '1',
          event_id: 'evt-004',
          correlation_id: 'corr-004',
          aggregate_type: 'recepcion',
          aggregate_id: 'recepcion-001',
          event_type: 'recepcion.registrada',
          event_data: {
            tenantId: 'tenant-001',
            fechaRecepcion: '2025-01-15',
            total: 118,
            subtotal: 100,
            igv: 18,
            numeroRecepcion: 'REC-001'
          },
          event_version: 1,
          created_at: '2025-01-15T10:00:00Z',
          processed_at: null,
          retry_count: 0,
          status: 'pending',
          error_message: null
        }
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(mockEventos);
      asientosGenerator.generarAsientoCompra.mockResolvedValue({
        id: 'asiento-003',
        tenant_id: 'tenant-001',
        numero_asiento: 'A-202501-0003',
        fecha: '2025-01-15',
        concepto: 'Compra de mercadería',
        total_debe: 118,
        total_haber: 118,
        estado: 'CONFIRMADO'
      });

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoCompra).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-001',
          total: 118,
          event_id: 'evt-004'
        })
      );
    });

    it('should handle pago proveedor event', async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: '1',
          event_id: 'evt-005',
          correlation_id: 'corr-005',
          aggregate_type: 'pago',
          aggregate_id: 'pago-001',
          event_type: 'pago.proveedor.registrado',
          event_data: {
            tenantId: 'tenant-001',
            fechaPago: '2025-01-15',
            monto: 100,
            numeroDocumento: 'PAG-001'
          },
          event_version: 1,
          created_at: '2025-01-15T10:00:00Z',
          processed_at: null,
          retry_count: 0,
          status: 'pending',
          error_message: null
        }
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(mockEventos);
      asientosGenerator.generarAsientoPago.mockResolvedValue({
        id: 'asiento-004',
        tenant_id: 'tenant-001',
        numero_asiento: 'A-202501-0004',
        fecha: '2025-01-15',
        concepto: 'Pago a proveedor',
        total_debe: 100,
        total_haber: 100,
        estado: 'CONFIRMADO'
      });

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoPago).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-001',
          monto: 100,
          event_id: 'evt-005'
        })
      );
    });

    it('should ignore unknown event types', async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: '1',
          event_id: 'evt-006',
          correlation_id: 'corr-006',
          aggregate_type: 'unknown',
          aggregate_id: 'unknown-001',
          event_type: 'unknown.event',
          event_data: {},
          event_version: 1,
          created_at: '2025-01-15T10:00:00Z',
          processed_at: null,
          retry_count: 0,
          status: 'pending',
          error_message: null
        }
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(mockEventos);

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoVenta).not.toHaveBeenCalled();
      expect(asientosGenerator.generarAsientoCobro).not.toHaveBeenCalled();
      expect(asientosGenerator.marcarEventoComoFallido).not.toHaveBeenCalled();
    });
  });
});
