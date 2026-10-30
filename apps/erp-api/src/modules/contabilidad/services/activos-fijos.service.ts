import { Injectable, Logger, BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException, ForbiddenException } from '@nestjs/common';
import { lecturaContableFallida } from '../contabilidad-errors';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PeriodosService } from './periodos.service';
import { PlanCuentasService } from './plan-cuentas.service';
import {
  CreateActivoFijoDto,
  UpdateActivoFijoDto,
  DarDeBajaActivoDto,
  ActivoFijoResponseDto,
  CuotaDepreciacionDto,
    SituacionActivo,
  MotivoBajaActivo,
  EstadoAsiento
} from '@erp-suite/dtos';
import { buildDeterministicUuid } from '../../../common/util/deterministic-uuid.util';
import { createHash, randomUUID } from 'crypto';
import { readCompleteCatalog } from '../../../shared/utils/complete-catalog-read';
import { confirmAssetCreateReceipt } from './asset-create-receipt';
import { confirmDepreciationBatch, depreciationSource } from './asset-depreciation-batch';
import { AssetLifecycleAction, assetLifecycleRequest, confirmAssetLifecycle } from './asset-lifecycle-original';

/** Cuentas PCGE del ciclo de vida del activo. */
const CUENTA_ACTIVO = '33';
const CUENTA_DEPRECIACION_ACUMULADA = '39';
const CUENTA_COSTO_ENAJENACION = '65';
const CUENTA_INGRESO_ENAJENACION = '75';
const CUENTA_COBRAR = '12';

interface RevisionDepreciacion {
  version: 572;
  periodo_inicio: string;
  meses_restantes: number;
  base_centimos: number;
  cuota_centimos: number;
  acumulada_anterior_centimos: number;
  adquisicion_centimos: number;
  residual_centimos: number;
}

function revisionDepreciacion(metadata: any): RevisionDepreciacion | null {
  const revision = metadata?.depreciacion_revision_572;
  if (revision === undefined) return null;
  const campos = ['meses_restantes', 'base_centimos', 'cuota_centimos', 'acumulada_anterior_centimos', 'adquisicion_centimos', 'residual_centimos'];
  if (!revision || revision.version !== 572 || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(revision.periodo_inicio ?? '')
      || campos.some(campo => !Number.isSafeInteger(revision[campo]) || revision[campo] < 0)) {
    throw new ServiceUnavailableException('No se pudo leer la estimación del activo fijo; reintente');
  }
  return revision;
}

const indicePeriodo = (periodo: string): number => {
  const [anio, mes] = periodo.split('-').map(Number);
  return anio * 12 + mes - 1;
};

function errorEscrituraActivo(error: { code?: string; message?: string }, accion: string): Error {
  const motivo = String(error.message ?? '');
  if (motivo.includes('ASSET_NOT_FOUND')) return new NotFoundException('Activo fijo no encontrado');
  if (motivo.includes('ACCOUNTING_MASTER_IDEMPOTENCY_CONFLICT')) {
    return new ConflictException('Esta operación ya se registró con otros datos; recarga e inténtalo de nuevo');
  }
  if (error.code === '23505') return new ConflictException('Ya existe un activo fijo con ese código');
  if (motivo.includes('ASSET_UPDATE_STATE_INVALID')) return new BadRequestException('Sólo se puede editar un activo vigente');
  if (motivo.includes('ASSET_RESIDUAL_INVALID')) return new BadRequestException('El valor residual debe estar entre cero y el valor de adquisición');
  if (motivo.includes('ASSET_USEFUL_LIFE_EXHAUSTED')) return new BadRequestException('La nueva vida útil debe superar los meses ya depreciados mientras quede valor pendiente');
  if (/ASSET_VALUES_INVALID|ACCOUNTING_MASTER_REQUEST_INVALID/.test(motivo) || ['22023', '23503', '23514', '22P02'].includes(String(error.code))) {
    return new BadRequestException('Revisa los datos del activo fijo y su centro de costo');
  }
  return new ServiceUnavailableException(`No se pudo ${accion} el activo fijo; reintente`);
}

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
      metadata?: unknown;
    },
    anio: number,
    mes: number
  ): number {
    const revision = revisionDepreciacion(activo.metadata);
    if (revision) {
      const indice = anio * 12 + mes - 1 - indicePeriodo(revision.periodo_inicio);
      if (indice < 0 || indice >= revision.meses_restantes) return 0;
      const pendiente = Math.max(0, Math.round((activo.valor_adquisicion - activo.valor_residual - activo.depreciacion_acumulada) * 100));
      const cuota = indice === revision.meses_restantes - 1 ? pendiente : revision.cuota_centimos;
      return Math.min(cuota, pendiente) / 100;
    }
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

    const cuota = mesesTranscurridos === activo.vida_util_meses - 1
      ? pendiente
      : Math.round(base / activo.vida_util_meses);
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
      throw lecturaContableFallida(error, 'los activos fijos');
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

    if (error) throw lecturaContableFallida(error, 'el activo fijo');
    if (!data) {
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

    if (error) throw lecturaContableFallida(error, 'el cronograma del activo fijo');
    if (!data) {
      throw new NotFoundException(`Activo fijo ${activoId} no encontrado`);
    }

    const historial = await readCompleteCatalog(this.supabaseService.getClient(), 'depreciaciones', '*',
      q => q.eq('tenant_id', tenantId).eq('activo_id', activoId),
      row => row.tenant_id === tenantId && row.activo_id === activoId,
      [['periodo', true], ['id', true]]);
    const registradas = new Map<string, CuotaDepreciacionDto>();
    for (const fila of historial) {
      if (fila.activo === false || !['PENDIENTE', 'PROCESADA'].includes(String(fila.estado).toUpperCase())) continue;
      const cuota = Number(fila.monto_depreciacion), acumulada = Number(fila.depreciacion_acumulada), neto = Number(fila.valor_neto);
      if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(fila.periodo) || registradas.has(fila.periodo)
        || [fila.monto_depreciacion, fila.depreciacion_acumulada, fila.valor_neto].some(v => v == null)
        || ![cuota, acumulada, neto].every(v => Number.isFinite(v) && v >= 0)
        || Math.round((acumulada + neto) * 100) !== Math.round(Number(data.valor_adquisicion) * 100)) {
        throw new ServiceUnavailableException('No se pudo conciliar el historial completo del activo fijo; reintente');
      }
      registradas.set(fila.periodo, { periodo: fila.periodo, cuota, acumulada, valor_neto: neto, registrada: true });
    }
    const ultimoRegistrado = [...registradas.keys()].sort().at(-1);
    const acumuladaRegistrada = ultimoRegistrado ? registradas.get(ultimoRegistrado)!.acumulada : 0;
    if (Math.round(acumuladaRegistrada * 100) !== Math.round(Number(data.depreciacion_acumulada ?? 0) * 100)) {
      throw new ServiceUnavailableException('El historial de depreciación no coincide con el activo. Reintente la consulta.');
    }
    const revision = revisionDepreciacion(data.metadata);
    const inicio = revision ? indicePeriodo(revision.periodo_inicio)
      : indicePeriodo(String(data.fecha_inicio_depreciacion ?? data.fecha_adquisicion).slice(0, 7));
    const fin = inicio + (revision ? revision.meses_restantes : Number(data.vida_util_meses));
    const cronograma = [...registradas.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
    let acumulada = acumuladaRegistrada;
    if (data.situacion !== SituacionActivo.ACTIVO) return cronograma;
    for (let indice = Math.max(inicio, ultimoRegistrado ? indicePeriodo(ultimoRegistrado) + 1 : inicio); indice < fin; indice++) {
      const anio = Math.floor(indice / 12), mes = indice % 12 + 1;
      const cuota = ActivosFijosService.cuotaDelPeriodo({
        valor_adquisicion: Number(data.valor_adquisicion), valor_residual: Number(data.valor_residual ?? 0),
        vida_util_meses: Number(data.vida_util_meses), depreciacion_acumulada: acumulada,
        fecha_inicio_depreciacion: data.fecha_inicio_depreciacion ?? data.fecha_adquisicion, metadata: data.metadata,
      }, anio, mes);
      if (cuota <= 0) continue;
      acumulada = this.round2(acumulada + cuota);
      cronograma.push({ periodo: `${anio}-${String(mes).padStart(2, '0')}`, cuota, acumulada,
        valor_neto: this.round2(Number(data.valor_adquisicion) - acumulada), registrada: false });
    }
    return cronograma;
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
    if(rpcError) throw errorEscrituraActivo(rpcError, 'crear');
    const result:any=Array.isArray(rpcData)?rpcData[0]:rpcData;
    if (!result?.record) throw new ServiceUnavailableException('No se pudo confirmar el alta del activo fijo; reintente');
    return this.aRespuesta(result.record);
  }

  /** Canonical creation receipt follows the unchanged atomic writer. */
  async crearConRecibo(tenantId: string, userId: string, dto: CreateActivoFijoDto, idempotencyKey?: string) {
    const key = idempotencyKey?.trim() || `asset-create:${randomUUID()}`;
    const payload = JSON.parse(JSON.stringify(dto));
    const result = await this.crear(tenantId, userId, dto, key);
    try {
      const client = this.supabaseService.getClient();
      const ledger = await client.from('financial_master_operations').select('*', { count: 'exact' }).eq('tenant_id', tenantId).eq('operation_type', 'ACCOUNTING_ASSET_CREATE').eq('idempotency_key', key.toLowerCase()).maybeSingle();
      const current = await client.from('activos_fijos').select('id,tenant_id,codigo,fecha_adquisicion,fecha_inicio_depreciacion,valor_adquisicion,metodo_depreciacion,situacion,created_by,created_at', { count: 'exact' }).eq('tenant_id', tenantId).eq('id', result.id).maybeSingle();
      if (ledger.error || current.error || ledger.count !== 1 || current.count !== 1) throw new Error('Unknown canonical asset receipt sources');
      return confirmAssetCreateReceipt({ tenant: tenantId, actor: userId, key: key.toLowerCase(), payload }, result, ledger.data, current.data);
    } catch {
      throw new ServiceUnavailableException('No se pudo confirmar el recibo completo de alta del activo. Conserve la solicitud y reintente con la misma clave.');
    }
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
    const key=idempotencyKey?.trim()||`asset-update:${randomUUID()}`;
    const {data:rpcData,error:rpcError}=await this.supabaseService.getClient().rpc('gestionar_activo_diferido_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_entity:'ASSET',p_action:'UPDATE',p_record_id:activoId,p_payload:dto,p_idempotency_key:key,
    });
    if(rpcError) throw errorEscrituraActivo(rpcError, 'actualizar');
    const result:any=Array.isArray(rpcData)?rpcData[0]:rpcData;
    if (!result?.record) throw new ServiceUnavailableException('No se pudo confirmar la edición del activo fijo; reintente');
    return this.aRespuesta(result.record);
  }

  /** The committed original is read before current catalog/state/period checks. */
  async ejecutarOperacionOriginal(tenantId:string,userId:string,activoId:string,action:AssetLifecycleAction,body:any,idempotencyKey?:string) {
    if(!idempotencyKey||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))throw new BadRequestException('Se requiere la clave UUID original de la operación del activo.');
    const key=idempotencyKey.toLowerCase(),request=assetLifecycleRequest(tenantId,activoId,action,body);
    const params={p_tenant_id:tenantId,p_actor_id:userId,p_asset_id:activoId,p_action:action,p_key:key,p_request:request};
    const invoke=async(name:string,args:any)=>{
      let r:any;try{r=await this.supabaseService.getClient().rpc(name,args)}catch{throw new ServiceUnavailableException('No se pudo confirmar la operación del activo. Conserve el original y reintente con la misma clave.');}
      if(!r||r.error){
        if(['40001','40P01','55P03'].includes(r?.error?.code))throw new ConflictException('El activo cambió o está reservado. Se conserva la solicitud original; revise y reintente manualmente.');
        if(r?.error?.code==='42501' && /ACTOR|PERMISSION_REQUIRED/.test(String(r?.error?.message)))throw new ForbiddenException('El actor no está autorizado para esta operación del activo.');
        if(r?.error?.code==='P0002')throw new NotFoundException('Activo fijo no encontrado en esta empresa.');
        if (['22023','23503','23514','22P02'].includes(r?.error?.code)) throw errorEscrituraActivo(r.error, 'registrar la operación de');
        throw new ServiceUnavailableException('No se pudo confirmar la operación del activo. Conserve el original y reintente con la misma clave.');
      }
      return r.data;
    };
    const prior=await invoke('leer_operacion_activo_570',params);
    if(prior!==null)return confirmAssetLifecycle(prior,tenantId,userId,activoId,action,key,request);
    const result=action==='UPDATE'?await invoke('guardar_operacion_activo_tx_570',params):await this.darDeBaja(tenantId,userId,activoId,request.original,{params,invoke});
    return confirmAssetLifecycle(result,tenantId,userId,activoId,action,key,request);
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
  async depreciarPeriodo(tenantId: string, userId: string, anio: number, mes: number, idempotencyKey?: string) {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 1900 || anio > 9999) {
      throw new BadRequestException('El año y el mes deben identificar un período válido (1900–9999, mes 1–12).');
    }
    if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      throw new BadRequestException('Se requiere la clave original UUID del lote de depreciación.');
    }
    const key = idempotencyKey.toLowerCase(), request = { anio, mes }, client = this.supabaseService.getClient();
    const params = { p_tenant_id: tenantId, p_actor_id: userId, p_key: key, p_request: request };
    const invoke = async (name: string, args: any) => {
      let result: any;
      try { result = await client.rpc(name, args); } catch { throw new ServiceUnavailableException('No se pudo confirmar el lote. Conserve la solicitud y reintente con la misma clave.'); }
      if (!result || result.error) {
        if (result?.error?.code === '40001' || result?.error?.code === '40P01' || result?.error?.code === '55P03') throw new ConflictException('El lote cambió o está reservado. Conserve su solicitud original y reintente manualmente.');
        if (result?.error?.code === '42501' && /ACTOR|PERMISSION_REQUIRED/.test(String(result?.error?.message))) throw new ForbiddenException('El actor no está autorizado para depreciar en esta empresa.');
        throw new ServiceUnavailableException('No se pudo confirmar el lote. Conserve la solicitud y reintente con la misma clave.');
      }
      return result.data;
    };
    // Replay the original committed snapshot even if the period/assets changed later.
    const previous = await invoke('leer_lote_depreciacion_570', params);
    if (previous !== null) return confirmDepreciationBatch(previous, tenantId, userId, key, request);
    await this.periodosService.validarPeriodoAbierto(tenantId, new Date(Date.UTC(anio, mes - 1, 1)));
    const activos = await this.leerCandidatosDepreciacion(tenantId);
    const plan = activos.map(activo => {
      const source = depreciationSource(activo);
      const cuota = ActivosFijosService.cuotaDelPeriodo({ ...source, metadata: activo.metadata }, anio, mes);
      const acumulada = this.round2(source.depreciacion_acumulada + cuota);
      return { source, cuota, acumulada, valor_neto: this.round2(source.valor_adquisicion - acumulada) };
    });
    const receipt = await invoke('registrar_lote_depreciacion_tx_570', { ...params, p_plan: plan });
    return confirmDepreciationBatch(receipt, tenantId, userId, key, request);
  }

  /** Complete/known candidates are required before the first unchanged per-asset RPC. */
  private async leerCandidatosDepreciacion(tenantId: string): Promise<any[]> {
    const cents = (v: any) => typeof v === 'number' && Number.isFinite(v) && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
    const civil = (v: any) => {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const [year, month, day] = v.split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
      return year >= 1900 && year <= 9999 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    };
    return readCompleteCatalog(this.supabaseService.getClient(), 'activos_fijos', '*', q => q.eq('tenant_id', tenantId).eq('situacion', SituacionActivo.ACTIVO), row => row.tenant_id === tenantId && row.situacion === SituacionActivo.ACTIVO && [row.valor_adquisicion, row.valor_residual, row.depreciacion_acumulada].every(cents) && row.valor_adquisicion >= 0 && row.valor_residual >= 0 && row.valor_residual <= row.valor_adquisicion && row.depreciacion_acumulada >= 0 && row.depreciacion_acumulada <= row.valor_adquisicion - row.valor_residual + 0.000001 && Number.isSafeInteger(row.vida_util_meses) && row.vida_util_meses >= 1 && civil(row.fecha_inicio_depreciacion ?? row.fecha_adquisicion), [['id', true]]);
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
    dto: DarDeBajaActivoDto,
    original?: {params:any;invoke:(name:string,args:any)=>Promise<any>}
  ): Promise<any> {
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

    const rpcArgs = {
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
    };
    if(original)return original.invoke('guardar_operacion_activo_tx_570',{...original.params,p_asiento:rpcArgs.p_asiento,p_detalles:rpcArgs.p_detalles,p_baja:rpcArgs.p_baja});
    const {data:resultadoBaja,error:bajaError}=await this.supabaseService.getClient().rpc('dar_baja_activo_tx',rpcArgs);

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
