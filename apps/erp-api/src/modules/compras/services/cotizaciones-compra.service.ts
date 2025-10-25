import { Injectable, ConflictException, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { CotizacionesCompraRepository } from '../repositories/cotizaciones-compra.repository';
import { CreateCotizacionCompraDto } from '../dto/create-cotizacion-compra.dto';
import { UpdateCotizacionCompraDto } from '../dto/update-cotizacion-compra.dto';
import { CreateOrdenCompraDto } from '../dto/create-orden-compra.dto';
import { OrdenesCompraService } from './ordenes-compra.service';

@Injectable()
export class CotizacionesCompraService {
  constructor(
    private readonly cotizacionesRepository: CotizacionesCompraRepository,
    @Inject(forwardRef(() => OrdenesCompraService))
    private readonly ordenesCompraService: OrdenesCompraService
  ) {}

  async create(createDto: CreateCotizacionCompraDto, tenantId: string, userId?: string) {
    // Validar que el número de cotización no exista
    const existingCotizacion = await this.cotizacionesRepository.findByNumero(
      createDto.numero,
      tenantId
    );

    if (existingCotizacion) {
      throw new ConflictException(
        `Ya existe una cotización con el número ${createDto.numero}`
      );
    }

    // Validar que haya al menos un detalle
    if (!createDto.detalles || createDto.detalles.length === 0) {
      throw new BadRequestException('Debe incluir al menos un producto en la cotización');
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
    }

    // Validar validez_dias
    if (createDto.validez_dias && createDto.validez_dias < 1) {
      throw new BadRequestException('Los días de validez deben ser al menos 1');
    }

    // Crear cotización
    return await this.cotizacionesRepository.create(createDto, tenantId, userId);
  }

  async findById(id: string, tenantId: string) {
    const cotizacion = await this.cotizacionesRepository.findById(id, tenantId);
    
    if (!cotizacion) {
      throw new NotFoundException(`Cotización con ID ${id} no encontrada`);
    }

    return cotizacion;
  }

  async findAll(tenantId: string, filters?: {
    estado?: string;
    proveedor_id?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    limit?: number;
    offset?: number;
  }) {
    return await this.cotizacionesRepository.findAll(tenantId, filters);
  }

  async update(id: string, updateDto: UpdateCotizacionCompraDto, tenantId: string, userId?: string) {
    // Verificar que la cotización existe
    const existing = await this.findById(id, tenantId);

    // Validar que solo se puede editar si está en BORRADOR
    if (existing.estado !== 'BORRADOR') {
      throw new BadRequestException(
        `No se puede editar una cotización en estado ${existing.estado}. Solo se pueden editar cotizaciones en estado BORRADOR.`
      );
    }

    // Si se actualiza el número, validar que no exista otro con ese número
    if (updateDto.numero && updateDto.numero !== existing.numero) {
      const existingWithNumber = await this.cotizacionesRepository.findByNumero(
        updateDto.numero,
        tenantId
      );

      if (existingWithNumber && existingWithNumber.id !== id) {
        throw new ConflictException(
          `Ya existe otra cotización con el número ${updateDto.numero}`
        );
      }
    }

    // Validar detalles si se proporcionan
    if (updateDto.detalles) {
      if (updateDto.detalles.length === 0) {
        throw new BadRequestException('Debe incluir al menos un producto en la cotización');
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
      }
    }

    // Validar validez_dias
    if (updateDto.validez_dias !== undefined && updateDto.validez_dias < 1) {
      throw new BadRequestException('Los días de validez deben ser al menos 1');
    }

    // Actualizar cotización
    return await this.cotizacionesRepository.update(id, updateDto, tenantId, userId);
  }

  async enviar(id: string, tenantId: string, userId?: string) {
    // Verificar que la cotización existe
    const cotizacion = await this.findById(id, tenantId);

    // Validar que está en estado BORRADOR
    if (cotizacion.estado !== 'BORRADOR') {
      throw new BadRequestException(
        `Solo se pueden enviar cotizaciones en estado BORRADOR. Estado actual: ${cotizacion.estado}`
      );
    }

    // Validar que tiene detalles
    if (!cotizacion.detalles || cotizacion.detalles.length === 0) {
      throw new BadRequestException('No se puede enviar una cotización sin productos');
    }

    // Validar que no está vencida
    const fechaVencimiento = new Date(cotizacion.fecha_vencimiento);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    if (fechaVencimiento < hoy) {
      throw new BadRequestException(
        `No se puede enviar una cotización vencida. Fecha de vencimiento: ${cotizacion.fecha_vencimiento}`
      );
    }

    // Actualizar estado a ENVIADA
    return await this.cotizacionesRepository.updateEstado(id, 'ENVIADA', tenantId, userId);
  }

  async aprobar(id: string, tenantId: string, userId?: string) {
    // Verificar que la cotización existe
    const cotizacion = await this.findById(id, tenantId);

    // Validar que está en estado ENVIADA
    if (cotizacion.estado !== 'ENVIADA') {
      throw new BadRequestException(
        `Solo se pueden aprobar cotizaciones en estado ENVIADA. Estado actual: ${cotizacion.estado}`
      );
    }

    // Validar que no está vencida
    const fechaVencimiento = new Date(cotizacion.fecha_vencimiento);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    if (fechaVencimiento < hoy) {
      throw new BadRequestException(
        `No se puede aprobar una cotización vencida. Fecha de vencimiento: ${cotizacion.fecha_vencimiento}`
      );
    }

    // Actualizar estado a APROBADA
    return await this.cotizacionesRepository.updateEstado(id, 'APROBADA', tenantId, userId);
  }

  async rechazar(id: string, tenantId: string, motivo?: string, userId?: string) {
    // Verificar que la cotización existe
    const cotizacion = await this.findById(id, tenantId);

    // Validar que está en estado ENVIADA
    if (cotizacion.estado !== 'ENVIADA') {
      throw new BadRequestException(
        `Solo se pueden rechazar cotizaciones en estado ENVIADA. Estado actual: ${cotizacion.estado}`
      );
    }

    // Actualizar estado a RECHAZADA y agregar motivo a observaciones si se proporciona
    const updateData: any = { estado: 'RECHAZADA' };
    
    if (motivo) {
      const observacionesActuales = cotizacion.observaciones || '';
      updateData.observaciones = observacionesActuales 
        ? `${observacionesActuales}\n\nMotivo de rechazo: ${motivo}`
        : `Motivo de rechazo: ${motivo}`;
    }

    return await this.cotizacionesRepository.updateEstadoConObservaciones(
      id, 
      'RECHAZADA', 
      updateData.observaciones,
      tenantId, 
      userId
    );
  }

  async convertirAOrdenCompra(
    cotizacionId: string,
    tenantId: string,
    numeroOC: string,
    userId?: string
  ) {
    // Obtener la cotización con sus detalles
    const cotizacion = await this.findById(cotizacionId, tenantId);

    // Validar que la cotización existe
    if (!cotizacion) {
      throw new NotFoundException(`Cotización con ID ${cotizacionId} no encontrada`);
    }

    // Validar que la cotización está en estado APROBADA
    if (cotizacion.estado !== 'APROBADA') {
      throw new BadRequestException(
        `Solo se pueden convertir cotizaciones en estado APROBADA. Estado actual: ${cotizacion.estado}`
      );
    }

    // Validar que la cotización no ha sido convertida previamente
    if (cotizacion.orden_compra_id) {
      throw new BadRequestException(
        `Esta cotización ya fue convertida a la orden de compra ${cotizacion.orden_compra_id}`
      );
    }

    // Validar que la cotización no está vencida
    const fechaVencimiento = new Date(cotizacion.fecha_vencimiento);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    if (fechaVencimiento < hoy) {
      throw new BadRequestException(
        `No se puede convertir una cotización vencida. Fecha de vencimiento: ${cotizacion.fecha_vencimiento}`
      );
    }

    // Validar que hay detalles
    if (!cotizacion.detalles || cotizacion.detalles.length === 0) {
      throw new BadRequestException('La cotización no tiene productos para convertir');
    }

    // Calcular fecha de entrega esperada (30 días por defecto)
    const fechaEntregaEsperada = new Date();
    fechaEntregaEsperada.setDate(fechaEntregaEsperada.getDate() + 30);

    // Construir el DTO de orden de compra con datos precargados
    const ordenCompraDto: CreateOrdenCompraDto = {
      numero: numeroOC,
      proveedor_id: cotizacion.proveedor_id,
      cotizacion_id: cotizacion.id,
      fecha_orden: new Date(),
      fecha_entrega_esperada: fechaEntregaEsperada,
      condiciones_pago: cotizacion.proveedor?.condiciones_pago || 'CONTADO',
      dias_credito: cotizacion.proveedor?.dias_credito || 0,
      observaciones: cotizacion.observaciones || '',
      detalles: cotizacion.detalles.map(detalle => ({
        producto_id: detalle.producto_id,
        descripcion: detalle.descripcion,
        cantidad: detalle.cantidad,
        precio_unitario: detalle.precio_unitario,
        cantidad_recibida: 0
      }))
    };

    // Crear la orden de compra usando el servicio de órdenes
    const ordenCompra = await this.ordenesCompraService.create(ordenCompraDto, tenantId, userId);

    // Marcar la cotización como convertida
    await this.cotizacionesRepository.marcarComoConvertida(cotizacionId, ordenCompra.id, tenantId);

    return ordenCompra;
  }
}
