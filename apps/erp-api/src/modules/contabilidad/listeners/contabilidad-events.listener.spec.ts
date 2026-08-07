import { Test, TestingModule } from "@nestjs/testing";
import { ContabilidadEventsListener } from "./contabilidad-events.listener";
import { AsientosGeneratorService } from "../services/asientos-generator.service";
import {
  OutboxEventsService,
  OutboxEvent,
} from "../services/outbox-events.service";
import { EventBusService } from "../../../shared/events/event-bus.service";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { TaxCalculatorService } from "../../../shared/utils/tax-calculator";
import { TenantContextService } from "../../../shared/tenant/tenant-context.service";

describe("ContabilidadEventsListener", () => {
  let listener: ContabilidadEventsListener;
  let asientosGenerator: jest.Mocked<AsientosGeneratorService>;
  let outboxEventsService: jest.Mocked<OutboxEventsService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    const mockAsientosGenerator = {
      generarAsientoVenta: jest.fn(),
      generarAsientoCobro: jest.fn(),
      generarAsientoCompra: jest.fn(),
      generarAsientoRecepcion: jest.fn(),
      generarAsientoFacturaProveedor: jest.fn(),
      generarAsientoPago: jest.fn(),
      generarAsientoAjusteInventario: jest.fn(),
      generarAsientoPlanilla: jest.fn(),
      generarAsientoDepreciacion: jest.fn(),
      generarAsientoDevolucionProveedor: jest.fn(),
      generarAsientoNotaCredito: jest.fn(),
      marcarEventoComoProcesado: jest.fn(),
      marcarEventoComoFallido: jest.fn(),
    };

    const mockOutboxEventsService = {
      leerEventosPendientesConReintentos: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContabilidadEventsListener,
        {
          provide: AsientosGeneratorService,
          useValue: mockAsientosGenerator,
        },
        {
          provide: OutboxEventsService,
          useValue: mockOutboxEventsService,
        },
        {
          provide: EventBusService,
          useValue: {
            onVentaProcessed: jest.fn(),
            on: jest.fn(),
            onRecepcionRegistrada: jest.fn(),
            onCuentaPorCobrarCreadaEvent: jest.fn(),
            onPagoProveedorRegistrado: jest.fn(),
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            getNetworkBackoffRemainingMs: jest.fn().mockReturnValue(0),
            getClient: jest.fn().mockReturnValue({
              from: jest.fn().mockReturnThis(),
              insert: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              update: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              in: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              // `limit` se usa de dos formas: awaited directo (detalles) y encadenado
              // con .maybeSingle() por el dedupe de referencia, que debe resolver vacío
              // (sin asiento previo) para que el handler genere el asiento.
              limit: jest.fn().mockReturnValue({
                then: (resolve: (v: any) => any) =>
                  Promise.resolve({
                    data: [{ id: "detalle-1" }],
                    error: null,
                  }).then(resolve),
                maybeSingle: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
              single: jest
                .fn()
                .mockResolvedValue({ data: { id: "test-id" }, error: null }),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: "asiento-1",
                  event_id: "evt-claimed",
                  numero_asiento: "A-001",
                  total_debe: 100,
                  total_haber: 100,
                  estado: "CONFIRMADO",
                },
                error: null,
              }),
            }),
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            run: async <T>(ctx: any, cb: () => T | Promise<T>) => cb(),
            getContext: () => ({ tenantId: "tenant-001" }),
          },
        },
        {
          provide: TaxCalculatorService,
          useValue: {
            calculateTax: jest.fn(),
            calcularSubtotalDesdeTotal: jest.fn().mockResolvedValue(100),
          },
        },
      ],
    }).compile();

    testingModule = module;

    const noopLogger = {
      log: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
      verbose: () => {},
      setContext: () => {},
    };
    module.useLogger(noopLogger as any);

    listener = module.get<ContabilidadEventsListener>(
      ContabilidadEventsListener,
    );
    asientosGenerator = module.get(AsientosGeneratorService);
    outboxEventsService = module.get(OutboxEventsService);
  });

  afterEach(async () => {
    if (testingModule) {
      await testingModule.close();
    }
  });

  it("should be defined", () => {
    expect(listener).toBeDefined();
  });

  it("normaliza referencias fiscales para deduplicar eventos de la misma venta", () => {
    expect((listener as any).normalizarReferenciaComprobante("f001-1")).toBe(
      "F001-00000001",
    );
    expect(
      (listener as any).variantesReferenciaComprobante("F001-00000001"),
    ).toEqual(expect.arrayContaining(["F001-00000001", "F001-1"]));
  });

  describe("procesarEventosPendientes", () => {
    it("should process pending events successfully", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-001",
          correlation_id: "corr-001",
          aggregate_type: "venta",
          aggregate_id: "venta-001",
          event_type: "venta.procesada",
          event_data: {
            tenantId: "tenant-001",
            fecha: "2025-01-15",
            total: 118,
            subtotal: 100,
            impuestos: 18,
            costo_ventas: 60,
            numeroTicket: "T-001",
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoVenta.mockResolvedValue({
        id: "asiento-001",
        tenant_id: "tenant-001",
        numero_asiento: 1,
        codigo: "A-202501-000001",
        fecha: "2025-01-15",
        concepto: "Venta de mercadería",
        total_debe: 118,
        total_haber: 118,
        estado: "CONFIRMADO",
      });

      await listener.procesarEventosPendientes();

      expect(
        outboxEventsService.leerEventosPendientesConReintentos,
      ).toHaveBeenCalledWith(3, 50);
      expect(asientosGenerator.generarAsientoVenta).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          total: 118,
          event_id: "evt-001",
        }),
      );
    });

    it("should handle no pending events", async () => {
      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        [],
      );

      await listener.procesarEventosPendientes();

      expect(
        outboxEventsService.leerEventosPendientesConReintentos,
      ).toHaveBeenCalled();
      expect(asientosGenerator.generarAsientoVenta).not.toHaveBeenCalled();
    });

    it("should mark event as failed on error with retry message", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-002",
          correlation_id: "corr-002",
          aggregate_type: "venta",
          aggregate_id: "venta-002",
          event_type: "venta.procesada",
          event_data: {
            tenantId: "tenant-001",
            fecha: "2025-01-15",
            total: 118,
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoVenta.mockRejectedValue(
        new Error("Test error"),
      );

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.marcarEventoComoFallido).toHaveBeenCalledWith(
        "evt-002",
        "Test error - Se reintentará",
      );
    });

    it("continúa con el siguiente evento contable cuando uno falla", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-fails",
          correlation_id: "corr-fails",
          aggregate_type: "venta",
          aggregate_id: "venta-fails",
          event_type: "venta.procesada",
          event_data: {
            tenantId: "tenant-001",
            fecha: "2025-01-15",
            total: 118,
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
        {
          id: "2",
          event_id: "evt-continues",
          correlation_id: "corr-continues",
          aggregate_type: "venta",
          aggregate_id: "venta-continues",
          event_type: "venta.procesada",
          event_data: {
            tenantId: "tenant-001",
            fecha: "2025-01-15",
            total: 118,
          },
          event_version: 1,
          created_at: "2025-01-15T10:01:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoVenta
        .mockRejectedValueOnce(new Error("Lock temporal"))
        .mockResolvedValueOnce({
          id: "asiento-continues",
          tenant_id: "tenant-001",
          numero_asiento: 2,
          codigo: "A-202501-000002",
          fecha: "2025-01-15",
          concepto: "Venta de mercadería",
          total_debe: 118,
          total_haber: 118,
          estado: "CONFIRMADO",
        } as any);

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.marcarEventoComoFallido).toHaveBeenCalledWith(
        "evt-fails",
        "Lock temporal - Se reintentará",
      );
      expect(asientosGenerator.generarAsientoVenta).toHaveBeenCalledTimes(2);
      expect(asientosGenerator.marcarEventoComoProcesado).toHaveBeenCalledWith(
        "evt-continues",
      );
    });

    it("should mark event as permanently failed after max retries", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-007",
          correlation_id: "corr-007",
          aggregate_type: "venta",
          aggregate_id: "venta-007",
          event_type: "venta.procesada",
          event_data: {
            tenantId: "tenant-001",
            fecha: "2025-01-15",
            total: 118,
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 2, // Already retried twice
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoVenta.mockRejectedValue(
        new Error("Test error"),
      );

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.marcarEventoComoFallido).toHaveBeenCalledWith(
        "evt-007",
        "Test error - Máximo de reintentos alcanzado",
      );
    });

    it("should mark event as permanently failed for non-retryable errors", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-008",
          correlation_id: "corr-008",
          aggregate_type: "venta",
          aggregate_id: "venta-008",
          event_type: "venta.procesada",
          event_data: {
            tenantId: "tenant-001",
            fecha: "2025-01-15",
            total: 118,
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoVenta.mockRejectedValue(
        new Error("Período contable cerrado"),
      );

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.marcarEventoComoFallido).toHaveBeenCalledWith(
        "evt-008",
        "Período contable cerrado - Error no recuperable",
      );
    });

    it("should leave non-accounting operational events to the general outbox worker", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-pos-operational",
          correlation_id: "corr-operational",
          aggregate_type: "operational",
          aggregate_id: "op-001",
          event_type: "venta_pos.registrada",
          event_data: {
            tenantId: "tenant-001",
            total: 59,
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoVenta).not.toHaveBeenCalled();
      expect(asientosGenerator.marcarEventoComoFallido).not.toHaveBeenCalled();
    });

    it("should account for a supplier invoice separately from the receipt", async () => {
      const operationalEvent: OutboxEvent = {
        id: "1",
        event_id: "evt-operational-cxp",
        correlation_id: "corr-operational-cxp",
        aggregate_type: "compras",
        aggregate_id: "oc-001",
        event_type: "factura.proveedor.registrada",
        event_data: {
          tenantId: "tenant-001",
          numeroDocumento: "F001-99",
          fechaEmision: "2026-05-14",
          subtotal: 100,
          igv: 18,
          total: 118,
          recepcionId: "rec-1",
        },
        event_version: 1,
        created_at: "2026-05-14T10:00:00Z",
        processed_at: null,
        retry_count: 0,
        status: "PENDING",
        error_message: null,
      };

      asientosGenerator.generarAsientoFacturaProveedor.mockResolvedValue({
        id: "asiento-fp-1",
      } as any);
      await (listener as any).procesarEvento(operationalEvent);

      expect(asientosGenerator.generarAsientoFacturaProveedor).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          subtotal: 100,
          igv: 18,
          total: 118,
          recepcion_id: "rec-1",
        }),
      );
    });
  });

  describe("event handlers", () => {
    it("should handle cobro registrado event", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-003",
          correlation_id: "corr-003",
          aggregate_type: "cobro",
          aggregate_id: "cobro-001",
          event_type: "cobro.registrado",
          event_data: {
            tenantId: "tenant-001",
            fecha: "2025-01-15",
            monto: 100,
            numeroDocumento: "COB-001",
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoCobro.mockResolvedValue({
        id: "asiento-002",
        tenant_id: "tenant-001",
        numero_asiento: 2,
        codigo: "A-202501-000002",
        fecha: "2025-01-15",
        concepto: "Cobro de factura",
        total_debe: 100,
        total_haber: 100,
        estado: "CONFIRMADO",
      });

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoCobro).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          monto: 100,
          event_id: "evt-003",
        }),
      );
    });

    it("should handle recepcion registrada event", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-004",
          correlation_id: "corr-004",
          aggregate_type: "recepcion",
          aggregate_id: "recepcion-001",
          event_type: "recepcion.registrada",
          event_data: {
            tenantId: "tenant-001",
            fechaRecepcion: "2025-01-15",
            total: 118,
            subtotal: 100,
            igv: 18,
            numeroRecepcion: "REC-001",
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoRecepcion.mockResolvedValue({
        id: "asiento-003",
        tenant_id: "tenant-001",
        numero_asiento: 3,
        codigo: "A-202501-000003",
        fecha: "2025-01-15",
        concepto: "Compra de mercadería",
        total_debe: 118,
        total_haber: 118,
        estado: "CONFIRMADO",
      });

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoRecepcion).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          costo: 100,
          event_id: "evt-004",
        }),
      );
    });

    it("should use partial reception amounts when present", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-004-partial",
          correlation_id: "corr-004-partial",
          aggregate_type: "recepcion",
          aggregate_id: "recepcion-001",
          event_type: "recepcion.registrada",
          event_data: {
            tenantId: "tenant-001",
            fechaRecepcion: "2025-01-15",
            total: 236,
            subtotal: 200,
            igv: 36,
            totalParcial: 118,
            subtotalParcial: 100,
            igvParcial: 18,
            numeroRecepcion: "REC-001",
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoRecepcion.mockResolvedValue({
        id: "asiento-003",
        tenant_id: "tenant-001",
        numero_asiento: 3,
        codigo: "A-202501-000003",
        fecha: "2025-01-15",
        concepto: "Compra de mercadería",
        total_debe: 118,
        total_haber: 118,
        estado: "CONFIRMADO",
      });

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoRecepcion).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          costo: 100,
          event_id: "evt-004-partial",
        }),
      );
    });

    it("should fail a reception event when accounting idempotency is corrupted by duplicate entries", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-004-duplicado",
          correlation_id: "corr-004-duplicado",
          aggregate_type: "recepcion",
          aggregate_id: "recepcion-001",
          event_type: "recepcion.registrada",
          event_data: {
            tenantId: "tenant-001",
            fechaRecepcion: "2025-01-15",
            total: 118,
            subtotal: 100,
            igv: 18,
            numeroRecepcion: "REC-001",
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoRecepcion.mockResolvedValue({
        id: "asiento-003",
        tenant_id: "tenant-001",
        numero_asiento: 3,
        codigo: "A-202501-000003",
        fecha: "2025-01-15",
        concepto: "Compra de mercadería",
        total_debe: 118,
        total_haber: 118,
        estado: "CONFIRMADO",
      });

      const supabaseClient = (
        testingModule.get(SupabaseService).getClient as jest.Mock
      )();
      supabaseClient.maybeSingle
        .mockResolvedValueOnce({
          data: { event_id: "evt-004-duplicado" },
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: {
            code: "PGRST116",
            details:
              "Results contain 3 rows, application/vnd.pgrst.object+json requires 1 row",
            message: "JSON object requested, multiple (or no) rows returned",
          },
        });

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.marcarEventoComoFallido).toHaveBeenCalledWith(
        "evt-004-duplicado",
        expect.stringContaining("Idempotencia contable corrupta"),
      );
    });

    it("should handle pago proveedor event", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-005",
          correlation_id: "corr-005",
          aggregate_type: "pago",
          aggregate_id: "pago-001",
          event_type: "pago.proveedor.registrado",
          event_data: {
            tenantId: "tenant-001",
            fechaPago: "2025-01-15",
            monto: 100,
            numeroDocumento: "PAG-001",
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoPago.mockResolvedValue({
        id: "asiento-004",
        tenant_id: "tenant-001",
        numero_asiento: 4,
        codigo: "A-202501-000004",
        fecha: "2025-01-15",
        concepto: "Pago a proveedor",
        total_debe: 100,
        total_haber: 100,
        estado: "CONFIRMADO",
      });

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoPago).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          monto: 100,
          event_id: "evt-005",
        }),
      );
    });

    it("should handle devolucion proveedor event", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-011",
          correlation_id: "corr-011",
          aggregate_type: "devolucion",
          aggregate_id: "dev-001",
          event_type: "devolucion.proveedor.registrada",
          event_data: {
            tenantId: "tenant-001",
            fechaDevolucion: "2025-01-20",
            subtotal: 150,
            igv: 27,
            total: 177,
            numeroDevolucion: "DEV-001",
          },
          event_version: 1,
          created_at: "2025-01-20T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoDevolucionProveedor.mockResolvedValue({
        id: "asiento-005",
        numero_asiento: "A-202501-0005",
      } as any);

      await listener.procesarEventosPendientes();

      expect(
        asientosGenerator.generarAsientoDevolucionProveedor,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          subtotal: 150,
          igv: 27,
          total: 177,
          referencia: "DEV-001",
          event_id: "evt-011",
        }),
      );
    });

    it("should handle ajuste inventario event", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-007",
          correlation_id: "corr-007",
          aggregate_type: "ajuste",
          aggregate_id: "aj-001",
          event_type: "ajuste.inventario.aplicado",
          event_data: {
            tenantId: "tenant-001",
            valor: 50,
            tipo: "SOBRANTE",
            referencia: "AJ-001",
          },
          event_version: 1,
          created_at: "2025-01-21T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoAjusteInventario.mockResolvedValue({
        id: "asiento-006",
        numero_asiento: "A-202501-0006",
      } as any);

      await listener.procesarEventosPendientes();

      expect(
        asientosGenerator.generarAsientoAjusteInventario,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          valor: 50,
          tipo: "SOBRANTE",
          referencia: "AJ-001",
          event_id: "evt-007",
        }),
      );
    });

    it("should handle planilla liquidada event", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-008",
          correlation_id: "corr-008",
          aggregate_type: "planilla",
          aggregate_id: "plan-001",
          event_type: "planilla.liquidada",
          event_data: {
            tenantId: "tenant-001",
            planillaId: "plan-001",
            eventId: "payload-event-should-not-own-accounting-id",
            fecha: "2025-01-31",
            sueldos: 1000,
            aportes: 200,
            retenciones: 150,
            neto: 850,
          },
          event_version: 1,
          created_at: "2025-01-31T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoPlanilla.mockResolvedValue({
        id: "asiento-007",
        numero_asiento: "A-202501-0007",
      } as any);

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoPlanilla).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          sueldos: 1000,
          retenciones: 150,
          neto: 850,
          referencia: "PLANILLA-plan-001",
          source_event_id: "evt-008",
          event_id: "evt-008",
        }),
      );
    });

    it("should handle depreciacion generada event", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-009",
          correlation_id: "corr-009",
          aggregate_type: "depreciacion",
          aggregate_id: "dep-001",
          event_type: "depreciacion.generada",
          event_data: {
            tenantId: "tenant-001",
            fecha: "2025-02-01",
            monto: 500,
            referencia: "ACT-001",
          },
          event_version: 1,
          created_at: "2025-02-01T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoDepreciacion.mockResolvedValue({
        id: "asiento-008",
        numero_asiento: "A-202502-0001",
      } as any);

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoDepreciacion).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          monto: 500,
          referencia: "ACT-001",
          event_id: "evt-009",
        }),
      );
    });

    it("should handle cpe anulado event and generate reversal", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-010",
          correlation_id: "corr-010",
          aggregate_type: "cpe",
          aggregate_id: "cpe-001",
          event_type: "cpe.anulado",
          event_data: {
            tenantId: "tenant-001",
            total: 118,
            serie: "F001",
            numero: "000123",
            motivo: "Cliente solicitó",
            centro_costo_id: "cc-1",
          },
          event_version: 1,
          created_at: "2025-02-05T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );
      asientosGenerator.generarAsientoNotaCredito.mockResolvedValue({
        id: "asiento-009",
        numero_asiento: "A-202502-0002",
      } as any);

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoNotaCredito).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-001",
          total: 118,
          referencia: "REV-F001-000123",
          event_id: "evt-010",
        }),
      );
    });

    it("should ignore unknown event types", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-012",
          correlation_id: "corr-012",
          aggregate_type: "unknown",
          aggregate_id: "unknown-001",
          event_type: "unknown.event",
          event_data: {},
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoVenta).not.toHaveBeenCalled();
      expect(asientosGenerator.generarAsientoCobro).not.toHaveBeenCalled();
      expect(asientosGenerator.marcarEventoComoFallido).not.toHaveBeenCalled();
    });

    it("should not process an accounting event when another worker already claimed it", async () => {
      const mockEventos: OutboxEvent[] = [
        {
          id: "1",
          event_id: "evt-claimed-by-other",
          correlation_id: "corr-claimed-by-other",
          aggregate_type: "cxc",
          aggregate_id: "cxc-001",
          event_type: "cxc.creada",
          event_data: {
            tenantId: "tenant-001",
            fechaEmision: "2025-01-15",
            montoTotal: 118,
            subtotal: 100,
            impuestos: 18,
            serie: "F001",
            numero: "000001",
          },
          event_version: 1,
          created_at: "2025-01-15T10:00:00Z",
          processed_at: null,
          retry_count: 0,
          status: "PENDING",
          error_message: null,
        },
      ];

      const supabaseClient = (
        testingModule.get(SupabaseService).getClient as jest.Mock
      )();
      supabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      outboxEventsService.leerEventosPendientesConReintentos.mockResolvedValue(
        mockEventos,
      );

      await listener.procesarEventosPendientes();

      expect(asientosGenerator.generarAsientoVenta).not.toHaveBeenCalled();
      expect(
        asientosGenerator.generarAsientoNotaCredito,
      ).not.toHaveBeenCalled();
      expect(asientosGenerator.marcarEventoComoFallido).not.toHaveBeenCalled();
    });
  });
});
