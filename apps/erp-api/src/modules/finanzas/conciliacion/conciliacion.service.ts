import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import {
  CerrarConciliacionDto,
  CrearConciliacionDto,
  ImportarCsvDto,
  ListarConciliacionesDto,
  MarcarItemDto,
  MatchAutomaticoDto,
  MatchLoteDto,
} from './dto';
import { CsvParserService } from './csv-parser.service';

@Injectable()
export class ConciliacionService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly csvParser: CsvParserService,
  ) {}

  async listarConciliaciones(
    tenantId: string,
    query: ListarConciliacionesDto,
  ): Promise<{ success: boolean; data: any[] }> {
    let builder = this.supabase
      .getClient()
      .from('conciliaciones_bancarias')
      .select(`
        *,
        cuentas_bancarias(
          id, banco, numero_cuenta, tipo_cuenta, moneda,
          cuenta_contable_id, saldo_actual, saldo_contable
        )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (query.cuenta_bancaria_id) {
      builder = builder.eq('cuenta_bancaria_id', query.cuenta_bancaria_id);
    }
    if (query.estado) builder = builder.eq('estado', query.estado);
    if (query.periodo) builder = builder.eq('periodo', query.periodo);

    const { data, error } = await builder;
    if (error) {
      throw new BadRequestException('No se pudieron obtener las conciliaciones');
    }
    return { success: true, data: data || [] };
  }

  async obtenerConciliacion(
    tenantId: string,
    conciliacionId: string,
  ): Promise<{ success: boolean; data: any }> {
    const { data, error } = await this.supabase
      .getClient()
      .from('conciliaciones_bancarias')
      .select(`
        *,
        cuentas_bancarias(
          id, banco, numero_cuenta, tipo_cuenta, moneda,
          cuenta_contable_id, saldo_actual, saldo_contable
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('id', conciliacionId)
      .maybeSingle();

    if (error) throw new BadRequestException('No se pudo obtener la conciliación');
    if (!data) {
      throw new NotFoundException(`Conciliación con ID ${conciliacionId} no encontrada`);
    }
    return { success: true, data };
  }

  async obtenerDiferencias(
    tenantId: string,
    conciliacionId: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();
    const { data: conciliacion, error } = await client
      .from('conciliaciones_bancarias')
      .select('*, cuentas_bancarias(banco, numero_cuenta, moneda)')
      .eq('tenant_id', tenantId)
      .eq('id', conciliacionId)
      .maybeSingle();

    if (error) throw new BadRequestException('No se pudo obtener la conciliación');
    if (!conciliacion) {
      throw new NotFoundException(`Conciliación con ID ${conciliacionId} no encontrada`);
    }

    const systemQuery = client
      .from('movimientos_bancarios')
      .select('id, conciliado, tipo, monto, fecha, descripcion, referencia')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
      .eq('es_extracto', false)
      .gte('fecha', conciliacion.fecha_desde)
      .lte('fecha', conciliacion.fecha_hasta)
      .order('fecha', { ascending: true });
    const statementQuery = client
      .from('movimientos_bancarios')
      .select('id, conciliado, tipo, monto, fecha, descripcion, referencia')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
      .eq('es_extracto', true)
      .eq('conciliacion_id', conciliacionId)
      .order('fecha', { ascending: true });
    const [systemResult, statementResult] = await Promise.all([systemQuery, statementQuery]);
    if (systemResult.error || statementResult.error) {
      throw new BadRequestException('No se pudieron obtener los movimientos de la conciliación');
    }

    const sistema = systemResult.data || [];
    const extracto = statementResult.data || [];
    const totales = (items: any[]) => items.reduce(
      (acc, item) => {
        const monto = Number(item.monto || 0);
        if (item.tipo === 'ABONO') acc.abonos += monto;
        else acc.cargos += monto;
        return acc;
      },
      { abonos: 0, cargos: 0 },
    );
    const totalsSistema = totales(sistema);
    const totalsExtracto = totales(extracto);
    const sistemaConciliado = sistema.filter((item: any) => item.conciliado).length;
    const extractoConciliado = extracto.filter((item: any) => item.conciliado).length;
    const maximo = Math.max(sistema.length, extracto.length);
    const mapMovimiento = (item: any) => ({
      ...item,
      monto: this.round2(Number(item.monto || 0)),
    });

    return {
      success: true,
      data: {
        conciliacion: {
          id: conciliacion.id,
          periodo: conciliacion.periodo,
          estado: conciliacion.estado,
          fecha_desde: conciliacion.fecha_desde,
          fecha_hasta: conciliacion.fecha_hasta,
          cuenta_bancaria: conciliacion.cuentas_bancarias,
        },
        saldos: {
          saldo_inicial: this.round2(Number(conciliacion.saldo_inicial || 0)),
          saldo_banco_inicial: this.round2(Number(conciliacion.saldo_banco_inicial || 0)),
          saldo_libro: this.round2(Number(conciliacion.saldo_libro || 0)),
          saldo_banco: this.round2(Number(conciliacion.saldo_banco || 0)),
          diferencia_neta: this.round2(Number(conciliacion.diferencia || 0)),
        },
        movimientos_sistema: {
          total: sistema.length,
          conciliados: sistemaConciliado,
          pendientes: sistema.length - sistemaConciliado,
          total_abonos: this.round2(totalsSistema.abonos),
          total_cargos: this.round2(totalsSistema.cargos),
          pendientes_detalle: sistema.filter((item: any) => !item.conciliado).map(mapMovimiento),
        },
        movimientos_extracto: {
          total: extracto.length,
          conciliados: extractoConciliado,
          pendientes: extracto.length - extractoConciliado,
          total_abonos: this.round2(totalsExtracto.abonos),
          total_cargos: this.round2(totalsExtracto.cargos),
          pendientes_detalle: extracto.filter((item: any) => !item.conciliado).map(mapMovimiento),
        },
        diferencias: {
          abonos: this.round2(totalsExtracto.abonos - totalsSistema.abonos),
          cargos: this.round2(totalsExtracto.cargos - totalsSistema.cargos),
          neta: this.round2(Number(conciliacion.diferencia || 0)),
        },
        metricas: {
          porcentaje_conciliado_sistema: sistema.length
            ? this.round2((sistemaConciliado / sistema.length) * 100)
            : 0,
          porcentaje_conciliado_extracto: extracto.length
            ? this.round2((extractoConciliado / extracto.length) * 100)
            : 0,
          porcentaje_conciliado_general: maximo
            ? this.round2((Math.min(sistemaConciliado, extractoConciliado) / maximo) * 100)
            : 0,
        },
      },
    };
  }

  async obtenerConciliacionesPendientes(
    tenantId: string,
  ): Promise<{ success: boolean; data: any[] }> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('conciliaciones_bancarias')
      .select(`
        *,
        cuentas_bancarias(
          id, banco, numero_cuenta, tipo_cuenta, moneda,
          cuenta_contable_id, saldo_actual, saldo_contable
        )
      `)
      .eq('tenant_id', tenantId)
      .in('estado', ['ABIERTA', 'EN_PROCESO'])
      .order('created_at', { ascending: false });
    if (error) {
      throw new BadRequestException('No se pudieron obtener las conciliaciones pendientes');
    }

    const conciliaciones = data || [];
    const enriched = await Promise.all(conciliaciones.map(async (item: any) => {
      const systemQuery = client
        .from('movimientos_bancarios')
        .select('id, conciliado')
        .eq('tenant_id', tenantId)
        .eq('cuenta_bancaria_id', item.cuenta_bancaria_id)
        .eq('es_extracto', false)
        .gte('fecha', item.fecha_desde)
        .lte('fecha', item.fecha_hasta);
      const statementQuery = client
        .from('movimientos_bancarios')
        .select('id, conciliado')
        .eq('tenant_id', tenantId)
        .eq('cuenta_bancaria_id', item.cuenta_bancaria_id)
        .eq('es_extracto', true)
        .eq('conciliacion_id', item.id);
      const [systemResult, statementResult] = await Promise.all([systemQuery, statementQuery]);
      if (systemResult.error || statementResult.error) {
        throw new BadRequestException('No se pudo calcular el avance de las conciliaciones');
      }
      const sistema = systemResult.data || [];
      const extracto = statementResult.data || [];
      const sistemaConciliado = sistema.filter((row: any) => row.conciliado).length;
      const extractoConciliado = extracto.filter((row: any) => row.conciliado).length;
      const maximo = Math.max(sistema.length, extracto.length);
      return {
        ...item,
        saldo_inicial: this.round2(Number(item.saldo_inicial || 0)),
        saldo_banco_inicial: this.round2(Number(item.saldo_banco_inicial || 0)),
        saldo_libro: this.round2(Number(item.saldo_libro || 0)),
        saldo_banco: this.round2(Number(item.saldo_banco || 0)),
        diferencia: this.round2(Number(item.diferencia || 0)),
        estadisticas: {
          total_movimientos_sistema: sistema.length,
          total_movimientos_extracto: extracto.length,
          movimientos_sistema_conciliados: sistemaConciliado,
          movimientos_extracto_conciliados: extractoConciliado,
          movimientos_sistema_pendientes: sistema.length - sistemaConciliado,
          movimientos_extracto_pendientes: extracto.length - extractoConciliado,
          porcentaje_avance: maximo
            ? this.round2((Math.min(sistemaConciliado, extractoConciliado) / maximo) * 100)
            : 0,
        },
      };
    }));
    return { success: true, data: enriched };
  }

  async listarPlantillasCsv(): Promise<{ success: boolean; data: any[] }> {
    return { success: true, data: this.csvParser.listarPlantillas() };
  }

  async registrarPlantillaCsv(dto: any): Promise<{ success: boolean; data: any }> {
    const plantilla = {
      codigo: dto.codigo.toUpperCase(),
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      tieneEncabezado: dto.tieneEncabezado,
      separador: dto.separador,
      formatoFecha: dto.formatoFecha,
      columnas: dto.columnas,
      usaCargoAbonoSeparado: dto.usaCargoAbonoSeparado,
      simbolosMoneda: dto.simbolosMoneda || [],
      separadorDecimal: dto.separadorDecimal,
      separadorMiles: dto.separadorMiles,
    };
    try {
      this.csvParser.registrarPlantilla(plantilla as any);
    } catch {
      throw new BadRequestException('No se pudo registrar la plantilla CSV');
    }
    return {
      success: true,
      data: { mensaje: `Plantilla ${plantilla.codigo} registrada exitosamente`, plantilla },
    };
  }

  async crearConciliacionAtomica(
    tenantId: string,
    dto: CrearConciliacionDto,
    actorId?: string,
  ) {
    this.assertActor(actorId);
    const { idempotency_key, ...payload } = dto;
    return this.ejecutarRpcAtomica('crear_conciliacion_bancaria_tx', {
      p_tenant_id: tenantId,
      p_payload: payload,
      p_actor_id: actorId,
      p_idempotency_key: idempotency_key,
    });
  }

  async importarCsvAtomico(
    tenantId: string,
    conciliacionId: string,
    dto: ImportarCsvDto,
    actorId?: string,
  ) {
    this.assertActor(actorId);
    const parseo = this.csvParser.parsearExtractoBancario(dto.contenidoCsv, dto.banco || 'GENERICO');
    if (parseo.errores.length > 0) {
      throw new BadRequestException({
        message: 'El CSV contiene filas inválidas; no se importó ninguna',
        errores: parseo.errores,
      });
    }
    return this.ejecutarRpcAtomica('importar_extracto_bancario_tx', {
      p_tenant_id: tenantId,
      p_conciliacion_id: conciliacionId,
      p_payload: {
        banco: dto.banco || 'GENERICO',
        saldo_banco_inicial: dto.saldo_banco_inicial,
        saldo_banco_final: dto.saldo_banco_final,
        movimientos: parseo.movimientos,
      },
      p_actor_id: actorId,
      p_idempotency_key: dto.idempotency_key,
    });
  }

  async marcarItemAtomico(
    tenantId: string,
    conciliacionId: string,
    dto: MarcarItemDto,
    actorId?: string,
  ) {
    this.assertActor(actorId);
    return this.ejecutarRpcAtomica('conciliar_movimiento_bancario_v2_tx', {
      p_tenant_id: tenantId,
      p_conciliacion_id: conciliacionId,
      p_movimiento_sistema_id: dto.movimiento_sistema_id,
      p_movimiento_extracto_id: dto.movimiento_extracto_id,
      p_actor_id: actorId,
      p_idempotency_key: dto.idempotency_key,
    });
  }

  async marcarLoteAtomico(
    tenantId: string,
    conciliacionId: string,
    dto: MatchLoteDto,
    actorId?: string,
  ) {
    this.assertActor(actorId);
    return this.ejecutarRpcAtomica('conciliar_lote_bancario_tx', {
      p_tenant_id: tenantId,
      p_conciliacion_id: conciliacionId,
      p_pares: dto.pares,
      p_actor_id: actorId,
      p_idempotency_key: dto.idempotency_key,
    });
  }

  async matchAutomaticoAtomico(
    tenantId: string,
    conciliacionId: string,
    dto: MatchAutomaticoDto,
    actorId?: string,
  ) {
    this.assertActor(actorId);
    return this.ejecutarRpcAtomica('conciliar_automaticamente_bancario_tx', {
      p_tenant_id: tenantId,
      p_conciliacion_id: conciliacionId,
      p_tolerancia_dias: dto.tolerancia_dias ?? 2,
      p_actor_id: actorId,
      p_idempotency_key: dto.idempotency_key,
    });
  }

  async cerrarConciliacionAtomica(
    tenantId: string,
    conciliacionId: string,
    dto: CerrarConciliacionDto,
    actorId?: string,
  ) {
    this.assertActor(actorId);
    return this.ejecutarRpcAtomica('cerrar_conciliacion_bancaria_tx', {
      p_tenant_id: tenantId,
      p_conciliacion_id: conciliacionId,
      p_actor_id: actorId,
      p_idempotency_key: dto.idempotency_key,
    });
  }

  private assertActor(actorId?: string): asserts actorId is string {
    if (!actorId) throw new BadRequestException('El actor autenticado es obligatorio');
  }

  private async ejecutarRpcAtomica(nombre: string, parametros: Record<string, unknown>) {
    const { data, error } = await this.supabase.getClient().rpc(nombre, parametros);
    if (error) {
      throw new BadRequestException(error.message || `No se pudo ejecutar ${nombre}`);
    }
    return { success: true, data };
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
