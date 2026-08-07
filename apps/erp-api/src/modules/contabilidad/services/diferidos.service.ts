import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PeriodosService } from './periodos.service';
import {
  CreateDiferidoDto,
  DiferidoResponseDto,
  CuotaDiferidoDto,
  ResultadoDevengoDto,
  TipoDiferido,
  EstadoDiferido,
  EstadoAsiento
} from '@erp-suite/dtos';
import { buildDeterministicUuid } from '../../../common/util/deterministic-uuid.util';

@Injectable()
export class DiferidosService {
  private readonly logger = new Logger(DiferidosService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly periodosService: PeriodosService
  ) {}

  private round2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }

  /**
   * Cronograma de devengo lineal.
   *
   * Misma regla que la depreciación: **la última cuota absorbe el residuo**. Un
   * seguro de 1.000 en 3 meses da cuotas de 333,33 y sobraría un céntimo que
   * quedaría diferido para siempre sin llegar nunca a resultados.
   */
  static calcularCronograma(params: {
    montoTotal: number;
    periodos: number;
    fechaInicio: Date;
  }): CuotaDiferidoDto[] {
    const { montoTotal, periodos, fechaInicio } = params;

    const total = Math.round(montoTotal * 100);
    if (total <= 0 || periodos <= 0) {
      return [];
    }

    const cuotaCentimos = Math.round(total / periodos);
    const cuotas: CuotaDiferidoDto[] = [];
    let acumulado = 0;

    for (let indice = 0; indice < periodos; indice += 1) {
      const esUltima = indice === periodos - 1;
      const cuota = esUltima ? total - acumulado : cuotaCentimos;
      acumulado += cuota;

      const fecha = new Date(
        Date.UTC(fechaInicio.getUTCFullYear(), fechaInicio.getUTCMonth() + indice, 1)
      );

      cuotas.push({
        periodo: `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`,
        monto: cuota / 100,
        acumulado: acumulado / 100,
        pendiente: (total - acumulado) / 100
      });
    }

    return cuotas;
  }

  /** Cuota que toca a un diferido en un período, o 0 si está fuera de rango. */
  static cuotaDelPeriodo(
    diferido: {
      monto_total: number;
      monto_devengado: number;
      periodos: number;
      fecha_inicio: string;
    },
    anio: number,
    mes: number
  ): number {
    const inicio = new Date(diferido.fecha_inicio);
    const transcurridos =
      (anio - inicio.getUTCFullYear()) * 12 + (mes - (inicio.getUTCMonth() + 1));

    if (transcurridos < 0 || transcurridos >= diferido.periodos) {
      return 0;
    }

    const total = Math.round(diferido.monto_total * 100);
    const devengado = Math.round(diferido.monto_devengado * 100);
    const pendiente = total - devengado;

    if (pendiente <= 0) {
      return 0;
    }

    const cuota = Math.round(total / diferido.periodos);
    return Math.min(cuota, pendiente) / 100;
  }

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  async listar(tenantId: string, estado?: string): Promise<DiferidoResponseDto[]> {
    let query = this.supabaseService
      .getClient()
      .from('diferidos')
      .select('*')
      .eq('tenant_id', tenantId);

    if (estado) {
      query = query.eq('estado', estado.toUpperCase());
    }

    const { data, error } = await query.order('fecha_inicio', { ascending: false });

    if (error) {
      throw new Error(`Error listando diferidos: ${error.message}`);
    }

    return (data || []).map((fila: any) => this.aRespuesta(fila));
  }

  async obtener(tenantId: string, diferidoId: string): Promise<DiferidoResponseDto> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('diferidos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', diferidoId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Diferido ${diferidoId} no encontrado`);
    }

    return {
      ...this.aRespuesta(data),
      cronograma: DiferidosService.calcularCronograma({
        montoTotal: Number(data.monto_total),
        periodos: Number(data.periodos),
        fechaInicio: new Date(data.fecha_inicio)
      })
    };
  }

  async crear(
    tenantId: string,
    userId: string,
    dto: CreateDiferidoDto
  ): Promise<DiferidoResponseDto> {
    if (dto.cuenta_diferido_id === dto.cuenta_resultado_id) {
      throw new BadRequestException(
        'La cuenta de balance y la de resultados no pueden ser la misma: el devengo no movería nada.'
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('diferidos')
      .insert({
        tenant_id: tenantId,
        codigo: dto.codigo ?? null,
        nombre: dto.nombre,
        descripcion: dto.descripcion ?? null,
        tipo: dto.tipo,
        cuenta_diferido_id: dto.cuenta_diferido_id,
        cuenta_resultado_id: dto.cuenta_resultado_id,
        monto_total: this.round2(dto.monto_total),
        monto_devengado: 0,
        periodos: dto.periodos,
        fecha_inicio: dto.fecha_inicio,
        centro_costo_id: dto.centro_costo_id ?? null,
        estado: EstadoDiferido.VIGENTE,
        created_by: userId
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Error creando el diferido: ${error?.message}`);
    }

    this.logger.log(`📆 Diferido "${dto.nombre}" creado para ${tenantId}`);
    return this.aRespuesta(data);
  }

  async cancelar(tenantId: string, diferidoId: string): Promise<DiferidoResponseDto> {
    const diferido = await this.obtener(tenantId, diferidoId);

    if (diferido.estado !== EstadoDiferido.VIGENTE) {
      throw new BadRequestException(
        `El diferido "${diferido.nombre}" está ${diferido.estado} y ya no admite cambios.`
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('diferidos')
      .update({ estado: EstadoDiferido.CANCELADO, updated_at: new Date().toISOString() })
      .eq('id', diferidoId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Error cancelando el diferido: ${error?.message}`);
    }

    return this.aRespuesta(data);
  }

  // --------------------------------------------------------------------------
  // Devengo
  // --------------------------------------------------------------------------

  /**
   * Devenga la cuota del período de todos los diferidos vigentes y genera un
   * único asiento con una línea por cada uno.
   *
   * Un solo asiento en lugar de uno por diferido: el contador ve el devengo del
   * mes como una sola operación, que es como lo piensa.
   */
  async devengarPeriodo(
    tenantId: string,
    userId: string,
    anio: number,
    mes: number
  ): Promise<ResultadoDevengoDto> {
    if (mes < 1 || mes > 12) {
      throw new BadRequestException('El mes debe estar entre 1 y 12.');
    }

    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    const fechaPeriodo = new Date(Date.UTC(anio, mes, 0));

    await this.periodosService.validarPeriodoAbierto(tenantId, fechaPeriodo);

    const { data: diferidos, error } = await this.supabaseService
      .getClient()
      .from('diferidos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('estado', EstadoDiferido.VIGENTE);

    if (error) {
      throw new Error(`Error obteniendo los diferidos vigentes: ${error.message}`);
    }

    const omitidos: Array<{ diferido_id: string; nombre?: string; motivo: string }> = [];
    const aDevengar: Array<{ diferido: any; cuota: number; acumulado: number }> = [];

    for (const diferido of diferidos || []) {
      const cuota = DiferidosService.cuotaDelPeriodo(
        {
          monto_total: Number(diferido.monto_total),
          monto_devengado: Number(diferido.monto_devengado ?? 0),
          periodos: Number(diferido.periodos),
          fecha_inicio: diferido.fecha_inicio
        },
        anio,
        mes
      );

      if (cuota <= 0) {
        omitidos.push({
          diferido_id: diferido.id,
          nombre: diferido.nombre,
          motivo: 'El período está fuera de su calendario o ya está devengado por completo.'
        });
        continue;
      }

      aDevengar.push({
        diferido,
        cuota,
        acumulado: this.round2(Number(diferido.monto_devengado ?? 0) + cuota)
      });
    }

    if (aDevengar.length === 0) {
      return {
        periodo,
        diferidos_devengados: 0,
        total_devengado: 0,
        omitidos: omitidos.length > 0 ? omitidos : undefined
      };
    }

    const total = this.round2(aDevengar.reduce((sum, item) => sum + item.cuota, 0));
    const sourceEventId = buildDeterministicUuid(`devengo-diferidos:${tenantId}:${periodo}`);

    const { data: existente } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('source_event_id', sourceEventId)
      .maybeSingle();

    if (existente?.id) {
      throw new BadRequestException(
        `El devengo de diferidos del período ${periodo} ya fue registrado (asiento ${existente.id}).`
      );
    }

    // Un diferido de gasto lleva el importe de la cuenta de balance al gasto;
    // uno de ingreso, del pasivo diferido al ingreso. En ambos casos la cuenta
    // de balance se descarga y la de resultados se carga o abona según el tipo.
    const detalles = aDevengar.map(({ diferido, cuota }) =>
      String(diferido.tipo).toUpperCase() === TipoDiferido.GASTO
        ? [
            {
              cuenta_id: diferido.cuenta_resultado_id,
              debe: cuota,
              haber: 0,
              concepto: `Devengo ${periodo} — ${diferido.nombre}`,
              centro_costo_id: diferido.centro_costo_id
            },
            {
              cuenta_id: diferido.cuenta_diferido_id,
              debe: 0,
              haber: cuota,
              concepto: `Diferido pendiente — ${diferido.nombre}`,
              centro_costo_id: null
            }
          ]
        : [
            {
              cuenta_id: diferido.cuenta_diferido_id,
              debe: cuota,
              haber: 0,
              concepto: `Ingreso diferido — ${diferido.nombre}`,
              centro_costo_id: null
            },
            {
              cuenta_id: diferido.cuenta_resultado_id,
              debe: 0,
              haber: cuota,
              concepto: `Devengo ${periodo} — ${diferido.nombre}`,
              centro_costo_id: diferido.centro_costo_id
            }
          ]
    ).flat();

    const { error: errorDevengo } = await this.supabaseService
      .getClient()
      .rpc('devengar_diferidos_tx', {
        p_tenant_id: tenantId,
        p_asiento: {
          fecha: fechaPeriodo.toISOString(),
          concepto: `Devengo de ingresos y gastos diferidos ${periodo}`,
          referencia: `DIF-${periodo}`,
          tipo_asiento: 'AJUSTE',
          origen: 'DEVENGO_DIFERIDOS',
          source_event_id: sourceEventId,
          estado: EstadoAsiento.CONFIRMADO,
          created_by: userId,
          confirmado_por: userId,
          confirmado_en: new Date().toISOString()
        },
        p_detalles: detalles,
        p_items: aDevengar.map(({ diferido, cuota, acumulado }) => ({
          diferido_id: diferido.id,
          periodo,
          fecha: fechaPeriodo.toISOString().slice(0, 10),
          monto: cuota,
          monto_acumulado: acumulado,
          created_by: userId
        }))
      });

    if (errorDevengo) {
      if (
        errorDevengo.code === '23505' ||
        /YA_DEVENGADO|source_event_id/i.test(errorDevengo.message ?? '')
      ) {
        throw new BadRequestException(
          `El devengo de diferidos del período ${periodo} ya fue registrado.`
        );
      }
      throw new Error(`Error registrando el devengo atómico: ${errorDevengo.message}`);
    }

    this.logger.log(
      `📆 Devengo ${periodo} en ${tenantId}: ${aDevengar.length} diferido(s), total ${total}`
    );

    return {
      periodo,
      diferidos_devengados: aDevengar.length,
      total_devengado: total,
      omitidos: omitidos.length > 0 ? omitidos : undefined
    };
  }

  private aRespuesta(fila: any): DiferidoResponseDto {
    const total = Number(fila.monto_total ?? 0);
    const devengado = Number(fila.monto_devengado ?? 0);

    return {
      ...fila,
      monto_total: total,
      monto_devengado: devengado,
      monto_pendiente: this.round2(total - devengado)
    } as DiferidoResponseDto;
  }
}
