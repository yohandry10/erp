import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { getActiveCountryByCode } from '../../paises/initial-country';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PeriodosService } from './periodos.service';
import { TiposCambioService } from './tipos-cambio.service';
import {
  LadoTipoCambio,
  PosicionRevaluacionDto,
  RevaluacionResponseDto
} from '@erp-suite/dtos';
import { buildDeterministicUuid } from '../../../common/util/deterministic-uuid.util';
import { confirmRevaluationRegistrationReceipt } from './revaluation-registration-receipt';


const ESTADOS_NO_REVALUABLES = new Set(['ANULADA', 'ANULADO', 'PAGADA', 'PAGADO']);
const civilDay=(v:unknown):v is string=>{
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const [y,m,d]=v.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
};
const cents=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isSafeInteger(Math.round(v*100))&&Math.abs(v-Math.round(v*100)/100)<1e-9;
const rate=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<1e10;

interface PosicionCruda {
  tipo: 'CXC' | 'CXP';
  documento_id: string;
  referencia?: string;
  moneda: string;
  pendiente: number;
  tipo_cambio_origen: number | null;
  estado?: string;
}

@Injectable()
export class RevaluacionService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly periodosService: PeriodosService,
    private readonly tiposCambioService: TiposCambioService
  ) {}

  private round2(valor: Decimal.Value): number {
    const n=new Decimal(valor).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).toNumber();
    if(!Number.isFinite(n)||!Number.isSafeInteger(Math.round(n*100)))throw new ServiceUnavailableException('La valoración está fuera de rango.');
    return n;
  }

  /**
   * Calcula la diferencia de cambio no realizada de las posiciones monetarias
   * en moneda extranjera a una fecha de corte, sin escribir nada.
   *
   * Solo entran cuentas por cobrar y por pagar. Las cuentas bancarias en moneda
   * extranjera quedan fuera a propósito: revaluarlas exige conocer el valor en
   * moneda local con el que están contabilizadas, y eso no es reconstruible
   * mientras los asientos históricos no lleven la moneda en la línea.
   */
  async simular(tenantId: string, fecha: string): Promise<RevaluacionResponseDto> {
    return (await this.simularCompleta(tenantId,fecha)).data;
  }

  async simularCompleta(tenantId: string,fecha: string) {
    if(!civilDay(fecha))throw new BadRequestException('El corte debe ser una fecha civil válida.');
    const {data:config,error}=(await this.supabaseService.getClient().from('empresa_config').select('tenant_id,pais').eq('tenant_id',tenantId).maybeSingle())||{};
    const profile=getActiveCountryByCode(config?.pais);
    if(error||config?.tenant_id!==tenantId||!profile)throw new ServiceUnavailableException('No se pudo confirmar el país y la moneda de la empresa.');
    const monedaLocal=profile.moneda;
    const source=await this.obtenerPosiciones(tenantId,monedaLocal,fecha),crudas=source.posiciones;

    const posiciones: PosicionRevaluacionDto[] = [];
    const excluidas: Array<{ tipo: string; documento_id: string; motivo: string }> = [];

    // Una cotización por moneda: el mismo par se consulta una sola vez aunque
    // haya cientos de documentos.
    const cotizaciones = new Map<string, { compra: number|null; venta: number|null } | null>();
    let sinDiferencia=0;

    for (const cruda of crudas) {
      if (!cruda.tipo_cambio_origen || cruda.tipo_cambio_origen <= 0) {
        excluidas.push({
          tipo: cruda.tipo,
          documento_id: cruda.documento_id,
          motivo:
            'El documento no registra el tipo de cambio con el que se contabilizó, ' +
            'por lo que su diferencia de cambio no es calculable.'
        });
        continue;
      }

      if (!cotizaciones.has(cruda.moneda)) {
        const vigente = await this.cotizacionCompleta(tenantId,cruda.moneda,monedaLocal,fecha);
        cotizaciones.set(
          cruda.moneda,
          vigente ? { compra: vigente.compra, venta: vigente.venta } : null
        );
      }

      const cotizacion = cotizaciones.get(cruda.moneda);
      if (!cotizacion) {
        excluidas.push({
          tipo: cruda.tipo,
          documento_id: cruda.documento_id,
          motivo: `No hay tipo de cambio ${cruda.moneda}/${monedaLocal} vigente al ${fecha}.`
        });
        continue;
      }

      // Activos al tipo de cambio compra, pasivos al de venta.
      const lado = cruda.tipo === 'CXC' ? LadoTipoCambio.COMPRA : LadoTipoCambio.VENTA;
      const tipoCambioCierre =
        lado === LadoTipoCambio.COMPRA ? cotizacion.compra : cotizacion.venta;
      if(tipoCambioCierre===null){excluidas.push({tipo:cruda.tipo,documento_id:cruda.documento_id,motivo:`No hay tipo de cambio ${cruda.moneda}/${monedaLocal} vigente al ${fecha}.`});continue;}

      const valorContabilizado = this.round2(new Decimal(cruda.pendiente).times(cruda.tipo_cambio_origen));
      const valorACierre = this.round2(new Decimal(cruda.pendiente).times(tipoCambioCierre));
      const variacion = this.round2(new Decimal(valorACierre).minus(valorContabilizado));

      // En un activo, que valga más es ganancia. En un pasivo, que valga más es
      // pérdida: se debe más en moneda local por la misma deuda.
      const diferencia = cruda.tipo === 'CXC' ? variacion : this.round2(-variacion);

      if (diferencia === 0) {
        sinDiferencia++;
        continue;
      }

      posiciones.push({
        tipo: cruda.tipo,
        documento_id: cruda.documento_id,
        referencia: cruda.referencia,
        moneda: cruda.moneda,
        saldo_moneda_origen: cruda.pendiente,
        tipo_cambio_origen: cruda.tipo_cambio_origen,
        tipo_cambio_cierre: tipoCambioCierre,
        valor_contabilizado: valorContabilizado,
        valor_a_cierre: valorACierre,
        diferencia
      });
    }

    const totalGanancia = this.round2(
      posiciones.filter(p => p.diferencia > 0).reduce((sum, p) => sum.plus(p.diferencia),new Decimal(0))
    );
    const totalPerdida = this.round2(
      posiciones.filter(p => p.diferencia < 0).reduce((sum, p) => sum.minus(p.diferencia),new Decimal(0))
    );

    const data:RevaluacionResponseDto={
      fecha,
      moneda_local: monedaLocal,
      posiciones,
      total_ganancia: totalGanancia,
      total_perdida: totalPerdida,
      diferencia_neta: this.round2(new Decimal(totalGanancia).minus(totalPerdida)),
      excluidas: excluidas.length > 0 ? excluidas : undefined
    };
    return {data,fuentes:{...source.fuentes,completas:true,evaluadas_total:crudas.length,sin_diferencia_total:sinDiferencia},posiciones_total:posiciones.length,excluidas_total:excluidas.length};
  }

  /** La RPC valida el snapshot, la intención y el libro en una transacción. */
  async ejecutar(
    tenantId: string,
    userId: string,
    fecha: string,
    concepto?: string,
    simulacion?: RevaluacionResponseDto,
    idempotencyKey?: string
  ): Promise<RevaluacionResponseDto> {
    const revisada = simulacion ?? await this.simular(tenantId, fecha);
    if (revisada.fecha !== fecha || !Array.isArray(revisada.posiciones)) {
      throw new BadRequestException('La simulación revisada no corresponde a la fecha de corte.');
    }
    if (revisada.posiciones.length === 0) {
      throw new BadRequestException(`No hay diferencia de cambio que registrar al ${fecha}.`);
    }
    if (!simulacion) await this.periodosService.validarPeriodoAbierto(tenantId, new Date(fecha));
    const { data, error } = await this.supabaseService.getClient().rpc('registrar_revaluacion_tx_570', {
      p_tenant_id: tenantId, p_actor_id: userId, p_fecha: fecha,
      p_simulacion: revisada, p_concepto: concepto ?? null,
      p_idempotency_key: idempotencyKey ?? buildDeterministicUuid(`revaluacion:${tenantId}:${fecha}`)
    });
    if (error) throw new BadRequestException(error.message || 'No se pudo registrar la revaluación.');
    if (!data?.asiento_id || data.fecha !== fecha) throw new Error('Respuesta incompleta del registro de revaluación.');
    return data as RevaluacionResponseDto;
  }

  /** Canonical receipt reads follow the existing atomic writer; unknown reads never confirm success. */
  async ejecutarConRecibo(tenantId: string, userId: string, fecha: string, concepto?: string, simulacion?: RevaluacionResponseDto, idempotencyKey?: string) {
    const revisada = simulacion ?? await this.simular(tenantId, fecha);
    const key = idempotencyKey ?? buildDeterministicUuid(`revaluacion:${tenantId}:${fecha}`);
    if (!simulacion) await this.periodosService.validarPeriodoAbierto(tenantId, new Date(fecha));
    const result = await this.ejecutar(tenantId, userId, fecha, concepto, revisada, key);
    try {
      const client = this.supabaseService.getClient();
      const ledger = await client.from('financial_master_operations').select('*', { count: 'exact' }).eq('tenant_id', tenantId).eq('operation_type', 'FX_REVALUATION').eq('idempotency_key', key).maybeSingle();
      const journal = await client.from('asientos_contables').select('id,tenant_id,numero_asiento,fecha,estado,origen,tipo_asiento,created_by,confirmado_por,confirmado_en,concepto,metadata', { count: 'exact' }).eq('tenant_id', tenantId).eq('id', result.asiento_id).maybeSingle();
      if (ledger.error || journal.error || ledger.count !== 1 || journal.count !== 1) throw new Error('Unknown canonical receipt sources');
      return confirmRevaluationRegistrationReceipt({ tenant: tenantId, actor: userId, key, fecha, simulacion: revisada, concepto }, result, ledger.data, journal.data);
    } catch {
      throw new ServiceUnavailableException('No se pudo confirmar el recibo completo de revaluación. Conserve la intención y reintente con la misma clave.');
    }
  }

  /**
   * Diferencia de cambio realizada al liquidar un documento en moneda
   * extranjera.
   *
   * Es un cálculo puro para que el flujo de pagos pueda incorporarlo dentro de
   * su propia transacción sin depender de este servicio para nada más.
   */
  static calcularDiferenciaRealizada(params: {
    tipo: 'CXC' | 'CXP';
    importeMonedaOrigen: number;
    tipoCambioOrigen: number;
    tipoCambioLiquidacion: number;
  }): number {
    const { tipo, importeMonedaOrigen, tipoCambioOrigen, tipoCambioLiquidacion } = params;

    if (tipoCambioOrigen <= 0 || tipoCambioLiquidacion <= 0) {
      throw new BadRequestException('Los tipos de cambio deben ser mayores a cero.');
    }

    const variacion = importeMonedaOrigen * (tipoCambioLiquidacion - tipoCambioOrigen);
    const diferencia = tipo === 'CXC' ? variacion : -variacion;

    return Math.round((diferencia + Number.EPSILON) * 100) / 100;
  }

  /** Posiciones monetarias abiertas en moneda distinta a la local. */
  private async obtenerPosiciones(
    tenantId: string,
    monedaLocal: string,
    fecha: string
  ) {
    const [cxc,cxp]=await Promise.all([
      this.readRows('cuentas_por_cobrar','id,tenant_id,fecha_emision,moneda,estado,monto_pendiente,saldo_pendiente,saldo,tipo_cambio_origen,serie,numero',tenantId),
      this.readRows('cuentas_por_pagar','id,tenant_id,fecha_emision,moneda,estado,saldo,saldo_pendiente,tipo_cambio_origen,numero_documento',tenantId),
    ]);
    const posiciones:PosicionCruda[]=[];
    for(const [tipo,rows] of [['CXC',cxc],['CXP',cxp]] as const)for(const fila of rows){
      if(typeof fila.estado!=='string'||!fila.estado||typeof fila.moneda!=='string'||!/^[A-Za-z]{3}$/.test(fila.moneda))throw new ServiceUnavailableException('Una posición no tiene estado o moneda confirmados.');
      const moneda=fila.moneda.toUpperCase();
      if(moneda===monedaLocal||ESTADOS_NO_REVALUABLES.has(fila.estado.toUpperCase()))continue;
      const pendiente=tipo==='CXC'?fila.monto_pendiente??fila.saldo_pendiente??fila.saldo:fila.saldo??fila.saldo_pendiente;
      if(!cents(pendiente))throw new ServiceUnavailableException('El saldo de una posición es desconocido o está fuera de rango.');
      if(pendiente===0)continue;
      if(!civilDay(fila.fecha_emision))throw new ServiceUnavailableException('La fecha de una posición abierta es desconocida.');
      if(fila.fecha_emision>fecha)continue;
      const origen=fila.tipo_cambio_origen;
      if(origen!==null&&origen!==undefined&&(!rate(origen)))throw new ServiceUnavailableException('El tipo de cambio de origen es incoherente.');
      posiciones.push({tipo,documento_id:fila.id,referencia:tipo==='CXC'?[fila.serie,fila.numero].filter(Boolean).join('-')||undefined:fila.numero_documento||undefined,moneda,pendiente,tipo_cambio_origen:origen??null,estado:fila.estado});
    }
    return {posiciones,fuentes:{cxc_total:cxc.length,cxp_total:cxp.length}};
  }

  private async readRows(table:string,selection:string,tenantId:string) {
    const rows:any[]=[];const ids=new Set<string>();let total:number|undefined;
    for(let offset=0;;offset+=1000){
      const query:any=this.supabaseService.getClient().from(table).select(selection,{count:'exact'}).eq('tenant_id',tenantId).order('id',{ascending:true}).range(offset,offset+999);
      const {data,error,count}=(await query)||{};
      if(error||!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||(total!==undefined&&count!==total)||data.length!==Math.min(1000,Math.max(0,count-offset)))throw new ServiceUnavailableException('No se pudieron completar las posiciones monetarias.');
      total=count;
      for(const row of data){if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id)||row.tenant_id!==tenantId)throw new ServiceUnavailableException('Las posiciones son incompletas, repetidas o ajenas.');ids.add(row.id);rows.push(row)}
      if(rows.length===total)return rows;
    }
  }

  private async cotizacionCompleta(tenantId:string,origen:string,destino:string,fecha:string){
    const {data,error,count}=(await this.supabaseService.getClient().from('tipos_cambio').select('id,tenant_id,moneda_origen,moneda_destino,fecha,compra,venta,activo,estado',{count:'exact'}).eq('tenant_id',tenantId).eq('moneda_origen',origen).eq('moneda_destino',destino).eq('activo',true).eq('estado','ACTIVO').lte('fecha',fecha).order('fecha',{ascending:false}).order('id',{ascending:true}).range(0,0))||{};
    if(error||!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length!==Math.min(1,count))throw new ServiceUnavailableException('No se pudo confirmar la cotización vigente.');
    if(!data.length)return null;
    const r=data[0];if(!r||typeof r.id!=='string'||!r.id||r.tenant_id!==tenantId||r.moneda_origen!==origen||r.moneda_destino!==destino||!civilDay(r.fecha)||r.fecha>fecha||r.activo!==true||r.estado!=='ACTIVO'||![r.compra,r.venta].every(v=>v===null||rate(v)))throw new ServiceUnavailableException('La cotización vigente es incompleta o ajena.');
    return r;
  }
}
