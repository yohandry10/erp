import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PERMISSION_KEY } from "../../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { mensajeErrorLote } from "../inventario-errors";
import { LotesController } from "./lotes.controller";
import { LotesService } from "./lotes.service";

const tenant = "57400000-0000-4000-8000-000000000001";
const actor = "57400000-0000-4000-8000-000000000002";
const id = "57400000-0000-4000-8000-000000000003";
const almacen = "57400000-0000-4000-8000-000000000004";

describe("Lotes de inventario: frontera HTTP sin acceso remoto", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LotesController],
      providers: [
        LotesService,
        { provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { id: actor, tenant_id: tenant };
          return true;
        },
      })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { id, items: [] }, error: null });
  });
  afterAll(async () => {
    await app.close();
  });

  it("separa permiso de consulta y gestión en todos los endpoints", () => {
    for (const method of Object.getOwnPropertyNames(LotesController.prototype).filter(
      (m) => m !== "constructor",
    )) {
      const meta = Reflect.getMetadata(PERMISSION_KEY, LotesController.prototype[method]);
      expect(meta?.raw).toBe(
        ["productos", "porVencer", "detalle", "movimientos"].includes(method)
          ? "inventario.lotes.read"
          : "inventario.lotes.manage",
      );
    }
  });

  it("consulta el producto con identidad autenticada y filtros validados", async () => {
    await request(app.getHttpServer())
      .get(`/api/inventario/lotes/productos/${id}?almacen_id=${almacen}&dias=120`)
      .expect(200);
    expect(rpc).toHaveBeenCalledWith(
      "consultar_lotes_inventario_574",
      expect.objectContaining({
        p_tenant_id: tenant,
        p_actor_id: actor,
        p_accion: "PRODUCTO",
        p_producto_id: id,
        p_almacen_id: almacen,
        p_dias: 120,
      }),
    );
  });

  it.each([
    ["dias fuera de rango", `/api/inventario/lotes/por-vencer?dias=4000`],
    ["almacén mal formado", `/api/inventario/lotes/productos/${id}?almacen_id=x`],
    ["producto mal formado", `/api/inventario/lotes/productos/abc`],
  ])("rechaza %s sin consultar la base", async (_, path) => {
    await request(app.getHttpServer()).get(path).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      "politica",
      "put",
      `productos/${id}/politica`,
      "CONFIGURAR_POLITICA",
      { controla_lote: true, requiere_vencimiento: true, dias_minimos_vida_util: 180, version: 0 },
    ],
    [
      "regularizacion",
      "post",
      `productos/${id}/regularizaciones`,
      "REGULARIZAR",
      {
        almacen_id: almacen,
        motivo: "Inventario físico con evidencia",
        lineas: [{ lote: "L-001", fecha_vencimiento: "2027-06-30", cantidad: 12.5 }],
      },
    ],
    [
      "reasignacion",
      "post",
      `productos/${id}/reservas/reasignar`,
      "REASIGNAR_RESERVA",
      {
        almacen_id: almacen,
        referencia_id: id,
        motivo: "Dividir la entrega entre lotes",
        lineas: [
          { lote_id: id, ubicacion_id: null, cantidad: 5 },
          { lote_id: almacen, cantidad: 3 },
        ],
      },
    ],
  ])("envía %s con clave, actor y producto de la ruta", async (_, method, path, accion, body) => {
    await (request(app.getHttpServer()) as any)[method](`/api/inventario/lotes/${path}`)
      .set("Idempotency-Key", "lotes-http-574")
      .send(body)
      .expect(method === "put" ? 200 : 201);
    expect(rpc).toHaveBeenCalledWith(
      "operar_lotes_inventario_574",
      expect.objectContaining({
        p_tenant_id: tenant,
        p_actor_id: actor,
        p_accion: accion,
        p_payload: { ...body, producto_id: id },
        p_idempotency_key: "lotes-http-574",
      }),
    );
  });

  it("conserva la diferencia entre ubicación nula explícita y ausente", async () => {
    await request(app.getHttpServer())
      .post(`/api/inventario/lotes/productos/${id}/reservas/reasignar`)
      .set("Idempotency-Key", "lotes-http-574")
      .send({
        almacen_id: almacen,
        referencia_id: id,
        motivo: "Dividir la entrega entre lotes",
        lineas: [{ lote_id: id, ubicacion_id: null, cantidad: 5 }, { lote_id: id, cantidad: 3 }],
      })
      .expect(201);
    const lineas = rpc.mock.calls[0][1].p_payload.lineas;
    expect("ubicacion_id" in lineas[0]).toBe(true);
    expect("ubicacion_id" in lineas[1]).toBe(false);
  });

  it.each([
    [{ controla_lote: "si", requiere_vencimiento: true, dias_minimos_vida_util: 0, version: 0 }],
    [{ controla_lote: true, requiere_vencimiento: "false", dias_minimos_vida_util: 0, version: 0 }],
    [{ controla_lote: true, requiere_vencimiento: true, dias_minimos_vida_util: 1.5, version: 0 }],
    [{ controla_lote: true, requiere_vencimiento: true, dias_minimos_vida_util: 0, version: 0, extra: 1 }],
  ])("rechaza políticas inválidas antes de la base", async (body) => {
    await request(app.getHttpServer())
      .put(`/api/inventario/lotes/productos/${id}/politica`)
      .set("Idempotency-Key", "lotes-http-574")
      .send(body)
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ almacen_id: almacen, motivo: "corto", lineas: [] }],
    [{ almacen_id: almacen, motivo: "Motivo válido", lineas: [{ lote: " ", cantidad: 1 }] }],
    [{ almacen_id: almacen, motivo: "Motivo válido", lineas: [{ lote: "L1", cantidad: 0 }] }],
    [{ almacen_id: almacen, motivo: "Motivo válido", lineas: [{ lote: "L1", cantidad: 1.00001 }] }],
    [{ almacen_id: almacen, motivo: "Motivo válido", lineas: [{ lote: "L1", fecha_vencimiento: "2027-02-30", cantidad: 1 }] }],
  ])("rechaza regularizaciones inválidas antes de la base", async (body) => {
    await request(app.getHttpServer())
      .post(`/api/inventario/lotes/productos/${id}/regularizaciones`)
      .set("Idempotency-Key", "lotes-http-574")
      .send(body)
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("exige Idempotency-Key en escrituras", async () => {
    await request(app.getHttpServer())
      .put(`/api/inventario/lotes/productos/${id}/politica`)
      .send({ controla_lote: true, requiere_vencimiento: true, dias_minimos_vida_util: 0, version: 0 })
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "23514", message: "INVENTORY_LOT_EXPIRED_OR_SHORT_DATED: lote=LA vence=2027-01-01 minimo=2027-03-01" }, 400, /vida útil mínima.*Lote: LA/],
    [{ code: "23514", message: "INVENTORY_LOT_REGULARIZATION_EXCEEDS_UNASSIGNED: sin_lote=5 solicitado=6" }, 400, /supera el stock sin lote/],
    [{ code: "23505", message: "INVENTORY_LOT_IDEMPOTENCY_CONFLICT" }, 409, /ya se usó con otros datos/],
    [{ code: "23505", message: "INVENTORY_LOT_VERSION_CONFLICT" }, 409, /cambió/],
    [{ code: "P0002", message: "INVENTORY_LOT_PRODUCT_NOT_FOUND" }, 404, /no existe en esta empresa/],
    [{ code: "42501", message: "REFUND_REVERSAL_PERMISSION_REQUIRED: inventario.lotes.manage" }, 403, /permiso/],
    [{ code: "08006", message: "connection failure" }, 503, /no está disponible/],
  ])("clasifica %j", async (error, status, texto) => {
    rpc.mockResolvedValue({ data: null, error });
    const res = await request(app.getHttpServer())
      .post(`/api/inventario/lotes/productos/${id}/regularizaciones`)
      .set("Idempotency-Key", "lotes-http-574")
      .send({ almacen_id: almacen, motivo: "Motivo válido", lineas: [{ lote: "L1", cantidad: 1 }] })
      .expect(status);
    expect(res.body.message).toMatch(texto);
  });

  it("no confirma una respuesta vacía de la base", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await request(app.getHttpServer())
      .post(`/api/inventario/lotes/productos/${id}/regularizaciones`)
      .set("Idempotency-Key", "lotes-http-574")
      .send({ almacen_id: almacen, motivo: "Motivo válido", lineas: [{ lote: "L1", cantidad: 1 }] })
      .expect(503);
  });

  it("traduce los rechazos de lote de otros writers sin tocar los ajenos", () => {
    expect(mensajeErrorLote("INVENTORY_LOT_REQUIRED")).toMatch(/Indique el lote/);
    expect(mensajeErrorLote("INVENTORY_LOT_AVAILABLE_INSUFFICIENT: faltante=3 vence_desde=2027-01-01")).toMatch(
      /sin lote debe regularizarse/,
    );
    expect(mensajeErrorLote("INVENTORY_AVAILABLE_STOCK_INSUFFICIENT: disponible=1 solicitado=2")).toBeNull();
    expect(mensajeErrorLote(undefined)).toBeNull();
  });
});
