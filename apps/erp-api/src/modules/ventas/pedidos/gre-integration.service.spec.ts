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
});

