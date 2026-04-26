export interface DocumentoDetalleFiscal {
  id?: string;
  documento_id?: string;
  producto_id?: string | null;
  codigo_producto?: string | null;
  descripcion: string;
  unidad_medida?: string;
  cantidad: number;
  precio_unitario: number;
  valor_venta: number;
  impuesto_igv: number;
  total_item: number;
}

export interface DocumentoFiscalCliente {
  id: string;
  documento_tipo: string;
  numero_documento: string;
  razon_social: string;
  direccion?: string | null;
  email?: string | null;
}

export interface DocumentoFiscalEmisor {
  ruc: string;
  razon_social: string;
  direccion: string;
}

export interface DocumentoFiscal {
  id: string;
  tenant_id: string;
  pedido_id?: string | null;
  tipo_documento: string;
  serie: string;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  subtotal: number;
  impuesto_igv: number;
  total: number;
  moneda: string;
  cliente_id: string;
  estado: string;
  pais_id?: number | null;
  detalles: DocumentoDetalleFiscal[];
  cliente: DocumentoFiscalCliente;
  emisor: DocumentoFiscalEmisor;
}
