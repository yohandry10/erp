import { BadRequestException } from '@nestjs/common';
import { RrhhCountryService } from './rrhh-country.service';

function createService(options: {
  empresa?: { pais?: string | null; moneda_defecto?: string | null } | null;
  tenant?: { pais?: string | null } | null;
  empresaError?: { code: string; message: string } | null;
  tenantError?: { code: string; message: string } | null;
}) {
  const maybeSingle = (result: unknown) => {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn().mockResolvedValue(result),
    };
    return query;
  };

  const empresaQuery = maybeSingle({
    data: options.empresa ?? null,
    error: options.empresaError ?? null,
  });
  const tenantQuery = maybeSingle({
    data: options.tenant ?? null,
    error: options.tenantError ?? null,
  });
  const client = {
    from: jest.fn((table: string) => {
      if (table === 'empresa_config') return empresaQuery;
      if (table === 'tenants') return tenantQuery;
      throw new Error(`Tabla inesperada: ${table}`);
    }),
  };
  const service = new RrhhCountryService({
    getClient: jest.fn(() => client),
  } as any);

  return { service, client };
}

describe('RrhhCountryService', () => {
  it.each([
    ['PE', 'PEN', 'es-PE', 'DNI'],
    ['AR', 'ARS', 'es-AR', 'CUIL'],
    ['CO', 'COP', 'es-CO', 'CC'],
  ] as const)(
    'resuelve %s con su moneda, locale y documento laboral',
    async (pais, moneda, locale, documentoLaboral) => {
      const { service } = createService({
        empresa: { pais: pais.toLowerCase(), moneda_defecto: moneda.toLowerCase() },
      });

      await expect(service.obtenerContexto(`tenant-${pais}`)).resolves.toEqual(
        expect.objectContaining({ codigo: pais, moneda, locale, documentoLaboral }),
      );
    },
  );

  it('usa el país del tenant cuando empresa_config aún no tiene país', async () => {
    const { service, client } = createService({
      empresa: { pais: null, moneda_defecto: null },
      tenant: { pais: 'CO' },
    });

    await expect(service.obtenerContexto('tenant-fallback')).resolves.toEqual(
      expect.objectContaining({ codigo: 'CO', moneda: 'COP' }),
    );
    expect(client.from).toHaveBeenCalledWith('tenants');
  });

  it('rechaza una moneda que no pertenece al país configurado', async () => {
    const { service } = createService({
      empresa: { pais: 'CO', moneda_defecto: 'PEN' },
    });

    await expect(service.obtenerContexto('tenant-incoherente')).rejects.toThrow(
      'La moneda PEN no corresponde al país CO; se esperaba COP',
    );
  });

  it('rechaza países sin motor normativo soportado', async () => {
    const { service } = createService({
      empresa: { pais: 'CL', moneda_defecto: 'CLP' },
    });

    await expect(service.obtenerContexto('tenant-no-soportado')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('exige tenant y no consulta la base', async () => {
    const { service, client } = createService({ empresa: null });

    await expect(service.obtenerContexto('')).rejects.toThrow(
      'Tenant requerido para resolver normativa de RRHH',
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  it('cachea por tenant y permite invalidar el contexto', async () => {
    const { service, client } = createService({
      empresa: { pais: 'AR', moneda_defecto: 'ARS' },
    });

    await service.obtenerContexto('tenant-cache');
    await service.obtenerContexto('tenant-cache');
    expect(client.from).toHaveBeenCalledTimes(1);

    service.invalidar('tenant-cache');
    await service.obtenerContexto('tenant-cache');
    expect(client.from).toHaveBeenCalledTimes(2);
  });
});
