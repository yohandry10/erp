import { Test, TestingModule } from "@nestjs/testing";
import { OutboxEventsService } from "./outbox-events.service";
import { SupabaseService } from "../../../shared/supabase/supabase.service";

describe("OutboxEventsService", () => {
  let service: OutboxEventsService;
  let testingModule: TestingModule;

  const mockSupabaseService = {
    getClient: jest.fn(),
    getPublicClient: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxEventsService,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
      ],
    }).compile();

    const noopLogger = {
      log: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
      verbose: () => {},
      setContext: () => {},
    };
    module.useLogger(noopLogger as any);

    testingModule = module;
    service = module.get<OutboxEventsService>(OutboxEventsService);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (testingModule) {
      await testingModule.close();
    }
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("lecturas tenant-scoped", () => {
    const tenantId = "tenant-492";
    const actorId = "actor-492";

    it.each(["leerEventosFallidos", "obtenerEstadisticasEventos"] as const)(
      "%s conserva la denegación de acceso sin exponer errores SQL", async (method) => {
        mockSupabaseService.getClient.mockReturnValue({ rpc: jest.fn().mockResolvedValue({
          data: null, error: { code: "42501", message: "OUTBOX_ACTOR_NOT_ACTIVE_IN_TENANT" },
        }) });
        await expect(service[method](tenantId, actorId)).rejects.toMatchObject({
          status: 403,
          message: "La consulta de eventos requiere un usuario activo de esta empresa con permiso contable",
        });
      },
    );

    it.each(["leerEventosFallidos", "obtenerEstadisticasEventos"] as const)(
      "%s distingue una caída de la base de una lista vacía", async (method) => {
        mockSupabaseService.getClient.mockReturnValue({ rpc: jest.fn().mockResolvedValue({
          data: null, error: { code: "08006", message: "internal connection details" },
        }) });
        await expect(service[method](tenantId, actorId)).rejects.toMatchObject({ status: 503,
          message: "No se pudo consultar la cola contable. Inténtalo nuevamente" });
      },
    );

    it("lista eventos fallidos mediante el RPC con tenant y actor", async () => {
      const rpc = jest.fn().mockResolvedValue({
        data: [
          {
            id: "row-1",
            event_id: "event-1",
            payload: { total: 125 },
            status: "failed",
          },
        ],
        error: null,
      });
      mockSupabaseService.getClient.mockReturnValue({ rpc });

      const result = await service.leerEventosFallidos(tenantId, actorId, 25);

      expect(rpc).toHaveBeenCalledWith("list_tenant_outbox_events_492", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_statuses: ["failed"],
        p_limit: 25,
      });
      expect(mockSupabaseService.getPublicClient).not.toHaveBeenCalled();
      expect(result).toEqual([
        expect.objectContaining({
          event_id: "event-1",
          event_data: { total: 125 },
        }),
      ]);
    });

    it("lista dead letters mediante el mismo RPC y conserva el filtro", async () => {
      const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
      mockSupabaseService.getClient.mockReturnValue({ rpc });

      await expect(
        service.leerEventosDeadLetter(tenantId, actorId, 10),
      ).resolves.toEqual([]);

      expect(rpc).toHaveBeenCalledWith("list_tenant_outbox_events_492", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_statuses: ["dead_letter"],
        p_limit: 10,
      });
    });

    it("propaga el error del RPC de listado sin devolver una lista vacía falsa", async () => {
      const rpc = jest.fn().mockResolvedValue({
        data: null,
        error: { message: "actor fuera del tenant" },
      });
      mockSupabaseService.getClient.mockReturnValue({ rpc });

      await expect(
        service.leerEventosFallidos(tenantId, actorId),
      ).rejects.toThrow(
        "No se pudo consultar la cola contable. Inténtalo nuevamente",
      );
    });
  });

  describe("obtenerEstadisticasEventos", () => {
    const tenantId = "tenant-492";
    const actorId = "actor-492";

    it("obtiene estadísticas mediante el RPC con tenant y actor", async () => {
      const rpc = jest.fn().mockResolvedValue({
        data: {
          pending: "2",
          processed: 3,
          processed_today: "1",
          failed: 4,
          dead_letter: "5",
          avg_processing_time_ms: "18",
        },
        error: null,
      });
      mockSupabaseService.getClient.mockReturnValue({ rpc });

      const result = await service.obtenerEstadisticasEventos(
        tenantId,
        actorId,
      );

      expect(result).toEqual({
        pending: 2,
        processed: 3,
        processed_today: 1,
        failed: 4,
        dead_letter: 5,
        avg_processing_time_ms: 18,
      });
      expect(rpc).toHaveBeenCalledWith("outbox_tenant_stats_492", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
      });
      expect(mockSupabaseService.getPublicClient).not.toHaveBeenCalled();
    });

    it("devuelve estadísticas cero cuando el RPC no entrega payload", async () => {
      const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
      mockSupabaseService.getClient.mockReturnValue({ rpc });

      const result = await service.obtenerEstadisticasEventos(
        tenantId,
        actorId,
      );

      expect(result).toEqual({
        pending: 0,
        processed: 0,
        processed_today: 0,
        failed: 0,
        dead_letter: 0,
        avg_processing_time_ms: null,
      });
    });

    it("propaga el error del RPC de estadísticas", async () => {
      const rpc = jest.fn().mockResolvedValue({
        data: null,
        error: { message: "actor inválido" },
      });
      mockSupabaseService.getClient.mockReturnValue({ rpc });

      await expect(
        service.obtenerEstadisticasEventos(tenantId, actorId),
      ).rejects.toThrow("No se pudo consultar la cola contable. Inténtalo nuevamente");
    });
  });
});
