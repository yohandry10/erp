import { BadRequestException } from '@nestjs/common';
import { TipoDocumento } from '@erp-suite/dtos';
import { CPEIntegrationService } from './cpe-integration.service';

describe('CPEIntegrationService documento de cliente', () => {
  const buildService = () => {
    const service = new CPEIntegrationService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { getTasaIgv: jest.fn().mockResolvedValue(0.18) } as any,
    );

    jest.spyOn(service as any, 'obtenerSerieYNumero').mockImplementation(
      async (_tenantId: string, tipoDocumento: TipoDocumento) => ({
        serie: tipoDocumento === TipoDocumento.BOLETA ? 'B001' : 'F001',
        numero: 151,
      }),
    );

    return service;
  };

  const pedido = {
    id: 'pedido-ruc-text',
    tenant_id: 'tenant-ruc-text',
    cliente_id: 'cliente-ruc-text',
    subtotal: 80,
    igv: 14.4,
    total: 94.4,
    detalle: [
      {
        producto_id: '58184a08-1dca-4c90-9fc8-4a1222b0fb85',
        cantidad: 1,
        precio_unitario: 80,
        subtotal: 80,
        descripcion: 'Producto con RUC textual',
      },
    ],
  } as any;

  const empresaConfig = {
    ruc: '20987654321',
    razon_social: 'Mi Empresa SAC',
  };

  it('usa el RUC textual cuando numero_documento no puede almacenar 11 digitos', async () => {
    const service = buildService();

    const factura = await (service as any).mapearPedidoACPE(
      pedido,
      {
        documento_tipo: 'RUC',
        documento_numero: null,
        numero_documento: null,
        ruc: '20831627068',
        codigo: '20831627068',
        razon_social: 'Cliente RUC Textual SAC',
        direccion: 'Av. QA 123',
      },
      empresaConfig,
    );

    expect(factura).toEqual(
      expect.objectContaining({
        tipo_documento: TipoDocumento.FACTURA,
        tipo_documento_receptor: '6',
        documento_receptor: '20831627068',
        razon_social_receptor: 'Cliente RUC Textual SAC',
        total_venta: 94.4,
      }),
    );
  });

  it('rechaza el cliente sin documento tributario real', async () => {
    const service = buildService();

    const promesa = (service as any).mapearPedidoACPE(
      pedido,
      {
        documento_tipo: 'RUC',
        documento_numero: null,
        numero_documento: null,
        ruc: null,
        codigo: null,
        razon_social: 'Cliente Sin Documento SAC',
      },
      empresaConfig,
    );

    await expect(promesa).rejects.toBeInstanceOf(BadRequestException);
    await expect(promesa).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CLIENTE_SIN_DOCUMENTO',
      }),
    });
  });

  it('emite boleta para un cliente con DNI y conserva la venta a crédito', async () => {
    const service = buildService();

    const boleta = await (service as any).mapearPedidoACPE(
      pedido,
      {
        documento_tipo: 'DNI',
        documento_numero: '12345678',
        razon_social: 'Cliente DNI QA',
        direccion: 'Lima',
      },
      empresaConfig,
    );

    expect(boleta).toEqual(
      expect.objectContaining({
        tipo_documento: TipoDocumento.BOLETA,
        serie: 'B001',
        tipo_documento_receptor: '1',
        documento_receptor: '12345678',
        condicion_pago: 'CREDITO',
      }),
    );
  });

  it('reserva el correlativo en la secuencia fiscal compartida', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { serie_factura: 'F001', serie_boleta: 'B001' },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    const rpc = jest.fn().mockResolvedValue({ data: 2, error: null });
    const service = new CPEIntegrationService(
      { getClient: () => ({ from, rpc }) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      (service as any).obtenerSerieYNumero('tenant-demo', TipoDocumento.BOLETA),
    ).resolves.toEqual({ serie: 'B001', numero: 2 });
    expect(rpc).toHaveBeenCalledWith('obtener_siguiente_numero_documento', {
      p_tenant_id: 'tenant-demo',
      p_tipo_documento: TipoDocumento.BOLETA,
      p_serie: 'B001',
    });
  });
});
