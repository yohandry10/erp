import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PeriodosService } from './periodos.service';
import { PlanCuentasService } from './plan-cuentas.service';
import {
  CreateActivoFijoDto,
  UpdateActivoFijoDto,
  DarDeBajaActivoDto,
  ActivoFijoResponseDto,
  CuotaDepreciacionDto,
  ResultadoDepreciacionDto,
  SituacionActivo,
  MotivoBajaActivo,
  EstadoAsiento
} from '@erp-suite/dtos';
import { buildDeterministicUuid } from '../../../common/util/deterministic-uuid.util';
import { createHash } from 'crypto';

/** Cuentas PCGE del ciclo de vida del activo. */
const CUENTA_ACTIVO = '33';
const CUENTA_DEPRECIACION_ACUMULADA = '39';
const CUENTA_COSTO_ENAJENACION = '65';
const CUENTA_INGRESO_ENAJENACION = '75';
const CUENTA_COBRAR = '12';

@Injectable()
export class ActivosFijosService {
  private readonly logger = new Logger(ActivosFijosService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly periodosService: PeriodosService,
    private readonly planCuentasService: PlanCuentasService
  ) {}

  private round2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }

  // --------------------------------------------------------------------------
  // Cálculo
  // --------------------------------------------------------------------------

  /**
   * Cronograma de depreciación lineal.
   *
   * Función pura y estática: es donde vive la aritmética que importa, y la que
   * tiene que ser exacta al céntimo. La cuota se redondea a dos decimales, de
   * modo que las cuotas iguales rara vez suman la base depreciable; **la última
   * cuota absorbe el residuo**. Sin eso, un activo de 10.000 a 36 meses dejaría
   * céntimos colgando para siempre y nunca llegaría a su valor residual.
   */
  static calcularCronograma(params: {
    valorAdquisicion: number;
    valorResidual: number;
    vidaUtilMeses: number;
    fechaInicio: Date;
  }): CuotaDepreciacionDto[] {
    const { valorAdquisicion, valorResidual, vidaUtilMeses, fechaInicio } = params;

    const base = Math.round((valorAdquisicion - valorResidual) * 100);
    if (base <= 0 || vidaUtilMeses <= 0) {
      return [];
    }

    const cuotaCentimos = Math.round(base / vidaUtilMeses);
    const cuotas: CuotaDepreciacionDto[] = [];
    let acumuladaCentimos = 0;

    for (let indice = 0; indice < vidaUtilMeses; indice += 1) {
      const esUltima = indice === vidaUtilMeses - 1;
      const cuota = esUltima ? base - acumuladaCentimos : cuotaCentimos;
      acumuladaCentimos += cuota;

      const fecha = new Date(
        Date.UTC(fechaInicio.getUTCFullYear(), fechaInicio.getUTCMonth() + indice, 1)
      );

      cuotas.push({
        periodo: `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`,
        cuota: cuota / 100,
        acumulada: acumuladaCentimos / 100,
        valor_neto: (Math.round(valorAdquisicion * 100) - acumuladaCentimos) / 100
      });
    }

    return cuotas;
  }

  /**
   * Cuota que corresponde a un activo en un período concreto.
   *
   * Devuelve 0 si el período está fuera de la vida útil. Nunca deprecia por
   * debajo del valor residual: la última cuota se recorta a lo que quede.
   */
  static cuotaDelPeriodo(
    activo: {
      valor_adquisicion: number;
      valor_residual: number;
      vida_util_meses: number;
      depreciacion_acumulada: number;
      fecha_inicio_depreciacion: string;
    },
    anio: number,
    mes: number
  ): number {
    const inicio = new Date(activo.fecha_inicio_depreciacion);
    const mesesTranscurridos =
      (anio - inicio.getUTCFullYear()) * 12 + (mes - (inicio.getUTCMonth() + 1));

    if (mesesTranscurridos < 0 || mesesTranscurridos >= activo.vida_util_meses) {
      return 0;
    }

    const base = Math.round((activo.valor_adquisicion - activo.valor_residual) * 100);
    const acumulada = Math.round(activo.depreciacion_acumulada * 100);
    const pendiente = base - acumulada;

    if (pendiente <= 0) {
      return 0;
    }

    const cuota = Math.round(base / activo.vida_util_meses);
    return Math.min(cuota, pendiente) / 100;
  }

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  async listar(tenantId: string, situacion?: string): Promise<ActivoFijoResponseDto[]> {
    let query = this.supabaseService
      .getClient()
      .from('activos_fijos')
      .select('*')
      .eq('tenant_id', tenantId);

    if (situacion) {
      query = query.eq('situacion', situacion.toUpperCase());
    }

    const { data, error } = await query.order('codigo', { ascending: true });

    if (error) {
      throw new Error(`Error listando activos fijos: ${error.message}`);
    }

    return (data || []).map((fila: any) => this.aRespuesta(fila));
  }

  async obtener(tenantId: string, activoId: string): Promise<ActivoFijoResponseDto> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('activos_fijos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', activoId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Activo fijo ${activoId} no encontrado`);
    }

    return this.aRespuesta(data);
  }

  async obtenerCronograma(tenantId: string, activoId: string): Promise<CuotaDepreciacionDto[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('activos_fijos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', activoId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Activo fijo ${activoId} no encontrado`);
    }

    return ActivosFijosService.calcularCronograma({
      valorAdquisicion: Number(data.valor_adquisicion),
      valorResidual: Number(data.valor_residual ?? 0),
      vidaUtilMeses: Number(data.vida_util_meses),
      fechaInicio: new Date(data.fecha_inicio_depreciacion ?? data.fecha_adquisicion)
    });
  }

  async crear(
    tenantId: string,
    userId: string,
    dto: CreateActivoFijoDto,
    idempotencyKey?: string,
  ): Promise<ActivoFijoResponseDto> {
    const valorResidualValidado = dto.valor_residual ?? 0;
    if (valorResidualValidado > dto.valor_adquisicion) {
      throw new BadRequestException('El valor residual no puede superar al de adquisición: la base depreciable sería negativa.');
    }
    const key=idempotencyKey?.trim()||`asset-create:${createHash('sha256').update(JSON.stringify({tenantId,userId,dto})).digest('hex')}`;
    const {data:rpcData,error:rpcError}=await this.supabaseService.getClient().rpc('gestionar_activo_diferido_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_entity:'ASSET',p_action:'CREATE',p_record_id:null,p_payload:dto,p_idempotency_key:key,
    });
    if(rpcError) throw new BadRequestException(rpcError.message||'No se pudo crear el activo fijo');
    const result:any=Array.isArray(rpcData)?rpcData[0]:rpcData;
    return this.aRespuesta(result.record);

    /* istanbul ignore next -- writer legacy inalcanzable */
    const valorResidual = dto.valor_residual ?? 0;

    if (valorResidual > dto.valor_adquisicion) {
      throw new BadRequestException(
        'El valor residual no puede superar al de adquisición: la base depreciable sería negativa.'
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('activos_fijos')
      .insert({
        tenant_id: tenantId,
        codigo: dto.codigo,
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        fecha_adquisicion: dto.fecha_adquisicion,
        valor_adquisicion: this.round2(dto.valor_adquisicion),
        valor_residual: this.round2(valorResidual),
        vida_util_meses: dto.vida_util_meses,
        metodo_depreciacion: 'LINEAL',
        fecha_inicio_depreciacion: dto.fecha_inicio_depreciacion ?? dto.fecha_adquisicion,
        depreciacion_acumulada: 0,
        situacion: SituacionActivo.ACTIVO,
        centro_costo_id: dto.centro_costo_id ?? null,
        estado: 'ACTIVO',
        created_by: userId
      })
      .select()
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        throw new BadRequestException(`Ya existe un activo con el código ${dto.codigo}.`);
      }
      throw new Error(`Error creando activo fijo: ${error?.message}`);
    }

    this.logger.log(`🏗️ Activo fijo ${dto.codigo} registrado para ${tenantId}`);
    return this.aRespuesta(data);
  }

  /**
   * Actualiza datos del activo. Un cambio de vida útil o de valor residual se
   * aplica **hacia adelante**: la depreciación ya registrada no se recalcula,
   * porque ya está en los libros de períodos posiblemente cerrados.
   */
  async actualizar(
    tenantId: string,
    activoId: string,
    dto: UpdateActivoFijoDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<ActivoFijoResponseDto> {
    if(!userId) throw new BadRequestException('Se requiere un usuario autenticado');
    const key=idempotencyKey?.trim()||`asset-update:${createHash('sha256').update(JSON.stringify({tenantId,activoId,userId,dto})).digest('hex')}`;
    const {data:rpcData,error:rpcError}=await this.supabaseService.getClient().rpc('gestionar_activo_diferido_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_entity:'ASSET',p_action:'UPDATE',p_record_id:activoId,p_payload:dto,p_idempotency_key:key,
    });
    if(rpcError) throw new BadRequestException(rpcError.message||'No se pudo actualizar el activo fijo');
    const result:any=Array.isArray(rpcData)?rpcData[0]:rpcData;
    return this.aRespuesta(result.record);

    /* istanbul ignore next -- writer legacy inalcanzable */
    const activo = await this.obtener(tenantId, activoId);

    if (activo.situacion !== SituacionActivo.ACTIVO) {
      throw new BadRequestException(
        `El activo ${activo.codigo} está en situación ${activo.situacion} y ya no admite cambios.`
      );
    }

    const valorResidual = dto.valor_residual ?? activo.valor_residual;
    if (valorResidual > activo.valor_adquisicion) {
      throw new BadRequestException(
        'El valor residual no puede superar al de adquisición.'
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('activos_fijos')
      .update({
        nombre: dto.nombre ?? activo.nombre,
        descripcion: dto.descripcion ?? activo.descripcion,
        vida_util_meses: dto.vida_util_meses ?? activo.vida_util_meses,
        valor_residual: this.round2(valorResidual),
        centro_costo_id: dto.centro_costo_id ?? activo.centro_costo_id ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('id', activoId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Error actualizando activo fijo: ${error?.message}`);
    }

    return this.aRespuesta(data);
  }

  // --------------------------------------------------------------------------
  // Depreciación
  // --------------------------------------------------------------------------

  /**
   * Registra la cuota de depreciación de todos los activos vigentes en un
   * período.
   *
   * No genera el asiento de forma síncrona: la RPC inserta la cuota y el evento
   * durable `depreciacion.generada` dentro del mismo commit. El consumidor
   * contable lo convierte después en Dr 68 / Cr 39 sin una ventana de pérdida.
   */
  async depreciarPeriodo(
    tenantId: string,
    userId: string,
    anio: number,
    mes: number
  ): Promise<ResultadoDepreciacionDto> {
    if (mes < 1 || mes > 12) {
      throw new BadRequestException('El mes debe estar entre 1 y 12.');
    }

    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

    // Depreciar en un período cerrado dejaría un gasto que no puede asentarse.
    await this.periodosService.validarPeriodoAbierto(tenantId, new Date(Date.UTC(anio, mes - 1, 1)));

    const { data: activos, error } = await this.supabaseService
      .getClient()
      .from('activos_fijos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('situacion', SituacionActivo.ACTIVO);

    if (error) {
      throw new Error(`Error obteniendo activos depreciables: ${error.message}`);
    }

    const omitidos: Array<{ activo_id: string; codigo?: string; motivo: string }> = [];
    let depreciados = 0;
    let total = 0;

    for (const activo of activos || []) {
      const cuota = ActivosFijosService.cuotaDelPeriodo(
        {
          valor_adquisicion: Number(activo.valor_adquisicion),
          valor_residual: Number(activo.valor_residual ?? 0),
          vida_util_meses: Number(activo.vida_util_meses),
          depreciacion_acumulada: Number(activo.depreciacion_acumulada ?? 0),
          fecha_inicio_depreciacion: activo.fecha_inicio_depreciacion ?? activo.fecha_adquisicion
        },
        anio,
        mes
      );

      if (cuota <= 0) {
        omitidos.push({
          activo_id: activo.id,
          codigo: activo.codigo,
          motivo:
            'El período está fuera de su vida útil o el activo ya alcanzó su valor residual.'
        });
        continue;
      }

      const acumulada = this.round2(Number(activo.depreciacion_acumulada ?? 0) + cuota);
      const valorNeto = this.round2(Number(activo.valor_adquisicion) - acumulada);

      const { error: insertError } = await this.supabaseService
        .getClient()
        .rpc('registrar_depreciacion_tx', {
          p_tenant_id: tenantId,
          p_activo_id: activo.id,
          p_periodo: periodo,
          p_fecha: new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10),
          p_monto: cuota,
          p_acumulado: acumulada,
          p_valor_neto: valorNeto,
          p_centro_costo_id: activo.centro_costo_id ?? null,
          p_created_by: userId
        });

      if (insertError) {
        // El índice único es la barrera contra depreciar dos veces el mismo
        // mes; aquí solo se traduce a un motivo entendible.
        omitidos.push({
          activo_id: activo.id,
          codigo: activo.codigo,
          motivo:
            insertError.code === '23505' || /YA_REGISTRADA/i.test(insertError.message ?? '')
              ? `El activo ya tiene registrada su depreciación del período ${periodo}.`
              : `No se pudo registrar la depreciación: ${insertError.message}`
        });
        continue;
      }

      depreciados += 1;
      total = this.round2(total + cuota);
    }

    this.logger.log(
      `🏗️ Depreciación ${periodo} en ${tenantId}: ${depreciados} activo(s), total ${total}`
    );

    return {
      periodo,
      activos_depreciados: depreciados,
      total_depreciado: total,
      omitidos: omitidos.length > 0 ? omitidos : undefined
    };
  }

  // --------------------------------------------------------------------------
  // Baja y venta
  // --------------------------------------------------------------------------

  /**
   * Retira el activo del balance y reconoce el resultado.
   *
   * BAJA: se cancela la depreciación acumulada, el valor neto pendiente va a
   * gasto y el activo sale del balance.
   * VENTA: además se reconoce la cuenta por cobrar y el ingreso por enajenación.
   * La ganancia o pérdida queda implícita en la diferencia entre el ingreso
   * reconocido y el costo neto dado de baja, que es como lo presenta el estado
   * de resultados.
   */
  async darDeBaja(
    tenantId: string,
    userId: string,
    activoId: string,
    dto: DarDeBajaActivoDto
  ): Promise<ActivoFijoResponseDto> {
    const activo = await this.obtener(tenantId, activoId);

    if (activo.situacion === SituacionActivo.BAJA || activo.situacion === SituacionActivo.VENDIDO) {
      throw new BadRequestException(
        `El activo ${activo.codigo} ya fue retirado (${activo.situacion}).`
      );
    }

    if (dto.tipo === MotivoBajaActivo.VENTA && !dto.valor_venta) {
      throw new BadRequestException('Una venta requiere el importe de la venta.');
    }

    const fechaBaja = new Date(dto.fecha);
    await this.periodosService.validarPeriodoAbierto(tenantId, fechaBaja);

    const codigos = [CUENTA_ACTIVO, CUENTA_DEPRECIACION_ACUMULADA, CUENTA_COSTO_ENAJENACION];
    if (dto.tipo === MotivoBajaActivo.VENTA) {
      codigos.push(CUENTA_COBRAR, CUENTA_INGRESO_ENAJENACION);
    }
    const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenantId, codigos);

    const valorAdquisicion = this.round2(activo.valor_adquisicion);
    const acumulada = this.round2(activo.depreciacion_acumulada);
    const valorNeto = this.round2(valorAdquisicion - acumulada);

    const detalles: Array<{
      cuenta_id: string;
      debe: number;
      haber: number;
      concepto: string;
      centro_costo_id?: string;
    }> = [];

    if (acumulada > 0) {
      detalles.push({
        cuenta_id: cuentas.get(CUENTA_DEPRECIACION_ACUMULADA)!.id,
        debe: acumulada,
        haber: 0,
        concepto: `Depreciación acumulada del activo ${activo.codigo}`
      });
    }

    if (valorNeto > 0) {
      detalles.push({
        cuenta_id: cuentas.get(CUENTA_COSTO_ENAJENACION)!.id,
        debe: valorNeto,
        haber: 0,
        concepto: `Costo neto de enajenación del activo ${activo.codigo}`,
        centro_costo_id: activo.centro_costo_id
      });
    }

    detalles.push({
      cuenta_id: cuentas.get(CUENTA_ACTIVO)!.id,
      debe: 0,
      haber: valorAdquisicion,
      concepto: `Retiro del activo ${activo.codigo}`
    });

    if (dto.tipo === MotivoBajaActivo.VENTA) {
      const valorVenta = this.round2(dto.valor_venta!);
      detalles.push({
        cuenta_id: cuentas.get(CUENTA_COBRAR)!.id,
        debe: valorVenta,
        haber: 0,
        concepto: `Venta del activo ${activo.codigo}`
      });
      detalles.push({
        cuenta_id: cuentas.get(CUENTA_INGRESO_ENAJENACION)!.id,
        debe: 0,
        haber: valorVenta,
        concepto: `Ingreso por enajenación del activo ${activo.codigo}`
      });
    }

    const totalDebe = this.round2(detalles.reduce((s, d) => s + d.debe, 0));
    const totalHaber = this.round2(detalles.reduce((s, d) => s + d.haber, 0));

    if (Math.round(totalDebe * 100) !== Math.round(totalHaber * 100)) {
      throw new Error(
        `El asiento de baja no cuadra (debe=${totalDebe}, haber=${totalHaber}). No se registró nada.`
      );
    }

    const sourceEventId = buildDeterministicUuid(`activo-baja:${tenantId}:${activoId}`);

    const { data: resultadoBaja, error: bajaError } = await this.supabaseService
      .getClient()
      .rpc('dar_baja_activo_tx', {
        p_tenant_id: tenantId,
        p_activo_id: activoId,
        p_asiento: {
          fecha: fechaBaja.toISOString(),
          concepto:
            dto.motivo ||
            `${dto.tipo === MotivoBajaActivo.VENTA ? 'Venta' : 'Baja'} del activo ${activo.codigo} - ${activo.nombre}`,
          referencia: `AF-${activo.codigo}`,
          tipo_asiento: 'AJUSTE',
          origen: 'BAJA_ACTIVO_FIJO',
          source_event_id: sourceEventId,
          estado: EstadoAsiento.CONFIRMADO,
          created_by: userId,
          confirmado_por: userId,
          confirmado_en: new Date().toISOString()
        },
        p_detalles: detalles.map(detalle => ({
          cuenta_id: detalle.cuenta_id,
          debe: detalle.debe,
          haber: detalle.haber,
          concepto: detalle.concepto,
          centro_costo_id: detalle.centro_costo_id ?? null
        })),
        p_baja: {
          situacion:
            dto.tipo === MotivoBajaActivo.VENTA ? SituacionActivo.VENDIDO : SituacionActivo.BAJA,
          fecha_baja: dto.fecha,
          motivo_baja: dto.motivo ?? null,
          valor_venta: dto.valor_venta ?? null,
          valor_adquisicion_esperado: valorAdquisicion,
          depreciacion_acumulada_esperada: acumulada
        }
      });

    if (bajaError || !resultadoBaja?.activo || !resultadoBaja?.asiento) {
      if (bajaError?.code === '23505' || /YA_RETIRADO/i.test(bajaError?.message ?? '')) {
        throw new BadRequestException(`El activo ${activo.codigo} ya tiene un asiento de baja.`);
      }
      throw new Error(`Error retirando el activo atómicamente: ${bajaError?.message}`);
    }

    this.logger.log(
      `🏗️ Activo ${activo.codigo} retirado (${dto.tipo}) — asiento ${resultadoBaja.asiento.id}`
    );
    return this.aRespuesta(resultadoBaja.activo);
  }

  private aRespuesta(fila: any): ActivoFijoResponseDto {
    const valorAdquisicion = Number(fila.valor_adquisicion ?? 0);
    const acumulada = Number(fila.depreciacion_acumulada ?? 0);

    return {
      ...fila,
      valor_adquisicion: valorAdquisicion,
      valor_residual: Number(fila.valor_residual ?? 0),
      vida_util_meses: Number(fila.vida_util_meses ?? 0),
      depreciacion_acumulada: acumulada,
      valor_neto: this.round2(valorAdquisicion - acumulada)
    } as ActivoFijoResponseDto;
  }
}
