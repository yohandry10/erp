import { CpeCancellationService } from './cpe-cancellation.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';

describe('CpeCancellationService', () => {
  const service = new CpeCancellationService(
    {} as unknown as SupabaseService,
    {} as unknown as AuditService,
  );

  const resolverSerie = (serie: string): string =>
    (service as any).resolveSerieNotaCredito(serie);

  describe('serie de la nota de crédito', () => {
    // SUNAT exige series de exactamente 4 caracteres alfanuméricos; una serie de
    // 5 (FC001) hace que el comprobante sea rechazado al enviarlo.
    it('siempre produce una serie de 4 caracteres', () => {
      for (const serie of ['F001', 'B001', 'F123', 'B999', '', 'X7']) {
        expect(resolverSerie(serie)).toHaveLength(4);
      }
    });

    it('conserva el prefijo del comprobante afectado', () => {
      expect(resolverSerie('F001')).toBe('FC01');
      expect(resolverSerie('B001')).toBe('BC01');
    });

    it('mantiene distinguibles series distintas del mismo tipo', () => {
      expect(resolverSerie('F001')).not.toBe(resolverSerie('F002'));
      expect(resolverSerie('B001')).not.toBe(resolverSerie('B002'));
    });

    it('respeta el patrón alfanumérico en mayúsculas exigido por SUNAT', () => {
      for (const serie of ['F001', 'b002', 'F010', '']) {
        expect(resolverSerie(serie)).toMatch(/^[A-Z0-9]{4}$/);
      }
    });
  });

  // El reverso es efectivo que sale hoy. Cargarlo en la sesion original ya cerrada
  // rompia un arqueo cuadrado y ademas hacia imposible anular una venta de un turno
  // anterior: la RPC lo rechazaba y la anulacion fallaba a medias.
  describe('sesion destino del reverso de caja', () => {
    const abierta = { id: 'ses-abierta', estado: 'ABIERTA', hora_cierre: null, fecha_cierre: null };
    const cerrada = { id: 'ses-cerrada', estado: 'CERRADA', hora_cierre: '2026-01-01', fecha_cierre: '2026-01-01' };

    const resolver = (respuestas: any[], sesionOriginalId: string | null = 'ses-original') => {
      let llamada = 0;
      const client = {
        from: () => {
          const actual = respuestas[llamada++] ?? null;
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            is: () => chain,
            order: () => chain,
            limit: () => chain,
            maybeSingle: async () => ({ data: actual }),
          };
          return chain;
        },
      };
      return (service as any).resolverSesionParaReverso(client, 't1', sesionOriginalId);
    };

    it('usa la sesion de la venta si sigue abierta', async () => {
      await expect(resolver([abierta])).resolves.toBe('ses-abierta');
    });

    it('cae a la sesion abierta vigente si la de la venta ya cerro', async () => {
      await expect(resolver([cerrada, { id: 'ses-hoy' }])).resolves.toBe('ses-hoy');
    });

    it('devuelve null si no hay ninguna sesion abierta', async () => {
      await expect(resolver([cerrada, null])).resolves.toBeNull();
    });

    it('no exige sesion original para resolver la vigente', async () => {
      await expect(resolver([{ id: 'ses-hoy' }], null)).resolves.toBe('ses-hoy');
    });
  });

  describe('ciclo fiscal de la anulación', () => {
    const query = (resultado: any) => {
      const chain: any = {};
      for (const metodo of ['select', 'eq', 'update', 'insert']) {
        chain[metodo] = jest.fn(() => chain);
      }
      chain.single = jest.fn(async () => resultado);
      chain.maybeSingle = jest.fn(async () => resultado);
      return chain;
    };

    it('crear la nota no anula ni revierte antes del CDR aceptado', async () => {
      const original = {
        id: 'cpe-1', estado: 'ACEPTADO', nota_credito_id: null,
        tipo_documento: '01', serie: 'F001', numero: 1,
        total_gravadas: 100, total_igv: 18, total_venta: 118,
        ruc_emisor: '20123456789', razon_social_emisor: 'Demo',
        tipo_documento_receptor: '6', documento_receptor: '20999999999',
        razon_social_receptor: 'Cliente', moneda: 'PEN',
      };
      const nota = { id: 'nc-1', estado: 'BORRADOR', serie: 'FC01', numero: 1 };
      const lectura = query({ data: original, error: null });
      const insercion = query({ data: nota, error: null });
      const actualizacion = query({ data: null, error: null });
      const client = { from: jest.fn()
        .mockReturnValueOnce(lectura)
        .mockReturnValueOnce(insercion)
        .mockReturnValueOnce(actualizacion) };
      const sut = new CpeCancellationService(
        { getClient: () => client } as unknown as SupabaseService,
        {} as unknown as AuditService,
      );
      jest.spyOn(sut as any, 'assertCpeOriginalAccountingReady').mockResolvedValue(undefined);
      jest.spyOn(sut as any, 'obtenerSiguienteNumeroNotaCredito').mockResolvedValue(1);
      const reverso = jest.spyOn(sut as any, 'aplicarReversionOperativa').mockResolvedValue(undefined);

      const result = await sut.anularComprobante('cpe-1', 'Error de operación', 'tenant-1');

      expect(reverso).not.toHaveBeenCalled();
      expect(actualizacion.update).toHaveBeenCalledWith(expect.objectContaining({
        nota_credito_id: 'nc-1',
        motivo_anulacion: 'Error de operación',
      }));
      expect(actualizacion.update.mock.calls[0][0]).not.toHaveProperty('estado', 'ANULADO');
      expect(result.cpe_anulado.anulacion_estado).toBe('PENDIENTE_CDR');
    });

    it('no finaliza una nota aceptada si todavía no existe CDR', async () => {
      const lectura = query({
        data: { id: 'nc-1', tipo_documento: '07', estado: 'ACEPTADO', cdr_sunat: null },
        error: null,
      });
      const client = { from: jest.fn().mockReturnValueOnce(lectura) };
      const sut = new CpeCancellationService(
        { getClient: () => client } as unknown as SupabaseService,
        {} as unknown as AuditService,
      );
      const reverso = jest.spyOn(sut as any, 'aplicarReversionOperativa').mockResolvedValue(undefined);

      await expect(sut.finalizarAnulacionAceptada('nc-1', 'tenant-1'))
        .resolves.toMatchObject({ estado: 'PENDIENTE_CDR' });
      expect(reverso).not.toHaveBeenCalled();
      expect(client.from).toHaveBeenCalledTimes(1);
    });
  });
});
