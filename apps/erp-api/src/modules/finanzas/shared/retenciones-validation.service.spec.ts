import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RetencionesValidationService } from './retenciones-validation.service';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';

/**
 * Tests unitarios para validación de cálculos de retenciones
 * 
 * TAREA 17: Validar que los cálculos de retenciones sean correctos antes de crear CxC/CxP
 */
describe('RetencionesValidationService', () => {
  let service: RetencionesValidationService;
  let supabaseService: jest.Mocked<SupabaseService>;

  beforeEach(() => {
    supabaseService = {
      getClient: jest.fn(),
    } as any;

    service = new RetencionesValidationService(supabaseService);
  });

  describe('validarCalculoAjustes', () => {
    it('debe validar correctamente cuando no hay ajustes', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 0, percepcion: 0, detraccion: 0, anticipo: 0 },
        {},
        {}
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it('debe validar correctamente retención con tasa del cliente', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 150, percepcion: 0, detraccion: 0, anticipo: 0 },
        { sujeto_retencion: true, retencion_tasa: 15 },
        {}
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.ajustesEsperados.retencion).toBe(150);
    });

    it('debe validar correctamente retención con tasa de empresa', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 100, percepcion: 0, detraccion: 0, anticipo: 0 },
        {},
        { aplicar_retencion: true, retencion_tasa: 10 }
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.ajustesEsperados.retencion).toBe(100);
    });

    it('debe detectar error cuando retención calculada es incorrecta', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 200, percepcion: 0, detraccion: 0, anticipo: 0 },
        { sujeto_retencion: true, retencion_tasa: 15 },
        {}
      );

      expect(resultado.valido).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
      expect(resultado.errores[0]).toContain('Retención calculada incorrecta');
    });

    it('debe validar correctamente percepción', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 0, percepcion: 30, detraccion: 0, anticipo: 0 },
        { sujeto_percepcion: true, percepcion_tasa: 3 },
        {}
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.ajustesEsperados.percepcion).toBe(30);
    });

    it('debe detectar error cuando percepción calculada es incorrecta', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 0, percepcion: 50, detraccion: 0, anticipo: 0 },
        { sujeto_percepcion: true, percepcion_tasa: 3 },
        {}
      );

      expect(resultado.valido).toBe(false);
      expect(resultado.errores[0]).toContain('Percepción calculada incorrecta');
    });

    it('debe validar correctamente detracción', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 0, percepcion: 0, detraccion: 100, anticipo: 0 },
        { sujeto_detraccion: true, detraccion_tasa: 10 },
        {}
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.ajustesEsperados.detraccion).toBe(100);
    });

    it('debe detectar error cuando detracción calculada es incorrecta', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 0, percepcion: 0, detraccion: 150, anticipo: 0 },
        { sujeto_detraccion: true, detraccion_tasa: 10 },
        {}
      );

      expect(resultado.valido).toBe(false);
      expect(resultado.errores[0]).toContain('Detracción calculada incorrecta');
    });

    it('debe detectar error cuando anticipo es negativo', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 0, percepcion: 0, detraccion: 0, anticipo: -50 },
        {},
        {}
      );

      expect(resultado.valido).toBe(false);
      expect(resultado.errores[0]).toContain('Anticipo no puede ser negativo');
    });

    it('debe detectar error cuando retención aplicada pero tasa es 0', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 100, percepcion: 0, detraccion: 0, anticipo: 0 },
        { sujeto_retencion: true, retencion_tasa: 0 },
        {}
      );

      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toEqual(
        expect.arrayContaining([expect.stringContaining('Retención aplicada'), expect.stringContaining('tasa es 0%')])
      );
    });

    it('debe detectar error cuando ajustes exceden el total', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 400, percepcion: 0, detraccion: 300, anticipo: 400 },
        { sujeto_retencion: true, retencion_tasa: 40, sujeto_detraccion: true, detraccion_tasa: 30 },
        {}
      );

      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toEqual(expect.arrayContaining([expect.stringContaining('excede el total')]));
    });

    it('debe priorizar configuración de cliente sobre empresa', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000,
        { retencion: 150, percepcion: 0, detraccion: 0, anticipo: 0 },
        { sujeto_retencion: true, retencion_tasa: 15 },
        { aplicar_retencion: true, retencion_tasa: 10 }
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.ajustesEsperados.retencion).toBe(150); // Usa tasa del cliente (15%)
    });

    it('debe manejar correctamente valores decimales', async () => {
      const resultado = await service.validarCalculoAjustes(
        1000.50,
        { retencion: 150.08, percepcion: 0, detraccion: 0, anticipo: 0 },
        { sujeto_retencion: true, retencion_tasa: 15 },
        {}
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.ajustesEsperados.retencion).toBeCloseTo(150.08, 2);
    });
  });

  describe('validarMontoPendiente', () => {
    it('debe validar correctamente monto pendiente sin ajustes', () => {
      const resultado = service.validarMontoPendiente(
        1000,
        { retencion: 0, percepcion: 0, detraccion: 0, anticipo: 0 },
        1000
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.montoEsperado).toBe(1000);
    });

    it('debe validar correctamente monto pendiente con retención', () => {
      const resultado = service.validarMontoPendiente(
        1000,
        { retencion: 150, percepcion: 0, detraccion: 0, anticipo: 0 },
        850
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.montoEsperado).toBe(850);
    });

    it('debe validar correctamente monto pendiente con percepción', () => {
      const resultado = service.validarMontoPendiente(
        1000,
        { retencion: 0, percepcion: 30, detraccion: 0, anticipo: 0 },
        1030
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.montoEsperado).toBe(1030);
    });

    it('debe validar correctamente monto pendiente con todos los ajustes', () => {
      // total - retención - detracción - anticipo + percepción
      // 1000 - 150 - 100 - 50 + 30 = 730
      const resultado = service.validarMontoPendiente(
        1000,
        { retencion: 150, percepcion: 30, detraccion: 100, anticipo: 50 },
        730
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.montoEsperado).toBe(730);
    });

    it('debe detectar error cuando monto pendiente es incorrecto', () => {
      const resultado = service.validarMontoPendiente(
        1000,
        { retencion: 150, percepcion: 0, detraccion: 0, anticipo: 0 },
        900
      );

      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('Monto pendiente incorrecto');
    });

    it('debe asegurar que monto pendiente no sea negativo', () => {
      const resultado = service.validarMontoPendiente(
        1000,
        { retencion: 0, percepcion: 0, detraccion: 0, anticipo: 1500 },
        0
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.montoEsperado).toBe(0); // No puede ser negativo
    });

    it('debe manejar correctamente valores decimales', () => {
      const resultado = service.validarMontoPendiente(
        1000.50,
        { retencion: 150.08, percepcion: 30.02, detraccion: 0, anticipo: 0 },
        880.44
      );

      expect(resultado.valido).toBe(true);
      expect(resultado.montoEsperado).toBeCloseTo(880.44, 2);
    });
  });
});

