import { BadRequestException } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';

describe('ConfigurationService - invariante IVA del emisor argentino', () => {
  function createService(currentConfig: Record<string, unknown> = {}) {
    const rpc = jest.fn().mockResolvedValue({ data: { configuracion: {} }, error: null });
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          pais: 'AR',
          pais_id: 5,
          arca_condicion_iva: 'RESPONSABLE_INSCRIPTO',
          igv_porcentaje: 21,
          ...currentConfig,
        },
        error: null,
      }),
    };
    const client = { rpc, from: jest.fn(() => query) };
    const service = new ConfigurationService(
      { getClient: () => client } as any,
      {} as any,
      {
        get: jest.fn((key: string) => key === 'CERT_ENCRYPTION_KEY'
          ? 'clave-sintetica-argentina-vat-32-bytes'
          : undefined),
      } as any,
    );
    return { service, client, rpc };
  }

  const wizardBase = {
    pais: 'AR',
    pais_id: 5,
    ruc: '30710158229',
    razonSocial: 'Empresa Argentina S.A.',
    direccion: 'Av. Corrientes 1234',
  };

  it.each(['MONOTRIBUTO', 'EXENTO'])(
    'rechaza wizard manipulado %s + IVA 21 antes del writer',
    async (arcaCondicionIva) => {
      const { service, rpc } = createService();

      await expect(service.completeWizard(
        '11111111-1111-4111-8111-111111111111',
        {
          ...wizardBase,
          arca_condicion_iva: arcaCondicionIva,
          igv_porcentaje: 21,
        },
        'actor-1',
        `wizard-ar-${arcaCondicionIva.toLowerCase()}`,
      )).rejects.toBeInstanceOf(BadRequestException);

      expect(rpc).not.toHaveBeenCalledWith(
        'completar_wizard_config_tx',
        expect.anything(),
      );
    },
  );

  it('acepta wizard de responsable inscripto con IVA 21', async () => {
    const { service, rpc } = createService();

    await service.completeWizard(
      '11111111-1111-4111-8111-111111111111',
      {
        ...wizardBase,
        arca_condicion_iva: 'RESPONSABLE_INSCRIPTO',
        igv_porcentaje: 21,
      },
      'actor-1',
      'wizard-ar-responsable-inscripto',
    );

    expect(rpc).toHaveBeenCalledWith(
      'completar_wizard_config_tx',
      expect.objectContaining({
        p_patch: expect.objectContaining({
          arca_condicion_iva: 'RESPONSABLE_INSCRIPTO',
          igv_porcentaje: 21,
        }),
      }),
    );
  });

  it.each(['MONOTRIBUTO', 'EXENTO'])(
    'rechaza PUT atómico que intenta subir IVA a 21 para un %s existente',
    async (arcaCondicionIva) => {
      const { service, rpc } = createService({
        arca_condicion_iva: arcaCondicionIva,
        igv_porcentaje: 0,
      });

      await expect(service.updateEmpresaPatchAtomic(
        '11111111-1111-4111-8111-111111111111',
        { igv_porcentaje: 21 },
        'actor-1',
        `update-ar-${arcaCondicionIva.toLowerCase()}`,
        'PARAMETROS',
      )).rejects.toBeInstanceOf(BadRequestException);

      expect(rpc).not.toHaveBeenCalledWith(
        'actualizar_empresa_config_tx',
        expect.anything(),
      );
    },
  );

  it.each(['MONOTRIBUTO', 'EXENTO'])(
    'rechaza PUT atómico manipulado con condición %s e IVA 21 en el mismo payload',
    async (arcaCondicionIva) => {
      const { service, rpc } = createService();

      await expect(service.updateEmpresaPatchAtomic(
        '11111111-1111-4111-8111-111111111111',
        {
          pais: 'AR',
          pais_id: 5,
          arca_condicion_iva: arcaCondicionIva,
          igv_porcentaje: 21,
        },
        'actor-1',
        `update-ar-payload-${arcaCondicionIva.toLowerCase()}`,
        'EMPRESA',
      )).rejects.toBeInstanceOf(BadRequestException);

      expect(rpc).not.toHaveBeenCalledWith(
        'actualizar_empresa_config_tx',
        expect.anything(),
      );
    },
  );

  it('acepta PUT atómico de responsable inscripto con IVA 21', async () => {
    const { service, rpc } = createService();

    await service.updateEmpresaPatchAtomic(
      '11111111-1111-4111-8111-111111111111',
      {
        pais: 'AR',
        pais_id: 5,
        arca_condicion_iva: 'RESPONSABLE_INSCRIPTO',
        igv_porcentaje: 21,
      },
      'actor-1',
      'update-ar-responsable-inscripto',
      'PARAMETROS',
    );

    expect(rpc).toHaveBeenCalledWith(
      'actualizar_empresa_config_tx',
      expect.objectContaining({
        p_patch: {
          pais: 'AR',
          pais_id: 5,
          arca_condicion_iva: 'RESPONSABLE_INSCRIPTO',
          igv_porcentaje: 21,
        },
      }),
    );
  });
});
