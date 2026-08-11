import { GreService } from './gre.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const greId = '33333333-3333-4333-8333-333333333333';
const operationId = '44444444-4444-4444-8444-444444444444';
const claimToken = '55555555-5555-4555-8555-555555555555';

function configChain(ruc = '20100066603') {
  const chain: any = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: { ruc }, error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

function buildService(rpc: jest.Mock, ose: Record<string, jest.Mock>, chain = configChain()) {
  const client = { rpc, from: jest.fn(() => chain) };
  const service = new GreService(
    { getClient: jest.fn(() => client) } as any,
    { on: jest.fn(), emit: jest.fn(), eventEmitter: { eventNames: () => [] } } as any,
    ose as any,
    {} as any,
  );
  return { service, client };
}

function sendClaim(overrides: Record<string, unknown> = {}) {
  return {
    claimed: true,
    operation: { id: operationId, claim_token: claimToken },
    gre: {
      id: greId,
      numero: 'T001-00000001',
      xml_firmado: '<DespatchAdvice><Signature/></DespatchAdvice>',
      hash_gre: 'HASH-FROZEN',
      ...overrides,
    },
  };
}

describe('GreService claim/finalizer 463', () => {
  it('no transmite cuando el claim informa que otro envío está en curso', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { claimed: false, idempotent: false, reason: 'IN_FLIGHT' },
      error: null,
    });
    const enviarGre = jest.fn();
    const { service } = buildService(rpc, { enviarGre });

    const result = await service.enviarManualmenteSunat(
      greId,
      tenantId,
      actorId,
      { idempotencyKey: 'gre:send:in-flight' },
    );

    expect(result).toEqual(expect.objectContaining({ claimed: false, reason: 'IN_FLIGHT' }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('reservar_envio_gre_tx', expect.objectContaining({
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_gre_id: greId,
      p_idempotency_key: 'gre:send:in-flight',
      p_origen: 'USUARIO',
    }));
    expect(enviarGre).not.toHaveBeenCalled();
  });

  it('persiste el rechazo terminal antes de propagar el error SUNAT', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: sendClaim(), error: null })
      .mockResolvedValueOnce({ data: { gre: { estado: 'RECHAZADO' } }, error: null });
    const enviarGre = jest.fn().mockResolvedValue({
      success: false,
      codigoRespuesta: '3200',
      descripcionRespuesta: 'GRE rechazada por SUNAT',
    });
    const { service } = buildService(rpc, { enviarGre });

    await expect(service.enviarManualmenteSunat(
      greId,
      tenantId,
      actorId,
      { idempotencyKey: 'gre:send:rejected' },
    )).rejects.toThrow(/SUNAT rechazó la GRE/);

    expect(enviarGre).toHaveBeenCalledWith(
      '<DespatchAdvice><Signature/></DespatchAdvice>',
      '20100066603-09-T001-00000001',
      { tenantId },
    );
    expect(rpc).toHaveBeenNthCalledWith(2, 'finalizar_envio_gre_tx', expect.objectContaining({
      p_operation_id: operationId,
      p_claim_token: claimToken,
      p_success: false,
      p_technical_error: false,
      p_codigo: '3200',
      p_descripcion: 'GRE rechazada por SUNAT',
    }));
  });

  it('envía el XML firmado congelado y conserva el ticket pendiente', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: sendClaim(), error: null })
      .mockResolvedValueOnce({ data: { gre: { estado: 'ENVIADO', sunat_ticket: 'TICKET-123' } }, error: null });
    const enviarGre = jest.fn().mockResolvedValue({
      success: true,
      codigoRespuesta: '98',
      descripcionRespuesta: 'Ticket pendiente',
      ticket: 'TICKET-123',
      hashCPE: 'HASH-FROZEN',
    });
    const { service } = buildService(rpc, { enviarGre });

    const result = await service.enviarManualmenteSunat(
      greId,
      tenantId,
      actorId,
      { idempotencyKey: 'gre:send:ticket' },
    );

    expect(result.gre.estado).toBe('ENVIADO');
    expect(rpc).toHaveBeenNthCalledWith(2, 'finalizar_envio_gre_tx', expect.objectContaining({
      p_success: true,
      p_ticket: 'TICKET-123',
      p_cdr: null,
      p_hash: 'HASH-FROZEN',
    }));
  });

  it('trata código 98 de consulta como pendiente y no como error técnico', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({
        data: {
          claimed: true,
          operation: { id: operationId, claim_token: claimToken },
          gre: { id: greId, numero: 'T001-00000001', sunat_ticket: 'TICKET-123' },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { gre: { estado: 'ENVIADO' } }, error: null });
    const consultarTicketGre = jest.fn().mockResolvedValue({
      success: false,
      codigoRespuesta: '98',
      descripcionRespuesta: 'GRE aún en proceso',
    });
    const { service } = buildService(rpc, { consultarTicketGre });

    const result = await service.consultarEstadoGre(
      greId,
      tenantId,
      actorId,
      'gre:query:pending',
    );

    expect(result.gre.estado).toBe('ENVIADO');
    expect(consultarTicketGre).toHaveBeenCalledWith('TICKET-123', { tenantId });
    expect(rpc).toHaveBeenNthCalledWith(2, 'finalizar_consulta_gre_tx', expect.objectContaining({
      p_success: false,
      p_pending: true,
      p_technical_error: false,
      p_codigo: '98',
    }));
  });
});
