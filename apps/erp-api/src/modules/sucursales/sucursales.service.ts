import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AsignarSucursalesDto, CreateSucursalDto, UpdateSucursalDto } from './dto/sucursales.dto';

export interface Sucursal {
  id: string;
  tenant_id: string;
  nombre: string;
  codigo: string;
  codigo_establecimiento: string;
  es_principal: boolean;
  activo: boolean;
  estado: string;
  direccion?: string | null;
  ubigeo?: string | null;
  telefono?: string | null;
  centro_costo_id?: string | null;
}

@Injectable()
export class SucursalesService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Las sucursales que el usuario alcanza. Sin asignaciones las alcanza todas:
   * la regla vive en `public.sucursales_visibles` y no se reimplementa aqui para
   * que no puedan divergir.
   */
  async idsVisibles(tenantId: string, usuarioSistemaId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .getClient()
      .rpc('sucursales_visibles', {
        p_tenant_id: tenantId,
        p_usuario_sistema_id: usuarioSistemaId,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Error al resolver las sucursales visibles: ${error.message}`,
      );
    }

    return ((data as Array<{ sucursal_id: string }> | null) ?? []).map((row) => row.sucursal_id);
  }

  async listar(
    tenantId: string,
    usuarioSistemaId: string,
    includeInactive = false,
  ): Promise<Sucursal[]> {
    const visibles = await this.idsVisibles(tenantId, usuarioSistemaId);

    let query = this.supabase
      .getClient()
      .from('sucursales')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', visibles)
      .order('es_principal', { ascending: false })
      .order('codigo_establecimiento', { ascending: true });

    if (!includeInactive) query = query.eq('activo', true);

    const { data, error } = await query;
    if (error) {
      throw new InternalServerErrorException(`Error al listar sucursales: ${error.message}`);
    }
    return (data as Sucursal[] | null) ?? [];
  }

  async obtenerPorId(tenantId: string, sucursalId: string): Promise<Sucursal> {
    const { data, error } = await this.supabase
      .getClient()
      .from('sucursales')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', sucursalId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Error al obtener la sucursal: ${error.message}`);
    }
    if (!data) {
      throw new NotFoundException('Sucursal no encontrada');
    }
    return data as Sucursal;
  }

  async crear(tenantId: string, dto: CreateSucursalDto): Promise<Sucursal> {
    const { data, error } = await this.supabase
      .getClient()
      .from('sucursales')
      .insert({
        tenant_id: tenantId,
        nombre: dto.nombre,
        codigo: dto.codigo ?? null,
        codigo_establecimiento: dto.codigo_establecimiento
          ? dto.codigo_establecimiento.padStart(4, '0')
          : null,
        direccion: dto.direccion ?? null,
        ubigeo: dto.ubigeo ?? null,
        telefono: dto.telefono ?? null,
        centro_costo_id: dto.centro_costo_id ?? null,
      })
      .select('*')
      .single();

    if (error) {
      // 23505 es el indice unico por (tenant_id, codigo_establecimiento).
      if (error.code === '23505') {
        throw new ConflictException(
          `Ya existe un establecimiento con el codigo ${dto.codigo_establecimiento}`,
        );
      }
      throw new BadRequestException(`Error al crear la sucursal: ${error.message}`);
    }

    return data as Sucursal;
  }

  async actualizar(
    tenantId: string,
    sucursalId: string,
    dto: UpdateSucursalDto,
  ): Promise<Sucursal> {
    const actual = await this.obtenerPorId(tenantId, sucursalId);

    // El codigo de establecimiento no se cambia: es el que SUNAT tiene en la
    // ficha RUC y ya viaja dentro de comprobantes emitidos. Un anexo que cambia
    // de codigo es un anexo distinto.
    const cambios: Record<string, unknown> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre;
    if (dto.codigo !== undefined) cambios.codigo = dto.codigo;
    if (dto.direccion !== undefined) cambios.direccion = dto.direccion;
    if (dto.ubigeo !== undefined) cambios.ubigeo = dto.ubigeo;
    if (dto.telefono !== undefined) cambios.telefono = dto.telefono;
    if (dto.centro_costo_id !== undefined) cambios.centro_costo_id = dto.centro_costo_id;
    if (dto.activo !== undefined) {
      if (actual.es_principal && dto.activo === false) {
        throw new BadRequestException('La casa matriz (0000) no se puede desactivar');
      }
      cambios.activo = dto.activo;
    }

    if (Object.keys(cambios).length === 0) {
      return actual;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('sucursales')
      .update(cambios)
      .eq('tenant_id', tenantId)
      .eq('id', sucursalId)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(`Error al actualizar la sucursal: ${error.message}`);
    }
    return data as Sucursal;
  }

  /**
   * No hay borrado. Una sucursal con comprobantes emitidos no puede desaparecer
   * --las claves foraneas son RESTRICT-- y una sin ellos tampoco deberia, porque
   * su codigo de establecimiento sigue existiendo en la ficha RUC.
   */
  async desactivar(tenantId: string, sucursalId: string): Promise<Sucursal> {
    return this.actualizar(tenantId, sucursalId, { activo: false });
  }

  async sucursalesDeUsuario(tenantId: string, usuarioSistemaId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('usuario_sucursales')
      .select('sucursal_id')
      .eq('tenant_id', tenantId)
      .eq('usuario_sistema_id', usuarioSistemaId);

    if (error) {
      throw new InternalServerErrorException(
        `Error al leer las sucursales del usuario: ${error.message}`,
      );
    }
    return ((data as Array<{ sucursal_id: string }> | null) ?? []).map((row) => row.sucursal_id);
  }

  /**
   * Reemplaza la asignacion completa. Lista vacia = alcance total, que es el
   * estado por defecto de todo el mundo y la forma de devolver a alguien a la
   * oficina central.
   */
  async asignarUsuario(
    tenantId: string,
    usuarioSistemaId: string,
    dto: AsignarSucursalesDto,
  ): Promise<string[]> {
    const client = this.supabase.getClient();

    if (dto.sucursal_ids.length > 0) {
      // Comprobado contra la tabla y no delegado a la clave foranea: el mensaje
      // de un 23503 no dice cual de los identificadores estaba mal.
      const { data, error } = await client
        .from('sucursales')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', dto.sucursal_ids);

      if (error) {
        throw new InternalServerErrorException(`Error al validar las sucursales: ${error.message}`);
      }

      const encontradas = new Set(((data as Array<{ id: string }> | null) ?? []).map((r) => r.id));
      const ajenas = dto.sucursal_ids.filter((id) => !encontradas.has(id));
      if (ajenas.length > 0) {
        throw new BadRequestException(
          `Estas sucursales no pertenecen al contribuyente: ${ajenas.join(', ')}`,
        );
      }
    }

    const { error: deleteError } = await client
      .from('usuario_sucursales')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('usuario_sistema_id', usuarioSistemaId);

    if (deleteError) {
      throw new InternalServerErrorException(
        `Error al limpiar la asignacion previa: ${deleteError.message}`,
      );
    }

    if (dto.sucursal_ids.length === 0) {
      return [];
    }

    const { error: insertError } = await client.from('usuario_sucursales').insert(
      dto.sucursal_ids.map((sucursalId) => ({
        tenant_id: tenantId,
        usuario_sistema_id: usuarioSistemaId,
        sucursal_id: sucursalId,
      })),
    );

    if (insertError) {
      throw new BadRequestException(`Error al asignar sucursales: ${insertError.message}`);
    }

    return dto.sucursal_ids;
  }

  /**
   * El establecimiento que le corresponde a un comprobante. Lo decide la serie,
   * que es como lo decide SUNAT. Sin serie o sin sucursal enganchada devuelve la
   * casa matriz, que es lo que el XML venia emitiendo fijo.
   */
  async codigoEstablecimientoDeSerie(
    tenantId: string,
    serie: string | null | undefined,
  ): Promise<string> {
    const client = this.supabase.getClient();
    const serieNormalizada = String(serie ?? '').trim().toUpperCase();

    if (serieNormalizada) {
      const { data } = await client
        .from('documento_series')
        .select('sucursal_id, sucursales!inner(codigo_establecimiento)')
        .eq('tenant_id', tenantId)
        .eq('serie', serieNormalizada)
        .limit(1)
        .maybeSingle();

      const codigo = (data as any)?.sucursales?.codigo_establecimiento;
      if (codigo) return String(codigo);
    }

    const { data: matriz } = await client
      .from('sucursales')
      .select('codigo_establecimiento')
      .eq('tenant_id', tenantId)
      .eq('es_principal', true)
      .maybeSingle();

    return String((matriz as any)?.codigo_establecimiento ?? '0000');
  }
}
