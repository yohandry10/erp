import { Injectable, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { OrdenesCompraRepository } from '../repositories/ordenes-compra.repository';
import { CreateOrdenCompraDto } from '../dto/create-orden-compra.dto';
import { UpdateOrdenCompraDto } from '../dto/update-orden-compra.dto';
import { AprobarOrdenCompraDto } from '../dto/aprobar-orden-compra.dto';
import { RechazarOrdenCompraDto } from '../dto/rechazar-orden-compra.dto';
import { CancelarOrdenCompraDto } from '../dto/cancelar-orden-compra.dto';
import { CotizacionesCompraRepository } from '../repositories/cotizaciones-compra.repository';
import { OcAprobacionesRepository } from '../repositories/oc-aprobaciones.repository';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType, NotificationSeverity } from '../../notifications/notification.types';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { AuditService } from '../../audit/audit.service';
import { CacheInvalidationService } from '../../../shared/cache/cache-invalidation.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { DevolucionesProveedorService } from './devoluciones-proveedor.service';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OrdenesCompraService {
  private readonly logger = new Logger(OrdenesCompraService.name);

  constructor(
    private readonly ordenesRepository: OrdenesCompraRepository,
    private readonly cotizacionesRepository: CotizacionesCompraRepository,
    private readonly ocAprobacionesRepository: OcAprobacionesRepository,
    private readonly supabaseService: SupabaseService,
    private readonly notificationsService: NotificationsService,
    private readonly eventBusService: EventBusService,
    private readonly auditService: AuditService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly taxCalculator: TaxCalculatorService,
    private readonly devolucionesProveedorService: DevolucionesProveedorService,
  ) { }

  async create(createDto: CreateOrdenCompraDto, tenantId: string, userId?: string) {
    // Validar que el número de orden no exista
    const existingOrden = await this.ordenesRepository.findByNumero(
      createDto.numero,
      tenantId
    );

    if (existingOrden) {
      throw new ConflictException(
        `Ya existe una orden de compra con el número ${createDto.numero}`
      );
    }

    // Validar que haya al menos un detalle
    if (!createDto.detalles || createDto.detalles.length === 0) {
      throw new BadRequestException('Debe incluir al menos un producto en la orden de compra');
    }

    // Validar cantidades y precios
    for (const detalle of createDto.detalles) {
      if (detalle.cantidad <= 0) {
        throw new BadRequestException(
          `La cantidad del producto ${detalle.descripcion} debe ser mayor a 0`
        );
      }

      if (detalle.precio_unitario < 0) {
        throw new BadRequestException(
          `El precio unitario del producto ${detalle.descripcion} no puede ser negativo`
        );
      }

      // Validar cantidad_recibida si se proporciona
      if (detalle.cantidad_recibida !== undefined) {
        if (detalle.cantidad_recibida < 0) {
          throw new BadRequestException(
            `La cantidad recibida del producto ${detalle.descripcion} no puede ser negativa`
          );
        }

        if (detalle.cantidad_recibida > detalle.cantidad) {
          throw new BadRequestException(
            `La cantidad recibida del producto ${detalle.descripcion} no puede ser mayor a la cantidad solicitada`
          );
        }
      }
    }

    // Validar dias_credito
    if (createDto.dias_credito !== undefined && createDto.dias_credito < 0) {
      throw new BadRequestException('Los días de crédito no pueden ser negativos');
    }

    // Validar fechas
    if (createDto.fecha_orden && createDto.fecha_entrega_esperada) {
      const fechaOrden = new Date(createDto.fecha_orden);
      const fechaEntrega = new Date(createDto.fecha_entrega_esperada);

      if (fechaEntrega < fechaOrden) {
        throw new BadRequestException(
          'La fecha de entrega esperada no puede ser anterior a la fecha de orden'
        );
      }
    }

    // Calcular el total de la orden para evaluar si requiere aprobación
    // ✅ FIX: Usar Decimal.js para evitar errores de punto flotante
    const subtotal = createDto.detalles.reduce(
      (sum, detalle) => sum.plus(new Decimal(detalle.cantidad).times(detalle.precio_unitario)),
      new Decimal(0)
    ).toNumber();

    // ✅ CORRECCIÓN SRP: Usar TaxCalculatorService centralizado
    const taxResult = await this.taxCalculator.calcularImpuestos({
      subtotal,
      tenantId,
    });
    const total = taxResult.total;

    // Evaluar si requiere aprobación basado en el monto configurado
    const requiereAprobacion = await this.evaluarRequiereAprobacion(total, tenantId);

    // Si requiere aprobación y no se especificó un estado, establecer como APROBACION
    if (requiereAprobacion && !createDto.estado) {
      createDto.estado = 'APROBACION' as any;
    }

    // Crear orden de compra pasando los totales ya calculados
    const orden = await this.ordenesRepository.create(
      createDto,
      tenantId,
      userId,
      { subtotal, igv: taxResult.igv, total: taxResult.total }
    );

    // Si la orden fue creada desde una cotización, marcar la cotización como convertida
    if (createDto.cotizacion_id) {
      try {
        await this.cotizacionesRepository.marcarComoConvertida(
          createDto.cotizacion_id,
          orden.id,
          tenantId
        );
      } catch (error) {
        // Log error pero no fallar la creación de la orden
        console.error('Error al marcar cotización como convertida:', error);
      }
    }

    // Si requiere aprobación, crear registros de aprobación pendientes y notificar
    if (requiereAprobacion && orden.estado === 'APROBACION') {
      try {
        await this.crearAprobacionesPendientes(orden.id, tenantId, total);
        await this.notificarAprobadores(orden.id, tenantId, total);
      } catch (error) {
        // Log error pero no fallar la creación de la orden
        console.error('Error al crear aprobaciones pendientes o notificar aprobadores:', error);
      }
    }

    // Invalidar cache del dashboard automáticamente
    try {
      await this.cacheInvalidation.onOrdenCompraCreated(tenantId);
    } catch (error) {
      console.warn('⚠️ No se pudo invalidar cache después de crear orden de compra:', error);
    }

    if (userId) {
      try {
        await this.auditService.registrarCambio(
          'ordenes_compra',
          'INSERT',
          userId,
          { new: orden },
          tenantId,
          orden.id,
          { accion: 'CREAR_ORDEN_COMPRA', proveedor_id: createDto.proveedor_id },
        );
      } catch (error) {
        console.warn('⚠️ No se pudo registrar auditoría de creación de orden:', error);
      }
    }

    return orden;
  }

  async findById(id: string, tenantId: string) {
    const orden = await this.ordenesRepository.findById(id, tenantId);

    if (!orden) {
      throw new NotFoundException(`Orden de compra con ID ${id} no encontrada`);
    }

    return orden;
  }

  async findAll(tenantId: string, filters?: {
    estado?: string;
    proveedor_id?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    limit?: number;
    offset?: number;
  }) {
    return await this.ordenesRepository.findAll(tenantId, filters);
  }

  async update(id: string, updateDto: UpdateOrdenCompraDto, tenantId: string, userId?: string) {
    // Verificar que la orden existe
    const existingOrden = await this.ordenesRepository.findById(id, tenantId);

    if (!existingOrden) {
      throw new NotFoundException(`Orden de compra con ID ${id} no encontrada`);
    }

    // Validar que solo se pueden editar órdenes en estado PENDIENTE o BORRADOR
    const editableStates = ['PENDIENTE', 'BORRADOR'];
    if (!editableStates.includes(existingOrden.estado)) {
      throw new BadRequestException(
        `Solo se pueden editar órdenes en estado PENDIENTE o BORRADOR. Estado actual: ${existingOrden.estado}`
      );
    }

    // 🟡 MEJORA MEDIA: Validar transición de estado si se está cambiando el estado
    if (updateDto.estado && updateDto.estado !== existingOrden.estado) {
      this.validarTransicionEstadoOrden(existingOrden.estado, updateDto.estado);
    }

    // Si se actualiza el número, validar que no exista
    if (updateDto.numero && updateDto.numero !== existingOrden.numero) {
      const duplicateOrden = await this.ordenesRepository.findByNumero(
        updateDto.numero,
        tenantId
      );

      if (duplicateOrden && duplicateOrden.id !== id) {
        throw new ConflictException(
          `Ya existe otra orden de compra con el número ${updateDto.numero}`
        );
      }
    }

    // Validar detalles si se proporcionan
    if (updateDto.detalles) {
      if (updateDto.detalles.length === 0) {
        throw new BadRequestException('Debe incluir al menos un producto en la orden de compra');
      }

      for (const detalle of updateDto.detalles) {
        if (detalle.cantidad <= 0) {
          throw new BadRequestException(
            `La cantidad del producto ${detalle.descripcion} debe ser mayor a 0`
          );
        }

        if (detalle.precio_unitario < 0) {
          throw new BadRequestException(
            `El precio unitario del producto ${detalle.descripcion} no puede ser negativo`
          );
        }

        if (detalle.cantidad_recibida !== undefined) {
          if (detalle.cantidad_recibida < 0) {
            throw new BadRequestException(
              `La cantidad recibida del producto ${detalle.descripcion} no puede ser negativa`
            );
          }

          if (detalle.cantidad_recibida > detalle.cantidad) {
            throw new BadRequestException(
              `La cantidad recibida del producto ${detalle.descripcion} no puede ser mayor a la cantidad solicitada`
            );
          }
        }
      }
    }

    // Validar dias_credito
    if (updateDto.dias_credito !== undefined && updateDto.dias_credito < 0) {
      throw new BadRequestException('Los días de crédito no pueden ser negativos');
    }

    // Validar fechas
    if (updateDto.fecha_orden || updateDto.fecha_entrega_esperada) {
      const fechaOrden = updateDto.fecha_orden
        ? new Date(updateDto.fecha_orden)
        : new Date(existingOrden.fecha_orden);

      const fechaEntrega = updateDto.fecha_entrega_esperada
        ? new Date(updateDto.fecha_entrega_esperada)
        : existingOrden.fecha_entrega_esperada
          ? new Date(existingOrden.fecha_entrega_esperada)
          : null;

      if (fechaEntrega && fechaEntrega < fechaOrden) {
        throw new BadRequestException(
          'La fecha de entrega esperada no puede ser anterior a la fecha de orden'
        );
      }
    }

    // ✅ SRP: Si se actualizan detalles, calcular totales en el servicio
    if (updateDto.detalles && updateDto.detalles.length > 0) {
      const subtotal = updateDto.detalles.reduce(
        (sum, detalle) => sum + (detalle.cantidad * detalle.precio_unitario),
        0
      );
      const taxResult = await this.taxCalculator.calcularImpuestos({
        subtotal,
        tenantId,
      });

      // Agregar totales calculados al DTO
      (updateDto as any).subtotal = subtotal;
      (updateDto as any).igv = taxResult.igv;
      (updateDto as any).total = taxResult.total;
    }

    // Actualizar orden de compra
    const orden = await this.ordenesRepository.update(updateDto, id, tenantId, userId);

    return orden;
  }

  /**
   * 🟡 MEJORA MEDIA: Validar transición de estado para órdenes de compra
   * Implementa máquina de estados explícita con validaciones de transiciones permitidas
   */
  private validarTransicionEstadoOrden(estadoActual: string, nuevoEstado: string): void {
    // Si el estado no cambia, la transición es válida
    if (estadoActual === nuevoEstado) {
      return;
    }

    // Definir transiciones válidas para órdenes de compra
    const transicionesValidas: Record<string, string[]> = {
      'BORRADOR': ['PENDIENTE', 'APROBACION', 'APROBADA', 'ANULADA'],
      'PENDIENTE': ['APROBACION', 'APROBADA', 'ANULADA'],
      'APROBACION': ['PENDIENTE', 'APROBADA', 'ANULADA'],
      'APROBADA': ['PARCIAL', 'RECIBIDA', 'ANULADA'],
      'PARCIAL': ['RECIBIDA', 'ANULADA'],
      'RECIBIDA': [], // Estado final, no se puede cambiar
      'ANULADA': [], // Estado final, no se puede cambiar
    };

    const transicionesPermitidas = transicionesValidas[estadoActual] || [];

    if (!transicionesPermitidas.includes(nuevoEstado)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de la orden de compra de ${estadoActual} a ${nuevoEstado}. ` +
        `Transiciones válidas desde ${estadoActual}: ${transicionesPermitidas.join(', ') || 'ninguna (estado final)'}`
      );
    }
  }

  async aprobar(id: string, aprobarDto: AprobarOrdenCompraDto, tenantId: string, userId?: string) {
    // Verificar que la orden existe
    const existingOrden = await this.ordenesRepository.findById(id, tenantId);

    if (!existingOrden) {
      throw new NotFoundException(`Orden de compra con ID ${id} no encontrada`);
    }

    // Validar que la orden está en estado que permite aprobación
    const approvableStates = ['PENDIENTE', 'BORRADOR', 'APROBACION'];
    if (!approvableStates.includes(existingOrden.estado)) {
      throw new BadRequestException(
        `No se puede aprobar una orden en estado ${existingOrden.estado}. Estados válidos: ${approvableStates.join(', ')}`
      );
    }

    // SEC-001 FIX: usar SIEMPRE el user del JWT, nunca el body.
    // El override historico (aprobarDto.aprobador_id || userId) permitia suplantar
    // identidad y evadir audit trail. El DTO ya no expone aprobador_id.
    const aprobadorId = userId;

    if (!aprobadorId) {
      throw new BadRequestException(
        'No se pudo identificar al aprobador: token de sesion sin user_id.',
      );
    }

    // Bloquear auto-aprobación: el creador de la OC no puede aprobarla
    if (existingOrden.created_by && aprobadorId === existingOrden.created_by) {
      throw new BadRequestException(
        'El creador de la orden de compra no puede aprobar su propia orden. Se requiere aprobación de otro usuario autorizado.',
      );
    }

    let aprobadorNombre = aprobarDto.aprobador_nombre;

    // Si no se proporciona el nombre del aprobador, intentar obtenerlo
    if (!aprobadorNombre && aprobadorId) {
      try {
        const supabase = this.supabaseService.getClient();
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('nombre, apellido')
          .eq('id', aprobadorId)
          .single();

        if (usuario) {
          aprobadorNombre = `${usuario.nombre} ${usuario.apellido}`.trim();
        }
      } catch (error) {
        // Si no se puede obtener el nombre, usar el ID
        aprobadorNombre = aprobadorId;
      }
    }

    // Obtener todas las aprobaciones existentes para esta orden
    const aprobacionesExistentes = await this.ocAprobacionesRepository.findByOrdenId(id, tenantId);

    // Verificar si ya existe una aprobación para este aprobador
    const aprobacionExistente = aprobacionesExistentes.find(
      a => a.aprobador_id === (aprobadorId || 'SYSTEM') && a.nivel === 1
    );

    if (aprobacionExistente) {
      if (aprobacionExistente.estado === 'APROBADA') {
        if (existingOrden.estado === 'APROBADA') {
          throw new BadRequestException('Este aprobador ya ha aprobado esta orden de compra');
        }
        console.warn(
          `⚠️ [ORDEN-COMPRA] Aprobación previa detectada para orden ${id}; se continuará transición de estado pendiente.`,
        );
      } else {
        // Si existe pero está PENDIENTE, actualizar el estado
        await this.ocAprobacionesRepository.updateEstado(
          aprobacionExistente.id,
          'APROBADA',
          aprobarDto.comentarios,
          tenantId,
        );
      }
    } else {
      // Crear nuevo registro en oc_aprobaciones
      try {
        await this.ocAprobacionesRepository.create({
          orden_id: id,
          nivel: 1, // Por ahora solo un nivel de aprobación
          aprobador_id: aprobadorId || 'SYSTEM',
          aprobador_nombre: aprobadorNombre || 'Sistema',
          estado: 'APROBADA',
          fecha_aprobacion: new Date().toISOString(),
          comentarios: aprobarDto.comentarios,
          tenant_id: tenantId,
        });
      } catch (error) {
        console.error('Error al crear registro de aprobación:', error);
        throw new BadRequestException('Error al registrar la aprobación');
      }
    }

    // Verificar si hay aprobaciones pendientes
    const pendingCount = await this.ocAprobacionesRepository.countPendingByOrdenId(id, tenantId);

    // Obtener todas las aprobaciones actualizadas
    const todasLasAprobaciones = await this.ocAprobacionesRepository.findByOrdenId(id, tenantId);

    // Contar aprobaciones aprobadas
    const aprobadasCount = todasLasAprobaciones.filter(a => a.estado === 'APROBADA').length;

    // Verificar si hay alguna aprobación rechazada
    const tieneRechazadas = await this.ocAprobacionesRepository.hasRejectedApprovals(id, tenantId);

    if (tieneRechazadas) {
      throw new BadRequestException(
        'No se puede aprobar la orden porque ya tiene aprobaciones rechazadas'
      );
    }

    // Determinar el nuevo estado basado en las aprobaciones
    let nuevoEstado: string;

    if (pendingCount > 0) {
      // Aún hay aprobaciones pendientes
      nuevoEstado = 'APROBACION';
    } else if (aprobadasCount > 0) {
      // Todas las aprobaciones requeridas están completas
      nuevoEstado = 'APROBADA';
    } else {
      // No hay aprobaciones pendientes pero tampoco aprobadas (caso edge)
      // Esto puede ocurrir si la orden no requería aprobación
      nuevoEstado = 'APROBADA';
    }

    // 🟡 MEJORA MEDIA: Validar transición de estado usando máquina de estados
    this.validarTransicionEstadoOrden(existingOrden.estado, nuevoEstado);

    // Actualizar estado de la orden
    const orden = await this.ordenesRepository.updateEstado(
      id,
      nuevoEstado,
      tenantId,
      userId,
      {
        aprobado_at: nuevoEstado === 'APROBADA' ? new Date().toISOString() : undefined,
        aprobado_by: nuevoEstado === 'APROBADA' ? (aprobadorId || userId) : undefined
      }
    );

    // Emitir evento OrdenCompraAprobada para integración con otros módulos si está APROBADA
    if (nuevoEstado === 'APROBADA') {
      try {
        await this.emitirEventoOrdenAprobada(orden, tenantId, aprobadorId || userId);
      } catch (error) {
        console.error('Error al emitir evento OrdenCompraAprobada:', error);
        // No fallar la aprobación si el evento no se puede emitir
      }
    }

    // Registrar auditoría
    if (userId) {
      try {
        await this.auditService.registrarCambio(
          'ordenes_compra',
          'UPDATE',
          userId,
          {
            old: { estado: existingOrden.estado },
            new: { estado: nuevoEstado, aprobado_at: nuevoEstado === 'APROBADA' ? new Date().toISOString() : undefined, aprobado_by: nuevoEstado === 'APROBADA' ? (aprobadorId || userId) : undefined }
          },
          tenantId,
          id,
          { accion: 'APROBAR', comentarios: aprobarDto.comentarios }
        );
      } catch (error) {
        console.warn('⚠️ No se pudo registrar auditoría de aprobación:', error);
      }
    }

    return orden;
  }

  async rechazar(id: string, rechazarDto: RechazarOrdenCompraDto, tenantId: string, userId?: string) {
    // Verificar que la orden existe
    const existingOrden = await this.ordenesRepository.findById(id, tenantId);

    if (!existingOrden) {
      throw new NotFoundException(`Orden de compra con ID ${id} no encontrada`);
    }

    // Validar que la orden está en estado que permite rechazo
    const rejectableStates = ['PENDIENTE', 'BORRADOR', 'APROBACION'];
    if (!rejectableStates.includes(existingOrden.estado)) {
      throw new BadRequestException(
        `No se puede rechazar una orden en estado ${existingOrden.estado}. Estados válidos: ${rejectableStates.join(', ')}`
      );
    }

    // 🟡 MEJORA MEDIA: Validar transición de estado usando máquina de estados
    this.validarTransicionEstadoOrden(existingOrden.estado, 'ANULADA');

    // Obtener información del rechazador
    const rechazadorId = rechazarDto.rechazado_por_id || userId;
    let rechazadorNombre: string | undefined;

    // Intentar obtener el nombre del rechazador
    if (rechazadorId) {
      try {
        const supabase = this.supabaseService.getClient();
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('nombre, apellido')
          .eq('id', rechazadorId)
          .single();

        if (usuario) {
          rechazadorNombre = `${usuario.nombre} ${usuario.apellido}`.trim();
        }
      } catch (error) {
        // Si no se puede obtener el nombre, usar el ID
        rechazadorNombre = rechazadorId;
      }
    }

    // Crear registro en oc_aprobaciones con estado RECHAZADA
    try {
      await this.ocAprobacionesRepository.create({
        orden_id: id,
        nivel: 1, // Por ahora solo un nivel de aprobación
        aprobador_id: rechazadorId || 'SYSTEM',
        aprobador_nombre: rechazadorNombre || 'Sistema',
        estado: 'RECHAZADA',
        fecha_aprobacion: new Date().toISOString(),
        comentarios: rechazarDto.motivo_rechazo,
        tenant_id: tenantId,
      });
    } catch (error) {
      console.error('Error al crear registro de rechazo:', error);
      // No fallar el rechazo si no se puede crear el registro
    }

    // Actualizar estado a RECHAZADA (o ANULADA según el flujo)
    const orden = await this.ordenesRepository.updateEstado(
      id,
      'ANULADA', // Usar ANULADA en lugar de RECHAZADA ya que no existe ese estado en el enum
      tenantId,
      userId,
      {
        rechazado_at: new Date().toISOString(),
        rechazado_by: rechazadorId || userId,
        motivo_rechazo: rechazarDto.motivo_rechazo
      }
    );

    // Emitir evento OrdenCompraRechazada para notificaciones
    try {
      // Obtener información del proveedor para el evento
      const { data: proveedor } = await this.supabaseService.getClient()
        .from('proveedores')
        .select('razon_social')
        .eq('id', orden.proveedor_id)
        .eq('tenant_id', tenantId)
        .single();

      // Notificar al usuario que creó la orden sobre el rechazo
      if (orden.created_by) {
        await this.notificationsService.createNotification(tenantId, {
          type: NotificationType.OC_RECHAZADA,
          severity: NotificationSeverity.ERROR,
          title: 'Orden de Compra Rechazada',
          message: `La orden de compra ${orden.numero} ha sido rechazada. Motivo: ${rechazarDto.motivo_rechazo}`,
          action_url: `/dashboard/compras/ordenes/${orden.id}`,
          action_label: 'Ver Orden',
          usuario_id: orden.created_by
        });
      }

      console.log(`✅ Notificación de rechazo enviada para orden ${orden.numero}`);
    } catch (error) {
      console.error('Error emitiendo evento de rechazo:', error);
      // No bloquear el rechazo si falla la notificación
    }

    // Registrar auditoría
    if (userId) {
      try {
        await this.auditService.registrarCambio(
          'ordenes_compra',
          'UPDATE',
          userId,
          {
            old: { estado: existingOrden.estado },
            new: { estado: 'ANULADA', rechazado_at: new Date().toISOString(), rechazado_by: rechazadorId || userId, motivo_rechazo: rechazarDto.motivo_rechazo }
          },
          tenantId,
          id,
          { accion: 'RECHAZAR', motivo: rechazarDto.motivo_rechazo }
        );
      } catch (error) {
        console.warn('⚠️ No se pudo registrar auditoría de rechazo:', error);
      }
    }

    return orden;
  }

  async cancelar(id: string, cancelarDto: CancelarOrdenCompraDto, tenantId: string, userId?: string) {
    // Verificar que la orden existe
    const existingOrden = await this.ordenesRepository.findById(id, tenantId);

    if (!existingOrden) {
      throw new NotFoundException(`Orden de compra con ID ${id} no encontrada`);
    }

    // Validar que la orden está en estado que permite cancelación
    // No se pueden cancelar órdenes ya recibidas, cerradas o anuladas
    const cancelableStates = ['PENDIENTE', 'BORRADOR', 'APROBACION', 'APROBADA', 'PARCIAL'];
    if (!cancelableStates.includes(existingOrden.estado)) {
      throw new BadRequestException(
        `No se puede cancelar una orden en estado ${existingOrden.estado}. Estados válidos: ${cancelableStates.join(', ')}`
      );
    }

    // 🟡 MEJORA MEDIA: Validar transición de estado usando máquina de estados
    this.validarTransicionEstadoOrden(existingOrden.estado, 'ANULADA');

    // HARDENING: por defecto bloqueamos cancelación si existen recepciones activas (no CERRADAS).
    try {
      const { data: recepciones, error: recepcionesError } = await this.supabaseService
        .getClient()
        .from('recepciones')
        .select('id, numero, estado')
        .eq('orden_id', id)
        .eq('tenant_id', tenantId);

      if (recepcionesError) {
        console.error('Error verificando recepciones:', recepcionesError);
      }

      const recepcionesList = Array.isArray(recepciones) ? recepciones : [];
      const recepcionesActivas = recepcionesList.filter((r: any) => r?.estado !== 'CERRADA');
      const recepcionesCerradas = recepcionesList.filter((r: any) => r?.estado === 'CERRADA');

      if (recepcionesActivas.length > 0) {
        if (!cancelarDto?.permitir_cancelar_con_recepciones_activas) {
          throw new BadRequestException(
            `No se puede cancelar la orden porque tiene ${recepcionesActivas.length} recepción(es) activa(s) (no CERRADAS). ` +
              `Cierre/cancele las recepciones primero o reintente con permitir_cancelar_con_recepciones_activas=true.`,
          );
        }

        console.warn(
          `⚠️ [ORDEN-COMPRA] Cancelación forzada: orden ${existingOrden.numero} tiene ${recepcionesActivas.length} recepción(es) activa(s).`,
        );
      }

      if (recepcionesCerradas.length > 0 && !cancelarDto?.permitir_cancelar_con_recepciones_cerradas) {
        throw new BadRequestException(
          `No se puede cancelar la orden porque tiene ${recepcionesCerradas.length} recepción(es) CERRADA(s). ` +
            `Esto requiere reversa (devolución/ajuste) para mantener inventario y CxP consistentes. ` +
            `Cree las devoluciones primero o reintente con permitir_cancelar_con_recepciones_cerradas=true.`,
        );
      }

      if (recepcionesCerradas.length > 0 && cancelarDto?.permitir_cancelar_con_recepciones_cerradas) {
        console.warn(
          `⚠️ [ORDEN-COMPRA] Cancelación con recepciones cerradas: orden ${existingOrden.numero} tiene ${recepcionesCerradas.length} recepción(es) CERRADA(s). ` +
            `Se requiere reversa manual/automática posterior.`,
        );

        await this.revertirRecepcionesCerradasAntesDeCancelar({
          ordenId: id,
          tenantId,
          proveedorId: existingOrden.proveedor_id,
          motivo: cancelarDto.motivo_cancelacion ?? 'CANCELACION_OC',
          userId,
        });
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error verificando recepciones:', error);
      // Si falla la verificación, no bloqueamos (pero registramos el riesgo).
    }

    // Actualizar estado a ANULADA
    const orden = await this.ordenesRepository.updateEstado(
      id,
      'ANULADA',
      tenantId,
      userId,
      {
        cancelado_at: new Date().toISOString(),
        cancelado_by: cancelarDto.cancelado_por_id || userId,
        motivo_cancelacion: cancelarDto.motivo_cancelacion
      }
    );

    // Verificar si hay recepciones parciales y crear devoluciones automáticas si es necesario
    // Nota: Por ahora solo notificamos. La creación de devoluciones automáticas puede ser implementada más adelante
    try {
      const { data: recepciones } = await this.supabaseService.getClient()
        .from('recepciones')
        .select('id, numero, estado')
        .eq('orden_id', id)
        .eq('tenant_id', tenantId)
        .in('estado', ['BORRADOR']);

      if (recepciones && recepciones.length > 0) {
        console.warn(
          `⚠️ [ORDEN-COMPRA] La orden ${orden.numero} tiene ${recepciones.length} recepción(es) asociada(s). ` +
          `Se recomienda revisar si se requiere crear devoluciones automáticas.`
        );
        // TODO: Implementar creación automática de devoluciones cuando el módulo esté listo
        // await this.devolucionesService.crearDevolucionesAutomaticas(id, tenantId, userId);
      }
    } catch (error) {
      console.error('Error verificando recepciones para devoluciones:', error);
    }

    // Liberar stock reservado si aplica
    // Nota: Por ahora las órdenes de compra no reservan stock automáticamente
    // Esta funcionalidad puede ser implementada cuando se requiera gestión de stock reservado
    // TODO: Implementar liberación de stock reservado cuando se implemente la reserva de stock

    // Emitir evento OrdenCompraCancelada para notificaciones
    try {
      // Notificar al usuario que creó la orden sobre la cancelación
      if (orden.created_by) {
        await this.notificationsService.createNotification(tenantId, {
          type: NotificationType.OC_CANCELADA,
          severity: NotificationSeverity.WARNING,
          title: 'Orden de Compra Cancelada',
          message: `La orden de compra ${orden.numero} ha sido cancelada. Motivo: ${cancelarDto.motivo_cancelacion || 'Sin motivo especificado'}`,
          action_url: `/dashboard/compras/ordenes/${orden.id}`,
          action_label: 'Ver Orden',
          usuario_id: orden.created_by
        });
      }

      console.log(`✅ Notificación de cancelación enviada para orden ${orden.numero}`);
    } catch (error) {
      console.error('Error emitiendo evento de cancelación:', error);
      // No bloquear la cancelación si falla la notificación
    }

    return orden;
  }

  private async revertirRecepcionesCerradasAntesDeCancelar(params: {
    ordenId: string;
    tenantId: string;
    proveedorId?: string | null;
    motivo: string;
    userId?: string;
  }): Promise<void> {
    const { ordenId, tenantId, proveedorId, motivo, userId } = params;
    if (!proveedorId) {
      throw new BadRequestException('No se pudo determinar el proveedor para revertir recepciones');
    }

    const client = this.supabaseService.getClient();

    const { data: recepcionesCerradas, error: recepcionesError } = await client
      .from('recepciones')
      .select(
        `
          id,
          numero,
          estado,
          items:recepcion_items(
            id,
            detalle_id,
            producto_id,
            cantidad_recibida,
            almacen_id,
            lote,
            serie,
            detalle:orden_compra_detalles(
              id,
              descripcion,
              precio_unitario
            )
          )
        `,
      )
      .eq('tenant_id', tenantId)
      .eq('orden_id', ordenId)
      .eq('estado', 'CERRADA');

    if (recepcionesError) {
      throw new BadRequestException('No se pudo obtener recepciones cerradas para reversa');
    }

    const lista = Array.isArray(recepcionesCerradas) ? recepcionesCerradas : [];
    for (const recepcion of lista) {
      const { data: devolucionExistente, error: devolucionError } = await client
        .from('devoluciones_proveedor')
        .select('id, estado')
        .eq('tenant_id', tenantId)
        .eq('orden_id', ordenId)
        .eq('recepcion_id', recepcion.id)
        .eq('motivo', 'CANCELACION_OC')
        .maybeSingle();

      if (devolucionError) {
        throw new BadRequestException('No se pudo verificar devoluciones existentes para reversa');
      }

      if (devolucionExistente?.id) {
        if (devolucionExistente.estado === 'EMITIDA') {
          continue;
        }
        if (devolucionExistente.estado === 'PENDIENTE') {
          await this.devolucionesProveedorService.emitirDevolucion(
            devolucionExistente.id,
            tenantId,
            userId,
          );
          continue;
        }

        throw new BadRequestException(
          `La devolución existente ${devolucionExistente.id} está en estado ${devolucionExistente.estado} y no puede ser reutilizada para reversa`,
        );
      }

      const items = Array.isArray((recepcion as any).items) ? (recepcion as any).items : [];
      if (items.length === 0) {
        continue;
      }

      const createDto: any = {
        recepcion_id: recepcion.id,
        orden_id: ordenId,
        proveedor_id: proveedorId,
        motivo: 'CANCELACION_OC',
        observaciones: `AUTO: Reversa por cancelación OC. Motivo: ${motivo}`,
        items: items.map((item: any) => ({
          recepcion_item_id: item.id,
          producto_id: item.producto_id,
          descripcion: item.detalle?.descripcion ?? item.producto_id,
          cantidad: Number(item.cantidad_recibida ?? 0),
          precio_unitario: Number(item.detalle?.precio_unitario ?? 0),
          almacen_id: item.almacen_id ?? null,
          lote: item.lote ?? null,
          serie: item.serie ?? null,
          motivo_detalle: motivo,
        })),
      };

      const devolucion = await this.devolucionesProveedorService.crearDevolucion(
        tenantId,
        createDto,
        userId,
      );
      await this.devolucionesProveedorService.emitirDevolucion(
        devolucion.id,
        tenantId,
        userId,
      );
    }
  }

  async findRecepcionesByOrdenId(id: string, tenantId: string) {
    // Verificar que la orden existe
    const existingOrden = await this.ordenesRepository.findById(id, tenantId);

    if (!existingOrden) {
      throw new NotFoundException(`Orden de compra con ID ${id} no encontrada`);
    }

    // Obtener recepciones asociadas a la orden
    const recepciones = await this.ordenesRepository.findRecepcionesByOrdenId(id, tenantId);

    return recepciones;
  }

  async findAprobacionesByOrdenId(id: string, tenantId: string) {
    // Verificar que la orden existe
    const existingOrden = await this.ordenesRepository.findById(id, tenantId);

    if (!existingOrden) {
      throw new NotFoundException(`Orden de compra con ID ${id} no encontrada`);
    }

    // Obtener aprobaciones asociadas a la orden
    const aprobaciones = await this.ocAprobacionesRepository.findByOrdenId(id, tenantId);

    return aprobaciones;
  }

  /**
   * Crea registros de aprobación pendientes para una orden de compra
   * @param ordenId - ID de la orden de compra
   * @param tenantId - ID del tenant
   * @param total - Total de la orden de compra
   */
  private async crearAprobacionesPendientes(ordenId: string, tenantId: string, total: number): Promise<void> {
    try {
      const supabase = this.supabaseService.getClient();

      // Obtener usuarios con permiso de aprobación de compras
      // Buscar usuarios con el permiso 'compras.aprobar' o rol de 'Gerente' o 'Administrador'
      const { data: usuariosConPermiso, error: permisosError } = await supabase
        .from('usuarios_sistema')
        .select(`
          id,
          nombre,
          apellido,
          email,
          user_roles!inner(
            roles!inner(
              role_permissions!inner(
                permissions!inner(
                  codigo
                )
              )
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('estado', 'ACTIVO')
        .or('user_roles.roles.role_permissions.permissions.codigo.eq.compras.aprobar,user_roles.roles.nombre.in.(Gerente,Administrador)');

      let usuariosAprobadores = usuariosConPermiso;

      // Si no se encontraron usuarios con permisos específicos, buscar por roles
      if (permisosError || !usuariosConPermiso || usuariosConPermiso.length === 0) {
        const { data: usuariosPorRol } = await supabase
          .from('usuarios_sistema')
          .select(`
            id,
            nombre,
            apellido,
            email,
            user_roles!inner(
              roles!inner(nombre)
            )
          `)
          .eq('tenant_id', tenantId)
          .eq('estado', 'ACTIVO')
          .in('user_roles.roles.nombre', ['Gerente', 'Administrador', 'Jefe de Compras']);

        usuariosAprobadores = usuariosPorRol || [];
      }

      if (!usuariosAprobadores || usuariosAprobadores.length === 0) {
        console.warn('No se encontraron usuarios con permisos de aprobación de compras');
        return;
      }

      // Eliminar duplicados por ID de usuario
      const usuariosUnicos = Array.from(
        new Map(usuariosAprobadores.map(u => [u.id, u])).values()
      );

      // Crear un registro de aprobación PENDIENTE para cada aprobador
      // Por ahora, todos en nivel 1 (aprobación simple, no multi-nivel)
      const aprobacionesPromises = usuariosUnicos.map(async (usuario) => {
        try {
          await this.ocAprobacionesRepository.create({
            orden_id: ordenId,
            nivel: 1,
            aprobador_id: usuario.id,
            aprobador_nombre: `${usuario.nombre} ${usuario.apellido}`.trim(),
            estado: 'PENDIENTE',
            tenant_id: tenantId,
          });
          console.log(`✅ Aprobación pendiente creada para ${usuario.nombre} ${usuario.apellido}`);
        } catch (error) {
          console.error(`Error al crear aprobación pendiente para usuario ${usuario.id}:`, error);
        }
      });

      await Promise.allSettled(aprobacionesPromises);
    } catch (error) {
      console.error('Error al crear aprobaciones pendientes:', error);
      // No lanzar error para no bloquear el flujo principal
    }
  }

  /**
   * Evalúa si una orden de compra requiere aprobación basado en el monto configurado
   * @param total - Total de la orden de compra (incluye IGV)
   * @param tenantId - ID del tenant
   * @returns true si requiere aprobación, false en caso contrario
   */
  private async evaluarRequiereAprobacion(total: number, tenantId: string): Promise<boolean> {
    try {
      const supabase = this.supabaseService.getClient();

      // Obtener configuración de aprobación desde empresa_config
      const { data: config, error } = await supabase
        .from('empresa_config')
        .select('monto_aprobacion_compras')
        .eq('tenant_id', tenantId)
        .single();

      if (error || !config) {
        // Si no hay configuración o hay error, no requerir aprobación por defecto
        return false;
      }

      // Si no está configurado el monto de aprobación, no requerir aprobación
      if (!config.monto_aprobacion_compras || config.monto_aprobacion_compras <= 0) {
        return false;
      }

      // Requiere aprobación si el total excede el monto configurado
      return total > config.monto_aprobacion_compras;
    } catch (error) {
      // Si falla la lectura de configuración, requerir aprobación como medida segura
      // (fail-closed: no bypasear controles ante errores)
      this.logger.error(
        `APPROVAL_CONFIG_FAILURE tenant=${tenantId} total=${total}: ${error?.message ?? error}`,
      );
      return true;
    }
  }

  /**
   * Notifica a los usuarios con permisos de aprobación sobre una orden que requiere aprobación
   * @param ordenId - ID de la orden de compra
   * @param tenantId - ID del tenant
   * @param total - Total de la orden de compra
   */
  private async notificarAprobadores(ordenId: string, tenantId: string, total: number): Promise<void> {
    try {
      const supabase = this.supabaseService.getClient();

      // Obtener información de la orden para el mensaje
      const orden = await this.ordenesRepository.findById(ordenId, tenantId);
      if (!orden) {
        console.error('No se pudo obtener la orden para notificar');
        return;
      }

      // Obtener usuarios con permiso de aprobación de compras
      // Buscar usuarios con el permiso 'compras.aprobar' o rol de 'Gerente' o 'Administrador'
      const { data: usuariosConPermiso, error: permisosError } = await supabase
        .from('usuarios_sistema')
        .select(`
          id,
          nombre,
          apellido,
          email,
          user_roles!inner(
            roles!inner(
              role_permissions!inner(
                permissions!inner(
                  codigo
                )
              )
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('estado', 'ACTIVO')
        .or('user_roles.roles.role_permissions.permissions.codigo.eq.compras.aprobar,user_roles.roles.nombre.in.(Gerente,Administrador)');

      if (permisosError) {
        console.error('Error al obtener usuarios con permiso de aprobación:', permisosError);
        // Intentar un enfoque alternativo: buscar por roles específicos
        const { data: usuariosPorRol } = await supabase
          .from('usuarios_sistema')
          .select(`
            id,
            nombre,
            apellido,
            email,
            user_roles!inner(
              roles!inner(nombre)
            )
          `)
          .eq('tenant_id', tenantId)
          .eq('estado', 'ACTIVO')
          .in('user_roles.roles.nombre', ['Gerente', 'Administrador', 'Jefe de Compras']);

        if (usuariosPorRol && usuariosPorRol.length > 0) {
          await this.enviarNotificacionesAprobadores(usuariosPorRol, orden, tenantId, total);
        }
        return;
      }

      // Si no se encontraron usuarios con permisos específicos, buscar por roles
      if (!usuariosConPermiso || usuariosConPermiso.length === 0) {
        const { data: usuariosPorRol } = await supabase
          .from('usuarios_sistema')
          .select(`
            id,
            nombre,
            apellido,
            email,
            user_roles!inner(
              roles!inner(nombre)
            )
          `)
          .eq('tenant_id', tenantId)
          .eq('estado', 'ACTIVO')
          .in('user_roles.roles.nombre', ['Gerente', 'Administrador', 'Jefe de Compras']);

        if (usuariosPorRol && usuariosPorRol.length > 0) {
          await this.enviarNotificacionesAprobadores(usuariosPorRol, orden, tenantId, total);
        } else {
          console.warn('No se encontraron usuarios con permisos de aprobación de compras');
        }
        return;
      }

      await this.enviarNotificacionesAprobadores(usuariosConPermiso, orden, tenantId, total);
    } catch (error) {
      console.error('Error al notificar aprobadores:', error);
      // No lanzar error para no bloquear el flujo principal
    }
  }

  /**
   * Envía notificaciones a los aprobadores
   */
  private async enviarNotificacionesAprobadores(
    usuarios: any[],
    orden: any,
    tenantId: string,
    total: number
  ): Promise<void> {
    // Eliminar duplicados por ID de usuario
    const usuariosUnicos = Array.from(
      new Map(usuarios.map(u => [u.id, u])).values()
    );

    console.log(`Notificando a ${usuariosUnicos.length} aprobadores sobre la orden ${orden.numero}`);

    const moneda =
      orden?.moneda || (await this.obtenerMonedaDefectoEmpresa(tenantId)) || 'PEN';

    // Formatear el total como moneda
    const totalFormateado = new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: moneda
    }).format(total);

    // Crear notificaciones para cada aprobador
    const notificacionesPromises = usuariosUnicos.map(async (usuario) => {
      try {
        await this.notificationsService.createNotification(tenantId, {
          type: NotificationType.OC_REQUIERE_APROBACION,
          severity: NotificationSeverity.WARNING,
          title: 'Orden de Compra Requiere Aprobación',
          message: `La orden de compra ${orden.numero} por ${totalFormateado} requiere su aprobación.`,
          action_url: `/dashboard/compras/ordenes/${orden.id}`,
          action_label: 'Ver Orden',
          usuario_id: usuario.id
        });

        console.log(`✅ Notificación enviada a ${usuario.nombre} ${usuario.apellido} (${usuario.email})`);
      } catch (error) {
        console.error(`Error al enviar notificación a usuario ${usuario.id}:`, error);
      }
    });

    await Promise.allSettled(notificacionesPromises);
  }

  private async obtenerMonedaDefectoEmpresa(tenantId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('moneda_defecto')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        console.warn(`⚠️ [OrdenesCompra] No se pudo obtener moneda_defecto: ${error.message}`);
        return null;
      }

      return (data?.moneda_defecto || null) as string | null;
    } catch (error) {
      console.warn(`⚠️ [OrdenesCompra] Error obteniendo moneda_defecto:`, error);
      return null;
    }
  }

  /**
   * Emite el evento OrdenCompraAprobada para integración con otros módulos
   * @param orden - Orden de compra aprobada
   * @param tenantId - ID del tenant
   * @param aprobadorId - ID del usuario que aprobó
   */
  private async emitirEventoOrdenAprobada(orden: any, tenantId: string, aprobadorId?: string): Promise<void> {
    try {
      const supabase = this.supabaseService.getClient();

      // Obtener información del proveedor
      const { data: proveedor } = await supabase
        .from('proveedores')
        .select('razon_social')
        .eq('id', orden.proveedor_id)
        .eq('tenant_id', tenantId)
        .single();

      // Obtener detalles de la orden
      const { data: detalles } = await supabase
        .from('orden_compra_detalles')
        .select('*')
        .eq('orden_id', orden.id)
        .eq('tenant_id', tenantId);

      // Calcular totales usando TaxCalculatorService
      const subtotal = detalles?.reduce((sum, d) => sum + (d.cantidad * d.precio_unitario), 0) || 0;

      // ✅ CORRECCIÓN: Usar servicio centralizado
      const taxResult = await this.taxCalculator.calcularImpuestos({
        subtotal,
        tenantId,
      });

      const igv = taxResult.igv;
      const total = taxResult.total;

      // Preparar items para el evento
      const items = detalles?.map(d => ({
        productoId: d.producto_id,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precioUnitario: d.precio_unitario,
        total: d.cantidad * d.precio_unitario
      })) || [];

      // Emitir evento
      // 🟡 MEJORA MEDIA: Manejo de errores en eventos para no bloquear operaciones críticas
      try {
        const eventId = uuidv4();
        const idempotencyKey = `compras.oc.aprobada:${tenantId}:${orden.id}`;

        this.eventBusService.emitOrdenCompraAprobada({
          eventId,
          idempotencyKey,
          ordenId: orden.id,
          numeroOrden: orden.numero,
          proveedorId: orden.proveedor_id,
          proveedorNombre: proveedor?.razon_social || 'Proveedor desconocido',
          total,
          subtotal,
          igv,
          moneda: orden.moneda || 'PEN',
          fechaOrden: orden.fecha_orden,
          fechaEntregaEsperada: orden.fecha_entrega_esperada,
          aprobadoPor: aprobadorId || 'SYSTEM',
          aprobadoEn: new Date().toISOString(),
          diasCredito: orden.dias_credito,
          items,
          tenantId
        });

        console.log(`✅ Evento OrdenCompraAprobada emitido para orden ${orden.numero}`);
      } catch (error) {
        console.error('❌ Error al emitir evento OrdenCompraAprobada:', error);
        // 🟡 MEJORA MEDIA: No bloquear la operación principal si falla el evento
        // El error ya está registrado en logs para monitoreo
      }
    } catch (error) {
      console.error('❌ Error al emitir evento de orden aprobada:', error);
    }
  }
}
