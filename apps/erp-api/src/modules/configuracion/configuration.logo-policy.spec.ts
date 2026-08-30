import { BadRequestException } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';

describe('ConfigurationService - política de logo', () => {
  function createService() {
    const client = { rpc: jest.fn().mockResolvedValue({ data: {}, error: null }) };
    const supabase = { getClient: () => client };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'SUPABASE_URL') {
          return 'https://wypnbcptofqdmoynlonq.supabase.co';
        }
        if (key === 'CERT_ENCRYPTION_KEY') {
          return 'clave-sintetica-logo-policy-32-bytes';
        }
        return undefined;
      }),
    };
    return {
      service: new ConfigurationService(supabase as any, {} as any, config as any),
      client,
    };
  }

  it('completeWizard rechaza logo base64 antes de tocar el writer', async () => {
    const { service, client } = createService();
    await expect(service.completeWizard(
      '11111111-1111-4111-8111-111111111111',
      { logoBase64: 'data:image/png;base64,AAAA' },
      'actor-1',
      'wizard-complete-key',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('completeWizard rechaza también una URL, aunque tenga forma canónica', async () => {
    const { service, client } = createService();
    await expect(service.completeWizard(
      '11111111-1111-4111-8111-111111111111',
      {
        logoUrl: 'https://wypnbcptofqdmoynlonq.supabase.co/storage/v1/object/public/company-assets/11111111-1111-4111-8111-111111111111/logos/22222222-2222-4222-8222-222222222222.png',
      },
      'actor-1',
      'wizard-complete-key',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('completeWizard sin logo preserva el actual al omitir logo_url del writer', async () => {
    const { service, client } = createService();
    await service.completeWizard(
      '11111111-1111-4111-8111-111111111111',
      {
        pais: 'PE',
        pais_id: 1,
        ruc: '20123456789',
        razonSocial: 'Empresa Demo S.A.C.',
        direccion: 'Av. Demo 123',
      },
      'actor-1',
      'wizard-complete-key',
    );

    const writerCall = client.rpc.mock.calls.find(
      ([name]) => name === 'completar_wizard_config_tx',
    );
    expect(writerCall).toBeDefined();
    expect(writerCall?.[1].p_patch).not.toHaveProperty('logo_url');
  });

  it('preserva IVA cero para un emisor ARCA monotributista', async () => {
    const { service, client } = createService();
    await service.completeWizard(
      '11111111-1111-4111-8111-111111111111',
      {
        pais: 'AR',
        pais_id: 2,
        ruc: '30710158229',
        razonSocial: 'Emisor Monotributo S.R.L.',
        direccion: 'Av. Corrientes 1234',
        arca_condicion_iva: 'MONOTRIBUTO',
        igv_porcentaje: 0,
      },
      'actor-1',
      'wizard-complete-ar-monotributo',
    );

    const writerCall = client.rpc.mock.calls.find(
      ([name]) => name === 'completar_wizard_config_tx',
    );
    expect(writerCall?.[1].p_patch).toMatchObject({
      pais: 'AR',
      arca_condicion_iva: 'MONOTRIBUTO',
      igv_porcentaje: 0,
    });
  });

  it('el progreso temporal no persiste logo binario ni URL arbitraria', () => {
    const { service } = createService();
    const sanitized = (service as any).sanitizeWizardTemporaryConfig({
      razonSocial: 'Empresa',
      logoBase64: 'data:image/png;base64,AAAA',
      logoFile: { name: 'logo.png' },
      logoUrl: 'https://attacker.invalid/logo.png',
      logo_url: 'https://attacker.invalid/legacy-logo.png',
    });
    expect(sanitized).toEqual({ razonSocial: 'Empresa' });
  });
});
