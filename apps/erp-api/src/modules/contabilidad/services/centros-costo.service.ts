import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { createHash } from 'crypto';
import { fechaHoyDelTenant } from '../../../shared/utils/fecha-tenant.util';

export interface CentroCosto {
  id: string;
  tenant_id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CentrosCostoService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listarCentrosCosto(tenantId: string): Promise<CentroCosto[]> {
    try {
      console.log(`📊 [CentrosCosto] Listando centros de costo para tenant ${tenantId}`);

      const { data, error } = await this.supabaseService
        .getClient()
        .from('centros_costo')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('codigo', { ascending: true });

      if (error) {
        console.error('❌ [CentrosCosto] Error listando centros de costo:', error);
        throw new BadRequestException(`Error al listar centros de costo: ${error.message}`);
      }

      console.log(`✅ [CentrosCosto] ${data?.length || 0} centros de costo encontrados`);
      return data || [];
    } catch (error) {
      console.error('❌ [CentrosCosto] Error en listarCentrosCosto:', error);
      throw error;
    }
  }

  async obtenerCentroCosto(tenantId: string, id: string): Promise<CentroCosto> {
    try {
      console.log(`📊 [CentrosCosto] Obteniendo centro de costo ${id} para tenant ${tenantId}`);

      const { data, error } = await this.supabaseService
        .getClient()
        .from('centros_costo')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .single();

      if (error) {
        console.error('❌ [CentrosCosto] Error obteniendo centro de costo:', error);
        throw new NotFoundException(`Centro de costo no encontrado: ${error.message}`);
      }

      if (!data) {
        throw new NotFoundException(`Centro de costo con ID ${id} no encontrado`);
      }

      console.log(`✅ [CentrosCosto] Centro de costo encontrado: ${data.nombre}`);
      return data;
    } catch (error) {
      console.error('❌ [CentrosCosto] Error en obtenerCentroCosto:', error);
      throw error;
    }
  }

  async crearCentroCosto(
    tenantId: string,
    codigo: string,
    nombre: string,
    descripcion?: string,
    userId?:string,
    idempotencyKey?:string,
  ): Promise<CentroCosto> {
    if(!userId) throw new BadRequestException('Se requiere un usuario autenticado');
    const payload={codigo,nombre,descripcion}; const key=idempotencyKey?.trim()||`cost-center-create:${createHash('sha256').update(JSON.stringify({tenantId,userId,payload})).digest('hex')}`;
    const {data:rpcData,error:rpcError}=await this.supabaseService.getClient().rpc('gestionar_maestro_contable_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_entity:'COST_CENTER',p_action:'CREATE',p_record_id:null,p_payload:payload,p_idempotency_key:key,
    });
    if(rpcError) throw new BadRequestException(rpcError.message||'No se pudo crear el centro de costo');
    const result:any=Array.isArray(rpcData)?rpcData[0]:rpcData; return result.record as CentroCosto;

    /* istanbul ignore next -- writer legacy inalcanzable */
    try {
      console.log(`📊 [CentrosCosto] Creando centro de costo ${codigo} para tenant ${tenantId}`);

      // Verificar que el código no exista
      const { data: existente } = await this.supabaseService
        .getClient()
        .from('centros_costo')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('codigo', codigo)
        .single();

      if (existente) {
        throw new BadRequestException(`Ya existe un centro de costo con el código ${codigo}`);
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .from('centros_costo')
        .insert({
          tenant_id: tenantId,
          codigo,
          nombre,
          descripcion,
          activo: true
        })
        .select()
        .single();

      if (error) {
        console.error('❌ [CentrosCosto] Error creando centro de costo:', error);
        throw new BadRequestException(`Error al crear centro de costo: ${error.message}`);
      }

      console.log(`✅ [CentrosCosto] Centro de costo creado: ${data.nombre}`);
      return data;
    } catch (error) {
      console.error('❌ [CentrosCosto] Error en crearCentroCosto:', error);
      throw error;
    }
  }

  async actualizarCentroCosto(
    tenantId: string,
    id: string,
    updates: {
      codigo?: string;
      nombre?: string;
      descripcion?: string;
      activo?: boolean;
    },
    userId?:string,
    idempotencyKey?:string,
  ): Promise<CentroCosto> {
    if(!userId) throw new BadRequestException('Se requiere un usuario autenticado');
    const key=idempotencyKey?.trim()||`cost-center-update:${createHash('sha256').update(JSON.stringify({tenantId,id,userId,updates})).digest('hex')}`;
    const {data:rpcData,error:rpcError}=await this.supabaseService.getClient().rpc('gestionar_maestro_contable_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_entity:'COST_CENTER',p_action:'UPDATE',p_record_id:id,p_payload:updates,p_idempotency_key:key,
    });
    if(rpcError) throw new BadRequestException(rpcError.message||'No se pudo actualizar el centro de costo');
    const result:any=Array.isArray(rpcData)?rpcData[0]:rpcData; return result.record as CentroCosto;

    /* istanbul ignore next -- writer legacy inalcanzable */
    try {
      console.log(`📊 [CentrosCosto] Actualizando centro de costo ${id} para tenant ${tenantId}`);

      // Verificar que existe
      await this.obtenerCentroCosto(tenantId, id);

      // Si se actualiza el código, verificar que no exista otro con ese código
      if (updates.codigo) {
        const { data: existente } = await this.supabaseService
          .getClient()
          .from('centros_costo')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('codigo', updates.codigo)
          .neq('id', id)
          .single();

        if (existente) {
          throw new BadRequestException(`Ya existe otro centro de costo con el código ${updates.codigo}`);
        }
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .from('centros_costo')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('❌ [CentrosCosto] Error actualizando centro de costo:', error);
        throw new BadRequestException(`Error al actualizar centro de costo: ${error.message}`);
      }

      console.log(`✅ [CentrosCosto] Centro de costo actualizado: ${data.nombre}`);
      return data;
    } catch (error) {
      console.error('❌ [CentrosCosto] Error en actualizarCentroCosto:', error);
      throw error;
    }
  }

  async obtenerAsientosPorCentro(
    tenantId: string,
    centroCostoId: string,
    filters?: {
      fecha_desde?: string;
      fecha_hasta?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      console.log(`📊 [CentrosCosto] Obteniendo asientos para centro de costo ${centroCostoId}`);

      // Verificar que el centro de costo existe y pertenece al tenant
      const centroCosto = await this.obtenerCentroCosto(tenantId, centroCostoId);

      const page = filters?.page || 1;
      const limit = filters?.limit || 50;
      const offset = (page - 1) * limit;

      // Primero obtenemos los IDs de asientos que tienen detalles con este centro de costo
      let detalleQuery = this.supabaseService
        .getClient()
        .from('detalle_asientos')
        .select('asiento_id')
        .eq('centro_costo_id', centroCostoId);

      const { data: detalles, error: detallesError } = await detalleQuery;

      if (detallesError) {
        console.error('❌ [CentrosCosto] Error obteniendo detalles:', detallesError);
        throw new BadRequestException(`Error al obtener asientos: ${detallesError.message}`);
      }

      if (!detalles || detalles.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0
        };
      }

      // Obtener IDs únicos de asientos
      const asientoIds = [...new Set(detalles.map((d) => d.asiento_id))];

      // Construir query para asientos
      let query = this.supabaseService
        .getClient()
        .from('asientos_contables')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('id', asientoIds);

      // Aplicar filtros de fecha
      if (filters?.fecha_desde) {
        query = query.gte('fecha', filters.fecha_desde);
      }

      if (filters?.fecha_hasta) {
        query = query.lte('fecha', filters.fecha_hasta);
      }

      // Ordenar por fecha descendente
      query = query.order('fecha', { ascending: false });
      query = query.order('numero_asiento', { ascending: false });

      // Aplicar paginación
      query = query.range(offset, offset + limit - 1);

      const { data: asientos, error: asientosError, count } = await query;

      if (asientosError) {
        console.error('❌ [CentrosCosto] Error obteniendo asientos:', asientosError);
        throw new BadRequestException(`Error al obtener asientos: ${asientosError.message}`);
      }

      // Obtener detalles para cada asiento
      const asientosConDetalles = await Promise.all(
        (asientos || []).map(async (asiento) => {
          const { data: detallesAsiento } = await this.supabaseService
            .getClient()
            .from('detalle_asientos')
            .select(
              `
              id,
              cuenta_id,
              debe,
              haber,
              concepto,
              centro_costo_id,
              plan_cuentas!fk_detalle_asientos_cuenta_id (
                codigo,
                nombre
              )
            `
            )
            .eq('asiento_id', asiento.id);

          return {
            ...asiento,
            detalles: (detallesAsiento || []).map((detalle: any) => ({
              id: detalle.id,
              cuenta_id: detalle.cuenta_id,
              cuenta_codigo: detalle.plan_cuentas?.codigo || '',
              cuenta_nombre: detalle.plan_cuentas?.nombre || '',
              debe: detalle.debe,
              haber: detalle.haber,
              concepto: detalle.concepto,
              centro_costo_id: detalle.centro_costo_id,
              centro_costo_nombre: detalle.centro_costo_id === centroCostoId ? centroCosto.nombre : undefined
            }))
          };
        })
      );

      const totalPages = Math.ceil((count || 0) / limit);

      console.log(`✅ [CentrosCosto] ${count} asientos encontrados para centro de costo ${centroCostoId}`);

      return {
        data: asientosConDetalles,
        total: count || 0,
        page,
        limit,
        totalPages
      };
    } catch (error) {
      console.error('❌ [CentrosCosto] Error en obtenerAsientosPorCentro:', error);
      throw error;
    }
  }

  async obtenerReporteGastosPorCentro(
    tenantId: string,
    centroCostoId: string,
    filters?: {
      fecha_desde?: string;
      fecha_hasta?: string;
    }
  ): Promise<{
    centro_costo: CentroCosto;
    periodo: {
      fecha_desde: string;
      fecha_hasta: string;
    };
    gastos_por_cuenta: Array<{
      cuenta_id: string;
      cuenta_codigo: string;
      cuenta_nombre: string;
      total_debe: number;
      total_haber: number;
      saldo: number;
      cantidad_movimientos: number;
    }>;
    resumen: {
      total_gastos: number;
      total_movimientos: number;
      cuenta_mayor_gasto: {
        codigo: string;
        nombre: string;
        monto: number;
      } | null;
    };
  }> {
    try {
      console.log(`📊 [CentrosCosto] Generando reporte de gastos para centro de costo ${centroCostoId}`);

      // Verificar que el centro de costo existe y pertenece al tenant
      const centroCosto = await this.obtenerCentroCosto(tenantId, centroCostoId);

      // Establecer fechas por defecto si no se proporcionan
      const fechaDesde = filters?.fecha_desde || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      // «Hasta hoy» es el hoy del contribuyente: en UTC el reporte se extendía un
      // día de más y arrastraba movimientos que localmente son de mañana.
      const fechaHasta = filters?.fecha_hasta
        || await fechaHoyDelTenant(this.supabaseService.getClient(), tenantId);

      // Obtener todos los detalles de asientos para este centro de costo
      let detalleQuery = this.supabaseService
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          id,
          cuenta_id,
          debe,
          haber,
          asiento_id,
          plan_cuentas!fk_detalle_asientos_cuenta_id (
            codigo,
            nombre,
            tipo_cuenta
          )
        `
        )
        .eq('centro_costo_id', centroCostoId);

      const { data: detalles, error: detallesError } = await detalleQuery;

      if (detallesError) {
        console.error('❌ [CentrosCosto] Error obteniendo detalles:', detallesError);
        throw new BadRequestException(`Error al obtener detalles de asientos: ${detallesError.message}`);
      }

      if (!detalles || detalles.length === 0) {
        return {
          centro_costo: centroCosto,
          periodo: {
            fecha_desde: fechaDesde,
            fecha_hasta: fechaHasta
          },
          gastos_por_cuenta: [],
          resumen: {
            total_gastos: 0,
            total_movimientos: 0,
            cuenta_mayor_gasto: null
          }
        };
      }

      // Obtener los asientos para filtrar por fecha
      const asientoIds = [...new Set(detalles.map((d) => d.asiento_id))];

      let asientosQuery = this.supabaseService
        .getClient()
        .from('asientos_contables')
        .select('id, fecha')
        .eq('tenant_id', tenantId)
        .in('id', asientoIds)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta);

      const { data: asientos, error: asientosError } = await asientosQuery;

      if (asientosError) {
        console.error('❌ [CentrosCosto] Error obteniendo asientos:', asientosError);
        throw new BadRequestException(`Error al obtener asientos: ${asientosError.message}`);
      }

      // Filtrar detalles por asientos en el rango de fechas
      const asientosEnRango = new Set((asientos || []).map((a) => a.id));
      const detallesFiltrados = detalles.filter((d) => asientosEnRango.has(d.asiento_id));

      // Agrupar por cuenta y calcular totales
      const gastosPorCuenta = new Map<
        string,
        {
          cuenta_id: string;
          cuenta_codigo: string;
          cuenta_nombre: string;
          total_debe: number;
          total_haber: number;
          cantidad_movimientos: number;
        }
      >();

      for (const detalle of detallesFiltrados) {
        const cuentaId = detalle.cuenta_id;
        const cuentaCodigo = (detalle.plan_cuentas as any)?.codigo || '';
        const cuentaNombre = (detalle.plan_cuentas as any)?.nombre || '';

        if (!gastosPorCuenta.has(cuentaId)) {
          gastosPorCuenta.set(cuentaId, {
            cuenta_id: cuentaId,
            cuenta_codigo: cuentaCodigo,
            cuenta_nombre: cuentaNombre,
            total_debe: 0,
            total_haber: 0,
            cantidad_movimientos: 0
          });
        }

        const cuenta = gastosPorCuenta.get(cuentaId)!;
        cuenta.total_debe += detalle.debe || 0;
        cuenta.total_haber += detalle.haber || 0;
        cuenta.cantidad_movimientos += 1;
      }

      // Convertir a array y calcular saldos
      const gastosPorCuentaArray = Array.from(gastosPorCuenta.values()).map((cuenta) => ({
        cuenta_id: cuenta.cuenta_id,
        cuenta_codigo: cuenta.cuenta_codigo,
        cuenta_nombre: cuenta.cuenta_nombre,
        total_debe: cuenta.total_debe,
        total_haber: cuenta.total_haber,
        saldo: cuenta.total_debe - cuenta.total_haber,
        cantidad_movimientos: cuenta.cantidad_movimientos
      }));

      // Ordenar por saldo descendente (mayor gasto primero)
      gastosPorCuentaArray.sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));

      // Calcular resumen
      const totalGastos = gastosPorCuentaArray.reduce((sum, cuenta) => {
        // Solo sumar gastos (cuentas que empiezan con 6, 9, etc.)
        const esGasto = cuenta.cuenta_codigo.startsWith('6') || cuenta.cuenta_codigo.startsWith('9');
        return sum + (esGasto ? Math.abs(cuenta.saldo) : 0);
      }, 0);

      const totalMovimientos = detallesFiltrados.length;

      const cuentaMayorGasto =
        gastosPorCuentaArray.length > 0
          ? {
              codigo: gastosPorCuentaArray[0].cuenta_codigo,
              nombre: gastosPorCuentaArray[0].cuenta_nombre,
              monto: Math.abs(gastosPorCuentaArray[0].saldo)
            }
          : null;

      console.log(
        `✅ [CentrosCosto] Reporte generado: ${gastosPorCuentaArray.length} cuentas, ${totalMovimientos} movimientos, total gastos: ${totalGastos}`
      );

      return {
        centro_costo: centroCosto,
        periodo: {
          fecha_desde: fechaDesde,
          fecha_hasta: fechaHasta
        },
        gastos_por_cuenta: gastosPorCuentaArray,
        resumen: {
          total_gastos: totalGastos,
          total_movimientos: totalMovimientos,
          cuenta_mayor_gasto: cuentaMayorGasto
        }
      };
    } catch (error) {
      console.error('❌ [CentrosCosto] Error en obtenerReporteGastosPorCentro:', error);
      throw error;
    }
  }
}
