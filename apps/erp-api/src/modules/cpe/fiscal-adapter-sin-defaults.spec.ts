import { ServiceUnavailableException } from '@nestjs/common';
import { FiscalAdapterService } from './fiscal-adapter.service';

/**
 * El adaptador fiscal no puede completar con Perú lo que no sabe.
 *
 * Ante un país sin fila o una configuración fiscal ausente devolvía la identidad
 * peruana entera —código PE, IGV, 18 % y soles— fuese cual fuese el país del
 * contribuyente. Un documento argentino habría salido con la tasa peruana y
 * nadie lo habría notado, porque el valor por defecto es plausible.
 *
 * Es el mismo fallo abierto que ya se retiró de `TaxCalculatorService`. Hoy no
 * dispara —`configuracion_fiscal` tiene fila para los cinco países— pero el
 * valor por defecto es justo lo que convierte una incidencia visible en un
 * documento mal emitido.
 */
describe('FiscalAdapterService: nada fiscal por defecto', () => {
  const TENANT = 'tenant-fiscal';

  function construir(opciones: { pais?: any; configFiscal?: any; paisId?: number }) {
    const from = jest.fn((tabla: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          data: tabla === 'paises' ? (opciones.pais ?? null) : (opciones.configFiscal ?? null),
          error: null,
        }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    });

    const servicio = new FiscalAdapterService(
      { getClient: () => ({ from }) } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    // El país del tenant y el nombre del servicio se resuelven aparte; aquí sólo
    // interesa qué hace el adaptador cuando falta el catálogo o la tasa.
    jest.spyOn(servicio as any, 'obtenerPaisTenant').mockResolvedValue(opciones.paisId ?? 5);
    jest.spyOn(servicio, 'obtenerNombreServicioFiscal').mockResolvedValue('ARCA');
    return servicio;
  }

  const argentina = { id: 5, codigo_iso: 'AR', nombre: 'Argentina', moneda_codigo: 'ARS' };

  it('devuelve la configuración real cuando existe', async () => {
    const servicio = construir({
      pais: argentina,
      configFiscal: { impuesto_principal_nombre: 'IVA', impuesto_principal_porcentaje: 0.21 },
    });

    const config = await servicio.obtenerConfiguracionFiscal(TENANT);

    expect(config.paisCodigo).toBe('AR');
    expect(config.impuestoPrincipal).toBe('IVA');
    expect(config.tasaImpuesto).toBe(0.21);
    expect(config.moneda).toBe('ARS');
  });

  it('se niega a emitir si falta la configuración fiscal del país', async () => {
    const servicio = construir({ pais: argentina, configFiscal: null });

    await expect(servicio.obtenerConfiguracionFiscal(TENANT)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('se niega a emitir si el país no se resuelve', async () => {
    const servicio = construir({
      pais: null,
      configFiscal: { impuesto_principal_nombre: 'IVA', impuesto_principal_porcentaje: 0.21 },
    });

    await expect(servicio.obtenerConfiguracionFiscal(TENANT)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('no sustituye una tasa ausente por la peruana', async () => {
    const servicio = construir({
      pais: argentina,
      configFiscal: { impuesto_principal_nombre: 'IVA', impuesto_principal_porcentaje: null },
    });

    await expect(servicio.obtenerConfiguracionFiscal(TENANT)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
