import { ForbiddenException } from '@nestjs/common';
import { ConsolidacionReportesService } from './consolidacion-reportes.service';

/**
 * Rechazar una invitación de consolidación termina la relación.
 *
 * Un grupo de consolidación cruza empresas a propósito: la controladora invita,
 * la invitada acepta, y sólo entonces se leen sus cifras. Esa parte está bien
 * resuelta —`responder_invitacion_consolidacion_tx` exige `tenant_id =
 * p_tenant_id`, así que sólo la invitada acepta, y los informes filtran por
 * `estado = 'ACTIVO'` antes de tocar datos ajenos—.
 *
 * Lo que no estaba resuelto es el estado intermedio: `obtenerGrupo` se
 * conformaba con que existiera *cualquier* fila de membresía. Una empresa que
 * había rechazado la invitación seguía viendo el RUC, la razón social y el
 * nombre comercial de todas las demás del grupo, indefinidamente. No son cifras,
 * pero tampoco es información que un «no» deba dejar abierta.
 *
 * Pendiente sí ve el listado: es lo que permite decidir si aceptar.
 */
describe('ConsolidacionReportesService: membresía y visibilidad del grupo', () => {
  const GRUPO = 'grupo-1';
  const CONTROLADORA = 'tenant-controladora';
  const INVITADA = 'tenant-invitada';

  function construir(estadoMembresia: string | null) {
    const from = (tabla: string) => {
      const cadena: any = {
        select: () => cadena,
        eq: () => cadena,
        in: () => cadena,
        or: () => cadena,
        order: () => cadena,
        maybeSingle: async () =>
          tabla === 'grupos_consolidacion'
            ? { data: { id: GRUPO, tenant_id: CONTROLADORA, nombre: 'Grupo' }, error: null }
            : { data: estadoMembresia ? { estado: estadoMembresia } : null, error: null },
        then: (r: any) => r({ data: [], error: null }),
      };
      return cadena;
    };
    return new ConsolidacionReportesService({ getClient: () => ({ from }) } as any);
  }

  it('la controladora ve su propio grupo', async () => {
    const grupo = await construir(null).obtenerGrupo(CONTROLADORA, GRUPO);
    expect(grupo.es_controladora).toBe(true);
  });

  it('una invitación pendiente puede ver el grupo, para poder decidir', async () => {
    const grupo = await construir('PENDIENTE').obtenerGrupo(INVITADA, GRUPO);
    expect(grupo.es_controladora).toBe(false);
  });

  it('un miembro activo ve el grupo', async () => {
    const grupo = await construir('ACTIVO').obtenerGrupo(INVITADA, GRUPO);
    expect(grupo.es_controladora).toBe(false);
  });

  it('quien rechazó la invitación deja de ver el grupo', async () => {
    await expect(construir('RECHAZADO').obtenerGrupo(INVITADA, GRUPO)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('quien no tiene membresía tampoco', async () => {
    await expect(construir(null).obtenerGrupo(INVITADA, GRUPO)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
