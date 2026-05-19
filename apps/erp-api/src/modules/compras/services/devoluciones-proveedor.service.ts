import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { DevolucionesProveedorRepository } from '../repositories/devoluciones-proveedor.repository';
import { CreateDevolucionProveedorDto } from '../dto/create-devolucion-proveedor.dto';
import { InventarioService } from '../../inventario/inventario.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { EventEmitterService } from '../../../shared/events/event-emitter.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class DevolucionesProveedorService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly devolucionesRepository: DevolucionesProveedorRepository,
    private readonly inventarioService: InventarioService,
    private readonly eventBus: EventBusService,
    private readonly eventEmitter: EventEmitterService,
    private readonly taxCalculator: TaxCalculatorService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Crea una nueva devolución a proveedor en estado PENDIENTE
   */
  async crearDevolucion(
    tenantId: string,
    createDto: CreateDevolucionProveedorDto,
    userId?: string,
  ): Promise<any> {
    try {
      console.log(`📦 [Devoluciones] Creando devolución para tenant: ${tenantId}`);

      // Validar que la orden de compra existe y pertenece al tenant
      const { data: orden, error: ordenError } = await this.supabase.getClient()
        .from('ordenes_compra')
        .select('id, numero, proveedor_id, estado')
        .eq('id', createDto.orden_id)
        .eq('tenant_id', tenantId)
        .single();

      if (ordenError || !orden) {
        throw new NotFoundException('Orden de compra no encontrada');
      }

      // Validar que el proveedor coincide con el de la orden
      if (orden.proveedor_id !== createDto.proveedor_id) {
        throw new BadRequestException('El proveedor no coincide con el de la orden de compra');
      }

      if (!createDto.recepcion_id) {
        throw new BadRequestException('Debe seleccionar una recepción cerrada para registrar la devolución');
      }

      const { data: recepcion, error: recepcionError } = await this.supabase.getClient()
        .from('recepciones')
        .select('id, orden_id, estado')
        .eq('id', createDto.recepcion_id)
        .eq('tenant_id', tenantId)
        .single();

      if (recepcionError || !recepcion) {
        throw new NotFoundException('Recepción no encontrada');
      }

      if (recepcion.orden_id !== createDto.orden_id) {
        throw new BadRequestException('La recepción no pertenece a la orden de compra especificada');
      }

      if (recepcion.estado !== 'CERRADA') {
        throw new BadRequestException('Solo se pueden devolver items de recepciones cerradas');
      }

      // Validar que los items tienen cantidades válidas
      if (!createDto.items || createDto.items.length === 0) {
        throw new BadRequestException('Debe especificar al menos un item para devolver');
      }

      await this.validarItemsContraRecepcion(tenantId, createDto);

      // Calcular totales
      let subtotal = 0;
      for (const item of createDto.items) {
        const itemSubtotal = item.cantidad * item.precio_unitario;
        subtotal += itemSubtotal;
      }

      // ✅ CORRECCIÓN SRP: Usar TaxCalculatorService centralizado
      const taxResult = await this.taxCalculator.calcularImpuestos({
        subtotal,
        tenantId,
      });
      const igv = taxResult.igv;
      const total = taxResult.total;

      // Generar número de devolución
      const numero = await this.devolucionesRepository.generarNumeroDevolucion(tenantId);

      // Crear la devolución
      const devolucionData = {
        numero,
        recepcion_id: createDto.recepcion_id || null,
        orden_id: createDto.orden_id,
        proveedor_id: createDto.proveedor_id,
        fecha_devolucion: new Date().toISOString().split('T')[0],
        estado: 'PENDIENTE',
        motivo: createDto.motivo,
        subtotal,
        igv,
        total,
        observaciones: createDto.observaciones || null,
      };

      const devolucion = await this.devolucionesRepository.crear(tenantId, devolucionData, userId);

      // Crear los items de la devolución
      const itemsData = createDto.items.map(item => ({
        devolucion_id: devolucion.id,
        recepcion_item_id: item.recepcion_item_id || null,
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.cantidad * item.precio_unitario,
        almacen_id: item.almacen_id || null,
        lote: item.lote || null,
        serie: item.serie || null,
        motivo_detalle: item.motivo_detalle || null,
      }));

      const items = await this.devolucionesRepository.crearItems(itemsData);

      console.log(`✅ Devolución creada: ${devolucion.numero} con ${items.length} items`);

      if (userId) {
        try {
          await this.auditService.registrarCambio(
            'devoluciones_proveedor',
            'INSERT',
            userId,
            {
              new: {
                ...devolucion,
                items,
              },
            },
            tenantId,
            devolucion.id,
            {
              accion: 'CREAR_DEVOLUCION_PROVEEDOR',
              orden_id: createDto.orden_id,
              recepcion_id: createDto.recepcion_id,
              proveedor_id: createDto.proveedor_id,
            },
          );
        } catch (auditError) {
          console.warn('⚠️ No se pudo registrar auditoría de creación de devolución:', auditError);
        }
      }

      // Retornar la devolución completa con sus items
      return {
        ...devolucion,
        items,
      };
    } catch (error) {
      console.error('❌ Error en crearDevolucion:', error);
      throw error;
    }
  }

  /**
   * Obtiene todas las devoluciones con filtros opcionales
   */
  async obtenerDevoluciones(tenantId: string, filtros?: any): Promise<any[]> {
    try {
      console.log(`📦 [Devoluciones] Obteniendo devoluciones para tenant: ${tenantId}`);
      return await this.devolucionesRepository.listar(tenantId, filtros);
    } catch (error) {
      console.error('❌ Error en obtenerDevoluciones:', error);
      throw error;
    }
  }

  /**
   * Obtiene una devolución específica por ID
   */
  async obtenerDevolucionPorId(devolucionId: string, tenantId: string): Promise<any> {
    try {
      console.log(`📦 [Devoluciones] Obteniendo devolución ${devolucionId}`);
      const devolucion = await this.devolucionesRepository.obtenerPorId(devolucionId, tenantId);
      
      if (!devolucion) {
        throw new NotFoundException('Devolución no encontrada');
      }

      return devolucion;
    } catch (error) {
      console.error('❌ Error en obtenerDevolucionPorId:', error);
      throw error;
    }
  }

  /**
   * Emite una devolución a proveedor
   * Lógica de Emisión:
   * 1. Validar que la devolución está en estado PENDIENTE
   * 2. Crear movimientos de inventario (tipo SALIDA para devolución)
   * 3. Actualizar producto_existencias (descontar stock)
   * 4. Actualizar estado de devolución a EMITIDA
   * 5. Emitir evento DevolucionProveedorEmitida
   * 
   * Nota: La creación de nota de crédito de proveedor (CxP) se implementará
   * cuando el módulo de finanzas esté disponible
   */
  async emitirDevolucion(devolucionId: string, tenantId: string, userId?: string): Promise<any> {
    try {
      console.log(`📤 [Devoluciones] Emitiendo devolución ${devolucionId} para tenant: ${tenantId}`);

      // 1. Obtener la devolución con sus items
      const devolucion = await this.devolucionesRepository.obtenerPorId(devolucionId, tenantId);
      
      if (!devolucion) {
        throw new NotFoundException('Devolución no encontrada');
      }

      // Validar que está en estado PENDIENTE
      if (devolucion.estado !== 'PENDIENTE') {
        throw new BadRequestException(
          `La devolución ya fue procesada. Estado actual: ${devolucion.estado}`
        );
      }

      // Validar que tiene items
      if (!devolucion.items || devolucion.items.length === 0) {
        throw new BadRequestException('La devolución no tiene items para procesar');
      }

      console.log(`📦 Procesando ${devolucion.items.length} items de la devolución ${devolucion.numero}`);

      // 2. Actualizar stock e inventario para cada item. `descontarStock` ya crea el
      // movimiento SALIDA, por lo que no se debe registrar otro movimiento manual.
      for (const item of devolucion.items) {
        console.log(`  📤 Procesando item: ${item.producto?.nombre || item.producto_id} - Cantidad: ${item.cantidad}`);

        try {
          await this.inventarioService.descontarStock(
            item.producto_id,
            item.cantidad,
            tenantId,
            'DEVOLUCION_PROVEEDOR',
            devolucionId
          );

          console.log(`  ✅ Item procesado: ${item.producto?.nombre || item.producto_id}`);
        } catch (error) {
          console.error(`  ❌ Error procesando item ${item.producto_id}:`, error);
          throw new BadRequestException(
            `Error procesando item ${item.producto?.nombre || item.producto_id}: ${error.message}`
          );
        }
      }

      // 3. Actualizar estado de la devolución a EMITIDA
      const devolucionActualizada = await this.devolucionesRepository.actualizarEstado(
        devolucionId,
        tenantId,
        'EMITIDA',
        userId
      );

      console.log(`✅ Devolución ${devolucion.numero} emitida exitosamente`);

      if (userId) {
        try {
          await this.auditService.registrarCambio(
            'devoluciones_proveedor',
            'UPDATE',
            userId,
            {
              old: { estado: devolucion.estado },
              new: { estado: 'EMITIDA' },
            },
            tenantId,
            devolucionId,
            {
              accion: 'EMITIR_DEVOLUCION_PROVEEDOR',
              orden_id: devolucion.orden_id,
              recepcion_id: devolucion.recepcion_id,
              proveedor_id: devolucion.proveedor_id,
            },
          );
        } catch (auditError) {
          console.warn('⚠️ No se pudo registrar auditoría de emisión de devolución:', auditError);
        }
      }

      // 4. Emitir evento de dominio DevolucionProveedorEmitida
      try {
        await this.emitirEventoDevolucionEmitida(devolucion, tenantId, userId);
      } catch (eventError) {
        console.error('⚠️ Error publicando evento DevolucionProveedorEmitida:', eventError);
        // No fallar la operación si el evento falla
      }

      // Nota: El ajuste de CxP se realiza automáticamente a través del evento
      // DevolucionProveedorEmitida → CxpEventsListener → cxpService.aplicarDevolucionProveedorEmitida()

      // Retornar la devolución actualizada con sus items
      return {
        ...devolucionActualizada,
        items: devolucion.items,
      };
    } catch (error) {
      console.error('❌ Error en emitirDevolucion:', error);
      throw error;
    }
  }

  /**
   * Emite el evento DevolucionProveedorEmitida para integración con CxP y Contabilidad
   */
  private async emitirEventoDevolucionEmitida(
    devolucion: any,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    try {
      console.log(`📡 [Devoluciones] Emitiendo evento DevolucionProveedorEmitida para ${devolucion.numero}`);

      // Obtener información del proveedor
      const { data: proveedor, error: proveedorError } = await this.supabase.getClient()
        .from('proveedores')
        .select('razon_social')
        .eq('id', devolucion.proveedor_id)
        .eq('tenant_id', tenantId)
        .single();

      if (proveedorError) {
        console.error('❌ Error obteniendo proveedor para evento:', proveedorError);
      }

      // Obtener información de la orden
      const { data: orden, error: ordenError } = await this.supabase.getClient()
        .from('ordenes_compra')
        .select('numero, moneda')
        .eq('id', devolucion.orden_id)
        .eq('tenant_id', tenantId)
        .single();

      if (ordenError) {
        console.error('❌ Error obteniendo orden para evento:', ordenError);
      }

      const moneda =
        devolucion.moneda ||
        orden?.moneda ||
        (await this.obtenerMonedaDefectoEmpresa(tenantId)) ||
        'PEN';

      // Obtener información de la recepción si existe
      let numeroRecepcion: string | undefined;
      if (devolucion.recepcion_id) {
        const { data: recepcion, error: recepcionError } = await this.supabase.getClient()
          .from('recepciones')
          .select('numero')
          .eq('id', devolucion.recepcion_id)
          .eq('tenant_id', tenantId)
          .single();

        if (!recepcionError && recepcion) {
          numeroRecepcion = recepcion.numero;
        }
      }

      const idempotencyKey = `devolucion:${tenantId}:${devolucion.id}`;

      // Construir el payload del evento
      const eventData = {
        devolucionId: devolucion.id,
        numeroDevolucion: devolucion.numero,
        ordenId: devolucion.orden_id,
        numeroOrden: orden?.numero,
        recepcionId: devolucion.recepcion_id,
        numeroRecepcion,
        proveedorId: devolucion.proveedor_id,
        proveedorNombre: proveedor?.razon_social || 'Proveedor desconocido',
        fechaDevolucion: devolucion.fecha_devolucion,
        motivo: devolucion.motivo,
        subtotal: devolucion.subtotal,
        igv: devolucion.igv,
        total: devolucion.total,
        moneda,
        idempotencyKey,
        items: devolucion.items.map(item => ({
          productoId: item.producto_id,
          descripcion: item.descripcion || item.producto?.nombre || 'Producto',
          cantidad: item.cantidad,
          precioUnitario: item.precio_unitario,
          subtotal: item.subtotal,
          motivoDetalle: item.motivo_detalle,
          lote: item.lote,
          serie: item.serie,
        })),
        emitidoPor: userId,
        emitidoEn: new Date().toISOString(),
        tenantId,
      };

      // Persistir en outbox
      try {
        await this.eventEmitter.emit({
          tenantId,
          eventType: 'devolucion.proveedor.registrada',
          aggregateType: 'devolucion_proveedor',
          aggregateId: devolucion.id,
          eventData: { ...eventData, idempotency_key: idempotencyKey },
          correlationId: idempotencyKey,
          idempotencyKey,
        });
        console.log(`✅ Evento devolucion.proveedor.registrada guardado en outbox (${idempotencyKey})`);
      } catch (emitError) {
        console.error('❌ Error guardando outbox devolucion.proveedor.registrada:', emitError);
      }

      // Emitimos en caliente para compatibilidad
      this.eventBus.emitDevolucionProveedorEmitida(eventData);
      console.log(`✅ Evento DevolucionProveedorEmitida emitido exitosamente para ${devolucion.numero}`);
    } catch (error) {
      console.error('❌ Error emitiendo evento DevolucionProveedorEmitida:', error);
      // No lanzamos el error para no bloquear la emisión de la devolución
      // En producción, esto debería ir a un sistema de monitoreo
    }
  }

  private async obtenerMonedaDefectoEmpresa(tenantId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .getClient()
        .from('empresa_config')
        .select('moneda_defecto')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        console.warn(`⚠️ [Devoluciones] No se pudo obtener moneda_defecto: ${error.message}`);
        return null;
      }

      return (data?.moneda_defecto || null) as string | null;
    } catch (error) {
      console.warn(`⚠️ [Devoluciones] Error obteniendo moneda_defecto:`, error);
      return null;
    }
  }

  private async validarItemsContraRecepcion(
    tenantId: string,
    createDto: CreateDevolucionProveedorDto,
  ): Promise<void> {
    const recepcionItemIds = createDto.items
      .map((item) => item.recepcion_item_id)
      .filter((id): id is string => Boolean(id));

    if (recepcionItemIds.length !== createDto.items.length) {
      throw new BadRequestException('Toda devolución asociada a una recepción debe referenciar sus items de recepción');
    }

    const { data: recepcionItems, error: recepcionItemsError } = await this.supabase
      .getClient()
      .from('recepcion_items')
      .select('id, recepcion_id, producto_id, cantidad_recibida')
      .eq('recepcion_id', createDto.recepcion_id)
      .in('id', recepcionItemIds);

    if (recepcionItemsError) {
      throw new BadRequestException('No se pudieron validar los items de la recepción');
    }

    const recibidosPorItem = new Map(
      (recepcionItems || []).map((item: any) => [
        item.id,
        {
          productoId: item.producto_id,
          cantidadRecibida: Number(item.cantidad_recibida || 0),
        },
      ]),
    );

    for (const item of createDto.items) {
      const recibido = recibidosPorItem.get(item.recepcion_item_id!);
      if (!recibido) {
        throw new BadRequestException('El item de devolución no pertenece a la recepción seleccionada');
      }

      if (recibido.productoId !== item.producto_id) {
        throw new BadRequestException('El producto de la devolución no coincide con el item de recepción');
      }
    }

    const { data: devolucionesPrevias, error: devolucionesPreviasError } = await this.supabase
      .getClient()
      .from('devolucion_items')
      .select(
        `
          recepcion_item_id,
          cantidad,
          devolucion:devoluciones_proveedor!inner(
            id,
            estado,
            tenant_id,
            recepcion_id
          )
        `,
      )
      .eq('tenant_id', tenantId)
      .in('recepcion_item_id', recepcionItemIds);

    if (devolucionesPreviasError) {
      throw new BadRequestException('No se pudieron validar devoluciones previas de la recepción');
    }

    const devueltoPorItem = new Map<string, number>();
    for (const row of devolucionesPrevias || []) {
      const devolucion = Array.isArray((row as any).devolucion)
        ? (row as any).devolucion[0]
        : (row as any).devolucion;

      if (
        devolucion?.tenant_id !== tenantId ||
        devolucion?.recepcion_id !== createDto.recepcion_id ||
        devolucion?.estado === 'ANULADA'
      ) {
        continue;
      }

      const itemId = (row as any).recepcion_item_id;
      devueltoPorItem.set(itemId, (devueltoPorItem.get(itemId) || 0) + Number((row as any).cantidad || 0));
    }

    for (const item of createDto.items) {
      const recibido = recibidosPorItem.get(item.recepcion_item_id!)!;
      const devueltoPrevio = devueltoPorItem.get(item.recepcion_item_id!) || 0;
      const disponible = recibido.cantidadRecibida - devueltoPrevio;

      if (item.cantidad > disponible) {
        throw new BadRequestException(
          `La cantidad a devolver (${item.cantidad}) excede la cantidad disponible de la recepción (${disponible})`,
        );
      }
    }
  }
}
