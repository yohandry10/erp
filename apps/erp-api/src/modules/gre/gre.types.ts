export interface CreateGuiaRemisionDto {
  destinatario: string;
  direccionDestino: string;
  fechaTraslado: string;
  modalidad: 'TRANSPORTE_PUBLICO' | 'TRANSPORTE_PRIVADO';
  motivo: string;
  pesoTotal: number;
  observaciones?: string;
  transportista?: string;
  placaVehiculo?: string;
  licenciaConducir?: string;
}

export interface GuiaRemisionResponseDto {
  id: string;
  numero: string;
  estado: string;
  destinatario: string;
  direccionDestino: string;
  fechaTraslado: string;
  fechaCreacion: string;
  modalidad: string;
  motivo: string;
  pesoTotal: number;
  observaciones?: string;
  transportista?: string;
  placaVehiculo?: string;
  licenciaConducir?: string;
} 