import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';

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
  constructor(private readonly supabase: SupabaseService) {
    console.log('✅ [InventarioService] Servicio inicializado con soporte de reservas');
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
