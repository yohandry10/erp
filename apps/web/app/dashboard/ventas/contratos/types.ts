export type Opcion = { id: string; nombre: string; codigo?: string };
export type Linea = {
  id: string;
  producto_id: string;
  codigo_producto: string;
  descripcion: string;
  unidad_medida: string;
  cantidad: number;
  cantidad_en_oc: number;
  precio_unitario: number;
};
export type OrdenLinea = {
  id: string;
  contrato_linea_id: string;
  cantidad: number;
  cantidad_programada: number;
  precio_unitario: number;
};
export type Orden = {
  id: string;
  numero: string;
  fecha_emision: string;
  estado: "ACTIVA" | "ANULADA";
  version: number;
  lineas: OrdenLinea[];
};
export type Entrega = {
  id: string;
  orden_linea_id: string;
  cantidad: number;
  fecha_original: string;
  fecha_programada: string;
  destino: string;
  version: number;
  estado: "PROGRAMADA" | "ANULADA";
};
export type Contrato = {
  id: string;
  numero: string;
  asunto: string;
  cliente_id: string;
  cliente_nombre: string;
  moneda: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  responsable_id: string;
  responsable_nombre?: string;
  observaciones?: string;
  estado: "BORRADOR" | "ACTIVO" | "ANULADO";
  version: number;
  lineas: Linea[];
  ordenes: Orden[];
  entregas: Entrega[];
  historial: Array<{
    id: string;
    accion: string;
    motivo?: string;
    referencia?: string;
    actor_id: string;
    actor_nombre?: string;
    created_at: string;
    anterior?: Record<string, unknown>;
    actual: Record<string, unknown>;
  }>;
};
export const cantidad = (value: number | string) =>
  Number(value).toLocaleString("es-PE", { maximumFractionDigits: 4 });
export const saldo = (total: number, usado: number) =>
  Number((Number(total) - Number(usado)).toFixed(4));
export const fecha = (value: string) =>
  value.slice(0, 10).split("-").reverse().join("/");
export const dinero = (value: number, moneda: string) =>
  `${moneda} ${Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const acciones: Record<string, string> = {
  CREAR_CONTRATO: "Contrato registrado",
  EDITAR_BORRADOR: "Borrador editado",
  ACTIVAR: "Contrato activado",
  ANULAR_BORRADOR: "Borrador anulado",
  VINCULAR_PEDIDO: "Pedido vinculado",
  REGISTRAR_RECEPCION: "Recepción del cliente registrada",
  ANULAR_RECEPCION: "Recepción anulada",
  CONFIGURAR_FACTURACION: "Base de facturación actualizada",
  DESVINCULAR_PEDIDO: "Pedido desvinculado",
  ADJUNTAR_DOCUMENTO: "Documento adjuntado",
  RETIRAR_ADJUNTO: "Adjunto retirado",
  CREAR_OC: "OC del cliente registrada",
  ADENDAR: "Adenda registrada",
  MODIFICAR_OC: "OC del cliente modificada",
  ANULAR_OC: "OC del cliente anulada",
  PROGRAMAR: "Entrega programada",
  REPROGRAMAR: "Entrega reprogramada",
  ANULAR_ENTREGA: "Programación anulada",
  GUARDAR_REGLA: "Regla de penalidad guardada",
  ANULAR_REGLA: "Regla de penalidad anulada",
  REGISTRAR_EXCEPCION: "Días excluidos registrados",
  CALCULAR: "Penalidades calculadas",
  REVISAR_CALCULO: "Decisión sobre la penalidad registrada",
  PENALIDAD_GUARDAR_REGLA: "Regla de penalidad guardada",
  PENALIDAD_ANULAR_REGLA: "Regla de penalidad anulada",
  PENALIDAD_REGISTRAR_EXCEPCION: "Días excluidos de una entrega",
  PENALIDAD_CALCULAR: "Penalidades calculadas",
  PENALIDAD_REVISAR_CALCULO: "Decisión sobre una penalidad",
};
