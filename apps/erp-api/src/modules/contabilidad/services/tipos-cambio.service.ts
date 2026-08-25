import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import {
  CreateTipoCambioDto,
  ListarTiposCambioQueryDto,
  TipoCambioResponseDto,
  LadoTipoCambio
} from '@erp-suite/dtos';
import { getActiveCountryByCode, ACTIVE_COUNTRY_PROFILES } from '../../paises/initial-country';
import { createHash } from 'crypto';

@Injectable()
export class TiposCambioService {
  private readonly logger = new Logger(TiposCambioService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Moneda local del tenant, derivada de su país.
   *
   * No se introduce una columna de moneda propia: el país ya determina la
   * moneda en `paises/initial-country.ts` y duplicar ese dato abriría la puerta
   * a que ambos se contradigan.
   */
  async obtenerMonedaLocal(tenantId: string): Promise<string> {
    const { data } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('pais')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const perfil = getActiveCountryByCode(data?.pais);
    return perfil?.moneda ?? ACTIVE_COUNTRY_PROFILES.PE.moneda;
  }

  async listar(
    tenantId: string,
    filtros: ListarTiposCambioQueryDto
  ): Promise<{ data: TipoCambioResponseDto[]; total: number; page: number; limit: number }> {
    const page = filtros.page || 1;
    const limit = filtros.limit || 50;
    const offset = (page - 1) * limit;

    let query = this.supabaseService
      .getClient()
      .from('tipos_cambio')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (filtros.moneda_origen) {
      query = query.eq('moneda_origen', filtros.moneda_origen.toUpperCase());
    }
    if (filtros.moneda_destino) {
      query = query.eq('moneda_destino', filtros.moneda_destino.toUpperCase());
    }
    if (filtros.fecha_desde) {
      query = query.gte('fecha', filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      query = query.lte('fecha', filtros.fecha_hasta);
    }

    const { data, error, count } = await query
      .order('fecha', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Error listando tipos de cambio: ${error.message}`);
    }

    return {
      data: (data || []) as TipoCambioResponseDto[],
      total: count || 0,
      page,
      limit
    };
  }

  /**
   * Registra o actualiza la cotización de un par para una fecha.
   *
   * Se resuelve como upsert deliberadamente: volver a cargar el tipo de cambio
   * de un día es una corrección habitual, y obligar al contador a borrar antes
   * de recargar solo añadiría un paso donde puede equivocarse.
   */
  async registrar(
    tenantId: string,
    userId: string,
    dto:CreateTipoCambioDto,
    idempotencyKey?:string,
  ): Promise<TipoCambioResponseDto> {
    const monedaOrigenValidada=dto.moneda_origen.toUpperCase();
    const monedaDestinoValidada=dto.moneda_destino.toUpperCase();
    if(monedaOrigenValidada===monedaDestinoValidada) throw new BadRequestException('La moneda de origen y la de destino no pueden ser la misma.');
    if(dto.compra===undefined&&dto.venta===undefined) throw new BadRequestException('Debe informar al menos una cotización: compra o venta.');
    const key=idempotencyKey?.trim()||`fx-upsert:${createHash('sha256').update(JSON.stringify({tenantId,userId,dto})).digest('hex')}`;
    const {data:rpcData,error:rpcError}=await this.supabaseService.getClient().rpc('gestionar_maestro_contable_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_entity:'FX',p_action:'CREATE',p_record_id:null,p_payload:dto,p_idempotency_key:key,
    });
    if(rpcError) throw new BadRequestException(rpcError.message||'No se pudo registrar el tipo de cambio');
    const result:any=Array.isArray(rpcData)?rpcData[0]:rpcData; return result.record as TipoCambioResponseDto;
  }

  async eliminar(tenantId:string,id:string,userId:string,idempotencyKey?:string):Promise<void> {
    if(!userId) throw new BadRequestException('Se requiere un usuario autenticado');
    const key=idempotencyKey?.trim()||`fx-deactivate:${createHash('sha256').update(JSON.stringify({tenantId,id,userId})).digest('hex')}`;
    const {error:rpcError}=await this.supabaseService.getClient().rpc('gestionar_maestro_contable_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_entity:'FX',p_action:'DEACTIVATE',p_record_id:id,p_payload:{},p_idempotency_key:key,
    });
    if(rpcError) throw new BadRequestException(rpcError.message||'No se pudo desactivar el tipo de cambio'); return;
  }

  /**
   * Cotización vigente de un par a una fecha.
   *
   * Si no hay cotización para esa fecha exacta se devuelve la última anterior.
   * Esto no es una comodidad: SUNAT no publica los fines de semana ni feriados,
   * y la regla contable es precisamente usar la última cotización publicada.
   * El resultado indica si hubo que retroceder, para que quien valúa lo sepa.
   */
  async obtenerVigente(
    tenantId: string,
    monedaOrigen: string,
    monedaDestino: string,
    fecha: string
  ): Promise<TipoCambioResponseDto | null> {
    const origen = monedaOrigen.toUpperCase();
    const destino = monedaDestino.toUpperCase();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tipos_cambio')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('moneda_origen', origen)
      .eq('moneda_destino', destino)
      .lte('fecha', fecha)
      .order('fecha', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Error obteniendo tipo de cambio vigente: ${error.message}`);
    }

    const cotizacion = (data || [])[0];
    if (!cotizacion) {
      return null;
    }

    return {
      ...cotizacion,
      vigente_desde_fecha_anterior: String(cotizacion.fecha).slice(0, 10) !== fecha.slice(0, 10)
    } as TipoCambioResponseDto;
  }

  /**
   * Igual que `obtenerVigente`, pero falla si no hay cotización. Se usa donde
   * valuar con un tipo de cambio inventado sería peor que no valuar.
   */
  async exigirVigente(
    tenantId: string,
    monedaOrigen: string,
    monedaDestino: string,
    fecha: string
  ): Promise<TipoCambioResponseDto> {
    const cotizacion = await this.obtenerVigente(tenantId, monedaOrigen, monedaDestino, fecha);

    if (!cotizacion) {
      throw new NotFoundException(
        `No hay tipo de cambio ${monedaOrigen.toUpperCase()}/${monedaDestino.toUpperCase()} ` +
          `vigente al ${fecha}. Registre la cotización antes de continuar.`
      );
    }

    return cotizacion;
  }

  /**
   * Devuelve el lado de la cotización que corresponde aplicar.
   *
   * Activos al tipo de cambio compra, pasivos al de venta. En los países que
   * publican una cotización única ambos lados guardan el mismo valor, de modo
   * que la regla es inocua fuera de Perú.
   */
  static tomarLado(cotizacion: TipoCambioResponseDto, lado: LadoTipoCambio): number {
    return lado === LadoTipoCambio.COMPRA
      ? Number(cotizacion.compra)
      : Number(cotizacion.venta);
  }
}
