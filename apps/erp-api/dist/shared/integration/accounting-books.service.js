"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountingBooksService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../supabase/supabase.service");
function normalizePC(pc) {
    return Array.isArray(pc) ? pc?.[0] : pc;
}
let AccountingBooksService = class AccountingBooksService {
    constructor(supabase) {
        this.supabase = supabase;
        console.log('📚 [AccountingBooksService] Servicio de libros contables inicializado');
    }
    async getPlanCuentas() {
        try {
            const { data: cuentas, error } = await this.supabase
                .getClient()
                .from('plan_cuentas')
                .select('*')
                .eq('activo', true)
                .order('codigo');
            if (error)
                throw error;
            return cuentas || [];
        }
        catch (error) {
            console.error('Error obteniendo plan de cuentas:', error);
            throw error;
        }
    }
    async getAsientosContables(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta, numeroAsiento, estado } = filtros;
            let query = this.supabase
                .getClient()
                .from('asientos_contables')
                .select(`
          *,
          detalle_asientos(
            *,
            plan_cuentas(
              codigo,
              nombre
            )
          )
        `)
                .order('fecha', { ascending: false })
                .order('numero_asiento', { ascending: false });
            if (fechaDesde)
                query = query.gte('fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('fecha', fechaHasta);
            if (numeroAsiento)
                query = query.eq('numero_asiento', numeroAsiento);
            if (estado)
                query = query.eq('estado', estado);
            const { data: asientos, error } = await query;
            if (error)
                throw error;
            return asientos || [];
        }
        catch (error) {
            console.error('Error obteniendo asientos contables:', error);
            throw error;
        }
    }
    async getLibroMayorPorCuenta(cuentaCodigo, filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('detalle_asientos')
                .select(`
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
        `)
                .eq('plan_cuentas.codigo', cuentaCodigo)
                .order('asientos_contables.fecha', { ascending: true });
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            let saldoAcumulado = 0;
            const movimientosConSaldo = (movimientos || []).map((mov) => {
                saldoAcumulado += mov.debe - mov.haber;
                return { ...mov, saldo: saldoAcumulado };
            });
            return movimientosConSaldo;
        }
        catch (error) {
            console.error('Error obteniendo libro mayor por cuenta:', error);
            throw error;
        }
    }
    async getLibroMayorCompleto(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('detalle_asientos')
                .select(`
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
        `)
                .order('plan_cuentas.codigo')
                .order('asientos_contables.fecha', { ascending: true });
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            const cuentasMap = new Map();
            (movimientos || []).forEach((mov) => {
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
        }
        catch (error) {
            console.error('Error obteniendo libro mayor completo:', error);
            throw error;
        }
    }
    async getLibroDiario(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta, numeroAsiento } = filtros;
            let query = this.supabase
                .getClient()
                .from('asientos_contables')
                .select(`
          *,
          detalle_asientos(
            *,
            plan_cuentas(
              codigo,
              nombre
            )
          )
        `)
                .eq('estado', 'CONFIRMADO')
                .order('fecha', { ascending: true })
                .order('numero_asiento', { ascending: true });
            if (fechaDesde)
                query = query.gte('fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('fecha', fechaHasta);
            if (numeroAsiento)
                query = query.eq('numero_asiento', numeroAsiento);
            const { data: asientos, error } = await query;
            if (error)
                throw error;
            return asientos || [];
        }
        catch (error) {
            console.error('Error obteniendo libro diario:', error);
            throw error;
        }
    }
    async getBalanceComprobacion(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('detalle_asientos')
                .select(`
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
        `);
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            const cuentasBalance = new Map();
            (movimientos || []).forEach((mov) => {
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
            return Array.from(cuentasBalance.values()).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
        }
        catch (error) {
            console.error('Error obteniendo balance de comprobación:', error);
            throw error;
        }
    }
    async getKardexValorizado(filtros = {}) {
        try {
            const { productoId, fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('movimientos_stock')
                .select(`
          *,
          productos(
            nombre,
            codigo,
            unidad_medida
          )
        `)
                .order('fecha', { ascending: true });
            if (productoId)
                query = query.eq('producto_id', productoId);
            if (fechaDesde)
                query = query.gte('fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            let stockAcumulado = 0;
            let valorAcumulado = 0;
            const kardex = (movimientos || []).map((mov) => {
                const cantidad = mov.tipo === 'ENTRADA' ? mov.cantidad : -mov.cantidad;
                const valor = mov.tipo === 'ENTRADA'
                    ? mov.valor_unitario * mov.cantidad
                    : -mov.valor_unitario * mov.cantidad;
                stockAcumulado += cantidad;
                valorAcumulado += valor;
                const costoPromedio = stockAcumulado > 0 ? valorAcumulado / stockAcumulado : 0;
                return { ...mov, stockAcumulado, valorAcumulado, costoPromedio };
            });
            return kardex;
        }
        catch (error) {
            console.error('Error obteniendo kardex valorizado:', error);
            throw error;
        }
    }
    async getLibroCajaBancos(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta, cuentaCodigo } = filtros;
            const cuentasCajaBancos = cuentaCodigo ? [cuentaCodigo] : ['10111', '10411', '10412'];
            let query = this.supabase
                .getClient()
                .from('detalle_asientos')
                .select(`
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
        `)
                .in('plan_cuentas.codigo', cuentasCajaBancos)
                .order('asientos_contables.fecha', { ascending: true });
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            const cuentasMap = new Map();
            (movimientos || []).forEach((mov) => {
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
        }
        catch (error) {
            console.error('Error obteniendo libro caja y bancos:', error);
            throw error;
        }
    }
    async getLibroInventariosBalances(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('detalle_asientos')
                .select(`
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
        `)
                .like('plan_cuentas.codigo', '20%')
                .order('asientos_contables.fecha', { ascending: true });
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            const inventarios = new Map();
            (movimientos || []).forEach((mov) => {
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
                if (mov.debe > 0)
                    inv.entradas += mov.debe;
                else
                    inv.salidas += mov.haber;
                inv.saldoFinal = inv.saldoInicial + inv.entradas - inv.salidas;
            });
            return Array.from(inventarios.values());
        }
        catch (error) {
            console.error('Error obteniendo libro inventarios y balances:', error);
            throw error;
        }
    }
    async getRegistroActivosFijos(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('detalle_asientos')
                .select(`
          *,
          asientos_contables(fecha, concepto, numero_asiento),
          plan_cuentas(codigo, nombre)
        `)
                .like('plan_cuentas.codigo', '33%')
                .order('asientos_contables.fecha');
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            return movimientos || [];
        }
        catch (error) {
            console.error('Error obteniendo registro de activos fijos:', error);
            throw error;
        }
    }
    async getLibroPlanillas(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('detalle_asientos')
                .select(`
          *,
          asientos_contables(fecha, concepto, numero_asiento),
          plan_cuentas(codigo, nombre)
        `)
                .like('plan_cuentas.codigo', '62%')
                .order('asientos_contables.fecha');
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            return movimientos || [];
        }
        catch (error) {
            console.error('Error obteniendo libro de planillas:', error);
            throw error;
        }
    }
    async getRegistroCostos(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('detalle_asientos')
                .select(`
          *,
          asientos_contables(fecha, concepto, numero_asiento, referencia),
          plan_cuentas(codigo, nombre)
        `)
                .like('plan_cuentas.codigo', '9%')
                .order('asientos_contables.fecha');
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            return movimientos || [];
        }
        catch (error) {
            console.error('Error obteniendo registro de costos:', error);
            throw error;
        }
    }
    async getLibrosElectronicosSunat(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('asientos_contables')
                .select(`
          *,
          detalle_asientos(
            *,
            plan_cuentas(codigo, nombre)
          )
        `)
                .order('fecha');
            if (fechaDesde)
                query = query.gte('fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('fecha', fechaHasta);
            const { data: asientos, error } = await query;
            if (error)
                throw error;
            return asientos || [];
        }
        catch (error) {
            console.error('Error obteniendo libros electrónicos SUNAT:', error);
            throw error;
        }
    }
    async getRegistroVentas(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('detalle_asientos')
                .select(`
          *,
          asientos_contables(fecha, concepto, numero_asiento),
          plan_cuentas(codigo, nombre)
        `)
                .like('plan_cuentas.codigo', '70%')
                .order('asientos_contables.fecha');
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            return movimientos || [];
        }
        catch (error) {
            console.error('Error obteniendo registro de ventas:', error);
            throw error;
        }
    }
    async getRegistroCompras(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('detalle_asientos')
                .select(`
          *,
          asientos_contables(fecha, concepto, numero_asiento),
          plan_cuentas(codigo, nombre)
        `)
                .like('plan_cuentas.codigo', '60%')
                .order('asientos_contables.fecha');
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            return movimientos || [];
        }
        catch (error) {
            console.error('Error obteniendo registro de compras:', error);
            throw error;
        }
    }
    async getRegistroConsignaciones(filtros = {}) {
        try {
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
                .order('fecha_registro', { ascending: false });
            if (fechaDesde)
                query = query.gte('fecha_registro', fechaDesde);
            if (fechaHasta)
                query = query.lte('fecha_registro', fechaHasta);
            const { data: consignaciones, error } = await query;
            if (error)
                throw error;
            return consignaciones || [];
        }
        catch (error) {
            console.error('Error obteniendo registro de consignaciones:', error);
            throw error;
        }
    }
    async createConsignacion(consignacionData) {
        try {
            const { data: consignacion, error } = await this.supabase
                .getClient()
                .from('registro_consignaciones')
                .insert(consignacionData)
                .select()
                .single();
            if (error)
                throw error;
            return consignacion;
        }
        catch (error) {
            console.error('Error creando consignación:', error);
            throw error;
        }
    }
    async updateEstadoConsignacion(id, nuevoEstado) {
        try {
            const { data, error } = await this.supabase
                .getClient()
                .from('registro_consignaciones')
                .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();
            if (error)
                throw error;
            return data;
        }
        catch (error) {
            console.error('Error actualizando estado de consignación:', error);
            throw error;
        }
    }
};
exports.AccountingBooksService = AccountingBooksService;
exports.AccountingBooksService = AccountingBooksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], AccountingBooksService);
//# sourceMappingURL=accounting-books.service.js.map