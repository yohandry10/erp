import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import {
  CambiarEstadoReglaDto,
  CrearConsolidadoVentasDto,
  CrearListaPreciosDto,
  CrearReglaComisionDto,
  ResolverPreciosDto,
} from './dto';

@Injectable()
export class ComercialVentasService {
  constructor(private readonly supabase: SupabaseService) {}

  async catalogos(tenantId: string) {
    const client = this.supabase.getClient();
    const [productos, clientes, vendedoresCanonicos, vendedoresLegacy] = await Promise.all([
      client
        .from('productos')
        .select('id,codigo,nombre,marca,precio_venta,precio_mayorista,precio_especial,activo')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('nombre'),
      client
        .from('clientes')
        .select('id,codigo,razon_social,nombre,activo')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('razon_social'),
      client
        .from('usuarios_sistema')
        .select('id,nombre,apellido,email,activo')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('nombre'),
      client
        .from('usuarios')
        .select('id,nombre,apellido,email,activo')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('nombre'),
    ]);
    if (productos.error) this.throwRead(productos.error, 'listar productos comerciales');
    if (clientes.error) this.throwRead(clientes.error, 'listar clientes comerciales');
    if (vendedoresCanonicos.error) {
      this.throwRead(vendedoresCanonicos.error, 'listar vendedores canónicos');
    }
    if (vendedoresLegacy.error) this.throwRead(vendedoresLegacy.error, 'listar vendedores legacy');
    // POS/autenticación usan usuarios_sistema; cotizaciones históricas aún
    // pueden referenciar usuarios. La unión evita dejar cualquiera de los dos
    // writers sin un vendedor seleccionable y prioriza la identidad canónica.
    const vendedoresPorId = new Map<string, any>();
    for (const vendedor of vendedoresLegacy.data ?? []) vendedoresPorId.set(vendedor.id, vendedor);
    for (const vendedor of vendedoresCanonicos.data ?? []) vendedoresPorId.set(vendedor.id, vendedor);
    return {
      productos: productos.data ?? [],
      clientes: clientes.data ?? [],
      vendedores: [...vendedoresPorId.values()].sort((a, b) =>
        String(a.nombre || a.email || '').localeCompare(String(b.nombre || b.email || ''), 'es'),
      ),
    };
  }

  async listarListasPrecios(tenantId: string, incluirInactivas = true) {
    let query = this.supabase
      .getClient()
      .from('listas_precios_venta')
      .select('*,detalles:lista_precios_venta_detalles(*)')
      .eq('tenant_id', tenantId)
      .order('activo', { ascending: false })
      .order('prioridad', { ascending: false })
      .order('created_at', { ascending: false });
    if (!incluirInactivas) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) this.throwRead(error, 'listar listas de precios');
    return data ?? [];
  }

  async crearListaPrecios(
    tenantId: string,
    actorId: string,
    dto: CrearListaPreciosDto,
    idempotencyKey?: string,
  ) {
    this.validarAlcancesPrecio(dto);
    const detalles = dto.detalles;
    const lista = { ...dto, detalles: undefined };
    const { data, error } = await this.supabase.getClient().rpc('registrar_lista_precios_venta_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: this.requireKey(idempotencyKey),
      p_lista: lista,
      p_detalles: detalles,
    });
    if (error) this.throwRpc(error, 'registrar la lista de precios');
    return data;
  }

  async resolverPrecios(tenantId: string, actorId: string, dto: ResolverPreciosDto) {
    const { data, error } = await this.supabase.getClient().rpc('resolver_precios_venta_tx', {
      p_tenant_id: tenantId,
      p_vendedor_id: dto.vendedor_id ?? actorId,
      p_cliente_id: dto.cliente_id ?? null,
      p_detalle: dto.detalle,
      p_fecha: dto.fecha ?? null,
      p_moneda: dto.moneda.toUpperCase(),
    });
    if (error) this.throwRpc(error, 'resolver los precios vigentes');
    return data ?? [];
  }

  async listarReglasComision(tenantId: string, incluirInactivas = true) {
    let query = this.supabase
      .getClient()
      .from('reglas_comisiones_venta')
      .select('*,producto:productos(id,codigo,nombre,marca)')
      .eq('tenant_id', tenantId)
      .order('activo', { ascending: false })
      .order('prioridad', { ascending: false })
      .order('created_at', { ascending: false });
    if (!incluirInactivas) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) this.throwRead(error, 'listar reglas de comisión');
    return data ?? [];
  }

  async crearReglaComision(
    tenantId: string,
    actorId: string,
    dto: CrearReglaComisionDto,
    idempotencyKey?: string,
  ) {
    const { data, error } = await this.supabase.getClient().rpc('registrar_regla_comision_venta_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: this.requireKey(idempotencyKey),
      p_regla: dto,
    });
    if (error) this.throwRpc(error, 'registrar la regla de comisión');
    return data;
  }

  async cambiarEstado(
    tenantId: string,
    actorId: string,
    tipo: 'LISTA_PRECIOS' | 'REGLA_COMISION',
    id: string,
    dto: CambiarEstadoReglaDto,
    idempotencyKey?: string,
  ) {
    const { data, error } = await this.supabase.getClient().rpc('cambiar_estado_regla_comercial_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_tipo: tipo,
      p_id: id,
      p_activo: dto.activo,
      p_idempotency_key: this.requireKey(idempotencyKey),
    });
    if (error) this.throwRpc(error, 'cambiar el estado de la regla comercial');
    return data;
  }

  async listarMovimientosComision(
    tenantId: string,
    vendedorId?: string,
    desde?: string,
    hasta?: string,
  ) {
    let query = this.supabase
      .getClient()
      .from('comisiones_venta_movimientos')
      .select('*,producto:productos(id,codigo,nombre,marca),regla:reglas_comisiones_venta(id,codigo,nombre)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (vendedorId) query = query.eq('vendedor_id', vendedorId);
    if (desde) query = query.gte('created_at', desde);
    if (hasta) query = query.lte('created_at', hasta);
    const { data, error } = await query;
    if (error) this.throwRead(error, 'listar movimientos de comisión');
    return data ?? [];
  }

  async listarCandidatosConsolidado(tenantId: string, limit = 100) {
    const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? Math.trunc(limit) : 100, 500));
    const { data, error } = await this.supabase.getClient().rpc('listar_ventas_consolidables_469', {
      p_tenant_id: tenantId,
      p_limit: safeLimit,
    });
    if (error) this.throwRpc(error, 'listar ventas consolidables');
    return data ?? [];
  }

  async listarConsolidados(tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ventas_consolidados')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('fecha', { ascending: false })
      .order('numero', { ascending: false })
      .limit(200);
    if (error) this.throwRead(error, 'listar consolidados de ventas');
    return data ?? [];
  }

  async obtenerConsolidado(tenantId: string, id: string) {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('ventas_consolidados')
      .select('*,detalles:ventas_consolidado_detalles(*)')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) this.throwRead(error, 'obtener el consolidado');
    if (!data) throw new NotFoundException('Consolidado de ventas no encontrado');
    return data;
  }

  async crearConsolidado(
    tenantId: string,
    actorId: string,
    dto: CrearConsolidadoVentasDto,
    idempotencyKey?: string,
  ) {
    if (dto.fuentes.length < 1 || dto.fuentes.length > 10) {
      throw new BadRequestException('Un consolidado debe reunir entre 1 y 10 ventas');
    }
    const unique = new Set(dto.fuentes.map((fuente) => `${fuente.tipo}:${fuente.id}`));
    if (unique.size !== dto.fuentes.length) {
      throw new BadRequestException('Una venta no puede repetirse dentro del mismo bloque');
    }
    const { data, error } = await this.supabase.getClient().rpc('crear_consolidado_ventas_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: this.requireKey(idempotencyKey),
      p_fuentes: dto.fuentes,
      p_notas: dto.notas?.trim() || null,
    });
    if (error) this.throwRpc(error, 'crear el consolidado de ventas');
    return data;
  }

  private validarAlcancesPrecio(dto: CrearListaPreciosDto) {
    for (const [index, detalle] of dto.detalles.entries()) {
      if (Boolean(detalle.producto_id) === Boolean(detalle.marca?.trim())) {
        throw new BadRequestException(
          `El detalle ${index + 1} debe seleccionar producto o marca, pero no ambos`,
        );
      }
    }
    if (dto.vigencia_hasta && dto.vigencia_hasta < dto.vigencia_desde) {
      throw new BadRequestException('La vigencia final no puede ser anterior a la inicial');
    }
  }

  private requireKey(value?: string) {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 255) {
      throw new BadRequestException('Se requiere Idempotency-Key de 8 a 255 caracteres');
    }
    return key;
  }

  private throwRead(error: any, action: string): never {
    throw new BadRequestException(error?.message || `No se pudo ${action}`);
  }

  private throwRpc(error: any, action: string): never {
    const code = String(error?.code || '');
    const message = String(error?.message || `No se pudo ${action}`);
    if (code === '23505') throw new ConflictException(message);
    if (code === '42501') throw new ForbiddenException(message);
    if (code === 'P0002') throw new NotFoundException(message);
    throw new BadRequestException(message);
  }
}
