import { CajasService } from './cajas.service';

describe('CajasService', () => {
  it('delega el arqueo y cierre completo a cerrar_caja_tx sin escrituras post-commit', async () => {
    const buildChain = (table: string): any => {
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        single: jest.fn(async () => {
          if (table === 'sesiones_caja') {
            return {
              data: {
                id: 'sesion-1',
                tenant_id: 'tenant-1',
                caja_id: 'caja-1',
                estado: 'ABIERTA',
                monto_esperado: 0,
                monto_inicial: 200,
                monto_inicio: 200,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }),
      };
      return chain;
    };

    const rpc = jest.fn(async () => ({
      data: {
        sesion_id: 'sesion-1',
        estado: 'CERRADA',
        monto_contado: 440.44,
        monto_esperado: 440.44,
        diferencia: 0,
        accounting_event_id: 'event-cierre-1',
        idempotent: false,
      },
      error: null,
    }));
    const supabase: any = {
      getClient: jest.fn(() => ({
        from: jest.fn((table: string) => buildChain(table)),
        rpc,
      })),
    };

    const cashReports = {
      registrarCorte: jest.fn(async () => undefined),
      registrarAsientoCierre: jest.fn(async () => undefined),
    };

    const service = new CajasService(
      supabase,
      {} as any,
      {} as any,
      {} as any,
      cashReports as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.cerrarCaja(
      'tenant-1',
      'caja-1',
      'sesion-1',
      { monto_contado: 440.44, monto_cierre: 440.44 },
      'user-1',
    );

    expect(rpc).toHaveBeenCalledWith('cerrar_caja_tx', {
      p_tenant_id: 'tenant-1',
      p_sesion_id: 'sesion-1',
      p_actor_id: 'user-1',
      p_payload: expect.objectContaining({
        monto_contado: 440.44,
        cierre_administrativo: false,
      }),
    });
    expect(cashReports.registrarCorte).not.toHaveBeenCalled();
    expect(cashReports.registrarAsientoCierre).not.toHaveBeenCalled();
  });

  it('delega el movimiento manual completo a la RPC 474 con clave y contrapartida', async () => {
    const existingMovement = {
      id: 'mov-existing',
      tenant_id: 'tenant-1',
      sesion_caja_id: 'sesion-1',
      referencia_tipo: 'MANUAL',
      referencia_documento: 'local-cash-movement-1',
      monto: 50,
    };
    const rpc = jest.fn(async () => ({
      data: { movimiento: existingMovement, idempotent: true },
      error: null,
    }));
    const supabase: any = {
      getClient: jest.fn(() => ({
        rpc,
      })),
    };
    const movementsService = {
      registrarMovimiento: jest.fn(),
    };
    const service = new CajasService(
      supabase,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      movementsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.registrarMovimientoManual(
      'tenant-1',
      'sesion-1',
      {
        tipo: 'INGRESO',
        monto: 50,
        motivo: 'Ajuste offline',
        cuenta_contrapartida_id: '0dd108d5-9815-48b5-b686-7a6d6f720247',
      },
      'user-1',
      'local-cash-movement-1',
    );

    expect(result).toEqual(existingMovement);
    expect(movementsService.registrarMovimiento).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('registrar_movimiento_manual_caja_tx', {
      p_tenant_id: 'tenant-1',
      p_session_id: 'sesion-1',
      p_payload: expect.objectContaining({
        tipo: 'INGRESO',
        cuenta_contrapartida_id: '0dd108d5-9815-48b5-b686-7a6d6f720247',
      }),
      p_actor_id: 'user-1',
      p_idempotency_key: 'local-cash-movement-1',
    });
  });
});
