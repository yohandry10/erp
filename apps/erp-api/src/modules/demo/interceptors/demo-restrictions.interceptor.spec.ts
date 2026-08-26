import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { DemoRestrictionsInterceptor } from './demo-restrictions.interceptor';

describe('DemoRestrictionsInterceptor · transporte fiscal', () => {
  const build = (
    pais: 'PE' | 'AR' | 'CO',
    originalUrl: string,
    options: {
      empresa?: Record<string, unknown>;
      dbError?: unknown;
      response?: unknown;
      method?: string;
    } = {},
  ) => {
    const supabase = {
      getPublicClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  is_demo: true,
                  pais,
                  pais_id: pais === 'PE' ? 1 : pais === 'AR' ? 2 : 3,
                  ruc:
                    pais === 'PE'
                      ? '20123456786'
                      : pais === 'AR'
                        ? '30710158229'
                        : '900123456-8',
                  sunat_environment: 'homologacion',
                  arca_environment: 'homologacion',
                  dian_environment: 'HOMOLOGACION',
                  ...options.empresa,
                },
                error: options.dbError ?? null,
              }),
            }),
          }),
        }),
      }),
    };
    const request = {
      user: { tenant_id: 'tenant-demo' },
      route: { path: originalUrl },
      originalUrl,
      method: options.method ?? 'POST',
      body: {},
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    };
    const next = {
      handle: jest.fn(() => of(options.response ?? { success: true })),
    };

    return {
      interceptor: new DemoRestrictionsInterceptor(supabase as any),
      context: context as any,
      next,
    };
  };

  it.each([
    '/api/cpe/comprobantes/cpe-1/enviar-sunat',
    '/api/cpe/comunicacion/ra-1/enviar',
    '/api/cpe/resumen/rc-1/enviar',
    '/api/gre/guias/gre-1/reenviar',
  ])('bloquea transporte PE demo sin fabricar evidencia en %s', async (url) => {
    const { interceptor, context, next } = build('PE', url);

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('mantiene SIRE externo bloqueado en la demo PE', async () => {
    const { interceptor, context, next } = build(
      'PE',
      '/api/sire/reportes/reporte-1/enviar-sunat',
    );

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('mantiene transmisiones AR/CO bloqueadas hasta tener simulador propio', async () => {
    const { interceptor, context, next } = build(
      'AR',
      '/api/cpe/comunicacion/ra-1/enviar',
    );

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('bloquea el test DIAN de una demo antes de abrir una conexión externa', async () => {
    const { interceptor, context, next } = build(
      'CO',
      '/api/configuration/colombia/dian/test',
    );

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it.each([
    '/api/cpe/worker/cpe-1/status',
    '/api/cpe/cpe-1/status',
    '/api/cpe/baja/comunicacion/ra-1/estado',
    '/api/cpe/baja/resumen/rc-1/estado',
  ])('bloquea consultas SUNAT mutantes en demo: %s', async (url) => {
    const { interceptor, context, next } = build('PE', url, { method: 'GET' });

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('bloquea la consulta GRE mutante y deja pasar la lectura local persistida', async () => {
    const mutating = build('PE', '/api/gre/guias/gre-1/consultar-sunat');
    await expect(
      mutating.interceptor.intercept(mutating.context, mutating.next),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mutating.next.handle).not.toHaveBeenCalled();

    const local = build('PE', '/api/gre/guias/gre-1/estado-sunat', { method: 'GET' });
    await expect(
      firstValueFrom(await local.interceptor.intercept(local.context, local.next)),
    ).resolves.toEqual({ success: true });
    expect(local.next.handle).toHaveBeenCalledTimes(1);
  });

  it('bloquea consultar-ticket SIRE antes de reservar o mutar el reporte', async () => {
    const { interceptor, context, next } = build(
      'PE',
      '/api/sire/reportes/reporte-1/consultar-ticket',
    );

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('consultar-ticket SIRE también falla cerrado si empresa_config no responde', async () => {
    const { interceptor, context, next } = build(
      'PE',
      '/api/sire/reportes/reporte-1/consultar-ticket',
      { dbError: { message: 'database unavailable' } },
    );

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('bloquea el transporte fiscal si no puede verificar la configuración demo', async () => {
    const { interceptor, context, next } = build(
      'PE',
      '/api/cpe/comprobantes/cpe-1/enviar-sunat',
      { dbError: { message: 'database unavailable' } },
    );

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('no fabrica aceptación fiscal al crear una venta demo', async () => {
    const original = { id: 'venta-1', cpe_estado: 'PENDIENTE' };
    const { interceptor, context, next } = build('PE', '/api/ventas', {
      response: original,
    });

    const result = await firstValueFrom(await interceptor.intercept(context, next));

    expect(result).toEqual(original);
    expect(result).not.toHaveProperty('is_demo_simulation');
  });

  it('bloquea el cambio de RUC por la ruta real PUT /configuration/empresa', async () => {
    const { interceptor, context, next } = build(
      'PE',
      '/api/configuration/empresa',
      { method: 'PUT' },
    );
    context.switchToHttp().getRequest().body = { ruc: '20600000013' };

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('bloquea también la identidad por la ruta legacy PUT /configuracion/empresa', async () => {
    const { interceptor, context, next } = build(
      'PE',
      '/api/configuracion/empresa',
      { method: 'PUT' },
    );
    context.switchToHttp().getRequest().body = { ruc: '20600000013' };

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('falla cerrado si no puede comprobar la demo antes de cambiar identidad', async () => {
    const { interceptor, context, next } = build(
      'PE',
      '/api/configuracion/empresa',
      { method: 'PUT', dbError: { message: 'database unavailable' } },
    );
    context.switchToHttp().getRequest().body = { ruc: '20600000013' };

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('bloquea RUC o país divergentes dentro de POST /configuration/complete', async () => {
    const { interceptor, context, next } = build(
      'PE',
      '/api/configuration/complete',
      { method: 'POST' },
    );
    context.switchToHttp().getRequest().body = {
      configuration: {
        ruc: '20123456786',
        pais: 'CO',
        pais_id: 3,
      },
    };

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it.each([
    {
      pais: 'AR' as const,
      field: 'arca_environment',
      value: 'produccion',
    },
    {
      pais: 'CO' as const,
      field: 'dian_environment',
      value: 'PRODUCCION',
    },
  ])(
    'bloquea $field productivo para una demo $pais antes del writer',
    async ({ pais, field, value }) => {
      const { interceptor, context, next } = build(
        pais,
        '/api/configuration/complete',
        { method: 'POST' },
      );
      context.switchToHttp().getRequest().body = {
        configuration: { [field]: value },
      };

      await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(next.handle).not.toHaveBeenCalled();
    },
  );

  it.each([
    { pais: 'AR' as const, field: 'arca_environment', value: 'HOMOLOGACION' },
    { pais: 'CO' as const, field: 'dian_environment', value: 'homologacion' },
  ])(
    'permite repetir $field canónico de la demo $pais sin sensibilidad a mayúsculas',
    async ({ pais, field, value }) => {
      const { interceptor, context, next } = build(
        pais,
        '/api/configuration/empresa',
        { method: 'PUT' },
      );
      context.switchToHttp().getRequest().body = { [field]: value };

      await expect(
        firstValueFrom(await interceptor.intercept(context, next)),
      ).resolves.toEqual({ success: true });
      expect(next.handle).toHaveBeenCalledTimes(1);
    },
  );

  it('permite guardar datos no fiscales y repetir la identidad canónica de la demo', async () => {
    const { interceptor, context, next } = build(
      'PE',
      '/api/configuration/empresa',
      { method: 'PUT' },
    );
    context.switchToHttp().getRequest().body = {
      ruc: '20123456786',
      pais: 'PE',
      pais_id: 1,
      nombreComercial: 'Demo actualizada',
    };

    await expect(
      firstValueFrom(await interceptor.intercept(context, next)),
    ).resolves.toEqual({ success: true });
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('una demo PE en producción tampoco puede atravesar el simulador local', async () => {
    const { interceptor, context, next } = build(
      'PE',
      '/api/cpe/comprobantes/cpe-1/enviar-sunat',
      { empresa: { sunat_environment: 'produccion' } },
    );

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });
});
