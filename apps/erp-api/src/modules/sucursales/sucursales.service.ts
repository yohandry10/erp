import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../shared/supabase/supabase.service";
import {
  AsignarSucursalesDto,
  CreateSucursalDto,
  UpdateSucursalDto,
} from "./dto/sucursales.dto";

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
  async idsVisibles(
    tenantId: string,
    usuarioSistemaId: string,
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .getClient()
      .rpc("sucursales_visibles", {
        p_tenant_id: tenantId,
        p_usuario_sistema_id: usuarioSistemaId,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Error al resolver las sucursales visibles: ${error.message}`,
      );
    }

    return ((data as Array<{ sucursal_id: string }> | null) ?? []).map(
      (row) => row.sucursal_id,
    );
  }

  private async idsAdministrables(
    tenantId: string,
    usuarioSistemaId: string,
  ): Promise<string[] | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("usuario_sucursales")
      .select("sucursal_id")
      .eq("tenant_id", tenantId)
      .eq("usuario_sistema_id", usuarioSistemaId);
    if (error)
      throw new InternalServerErrorException(
        "Error al resolver el alcance de establecimientos",
      );
    const ids = ((data as Array<{ sucursal_id: string }> | null) ?? []).map(
      (row) => row.sucursal_id,
    );
    return ids.length ? ids : null;
  }

  async listar(
    tenantId: string,
    usuarioSistemaId: string,
    includeInactive = false,
  ): Promise<Sucursal[]> {
    const visibles = includeInactive
      ? await this.idsAdministrables(tenantId, usuarioSistemaId)
      : await this.idsVisibles(tenantId, usuarioSistemaId);

    let query = this.supabase
      .getClient()
      .from("sucursales")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("es_principal", { ascending: false })
      .order("codigo_establecimiento", { ascending: true });

    if (visibles) query = query.in("id", visibles);
    if (!includeInactive) query = query.eq("activo", true);

    const { data, error } = await query;
    if (error) {
      throw new InternalServerErrorException(
        `Error al listar sucursales: ${error.message}`,
      );
    }
    return (data as Sucursal[] | null) ?? [];
  }

  async obtenerPorId(
    tenantId: string,
    sucursalId: string,
    usuarioSistemaId?: string,
  ): Promise<Sucursal> {
    if (usuarioSistemaId) {
      const visibles = await this.idsAdministrables(tenantId, usuarioSistemaId);
      if (visibles && !visibles.includes(sucursalId))
        throw new NotFoundException("Sucursal no encontrada");
    }
    const { data, error } = await this.supabase
      .getClient()
      .from("sucursales")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", sucursalId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Error al obtener la sucursal: ${error.message}`,
      );
    }
    if (!data) {
      throw new NotFoundException("Sucursal no encontrada");
    }
    return data as Sucursal;
  }

  private async mutar(
    tenantId: string,
    actorId: string,
    key: string,
    operation: string,
    recordId: string | null,
    payload: Record<string, unknown>,
  ): Promise<any> {
    const { data, error } = await this.supabase
      .getClient()
      .rpc("mutar_sucursal_tx", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_idempotency_key: key,
        p_operation: operation,
        p_record_id: recordId,
        p_payload: payload,
      });
    if (error) {
      if (error.code === "23505")
        throw new ConflictException(
          "La intención ya existe con otros datos o el código está ocupado",
        );
      if (error.code === "42501")
        throw new ForbiddenException(
          "No autorizado para cambiar establecimientos",
        );
      if (error.code === "P0002")
        throw new NotFoundException("Sucursal o usuario no encontrado");
      throw new BadRequestException(
        "No se pudo guardar el establecimiento o su asignación",
      );
    }
    return data;
  }

  async crear(
    tenantId: string,
    dto: CreateSucursalDto,
    actorId: string,
    key: string,
  ): Promise<Sucursal> {
    return (
      await this.mutar(tenantId, actorId, key, "CREATE", null, { ...dto })
    ).sucursal;
  }

  async actualizar(
    tenantId: string,
    sucursalId: string,
    dto: UpdateSucursalDto,
    actorId: string,
    key: string,
  ): Promise<Sucursal> {
    return (
      await this.mutar(tenantId, actorId, key, "UPDATE", sucursalId, { ...dto })
    ).sucursal;
  }

  async desactivar(
    tenantId: string,
    sucursalId: string,
    actorId: string,
    key: string,
  ): Promise<Sucursal> {
    return (
      await this.mutar(tenantId, actorId, key, "DEACTIVATE", sucursalId, {})
    ).sucursal;
  }

  async sucursalesDeUsuario(
    tenantId: string,
    usuarioSistemaId: string,
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from("usuario_sucursales")
      .select("sucursal_id")
      .eq("tenant_id", tenantId)
      .eq("usuario_sistema_id", usuarioSistemaId);

    if (error) {
      throw new InternalServerErrorException(
        `Error al leer las sucursales del usuario: ${error.message}`,
      );
    }
    return ((data as Array<{ sucursal_id: string }> | null) ?? []).map(
      (row) => row.sucursal_id,
    );
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
    actorId: string,
    key: string,
  ): Promise<string[]> {
    return (
      await this.mutar(tenantId, actorId, key, "ASSIGN", usuarioSistemaId, {
        sucursal_ids: [...dto.sucursal_ids].sort(),
      })
    ).sucursal_ids;
  }

  /**
   * Informe por establecimiento: qué vendió y qué tiene cada local.
   *
   * Se apoya en que la operación ya sabe dónde ocurrió (migración 504), así que
   * no hay que cruzar cajas con almacenes ni adivinar nada: se agrupa por
   * `sucursal_id`. Lo que el usuario alcanza ya viene filtrado por el cliente,
   * de modo que un jefe de local ve su fila y no las de los demás.
   */
  async resumen(
    tenantId: string,
    usuarioSistemaId: string,
    desde?: string,
    hasta?: string,
  ): Promise<
    Array<{
      sucursal_id: string;
      nombre: string;
      codigo_establecimiento: string;
      es_principal: boolean;
      ventas_pos_total: number;
      ventas_pos_cantidad: number;
      comprobantes_cantidad: number;
      cajas_abiertas: number;
    }>
  > {
    const client = this.supabase.getClient();
    const sucursales = await this.listar(tenantId, usuarioSistemaId);
    if (sucursales.length === 0) return [];

    const ids = sucursales.map((sucursal) => sucursal.id);

    let ventasQuery = client
      .from("ventas_pos")
      .select("sucursal_id, total, fecha")
      .eq("tenant_id", tenantId)
      .in("sucursal_id", ids);
    if (desde) ventasQuery = ventasQuery.gte("fecha", desde);
    if (hasta) ventasQuery = ventasQuery.lte("fecha", hasta);

    let documentosQuery = client
      .from("documentos")
      .select("sucursal_id, fecha_emision")
      .eq("tenant_id", tenantId)
      .in("sucursal_id", ids);
    if (desde) documentosQuery = documentosQuery.gte("fecha_emision", desde);
    if (hasta) documentosQuery = documentosQuery.lte("fecha_emision", hasta);

    const [ventas, documentos, sesiones] = await Promise.all([
      ventasQuery,
      documentosQuery,
      client
        .from("sesiones_caja")
        .select("sucursal_id, estado")
        .eq("tenant_id", tenantId)
        .in("sucursal_id", ids),
    ]);

    const acumular = <T extends { sucursal_id?: string | null }>(
      filas: T[] | null,
      predicado: (fila: T) => boolean,
      valor: (fila: T) => number,
    ) => {
      const mapa = new Map<string, number>();
      for (const fila of filas ?? []) {
        if (!fila.sucursal_id || !predicado(fila)) continue;
        mapa.set(
          fila.sucursal_id,
          (mapa.get(fila.sucursal_id) ?? 0) + valor(fila),
        );
      }
      return mapa;
    };

    const totalVentas = acumular(
      ventas.data as Array<{ sucursal_id: string; total: number }> | null,
      () => true,
      (fila) => Number(fila.total ?? 0),
    );
    const cantidadVentas = acumular(
      ventas.data as Array<{ sucursal_id: string }> | null,
      () => true,
      () => 1,
    );
    const cantidadDocumentos = acumular(
      documentos.data as Array<{ sucursal_id: string }> | null,
      () => true,
      () => 1,
    );
    const cajasAbiertas = acumular(
      sesiones.data as Array<{ sucursal_id: string; estado: string }> | null,
      (fila) => String(fila.estado ?? "").toUpperCase() === "ABIERTA",
      () => 1,
    );

    return sucursales.map((sucursal) => ({
      sucursal_id: sucursal.id,
      nombre: sucursal.nombre,
      codigo_establecimiento: sucursal.codigo_establecimiento,
      es_principal: sucursal.es_principal,
      ventas_pos_total: Number((totalVentas.get(sucursal.id) ?? 0).toFixed(2)),
      ventas_pos_cantidad: cantidadVentas.get(sucursal.id) ?? 0,
      comprobantes_cantidad: cantidadDocumentos.get(sucursal.id) ?? 0,
      cajas_abiertas: cajasAbiertas.get(sucursal.id) ?? 0,
    }));
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
    const serieNormalizada = String(serie ?? "")
      .trim()
      .toUpperCase();

    if (serieNormalizada) {
      const { data } = await client
        .from("documento_series")
        .select("sucursal_id, sucursales!inner(codigo_establecimiento)")
        .eq("tenant_id", tenantId)
        .eq("serie", serieNormalizada)
        .limit(1)
        .maybeSingle();

      const codigo = (data as any)?.sucursales?.codigo_establecimiento;
      if (codigo) return String(codigo);
    }

    const { data: matriz } = await client
      .from("sucursales")
      .select("codigo_establecimiento")
      .eq("tenant_id", tenantId)
      .eq("es_principal", true)
      .maybeSingle();

    return String((matriz as any)?.codigo_establecimiento ?? "0000");
  }
}
