import { TaxCalculatorService } from './tax-calculator';

/**
 * El calculador fiscal devolvía Perú 18 %/PEN ante cualquier fallo: error de
 * consulta, país sin resolver, configuración ausente o tasa inválida. Un tenant
 * colombiano facturaba al 18 % en vez del 19 %, y uno argentino al 18 % en vez del
 * 21 %, sin que nada lo delatara. El README fija lo contrario: «operaciones
 * fiscales y financieras fallan cerrado».
 *
 * Estas pruebas fijan que ya no hay ninguna vía que devuelva una tasa inventada.
 */
describe('TaxCalculatorService — la configuración fiscal falla cerrado', () => {
  type Escenario = {
    empresa?: { data?: any; error?: any } | 'throw';
    fiscal?: { data?: any; error?: any } | 'throw';
  };

  const construir = (escenario: Escenario) => {
    const empresaChain: any = {
      select: () => empresaChain,
      eq: () => empresaChain,
      maybeSingle: async () => {
        if (escenario.empresa === 'throw') throw new Error('conexión caída');
        return escenario.empresa ?? { data: { pais_id: 2 }, error: null };
      },
    };

    const fiscalChain: any = {
      select: () => fiscalChain,
      eq: () => fiscalChain,
      or: () => fiscalChain,
      order: () => fiscalChain,
      limit: () => fiscalChain,
      maybeSingle: async () => {
        if (escenario.fiscal === 'throw') throw new Error('conexión caída');
        return escenario.fiscal ?? { data: null, error: null };
      },
    };

    const supabase: any = {
      getClient: () => ({
        from: (tabla: string) => (tabla === 'empresa_config' ? empresaChain : fiscalChain),
      }),
    };
    return new TaxCalculatorService(supabase);
  };

  const configColombiana = {
    data: {
      tasa_igv: 0.19,
      impuesto_principal_nombre: 'IVA',
      pais_id: 2,
      paises: [{ codigo_iso: 'CO', moneda_codigo: 'COP' }],
    },
    error: null,
  };

  describe('ya no inventa la configuración peruana', () => {
    it('una excepción durante la consulta fiscal propaga en vez de devolver 18 %', async () => {
      const service = construir({ fiscal: 'throw' });
      await expect(service.getTaxConfig('tenant-co')).rejects.toThrow();
    });

    it('un error de la consulta fiscal propaga', async () => {
      const service = construir({ fiscal: { data: null, error: { message: 'timeout' } } });
      await expect(service.getTaxConfig('tenant-co')).rejects.toThrow(/configuración fiscal/i);
    });

    it('sin fila de configuración fiscal se detiene, no asume 18 %', async () => {
      const service = construir({ fiscal: { data: null, error: null } });
      await expect(service.getTaxConfig('tenant-co')).rejects.toThrow(/configuración fiscal/i);
    });

    it('una fila que no declara tasa se considera incompleta', async () => {
      const service = construir({
        fiscal: {
          data: {
            tasa_igv: null,
            impuesto_principal_porcentaje: null,
            paises: [{ codigo_iso: 'CO', moneda_codigo: 'COP' }],
          },
          error: null,
        },
      });
      await expect(service.getTaxConfig('tenant-co')).rejects.toThrow(/no declara tasa/i);
    });

    it('la validación de tasa inválida por fin propaga en vez de caer al catch', async () => {
      const service = construir({
        fiscal: {
          data: { tasa_igv: 750, paises: [{ codigo_iso: 'CO', moneda_codigo: 'COP' }] },
          error: null,
        },
      });
      await expect(service.getTaxConfig('tenant-co')).rejects.toThrow(/inválida/i);
    });
  });

  describe('el país del contribuyente no se adivina', () => {
    it('un error leyendo empresa_config detiene el cálculo', async () => {
      const service = construir({ empresa: { data: null, error: { message: 'duplicada' } } });
      await expect(service.getTaxConfig('tenant-co')).rejects.toThrow(/país fiscal/i);
    });

    it('un tenant sin país configurado no cae a Perú', async () => {
      const service = construir({ empresa: { data: null, error: null } });
      await expect(service.getTaxConfig('tenant-sin-pais')).rejects.toThrow(/país fiscal/i);
    });
  });

  describe('las rutas que cobran se detienen', () => {
    it('calcularImpuestos no devuelve un total con impuesto inventado', async () => {
      const service = construir({ fiscal: 'throw' });
      await expect(
        service.calcularImpuestos({ subtotal: 1000, tenantId: 'tenant-co' }),
      ).rejects.toThrow();
    });

    it('getTasaIgv no devuelve 0.18 de consuelo', async () => {
      const service = construir({ fiscal: 'throw' });
      await expect(service.getTasaIgv('tenant-co')).rejects.toThrow();
    });

    it('calcularSubtotalDesdeTotal tampoco', async () => {
      const service = construir({ fiscal: 'throw' });
      await expect(service.calcularSubtotalDesdeTotal(1190, 'tenant-co')).rejects.toThrow();
    });
  });

  describe('el camino feliz respeta la configuración del tenant', () => {
    it('un tenant colombiano calcula al 19 % y en COP', async () => {
      const service = construir({ fiscal: configColombiana });
      const r = await service.calcularImpuestos({ subtotal: 1000, tenantId: 'tenant-co' });
      expect(r.igv).toBe(190);
      expect(r.total).toBe(1190);
      expect(r.moneda).toBe('COP');
      expect(r.nombreImpuesto).toBe('IVA');
    });

    it('normaliza una tasa expresada en porcentaje', async () => {
      const service = construir({
        fiscal: {
          data: { tasa_igv: 21, paises: [{ codigo_iso: 'AR', moneda_codigo: 'ARS' }] },
          error: null,
        },
      });
      expect(await service.getTasaIgv('tenant-ar')).toBeCloseTo(0.21, 6);
    });

    it('cero es una tasa válida: una operación inafecta no hereda 18 %', async () => {
      const service = construir({
        fiscal: {
          data: { tasa_igv: 0, paises: [{ codigo_iso: 'PE', moneda_codigo: 'PEN' }] },
          error: null,
        },
      });
      expect(await service.getTasaIgv('tenant-inafecto')).toBe(0);
    });
  });

  describe('redondeo con Decimal.js', () => {
    it('1.005 redondea a 1.01 y no a 1 como con punto flotante', () => {
      const service = construir({}) as any;
      expect(service.round(1.005)).toBe(1.01);
      expect(service.round(8.615)).toBe(8.62);
    });

    it('tolera valores no finitos sin propagar NaN al importe', () => {
      const service = construir({}) as any;
      expect(service.round(Number.NaN)).toBe(0);
      expect(service.round(Number.POSITIVE_INFINITY)).toBe(0);
    });
  });
});
