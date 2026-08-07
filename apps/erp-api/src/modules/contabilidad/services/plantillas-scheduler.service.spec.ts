import { PlantillasSchedulerService } from './plantillas-scheduler.service';
import { PlantillasAsientosService } from './plantillas-asientos.service';

describe('PlantillasSchedulerService', () => {
  const plantilla = { id: 'plantilla-1', tenant_id: 'tenant-1' };
  let plantillas: {
    obtenerVencidas: jest.Mock;
    generar: jest.Mock;
    avanzarAgenda: jest.Mock;
  };
  let scheduler: PlantillasSchedulerService;

  beforeEach(() => {
    plantillas = {
      obtenerVencidas: jest.fn().mockResolvedValue([plantilla]),
      generar: jest.fn().mockResolvedValue({ id: 'asiento-1' }),
      avanzarAgenda: jest.fn().mockResolvedValue(undefined)
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
