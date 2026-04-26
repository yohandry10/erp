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

    // Denominaciones válidas en PEN (Perú)
    private readonly BILLETES_VALIDOS = [200, 100, 50, 20, 10];
    private readonly MONEDAS_VALIDAS = [5, 2, 1, 0.5, 0.2, 0.1];

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
    validarDenominacionesValidas(denominaciones: Denominaciones): { valido: boolean; errores: string[] } {
        const errores: string[] = [];

        // Validar billetes
        if (denominaciones.billetes) {
            for (const [denom, cantidad] of Object.entries(denominaciones.billetes)) {
                const valorDenom = parseFloat(denom);

                if (!this.BILLETES_VALIDOS.includes(valorDenom)) {
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

                if (!this.MONEDAS_VALIDAS.includes(valorDenom)) {
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
    ): ResultadoValidacion {
        this.logger.log(`Validando apertura: monto declarado=${montoDeclarado}`);

        // Validar que las denominaciones sean correctas
        const validacion = this.validarDenominacionesValidas(denominaciones);
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
                : `El arqueo (S/.${totalCalculado.toFixed(2)}) no coincide con el monto declarado (S/.${montoDeclarado.toFixed(2)}). Diferencia: S/.${diferencia.toFixed(2)}`,
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

        // Validar denominaciones
        const validacion = this.validarDenominacionesValidas(denominaciones);
        if (!validacion.valido) {
            throw new BadRequestException(`Denominaciones inválidas: ${validacion.errores.join(', ')}`);
        }

        // Calcular total de denominaciones
        const totalDenominaciones = this.calcularTotalDenominaciones(denominaciones);

        // Validar que monto contado coincida con denominaciones
        if (Math.abs(totalDenominaciones - montoContado) > 0.01) {
            throw new BadRequestException(
                `El monto contado (S/.${montoContado.toFixed(2)}) no coincide con las denominaciones (S/.${totalDenominaciones.toFixed(2)})`,
            );
        }

        // Obtener sesión y calcular saldo teórico
        const { data: sesion, error: sesionError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('monto_inicio, monto_esperado, tenant_id')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (sesionError || !sesion) {
            throw new BadRequestException('Sesión de caja no encontrada');
        }

        // Si no hay monto_esperado calculado, calcularlo desde movimientos
        let saldoTeorico = sesion.monto_esperado;

        if (!saldoTeorico) {
            const { data: movimientos } = await this.supabase
                .getClient()
                .from('movimientos_caja')
                .select('monto')
                .eq('sesion_caja_id', sesionId)
                .eq('tenant_id', tenantId);

            const sumaMovimientos = (movimientos || []).reduce((sum, m) => sum + m.monto, 0);
            saldoTeorico = (sesion.monto_inicio || 0) + sumaMovimientos;
        }

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
            `Resultado cierre: teórico=S/.${saldoTeorico.toFixed(2)}, real=S/.${saldoReal.toFixed(2)}, diferencia=S/.${diferencia.toFixed(2)} (${tipoDiferencia}), requiere supervisor=${requiereSupervisor}`,
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
    generarResumenDenominaciones(denominaciones: Denominaciones): string {
        const lineas: string[] = [];

        lineas.push('BILLETES:');
        if (denominaciones.billetes) {
            for (const denom of this.BILLETES_VALIDOS) {
                const cantidad = denominaciones.billetes[denom] || 0;
                if (cantidad > 0) {
                    const total = denom * cantidad;
                    lineas.push(`  S/.${denom} x ${cantidad} = S/.${total.toFixed(2)}`);
                }
            }
        }

        lineas.push('MONEDAS:');
        if (denominaciones.monedas) {
            for (const denom of this.MONEDAS_VALIDAS) {
                const cantidad = denominaciones.monedas[denom] || 0;
                if (cantidad > 0) {
                    const total = denom * cantidad;
                    lineas.push(`  S/.${denom.toFixed(2)} x ${cantidad} = S/.${total.toFixed(2)}`);
                }
            }
        }

        const totalGeneral = this.calcularTotalDenominaciones(denominaciones);
        lineas.push(`TOTAL: S/.${totalGeneral.toFixed(2)}`);

        return lineas.join('\n');
    }

    /**
     * Crea un objeto de denominaciones vacío con estructura correcta
     */
    crearDenominacionesVacias(): Denominaciones {
        const billetes: { [key: number]: number } = {};
        const monedas: { [key: number]: number } = {};

        this.BILLETES_VALIDOS.forEach((denom) => {
            billetes[denom] = 0;
        });

        this.MONEDAS_VALIDAS.forEach((denom) => {
            monedas[denom] = 0;
        });

        return { billetes, monedas };
    }
}
