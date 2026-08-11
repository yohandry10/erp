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

  it('delega toda la cancelación y el retorno físico a una sola RPC 467', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({
      data: {
        pedido_id: 'pedido-1',
        numero: 'PV-0001',
        estado: 'CANCELADO',
        event_id: 'event-1',
        movimientos_retorno: [{ reverse_movement_id: 'mov-reverse-1' }],
        idempotent: false,
      },
      error: null,
    });

    await expect(
      service.cancelarPedido(
        'pedido-1',
        'tenant-1',
        'Mercadería retornada',
        'user-1',
        'cancel-key-1',
        true,
      ),
    ).resolves.toEqual(expect.objectContaining({
      success: true,
      estado: 'CANCELADO',
      event_id: 'event-1',
      movimientos_retorno: [{ reverse_movement_id: 'mov-reverse-1' }],
    }));

    expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(1);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('cancelar_pedido_venta_tx', {
      p_pedido_id: 'pedido-1',
      p_tenant_id: 'tenant-1',
      p_actor_id: 'user-1',
      p_motivo: 'Mercadería retornada',
      p_idempotency_key: 'cancel-key-1',
      p_confirmar_retorno_fisico: true,
    });
    expect(mockSupabaseClient.from).not.toHaveBeenCalled();
  });

  it('expone como requisito de dominio el retorno físico antes de cancelar', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({
      data: null,
      error: { message: 'ORDER_CANCELLATION_REQUIRES_PHYSICAL_RETURN' },
    });

    await expect(
      service.cancelarPedido(
        'pedido-1', 'tenant-1', 'Cancelación logística',
        'user-1', 'cancel-key-2', false,
      ),
    ).rejects.toThrow('devolución física');
  });

  it('exige actor, motivo e idempotency key antes de invocar la base', async () => {
    await expect(
      service.cancelarPedido('pedido-1', 'tenant-1', 'motivo', undefined, 'cancel-key'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.cancelarPedido('pedido-1', 'tenant-1', 'x', 'user-1', 'cancel-key'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.cancelarPedido('pedido-1', 'tenant-1', 'motivo', 'user-1', 'short'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
  });
});
