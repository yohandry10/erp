import { BadRequestException } from '@nestjs/common';
import { HelpController } from './help.controller';
import { SupabaseService } from '../../shared/supabase/supabase.service';

describe('HelpController', () => {
  const rpc = jest.fn();
  const controller = new HelpController({
    getClient: () => ({ rpc }),
  } as unknown as SupabaseService);

  beforeEach(() => {
    rpc.mockReset();
  });

  it('requires a search query', async () => {
    await expect(controller.search('tenant-1', '')).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('searches help using the authenticated tenant', async () => {
    rpc.mockResolvedValue({
      data: [{ titulo: 'Principal' }, { titulo: 'Relacionado' }],
      error: null,
    });

    await expect(controller.search('tenant-1', ' ventas ', 'admin', 'ventas')).resolves.toEqual({
      encontrado: true,
      resultado: { titulo: 'Principal' },
      relacionados: [{ titulo: 'Relacionado' }],
    });

    expect(rpc).toHaveBeenCalledWith('buscar_ayuda', {
      p_query: 'ventas',
      p_rol: 'admin',
      p_categoria: 'ventas',
      p_tenant_id: 'tenant-1',
      p_limite: 5,
    });
  });

  it('bounds suggestions limit before calling the RPC', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await controller.suggestions('admin', 'ventas', '100');

    expect(rpc).toHaveBeenCalledWith('obtener_sugerencias_ayuda', {
      p_rol: 'admin',
      p_categoria: 'ventas',
      p_limite: 20,
    });
  });
});
