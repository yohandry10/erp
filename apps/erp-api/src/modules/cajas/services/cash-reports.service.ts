import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CashMovementsService, TipoMovimiento } from './cash-movements.service';
import { CashReconciliationService } from './cash-reconciliation.service';
import PDFDocument from 'pdfkit';
import * as crypto from 'crypto';

export interface ResumenFiscal {
    base_imponible: number;
    igv: number;
    total: number;
    cantidad_boletas: number;
    cantidad_facturas: number;
    cantidad_notas_credito: number;
}

export interface ResumenPorMetodoPago {
    efectivo: number;
    tarjeta: number;
    transferencia: number;
    otros: number;
    cantidad_efectivo: number;
    cantidad_tarjeta: number;
    cantidad_transferencia: number;
    cantidad_otros: number;
}

export interface DatosReporteCierre {
    sesion: any;
    movimientos: any[];
    retiros: any[];
    cambios_turno: any[];
    resumen_fiscal: ResumenFiscal;
    resumen_metodos_pago: ResumenPorMetodoPago;
    totales_por_tipo: Record<string, number>;
}

const POS_CUENTAS_RUNTIME: Record<string, { nombre: string; tipo: string; nivel: number }> = {
    '10111': { nombre: 'Caja operativa POS', tipo: 'ACTIVO', nivel: 5 },
    '10411': { nombre: 'Bancos - abonos por tarjeta POS', tipo: 'ACTIVO', nivel: 5 },
    '10412': { nombre: 'Bancos - transferencias billeteras digitales POS', tipo: 'ACTIVO', nivel: 5 },
    '40111': { nombre: 'IGV por pagar', tipo: 'PASIVO', nivel: 5 },
    '7011': { nombre: 'Ventas de mercaderias POS', tipo: 'INGRESO', nivel: 4 },
};

/**
 * Servicio para generación de reportes de caja
 * 
 * Responsabilidades:
 * - Generar reporte de cierre de caja en formato estructurado
 * - Calcular resúmenes fiscales (IGV, base imponible)
 * - Desglosar ventas por método de pago
 * - Incluir denominaciones de apertura y cierre
 * - Generar PDF con formato profesional (futuro)
 * - Incluir QR de verificación de integridad
 * - Exportar a múltiples formatos (JSON, PDF, Excel)
 */
@Injectable()
export class CashReportsService {
    private readonly logger = new Logger(CashReportsService.name);

    // Tasa de IGV en Perú
    private readonly TASA_IGV = 0.18;

    constructor(
        private readonly supabase: SupabaseService,
        private readonly movementsService: CashMovementsService,
        private readonly reconciliationService: CashReconciliationService,
    ) { }

    private currencyContext(moneda: unknown) {
        const currency = String(moneda || 'PEN').toUpperCase();
        return {
            currency,
            locale: currency === 'ARS' ? 'es-AR' : currency === 'COP' ? 'es-CO' : 'es-PE',
            taxLabel: currency === 'PEN' ? 'IGV (18%)' : currency === 'COP' ? 'IVA (19%)' : 'IVA',
            documentLabel: currency === 'PEN' ? 'Boletas' : currency === 'COP' ? 'Documentos equivalentes' : 'Comprobantes',
        };
    }

    private buildDeterministicUuid(input: string): string {
        const hash = crypto.createHash('sha256').update(input).digest('hex');
        const bytes = hash.slice(0, 32).split('');

        bytes[12] = '5';
        bytes[16] = ((parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);

        return [
            bytes.slice(0, 8).join(''),
            bytes.slice(8, 12).join(''),
            bytes.slice(12, 16).join(''),
            bytes.slice(16, 20).join(''),
            bytes.slice(20, 32).join(''),
        ].join('-');
    }

    /**
     * Obtiene todos los datos necesarios para generar un reporte de cierre
     */
    async obtenerDatosReporteCierre(
        sesionId: string,
        tenantId: string,
    ): Promise<DatosReporteCierre> {
        this.logger.log(`Obteniendo datos para reporte de cierre: sesión=${sesionId}`);

        // Obtener sesión completa
        const { data: sesion, error: sesionError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('*, cajas(nombre, codigo, ubicacion)')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (sesionError || !sesion) {
            throw new NotFoundException('Sesión no encontrada');
        }

        // Obtener movimientos
        const movimientos = await this.movementsService.obtenerMovimientos(sesionId, tenantId);

        // Obtener retiros
        const { data: retiros } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .select('*')
            .eq('sesion_caja_id', sesionId)
            .eq('tenant_id', tenantId);

        // Obtener cambios de turno
        const { data: cambiosTurno } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .select('*')
            .eq('sesion_caja_id', sesionId)
            .eq('tenant_id', tenantId);

        // Calcular resumen fiscal
        const resumenFiscal = await this.calcularResumenFiscal(sesionId, tenantId);

        // Calcular resumen por método de pago
        const resumenMetodosPago = await this.calcularResumenPorMetodoPago(sesionId, tenantId);

        // Calcular totales por tipo de movimiento
        const totalesPorTipo: Record<string, number> = {};
        movimientos.forEach((m) => {
            if (!totalesPorTipo[m.tipo_movimiento]) {
                totalesPorTipo[m.tipo_movimiento] = 0;
            }
            totalesPorTipo[m.tipo_movimiento] += m.monto;
        });

        return {
            sesion,
            movimientos,
            retiros: retiros || [],
            cambios_turno: cambiosTurno || [],
            resumen_fiscal: resumenFiscal,
            resumen_metodos_pago: resumenMetodosPago,
            totales_por_tipo: totalesPorTipo,
        };
    }

    /**
     * Calcula el resumen fiscal de todas las ventas de la sesión
     */
    async calcularResumenFiscal(sesionId: string, tenantId: string): Promise<ResumenFiscal> {
        const { data: ventas, error } = await this.supabase
            .getClient()
            .from('ventas_pos')
            .select('subtotal, impuestos, total, numero_ticket')
            .eq('sesion_caja_id', sesionId)
            .eq('tenant_id', tenantId);

        if (error) {
            this.logger.error(`Error obteniendo ventas para resumen fiscal: ${error.message}`);
            throw new BadRequestException('Error calculando resumen fiscal');
        }

        const ventasArray = ventas || [];

        // Calcular totales
        const baseImponible = ventasArray.reduce((sum, v) => sum + (v.subtotal || 0), 0);
        const igv = ventasArray.reduce((sum, v) => sum + (v.impuestos || 0), 0);
        const total = ventasArray.reduce((sum, v) => sum + (v.total || 0), 0);

        // Contar documentos (asumiendo que tickets con B son boletas, F son facturas)
        const cantidadBoletas = ventasArray.filter((v) =>
            v.numero_ticket && v.numero_ticket.startsWith('B')
        ).length;

        const cantidadFacturas = ventasArray.filter((v) =>
            v.numero_ticket && v.numero_ticket.startsWith('F')
        ).length;

        const cantidadNotasCredito = ventasArray.filter((v) =>
            v.numero_ticket && v.numero_ticket.startsWith('NC')
        ).length;

        return {
            base_imponible: baseImponible,
            igv,
            total,
            cantidad_boletas: cantidadBoletas,
            cantidad_facturas: cantidadFacturas,
            cantidad_notas_credito: cantidadNotasCredito,
        };
    }

    /**
     * Calcula el resumen de ventas por método de pago
     */
    async calcularResumenPorMetodoPago(
        sesionId: string,
        tenantId: string,
    ): Promise<ResumenPorMetodoPago> {
        const resumen: ResumenPorMetodoPago = {
            efectivo: 0,
            tarjeta: 0,
            transferencia: 0,
            otros: 0,
            cantidad_efectivo: 0,
            cantidad_tarjeta: 0,
            cantidad_transferencia: 0,
            cantidad_otros: 0,
        };

        const { data: pagos, error } = await this.supabase
            .getClient()
            .from('ventas_pos_pagos')
            .select('monto, metodo_pago_tipo, metodo_pago_codigo, ventas_pos!inner(sesion_caja_id)')
            .eq('ventas_pos.sesion_caja_id', sesionId)
            .eq('tenant_id', tenantId);

        if (error) {
            this.logger.error(`Error obteniendo pagos por método: ${error.message}`);
            throw new BadRequestException('Error calculando resumen por método de pago');
        }

        const pagosArray = pagos || [];

        pagosArray.forEach((p: any) => {
            const metodo = (p.metodo_pago_tipo || p.metodo_pago_codigo || 'EFECTIVO').toString().toUpperCase();
            const monto = p.monto || 0;

            switch (metodo) {
                case 'EFECTIVO':
                case 'CASH':
                    resumen.efectivo += monto;
                    resumen.cantidad_efectivo++;
                    break;
                case 'TARJETA':
                case 'CARD':
                case 'VISA':
                case 'MASTERCARD':
                    resumen.tarjeta += monto;
                    resumen.cantidad_tarjeta++;
                    break;
                case 'TRANSFERENCIA':
                case 'TRANSFER':
                case 'YAPE':
                case 'PLIN':
                case 'DIGITAL':
                    resumen.transferencia += monto;
                    resumen.cantidad_transferencia++;
                    break;
                default:
                    resumen.otros += monto;
                    resumen.cantidad_otros++;
            }
        });

        return resumen;
    }

    /**
     * Genera un reporte de cierre en formato JSON estructurado
     */
    async generarReporteCierreJSON(sesionId: string, tenantId: string): Promise<any> {
        const datos = await this.obtenerDatosReporteCierre(sesionId, tenantId);

        return {
            metadata: {
                tipo_reporte: 'CIERRE_CAJA',
                version: '1.0',
                generado_en: new Date().toISOString(),
                sesion_id: sesionId,
            },
            sesion: {
                id: datos.sesion.id,
                caja: datos.sesion.cajas,
                hora_apertura: datos.sesion.hora_apertura,
                hora_cierre: datos.sesion.hora_cierre,
                cajero_apertura: datos.sesion.abierto_por,
                cajero_cierre: datos.sesion.cerrado_por,
                monto_inicio: datos.sesion.monto_inicio,
                monto_esperado: datos.sesion.monto_esperado,
                monto_contado: datos.sesion.monto_contado,
                diferencia: datos.sesion.diferencia,
                hash_integridad: datos.sesion.hash_integridad,
            },
            denominaciones: {
                apertura: datos.sesion.denominaciones_apertura,
                cierre: datos.sesion.denominaciones_cierre,
            },
            resumen_operacional: {
                total_movimientos: datos.movimientos.length,
                total_retiros: datos.retiros.length,
                total_cambios_turno: datos.cambios_turno.length,
                totales_por_tipo: datos.totales_por_tipo,
            },
            resumen_ventas: {
                fiscal: datos.resumen_fiscal,
                metodos_pago: datos.resumen_metodos_pago,
            },
            movimientos: datos.movimientos.map((m) => ({
                secuencia: m.secuencia,
                tipo: m.tipo_movimiento,
                monto: m.monto,
                saldo: m.saldo_nuevo,
                timestamp: m.timestamp,
                referencia: m.referencia_documento,
            })),
            retiros: datos.retiros.map((r) => ({
                monto: r.monto,
                motivo: r.motivo,
                estado_conciliacion: r.estado_conciliacion,
                banco_destino: r.banco_destino,
                numero_operacion: r.numero_operacion,
            })),
            cambios_turno: datos.cambios_turno.map((ct) => ({
                usuario_saliente: ct.usuario_saliente_id,
                usuario_entrante: ct.usuario_entrante_id,
                diferencia: ct.diferencia,
                timestamp: ct.timestamp_inicio,
            })),
        };
    }

    /**
     * Genera un reporte de cierre en formato texto plano (para impresión térmica)
     */
    async generarReporteCierreTexto(sesionId: string, tenantId: string): Promise<string> {
        const datos = await this.obtenerDatosReporteCierre(sesionId, tenantId);
        const lineas: string[] = [];
        const fiscal = this.currencyContext(datos.sesion.moneda);

        // Encabezado
        lineas.push('='.repeat(48));
        lineas.push(' REPORTE DE CIERRE DE CAJA'.padStart(36));
        lineas.push('='.repeat(48));
        lineas.push('');

        // Información de sesión
        lineas.push(`Caja: ${datos.sesion.cajas?.nombre || 'N/A'}`);
        lineas.push(`Código: ${datos.sesion.cajas?.codigo || 'N/A'}`);
        lineas.push(`Ubicación: ${datos.sesion.cajas?.ubicacion || 'N/A'}`);
        lineas.push(`Sesión ID: ${datos.sesion.id}`);
        lineas.push('');

        // Fechas
        lineas.push(`Apertura: ${new Date(datos.sesion.hora_apertura).toLocaleString(fiscal.locale)}`);
        if (datos.sesion.hora_cierre) {
            lineas.push(`Cierre: ${new Date(datos.sesion.hora_cierre).toLocaleString(fiscal.locale)}`);
        }
        lineas.push('');

        // Sección 1: APERTURA
        lineas.push('-'.repeat(48));
        lineas.push('1. APERTURA');
        lineas.push('-'.repeat(48));
        lineas.push(`Monto inicial: ${fiscal.currency} ${datos.sesion.monto_inicio.toFixed(2)}`);
        if (datos.sesion.denominaciones_apertura) {
            lineas.push('');
            lineas.push('Denominaciones de apertura:');
            lineas.push(this.reconciliationService.generarResumenDenominaciones(datos.sesion.denominaciones_apertura, fiscal.currency));
        }
        lineas.push('');

        // Sección 2: MOVIMIENTOS DEL TURNO
        lineas.push('-'.repeat(48));
        lineas.push('2. MOVIMIENTOS DEL TURNO');
        lineas.push('-'.repeat(48));
        Object.entries(datos.totales_por_tipo).forEach(([tipo, total]) => {
            const cantidad = datos.movimientos.filter((m) => m.tipo_movimiento === tipo).length;
            lineas.push(`${tipo}: ${fiscal.currency} ${total.toFixed(2)} (${cantidad} mov.)`);
        });
        lineas.push('');
        lineas.push(`Total movimientos: ${datos.movimientos.length}`);
        lineas.push('');

        // Sección 3: VENTAS POR MÉTODO DE PAGO
        lineas.push('-'.repeat(48));
        lineas.push('3. VENTAS POR MÉTODO DE PAGO');
        lineas.push('-'.repeat(48));
        const mp = datos.resumen_metodos_pago;
        lineas.push(`Efectivo: ${fiscal.currency} ${mp.efectivo.toFixed(2)} (${mp.cantidad_efectivo} ventas)`);
        lineas.push(`Tarjeta: ${fiscal.currency} ${mp.tarjeta.toFixed(2)} (${mp.cantidad_tarjeta} ventas)`);
        lineas.push(`Transferencia: ${fiscal.currency} ${mp.transferencia.toFixed(2)} (${mp.cantidad_transferencia} ventas)`);
        if (mp.otros > 0) {
            lineas.push(`Otros: ${fiscal.currency} ${mp.otros.toFixed(2)} (${mp.cantidad_otros} ventas)`);
        }
        lineas.push('');

        // Sección 4: RETIROS
        if (datos.retiros.length > 0) {
            lineas.push('-'.repeat(48));
            lineas.push('4. RETIROS DE EFECTIVO');
            lineas.push('-'.repeat(48));
            datos.retiros.forEach((r, i) => {
                lineas.push(`${i + 1}. ${fiscal.currency} ${r.monto.toFixed(2)} - ${r.motivo}`);
                if (r.numero_operacion) {
                    lineas.push(`   Op. ${r.numero_operacion} - ${r.estado_conciliacion}`);
                }
            });
            const totalRetiros = datos.retiros.reduce((sum, r) => sum + r.monto, 0);
            lineas.push(`Total retiros: ${fiscal.currency} ${totalRetiros.toFixed(2)}`);
            lineas.push('');
        }

        // Sección 5: ARQUEO FINAL
        if (datos.sesion.estado === 'CERRADA') {
            lineas.push('-'.repeat(48));
            lineas.push('5. ARQUEO FINAL');
            lineas.push('-'.repeat(48));
            lineas.push(`Saldo teórico: ${fiscal.currency} ${Number(datos.sesion.monto_esperado ?? 0).toFixed(2)}`);

            // Un cierre administrativo no cuenta el efectivo. El trigger de
            // normalización guarda contado 0 y deriva la diferencia, así que
            // imprimir esos números afirmaría un arqueo que nunca se hizo.
            if (datos.sesion.cierre_administrativo) {
                lineas.push('Saldo contado: sin arqueo (cierre administrativo)');
                lineas.push('Diferencia: no verificada');
                if (datos.sesion.razon_cierre_administrativo) {
                    lineas.push(`Motivo: ${datos.sesion.razon_cierre_administrativo}`);
                }
            } else {
                lineas.push(`Saldo contado: ${fiscal.currency} ${Number(datos.sesion.monto_contado ?? 0).toFixed(2)}`);
                lineas.push(`Diferencia: ${fiscal.currency} ${Number(datos.sesion.diferencia ?? 0).toFixed(2)}`);
            }

            if (datos.sesion.denominaciones_cierre) {
                lineas.push('');
                lineas.push('Denominaciones de cierre:');
                lineas.push(this.reconciliationService.generarResumenDenominaciones(datos.sesion.denominaciones_cierre, fiscal.currency));
            }
            lineas.push('');
        }

        // Sección 6: RESUMEN FISCAL
        lineas.push('-'.repeat(48));
        lineas.push('6. RESUMEN FISCAL');
        lineas.push('-'.repeat(48));
        const rf = datos.resumen_fiscal;
        lineas.push(`Base imponible: ${fiscal.currency} ${rf.base_imponible.toFixed(2)}`);
        lineas.push(`${fiscal.taxLabel}: ${fiscal.currency} ${rf.igv.toFixed(2)}`);
        lineas.push(`Total: ${fiscal.currency} ${rf.total.toFixed(2)}`);
        lineas.push('');
        lineas.push(`${fiscal.documentLabel} emitidos: ${rf.cantidad_boletas}`);
        lineas.push(`Facturas emitidas: ${rf.cantidad_facturas}`);
        if (rf.cantidad_notas_credito > 0) {
            lineas.push(`Notas de crédito: ${rf.cantidad_notas_credito}`);
        }
        lineas.push('');

        // Firmas
        lineas.push('='.repeat(48));
        lineas.push('');
        lineas.push('_______________________  _______________________');
        lineas.push('   Firma del Cajero         Firma del Supervisor');
        lineas.push('');

        // Hash de integridad
        if (datos.sesion.hash_integridad) {
            lineas.push(`Hash: ${datos.sesion.hash_integridad.substring(0, 32)}...`);
        }

        lineas.push('');
        lineas.push(`Generado: ${new Date().toLocaleString('es-PE')}`);
        lineas.push('='.repeat(48));

        return lineas.join('\n');
    }

    /**
     * Genera un reporte consolidado de ventas diarias
     */
    async generarReporteConsolidadoDiario(
        fecha: string,
        tenantId: string,
    ): Promise<any> {
        const fechaInicio = new Date(fecha);
        fechaInicio.setHours(0, 0, 0, 0);

        const fechaFin = new Date(fecha);
        fechaFin.setHours(23, 59, 59, 999);

        const { data: sesiones } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('hora_apertura', fechaInicio.toISOString())
            .lte('hora_apertura', fechaFin.toISOString());

        const sesionesCerradas = (sesiones || []).filter((s) => s.estado === 'CERRADA');

        const totalVentas = sesionesCerradas.reduce((sum, s) => sum + (s.monto_esperado - s.monto_inicio || 0), 0);
        const totalDiferencias = sesionesCerradas.reduce((sum, s) => sum + (s.diferencia || 0), 0);

        return {
            fecha,
            total_sesiones: sesiones?.length || 0,
            sesiones_cerradas: sesionesCerradas.length,
            total_ventas: totalVentas,
            total_diferencias: totalDiferencias,
            sesiones: sesionesCerradas.map((s) => ({
                id: s.id,
                caja_id: s.caja_id,
                hora_apertura: s.hora_apertura,
                hora_cierre: s.hora_cierre,
                diferencia: s.diferencia,
            })),
        };
    }

    /**
     * Q23: Genera un reporte de cierre en formato PDF profesional
     * Incluye:
     * - Encabezado con datos de la empresa y caja
     * - Resumen de apertura con denominaciones
     * - Movimientos del turno por tipo
     * - Ventas por método de pago
     * - Retiros con motivos
     * - Arqueo final con diferencias
     * - Resumen fiscal (IGV, base imponible)
     * - Espacio para firmas
     * - QR de verificación de integridad
     */
    async generarReporteCierrePDF(sesionId: string, tenantId: string): Promise<Buffer> {
        this.logger.log(`📄 Generando PDF de cierre para sesión: ${sesionId}`);

        const datos = await this.obtenerDatosReporteCierre(sesionId, tenantId);
        const fiscal = this.currencyContext(datos.sesion.moneda);

        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50,
                    info: {
                        Title: `Reporte de Cierre - ${datos.sesion.cajas?.nombre || 'Caja'}`,
                        Author: 'ERP Suite',
                        Subject: 'Reporte de Cierre de Caja',
                    },
                });

                const chunks: Buffer[] = [];
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // Colores corporativos
                const colorPrimario = '#1a365d';
                const colorSecundario = '#2d3748';
                const colorAccento = '#3182ce';

                // ========== ENCABEZADO ==========
                doc.fontSize(20)
                    .fillColor(colorPrimario)
                    .text('REPORTE DE CIERRE DE CAJA', { align: 'center' });

                doc.moveDown(0.5);
                doc.fontSize(10)
                    .fillColor(colorSecundario)
                    .text(`Caja: ${datos.sesion.cajas?.nombre || 'N/A'} | Código: ${datos.sesion.cajas?.codigo || 'N/A'}`, { align: 'center' });

                doc.moveDown(0.3);
                doc.text(`Sesión ID: ${sesionId.substring(0, 8)}...`, { align: 'center' });

                // Línea separadora
                doc.moveDown(0.5);
                doc.strokeColor(colorAccento).lineWidth(2)
                    .moveTo(50, doc.y).lineTo(545, doc.y).stroke();

                // ========== INFORMACIÓN DE SESIÓN ==========
                doc.moveDown(1);
                this.addSectionTitle(doc, '1. INFORMACIÓN DE SESIÓN', colorPrimario);

                const infoY = doc.y;
                doc.fontSize(10).fillColor(colorSecundario);

                // Columna izquierda
                doc.text(`Apertura: ${new Date(datos.sesion.hora_apertura).toLocaleString(fiscal.locale)}`, 50, infoY);
                doc.text(`Cajero apertura: ${datos.sesion.abierto_por || 'N/A'}`, 50);
                doc.text(`Monto inicial: ${fiscal.currency} ${datos.sesion.monto_inicio?.toFixed(2) || '0.00'}`, 50);

                // Columna derecha
                doc.text(`Cierre: ${datos.sesion.hora_cierre ? new Date(datos.sesion.hora_cierre).toLocaleString(fiscal.locale) : 'En curso'}`, 300, infoY);
                doc.text(`Cajero cierre: ${datos.sesion.cerrado_por || 'N/A'}`, 300);
                doc.text(`Dispositivo: ${datos.sesion.dispositivo || 'N/A'}`, 300);

                // ========== MOVIMIENTOS DEL TURNO ==========
                doc.moveDown(2);
                this.addSectionTitle(doc, '2. MOVIMIENTOS DEL TURNO', colorPrimario);

                const tiposMovimiento = Object.entries(datos.totales_por_tipo);
                if (tiposMovimiento.length > 0) {
                    this.addTable(doc, 
                        ['Tipo', 'Cantidad', 'Monto'],
                        tiposMovimiento.map(([tipo, total]) => {
                            const cantidad = datos.movimientos.filter((m) => m.tipo_movimiento === tipo).length;
                            return [tipo, cantidad.toString(), `${fiscal.currency} ${(total as number).toFixed(2)}`];
                        }),
                        colorAccento
                    );
                } else {
                    doc.fontSize(10).fillColor('#666').text('Sin movimientos registrados', { align: 'center' });
                }

                // ========== VENTAS POR MÉTODO DE PAGO ==========
                doc.moveDown(1);
                this.addSectionTitle(doc, '3. VENTAS POR MÉTODO DE PAGO', colorPrimario);

                const mp = datos.resumen_metodos_pago;
                this.addTable(doc,
                    ['Método', 'Cantidad', 'Monto'],
                    [
                        ['Efectivo', mp.cantidad_efectivo.toString(), `${fiscal.currency} ${mp.efectivo.toFixed(2)}`],
                        ['Tarjeta', mp.cantidad_tarjeta.toString(), `${fiscal.currency} ${mp.tarjeta.toFixed(2)}`],
                        ['Transferencia', mp.cantidad_transferencia.toString(), `${fiscal.currency} ${mp.transferencia.toFixed(2)}`],
                        ['Otros', mp.cantidad_otros.toString(), `${fiscal.currency} ${mp.otros.toFixed(2)}`],
                    ],
                    colorAccento
                );

                // ========== RETIROS ==========
                if (datos.retiros.length > 0) {
                    doc.moveDown(1);
                    this.addSectionTitle(doc, '4. RETIROS DE EFECTIVO', colorPrimario);

                    this.addTable(doc,
                        ['Monto', 'Motivo', 'Estado', 'Operación'],
                        datos.retiros.map((r) => [
                            `${fiscal.currency} ${r.monto.toFixed(2)}`,
                            r.motivo,
                            r.estado_conciliacion,
                            r.numero_operacion || '-',
                        ]),
                        colorAccento
                    );
                }

                // ========== ARQUEO FINAL ==========
                if (datos.sesion.estado === 'CERRADA') {
                    doc.moveDown(1);
                    this.addSectionTitle(doc, '5. ARQUEO FINAL', colorPrimario);

                    doc.fontSize(11).fillColor(colorSecundario);
                    doc.text(`Saldo teórico: ${fiscal.currency} ${datos.sesion.monto_esperado?.toFixed(2) || '0.00'}`);
                    doc.text(`Saldo contado: ${fiscal.currency} ${datos.sesion.monto_contado?.toFixed(2) || '0.00'}`);

                    const diferencia = datos.sesion.diferencia || 0;
                    const colorDiferencia = diferencia === 0 ? '#38a169' : (diferencia > 0 ? '#3182ce' : '#e53e3e');
                    doc.fillColor(colorDiferencia)
                        .text(`Diferencia: ${fiscal.currency} ${diferencia.toFixed(2)} ${diferencia > 0 ? '(Sobrante)' : diferencia < 0 ? '(Faltante)' : '(Cuadrado)'}`);
                }

                // ========== RESUMEN FISCAL ==========
                doc.moveDown(1);
                this.addSectionTitle(doc, '6. RESUMEN FISCAL', colorPrimario);

                const rf = datos.resumen_fiscal;
                doc.fontSize(10).fillColor(colorSecundario);
                doc.text(`Base imponible: ${fiscal.currency} ${rf.base_imponible.toFixed(2)}`);
                doc.text(`${fiscal.taxLabel}: ${fiscal.currency} ${rf.igv.toFixed(2)}`);
                doc.fontSize(12).fillColor(colorPrimario)
                    .text(`TOTAL: ${fiscal.currency} ${rf.total.toFixed(2)}`);

                doc.moveDown(0.5);
                doc.fontSize(10).fillColor(colorSecundario);
                doc.text(`${fiscal.documentLabel}: ${rf.cantidad_boletas} | Facturas: ${rf.cantidad_facturas} | NC: ${rf.cantidad_notas_credito}`);

                // ========== FIRMAS ==========
                doc.moveDown(2);
                doc.strokeColor('#ccc').lineWidth(1);

                // Línea firma cajero
                doc.moveTo(50, doc.y + 30).lineTo(200, doc.y + 30).stroke();
                doc.fontSize(9).fillColor('#666')
                    .text('Firma del Cajero', 50, doc.y + 35, { width: 150, align: 'center' });

                // Línea firma supervisor
                doc.moveTo(350, doc.y - 5).lineTo(500, doc.y - 5).stroke();
                doc.text('Firma del Supervisor', 350, doc.y, { width: 150, align: 'center' });

                // ========== PIE DE PÁGINA ==========
                doc.moveDown(2);
                doc.strokeColor(colorAccento).lineWidth(1)
                    .moveTo(50, doc.y).lineTo(545, doc.y).stroke();

                doc.moveDown(0.5);
                doc.fontSize(8).fillColor('#999');

                // Hash de integridad
                if (datos.sesion.hash_integridad) {
                    doc.text(`Hash de integridad: ${datos.sesion.hash_integridad}`, { align: 'center' });
                }

                // QR de verificación (representado como texto por ahora)
                const qrData = this.generarDatosQR(datos);
                doc.text(`Código de verificación: ${qrData.substring(0, 32)}...`, { align: 'center' });

                doc.moveDown(0.5);
                doc.text(`Generado: ${new Date().toLocaleString('es-PE')} | ERP Suite v1.0`, { align: 'center' });

                doc.end();
            } catch (error) {
                this.logger.error(`Error generando PDF: ${error.message}`);
                reject(error);
            }
        });
    }

    /**
     * Registra un corte (corte Z) persistiendo el resumen de la sesión en la tabla cortes_caja.
     */
    async registrarCorte(tenantId: string, sesionId: string) {
        const datos = await this.obtenerDatosReporteCierre(sesionId, tenantId);
        const resumenFiscal = datos.resumen_fiscal || {
            base_imponible: 0,
            igv: 0,
            total: 0,
            cantidad_boletas: 0,
            cantidad_facturas: 0,
            cantidad_notas_credito: 0,
        };
        const resumenMetodosPago = datos.resumen_metodos_pago || {
            efectivo: 0,
            tarjeta: 0,
            transferencia: 0,
            otros: 0,
            cantidad_efectivo: 0,
            cantidad_tarjeta: 0,
            cantidad_transferencia: 0,
            cantidad_otros: 0,
        };

        const totalDocumentos =
            (resumenFiscal.cantidad_boletas || 0) +
            (resumenFiscal.cantidad_facturas || 0) +
            (resumenFiscal.cantidad_notas_credito || 0);

        const payload = {
            tenant_id: tenantId,
            sesion_caja_id: sesionId,
            caja_id: datos.sesion.caja_id ?? datos.sesion.caja,
            fecha_corte: new Date().toISOString(),
            cajero_id: datos.sesion.cajero_id ?? datos.sesion.abierto_por ?? datos.sesion.usuario_id ?? null,
            moneda: datos.sesion.moneda ?? 'PEN',
            total_ventas: resumenFiscal.total ?? 0,
            total_impuestos: resumenFiscal.igv ?? 0,
            total_neto: (resumenFiscal.total ?? 0) - (resumenFiscal.igv ?? 0),
            total_documentos: totalDocumentos,
            resumen_metodos_pago: resumenMetodosPago,
            resumen_fiscal: resumenFiscal,
            integridad_hash: datos.sesion.hash_integridad ?? null,
        };

        const { error } = await this.supabase
            .getClient()
            .from('cortes_caja')
            .insert([payload]);

        if (error) {
            this.logger.error(`No se pudo registrar corte de caja: ${error.message}`);
            throw error;
        }

        this.logger.log(`✅ Corte de caja registrado para sesión ${sesionId}`);
        return payload;
    }

    /**
     * Genera y registra un asiento contable de cierre de caja (ventas del día/turno).
     * Mapas por defecto:
     *   - Efectivo -> 10111 (Caja)
     *   - Tarjeta  -> 10411 (Bancos - tarjeta)
     *   - Transferencia/Yape/Plin -> 10412
     *   - Ventas  -> 7011
     *   - IGV por pagar -> 40111
     */
    async registrarAsientoCierre(tenantId: string, sesionId: string) {
        // Rediseño contable (modelo elegido 2026-07-24): cada venta POS contabiliza su
        // ingreso al contado en el asiento POR-VENTA (Dr Caja/Bancos / Cr Ventas + IGV).
        // El cierre de caja NO debe generar un asiento de ingreso: solo reconcilia el
        // efectivo físico. Generarlo aquí DUPLICARÍA ingresos e IGV en el mayor.
        this.logger.log(
            `ℹ️ [Cierre POS] Sesión ${sesionId}: el ingreso ya se contabiliza por-venta; ` +
            'el cierre solo reconcilia efectivo, no se genera asiento de ingreso.',
        );
        return null;

        // eslint-disable-next-line no-unreachable
        const datos = await this.obtenerDatosReporteCierre(sesionId, tenantId);
        const resumenFiscal = datos.resumen_fiscal || { base_imponible: 0, igv: 0, total: 0 };
        const mp = datos.resumen_metodos_pago || {
            efectivo: 0,
            tarjeta: 0,
            transferencia: 0,
            otros: 0,
            cantidad_efectivo: 0,
            cantidad_tarjeta: 0,
            cantidad_transferencia: 0,
            cantidad_otros: 0,
        };

        const codigos = ['10111', '10411', '10412', '7011', '40111'];
        const cuentas = await this.obtenerCuentasPorCodigo(tenantId, codigos);

        const detalles: { cuenta_codigo: string; debe: number; haber: number }[] = [];

        if (mp.efectivo > 0) detalles.push({ cuenta_codigo: '10111', debe: mp.efectivo, haber: 0 });
        if (mp.tarjeta > 0) detalles.push({ cuenta_codigo: '10411', debe: mp.tarjeta, haber: 0 });
        if (mp.transferencia > 0 || mp.otros > 0) {
            const totalTransfer = (mp.transferencia || 0) + (mp.otros || 0);
            detalles.push({ cuenta_codigo: '10412', debe: totalTransfer, haber: 0 });
        }

        const base = resumenFiscal.base_imponible ?? 0;
        const igv = resumenFiscal.igv ?? 0;
        const totalHaber = base + igv;
        detalles.push({ cuenta_codigo: '7011', debe: 0, haber: base });
        if (igv > 0) detalles.push({ cuenta_codigo: '40111', debe: 0, haber: igv });

        let totalDebe = detalles.reduce((sum, d) => sum + d.debe, 0);
        const diff = totalHaber - totalDebe;
        if (Math.abs(diff) > 0.01) {
            // Ajuste menor al primer débito disponible
            const debito = detalles.find((d) => d.debe > 0);
            if (debito) {
                debito.debe = Number((debito.debe + diff).toFixed(2));
                totalDebe += diff;
            }
        }

        const asientoConcepto = `Cierre diario/turno POS - sesión ${sesionId}`;
        const referencia = `SESION:${sesionId}`;
        const sourceEventId = this.buildDeterministicUuid(`caja.cierre:${sesionId}`);

        const { data: asientoExistente, error: asientoExistenteError } = await this.supabase
            .getClient()
            .from('asientos_contables')
            .select('id, numero_asiento, codigo')
            .eq('tenant_id', tenantId)
            .eq('source_event_id', sourceEventId)
            .maybeSingle();

        if (asientoExistenteError) {
            this.logger.error(`No se pudo validar asiento de cierre existente: ${asientoExistenteError.message}`);
            throw asientoExistenteError;
        }

        if (asientoExistente?.id) {
            this.logger.log(
                `♻️ Asiento de cierre POS ya registrado (${asientoExistente.codigo ?? asientoExistente.numero_asiento ?? asientoExistente.id}) para sesión ${sesionId}`,
            );
            return asientoExistente;
        }

        const asientoPayload = {
            tenant_id: tenantId,
            fecha: new Date().toISOString().slice(0, 10),
            tipo_asiento: 'POS_CIERRE',
            origen: 'POS',
            concepto: asientoConcepto,
            referencia,
            total_debe: Number(totalDebe.toFixed(2)),
            total_haber: Number(totalHaber.toFixed(2)),
            // BORRADOR intencional: el asiento por-venta ya contabiliza el ingreso
            // (Dr CxC/Caja, Cr Ventas+IGV). Este cierre re-registra la venta en
            // cuentas POS (10111/7011/40111); confirmarlo DUPLICARÍA ingresos e
            // IGV en el mayor. Se deja en BORRADOR hasta rediseñar el flujo para
            // que solo exista UN registro de ingreso por venta POS.
            estado: 'BORRADOR',
            source_event_id: sourceEventId,
            usuario_id: datos.sesion.cajero_id ?? datos.sesion.abierto_por ?? null,
        };

        const { data: asiento, error: asientoError } = await this.supabase
            .getClient()
            .from('asientos_contables')
            .insert([asientoPayload])
            .select()
            .single();

        if (asientoError) {
            this.logger.error(`No se pudo registrar asiento de cierre: ${asientoError.message}`);
            throw asientoError;
        }

        const detallesInsert = detalles
            .map((d) => {
                const cuentaId = cuentas[d.cuenta_codigo];
                if (!cuentaId) {
                    this.logger.warn(`Cuenta ${d.cuenta_codigo} no encontrada; se omite en el asiento de cierre`);
                    return null;
                }
                return {
                    asiento_id: asiento.id,
                    cuenta_id: cuentaId,
                    debe: Number((d.debe || 0).toFixed(2)),
                    haber: Number((d.haber || 0).toFixed(2)),
                    concepto: asientoConcepto,
                };
            })
            .filter(Boolean) as any[];

        if (detallesInsert.length === 0) {
            this.logger.warn('No se insertaron detalles en el asiento de cierre (no hubo cuentas mapeadas)');
            return asiento;
        }

        const { error: detalleError } = await this.supabase
            .getClient()
            .from('detalle_asientos')
            .insert(detallesInsert);

        if (detalleError) {
            this.logger.error(`No se pudieron insertar detalles de cierre: ${detalleError.message}`);
            throw detalleError;
        }

        this.logger.log(
            `✅ Asiento de cierre registrado (${asiento.codigo ?? asiento.numero_asiento ?? asiento.id}) con ${detallesInsert.length} líneas`,
        );
        return asiento;
    }

    private async obtenerCuentasPorCodigo(tenantId: string, codigos: string[]): Promise<Record<string, string>> {
        const { data, error } = await this.supabase
            .getClient()
            .from('plan_cuentas')
            .select('id, codigo')
            .eq('tenant_id', tenantId)
            .in('codigo', codigos);

        if (error) {
            this.logger.error(`No se pudieron obtener cuentas contables: ${error.message}`);
            throw error;
        }

        const map: Record<string, string> = {};
        (data || []).forEach((pc: any) => {
            map[pc.codigo] = pc.id;
        });

        const faltantes = codigos.filter((codigo) => !map[codigo] && POS_CUENTAS_RUNTIME[codigo]);
        for (const codigo of faltantes) {
            const cuenta = POS_CUENTAS_RUNTIME[codigo];
            const { data: creada, error: createError } = await this.supabase
                .getClient()
                .from('plan_cuentas')
                .insert({
                    tenant_id: tenantId,
                    codigo,
                    nombre: cuenta.nombre,
                    tipo: cuenta.tipo,
                    tipo_cuenta: cuenta.tipo,
                    nivel: cuenta.nivel,
                    acepta_movimiento: true,
                    activo: true,
                    estado: 'ACTIVO',
                    metadata: {
                        source: 'runtime_pos_close_standard_account',
                    },
                })
                .select('id, codigo')
                .single();

            if (!createError && creada?.id) {
                map[codigo] = creada.id;
                continue;
            }

            if (createError?.code === '23505') {
                const { data: existente } = await this.supabase
                    .getClient()
                    .from('plan_cuentas')
                    .select('id, codigo')
                    .eq('tenant_id', tenantId)
                    .eq('codigo', codigo)
                    .maybeSingle();

                if (existente?.id) {
                    map[codigo] = existente.id;
                }
            }
        }
        return map;
    }

    /**
     * Agrega un título de sección al PDF
     */
    private addSectionTitle(doc: PDFKit.PDFDocument, title: string, color: string): void {
        doc.fontSize(12)
            .fillColor(color)
            .text(title, { underline: true });
        doc.moveDown(0.5);
    }

    /**
     * Genera CSV sencillo de un corte/sesión de caja.
     */
    async generarCorteCSV(sesionId: string, tenantId: string): Promise<string> {
        const datos = await this.obtenerDatosReporteCierre(sesionId, tenantId);
        const mp = datos.resumen_metodos_pago;
        const rf = datos.resumen_fiscal;

        const rows: string[][] = [];
        const push = (cols: (string | number | null | undefined)[]) =>
            rows.push(cols.map((c) => (c === undefined || c === null ? '' : String(c))));

        push(['SECCION', 'CAMPO', 'VALOR']);
        push(['SESION', 'ID', datos.sesion.id]);
        push(['SESION', 'CAJA', datos.sesion.cajas?.nombre || '']);
        push(['SESION', 'APERTURA', datos.sesion.hora_apertura]);
        push(['SESION', 'CIERRE', datos.sesion.hora_cierre || 'EN CURSO']);
        push(['SESION', 'MONEDA', datos.sesion.moneda || 'PEN']);
        push(['VENTAS', 'Base imponible', rf.base_imponible.toFixed(2)]);
        push(['VENTAS', 'IGV', rf.igv.toFixed(2)]);
        push(['VENTAS', 'Total', rf.total.toFixed(2)]);
        push(['VENTAS', 'Boletas', rf.cantidad_boletas]);
        push(['VENTAS', 'Facturas', rf.cantidad_facturas]);
        push(['VENTAS', 'Notas de crédito', rf.cantidad_notas_credito]);
        push(['METODO_PAGO', 'Efectivo', mp.efectivo.toFixed(2)]);
        push(['METODO_PAGO', 'Tarjeta', mp.tarjeta.toFixed(2)]);
        push(['METODO_PAGO', 'Transferencia', mp.transferencia.toFixed(2)]);
        push(['METODO_PAGO', 'Otros', mp.otros.toFixed(2)]);
        push(['METODO_PAGO', 'Cant Efectivo', mp.cantidad_efectivo]);
        push(['METODO_PAGO', 'Cant Tarjeta', mp.cantidad_tarjeta]);
        push(['METODO_PAGO', 'Cant Transferencia', mp.cantidad_transferencia]);
        push(['METODO_PAGO', 'Cant Otros', mp.cantidad_otros]);

        return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    }

    /**
     * Obtiene un corte ya persistido.
     */
    async obtenerCortePersistido(tenantId: string, corteId: string) {
        const { data, error } = await this.supabase
            .getClient()
            .from('cortes_caja')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', corteId)
            .single();
        if (error || !data) {
            throw new NotFoundException('Corte no encontrado');
        }
        return data;
    }

    /**
     * Agrega una tabla simple al PDF
     */
    private addTable(
        doc: PDFKit.PDFDocument,
        headers: string[],
        rows: string[][],
        headerColor: string,
    ): void {
        const startX = 50;
        const colWidth = 160;
        let y = doc.y;

        // Headers
        doc.fontSize(10).fillColor(headerColor);
        headers.forEach((header, i) => {
            doc.text(header, startX + (i * colWidth), y, { width: colWidth - 10 });
        });

        y = doc.y + 5;
        doc.strokeColor('#ddd').lineWidth(0.5)
            .moveTo(startX, y).lineTo(startX + (headers.length * colWidth), y).stroke();

        // Rows
        doc.fillColor('#333');
        rows.forEach((row) => {
            y = doc.y + 3;
            row.forEach((cell, i) => {
                doc.text(cell, startX + (i * colWidth), y, { width: colWidth - 10 });
            });
        });

        doc.moveDown(0.5);
    }

    /**
     * Genera datos para el código QR de verificación
     */
    private generarDatosQR(datos: DatosReporteCierre): string {
        const qrPayload = {
            sesion: datos.sesion.id,
            caja: datos.sesion.caja_id,
            fecha: datos.sesion.hora_cierre || datos.sesion.hora_apertura,
            total: datos.resumen_fiscal.total,
            hash: datos.sesion.hash_integridad,
        };

        // Generar hash del payload para verificación
        const hash = crypto.createHash('sha256')
            .update(JSON.stringify(qrPayload))
            .digest('hex');

        return hash;
    }
}
