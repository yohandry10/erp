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
          detalle_asientos!fk_detalle_asientos_asiento_id(
            *,
            plan_cuentas!fk_detalle_asientos_cuenta_id(
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
          asientos_contables!fk_detalle_asientos_asiento_id!inner(
            fecha,
            numero_asiento,
            concepto,
            referencia
          ),
          plan_cuentas!fk_detalle_asientos_cuenta_id(
            codigo,
            nombre
          )
        `,
        )
        .eq('plan_cuentas.codigo', cuentaCodigo)
        .eq('asientos_contables.tenant_id', tenantId)
        .order('fecha', { ascending: true, foreignTable: 'asientos_contables' });

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
          asientos_contables!fk_detalle_asientos_asiento_id!inner(
            fecha,
            numero_asiento,
            concepto,
            referencia
          ),
          plan_cuentas!fk_detalle_asientos_cuenta_id(
            codigo,
            nombre
          )
        `,
        )
        .eq('asientos_contables.tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (fechaDesde) query = query.gte('asientos_contables.fecha', fechaDesde);
      if (fechaHasta) query = query.lte('asientos_contables.fecha', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      const movimientosOrdenados = (movimientos || []).slice().sort((a: any, b: any) => {
        const cuentaA = normalizePC(a?.plan_cuentas)?.codigo ?? '';
        const cuentaB = normalizePC(b?.plan_cuentas)?.codigo ?? '';
        if (cuentaA !== cuentaB) return cuentaA.localeCompare(cuentaB);
        const asientoA = normalizePC(a?.asientos_contables);
        const asientoB = normalizePC(b?.asientos_contables);
        const fechaA = asientoA?.fecha ?? '';
        const fechaB = asientoB?.fecha ?? '';
        if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);
        return Number(asientoA?.numero_asiento ?? 0) - Number(asientoB?.numero_asiento ?? 0);
      });

      const cuentasMap = new Map<string, any>();

      movimientosOrdenados.forEach((mov: any) => {
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
          detalle_asientos!fk_detalle_asientos_asiento_id(
            *,
            plan_cuentas!fk_detalle_asientos_cuenta_id(
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
          plan_cuentas!fk_detalle_asientos_cuenta_id(
            id,
            codigo,
            nombre,
            tipo
          ),
          asientos_contables!fk_detalle_asientos_asiento_id!inner(
            fecha
          )
        `,
        );

      query = query.eq('asientos_contables.tenant_id', tenantId);
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
        .from('vw_kardex_valorizado')
        .select(
          `
          recepcion_item_id,
          recepcion_id,
          tenant_id,
          recepcion_numero,
          fecha_recepcion,
          recepcion_estado,
          producto_id,
          producto_codigo,
          producto_nombre,
          producto_sku,
          cantidad_recibida,
          costo_unitario,
          valor_total,
          almacen_id,
          almacen_nombre,
          ubicacion_id,
          ubicacion_codigo,
          lote,
          serie,
          fecha_expiracion,
          moneda_detalle
        `,
        )
        .eq('tenant_id', tenantId)
        .order('fecha_recepcion', { ascending: true });

      if (productoId) query = query.eq('producto_id', productoId);
      if (fechaDesde) query = query.gte('fecha_recepcion', fechaDesde);
      if (fechaHasta) query = query.lte('fecha_recepcion', fechaHasta);

      const { data: movimientos, error } = await query;
      if (error) throw error;

      let stockAcumulado = 0;
      let valorAcumulado = 0;

      const kardex = (movimientos || []).map((mov: any) => {
        const cantidad = Number(mov.cantidad_recibida ?? 0);
        const valor = Number(mov.valor_total ?? (mov.costo_unitario ?? 0) * cantidad);

        stockAcumulado += cantidad;
        valorAcumulado += valor;

        const costoPromedio = stockAcumulado > 0 ? valorAcumulado / stockAcumulado : 0;

        return {
          ...mov,
          tipo: 'ENTRADA',
          fecha: mov.fecha_recepcion,
          documento: mov.recepcion_numero,
          stockAcumulado,
          valorAcumulado,
          costoPromedio,
        };
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
          asientos_contables!fk_detalle_asientos_asiento_id(
            fecha,
            numero_asiento,
            concepto,
            referencia
          ),
          plan_cuentas!fk_detalle_asientos_cuenta_id(
            codigo,
            nombre
          )
        `,
        )
        .in('plan_cuentas.codigo', cuentasCajaBancos)
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: true, foreignTable: 'asientos_contables' });

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
          asientos_contables!fk_detalle_asientos_asiento_id(
            fecha,
            numero_asiento,
            concepto
          ),
          plan_cuentas!fk_detalle_asientos_cuenta_id(
            codigo,
            nombre
          )
        `,
        )
        .like('plan_cuentas.codigo', '20%')
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: true, foreignTable: 'asientos_contables' });

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
          asientos_contables!fk_detalle_asientos_asiento_id(fecha, concepto, numero_asiento),
          plan_cuentas!fk_detalle_asientos_cuenta_id(codigo, nombre)
        `,
        )
        .like('plan_cuentas.codigo', '33%')
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: true, foreignTable: 'asientos_contables' });

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
          asientos_contables!fk_detalle_asientos_asiento_id(fecha, concepto, numero_asiento),
          plan_cuentas!fk_detalle_asientos_cuenta_id(codigo, nombre)
        `,
        )
        .like('plan_cuentas.codigo', '62%')
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: true, foreignTable: 'asientos_contables' });

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
          asientos_contables!fk_detalle_asientos_asiento_id(fecha, concepto, numero_asiento, referencia),
          plan_cuentas!fk_detalle_asientos_cuenta_id(codigo, nombre)
        `,
        )
        .like('plan_cuentas.codigo', '9%')
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: true, foreignTable: 'asientos_contables' });

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
          detalle_asientos!fk_detalle_asientos_asiento_id(
            *,
            plan_cuentas!fk_detalle_asientos_cuenta_id(codigo, nombre)
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
          asientos_contables!fk_detalle_asientos_asiento_id(fecha, concepto, numero_asiento),
          plan_cuentas!fk_detalle_asientos_cuenta_id(codigo, nombre)
        `,
        )
        .like('plan_cuentas.codigo', '70%')
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: true, foreignTable: 'asientos_contables' });

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
          asientos_contables!fk_detalle_asientos_asiento_id(fecha, concepto, numero_asiento),
          plan_cuentas!fk_detalle_asientos_cuenta_id(codigo, nombre)
        `,
        )
        .like('plan_cuentas.codigo', '60%')
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: true, foreignTable: 'asientos_contables' });

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
