import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { FiltrosContables } from './accounting.interfaces';
import { TenantContextService } from '../tenant/tenant-context.service';
import { createHash } from 'crypto';

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
      const visibles = (cuentas || []).filter(
        (cuenta: any) => cuenta?.metadata?.internal_equivalence !== true,
      );
      const unicas = new Map<string, any>();
      for (const cuenta of visibles) {
        const codigo = String(cuenta?.codigo || '').trim().toUpperCase();
        if (!unicas.has(codigo)) unicas.set(codigo, cuenta);
      }
      return [...unicas.values()];
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
          plan_cuentas!fk_detalle_asientos_cuenta_id!inner(
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

      // El kardex se lleva por producto. Acumular en un solo contador mezclaba
      // articulos distintos: tras recibir 10 cafes a 18 y 5 cuadernos a 6, el
      // cuaderno figuraba con stock 15 y costo promedio 14 en vez de 5 y 6. Esa
      // valuacion alimenta el balance y el costo de ventas.
      const acumuladoPorProducto = new Map<string, { stock: number; valor: number }>();

      const kardex = (movimientos || []).map((mov: any) => {
        const cantidad = Number(mov.cantidad_recibida ?? 0);
        const valor = Number(mov.valor_total ?? (mov.costo_unitario ?? 0) * cantidad);

        const clave = String(mov.producto_id ?? mov.producto_codigo ?? '');
        const acumulado = acumuladoPorProducto.get(clave) ?? { stock: 0, valor: 0 };
        acumulado.stock += cantidad;
        acumulado.valor += valor;
        acumuladoPorProducto.set(clave, acumulado);

        const stockAcumulado = acumulado.stock;
        const valorAcumulado = acumulado.valor;
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

      // Efectivo y equivalentes de efectivo es el elemento 10 del PCGE. Se
      // filtraba por divisionarias fijas (10111, 10411, 10412), pero un plan
      // contable puede estar abierto a otro nivel -el que crea el propio sistema
      // usa "10"- y entonces el libro no encontraba un solo movimiento de caja
      // aunque los hubiera. Se busca por prefijo para cubrir cualquier apertura.

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
          plan_cuentas!fk_detalle_asientos_cuenta_id!inner(
            codigo,
            nombre
          )
        `,
        )
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: true, foreignTable: 'asientos_contables' });

      query = cuentaCodigo
        ? query.eq('plan_cuentas.codigo', cuentaCodigo)
        : query.like('plan_cuentas.codigo', '10%');

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
          asientos_contables!fk_detalle_asientos_asiento_id!inner(
            fecha,
            numero_asiento,
            concepto
          ),
          plan_cuentas!fk_detalle_asientos_cuenta_id!inner(
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

  /**
   * Registro de activos fijos (SUNAT 7.1).
   *
   * Antes esto devolvía los movimientos de las cuentas del elemento 3, que es un
   * reporte de cuentas y no un registro de activos: no traía vida útil, ni
   * depreciación acumulada, ni valor neto. Ahora lee el registro real.
   *
   * Si el tenant no tiene activos registrados —o la tabla aún no existe en ese
   * entorno— se conserva la consulta anterior como respaldo, para no dejar el
   * libro vacío en instalaciones que todavía no usan el módulo.
   */
  async getRegistroActivosFijos(filtros: FiltrosContables = {}) {
    const tenantId = this.resolveTenantId();
    const { fechaDesde, fechaHasta } = filtros;

    try {
      let query = this.supabase
        .getClient()
        .from('activos_fijos')
        .select(
          `id, codigo, nombre, descripcion, fecha_adquisicion, valor_adquisicion,
           valor_residual, vida_util_meses, metodo_depreciacion, depreciacion_acumulada,
           situacion, fecha_baja, centro_costo_id`,
        )
        .eq('tenant_id', tenantId)
        .order('codigo', { ascending: true });

      if (fechaDesde) query = query.gte('fecha_adquisicion', fechaDesde);
      if (fechaHasta) query = query.lte('fecha_adquisicion', fechaHasta);

      const { data: activos, error } = await query;

      if (!error && activos && activos.length > 0) {
        return activos.map((activo: any) => ({
          ...activo,
          valor_neto:
            Math.round(
              (Number(activo.valor_adquisicion ?? 0) -
                Number(activo.depreciacion_acumulada ?? 0)) *
                100,
            ) / 100,
        }));
      }

      if (error && error.code !== '42P01') {
        console.warn(
          'Registro de activos fijos: no se pudo leer activos_fijos, se usa el respaldo por cuentas:',
          error.message,
        );
      }
    } catch (error: any) {
      console.warn(
        'Registro de activos fijos: fallo leyendo activos_fijos, se usa el respaldo por cuentas:',
        error?.message,
      );
    }

    try {
      let query = this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          *,
          asientos_contables!fk_detalle_asientos_asiento_id!inner(fecha, concepto, numero_asiento),
          plan_cuentas!fk_detalle_asientos_cuenta_id!inner(codigo, nombre)
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
          asientos_contables!fk_detalle_asientos_asiento_id!inner(fecha, concepto, numero_asiento),
          plan_cuentas!fk_detalle_asientos_cuenta_id!inner(codigo, nombre)
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
          asientos_contables!fk_detalle_asientos_asiento_id!inner(fecha, concepto, numero_asiento, referencia),
          plan_cuentas!fk_detalle_asientos_cuenta_id!inner(codigo, nombre)
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
          asientos_contables!fk_detalle_asientos_asiento_id!inner(fecha, concepto, numero_asiento),
          plan_cuentas!fk_detalle_asientos_cuenta_id!inner(codigo, nombre)
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

      // El Registro de Compras SUNAT es a nivel de comprobante → se lee de la tabla
      // `compras` (facturas/OC recibidas), NO de líneas de asiento. Antes filtraba
      // clase 60 sobre detalle_asientos, pero las compras postean a clase 20
      // (Mercaderías) → siempre daba 0.
      let query = this.supabase
        .getClient()
        .from('compras')
        .select(
          `
          fecha, tipo_documento, numero_documento, subtotal, igv, total, moneda, estado,
          proveedores!fk_compras_proveedor_id(razon_social, nombre, ruc, numero_documento)
        `,
        )
        .eq('tenant_id', tenantId)
        .not('estado', 'in', '("ANULADA","ANULADO","CANCELADA","CANCELADO")')
        .order('fecha', { ascending: true });

      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);

      const { data, error } = await query;
      if (error) throw error;

      const compras = (data || []).map((c: any) => ({
        fecha: c.fecha,
        tipoDocumento: c.tipo_documento,
        numeroDocumento: c.numero_documento,
        razonSocialProveedor:
          c.proveedores?.razon_social || c.proveedores?.nombre || 'Proveedor no especificado',
        rucProveedor: c.proveedores?.ruc || c.proveedores?.numero_documento || '',
        baseImponible: Number(c.subtotal || 0),
        igv: Number(c.igv || 0),
        importeTotal: Number(c.total || 0),
        moneda: c.moneda || 'PEN',
      }));

      const r2 = (n: number) => Math.round(n * 100) / 100;
      const resumen = compras.reduce(
        (acc, c) => {
          acc.baseImponible = r2(acc.baseImponible + c.baseImponible);
          acc.igv = r2(acc.igv + c.igv);
          acc.total = r2(acc.total + c.importeTotal);
          return acc;
        },
        { cantidadComprobantes: compras.length, baseImponible: 0, igv: 0, total: 0 },
      );

      return { resumen, compras, total: compras.length };
    } catch (error) {
      console.error('Error obteniendo registro de compras:', error);
      throw error;
    }
  }

  async getRegistroConsignaciones(filtros: FiltrosContables = {}) {
    try {
      const tenantId = this.resolveTenantId();
      const { fechaDesde, fechaHasta, estado } = filtros;

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
      if (estado) query = query.eq('estado', String(estado).trim().toUpperCase());

      const { data: consignaciones, error } = await query;
      if (error) throw error;

      return consignaciones || [];
    } catch (error) {
      console.error('Error obteniendo registro de consignaciones:', error);
      throw error;
    }
  }

  async createConsignacion(consignacionData:any,actorId:string,idempotencyKey?:string) {
    try {
      const tenantId = this.resolveTenantId();
      const cantidad = Number(consignacionData?.cantidad || 0);
      const valorUnitario = Number(consignacionData?.valor_unitario || 0);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw new BadRequestException('La cantidad de la consignación debe ser mayor que cero');
      }
      if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
        throw new BadRequestException('El valor unitario de la consignación no puede ser negativo');
      }
      if(!actorId) throw new BadRequestException('Se requiere un usuario autenticado');
      const key=idempotencyKey?.trim()||`consignment-create:${createHash('sha256').update(JSON.stringify({tenantId,actorId,consignacionData})).digest('hex')}`;
      const {data:rpcData,error:rpcError}=await this.supabase.getClient().rpc('gestionar_consignacion_tx',{
        p_tenant_id:tenantId,p_actor_id:actorId,p_action:'CREATE',p_id:null,p_payload:consignacionData,p_idempotency_key:key,
      });
      if(rpcError) throw new BadRequestException(rpcError.message||'No se pudo crear la consignación');
      const result:any=Array.isArray(rpcData)?rpcData[0]:rpcData;
      return result.record;
    } catch (error) {
      console.error('Error creando consignación:', error);
      throw error;
    }
  }

  async updateEstadoConsignacion(id:string,nuevoEstado:string,actorId:string,idempotencyKey?:string) {
    try {
      const tenantId = this.resolveTenantId();
      const estado = String(nuevoEstado || '').trim().toUpperCase();
      const permitidos = new Set(['PENDIENTE', 'VENDIDA', 'DEVUELTA', 'ANULADA', 'CERRADA']);
      if (!permitidos.has(estado)) {
        throw new BadRequestException(`Estado de consignación no permitido: ${nuevoEstado}`);
      }
      if(!actorId) throw new BadRequestException('Se requiere un usuario autenticado');
      const key=idempotencyKey?.trim()||`consignment-transition:${createHash('sha256').update(JSON.stringify({tenantId,id,estado,actorId})).digest('hex')}`;
      const {data:rpcData,error:rpcError}=await this.supabase.getClient().rpc('gestionar_consignacion_tx',{
        p_tenant_id:tenantId,p_actor_id:actorId,p_action:'TRANSITION',p_id:id,p_payload:{estado},p_idempotency_key:key,
      });
      if(rpcError) throw new BadRequestException(rpcError.message||'No se pudo actualizar la consignación');
      const result:any=Array.isArray(rpcData)?rpcData[0]:rpcData;
      return result.record;
    } catch (error) {
      console.error('Error actualizando estado de consignación:', error);
      throw error;
    }
  }
}
