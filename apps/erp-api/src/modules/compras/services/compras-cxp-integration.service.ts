import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventBusService, RecepcionRegistradaEvent, ERPEvent } from '../../../shared/events/event-bus.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EstadoComparacionCxp, CxpDiscrepanciaDto, TipoDiscrepanciaCxp } from '../../finanzas/cxp/dto';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { v4 as uuidv4 } from 'uuid';

/**
 * Servicio de integración entre Compras y Cuentas por Pagar (CxP)
 * 
 * Este servicio escucha el evento RecepcionRegistrada y crea automáticamente
 * cuentas por pagar basadas en las recepciones de mercancía.
 * 
 * Configuración:
 * - generar_cxp_en: 'RECEPCION' | 'APROBACION_OC' (en empresa_config)
 */
@Injectable()
export class ComprasCxpIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(ComprasCxpIntegrationService.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly supabase: SupabaseService,
    private readonly taxCalculator: TaxCalculatorService,
  ) {}

  /**
   * Registra el listener cuando el módulo se inicializa
   */
  onModuleInit() {
    this.logger.log('👂 Registrando listener para RecepcionRegistrada');
    this.eventBus.onRecepcionRegistrada(this.handleRecepcionRegistrada.bind(this));
  }

  /**
   * Maneja el evento RecepcionRegistrada
   * Crea una cuenta por pagar basada en la recepción
   */
  private async handleRecepcionRegistrada(event: ERPEvent): Promise<void> {
    try {
      const data = event.data as RecepcionRegistradaEvent;
      
      this.logger.log(`📦 Procesando RecepcionRegistrada: ${data.numeroRecepcion} (${data.recepcionId})`);
      this.logger.debug(`Datos del evento:`, JSON.stringify(data, null, 2));

      if (process.env.CXP_LEGACY_COMPRAS_INTEGRATION !== 'true') {
        this.logger.log(
          `⏭️ CxP para recepción ${data.numeroRecepcion} delegada al listener canónico CxpEventsListener`,
        );
        return;
      }

      // Verificar configuración de la empresa para saber si debe generar CxP en recepción
      const config = await this.obtenerConfiguracionEmpresa(data.tenantId);
      const generarEn = (config?.generar_cxp_en || 'RECEPCION').toUpperCase();
      if (generarEn !== 'RECEPCION') {
        this.logger.log(`⏭️ Configuración generar_cxp_en=${generarEn} indica no generar CxP al cerrar recepción. Saltando...`);
        return;
      }

      // Verificar si ya existe una CxP para esta recepción (idempotencia)
      const cxpExistente = await this.verificarCxpExistente(data.recepcionId, data.tenantId);
      
      if (cxpExistente) {
        this.logger.warn(`⚠️ Ya existe una CxP para la recepción ${data.numeroRecepcion}. Saltando...`);
        return;
      }

      // Crear cuenta por pagar
      await this.crearCuentaPorPagar(data, config);

      this.logger.log(`✅ CxP creada exitosamente para recepción ${data.numeroRecepcion}`);
    } catch (error) {
      this.logger.error(`❌ Error procesando RecepcionRegistrada:`, error);
      // No lanzamos el error para no bloquear otros listeners
      // En producción, esto debería ir a un sistema de monitoreo
    }
  }

  /**
   * Obtiene la configuración de la empresa
   */
  private async obtenerConfiguracionEmpresa(tenantId: string): Promise<any> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('empresa_config')
        .select('generar_cxp_en, moneda_defecto')
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        this.logger.warn(`⚠️ No se pudo obtener configuración de empresa: ${error.message}`);
        // Por defecto, generar CxP en recepción
        return { generar_cxp_en: 'RECEPCION' };
      }

      return data;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo configuración:`, error);
      return { generar_cxp_en: 'RECEPCION' };
    }
  }

  /**
   * Verifica si ya existe una CxP para esta recepción
   */
  private async verificarCxpExistente(recepcionId: string, tenantId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('cuentas_por_pagar')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('referencia_tipo', 'RECEPCION')
        .eq('referencia_id', recepcionId)
        .limit(1);

      if (error) {
        this.logger.error(`❌ Error verificando CxP existente:`, error);
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      this.logger.error(`❌ Error en verificarCxpExistente:`, error);
      return false;
    }
  }

  /**
   * Crea una cuenta por pagar basada en la recepción
   * Maneja recepciones parciales calculando el monto exacto recibido
   */
  private async crearCuentaPorPagar(data: RecepcionRegistradaEvent, empresaConfig?: any): Promise<void> {
    try {
      // Obtener información adicional del proveedor para condiciones de pago
      const { data: proveedor, error: proveedorError } = await this.supabase.getClient()
        .from('proveedores')
        .select('condiciones_pago, dias_credito')
        .eq('tenant_id', data.tenantId)
        .eq('id', data.proveedorId)
        .single();

      if (proveedorError) {
        this.logger.warn(`⚠️ No se pudo obtener información del proveedor: ${proveedorError.message}`);
      }

      // Calcular el monto real de esta recepción parcial
      const montosRecepcion = await this.calcularMontoRecepcionParcial(data);
      
      this.logger.log(`💰 Montos calculados para recepción parcial:`);
      this.logger.log(`   - Subtotal: ${montosRecepcion.subtotal}`);
      this.logger.log(`   - IGV: ${montosRecepcion.igv}`);
      this.logger.log(`   - Total: ${montosRecepcion.total}`);

      const comparacion = await this.calcularDiscrepanciasRecepcion(data);
      const eventId = uuidv4();
      const idempotencyKey =
        data.idempotencyKey ?? `recepcion:${data.tenantId}:${data.recepcionId}`;

      const moneda = data.moneda || empresaConfig?.moneda_defecto || 'PEN';

      // Calcular fecha de vencimiento según condiciones de pago
      const condicionesPago = data.condicionesPago || proveedor?.condiciones_pago;
      const diasCredito = data.diasCredito || proveedor?.dias_credito || 0;
      const fechaVencimiento = this.calcularFechaVencimientoSegunCondiciones(
        data.fechaRecepcion,
        condicionesPago,
        diasCredito
      );

      // Generar número de CxP
      const numeroCxp = await this.generarNumeroCxp(data.tenantId);

      // Verificar si es una recepción parcial
      const esRecepcionParcial = await this.esRecepcionParcial(data.ordenId, data.tenantId);
      const observacionesBase = esRecepcionParcial
        ? `CxP generada automáticamente desde recepción parcial ${data.numeroRecepcion} de OC ${data.numeroOrden}`
        : `CxP generada automáticamente desde recepción ${data.numeroRecepcion}`;
      const observaciones =
        comparacion.estado === EstadoComparacionCxp.OK
          ? observacionesBase
          : `${observacionesBase} (con discrepancias detectadas)`;

      // Crear la cuenta por pagar con el monto exacto de la recepción
      const { data: cxp, error: cxpError } = await this.supabase.getClient()
        .from('cuentas_por_pagar')
        .insert({
          tenant_id: data.tenantId,
          numero: numeroCxp,
          proveedor_id: data.proveedorId,
          tipo_documento: 'RECEPCION',
          numero_documento: data.numeroRecepcion,
          fecha_emision: data.fechaRecepcion,
          fecha_vencimiento: fechaVencimiento,
          moneda,
          subtotal: montosRecepcion.subtotal,
          igv: montosRecepcion.igv,
          total: montosRecepcion.total,
          saldo: montosRecepcion.total,
          estado: 'PENDIENTE',
          referencia_tipo: 'RECEPCION',
          referencia_id: data.recepcionId,
          orden_id: data.ordenId,
          condiciones_pago: data.condicionesPago || proveedor?.condiciones_pago || `${diasCredito} días`,
          observaciones,
          estado_comparacion: comparacion.estado,
          discrepancias: comparacion.discrepancias.length > 0 ? comparacion.discrepancias : null,
          event_id: eventId,
          idempotency_key: idempotencyKey,
        })
        .select()
        .single();

      if (cxpError) {
        throw new Error(`Error creando CxP: ${cxpError.message}`);
      }

      this.logger.log(`✅ CxP creada: ${numeroCxp} - Monto: ${montosRecepcion.total} ${moneda} - Vencimiento: ${fechaVencimiento}`);
      
      if (esRecepcionParcial) {
        this.logger.log(`📦 Recepción parcial detectada. CxP creada solo por el monto recibido.`);
      }

      try {
        this.eventBus.emitFacturaProveedorRegistrada({
          tenantId: data.tenantId,
          eventId,
          idempotencyKey,
          facturaProvId: cxp.id,
          numeroDocumento: data.numeroRecepcion,
          serie: null,
          ordenId: data.ordenId ?? null,
          recepcionId: data.recepcionId,
          proveedorId: data.proveedorId,
          subtotal: montosRecepcion.subtotal,
          igv: montosRecepcion.igv,
          total: montosRecepcion.total,
          detraccion: null,
          moneda,
          tipoCambio: null,
          fechaEmision: data.fechaRecepcion,
          fechaVencimiento,
          estadoComparacion: comparacion.estado,
          discrepancias: comparacion.discrepancias.length > 0 ? comparacion.discrepancias : undefined,
        });
        this.logger.log(
          `✅ Evento FacturaProveedorRegistrada emitido (${eventId}) para recepción ${data.numeroRecepcion}`,
        );
      } catch (eventoError) {
        this.logger.error('❌ Error emitiendo evento FacturaProveedorRegistrada:', eventoError as Error);
      }
    } catch (error) {
      this.logger.error(`❌ Error en crearCuentaPorPagar:`, error);
      throw error;
    }
  }

  private async calcularDiscrepanciasRecepcion(
    data: RecepcionRegistradaEvent,
  ): Promise<{ estado: EstadoComparacionCxp; discrepancias: CxpDiscrepanciaDto[] }> {
    if (!data.ordenId || !data.items?.length) {
      return { estado: EstadoComparacionCxp.OK, discrepancias: [] };
    }

    const { data: orden, error } = await this.supabase
      .getClient()
      .from('ordenes_compra')
      .select(
        `
        id,
        detalles:orden_compra_detalles!fk_orden_compra_detalles_orden_id(
          producto_id,
          cantidad,
          precio_unitario
        )
      `,
      )
      .eq('tenant_id', data.tenantId)
      .eq('id', data.ordenId)
      .maybeSingle();

    if (error || !orden?.detalles) {
      this.logger.warn(
        `⚠️ No se pudieron obtener detalles de la orden ${data.ordenId} para validar discrepancias`,
      );
      return { estado: EstadoComparacionCxp.OK, discrepancias: [] };
    }

    const detalles = (orden.detalles ?? []) as Array<{
      producto_id: string;
      cantidad: number;
      precio_unitario: number;
    }>;

    const itemsPorProducto = new Map<string, { cantidad: number; precio: number }>();
    for (const item of data.items ?? []) {
      if (item.calidad && item.calidad.toUpperCase() === 'RECHAZADO') {
        continue;
      }
      const entry = itemsPorProducto.get(item.productoId) ?? { cantidad: 0, precio: 0 };
      entry.cantidad += Number(item.cantidadRecibida ?? 0);
      entry.precio = Number(item.precioUnitario ?? entry.precio);
      itemsPorProducto.set(item.productoId, entry);
    }

    const discrepancias: CxpDiscrepanciaDto[] = [];
    let estado: EstadoComparacionCxp = EstadoComparacionCxp.OK;
    const toleranciaCantidad = 0.0001;
    const toleranciaPrecio = 0.01;

    for (const detalle of detalles) {
      const productoId = detalle.producto_id;
      const esperadoCantidad = Number(detalle.cantidad ?? 0);
      const esperadoPrecio = Number(detalle.precio_unitario ?? 0);
      const recibido = itemsPorProducto.get(productoId);
      const cantidadRecibida = recibido?.cantidad ?? 0;
      const precioRecibido = recibido?.precio ?? esperadoPrecio;

      if (Math.abs(cantidadRecibida - esperadoCantidad) > toleranciaCantidad) {
        discrepancias.push({
          tipo: TipoDiscrepanciaCxp.CANTIDAD,
          productoId,
          recibido: cantidadRecibida,
          facturado: cantidadRecibida,
          esperado: esperadoCantidad,
        });
        if (estado !== EstadoComparacionCxp.DESVIACION_PRECIO) {
          estado = EstadoComparacionCxp.DESVIACION_CANTIDAD;
        }
      }

      if (Math.abs(precioRecibido - esperadoPrecio) > toleranciaPrecio) {
        discrepancias.push({
          tipo: TipoDiscrepanciaCxp.PRECIO,
          productoId,
          recibido: precioRecibido,
          facturado: precioRecibido,
          esperado: esperadoPrecio,
        });
        estado = EstadoComparacionCxp.DESVIACION_PRECIO;
      }
    }

    for (const [productoId, info] of itemsPorProducto.entries()) {
      const detalle = detalles.find((d) => d.producto_id === productoId);
      if (!detalle) {
        discrepancias.push({
          tipo: TipoDiscrepanciaCxp.CANTIDAD,
          productoId,
          recibido: info.cantidad,
          facturado: info.cantidad,
          esperado: 0,
        });
        if (estado !== EstadoComparacionCxp.DESVIACION_PRECIO) {
          estado = EstadoComparacionCxp.DESVIACION_CANTIDAD;
        }
      }
    }

    return { estado, discrepancias };
  }

  /**
   * Calcula el monto exacto de una recepción parcial
   * Obtiene los precios de los items desde orden_compra_detalles
   */
  private async calcularMontoRecepcionParcial(data: RecepcionRegistradaEvent): Promise<{
    subtotal: number;
    igv: number;
    total: number;
  }> {
    try {
      this.logger.log(`🧮 Calculando monto de recepción parcial ${data.numeroRecepcion}`);

      // Obtener los detalles de la orden de compra con precios
      const { data: ordenDetalles, error: detallesError } = await this.supabase.getClient()
        .from('orden_compra_detalles')
        .select('id, producto_id, precio_unitario, cantidad')
        .eq('orden_id', data.ordenId);

      if (detallesError) {
        this.logger.error(`❌ Error obteniendo detalles de orden: ${detallesError.message}`);
        throw new Error(`Error obteniendo detalles de orden: ${detallesError.message}`);
      }

      // Obtener los items de la recepción con cantidades recibidas
      const { data: recepcionItems, error: itemsError } = await this.supabase.getClient()
        .from('recepcion_items')
        .select('producto_id, cantidad_recibida, detalle_id, calidad')
        .eq('recepcion_id', data.recepcionId);

      if (itemsError) {
        this.logger.error(`❌ Error obteniendo items de recepción: ${itemsError.message}`);
        throw new Error(`Error obteniendo items de recepción: ${itemsError.message}`);
      }

      // Calcular el subtotal basado en las cantidades recibidas y precios de la orden
      let subtotal = 0;

      for (const item of recepcionItems) {
        // Solo considerar items con calidad OK u OBSERVADO (no RECHAZADO)
        if (item.calidad === 'RECHAZADO') {
          this.logger.log(`⏭️ Saltando item rechazado: producto ${item.producto_id}`);
          continue;
        }

        // Buscar el detalle correspondiente en la orden
        const detalle = ordenDetalles.find(d => d.id === item.detalle_id);
        
        if (!detalle) {
          this.logger.warn(`⚠️ No se encontró detalle de orden para item de recepción: ${item.detalle_id}`);
          continue;
        }

        const precioUnitario = Number(detalle.precio_unitario);
        const cantidadRecibida = Number(item.cantidad_recibida);
        const totalItem = precioUnitario * cantidadRecibida;

        subtotal += totalItem;

        this.logger.log(`   📦 Producto ${item.producto_id}: ${cantidadRecibida} x ${precioUnitario} = ${totalItem}`);
      }

      // ✅ CORRECCIÓN: Calcular IGV usando TaxCalculatorService
      const taxResult = await this.taxCalculator.calcularImpuestos({
        subtotal,
        tenantId: data.tenantId,
      });
      
      const igv = taxResult.igv;
      const total = taxResult.total;

      this.logger.log(`✅ Cálculo completado: Subtotal=${subtotal}, IGV=${igv}, Total=${total}`);

      return {
        subtotal: Number(subtotal.toFixed(2)),
        igv: Number(igv.toFixed(2)),
        total: Number(total.toFixed(2)),
      };
    } catch (error) {
      this.logger.error(`❌ Error en calcularMontoRecepcionParcial:`, error);
      // En caso de error, usar los montos del evento como fallback
      this.logger.warn(`⚠️ Usando montos del evento como fallback`);
      return {
        subtotal: data.subtotal,
        igv: data.igv,
        total: data.total,
      };
    }
  }

  /**
   * Verifica si una orden tiene recepciones parciales
   * (es decir, si hay más de una recepción o si no se ha recibido todo)
   */
  private async esRecepcionParcial(ordenId: string, tenantId: string): Promise<boolean> {
    try {
      // Contar cuántas recepciones cerradas tiene esta orden
      const { data: recepciones, error: recepcionesError } = await this.supabase.getClient()
        .from('recepciones')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('orden_id', ordenId)
        .eq('estado', 'CERRADA');

      if (recepcionesError) {
        this.logger.error(`❌ Error verificando recepciones: ${recepcionesError.message}`);
        return false;
      }

      // Si hay más de una recepción, es parcial
      if (recepciones && recepciones.length > 1) {
        return true;
      }

      // Verificar si la orden está en estado PARCIAL
      const { data: orden, error: ordenError } = await this.supabase.getClient()
        .from('ordenes_compra')
        .select('estado')
        .eq('tenant_id', tenantId)
        .eq('id', ordenId)
        .single();

      if (ordenError) {
        this.logger.error(`❌ Error obteniendo estado de orden: ${ordenError.message}`);
        return false;
      }

      return orden?.estado === 'PARCIAL';
    } catch (error) {
      this.logger.error(`❌ Error en esRecepcionParcial:`, error);
      return false;
    }
  }

  /**
   * Calcula la fecha de vencimiento basada en días de crédito
   * Soporta diferentes formatos de condiciones de pago
   */
  private calcularFechaVencimiento(fechaEmision: string, diasCredito: number): string {
    const fecha = new Date(fechaEmision);
    fecha.setDate(fecha.getDate() + diasCredito);
    return fecha.toISOString().split('T')[0];
  }

  /**
   * Calcula la fecha de vencimiento basada en condiciones de pago
   * Soporta múltiples formatos:
   * - "CONTADO" -> 0 días
   * - "CREDITO_30" -> 30 días
   * - "30 días" -> 30 días
   * - "Fin de mes" -> último día del mes actual
   * - "Fin de mes + 30" -> último día del mes + 30 días
   * - "15/30/45" -> primera cuota a 15 días (para CxP se usa la primera fecha)
   * 
   * @param fechaEmision Fecha de emisión del documento
   * @param condicionesPago Condiciones de pago en formato texto
   * @param diasCreditoFallback Días de crédito a usar si no se puede parsear condicionesPago
   * @returns Fecha de vencimiento en formato ISO (YYYY-MM-DD)
   */
  private calcularFechaVencimientoSegunCondiciones(
    fechaEmision: string,
    condicionesPago: string | null | undefined,
    diasCreditoFallback: number = 0
  ): string {
    const fecha = new Date(fechaEmision);
    
    // Si no hay condiciones de pago, usar días de crédito fallback
    if (!condicionesPago || condicionesPago.trim() === '') {
      return this.calcularFechaVencimiento(fechaEmision, diasCreditoFallback);
    }

    const condiciones = condicionesPago.trim().toUpperCase();

    // CONTADO: pago inmediato (0 días)
    if (condiciones === 'CONTADO' || condiciones === 'CASH') {
      return fecha.toISOString().split('T')[0];
    }

    // CREDITO_XX: formato con número de días
    const creditoMatch = condiciones.match(/CREDITO[_\s]*(\d+)/);
    if (creditoMatch) {
      const dias = parseInt(creditoMatch[1]);
      return this.calcularFechaVencimiento(fechaEmision, dias);
    }

    // "XX días" o "XX dias": formato con número de días
    const diasMatch = condiciones.match(/(\d+)\s*D[IÍ]AS?/);
    if (diasMatch) {
      const dias = parseInt(diasMatch[1]);
      return this.calcularFechaVencimiento(fechaEmision, dias);
    }

    // "Fin de mes" o "Fin de mes + XX"
    if (condiciones.includes('FIN DE MES') || condiciones.includes('FIN MES')) {
      // Ir al último día del mes actual
      const ultimoDiaMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
      
      // Buscar si hay días adicionales después del fin de mes
      const finMesMatch = condiciones.match(/FIN\s+(?:DE\s+)?MES\s*\+\s*(\d+)/);
      if (finMesMatch) {
        const diasAdicionales = parseInt(finMesMatch[1]);
        ultimoDiaMes.setDate(ultimoDiaMes.getDate() + diasAdicionales);
      }
      
      return ultimoDiaMes.toISOString().split('T')[0];
    }

    // Cuotas múltiples "15/30/45" o "15-30-45"
    // Para CxP tomamos la primera cuota como vencimiento principal
    const cuotasMatch = condiciones.match(/^(\d+)[\/\-](\d+)/);
    if (cuotasMatch) {
      const primeraCuota = parseInt(cuotasMatch[1]);
      this.logger.log(`📅 Detectadas cuotas múltiples. Usando primera cuota: ${primeraCuota} días`);
      return this.calcularFechaVencimiento(fechaEmision, primeraCuota);
    }

    // Si no se pudo parsear, usar días de crédito fallback
    this.logger.warn(`⚠️ No se pudo parsear condiciones de pago: "${condicionesPago}". Usando ${diasCreditoFallback} días`);
    return this.calcularFechaVencimiento(fechaEmision, diasCreditoFallback);
  }

  /**
   * Genera el siguiente número de CxP
   */
  private async generarNumeroCxp(tenantId: string): Promise<string> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('cuentas_por_pagar')
        .select('numero')
        .eq('tenant_id', tenantId)
        .like('numero', 'CXP-%')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        this.logger.error('❌ Error generando número de CxP:', error);
      }

      let nextNumber = 1;
      if (data && data.length > 0) {
        const lastNumber = data[0].numero;
        const match = lastNumber.match(/CXP-\d{4}-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const year = new Date().getFullYear();
      return `CXP-${year}-${nextNumber.toString().padStart(4, '0')}`;
    } catch (error) {
      this.logger.error('❌ Error en generarNumeroCxp:', error);
      // Fallback
      return `CXP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    }
  }
}
