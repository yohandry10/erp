import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PERMISSION_KEY } from "../../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ContratosController } from "./contratos.controller";
import { ContratosService } from "./contratos.service";

const tenant = "57000000-0000-4000-8000-000000000001";
const actor = "57000000-0000-4000-8000-000000000002";
const id = "57000000-0000-4000-8000-000000000003";
const valid = () => ({
  numero: "SUM-001",
  asunto: "Contrato de suministro",
  cliente_id: id,
  responsable_id: actor,
  moneda: "PEN",
  vigencia_desde: "2026-01-01",
  vigencia_hasta: "2026-12-31",
  lineas: [{ producto_id: id, cantidad: 100.0001, precio_unitario: 12.345678 }],
});

describe("Contratos de suministro: frontera HTTP sin acceso remoto", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContratosController],
      providers: [
        ContratosService,
        { provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = {
            id: actor,
            tenant_id: tenant,
          };
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
    rpc.mockResolvedValue({ data: { id, contrato_id: id }, error: null });
  });
  afterAll(async () => {
    await app.close();
  });

  it("separa permiso de consulta y gestión en todos los endpoints", () => {
    for (const method of Object.getOwnPropertyNames(
      ContratosController.prototype,
    ).filter((m) => m !== "constructor")) {
      const meta = Reflect.getMetadata(
        PERMISSION_KEY,
        ContratosController.prototype[method],
      );
      expect(meta?.raw).toBe(
        ["listar", "catalogos", "detalle"].includes(method)
          ? "ventas.contratos.ver"
          : "ventas.contratos.gestionar",
      );
    }
  });
  const amendment = () => ({
    version: 2,
    referencia: "AD-001",
    motivo: "Ampliación acordada",
    asunto: "Suministro ampliado",
    vigencia_hasta: "2027-03-31",
    responsable_id: actor,
    lineas: [
      { id, producto_id: id, cantidad: 120, precio_unitario: 20.123456 },
    ],
  });
  it.each([
    ["adendas", "ADENDAR", amendment()],
    [
      "oc-modificar",
      "MODIFICAR_OC",
      {
        version: 1,
        referencia: "MOD-001",
        motivo: "Cambio del cliente",
        numero: "OC-01",
        fecha_emision: "2026-10-27",
        lineas: [{ contrato_linea_id: id, cantidad: 50 }],
      },
    ],
    [
      "oc-anular",
      "ANULAR_OC",
      { version: 1, referencia: "AN-001", motivo: "Solicitud del cliente" },
    ],
  ])(
    "admite revisión %s con identidad autenticada y clave",
    async (suffix, action, payload) => {
      const path =
        suffix === "adendas"
          ? `${id}/adendas`
          : `ordenes-cliente/${id}/${suffix === "oc-modificar" ? "modificar" : "anular"}`;
      await request(app.getHttpServer())
        .post(`/api/ventas/contratos/${path}`)
        .set("Idempotency-Key", "revision-http-571")
        .send(payload)
        .expect(201);
      expect(rpc).toHaveBeenCalledWith(
        "operar_suministro_570",
        expect.objectContaining({
          p_accion: action,
          p_id: id,
          p_tenant_id: tenant,
          p_actor_id: actor,
          p_payload: payload,
          p_idempotency_key: "revision-http-571",
        }),
      );
    },
  );
  it.each([
    { referencia: " " },
    { motivo: "no" },
    { version: 0 },
    { cliente_id: id },
    { moneda: "USD" },
    { vigencia_desde: "2026-02-01" },
    {
      lineas: [{ id: "bad", producto_id: id, cantidad: 1, precio_unitario: 1 }],
    },
    {
      lineas: [
        { id, producto_id: id, cantidad: 1, precio_unitario: 1.0000001 },
      ],
    },
    { lineas: [] },
  ])("rechaza una adenda inválida o cambio de identidad: %j", async (patch) => {
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${id}/adendas`)
      .set("Idempotency-Key", "invalid-amendment-571")
      .send({ ...amendment(), ...patch })
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("explica la anulación de OC con programaciones vigentes", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "SUPPLY_OC_HAS_SCHEDULES" },
    });
    const response = await request(app.getHttpServer())
      .post(`/api/ventas/contratos/ordenes-cliente/${id}/anular`)
      .set("Idempotency-Key", "cancel-http-571")
      .send({ version: 1, referencia: "AN-1", motivo: "Solicitud de cliente" })
      .expect(400);
    expect(response.body.message).toContain(
      "Anule primero las entregas programadas",
    );
  });
  it("usa tenant y actor autenticados, conserva decimales y exige clave", async () => {
    await request(app.getHttpServer())
      .post("/api/ventas/contratos")
      .send(valid())
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post("/api/ventas/contratos")
      .set("Idempotency-Key", "contract-http-570")
      .send(valid())
      .expect(201);
    expect(rpc).toHaveBeenCalledWith(
      "operar_suministro_570",
      expect.objectContaining({
        p_tenant_id: tenant,
        p_actor_id: actor,
        p_id: null,
        p_payload: valid(),
        p_idempotency_key: "contract-http-570",
      }),
    );
  });
  it.each([
    { tenant_id: tenant },
    { created_by: actor },
    { estado: "ACTIVO" },
    { vigencia_desde: "2026-02-30" },
    { vigencia_hasta: "2025-12-31" },
    { lineas: [] },
    { numero: "   " },
    { lineas: [{ producto_id: id, cantidad: -1, precio_unitario: 1 }] },
    { lineas: [{ producto_id: id, cantidad: 1.00001, precio_unitario: 1 }] },
    { lineas: [{ producto_id: id, cantidad: 1, precio_unitario: -1 }] },
  ])("rechaza datos inválidos antes de escribir: %j", async (patch) => {
    await request(app.getHttpServer())
      .post("/api/ventas/contratos")
      .set("Idempotency-Key", "invalid-http-570")
      .send({ ...valid(), ...patch })
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("valida paginación y UUID, sin convertir caída de lectura en lista vacía", async () => {
    await request(app.getHttpServer())
      .get("/api/ventas/contratos?limite=101")
      .expect(400);
    await request(app.getHttpServer())
      .get("/api/ventas/contratos/not-a-uuid")
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "08006", message: "private.internal.connection" },
    });
    const response = await request(app.getHttpServer())
      .get("/api/ventas/contratos?pagina=2&limite=10")
      .expect(503);
    expect(response.text).not.toContain("private.internal");
    expect(rpc).toHaveBeenCalledWith(
      "consultar_suministro_570",
      expect.objectContaining({ p_pagina: 2, p_limite: 10 }),
    );
  });
  it.each([
    ["23505", "SUPPLY_VERSION_OR_STATE_CONFLICT", 409],
    ["23514", "SUPPLY_OC_EXCEEDS_CONTRACT", 400],
    ["23514", "SUPPLY_SCHEDULE_EXCEEDS_OC", 400],
    ["P0002", "SUPPLY_NOT_FOUND", 404],
    ["42501", "permission denied for secret_table", 403],
    ["57014", "canceling statement private host", 503],
  ])(
    "clasifica %s como HTTP %s sin divulgar infraestructura",
    async (code, message, status) => {
      rpc.mockResolvedValue({ data: null, error: { code, message } });
      const response = await request(app.getHttpServer())
        .post(`/api/ventas/contratos/${id}/activar`)
        .set("Idempotency-Key", "activate-http-570")
        .send({ version: 1 })
        .expect(Number(status));
      expect(response.text).not.toMatch(/secret_table|private host/);
    },
  );
  it("rechaza OC con línea duplicada y reprogramación sin motivo", async () => {
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${id}/ordenes-cliente`)
      .set("Idempotency-Key", "duplicate-http-570")
      .send({
        numero: "OC-1",
        fecha_emision: "2026-01-01",
        lineas: [
          { contrato_linea_id: id, cantidad: 1 },
          { contrato_linea_id: id, cantidad: 1 },
        ],
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/entregas/${id}/reprogramar`)
      .set("Idempotency-Key", "reschedule-http-570")
      .send({
        version: 1,
        fecha_programada: "2026-03-01",
        destino: "Almacén",
        motivo: "   ",
      })
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("no anuncia éxito con respuesta incompleta del writer", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${id}/activar`)
      .set("Idempotency-Key", "empty-http-570")
      .send({ version: 1 })
      .expect(503);
  });
});
