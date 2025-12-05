import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

export interface PlanCuenta {
  id: string;
  tenant_id: string;
  codigo: string;
  nombre: string;
  tipo: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO';
  nivel: number;
  cuenta_padre_id?: string;
  acepta_movimiento: boolean;
  estado?: 'ACTIVO' | 'INACTIVO';
  created_at?: string;
  updated_at?: string;
}

@Injectable()
export class PlanCuentasService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Obtiene una cuenta del plan de cuentas por su código
   * @param tenantId - ID del tenant
   * @param codigo - Código de la cuenta (ej: '10', '12', '70')
   * @returns Cuenta del plan de cuentas
   */
  async obtenerCuentaPorCodigo(
    tenantId: string,
    codigo: string
  ): Promise<PlanCuenta> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('codigo', codigo)
      .single();

    if (error) {
      console.error(
        `❌ [PlanCuentas] Error obteniendo cuenta ${codigo}:`,
        error
      );
      throw new Error(
        `No se encontró la cuenta ${codigo} en el plan de cuentas`
      );
    }

    if (!data.acepta_movimiento) {
      throw new Error(
        `La cuenta ${codigo} - ${data.nombre} no acepta movimientos`
      );
    }

    return data as PlanCuenta;
  }

  /**
   * Obtiene múltiples cuentas del plan de cuentas por sus códigos
   * @param tenantId - ID del tenant
   * @param codigos - Array de códigos de cuentas
   * @returns Map de código -> cuenta
   */
  async obtenerCuentasPorCodigos(
    tenantId: string,
    codigos: string[]
  ): Promise<Map<string, PlanCuenta>> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('codigo', codigos);

    if (error) {
      console.error(
        `❌ [PlanCuentas] Error obteniendo cuentas:`,
        error
      );
      throw new Error('Error obteniendo cuentas del plan de cuentas');
    }

    if (!data || data.length === 0) {
      throw new Error('No se encontraron cuentas en el plan de cuentas');
    }

    // Validar que todas las cuentas solicitadas existan
    const cuentasEncontradas = data.map((c) => c.codigo);
    const cuentasFaltantes = codigos.filter(
      (codigo) => !cuentasEncontradas.includes(codigo)
    );

    if (cuentasFaltantes.length > 0) {
      throw new Error(
        `No se encontraron las siguientes cuentas: ${cuentasFaltantes.join(', ')}`
      );
    }

    // Validar que todas acepten movimientos
    const cuentasNoMovimiento = data.filter((c) => !c.acepta_movimiento);
    if (cuentasNoMovimiento.length > 0) {
      const nombres = cuentasNoMovimiento
        .map((c) => `${c.codigo} - ${c.nombre}`)
        .join(', ');
      throw new Error(
        `Las siguientes cuentas no aceptan movimientos: ${nombres}`
      );
    }

    // Crear map de código -> cuenta
    const cuentasMap = new Map<string, PlanCuenta>();
    data.forEach((cuenta) => {
      cuentasMap.set(cuenta.codigo, cuenta as PlanCuenta);
    });

    return cuentasMap;
  }

  async buscarCuentaPorCodigoONombre(
    tenantId: string,
    opciones: {
      codigos?: string[];
      keywords?: string[];
    }
  ): Promise<PlanCuenta | null> {
    if (opciones.codigos && opciones.codigos.length > 0) {
      const codigosNormalizados = opciones.codigos.map((c) => c.trim()).filter(Boolean);
      if (codigosNormalizados.length > 0) {
        const { data, error } = await this.supabaseService
          .getClient()
          .from('plan_cuentas')
          .select('*')
          .eq('tenant_id', tenantId)
          .in('codigo', codigosNormalizados)
          .order('nivel', { ascending: true })
          .limit(1);

        if (error) {
          console.error('❌ [PlanCuentas] Error buscando por códigos:', error);
        } else if (data && data.length > 0) {
          return data[0] as PlanCuenta;
        }
      }
    }

    if (opciones.keywords && opciones.keywords.length > 0) {
      for (const keyword of opciones.keywords) {
        const termino = keyword.trim();
        if (!termino) {
          continue;
        }

        const { data, error } = await this.supabaseService
          .getClient()
          .from('plan_cuentas')
          .select('*')
          .eq('tenant_id', tenantId)
          .ilike('nombre', `%${termino}%`)
          .order('nivel', { ascending: true })
          .limit(1);

        if (error) {
          console.error('❌ [PlanCuentas] Error buscando por keyword:', termino, error);
        } else if (data && data.length > 0) {
          return data[0] as PlanCuenta;
        }
      }
    }

    return null;
  }

  /**
   * Obtiene todas las cuentas del plan de cuentas de un tenant
   * @param tenantId - ID del tenant
   * @param filtros - Filtros opcionales
   * @returns Lista de cuentas
   */
  async obtenerCuentas(
    tenantId: string,
    filtros?: {
      tipo?: string;
      nivel?: number;
      acepta_movimiento?: boolean;
      estado?: string;
    }
  ): Promise<PlanCuenta[]> {
    let query = this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('codigo', { ascending: true });

    if (filtros?.tipo) {
      query = query.eq('tipo', filtros.tipo);
    }

    if (filtros?.nivel !== undefined) {
      query = query.eq('nivel', filtros.nivel);
    }

    if (filtros?.acepta_movimiento !== undefined) {
      query = query.eq('acepta_movimiento', filtros.acepta_movimiento);
    }

    if (filtros?.estado) {
      query = query.eq('estado', filtros.estado);
    } else {
      query = query.eq('estado', 'ACTIVO');
    }

    const { data, error } = await query;

    if (error) {
      console.error(`❌ [PlanCuentas] Error obteniendo cuentas:`, error);
      throw new Error('Error obteniendo cuentas del plan de cuentas');
    }

    return (data || []) as PlanCuenta[];
  }

  /**
   * Obtiene una cuenta por su ID
   * @param tenantId - ID del tenant
   * @param cuentaId - ID de la cuenta
   * @returns Cuenta del plan de cuentas
   */
  async obtenerCuentaPorId(
    tenantId: string,
    cuentaId: string
  ): Promise<PlanCuenta> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', cuentaId)
      .single();

    if (error) {
      console.error(
        `❌ [PlanCuentas] Error obteniendo cuenta por ID:`,
        error
      );
      throw new Error('No se encontró la cuenta en el plan de cuentas');
    }

    return data as PlanCuenta;
  }

  /**
   * Busca cuentas por nombre o código
   * @param tenantId - ID del tenant
   * @param termino - Término de búsqueda
   * @returns Lista de cuentas que coinciden
   */
  async buscarCuentas(
    tenantId: string,
    termino: string
  ): Promise<PlanCuenta[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('estado', 'ACTIVO')
      .or(`codigo.ilike.%${termino}%,nombre.ilike.%${termino}%`)
      .order('codigo', { ascending: true })
      .limit(20);

    if (error) {
      console.error(`❌ [PlanCuentas] Error buscando cuentas:`, error);
      throw new Error('Error buscando cuentas');
    }

    return (data || []) as PlanCuenta[];
  }
}
