/**
 * Archivo índice para todas las interfaces del módulo de retenciones
 * Exporta todas las interfaces de los archivos separados
 */

// DTOs de entrada
export {
  CreateRetencionDto,
  CalcularRetencionDto,
  UpdateRetencionDto,
  FiltrosRetencionDto,
  PaginacionDto
} from './dto/retenciones-input.dto';

// DTOs de respuesta
export {
  RetencionResponse,
  RetencionCalculada,
  ListaRetencionesResponse,
  DetalleRetencionResponse
} from './dto/retenciones-response.dto';

// DTOs de reportes
export {
  ResumenRetencionesResponse,
  ReporteRetencionesDto,
  EstadisticasRetencionesResponse,
  ConfiguracionRetencionesResponse
} from './dto/retenciones-reports.dto';