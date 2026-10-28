import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createHash } from "crypto";
import * as ExcelJS from "exceljs";
import request from "supertest";
import { PERMISSION_KEY } from "../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { SupabaseService } from "../../shared/supabase/supabase.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BiController, TablerosController } from "./tableros.controller";
import { TablerosService } from "./tableros.service";

const tenant = "57900000-0000-4000-8000-000000000001";
const actor = "57900000-0000-4000-8000-000000000002";
const corte = "57900000-0000-4000-8000-000000000003";
const contrato = "57900000-0000-4000-8000-000000000004";
const credencial = "57900000-0000-4000-8000-000000000005";
const token = `erpbi_0a1b2c3d_${"A".repeat(43)}`;
const hash = "a".repeat(64);
const tablero = () => ({
  corte: { id: corte, fecha_corte: "2026-10-27", origen: "EXPORTACION", generado_en: "2026-10-27T15:00:00Z",
    generado_por_nombre: "Gerencia Local", hash },
  filtros: {},
  datasets: {
    entregas: [{ entrega_id: "e1", contrato_id: contrato, contrato_numero: "SUP-1", fecha_programada: "2026-10-17",
      cantidad: 20, aceptado: 0, cumplimiento: "ATRASADA", dias_atraso: 10, pedidos: null, recepciones: null }],
    cobranza: [{ cxc_id: "x1", documento: "F001-1", moneda: "PEN", total: 472, saldo: 472, situacion: "VENCIDO", cuadra: true }],
  },
  resumen: {
    entregas: { exigibles: 2, a_tiempo_completas: 1, atrasadas: 1, porcentaje: 50, dias_atraso_promedio: 10 },
    cobranza: [{ moneda: "PEN", documentos: 1, saldo: 472, vencido: 472 }],
  },
  ocultos: ["contratos", "stock", "vencimientos", "penalidades"],
  cortes: [],
});

describe("Tablero de suministro y lectura BI: frontera HTTP sin acceso remoto", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TablerosController, BiController],
      providers: [TablerosService, { provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } }],
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
    rpc.mockResolvedValue({ data: tablero(), error: null });
  });
  afterAll(async () => {
    await app.close();
  });

  it("lee con read, registra y exporta con export y gestiona BI con su permiso propio", () => {
    const esperado: Record<string, string> = {
      consultar: "reports.suministro.read",
      registrarCorte: "reports.suministro.export",
      excel: "reports.suministro.export",
      credenciales: "integraciones.bi.gestionar",
      crearCredencial: "integraciones.bi.gestionar",
      revocarCredencial: "integraciones.bi.gestionar",
    };
    for (const [method, codigo] of Object.entries(esperado))
      expect(Reflect.getMetadata(PERMISSION_KEY, (TablerosController.prototype as any)[method])?.raw).toBe(codigo);
  });

  it("consulta un corte con filtros y separa el corte de los filtros", async () => {
    await request(app.getHttpServer())
      .get(`/api/reportes/suministro?corte_id=${corte}&contrato_id=${contrato}&desde=2026-10-01`)
      .expect(200);
    expect(rpc).toHaveBeenCalledWith("consultar_tablero_suministro_579", {
      p_tenant_id: tenant, p_actor_id: actor, p_corte_id: corte, p_filtros: { contrato_id: contrato, desde: "2026-10-01" },
    });
  });

  it.each([
    ["contrato inválido", "contrato_id=abc"],
    ["fecha imposible", "desde=2026-02-30"],
    ["filtro ajeno", "estado=ATRASADA"],
  ])("rechaza %s antes de la base", async (_, query) => {
    await request(app.getHttpServer()).get(`/api/reportes/suministro?${query}`).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("registra el corte con clave y la exige", async () => {
    rpc.mockResolvedValue({ data: { id: corte, hash, idempotent: false }, error: null });
    await request(app.getHttpServer()).post("/api/reportes/suministro/cortes").expect(400);
    expect(rpc).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post("/api/reportes/suministro/cortes").set("Idempotency-Key", "corte-http-579").expect(201);
    expect(rpc).toHaveBeenCalledWith("registrar_corte_tablero_579", {
      p_tenant_id: tenant, p_actor_id: actor, p_idempotency_key: "corte-http-579",
    });
  });

  it("exporta a Excel el corte con su hash, resumen y sólo los conjuntos permitidos", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/reportes/suministro/cortes/${corte}/excel?contrato_id=${contrato}`)
      .buffer(true)
      .parse((r, cb) => {
        const partes: Buffer[] = [];
        r.on("data", (c: Buffer) => partes.push(c));
        r.on("end", () => cb(null, Buffer.concat(partes)));
      })
      .expect(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("tablero_suministro_2026-10-27_57900000.xlsx");
    expect(res.headers["x-corte-hash"]).toBe(hash);
    expect(rpc).toHaveBeenCalledWith("consultar_tablero_suministro_579", expect.objectContaining({
      p_corte_id: corte, p_filtros: { contrato_id: contrato },
    }));
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(res.body);
    expect(libro.worksheets.map((h) => h.name)).toEqual(["Corte", "Resumen", "Entregas", "Cobranza"]);
    const datos = (hoja: string) =>
      libro.getWorksheet(hoja)!.getSheetValues().slice(2).map((f: any) => f.slice(1));
    expect(datos("Corte")).toEqual(expect.arrayContaining([
      ["Hash SHA-256 del corte", hash], ["Filtros", `contrato_id=${contrato}`],
      ["Conjuntos sin permiso", "contratos, stock, vencimientos, penalidades"],
    ]));
    expect(datos("Resumen")).toEqual(expect.arrayContaining([
      ["Entregas a tiempo y completas (%)", undefined, 50, "Entregas"],
      ["Saldo vencido", "PEN", 472, "Cobranza"],
    ]));
    const entregas = libro.getWorksheet("Entregas")!;
    expect(entregas.getRow(1).getCell(14).value).toBe("Cumplimiento");
    expect(entregas.getRow(2).getCell(14).value).toBe("ATRASADA");
    expect(entregas.getRow(2).getCell(19).value).toBe("e1");
    expect(libro.getWorksheet("Cobranza")!.getRow(2).getCell(14).value).toBe("Sí");
  });

  it("crea la credencial, entrega el token una sola vez y envía sólo su hash", async () => {
    rpc.mockResolvedValue({ data: { id: credencial, idempotent: false }, error: null });
    const body = { nombre: "Power BI gerencia", datasets: ["entregas", "cobranza"], expira_en: "2026-12-31" };
    const res = await request(app.getHttpServer())
      .post("/api/integraciones/bi/credenciales").set("Idempotency-Key", "bi-http-579").send(body).expect(201);
    const emitido: string = res.body.data.token;
    expect(emitido).toMatch(/^erpbi_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);
    const payload = rpc.mock.calls[0][1].p_payload;
    expect(payload).toEqual({ ...body, prefijo: emitido.slice(6, 14),
      token_digest: createHash("sha256").update(emitido).digest("hex") });
    expect(JSON.stringify(rpc.mock.calls[0][1])).not.toContain(emitido);
    rpc.mockResolvedValue({ data: { id: credencial, idempotent: true }, error: null });
    const replay = await request(app.getHttpServer())
      .post("/api/integraciones/bi/credenciales").set("Idempotency-Key", "bi-http-579").send(body).expect(201);
    expect(replay.body.data.token).toBeNull();
  });

  it.each([
    [{ nombre: "BI", datasets: ["entregas"], expira_en: "2026-12-31" }],
    [{ nombre: "Power BI", datasets: [], expira_en: "2026-12-31" }],
    [{ nombre: "Power BI", datasets: ["nomina"], expira_en: "2026-12-31" }],
    [{ nombre: "Power BI", datasets: ["entregas", "entregas"], expira_en: "2026-12-31" }],
    [{ nombre: "Power BI", datasets: ["entregas"], expira_en: "2026-12-31", token_digest: hash }],
  ])("rechaza credenciales inválidas antes de la base %#", async (body) => {
    await request(app.getHttpServer())
      .post("/api/integraciones/bi/credenciales").set("Idempotency-Key", "bi-http-579").send(body).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("revoca la credencial de la ruta con motivo", async () => {
    rpc.mockResolvedValue({ data: { id: credencial }, error: null });
    await request(app.getHttpServer())
      .post(`/api/integraciones/bi/credenciales/${credencial}/revocar`)
      .set("Idempotency-Key", "bi-revoke-579").send({ motivo: "Rotación trimestral" }).expect(201);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_accion: "REVOCAR", p_payload: { credencial_id: credencial, motivo: "Rotación trimestral" } });
  });

  it.each([
    ["sin cabecera", undefined],
    ["un JWT de usuario", "Bearer [REMOVED]"],
    ["token truncado", `Bearer ${token.slice(0, -1)}`],
  ])("BI rechaza %s sin consultar la base", async (_, autorizacion) => {
    const req = request(app.getHttpServer()).get("/api/bi/v1/suministro/entregas");
    if (autorizacion) req.set("Authorization", autorizacion);
    await req.expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("BI lee con el hash del token, el corte y los filtros, y registra el origen", async () => {
    rpc.mockResolvedValue({ data: { resultado: "OK", corte: { id: corte, hash }, dataset: "entregas", total: 1,
      filas: [{ entrega_id: "e1", corte_id: corte }] }, error: null });
    const res = await request(app.getHttpServer())
      .get(`/api/bi/v1/suministro/entregas?corte=${corte}&contrato_id=${contrato}`)
      .set("Authorization", `Bearer ${token}`).set("User-Agent", "Microsoft.Data.Mashup").expect(200);
    expect(res.body).toEqual({ corte: { id: corte, hash }, dataset: "entregas", total: 1, filas: [{ entrega_id: "e1", corte_id: corte }] });
    expect(rpc).toHaveBeenCalledWith("leer_dataset_bi_579", {
      p_token_digest: createHash("sha256").update(token).digest("hex"),
      p_dataset: "entregas", p_corte: corte, p_filtros: { contrato_id: contrato },
      p_origen: { ip: expect.any(String), agente: "Microsoft.Data.Mashup" },
    });
  });

  it.each([
    ["CREDENCIAL_INVALIDA", 401],
    ["CREDENCIAL_INACTIVA", 401],
    ["DATASET_NO_PERMITIDO", 403],
    ["CORTE_NO_ENCONTRADO", 404],
  ])("BI traduce %s a %i", async (resultado, status) => {
    rpc.mockResolvedValue({ data: { resultado }, error: null });
    await request(app.getHttpServer()).get("/api/bi/v1/suministro/cobranza").set("Authorization", `Bearer ${token}`).expect(status);
  });

  it("BI no consulta conjuntos inexistentes", async () => {
    await request(app.getHttpServer()).get("/api/bi/v1/suministro/nomina").set("Authorization", `Bearer ${token}`).expect(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "22023", message: "DASHBOARD_FILTER_INVALID" }, 400, /rango de fechas/],
    [{ code: "P0002", message: "DASHBOARD_CUTOFF_NOT_FOUND" }, 404, /corte no existe/],
    [{ code: "42501", message: "BI_DATASET_PERMISSION_REQUIRED" }, 403, /usted puede consultar/],
    [{ code: "42501", message: "PERMISSION_DENIED: reports.suministro.read" }, 403, /permiso/],
    [{ code: "08006", message: "connection failure" }, 503, /no está disponible/],
  ])("clasifica %j", async (error, status, texto) => {
    rpc.mockResolvedValue({ data: null, error });
    const res = await request(app.getHttpServer()).get("/api/reportes/suministro").expect(status);
    expect(res.body.message).toMatch(texto);
  });

  it("no confirma un tablero incompleto", async () => {
    rpc.mockResolvedValue({ data: { corte: { hash }, datasets: {} }, error: null });
    await request(app.getHttpServer()).get("/api/reportes/suministro").expect(503);
  });
});
