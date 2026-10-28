import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PERMISSION_KEY } from "../../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { PenalidadesController, PenalidadesService } from "./penalidades.controller";

const tenant = "57800000-0000-4000-8000-000000000001";
const actor = "57800000-0000-4000-8000-000000000002";
const contrato = "57800000-0000-4000-8000-000000000003";
const grupo = "57800000-0000-4000-8000-000000000004";
const entrega = "57800000-0000-4000-8000-000000000005";
const calculo = "57800000-0000-4000-8000-000000000006";
const osce = () => ({
  nombre: "Mora por entrega tardía",
  metodo: "MORA_OSCE",
  base_calculo: "VALOR_ENTREGA",
  factor_f: 0.4,
  plazo_modo: "OC_A_ENTREGA",
  tolerancia_dias: 2,
  tope_porcentaje: 10,
  tope_base: "CONTRATO",
  motivo: "Cláusula de penalidad del contrato",
});

describe("Penalidades contractuales: frontera HTTP sin acceso remoto", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PenalidadesController],
      providers: [PenalidadesService, { provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } }],
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
  });
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { id: grupo, contrato_id: contrato }, error: null });
  });
  afterAll(async () => {
    await app.close();
  });

  it("consulta con ver, configura y calcula con gestionar y revisa sólo con aprobar", () => {
    const esperado: Record<string, string> = {
      consultar: "ventas.penalidades.ver",
      guardarRegla: "ventas.penalidades.gestionar",
      anularRegla: "ventas.penalidades.gestionar",
      excepcion: "ventas.penalidades.gestionar",
      calcular: "ventas.penalidades.gestionar",
      revisar: "ventas.penalidades.aprobar",
    };
    for (const [method, codigo] of Object.entries(esperado))
      expect(Reflect.getMetadata(PERMISSION_KEY, (PenalidadesController.prototype as any)[method])?.raw).toBe(codigo);
  });

  it("guarda la regla con contrato, actor y clave", async () => {
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/penalidades/reglas`)
      .set("Idempotency-Key", "regla-http-578")
      .send(osce())
      .expect(201);
    expect(rpc).toHaveBeenCalledWith("operar_penalidades_578", {
      p_tenant_id: tenant,
      p_actor_id: actor,
      p_contrato_id: contrato,
      p_accion: "GUARDAR_REGLA",
      p_payload: osce(),
      p_idempotency_key: "regla-http-578",
    });
  });

  it.each([
    ["mora sin factor", { factor_f: undefined }],
    ["plazo fijo sin días", { plazo_modo: "FIJO" }],
    ["tope sin base", { tope_base: undefined }],
    ["porcentaje sin tasa", { metodo: "PORCENTAJE_DIARIO", factor_f: undefined, plazo_modo: undefined }],
    ["importe con tres decimales", { metodo: "IMPORTE_UNICO", importe: 10.123 }],
    ["método desconocido", { metodo: "LIBRE" }],
    ["nueva versión sin versión vigente", { grupo_id: grupo }],
    ["motivo corto", { motivo: "no" }],
    ["campo ajeno", { estado: "VIGENTE" }],
  ])("rechaza la regla %s antes de la base", async (_, cambio) => {
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/penalidades/reglas`)
      .set("Idempotency-Key", "regla-http-578")
      .send({ ...osce(), ...cambio })
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("anula el grupo de la ruta y registra la excepción de plazo", async () => {
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/penalidades/reglas/${grupo}/anular`)
      .set("Idempotency-Key", "anular-http-578")
      .send({ version: 2, motivo: "Cláusula retirada por adenda" })
      .expect(201);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_accion: "ANULAR_REGLA",
      p_payload: { version: 2, motivo: "Cláusula retirada por adenda", grupo_id: grupo },
    });
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/penalidades/excepciones`)
      .set("Idempotency-Key", "excepcion-http-578")
      .send({ entrega_id: entrega, dias_excluidos: 3, motivo: "Ampliación aprobada", referencia: "CARTA-12" })
      .expect(201);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_accion: "REGISTRAR_EXCEPCION", p_payload: { dias_excluidos: 3 } });
  });

  it.each([
    ["fecha imposible", { fecha_corte: "2026-02-30" }],
    ["fecha con hora", { fecha_corte: "2026-10-27T10:00:00Z" }],
  ])("rechaza el corte con %s", async (_, body) => {
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/penalidades/calcular`)
      .set("Idempotency-Key", "calcular-http-578")
      .send(body)
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("revisa el cálculo de la ruta y exige monto al aprobar", async () => {
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/penalidades/calculos/${calculo}/revisar`)
      .set("Idempotency-Key", "aprobar-http-578")
      .send({ version: 2, accion: "APROBAR", comentario: "Conforme con la cláusula" })
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/penalidades/calculos/${calculo}/revisar`)
      .set("Idempotency-Key", "aprobar-http-578")
      .send({ version: 2, accion: "APROBAR", monto_aprobado: 16.67, comentario: "Conforme con la cláusula" })
      .expect(201);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_accion: "REVISAR_CALCULO",
      p_payload: { version: 2, accion: "APROBAR", monto_aprobado: 16.67, calculo_id: calculo },
    });
  });

  it("exige Idempotency-Key", async () => {
    await request(app.getHttpServer()).post(`/api/ventas/contratos/${contrato}/penalidades/calcular`).send({}).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "42501", message: "PENALTY_SEGREGATION_REQUIRED" }, 403, /no puede aprobarlo/],
    [{ code: "42501", message: "PERMISSION_DENIED: ventas.penalidades.aprobar" }, 403, /permiso/],
    [{ code: "23514", message: "PENALTY_APPROVED_AMOUNT_INVALID" }, 400, /no puede superar/],
    [{ code: "23514", message: "PENALTY_CUTOFF_IN_FUTURE" }, 400, /futura/],
    [{ code: "23505", message: "PENALTY_VERSION_CONFLICT" }, 409, /cambió/],
    [{ code: "P0002", message: "SUPPLY_NOT_FOUND" }, 404, /No se encontró/],
    [{ code: "08006", message: "connection failure" }, 503, /no está disponible/],
  ])("clasifica %j", async (error, status, texto) => {
    rpc.mockResolvedValue({ data: null, error });
    const res = await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/penalidades/calcular`)
      .set("Idempotency-Key", "calcular-http-578")
      .send({ fecha_corte: "2026-10-26" })
      .expect(status);
    expect(res.body.message).toMatch(texto);
  });

  it("consulta y exige cálculos en la respuesta", async () => {
    rpc.mockResolvedValue({ data: { reglas: [], excepciones: [], calculos: [], resumen: [] }, error: null });
    await request(app.getHttpServer()).get(`/api/ventas/contratos/${contrato}/penalidades`).expect(200);
    expect(rpc).toHaveBeenCalledWith("consultar_penalidades_578", { p_tenant_id: tenant, p_actor_id: actor, p_contrato_id: contrato });
    rpc.mockResolvedValue({ data: { reglas: [] }, error: null });
    await request(app.getHttpServer()).get(`/api/ventas/contratos/${contrato}/penalidades`).expect(503);
  });

  it("no confirma una operación sin identificador", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/penalidades/calcular`)
      .set("Idempotency-Key", "calcular-http-578")
      .send({})
      .expect(503);
  });
});
