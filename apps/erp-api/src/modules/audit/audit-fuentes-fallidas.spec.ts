import { AuditService } from './audit.service';

/**
 * Una traza de auditoría incompleta tiene que decir que lo está.
 *
 * La vista unificada junta la tabla de auditoría con cuatro fuentes más —intentos
 * de login, caja, POS e integraciones—. Cada una iba en su `try`, y al fallar se
 * escribía un aviso por consola y se seguía: la respuesta salía con la misma
 * forma que una traza completa. Quien audita no podía distinguir «no hubo
 * intentos de login» de «no se pudieron leer», que en una auditoría es
 * exactamente la distinción que importa.
 *
 * Se sigue devolviendo lo que sí se pudo cargar —media traza es útil— pero el
 * hueco viaja declarado en `fuentes_fallidas`.
 */
describe('AuditService: la traza declara sus huecos', () => {
  const TENANT = 'tenant-audit';

  function construir(opciones: { fallaLogin?: boolean } = {}) {
    const from = jest.fn((tabla: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        ilike: () => chain,
        or: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        range: async () => ({ data: [], count: 0, error: null }),
        then: undefined,
      };

      if (tabla === 'auth_login_attempts' && opciones.fallaLogin) {
        chain.order = () => {
          throw new Error('conexión perdida con auth_login_attempts');
        };
      }
      return chain;
    });

    return new AuditService({ getClient: () => ({ from }) } as any);
  }

  it('no declara huecos cuando todas las fuentes responden', async () => {
    const servicio = construir();
    const resultado: any = await servicio.getAuditLogs(TENANT, {} as any);
    expect(resultado.fuentes_fallidas).toEqual([]);
  });

  it('declara la fuente que no se pudo leer en vez de omitirla en silencio', async () => {
    const servicio = construir({ fallaLogin: true });
    const resultado: any = await servicio.getAuditLogs(TENANT, {} as any);
    expect(resultado.fuentes_fallidas).toContain('auth_login_attempts');
  });

  it('sigue devolviendo la parte de la traza que sí se pudo cargar', async () => {
    const servicio = construir({ fallaLogin: true });
    const resultado: any = await servicio.getAuditLogs(TENANT, {} as any);
    expect(Array.isArray(resultado.data)).toBe(true);
    expect(resultado.pagination).toBeDefined();
  });
});
