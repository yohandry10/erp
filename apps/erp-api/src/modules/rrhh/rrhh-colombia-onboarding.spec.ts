import { BadRequestException } from '@nestjs/common';
import { RrhhService } from './rrhh.service';

function makeClient(config: any, empresa: any) {
  const updates: any[] = [];
  const from = jest.fn((table: string) => {
    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      maybeSingle: jest.fn().mockResolvedValue({
        data: table === 'empresa_config' ? empresa : config,
        error: null,
      }),
      update: jest.fn((payload: any) => {
        updates.push({ table, payload });
        return builder;
      }),
      then: (resolve: any) => resolve({ data: null, error: null }),
    };
    return builder;
  });
  return { client: { from }, updates };
}

describe('RrhhService - onboarding PILA Colombia', () => {
  const baseConfig = {
    operador_pila: 'SOI',
    pila_integracion_modo: 'ARCHIVO_OPERADOR',
    eps_default: 'EPS001',
    fondo_pension_default: 'COLPENSIONES',
    arl_default: 'ARL001',
    caja_compensacion_default: 'CCF001',
  };

  it('en demo prueba el fixture sin transmitir externamente', async () => {
    const { client, updates } = makeClient(baseConfig, { is_demo: true });
    const service = new RrhhService(
      { getClient: () => client } as any,
      undefined,
      { obtenerContexto: async () => ({ codigo: 'CO' }) } as any,
    );

    await expect(service.probarIntegracionPilaColombia('tenant-co')).resolves.toEqual(expect.objectContaining({
      success: true,
      mode: 'SIMULATED_DEMO',
      transmitted: false,
    }));
    expect(updates.some((item) => item.payload.pila_ultima_prueba_estado === 'SIMULADA')).toBe(true);
  });

  it('reconoce el flujo real por archivo del operador sin fingir una API', async () => {
    const { client } = makeClient(baseConfig, { is_demo: false });
    const service = new RrhhService(
      { getClient: () => client } as any,
      undefined,
      { obtenerContexto: async () => ({ codigo: 'CO' }) } as any,
    );

    await expect(service.probarIntegracionPilaColombia('tenant-co')).resolves.toEqual(expect.objectContaining({
      success: true,
      mode: 'ARCHIVO_OPERADOR',
      transmitted: false,
    }));
  });

  it('bloquea endpoints privados en una integración API del operador', () => {
    const service = new RrhhService({} as any);
    expect(() => (service as any).assertSafeProviderUrl('http://127.0.0.1:3000/health'))
      .toThrow(BadRequestException);
    expect(() => (service as any).assertSafeProviderUrl('https://192.168.1.10/health'))
      .toThrow(BadRequestException);
    expect((service as any).assertSafeProviderUrl('https://api.operador.example/health'))
      .toBe('https://api.operador.example/health');
  });
});
