import { NotFoundException } from "@nestjs/common";
import { ContabilidadEventosController } from "./contabilidad-eventos.controller";
import { OutboxEventsService } from "../services/outbox-events.service";
import { AsientosGeneratorService } from "../services/asientos-generator.service";

describe("ContabilidadEventosController", () => {
  const tenantId = "tenant-492";
  const actorId = "actor-492";
  const eventId = "event-492";

  let controller: ContabilidadEventosController;
  let outboxEventsService: {
    obtenerEstadisticasEventos: jest.Mock;
    leerEventosFallidos: jest.Mock;
    leerEventosDeadLetter: jest.Mock;
  };
  let asientosGeneratorService: {
    reiniciarEventoFallido: jest.Mock;
    obtenerEstadisticasEventosFallidos: jest.Mock;
  };
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    outboxEventsService = {
      obtenerEstadisticasEventos: jest.fn(),
      leerEventosFallidos: jest.fn(),
      leerEventosDeadLetter: jest.fn(),
    };
    asientosGeneratorService = {
      reiniciarEventoFallido: jest.fn(),
      obtenerEstadisticasEventosFallidos: jest.fn(),
    };
    controller = new ContabilidadEventosController(
      outboxEventsService as unknown as OutboxEventsService,
      asientosGeneratorService as unknown as AsientosGeneratorService,
    );
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("reenvía tenant y actor al consultar estadísticas", async () => {
    const stats = {
      pending: 1,
      processed: 2,
      processed_today: 1,
      failed: 0,
      dead_letter: 0,
      avg_processing_time_ms: 12,
    };
    outboxEventsService.obtenerEstadisticasEventos.mockResolvedValue(stats);

    const result = await controller.getEstadisticasEventos(tenantId, actorId);

    expect(outboxEventsService.obtenerEstadisticasEventos).toHaveBeenCalledWith(
      tenantId,
      actorId,
    );
    expect(result).toEqual(
      expect.objectContaining({ success: true, data: stats }),
    );
  });

  it("propaga un fallo de estadísticas en vez de mostrar ceros falsos", async () => {
    outboxEventsService.obtenerEstadisticasEventos.mockRejectedValue(
      new Error("OUTBOX_STATS_UNAVAILABLE"),
    );

    await expect(
      controller.getEstadisticasEventos(tenantId, actorId),
    ).rejects.toThrow("OUTBOX_STATS_UNAVAILABLE");
  });

  it("reenvía tenant, actor y límite al listar eventos fallidos", async () => {
    const events = [{ event_id: eventId }];
    outboxEventsService.leerEventosFallidos.mockResolvedValue(events);

    const result = await controller.getEventosFallidos(tenantId, actorId, 25);

    expect(outboxEventsService.leerEventosFallidos).toHaveBeenCalledWith(
      tenantId,
      actorId,
      25,
    );
    expect(result).toEqual(
      expect.objectContaining({ success: true, data: events }),
    );
  });

  it("propaga un fallo del listado en vez de devolver una lista vacía falsa", async () => {
    outboxEventsService.leerEventosFallidos.mockRejectedValue(
      new Error("OUTBOX_LIST_UNAVAILABLE"),
    );

    await expect(
      controller.getEventosFallidos(tenantId, actorId, 25),
    ).rejects.toThrow("OUTBOX_LIST_UNAVAILABLE");
  });

  it("aplica el límite por defecto en dead letter sin perder tenant ni actor", async () => {
    outboxEventsService.leerEventosDeadLetter.mockResolvedValue([]);

    await controller.getEventosDeadLetter(tenantId, actorId, undefined);

    expect(outboxEventsService.leerEventosDeadLetter).toHaveBeenCalledWith(
      tenantId,
      actorId,
      100,
    );
  });

  it("reenvía tenant y actor al consultar estadísticas fallidas", async () => {
    const stats = { total_fallidos: 2, total_dead_letter: 1, por_tipo: {} };
    asientosGeneratorService.obtenerEstadisticasEventosFallidos.mockResolvedValue(
      stats,
    );

    const result = await controller.getEstadisticasEventosFallidos(
      tenantId,
      actorId,
    );

    expect(
      asientosGeneratorService.obtenerEstadisticasEventosFallidos,
    ).toHaveBeenCalledWith(tenantId, actorId);
    expect(result).toEqual(
      expect.objectContaining({ success: true, data: stats }),
    );
  });

  it("confirma el retry sólo cuando el RPC actualizó el evento", async () => {
    asientosGeneratorService.reiniciarEventoFallido.mockResolvedValue(true);

    const result = await controller.reintentarEvento(
      tenantId,
      actorId,
      eventId,
    );

    expect(
      asientosGeneratorService.reiniciarEventoFallido,
    ).toHaveBeenCalledWith(tenantId, actorId, eventId);
    expect(result).toEqual({
      success: true,
      data: { eventId, reiniciado: true },
      message: "Evento reiniciado para reprocesamiento",
    });
  });

  it("rechaza como no encontrado cuando el evento no es reintentable", async () => {
    asientosGeneratorService.reiniciarEventoFallido.mockResolvedValue(false);

    await expect(
      controller.reintentarEvento(tenantId, actorId, eventId),
    ).rejects.toThrow(NotFoundException);
  });

  it("propaga el error cuando el RPC de retry falla", async () => {
    asientosGeneratorService.reiniciarEventoFallido.mockRejectedValue(
      new Error("OUTBOX_ACTOR_FORBIDDEN"),
    );

    await expect(
      controller.reintentarEvento(tenantId, actorId, eventId),
    ).rejects.toThrow("OUTBOX_ACTOR_FORBIDDEN");
  });
});
