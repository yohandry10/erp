import type { Page, BrowserContext } from "@playwright/test";
import { SignJWT } from "jose";
import type { Contrato } from "../../../app/dashboard/ventas/contratos/types";

export const uuid = (n: number) =>
  `57000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const user = {
  id: uuid(1),
  tenant_id: uuid(2),
  email: "supply-feature@erp.local",
  nombre: "Responsable",
  apellido: "Local",
  roles: ["RESPONSABLE_SUMINISTRO"],
  is_super_admin: false,
};
export async function sesion(context: BrowserContext, page: Page) {
  const secret = process.env.JWT_SECRET;
  if (
    !secret ||
    !process.env.BASE_URL ||
    !["127.0.0.1", "localhost"].includes(new URL(process.env.BASE_URL).hostname)
  )
    throw new Error("Se requiere servidor y JWT local inyectados");
  const token = await new SignJWT({
    tenant_id: user.tenant_id,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
  await context.addCookies([
    {
      name: "access_token",
      value: token,
      url: process.env.BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser });
    localStorage.setItem("erp.auth.session.snapshot", session);
    sessionStorage.setItem("erp.auth.session.snapshot", session);
    localStorage.setItem("erp_onboarding_completed", JSON.stringify(["admin"]));
    localStorage.setItem("selectedCountry", "1");
  }, user);
}

export async function doble(
  page: Page,
  options: {
    readOnly?: boolean;
    listFailure?: boolean;
    expediente?: boolean;
  } = {},
) {
  let contract: Contrato | null = null;
  if (options.expediente)
    contract = {
      id: uuid(5),
      numero: "SUP-001",
      asunto: "Suministro programado local",
      cliente_id: uuid(3),
      cliente_nombre: "Cliente local",
      responsable_id: user.id,
      responsable_nombre: "Responsable Local",
      moneda: "PEN",
      vigencia_desde: "2026-01-01",
      vigencia_hasta: "2026-12-31",
      estado: "ACTIVO",
      version: 2,
      lineas: [
        {
          id: uuid(6),
          producto_id: uuid(4),
          codigo_producto: "SKU-1",
          descripcion: "Producto de suministro",
          unidad_medida: "NIU",
          cantidad: 100,
          cantidad_en_oc: 60,
          precio_unitario: 12.345678,
        },
      ],
      ordenes: [
        {
          id: uuid(7),
          numero: "OC-001",
          fecha_emision: "2026-10-27",
          estado: "ACTIVA",
          version: 1,
          lineas: [
            {
              id: uuid(8),
              contrato_linea_id: uuid(6),
              cantidad: 60,
              cantidad_programada: 40,
              precio_unitario: 12.345678,
            },
          ],
        },
      ],
      entregas: [
        {
          id: uuid(9),
          orden_linea_id: uuid(8),
          cantidad: 40,
          fecha_original: "2026-11-10",
          fecha_programada: "2026-11-10",
          destino: "Almacén del cliente",
          estado: "PROGRAMADA",
          version: 1,
        },
      ],
      historial: [],
    };
  const linked: any[] = [];
  const files: any[] = [];
  const uploads: Array<{ key: string; file: string; target: string }> = [];
  const orderIntents: Array<{ key: string; payload: unknown }> = [];
  let loseUpload = true,
    loseLink = true;
  let listFailure = Boolean(options.listFailure);
  let loseSchedule = true;
  let loseAmendment = true;
  const revisions: Array<{ key: string; payload: unknown }> = [];
  const schedules: Array<{ key: string; payload: unknown }> = [];
  const completed = new Map<string, object>();
  const mutationPaths: string[] = [];
  const reprograms: Array<{ version: number }> = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname))
      return route.abort("blockedbyclient");
    if (!url.pathname.includes("/api/")) return route.continue();
    const path = url.pathname.replace(/^.*\/api\//, "/").replace(/\/$/, "");
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    const common: Record<string, unknown> = {
      "/auth/profile": user,
      "/tenants/me": {
        data: {
          id: user.tenant_id,
          nombre: "Empresa de prueba local",
          pais: "PE",
          moneda: "PEN",
          estado: "ACTIVO",
        },
      },
      "/demo/status": { is_demo: false, is_expired: false },
      "/notifications/unread": { data: [], count: 0 },
      "/usuarios-sistema/me/permissions": {
        data: [
          ...(options.expediente
            ? (options.readOnly ? ["ver"] : ["ver", "editar"]).map(
                (accion) => ({
                  id: `pedido-${accion}`,
                  tenant_id: user.tenant_id,
                  modulo: "ventas",
                  recurso: "pedidos",
                  accion,
                }),
              )
            : []),
          ...(options.readOnly ? ["ver"] : ["ver", "gestionar"]).map(
            (accion) => ({
              id: accion,
              tenant_id: user.tenant_id,
              modulo: "ventas",
              recurso: "contratos",
              accion,
            }),
          ),
        ],
      },
      "/configuration/context/country": {
        data: {
          pais_id: 1,
          pais: "PE",
          paisCodigo: "PE",
          moneda: "PEN",
          monedaDefecto: "PEN",
          locale: "es-PE",
          timezone: "America/Lima",
        },
      },
      "/configuration/empresa": {
        success: true,
        data: {
          pais: "PE",
          paisCodigo: "PE",
          razonSocial: "Empresa local",
          monedaDefecto: "PEN",
        },
      },
      "/configuration/status": {
        success: true,
        data: { isComplete: true, isDemo: false, completionPercentage: 100 },
      },
    };
    if (path in common) return json(common[path]);
    if (options.expediente && path === `/ventas/pedidos/${uuid(40)}`)
      return json({
        success: true,
        data: {
          id: uuid(40),
          numero: "PV-2026-0040",
          cliente_id: uuid(3),
          estado: "PENDIENTE",
          fecha_pedido: "2026-10-27",
          moneda: "PEN",
          subtotal: 370.37,
          igv: 66.67,
          total: 437.04,
          created_at: "2026-10-27T16:00:00Z",
          clientes: {
            nombre: "Cliente local",
            razon_social: "Cliente local",
            ruc: "20123456786",
          },
          detalle: [
            {
              id: uuid(41),
              producto_id: uuid(4),
              descripcion: "Producto de suministro",
              cantidad: 30,
              precio_unitario: 12.345678,
              subtotal: 370.37,
            },
          ],
          metadata: {},
        },
      });
    if (!path.startsWith("/ventas/contratos"))
      return json({ success: true, data: [] });
    if (route.request().method() === "GET") {
      if (path.includes("/origen-pedido/"))
        return json({
          success: true,
          data: linked.map((v) => ({
            id: v.id,
            contrato_id: uuid(5),
            contrato_numero: "SUP-001",
            estado: v.estado,
            lineas: [
              {
                id: uuid(43),
                descripcion: "Producto de suministro",
                cantidad: 30,
                oc_numero: "OC-001",
                fecha_programada: "2026-11-10",
                destino: "Almacén del cliente",
              },
            ],
          })),
        });
      if (path.endsWith("/adjuntos"))
        return json({ success: true, data: files });
      if (path.endsWith("/descarga"))
        return json({
          success: true,
          data: {
            url: "http://127.0.0.1/private-download/Contrato.pdf",
            expires_in: 60,
          },
        });
      if (path.endsWith("/pedidos/candidatos"))
        return json({
          success: true,
          data: [{ id: uuid(40), numero: "PV-2026-0040" }],
        });
      if (path.includes("/pedidos/candidatos/"))
        return json({
          success: true,
          data: {
            id: uuid(40),
            numero: "PV-2026-0040",
            fingerprint: "a".repeat(64),
            detalle: [
              {
                id: uuid(41),
                producto_id: uuid(4),
                descripcion: "Producto de suministro",
                cantidad: 30,
                precio_unitario: 12.345678,
              },
            ],
          },
        });
      if (path.endsWith("/pedidos"))
        return json({ success: true, data: linked });
      if (path.includes("/catalogos/")) {
        const tipo = path.split("/").pop();
        return json({
          success: true,
          data: {
            items:
              tipo === "clientes"
                ? [{ id: uuid(3), nombre: "Cliente local" }]
                : tipo === "productos"
                  ? [
                      {
                        id: uuid(4),
                        nombre: "Producto de suministro",
                        codigo: "SKU-1",
                      },
                    ]
                  : [{ id: user.id, nombre: "Responsable Local" }],
          },
        });
      }
      if (path === "/ventas/contratos") {
        if (listFailure)
          return json(
            { message: "No se pudo consultar los contratos.", statusCode: 503 },
            503,
          );
        return json({
          success: true,
          data: { items: contract ? [contract] : [], total: contract ? 1 : 0 },
        });
      }
      return json({ success: true, data: contract });
    }
    mutationPaths.push(path);
    if (path.endsWith("/adjuntos")) {
      const key = route.request().headers()["idempotency-key"];
      const body = route.request().postData() || "";
      const fileContent =
        body.match(/filename="[^"]+"[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/)?.[1] ||
        "";
      const target =
        body.match(/name="recurso_id"\r\n\r\n([^\r\n]+)/)?.[1] || "";
      uploads.push({ key, file: fileContent, target });
      if (completed.has(key))
        return json({ success: true, data: completed.get(key) });
      files.push({
        id: uuid(50),
        nombre: "Contrato.pdf",
        recurso_tipo: "OC",
        recurso_id: target,
        bytes: fileContent.length,
        sha256: "a".repeat(64),
        estado: "DISPONIBLE",
      });
      contract!.historial.push({
        id: uuid(51),
        accion: "ADJUNTAR_DOCUMENTO",
        actor_id: user.id,
        created_at: "2026-10-27T16:00:00Z",
        actual: {},
      });
      const result = {
        id: uuid(50),
        contrato_id: contract!.id,
        accion: "ADJUNTAR_DOCUMENTO",
      };
      completed.set(key, result);
      if (loseUpload) {
        loseUpload = false;
        return json(
          { message: "Confirmación del archivo perdida.", statusCode: 503 },
          503,
        );
      }
      return json({ success: true, data: result });
    }
    const payload = route.request().postDataJSON();
    const key = route.request().headers()["idempotency-key"];
    if (path.endsWith("/entregas")) schedules.push({ key, payload });
    if (path.endsWith("/adendas")) revisions.push({ key, payload });
    if (path.endsWith("/vincular") && completed.has(key))
      orderIntents.push({ key, payload });
    if (completed.has(key))
      return json({ success: true, data: completed.get(key) });
    let previous: Record<string, unknown> | undefined;
    let current: Record<string, unknown> | undefined;
    let action = "";
    let id = uuid(5);
    if (path.endsWith("/vincular")) {
      orderIntents.push({ key, payload });
      action = "VINCULAR_PEDIDO";
      id = uuid(42);
      linked.push({
        id,
        pedido_id: uuid(40),
        numero: "PV-2026-0040",
        estado: "VINCULADO",
        pedido_estado: "PENDIENTE",
        lineas: [
          {
            id: uuid(43),
            entrega_id: uuid(9),
            descripcion: "Producto de suministro",
            cantidad: 30,
            cantidad_despachada: 0,
            cantidad_facturada: 0,
          },
        ],
      });
    } else if (path.endsWith("/desvincular")) {
      action = "DESVINCULAR_PEDIDO";
      id = uuid(42);
      linked[0].estado = "DESVINCULADO";
    } else if (path.endsWith("/retirar")) {
      action = "RETIRAR_ADJUNTO";
      id = uuid(50);
      files[0].estado = "RETIRADO";
      files[0].motivo_retiro = payload.motivo;
    } else if (path === "/ventas/contratos") {
      action = "CREAR_CONTRATO";
      contract = {
        ...payload,
        id,
        cliente_nombre: "Cliente local",
        responsable_nombre: "Responsable Local",
        estado: "BORRADOR",
        version: 1,
        lineas: payload.lineas.map((l: object) => ({
          ...l,
          id: uuid(6),
          codigo_producto: "SKU-1",
          descripcion: "Producto de suministro",
          unidad_medida: "NIU",
          cantidad_en_oc: 0,
        })),
        ordenes: [],
        entregas: [],
        historial: [],
      };
    } else if (path.endsWith("/activar")) {
      action = "ACTIVAR";
      contract!.estado = "ACTIVO";
      contract!.version++;
    } else if (path.endsWith("/ordenes-cliente")) {
      action = "CREAR_OC";
      id = uuid(7);
      contract!.ordenes.push({
        id,
        numero: payload.numero,
        fecha_emision: payload.fecha_emision,
        estado: "ACTIVA",
        version: 1,
        lineas: [
          {
            id: uuid(8),
            contrato_linea_id: uuid(6),
            cantidad: payload.lineas[0].cantidad,
            cantidad_programada: 0,
            precio_unitario: contract!.lineas[0].precio_unitario,
          },
        ],
      });
      contract!.lineas[0].cantidad_en_oc = payload.lineas[0].cantidad;
    } else if (path.endsWith("/entregas")) {
      action = "PROGRAMAR";
      id = uuid(9);
      contract!.entregas.push({
        ...payload,
        id,
        fecha_original: payload.fecha_programada,
        version: 1,
        estado: "PROGRAMADA",
      });
      contract!.ordenes[0].lineas[0].cantidad_programada += payload.cantidad;
    } else if (path.endsWith("/adendas")) {
      action = "ADENDAR";
      previous = structuredClone(contract!) as unknown as Record<
        string,
        unknown
      >;
      contract!.asunto = payload.asunto;
      contract!.vigencia_hasta = payload.vigencia_hasta;
      contract!.observaciones = payload.observaciones;
      contract!.version++;
      contract!.lineas[0].cantidad = payload.lineas[0].cantidad;
      contract!.lineas[0].precio_unitario = payload.lineas[0].precio_unitario;
      current = structuredClone(contract!) as unknown as Record<
        string,
        unknown
      >;
    } else if (path.endsWith("/modificar")) {
      action = "MODIFICAR_OC";
      id = uuid(7);
      previous = structuredClone(contract!.ordenes[0]) as unknown as Record<
        string,
        unknown
      >;
      contract!.ordenes[0].version++;
      contract!.ordenes[0].numero = payload.numero;
      contract!.ordenes[0].lineas[0].cantidad = payload.lineas[0].cantidad;
      contract!.lineas[0].cantidad_en_oc = payload.lineas[0].cantidad;
      current = structuredClone(contract!.ordenes[0]) as unknown as Record<
        string,
        unknown
      >;
    } else if (path.endsWith("/anular") && path.includes("/entregas/")) {
      action = "ANULAR_ENTREGA";
      id = uuid(9);
      contract!.entregas[0].estado = "ANULADA";
      contract!.entregas[0].version++;
      contract!.ordenes[0].lineas[0].cantidad_programada = 0;
    } else if (path.endsWith("/anular") && path.includes("/ordenes-cliente/")) {
      action = "ANULAR_OC";
      id = uuid(7);
      previous = structuredClone(contract!.ordenes[0]) as unknown as Record<
        string,
        unknown
      >;
      contract!.ordenes[0].estado = "ANULADA";
      contract!.ordenes[0].version++;
      contract!.lineas[0].cantidad_en_oc = 0;
      current = structuredClone(contract!.ordenes[0]) as unknown as Record<
        string,
        unknown
      >;
    } else if (path.endsWith("/reprogramar")) {
      reprograms.push(payload);
      action = "REPROGRAMAR";
      id = uuid(9);
      contract!.entregas[0] = {
        ...contract!.entregas[0],
        fecha_programada: payload.fecha_programada,
        destino: payload.destino,
        version: contract!.entregas[0].version + 1,
      };
    }
    contract!.historial.push({
      id: uuid(20 + mutationPaths.length),
      accion: action,
      motivo: payload.motivo,
      referencia: payload.referencia,
      actor_id: user.id,
      actor_nombre: "Responsable Local",
      created_at: "2026-10-27T16:00:00Z",
      anterior:
        action === "REPROGRAMAR"
          ? { fecha_programada: "2026-11-10" }
          : previous,
      actual: current || payload,
    });
    const result = { id, contrato_id: contract!.id, accion: action };
    completed.set(key, result);
    if (path.endsWith("/entregas") && loseSchedule) {
      loseSchedule = false;
      return json(
        {
          message: "Se perdió la confirmación de la entrega.",
          statusCode: 503,
        },
        503,
      );
    }
    if (path.endsWith("/vincular") && loseLink) {
      loseLink = false;
      return json(
        { message: "Confirmación del vínculo perdida.", statusCode: 503 },
        503,
      );
    }
    if (path.endsWith("/adendas") && loseAmendment) {
      loseAmendment = false;
      return json(
        { message: "Se perdió la confirmación de la adenda.", statusCode: 503 },
        503,
      );
    }
    return json({ success: true, data: result });
  });
  return {
    uploads,
    orderIntents,
    revisions,
    reprograms,
    externalReprogram: () => {
      contract!.entregas[0].version = 3;
      contract!.entregas[0].fecha_programada = "2026-11-20";
    },
    schedules,
    mutationPaths,
    restoreList: () => {
      listFailure = false;
    },
  };
}
