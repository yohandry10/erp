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
exports.AccountingReportsService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../supabase/supabase.service");
function normalizePC(pc) {
    return Array.isArray(pc) ? pc?.[0] : pc;
}
let AccountingReportsService = class AccountingReportsService {
    constructor(supabase) {
        this.supabase = supabase;
        console.log('📊 [AccountingReportsService] Servicio de reportes contables inicializado');
    }
    async getRegistroVentas(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('ventas')
                .select(`
          *,
          clientes(
            nombre,
            numero_documento,
            tipo_documento
          )
        `)
                .eq('estado', 'CONFIRMADA')
                .order('fecha', { ascending: true });
            if (fechaDesde)
                query = query.gte('fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('fecha', fechaHasta);
            const { data: ventas, error } = await query;
            if (error)
                throw error;
            return (ventas || []).map((v) => ({
                fecha: v.fecha,
                tipoDocumento: v.tipo_documento,
                numeroDocumento: v.numero_documento,
                clienteNombre: v.clientes?.nombre || 'Cliente no especificado',
                clienteDocumento: v.clientes?.numero_documento || '',
                baseImponible: v.subtotal,
                igv: v.igv,
                total: v.total,
                moneda: v.moneda || 'PEN',
            }));
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
                .from('compras')
                .select(`
          *,
          proveedores(
            nombre,
            numero_documento,
            tipo_documento
          )
        `)
                .eq('estado', 'ENTREGADA')
                .order('fecha', { ascending: true });
            if (fechaDesde)
                query = query.gte('fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('fecha', fechaHasta);
            const { data: compras, error } = await query;
            if (error)
                throw error;
            return (compras || []).map((c) => ({
                fecha: c.fecha,
                tipoDocumento: c.tipo_documento,
                numeroDocumento: c.numero_documento,
                proveedorNombre: c.proveedores?.nombre || 'Proveedor no especificado',
                proveedorDocumento: c.proveedores?.numero_documento || '',
                baseImponible: c.subtotal,
                igv: c.igv,
                total: c.total,
                moneda: c.moneda || 'PEN',
            }));
        }
        catch (error) {
            console.error('Error obteniendo registro de compras:', error);
            throw error;
        }
    }
    async getRegistroActivosFijos(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            let query = this.supabase
                .getClient()
                .from('activos_fijos')
                .select('*')
                .order('fecha_adquisicion', { ascending: true });
            if (fechaDesde)
                query = query.gte('fecha_adquisicion', fechaDesde);
            if (fechaHasta)
                query = query.lte('fecha_adquisicion', fechaHasta);
            const { data: activos, error } = await query;
            if (error)
                throw error;
            return (activos || []).map((a) => ({
                codigo: a.codigo,
                descripcion: a.descripcion,
                fechaAdquisicion: a.fecha_adquisicion,
                valorAdquisicion: a.valor_adquisicion,
                depreciacionAcumulada: a.depreciacion_acumulada || 0,
                valorNeto: a.valor_adquisicion - (a.depreciacion_acumulada || 0),
                vidaUtil: a.vida_util,
                estado: a.estado,
            }));
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
                .from('planillas')
                .select(`
          *,
          detalle_planillas(
            *,
            empleados(
              nombres,
              apellidos,
              numero_documento
            )
          )
        `)
                .eq('estado', 'PAGADA')
                .order('periodo', { ascending: true });
            if (fechaDesde)
                query = query.gte('periodo', fechaDesde);
            if (fechaHasta)
                query = query.lte('periodo', fechaHasta);
            const { data: planillas, error } = await query;
            if (error)
                throw error;
            const resumen = [];
            (planillas || []).forEach((p) => {
                (p.detalle_planillas || []).forEach((d) => {
                    resumen.push({
                        periodo: p.periodo,
                        empleado: `${d.empleados?.nombres ?? ''} ${d.empleados?.apellidos ?? ''}`.trim(),
                        documento: d.empleados?.numero_documento,
                        sueldoBasico: d.sueldo_basico,
                        bonificaciones: d.bonificaciones || 0,
                        descuentos: d.descuentos || 0,
                        sueldoNeto: d.sueldo_neto,
                        aporteEssalud: d.aporte_essalud || 0,
                        onp: d.onp || 0,
                        quinta: d.quinta_categoria || 0,
                    });
                });
            });
            return resumen;
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
          asientos_contables(
            fecha,
            concepto,
            referencia
          ),
          plan_cuentas(
            codigo,
            nombre
          )
        `)
                .like('plan_cuentas.codigo', '6%')
                .order('asientos_contables.fecha', { ascending: true });
            if (fechaDesde)
                query = query.gte('asientos_contables.fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('asientos_contables.fecha', fechaHasta);
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            const costos = new Map();
            (movimientos || []).forEach((mov) => {
                const pc = normalizePC(mov?.plan_cuentas);
                const tipo = this.clasificarTipoCosto(String(pc?.codigo ?? ''));
                if (!costos.has(tipo)) {
                    costos.set(tipo, { tipo, totalCosto: 0, movimientos: [] });
                }
                const grupo = costos.get(tipo);
                grupo.totalCosto += mov.debe || 0;
                grupo.movimientos.push({
                    fecha: mov.asientos_contables?.fecha,
                    concepto: mov.asientos_contables?.concepto,
                    cuenta: pc?.nombre,
                    codigoCuenta: pc?.codigo,
                    monto: mov.debe,
                });
            });
            return Array.from(costos.values());
        }
        catch (error) {
            console.error('Error obteniendo registro de costos:', error);
            throw error;
        }
    }
    async getLibrosElectronicosSunat(filtros = {}) {
        try {
            const { fechaDesde, fechaHasta } = filtros;
            const [ventas, compras, diario, mayor] = await Promise.all([
                this.getRegistroVentas({ fechaDesde, fechaHasta }),
                this.getRegistroCompras({ fechaDesde, fechaHasta }),
                this.getLibroDiarioSunat({ fechaDesde, fechaHasta }),
                this.getLibroMayorSunat({ fechaDesde, fechaHasta }),
            ]);
            return {
                registroVentas: {
                    periodo: this.formatearPeriodo(fechaDesde, fechaHasta),
                    totalRegistros: ventas.length,
                    totalVentas: ventas.reduce((sum, v) => sum + (v.total || 0), 0),
                    datos: ventas,
                },
                registroCompras: {
                    periodo: this.formatearPeriodo(fechaDesde, fechaHasta),
                    totalRegistros: compras.length,
                    totalCompras: compras.reduce((sum, c) => sum + (c.total || 0), 0),
                    datos: compras,
                },
                libroDiario: {
                    periodo: this.formatearPeriodo(fechaDesde, fechaHasta),
                    totalAsientos: diario.length,
                    datos: diario,
                },
                libroMayor: {
                    periodo: this.formatearPeriodo(fechaDesde, fechaHasta),
                    totalCuentas: mayor.length,
                    datos: mayor,
                },
            };
        }
        catch (error) {
            console.error('Error generando libros electrónicos SUNAT:', error);
            throw error;
        }
    }
    async getLibroDiarioSunat(filtros) {
        const asientos = await this.getAsientosParaSunat(filtros);
        return asientos.map((a) => ({
            periodo: this.extraerPeriodo(a.fecha),
            numeroCorrelativo: String(a.numero_asiento).padStart(10, '0'),
            fechaOperacion: a.fecha,
            glosa: a.concepto,
            referencia: a.referencia,
            detalles: (a.detalle_asientos || []).map((d) => ({
                codigoCuenta: normalizePC(d.plan_cuentas)?.codigo,
                denominacion: normalizePC(d.plan_cuentas)?.nombre,
                debe: d.debe,
                haber: d.haber,
            })),
        }));
    }
    async getLibroMayorSunat(filtros) {
        const movimientos = await this.getMovimientosParaSunat(filtros);
        const cuentasMap = new Map();
        (movimientos || []).forEach((mov) => {
            const pc = normalizePC(mov.plan_cuentas);
            const codigo = pc?.codigo;
            if (!cuentasMap.has(codigo)) {
                cuentasMap.set(codigo, {
                    codigoCuenta: codigo,
                    denominacion: pc?.nombre,
                    saldoInicial: 0,
                    movimientos: [],
                });
            }
            cuentasMap.get(codigo).movimientos.push({
                periodo: this.extraerPeriodo(mov.asientos_contables.fecha),
                numeroCorrelativo: String(mov.asientos_contables.numero_asiento).padStart(10, '0'),
                fechaOperacion: mov.asientos_contables.fecha,
                glosa: mov.asientos_contables.concepto,
                debe: mov.debe,
                haber: mov.haber,
            });
        });
        return Array.from(cuentasMap.values());
    }
    async getAsientosParaSunat(filtros) {
        const { fechaDesde, fechaHasta } = filtros;
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
            .order('fecha', { ascending: true });
        if (fechaDesde)
            query = query.gte('fecha', fechaDesde);
        if (fechaHasta)
            query = query.lte('fecha', fechaHasta);
        const { data, error } = await query;
        if (error)
            throw error;
        return data || [];
    }
    async getMovimientosParaSunat(filtros) {
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
            .order('plan_cuentas.codigo')
            .order('asientos_contables.fecha', { ascending: true });
        if (fechaDesde)
            query = query.gte('asientos_contables.fecha', fechaDesde);
        if (fechaHasta)
            query = query.lte('asientos_contables.fecha', fechaHasta);
        const { data, error } = await query;
        if (error)
            throw error;
        return data || [];
    }
    clasificarTipoCosto(codigoCuenta) {
        if (codigoCuenta.startsWith('60'))
            return 'Compras';
        if (codigoCuenta.startsWith('61'))
            return 'Variación de existencias';
        if (codigoCuenta.startsWith('62'))
            return 'Gastos de personal';
        if (codigoCuenta.startsWith('63'))
            return 'Gastos de servicios';
        if (codigoCuenta.startsWith('64'))
            return 'Gastos por tributos';
        if (codigoCuenta.startsWith('65'))
            return 'Otros gastos de gestión';
        if (codigoCuenta.startsWith('66'))
            return 'Pérdida por medición';
        if (codigoCuenta.startsWith('67'))
            return 'Gastos financieros';
        if (codigoCuenta.startsWith('68'))
            return 'Valuación y deterioro';
        if (codigoCuenta.startsWith('69'))
            return 'Costo de ventas';
        return 'Otros costos';
    }
    formatearPeriodo(fechaDesde, fechaHasta) {
        if (fechaDesde && fechaHasta)
            return `${fechaDesde} al ${fechaHasta}`;
        if (fechaDesde)
            return `Desde ${fechaDesde}`;
        if (fechaHasta)
            return `Hasta ${fechaHasta}`;
        return 'Todos los períodos';
    }
    extraerPeriodo(fecha) {
        return fecha.substring(0, 7);
    }
};
exports.AccountingReportsService = AccountingReportsService;
exports.AccountingReportsService = AccountingReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], AccountingReportsService);
//# sourceMappingURL=accounting-reports.service.js.map