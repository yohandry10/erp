import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { createHash } from "node:crypto";
import AdmZip = require("adm-zip");
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { PERMISSION_KEY } from "../../../common/decorators/require-permission.decorator";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ExpedienteController } from "./expediente.controller";
import { ExpedienteService } from "./expediente.service";

const t = "57200000-0000-4000-8000-000000000001",
  a = "57200000-0000-4000-8000-000000000002",
  c = "57200000-0000-4000-8000-000000000003",
  id = "57200000-0000-4000-8000-000000000004";
const base = `/api/ventas/contratos/${c}`;
const pdf = Buffer.from("%PDF-1.7\nlocal document\n%%EOF");
describe("Expediente de suministro HTTP y Storage privado con dobles", () => {
  let app: INestApplication;
  const rpc = jest.fn(),
    upload = jest.fn(),
    download = jest.fn(),
    createSignedUrl = jest.fn(),
    storage = jest.fn();
  const reserve = {
    id,
    contrato_id: c,
    nombre: "Contrato.pdf",
    object_path: `${t}/${c}/${id}`,
    sha256: createHash("sha256").update(pdf).digest("hex"),
    estado: "PENDIENTE",
  };
  const result = { id, contrato_id: c, accion: "ADJUNTAR_DOCUMENTO" };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ExpedienteController],
      providers: [
        ExpedienteService,
        {
          provide: SupabaseService,
          useValue: { getClient: () => ({ rpc, storage: { from: storage } }) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { id: a, tenant_id: t };
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
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    rpc.mockImplementation(async (name: string) => ({
      data:
        name === "reservar_suministro_adjunto_573"
          ? reserve
          : name === "consultar_suministro_adjuntos_573"
            ? { ...reserve, estado: "DISPONIBLE" }
            : result,
      error: null,
    }));
    upload.mockResolvedValue({ data: {}, error: null });
    download.mockResolvedValue({ data: new Blob([pdf]), error: null });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "http://127.0.0.1/download/Contrato.pdf" },
      error: null,
    });
    storage.mockReturnValue({ upload, download, createSignedUrl });
  });
  const attach = (
    body = pdf,
    name = "Contrato.pdf",
    mime = "application/pdf",
  ) =>
    request(app.getHttpServer())
      .post(`${base}/adjuntos`)
      .set("Idempotency-Key", "upload-http-573")
      .field("recurso_tipo", "CONTRATO")
      .field("recurso_id", c)
      .attach("file", body, { filename: name, contentType: mime });
  it("exige consulta o gestión en todas las rutas", () => {
    for (const method of Object.getOwnPropertyNames(
      ExpedienteController.prototype,
    ).filter((m) => m !== "constructor"))
      expect(
        Reflect.getMetadata(
          PERMISSION_KEY,
          ExpedienteController.prototype[method],
        )?.raw,
      ).toBe(
        method === "origenPedido"
          ? "ventas.pedidos.ver"
          : [
                "pedidos",
                "candidatos",
                "candidato",
                "adjuntos",
                "descarga",
              ].includes(method)
            ? "ventas.contratos.ver"
            : "ventas.contratos.gestionar",
      );
  });
  it("sube sin sobrescribir y finaliza después de almacenar", async () => {
    await attach().expect(201);
    expect(storage).toHaveBeenCalledWith("supply-contract-files");
    expect(upload).toHaveBeenCalledWith(
      reserve.object_path,
      pdf,
      expect.objectContaining({
        upsert: false,
        contentType: "application/pdf",
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "reservar_suministro_adjunto_573",
      expect.objectContaining({
        p_tenant_id: t,
        p_actor_id: a,
        p_contrato_id: c,
        p_payload: expect.objectContaining({
          sha256: reserve.sha256,
          bytes: pdf.length,
        }),
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(2, "finalizar_suministro_adjunto_573", {
      p_tenant_id: t,
      p_actor_id: a,
      p_id: id,
    });
  });
  it("recupera objeto previamente subido verificando su huella", async () => {
    upload.mockResolvedValue({
      error: { statusCode: "409", message: "Duplicate" },
    });
    await attach().expect(201);
    expect(download).toHaveBeenCalledWith(reserve.object_path);
  });
  it("rechaza contenido diferente en la ruta reservada sin finalizar", async () => {
    upload.mockResolvedValue({
      error: { statusCode: "409", message: "Duplicate" },
    });
    download.mockResolvedValue({ data: new Blob(["different"]), error: null });
    await attach().expect(409);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("una caída Storage es 503 recuperable, sin falso adjunto confirmado", async () => {
    upload.mockResolvedValue({ error: { message: "private.host.internal" } });
    const r = await attach().expect(503);
    expect(r.text).not.toContain("private.host");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("replay confirmado no vuelve a subir el objeto", async () => {
    rpc.mockImplementation(async (name: string) => ({
      data:
        name === "reservar_suministro_adjunto_573"
          ? { ...reserve, estado: "DISPONIBLE" }
          : result,
      error: null,
    }));
    await attach().expect(201);
    expect(upload).not.toHaveBeenCalled();
  });
  it.each([
    ["fake.pdf", "application/pdf", Buffer.from("not pdf")],
    ["Contrato.exe", "application/pdf", pdf],
    ["Contrato.pdf", "text/html", pdf],
    ["empty.pdf", "application/pdf", Buffer.alloc(0)],
    ["big.pdf", "application/pdf", Buffer.alloc(10485761)],
  ])("rechaza archivo inválido %s", async (name, mime, body) => {
    const r = await attach(body as Buffer, name as string, mime as string);
    expect([400, 413]).toContain(r.status);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("valida DOCX estructurado y bloquea macros", async () => {
    const zip = new AdmZip();
    zip.addFile(
      "[Content_Types].xml",
      Buffer.from(
        "<Types>application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml</Types>",
      ),
    );
    zip.addFile("word/document.xml", Buffer.from("<document/>"));
    await attach(
      zip.toBuffer(),
      "Contrato.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ).expect(201);
    rpc.mockClear();
    zip.addFile("word/vbaProject.bin", Buffer.from("macro"));
    await attach(
      zip.toBuffer(),
      "Contrato.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("el permiso revocado impide tocar Storage", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    await attach().expect(403);
    expect(upload).not.toHaveBeenCalled();
  });
  it("descarga privada dura 60 segundos y fuerza descarga con nombre", async () => {
    await request(app.getHttpServer())
      .get(`${base}/adjuntos/${id}/descarga`)
      .expect(200);
    expect(createSignedUrl).toHaveBeenCalledWith(reserve.object_path, 60, {
      download: "Contrato.pdf",
    });
  });
  it("un adjunto retirado o ajeno no genera enlace", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "SUPPLY_NOT_FOUND" },
    });
    await request(app.getHttpServer())
      .get(`${base}/adjuntos/${id}/descarga`)
      .expect(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
  it("rechaza ruta Storage inconsistente", async () => {
    rpc.mockResolvedValue({
      data: { ...reserve, object_path: "another-tenant/file" },
      error: null,
    });
    await request(app.getHttpServer())
      .get(`${base}/adjuntos/${id}/descarga`)
      .expect(503);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
  it("pasa identidad autenticada y mapeo completo al writer de pedidos", async () => {
    const payload = {
      fingerprint: "a".repeat(64),
      motivo: "Planificacion operativa",
      lineas: [{ pedido_detalle_id: id, entrega_id: c }],
    };
    await request(app.getHttpServer())
      .post(`${base}/pedidos/${id}/vincular`)
      .set("Idempotency-Key", "link-http-572")
      .send(payload)
      .expect(201);
    expect(rpc).toHaveBeenCalledWith(
      "operar_suministro_pedidos_572",
      expect.objectContaining({
        p_tenant_id: t,
        p_actor_id: a,
        p_contrato_id: c,
        p_pedido_id: id,
        p_payload: payload,
      }),
    );
  });
  it.each([
    { lineas: [] },
    { fingerprint: "stale" },
    { tenant_id: t },
    { lineas: [{ pedido_detalle_id: id, entrega_id: c, cantidad: 999 }] },
    {
      lineas: [
        { pedido_detalle_id: id, entrega_id: c },
        { pedido_detalle_id: id, entrega_id: c },
      ],
    },
  ])("rechaza vínculo inválido %j", async (patch) => {
    await request(app.getHttpServer())
      .post(`${base}/pedidos/${id}/vincular`)
      .set("Idempotency-Key", "invalid-link-572")
      .send({
        fingerprint: "a".repeat(64),
        motivo: "Planificacion operativa",
        lineas: [{ pedido_detalle_id: id, entrega_id: c }],
        ...patch,
      })
      .expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("no expone caída de consultas como lista vacía", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "08006", message: "private.database" },
    });
    await request(app.getHttpServer()).get(`${base}/pedidos`).expect(503);
  });
  it("consulta origen desde el pedido con ambas identidades autenticadas", async () => {
    await request(app.getHttpServer())
      .get(`/api/ventas/contratos/origen-pedido/${id}`)
      .expect(200);
    expect(rpc).toHaveBeenCalledWith("consultar_origen_suministro_572", {
      p_tenant_id: t,
      p_actor_id: a,
      p_pedido_id: id,
    });
  });
  it("no confirma una mutación sin identificadores de resultado", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await request(app.getHttpServer())
      .post(`${base}/pedidos/${id}/desvincular`)
      .set("Idempotency-Key", "empty-result-572")
      .send({ motivo: "Correccion del pedido" })
      .expect(503);
  });
  it("conserva nombres españoles de archivo multipart", async () => {
    await attach(pdf, "Invitación.pdf").expect(201);
    expect(rpc).toHaveBeenCalledWith(
      "reservar_suministro_adjunto_573",
      expect.objectContaining({
        p_payload: expect.objectContaining({ nombre: "Invitación.pdf" }),
      }),
    );
  });
});
