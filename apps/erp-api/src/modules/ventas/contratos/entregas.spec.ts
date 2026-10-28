import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PERMISSION_KEY } from "../../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { EntregasController } from "./entregas.controller";
import { EntregasService } from "./entregas.service";
import { ExpedienteService } from "./expediente.service";

const tenant = "57500000-0000-4000-8000-000000000001";
const actor = "57500000-0000-4000-8000-000000000002";
const contrato = "57500000-0000-4000-8000-000000000003";
const pedido = "57500000-0000-4000-8000-000000000004";
const despacho = "57500000-0000-4000-8000-000000000005";
const lote = "57500000-0000-4000-8000-000000000006";
const recepcion = "57500000-0000-4000-8000-000000000007";
const valid = () => ({
  pedido_id: pedido,
  fecha_recepcion: "2026-10-27",
  receptor_nombre: "María Quispe",
  guia_referencia: "T001-120",
  pecosa_numero: "PEC-88",
  lineas: [
    { despacho_id: despacho, lote_id: lote, cantidad_recibida: 20, cantidad_aceptada: 18, cantidad_rechazada: 2, motivo_rechazo: "Embalaje dañado" },
    { despacho_id: despacho, cantidad_recibida: 5.5, cantidad_aceptada: 5.5, cantidad_rechazada: 0 },
  ],
});

describe("Entregas y conformidades: frontera HTTP sin acceso remoto", () => {
  let app: INestApplication;
  const rpc = jest.fn();
  const upload = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [EntregasController],
      providers: [
        EntregasService,
        { provide: ExpedienteService, useValue: { upload } },
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
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.init();
  });
  beforeEach(() => {
    rpc.mockReset();
    upload.mockReset();
    rpc.mockResolvedValue({ data: { id: recepcion, contrato_id: contrato, numero: 1 }, error: null });
  });
  afterAll(async () => {
    await app.close();
  });

  it("consulta con ver y registra con conformar, sin exigir gestionar", () => {
    const esperado: Record<string, string> = {
      ejecucion: "ventas.contratos.ver",
      estadoCuenta: "ventas.contratos.ver",
      facturacion: "ventas.contratos.gestionar",
      registrar: "ventas.contratos.conformar",
      anular: "ventas.contratos.conformar",
      adjuntar: "ventas.contratos.conformar",
    };
    for (const [method, codigo] of Object.entries(esperado))
      expect(Reflect.getMetadata(PERMISSION_KEY, (EntregasController.prototype as any)[method])?.raw).toBe(codigo);
  });

  it("registra la recepción con contrato, actor y clave", async () => {
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/recepciones`)
      .set("Idempotency-Key", "recepcion-http-575")
      .send(valid())
      .expect(201);
    expect(rpc).toHaveBeenCalledWith("operar_suministro_recepciones_575", {
      p_tenant_id: tenant,
      p_actor_id: actor,
      p_contrato_id: contrato,
      p_accion: "REGISTRAR_RECEPCION",
      p_payload: valid(),
      p_idempotency_key: "recepcion-http-575",
    });
  });

  it.each([
    ["sin motivo de rechazo", { lineas: [{ despacho_id: despacho, cantidad_recibida: 3, cantidad_aceptada: 2, cantidad_rechazada: 1 }] }],
    ["suma que no cuadra", { lineas: [{ despacho_id: despacho, cantidad_recibida: 3, cantidad_aceptada: 2, cantidad_rechazada: 0 }] }],
    ["receptor vacío", { receptor_nombre: "  " }],
    ["fecha inválida", { fecha_recepcion: "2026-02-30" }],
    ["sin líneas", { lineas: [] }],
    ["cantidad con 5 decimales", { lineas: [{ despacho_id: despacho, cantidad_recibida: 1.00001, cantidad_aceptada: 1.00001, cantidad_rechazada: 0 }] }],
    ["campo ajeno", { estado: "ACEPTADA" }],
  ])("rechaza %s antes de la base", async (_, cambio) => {
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/recepciones`)
      .set("Idempotency-Key", "recepcion-http-575")
      .send({ ...valid(), ...cambio })
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("exige Idempotency-Key", async () => {
    await request(app.getHttpServer()).post(`/api/ventas/contratos/${contrato}/recepciones`).send(valid()).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("anula con versión, motivo y la recepción de la ruta", async () => {
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/recepciones/${recepcion}/anular`)
      .set("Idempotency-Key", "anular-http-575")
      .send({ version: 1, motivo: "Registro equivocado" })
      .expect(201);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_accion: "ANULAR_RECEPCION",
      p_payload: { version: 1, motivo: "Registro equivocado", recepcion_id: recepcion },
    });
  });

  it("adjunta a la recepción de la ruta sin aceptar otro destino", async () => {
    upload.mockResolvedValue({ success: true, data: { id: recepcion, contrato_id: contrato } });
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/recepciones/${recepcion}/adjuntos`)
      .set("Idempotency-Key", "adjunto-http-575")
      .attach("file", Buffer.from("%PDF-1.4\n"), "guia.pdf")
      .expect(201);
    expect(upload).toHaveBeenCalledWith(
      tenant, actor, contrato, { recurso_tipo: "RECEPCION", recurso_id: recepcion }, "adjunto-http-575", expect.anything(),
    );
  });

  it.each([
    [{ code: "23514", message: "SUPPLY_RECEPTION_EXCEEDS_DISPATCH: despachado=20 recibido=20 solicitado=1" }, 400, /supera lo despachado/],
    [{ code: "23514", message: "SUPPLY_DELIVERY_ACCEPTED_BY_CUSTOMER" }, 400, /devolución/],
    [{ code: "23514", message: "SUPPLY_RECEPTION_REJECTION_REPLACED" }, 400, /repuesto/],
    [{ code: "23505", message: "SUPPLY_IDEMPOTENCY_CONFLICT" }, 409, /otros datos/],
    [{ code: "P0002", message: "SUPPLY_NOT_FOUND" }, 404, /No se encontró/],
    [{ code: "42501", message: "REFUND_REVERSAL_PERMISSION_REQUIRED: ventas.contratos.conformar" }, 403, /permiso/],
    [{ code: "08006", message: "connection failure" }, 503, /no está disponible/],
  ])("clasifica %j", async (error, status, texto) => {
    rpc.mockResolvedValue({ data: null, error });
    const res = await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/recepciones`)
      .set("Idempotency-Key", "recepcion-http-575")
      .send(valid())
      .expect(status);
    expect(res.body.message).toMatch(texto);
  });

  it("consulta el estado de cuenta y exige documentos en la respuesta", async () => {
    rpc.mockResolvedValue({ data: { lineas: [], documentos: [], totales: [] }, error: null });
    await request(app.getHttpServer()).get(`/api/ventas/contratos/${contrato}/estado-cuenta`).expect(200);
    expect(rpc).toHaveBeenCalledWith("consultar_suministro_estado_cuenta_576", {
      p_tenant_id: tenant, p_actor_id: actor, p_contrato_id: contrato,
    });
    rpc.mockResolvedValue({ data: { lineas: [] }, error: null });
    await request(app.getHttpServer()).get(`/api/ventas/contratos/${contrato}/estado-cuenta`).expect(503);
  });

  it("configura la base de facturación con versión, motivo y clave", async () => {
    await request(app.getHttpServer())
      .put(`/api/ventas/contratos/${contrato}/facturacion`)
      .set("Idempotency-Key", "facturacion-http-576")
      .send({ base_facturacion: "CONFORMIDAD", version: 3, motivo: "Pago contra conformidad" })
      .expect(200);
    expect(rpc).toHaveBeenCalledWith("configurar_facturacion_suministro_576", {
      p_tenant_id: tenant, p_actor_id: actor, p_contrato_id: contrato,
      p_payload: { base_facturacion: "CONFORMIDAD", version: 3, motivo: "Pago contra conformidad" },
      p_idempotency_key: "facturacion-http-576",
    });
  });

  it.each([
    [{ base_facturacion: "HITO", version: 3, motivo: "Base no admitida" }],
    [{ base_facturacion: "DESPACHO", version: 3, motivo: "no" }],
    [{ base_facturacion: "DESPACHO", motivo: "Sin versión del contrato" }],
  ])("rechaza bases de facturación inválidas antes de la base", async (body) => {
    await request(app.getHttpServer())
      .put(`/api/ventas/contratos/${contrato}/facturacion`)
      .set("Idempotency-Key", "facturacion-http-576")
      .send(body)
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("no confirma una respuesta vacía", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await request(app.getHttpServer())
      .post(`/api/ventas/contratos/${contrato}/recepciones`)
      .set("Idempotency-Key", "recepcion-http-575")
      .send(valid())
      .expect(503);
  });
});
