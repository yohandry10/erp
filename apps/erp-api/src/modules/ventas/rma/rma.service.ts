import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { InventarioService } from '../../inventario/inventario.service';
import { DocumentosService } from '../../documentos.service';
import { AlmacenesService } from '../../inventario/almacenes/almacenes.service';
import {
  CrearRmaDto,
  AprobarRmaDto,
  RecepcionarRmaDto,
  GenerarNotaCreditoDto,
  RecepcionarRmaItemDto,
} from './dto';

interface ConfigRma {
  habilitar_rma: boolean;
  dias_maximos_rma: number;
  rma_requiere_control_calidad: boolean;
}

@Injectable()
export class RmaService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly inventarioService: InventarioService,
    private readonly documentosService: DocumentosService,
    private readonly almacenesService: AlmacenesService,
  ) {}

  async listar(tenantId: string, estado?: string) {
    const query = this.supabase
      .getClient()
      .from('rma_solicitudes')
      .select(
        `
        id,
        numero,
        motivo_general,
        tipo,
        estado,
        nota_credito_documento_id,
        almacen_retorno_id,
        aprobado_por,
        aprobado_en,
        recibido_por,
        recibido_en,
        created_at,
        updated_at,
        clientes:cliente_id(id, razon_social, documento_numero)
      `,
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (estado) {
      query.eq('estado', estado);
    }

    const { data, error } = await query;
    if (error) {
      throw new BadRequestException(`Error listando RMA: ${error.message}`);
    }

    return data ?? [];
  }

  async obtenerPorId(tenantId: string, rmaId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('rma_solicitudes')
      .select(
        `
        *,
        items:rma_items(*),
        eventos:rma_eventos(*)
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('id', rmaId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`Error obteniendo RMA: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundException('RMA no encontrada');
    }

    return data;
  }

  async crear(tenantId: string, userId: string | null, dto: CrearRmaDto) {
    const config = await this.obtenerConfig(tenantId);
    if (!config.habilitar_rma) {
      throw new BadRequestException('El flujo de RMA no está habilitado para este tenant');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Debe registrar al menos un item para el RMA');
    }

    const client = this.supabase.getClient();
    const pedido = await this.obtenerPedidoConDetalle(tenantId, dto.pedido_id);

    if (!['FACTURADO', 'LISTO_FACTURAR', 'COMPLETADO', 'DESPACHO_PARCIAL'].includes(pedido.estado)) {
      throw new BadRequestException('Solo se puede crear RMA para pedidos facturados o despachados');
    }

    const detalleMap = new Map(
      pedido.detalle.map((item: any) => [item.id, item]),
    );
    const detalleIds = dto.items.map((item) => item.detalle_id);

    const { data: rmaPrevias, error: rmaPreviasError } = await client
      .from('rma_items')
      .select('detalle_id, cantidad_autorizada, cantidad_devuelta, estado')
      .eq('tenant_id', tenantId)
      .in('detalle_id', detalleIds);

    if (rmaPreviasError) {
      throw new BadRequestException(`Error validando historial de RMA: ${rmaPreviasError.message}`);
    }

    const consumosPrevios = new Map<string, number>();
    (rmaPrevias ?? []).forEach((registro) => {
      if (registro.estado === 'RECHAZADO') {
        return;
      }
      const previo = consumosPrevios.get(registro.detalle_id) ?? 0;
      consumosPrevios.set(registro.detalle_id, previo + Number(registro.cantidad_autorizada ?? 0));
    });

    const itemsInsert = dto.items.map((item) => {
      const detalle = detalleMap.get(item.detalle_id);
      if (!detalle) {
        throw new BadRequestException(`El detalle ${item.detalle_id} no pertenece al pedido`);
      }

      const cantidadDespachada = Number(detalle.cantidad_despachada ?? 0);
      const autorizadaPrevia = consumosPrevios.get(item.detalle_id) ?? 0;
      const disponible = Math.max(cantidadDespachada - autorizadaPrevia, 0);

      if (disponible <= 0) {
        throw new BadRequestException(`El item ${detalle.descripcion} no tiene saldo disponible para RMA`);
      }

      if (item.cantidad > disponible) {
        throw new BadRequestException(
          `La cantidad solicitada (${item.cantidad}) excede el saldo pendiente (${disponible}) para ${detalle.descripcion}`,
        );
      }

      return {
        detalle,
        payload: {
          detalle_id: item.detalle_id,
          producto_id: item.producto_id,
          cantidad_autorizada: item.cantidad,
          motivo_item: item.motivo_item ?? dto.motivo_general ?? 'DEVOLUCIÓN',
          lote: item.lote ?? null,
          fecha_expiracion: item.fecha_expiracion ?? null,
        },
      };
    });

    let almacenRetornoId = dto.almacen_retorno_id ?? null;
    if (config.habilitar_rma_requiere_almacen ?? true) {
      if (almacenRetornoId) {
        await this.almacenesService.obtenerPorId(tenantId, almacenRetornoId);
      } else {
        const principal = await this.almacenesService.obtenerPrincipal(tenantId);
        almacenRetornoId = principal?.id ?? null;
      }
    }

    const numero = await this.generarSecuenciaRma(tenantId);

    const { data: rma, error: rmaError } = await client
      .from('rma_solicitudes')
      .insert({
        tenant_id: tenantId,
        pedido_id: dto.pedido_id,
        cliente_id: pedido.cliente_id,
        numero,
        motivo_general: dto.motivo_general ?? null,
        tipo: 'DEVOLUCION',
        estado: 'CREADA',
        almacen_retorno_id: almacenRetornoId,
      })
      .select()
      .single();

    if (rmaError) {
      throw new BadRequestException(`No se pudo crear la solicitud de RMA: ${rmaError.message}`);
    }

    const itemsPayload = itemsInsert.map(({ payload }) => ({
      tenant_id: tenantId,
      rma_id: rma.id,
      ...payload,
    }));

    const { error: itemsError } = await client.from('rma_items').insert(itemsPayload);
    if (itemsError) {
      throw new BadRequestException(`No se pudieron registrar los items del RMA: ${itemsError.message}`);
    }

    await this.registrarEvento(rma.id, tenantId, 'CREADA', 'RMA creada', { userId, pedidoId: dto.pedido_id });

    return this.obtenerPorId(tenantId, rma.id);
  }

  async aprobar(tenantId: string, userId: string | null, rmaId: string, dto: AprobarRmaDto) {
    const rma = await this.obtenerPorId(tenantId, rmaId);

    if (rma.estado !== 'CREADA') {
      throw new BadRequestException('Solo se pueden aprobar RMA en estado CREADA');
    }

    const aprobar = dto.aprobar ?? true;
    const nuevoEstado = aprobar ? 'APROBADA' : 'RECHAZADA';

    const { error } = await this.supabase
      .getClient()
      .from('rma_solicitudes')
      .update({
        estado: nuevoEstado,
        aprobado_por: userId,
        aprobado_en: new Date().toISOString(),
        notas: dto.notas ?? null,
      })
      .eq('tenant_id', tenantId)
      .eq('id', rmaId);

    if (error) {
      throw new BadRequestException(`No se pudo actualizar la solicitud de RMA: ${error.message}`);
    }

    await this.registrarEvento(rmaId, tenantId, 'APROBACION', `RMA ${nuevoEstado}`, { userId });

    return this.obtenerPorId(tenantId, rmaId);
  }

  async recepcionar(tenantId: string, userId: string | null, rmaId: string, dto: RecepcionarRmaDto) {
    const rma = await this.obtenerPorId(tenantId, rmaId);

    if (!['APROBADA', 'CREADA'].includes(rma.estado)) {
      throw new BadRequestException('Solo se pueden recepcionar RMA aprobadas o pendientes');
    }

    const config = await this.obtenerConfig(tenantId);
    const itemsPorId = new Map<string, any>((rma.items ?? []).map((item: any) => [item.id, item]));

    const almacenesCache = new Set<string>();
    const ubicacionesCache = new Set<string>();

    let almacenDefault = dto.almacen_id ?? rma.almacen_retorno_id ?? null;
    if (config.habilitar_rma_requiere_almacen ?? true) {
      if (almacenDefault) {
        await this.almacenesService.obtenerPorId(tenantId, almacenDefault);
        almacenesCache.add(almacenDefault);
      } else {
        const principal = await this.almacenesService.obtenerPrincipal(tenantId);
        if (!principal) {
          throw new BadRequestException('Debe configurar un almacén de retorno para recibir RMA');
        }
        almacenDefault = principal.id;
        almacenesCache.add(principal.id);
      }
    }

    const movimientos: Array<{ item: any; input: RecepcionarRmaItemDto; almacenId: string }> = [];

    for (const input of dto.items ?? []) {
      const item = itemsPorId.get(input.rma_item_id);
      if (!item) {
        throw new BadRequestException('Se intentó recepcionar un item que no pertenece al RMA');
      }

      const saldoPendiente = Math.max(Number(item.cantidad_autorizada) - Number(item.cantidad_devuelta ?? 0), 0);
      if (input.cantidad_recibida > saldoPendiente) {
        throw new BadRequestException(
          `La cantidad a recepcionar (${input.cantidad_recibida}) excede el saldo pendiente (${saldoPendiente})`,
        );
      }

      const almacenId = input.almacen_id ?? almacenDefault;
      if (!almacenId) {
        throw new BadRequestException('Debe indicar un almacén de retorno');
      }
      if (!almacenesCache.has(almacenId)) {
        await this.almacenesService.obtenerPorId(tenantId, almacenId);
        almacenesCache.add(almacenId);
      }

      const ubicacionId = input.ubicacion_id ?? dto.ubicacion_id ?? null;
      if ((config.rma_requiere_control_calidad ?? false) && !ubicacionId) {
        // El control de calidad requiere ubicación para separar mercadería.
        throw new BadRequestException('Debe indicar una ubicación de control de calidad para el retorno');
      }
      if (ubicacionId) {
        await this.validarUbicacion(tenantId, ubicacionId, ubicacionesCache);
      }

      movimientos.push({ item, input, almacenId });
    }

    for (const movimiento of movimientos) {
      await this.inventarioService.registrarRetornoRma(movimiento.item.id, movimiento.input.cantidad_recibida, movimiento.almacenId, {
        ubicacionId: movimiento.input.ubicacion_id ?? dto.ubicacion_id,
        lote: movimiento.input.lote ?? dto.lote,
        fechaExpiracion: movimiento.input.fecha_expiracion ?? null,
      });
    }

    const { error } = await this.supabase
      .getClient()
      .from('rma_solicitudes')
      .update({
        estado: 'RECIBIDA',
        recibido_por: userId,
        recibido_en: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', rmaId);

    if (error) {
      throw new BadRequestException(`No se pudo actualizar el estado del RMA: ${error.message}`);
    }

    await this.registrarEvento(rmaId, tenantId, 'RECEPCION', 'Mercadería recibida en almacén', { userId });

    return this.obtenerPorId(tenantId, rmaId);
  }

  async generarNotaCredito(tenantId: string, userId: string | null, rmaId: string, dto: GenerarNotaCreditoDto) {
    const rma = await this.obtenerPorId(tenantId, rmaId);
    if (rma.estado !== 'RECIBIDA') {
      throw new BadRequestException('Solo se pueden generar notas de crédito para RMA recibidas');
    }
    if (rma.nota_credito_documento_id) {
      throw new BadRequestException('Ya se generó una nota de crédito para este RMA');
    }

    const client = this.supabase.getClient();
    const { data: pedido, error: pedidoError } = await client
      .from('pedidos_venta')
      .select(
        `
        id,
        numero,
        cliente_id,
        clientes:cliente_id(razon_social, documento_numero, documento_tipo),
        detalle:pedidos_venta_detalle(id, descripcion, precio_unitario, producto_id, cantidad, cantidad_despachada)
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('id', rma.pedido_id)
      .maybeSingle();

    if (pedidoError || !pedido) {
      throw new BadRequestException('No se pudo obtener el pedido asociado a la RMA');
    }

    const detalleMap = new Map<string, any>((pedido.detalle ?? []).map((item: any) => [item.id, item]));

    const detallesNota = [];
    let total = 0;

    for (const item of rma.items ?? []) {
      const fuente = detalleMap.get(item.detalle_id);
      if (!fuente) {
        continue;
      }
      const cantidad = Number(item.cantidad_devuelta ?? item.cantidad_autorizada ?? 0);
      if (cantidad <= 0) {
        continue;
      }

      const precioUnitario = Number(fuente.precio_unitario ?? 0);
      const subtotal = precioUnitario * cantidad;
      total += subtotal;

      detallesNota.push({
        codigo_producto: fuente.producto_id,
        descripcion: fuente.descripcion,
        unidad_medida: 'NIU',
        cantidad,
        precio_unitario: precioUnitario,
        valor_venta: subtotal,
        total_item: subtotal,
      });
    }

    if (detallesNota.length === 0) {
      throw new BadRequestException('No hay items devueltos para generar nota de crédito');
    }

    const documentoData = {
      tipo_documento: 'NOTA_CREDITO',
      motivo_nota_credito: dto.motivo ?? 'DEVOLUCION DE MERCADERIA',
      receptor_numero_doc: pedido.clientes?.documento_numero ?? '',
      receptor_razon_social: pedido.clientes?.razon_social ?? '',
      receptor_tipo_doc: pedido.clientes?.documento_tipo ?? '6',
      moneda: 'PEN',
      total,
      serie: dto.serie,
      detalles: detallesNota,
    };

    const nota = await this.documentosService.crearDocumento(documentoData, tenantId, userId ?? undefined);
    if (!nota?.data) {
      throw new BadRequestException('No se pudo crear la nota de crédito');
    }

    const { error } = await client
      .from('rma_solicitudes')
      .update({
        nota_credito_documento_id: nota.data.id,
        estado: 'CERRADA',
      })
      .eq('tenant_id', tenantId)
      .eq('id', rmaId);

    if (error) {
      throw new BadRequestException(`No se pudo asociar la nota de crédito al RMA: ${error.message}`);
    }

    await this.registrarEvento(rmaId, tenantId, 'NOTA_CREDITO', 'Nota de crédito generada desde RMA', {
      userId,
      documentoId: nota.data.id,
    });

    return this.obtenerPorId(tenantId, rmaId);
  }

  private async registrarEvento(rmaId: string, tenantId: string, tipo: string, descripcion: string, metadata?: any) {
    const { error } = await this.supabase
      .getClient()
      .from('rma_eventos')
      .insert({
        tenant_id: tenantId,
        rma_id: rmaId,
        tipo,
        descripcion,
        metadata: metadata ?? {},
      });

    if (error) {
      console.warn('No se pudo registrar evento de RMA:', error.message);
    }
  }

  private async generarSecuenciaRma(tenantId: string): Promise<string> {
    const { count, error } = await this.supabase
      .getClient()
      .from('rma_solicitudes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (error) {
      throw new BadRequestException(`No se pudo calcular la secuencia de RMA: ${error.message}`);
    }

    const numero = (count ?? 0) + 1;
    const year = new Date().getFullYear();
    return `RMA-${year}-${numero.toString().padStart(5, '0')}`;
  }

  private async obtenerConfig(tenantId: string): Promise<ConfigRma & { habilitar_rma_requiere_almacen: boolean }> {
    const { data, error } = await this.supabase
      .getClient()
      .from('empresa_config')
      .select('habilitar_rma, dias_maximos_rma, rma_requiere_control_calidad, habilitar_multialmacen')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data) {
      throw new BadRequestException('No se pudo obtener la configuración de RMA');
    }

    return {
      habilitar_rma: Boolean(data.habilitar_rma),
      dias_maximos_rma: Number(data.dias_maximos_rma ?? 0),
      rma_requiere_control_calidad: Boolean(data.rma_requiere_control_calidad),
      habilitar_rma_requiere_almacen: Boolean(data.habilitar_multialmacen),
    };
  }

  private async obtenerPedidoConDetalle(tenantId: string, pedidoId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('pedidos_venta')
      .select(
        `
        id,
        numero,
        estado,
        cliente_id,
        detalle:pedidos_venta_detalle(id, producto_id, descripcion, cantidad, cantidad_despachada, precio_unitario)
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('id', pedidoId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundException('Pedido no encontrado para RMA');
    }

    return data;
  }

  private async validarUbicacion(tenantId: string, ubicacionId: string | null, cache: Set<string>) {
    if (!ubicacionId || cache.has(ubicacionId)) {
      return;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('almacen_ubicaciones')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', ubicacionId)
      .maybeSingle();

    if (error || !data) {
      throw new BadRequestException('La ubicación indicada no existe o no pertenece al tenant');
    }

    cache.add(ubicacionId);
  }
}
