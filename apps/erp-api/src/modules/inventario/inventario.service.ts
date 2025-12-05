import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { OutboxEventBuilder } from '../../shared/outbox/outbox-event.interface';
import { v4 as uuidv4 } from 'uuid';

export enum TipoMovimiento {
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
  RESERVA = 'RESERVA',
  LIBERACION = 'LIBERACION',
  AJUSTE = 'AJUSTE',
  TRANSFERENCIA = 'TRANSFERENCIA'
}

export interface MovimientoAlmacenParams {
  tenantId: string;
  productoId: string;
  almacenId: string;
  tipo: 'ENTRADA' | 'SALIDA' | 'RESERVA' | 'LIBERACION';
  cantidad: number;
  referenciaTipo: string;
  referenciaId: string;
  notas?: string;
  ubicacionId?: string;
  lote?: string;
  fechaExpiracion?: string | null;
}

export interface MovimientoInventario {
  tenant_id: string;
  producto_id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  referencia_tipo?: string;
  referencia_id?: string;
  notas?: string;
  created_by?: string;
  centro_costo_id?: string;
}

interface ListarRecepcionesFiltros {
  estado?: string;
  almacenId?: string;
  search?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  limit?: number;
}

interface KardexValorizadoFiltros {
  productoId?: string;
  almacenId?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
}

/**
 * Servicio de Inventario con soporte para reservas de stock
 * 
 * Implementa operaciones atómicas para:
 * - Reservar stock (RESERVA)
 * - Liberar reservas (LIBERACION)
 * - Descontar stock real (SALIDA)
 * - Calcular stock disponible (stock - stock_reservado)
 */
@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBusService,
  ) {
    console.log('✅ [InventarioService] Servicio inicializado con soporte de reservas y eventos');
  }

  /**
   * Calcula el stock disponible de un producto
   * Formula: stock - stock_reservado
   * 
   * @param producto_id - ID del producto
   * @param tenant_id - ID del tenant
   * @returns Stock disponible (no reservado)
   */
  async getStockDisponible(producto_id: string, tenant_id: string): Promise<number> {
    try {
      console.log(`📊 [Tenant: ${tenant_id}] Calculando stock disponible para producto: ${producto_id}`);

      const { data: producto, error } = await this.supabase.getClient()
        .from('productos')
        .select('stock, stock_reservado')
        .eq('tenant_id', tenant_id)
        .eq('id', producto_id)
        .single();

      if (error) {
        console.error('❌ Error obteniendo producto:', error);
        throw new NotFoundException(`Producto ${producto_id} no encontrado`);
      }

      if (!producto) {
        throw new NotFoundException(`Producto ${producto_id} no encontrado`);
      }

      const stockActual = parseFloat(producto.stock || '0');
      const stockReservado = parseFloat(producto.stock_reservado || '0');
      const stockDisponible = stockActual - stockReservado;

      console.log(`✅ Stock disponible: ${stockDisponible} (actual: ${stockActual}, reservado: ${stockReservado})`);

      return stockDisponible;
    } catch (error) {
      console.error('❌ Error calculando stock disponible:', error);
      throw error;
    }
  }

  /**
   * Crea un movimiento de inventario genérico
   * 
   * @param movimiento - Datos del movimiento
   * @returns ID del movimiento creado
   */
  async crearMovimiento(movimiento: MovimientoInventario): Promise<string> {
    try {
      console.log(`📝 [Tenant: ${movimiento.tenant_id}] Creando movimiento tipo ${movimiento.tipo} para producto ${movimiento.producto_id}`);

      const { data, error } = await this.supabase.getClient()
        .from('movimientos_inventario')
        .insert({
          tenant_id: movimiento.tenant_id,
          producto_id: movimiento.producto_id,
          tipo: movimiento.tipo,
          cantidad: movimiento.cantidad,
          referencia_tipo: movimiento.referencia_tipo || null,
          referencia_id: movimiento.referencia_id || null,
          notas: movimiento.notas || null,
          created_by: movimiento.created_by || null,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        console.error('❌ Error creando movimiento:', error);
        throw new BadRequestException(`Error creando movimiento: ${error.message}`);
      }

      console.log(`✅ Movimiento creado: ${data.id}`);

      // 🔴 CRÍTICO FIX: Emitir evento MovimientoStockEvent para contabilidad
      // Solo emitir para movimientos que afectan stock real (ENTRADA, SALIDA, AJUSTE)
      // NOTA: Este método se llama desde otros métodos que ya actualizaron el stock,
      // por lo que el cálculo del stock anterior puede ser aproximado.
      // Los métodos principales (descontarStock, registrarEntradaStockAtomico) emiten el evento directamente
      // con valores precisos. Este método solo emite para casos donde se llama directamente.
      if (movimiento.tipo === TipoMovimiento.ENTRADA || 
          movimiento.tipo === TipoMovimiento.SALIDA || 
          movimiento.tipo === TipoMovimiento.AJUSTE) {
        try {
          // Obtener producto para calcular valores
          const { data: producto } = await this.supabase.getClient()
            .from('productos')
            .select('stock, precio_venta, precio_compra')
            .eq('id', movimiento.producto_id)
            .eq('tenant_id', movimiento.tenant_id)
            .single();

          if (producto) {
            const stockActual = Number(producto.stock || 0);
            // Calcular stock anterior basado en el tipo de movimiento
            // Nota: Esto es aproximado porque el stock ya pudo haber sido actualizado
            const stockAnterior = movimiento.tipo === TipoMovimiento.ENTRADA 
              ? Math.max(0, stockActual - movimiento.cantidad)
              : movimiento.tipo === TipoMovimiento.SALIDA
              ? stockActual + movimiento.cantidad
              : stockActual; // Para AJUSTE, usar el mismo valor

            // Calcular valor del movimiento (precio de compra para ENTRADA/AJUSTE, precio de venta para SALIDA)
            const precioUnitarioBase = Number(producto.precio_compra) || 0;
            const precioUnitarioSalida = Number(producto.precio_venta) || precioUnitarioBase;
            const precioUnitario =
              movimiento.tipo === TipoMovimiento.SALIDA ? precioUnitarioSalida : precioUnitarioBase;
            const valorTotal = precioUnitario * movimiento.cantidad;

            await this.eventBus.emitMovimientoStock({
              productoId: movimiento.producto_id,
              tipoMovimiento: movimiento.tipo as 'ENTRADA' | 'SALIDA' | 'AJUSTE',
              cantidad: movimiento.cantidad,
              stockAnterior,
              stockNuevo: stockActual,
              motivo: movimiento.notas || movimiento.referencia_tipo || 'Movimiento manual',
              valor: valorTotal,
              ventaId: movimiento.referencia_tipo === 'VENTA' || movimiento.referencia_tipo === 'VENTA_POS' 
                ? movimiento.referencia_id 
                : undefined,
              tenantId: movimiento.tenant_id ?? null,
            }, movimiento.tenant_id ?? undefined);

            console.log(`✅ Evento MovimientoStockEvent emitido para movimiento ${data.id}`);

            // Encolar evento outbox de ajuste para contabilidad (solo para AJUSTE)
            if (movimiento.tipo === TipoMovimiento.AJUSTE && movimiento.tenant_id) {
              const tipoAjuste = movimiento.cantidad >= 0 ? 'SOBRANTE' : 'FALTANTE';
              const valorAjuste = Math.abs(precioUnitarioBase * movimiento.cantidad);
              const ajusteEvent = OutboxEventBuilder.build({
                tenantId: movimiento.tenant_id,
                eventType: 'ajuste.inventario.aplicado',
                aggregateType: 'ajuste_inventario',
                aggregateId: data.id,
                eventData: {
                  valor: Number.isFinite(valorAjuste) ? valorAjuste : Math.abs(valorTotal),
                  tipo: tipoAjuste,
                  referencia: movimiento.notas || movimiento.referencia_tipo || `Ajuste ${data.id}`,
                  centro_costo_id: movimiento.centro_costo_id || null,
                  eventId: uuidv4(),
                },
              });

              try {
                await this.supabase.getClient().from('outbox_events').insert(ajusteEvent);
                console.log(`✅ Evento ajuste.inventario.aplicado encolado (${ajusteEvent.event_id})`);
              } catch (err) {
                console.error('❌ Error encolando ajuste.inventario.aplicado:', err);
              }
            }
          }
        } catch (error) {
          console.error('❌ Error emitiendo evento MovimientoStock:', error);
          // No bloquear el movimiento si falla el evento
        }
      }

      // Registrar auditoría para movimientos críticos (AJUSTE, SALIDA)
      if (movimiento.created_by && (movimiento.tipo === TipoMovimiento.AJUSTE || movimiento.tipo === TipoMovimiento.SALIDA)) {
        try {
          await this.auditService.registrarCambio(
            'movimientos_inventario',
            'INSERT',
            movimiento.created_by,
            {
              new: {
                tipo: movimiento.tipo,
                cantidad: movimiento.cantidad,
                producto_id: movimiento.producto_id,
                referencia_tipo: movimiento.referencia_tipo,
                referencia_id: movimiento.referencia_id,
                notas: movimiento.notas
              }
            },
            movimiento.tenant_id,
            data.id,
            { accion: 'CREAR_MOVIMIENTO', tipo_movimiento: movimiento.tipo }
          );
        } catch (error) {
          console.warn('⚠️ No se pudo registrar auditoría de movimiento:', error);
        }
      }

      return data.id;
    } catch (error) {
      console.error('❌ Error en crearMovimiento:', error);
      throw error;
    }
  }

  /**
   * Reserva stock para un pedido
   * - Crea movimiento tipo RESERVA
   * - Incrementa stock_reservado
   * - Operación atómica con transacción
   * 
   * @param producto_id - ID del producto
   * @param cantidad - Cantidad a reservar
   * @param tenant_id - ID del tenant
   * @param referencia_tipo - Tipo de referencia (ej: 'PEDIDO')
   * @param referencia_id - ID de la referencia
   * @returns ID del movimiento creado
   */
  async reservarStock(
    producto_id: string,
    cantidad: number,
    tenant_id: string,
    referencia_tipo?: string,
    referencia_id?: string
  ): Promise<string> {
    try {
      console.log(`🔒 [Tenant: ${tenant_id}] Reservando ${cantidad} unidades del producto ${producto_id}`);

      if (cantidad <= 0) {
        throw new BadRequestException('La cantidad a reservar debe ser mayor a cero');
      }

      // Verificar que el producto existe
      const { data: producto, error: productoError } = await this.supabase.getClient()
        .from('productos')
        .select('id, nombre, stock, stock_reservado')
        .eq('tenant_id', tenant_id)
        .eq('id', producto_id)
        .single();

      if (productoError || !producto) {
        throw new NotFoundException(`Producto ${producto_id} no encontrado`);
      }

      const stockActual = parseFloat(producto.stock || '0');
      const stockReservado = parseFloat(producto.stock_reservado || '0');
      const stockDisponible = stockActual - stockReservado;

      console.log(`📊 Stock actual: ${stockActual}, reservado: ${stockReservado}, disponible: ${stockDisponible}`);

      // Advertencia si stock insuficiente (pero permitir continuar)
      if (stockDisponible < cantidad) {
        console.warn(`⚠️ Stock insuficiente: disponible ${stockDisponible}, solicitado ${cantidad}`);
      }

      // Operación atómica: actualizar stock_reservado
      const nuevoStockReservado = stockReservado + cantidad;

      const { error: updateError } = await this.supabase.getClient()
        .from('productos')
        .update({ stock_reservado: nuevoStockReservado })
        .eq('tenant_id', tenant_id)
        .eq('id', producto_id);

      if (updateError) {
        console.error('❌ Error actualizando stock_reservado:', updateError);
        throw new BadRequestException(`Error actualizando stock: ${updateError.message}`);
      }

      // Crear movimiento de RESERVA
      const movimientoId = await this.crearMovimiento({
        tenant_id,
        producto_id,
        tipo: TipoMovimiento.RESERVA,
        cantidad,
        referencia_tipo,
        referencia_id,
        notas: `Reserva de ${cantidad} unidades`
      });

      console.log(`✅ Stock reservado exitosamente. Nuevo stock_reservado: ${nuevoStockReservado}`);

      return movimientoId;
    } catch (error) {
      console.error('❌ Error reservando stock:', error);
      throw error;
    }
  }

  /**
   * Libera una reserva de stock
   * - Crea movimiento tipo LIBERACION
   * - Decrementa stock_reservado
   * - Operación atómica con transacción
   * 
   * @param producto_id - ID del producto
   * @param cantidad - Cantidad a liberar
   * @param tenant_id - ID del tenant
   * @param referencia_tipo - Tipo de referencia (ej: 'PEDIDO')
   * @param referencia_id - ID de la referencia
   * @returns ID del movimiento creado
   */
  async liberarReserva(
    producto_id: string,
    cantidad: number,
    tenant_id: string,
    referencia_tipo?: string,
    referencia_id?: string
  ): Promise<string> {
    try {
      console.log(`🔓 [Tenant: ${tenant_id}] Liberando ${cantidad} unidades del producto ${producto_id}`);

      if (cantidad <= 0) {
        throw new BadRequestException('La cantidad a liberar debe ser mayor a cero');
      }

      // Verificar que el producto existe
      const { data: producto, error: productoError } = await this.supabase.getClient()
        .from('productos')
        .select('id, nombre, stock, stock_reservado')
        .eq('tenant_id', tenant_id)
        .eq('id', producto_id)
        .single();

      if (productoError || !producto) {
        throw new NotFoundException(`Producto ${producto_id} no encontrado`);
      }

      const stockReservado = parseFloat(producto.stock_reservado || '0');

      console.log(`📊 Stock reservado actual: ${stockReservado}`);

      // Validar que hay suficiente stock reservado para liberar
      if (stockReservado < cantidad) {
        console.warn(`⚠️ Intentando liberar más de lo reservado: reservado ${stockReservado}, a liberar ${cantidad}`);
        // Ajustar a lo máximo disponible
        cantidad = stockReservado;
      }

      // Operación atómica: decrementar stock_reservado
      const nuevoStockReservado = Math.max(0, stockReservado - cantidad);

      const { error: updateError } = await this.supabase.getClient()
        .from('productos')
        .update({ stock_reservado: nuevoStockReservado })
        .eq('tenant_id', tenant_id)
        .eq('id', producto_id);

      if (updateError) {
        console.error('❌ Error actualizando stock_reservado:', updateError);
        throw new BadRequestException(`Error actualizando stock: ${updateError.message}`);
      }

      // Crear movimiento de LIBERACION
      const movimientoId = await this.crearMovimiento({
        tenant_id,
        producto_id,
        tipo: TipoMovimiento.LIBERACION,
        cantidad,
        referencia_tipo,
        referencia_id,
        notas: `Liberación de ${cantidad} unidades`
      });

      console.log(`✅ Reserva liberada exitosamente. Nuevo stock_reservado: ${nuevoStockReservado}`);

      return movimientoId;
    } catch (error) {
      console.error('❌ Error liberando reserva:', error);
      throw error;
    }
  }

  /**
   * Descuenta stock real del inventario
   * - Crea movimiento tipo SALIDA
   * - Decrementa stock
   * - Libera la reserva correspondiente (decrementa stock_reservado)
   * - Operación atómica con transacción
   * 
   * @param producto_id - ID del producto
   * @param cantidad - Cantidad a descontar
   * @param tenant_id - ID del tenant
   * @param referencia_tipo - Tipo de referencia (ej: 'PEDIDO')
   * @param referencia_id - ID de la referencia
   * @returns ID del movimiento creado
   */
  async descontarStock(
    producto_id: string,
    cantidad: number,
    tenant_id: string,
    referencia_tipo?: string,
    referencia_id?: string
  ): Promise<string> {
    try {
      console.log(`📤 [Tenant: ${tenant_id}] Descontando ${cantidad} unidades del producto ${producto_id}`);

      if (cantidad <= 0) {
        throw new BadRequestException('La cantidad a descontar debe ser mayor a cero');
      }

      // Verificar que el producto existe
      const { data: producto, error: productoError } = await this.supabase.getClient()
        .from('productos')
        .select('id, nombre, stock, stock_reservado')
        .eq('tenant_id', tenant_id)
        .eq('id', producto_id)
        .single();

      if (productoError || !producto) {
        throw new NotFoundException(`Producto ${producto_id} no encontrado`);
      }

      const stockActual = parseFloat(producto.stock || '0');
      const stockReservado = parseFloat(producto.stock_reservado || '0');

      console.log(`📊 Stock actual: ${stockActual}, reservado: ${stockReservado}`);

      // Validar que hay suficiente stock
      if (stockActual < cantidad) {
        throw new BadRequestException(
          `Stock insuficiente para ${producto.nombre}. Disponible: ${stockActual}, Solicitado: ${cantidad}`
        );
      }

      // Operación atómica: decrementar stock y stock_reservado
      const nuevoStockActual = stockActual - cantidad;
      const nuevoStockReservado = Math.max(0, stockReservado - cantidad);

      const { error: updateError } = await this.supabase.getClient()
        .from('productos')
        .update({
          stock: nuevoStockActual,
          stock_reservado: nuevoStockReservado
        })
        .eq('tenant_id', tenant_id)
        .eq('id', producto_id);

      if (updateError) {
        console.error('❌ Error actualizando stock:', updateError);
        throw new BadRequestException(`Error actualizando stock: ${updateError.message}`);
      }

      // Crear movimiento de SALIDA
      const movimientoId = await this.crearMovimiento({
        tenant_id,
        producto_id,
        tipo: TipoMovimiento.SALIDA,
        cantidad,
        referencia_tipo,
        referencia_id,
        notas: `Salida de ${cantidad} unidades`
      });

      console.log(`✅ Stock descontado exitosamente. Nuevo stock: ${nuevoStockActual}, stock_reservado: ${nuevoStockReservado}`);

      // 🔴 CRÍTICO FIX: Emitir evento MovimientoStockEvent para contabilidad
      // El evento ya se emite en crearMovimiento(), pero aquí tenemos acceso al stock anterior/nuevo
      // Para asegurar que el evento tenga los valores correctos, lo emitimos aquí también
      try {
        const { data: productoData } = await this.supabase.getClient()
          .from('productos')
          .select('precio_venta')
          .eq('id', producto_id)
          .eq('tenant_id', tenant_id)
          .single();

        const precioVenta = Number(productoData?.precio_venta || 0);
        const valorTotal = precioVenta * cantidad;

        await this.eventBus.emitMovimientoStock({
          productoId: producto_id,
          tipoMovimiento: 'SALIDA',
          cantidad,
          stockAnterior: stockActual,
          stockNuevo: nuevoStockActual,
          motivo: `Salida de ${cantidad} unidades${referencia_tipo ? ` (${referencia_tipo})` : ''}`,
          valor: valorTotal,
          ventaId: referencia_tipo === 'VENTA' || referencia_tipo === 'VENTA_POS' ? referencia_id : undefined,
          tenantId: tenant_id,
        }, tenant_id);

        console.log(`✅ Evento MovimientoStockEvent emitido para salida de stock`);
      } catch (error) {
        console.error('❌ Error emitiendo evento MovimientoStock en descontarStock:', error);
        // No bloquear la operación si falla el evento
      }

      // Registrar auditoría (el userId se podría obtener de la referencia si está disponible)
      // Por ahora, registramos el movimiento que ya tiene auditoría en crearMovimiento
      // La auditoría de productos se puede agregar cuando se disponga de userId

      return movimientoId;
    } catch (error) {
      console.error('❌ Error descontando stock:', error);
      throw error;
    }
  }

  /**
   * Verifica disponibilidad de stock para múltiples productos
   * 
   * @param items - Array de productos con cantidades
   * @param tenant_id - ID del tenant
   * @returns Objeto con disponibilidad y warnings
   */
  async verificarDisponibilidad(
    items: Array<{ producto_id: string; cantidad: number }>,
    tenant_id: string
  ): Promise<{ disponible: boolean; warnings: Array<any> }> {
    try {
      console.log(`🔍 [Tenant: ${tenant_id}] Verificando disponibilidad para ${items.length} productos`);

      const warnings = [];

      for (const item of items) {
        const stockDisponible = await this.getStockDisponible(item.producto_id, tenant_id);

        if (stockDisponible < item.cantidad) {
          // Obtener nombre del producto para el warning
          const { data: producto } = await this.supabase.getClient()
            .from('productos')
            .select('nombre, codigo')
            .eq('tenant_id', tenant_id)
            .eq('id', item.producto_id)
            .single();

          warnings.push({
            producto_id: item.producto_id,
            nombre: producto?.nombre || 'Desconocido',
            codigo: producto?.codigo || '',
            disponible: stockDisponible,
            solicitado: item.cantidad,
            faltante: item.cantidad - stockDisponible
          });
        }
      }

      return {
        disponible: warnings.length === 0,
        warnings
      };
    } catch (error) {
      console.error('❌ Error verificando disponibilidad:', error);
      throw error;
    }
  }

  /**
   * 🔴 CRÍTICO FIX (Tarea 14): Registra entrada de stock de forma atómica usando función RPC
   * Garantiza que el movimiento y el stock se actualicen correctamente en una transacción
   * Reemplaza a registrarMovimientoAlmacen + verificarStockActualizado para entradas
   */
  async registrarEntradaStockAtomico(params: MovimientoAlmacenParams): Promise<string> {
    try {
      console.log(`📦 [Tenant: ${params.tenantId}] Registrando entrada atómica de ${params.cantidad} unidades del producto ${params.productoId}`);

      if (params.tipo !== 'ENTRADA') {
        throw new BadRequestException('Este método solo es para movimientos de ENTRADA. Use otros métodos para otros tipos.');
      }

      if (!params.almacenId) {
        throw new BadRequestException('almacenId es requerido para entrada de stock');
      }

      const client = this.supabase.getClient();

      // Llamar a la función RPC atómica
      const { data: movimientoId, error: rpcError } = await client.rpc('registrar_entrada_stock_atomico', {
        p_producto_id: params.productoId,
        p_almacen_id: params.almacenId,
        p_cantidad: params.cantidad,
        p_referencia_tipo: params.referenciaTipo || null,
        p_referencia_id: params.referenciaId || null,
        p_notas: params.notas || null,
        p_ubicacion_id: params.ubicacionId || null,
        p_lote: params.lote || null,
        p_fecha_expiracion: params.fechaExpiracion || null,
      });

      if (rpcError) {
        console.error('❌ Error en entrada atómica de stock:', rpcError);
        throw new BadRequestException(
          `Error registrando entrada de stock: ${rpcError.message}`
        );
      }

      if (!movimientoId) {
        throw new BadRequestException('No se retornó ID del movimiento creado');
      }

      console.log(`✅ Entrada de stock registrada atómicamente - Movimiento: ${movimientoId}`);

      // Obtener stock actualizado para logging y emisión de evento
      const { data: existencia } = await client
        .from('producto_existencias')
        .select('stock, stock_reservado')
        .eq('tenant_id', params.tenantId)
        .eq('producto_id', params.productoId)
        .eq('almacen_id', params.almacenId)
        .maybeSingle();

      if (existencia) {
        console.log(
          `📊 Stock actualizado en almacén: ${existencia.stock}, Reservado: ${existencia.stock_reservado}`
        );
      }

      // 🔴 CRÍTICO FIX: Emitir evento MovimientoStockEvent para contabilidad
      try {
        // Obtener producto para calcular valores
        const { data: producto } = await client
          .from('productos')
          .select('stock, precio_compra')
          .eq('id', params.productoId)
          .eq('tenant_id', params.tenantId)
          .single();

        if (producto) {
          const stockAnterior = Number(producto.stock || 0) - params.cantidad; // Stock antes de la entrada
          const stockNuevo = Number(producto.stock || 0); // Stock después de la entrada
          const precioCompra = Number(producto.precio_compra || 0);
          const valorTotal = precioCompra * params.cantidad;

          await this.eventBus.emitMovimientoStock({
            productoId: params.productoId,
            tipoMovimiento: 'ENTRADA',
            cantidad: params.cantidad,
            stockAnterior,
            stockNuevo,
            motivo: params.notas || `Entrada de stock${params.referenciaTipo ? ` (${params.referenciaTipo})` : ''}`,
            valor: valorTotal,
            ventaId: undefined, // Entradas no están relacionadas con ventas
            tenantId: params.tenantId,
          }, params.tenantId);

          console.log(`✅ Evento MovimientoStockEvent emitido para entrada atómica de stock`);
        }
      } catch (error) {
        console.error('❌ Error emitiendo evento MovimientoStock en registrarEntradaStockAtomico:', error);
        // No bloquear la operación si falla el evento
      }

      return movimientoId;
    } catch (error) {
      console.error('❌ Error en registrarEntradaStockAtomico:', error);
      throw error;
    }
  }

  /**
   * 🔴 CRÍTICO FIX: Verifica que el stock se haya actualizado correctamente después de un movimiento
   * Valida que el movimiento existe y que el stock en producto_existencias fue actualizado
   */
  async verificarStockActualizado(
    productoId: string,
    almacenId: string,
    tipo: 'ENTRADA' | 'SALIDA' | 'RESERVA' | 'LIBERACION',
    cantidad: number,
    tenantId: string,
    referenciaTipo?: string,
    referenciaId?: string,
  ): Promise<{ stockActualizado: boolean; stockActual?: number; stockReservado?: number; error?: string }> {
    try {
      const client = this.supabase.getClient();

      // 1. Verificar que existe un movimiento reciente con estos parámetros
      const { data: movimiento, error: movimientoError } = await client
        .from('movimientos_inventario')
        .select('id, tipo, cantidad, referencia_tipo, referencia_id, created_at')
        .eq('tenant_id', tenantId)
        .eq('producto_id', productoId)
        .eq('tipo', tipo)
        .eq('cantidad', cantidad)
        .eq('referencia_tipo', referenciaTipo || null)
        .eq('referencia_id', referenciaId || null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (movimientoError || !movimiento) {
        return {
          stockActualizado: false,
          error: `Movimiento de inventario no encontrado: ${movimientoError?.message || 'No se encontró movimiento'}`,
        };
      }

      // Verificar que el movimiento es reciente (últimos 30 segundos)
      const movimientoFecha = new Date(movimiento.created_at);
      const ahora = new Date();
      const diferenciaSegundos = (ahora.getTime() - movimientoFecha.getTime()) / 1000;

      if (diferenciaSegundos > 30) {
        return {
          stockActualizado: false,
          error: `Movimiento encontrado pero es demasiado antiguo (${diferenciaSegundos.toFixed(0)}s). Puede ser un movimiento anterior.`,
        };
      }

      // 2. Verificar que el stock en producto_existencias fue actualizado correctamente
      const { data: existencia, error: existenciaError } = await client
        .from('producto_existencias')
        .select('stock, stock_reservado, producto_id, almacen_id')
        .eq('tenant_id', tenantId)
        .eq('producto_id', productoId)
        .eq('almacen_id', almacenId)
        .maybeSingle();

      if (existenciaError) {
        return {
          stockActualizado: false,
          error: `Error obteniendo existencia del producto: ${existenciaError.message}`,
        };
      }

      // Si es ENTRADA y no hay existencia, algo está mal (debería haberse creado)
      if (tipo === 'ENTRADA' && !existencia) {
        return {
          stockActualizado: false,
          error: `Movimiento de ENTRADA registrado pero no se encontró existencia en almacén ${almacenId}`,
        };
      }

      // Si es SALIDA/RESERVA/LIBERACION y no hay existencia, puede ser válido si el stock era 0
      if ((tipo === 'SALIDA' || tipo === 'RESERVA' || tipo === 'LIBERACION') && !existencia) {
        // Esto puede ser válido si el producto no tenía existencia antes
        // Verificar el stock agregado en la tabla productos
        const { data: producto, error: productoError } = await client
          .from('productos')
          .select('stock, stock_reservado')
          .eq('id', productoId)
          .eq('tenant_id', tenantId)
          .single();

        if (productoError || !producto) {
          return {
            stockActualizado: false,
            error: `Error obteniendo stock del producto: ${productoError?.message || 'Producto no encontrado'}`,
          };
        }

        return {
          stockActualizado: true,
          stockActual: Number(producto.stock || 0),
          stockReservado: Number(producto.stock_reservado || 0),
        };
      }

      // 3. Verificar que el stock se actualizó correctamente según el tipo de movimiento
      if (existencia) {
        const stockActual = Number(existencia.stock || 0);
        const stockReservado = Number(existencia.stock_reservado || 0);

        // Para ENTRADA: stock debe haber aumentado
        // Para SALIDA: stock debe haber disminuido (pero no podemos validar el valor exacto sin conocer el anterior)
        // Para RESERVA: stock_reservado debe haber aumentado
        // Para LIBERACION: stock_reservado debe haber disminuido

        // Verificar también el stock agregado en productos
        const { data: producto, error: productoError } = await client
          .from('productos')
          .select('stock, stock_reservado')
          .eq('id', productoId)
          .eq('tenant_id', tenantId)
          .single();

        if (productoError || !producto) {
          return {
            stockActualizado: false,
            error: `Error obteniendo stock agregado del producto: ${productoError?.message || 'Producto no encontrado'}`,
          };
        }

        const stockAgregadoActual = Number(producto.stock || 0);
        const stockAgregadoReservado = Number(producto.stock_reservado || 0);

        // Validación básica: los valores deben ser no negativos
        if (stockActual < 0 || stockReservado < 0 || stockAgregadoActual < 0 || stockAgregadoReservado < 0) {
          return {
            stockActualizado: false,
            error: `Stock actualizado pero tiene valores negativos (stock: ${stockActual}, stock_reservado: ${stockReservado})`,
          };
        }

        return {
          stockActualizado: true,
          stockActual: stockAgregadoActual,
          stockReservado: stockAgregadoReservado,
        };
      }

      return {
        stockActualizado: true,
        stockActual: 0,
        stockReservado: 0,
      };
    } catch (error) {
      console.error('❌ Error verificando stock actualizado:', error);
      return {
        stockActualizado: false,
      error: `Excepción verificando stock: ${error.message}`,
      };
    }
  }

  async obtenerKardexValorizado(
    tenantId: string,
    filtros: KardexValorizadoFiltros = {},
  ): Promise<{ success: boolean; data: any[]; resumen: any }> {
    const startedAt = Date.now();
    try {
      const client = this.supabase.getClient();
      const limit = filtros.limit && filtros.limit > 0 ? Math.min(filtros.limit, 500) : 200;

      let itemsQuery = client
        .from('vw_kardex_valorizado')
        .select(
          `
            recepcion_item_id,
            recepcion_id,
            tenant_id,
            recepcion_numero,
            fecha_recepcion,
            recepcion_estado,
            producto_id,
            producto_codigo,
            producto_nombre,
            producto_sku,
            cantidad_recibida,
            costo_unitario,
            valor_total,
            almacen_id,
            almacen_nombre,
            ubicacion_id,
            ubicacion_codigo,
            lote,
            serie,
            fecha_expiracion,
            moneda_detalle
          `,
        )
        .eq('tenant_id', tenantId);

      if (filtros.productoId) {
        itemsQuery = itemsQuery.eq('producto_id', filtros.productoId);
      }

      if (filtros.almacenId) {
        itemsQuery = itemsQuery.eq('almacen_id', filtros.almacenId);
      }

      const fechaDesde = this.normalizeDateFilter(filtros.desde, 'start');
      if (fechaDesde) {
        itemsQuery = itemsQuery.gte('fecha_recepcion', fechaDesde);
      }

      const fechaHasta = this.normalizeDateFilter(filtros.hasta, 'end');
      if (fechaHasta) {
        itemsQuery = itemsQuery.lte('fecha_recepcion', fechaHasta);
      }

      itemsQuery = itemsQuery.order('fecha_recepcion', { ascending: false }).limit(limit);

      const { data: itemsData, error } = await itemsQuery;
      if (error) {
        throw error;
      }

      const movimientos = (itemsData ?? []).map((item: any) => {
        const cantidad = Number(item.cantidad_recibida ?? 0);
        const costoUnitario = this.round2(Number(item.costo_unitario ?? 0));
        const valorTotal = this.round2(Number(item.valor_total ?? 0));

        return {
          id: item.recepcion_item_id,
          tipo: 'ENTRADA',
          fecha: this.sanitizeDateOutput(item.fecha_recepcion) ?? null,
          documento: item.recepcion_numero ?? null,
          estado: item.recepcion_estado ?? null,
          cantidad,
          costoUnitario,
          valorTotal,
          moneda: item.moneda_detalle ?? 'PEN',
          producto: {
            id: item.producto_id,
            nombre: item.producto_nombre ?? 'Producto',
            codigo: item.producto_codigo ?? null,
            sku: item.producto_sku ?? null,
          },
          almacen: item.almacen_id
            ? {
                id: item.almacen_id,
                nombre: item.almacen_nombre ?? 'Almacén',
                codigo: null,
              }
            : null,
          ubicacion: item.ubicacion_id
            ? {
                id: item.ubicacion_id,
                codigo: item.ubicacion_codigo ?? null,
              }
            : null,
          lote: item.lote ?? null,
          serie: item.serie ?? null,
          fechaExpiracion: this.sanitizeDateOutput(item.fecha_expiracion, true),
          recepcionId: item.recepcion_id,
        };
      });

      movimientos.sort((a, b) => {
        const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
        const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
        return fechaB - fechaA;
      });

      const totalEntradas = movimientos.reduce((sum, mov) => sum + Number(mov.cantidad ?? 0), 0);
      const valorEntradas = movimientos.reduce((sum, mov) => sum + Number(mov.valorTotal ?? 0), 0);
      const valorPorMoneda = movimientos.reduce<Record<string, number>>((acc, mov) => {
        const moneda = mov.moneda ?? 'PEN';
        acc[moneda] = (acc[moneda] ?? 0) + Number(mov.valorTotal ?? 0);
        return acc;
      }, {});

      const resumen = {
        totalMovimientos: movimientos.length,
        totalEntradas: this.round2(totalEntradas),
        valorEntradas: this.round2(valorEntradas),
        saldoCantidad: this.round2(totalEntradas),
        saldoValorizado: this.round2(valorEntradas),
        valorPorMoneda: Object.entries(valorPorMoneda).reduce<Record<string, number>>((acc, [moneda, valor]) => {
          acc[moneda] = this.round2(valor);
          return acc;
        }, {}),
      };

      await this.registrarIntegrationLog({
        tenantId,
        servicio: 'INVENTARIO',
        operacion: 'kardex.valorizado',
        status: 'SUCCESS',
        requestSummary: filtros,
        responseSummary: resumen,
        durationMs: Date.now() - startedAt,
      });

      return {
        success: true,
        data: movimientos,
        resumen,
      };
    } catch (error) {
      await this.registrarIntegrationLog({
        tenantId,
        servicio: 'INVENTARIO',
        operacion: 'kardex.valorizado',
        status: 'ERROR',
        requestSummary: filtros,
        errorMessage: error?.message ?? 'Error desconocido',
        durationMs: Date.now() - startedAt,
      });
      this.logger.error('❌ [Inventario] Error obteniendo kardex valorizado:', error);
      throw new BadRequestException('No se pudo obtener el kardex valorizado');
    }
  }

  async obtenerRecepcionPorId(tenantId: string, recepcionId: string): Promise<{ success: boolean; data: any }> {
    const startedAt = Date.now();
    try {
      const client = this.supabase.getClient();

      const { data: recepcion, error } = await client
        .from('recepciones')
        .select(
          `
            id,
            tenant_id,
            numero,
            fecha_recepcion,
            estado,
            observaciones,
            orden:ordenes_compra (
              id,
              numero,
              proveedor_id,
              moneda,
              total,
              proveedor:proveedores (
                id,
                razon_social,
                documento_tipo,
                documento_numero
              )
            )
          `,
        )
        .eq('tenant_id', tenantId)
        .eq('id', recepcionId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!recepcion) {
        throw new NotFoundException('Recepción no encontrada');
      }

      const { data: itemsData, error: itemsError } = await client
        .from('recepcion_items')
        .select(
          `
            id,
            recepcion_id,
            producto_id,
            cantidad_recibida,
            calidad,
            almacen_id,
            ubicacion_id,
            lote,
            serie,
            fecha_expiracion,
            detalle_id
          `,
        )
        .eq('recepcion_id', recepcionId);

      if (itemsError) {
        throw itemsError;
      }

      const productoIds = new Set<string>();
      const detalleIds = new Set<string>();
      const almacenIds = new Set<string>();
      const ubicacionIds = new Set<string>();

      (itemsData ?? []).forEach((item: any) => {
        if (item.producto_id) productoIds.add(item.producto_id);
        if (item.detalle_id) detalleIds.add(item.detalle_id);
        if (item.almacen_id) almacenIds.add(item.almacen_id);
        if (item.ubicacion_id) ubicacionIds.add(item.ubicacion_id);
      });

      const [productosResp, detallesResp, almacenesResp, ubicacionesResp] = await Promise.all([
        productoIds.size
          ? client
              .from('productos')
              .select('id, nombre, codigo, sku, precio_compra')
              .eq('tenant_id', tenantId)
              .in('id', Array.from(productoIds))
          : Promise.resolve({ data: [] as any[], error: null }),
        detalleIds.size
          ? client
              .from('orden_compra_detalles')
              .select('id, precio_unitario, moneda')
              .in('id', Array.from(detalleIds))
          : Promise.resolve({ data: [] as any[], error: null }),
        almacenIds.size
          ? client
              .from('almacenes')
              .select('id, nombre, codigo')
              .in('id', Array.from(almacenIds))
          : Promise.resolve({ data: [] as any[], error: null }),
        ubicacionIds.size
          ? client
              .from('almacen_ubicaciones')
              .select('id, codigo, descripcion')
              .in('id', Array.from(ubicacionIds))
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (productosResp.error) throw productosResp.error;
      if (detallesResp.error) throw detallesResp.error;
      if (almacenesResp.error) throw almacenesResp.error;
      if (ubicacionesResp.error) throw ubicacionesResp.error;

      const productoMap = new Map<string, any>(
        (productosResp.data ?? []).map((producto: any) => [producto.id, producto]),
      );
      const detalleMap = new Map<string, any>(
        (detallesResp.data ?? []).map((detalle: any) => [detalle.id, detalle]),
      );
      const almacenMap = new Map<string, any>(
        (almacenesResp.data ?? []).map((almacen: any) => [almacen.id, almacen]),
      );
      const ubicacionMap = new Map<string, any>(
        (ubicacionesResp.data ?? []).map((ubicacion: any) => [ubicacion.id, ubicacion]),
      );

      const itemsConstruidos = (itemsData ?? []).map((item: any) => {
        const producto = productoMap.get(item.producto_id);
        const detalle = detalleMap.get(item.detalle_id);
        const almacen = almacenMap.get(item.almacen_id);
        const ubicacion = ubicacionMap.get(item.ubicacion_id);

        const cantidad = Number(item.cantidad_recibida ?? 0);
        const costoUnitario =
          detalle?.precio_unitario != null
            ? Number(detalle.precio_unitario)
            : producto?.precio_compra != null
            ? Number(producto.precio_compra)
            : 0;
        const valorTotal = this.round2(cantidad * costoUnitario);

        return {
          id: item.id,
          cantidad,
          costoUnitario: this.round2(costoUnitario),
          valorTotal,
          calidad: item.calidad,
          lote: item.lote ?? null,
          serie: item.serie ?? null,
          fechaExpiracion: this.sanitizeDateOutput(item.fecha_expiracion, true),
          almacen: almacen ? { id: almacen.id, nombre: almacen.nombre, codigo: almacen.codigo } : null,
          ubicacion: ubicacion
            ? { id: ubicacion.id, codigo: ubicacion.codigo, descripcion: ubicacion.descripcion }
            : null,
          producto: producto
            ? {
                id: item.producto_id,
                nombre: producto.nombre,
                codigo: producto.codigo,
                sku: producto.sku,
              }
            : { id: item.producto_id },
        };
      });

      const totalCantidad = itemsConstruidos.reduce((sum, item) => sum + Number(item.cantidad ?? 0), 0);
      const totalValorizado = itemsConstruidos.reduce((sum, item) => sum + Number(item.valorTotal ?? 0), 0);

      const respuesta = {
        id: recepcion.id,
        numero: recepcion.numero,
        fechaRecepcion: this.sanitizeDateOutput(recepcion.fecha_recepcion),
        estado: recepcion.estado,
        observaciones: recepcion.observaciones,
        orden: (recepcion.orden && !Array.isArray(recepcion.orden))
          ? {
              id: (recepcion.orden as any).id,
              numero: (recepcion.orden as any).numero,
              moneda: (recepcion.orden as any).moneda,
              total: (recepcion.orden as any).total,
            }
          : null,
        proveedor: (recepcion.orden && !Array.isArray(recepcion.orden) && (recepcion.orden as any).proveedor && !Array.isArray((recepcion.orden as any).proveedor))
          ? {
              id: (recepcion.orden as any).proveedor.id,
              razonSocial: (recepcion.orden as any).proveedor.razon_social,
              documentoTipo: (recepcion.orden as any).proveedor.ruc ? 'RUC' : null,
              documentoNumero: (recepcion.orden as any).proveedor.ruc ?? null,
            }
          : null,
        totalItems: itemsConstruidos.length,
        totalCantidad: this.round2(totalCantidad),
        totalValorizado: this.round2(totalValorizado),
        items: itemsConstruidos,
      };

      await this.registrarIntegrationLog({
        tenantId,
        servicio: 'INVENTARIO',
        operacion: 'recepciones.detalle',
        correlacionId: recepcionId,
        correlacionTipo: 'RECEPCION',
        status: 'SUCCESS',
        responseSummary: { totalItems: itemsConstruidos.length },
        durationMs: Date.now() - startedAt,
      });

      return {
        success: true,
        data: respuesta,
      };
    } catch (error) {
      await this.registrarIntegrationLog({
        tenantId,
        servicio: 'INVENTARIO',
        operacion: 'recepciones.detalle',
        correlacionId: recepcionId,
        correlacionTipo: 'RECEPCION',
        status: 'ERROR',
        errorMessage: error?.message ?? 'Error desconocido',
        durationMs: Date.now() - startedAt,
      });
      this.logger.error(`❌ [Inventario] Error obteniendo recepción ${recepcionId}:`, error);
      throw error instanceof NotFoundException
        ? error
        : new BadRequestException('No se pudo obtener el detalle de la recepción');
    }
  }

  async listarRecepciones(
    tenantId: string,
    filtros: ListarRecepcionesFiltros = {},
  ): Promise<{
    success: boolean;
    data: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const startedAt = Date.now();
    try {
      const client = this.supabase.getClient();
      const page = filtros.page && filtros.page > 0 ? filtros.page : 1;
      const limit = filtros.limit && filtros.limit > 0 && filtros.limit <= 200 ? filtros.limit : 50;
      const offset = (page - 1) * limit;

      const estado = filtros.estado ? filtros.estado.toUpperCase() : undefined;
      const sanitizedSearch = this.sanitizeSearchTerm(filtros.search);

      const fechaDesde = this.normalizeDateFilter(filtros.desde, 'start');
      const fechaHasta = this.normalizeDateFilter(filtros.hasta, 'end');

      let recepcionesQuery = client
        .from('vw_inventario_recepciones')
        .select(
          `
            recepcion_id,
            tenant_id,
            numero,
            fecha_recepcion,
            estado,
            observaciones,
            gre_proveedor,
            orden_id,
            numero_orden,
            proveedor_id,
            proveedor_nombre,
            proveedor_ruc,
            total_items,
            cantidad_total,
            valor_total,
            moneda,
            created_at,
            updated_at
          `,
          { count: 'exact' },
        )
        .eq('tenant_id', tenantId);

      if (estado) {
        recepcionesQuery = recepcionesQuery.eq('estado', estado);
      }

      if (fechaDesde) {
        recepcionesQuery = recepcionesQuery.gte('fecha_recepcion', fechaDesde);
      }

      if (fechaHasta) {
        recepcionesQuery = recepcionesQuery.lte('fecha_recepcion', fechaHasta);
      }

      if (sanitizedSearch) {
        const searchPattern = `%${sanitizedSearch}%`;
        recepcionesQuery = recepcionesQuery.or(
          [
            `numero.ilike.${searchPattern}`,
            `numero_orden.ilike.${searchPattern}`,
            `proveedor_nombre.ilike.${searchPattern}`,
            `proveedor_ruc.ilike.${searchPattern}`,
          ].join(','),
        );
      }

      recepcionesQuery = recepcionesQuery
        .order('fecha_recepcion', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: recepcionesData, error, count } = await recepcionesQuery;

      if (error) {
        throw error;
      }

      const recepcionList = (recepcionesData ?? []).map((recepcion: any) => ({
        id: recepcion.recepcion_id,
        numero: recepcion.numero,
        fechaRecepcionIso: recepcion.fecha_recepcion,
        estado: recepcion.estado,
        observaciones: recepcion.observaciones,
        greProveedor: recepcion.gre_proveedor,
        ordenId: recepcion.orden_id,
        numeroOrden: recepcion.numero_orden,
        proveedorId: recepcion.proveedor_id,
        proveedorNombre: recepcion.proveedor_nombre,
        proveedorRuc: recepcion.proveedor_ruc,
        totalItems: Number(recepcion.total_items ?? 0),
        cantidadTotal: Number(recepcion.cantidad_total ?? 0),
        valorTotal: Number(recepcion.valor_total ?? 0),
        moneda: recepcion.moneda ?? 'PEN',
      }));

      if (recepcionList.length === 0) {
        await this.registrarIntegrationLog({
          tenantId,
          servicio: 'INVENTARIO',
          operacion: 'recepciones.listar',
          status: 'SUCCESS',
          requestSummary: filtros,
          responseSummary: { total: 0 },
          durationMs: Date.now() - startedAt,
        });

        return {
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }

      const recepcionIds = recepcionList.map((recepcion) => recepcion.id);

      let itemsQuery = client
        .from('recepcion_items')
        .select(
          `
            id,
            recepcion_id,
            producto_id,
            cantidad_recibida,
            calidad,
            almacen_id,
            ubicacion_id,
            lote,
            serie,
            fecha_expiracion,
            detalle_id
          `,
        )
        .in('recepcion_id', recepcionIds);

      if (filtros.almacenId) {
        itemsQuery = itemsQuery.eq('almacen_id', filtros.almacenId);
      }

      const { data: itemsData, error: itemsError } = await itemsQuery;
      if (itemsError) {
        throw itemsError;
      }

      const itemsByRecepcion = new Map<string, any[]>();
      const productoIds = new Set<string>();
      const detalleIds = new Set<string>();
      const almacenIds = new Set<string>();
      const ubicacionIds = new Set<string>();
      const ordenIds = new Set<string>();
      const proveedorIds = new Set<string>();

      (itemsData ?? []).forEach((item: any) => {
        if (!itemsByRecepcion.has(item.recepcion_id)) {
          itemsByRecepcion.set(item.recepcion_id, []);
        }
        itemsByRecepcion.get(item.recepcion_id)!.push(item);

        if (item.producto_id) productoIds.add(item.producto_id);
        if (item.detalle_id) detalleIds.add(item.detalle_id);
        if (item.almacen_id) almacenIds.add(item.almacen_id);
        if (item.ubicacion_id) ubicacionIds.add(item.ubicacion_id);
      });

      recepcionList.forEach((recepcion) => {
        if (recepcion.ordenId) {
          ordenIds.add(recepcion.ordenId);
        }
        if (recepcion.proveedorId) {
          proveedorIds.add(recepcion.proveedorId);
        }
      });

      const [productosResp, detallesResp, almacenesResp, ubicacionesResp, ordenesResp, proveedoresResp] = await Promise.all([
        productoIds.size
          ? client
              .from('productos')
              .select('id, nombre, codigo, sku, precio_compra')
              .eq('tenant_id', tenantId)
              .in('id', Array.from(productoIds))
          : Promise.resolve({ data: [] as any[], error: null }),
        detalleIds.size
          ? client
              .from('orden_compra_detalles')
              .select('id, precio_unitario, moneda')
              .in('id', Array.from(detalleIds))
          : Promise.resolve({ data: [] as any[], error: null }),
        almacenIds.size
          ? client
              .from('almacenes')
              .select('id, nombre, codigo')
              .in('id', Array.from(almacenIds))
          : Promise.resolve({ data: [] as any[], error: null }),
        ubicacionIds.size
          ? client
              .from('almacen_ubicaciones')
              .select('id, codigo, descripcion')
              .in('id', Array.from(ubicacionIds))
          : Promise.resolve({ data: [] as any[], error: null }),
        ordenIds.size
          ? client
              .from('ordenes_compra')
              .select('id, numero, moneda, total')
              .eq('tenant_id', tenantId)
              .in('id', Array.from(ordenIds))
          : Promise.resolve({ data: [] as any[], error: null }),
        proveedorIds.size
          ? client
              .from('proveedores')
              .select('id, razon_social, ruc')
              .eq('tenant_id', tenantId)
              .in('id', Array.from(proveedorIds))
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (productosResp.error) throw productosResp.error;
      if (detallesResp.error) throw detallesResp.error;
      if (almacenesResp.error) throw almacenesResp.error;
      if (ubicacionesResp.error) throw ubicacionesResp.error;
      if (ordenesResp.error) throw ordenesResp.error;
      if (proveedoresResp.error) throw proveedoresResp.error;

      const productoMap = new Map<string, any>(
        (productosResp.data ?? []).map((producto: any) => [producto.id, producto]),
      );
      const detalleMap = new Map<string, any>(
        (detallesResp.data ?? []).map((detalle: any) => [detalle.id, detalle]),
      );
      const almacenMap = new Map<string, any>(
        (almacenesResp.data ?? []).map((almacen: any) => [almacen.id, almacen]),
      );
      const ubicacionMap = new Map<string, any>(
        (ubicacionesResp.data ?? []).map((ubicacion: any) => [ubicacion.id, ubicacion]),
      );
      const ordenMap = new Map<string, any>(
        (ordenesResp.data ?? []).map((orden: any) => [orden.id, orden]),
      );
      const proveedorMap = new Map<string, any>(
        (proveedoresResp.data ?? []).map((proveedor: any) => [proveedor.id, proveedor]),
      );

      const resultados = recepcionList
        .map((recepcion) => {
          const items = itemsByRecepcion.get(recepcion.id) ?? [];
          if (filtros.almacenId && items.length === 0) {
            return null;
          }

          const detalleOrden = recepcion.ordenId ? ordenMap.get(recepcion.ordenId) : null;
          const proveedorDetalle = recepcion.proveedorId ? proveedorMap.get(recepcion.proveedorId) : null;

          const itemsConstruidos = items.map((item: any) => {
            const producto = productoMap.get(item.producto_id);
            const detalle = detalleMap.get(item.detalle_id);
            const almacen = almacenMap.get(item.almacen_id);
            const ubicacion = ubicacionMap.get(item.ubicacion_id);

            const cantidad = Number(item.cantidad_recibida ?? 0);
            const costoUnitario =
              detalle?.precio_unitario != null
                ? Number(detalle.precio_unitario)
                : producto?.precio_compra != null
                ? Number(producto.precio_compra)
                : 0;
            const valorTotal = this.round2(cantidad * costoUnitario);

            return {
              id: item.id,
              cantidad,
              costoUnitario: this.round2(costoUnitario),
              valorTotal,
              calidad: item.calidad,
              lote: item.lote ?? null,
              serie: item.serie ?? null,
              fechaExpiracion: this.sanitizeDateOutput(item.fecha_expiracion, true),
              almacen: almacen
                ? { id: almacen.id, nombre: almacen.nombre, codigo: almacen.codigo }
                : null,
              ubicacion: ubicacion
                ? { id: ubicacion.id, codigo: ubicacion.codigo, descripcion: ubicacion.descripcion }
                : null,
              producto: producto
                ? {
                    id: item.producto_id,
                    nombre: producto.nombre,
                    codigo: producto.codigo,
                    sku: producto.sku,
                  }
                : { id: item.producto_id },
            };
          });

          const totalCantidadItems = itemsConstruidos.reduce(
            (sum, item) => sum + Number(item?.cantidad ?? 0),
            0,
          );
          const totalValorizadoItems = itemsConstruidos.reduce(
            (sum, item) => sum + Number(item?.valorTotal ?? 0),
            0,
          );
          const almacenesAsociados = Array.from(
            new Map(
              itemsConstruidos
                .filter((item) => item.almacen)
                .map((item) => [item.almacen!.id, item.almacen]),
            ).values(),
          );

          const proveedor = proveedorDetalle
            ? {
                id: proveedorDetalle.id,
                razonSocial: proveedorDetalle.razon_social,
                documentoTipo: proveedorDetalle.ruc ? 'RUC' : null,
                documentoNumero: proveedorDetalle.ruc ?? null,
              }
            : recepcion.proveedorNombre
            ? {
                id: recepcion.proveedorId,
                razonSocial: recepcion.proveedorNombre,
                documentoTipo: recepcion.proveedorRuc ? 'RUC' : null,
                documentoNumero: recepcion.proveedorRuc ?? null,
              }
            : null;

          const totalCantidad = filtros.almacenId
            ? this.round2(totalCantidadItems)
            : this.round2(recepcion.cantidadTotal);
          const totalValorizado = filtros.almacenId
            ? this.round2(totalValorizadoItems)
            : this.round2(recepcion.valorTotal);
          const totalItems = filtros.almacenId ? itemsConstruidos.length : recepcion.totalItems;

          return {
            id: recepcion.id,
            numero: recepcion.numero,
            fechaRecepcion: this.sanitizeDateOutput(recepcion.fechaRecepcionIso),
            estado: recepcion.estado,
            observaciones: recepcion.observaciones,
            greProveedor: recepcion.greProveedor,
            orden: detalleOrden
              ? {
                  id: detalleOrden.id,
                  numero: detalleOrden.numero,
                  moneda: detalleOrden.moneda,
                  total: detalleOrden.total,
                }
              : recepcion.ordenId
              ? {
                  id: recepcion.ordenId,
                  numero: recepcion.numeroOrden,
                  moneda: recepcion.moneda,
                  total: recepcion.valorTotal,
                }
              : null,
            proveedor,
            totalItems,
            totalCantidad,
            totalValorizado,
            almacenes: almacenesAsociados,
            items: itemsConstruidos,
          };
        })
        .filter((recepcion) => recepcion !== null) as any[];

      const filteredResultados =
        sanitizedSearch && filtros.search
          ? resultados.filter((recepcion) => {
              const search = sanitizedSearch.toLowerCase();
              return (
                (recepcion.numero || '').toLowerCase().includes(search) ||
                (recepcion.orden?.numero || '').toLowerCase().includes(search) ||
                (recepcion.proveedor?.razonSocial || '').toLowerCase().includes(search)
              );
            })
          : resultados;

      const total =
        filtros.almacenId || sanitizedSearch ? filteredResultados.length : count ?? filteredResultados.length;
      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

      await this.registrarIntegrationLog({
        tenantId,
        servicio: 'INVENTARIO',
        operacion: 'recepciones.listar',
        status: 'SUCCESS',
        requestSummary: filtros,
        responseSummary: { total: filteredResultados.length },
        durationMs: Date.now() - startedAt,
      });

      return {
        success: true,
        data: filteredResultados,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      await this.registrarIntegrationLog({
        tenantId,
        servicio: 'INVENTARIO',
        operacion: 'recepciones.listar',
        status: 'ERROR',
        requestSummary: filtros,
        errorMessage: error?.message ?? 'Error desconocido',
        durationMs: Date.now() - startedAt,
      });
      this.logger.error('❌ [Inventario] Error listando recepciones:', error);
      throw new BadRequestException('No se pudieron obtener las recepciones');
    }
  }

  private normalizeDateFilter(value?: string, boundary: 'start' | 'end' = 'start'): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    // HARDENING: sanitizar filtros de fechas para evitar inyecciones o fechas inválidas.
    const isoCandidate = trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00Z`;
    const parsed = new Date(isoCandidate);
    if (Number.isNaN(parsed.getTime())) {
      this.logger.warn(`⚠️ [Inventario] Fecha inválida recibida en filtros: "${value}"`);
      return null;
    }

    if (boundary === 'end') {
      parsed.setUTCHours(23, 59, 59, 999);
    } else {
      parsed.setUTCHours(0, 0, 0, 0);
    }

    return parsed.toISOString();
  }

  private sanitizeDateOutput(value?: string | null, dateOnly = false): string | null {
    if (!value) {
      return null;
    }

    const candidate = value.includes('T') ? value : `${value}T00:00:00Z`;
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    const iso = parsed.toISOString();
    return dateOnly ? iso.split('T')[0] : iso;
  }

  private sanitizeSearchTerm(value?: string | null): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.replace(/[%_]/g, '');
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async registrarIntegrationLog(entry: {
    tenantId: string;
    servicio: string;
    operacion: string;
    correlacionId?: string | null;
    correlacionTipo?: string | null;
    status: 'SUCCESS' | 'ERROR';
    requestSummary?: Record<string, any>;
    responseSummary?: Record<string, any>;
    errorMessage?: string;
    durationMs?: number;
  }): Promise<void> {
    try {
      await this.supabase
        .getClient()
        .from('integration_logs')
        .insert({
          tenant_id: entry.tenantId,
          servicio: entry.servicio,
          operacion: entry.operacion,
          correlacion_id: entry.correlacionId ?? null,
          correlacion_tipo: entry.correlacionTipo ?? null,
          status: entry.status,
          request_summary: entry.requestSummary ?? null,
          response_summary: entry.responseSummary ?? null,
          error_message: entry.errorMessage ?? null,
          duration_ms: entry.durationMs ?? null,
        });
    } catch (error) {
      this.logger.error('❌ [Inventario] Error registrando integration_log:', error);
    }
  }

  async registrarMovimientoAlmacen(params: MovimientoAlmacenParams): Promise<void> {
    const {
      tenantId,
      productoId,
      almacenId,
      tipo,
      cantidad,
      referenciaTipo,
      referenciaId,
      notas,
      ubicacionId,
      lote,
      fechaExpiracion,
    } = params;

    console.log(
      `🏷️ [Tenant: ${tenantId}] Registrando movimiento ${tipo} de ${cantidad} unidades para producto ${productoId} en almacén ${almacenId}`,
    );

    const { error } = await this.supabase.getClient().rpc('registrar_movimiento_almacen', {
      p_producto_id: productoId,
      p_almacen_id: almacenId,
      p_tipo: tipo,
      p_cantidad: cantidad,
      p_referencia_tipo: referenciaTipo,
      p_referencia_id: referenciaId,
      p_notas: notas ?? null,
      p_ubicacion_id: ubicacionId ?? null,
      p_lote: lote ?? null,
      p_fecha_expiracion: fechaExpiracion ?? null,
    });

    if (error) {
      console.error('❌ Error registrando movimiento de almacén:', error);
      throw new BadRequestException(`No se pudo registrar el movimiento de almacén: ${error.message}`);
    }
  }

  async registrarRetornoRma(
    rmaItemId: string,
    cantidad: number,
    almacenId: string,
    opciones?: { ubicacionId?: string; lote?: string; fechaExpiracion?: string | null },
  ): Promise<void> {
    const { error } = await this.supabase.getClient().rpc('rma_retorno_inventario', {
      p_rma_item_id: rmaItemId,
      p_cantidad: cantidad,
      p_almacen_id: almacenId,
      p_ubicacion_id: opciones?.ubicacionId ?? null,
      p_lote: opciones?.lote ?? null,
      p_fecha_expiracion: opciones?.fechaExpiracion ?? null,
    });

    if (error) {
      console.error('❌ Error registrando retorno de RMA:', error);
      throw new BadRequestException(`No se pudo registrar el retorno de inventario: ${error.message}`);
    }
  }
}
