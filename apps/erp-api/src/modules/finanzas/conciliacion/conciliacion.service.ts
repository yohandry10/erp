import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CrearConciliacionDto, ListarConciliacionesDto, ImportarCsvDto, MatchAutomaticoDto, MarcarItemDto } from './dto';
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
    const client = this.supabase.getClient();

    let queryBuilder = client
      .from('conciliaciones_bancarias')
      .select(`
        *,
        cuentas_bancarias(
          id,
          banco,
          numero_cuenta,
          tipo_cuenta,
          moneda,
          saldo_actual,
          saldo_contable
        )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    // Aplicar filtros opcionales
    if (query.cuenta_bancaria_id) {
      queryBuilder = queryBuilder.eq('cuenta_bancaria_id', query.cuenta_bancaria_id);
    }

    if (query.estado) {
      queryBuilder = queryBuilder.eq('estado', query.estado);
    }

    if (query.periodo) {
      queryBuilder = queryBuilder.eq('periodo', query.periodo);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Error listando conciliaciones:', error);
      throw new BadRequestException('No se pudieron obtener las conciliaciones');
    }

    return {
      success: true,
      data: data || [],
    };
  }

  async obtenerConciliacion(
    tenantId: string,
    id: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('conciliaciones_bancarias')
      .select(`
        *,
        cuentas_bancarias(
          id,
          banco,
          numero_cuenta,
          tipo_cuenta,
          moneda,
          saldo_actual,
          saldo_contable
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error obteniendo conciliación:', error);
      throw new BadRequestException('No se pudo obtener la conciliación');
    }

    if (!data) {
      throw new NotFoundException(`Conciliación con ID ${id} no encontrada`);
    }

    return {
      success: true,
      data,
    };
  }

  async crearConciliacion(
    tenantId: string,
    dto: CrearConciliacionDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Validar que la cuenta bancaria existe y pertenece al tenant
    const { data: cuenta, error: errorCuenta } = await client
      .from('cuentas_bancarias')
      .select('id, banco, numero_cuenta, saldo_actual, saldo_contable, moneda')
      .eq('tenant_id', tenantId)
      .eq('id', dto.cuenta_bancaria_id)
      .maybeSingle();

    if (errorCuenta) {
      console.error('Error verificando cuenta bancaria:', errorCuenta);
      throw new BadRequestException('No se pudo verificar la cuenta bancaria');
    }

    if (!cuenta) {
      throw new NotFoundException(`Cuenta bancaria con ID ${dto.cuenta_bancaria_id} no encontrada`);
    }

    // Validar que las fechas sean coherentes
    const fechaDesde = new Date(dto.fecha_desde);
    const fechaHasta = new Date(dto.fecha_hasta);

    if (fechaDesde > fechaHasta) {
      throw new BadRequestException('La fecha desde no puede ser mayor a la fecha hasta');
    }

    // Validar que no exista una conciliación para el mismo período y cuenta
    const { data: existente } = await client
      .from('conciliaciones_bancarias')
      .select('id, periodo')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', dto.cuenta_bancaria_id)
      .eq('periodo', dto.periodo)
      .maybeSingle();

    if (existente) {
      throw new BadRequestException(
        `Ya existe una conciliación para el período ${dto.periodo} en esta cuenta bancaria`,
      );
    }

    // Calcular saldo según libros (saldo al final del período según sistema)
    // Obtener todos los movimientos hasta la fecha_hasta (inclusive)
    const { data: movimientosHasta, error: errorMovimientosHasta } = await client
      .from('movimientos_bancarios')
      .select('tipo, monto')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', dto.cuenta_bancaria_id)
      .lte('fecha', dto.fecha_hasta);

    if (errorMovimientosHasta) {
      console.error('Error obteniendo movimientos hasta fecha:', errorMovimientosHasta);
      throw new BadRequestException('No se pudieron obtener los movimientos del período');
    }

    let saldoLibro = 0;
    if (movimientosHasta && movimientosHasta.length > 0) {
      saldoLibro = movimientosHasta.reduce((acc, mov) => {
        if (mov.tipo === 'ABONO') {
          return acc + parseFloat(mov.monto);
        } else {
          return acc - parseFloat(mov.monto);
        }
      }, 0);
    }

    // Preparar datos de la conciliación
    const conciliacionData = {
      tenant_id: tenantId,
      cuenta_bancaria_id: dto.cuenta_bancaria_id,
      periodo: dto.periodo,
      fecha_desde: dto.fecha_desde,
      fecha_hasta: dto.fecha_hasta,
      estado: 'ABIERTA',
      saldo_libro: this.round2(saldoLibro),
      saldo_banco: 0, // Se actualizará cuando se importe el extracto
      diferencia: 0, // Se actualizará cuando se importe el extracto
      observaciones: null,
      created_by: userId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Crear la conciliación
    const { data: conciliacion, error } = await client
      .from('conciliaciones_bancarias')
      .insert(conciliacionData)
      .select('*, cuentas_bancarias(id, banco, numero_cuenta, moneda, saldo_actual, saldo_contable)')
      .single();

    if (error) {
      console.error('Error creando conciliación:', error);
      throw new BadRequestException('No se pudo crear la conciliación bancaria');
    }

    return {
      success: true,
      data: conciliacion,
    };
  }

  async importarCsv(
    tenantId: string,
    conciliacionId: string,
    dto: ImportarCsvDto,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Verificar que la conciliación existe y está en estado ABIERTA
    const { data: conciliacion, error: errorConciliacion } = await client
      .from('conciliaciones_bancarias')
      .select('*, cuentas_bancarias(banco)')
      .eq('tenant_id', tenantId)
      .eq('id', conciliacionId)
      .maybeSingle();

    if (errorConciliacion) {
      console.error('Error obteniendo conciliación:', errorConciliacion);
      throw new BadRequestException('No se pudo obtener la conciliación');
    }

    if (!conciliacion) {
      throw new NotFoundException(`Conciliación con ID ${conciliacionId} no encontrada`);
    }

    if (conciliacion.estado === 'CERRADA') {
      throw new BadRequestException('No se puede importar CSV en una conciliación cerrada');
    }

    // Determinar el banco a usar para el parser
    const banco = dto.banco || conciliacion.cuentas_bancarias?.banco || 'GENERICO';

    // Parsear el CSV
    const resultado = this.csvParser.parsearExtractoBancario(dto.contenidoCsv, banco);

    if (resultado.errores.length > 0) {
      console.warn('Errores al parsear CSV:', resultado.errores);
    }

    if (resultado.movimientos.length === 0) {
      throw new BadRequestException('No se encontraron movimientos válidos en el archivo CSV');
    }

    // Crear movimientos bancarios temporales (marcados como extracto)
    // Estos movimientos se usarán para el match automático
    const movimientosParaInsertar = resultado.movimientos.map(mov => ({
      tenant_id: tenantId,
      cuenta_bancaria_id: conciliacion.cuenta_bancaria_id,
      tipo: mov.tipo,
      monto: mov.monto,
      fecha: mov.fecha,
      descripcion: mov.descripcion,
      referencia: mov.referencia || null,
      conciliado: false,
      es_extracto: true, // Marcador para identificar movimientos del extracto
      conciliacion_id: conciliacionId,
      created_at: new Date().toISOString(),
    }));

    // Insertar movimientos en lote
    const { data: movimientosInsertados, error: errorInsertar } = await client
      .from('movimientos_bancarios')
      .insert(movimientosParaInsertar)
      .select();

    if (errorInsertar) {
      console.error('Error insertando movimientos del extracto:', errorInsertar);
      throw new BadRequestException('No se pudieron crear los movimientos del extracto');
    }

    // Actualizar la conciliación con el saldo del banco
    const { error: errorActualizar } = await client
      .from('conciliaciones_bancarias')
      .update({
        saldo_banco: resultado.saldoFinal,
        diferencia: this.round2(conciliacion.saldo_libro - resultado.saldoFinal),
        estado: 'EN_PROCESO',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conciliacionId)
      .eq('tenant_id', tenantId);

    if (errorActualizar) {
      console.error('Error actualizando conciliación:', errorActualizar);
      throw new BadRequestException('No se pudo actualizar la conciliación');
    }

    return {
      success: true,
      data: {
        conciliacion_id: conciliacionId,
        movimientos_importados: movimientosInsertados?.length || 0,
        total_abonos: resultado.totalAbonos,
        total_cargos: resultado.totalCargos,
        saldo_final: resultado.saldoFinal,
        errores: resultado.errores,
      },
    };
  }

  async matchAutomatico(
    tenantId: string,
    conciliacionId: string,
    dto: MatchAutomaticoDto,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Verificar que la conciliación existe y está en estado válido
    const { data: conciliacion, error: errorConciliacion } = await client
      .from('conciliaciones_bancarias')
      .select('*, cuentas_bancarias(banco)')
      .eq('tenant_id', tenantId)
      .eq('id', conciliacionId)
      .maybeSingle();

    if (errorConciliacion) {
      console.error('Error obteniendo conciliación:', errorConciliacion);
      throw new BadRequestException('No se pudo obtener la conciliación');
    }

    if (!conciliacion) {
      throw new NotFoundException(`Conciliación con ID ${conciliacionId} no encontrada`);
    }

    if (conciliacion.estado === 'CERRADA') {
      throw new BadRequestException('No se puede hacer match automático en una conciliación cerrada');
    }

    const toleranciaDias = dto.tolerancia_dias ?? 2;

    // Obtener movimientos del sistema (no conciliados, no extracto)
    const { data: movimientosSistema, error: errorSistema } = await client
      .from('movimientos_bancarios')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
      .eq('conciliado', false)
      .eq('es_extracto', false)
      .gte('fecha', conciliacion.fecha_desde)
      .lte('fecha', conciliacion.fecha_hasta)
      .order('fecha', { ascending: true });

    if (errorSistema) {
      console.error('Error obteniendo movimientos del sistema:', errorSistema);
      throw new BadRequestException('No se pudieron obtener los movimientos del sistema');
    }

    // Obtener movimientos del extracto (no conciliados, extracto)
    const { data: movimientosExtracto, error: errorExtracto } = await client
      .from('movimientos_bancarios')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
      .eq('conciliado', false)
      .eq('es_extracto', true)
      .eq('conciliacion_id', conciliacionId)
      .order('fecha', { ascending: true });

    if (errorExtracto) {
      console.error('Error obteniendo movimientos del extracto:', errorExtracto);
      throw new BadRequestException('No se pudieron obtener los movimientos del extracto');
    }

    if (!movimientosSistema || movimientosSistema.length === 0) {
      return {
        success: true,
        data: {
          conciliacion_id: conciliacionId,
          matches_realizados: 0,
          movimientos_sistema: 0,
          movimientos_extracto: movimientosExtracto?.length || 0,
          mensaje: 'No hay movimientos del sistema para conciliar',
        },
      };
    }

    if (!movimientosExtracto || movimientosExtracto.length === 0) {
      return {
        success: true,
        data: {
          conciliacion_id: conciliacionId,
          matches_realizados: 0,
          movimientos_sistema: movimientosSistema.length,
          movimientos_extracto: 0,
          mensaje: 'No hay movimientos del extracto para conciliar',
        },
      };
    }

    // Realizar matching
    const matches: Array<{ sistema_id: string; extracto_id: string; criterio: string }> = [];
    const movimientosExtractoUsados = new Set<string>();

    for (const movSistema of movimientosSistema) {
      let matchEncontrado = false;

      // Intentar match por referencia exacta (si ambos tienen referencia)
      if (movSistema.referencia && movSistema.referencia.trim() !== '') {
        const matchPorReferencia = movimientosExtracto.find(
          (movExtracto) =>
            !movimientosExtractoUsados.has(movExtracto.id) &&
            movExtracto.referencia &&
            movExtracto.referencia.trim() !== '' &&
            movExtracto.referencia.trim().toLowerCase() === movSistema.referencia.trim().toLowerCase() &&
            movExtracto.tipo === movSistema.tipo &&
            this.round2(parseFloat(movExtracto.monto)) === this.round2(parseFloat(movSistema.monto)),
        );

        if (matchPorReferencia) {
          matches.push({
            sistema_id: movSistema.id,
            extracto_id: matchPorReferencia.id,
            criterio: 'referencia',
          });
          movimientosExtractoUsados.add(matchPorReferencia.id);
          matchEncontrado = true;
          continue;
        }
      }

      // Intentar match por monto exacto + fecha con tolerancia
      if (!matchEncontrado) {
        const fechaSistema = new Date(movSistema.fecha);
        const matchPorMontoFecha = movimientosExtracto.find((movExtracto) => {
          if (movimientosExtractoUsados.has(movExtracto.id)) {
            return false;
          }

          // Verificar tipo y monto exacto
          if (
            movExtracto.tipo !== movSistema.tipo ||
            this.round2(parseFloat(movExtracto.monto)) !== this.round2(parseFloat(movSistema.monto))
          ) {
            return false;
          }

          // Verificar fecha con tolerancia
          const fechaExtracto = new Date(movExtracto.fecha);
          const diferenciaDias = Math.abs(
            (fechaExtracto.getTime() - fechaSistema.getTime()) / (1000 * 60 * 60 * 24),
          );

          return diferenciaDias <= toleranciaDias;
        });

        if (matchPorMontoFecha) {
          matches.push({
            sistema_id: movSistema.id,
            extracto_id: matchPorMontoFecha.id,
            criterio: 'monto_fecha',
          });
          movimientosExtractoUsados.add(matchPorMontoFecha.id);
          matchEncontrado = true;
        }
      }
    }

    // Actualizar movimientos conciliados en una transacción
    if (matches.length > 0) {
      // Actualizar cada par de movimientos con su match_id correspondiente
      for (const match of matches) {
        // Actualizar movimiento del sistema
        const { error: errorUpdateSistema } = await client
          .from('movimientos_bancarios')
          .update({
            conciliado: true,
            match_automatico: true,
            match_id: match.extracto_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', match.sistema_id)
          .eq('tenant_id', tenantId);

        if (errorUpdateSistema) {
          console.error('Error actualizando movimiento del sistema:', errorUpdateSistema);
          throw new BadRequestException('No se pudo actualizar el movimiento del sistema');
        }

        // Actualizar movimiento del extracto
        const { error: errorUpdateExtracto } = await client
          .from('movimientos_bancarios')
          .update({
            conciliado: true,
            match_automatico: true,
            match_id: match.sistema_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', match.extracto_id)
          .eq('tenant_id', tenantId);

        if (errorUpdateExtracto) {
          console.error('Error actualizando movimiento del extracto:', errorUpdateExtracto);
          throw new BadRequestException('No se pudo actualizar el movimiento del extracto');
        }
      }
    }

    // Calcular estadísticas
    const matchesPorReferencia = matches.filter((m) => m.criterio === 'referencia').length;
    const matchesPorMontoFecha = matches.filter((m) => m.criterio === 'monto_fecha').length;

    return {
      success: true,
      data: {
        conciliacion_id: conciliacionId,
        matches_realizados: matches.length,
        matches_por_referencia: matchesPorReferencia,
        matches_por_monto_fecha: matchesPorMontoFecha,
        movimientos_sistema_total: movimientosSistema.length,
        movimientos_extracto_total: movimientosExtracto.length,
        movimientos_sistema_pendientes: movimientosSistema.length - matches.length,
        movimientos_extracto_pendientes: movimientosExtracto.length - matches.length,
        tolerancia_dias: toleranciaDias,
        porcentaje_match: this.round2((matches.length / Math.max(movimientosSistema.length, movimientosExtracto.length)) * 100),
      },
    };
  }

  async marcarItem(
    tenantId: string,
    conciliacionId: string,
    dto: MarcarItemDto,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Verificar que la conciliación existe y está en estado válido
    const { data: conciliacion, error: errorConciliacion } = await client
      .from('conciliaciones_bancarias')
      .select('estado, cuenta_bancaria_id')
      .eq('tenant_id', tenantId)
      .eq('id', conciliacionId)
      .maybeSingle();

    if (errorConciliacion) {
      console.error('Error obteniendo conciliación:', errorConciliacion);
      throw new BadRequestException('No se pudo obtener la conciliación');
    }

    if (!conciliacion) {
      throw new NotFoundException(`Conciliación con ID ${conciliacionId} no encontrada`);
    }

    if (conciliacion.estado === 'CERRADA') {
      throw new BadRequestException('No se puede marcar items en una conciliación cerrada');
    }

    // Verificar que el movimiento del sistema existe y pertenece al tenant
    const { data: movimientoSistema, error: errorSistema } = await client
      .from('movimientos_bancarios')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', dto.movimiento_sistema_id)
      .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
      .eq('es_extracto', false)
      .maybeSingle();

    if (errorSistema) {
      console.error('Error obteniendo movimiento del sistema:', errorSistema);
      throw new BadRequestException('No se pudo obtener el movimiento del sistema');
    }

    if (!movimientoSistema) {
      throw new NotFoundException(
        `Movimiento del sistema con ID ${dto.movimiento_sistema_id} no encontrado o no pertenece a esta cuenta`,
      );
    }

    if (movimientoSistema.conciliado) {
      throw new BadRequestException('El movimiento del sistema ya está conciliado');
    }

    // Verificar que el movimiento del extracto existe y pertenece a esta conciliación
    const { data: movimientoExtracto, error: errorExtracto } = await client
      .from('movimientos_bancarios')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', dto.movimiento_extracto_id)
      .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
      .eq('es_extracto', true)
      .eq('conciliacion_id', conciliacionId)
      .maybeSingle();

    if (errorExtracto) {
      console.error('Error obteniendo movimiento del extracto:', errorExtracto);
      throw new BadRequestException('No se pudo obtener el movimiento del extracto');
    }

    if (!movimientoExtracto) {
      throw new NotFoundException(
        `Movimiento del extracto con ID ${dto.movimiento_extracto_id} no encontrado o no pertenece a esta conciliación`,
      );
    }

    if (movimientoExtracto.conciliado) {
      throw new BadRequestException('El movimiento del extracto ya está conciliado');
    }

    // Validar que los tipos coincidan (ABONO con ABONO, CARGO con CARGO)
    if (movimientoSistema.tipo !== movimientoExtracto.tipo) {
      throw new BadRequestException(
        `Los tipos de movimiento no coinciden: Sistema=${movimientoSistema.tipo}, Extracto=${movimientoExtracto.tipo}`,
      );
    }

    // Calcular diferencia si no se proporcionó
    const montoSistema = this.round2(parseFloat(movimientoSistema.monto));
    const montoExtracto = this.round2(parseFloat(movimientoExtracto.monto));
    const diferencia = dto.diferencia ?? this.round2(Math.abs(montoSistema - montoExtracto));

    // Marcar ambos movimientos como conciliados y registrar diferencia si existe
    const { error: errorUpdateSistema } = await client
      .from('movimientos_bancarios')
      .update({
        conciliado: true,
        match_automatico: false,
        match_id: dto.movimiento_extracto_id,
        diferencia_conciliacion: diferencia,
        movimiento_relacionado_id: dto.movimiento_extracto_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dto.movimiento_sistema_id)
      .eq('tenant_id', tenantId);

    if (errorUpdateSistema) {
      console.error('Error actualizando movimiento del sistema:', errorUpdateSistema);
      throw new BadRequestException('No se pudo actualizar el movimiento del sistema');
    }

    const { error: errorUpdateExtracto } = await client
      .from('movimientos_bancarios')
      .update({
        conciliado: true,
        match_automatico: false,
        match_id: dto.movimiento_sistema_id,
        diferencia_conciliacion: diferencia,
        movimiento_relacionado_id: dto.movimiento_sistema_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dto.movimiento_extracto_id)
      .eq('tenant_id', tenantId);

    if (errorUpdateExtracto) {
      console.error('Error actualizando movimiento del extracto:', errorUpdateExtracto);
      throw new BadRequestException('No se pudo actualizar el movimiento del extracto');
    }

    return {
      success: true,
      data: {
        conciliacion_id: conciliacionId,
        movimiento_sistema: {
          id: movimientoSistema.id,
          fecha: movimientoSistema.fecha,
          tipo: movimientoSistema.tipo,
          monto: montoSistema,
          descripcion: movimientoSistema.descripcion,
        },
        movimiento_extracto: {
          id: movimientoExtracto.id,
          fecha: movimientoExtracto.fecha,
          tipo: movimientoExtracto.tipo,
          monto: montoExtracto,
          descripcion: movimientoExtracto.descripcion,
        },
        diferencia,
        mensaje: diferencia > 0 
          ? `Match manual realizado con diferencia de ${diferencia}` 
          : 'Match manual realizado sin diferencias',
      },
    };
  }

  async obtenerDiferencias(
    tenantId: string,
    conciliacionId: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Verificar que la conciliación existe y pertenece al tenant
    const { data: conciliacion, error: errorConciliacion } = await client
      .from('conciliaciones_bancarias')
      .select('*, cuentas_bancarias(banco, numero_cuenta, moneda)')
      .eq('tenant_id', tenantId)
      .eq('id', conciliacionId)
      .maybeSingle();

    if (errorConciliacion) {
      console.error('Error obteniendo conciliación:', errorConciliacion);
      throw new BadRequestException('No se pudo obtener la conciliación');
    }

    if (!conciliacion) {
      throw new NotFoundException(`Conciliación con ID ${conciliacionId} no encontrada`);
    }

    // Obtener movimientos del sistema (no extracto)
    const { data: movimientosSistema, error: errorSistema } = await client
      .from('movimientos_bancarios')
      .select('id, conciliado, tipo, monto, fecha, descripcion, referencia')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
      .eq('es_extracto', false)
      .gte('fecha', conciliacion.fecha_desde)
      .lte('fecha', conciliacion.fecha_hasta)
      .order('fecha', { ascending: true });

    if (errorSistema) {
      console.error('Error obteniendo movimientos del sistema:', errorSistema);
      throw new BadRequestException('No se pudieron obtener los movimientos del sistema');
    }

    // Obtener movimientos del extracto
    const { data: movimientosExtracto, error: errorExtracto } = await client
      .from('movimientos_bancarios')
      .select('id, conciliado, tipo, monto, fecha, descripcion, referencia')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
      .eq('es_extracto', true)
      .eq('conciliacion_id', conciliacionId)
      .order('fecha', { ascending: true });

    if (errorExtracto) {
      console.error('Error obteniendo movimientos del extracto:', errorExtracto);
      throw new BadRequestException('No se pudieron obtener los movimientos del extracto');
    }

    // Calcular estadísticas
    const totalMovimientosSistema = movimientosSistema?.length || 0;
    const totalMovimientosExtracto = movimientosExtracto?.length || 0;
    
    const movimientosSistemaConciliados = movimientosSistema?.filter(m => m.conciliado).length || 0;
    const movimientosExtractoConciliados = movimientosExtracto?.filter(m => m.conciliado).length || 0;
    
    const movimientosSistemaPendientes = totalMovimientosSistema - movimientosSistemaConciliados;
    const movimientosExtractoPendientes = totalMovimientosExtracto - movimientosExtractoConciliados;

    // Calcular totales por tipo
    const calcularTotales = (movimientos: any[]) => {
      return movimientos.reduce(
        (acc, mov) => {
          const monto = parseFloat(mov.monto);
          if (mov.tipo === 'ABONO') {
            acc.abonos += monto;
          } else {
            acc.cargos += monto;
          }
          return acc;
        },
        { abonos: 0, cargos: 0 }
      );
    };

    const totalesSistema = calcularTotales(movimientosSistema || []);
    const totalesExtracto = calcularTotales(movimientosExtracto || []);

    const diferenciaAbonos = this.round2(totalesExtracto.abonos - totalesSistema.abonos);
    const diferenciaCargos = this.round2(totalesExtracto.cargos - totalesSistema.cargos);

    // Obtener movimientos pendientes detallados
    const movimientosSistemaPendientesDetalle = movimientosSistema?.filter(m => !m.conciliado) || [];
    const movimientosExtractoPendientesDetalle = movimientosExtracto?.filter(m => !m.conciliado) || [];

    // Generar reporte de diferencias
    const reporteDiferencias = {
      conciliacion: {
        id: conciliacion.id,
        periodo: conciliacion.periodo,
        estado: conciliacion.estado,
        fecha_desde: conciliacion.fecha_desde,
        fecha_hasta: conciliacion.fecha_hasta,
        cuenta_bancaria: conciliacion.cuentas_bancarias,
      },
      saldos: {
        saldo_libro: this.round2(conciliacion.saldo_libro || 0),
        saldo_banco: this.round2(conciliacion.saldo_banco || 0),
        diferencia_neta: this.round2(conciliacion.diferencia || 0),
      },
      movimientos_sistema: {
        total: totalMovimientosSistema,
        conciliados: movimientosSistemaConciliados,
        pendientes: movimientosSistemaPendientes,
        total_abonos: this.round2(totalesSistema.abonos),
        total_cargos: this.round2(totalesSistema.cargos),
        pendientes_detalle: movimientosSistemaPendientesDetalle.map(m => ({
          id: m.id,
          fecha: m.fecha,
          tipo: m.tipo,
          monto: this.round2(parseFloat(m.monto)),
          descripcion: m.descripcion,
          referencia: m.referencia,
        })),
      },
      movimientos_extracto: {
        total: totalMovimientosExtracto,
        conciliados: movimientosExtractoConciliados,
        pendientes: movimientosExtractoPendientes,
        total_abonos: this.round2(totalesExtracto.abonos),
        total_cargos: this.round2(totalesExtracto.cargos),
        pendientes_detalle: movimientosExtractoPendientesDetalle.map(m => ({
          id: m.id,
          fecha: m.fecha,
          tipo: m.tipo,
          monto: this.round2(parseFloat(m.monto)),
          descripcion: m.descripcion,
          referencia: m.referencia,
        })),
      },
      diferencias: {
        abonos: diferenciaAbonos,
        cargos: diferenciaCargos,
        neta: this.round2(conciliacion.diferencia || 0),
      },
      metricas: {
        porcentaje_conciliado_sistema: totalMovimientosSistema > 0 
          ? this.round2((movimientosSistemaConciliados / totalMovimientosSistema) * 100)
          : 0,
        porcentaje_conciliado_extracto: totalMovimientosExtracto > 0 
          ? this.round2((movimientosExtractoConciliados / totalMovimientosExtracto) * 100)
          : 0,
        porcentaje_conciliado_general: Math.max(totalMovimientosSistema, totalMovimientosExtracto) > 0
          ? this.round2((Math.min(movimientosSistemaConciliados, movimientosExtractoConciliados) / Math.max(totalMovimientosSistema, totalMovimientosExtracto)) * 100)
          : 0,
      },
    };

    return {
      success: true,
      data: reporteDiferencias,
    };
  }

  async cerrarConciliacion(
    tenantId: string,
    conciliacionId: string,
    userId?: string,
    forzarCierre: boolean = false,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Verificar que la conciliación existe y pertenece al tenant
    const { data: conciliacion, error: errorConciliacion } = await client
      .from('conciliaciones_bancarias')
      .select('*, cuentas_bancarias(banco, numero_cuenta, moneda)')
      .eq('tenant_id', tenantId)
      .eq('id', conciliacionId)
      .maybeSingle();

    if (errorConciliacion) {
      console.error('Error obteniendo conciliación:', errorConciliacion);
      throw new BadRequestException('No se pudo obtener la conciliación');
    }

    if (!conciliacion) {
      throw new NotFoundException(`Conciliación con ID ${conciliacionId} no encontrada`);
    }

    // Validar que no esté ya cerrada
    if (conciliacion.estado === 'CERRADA') {
      throw new BadRequestException('La conciliación ya está cerrada');
    }

    // Obtener estadísticas de movimientos
    // Movimientos del sistema (no extracto)
    const { data: movimientosSistema, error: errorSistema } = await client
      .from('movimientos_bancarios')
      .select('id, conciliado, tipo, monto')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
      .eq('es_extracto', false)
      .gte('fecha', conciliacion.fecha_desde)
      .lte('fecha', conciliacion.fecha_hasta);

    if (errorSistema) {
      console.error('Error obteniendo movimientos del sistema:', errorSistema);
      throw new BadRequestException('No se pudieron obtener los movimientos del sistema');
    }

    // Movimientos del extracto
    const { data: movimientosExtracto, error: errorExtracto } = await client
      .from('movimientos_bancarios')
      .select('id, conciliado, tipo, monto')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
      .eq('es_extracto', true)
      .eq('conciliacion_id', conciliacionId);

    if (errorExtracto) {
      console.error('Error obteniendo movimientos del extracto:', errorExtracto);
      throw new BadRequestException('No se pudieron obtener los movimientos del extracto');
    }

    // Calcular estadísticas
    const totalMovimientosSistema = movimientosSistema?.length || 0;
    const totalMovimientosExtracto = movimientosExtracto?.length || 0;
    
    const movimientosSistemaConciliados = movimientosSistema?.filter(m => m.conciliado).length || 0;
    const movimientosExtractoConciliados = movimientosExtracto?.filter(m => m.conciliado).length || 0;
    
    const movimientosSistemaPendientes = totalMovimientosSistema - movimientosSistemaConciliados;
    const movimientosExtractoPendientes = totalMovimientosExtracto - movimientosExtractoConciliados;

    // ============================================================
    // VALIDACIÓN: Todos los ítems deben estar procesados
    // ============================================================
    
    // Validar que todos los movimientos han sido procesados (conciliados o revisados)
    const hayMovimientosPendientes = movimientosSistemaPendientes > 0 || movimientosExtractoPendientes > 0;
    
    if (hayMovimientosPendientes && !forzarCierre) {
      // Si hay movimientos pendientes y no se fuerza el cierre, rechazar la operación
      const mensajeError = [
        'No se puede cerrar la conciliación porque hay movimientos pendientes de procesar:',
        movimientosSistemaPendientes > 0 ? `- ${movimientosSistemaPendientes} movimiento(s) del sistema sin conciliar` : null,
        movimientosExtractoPendientes > 0 ? `- ${movimientosExtractoPendientes} movimiento(s) del extracto sin conciliar` : null,
        '',
        'Opciones:',
        '1. Concilie todos los movimientos pendientes (automático o manual)',
        '2. Fuerce el cierre si está seguro de que los movimientos pendientes son correctos',
      ].filter(Boolean).join('\n');

      throw new BadRequestException(mensajeError);
    }

    // Validar que se haya importado un extracto
    if (totalMovimientosExtracto === 0) {
      throw new BadRequestException(
        'No se puede cerrar la conciliación sin haber importado un extracto bancario. ' +
        'Debe importar el extracto CSV antes de cerrar la conciliación.'
      );
    }

    // Validar que haya movimientos del sistema en el período
    if (totalMovimientosSistema === 0) {
      console.warn(
        `Conciliación ${conciliacionId}: No hay movimientos del sistema en el período. ` +
        `Esto puede indicar que no hubo actividad bancaria o que las fechas del período son incorrectas.`
      );
    }

    // Calcular diferencias por tipo
    const calcularTotales = (movimientos: any[]) => {
      return movimientos.reduce(
        (acc, mov) => {
          const monto = parseFloat(mov.monto);
          if (mov.tipo === 'ABONO') {
            acc.abonos += monto;
          } else {
            acc.cargos += monto;
          }
          return acc;
        },
        { abonos: 0, cargos: 0 }
      );
    };

    const totalesSistema = calcularTotales(movimientosSistema || []);
    const totalesExtracto = calcularTotales(movimientosExtracto || []);

    const diferenciaAbonos = this.round2(totalesExtracto.abonos - totalesSistema.abonos);
    const diferenciaCargos = this.round2(totalesExtracto.cargos - totalesSistema.cargos);

    // Generar reporte de diferencias
    const reporteDiferencias = {
      movimientos_sistema: {
        total: totalMovimientosSistema,
        conciliados: movimientosSistemaConciliados,
        pendientes: movimientosSistemaPendientes,
        total_abonos: this.round2(totalesSistema.abonos),
        total_cargos: this.round2(totalesSistema.cargos),
      },
      movimientos_extracto: {
        total: totalMovimientosExtracto,
        conciliados: movimientosExtractoConciliados,
        pendientes: movimientosExtractoPendientes,
        total_abonos: this.round2(totalesExtracto.abonos),
        total_cargos: this.round2(totalesExtracto.cargos),
      },
      diferencias: {
        abonos: diferenciaAbonos,
        cargos: diferenciaCargos,
        neta: this.round2(conciliacion.diferencia || 0),
      },
      porcentaje_conciliado: totalMovimientosSistema > 0 
        ? this.round2((movimientosSistemaConciliados / totalMovimientosSistema) * 100)
        : 0,
      forzado: forzarCierre && hayMovimientosPendientes,
    };

    // ============================================================
    // MARCAR MOVIMIENTOS COMO CONCILIADOS (definitivo)
    // ============================================================
    
    // Al cerrar la conciliación, todos los movimientos que ya están marcados como conciliados
    // se consideran definitivos. Los movimientos pendientes (si se forzó el cierre) quedan
    // como no conciliados para futuras conciliaciones.
    
    // No necesitamos actualizar nada aquí porque los movimientos ya están marcados como
    // conciliados durante el proceso de match (automático o manual).
    // Esta sección es informativa para documentar el comportamiento.

    // Cerrar la conciliación
    const { data: conciliacionCerrada, error: errorCerrar } = await client
      .from('conciliaciones_bancarias')
      .update({
        estado: 'CERRADA',
        cerrado_at: new Date().toISOString(),
        cerrado_by: userId || null,
        observaciones: conciliacion.observaciones || JSON.stringify(reporteDiferencias),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conciliacionId)
      .eq('tenant_id', tenantId)
      .select('*, cuentas_bancarias(banco, numero_cuenta, moneda)')
      .single();

    if (errorCerrar) {
      console.error('Error cerrando conciliación:', errorCerrar);
      throw new BadRequestException('No se pudo cerrar la conciliación');
    }

    return {
      success: true,
      data: {
        conciliacion: conciliacionCerrada,
        reporte: reporteDiferencias,
        mensaje: movimientosSistemaPendientes > 0 || movimientosExtractoPendientes > 0
          ? `Conciliación cerrada con ${movimientosSistemaPendientes} movimientos del sistema y ${movimientosExtractoPendientes} movimientos del extracto pendientes`
          : 'Conciliación cerrada exitosamente. Todos los movimientos fueron conciliados.',
      },
    };
  }

  async obtenerConciliacionesPendientes(
    tenantId: string,
  ): Promise<{ success: boolean; data: any[] }> {
    const client = this.supabase.getClient();

    // Obtener conciliaciones que no están cerradas (ABIERTA o EN_PROCESO)
    const { data: conciliaciones, error } = await client
      .from('conciliaciones_bancarias')
      .select(`
        *,
        cuentas_bancarias(
          id,
          banco,
          numero_cuenta,
          tipo_cuenta,
          moneda,
          saldo_actual,
          saldo_contable
        )
      `)
      .eq('tenant_id', tenantId)
      .in('estado', ['ABIERTA', 'EN_PROCESO'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo conciliaciones pendientes:', error);
      throw new BadRequestException('No se pudieron obtener las conciliaciones pendientes');
    }

    if (!conciliaciones || conciliaciones.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    // Para cada conciliación, calcular estadísticas de avance
    const conciliacionesConEstadisticas = await Promise.all(
      conciliaciones.map(async (conciliacion) => {
        // Obtener movimientos del sistema
        const { data: movimientosSistema } = await client
          .from('movimientos_bancarios')
          .select('id, conciliado')
          .eq('tenant_id', tenantId)
          .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
          .eq('es_extracto', false)
          .gte('fecha', conciliacion.fecha_desde)
          .lte('fecha', conciliacion.fecha_hasta);

        // Obtener movimientos del extracto
        const { data: movimientosExtracto } = await client
          .from('movimientos_bancarios')
          .select('id, conciliado')
          .eq('tenant_id', tenantId)
          .eq('cuenta_bancaria_id', conciliacion.cuenta_bancaria_id)
          .eq('es_extracto', true)
          .eq('conciliacion_id', conciliacion.id);

        const totalMovimientosSistema = movimientosSistema?.length || 0;
        const totalMovimientosExtracto = movimientosExtracto?.length || 0;
        
        const movimientosSistemaConciliados = movimientosSistema?.filter(m => m.conciliado).length || 0;
        const movimientosExtractoConciliados = movimientosExtracto?.filter(m => m.conciliado).length || 0;

        const porcentajeAvance = Math.max(totalMovimientosSistema, totalMovimientosExtracto) > 0
          ? this.round2((Math.min(movimientosSistemaConciliados, movimientosExtractoConciliados) / Math.max(totalMovimientosSistema, totalMovimientosExtracto)) * 100)
          : 0;

        return {
          id: conciliacion.id,
          periodo: conciliacion.periodo,
          estado: conciliacion.estado,
          fecha_desde: conciliacion.fecha_desde,
          fecha_hasta: conciliacion.fecha_hasta,
          cuenta_bancaria: conciliacion.cuentas_bancarias,
          saldo_libro: this.round2(conciliacion.saldo_libro || 0),
          saldo_banco: this.round2(conciliacion.saldo_banco || 0),
          diferencia: this.round2(conciliacion.diferencia || 0),
          created_at: conciliacion.created_at,
          estadisticas: {
            total_movimientos_sistema: totalMovimientosSistema,
            total_movimientos_extracto: totalMovimientosExtracto,
            movimientos_sistema_conciliados: movimientosSistemaConciliados,
            movimientos_extracto_conciliados: movimientosExtractoConciliados,
            movimientos_sistema_pendientes: totalMovimientosSistema - movimientosSistemaConciliados,
            movimientos_extracto_pendientes: totalMovimientosExtracto - movimientosExtractoConciliados,
            porcentaje_avance: porcentajeAvance,
          },
        };
      })
    );

    return {
      success: true,
      data: conciliacionesConEstadisticas,
    };
  }

  async listarPlantillasCsv(): Promise<{ success: boolean; data: any[] }> {
    const plantillas = this.csvParser.listarPlantillas();
    
    return {
      success: true,
      data: plantillas,
    };
  }

  async registrarPlantillaCsv(
    dto: any,
  ): Promise<{ success: boolean; data: any }> {
    try {
      // Convertir DTO a formato de plantilla
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

      // Registrar la plantilla
      this.csvParser.registrarPlantilla(plantilla as any);

      return {
        success: true,
        data: {
          mensaje: `Plantilla ${plantilla.codigo} registrada exitosamente`,
          plantilla,
        },
      };
    } catch (error) {
      console.error('Error registrando plantilla CSV:', error);
      throw new BadRequestException('No se pudo registrar la plantilla CSV');
    }
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
