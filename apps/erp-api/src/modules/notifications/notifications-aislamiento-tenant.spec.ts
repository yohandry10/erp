import { NotificationsService } from './notifications.service';

/**
 * Los roles que deciden el acceso a una notificación son los del tenant activo.
 *
 * `getUserRoleIds` recibía el tenant y no lo usaba: consultaba `user_roles` sólo
 * por usuario. Un mismo usuario puede pertenecer a varios tenants —el
 * `TenantSwitcher` del frontend existe justo para eso—, así que los roles de uno
 * decidían el acceso a las notificaciones de otro.
 *
 * Hoy no hay ningún usuario en dos tenants en producción, de modo que no estaba
 * ocurriendo; pero es un camino soportado, no hipotético.
 */
describe('NotificationsService: los roles se leen del tenant activo', () => {
  const USUARIO = 'usuario-1';
  const TENANT_A = 'tenant-a';

  function construir() {
    const filtros: Array<[string, unknown]> = [];

    const from = jest.fn((tabla: string) => {
      const chain: any = {
        select: () => chain,
        eq: (columna: string, valor: unknown) => {
          if (tabla === 'user_roles') filtros.push([columna, valor]);
          return chain;
        },
        in: () => chain,
        then: (resolver: any) => resolver({ data: [{ role_id: 'rol-de-a' }], error: null }),
      };
      return chain;
    });

    const servicio = new NotificationsService(
      { getClient: () => ({ from }) } as any,
      {} as any,
    );
    return { servicio, filtros };
  }

  it('filtra user_roles por usuario y por tenant', async () => {
    const { servicio, filtros } = construir();

    await servicio.getUserRoleIds(TENANT_A, USUARIO);

    const columnas = filtros.map(([columna]) => columna);
    expect(columnas).toContain('usuario_sistema_id');
    expect(columnas).toContain('tenant_id');
    expect(filtros).toContainEqual(['tenant_id', TENANT_A]);
  });

  it('no ignora el tenant que recibe como parámetro', async () => {
    const { servicio, filtros } = construir();

    await servicio.getUserRoleIds('tenant-b', USUARIO);

    expect(filtros).toContainEqual(['tenant_id', 'tenant-b']);
  });
});
