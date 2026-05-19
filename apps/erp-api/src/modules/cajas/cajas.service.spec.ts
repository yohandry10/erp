import { CajasService } from './cajas.service';

describe('CajasService', () => {
  it('calcula el monto esperado de cierre desde el ultimo movimiento cuando la sesion no lo trae', async () => {
    const updates: any[] = [];

    const buildChain = (table: string): any => {
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        update: jest.fn((rows: any) => {
          updates.push({ table, rows });
          return chain;
        }),
        single: jest.fn(async () => {
          if (table === 'sesiones_caja' && updates.length === 0) {
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

          return {
            data: {
              id: 'sesion-1',
              estado: 'CERRADA',
              monto_contado: 440.44,
              monto_esperado: 440.44,
              diferencia: 0,
            },
            error: null,
          };
        }),
        maybeSingle: jest.fn(async () => {
          if (table === 'movimientos_caja') {
            return { data: { saldo_nuevo: 440.44 }, error: null };
          }
          return { data: null, error: null };
        }),
      };
      return chain;
    };

    const supabase: any = {
      getClient: jest.fn(() => ({
        from: jest.fn((table: string) => buildChain(table)),
      })),
    };

    const service = new CajasService(
      supabase,
      {} as any,
      {} as any,
      {} as any,
      { registrarCorte: jest.fn(async () => undefined), registrarAsientoCierre: jest.fn(async () => undefined) } as any,
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

    expect(updates).toContainEqual(
      expect.objectContaining({
        table: 'sesiones_caja',
        rows: expect.objectContaining({
          monto_esperado: 440.44,
          monto_contado: 440.44,
          diferencia: 0,
        }),
      }),
    );
  });
});
