import { Injectable, BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreatePresupuestoDto, UpdatePresupuestoDto, EstadoPresupuesto } from '@erp-suite/dtos';
import { randomUUID } from 'crypto';
import { lecturaContableFallida } from '../contabilidad-errors';

/**
 * Errores del RPC 480 con texto para el contador. Antes todo salía como 400 con
 * el código interno («BUDGET_NOT_FOUND») o en inglés para el duplicado.
 */
function errorPresupuesto(error: { code?: string; message?: string }, accion: string): Error {
  const motivo = String(error?.message ?? '');
  if (/BUDGET.*(?:LEDGER|RECEIPT)_INVALID/.test(motivo)) return new ServiceUnavailableException(`No se pudo confirmar el recibo del presupuesto; conserva su clave y reintenta`);
  if (error?.code === 'P0002' || /BUDGET(?:_UPDATE570|_DELETE570)?_NOT_FOUND/.test(motivo)) return new NotFoundException('Presupuesto no encontrado');
  if (error?.code === '23505' || /duplicate key|DUPLICATE/i.test(motivo)) {
    return new ConflictException('Ya existe un presupuesto para ese centro de costo, cuenta y período');
  }
  if (/BUDGET.*IDEMPOTENCY_CONFLICT/.test(motivo)) return new ConflictException('Esta operación ya se registró con otros datos; recarga e inténtalo de nuevo');
  if (['40001','40P01','55P03'].includes(String(error?.code))) return new ConflictException('El presupuesto cambió o está reservado. Conserva la solicitud original y revisa su resultado');
  if (/BUDGET.*PERIOD_NOT_OPEN/.test(motivo)) return new ConflictException('El período contable no está abierto');
  if (motivo.includes('BUDGET_AMOUNT_INVALID') || motivo.includes('BUDGET_VALUES_INVALID') || motivo.includes('BUDGET_REQUEST_INVALID')) {
    return new BadRequestException('Revisa los datos del presupuesto: el monto debe ser mayor a cero y la cuenta, el centro y el período deben existir');
  }
  if (['22023', '23503', '23514', '22P02'].includes(String(error?.code))) return new BadRequestException(`No se pudo ${accion} el presupuesto: datos inválidos`);
  return new ServiceUnavailableException(`No se pudo ${accion} el presupuesto; reintenta`);
}
import { budgetCalendarWindow } from './budget-calendar-window';

export interface Presupuesto {
  id: string;
  tenant_id: string;
  centro_costo_id: string;
  cuenta_id: string;
  periodo_contable_id: string;
  monto_presupuestado: number;
  monto_ejecutado: number;
  monto_comprometido: number;
  monto_disponible: number;
  porcentaje_ejecutado: number;
  estado: EstadoPresupuesto;
  notas?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  centro_costo?: { id: string; codigo: string; nombre: string };
  cuenta?: { id: string; codigo: string; nombre: string };
  periodo?: { id: string; anio: number; mes: number; estado: string };
}

@Injectable()
export class PresupuestosService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private validarFilaVistaEjecucion(row: any, tenantId: string) {
    const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
    const money = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < .00001;
    if (!row || row.tenant_id !== tenantId || !['id','centro_costo_id','cuenta_id','periodo_contable_id'].every(k => uuid(row[k]))
      || !['monto_presupuestado','monto_ejecutado','monto_comprometido','monto_disponible'].every(k => money(row[k]))
      || row.monto_presupuestado <= 0 || row.monto_ejecutado < 0 || row.monto_comprometido < 0
      || Math.abs(row.monto_disponible - (row.monto_presupuestado - row.monto_ejecutado - row.monto_comprometido)) > .00001
      || typeof row.porcentaje_ejecutado !== 'number' || !Number.isFinite(row.porcentaje_ejecutado)
      || Math.abs(row.porcentaje_ejecutado - row.monto_ejecutado / row.monto_presupuestado * 100) > .00501
      || !['ACTIVO','BLOQUEADO','CERRADO'].includes(row.estado)
      || !row.centro_costo || row.centro_costo.id !== row.centro_costo_id || !row.cuenta || row.cuenta.id !== row.cuenta_id
      || !row.periodo || row.periodo.id !== row.periodo_contable_id
      || !Number.isInteger(row.periodo.anio) || row.periodo.anio < 1900 || row.periodo.anio > 9999
      || !Number.isInteger(row.periodo.mes) || row.periodo.mes < 1 || row.periodo.mes > 12
      || !['ABIERTO','CERRADO','BLOQUEADO'].includes(row.periodo.estado)
      || [row.codigo,row.nombre,row.centro_costo.codigo,row.centro_costo.nombre,row.cuenta.codigo,row.cuenta.nombre].some(v => typeof v !== 'string' || !v.trim())
      || !row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)
      || !['created_at','updated_at'].every(k => typeof row[k] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(row[k]) && Number.isFinite(Date.parse(row[k])))
      || Date.parse(row.updated_at) < Date.parse(row.created_at)
      || !Object.prototype.hasOwnProperty.call(row,'notas') || (row.notas !== null && typeof row.notas !== 'string')
      || !['created_by','updated_by'].every(k => Object.prototype.hasOwnProperty.call(row,k) && (row[k] === null || uuid(row[k])))) {
      throw new ServiceUnavailableException('No se pudo consultar la fotografía completa para la ejecución actual.');
    }
  }

  private async calcularVistaEjecucion(row: any, tenantId: string) {
    this.validarFilaVistaEjecucion(row, tenantId);
    const ejecutado = await this.calcularMontoEjecutado(tenantId, row.centro_costo_id, row.cuenta_id, row.periodo_contable_id);
    const disponibleCentavos = Math.round(row.monto_presupuestado * 100) - Math.round(ejecutado * 100) - Math.round(row.monto_comprometido * 100);
    if (!Number.isFinite(ejecutado) || ejecutado < 0 || !Number.isSafeInteger(Math.round(ejecutado * 100))
      || Math.abs(ejecutado * 100 - Math.round(ejecutado * 100)) > .00001 || !Number.isSafeInteger(disponibleCentavos)) {
      throw new ServiceUnavailableException('No se pudo verificar el importe de ejecución actual.');
    }
    return { ...row, monto_ejecutado: ejecutado,
      monto_disponible: disponibleCentavos / 100,
      porcentaje_ejecutado: ejecutado / row.monto_presupuestado * 100,
      fuente_ejecucion: 'ASIENTOS_CONFIRMADOS', fecha_calculo_ejecucion: new Date().toISOString() };
  }

  /** Read views never update stored execution or replace the row used by a writer. */
  async listarVistaEjecucion(tenantId: string): Promise<any[]> {
    try {
    const rows: any[] = []; const ids = new Set<string>(); let expected: number | undefined; let previousId = '';
    for (let offset = 0; ; offset += 1000) {
      const { data, error, count } = await this.supabaseService.getClient().from('presupuestos')
        .select(`*,centro_costo:centros_costo!fk_presupuestos_centro_costo_id(id,codigo,nombre),cuenta:plan_cuentas!fk_presupuestos_cuenta_id(id,codigo,nombre),periodo:periodos_contables!fk_presupuestos_periodo_contable_id(id,anio,mes,estado)`, { count: 'exact' })
        .eq('tenant_id', tenantId).order('id', { ascending: true }).range(offset, offset + 999);
      if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || (count as number) < 0
        || (expected !== undefined && count !== expected)) throw new ServiceUnavailableException('No se pudo consultar la lista completa de ejecución actual.');
      expected = count as number;
      if (data.length !== Math.min(1000, Math.max(0, expected - offset))) throw new ServiceUnavailableException('La lista de ejecución actual está incompleta.');
      for (const row of data) {
        this.validarFilaVistaEjecucion(row, tenantId);
        if (ids.has(row.id) || row.id <= previousId) throw new ServiceUnavailableException('La lista de ejecución actual cambió durante su consulta.');
        ids.add(row.id); previousId = row.id; rows.push(row);
      }
      if (offset + data.length === expected) break;
    }
    // Complete the catalog before calculating; one failed expense read rejects the whole view.
    const result: any[] = [];
    for (const row of rows) result.push(await this.calcularVistaEjecucion(row, tenantId));
    return result;
    } catch {
      throw new ServiceUnavailableException('No se pudo consultar la lista completa de ejecución actual.');
    }
  }

  async obtenerVistaEjecucion(tenantId: string, presupuestoId: string): Promise<any> {
    try {
    const { data, error } = await this.supabaseService.getClient().from('presupuestos')
      .select(`*,centro_costo:centros_costo!fk_presupuestos_centro_costo_id(id,codigo,nombre),cuenta:plan_cuentas!fk_presupuestos_cuenta_id(id,codigo,nombre),periodo:periodos_contables!fk_presupuestos_periodo_contable_id(id,anio,mes,estado)`)
      .eq('tenant_id', tenantId).eq('id', presupuestoId).maybeSingle();
    if (error) throw new ServiceUnavailableException('No se pudo consultar la ejecución actual del presupuesto.');
    if (!data) throw new NotFoundException('Presupuesto no encontrado.');
    if (data.id !== presupuestoId) throw new ServiceUnavailableException('La ejecución no corresponde al presupuesto consultado.');
    return await this.calcularVistaEjecucion(data, tenantId);
    } catch (cause) {
      if (cause instanceof NotFoundException) throw cause;
      throw new ServiceUnavailableException('No se pudo consultar la ejecución actual del presupuesto.');
    }
  }

  /**
   * Crea un nuevo presupuesto
   * @param tenantId - ID del tenant
   * @param createPresupuestoDto - Datos del presupuesto a crear
   * @param userId - ID del usuario que crea el presupuesto
   * @returns Presupuesto creado
   * @throws BadRequestException si ya existe un presupuesto para el mismo centro, cuenta y período
   */
  async crearPresupuesto(
    tenantId: string,
    createPresupuestoDto: CreatePresupuestoDto,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<Presupuesto> {
    if(!userId) throw new BadRequestException('Se requiere un usuario autenticado');
    if(createPresupuestoDto.monto_presupuestado<=0) throw new BadRequestException('El monto presupuestado debe ser mayor a cero');
    const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
    const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
    const live=(value:Record<string,any>)=>['cached','queued','offline','pending'].every(k=>value[k]===undefined||value[k]===false);
    const money=createPresupuestoDto.monto_presupuestado;
    if(!uuid(tenantId)||!uuid(userId)||![createPresupuestoDto.centro_costo_id,createPresupuestoDto.cuenta_id,createPresupuestoDto.periodo_contable_id].every(uuid)||!Number.isFinite(money)||!Number.isSafeInteger(Math.round(money*100))||Math.abs(money*100-Math.round(money*100))>.00001||typeof (createPresupuestoDto.notas??'')!=='string')throw new BadRequestException('Los datos del presupuesto no son válidos.');
    const payload={centro_costo_id:createPresupuestoDto.centro_costo_id.toLowerCase(),cuenta_id:createPresupuestoDto.cuenta_id.toLowerCase(),periodo_contable_id:createPresupuestoDto.periodo_contable_id.toLowerCase(),monto_presupuestado:money,notas:(createPresupuestoDto.notas??'').trim(),estado:createPresupuestoDto.estado??EstadoPresupuesto.ACTIVO};
    if(payload.notas.length>10000||!Object.values(EstadoPresupuesto).includes(payload.estado))throw new BadRequestException('Los datos del presupuesto no son válidos.');
    const key=idempotencyKey===undefined?`budget-create:${randomUUID()}`:idempotencyKey.trim().toLowerCase();
    if(key.length<8||key.length>200)throw new BadRequestException('La clave de la operación no es válida.');
    let rpc:any;
    try{rpc=await this.supabaseService.getClient().rpc('crear_presupuesto_tx_570',{p_tenant_id:tenantId,p_actor_id:userId,p_payload:payload,p_idempotency_key:key});}
    catch{throw new ServiceUnavailableException('No se pudo confirmar el alta del presupuesto. Reintenta con su misma clave.');}
    if(rpc?.error) throw errorPresupuesto(rpc.error, 'crear');
    const result:any=Array.isArray(rpc?.data)?(rpc.data.length===1?rpc.data[0]:null):rpc?.data;
    const row=result?.record;
    const invalid=()=>{throw new ServiceUnavailableException('El recibo del presupuesto está incompleto. Reintenta con su misma clave.');};
    if(!object(result)||!live(result)||!object(row)||!live(row)||result.success!==true||result.action!=='CREATE'||!uuid(result.operation_id)||typeof result.idempotent!=='boolean'||result.tenant_id!==tenantId||result.actor_id!==userId||result.idempotency_key!==key||!object(result.payload)||Object.keys(result.payload).length!==6||Object.entries(payload).some(([field,value])=>result.payload[field]!==value)||typeof result.request_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(result.request_fingerprint))invalid();
    if(!uuid(row.id)||result.id!==row.id||row.tenant_id!==tenantId||row.created_by!==userId||row.updated_by!==userId||row.centro_costo_id!==payload.centro_costo_id||row.cuenta_id!==payload.cuenta_id||row.periodo_contable_id!==payload.periodo_contable_id||row.monto_presupuestado!==money||row.monto_ejecutado!==0||row.monto_comprometido!==0||row.monto_disponible!==money||row.porcentaje_ejecutado!==0||row.estado!==payload.estado||row.notas!==(payload.notas||null)||typeof row.codigo!=='string'||!row.codigo.trim()||typeof row.nombre!=='string'||!row.nombre.trim()||!object(row.metadata)||typeof row.created_at!=='string'||typeof row.updated_at!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(row.created_at)||!/^\d{4}-\d{2}-\d{2}T/.test(row.updated_at)||!Number.isFinite(Date.parse(row.created_at))||!Number.isFinite(Date.parse(row.updated_at))||Date.parse(row.updated_at)<Date.parse(row.created_at))invalid();
    const operation={...result};delete operation.record;
    return {...row,operation} as Presupuesto;
  }

  /**
   * Obtiene todos los presupuestos de un tenant con filtros opcionales
   * @param tenantId - ID del tenant
   * @param filters - Filtros opcionales (centro_costo_id, cuenta_id, periodo_contable_id, estado)
   * @returns Lista de presupuestos
   */
  async obtenerPresupuestos(
    tenantId: string,
    filters?: {
      centro_costo_id?: string;
      cuenta_id?: string;
      periodo_contable_id?: string;
      estado?: EstadoPresupuesto;
    }
  ): Promise<Presupuesto[]> {
    console.log(`💰 [Presupuestos] Obteniendo presupuestos para tenant ${tenantId}`);

    let query = this.supabaseService
      .getClient()
      .from('presupuestos')
      .select(`
        *,
        centro_costo:centros_costo!fk_presupuestos_centro_costo_id(id,codigo,nombre),
        cuenta:plan_cuentas!fk_presupuestos_cuenta_id(id,codigo,nombre),
        periodo:periodos_contables!fk_presupuestos_periodo_contable_id(id,anio,mes,estado)
      `)
      .eq('tenant_id', tenantId);

    // Aplicar filtros si existen
    if (filters?.centro_costo_id) {
      query = query.eq('centro_costo_id', filters.centro_costo_id);
    }
    if (filters?.cuenta_id) {
      query = query.eq('cuenta_id', filters.cuenta_id);
    }
    if (filters?.periodo_contable_id) {
      query = query.eq('periodo_contable_id', filters.periodo_contable_id);
    }
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    // Ordenar por fecha de creación descendente
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error || !Array.isArray(data)) {
      throw new ServiceUnavailableException('No se pudieron consultar los presupuestos completos.');
    }

    console.log(`✅ [Presupuestos] ${data.length} presupuestos encontrados`);

    return data as Presupuesto[];
  }

  /**
   * Obtiene un presupuesto específico por ID
   * @param tenantId - ID del tenant
   * @param presupuestoId - ID del presupuesto
   * @returns Presupuesto encontrado
   * @throws NotFoundException si el presupuesto no existe
   */
  async obtenerPresupuestoPorId(
    tenantId: string,
    presupuestoId: string
  ): Promise<Presupuesto> {
    console.log(`💰 [Presupuestos] Obteniendo presupuesto ${presupuestoId} para tenant ${tenantId}`);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .select('*')
      .eq('id', presupuestoId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('❌ [Presupuestos] Error obteniendo presupuesto:', error);
      throw lecturaContableFallida(error, 'el presupuesto');
    }

    if (!data) {
      throw new NotFoundException(`Presupuesto con ID ${presupuestoId} no encontrado`);
    }

    console.log(`✅ [Presupuestos] Presupuesto encontrado: ${data.id}`);

    return data as Presupuesto;
  }

  /**
   * Actualiza un presupuesto existente
   * @param tenantId - ID del tenant
   * @param presupuestoId - ID del presupuesto a actualizar
   * @param updatePresupuestoDto - Datos a actualizar
   * @param userId - ID del usuario que actualiza el presupuesto
   * @returns Presupuesto actualizado
   * @throws NotFoundException si el presupuesto no existe
   * @throws BadRequestException si el período está cerrado o los datos son inválidos
   */
  async actualizarPresupuesto(
    tenantId: string,
    presupuestoId: string,
    updatePresupuestoDto: UpdatePresupuestoDto,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<Presupuesto> {
    return this.ejecutarEdicionPresupuesto(tenantId,presupuestoId,updatePresupuestoDto,userId,idempotencyKey,false);
  }

  async resolverEdicionPresupuesto(tenantId:string,presupuestoId:string,payload:UpdatePresupuestoDto,userId:string,idempotencyKey:string) {
    if (!idempotencyKey) throw new BadRequestException('La resolución exige la clave original de la edición.');
    return this.ejecutarEdicionPresupuesto(tenantId,presupuestoId,payload,userId,idempotencyKey,true);
  }

  private async ejecutarEdicionPresupuesto(tenantId:string,presupuestoId:string,updatePresupuestoDto:UpdatePresupuestoDto,userId:string|undefined,idempotencyKey:string|undefined,resolve:boolean):Promise<any> {
    const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
    const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
    const live=(value:Record<string,any>)=>['cached','queued','offline','pending'].every(k=>value[k]===undefined||value[k]===false);
    const stable=(value:any):string=>Array.isArray(value)?'['+value.map(stable).join(',')+']':object(value)?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}':JSON.stringify(value);
    const snapshot=updatePresupuestoDto.expected_snapshot;
    if(!uuid(tenantId)||!uuid(userId)||!uuid(presupuestoId)||!object(snapshot)||!live(snapshot)||snapshot.id!==presupuestoId||snapshot.tenant_id!==tenantId||![snapshot.centro_costo_id,snapshot.cuenta_id,snapshot.periodo_contable_id].every(uuid)||typeof snapshot.updated_at!=='string'||!Number.isFinite(Date.parse(snapshot.updated_at)))throw new BadRequestException('Consulta la fotografía completa del presupuesto antes de editar.');
    const required=['id','tenant_id','centro_costo_id','cuenta_id','periodo_contable_id','codigo','nombre','metadata','monto_presupuestado','monto_ejecutado','monto_comprometido','monto_disponible','porcentaje_ejecutado','estado','notas','created_by','created_at','updated_by','updated_at'];
    if(!required.every(k=>Object.prototype.hasOwnProperty.call(snapshot,k))||!object(snapshot.metadata)||typeof snapshot.codigo!=='string'||!snapshot.codigo.trim()||typeof snapshot.nombre!=='string'||!snapshot.nombre.trim()||typeof snapshot.created_at!=='string'||!Number.isFinite(Date.parse(snapshot.created_at))||!['monto_presupuestado','monto_ejecutado','monto_comprometido','monto_disponible','porcentaje_ejecutado'].every(k=>typeof snapshot[k]==='number'&&Number.isFinite(snapshot[k])))throw new BadRequestException('La fotografía del presupuesto está incompleta.');
    const payload={monto_presupuestado:updatePresupuestoDto.monto_presupuestado??snapshot.monto_presupuestado,notas:(updatePresupuestoDto.notas??snapshot.notas??''),estado:updatePresupuestoDto.estado??snapshot.estado,expected_snapshot:snapshot};
    const money=payload.monto_presupuestado;
    if(typeof money!=='number'||!Number.isFinite(money)||money<=0||!Number.isSafeInteger(Math.round(money*100))||Math.abs(money*100-Math.round(money*100))>.00001||typeof payload.notas!=='string'||payload.notas.trim()!==payload.notas||payload.notas.length>10000||!Object.values(EstadoPresupuesto).includes(payload.estado))throw new BadRequestException('Los cambios del presupuesto no son válidos.');
    const key=idempotencyKey===undefined?`budget-update:${randomUUID()}`:idempotencyKey.trim().toLowerCase();
    if(key.length<8||key.length>200)throw new BadRequestException('La clave de la edición no es válida.');
    let rpc:any;
    try{rpc=await this.supabaseService.getClient().rpc(resolve?'resolver_edicion_presupuesto_tx_570':'actualizar_presupuesto_tx_570',{p_tenant_id:tenantId,p_actor_id:userId,p_presupuesto_id:presupuestoId,p_payload:payload,p_idempotency_key:key});}
    catch{throw new ServiceUnavailableException('No se pudo confirmar la edición del presupuesto. Conserva sus datos y reintenta con la misma clave.');}
    if(rpc?.error) throw errorPresupuesto(rpc.error, 'actualizar');
    const result:any=Array.isArray(rpc?.data)?(rpc.data.length===1?rpc.data[0]:null):rpc?.data,row=result?.record;
    const invalid=()=>{throw new ServiceUnavailableException('El recibo de edición está incompleto. Conserva los datos y reintenta con la misma clave.');};
    if(resolve && object(result) && result.action==='ABANDON_UPDATE') {
      if(!live(result)||result.success!==true||result.id!==presupuestoId||!uuid(result.operation_id)||result.tenant_id!==tenantId||result.actor_id!==userId||result.idempotency_key!==key||typeof result.idempotent!=='boolean'||!object(result.payload)||stable(result.payload)!==stable(payload)||typeof result.request_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(result.request_fingerprint)||typeof result.abandoned_at!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(result.abandoned_at)||!Number.isFinite(Date.parse(result.abandoned_at)))invalid();
      return {resolution:'ABANDONED',receipt:result};
    }
    if(!object(result)||!live(result)||!object(row)||!live(row)||result.success!==true||result.action!=='UPDATE'||result.id!==presupuestoId||!uuid(result.operation_id)||typeof result.idempotent!=='boolean'||result.tenant_id!==tenantId||result.actor_id!==userId||result.idempotency_key!==key||!object(result.payload)||stable(result.payload)!==stable(payload)||typeof result.request_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(result.request_fingerprint))invalid();
    if(!required.every(k=>Object.prototype.hasOwnProperty.call(row,k))||!['monto_presupuestado','monto_ejecutado','monto_comprometido','monto_disponible','porcentaje_ejecutado'].every(k=>typeof row[k]==='number'&&Number.isFinite(row[k])))invalid();
    const ignored=['monto_presupuestado','monto_disponible','porcentaje_ejecutado','notas','estado','updated_by','updated_at'];
    const preserved=(value:Record<string,any>)=>Object.fromEntries(Object.entries(value).filter(([k])=>!ignored.includes(k)));
    if(row.id!==presupuestoId||row.tenant_id!==tenantId||row.updated_by!==userId||row.monto_presupuestado!==money||row.estado!==payload.estado||row.notas!==(payload.notas||null)||stable(preserved(row))!==stable(preserved(snapshot))||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at))||Date.parse(row.updated_at)<Date.parse(snapshot.updated_at)||typeof row.monto_ejecutado!=='number'||typeof row.monto_comprometido!=='number'||!Number.isFinite(row.monto_ejecutado)||!Number.isFinite(row.monto_comprometido)||row.monto_ejecutado<0||row.monto_comprometido<0||Math.abs(row.monto_disponible-(money-row.monto_ejecutado-row.monto_comprometido))>.00001||Math.abs(row.porcentaje_ejecutado-row.monto_ejecutado/money*100)>.00501)invalid();
    const operation={...result};delete operation.record;
    const receipt={...row,operation} as Presupuesto;
    return resolve?{resolution:'COMMITTED',receipt:{success:true,data:receipt}}:receipt;
  }

  /**
   * Elimina un presupuesto existente
   * @param tenantId - ID del tenant
   * @param presupuestoId - ID del presupuesto a eliminar
   * @returns Presupuesto eliminado
   * @throws NotFoundException si el presupuesto no existe
   * @throws BadRequestException si el período está cerrado
   */
  async eliminarPresupuesto(
    tenantId: string,
    presupuestoId: string,
    userId: string,
    idempotencyKey: string | undefined,
    payload: { expected_snapshot: Record<string, unknown> },
  ): Promise<Presupuesto> {
    const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
    const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
    const live=(v:Record<string,any>)=>['cached','queued','offline','pending'].every(k=>v[k]===undefined||v[k]===false);
    const stable=(v:any):string=>Array.isArray(v)?'['+v.map(stable).join(',')+']':object(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
    const required=['id','tenant_id','centro_costo_id','cuenta_id','periodo_contable_id','codigo','nombre','metadata','monto_presupuestado','monto_ejecutado','monto_comprometido','monto_disponible','porcentaje_ejecutado','estado','notas','created_by','created_at','updated_by','updated_at'];
    const validSnapshot=(row:any)=>object(row)&&live(row)&&required.every(k=>Object.prototype.hasOwnProperty.call(row,k))&&row.id===presupuestoId&&row.tenant_id===tenantId&&['id','tenant_id','centro_costo_id','cuenta_id','periodo_contable_id'].every(k=>uuid(row[k]))&&['created_by','updated_by'].every(k=>row[k]===null||uuid(row[k]))&&typeof row.codigo==='string'&&!!row.codigo.trim()&&typeof row.nombre==='string'&&!!row.nombre.trim()&&object(row.metadata)&&['created_at','updated_at'].every(k=>typeof row[k]==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(row[k])&&Number.isFinite(Date.parse(row[k])))&&Date.parse(row.updated_at)>=Date.parse(row.created_at)&&['ACTIVO','BLOQUEADO','CERRADO'].includes(row.estado)&&(row.notas===null||typeof row.notas==='string')&&['monto_presupuestado','monto_ejecutado','monto_comprometido','monto_disponible'].every(k=>typeof row[k]==='number'&&Number.isFinite(row[k])&&Number.isSafeInteger(Math.round(row[k]*100))&&Math.abs(row[k]*100-Math.round(row[k]*100))<.00001)&&row.monto_presupuestado>0&&row.monto_ejecutado>=0&&row.monto_comprometido>=0&&Math.abs(row.monto_disponible-(row.monto_presupuestado-row.monto_ejecutado-row.monto_comprometido))<.00001&&typeof row.porcentaje_ejecutado==='number'&&Number.isFinite(row.porcentaje_ejecutado)&&Math.abs(row.porcentaje_ejecutado-row.monto_ejecutado/row.monto_presupuestado*100)<.00501;
    const key=idempotencyKey?.trim().toLowerCase();
    if(!uuid(tenantId)||!uuid(userId)||!uuid(presupuestoId)||!uuid(key)||!object(payload)||Object.keys(payload).length!==1||!validSnapshot(payload.expected_snapshot))throw new BadRequestException('Consulta la fotografía completa y conserva una clave de baja válida antes de eliminar.');
    let rpc:any;
    try{rpc=await this.supabaseService.getClient().rpc('eliminar_presupuesto_tx_570',{p_tenant_id:tenantId,p_actor_id:userId,p_presupuesto_id:presupuestoId,p_payload:payload,p_idempotency_key:key});}
    catch{throw new ServiceUnavailableException('No se pudo confirmar la baja del presupuesto. Conserva sus datos y reintenta con la misma clave.');}
    if(rpc?.error) throw errorPresupuesto(rpc.error, 'eliminar');
    const result:any=Array.isArray(rpc?.data)?(rpc.data.length===1?rpc.data[0]:null):rpc?.data,row=result?.record;
    const invalid=()=>{throw new ServiceUnavailableException('El recibo de baja está incompleto. Conserva sus datos y reintenta con la misma clave.');};
    if(!object(result)||!live(result)||result.success!==true||result.action!=='DELETE'||result.id!==presupuestoId||!uuid(result.operation_id)||typeof result.idempotent!=='boolean'||result.tenant_id!==tenantId||result.actor_id!==userId||result.idempotency_key!==key||typeof result.request_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(result.request_fingerprint)||!object(result.payload)||stable(result.payload)!==stable(payload)||!validSnapshot(row)||stable(row)!==stable(payload.expected_snapshot))invalid();
    const operation={...result};delete operation.record;
    return {...row,operation} as Presupuesto;
  }

  /**
   * Calcula el monto ejecutado de un presupuesto basado en los asientos contables
   * @param tenantId - ID del tenant
   * @param centroCostoId - ID del centro de costo
   * @param cuentaId - ID de la cuenta contable
   * @param periodoContableId - ID del período contable
   * @returns Monto ejecutado
   */
  async calcularMontoEjecutado(
    tenantId: string,
    centroCostoId: string,
    cuentaId: string,
    periodoContableId: string
  ): Promise<number> {
    // Obtener el período para saber el año y mes
    const { data: periodo, error: errorPeriodo } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .select('anio, mes')
      .eq('id', periodoContableId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (errorPeriodo) throw new ServiceUnavailableException('No se pudo consultar el período para calcular la ejecución.');
    if (!periodo) throw new NotFoundException('El período presupuestal no existe en esta empresa.');
    if (!Number.isInteger(periodo.anio) || periodo.anio < 1900 || periodo.anio > 9999 || !Number.isInteger(periodo.mes) || periodo.mes < 1 || periodo.mes > 12) {
      throw new ServiceUnavailableException('El período presupuestal está incompleto.');
    }

    // Calendar boundaries belong to the company, not to the server timezone.
    let calendar: ReturnType<typeof budgetCalendarWindow>;
    try {
      const {data:country,error:countryError}=await this.supabaseService.getClient()
        .from('empresa_config').select('pais').eq('tenant_id',tenantId).maybeSingle();
      if(countryError||!country)throw new Error('Configuración de calendario no disponible');
      calendar=budgetCalendarWindow(periodo.anio,periodo.mes,country.pais);
    } catch {
      throw new ServiceUnavailableException('No se pudo consultar el calendario completo del presupuesto.');
    }

    const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    const unavailable=()=>new ServiceUnavailableException('No se pudo consultar la ejecución presupuestal completa.');
    const cents = (value: unknown): number => {
      if (!['number','string'].includes(typeof value) || !/^-?\d+(?:\.\d{1,2})?$/.test(String(value))) throw new ServiceUnavailableException('La ejecución presupuestal contiene importes incompletos.');
      const n=Number(value), c=Math.round(n*100);
      if (!Number.isFinite(n) || !Number.isSafeInteger(c)) throw new ServiceUnavailableException('La ejecución presupuestal contiene importes inválidos.');
      return c;
    };
    let total=0,expectedCount:number|null=null,previousId='';
    const ids=new Set<string>();
    for(let offset=0;;offset+=1000) {
      let page:any;
      try {
        page=await this.supabaseService.getClient().from('detalle_asientos')
          .select('id,debe,haber,asientos_contables!inner(fecha,tenant_id)',{count:'exact'})
          .eq('cuenta_id',cuentaId).eq('centro_costo_id',centroCostoId).eq('tenant_id',tenantId)
          .eq('asientos_contables.tenant_id',tenantId).eq('asientos_contables.estado','CONFIRMADO')
          .gte('asientos_contables.fecha',calendar.desde).lt('asientos_contables.fecha',calendar.hasta)
          .order('id',{ascending:true}).range(offset,offset+999);
      } catch {throw unavailable();}
      if(!page||page.error||!Array.isArray(page.data)||!Number.isSafeInteger(page.count)||page.count<0)throw unavailable();
      if(expectedCount===null)expectedCount=page.count;
      if(page.count!==expectedCount||page.data.length!==Math.min(1000,expectedCount-offset))throw unavailable();
      for(const row of page.data) {
        if(!row||typeof row!=='object'||typeof row.id!=='string'||!uuid.test(row.id))throw unavailable();
        const id=row.id.toLowerCase();
        if(ids.has(id)||id<=previousId)throw unavailable();
        ids.add(id);previousId=id;
        total+=cents(row.debe)-cents(row.haber);
        if(!Number.isSafeInteger(total))throw new ServiceUnavailableException('La ejecución presupuestal excede la precisión admitida.');
      }
      if(ids.size===expectedCount)break;
    }
    // El normalizador vigente limita la ejecución a cero; no invierte un neto acreedor.
    return Math.max(0,total)/100;
  }

  /**
   * Obtiene todos los presupuestos de un centro de costo en un período específico
   * @param tenantId - ID del tenant
   * @param centroCostoId - ID del centro de costo
   * @param periodoContableId - ID del período contable
   * @returns Lista de presupuestos con información detallada
   */
  async obtenerPresupuestosPorCentroYPeriodo(
    tenantId: string,
    centroCostoId: string,
    periodoContableId: string
  ): Promise<any[]> {
    console.log(`💰 [Presupuestos] Obteniendo presupuestos para centro ${centroCostoId} y período ${periodoContableId}`);

    // Obtener presupuestos del centro y período
    const { data: presupuestos, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .select(`
        *,
        centros_costo:centro_costo_id (
          id,
          codigo,
          nombre,
          descripcion
        ),
        plan_cuentas:cuenta_id (
          id,
          codigo,
          nombre,
          tipo_cuenta
        ),
        periodos_contables:periodo_contable_id (
          id,
          anio,
          mes,
          estado
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('centro_costo_id', centroCostoId)
      .eq('periodo_contable_id', periodoContableId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [Presupuestos] Error obteniendo presupuestos:', error);
      throw lecturaContableFallida(error, 'los presupuestos');
    }

    if (!Array.isArray(presupuestos)) throw new ServiceUnavailableException('No se pudieron consultar los presupuestos completos.');
    if (presupuestos.length === 0) {
      console.log(`ℹ️ [Presupuestos] No se encontraron presupuestos para centro ${centroCostoId} y período ${periodoContableId}`);
      return [];
    }

    // Calcular monto ejecutado y disponible para cada presupuesto
    const presupuestosConCalculos = await Promise.all(
      presupuestos.map(async (presupuesto) => {
        const montoEjecutado = await this.calcularMontoEjecutado(
          tenantId,
          centroCostoId,
          presupuesto.cuenta_id,
          periodoContableId
        );

        const montoDisponible = presupuesto.monto_presupuestado - montoEjecutado - (presupuesto.monto_comprometido || 0);
        const porcentajeEjecutado = presupuesto.monto_presupuestado > 0
          ? (montoEjecutado / presupuesto.monto_presupuestado) * 100
          : 0;

        return {
          ...presupuesto,
          monto_ejecutado: montoEjecutado,
          monto_disponible: montoDisponible,
          porcentaje_ejecutado: porcentajeEjecutado,
          alerta: porcentajeEjecutado > 100 ? 'SOBREGIRO' : porcentajeEjecutado > 90 ? 'ADVERTENCIA' : 'NORMAL'
        };
      })
    );

    console.log(`✅ [Presupuestos] ${presupuestosConCalculos.length} presupuesto(s) encontrado(s) con cálculos actualizados`);

    return presupuestosConCalculos;
  }

  /**
   * Actualiza el monto ejecutado de un presupuesto específico basado en los asientos contables
   * @param tenantId - ID del tenant
   * @param presupuestoId - ID del presupuesto
   * @returns Presupuesto actualizado con monto ejecutado y porcentaje recalculados
   */
  async actualizarEjecucionPresupuestal(
    tenantId: string,
    presupuestoId: string
  ): Promise<Presupuesto> {
    console.log(`💰 [Presupuestos] Actualizando ejecución presupuestal para presupuesto ${presupuestoId}`);

    // Obtener el presupuesto
    const presupuesto = await this.obtenerPresupuestoPorId(tenantId, presupuestoId);

    // Calcular el monto ejecutado desde los asientos contables
    const montoEjecutado = await this.calcularMontoEjecutado(
      tenantId,
      presupuesto.centro_costo_id,
      presupuesto.cuenta_id,
      presupuesto.periodo_contable_id
    );

    // Actualizar el monto ejecutado en la base de datos
    // El porcentaje_ejecutado y monto_disponible se recalcularán automáticamente (columnas generadas)
    const { data, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .update({
        monto_ejecutado: montoEjecutado,
        updated_at: new Date().toISOString()
      })
      .eq('id', presupuestoId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('❌ [Presupuestos] Error actualizando ejecución presupuestal:', error);
      throw new Error(`Error actualizando ejecución presupuestal: ${error.message}`);
    }

    const presupuestoActualizado = data as Presupuesto;

    console.log(`✅ [Presupuestos] Ejecución presupuestal actualizada:`);
    console.log(`   Monto ejecutado: S/ ${montoEjecutado.toFixed(2)}`);
    console.log(`   Porcentaje ejecutado: ${presupuestoActualizado.porcentaje_ejecutado}%`);
    console.log(`   Monto disponible: S/ ${presupuestoActualizado.monto_disponible.toFixed(2)}`);

    // Determinar nivel de alerta
    const porcentaje = presupuestoActualizado.porcentaje_ejecutado;
    if (porcentaje > 100) {
      console.warn(`🚨 [Presupuestos] SOBREGIRO detectado: ${porcentaje}%`);
    } else if (porcentaje > 90) {
      console.warn(`⚠️ [Presupuestos] ADVERTENCIA: ${porcentaje}% ejecutado`);
    }

    return presupuestoActualizado;
  }

  /**
   * Actualiza la ejecución presupuestal de todos los presupuestos de un período
   * @param tenantId - ID del tenant
   * @param periodoContableId - ID del período contable
   * @returns Número de presupuestos actualizados
   */
  async actualizarEjecucionPresupuestalPorPeriodo(
    tenantId: string,
    periodoContableId: string
  ): Promise<{ actualizados: number; errores: number }> {
    console.log(`💰 [Presupuestos] Actualizando ejecución presupuestal para todos los presupuestos del período ${periodoContableId}`);

    // Obtener todos los presupuestos del período
    const presupuestos = await this.obtenerPresupuestos(tenantId, {
      periodo_contable_id: periodoContableId
    });

    if (presupuestos.length === 0) {
      console.log(`ℹ️ [Presupuestos] No hay presupuestos para actualizar en el período ${periodoContableId}`);
      return { actualizados: 0, errores: 0 };
    }

    let actualizados = 0;
    let errores = 0;

    // Actualizar cada presupuesto
    for (const presupuesto of presupuestos) {
      try {
        await this.actualizarEjecucionPresupuestal(tenantId, presupuesto.id);
        actualizados++;
      } catch (error) {
        console.error(`❌ [Presupuestos] Error actualizando presupuesto ${presupuesto.id}:`, error);
        errores++;
      }
    }

    console.log(`✅ [Presupuestos] Actualización masiva completada:`);
    console.log(`   Actualizados: ${actualizados}`);
    console.log(`   Errores: ${errores}`);

    return { actualizados, errores };
  }

  /**
   * Obtiene comparación de presupuesto vs real para todos los centros de costo en un período
   * @param tenantId - ID del tenant
   * @param periodoContableId - ID del período contable
   * @returns Comparación detallada de presupuesto vs real por centro de costo
   */
  async obtenerComparacionPresupuestoVsReal(
    tenantId: string,
    periodoContableId: string
  ): Promise<any> {
    console.log(`💰 [Presupuestos] Obteniendo comparación presupuesto vs real para período ${periodoContableId}`);

    // Verificar que el período existe y pertenece al tenant
    const { data: periodo, error: errorPeriodo } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .select('id, anio, mes, estado')
      .eq('id', periodoContableId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (errorPeriodo) throw lecturaContableFallida(errorPeriodo, 'el período contable');
    if (!periodo) throw new NotFoundException('Período contable no encontrado o no pertenece a su organización');

    // Obtener todos los presupuestos del período con información de centros y cuentas
    const { data: presupuestos, error: errorPresupuestos } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .select(`
        *,
        centros_costo:centro_costo_id (
          id,
          codigo,
          nombre,
          descripcion
        ),
        plan_cuentas:cuenta_id (
          id,
          codigo,
          nombre,
          tipo_cuenta
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('periodo_contable_id', periodoContableId)
      .order('centro_costo_id', { ascending: true });

    if (errorPresupuestos || !Array.isArray(presupuestos)) {
      console.error('❌ [Presupuestos] Error obteniendo presupuestos:', errorPresupuestos);
      throw lecturaContableFallida(errorPresupuestos, 'los presupuestos');
    }

    if (!Array.isArray(presupuestos)) throw new ServiceUnavailableException('No se pudieron consultar los presupuestos completos.');
    if (presupuestos.length === 0) {
      console.log(`ℹ️ [Presupuestos] No se encontraron presupuestos para el período ${periodoContableId}`);
      return {
        periodo: periodo,
        centros_costo: [],
        resumen_global: {
          total_presupuestado: 0,
          total_ejecutado: 0,
          total_comprometido: 0,
          total_disponible: 0,
          total_variacion: 0,
          porcentaje_ejecucion: 0,
          variacion_porcentaje: 0,
          total_centros: 0,
          total_cuentas: 0,
          alertas: {
            sobregiros: 0,
            advertencias: 0,
            normales: 0
          }
        }
      };
    }

    presupuestos.sort((a, b) => {
      const centroCompare = String(a.centro_costo_id || '').localeCompare(String(b.centro_costo_id || ''));
      if (centroCompare !== 0) return centroCompare;
      return String(a.plan_cuentas?.codigo || '').localeCompare(String(b.plan_cuentas?.codigo || ''));
    });

    // Calcular monto ejecutado para cada presupuesto
    const presupuestosConCalculos = await Promise.all(
      presupuestos.map(async (presupuesto) => {
        const montoEjecutado = await this.calcularMontoEjecutado(
          tenantId,
          presupuesto.centro_costo_id,
          presupuesto.cuenta_id,
          periodoContableId
        );

        const montoDisponible = presupuesto.monto_presupuestado - montoEjecutado - (presupuesto.monto_comprometido || 0);
        const porcentajeEjecutado = presupuesto.monto_presupuestado > 0
          ? (montoEjecutado / presupuesto.monto_presupuestado) * 100
          : 0;

        const variacion = montoEjecutado - presupuesto.monto_presupuestado;
        const variacionPorcentaje = presupuesto.monto_presupuestado > 0
          ? (variacion / presupuesto.monto_presupuestado) * 100
          : 0;

        return {
          ...presupuesto,
          monto_ejecutado: montoEjecutado,
          monto_disponible: montoDisponible,
          porcentaje_ejecutado: porcentajeEjecutado,
          variacion: variacion,
          variacion_porcentaje: variacionPorcentaje,
          alerta: porcentajeEjecutado > 100 ? 'SOBREGIRO' : porcentajeEjecutado > 90 ? 'ADVERTENCIA' : 'NORMAL'
        };
      })
    );

    // Agrupar por centro de costo
    const presupuestosPorCentro = presupuestosConCalculos.reduce((acc, presupuesto) => {
      const centroCostoId = presupuesto.centro_costo_id;
      if (!acc[centroCostoId]) {
        acc[centroCostoId] = {
          centro_costo: presupuesto.centros_costo,
          cuentas: [],
          totales: {
            presupuestado: 0,
            ejecutado: 0,
            comprometido: 0,
            disponible: 0,
            variacion: 0
          }
        };
      }

      acc[centroCostoId].cuentas.push({
        cuenta: presupuesto.plan_cuentas,
        monto_presupuestado: presupuesto.monto_presupuestado,
        monto_ejecutado: presupuesto.monto_ejecutado,
        monto_comprometido: presupuesto.monto_comprometido || 0,
        monto_disponible: presupuesto.monto_disponible,
        porcentaje_ejecutado: presupuesto.porcentaje_ejecutado,
        variacion: presupuesto.variacion,
        variacion_porcentaje: presupuesto.variacion_porcentaje,
        alerta: presupuesto.alerta,
        estado: presupuesto.estado,
        notas: presupuesto.notas
      });

      // Acumular totales por centro
      acc[centroCostoId].totales.presupuestado += presupuesto.monto_presupuestado;
      acc[centroCostoId].totales.ejecutado += presupuesto.monto_ejecutado;
      acc[centroCostoId].totales.comprometido += presupuesto.monto_comprometido || 0;
      acc[centroCostoId].totales.disponible += presupuesto.monto_disponible;
      acc[centroCostoId].totales.variacion += presupuesto.variacion;

      return acc;
    }, {} as Record<string, any>);

    // Calcular porcentajes de ejecución por centro
    const centrosCosto = Object.values(presupuestosPorCentro).map((centro: any) => {
      const porcentajeEjecucion = centro.totales.presupuestado > 0
        ? (centro.totales.ejecutado / centro.totales.presupuestado) * 100
        : 0;

      const variacionPorcentaje = centro.totales.presupuestado > 0
        ? (centro.totales.variacion / centro.totales.presupuestado) * 100
        : 0;

      return {
        ...centro,
        totales: {
          ...centro.totales,
          porcentaje_ejecucion: porcentajeEjecucion,
          variacion_porcentaje: variacionPorcentaje,
          alerta: porcentajeEjecucion > 100 ? 'SOBREGIRO' : porcentajeEjecucion > 90 ? 'ADVERTENCIA' : 'NORMAL'
        }
      };
    });

    // Calcular resumen global
    const totalPresupuestado = centrosCosto.reduce((sum, c) => sum + c.totales.presupuestado, 0);
    const totalEjecutado = centrosCosto.reduce((sum, c) => sum + c.totales.ejecutado, 0);
    const totalComprometido = centrosCosto.reduce((sum, c) => sum + c.totales.comprometido, 0);
    const totalDisponible = centrosCosto.reduce((sum, c) => sum + c.totales.disponible, 0);
    const totalVariacion = centrosCosto.reduce((sum, c) => sum + c.totales.variacion, 0);

    const porcentajeEjecucionGlobal = totalPresupuestado > 0
      ? (totalEjecutado / totalPresupuestado) * 100
      : 0;

    const variacionPorcentajeGlobal = totalPresupuestado > 0
      ? (totalVariacion / totalPresupuestado) * 100
      : 0;

    const totalCuentas = presupuestosConCalculos.length;
    const totalCentros = centrosCosto.length;

    // Contar alertas
    const alertas = {
      sobregiros: presupuestosConCalculos.filter(p => p.alerta === 'SOBREGIRO').length,
      advertencias: presupuestosConCalculos.filter(p => p.alerta === 'ADVERTENCIA').length,
      normales: presupuestosConCalculos.filter(p => p.alerta === 'NORMAL').length
    };

    console.log(`✅ [Presupuestos] Comparación generada: ${totalCentros} centros, ${totalCuentas} cuentas`);
    console.log(`   Total presupuestado: S/ ${totalPresupuestado.toFixed(2)}`);
    console.log(`   Total ejecutado: S/ ${totalEjecutado.toFixed(2)} (${porcentajeEjecucionGlobal.toFixed(2)}%)`);
    console.log(`   Alertas: ${alertas.sobregiros} sobregiros, ${alertas.advertencias} advertencias`);

    return {
      periodo: {
        id: periodo.id,
        anio: periodo.anio,
        mes: periodo.mes,
        estado: periodo.estado,
        descripcion: `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`
      },
      centros_costo: centrosCosto,
      resumen_global: {
        total_presupuestado: totalPresupuestado,
        total_ejecutado: totalEjecutado,
        total_comprometido: totalComprometido,
        total_disponible: totalDisponible,
        total_variacion: totalVariacion,
        porcentaje_ejecucion: porcentajeEjecucionGlobal,
        variacion_porcentaje: variacionPorcentajeGlobal,
        total_centros: totalCentros,
        total_cuentas: totalCuentas,
        alertas: alertas
      }
    };
  }

  /**
   * Obtiene todas las alertas de sobregiro presupuestal activas
   * @param tenantId - ID del tenant
   * @param periodoContableId - ID del período contable (opcional, si no se proporciona obtiene del período actual)
   * @returns Lista de alertas de presupuestos con advertencias o sobregiros
   */
  private async resolverPeriodoAlertas(tenantId: string, periodoId?: string): Promise<any | null> {
    if (periodoId !== undefined && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(periodoId)) {
      throw new BadRequestException('Selecciona un período válido.');
    }
    let query = this.supabaseService.getClient().from('periodos_contables')
      .select('id, tenant_id, anio, mes, estado').eq('tenant_id', tenantId);
    if (periodoId) query = query.eq('id', periodoId);
    else query = query.eq('estado', 'ABIERTO').order('anio', { ascending: false }).order('mes', { ascending: false }).limit(1);
    const { data, error } = await query.maybeSingle();
    if (error) throw new ServiceUnavailableException('No se pudo consultar el período de las alertas.');
    if (!data) {
      if (periodoId) throw new NotFoundException('El período consultado no existe en esta empresa.');
      return null;
    }
    if (data.tenant_id !== tenantId || typeof data.id !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(data.id)
      || (periodoId && data.id !== periodoId) || !Number.isInteger(data.anio) || data.anio < 1900 || data.anio > 9999
      || !Number.isInteger(data.mes) || data.mes < 1 || data.mes > 12 || !['ABIERTO', 'CERRADO', 'BLOQUEADO'].includes(data.estado)
      || (!periodoId && data.estado !== 'ABIERTO')) {
      throw new ServiceUnavailableException('No se pudo consultar el período completo de las alertas.');
    }
    return { id: data.id, anio: data.anio, mes: data.mes, estado: data.estado };
  }

  async obtenerAlertasSobregiro(tenantId: string, periodoContableId?: string): Promise<any[]> {
    return (await this.leerAlertasConAlcance(tenantId, periodoContableId)).alertas;
  }

  private async leerAlertasConAlcance(tenantId: string, periodoContableId?: string): Promise<{ alertas: any[]; consulta: any }> {
    const periodo = await this.resolverPeriodoAlertas(tenantId, periodoContableId);
    const consulta = { tenant_id: tenantId, seleccion: periodoContableId ? 'EXPLICITO' : 'ULTIMO_ABIERTO', periodo, presupuestos_evaluados: 0 };
    if (!periodo) return { alertas: [], consulta };
    const periodoId = periodo.id;

    // Obtener todos los presupuestos activos del período
    const { data: presupuestos, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .select(`
        *,
        centros_costo:centro_costo_id (
          id,
          codigo,
          nombre,
          descripcion
        ),
        plan_cuentas:cuenta_id (
          id,
          codigo,
          nombre,
          tipo_cuenta
        ),
        periodos_contables:periodo_contable_id (
          id,
          anio,
          mes,
          estado
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('periodo_contable_id', periodoId)
      .eq('estado', EstadoPresupuesto.ACTIVO)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [Presupuestos] Error obteniendo presupuestos:', error);
      throw new ServiceUnavailableException('No se pudieron consultar los presupuestos de las alertas.');
    }

    if (!Array.isArray(presupuestos)) throw new ServiceUnavailableException('No se pudieron consultar los presupuestos completos.');
    if (presupuestos.length === 0) {
      console.log(`ℹ️ [Presupuestos] No hay presupuestos activos en el período`);
      return { alertas: [], consulta };
    }

    const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
      && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < .00001;
    const ids = new Set<string>();
    for (const row of presupuestos) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || row.tenant_id !== tenantId || row.periodo_contable_id !== periodoId
        || row.estado !== EstadoPresupuesto.ACTIVO || !money(row.monto_presupuestado) || row.monto_presupuestado <= 0
        || !money(row.monto_comprometido) || row.monto_comprometido < 0 || !row.centros_costo || !row.plan_cuentas || !row.periodos_contables
        || row.centros_costo.id !== row.centro_costo_id || row.plan_cuentas.id !== row.cuenta_id || row.periodos_contables.id !== periodoId
        || row.periodos_contables.anio !== periodo.anio || row.periodos_contables.mes !== periodo.mes
        || ['codigo', 'nombre'].some(key => typeof row.centros_costo[key] !== 'string' || !row.centros_costo[key].trim()
          || typeof row.plan_cuentas[key] !== 'string' || !row.plan_cuentas[key].trim())) {
        throw new ServiceUnavailableException('No se pudieron consultar los presupuestos completos de las alertas.');
      }
      ids.add(row.id);
    }
    consulta.presupuestos_evaluados = presupuestos.length;

    // Calcular monto ejecutado y determinar alertas
    const alertas: any[] = [];

    for (const presupuesto of presupuestos) {
      const montoEjecutado = await this.calcularMontoEjecutado(
        tenantId,
        presupuesto.centro_costo_id,
        presupuesto.cuenta_id,
        periodoId
      );

      const montoDisponible = presupuesto.monto_presupuestado - montoEjecutado - presupuesto.monto_comprometido;
      const porcentajeEjecutado = presupuesto.monto_presupuestado > 0
        ? (montoEjecutado / presupuesto.monto_presupuestado) * 100
        : 0;

      // Solo incluir presupuestos con advertencia (>90%) o sobregiro (>100%)
      if (porcentajeEjecutado > 90) {
        const nivelAlerta = porcentajeEjecutado > 100 ? 'SOBREGIRO' : 'ADVERTENCIA';
        const severidad = porcentajeEjecutado > 100 ? 'CRITICO' : 'ALTO';

        alertas.push({
          presupuesto_id: presupuesto.id,
          nivel_alerta: nivelAlerta,
          severidad: severidad,
          porcentaje_ejecutado: Math.round(porcentajeEjecutado * 100) / 100,
          monto_presupuestado: presupuesto.monto_presupuestado,
          monto_ejecutado: montoEjecutado,
          monto_comprometido: presupuesto.monto_comprometido,
          monto_disponible: montoDisponible,
          excedente: montoEjecutado - presupuesto.monto_presupuestado,
          centro_costo: {
            id: presupuesto.centros_costo.id,
            codigo: presupuesto.centros_costo.codigo,
            nombre: presupuesto.centros_costo.nombre
          },
          cuenta: {
            id: presupuesto.plan_cuentas.id,
            codigo: presupuesto.plan_cuentas.codigo,
            nombre: presupuesto.plan_cuentas.nombre
          },
          periodo: {
            id: presupuesto.periodos_contables.id,
            anio: presupuesto.periodos_contables.anio,
            mes: presupuesto.periodos_contables.mes,
            descripcion: `${presupuesto.periodos_contables.anio}-${String(presupuesto.periodos_contables.mes).padStart(2, '0')}`
          },
          mensaje: this.generarMensajeAlerta(
            nivelAlerta,
            presupuesto.centros_costo.nombre,
            presupuesto.plan_cuentas.nombre,
            porcentajeEjecutado,
            montoEjecutado,
            presupuesto.monto_presupuestado
          ),
          fecha_deteccion: new Date().toISOString()
        });
      }
    }

    // Ordenar por severidad (CRITICO primero) y luego por porcentaje ejecutado
    alertas.sort((a, b) => {
      if (a.severidad === 'CRITICO' && b.severidad !== 'CRITICO') return -1;
      if (a.severidad !== 'CRITICO' && b.severidad === 'CRITICO') return 1;
      return b.porcentaje_ejecutado - a.porcentaje_ejecutado;
    });

    console.log(`✅ [Presupuestos] ${alertas.length} alerta(s) detectada(s):`);
    console.log(`   Sobregiros (>100%): ${alertas.filter(a => a.nivel_alerta === 'SOBREGIRO').length}`);
    console.log(`   Advertencias (>90%): ${alertas.filter(a => a.nivel_alerta === 'ADVERTENCIA').length}`);

    return { alertas, consulta };
  }

  /**
   * Genera un mensaje descriptivo para una alerta de presupuesto
   * @param nivelAlerta - Nivel de la alerta (SOBREGIRO o ADVERTENCIA)
   * @param centroCosto - Nombre del centro de costo
   * @param cuenta - Nombre de la cuenta
   * @param porcentaje - Porcentaje ejecutado
   * @param montoEjecutado - Monto ejecutado
   * @param montoPresupuestado - Monto presupuestado
   * @returns Mensaje descriptivo de la alerta
   */
  private generarMensajeAlerta(
    nivelAlerta: string,
    centroCosto: string,
    cuenta: string,
    porcentaje: number,
    montoEjecutado: number,
    montoPresupuestado: number
  ): string {
    const porcentajeRedondeado = Math.round(porcentaje * 100) / 100;

    if (nivelAlerta === 'SOBREGIRO') {
      const excedente = montoEjecutado - montoPresupuestado;
      return `🚨 SOBREGIRO: El presupuesto del centro de costo "${centroCosto}" para la cuenta "${cuenta}" está al ${porcentajeRedondeado}% de ejecución y excede el presupuesto en ${(porcentaje - 100).toFixed(2)}% (S/ ${excedente.toFixed(2)} sobre el presupuesto de S/ ${montoPresupuestado.toFixed(2)})`;
    } else {
      const disponible = montoPresupuestado - montoEjecutado;
      return `⚠️ ADVERTENCIA: El presupuesto del centro de costo "${centroCosto}" para la cuenta "${cuenta}" está al ${porcentajeRedondeado}% de ejecución (quedan S/ ${disponible.toFixed(2)} de S/ ${montoPresupuestado.toFixed(2)})`;
    }
  }

  /**
   * Obtiene un resumen de alertas agrupadas por nivel de severidad
   * @param tenantId - ID del tenant
   * @param periodoContableId - ID del período contable (opcional)
   * @returns Resumen de alertas por severidad
   */
  async obtenerResumenAlertas(
    tenantId: string,
    periodoContableId?: string
  ): Promise<any> {
    console.log(`📊 [Presupuestos] Obteniendo resumen de alertas para tenant ${tenantId}`);

    const { alertas, consulta } = await this.leerAlertasConAlcance(tenantId, periodoContableId);

    const sobregiros = alertas.filter(a => a.nivel_alerta === 'SOBREGIRO');
    const advertencias = alertas.filter(a => a.nivel_alerta === 'ADVERTENCIA');

    const totalExcedente = sobregiros.reduce((sum, a) => sum + Math.max(0, a.excedente), 0);
    const totalEnRiesgo = advertencias.reduce((sum, a) => sum + a.monto_presupuestado, 0);

    const resumen = {
      consulta,
      total_alertas: alertas.length,
      sobregiros: {
        cantidad: sobregiros.length,
        total_excedente: totalExcedente,
        alertas: sobregiros
      },
      advertencias: {
        cantidad: advertencias.length,
        total_en_riesgo: totalEnRiesgo,
        alertas: advertencias
      },
      fecha_generacion: new Date().toISOString()
    };

    console.log(`✅ [Presupuestos] Resumen generado:`);
    console.log(`   Total alertas: ${resumen.total_alertas}`);
    console.log(`   Sobregiros: ${resumen.sobregiros.cantidad} (S/ ${totalExcedente.toFixed(2)} excedidos)`);
    console.log(`   Advertencias: ${resumen.advertencias.cantidad} (S/ ${totalEnRiesgo.toFixed(2)} en riesgo)`);

    return resumen;
  }
}
