import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CashMovementsService, TipoMovimiento } from './cash-movements.service';

export enum SeveridadAnomalia {
    BAJA = 'BAJA',
    MEDIA = 'MEDIA',
    ALTA = 'ALTA',
    CRITICA = 'CRÍTICA',
}

export interface Anomalia {
    tipo: string;
    severidad: SeveridadAnomalia;
    descripcion: string;
    detalles: Record<string, any>;
    timestamp: string;
}

export interface PatronDiferencias {
    sobrantes: number;
    faltantes: number;
    total_sesiones: number;
    diferencia_promedio: number;
    diferencia_maxima: number;
}

export interface ResultadoIntegridad {
    valido: boolean;
    saldo_calculado: number;
    saldo_registrado: number;
    diferencia: number;
}

/**
 * Servicio para detección de fraude y anomalías en operaciones de caja
 *
 * Responsabilidades:
 * - Detectar ajustes manuales excesivos (más de 2 por turno)
 * - Identificar gaps en secuencia de movimientos
 * - Detectar timestamps sospechosos (fuera de orden)
 * - Analizar patrones de diferencias por usuario
 * - Validar cuadre matemático de sesiones
 * - Detectar sesiones con duración anormal
 * - Generar alertas automáticas para comportamiento sospechoso
 * - Calcular score de riesgo por sesión/usuario
 */
@Injectable()
export class CashFraudDetectionService {
    private readonly logger = new Logger(CashFraudDetectionService.name);

    // Umbrales configurables
    private readonly MAX_AJUSTES_POR_TURNO = 2;
    private readonly MAX_DIFERENCIA_RECURRENTE = 3; // Diferencias en últimos 30 días
    private readonly DURACION_TURNO_MIN_HORAS = 2;
    private readonly DURACION_TURNO_MAX_HORAS = 12;

    constructor(
        private readonly supabase: SupabaseService,
        private readonly movementsService: CashMovementsService,
    ) {}

    /**
     * Detecta todas las anomalías de una sesión de caja
     */
    async detectarAnomalias(sesionId: string, tenantId: string): Promise<Anomalia[]> {
        this.logger.log(`Analizando sesión para detectar anomalías: ${sesionId}`);

        const anomalias: Anomalia[] = [];

        // Anomalía 1: Ajustes manuales excesivos
        const ajustesExcesivos = await this.detectarAjustesExcesivos(sesionId, tenantId);
        if (ajustesExcesivos) {
            anomalias.push(ajustesExcesivos);
        }

        // Anomalía 2: Gaps en secuencia de movimientos
        const gapsSecuencia = await this.detectarGapsSecuencia(sesionId, tenantId);
        if (gapsSecuencia) {
            anomalias.push(gapsSecuencia);
        }

        // Anomalía 3: Timestamps fuera de orden
        const timestampsSospechosos = await this.detectarTimestampsSospechosos(sesionId, tenantId);
        if (timestampsSospechosos) {
            anomalias.push(timestampsSospechosos);
        }

        // Anomalía 4: Descuadre matemático
        const descuadreMatematico = await this.detectarDescuadreMatematico(sesionId, tenantId);
        if (descuadreMatematico) {
            anomalias.push(descuadreMatematico);
        }

        // Anomalía 5: Duración anormal del turno
        const duracionAnormal = await this.detectarDuracionAnormal(sesionId, tenantId);
        if (duracionAnormal) {
            anomalias.push(duracionAnormal);
        }

        // Anomalía 6: Movimientos grandes cerca del cierre
        const movimientosSospechosos = await this.detectarMovimientosSospechosos(sesionId, tenantId);
        if (movimientosSospechosos) {
            anomalias.push(movimientosSospechosos);
        }

        if (anomalias.length > 0) {
            this.logger.warn(
                `Anomalías detectadas en sesión ${sesionId}: ${anomalias.length} anomalías`,
            );

            // Registrar en tabla de auditoría
            await this.registrarAnomalias(sesionId, anomalias, tenantId);
        }

        return anomalias;
    }

    /**
     * Detecta ajustes manuales excesivos (más de 2 por turno)
     */
    private async detectarAjustesExcesivos(
        sesionId: string,
        tenantId: string,
    ): Promise<Anomalia | null> {
        const cantidadAjustes = await this.movementsService.contarMovimientosPorTipo(
            sesionId,
            TipoMovimiento.AJUSTE,
            tenantId,
        );

        if (cantidadAjustes > this.MAX_AJUSTES_POR_TURNO) {
            return {
                tipo: 'AJUSTES_EXCESIVOS',
                severidad: SeveridadAnomalia.ALTA,
                descripcion: `Detectados ${cantidadAjustes} ajustes manuales en el turno (límite: ${this.MAX_AJUSTES_POR_TURNO})`,
                detalles: {
                    cantidad_ajustes: cantidadAjustes,
                    limite: this.MAX_AJUSTES_POR_TURNO,
                },
                timestamp: new Date().toISOString(),
            };
        }

        return null;
    }

    /**
     * Detecta gaps en la secuencia consecutiva de movimientos
     */
    private async detectarGapsSecuencia(
        sesionId: string,
        tenantId: string,
    ): Promise<Anomalia | null> {
        const gaps = await this.movementsService.detectarGapsSecuencia(sesionId, tenantId);

        if (gaps.length > 0) {
            return {
                tipo: 'GAPS_SECUENCIA',
                severidad: SeveridadAnomalia.CRITICA,
                descripcion: `Detectados ${gaps.length} gaps en la secuencia de movimientos`,
                detalles: {
                    gaps,
                    secuencias_faltantes: gaps,
                },
                timestamp: new Date().toISOString(),
            };
        }

        return null;
    }

    /**
     * Detecta timestamps fuera de orden (movimientos con fecha anterior a movimientos previos)
     */
    private async detectarTimestampsSospechosos(
        sesionId: string,
        tenantId: string,
    ): Promise<Anomalia | null> {
        const movimientos = await this.movementsService.obtenerMovimientos(sesionId, tenantId);

        const movimientosFueraDeOrden: any[] = [];

        for (let i = 1; i < movimientos.length; i++) {
            const actual = new Date(movimientos[i].timestamp);
            const anterior = new Date(movimientos[i - 1].timestamp);

            if (actual < anterior) {
                movimientosFueraDeOrden.push({
                    secuencia: movimientos[i].secuencia,
                    timestamp: movimientos[i].timestamp,
                    timestamp_anterior: movimientos[i - 1].timestamp,
                });
            }
        }

        if (movimientosFueraDeOrden.length > 0) {
            return {
                tipo: 'TIMESTAMP_SOSPECHOSO',
                severidad: SeveridadAnomalia.CRITICA,
                descripcion: `Detectados ${movimientosFueraDeOrden.length} movimientos con timestamps fuera de orden`,
                detalles: {
                    movimientos_fuera_orden: movimientosFueraDeOrden,
                },
                timestamp: new Date().toISOString(),
            };
        }

        return null;
    }

    /**
     * Detecta descuadres matemáticos entre saldo calculado y saldo registrado
     */
    private async detectarDescuadreMatematico(
        sesionId: string,
        tenantId: string,
    ): Promise<Anomalia | null> {
        const resultado = await this.recalcularSaldoEsperado(sesionId, tenantId);

        if (!resultado.valido) {
            return {
                tipo: 'DESCUADRE_MATEMATICO',
                severidad: SeveridadAnomalia.CRITICA,
                descripcion: `Descuadre matemático detectado: diferencia de S/.${resultado.diferencia.toFixed(2)}`,
                detalles: {
                    saldo_calculado: resultado.saldo_calculado,
                    saldo_registrado: resultado.saldo_registrado,
                    diferencia: resultado.diferencia,
                },
                timestamp: new Date().toISOString(),
            };
        }

        return null;
    }

    /**
     * Detecta sesiones con duración anormal (muy cortas o muy largas)
     */
    private async detectarDuracionAnormal(
        sesionId: string,
        tenantId: string,
    ): Promise<Anomalia | null> {
        const { data: sesion } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('hora_apertura, hora_cierre, estado')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (!sesion || sesion.estado !== 'CERRADA' || !sesion.hora_cierre) {
            return null;
        }

        const apertura = new Date(sesion.hora_apertura);
        const cierre = new Date(sesion.hora_cierre);
        const duracionHoras = (cierre.getTime() - apertura.getTime()) / (1000 * 60 * 60);

        if (duracionHoras < this.DURACION_TURNO_MIN_HORAS) {
            return {
                tipo: 'TURNO_MUY_CORTO',
                severidad: SeveridadAnomalia.MEDIA,
                descripcion: `Turno inusualmente corto: ${duracionHoras.toFixed(1)} horas (mínimo esperado: ${this.DURACION_TURNO_MIN_HORAS}h)`,
                detalles: {
                    duracion_horas: duracionHoras,
                    minimo_esperado: this.DURACION_TURNO_MIN_HORAS,
                },
                timestamp: new Date().toISOString(),
            };
        }

        if (duracionHoras > this.DURACION_TURNO_MAX_HORAS) {
            return {
                tipo: 'TURNO_MUY_LARGO',
                severidad: SeveridadAnomalia.MEDIA,
                descripcion: `Turno inusualmente largo: ${duracionHoras.toFixed(1)} horas (máximo esperado: ${this.DURACION_TURNO_MAX_HORAS}h)`,
                detalles: {
                    duracion_horas: duracionHoras,
                    maximo_esperado: this.DURACION_TURNO_MAX_HORAS,
                },
                timestamp: new Date().toISOString(),
            };
        }

        return null;
    }

    /**
     * Detecta movimientos grandes (ajustes/retiros) cerca del cierre
     */
    private async detectarMovimientosSospechosos(
        sesionId: string,
        tenantId: string,
    ): Promise<Anomalia | null> {
        const { data: sesion } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('hora_cierre, estado')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (!sesion || sesion.estado !== 'CERRADA' || !sesion.hora_cierre) {
            return null;
        }

        const movimientos = await this.movementsService.obtenerMovimientos(sesionId, tenantId);
        const horaCierre = new Date(sesion.hora_cierre);

        // Buscar ajustes/retiros grandes en la última hora antes del cierre
        const movimientosSospechosos = movimientos.filter((m) => {
            const timestamp = new Date(m.timestamp);
            const minutosAntesCierre = (horaCierre.getTime() - timestamp.getTime()) / (1000 * 60);

            return (
                minutosAntesCierre <= 60 &&
                (m.tipo_movimiento === TipoMovimiento.AJUSTE ||
                    m.tipo_movimiento === TipoMovimiento.RETIRO) &&
                Math.abs(m.monto) > 100 // Movimientos mayores a S/.100
            );
        });

        if (movimientosSospechosos.length > 0) {
            return {
                tipo: 'MOVIMIENTOS_PRE_CIERRE',
                severidad: SeveridadAnomalia.ALTA,
                descripcion: `Detectados ${movimientosSospechosos.length} movimientos grandes en la última hora antes del cierre`,
                detalles: {
                    movimientos: movimientosSospechosos.map((m) => ({
                        secuencia: m.secuencia,
                        tipo: m.tipo_movimiento,
                        monto: m.monto,
                        timestamp: m.timestamp,
                    })),
                },
                timestamp: new Date().toISOString(),
            };
        }

        return null;
    }

    /**
     * Recalcula el saldo esperado y lo compara con el último movimiento
     */
    async recalcularSaldoEsperado(sesionId: string, tenantId: string): Promise<ResultadoIntegridad> {
        const saldoCalculado = await this.movementsService.recalcularSaldoEsperado(
            sesionId,
            tenantId,
        );
        const ultimoMovimiento = await this.movementsService.obtenerUltimoMovimiento(
            sesionId,
            tenantId,
        );

        const saldoRegistrado = ultimoMovimiento ? ultimoMovimiento.saldo_nuevo : 0;
        const diferencia = Math.abs(saldoCalculado - saldoRegistrado);

        return {
            valido: diferencia < 0.01, // Tolerancia de 1 centavo
            saldo_calculado: saldoCalculado,
            saldo_registrado: saldoRegistrado,
            diferencia,
        };
    }

    /**
     * Analiza el patrón de diferencias de un usuario en los últimos 30 días
     */
    async analizarPatronDiferencias(userId: string, tenantId: string): Promise<PatronDiferencias> {
        const fecha30DiasAtras = new Date();
        fecha30DiasAtras.setDate(fecha30DiasAtras.getDate() - 30);

        const { data: sesiones } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('diferencia, estado')
            .eq('usuario_id', userId)
            .eq('tenant_id', tenantId)
            .eq('estado', 'CERRADA')
            .gte('hora_apertura', fecha30DiasAtras.toISOString());

        const sesionesCerradas = sesiones || [];

        const sobrantes = sesionesCerradas.filter((s) => s.diferencia > 0).length;
        const faltantes = sesionesCerradas.filter((s) => s.diferencia < 0).length;

        const diferencias = sesionesCerradas.map((s) => s.diferencia || 0);
        const diferenciaPromedio =
            diferencias.length > 0 ? diferencias.reduce((a, b) => a + b, 0) / diferencias.length : 0;
        const diferenciaMaxima =
            diferencias.length > 0 ? Math.max(...diferencias.map(Math.abs)) : 0;

        return {
            sobrantes,
            faltantes,
            total_sesiones: sesionesCerradas.length,
            diferencia_promedio: diferenciaPromedio,
            diferencia_maxima: diferenciaMaxima,
        };
    }

    /**
     * Calcula un score de riesgo para una sesión (0-100)
     */
    async calcularScoreRiesgo(sesionId: string, tenantId: string): Promise<number> {
        const anomalias = await this.detectarAnomalias(sesionId, tenantId);

        let score = 0;

        anomalias.forEach((anomalia) => {
            switch (anomalia.severidad) {
                case SeveridadAnomalia.CRITICA:
                    score += 40;
                    break;
                case SeveridadAnomalia.ALTA:
                    score += 25;
                    break;
                case SeveridadAnomalia.MEDIA:
                    score += 15;
                    break;
                case SeveridadAnomalia.BAJA:
                    score += 5;
                    break;
            }
        });

        return Math.min(score, 100); // Máximo 100
    }

    /**
     * Registra anomalías detectadas en la tabla de auditoría
     */
    private async registrarAnomalias(
        sesionId: string,
        anomalias: Anomalia[],
        tenantId: string,
    ): Promise<void> {
        // Este analizador no está registrado como provider y permanece
        // read-only. Las alertas durables deben publicarse por una frontera de
        // auditoría explícita con actor/idempotencia; no se inserta una bitácora
        // huérfana desde un detector auxiliar.
        this.logger.warn(
            `Anomalías detectadas sin writer lateral: tenant=${tenantId}, sesión=${sesionId}, cantidad=${anomalias.length}`,
        );
    }

    /**
     * Genera reporte de riesgo para un usuario
     */
    async generarReporteRiesgoUsuario(userId: string, tenantId: string): Promise<any> {
        const patron = await this.analizarPatronDiferencias(userId, tenantId);

        // Buscar sesiones recientes
        const { data: sesionesRecientes } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('id, hora_apertura, diferencia')
            .eq('usuario_id', userId)
            .eq('tenant_id', tenantId)
            .eq('estado', 'CERRADA')
            .order('hora_apertura', { ascending: false })
            .limit(10);

        // Calcular scores de riesgo para sesiones recientes
        const scoresPromises = (sesionesRecientes || []).map((s) =>
            this.calcularScoreRiesgo(s.id, tenantId),
        );
        const scores = await Promise.all(scoresPromises);
        const scorePromedio = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

        return {
            usuario_id: userId,
            patron_diferencias: patron,
            score_riesgo_promedio: scorePromedio,
            nivel_riesgo:
                scorePromedio > 50 ? 'ALTO' : scorePromedio > 25 ? 'MEDIO' : 'BAJO',
            sesiones_analizadas: sesionesRecientes?.length || 0,
        };
    }
}
