import { CpeDeliveryService } from './cpe-delivery.service';

jest.mock('./sunat-qr.util', () => ({
  buildSunatQrContent: jest.fn(() => 'qr-demo'),
  buildSunatQrDataUrl: jest.fn(async () => 'data:image/png;base64,AA=='),
}));

describe('CpeDeliveryService - datos de la vista A4', () => {
  it('entrega el emisor del mismo tenant junto al CPE', async () => {
    const cpeChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'cpe-a4',
          tenant_id: 'tenant-a4',
          tipo_documento: '01',
          serie: 'F001',
          numero: 1,
          ruc_emisor: '20600000021',
        },
        error: null,
      }),
    };
    const configChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          ruc: '20600000021',
          razon_social: 'Comercial Andina Demo S.A.C.',
          direccion_fiscal: 'Av. Emisor 456, Lima',
          telefono: '01 555 0101',
          email: 'ventas@demo.invalid',
          logo_url: null,
        },
        error: null,
      }),
    };
    const client = {
      from: jest.fn((table: string) => table === 'cpe' ? cpeChain : configChain),
    };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getCpeById('cpe-a4', 'tenant-a4')).resolves.toMatchObject({
      id: 'cpe-a4',
      emisor: {
        ruc: '20600000021',
        razon_social: 'Comercial Andina Demo S.A.C.',
        direccion_fiscal: 'Av. Emisor 456, Lima',
      },
    });
    expect(cpeChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a4');
    expect(configChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a4');
    expect(configChain.select).toHaveBeenCalledWith(
      'logo_url,ruc,razon_social,direccion_fiscal,telefono,email',
    );
  });
});
