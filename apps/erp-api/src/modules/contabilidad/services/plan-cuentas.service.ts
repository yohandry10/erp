import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { sanitizePostgrestSearch } from '../../../common/util/postgrest.util';

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

const CUENTAS_OPERATIVAS_RUNTIME: Record<string, Omit<PlanCuenta, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>> = {
  '10': {
    codigo: '10',
    nombre: 'Efectivo y equivalentes de efectivo',
    tipo: 'ACTIVO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '12': {
    codigo: '12',
    nombre: 'Cuentas por cobrar comerciales',
    tipo: 'ACTIVO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '18': {
    codigo: '18',
    nombre: 'Servicios y otros contratados por anticipado',
    tipo: 'ACTIVO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '20': {
    codigo: '20',
    nombre: 'Mercaderias',
    tipo: 'ACTIVO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '33': {
    codigo: '33',
    nombre: 'Inmuebles, maquinaria y equipo',
    tipo: 'ACTIVO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '39': {
    codigo: '39',
    nombre: 'Depreciacion y amortizacion acumuladas',
    tipo: 'ACTIVO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '65': {
    codigo: '65',
    nombre: 'Otros gastos de gestion',
    tipo: 'GASTO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '75': {
    codigo: '75',
    nombre: 'Otros ingresos de gestion',
    tipo: 'INGRESO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '40': {
    codigo: '40',
    nombre: 'Tributos por pagar',
    tipo: 'PASIVO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '42': {
    codigo: '42',
    nombre: 'Cuentas por pagar comerciales',
    tipo: 'PASIVO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '49': {
    codigo: '49',
    nombre: 'Pasivo diferido',
    tipo: 'PASIVO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '68': {
    codigo: '68',
    nombre: 'Valuacion y deterioro de activos y provisiones',
    tipo: 'GASTO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '676': {
    codigo: '676',
    nombre: 'Diferencia de cambio',
    tipo: 'GASTO',
    nivel: 3,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '69': {
    codigo: '69',
    nombre: 'Costo de ventas',
    tipo: 'GASTO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '70': {
    codigo: '70',
    nombre: 'Ventas',
    tipo: 'INGRESO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '76': {
    codigo: '76',
    nombre: 'Ganancia por medicion de activos no financieros',
    tipo: 'INGRESO',
    nivel: 2,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '776': {
    codigo: '776',
    nombre: 'Diferencia de cambio',
    tipo: 'INGRESO',
    nivel: 3,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '403': {
    codigo: '403',
    nombre: 'Instituciones publicas',
    tipo: 'PASIVO',
    nivel: 3,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '407': {
    codigo: '407',
    nombre: 'Administradoras de fondos y aportes patronales por pagar',
    tipo: 'PASIVO',
    nivel: 3,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '411': {
    codigo: '411',
    nombre: 'Remuneraciones por pagar',
    tipo: 'PASIVO',
    nivel: 3,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '621': {
    codigo: '621',
    nombre: 'Remuneraciones',
    tipo: 'GASTO',
    nivel: 3,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
  '627': {
    codigo: '627',
    nombre: 'Seguridad y prevision social',
    tipo: 'GASTO',
    nivel: 3,
    acepta_movimiento: true,
    estado: 'ACTIVO',
  },
};

const NOMBRES_CUENTAS_ARGENTINA: Record<string, string> = {
  '10': 'Caja y bancos',
  '12': 'Créditos por ventas',
  '18': 'Gastos pagados por adelantado',
  '20': 'Bienes de cambio',
  '40': 'Deudas fiscales (IVA e Ingresos Brutos)',
  '42': 'Proveedores',
  '49': 'Ingresos diferidos',
  '403': 'Retenciones de seguridad social por pagar',
  '407': 'Contribuciones patronales y ART por pagar',
  '411': 'Sueldos por pagar',
  '621': 'Sueldos y jornales',
  '627': 'Cargas sociales, obra social y ART',
  '68': 'Depreciaciones y previsiones',
  '69': 'Costo de mercaderías vendidas',
  '70': 'Ventas',
  '676': 'Diferencia de cambio (pérdida)',
  '776': 'Diferencia de cambio (ganancia)',
  '33': 'Bienes de uso',
  '39': 'Amortizaciones acumuladas',
  '65': 'Otros egresos',
  '75': 'Otros ingresos',
};

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
    const codigosUnicos = [...new Set(codigos.map((codigo) => codigo.trim()).filter(Boolean))];
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('codigo', codigosUnicos);

    if (error) {
      console.error(
        `❌ [PlanCuentas] Error obteniendo cuentas:`,
        error
      );
      throw new Error('Error obteniendo cuentas del plan de cuentas');
    }

    const cuentas = [...(data || [])];
    const cuentasEncontradas = cuentas.map((c) => c.codigo);
    let cuentasFaltantes = codigosUnicos.filter(
      (codigo) => !cuentasEncontradas.includes(codigo)
    );

    for (const codigo of cuentasFaltantes) {
      const cuentaCreada = await this.crearCuentaOperativaSiEsEstandar(tenantId, codigo);
      if (cuentaCreada) {
        cuentas.push(cuentaCreada);
      }
    }

    const cuentasEncontradasFinal = cuentas.map((c) => c.codigo);
    cuentasFaltantes = codigosUnicos.filter(
      (codigo) => !cuentasEncontradasFinal.includes(codigo)
    );

    if (cuentasFaltantes.length > 0) {
      throw new Error(
        `No se encontraron las siguientes cuentas: ${cuentasFaltantes.join(', ')}`
      );
    }

    // Validar que todas acepten movimientos
    const cuentasNoMovimiento = cuentas.filter((c) => !c.acepta_movimiento);
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
    cuentas.forEach((cuenta) => {
      cuentasMap.set(cuenta.codigo, cuenta as PlanCuenta);
    });

    return cuentasMap;
  }

  private async crearCuentaOperativaSiEsEstandar(
    tenantId: string,
    codigo: string
  ): Promise<PlanCuenta | null> {
    const cuentaBase = CUENTAS_OPERATIVAS_RUNTIME[codigo];
    if (!cuentaBase) {
      return null;
    }

    const { data: empresa } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('pais')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const esArgentina = String(empresa?.pais || 'PE').toUpperCase() === 'AR';

    const payload = {
      tenant_id: tenantId,
      codigo: cuentaBase.codigo,
      nombre: esArgentina
        ? NOMBRES_CUENTAS_ARGENTINA[codigo] || cuentaBase.nombre
        : cuentaBase.nombre,
      tipo: cuentaBase.tipo,
      tipo_cuenta: cuentaBase.tipo,
      nivel: cuentaBase.nivel,
      acepta_movimiento: cuentaBase.acepta_movimiento,
      activo: true,
      estado: cuentaBase.estado,
      metadata: {
        source: 'runtime_accounting_standard_account',
        pais_codigo: esArgentina ? 'AR' : 'PE',
      },
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .insert(payload)
      .select('*')
      .single();

    if (!error && data) {
      return data as PlanCuenta;
    }

    if (error?.code === '23505') {
      const { data: existente, error: findError } = await this.supabaseService
        .getClient()
        .from('plan_cuentas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('codigo', codigo)
        .single();

      if (!findError && existente) {
        return existente as PlanCuenta;
      }
    }

    console.error(`❌ [PlanCuentas] Error creando cuenta estándar ${codigo}:`, error);
    return null;
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

    const unicas = new Map<string, PlanCuenta>();
    for (const cuenta of (data || []) as PlanCuenta[]) {
      const codigo = String(cuenta.codigo || '').trim().toUpperCase();
      if (!unicas.has(codigo)) unicas.set(codigo, cuenta);
    }
    return [...unicas.values()];
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
    // HARDENING: sanitizar termino para evitar PostgREST filter injection.
    const safe = sanitizePostgrestSearch(termino);
    if (safe.length === 0) {
      return [];
    }
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('estado', 'ACTIVO')
      .or(`codigo.ilike.%${safe}%,nombre.ilike.%${safe}%`)
      .order('codigo', { ascending: true })
      .limit(20);

    if (error) {
      console.error(`❌ [PlanCuentas] Error buscando cuentas:`, error);
      throw new Error('Error buscando cuentas');
    }

    const unicas = new Map<string, PlanCuenta>();
    for (const cuenta of (data || []) as PlanCuenta[]) {
      const codigo = String(cuenta.codigo || '').trim().toUpperCase();
      if (!unicas.has(codigo)) unicas.set(codigo, cuenta);
    }
    return [...unicas.values()];
  }
}
