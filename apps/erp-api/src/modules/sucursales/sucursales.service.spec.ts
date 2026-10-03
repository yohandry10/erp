import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { SucursalesService } from "./sucursales.service";

describe("SucursalesService", () => {
  const buildSupabase = (handlers: Record<string, any>, rpc?: jest.Mock) => ({
    getClient: jest.fn(() => ({
      from: jest.fn((table: string) => handlers[table]),
      rpc: rpc ?? jest.fn(async () => ({ data: [], error: null })),
    })),
  });

  describe("codigoEstablecimientoDeSerie", () => {
    it("devuelve el establecimiento de la sucursal dueña de la serie", async () => {
      const seriesChain: any = {
        select: jest.fn(() => seriesChain),
        eq: jest.fn(() => seriesChain),
        limit: jest.fn(() => seriesChain),
        maybeSingle: jest.fn(async () => ({
          data: {
            sucursal_id: "suc-2",
            sucursales: { codigo_establecimiento: "0003" },
          },
          error: null,
        })),
      };

      const service = new SucursalesService(
        buildSupabase({ documento_series: seriesChain }) as any,
      );

      await expect(
        service.codigoEstablecimientoDeSerie("tenant-1", "F002"),
      ).resolves.toBe("0003");
      // La serie se normaliza antes de consultar: SUNAT las escribe en mayúsculas.
      expect(seriesChain.eq).toHaveBeenCalledWith("serie", "F002");
    });

    it("cae a la casa matriz cuando la serie no tiene sucursal enganchada", async () => {
      const seriesChain: any = {
        select: jest.fn(() => seriesChain),
        eq: jest.fn(() => seriesChain),
        limit: jest.fn(() => seriesChain),
        maybeSingle: jest.fn(async () => ({ data: null, error: null })),
      };
      const sucursalesChain: any = {
        select: jest.fn(() => sucursalesChain),
        eq: jest.fn(() => sucursalesChain),
        maybeSingle: jest.fn(async () => ({
          data: { codigo_establecimiento: "0000" },
          error: null,
        })),
      };

      const service = new SucursalesService(
        buildSupabase({
          documento_series: seriesChain,
          sucursales: sucursalesChain,
        }) as any,
      );

      await expect(
        service.codigoEstablecimientoDeSerie("tenant-1", "F900"),
      ).resolves.toBe("0000");
    });

    it("no consulta series cuando no le dan ninguna", async () => {
      const seriesChain: any = {
        select: jest.fn(() => seriesChain),
        eq: jest.fn(() => seriesChain),
        limit: jest.fn(() => seriesChain),
        maybeSingle: jest.fn(async () => ({ data: null, error: null })),
      };
      const sucursalesChain: any = {
        select: jest.fn(() => sucursalesChain),
        eq: jest.fn(() => sucursalesChain),
        maybeSingle: jest.fn(async () => ({
          data: { codigo_establecimiento: "0000" },
          error: null,
        })),
      };

      const service = new SucursalesService(
        buildSupabase({
          documento_series: seriesChain,
          sucursales: sucursalesChain,
        }) as any,
      );

      await expect(
        service.codigoEstablecimientoDeSerie("tenant-1", "   "),
      ).resolves.toBe("0000");
      expect(seriesChain.maybeSingle).not.toHaveBeenCalled();
    });
  });

  describe("escritor transaccional", () => {
    it.each([
      ["23505", ConflictException],
      ["42501", ForbiddenException],
      ["P0002", NotFoundException],
      ["22023", BadRequestException],
    ])("conserva el error HTTP de %s", async (code, exception) => {
      const rpc = jest.fn(async () => ({ data: null, error: { code } }));
      const service = new SucursalesService(buildSupabase({}, rpc) as any);
      await expect(
        service.asignarUsuario(
          "tenant-1",
          "user-1",
          { sucursal_ids: ["suc-2", "suc-1"] },
          "actor-1",
          "intent-1",
        ),
      ).rejects.toBeInstanceOf(exception as any);
    });

    it("normaliza el orden de una asignación y utiliza una sola frontera SQL", async () => {
      const rpc = jest.fn(async () => ({
        data: { sucursal_ids: ["suc-1", "suc-2"] },
        error: null,
      }));
      const service = new SucursalesService(buildSupabase({}, rpc) as any);
      await expect(
        service.asignarUsuario(
          "tenant-1",
          "user-1",
          { sucursal_ids: ["suc-2", "suc-1"] },
          "actor-1",
          "intent-1",
        ),
      ).resolves.toEqual(["suc-1", "suc-2"]);
      expect(rpc).toHaveBeenCalledWith("mutar_sucursal_tx", {
        p_tenant_id: "tenant-1",
        p_actor_id: "actor-1",
        p_idempotency_key: "intent-1",
        p_operation: "ASSIGN",
        p_record_id: "user-1",
        p_payload: { sucursal_ids: ["suc-1", "suc-2"] },
      });
    });
  });

  describe("listar", () => {
    it("restringe el listado a las sucursales que el usuario alcanza", async () => {
      const rpc = jest.fn(async () => ({
        data: [{ sucursal_id: "suc-1" }],
        error: null,
      }));
      const sucursalesChain: any = {
        select: jest.fn(() => sucursalesChain),
        eq: jest.fn(() => sucursalesChain),
        in: jest.fn(() => sucursalesChain),
        order: jest.fn(() => sucursalesChain),
      };
      sucursalesChain.then = (resolve: any) =>
        resolve({ data: [{ id: "suc-1" }], error: null });

      const service = new SucursalesService(
        buildSupabase({ sucursales: sucursalesChain }, rpc) as any,
      );

      await service.listar("tenant-1", "user-1");

      expect(rpc).toHaveBeenCalledWith("sucursales_visibles", {
        p_tenant_id: "tenant-1",
        p_usuario_sistema_id: "user-1",
      });
      expect(sucursalesChain.in).toHaveBeenCalledWith("id", ["suc-1"]);
    });
  });

  describe("resumen", () => {
    it("agrupa la actividad por establecimiento y deja en cero los que no vendieron", async () => {
      const rpc = jest.fn(async () => ({
        data: [{ sucursal_id: "suc-matriz" }, { sucursal_id: "suc-anexo" }],
        error: null,
      }));

      const sucursalesChain: any = {
        select: jest.fn(() => sucursalesChain),
        eq: jest.fn(() => sucursalesChain),
        in: jest.fn(() => sucursalesChain),
        order: jest.fn(() => sucursalesChain),
      };
      sucursalesChain.then = (resolve: any) =>
        resolve({
          data: [
            {
              id: "suc-matriz",
              nombre: "Casa matriz",
              codigo_establecimiento: "0000",
              es_principal: true,
            },
            {
              id: "suc-anexo",
              nombre: "Arequipa",
              codigo_establecimiento: "0001",
              es_principal: false,
            },
          ],
          error: null,
        });

      // Sólo el anexo vendió; la matriz tiene una caja abierta y nada más.
      const tablas: Record<string, any[]> = {
        ventas_pos: [
          { sucursal_id: "suc-anexo", total: 100.5 },
          { sucursal_id: "suc-anexo", total: 49.5 },
        ],
        documentos: [{ sucursal_id: "suc-anexo" }],
        sesiones_caja: [
          { sucursal_id: "suc-matriz", estado: "ABIERTA" },
          { sucursal_id: "suc-anexo", estado: "CERRADA" },
        ],
      };

      const construir = (tabla: string) => {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          in: jest.fn(() => chain),
          gte: jest.fn(() => chain),
          lte: jest.fn(() => chain),
        };
        chain.then = (resolve: any) =>
          resolve({ data: tablas[tabla] ?? [], error: null });
        return chain;
      };

      const supabase: any = {
        getClient: jest.fn(() => ({
          from: jest.fn((tabla: string) =>
            tabla === "sucursales" ? sucursalesChain : construir(tabla),
          ),
          rpc,
        })),
      };

      const service = new SucursalesService(supabase);
      const resumen = await service.resumen("tenant-1", "user-1");

      expect(resumen).toEqual([
        expect.objectContaining({
          codigo_establecimiento: "0000",
          ventas_pos_total: 0,
          ventas_pos_cantidad: 0,
          comprobantes_cantidad: 0,
          cajas_abiertas: 1,
        }),
        expect.objectContaining({
          codigo_establecimiento: "0001",
          ventas_pos_total: 150,
          ventas_pos_cantidad: 2,
          comprobantes_cantidad: 1,
          cajas_abiertas: 0,
        }),
      ]);
    });
  });
});
