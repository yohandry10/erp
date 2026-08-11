import { BadRequestException } from '@nestjs/common';
import { SireService } from './sire.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const reportId = '33333333-3333-4333-8333-333333333333';
const operationId = '44444444-4444-4444-8444-444444444444';
const claimToken = '55555555-5555-4555-8555-555555555555';

function createFlowService(rpc: jest.Mock) {
  const client = { rpc, from: jest.fn() };
  const api = { aceptarPropuesta: jest.fn(), consultarTicket: jest.fn() };
  const service = new SireService(
    { getClient: jest.fn(() => client) } as any,
    { onComprobanteCreadoEvent: jest.fn() } as any,
    { getTenantId: jest.fn(() => tenantId) } as any,
    api as any,
  );
  return { service, client, api };
}

const claimedReservation = {
  claimed: true,
  idempotent: false,
  operation: { id: operationId, claim_token: claimToken },
  report: { id: reportId, tipo: 'REG_VEN', periodo: '2026-08', estado: 'GENERADO' },
};

describe('SireService flujo SUNAT durable', () => {
  it('acepta la propuesta una vez y persiste el ticket por finalizador 463', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: claimedReservation, error: null })
      .mockResolvedValueOnce({
        data: {
          operation: { id: operationId, ticket: '20260100000001' },
          report: { id: reportId, estado: 'PENDIENTE', sunat_ticket: '20260100000001' },
        },
        error: null,
      });
    const { service, client, api } = createFlowService(rpc);
    api.aceptarPropuesta.mockResolvedValue({
      ticket: '20260100000001',
      httpStatus: 200,
      responseSummary: { numTicket: '20260100000001' },
    });

    const result = await service.enviarSunat(
      reportId,
      tenantId,
      actorId,
      'sire-accept-2026-08-rvie',
    );

    expect(result.data.estado).toBe('PENDIENTE');
    expect(api.aceptarPropuesta).toHaveBeenCalledWith(tenantId, 'REG_VEN', '202608');
    expect(rpc).toHaveBeenNthCalledWith(2, 'finalizar_aceptacion_sire_tx', {
      p_tenant_id: tenantId,
      p_operation_id: operationId,
      p_claim_token: claimToken,
      p_ticket: '20260100000001',
      p_http_status: 200,
      p_response_summary: { numTicket: '20260100000001' },
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('un replay ya reservado no vuelve a llamar a SUNAT', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        claimed: false,
        idempotent: true,
        reason: 'TICKET_PENDING',
        report: { id: reportId, estado: 'PENDIENTE', sunat_ticket: '20260100000001' },
      },
      error: null,
    });
    const { service, api } = createFlowService(rpc);

    const result = await service.enviarSunat(reportId, tenantId, actorId, 'same-accept-key');

    expect(result.data.idempotent).toBe(true);
    expect(api.aceptarPropuesta).not.toHaveBeenCalled();
  });

  it('sólo marca ENVIADO cuando el finalizador recibe código SUNAT 06', async () => {
    const queryReservation = {
      ...claimedReservation,
      report: {
        id: reportId,
        tipo: 'REG_VEN',
        periodo: '2026-08',
        estado: 'PENDIENTE',
        sunat_ticket: '20260100000001',
      },
    };
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: queryReservation, error: null })
      .mockResolvedValueOnce({
        data: {
          terminado: true,
          con_errores: false,
          operation: { id: operationId, codigo_estado_sunat: '06' },
          report: { id: reportId, estado: 'ENVIADO', sunat_codigo_estado: '06' },
        },
        error: null,
      });
    const { service, api } = createFlowService(rpc);
    api.consultarTicket.mockResolvedValue({
      ticket: '20260100000001',
      codigoEstado: '06',
      descripcionEstado: 'Terminado',
      terminado: true,
      conErrores: false,
      httpStatus: 200,
      responseSummary: { registros: [] },
    });

    const result = await service.consultarTicket(
      reportId,
      tenantId,
      actorId,
      'sire-query-ticket-attempt-1',
    );

    expect(result.data.estado).toBe('ENVIADO');
    expect(rpc).toHaveBeenNthCalledWith(2, 'finalizar_consulta_sire_tx', expect.objectContaining({
      p_codigo_estado: '06',
      p_descripcion: 'Terminado',
    }));
  });

  it('un estado SUNAT desconocido falla cerrado y deja evidencia de error durable', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: {
        ...claimedReservation,
        report: {
          id: reportId,
          tipo: 'REG_COM',
          periodo: '2026-08',
          estado: 'PENDIENTE',
          sunat_ticket: '20260100000001',
        },
      }, error: null })
      .mockResolvedValueOnce({ data: { operation: { id: operationId, estado: 'ERROR' } }, error: null });
    const { service, api } = createFlowService(rpc);
    api.consultarTicket.mockResolvedValue({
      ticket: '20260100000001',
      codigoEstado: null,
      descripcionEstado: 'Sin código',
      terminado: false,
      conErrores: false,
      httpStatus: 200,
      responseSummary: {},
    });

    await expect(service.consultarTicket(
      reportId,
      tenantId,
      actorId,
      'sire-query-invalid-status',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).toHaveBeenNthCalledWith(2, 'fallar_operacion_sire_tx', expect.objectContaining({
      p_operation_id: operationId,
      p_claim_token: claimToken,
      p_error_code: 'SIRE_TICKET_STATUS_INVALID',
    }));
  });

  it('no cierra como ERROR una aceptación si SUNAT ya entregó ticket pero falló su persistencia', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: claimedReservation, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '08006', message: 'connection lost' } });
    const { service, api } = createFlowService(rpc);
    api.aceptarPropuesta.mockResolvedValue({
      ticket: '20260100000001',
      httpStatus: 200,
      responseSummary: {},
    });

    await expect(service.enviarSunat(
      reportId,
      tenantId,
      actorId,
      'sire-accept-persist-failure',
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SIRE_TICKET_PERSISTENCE_PENDING' }),
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).not.toHaveBeenCalledWith('fallar_operacion_sire_tx', expect.anything());
  });
});
