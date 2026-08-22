import { PlantillasSchedulerService } from './plantillas-scheduler.service';
import { PlantillasAsientosService } from './plantillas-asientos.service';

describe('PlantillasSchedulerService', () => {
  const plantilla = { id: 'plantilla-1', tenant_id: 'tenant-1', proxima_ejecucion: '2026-08-20' };
  let plantillas: {
    obtenerVencidas: jest.Mock;
    generar: jest.Mock;
    avanzarAgenda: jest.Mock;
    fechaHoyDe: jest.Mock;
  };
  let scheduler: PlantillasSchedulerService;

  beforeEach(() => {
    plantillas = {
      obtenerVencidas: jest.fn().mockResolvedValue([plantilla]),
      generar: jest.fn().mockResolvedValue({ id: 'asiento-1' }),
      avanzarAgenda: jest.fn().mockResolvedValue(undefined),
      fechaHoyDe: jest.fn().mockResolvedValue('2026-08-20')
    };
    scheduler = new PlantillasSchedulerService(
      plantillas as unknown as PlantillasAsientosService
    );
  });

  it('genera y avanza una plantilla vencida', async () => {
    await scheduler.generarPlantillasVencidas();

    expect(plantillas.generar).toHaveBeenCalledWith(
      'tenant-1',
      'system',
      'plantilla-1',
      expect.objectContaining({ fecha: expect.any(String) }),
      true
    );
    expect(plantillas.avanzarAgenda).toHaveBeenCalledTimes(1);
  });

  it('no dispara una plantilla que aún no vence en el calendario del tenant', async () => {
    // El cron corre a las 02:00 UTC, que en Lima son las 21:00 del día anterior:
    // sin este filtro la plantilla se generaba un día antes y con fecha futura.
    plantillas.fechaHoyDe.mockResolvedValue('2026-08-19');

    await scheduler.generarPlantillasVencidas();

    expect(plantillas.generar).not.toHaveBeenCalled();
    expect(plantillas.avanzarAgenda).not.toHaveBeenCalled();
  });

  it('fecha el asiento con el día del tenant, no con el del servidor', async () => {
    plantillas.fechaHoyDe.mockResolvedValue('2026-08-20');

    await scheduler.generarPlantillasVencidas();

    expect(plantillas.generar).toHaveBeenCalledWith(
      'tenant-1',
      'system',
      'plantilla-1',
      { fecha: '2026-08-20' },
      true,
    );
  });

  it('recupera la agenda si el asiento del período ya existía', async () => {
    plantillas.generar.mockRejectedValue(
      new Error('La plantilla ya generó un asiento para el período 2026-08')
    );

    await scheduler.generarPlantillasVencidas();

    expect(plantillas.avanzarAgenda).toHaveBeenCalledWith(
      'tenant-1',
      'plantilla-1',
      expect.any(Date)
    );
  });

  it('no avanza la agenda ante un error contable real', async () => {
    plantillas.generar.mockRejectedValue(new Error('El período está cerrado'));

    await scheduler.generarPlantillasVencidas();

    expect(plantillas.avanzarAgenda).not.toHaveBeenCalled();
  });
});
