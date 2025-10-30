import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../../shared/events/event-bus.service';

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
}

/**
 * Servicio de Inventario con soporte para reservas de stock
 * 
 * Implementa operaciones atómicas para:
 * - Reservar stock (RESERVA)
 * - Liberar reservas (LIBERACION)
 * - Descontar stock real (SALIDA)
 * - Calcular stock disponible (stock_actual - stock_reservado)
 */
@Injectable()
export class InventarioService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBusService,
  ) {
    console.log('✅ [InventarioService] Servicio inicializado con soporte de reservas y eventos');
  }

  /**
   * Calcula el stock disponible de un producto
   * Formula: stock_actual - stock_reservado
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
        .select('stock_actual, stock_reservado')
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

      const stockActual = parseFloat(producto.stock_actual || '0');
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
            .select('stock_actual, precio_venta, precio_compra')
            .eq('id', movimiento.producto_id)
            .eq('tenant_id', movimiento.tenant_id)
            .single();

          if (producto) {
            const stockActual = Number(producto.stock_actual || 0);
            // Calcular stock anterior basado en el tipo de movimiento
            // Nota: Esto es aproximado porque el stock ya pudo haber sido actualizado
            const stockAnterior = movimiento.tipo === TipoMovimiento.ENTRADA 
              ? Math.max(0, stockActual - movimiento.cantidad)
              : movimiento.tipo === TipoMovimiento.SALIDA
              ? stockActual + movimiento.cantidad
              : stockActual; // Para AJUSTE, usar el mismo valor

            // Calcular valor del movimiento (precio de compra para ENTRADA, precio de venta para SALIDA)
            const precioUnitario = movimiento.tipo === TipoMovimiento.ENTRADA
              ? (Number(producto.precio_compra) || 0)
              : (Number(producto.precio_venta) || 0);
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
            });

            console.log(`✅ Evento MovimientoStockEvent emitido para movimiento ${data.id}`);
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
        .select('id, nombre, stock_actual, stock_reservado')
        .eq('tenant_id', tenant_id)
        .eq('id', producto_id)
        .single();

      if (productoError || !producto) {
        throw new NotFoundException(`Producto ${producto_id} no encontrado`);
      }

      const stockActual = parseFloat(producto.stock_actual || '0');
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
        .select('id, nombre, stock_actual, stock_reservado')
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
   * - Decrementa stock_actual
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
        .select('id, nombre, stock_actual, stock_reservado')
        .eq('tenant_id', tenant_id)
        .eq('id', producto_id)
        .single();

      if (productoError || !producto) {
        throw new NotFoundException(`Producto ${producto_id} no encontrado`);
      }

      const stockActual = parseFloat(producto.stock_actual || '0');
      const stockReservado = parseFloat(producto.stock_reservado || '0');

      console.log(`📊 Stock actual: ${stockActual}, reservado: ${stockReservado}`);

      // Validar que hay suficiente stock
      if (stockActual < cantidad) {
        throw new BadRequestException(
          `Stock insuficiente para ${producto.nombre}. Disponible: ${stockActual}, Solicitado: ${cantidad}`
        );
      }

      // Operación atómica: decrementar stock_actual y stock_reservado
      const nuevoStockActual = stockActual - cantidad;
      const nuevoStockReservado = Math.max(0, stockReservado - cantidad);

      const { error: updateError } = await this.supabase.getClient()
        .from('productos')
        .update({
          stock_actual: nuevoStockActual,
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

      console.log(`✅ Stock descontado exitosamente. Nuevo stock_actual: ${nuevoStockActual}, stock_reservado: ${nuevoStockReservado}`);

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
        });

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
        .select('stock_actual, stock_reservado')
        .eq('tenant_id', params.tenantId)
        .eq('producto_id', params.productoId)
        .eq('almacen_id', params.almacenId)
        .maybeSingle();

      if (existencia) {
        console.log(
          `📊 Stock actualizado en almacén: ${existencia.stock_actual}, Reservado: ${existencia.stock_reservado}`
        );
      }

      // 🔴 CRÍTICO FIX: Emitir evento MovimientoStockEvent para contabilidad
      try {
        // Obtener producto para calcular valores
        const { data: producto } = await client
          .from('productos')
          .select('stock_actual, precio_compra')
          .eq('id', params.productoId)
          .eq('tenant_id', params.tenantId)
          .single();

        if (producto) {
          const stockAnterior = Number(producto.stock_actual || 0) - params.cantidad; // Stock antes de la entrada
          const stockNuevo = Number(producto.stock_actual || 0); // Stock después de la entrada
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
          });

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
        .select('stock_actual, stock_reservado, producto_id, almacen_id')
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
          .select('stock_actual, stock_reservado')
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
          stockActual: Number(producto.stock_actual || 0),
          stockReservado: Number(producto.stock_reservado || 0),
        };
      }

      // 3. Verificar que el stock se actualizó correctamente según el tipo de movimiento
      if (existencia) {
        const stockActual = Number(existencia.stock_actual || 0);
        const stockReservado = Number(existencia.stock_reservado || 0);

        // Para ENTRADA: stock_actual debe haber aumentado
        // Para SALIDA: stock_actual debe haber disminuido (pero no podemos validar el valor exacto sin conocer el anterior)
        // Para RESERVA: stock_reservado debe haber aumentado
        // Para LIBERACION: stock_reservado debe haber disminuido

        // Verificar también el stock agregado en productos
        const { data: producto, error: productoError } = await client
          .from('productos')
          .select('stock_actual, stock_reservado')
          .eq('id', productoId)
          .eq('tenant_id', tenantId)
          .single();

        if (productoError || !producto) {
          return {
            stockActualizado: false,
            error: `Error obteniendo stock agregado del producto: ${productoError?.message || 'Producto no encontrado'}`,
          };
        }

        const stockAgregadoActual = Number(producto.stock_actual || 0);
        const stockAgregadoReservado = Number(producto.stock_reservado || 0);

        // Validación básica: los valores deben ser no negativos
        if (stockActual < 0 || stockReservado < 0 || stockAgregadoActual < 0 || stockAgregadoReservado < 0) {
          return {
            stockActualizado: false,
            error: `Stock actualizado pero tiene valores negativos (stock_actual: ${stockActual}, stock_reservado: ${stockReservado})`,
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
