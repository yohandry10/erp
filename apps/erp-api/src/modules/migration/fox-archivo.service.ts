import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { FoxArchivoCierreDto, FoxArchivoConsultaDto, FoxArchivoDescarteDto, FoxArchivoFilasDto, FoxArchivoLoteDto } from './dto/import.dto';

const MENSAJES: Record<string, string> = {
  MIGRATION_ARCHIVE_INPUT_INVALID: 'Revise el lote: tabla, claves (1 a 250 caracteres) y filas (1 a 2000 objetos planos, con valores simples).',
  MIGRATION_ARCHIVE_DUPLICATE_KEY: 'La tanda repite una clave de la misma tabla.',
  MIGRATION_ARCHIVE_ROW_CHANGED: 'Una fila ya archivada llegó con otro contenido: el extracto cambió durante la carga.',
  MIGRATION_ARCHIVE_COUNT_MISMATCH: 'Lo cargado no coincide con lo declarado por tabla; el lote sigue abierto.',
  MIGRATION_ARCHIVE_STATE: 'El lote ya no admite esa operación.',
  MIGRATION_ARCHIVE_NOT_FOUND: 'Lote de archivo no encontrado.',
  MIGRATION_ARCHIVE_FILTER_INVALID: 'Filtro de consulta inválido.',
  SUPPLY_REASON_REQUIRED: 'Indique el motivo (5 a 1000 caracteres).',
  SUPPLY_IDEMPOTENCY_CONFLICT: 'Esa Idempotency-Key ya se usó con otra operación.',
};

/**
 * Archivo íntegro del extracto FOX: cada tabla tal cual, por lotes inmutables,
 * consultable por texto. Sin efectos operativos ni contables.
 */
@Injectable()
export class FoxArchivoService {
  constructor(private readonly supabase: SupabaseService) {}

  crearLote(tenantId: string, actorId: string, dto: FoxArchivoLoteDto, key?: string) {
    return this.operar(tenantId, actorId, 'CREAR_LOTE', { descripcion: dto.descripcion, fecha_corte: dto.fechaCorte ?? null }, key);
  }

  cerrarLote(tenantId: string, actorId: string, loteId: string, dto: FoxArchivoCierreDto, key?: string) {
    return this.operar(tenantId, actorId, 'CERRAR_LOTE', { lote_id: loteId, tablas: dto.tablas }, key);
  }

  descartarLote(tenantId: string, actorId: string, loteId: string, dto: FoxArchivoDescarteDto, key?: string) {
    return this.operar(tenantId, actorId, 'DESCARTAR_LOTE', { lote_id: loteId, motivo: dto.motivo }, key);
  }

  async archivarFilas(tenantId: string, actorId: string, loteId: string, dto: FoxArchivoFilasDto) {
    // Una tanda de 2000 filas con su índice de texto puede superar el límite corto.
    const { data, error } = await this.supabase.getLongRunningClient().rpc('archivar_filas_fox_582', {
      p_tenant_id: tenantId, p_actor_id: actorId, p_lote_id: loteId, p_tabla: dto.tabla, p_filas: dto.filas,
    });
    if (error) fallo(error);
    return { success: true, data };
  }

  async consultar(tenantId: string, actorId: string, q: FoxArchivoConsultaDto) {
    const { data, error } = await this.supabase.getLongRunningClient().rpc('consultar_archivo_fox_582', {
      p_tenant_id: tenantId, p_actor_id: actorId,
      p_filtros: { lote_id: q.loteId ?? null, tabla: q.tabla ?? null, texto: q.texto ?? null, pagina: q.pagina ?? 1, limite: q.limite ?? 50 },
    });
    if (error) fallo(error);
    if (!Array.isArray(data?.filas)) throw new ServiceUnavailableException('La consulta del archivo no devolvió resultados. Reintente.');
    return { success: true, data };
  }

  private async operar(tenantId: string, actorId: string, accion: string, payload: Record<string, unknown>, key?: string) {
    const idempotencyKey = key?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 160)
      throw new BadRequestException('Se requiere Idempotency-Key de 8 a 160 caracteres.');
    const { data, error } = await this.supabase.getClient().rpc('operar_archivo_fox_582', {
      p_tenant_id: tenantId, p_actor_id: actorId, p_accion: accion, p_payload: payload, p_idempotency_key: idempotencyKey,
    });
    if (error) fallo(error);
    return { success: true, data };
  }
}

function fallo(error: { code?: string; message?: string }): never {
  const raw = error.message ?? '';
  const [codigo, ...resto] = raw.split(':');
  const mensaje = MENSAJES[codigo.trim()];
  const detalle = codigo.trim() === 'MIGRATION_ARCHIVE_COUNT_MISMATCH' ? ` (${resto.join(':').trim()})` : '';
  if (error.code === '42501') throw new ForbiddenException('No tiene permiso sobre el archivo de FOX.');
  if (error.code === 'P0002') throw new NotFoundException(mensaje ?? 'Lote de archivo no encontrado.');
  if (error.code === '23505' || error.code === '23514') throw new ConflictException(`${mensaje ?? 'Operación rechazada por el estado del lote.'}${detalle}`);
  if (error.code === '22023') throw new BadRequestException(mensaje ?? 'Revise los datos del lote.');
  throw new ServiceUnavailableException('El archivo de migración no está disponible. Reintente.');
}
