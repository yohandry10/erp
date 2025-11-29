import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { FiltrosContables } from './accounting.interfaces';
import { TenantContextService } from '../tenant/tenant-context.service';

function normalizePC(pc: any) {
  return Array.isArray(pc) ? pc?.[0] : pc;
}

@Injectable()
export class AccountingBooksService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService,
  ) {
    console.log('📚 [AccountingBooksService] Servicio de libros contables inicializado');
  }

  private resolveTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant requerido para consultas contables');
    }
    return tenantId;
  }

  async getPlanCuentas() {
    try {
      const tenantId = this.resolveTenantId();
      const { data: cuentas, error } = await this.supabase
        .getClient()
        .from('plan_cuentas')
        .select('*')
        .eq('activo', true)
        .eq('tenant_id', tenantId)
        .order('codigo');

      if (error) throw error;
      return cuentas || [];
    } catch (error) {
      console.error('Error obteniendo plan de cuentas:', error);
      throw error;
    }
  }

  async getAsientosContables(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta, numeroAsiento, estado } = filtros;

      let query = this.supabase
        .getClient()
        .from('asientos_contables')
        .select(
          `
          *,
          detalle_asientos(
            *,
            plan_cuentas(
              codigo,
              nombre
            )
          )
        `,
        )
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: false })
        .order('numero_asiento', { ascending: false });

      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);
      if (numeroAsiento) query = query.eq('numero_asiento', numeroAsiento);
      if (estado) query = query.eq('estado', estado);

      const { data: asientos, error } = await query;

      if (error) throw error;
      return asientos || [];
    } catch (error) {
      console.error('Error obteniendo asientos contables:', error);
      throw error;
    }
  }

  async getLibroMayorPorCuenta(cuentaCodigo: string, filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          *,
          asientos_contables(
            fecha,
            numero_asiento,
            concepto,
            referencia
          ),
          plan_cuentas(
            codigo,
            nombre
          )
        `,
        )
        .eq('plan_cuentas.codigo', cuentaCodigo)
        .eq('tenant_id', tenantId)
        .order('asientos_contables.fecha', { ascending: true });

      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;

      if (error) throw error;

      // Calcular saldos acumulados
      let saldoAcumulado = 0;
      const movimientosConSaldo = (movimientos || []).map((mov: any) => {
        saldoAcumulado += mov.debe - mov.haber;
        return { ...mov, saldo: saldoAcumulado };
      });

      return movimientosConSaldo;
    } catch (error) {
      console.error('Error obteniendo libro mayor por cuenta:', error);
      throw error;
    }
  }

  async getLibroMayorCompleto(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          *,
          asientos_contables(
            fecha,
            numero_asiento,
            concepto,
            referencia
          ),
          plan_cuentas(
            codigo,
            nombre
          )
        `,
        )
        .eq('tenant_id', tenantId)
        .order('plan_cuentas.codigo')
        .order('asientos_contables.fecha', { ascending: true });

      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      const cuentasMap = new Map<string, any>();

      (movimientos || []).forEach((mov: any) => {
        const pc = normalizePC(mov?.plan_cuentas);
        const cuentaCodigo = pc?.codigo;

        if (!cuentasMap.has(cuentaCodigo)) {
          cuentasMap.set(cuentaCodigo, {
            cuenta: pc,
            movimientos: [],
            saldoTotal: 0,
          });
        }

        const cuenta = cuentasMap.get(cuentaCodigo);
        cuenta.saldoTotal += mov.debe - mov.haber;
        cuenta.movimientos.push({ ...mov, saldo: cuenta.saldoTotal });
      });

      return Array.from(cuentasMap.values());
    } catch (error) {
      console.error('Error obteniendo libro mayor completo:', error);
      throw error;
    }
  }

  async getLibroDiario(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta, numeroAsiento } = filtros;

      let query = this.supabase
        .getClient()
        .from('asientos_contables')
        .select(
          `
          *,
          detalle_asientos(
            *,
            plan_cuentas(
              codigo,
              nombre
            )
          )
        `,
        )
        .eq('estado', 'CONFIRMADO')
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: true })
        .order('numero_asiento', { ascending: true });

      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);
      if (numeroAsiento) query = query.eq('numero_asiento', numeroAsiento);

      const { data: asientos, error } = await query;

      if (error) throw error;
      return asientos || [];
    } catch (error) {
      console.error('Error obteniendo libro diario:', error);
      throw error;
    }
  }

  async getBalanceComprobacion(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          debe,
          haber,
          plan_cuentas(
            id,
            codigo,
            nombre,
            tipo_cuenta
          ),
          asientos_contables(
            fecha
          )
        `,
        );

      query = query.eq('tenant_id', tenantId);
      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      const cuentasBalance = new Map<string, any>();

      (movimientos || []).forEach((mov: any) => {
        const pc = normalizePC(mov?.plan_cuentas);
        const cuentaCodigo = pc?.codigo;

        if (!cuentasBalance.has(cuentaCodigo)) {
          cuentasBalance.set(cuentaCodigo, {
            codigo: cuentaCodigo,
            cuenta: pc,
            movimientos: [],
            saldoFinal: 0,
          });
        }

        const cuenta = cuentasBalance.get(cuentaCodigo);
        cuenta.saldoFinal += mov.debe - mov.haber;
        cuenta.movimientos.push({ ...mov, saldo: cuenta.saldoFinal });
      });

      return Array.from(cuentasBalance.values()).sort((a, b) =>
        String(a.codigo).localeCompare(String(b.codigo)),
      );
    } catch (error) {
      console.error('Error obteniendo balance de comprobación:', error);
      throw error;
    }
  }

  async getKardexValorizado(filtros: any = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { productoId, fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('movimientos_stock')
        .select(
          `
          *,
          productos(
            nombre,
            codigo,
            unidad_medida
          )
        `,
        )
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: true });

      if (productoId) query = query.eq('producto_id', productoId);
      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      let stockAcumulado = 0;
      let valorAcumulado = 0;

      const kardex = (movimientos || []).map((mov: any) => {
        const cantidad = mov.tipo === 'ENTRADA' ? mov.cantidad : -mov.cantidad;
        const valor =
          mov.tipo === 'ENTRADA'
            ? mov.valor_unitario * mov.cantidad
            : -mov.valor_unitario * mov.cantidad;

        stockAcumulado += cantidad;
        valorAcumulado += valor;

        const costoPromedio = stockAcumulado > 0 ? valorAcumulado / stockAcumulado : 0;

        return { ...mov, stockAcumulado, valorAcumulado, costoPromedio };
      });

      return kardex;
    } catch (error) {
      console.error('Error obteniendo kardex valorizado:', error);
      throw error;
    }
  }

  async getLibroCajaBancos(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta, cuentaCodigo } = filtros;

      // Cuentas de caja y bancos (10xxx)
      const cuentasCajaBancos = cuentaCodigo ? [cuentaCodigo] : ['10111', '10411', '10412'];

      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          *,
          asientos_contables(
            fecha,
            numero_asiento,
            concepto,
            referencia
          ),
          plan_cuentas(
            codigo,
            nombre
          )
        `,
        )
        .in('plan_cuentas.codigo', cuentasCajaBancos)
        .eq('tenant_id', tenantId)
        .order('asientos_contables.fecha', { ascending: true });

      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      const cuentasMap = new Map<string, any>();

      (movimientos || []).forEach((mov: any) => {
        const pc = normalizePC(mov?.plan_cuentas);
        const codigo = pc?.codigo;

        if (!cuentasMap.has(codigo)) {
          cuentasMap.set(codigo, {
            cuenta: pc,
            movimientos: [],
            saldoFinal: 0,
          });
        }

        const cuenta = cuentasMap.get(codigo);
        cuenta.saldoFinal += mov.debe - mov.haber;
        cuenta.movimientos.push({ ...mov, saldo: cuenta.saldoFinal });
      });

      return Array.from(cuentasMap.values());
    } catch (error) {
      console.error('Error obteniendo libro caja y bancos:', error);
      throw error;
    }
  }

  async getLibroInventariosBalances(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          *,
          asientos_contables(
            fecha,
            numero_asiento,
            concepto
          ),
          plan_cuentas(
            codigo,
            nombre
          )
        `,
        )
        .like('plan_cuentas.codigo', '20%')
        .eq('tenant_id', tenantId)
        .order('asientos_contables.fecha', { ascending: true });

      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      const inventarios = new Map<string, any>();

      (movimientos || []).forEach((mov: any) => {
        const pc = normalizePC(mov?.plan_cuentas);
        const codigo = pc?.codigo;

        if (!inventarios.has(codigo)) {
          inventarios.set(codigo, {
            cuenta: pc,
            saldoInicial: 0,
            entradas: 0,
            salidas: 0,
            saldoFinal: 0,
          });
        }

        const inv = inventarios.get(codigo);
        if (mov.debe > 0) inv.entradas += mov.debe;
        else inv.salidas += mov.haber;

        inv.saldoFinal = inv.saldoInicial + inv.entradas - inv.salidas;
      });

      return Array.from(inventarios.values());
    } catch (error) {
      console.error('Error obteniendo libro inventarios y balances:', error);
      throw error;
    }
  }

  async getRegistroActivosFijos(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          *,
          asientos_contables(fecha, concepto, numero_asiento),
          plan_cuentas(codigo, nombre)
        `,
        )
        .like('plan_cuentas.codigo', '33%')
        .eq('tenant_id', tenantId)
        .order('asientos_contables.fecha');

      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      return movimientos || [];
    } catch (error) {
      console.error('Error obteniendo registro de activos fijos:', error);
      throw error;
    }
  }

  async getLibroPlanillas(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          *,
          asientos_contables(fecha, concepto, numero_asiento),
          plan_cuentas(codigo, nombre)
        `,
        )
        .like('plan_cuentas.codigo', '62%')
        .eq('tenant_id', tenantId)
        .order('asientos_contables.fecha');

      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      return movimientos || [];
    } catch (error) {
      console.error('Error obteniendo libro de planillas:', error);
      throw error;
    }
  }

  async getRegistroCostos(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          *,
          asientos_contables(fecha, concepto, numero_asiento, referencia),
          plan_cuentas(codigo, nombre)
        `,
        )
        .like('plan_cuentas.codigo', '9%')
        .eq('tenant_id', tenantId)
        .order('asientos_contables.fecha');

      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      return movimientos || [];
    } catch (error) {
      console.error('Error obteniendo registro de costos:', error);
      throw error;
    }
  }

  async getLibrosElectronicosSunat(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('asientos_contables')
        .select(
          `
          *,
          detalle_asientos(
            *,
            plan_cuentas(codigo, nombre)
          )
        `,
        )
        .eq('tenant_id', tenantId)
        .order('fecha');

      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);

      const { data: asientos, error } = await query;
      if (error) throw error;

      return asientos || [];
    } catch (error) {
      console.error('Error obteniendo libros electrónicos SUNAT:', error);
      throw error;
    }
  }

  async getRegistroVentas(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          *,
          asientos_contables(fecha, concepto, numero_asiento),
          plan_cuentas(codigo, nombre)
        `,
        )
        .like('plan_cuentas.codigo', '70%')
        .eq('tenant_id', tenantId)
        .order('asientos_contables.fecha');

      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      return movimientos || [];
    } catch (error) {
      console.error('Error obteniendo registro de ventas:', error);
      throw error;
    }
  }

  async getRegistroCompras(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          *,
          asientos_contables(fecha, concepto, numero_asiento),
          plan_cuentas(codigo, nombre)
        `,
        )
        .like('plan_cuentas.codigo', '60%')
        .eq('tenant_id', tenantId)
        .order('asientos_contables.fecha');

      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      return movimientos || [];
    } catch (error) {
      console.error('Error obteniendo registro de compras:', error);
      throw error;
    }
  }

  async getRegistroConsignaciones(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta } = filtros;

      let query = this.supabase
        .getClient()
        .from('registro_consignaciones')
        .select(`
          *,
          movimientos_consignacion(
            *,
            productos(codigo, nombre, categoria)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('fecha_registro', { ascending: false });

      if (fechaDesde) query = query.gte('fecha_registro', fechaDesde);
      if (fechaHasta) query = query.lte('fecha_registro', fechaHasta);

      const { data: consignaciones, error } = await query;
      if (error) throw error;

      return consignaciones || [];
    } catch (error) {
      console.error('Error obteniendo registro de consignaciones:', error);
      throw error;
    }
  }

  async createConsignacion(consignacionData: any) {
    try {
      const tenantId = this.resolveTenantId();
      const payload = { ...consignacionData, tenant_id: consignacionData?.tenant_id ?? tenantId };
      const { data: consignacion, error } = await this.supabase
        .getClient()
        .from('registro_consignaciones')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return consignacion;
    } catch (error) {
      console.error('Error creando consignación:', error);
      throw error;
    }
  }

  async updateEstadoConsignacion(id: string, nuevoEstado: string) {
    try {
      const tenantId = this.resolveTenantId();
      const { data, error } = await this.supabase
        .getClient()
        .from('registro_consignaciones')
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error actualizando estado de consignación:', error);
      throw error;
    }
  }
}
