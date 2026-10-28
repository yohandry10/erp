export type Dataset = "contratos" | "entregas" | "stock" | "vencimientos" | "cobranza" | "penalidades";
export const DATASETS: Dataset[] = ["contratos", "entregas", "stock", "vencimientos", "cobranza", "penalidades"];
export const TITULOS: Record<Dataset, string> = {
  contratos: "Contratos y OC",
  entregas: "Entregas",
  stock: "Cobertura de stock",
  vencimientos: "Vencimientos",
  cobranza: "Cobranza",
  penalidades: "Penalidades",
};

export type Fila = Record<string, any>;
export type Corte = {
  id: string | null;
  fecha_corte: string;
  origen: "EN_VIVO" | "EXPORTACION" | "AUTOMATICO";
  generado_en: string;
  generado_por_nombre?: string | null;
  hash: string;
  filas: Partial<Record<Dataset, number>>;
};
type PorMoneda<T> = Array<{ moneda: string } & T>;
export type Resumen = {
  cumplimiento?: { ordenes: number; cantidad_oc: number; aceptado: number; porcentaje?: number };
  entregas?: {
    exigibles: number;
    a_tiempo_completas: number;
    tardias: number;
    atrasadas: number;
    en_plazo: number;
    porcentaje?: number;
    dias_atraso_promedio?: number;
  };
  stock?: { productos: number; sin_cobertura: number };
  vencimientos?: { vencidos: number; por_vencer: number; stock_vencido: number };
  facturacion?: PorMoneda<{ facturado: number; por_facturar: number }>;
  cobranza?: PorMoneda<{ documentos: number; saldo: number; vencido: number }>;
  penalidades?: PorMoneda<{ pendiente: number; aprobado: number }>;
};
export type Tablero = {
  corte: Corte;
  datasets: Partial<Record<Dataset, Fila[]>>;
  resumen: Resumen;
  ocultos: Dataset[];
  cortes: Corte[];
};
export type Filtros = { contrato_id?: string; cliente_id?: string; desde?: string; hasta?: string };

export const etiquetas: Record<string, string> = {
  A_TIEMPO_COMPLETA: "A tiempo y completa",
  TARDIA_COMPLETA: "Completa con atraso",
  ATRASADA: "Atrasada",
  EN_PLAZO: "En plazo",
  SIN_COBERTURA: "Sin cobertura",
  CUBIERTO: "Cubierto",
  VENCIDO: "Vencido",
  VIDA_UTIL_INSUFICIENTE: "Vida útil insuficiente",
  POR_VENCER: "Por vencer",
  PENDIENTE: "Pendiente",
  PAGADO: "Pagado",
  ESTIMADO: "Estimado",
  EN_REVISION: "En revisión",
  APROBADO: "Aprobado",
  OBSERVADO: "Observado",
  EN_CONTROVERSIA: "En controversia",
  EXPORTACION: "Exportación",
  AUTOMATICO: "Automático",
  EN_VIVO: "En vivo",
};

export const porcentaje = (value?: number | null) =>
  value === null || value === undefined
    ? "—"
    : `${Number(value).toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;

export const query = (filtros: Filtros & { corte_id?: string }) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) params.set(k, v);
  const texto = params.toString();
  return texto ? `?${texto}` : "";
};
