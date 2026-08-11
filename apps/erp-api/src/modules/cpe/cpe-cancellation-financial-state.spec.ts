import { CpeCancellationService } from './cpe-cancellation.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';

describe('CpeCancellationService - estado financiero 466', () => {
  const query = (rows: any[]) => {
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      or: jest.fn(() => chain),
      order: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      maybeSingle: jest.fn(async () => ({ data: rows[0] ?? null, error: null })),
      then: (resolve: (value: any) => any) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return chain;
  };

  it('nunca anuncia LISTO si queda un ajuste fiscal activo', async () => {
    const responses: Record<string, any[][]> = {
      cpe: [
        [{
          id: 'cpe-1', tenant_id: 'tenant-1', documento_id: 'doc-1',
          nota_credito_id: 'note-1', tipo_documento: '01', serie: 'F001',
          numero: 1, estado: 'ACEPTADO', moneda: 'PEN', total: 118,
        }],
        [{
          id: 'note-1', tipo_documento: '07', serie: 'FC01', numero: 1,
          estado: 'ACEPTADO', cdr_sunat: 'CDR-OK',
        }],
      ],
      cuentas_por_cobrar: [[{
        id: 'cxc-1', documento_id: 'doc-1', numero_documento: 'F001-1',
        moneda: 'PEN', monto_total: 118, monto_pendiente: 100, estado: 'PARCIAL',
      }]],
      cxc_pagos: [[{
        id: 'ajuste-pago-1', cuenta_id: 'cxc-1', tipo: 'RETENCION',
        monto: 18, moneda: 'PEN', event_id: 'event-ajuste-1',
        estado: 'ACTIVO', activo: true,
      }]],
      cxc_cobro_reversas: [[]],
      operaciones_fiscales_financieras: [[{
        id: 'operacion-fiscal-1', tipo: 'RETENCION', monto: 18,
        monto_contabilizado: 18, moneda: 'PEN', estado: 'APLICADO',
        source_event_id: 'event-ajuste-1',
      }]],
      sesiones_caja: [[]],
    };
    const from = jest.fn((table: string) => {
      const next = responses[table]?.shift();
      if (!next) throw new Error(`Lectura inesperada de ${table}`);
      return query(next);
    });
    const service = new CpeCancellationService(
      { getClient: () => ({ from }) } as unknown as SupabaseService,
      {} as AuditService,
    );

    const result = await service.obtenerEstadoFinanciero(
      'cpe-1', 'tenant-1', 'actor-1',
    );

    expect(result.estado_flujo).toBe('BLOQUEADO_AJUSTE_REQUIERE_REVERSA');
    expect(result.cobros_activos).toBe(0);
    expect(result.ajustes_activos).toEqual([
      expect.objectContaining({
        id: 'ajuste-pago-1',
        tipo: 'RETENCION',
        operacion_fiscal: expect.objectContaining({ id: 'operacion-fiscal-1' }),
      }),
    ]);
  });
});
