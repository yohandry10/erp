import { RrhhService } from './rrhh.service';

describe('Perfil de candidato persistido', () => {
  const rpc = jest.fn();
  const service = new RrhhService({ getClient: () => ({ rpc }) } as any);
  beforeEach(() => { rpc.mockReset().mockResolvedValue({ data: { id: 'candidate' }, error: null }); });

  it.each(['create', 'update'])('normaliza experiencia y conserva estado civil al %s', async action => {
    const profile = { nombres: 'Ana', apellidos: 'Prueba', experiencia_años: 5, estado_civil: 'casado' };
    if (action === 'create') await service.createCandidato(profile, 'tenant', 'actor', 'candidate-create-1');
    else await service.updateCandidato('candidate', profile, 'tenant', 'actor', 'candidate-update-1');
    const payload = rpc.mock.calls[0][1].p_payload;
    expect(payload).toMatchObject({ experiencia_anos: 5, estado_civil: 'casado' });
    expect(payload).not.toHaveProperty('experiencia_años');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_tenant_id: 'tenant', p_actor_id: 'actor' });
  });

  it('rechaza aliases contradictorios antes de escribir', async () => {
    await expect(service.updateCandidato('candidate', { experiencia_anos: 2, experiencia_años: 8 },
      'tenant', 'actor', 'candidate-conflict')).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
