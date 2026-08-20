import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

export interface Denominaciones {
    billetes: { [denominacion: number]: number }; // { 200: 5, 100: 10, 50: 2, ... }
    monedas: { [denominacion: number]: number };  // { 5: 20, 2: 50, 1: 100, ... }
}

export interface ResultadoValidacion {
    valido: boolean;
    total_calculado: number;
    diferencia: number;
    mensaje?: string;
}

export interface ResultadoCierre {
    valido: boolean;
    saldo_teorico: number;
    saldo_real: number;
    diferencia: number;
    tipo_diferencia: 'SOBRANTE' | 'FALTANTE' | 'CUADRADO';
    requiere_supervisor: boolean;
    requiere_justificacion: boolean;
}

/**
 * Servicio para reconciliación de efectivo y validación de denominaciones
 * 
 * Responsabilidades:
 * - Validar cuadre de denominaciones (billetes + monedas)
 * - Calcular totales automáticamente
 * - Aplicar tolerancia configurablpara diferencias
 * - Clasificar diferencias (sobrantes/faltantes)
 * - Determinar si requiere autorización de supervisor
 */
@Injectable()
export class CashReconciliationService {
    private readonly logger = new Logger(CashReconciliationService.name);

    private readonly DENOMINACIONES_VALIDAS: Record<string, Denominaciones> = {
        PEN: {
            billetes: { 200: 0, 100: 0, 50: 0, 20: 0, 10: 0 },
            monedas: { 5: 0, 2: 0, 1: 0, 0.5: 0, 0.2: 0, 0.1: 0 },
        },
        ARS: {
            billetes: { 20000: 0, 10000: 0, 2000: 0, 1000: 0, 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0 },
            monedas: { 10: 0, 5: 0, 2: 0, 1: 0, 0.5: 0, 0.25: 0, 0.1: 0, 0.05: 0, 0.01: 0 },
        },
        COP: {
            billetes: { 100000: 0, 50000: 0, 20000: 0, 10000: 0, 5000: 0, 2000: 0 },
            monedas: { 1000: 0, 500: 0, 200: 0, 100: 0, 50: 0 },
        },
    };

    constructor(private readonly supabase: SupabaseService) { }

    /**
     * Calcula el total de denominaciones (billetes + monedas)
     */
    calcularTotalDenominaciones(denominaciones: Denominaciones): number {
        let total = 0;

        // Sumar billetes
        if (denominaciones.billetes) {
            for (const [denom, cantidad] of Object.entries(denominaciones.billetes)) {
                const valorDenom = parseFloat(denom);
                total += valorDenom * cantidad;
            }
        }

        // Sumar monedas
        if (denominaciones.monedas) {
            for (const [denom, cantidad] of Object.entries(denominaciones.monedas)) {
                const valorDenom = parseFloat(denom);
                total += valorDenom * cantidad;
            }
        }

        // Redondear a 2 decimales para evitar problemas de precisión
        return Math.round(total * 100) / 100;
    }

    /**
     * Valida que las denominaciones ingresadas sean correctas
     */
    validarDenominacionesValidas(
        denominaciones: Denominaciones,
        moneda = 'PEN',
    ): { valido: boolean; errores: string[] } {
        const errores: string[] = [];
        const currency = String(moneda || 'PEN').toUpperCase();
        const catalogo = this.DENOMINACIONES_VALIDAS[currency] || this.DENOMINACIONES_VALIDAS.PEN;
        const billetesValidos = Object.keys(catalogo.billetes).map(Number);
        const monedasValidas = Object.keys(catalogo.monedas).map(Number);

        // Validar billetes
        if (denominaciones.billetes) {
            for (const [denom, cantidad] of Object.entries(denominaciones.billetes)) {
                const valorDenom = parseFloat(denom);

                if (!billetesValidos.includes(valorDenom)) {
                    errores.push(`Billete de ${denom} no es válido`);
                }

                if (cantidad < 0) {
                    errores.push(`Cantidad de billetes de ${denom} no puede ser negativa`);
                }

                if (!Number.isInteger(cantidad)) {
                    errores.push(`Cantidad de billetes de ${denom} debe ser un número entero`);
                }
            }
        }

        // Validar monedas
        if (denominaciones.monedas) {
            for (const [denom, cantidad] of Object.entries(denominaciones.monedas)) {
                const valorDenom = parseFloat(denom);

                if (!monedasValidas.includes(valorDenom)) {
                    errores.push(`Moneda de ${denom} no es válida`);
                }

                if (cantidad < 0) {
                    errores.push(`Cantidad de monedas de ${denom} no puede ser negativa`);
                }

                if (!Number.isInteger(cantidad)) {
                    errores.push(`Cantidad de monedas de ${denom} debe ser un número entero`);
                }
            }
        }

        return {
            valido: errores.length === 0,
            errores,
        };
    }

    /**
     * Valida apertura de caja comparando monto declarado con denominaciones
     */
    validarApertura(
        montoDeclarado: number,
        denominaciones: Denominaciones,
        moneda = 'PEN',
    ): ResultadoValidacion {
        this.logger.log(`Validando apertura: monto declarado=${montoDeclarado}`);

        // Validar que las denominaciones sean correctas
        const validacion = this.validarDenominacionesValidas(denominaciones, moneda);
        if (!validacion.valido) {
            return {
                valido: false,
                total_calculado: 0,
                diferencia: 0,
                mensaje: `Denominaciones inválidas: ${validacion.errores.join(', ')}`,
            };
        }

        // Calcular total
        const totalCalculado = this.calcularTotalDenominaciones(denominaciones);
        const diferencia = totalCalculado - montoDeclarado;

        const valido = Math.abs(diferencia) < 0.01; // Tolerancia de 1 centavo por redondeo

        return {
            valido,
            total_calculado: totalCalculado,
            diferencia,
            mensaje: valido
                ? 'Las denominaciones cuadran con el monto declarado'
                : `El arqueo (${moneda} ${totalCalculado.toFixed(2)}) no coincide con el monto declarado (${moneda} ${montoDeclarado.toFixed(2)}). Diferencia: ${moneda} ${diferencia.toFixed(2)}`,
        };
    }

    /**
     * Valida cierre de caja con cálculo de diferencias y aplicación de tolerancia
     */
    async validarCierre(
        sesionId: string,
        montoContado: number,
        denominaciones: Denominaciones,
        tenantId: string,
    ): Promise<ResultadoCierre> {
        this.logger.log(`Validando cierre: sesión=${sesionId}, monto contado=${montoContado}`);

        const { data: sesion, error: sesionError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('monto_inicio, tenant_id, moneda')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (sesionError || !sesion) {
            throw new BadRequestException('Sesión de caja no encontrada');
        }
        const moneda = String(sesion.moneda || 'PEN').toUpperCase();

        // Validar denominaciones
        const validacion = this.validarDenominacionesValidas(denominaciones, moneda);
        if (!validacion.valido) {
            throw new BadRequestException(`Denominaciones inválidas: ${validacion.errores.join(', ')}`);
        }

        // Calcular total de denominaciones
        const totalDenominaciones = this.calcularTotalDenominaciones(denominaciones);

        // Validar que monto contado coincida con denominaciones
        if (Math.abs(totalDenominaciones - montoContado) > 0.01) {
            throw new BadRequestException(
                `El monto contado (${moneda} ${montoContado.toFixed(2)}) no coincide con las denominaciones (${moneda} ${totalDenominaciones.toFixed(2)})`,
            );
        }

        // El saldo teórico se lee igual que en `cerrar_caja_tx`: el saldo_nuevo del
        // último movimiento por secuencia, y monto_inicio cuando aún no hay ninguno.
        // Antes se usaba la columna `monto_esperado`, que se escribe al abrir la
        // sesión y nadie actualiza después: con una venta en efectivo de 74.34 sobre
        // una apertura de 100, esta comprobación esperaba 100 y el writer 174.34. El
        // cajero que entregaba el efectivo correcto recibía un aviso de sobrante por
        // el importe exacto de las ventas del día y se le exigía autorización de
        // supervisor sin motivo; quien entregaba sólo el fondo de apertura pasaba
        // este filtro y sólo lo frenaba el writer.
        const { data: ultimoMovimiento } = await this.supabase
            .getClient()
            .from('movimientos_caja')
            .select('saldo_nuevo')
            .eq('sesion_caja_id', sesionId)
            .eq('tenant_id', tenantId)
            .order('secuencia', { ascending: false })
            .limit(1)
            .maybeSingle();

        const saldoTeorico = Number(
            ultimoMovimiento?.saldo_nuevo ?? sesion.monto_inicio ?? 0,
        );

        const saldoReal = montoContado;
        const diferencia = saldoReal - saldoTeorico;

        // Obtener configuración de tolerancia
        const { data: config } = await this.supabase
            .getClient()
            .from('configuracion_caja')
            .select('tolerancia_diferencia_cierre')
            .eq('tenant_id', tenantId)
            .single();

        const tolerancia = config?.tolerancia_diferencia_cierre || 10.00;

        // Clasificar diferencia
        let tipoDiferencia: 'SOBRANTE' | 'FALTANTE' | 'CUADRADO';
        if (Math.abs(diferencia) < 0.01) {
            tipoDiferencia = 'CUADRADO';
        } else if (diferencia > 0) {
            tipoDiferencia = 'SOBRANTE';
        } else {
            tipoDiferencia = 'FALTANTE';
        }

        // Determinar si requiere supervisor
        const requiereSupervisor = Math.abs(diferencia) > tolerancia;
        const requiereJustificacion = requiereSupervisor;

        this.logger.log(
            `Resultado cierre: teórico=${moneda} ${saldoTeorico.toFixed(2)}, real=${moneda} ${saldoReal.toFixed(2)}, diferencia=${moneda} ${diferencia.toFixed(2)} (${tipoDiferencia}), requiere supervisor=${requiereSupervisor}`,
        );

        return {
            valido: !requiereSupervisor,
            saldo_teorico: saldoTeorico,
            saldo_real: saldoReal,
            diferencia,
            tipo_diferencia: tipoDiferencia,
            requiere_supervisor: requiereSupervisor,
            requiere_justificacion: requiereJustificacion,
        };
    }

    /**
     * Genera un resumen de denominaciones para mostrar en reportes
     */
    generarResumenDenominaciones(denominaciones: Denominaciones, moneda = 'PEN'): string {
        const lineas: string[] = [];
        const currency = String(moneda || 'PEN').toUpperCase();
        const catalogo = this.DENOMINACIONES_VALIDAS[currency] || this.DENOMINACIONES_VALIDAS.PEN;
        const billetesValidos = Object.keys(catalogo.billetes).map(Number).sort((a, b) => b - a);
        const monedasValidas = Object.keys(catalogo.monedas).map(Number).sort((a, b) => b - a);

        lineas.push('BILLETES:');
        if (denominaciones.billetes) {
            for (const denom of billetesValidos) {
                const cantidad = denominaciones.billetes[denom] || 0;
                if (cantidad > 0) {
                    const total = denom * cantidad;
                    lineas.push(`  ${currency} ${denom} x ${cantidad} = ${currency} ${total.toFixed(2)}`);
                }
            }
        }

        lineas.push('MONEDAS:');
        if (denominaciones.monedas) {
            for (const denom of monedasValidas) {
                const cantidad = denominaciones.monedas[denom] || 0;
                if (cantidad > 0) {
                    const total = denom * cantidad;
                    lineas.push(`  ${currency} ${denom.toFixed(2)} x ${cantidad} = ${currency} ${total.toFixed(2)}`);
                }
            }
        }

        const totalGeneral = this.calcularTotalDenominaciones(denominaciones);
        lineas.push(`TOTAL: ${currency} ${totalGeneral.toFixed(2)}`);

        return lineas.join('\n');
    }

    /**
     * Crea un objeto de denominaciones vacío con estructura correcta
     */
    crearDenominacionesVacias(moneda = 'PEN'): Denominaciones {
        const currency = String(moneda || 'PEN').toUpperCase();
        const catalogo = this.DENOMINACIONES_VALIDAS[currency] || this.DENOMINACIONES_VALIDAS.PEN;
        return {
            billetes: { ...catalogo.billetes },
            monedas: { ...catalogo.monedas },
        };
    }
}
