import { CotizacionesCompraRepository } from "./cotizaciones-compra.repository";

describe("CotizacionesCompraRepository tenant isolation", () => {
  it("persiste el tenant en cada detalle nuevo", async () => {
    const inserts: Record<string, any> = {};
    const client = {
      from: jest.fn((table: string) => ({
        insert: jest.fn((payload: any) => {
          inserts[table] = payload;
          if (table === "cotizaciones_compra") {
            return {
              select: () => ({
                single: async () => ({ data: { id: "cot-1" }, error: null }),
              }),
            };
          }
          return { select: async () => ({ data: payload, error: null }) };
        }),
      })),
    };
    const repository = new CotizacionesCompraRepository(
      { getClient: () => client } as any,
      {} as any,
    );

    await repository.create(
      {
        numero: "CC-001",
        proveedor_id: "prov-1",
        detalles: [
          {
            producto_id: "prod-1",
            descripcion: "Producto",
            cantidad: 2,
            precio_unitario: 10,
          },
        ],
      } as any,
      "tenant-1",
      "user-1",
      { subtotal: 20, igv: 3.6, total: 23.6 },
    );

    expect(inserts.cotizacion_compra_detalles).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-1",
        cotizacion_id: "cot-1",
        producto_id: "prod-1",
      }),
    ]);
  });

  it("filtra también los detalles por tenant al leer una cotización", async () => {
    const detailFilters: Array<[string, string]> = [];
    const client = {
      from: jest.fn((table: string) => {
        if (table === "cotizaciones_compra") {
          const header: any = {
            select: () => header,
            eq: () => header,
            single: async () => ({ data: { id: "cot-1" }, error: null }),
          };
          return header;
        }
        const details: any = {
          select: () => details,
          eq: (field: string, value: string) => {
            detailFilters.push([field, value]);
            return details;
          },
          then: (resolve: (value: any) => void) =>
            resolve({ data: [], error: null }),
        };
        return details;
      }),
    };
    const repository = new CotizacionesCompraRepository(
      { getClient: () => client } as any,
      {} as any,
    );

    await repository.findById("cot-1", "tenant-1");

    expect(detailFilters).toEqual([
      ["cotizacion_id", "cot-1"],
      ["tenant_id", "tenant-1"],
    ]);
  });
});
