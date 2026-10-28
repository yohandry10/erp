import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { randomBytes } from "crypto";
import * as ExcelJS from "exceljs";
import { SupabaseService } from "../../shared/supabase/supabase.service";
import { digestCredencialBi } from "./bi-api-key.guard";
import { ConsultaTableroDto, CredencialBiDto, Dataset, FiltrosTableroDto, LecturaBiDto } from "./tableros.dto";

const errores: Record<string, string> = {
  DASHBOARD_FILTER_INVALID: "Revise los filtros: contrato y cliente válidos y un rango de fechas ordenado.",
  DASHBOARD_CUTOFF_NOT_FOUND: "El corte no existe en esta empresa.",
  DASHBOARD_INPUT_INVALID: "Revise los datos de la operación.",
  BI_INPUT_INVALID: "Indique un nombre de 3 a 120 caracteres y al menos un conjunto válido.",
  BI_EXPIRY_INVALID: "El vencimiento debe ser posterior a hoy y como máximo dentro de un año.",
  BI_DATASET_PERMISSION_REQUIRED: "Sólo puede entregar a Power BI los conjuntos que usted puede consultar.",
  BI_CREDENTIAL_REVOKED: "La credencial ya está revocada.",
  SUPPLY_REASON_REQUIRED: "Indique un motivo de entre 5 y 1000 caracteres.",
  SUPPLY_IDEMPOTENCY_CONFLICT: "La referencia de operación ya se usó con otros datos. Actualice y vuelva a intentarlo.",
};

/** Columnas de cada conjunto en Excel: clave de la fila y encabezado. */
const COLUMNAS: Record<Dataset, Array<[string, string]>> = {
  contratos: [
    ["contrato_numero", "Contrato"], ["cliente", "Cliente"], ["oc_numero", "OC"], ["oc_fecha", "Fecha OC"], ["moneda", "Moneda"],
    ["cantidad_oc", "Cantidad OC"], ["programado", "Programado"], ["despachado", "Despachado"], ["aceptado", "Aceptado"],
    ["valor_oc", "Valor OC"], ["facturado_valor", "Facturado"], ["por_facturar_valor", "Por facturar"],
    ["contrato_id", "ID contrato"], ["orden_cliente_id", "ID OC"],
  ],
  entregas: [
    ["contrato_numero", "Contrato"], ["cliente", "Cliente"], ["oc_numero", "OC"], ["codigo_producto", "Producto"],
    ["descripcion", "Descripción"], ["destino", "Destino"], ["fecha_original", "Fecha original"],
    ["fecha_programada", "Fecha programada"], ["cantidad", "Cantidad"], ["despachado", "Despachado"], ["aceptado", "Aceptado"],
    ["rechazado", "Rechazado"], ["fecha_cumplimiento", "Fecha de aceptación completa"], ["cumplimiento", "Cumplimiento"],
    ["dias_atraso", "Días de atraso"], ["pedidos", "Pedidos"], ["recepciones", "Recepciones"],
    ["contrato_id", "ID contrato"], ["entrega_id", "ID entrega"],
  ],
  stock: [
    ["codigo_producto", "Producto"], ["descripcion", "Descripción"], ["unidad_medida", "Unidad"], ["stock_fisico", "Stock físico"],
    ["stock_vencido", "Stock vencido"], ["stock_utilizable", "Stock utilizable"], ["stock_reservado", "Reservado"],
    ["pendiente_30_dias", "Pendiente 30 días"], ["pendiente_total", "Pendiente total"], ["cobertura_pct", "Cobertura %"],
    ["estado", "Estado"], ["producto_id", "ID producto"],
  ],
  vencimientos: [
    ["codigo_producto", "Producto"], ["descripcion", "Descripción"], ["lote", "Lote"], ["fecha_vencimiento", "Vence"],
    ["dias_para_vencer", "Días para vencer"], ["stock", "Stock"], ["stock_reservado", "Reservado"], ["estado", "Estado"],
    ["lote_id", "ID lote"], ["producto_id", "ID producto"],
  ],
  cobranza: [
    ["contrato_numero", "Contrato"], ["cliente", "Cliente"], ["documento", "Comprobante"], ["pedido_numero", "Pedido"],
    ["fecha_emision", "Emisión"], ["fecha_vencimiento", "Vencimiento"], ["moneda", "Moneda"], ["total", "Total"],
    ["notas_credito", "Notas de crédito"], ["cobrado", "Cobrado"], ["saldo", "Saldo"], ["situacion", "Situación"],
    ["dias_vencido", "Días vencido"], ["cuadra", "Cuadra"], ["cxc_id", "ID CxC"], ["pedido_id", "ID pedido"],
    ["contrato_id", "ID contrato"],
  ],
  penalidades: [
    ["contrato_numero", "Contrato"], ["cliente", "Cliente"], ["fecha_programada", "Entrega"], ["regla", "Regla"],
    ["regla_version", "Versión"], ["fecha_corte_calculo", "Corte del cálculo"], ["dias_atraso", "Días de atraso"],
    ["moneda", "Moneda"], ["monto_estimado", "Estimado"], ["estado", "Estado"], ["monto_aprobado", "Aprobado"],
    ["calculo_id", "ID cálculo"], ["entrega_id", "ID entrega"], ["contrato_id", "ID contrato"],
  ],
};
const TITULOS: Record<Dataset, string> = {
  contratos: "Contratos y OC",
  entregas: "Entregas",
  stock: "Cobertura de stock",
  vencimientos: "Vencimientos",
  cobranza: "Cobranza",
  penalidades: "Penalidades",
};

type Tablero = {
  corte: Record<string, any>;
  datasets: Partial<Record<Dataset, Array<Record<string, any>>>>;
  resumen: Record<string, any>;
  ocultos: string[];
};

/** Tablero de suministro, cortes conciliables, Excel y lectura BI (579). */
@Injectable()
export class TablerosService {
  private readonly logger = new Logger(TablerosService.name);
  constructor(private readonly supabase: SupabaseService) {}

  async consultar(tenantId: string, actorId: string, dto: ConsultaTableroDto) {
    this.identidad(tenantId, actorId);
    const { corte_id, ...filtros } = dto;
    const { data, error } = await this.supabase.getClient().rpc("consultar_tablero_suministro_579", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_corte_id: corte_id ?? null,
      p_filtros: filtros,
    });
    if (error) tableroFailure(error);
    if (!data?.corte?.hash || !data.datasets || !data.resumen)
      throw new ServiceUnavailableException("No se pudo consultar el tablero. Reintente.");
    return { success: true, data };
  }

  async registrarCorte(tenantId: string, actorId: string, key?: string) {
    this.identidad(tenantId, actorId);
    const { data, error } = await this.supabase.getClient().rpc("registrar_corte_tablero_579", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: this.clave(key),
    });
    if (error) tableroFailure(error);
    if (!data?.id || !data?.hash)
      throw new ServiceUnavailableException("No se pudo confirmar el corte. Reintente con la misma operación.");
    return { success: true, data };
  }

  /** Excel de un corte registrado: hoja de corte, resumen y un detalle por conjunto visible. */
  async excel(tenantId: string, actorId: string, corteId: string, filtros: FiltrosTableroDto) {
    const { data } = await this.consultar(tenantId, actorId, { ...filtros, corte_id: corteId });
    const tablero = data as Tablero;
    const libro = new ExcelJS.Workbook();
    libro.created = new Date(tablero.corte.generado_en);
    const corte = libro.addWorksheet("Corte");
    corte.columns = [{ header: "Dato", key: "dato", width: 28 }, { header: "Valor", key: "valor", width: 80 }];
    const filtrosTexto = Object.entries(filtros).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ") || "Sin filtros";
    [
      ["Corte", tablero.corte.id],
      ["Fecha de corte", tablero.corte.fecha_corte],
      ["Origen", tablero.corte.origen],
      ["Generado en", tablero.corte.generado_en],
      ["Generado por", tablero.corte.generado_por_nombre ?? "Tarea automática"],
      ["Hash SHA-256 del corte", tablero.corte.hash],
      ["Filtros", filtrosTexto],
      ["Conjuntos sin permiso", tablero.ocultos.length ? tablero.ocultos.join(", ") : "Ninguno"],
      ["Exportado en", new Date().toISOString()],
    ].forEach(([dato, valor]) => corte.addRow({ dato, valor }));
    corte.getRow(1).font = { bold: true };

    const resumen = libro.addWorksheet("Resumen");
    resumen.columns = [
      { header: "Indicador", key: "indicador", width: 44 },
      { header: "Moneda", key: "moneda", width: 10 },
      { header: "Valor", key: "valor", width: 16 },
      { header: "Detalle", key: "detalle", width: 22 },
    ];
    for (const fila of filasResumen(tablero.resumen)) resumen.addRow(fila);
    resumen.getRow(1).font = { bold: true };

    for (const [nombre, filas] of Object.entries(tablero.datasets) as Array<[Dataset, Array<Record<string, any>>]>) {
      const hoja = libro.addWorksheet(TITULOS[nombre]);
      hoja.columns = COLUMNAS[nombre].map(([key, header]) => ({ header, key, width: Math.max(12, header.length + 2) }));
      for (const fila of filas) hoja.addRow(Object.fromEntries(COLUMNAS[nombre].map(([key]) => [key, celda(fila[key])])));
      hoja.getRow(1).font = { bold: true };
      hoja.views = [{ state: "frozen", ySplit: 1 }];
    }
    const buffer = Buffer.from(await libro.xlsx.writeBuffer());
    const nombre = `tablero_suministro_${tablero.corte.fecha_corte}_${String(tablero.corte.id).slice(0, 8)}.xlsx`;
    return { buffer, nombre, hash: tablero.corte.hash as string };
  }

  async credenciales(tenantId: string, actorId: string) {
    this.identidad(tenantId, actorId);
    const { data, error } = await this.supabase.getClient().rpc("consultar_credenciales_bi_579", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
    });
    if (error) tableroFailure(error);
    if (!Array.isArray(data?.credenciales)) throw new ServiceUnavailableException("No se pudo consultar las credenciales. Reintente.");
    return { success: true, data };
  }

  /** El token sólo existe en esta respuesta; la base guarda su hash. */
  async crearCredencial(tenantId: string, actorId: string, dto: CredencialBiDto, key?: string) {
    this.identidad(tenantId, actorId);
    const prefijo = randomBytes(4).toString("hex");
    const token = `erpbi_${prefijo}_${randomBytes(32).toString("base64url")}`;
    const { data, error } = await this.supabase.getClient().rpc("operar_credenciales_bi_579", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_accion: "CREAR",
      p_payload: { ...dto, prefijo, token_digest: digestCredencialBi(token) },
      p_idempotency_key: this.clave(key),
    });
    if (error) tableroFailure(error);
    if (!data?.id) throw new ServiceUnavailableException("No se pudo confirmar la credencial. Reintente con la misma operación.");
    // Un reintento confirma la credencial ya creada, pero su token no puede mostrarse otra vez.
    return { success: true, data: { ...data, token: data.idempotent ? null : token } };
  }

  async revocarCredencial(tenantId: string, actorId: string, credencialId: string, motivo: string, key?: string) {
    this.identidad(tenantId, actorId);
    const { data, error } = await this.supabase.getClient().rpc("operar_credenciales_bi_579", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_accion: "REVOCAR",
      p_payload: { credencial_id: credencialId, motivo },
      p_idempotency_key: this.clave(key),
    });
    if (error) tableroFailure(error);
    if (!data?.id) throw new ServiceUnavailableException("No se pudo confirmar la revocación. Reintente con la misma operación.");
    return { success: true, data };
  }

  /** Lectura de Power BI con credencial propia; la base registra cada acceso. */
  async leerBi(tokenDigest: string, dataset: Dataset, dto: LecturaBiDto, origen: { ip?: string; agente?: string }) {
    const { corte, ...filtros } = dto;
    const { data, error } = await this.supabase.getClient().rpc("leer_dataset_bi_579", {
      p_token_digest: tokenDigest,
      p_dataset: dataset,
      p_corte: corte ?? "ultimo",
      p_filtros: filtros,
      p_origen: origen,
    });
    if (error) tableroFailure(error);
    switch (data?.resultado) {
      case "OK":
        if (!Array.isArray(data.filas)) break;
        return { corte: data.corte, dataset: data.dataset, total: data.total, filas: data.filas };
      case "CREDENCIAL_INVALIDA":
      case "CREDENCIAL_INACTIVA":
        throw new UnauthorizedException("Credencial de lectura inválida, vencida o revocada.");
      case "DATASET_NO_PERMITIDO":
        throw new ForbiddenException("La credencial no tiene acceso a este conjunto.");
      case "CORTE_NO_ENCONTRADO":
        throw new NotFoundException("No hay un corte registrado con ese identificador en la empresa.");
    }
    throw new ServiceUnavailableException("No se pudo leer el conjunto. Reintente.");
  }

  // Cada hora: registra el corte del día de las empresas con contratos activos
  // que aún no lo tienen; repetir no duplica.
  @Cron(CronExpression.EVERY_HOUR)
  async cortesAutomaticos() {
    if (process.env.TABLEROS_SUMINISTRO_CRON === "off") return;
    const { error } = await this.supabase.getClient().rpc("registrar_cortes_automaticos_579");
    if (error) this.logger.error(`No se pudo registrar los cortes automáticos del tablero: ${error.message}`);
  }

  private clave(key?: string) {
    const valor = key?.trim();
    if (!valor || valor.length < 8 || valor.length > 160)
      throw new BadRequestException("Se requiere Idempotency-Key de 8 a 160 caracteres.");
    return valor;
  }

  private identidad(tenantId: string, actorId: string) {
    if (!tenantId || !actorId) throw new ForbiddenException("No se pudo identificar la empresa y el usuario.");
  }
}

function celda(value: unknown) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return value as string | number;
}

/** Indicadores del resumen como filas de Excel, en el orden del tablero. */
export function filasResumen(r: Record<string, any>) {
  const filas: Array<{ indicador: string; moneda?: string; valor: number | string | null; detalle: string }> = [];
  if (r.cumplimiento)
    filas.push({ indicador: "Cumplimiento de OC (% aceptado)", valor: r.cumplimiento.porcentaje ?? null, detalle: TITULOS.contratos });
  if (r.entregas) {
    filas.push({ indicador: "Entregas a tiempo y completas (%)", valor: r.entregas.porcentaje ?? null, detalle: TITULOS.entregas });
    filas.push({ indicador: "Entregas exigibles", valor: r.entregas.exigibles, detalle: TITULOS.entregas });
    filas.push({ indicador: "Entregas atrasadas", valor: r.entregas.atrasadas, detalle: TITULOS.entregas });
    filas.push({ indicador: "Días de atraso promedio", valor: r.entregas.dias_atraso_promedio ?? null, detalle: TITULOS.entregas });
  }
  if (r.stock) filas.push({ indicador: "Productos sin cobertura (30 días)", valor: r.stock.sin_cobertura, detalle: TITULOS.stock });
  if (r.vencimientos) {
    filas.push({ indicador: "Lotes vencidos con stock", valor: r.vencimientos.vencidos, detalle: TITULOS.vencimientos });
    filas.push({ indicador: "Lotes por vencer (90 días)", valor: r.vencimientos.por_vencer, detalle: TITULOS.vencimientos });
  }
  for (const m of r.facturacion ?? [])
    filas.push({ indicador: "Por facturar (sin impuestos)", moneda: m.moneda, valor: m.por_facturar, detalle: TITULOS.contratos });
  for (const m of r.cobranza ?? []) {
    filas.push({ indicador: "Saldo por cobrar", moneda: m.moneda, valor: m.saldo, detalle: TITULOS.cobranza });
    filas.push({ indicador: "Saldo vencido", moneda: m.moneda, valor: m.vencido, detalle: TITULOS.cobranza });
  }
  for (const m of r.penalidades ?? []) {
    filas.push({ indicador: "Penalidades pendientes de decisión", moneda: m.moneda, valor: m.pendiente, detalle: TITULOS.penalidades });
    filas.push({ indicador: "Penalidades aprobadas", moneda: m.moneda, valor: m.aprobado, detalle: TITULOS.penalidades });
  }
  return filas;
}

export function tableroFailure(error: { code?: string; message?: string }): never {
  const mensaje = errores[(error.message || "").split(":")[0].trim()];
  if (error.code === "42501") throw new ForbiddenException(mensaje ?? "No tiene permiso para esta operación.");
  if (error.code === "P0002") throw new NotFoundException(mensaje ?? "No se encontró el registro en esta empresa.");
  if (error.code === "23505") throw new ConflictException(mensaje ?? "La operación entra en conflicto con otra.");
  if (["23514", "22023", "22P02", "22007", "22008"].includes(error.code || ""))
    throw new BadRequestException(mensaje ?? "Revise los datos del tablero.");
  throw new ServiceUnavailableException("El servicio de tableros no está disponible. Reintente.");
}
