import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { CrearCuentaBancariaDto, ActualizarCuentaBancariaDto, ListarMovimientosQueryDto, CrearMovimientoBancarioDto } from './dto';
import { OutboxEventBuilder } from '../../../shared/outbox/outbox-event.interface';

@Injectable()
export class BancosService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
  ) {}

  private toRuntimeBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'si', 'sí'].includes(normalized)) return true;
      if (['false', '0', 'no'].includes(normalized)) return false;
    }
    return Boolean(value);
  }

  private applyConciliadoFilter<T extends { eq: (column: string, value: boolean) => T; or: (filters: string) => T }>(
    queryBuilder: T,
    conciliado: unknown,
  ): T {
    const normalized = this.toRuntimeBoolean(conciliado);

    return normalized
      ? queryBuilder.eq('conciliado', true)
      : queryBuilder.or('conciliado.is.false,conciliado.is.null');
  }

  async crearCuentaBancaria(
    tenantId: string,
    dto: CrearCuentaBancariaDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Validar que no exista una cuenta con el mismo número para este tenant
    const { data: existente } = await client
      .from('cuentas_bancarias')
      .select('id, numero_cuenta')
      .eq('tenant_id', tenantId)
      .eq('numero_cuenta', dto.numero_cuenta)
      .maybeSingle();

    if (existente) {
      throw new BadRequestException(
        `Ya existe una cuenta bancaria con el número ${dto.numero_cuenta}`,
      );
    }

    // Validar saldo inicial si permite_sobregiro es false
    const saldoInicial = dto.saldo ?? 0;
    const permiteSobregiro = dto.permite_sobregiro ?? false;

    if (!permiteSobregiro && saldoInicial < 0) {
      throw new BadRequestException(
        'El saldo inicial no puede ser negativo si la cuenta no permite sobregiro',
      );
    }

    // Preparar datos de la cuenta bancaria
    const cuentaData = {
      tenant_id: tenantId,
      nombre: dto.nombre,
      banco: dto.banco,
      numero_cuenta: dto.numero_cuenta,
      tipo_cuenta: dto.tipo_cuenta ?? 'CORRIENTE',
      moneda: dto.moneda ?? 'PEN',
      saldo: this.round2(saldoInicial),
      permite_sobregiro: permiteSobregiro,
      activa: dto.activa ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Crear la cuenta bancaria
    const { data: cuenta, error } = await client
      .from('cuentas_bancarias')
      .insert(cuentaData)
      .select()
      .single();

    if (error) {
      console.error('Error creando cuenta bancaria:', error);
      throw new BadRequestException('No se pudo crear la cuenta bancaria');
    }

    return {
      success: true,
      data: cuenta,
    };
  }

  async obtenerCuentasBancarias(
    tenantId: string,
  ): Promise<{ success: boolean; data: any[] }> {
    const client = this.supabase.getClient();

    const { data: cuentas, error } = await client
      .from('cuentas_bancarias')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo cuentas bancarias:', error);
      throw new BadRequestException('No se pudieron obtener las cuentas bancarias');
    }

    return {
      success: true,
      data: cuentas || [],
    };
  }

  async obtenerCuentaBancariaPorId(
    tenantId: string,
    id: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    const { data: cuenta, error } = await client
      .from('cuentas_bancarias')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error obteniendo cuenta bancaria:', error);
      throw new BadRequestException('No se pudo obtener la cuenta bancaria');
    }

    if (!cuenta) {
      throw new NotFoundException(`Cuenta bancaria con ID ${id} no encontrada`);
    }

    return {
      success: true,
      data: cuenta,
    };
  }

  async actualizarCuentaBancaria(
    tenantId: string,
    id: string,
    dto: ActualizarCuentaBancariaDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Verificar que la cuenta existe
    const { data: cuentaExistente, error: errorBusqueda } = await client
      .from('cuentas_bancarias')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (errorBusqueda) {
      console.error('Error buscando cuenta bancaria:', errorBusqueda);
      throw new BadRequestException('No se pudo buscar la cuenta bancaria');
    }

    if (!cuentaExistente) {
      throw new NotFoundException(`Cuenta bancaria con ID ${id} no encontrada`);
    }

    // Si se está actualizando el número de cuenta, validar que no exista otra con ese número
    if (dto.numero_cuenta && dto.numero_cuenta !== cuentaExistente.numero_cuenta) {
      const { data: otraCuenta } = await client
        .from('cuentas_bancarias')
        .select('id, numero_cuenta')
        .eq('tenant_id', tenantId)
        .eq('numero_cuenta', dto.numero_cuenta)
        .neq('id', id)
        .maybeSingle();

      if (otraCuenta) {
        throw new BadRequestException(
          `Ya existe otra cuenta bancaria con el número ${dto.numero_cuenta}`,
        );
      }
    }

    // Si se está desactivando permite_sobregiro, validar que el saldo no sea negativo
    if (
      dto.permite_sobregiro === false &&
      cuentaExistente.permite_sobregiro === true &&
      cuentaExistente.saldo < 0
    ) {
      throw new BadRequestException(
        'No se puede desactivar el sobregiro cuando la cuenta tiene saldo negativo',
      );
    }

    // Preparar datos de actualización
    const updateData: any = {
      ...dto,
      updated_at: new Date().toISOString(),
    };

    // Actualizar la cuenta bancaria
    const { data: cuentaActualizada, error } = await client
      .from('cuentas_bancarias')
      .update(updateData)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando cuenta bancaria:', error);
      throw new BadRequestException('No se pudo actualizar la cuenta bancaria');
    }

    return {
      success: true,
      data: cuentaActualizada,
    };
  }

  async obtenerMovimientosBancarios(
    tenantId: string,
    cuentaBancariaId: string,
    query: ListarMovimientosQueryDto,
  ): Promise<{ success: boolean; data: any[]; pagination: any }> {
    const client = this.supabase.getClient();

    // Verificar que la cuenta bancaria existe y pertenece al tenant
    const { data: cuenta, error: errorCuenta } = await client
      .from('cuentas_bancarias')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', cuentaBancariaId)
      .maybeSingle();

    if (errorCuenta) {
      console.error('Error verificando cuenta bancaria:', errorCuenta);
      throw new BadRequestException('No se pudo verificar la cuenta bancaria');
    }

    if (!cuenta) {
      throw new NotFoundException(`Cuenta bancaria con ID ${cuentaBancariaId} no encontrada`);
    }

    // Construir query base
    let queryBuilder = client
      .from('movimientos_bancarios')
      .select('*, proveedores(id, razon_social, ruc)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', cuentaBancariaId);

    // Aplicar filtros opcionales
    if (query.fecha_desde) {
      queryBuilder = queryBuilder.gte('fecha', query.fecha_desde);
    }

    if (query.fecha_hasta) {
      queryBuilder = queryBuilder.lte('fecha', query.fecha_hasta);
    }

    if (query.tipo) {
      queryBuilder = queryBuilder.eq('tipo', query.tipo);
    }

    if (query.conciliado !== undefined) {
      queryBuilder = this.applyConciliadoFilter(queryBuilder, query.conciliado);
    }

    const esExtracto = this.toRuntimeBoolean(query.es_extracto);
    if (esExtracto !== undefined) {
      queryBuilder = queryBuilder.eq('es_extracto', esExtracto);
    }

    if (query.conciliacion_id) {
      queryBuilder = queryBuilder.eq('conciliacion_id', query.conciliacion_id);
    }

    // Paginación
    const page = query.page || 1;
    const limit = query.limit || 50;
    const offset = (page - 1) * limit;

    queryBuilder = queryBuilder
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: movimientos, error, count } = await queryBuilder;

    if (error) {
      console.error('Error obteniendo movimientos bancarios:', error);
      throw new BadRequestException('No se pudieron obtener los movimientos bancarios');
    }

    return {
      success: true,
      data: movimientos || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Crea un movimiento bancario manual (ABONO o CARGO).
   * 
   * VALIDACIÓN DE SALDO NEGATIVO (CONFIGURABLE):
   * - Si la cuenta NO permite sobregiro (permite_sobregiro = false):
   *   * Los movimientos CARGO que dejen el saldo negativo serán RECHAZADOS
   *   * Se lanza BadRequestException con mensaje de saldo insuficiente
   * - Si la cuenta SÍ permite sobregiro (permite_sobregiro = true):
   *   * Los movimientos CARGO pueden dejar el saldo negativo
   *   * No hay restricción en el saldo mínimo
   * - Los movimientos ABONO (ingresos) SIEMPRE se permiten sin restricción
   * 
   * Esta validación está implementada en 3 niveles:
   * 1. Base de datos: CHECK constraint en la tabla cuentas_bancarias
   * 2. Aplicación (BancosService): Validación antes de crear movimiento
   * 3. Aplicación (TesoreriaService): Validación antes de procesar pagos
   */
  async crearMovimientoBancario(
    tenantId: string,
    dto: CrearMovimientoBancarioDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Validar que el monto sea positivo
    if (dto.monto <= 0) {
      throw new BadRequestException('El monto del movimiento debe ser mayor a 0');
    }

    // Verificar que la cuenta bancaria existe y pertenece al tenant
    const { data: cuenta, error: errorCuenta } = await client
      .from('cuentas_bancarias')
      .select('id, nombre, saldo, moneda, permite_sobregiro, activa')
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

    if (!cuenta.activa) {
      throw new BadRequestException('No se pueden crear movimientos en una cuenta bancaria inactiva');
    }

    // Si es un proveedor, verificar que existe
    if (dto.proveedor_id) {
      const { data: proveedor, error: errorProveedor } = await client
        .from('proveedores')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('id', dto.proveedor_id)
        .maybeSingle();

      if (errorProveedor || !proveedor) {
        throw new BadRequestException('Proveedor no encontrado');
      }
    }

    // Calcular el nuevo saldo de la cuenta bancaria
    const montoRedondeado = this.round2(dto.monto);
    let nuevoSaldo: number;

    if (dto.tipo === 'ABONO') {
      // ABONO = ingreso, suma al saldo
      nuevoSaldo = this.round2(cuenta.saldo + montoRedondeado);
    } else {
      // CARGO = egreso, resta del saldo
      nuevoSaldo = this.round2(cuenta.saldo - montoRedondeado);

      // ✅ VALIDACIÓN DE SALDO NEGATIVO (CONFIGURABLE)
      // Si la cuenta NO permite sobregiro, validar que el saldo no quede negativo
      if (!cuenta.permite_sobregiro && nuevoSaldo < 0) {
        throw new BadRequestException(
          `Saldo insuficiente en la cuenta bancaria. Saldo disponible: ${cuenta.saldo}, Monto requerido: ${montoRedondeado}`,
        );
      }
    }

    // Crear el movimiento bancario
    const movimientoData = {
      tenant_id: tenantId,
      cuenta_bancaria_id: dto.cuenta_bancaria_id,
      tipo: dto.tipo,
      monto: montoRedondeado,
      fecha: dto.fecha,
      descripcion: dto.descripcion,
      referencia: dto.referencia || null,
      metodo_pago: dto.metodo_pago || null,
      proveedor_id: dto.proveedor_id || null,
      cxp_id: null, // Los movimientos manuales no están vinculados a CxP
      conciliado: false,
      created_by: userId || null,
      created_at: new Date().toISOString(),
    };

    const { data: movimiento, error: errorMovimiento } = await client
      .from('movimientos_bancarios')
      .insert(movimientoData)
      .select('*, proveedores(id, razon_social, ruc)')
      .single();

    if (errorMovimiento) {
      console.error('Error creando movimiento bancario:', errorMovimiento);
      throw new BadRequestException('No se pudo crear el movimiento bancario');
    }

    // Actualizar el saldo de la cuenta bancaria
    const { error: errorActualizarSaldo } = await client
      .from('cuentas_bancarias')
      .update({
        saldo: nuevoSaldo,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', dto.cuenta_bancaria_id);

    if (errorActualizarSaldo) {
      console.error('Error actualizando saldo de cuenta bancaria:', errorActualizarSaldo);
      
      // Revertir el movimiento bancario creado
      await client
        .from('movimientos_bancarios')
        .delete()
        .eq('id', movimiento.id);

      throw new BadRequestException('No se pudo actualizar el saldo de la cuenta bancaria');
    }

    // Emitir evento MovimientoBancarioRegistrado
    try {
      this.eventBus.emitMovimientoBancarioRegistrado({
        tenantId,
        movimientoId: movimiento.id,
        cuentaBancariaId: dto.cuenta_bancaria_id,
        cuentaBancariaNombre: cuenta.nombre,
        tipo: dto.tipo,
        monto: montoRedondeado,
        moneda: cuenta.moneda,
        fecha: dto.fecha,
        descripcion: dto.descripcion,
        referencia: dto.referencia,
        metodoPago: dto.metodo_pago,
        proveedorId: dto.proveedor_id,
        proveedorNombre: movimiento.proveedores?.razon_social,
        cxpId: null, // Movimientos manuales no están vinculados a CxP
        saldoAnterior: cuenta.saldo,
        saldoNuevo: nuevoSaldo,
        createdBy: userId,
      });
      console.log('✅ Evento MovimientoBancarioRegistrado emitido exitosamente');
    } catch (errorEvento) {
      console.error('❌ Error emitiendo evento MovimientoBancarioRegistrado:', errorEvento);
      // No fallar la operación si el evento no se pudo emitir
    }

    // Insertar en outbox_events para procesamiento asíncrono
    const eventoPayload = {
      tenant_id: tenantId,
      movimiento_id: movimiento.id,
      cuenta_bancaria_id: dto.cuenta_bancaria_id,
      cuenta_bancaria_nombre: cuenta.nombre,
      tipo: dto.tipo,
      monto: montoRedondeado,
      moneda: cuenta.moneda,
      fecha: dto.fecha,
      descripcion: dto.descripcion,
      referencia: dto.referencia || null,
      metodo_pago: dto.metodo_pago || null,
      proveedor_id: dto.proveedor_id || null,
      proveedor_nombre: movimiento.proveedores?.razon_social || null,
      cxp_id: null,
      saldo_anterior: cuenta.saldo,
      saldo_nuevo: nuevoSaldo,
      created_by: userId || null,
    };

    const eventToInsert = OutboxEventBuilder.build({
      tenantId,
      eventType: 'MovimientoBancarioRegistrado',
      aggregateType: 'MovimientoBancario',
      aggregateId: movimiento.id,
      idempotencyKey: `bancos.movimiento:${tenantId}:${movimiento.id}`,
      eventData: eventoPayload,
    });

    const { error: errorOutbox } = await client
      .from('outbox_events')
      .insert(eventToInsert);

    if (errorOutbox) {
      console.error('Error insertando evento en outbox:', errorOutbox);
      // No fallar la operación si el evento no se pudo insertar
    }

    return {
      success: true,
      data: {
        ...movimiento,
        cuenta_bancaria: {
          id: cuenta.id,
          nombre: cuenta.nombre,
          saldo_anterior: cuenta.saldo,
          saldo_nuevo: nuevoSaldo,
        },
      },
    };
  }

  async obtenerSaldosConsolidados(
    tenantId: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Obtener todas las cuentas bancarias activas del tenant
    const { data: cuentas, error } = await client
      .from('cuentas_bancarias')
      .select('id, nombre, banco, numero_cuenta, tipo_cuenta, moneda, saldo, activa')
      .eq('tenant_id', tenantId)
      .order('moneda', { ascending: true })
      .order('banco', { ascending: true });

    if (error) {
      console.error('Error obteniendo cuentas bancarias para consolidado:', error);
      throw new BadRequestException('No se pudieron obtener los saldos consolidados');
    }

    if (!cuentas || cuentas.length === 0) {
      return {
        success: true,
        data: {
          por_moneda: [],
          por_cuenta: [],
          total_cuentas: 0,
          total_cuentas_activas: 0,
        },
      };
    }

    // Consolidar por moneda
    const consolidadoPorMoneda = cuentas.reduce((acc, cuenta) => {
      const moneda = cuenta.moneda;
      
      if (!acc[moneda]) {
        acc[moneda] = {
          moneda,
          saldo_total: 0,
          saldo_activas: 0,
          cantidad_cuentas: 0,
          cantidad_activas: 0,
        };
      }

      acc[moneda].saldo_total = this.round2(acc[moneda].saldo_total + cuenta.saldo);
      acc[moneda].cantidad_cuentas += 1;

      if (cuenta.activa) {
        acc[moneda].saldo_activas = this.round2(acc[moneda].saldo_activas + cuenta.saldo);
        acc[moneda].cantidad_activas += 1;
      }

      return acc;
    }, {} as Record<string, any>);

    // Convertir a array y ordenar por moneda
    const porMoneda = Object.values(consolidadoPorMoneda).sort((a: any, b: any) => 
      a.moneda.localeCompare(b.moneda)
    );

    // Preparar detalle por cuenta
    const porCuenta = cuentas.map(cuenta => ({
      id: cuenta.id,
      nombre: cuenta.nombre,
      banco: cuenta.banco,
      numero_cuenta: cuenta.numero_cuenta,
      tipo_cuenta: cuenta.tipo_cuenta,
      moneda: cuenta.moneda,
      saldo: this.round2(cuenta.saldo),
      activa: cuenta.activa,
    }));

    // Calcular totales generales
    const totalCuentas = cuentas.length;
    const totalCuentasActivas = cuentas.filter(c => c.activa).length;

    return {
      success: true,
      data: {
        por_moneda: porMoneda,
        por_cuenta: porCuenta,
        total_cuentas: totalCuentas,
        total_cuentas_activas: totalCuentasActivas,
      },
    };
  }

  async exportarMovimientosBancarios(
    tenantId: string,
    cuentaBancariaId: string,
    query: ListarMovimientosQueryDto,
  ): Promise<{ success: boolean; data: string; filename: string }> {
    const client = this.supabase.getClient();

    // Verificar que la cuenta bancaria existe y pertenece al tenant
    const { data: cuenta, error: errorCuenta } = await client
      .from('cuentas_bancarias')
      .select('id, nombre, banco, numero_cuenta, moneda')
      .eq('tenant_id', tenantId)
      .eq('id', cuentaBancariaId)
      .maybeSingle();

    if (errorCuenta) {
      console.error('Error verificando cuenta bancaria:', errorCuenta);
      throw new BadRequestException('No se pudo verificar la cuenta bancaria');
    }

    if (!cuenta) {
      throw new NotFoundException(`Cuenta bancaria con ID ${cuentaBancariaId} no encontrada`);
    }

    // Construir query base (sin paginación para exportar todo)
    let queryBuilder = client
      .from('movimientos_bancarios')
      .select('*, proveedores(id, razon_social, ruc)')
      .eq('tenant_id', tenantId)
      .eq('cuenta_bancaria_id', cuentaBancariaId);

    // Aplicar filtros opcionales
    if (query.fecha_desde) {
      queryBuilder = queryBuilder.gte('fecha', query.fecha_desde);
    }

    if (query.fecha_hasta) {
      queryBuilder = queryBuilder.lte('fecha', query.fecha_hasta);
    }

    if (query.tipo) {
      queryBuilder = queryBuilder.eq('tipo', query.tipo);
    }

    if (query.conciliado !== undefined) {
      queryBuilder = this.applyConciliadoFilter(queryBuilder, query.conciliado);
    }

    const esExtracto = this.toRuntimeBoolean(query.es_extracto);
    if (esExtracto !== undefined) {
      queryBuilder = queryBuilder.eq('es_extracto', esExtracto);
    }

    if (query.conciliacion_id) {
      queryBuilder = queryBuilder.eq('conciliacion_id', query.conciliacion_id);
    }

    // Ordenar por fecha
    queryBuilder = queryBuilder
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    const { data: movimientos, error } = await queryBuilder;

    if (error) {
      console.error('Error obteniendo movimientos para exportar:', error);
      throw new BadRequestException('No se pudieron obtener los movimientos para exportar');
    }

    // Generar CSV
    const headers = [
      'Fecha',
      'Tipo',
      'Descripción',
      'Proveedor',
      'RUC',
      'Referencia',
      'Monto',
      'Conciliado',
      'Fecha Registro'
    ];

    const rows = (movimientos || []).map(mov => [
      this.formatDate(mov.fecha),
      mov.tipo,
      this.escapeCsvValue(mov.descripcion),
      mov.proveedores ? this.escapeCsvValue(mov.proveedores.razon_social) : '',
      mov.proveedores ? mov.proveedores.ruc : '',
      mov.referencia || '',
      mov.monto.toFixed(2),
      mov.conciliado ? 'Sí' : 'No',
      this.formatDateTime(mov.created_at)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Generar nombre de archivo
    const fechaActual = new Date().toISOString().split('T')[0];
    const filename = `movimientos_${cuenta.banco}_${cuenta.numero_cuenta}_${fechaActual}.csv`;

    return {
      success: true,
      data: csvContent,
      filename,
    };
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  private formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private escapeCsvValue(value: string): string {
    if (!value) return '';
    // Si contiene coma, comillas o salto de línea, envolver en comillas y escapar comillas internas
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  async obtenerMovimientosPorPeriodo(
    tenantId: string,
    query: ListarMovimientosQueryDto,
  ): Promise<{ success: boolean; data: any[]; pagination: any; resumen: any }> {
    const client = this.supabase.getClient();

    // Construir query base para obtener movimientos de todas las cuentas
    let queryBuilder = client
      .from('movimientos_bancarios')
      .select('*, cuentas_bancarias(id, nombre, banco, numero_cuenta, moneda), proveedores(id, razon_social, ruc)', { count: 'exact' })
      .eq('tenant_id', tenantId);

    // Aplicar filtros opcionales
    if (query.fecha_desde) {
      queryBuilder = queryBuilder.gte('fecha', query.fecha_desde);
    }

    if (query.fecha_hasta) {
      queryBuilder = queryBuilder.lte('fecha', query.fecha_hasta);
    }

    if (query.tipo) {
      queryBuilder = queryBuilder.eq('tipo', query.tipo);
    }

    if (query.conciliado !== undefined) {
      queryBuilder = this.applyConciliadoFilter(queryBuilder, query.conciliado);
    }

    const esExtracto = this.toRuntimeBoolean(query.es_extracto);
    if (esExtracto !== undefined) {
      queryBuilder = queryBuilder.eq('es_extracto', esExtracto);
    }

    if (query.conciliacion_id) {
      queryBuilder = queryBuilder.eq('conciliacion_id', query.conciliacion_id);
    }

    // Paginación
    const page = query.page || 1;
    const limit = query.limit || 50;
    const offset = (page - 1) * limit;

    queryBuilder = queryBuilder
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: movimientos, error, count } = await queryBuilder;

    if (error) {
      console.error('Error obteniendo movimientos bancarios por período:', error);
      throw new BadRequestException('No se pudieron obtener los movimientos bancarios por período');
    }

    // Calcular resumen del período (sin paginación)
    let resumenQueryBuilder = client
      .from('movimientos_bancarios')
      .select('tipo, monto, cuentas_bancarias(moneda)')
      .eq('tenant_id', tenantId);

    if (query.fecha_desde) {
      resumenQueryBuilder = resumenQueryBuilder.gte('fecha', query.fecha_desde);
    }

    if (query.fecha_hasta) {
      resumenQueryBuilder = resumenQueryBuilder.lte('fecha', query.fecha_hasta);
    }

    if (query.tipo) {
      resumenQueryBuilder = resumenQueryBuilder.eq('tipo', query.tipo);
    }

    if (query.conciliado !== undefined) {
      resumenQueryBuilder = this.applyConciliadoFilter(resumenQueryBuilder, query.conciliado);
    }

    const esExtractoResumen = this.toRuntimeBoolean(query.es_extracto);
    if (esExtractoResumen !== undefined) {
      resumenQueryBuilder = resumenQueryBuilder.eq('es_extracto', esExtractoResumen);
    }

    if (query.conciliacion_id) {
      resumenQueryBuilder = resumenQueryBuilder.eq('conciliacion_id', query.conciliacion_id);
    }

    const { data: todosMovimientos, error: errorResumen } = await resumenQueryBuilder;

    if (errorResumen) {
      console.error('Error calculando resumen de movimientos:', errorResumen);
      // No fallar la operación, solo devolver resumen vacío
    }

    // Calcular totales por moneda
    const resumenPorMoneda = (todosMovimientos || []).reduce((acc, mov) => {
      const moneda = (mov.cuentas_bancarias as any)?.moneda || 'PEN';
      
      if (!acc[moneda]) {
        acc[moneda] = {
          moneda,
          total_abonos: 0,
          total_cargos: 0,
          cantidad_abonos: 0,
          cantidad_cargos: 0,
          flujo_neto: 0,
        };
      }

      if (mov.tipo === 'ABONO') {
        acc[moneda].total_abonos = this.round2(acc[moneda].total_abonos + mov.monto);
        acc[moneda].cantidad_abonos += 1;
      } else {
        acc[moneda].total_cargos = this.round2(acc[moneda].total_cargos + mov.monto);
        acc[moneda].cantidad_cargos += 1;
      }

      acc[moneda].flujo_neto = this.round2(acc[moneda].total_abonos - acc[moneda].total_cargos);

      return acc;
    }, {} as Record<string, any>);

    const resumen = {
      por_moneda: Object.values(resumenPorMoneda).sort((a: any, b: any) => 
        a.moneda.localeCompare(b.moneda)
      ),
      total_movimientos: count || 0,
      periodo: {
        desde: query.fecha_desde || null,
        hasta: query.fecha_hasta || null,
      },
    };

    return {
      success: true,
      data: movimientos || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      resumen,
    };
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
