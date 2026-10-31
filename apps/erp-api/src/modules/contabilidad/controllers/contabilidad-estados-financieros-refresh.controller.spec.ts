import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EstadosFinancierosService } from '../services/estados-financieros.service';
import { ContabilidadEstadosFinancierosController } from './contabilidad-estados-financieros.controller';

describe('Refresco contable desde el controlador', () => {
  const tenant = 'a2643969-aa50-4527-8adb-7babd38fa3d5';
  let rpc: jest.Mock;
  let catalog: jest.Mock;
  let controller: ContabilidadEstadosFinancierosController;

  beforeEach(() => {
    rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    catalog = jest.fn(() => {
      throw new Error('El catálogo pg_matviews no está disponible para el rol');
    });
    const supabase = {
      getClient: () => ({ rpc, from: catalog }),
    } as unknown as SupabaseService;
    controller = new ContabilidadEstadosFinancierosController(
      undefined as never,
      supabase,
      new EstadosFinancierosService(supabase),
      undefined as never,
    );
  });

  it('refresca con la RPC real del servicio aunque el catálogo esté restringido', async () => {
    const result = await controller.refrescarEstadosFinancieros(tenant, { anio: 2026, mes: 10 });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('refrescar_estados_financieros', {
      p_tenant_id: tenant, p_anio: 2026, p_mes: 10,
    });
    expect(catalog).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      data: {
        periodo: { anio: 2026, mes: 10 },
        vistas_materializadas: true,
        vistas_refrescadas: [
          'mv_balance_comprobacion', 'mv_estado_resultados', 'mv_balance_general',
        ],
      },
    });
  });

  it.each([
    { code: '42501', message: 'permission denied; internal-secret' },
    { code: '42P01', message: 'No existe mv_balance_general; internal-secret' },
    { code: '57014', message: 'statement timeout; internal-secret' },
  ])('rechaza el refresco fallido $code sin publicar ausencia ni detalles SQL', async (error) => {
    rpc.mockResolvedValueOnce({ data: null, error });

    const failure = await controller.refrescarEstadosFinancieros(tenant, { anio: 2026, mes: 10 })
      .then(() => { throw new Error('No debe confirmar un refresco fallido'); }, value => value);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(failure.getStatus()).toBe(503);
    expect(JSON.stringify(failure.getResponse())).not.toContain('internal-secret');
    expect(catalog).not.toHaveBeenCalled();
  });

  it('propaga la indisponibilidad de transporte como 503', async () => {
    rpc.mockRejectedValueOnce(new Error('connection reset; internal-secret'));

    await expect(controller.refrescarEstadosFinancieros(tenant, { anio: 2026, mes: 10 }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(catalog).not.toHaveBeenCalled();
  });

  it.each([
    { anio: 1999, mes: 10 }, { anio: 2101, mes: 10 },
    { anio: 2026.5, mes: 10 }, { anio: 2026, mes: 0 },
    { anio: 2026, mes: 13 }, { anio: 2026, mes: 1.5 },
  ])('no invoca SQL para el período inválido $anio-$mes', async body => {
    await expect(controller.refrescarEstadosFinancieros(tenant, body))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
    expect(catalog).not.toHaveBeenCalled();
  });
});
