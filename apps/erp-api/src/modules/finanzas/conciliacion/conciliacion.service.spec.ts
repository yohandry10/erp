import { BadRequestException } from '@nestjs/common';
import { ConciliacionService } from './conciliacion.service';

describe('ConciliacionService - contrato atómico 457', () => {
  const rpc = jest.fn();
  const parsearExtractoBancario = jest.fn();
  const supabase = { getClient: () => ({ rpc }) } as any;
  const csvParser = {
    parsearExtractoBancario,
    listarPlantillas: jest.fn(() => []),
    registrarPlantilla: jest.fn(),
  } as any;
  let service: ConciliacionService;

  beforeEach(() => {
    jest.clearAllMocks();
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    service = new ConciliacionService(supabase, csvParser);
  });

  it('rechaza toda escritura sin actor autenticado', async () => {
    await expect(service.crearConciliacionAtomica('tenant', {
      cuenta_bancaria_id: '11111111-1111-4111-8111-111111111111',
      periodo: '2026-08',
      fecha_desde: '2026-08-01',
      fecha_hasta: '2026-08-31',
      idempotency_key: 'recon-create-1',
    })).rejects.toThrow('El actor autenticado es obligatorio');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('envía create con tenant, actor, payload y clave separados', async () => {
    const dto = {
      cuenta_bancaria_id: '11111111-1111-4111-8111-111111111111',
      periodo: '2026-08',
      fecha_desde: '2026-08-01',
      fecha_hasta: '2026-08-31',
      idempotency_key: 'recon-create-1',
    };
    await service.crearConciliacionAtomica('tenant', dto, 'actor');
    expect(rpc).toHaveBeenCalledWith('crear_conciliacion_bancaria_tx', {
      p_tenant_id: 'tenant',
      p_payload: {
        cuenta_bancaria_id: dto.cuenta_bancaria_id,
        periodo: dto.periodo,
        fecha_desde: dto.fecha_desde,
        fecha_hasta: dto.fecha_hasta,
      },
      p_actor_id: 'actor',
      p_idempotency_key: dto.idempotency_key,
    });
  });

  it('no llama la base si una sola fila CSV es inválida', async () => {
    parsearExtractoBancario.mockReturnValue({ movimientos: [], errores: ['fila 2'] });
    await expect(service.importarCsvAtomico('tenant', 'recon', {
      contenidoCsv: 'invalido',
      banco: 'GENERICO',
      saldo_banco_inicial: 100,
      saldo_banco_final: 100,
      idempotency_key: 'statement-import-1',
    }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('parsea CSV en TS y entrega el lote completo a una sola RPC', async () => {
    const movimientos = [
      { fecha: '2026-08-03', tipo: 'CARGO', monto: 10, descripcion: 'Comisión' },
    ];
    parsearExtractoBancario.mockReturnValue({ movimientos, errores: [] });
    await service.importarCsvAtomico('tenant', 'recon', {
      contenidoCsv: 'Fecha,Tipo,Monto',
      banco: 'BCP',
      saldo_banco_inicial: 100,
      saldo_banco_final: 90,
      idempotency_key: 'statement-import-1',
    }, 'actor');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('importar_extracto_bancario_tx', {
      p_tenant_id: 'tenant',
      p_conciliacion_id: 'recon',
      p_payload: {
        banco: 'BCP',
        saldo_banco_inicial: 100,
        saldo_banco_final: 90,
        movimientos,
      },
      p_actor_id: 'actor',
      p_idempotency_key: 'statement-import-1',
    });
  });

  it('usa exclusivamente las RPCs manual, lote, auto y cierre 457', async () => {
    await service.marcarItemAtomico('tenant', 'recon', {
      movimiento_sistema_id: '11111111-1111-4111-8111-111111111111',
      movimiento_extracto_id: '22222222-2222-4222-8222-222222222222',
      idempotency_key: 'manual-match-1',
    }, 'actor');
    await service.marcarLoteAtomico('tenant', 'recon', {
      pares: [{
        movimiento_sistema_id: '11111111-1111-4111-8111-111111111111',
        movimiento_extracto_id: '22222222-2222-4222-8222-222222222222',
      }],
      idempotency_key: 'batch-match-1',
    }, 'actor');
    await service.matchAutomaticoAtomico('tenant', 'recon', {
      tolerancia_dias: 2,
      idempotency_key: 'auto-match-1',
    }, 'actor');
    await service.cerrarConciliacionAtomica('tenant', 'recon', {
      idempotency_key: 'close-recon-1',
    }, 'actor');

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'conciliar_movimiento_bancario_v2_tx',
      'conciliar_lote_bancario_tx',
      'conciliar_automaticamente_bancario_tx',
      'cerrar_conciliacion_bancaria_tx',
    ]);
    expect((service as any).conciliarMovimientosViaRpcIfAvailable).toBeUndefined();
  });

  it('falla cerrado si Supabase no encuentra o rechaza la RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'RPC unavailable' } });
    await expect(service.cerrarConciliacionAtomica('tenant', 'recon', {
      idempotency_key: 'close-recon-1',
    }, 'actor')).rejects.toThrow('RPC unavailable');
  });
});
