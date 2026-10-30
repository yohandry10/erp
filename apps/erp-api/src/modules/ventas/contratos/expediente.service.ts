import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import AdmZip = require("adm-zip");
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { suministroFailure } from "./contratos.service";
import { AdjuntarDocumentoDto, ConsultaContratosDto } from "./contratos.dto";

export type ArchivoSuministro = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};
const bucket = "supply-contract-files";
type Adjunto = {
  id: string;
  contrato_id: string;
  nombre: string;
  estado: string;
  sha256: string;
  object_path: string;
};
@Injectable()
export class ExpedienteService {
  constructor(private readonly supabase: SupabaseService) {}
  private async rpc(name: string, args: Record<string, unknown>): Promise<any> {
    const { data, error } = await this.supabase.getClient().rpc(name, args);
    if (error) suministroFailure(error);
    if (
      data == null ||
      ([
        "operar_suministro_pedidos_572",
        "finalizar_suministro_adjunto_573",
        "retirar_suministro_adjunto_573",
      ].includes(name) &&
        (!data.id || !data.contrato_id))
    )
      throw new ServiceUnavailableException(
        "No se pudo confirmar el expediente. Reintente con la misma solicitud.",
      );
    return data;
  }
  private key(key?: string) {
    if (!key || key.trim().length < 8 || key.trim().length > 180)
      throw new BadRequestException(
        "Se requiere Idempotency-Key de 8 a 180 caracteres.",
      );
    return key.trim();
  }
  async origenPedido(t: string, a: string, id: string) {
    return {
      success: true,
      data: await this.rpc("consultar_origen_suministro_572", {
        p_tenant_id: t,
        p_actor_id: a,
        p_pedido_id: id,
      }),
    };
  }
  async pedidos(
    t: string,
    a: string,
    c: string,
    action: string,
    id: string | null = null,
    query: ConsultaContratosDto = {},
  ) {
    return {
      success: true,
      data: await this.rpc("consultar_suministro_pedidos_572", {
        p_tenant_id: t,
        p_actor_id: a,
        p_contrato_id: c,
        p_accion: action,
        p_id: id,
        p_busqueda: query.busqueda || "",
        p_pagina: query.pagina || 1,
      }),
    };
  }
  async operarPedido(
    t: string,
    a: string,
    c: string,
    id: string,
    action: string,
    payload: object,
    key?: string,
  ) {
    return {
      success: true,
      data: await this.rpc("operar_suministro_pedidos_572", {
        p_tenant_id: t,
        p_actor_id: a,
        p_contrato_id: c,
        p_pedido_id: id,
        p_accion: action,
        p_payload: payload,
        p_idempotency_key: this.key(key),
      }),
    };
  }
  async adjuntos(t: string, a: string, c: string) {
    return {
      success: true,
      data: await this.rpc("consultar_suministro_adjuntos_573", {
        p_tenant_id: t,
        p_actor_id: a,
        p_contrato_id: c,
        p_id: null,
      }),
    };
  }
  private validate(
    file?: ArchivoSuministro,
  ): asserts file is ArchivoSuministro {
    if (
      !file?.buffer?.length ||
      file.size !== file.buffer.length ||
      file.size > 10485760
    )
      throw new BadRequestException("Seleccione un archivo de hasta 10 MB.");
    if (
      !file.originalname ||
      file.originalname.length > 160 ||
      /[/\\]/.test(file.originalname) ||
      [...file.originalname].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)
    )
      throw new BadRequestException(
        "Use un nombre de archivo de hasta 160 caracteres, sin rutas ni caracteres de control.",
      );
    const b = file.buffer;
    const format = file.mimetype;
    let valid =
      (format === "application/pdf" &&
        /\.pdf$/i.test(file.originalname) &&
        b.subarray(0, 5).toString() === "%PDF-") ||
      (format === "image/png" &&
        /\.png$/i.test(file.originalname) &&
        b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) ||
      (format === "image/jpeg" &&
        /\.jpe?g$/i.test(file.originalname) &&
        b.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")));
    if (
      format ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      /\.docx$/i.test(file.originalname)
    ) {
      try {
        const zip = new AdmZip(b);
        const entries = zip.getEntries();
        const types = zip.getEntry("[Content_Types].xml");
        valid =
          entries.length <= 2000 &&
          entries.reduce((sum, entry) => sum + entry.header.size, 0) <=
            52428800 &&
          Boolean(zip.getEntry("word/document.xml")) &&
          Boolean(types && types.header.size <= 262144) &&
          !entries.some((entry) =>
            /vbaProject|activeX|embeddings|(^|\/)\.\.(\/|$)/i.test(
              entry.entryName,
            ),
          );
        if (valid)
          valid = types!
            .getData()
            .includes(
              Buffer.from(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
              ),
            );
      } catch {
        valid = false;
      }
    }
    if (!valid)
      throw new BadRequestException(
        "El contenido y la extensión deben corresponder a PDF, DOCX sin macros, PNG o JPG.",
      );
  }
  async upload(
    t: string,
    a: string,
    c: string,
    target: AdjuntarDocumentoDto,
    key?: string,
    file?: ArchivoSuministro,
  ) {
    const k = this.key(key);
    if (file) {
      // Busboy interpreta parámetros multipart como latin1 por defecto; los
      // navegadores envían el nombre en UTF-8. Evitar dañar nombres ya decodificados.
      const bytes = Buffer.from(file.originalname || "", "latin1");
      const decoded = bytes.toString("utf8");
      const canDecode =
        [...(file.originalname || "")].every((c) => c.charCodeAt(0) <= 255) &&
        !decoded.includes("\uFFFD");
      file = {
        ...file,
        originalname: (canDecode ? decoded : file.originalname).normalize(
          "NFC",
        ),
      };
    }
    this.validate(file);
    const sha = createHash("sha256").update(file.buffer).digest("hex");
    const reserved: Adjunto = await this.rpc(
      "reservar_suministro_adjunto_573",
      {
        p_tenant_id: t,
        p_actor_id: a,
        p_contrato_id: c,
        p_idempotency_key: k,
        p_payload: {
          ...target,
          nombre: file.originalname,
          mime: file.mimetype,
          bytes: file.size,
          sha256: sha,
        },
      },
    );
    this.path(reserved, t, c);
    if (reserved.estado !== "DISPONIBLE") {
      const storage = this.supabase.getClient().storage.from(bucket);
      const { error } = await storage.upload(
        reserved.object_path,
        file.buffer,
        { contentType: file.mimetype, upsert: false, cacheControl: "0" },
      );
      if (error) {
        if (
          String((error as any).statusCode) !== "409" &&
          !/already exists|duplicate/i.test(error.message || "")
        )
          throw new ServiceUnavailableException(
            "No se pudo almacenar el adjunto. Reintente con el mismo archivo y clave.",
          );
        const stored = await storage.download(reserved.object_path);
        if (stored.error || !stored.data)
          throw new ServiceUnavailableException(
            "No se pudo verificar el archivo almacenado. Reintente.",
          );
        const actual = createHash("sha256")
          .update(Buffer.from(await stored.data.arrayBuffer()))
          .digest("hex");
        if (actual !== sha)
          throw new ConflictException(
            "El archivo almacenado no coincide con la huella de la operación.",
          );
      }
    }
    return {
      success: true,
      data: await this.rpc("finalizar_suministro_adjunto_573", {
        p_tenant_id: t,
        p_actor_id: a,
        p_id: reserved.id,
      }),
    };
  }
  private path(file: Adjunto, t: string, c: string) {
    if (!file.id || file.object_path !== `${t}/${c}/${file.id}`)
      throw new ServiceUnavailableException(
        "No se pudo resolver la ruta privada del adjunto.",
      );
  }
  async download(t: string, a: string, c: string, id: string) {
    const file: Adjunto = await this.rpc("consultar_suministro_adjuntos_573", {
      p_tenant_id: t,
      p_actor_id: a,
      p_contrato_id: c,
      p_id: id,
    });
    this.path(file, t, c);
    const { data, error } = await this.supabase
      .getClient()
      .storage.from(bucket)
      .createSignedUrl(file.object_path, 60, { download: file.nombre });
    if (error || !data?.signedUrl)
      throw new ServiceUnavailableException(
        "No se pudo preparar la descarga. Reintente.",
      );
    return { success: true, data: { url: data.signedUrl, expires_in: 60 } };
  }
  async retirar(
    t: string,
    a: string,
    c: string,
    id: string,
    motivo: string,
    key?: string,
  ) {
    return {
      success: true,
      data: await this.rpc("retirar_suministro_adjunto_573", {
        p_tenant_id: t,
        p_actor_id: a,
        p_contrato_id: c,
        p_id: id,
        p_motivo: motivo,
        p_idempotency_key: this.key(key),
      }),
    };
  }
}
