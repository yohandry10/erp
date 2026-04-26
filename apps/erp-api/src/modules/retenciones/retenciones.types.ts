/**
 * Archivo índice para todas las interfaces del módulo de retenciones
 * Exporta todas las interfaces de los archivos separados
 */

// DTOs de entrada
export type {
  CreateRetencionDto,
  CalcularRetencionDto,
  UpdateRetencionDto,
  FiltrosRetencionDto,
  PaginacionDto
} from './dto/retenciones-input.dto';

// DTOs de respuesta
export type {
  RetencionResponse,
  RetencionCalculada,
  ListaRetencionesResponse,
  DetalleRetencionResponse
} from './dto/retenciones-response.dto';

// DTOs de reportes
export type {
  ResumenRetencionesResponse,
  ReporteRetencionesDto,
  EstadisticasRetencionesResponse,
  ConfiguracionRetencionesResponse
} from './dto/retenciones-reports.dto';