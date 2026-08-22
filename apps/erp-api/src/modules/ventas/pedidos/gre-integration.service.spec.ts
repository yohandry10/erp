import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { GreService } from '../../gre/gre.service';
import { GREIntegrationService } from './gre-integration.service';

describe('GREIntegrationService', () => {
  let service: GREIntegrationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GREIntegrationService,
        { provide: GreService, useValue: {} },
        { provide: SupabaseService, useValue: { getClient: () => ({}) } },
      ],
    }).compile();

    service = module.get<GREIntegrationService>(GREIntegrationService);
  });

  it('prepararDatosGRE incluye cpeRelacionado + pedidoId/pedidoNumero + idempotencyKey determinístico', async () => {
    jest.spyOn(service as any, 'obtenerCliente').mockResolvedValue({
      id: 'cli-1',
      razon_social: 'ACME SAC',
      nombre_comercial: 'ACME',
      direccion: 'Av. Siempre Viva 123',
      ubigeo: '150101',
      documento_tipo: 'RUC',
      numero_documento: '20123456789',
    });

    jest.spyOn(service as any, 'obtenerConfiguracionGRE').mockResolvedValue({
      pais: 'PE',
      moneda: 'PEN',
      gre_obligatorio: false,
      gre_automatico_habilitado: false,
      umbral_gre_automatico: 700,
    });

    jest.spyOn(service as any, 'obtenerEmpresaConfig').mockResolvedValue({
      direccion_fiscal: 'Calle Empresa 456',
      ubigeo: '150102',
    });

    const pedido = {
      id: 'ped-1',
      numero: 'PV-2025-0001',
      cliente_id: 'cli-1',
      total: 118,
      detalle: [{ producto_id: 'p1', cantidad: 1, precio_unitario: 100, descripcion: 'Item 1' }],
    };

    const facturaId = 'cpe-1';
    const tenantId = 'tenant-1';

    const result = await service.prepararDatosGRE(pedido as any, facturaId, tenantId);

    expect(result.cpeRelacionado).toBe(facturaId);
    expect(result.pedidoId).toBe(pedido.id);
    expect(result.pedidoNumero).toBe(pedido.numero);
    expect(result.idempotencyKey).toBe(`ventas.gre:${tenantId}:${facturaId}`);
  });

  // La GRE es exclusiva de Perú. La compuerta era `config.pais && config.pais !==
  // 'PE'`, y `obtenerConfiguracionGRE` sellaba 'PE' cuando no había país, así que
  // una empresa sin configurar —o una lectura fallida— acababa con una guía de
  // remisión peruana.
  it('no prepara una GRE si la empresa no está configurada como peruana', async () => {
    jest.spyOn(service as any, 'obtenerConfiguracionGRE').mockResolvedValue({
      gre_obligatorio: false,
      gre_automatico_habilitado: false,
      umbral_gre_automatico: 700,
    });

    await expect(
      service.prepararDatosGRE({ id: 'ped-1' } as any, 'cpe-1', 'tenant-1'),
    ).rejects.toThrow(/exclusiva de Perú/);
  });

  it('no habilita sugerencia GRE automática si falla la lectura de configuración', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'unavailable' } }),
    };
    const localService = new GREIntegrationService(
      { getClient: jest.fn(() => ({ from: jest.fn(() => chain) })) } as any,
      {} as any,
    );

    await expect((localService as any).obtenerConfiguracionGRE('tenant-1')).resolves.toEqual({
      gre_obligatorio: false,
      gre_automatico_habilitado: false,
      umbral_gre_automatico: 700,
    });
  });
});
