export class SireExportDto {
  id: string;
  periodo: string;  tipo: string;
  filename: string;
  download_url: string;
  total_registros: number;
  estado: string;
  created_at: Date;
}

export class SireStatsDto {
  periodo: string;
  total_facturas: number;
  total_boletas: number;
  total_notas_credito: number;
  total_ventas: number;
  total_igv: number;
} 
