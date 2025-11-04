import { Test, TestingModule } from '@nestjs/testing';
import { AccountingEntriesService } from './accounting-entries.service';
import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService } from '../events/event-bus.service';
import { PeriodosService, EstadoPeriodo } from '../../modules/contabilidad/services/periodos.service';
import { BadRequestException } from '@nestjs/common';

describe('AccountingEntriesService - Period Validation', () => {
  let service: AccountingEntriesService;
  let periodosService: PeriodosService;
  let supabaseService: SupabaseService;

  const mockSupabaseService = {
    getClient: jest.fn(() => ({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              user_metadata: {
                tenant_id: 'test-tenant-id'
              }
            }
          }
        })
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        insert: jest.fn().mockReturnThis()
      }))
    }))
  };

  const mockEventBusService = {
    onVentaProcessed: jest.fn(),
    onCompraEntregada: jest.fn(),
    onMovimientoStock: jest.fn(),
    onGastoRegistrado: jest.fn(),
    onPagoFactura: jest.fn()
  };

  const mockPeriodosService = {
    validarPeriodoAbierto: jest.fn(),
    obtenerPeriodo: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingEntriesService,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService
        },
        {
          provide: EventBusService,
          useValue: mockEventBusService
        },
        {
          provide: PeriodosService,
          useValue: mockPeriodosService
        }
      ],
    }).compile();

    service = module.get<AccountingEntriesService>(AccountingEntriesService);
    periodosService = module.get<PeriodosService>(PeriodosService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('guardarAsientoContable with closed period', () => {
    it('should throw error when trying to create asiento in closed period', async () => {
      // Arrange
      const fechaCerrada = new Date('2024-01-15');
      mockPeriodosService.validarPeriodoAbierto.mockRejectedValue(
        new BadRequestException('El período contable 2024-01 está CERRADO. No se pueden registrar movimientos en períodos cerrados.')
      );

      const asiento = {
        fecha: fechaCerrada.toISOString().split('T')[0],
        concepto: 'Test asiento',
        referencia: 'TEST-001',
        detalles: [
          {
            cuentaId: 'cuenta-1',
            cuentaCodigo: '101',
            cuentaNombre: 'Caja',
            debe: 100,
            haber: 0,
            descripcion: 'Test debe'
          },
          {
            cuentaId: 'cuenta-2',
            cuentaCodigo: '701',
            cuentaNombre: 'Ventas',
            debe: 0,
            haber: 100,
            descripcion: 'Test haber'
          }
        ]
      };

      // Act & Assert
      await expect(
        (service as any).guardarAsientoContable(asiento)
      ).rejects.toThrow('El período contable 2024-01 está CERRADO');

      // Verify that validarPeriodoAbierto was called
      expect(mockPeriodosService.validarPeriodoAbierto).toHaveBeenCalledWith(
        'test-tenant-id',
        expect.any(Date)
      );
    });

    it('should allow creating asiento in open period', async () => {
      // Arrange
      const fechaAbierta = new Date('2024-02-15');
      mockPeriodosService.validarPeriodoAbierto.mockResolvedValue(undefined);

      // Mock successful asiento creation
      const mockAsientoId = 'asiento-123';
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { numero_asiento: 100 },
          error: null
        }),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { numero_asiento: 100 },
          error: null
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: mockAsientoId },
              error: null
            })
          })
        })
      });

      mockSupabaseService.getClient = jest.fn(() => ({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: {
              user: {
                user_metadata: {
                  tenant_id: 'test-tenant-id'
                }
              }
            }
          })
        },
        from: mockFrom
      }));

      const asiento = {
        fecha: fechaAbierta.toISOString().split('T')[0],
        concepto: 'Test asiento',
        referencia: 'TEST-002',
        detalles: [
          {
            cuentaId: 'cuenta-1',
            cuentaCodigo: '101',
            cuentaNombre: 'Caja',
            debe: 100,
            haber: 0,
            descripcion: 'Test debe'
          },
          {
            cuentaId: 'cuenta-2',
            cuentaCodigo: '701',
            cuentaNombre: 'Ventas',
            debe: 0,
            haber: 100,
            descripcion: 'Test haber'
          }
        ]
      };

      // Act
      const result = await (service as any).guardarAsientoContable(asiento);

      // Assert
      expect(result).toBe(mockAsientoId);
      expect(mockPeriodosService.validarPeriodoAbierto).toHaveBeenCalledWith(
        'test-tenant-id',
        expect.any(Date)
      );
    });

    it('should throw error when trying to create asiento in blocked period', async () => {
      // Arrange
      const fechaBloqueada = new Date('2024-03-15');
      mockPeriodosService.validarPeriodoAbierto.mockRejectedValue(
        new BadRequestException('El período contable 2024-03 está BLOQUEADO. No se pueden registrar movimientos en períodos bloqueados.')
      );

      const asiento = {
        fecha: fechaBloqueada.toISOString().split('T')[0],
        concepto: 'Test asiento',
        referencia: 'TEST-003',
        detalles: [
          {
            cuentaId: 'cuenta-1',
            cuentaCodigo: '101',
            cuentaNombre: 'Caja',
            debe: 100,
            haber: 0,
            descripcion: 'Test debe'
          },
          {
            cuentaId: 'cuenta-2',
            cuentaCodigo: '701',
            cuentaNombre: 'Ventas',
            debe: 0,
            haber: 100,
            descripcion: 'Test haber'
          }
        ]
      };

      // Act & Assert
      await expect(
        (service as any).guardarAsientoContable(asiento)
      ).rejects.toThrow('El período contable 2024-03 está BLOQUEADO');

      // Verify that validarPeriodoAbierto was called
      expect(mockPeriodosService.validarPeriodoAbierto).toHaveBeenCalledWith(
        'test-tenant-id',
        expect.any(Date)
      );
    });

    it('should return existing asiento when sourceEventId already processed', async () => {
      const existingAsientoId = 'asiento-existing-001';

      mockPeriodosService.validarPeriodoAbierto.mockResolvedValue(undefined);

      const selectMock = jest.fn().mockReturnThis();
      const eqMock = jest.fn().mockReturnThis();
      const maybeSingleMock = jest.fn().mockResolvedValue({
        data: { id: existingAsientoId },
        error: null,
      });

      const mockFrom = jest.fn().mockReturnValueOnce({
        select: selectMock,
        eq: eqMock,
        maybeSingle: maybeSingleMock,
      });

      mockSupabaseService.getClient = jest.fn(() => ({
        from: mockFrom,
      }));

      const asiento = {
        fecha: new Date().toISOString().split('T')[0],
        concepto: 'Asiento idempotente',
        referencia: 'EVENT-001',
        sourceEventId: 'event-001',
        detalles: [
          {
            cuentaId: 'cuenta-1',
            cuentaCodigo: '101',
            cuentaNombre: 'Caja',
            debe: 50,
            haber: 0,
            descripcion: 'Debe',
          },
          {
            cuentaId: 'cuenta-2',
            cuentaCodigo: '701',
            cuentaNombre: 'Ventas',
            debe: 0,
            haber: 50,
            descripcion: 'Haber',
          },
        ],
      };

      const result = await (service as any).guardarAsientoContable(asiento);

      expect(result).toBe(existingAsientoId);
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(maybeSingleMock).toHaveBeenCalledTimes(1);
    });
  });
});
