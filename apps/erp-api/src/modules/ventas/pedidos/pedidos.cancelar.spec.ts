import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PedidosService } from './pedidos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { CPEIntegrationService } from './cpe-integration.service';
import { GREIntegrationService } from './gre-integration.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { DocumentosService } from '../../documentos.service';

type SupabaseResponse<T> = { data: T; error: any };

type TableResponses = Partial<{
  limit: SupabaseResponse<any[]>[];
  insert: SupabaseResponse<any>[];
  update: SupabaseResponse<any>[];
  delete: SupabaseResponse<any>[];
}>;

class MockQueryBuilder {
  private mode: 'insert' | 'update' | 'delete' | 'select' = 'select';

  constructor(
    private readonly table: string,
    private readonly responses: TableResponses,
    private readonly spies: {
      insert?: jest.Mock;
      update?: jest.Mock;
      delete?: jest.Mock;
      select?: jest.Mock;
      eq?: jest.Mock;
    },
  ) {}

  select(_columns?: string) {
    this.mode = 'select';
    this.spies.select?.(this.table);
    return this;
  }

  eq(_column: string, _value: any) {
    this.spies.eq?.(this.table, _column, _value);
    return this;
  }

  limit(_count: number) {
    const next = this.responses.limit?.shift() ?? { data: [], error: null };
    return Promise.resolve(next);
  }

  insert(payload: any) {
    this.mode = 'insert';
    this.spies.insert?.(this.table, payload);
    return this;
  }

  update(payload: any) {
    this.mode = 'update';
    this.spies.update?.(this.table, payload);
    return this;
  }

  delete() {
    this.mode = 'delete';
    this.spies.delete?.(this.table);
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const response = this.consumeResponse();
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }

  private consumeResponse() {
    if (this.mode === 'insert') {
      return this.responses.insert?.shift() ?? { data: null, error: null };
    }
    if (this.mode === 'update') {
      return this.responses.update?.shift() ?? { data: null, error: null };
    }
    if (this.mode === 'delete') {
      return this.responses.delete?.shift() ?? { data: null, error: null };
    }
    return { data: null, error: null };
  }
}

function createMockSupabaseClient(responsesByTable: Record<string, TableResponses>) {
  const spies = {
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
  };

  const client = {
    from: jest.fn((table: string) => {
      const tableResponses = responsesByTable[table] ?? {};
      return new MockQueryBuilder(table, tableResponses, spies);
    }),
    rpc: jest.fn(),
    __spies: spies,
  };

  return client;
}

describe('PedidosService (cancelación)', () => {
  let service: PedidosService;
  let mockSupabaseClient: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    mockSupabaseClient = createMockSupabaseClient({
      movimientos_inventario: {
        limit: [{ data: [], error: null }, { data: [{ id: 'mov-1' }], error: null }],
        insert: [{ data: { id: 'mov-1' }, error: null }],
      },
      pedidos_venta_detalle: {
        update: [{ data: null, error: null }, { data: null, error: null }],
      },
      pedido_backorders: {
        delete: [{ data: null, error: null }, { data: null, error: null }],
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PedidosService,
        {
          provide: SupabaseService,
          useValue: { getClient: jest.fn().mockReturnValue(mockSupabaseClient) },
        },
        { provide: NotificationsService, useValue: { createNotification: jest.fn() } },
        { provide: AuditService, useValue: { logAction: jest.fn() } },
        { provide: CPEIntegrationService, useValue: {} },
        { provide: GREIntegrationService, useValue: {} },
        { provide: EventBusService, useValue: {} },
        { provide: DocumentosService, useValue: {} },
        { provide: TaxCalculatorService, useValue: {} },
        { provide: TenantContextService, useValue: {} },
      ],
    }).compile();

    service = module.get<PedidosService>(PedidosService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe ser idempotente liberando reserva si falla updateEstado y se reintenta', async () => {
    jest.spyOn(service as any, 'findOne').mockResolvedValue({
      id: 'pedido-1',
      numero: 'PV-0001',
      estado: 'CONFIRMADO',
      observaciones: null,
      detalle: [
        {
          id: 'det-1',
          producto_id: 'prod-1',
          cantidad: 2,
        },
      ],
    });

    const updateEstadoSpy = jest
      .spyOn(service as any, 'updateEstado')
      .mockRejectedValueOnce(new Error('db error'))
      .mockResolvedValueOnce(undefined);

    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null });

    await expect(service.cancelarPedido('pedido-1', 'tenant-1', 'motivo')).rejects.toBeInstanceOf(Error);
    await expect(service.cancelarPedido('pedido-1', 'tenant-1', 'motivo')).resolves.toEqual({ success: true });

    expect(updateEstadoSpy).toHaveBeenCalledTimes(2);
    expect(mockSupabaseClient.__spies.insert).not.toHaveBeenCalled();
    expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(2);
    expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(1, 'liberar_reservas_pedido_tx', expect.any(Object));
    expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(2, 'liberar_reservas_pedido_tx', expect.any(Object));
  });

  it('bloquea cancelar pedidos facturados', async () => {
    jest.spyOn(service as any, 'findOne').mockResolvedValue({
      id: 'pedido-1',
      numero: 'PV-0001',
      estado: 'FACTURADO',
      detalle: [],
    });

    await expect(service.cancelarPedido('pedido-1', 'tenant-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
