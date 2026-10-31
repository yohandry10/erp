export type EstadoLote =
  | "VENCIDO"
  | "VIDA_UTIL_INSUFICIENTE"
  | "POR_VENCER"
  | "VIGENTE"
  | "SIN_VENCIMIENTO";

export type ProductoLote = {
  id: string;
  codigo: string;
  nombre: string;
  unidad_medida: string | null;
  stock_actual: number;
  controla_lote: boolean;
};
export type Politica = {
  controla_lote: boolean;
  requiere_vencimiento: boolean;
  dias_minimos_vida_util: number;
  version: number;
  updated_at?: string;
};
export type Saldo = {
  lote_id: string;
  lote: string;
  fecha_vencimiento: string | null;
  ubicacion_id: string | null;
  ubicacion_codigo: string | null;
  ubicacion_nombre: string | null;
  stock_actual: number;
  stock_reservado: number;
  disponible: number;
  estado: EstadoLote;
};
export type Reserva = {
  referencia_id: string;
  lote_id: string;
  lote: string;
  fecha_vencimiento: string | null;
  ubicacion_id: string | null;
  cantidad: number;
  pedido_numero: string | null;
  cliente_nombre: string | null;
};
export type AlmacenLotes = {
  almacen_id: string;
  almacen_codigo: string | null;
  almacen_nombre: string;
  stock_actual: number;
  stock_reservado: number;
  stock_lotes: number;
  reservado_lotes: number;
  stock_sin_lote: number;
  saldos: Saldo[];
  reservas: Reserva[];
};
export type OperacionLote = {
  id: string;
  accion: "CONFIGURAR_POLITICA" | "REGULARIZAR" | "REASIGNAR_RESERVA";
  almacen_id: string | null;
  referencia_id: string | null;
  motivo: string | null;
  actor_nombre: string | null;
  created_at: string;
};
export type DetalleLotes = {
  hoy: string;
  producto: {
    id: string;
    codigo: string;
    nombre: string;
    unidad_medida: string | null;
    stock_actual: number;
    stock_reservado: number;
  };
  politica: Politica;
  almacenes: AlmacenLotes[];
  operaciones: OperacionLote[];
};
export type MovimientoLote = {
  id: string;
  created_at: string;
  tipo: "ENTRADA" | "SALIDA" | "RESERVA" | "LIBERACION" | "REGULARIZACION";
  cantidad: number;
  consume_reserva: boolean;
  almacen_nombre: string;
  lote: string;
  fecha_vencimiento: string | null;
  ubicacion_codigo: string | null;
  referencia_tipo: string | null;
  notas: string | null;
  saldo_lote: number;
};
export type LotePorVencer = {
  lote_id: string;
  lote: string;
  fecha_vencimiento: string;
  producto_id: string;
  producto_codigo: string;
  producto_nombre: string;
  stock_actual: number;
  stock_reservado: number;
  estado: EstadoLote;
};
/** Una reserva vigente de un documento, con sus lotes. */
export type ReservaDocumento = {
  referencia_id: string;
  pedido_numero: string | null;
  cliente_nombre: string | null;
  total: number;
  lineas: Reserva[];
};

export const cantidad = (value: number | string) =>
  Number(value).toLocaleString("es-PE", { maximumFractionDigits: 4 });
export const fecha = (value: string | null | undefined) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "Sin fecha";
export const fechaHora = (value: string) =>
  new Date(value).toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });

export const estadoLote: Record<EstadoLote, { label: string; className: string }> = {
  VENCIDO: { label: "Vencido", className: "text-destructive" },
  VIDA_UTIL_INSUFICIENTE: {
    label: "Vida útil insuficiente",
    className:
      "text-amber-400 group-data-[erp-theme=light]/dashboard:text-amber-700",
  },
  POR_VENCER: {
    label: "Por vencer",
    className:
      "text-amber-300 group-data-[erp-theme=light]/dashboard:text-amber-700",
  },
  VIGENTE: { label: "Vigente", className: "text-muted-foreground" },
  SIN_VENCIMIENTO: { label: "Sin vencimiento", className: "text-muted-foreground" },
};

export const tipoMovimiento: Record<MovimientoLote["tipo"], string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  RESERVA: "Reserva",
  LIBERACION: "Liberación",
  REGULARIZACION: "Regularización",
};

export const accionesLote: Record<OperacionLote["accion"], string> = {
  CONFIGURAR_POLITICA: "Política de lote actualizada",
  REGULARIZAR: "Stock sin lote regularizado",
  REASIGNAR_RESERVA: "Reserva reasignada entre lotes",
};

export function agruparReservas(reservas: Reserva[]): ReservaDocumento[] {
  const grupos = new Map<string, ReservaDocumento>();
  for (const r of reservas) {
    const grupo = grupos.get(r.referencia_id) ?? {
      referencia_id: r.referencia_id,
      pedido_numero: r.pedido_numero,
      cliente_nombre: r.cliente_nombre,
      total: 0,
      lineas: [],
    };
    grupo.total = Number((grupo.total + Number(r.cantidad)).toFixed(4));
    grupo.lineas.push(r);
    grupos.set(r.referencia_id, grupo);
  }
  return [...grupos.values()];
}

export const ubicacionTexto = (s: { ubicacion_codigo: string | null; ubicacion_nombre?: string | null }) =>
  s.ubicacion_codigo
    ? `${s.ubicacion_codigo}${s.ubicacion_nombre ? ` · ${s.ubicacion_nombre}` : ""}`
    : "Sin ubicación";

export const control =
  "min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
