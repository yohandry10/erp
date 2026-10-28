import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PERMISSION_KEY } from "../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { SupabaseService } from "../../shared/supabase/supabase.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AlertasController } from "./alertas.controller";
import { AlertasService } from "./alertas.service";

const tenant = "57700000-0000-4000-8000-000000000001";
const actor = "57700000-0000-4000-8000-000000000002";
const otro = "57700000-0000-4000-8000-000000000003";
const alerta = "57700000-0000-4000-8000-000000000004";
const regla = () => ({
  activa: true,
  dias_anticipacion: 7,
  dias_escalamiento: 2,
  destinatarios: [actor],
  escalar_a: [otro],
  incluir_responsable: true,
  enviar_correo: false,
  version: 0,
});

describe("Alertas de suministro: frontera HTTP sin acceso remoto", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  let service: AlertasService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AlertasController],
      providers: [AlertasService, { provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } }],
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
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.init();
    service = module.get(AlertasService);
  });
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { id: alerta, items: [] }, error: null });
    delete process.env.ALERTAS_SUMINISTRO_CRON;
  });
  afterAll(async () => {
    await app.close();
  });

  it("las propias sólo exigen sesión; administrar exige permiso", () => {
    const esperado: Record<string, string | undefined> = {
      mias: undefined,
      reconocer: undefined,
      todas: "alertas.suministro.ver",
      reglas: "alertas.suministro.ver",
      configurar: "alertas.suministro.gestionar",
      evaluar: "alertas.suministro.gestionar",
    };
    for (const [method, codigo] of Object.entries(esperado))
      expect(Reflect.getMetadata(PERMISSION_KEY, (AlertasController.prototype as any)[method])?.raw).toBe(codigo);
  });

  it("consulta las propias con actor y filtros", async () => {
    await request(app.getHttpServer()).get("/api/alertas/mias?estado=TODAS&limite=20").expect(200);
    expect(rpc).toHaveBeenCalledWith("consultar_alertas_577", {
      p_tenant_id: tenant, p_actor_id: actor, p_accion: "MIAS", p_estado: "TODAS", p_pagina: 1, p_limite: 20,
    });
  });

  it("configura una regla por tipo con clave", async () => {
    await request(app.getHttpServer()).put("/api/alertas/reglas/ENTREGA_ATRASADA").set("Idempotency-Key", "regla-http-577").send(regla()).expect(200);
    expect(rpc).toHaveBeenCalledWith("configurar_regla_alerta_577", {
      p_tenant_id: tenant, p_actor_id: actor, p_payload: { ...regla(), tipo: "ENTREGA_ATRASADA" }, p_idempotency_key: "regla-http-577",
    });
  });

  it.each([
    ["tipo desconocido", "/api/alertas/reglas/OTRO", regla()],
    ["booleano como texto", "/api/alertas/reglas/LOTE_POR_VENCER", { ...regla(), enviar_correo: "false" }],
    ["destinatario repetido", "/api/alertas/reglas/LOTE_POR_VENCER", { ...regla(), destinatarios: [actor, actor] }],
    ["anticipación fuera de rango", "/api/alertas/reglas/LOTE_POR_VENCER", { ...regla(), dias_anticipacion: 400 }],
    ["escalamiento en cero", "/api/alertas/reglas/LOTE_POR_VENCER", { ...regla(), dias_escalamiento: 0 }],
  ])("rechaza %s antes de la base", async (_, path, body) => {
    await request(app.getHttpServer()).put(path).set("Idempotency-Key", "regla-http-577").send(body).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reconoce la alerta como el actor autenticado", async () => {
    await request(app.getHttpServer()).post(`/api/alertas/${alerta}/reconocer`).expect(201);
    expect(rpc).toHaveBeenCalledWith("reconocer_alerta_577", { p_tenant_id: tenant, p_actor_id: actor, p_alerta_id: alerta });
  });

  it.each([
    [{ code: "P0002", message: "ALERTS_NOT_FOUND" }, 404, /no está dirigida a usted/],
    [{ code: "23514", message: "ALERTS_ESCALATION_INCOMPLETE" }, 400, /días y a quién escalar/],
    [{ code: "23505", message: "ALERTS_VERSION_CONFLICT" }, 409, /cambió/],
    [{ code: "42501", message: "ALERTS_ACTOR_NOT_ACTIVE" }, 403, /permiso/],
    [{ code: "08006", message: "down" }, 503, /no está disponible/],
  ])("clasifica %j", async (error, status, texto) => {
    rpc.mockResolvedValue({ data: null, error });
    const res = await request(app.getHttpServer()).post(`/api/alertas/${alerta}/reconocer`).expect(status);
    expect(res.body.message).toMatch(texto);
  });

  it("la tarea horaria evalúa cada empresa con reglas y sigue si una falla", async () => {
    const otraEmpresa = "57700000-0000-4000-8000-000000000009";
    rpc.mockImplementation(async (name: string, args: any) => {
      if (name === "listar_tenants_alertas_577") return { data: [tenant, otraEmpresa], error: null };
      if (args?.p_tenant_id === tenant) return { data: null, error: { code: "08006", message: "down" } };
      return { data: { creadas: 1 }, error: null };
    });
    await service.evaluarTodas();
    expect(rpc).toHaveBeenCalledWith("evaluar_alertas_suministro_577", { p_tenant_id: otraEmpresa, p_fecha: null });
    expect(rpc.mock.calls.filter(([n]) => n === "evaluar_alertas_suministro_577")).toHaveLength(2);
  });

  it("la tarea horaria se puede apagar por entorno", async () => {
    process.env.ALERTAS_SUMINISTRO_CRON = "off";
    await service.evaluarTodas();
    expect(rpc).not.toHaveBeenCalled();
  });
});
