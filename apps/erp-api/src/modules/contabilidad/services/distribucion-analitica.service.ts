import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import {
  AsignarDistribucionDto,
  DistribucionAnaliticaResponseDto,
  ImputacionAnaliticaDto
} from '@erp-suite/dtos';

@Injectable()
export class DistribucionAnaliticaService {
  private readonly logger = new Logger(DistribucionAnaliticaService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  private round2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }

  /**
   * Reparte un importe entre destinos según sus porcentajes.
   *
   * Función pura y estática. Todo el cálculo va en céntimos y **el último
   * destino absorbe el residuo**: repartir 100 entre tres al 33,33% da 99,99 y
   * dejaría un céntimo sin imputar en cada línea, para siempre y en todos los
   * reportes analíticos.
   */
  static repartirImporte(
    importe: number,
    imputaciones: ImputacionAnaliticaDto[]
  ): Array<{ centro_costo_id: string; porcentaje: number; monto: number }> {
    const totalCentimos = Math.round(Math.abs(importe) * 100);
    const resultado: Array<{ centro_costo_id: string; porcentaje: number; monto: number }> = [];
    let asignado = 0;

    imputaciones.forEach((imputacion, indice) => {
      const esUltima = indice === imputaciones.length - 1;
      const centimos = esUltima
        ? totalCentimos - asignado
        : Math.round((totalCentimos * imputacion.porcentaje) / 100);
      asignado += centimos;

      resultado.push({
        centro_costo_id: imputacion.centro_costo_id,
        porcentaje: imputacion.porcentaje,
        monto: centimos / 100
      });
    });

    return resultado;
  }

  /**
   * Valida que los porcentajes de un eje sumen 100.
   *
   * Se tolera una milésima de desviación porque un reparto en tercios se
   * escribe 33,33 / 33,33 / 33,34 y exigir el 100 exacto obligaría al contador
   * a cuadrar decimales a mano.
   */
  static validarPorcentajes(imputaciones: ImputacionAnaliticaDto[]): void {
    if (imputaciones.length === 0) {
      throw new BadRequestException('El reparto necesita al menos un destino.');
    }

    const centros = new Set(imputaciones.map(i => i.centro_costo_id));
    if (centros.size !== imputaciones.length) {
      throw new BadRequestException(
        'Un mismo destino no puede aparecer dos veces en el reparto de un eje.'
      );
    }

    const total = imputaciones.reduce((sum, i) => sum + i.porcentaje, 0);
    if (Math.abs(total - 100) > 0.001) {
      throw new BadRequestException(
        `Los porcentajes del eje deben sumar 100. Suman ${total.toFixed(4)}.`
      );
    }
  }

  /**
   * Reemplaza el reparto de una línea dentro de un eje.
   *
   * Se reemplaza en bloque, no se edita destino a destino: una escritura
   * parcial dejaría el eje sumando algo distinto de 100 entre dos operaciones.
   */
  async asignar(
    tenantId: string,
    userId: string,
    dto: AsignarDistribucionDto
  ): Promise<DistribucionAnaliticaResponseDto[]> {
    DistribucionAnaliticaService.validarPorcentajes(dto.imputaciones);

    const eje = dto.eje.trim().toUpperCase();

    const { data: detalle, error: errorDetalle } = await this.supabaseService
      .getClient()
      .from('detalle_asientos')
      .select('id, debe, haber')
      .eq('tenant_id', tenantId)
      .eq('id', dto.detalle_asiento_id)
      .maybeSingle();

    if (errorDetalle || !detalle) {
      throw new NotFoundException(
        `La línea de asiento ${dto.detalle_asiento_id} no existe o no pertenece a su organización.`
      );
    }

    await this.exigirCentrosDelEje(
      tenantId,
      eje,
      dto.imputaciones.map(i => i.centro_costo_id)
    );

    const importe = this.round2(Number(detalle.debe || 0) - Number(detalle.haber || 0));
    const reparto = DistribucionAnaliticaService.repartirImporte(importe, dto.imputaciones);

    const { data, error } = await this.supabaseService.getClient().rpc(
      'asignar_distribucion_analitica_tx',
      {
        p_tenant_id: tenantId,
        p_detalle_asiento_id: dto.detalle_asiento_id,
        p_eje: eje,
        p_imputaciones: reparto.map(fila => ({
          centro_costo_id: fila.centro_costo_id,
          porcentaje: fila.porcentaje,
          monto: fila.monto
        })),
        p_created_by: userId
      }
    );

    if (error) {
      throw new Error(`Error guardando la distribución analítica: ${error.message}`);
    }

    this.logger.log(
      `📊 Distribución ${eje} asignada a la línea ${dto.detalle_asiento_id}: ${reparto.length} destino(s)`
    );

    return (data || []) as DistribucionAnaliticaResponseDto[];
  }

  async obtenerPorLinea(
    tenantId: string,
    detalleAsientoId: string
  ): Promise<DistribucionAnaliticaResponseDto[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('distribucion_analitica')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('detalle_asiento_id', detalleAsientoId)
      .order('eje', { ascending: true });

    if (error) {
      throw new Error(`Error obteniendo la distribución analítica: ${error.message}`);
    }

    return (data || []) as DistribucionAnaliticaResponseDto[];
  }

  async eliminar(
    tenantId: string,
    detalleAsientoId: string,
    eje: string,
    userId: string,
    idempotencyKey?: string,
  ): Promise<void> {
    if (!userId) {
      throw new BadRequestException('Se requiere un actor autenticado.');
    }

    const ejeNormalizado = (eje || 'CENTRO_COSTO').trim().toUpperCase();
    const key = idempotencyKey?.trim() || createHash('sha256')
      .update(`${tenantId}:${userId}:${detalleAsientoId}:${ejeNormalizado}`)
      .digest('hex');
    const { error } = await this.supabaseService.getClient().rpc(
      'eliminar_distribucion_analitica_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: userId,
        p_detalle_id: detalleAsientoId,
        p_eje: ejeNormalizado,
        p_idempotency_key: key,
      },
    );

    if (error) {
      throw new Error(`Error eliminando la distribución analítica: ${error.message}`);
    }
  }

  /**
   * Todos los destinos de un reparto deben pertenecer al eje declarado.
   * Mezclarlos haría que un eje sumara más de 100 sin que ninguna validación
   * de porcentajes lo detectara.
   */
  private async exigirCentrosDelEje(
    tenantId: string,
    eje: string,
    centroIds: string[]
  ): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('centros_costo')
      .select('id, nombre, eje, activo')
      .eq('tenant_id', tenantId)
      .in('id', centroIds);

    if (error) {
      throw new Error(`Error validando los centros de costo: ${error.message}`);
    }

    const encontrados = data || [];
    if (encontrados.length !== centroIds.length) {
      throw new BadRequestException(
        'Alguno de los destinos no existe o no pertenece a su organización.'
      );
    }

    const deOtroEje = encontrados.filter(
      (centro: any) => String(centro.eje ?? 'CENTRO_COSTO').toUpperCase() !== eje
    );

    if (deOtroEje.length > 0) {
      throw new BadRequestException(
        `Estos destinos no pertenecen al eje ${eje}: ` +
          `${deOtroEje.map((c: any) => c.nombre).join(', ')}.`
      );
    }

    const inactivos = encontrados.filter((centro: any) => centro.activo === false);
    if (inactivos.length > 0) {
      throw new BadRequestException(
        `No se puede imputar a destinos inactivos: ` +
          `${inactivos.map((c: any) => c.nombre).join(', ')}.`
      );
    }
  }
}
