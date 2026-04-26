import {
    CashShiftChangesService,
    EstadoCambioTurno,
    FirmasDigitales,
} from './cash-shift-changes.service';
import { CashMovementsService, TipoMovimiento } from './cash-movements.service';
import { CashReconciliationService } from './cash-reconciliation.service';
import { CashAuditService, CashAuditEvent } from './cash-audit.service';

// ---- Supabase mock helper ----
const createSupabaseMock = () => {
    const mockData: any = {
        sesiones_caja: {},
        cambios_turno: [],
        configuracion_caja: {},
        caja_audit_log: [],
    };

    const buildQuery = (table: string) => {
        const chain: any = {
            select: jest.fn(() => chain),
            eq: jest.fn(() => chain),
            or: jest.fn(() => chain),
            order: jest.fn(() => chain),
            limit: jest.fn(() => chain),
            gte: jest.fn(() => chain),
            lte: jest.fn(() => chain),
            lt: jest.fn(() => chain),

            update: jest.fn((data: any) => {
                const value = mockData[table];
                if (Array.isArray(value)) {
                    if (value.length === 0) {
                        value.push({ ...data });
                    } else {
                        Object.assign(value[0], data);
                    }
                } else if (value) {
                    Object.assign(value, data);
                } else {
                    mockData[table] = { ...data };
                }
                return chain;
            }),

            insert: jest.fn((rows: any | any[]) => {
                if (!Array.isArray(mockData[table])) {
                    mockData[table] = [];
                }
                const arr = mockData[table] as any[];
                const items = Array.isArray(rows) ? rows : [rows];
                arr.push(...items);
                return chain;
            }),

            single: jest.fn(async () => {
                const value = mockData[table];
                if (Array.isArray(value)) {
                    return { data: value[0] ?? null, error: null };
                }
                return { data: value ?? null, error: null };
            }),

            maybeSingle: jest.fn(async () => {
                const value = mockData[table];
                if (Array.isArray(value)) {
                    return { data: value[0] ?? null, error: null };
                }
                return { data: value ?? null, error: null };
            }),

            then: (resolve: any) => {
                const value = mockData[table];
                const data = Array.isArray(value)
                    ? value
                    : value
                    ? [value]
                    : [];
                return resolve({ data, error: null });
            },
        };

        return chain;
    };

    const client = {
        from: jest.fn((table: string) => buildQuery(table)),
    };

    return {
        getClient: jest.fn(() => client),
        __client: client,
        __data: mockData,
    };
};

describe('CashShiftChangesService', () => {
    let supabaseService: ReturnType<typeof createSupabaseMock>;
    let movementsService: jest.Mocked<Partial<CashMovementsService>>;
    let reconciliationService: jest.Mocked<Partial<CashReconciliationService>>;
    let auditService: jest.Mocked<Partial<CashAuditService>>;
    let service: CashShiftChangesService;

    const sesionId = 'sesion-123';
    const tenantId = 'tenant-123';
    const usuarioSalienteId = 'user-out';
    const usuarioEntranteId = 'user-in';

    beforeEach(() => {
        jest.clearAllMocks();

        supabaseService = createSupabaseMock();

        movementsService = {
            calcularSaldoActual: jest.fn(),
            registrarMovimiento: jest.fn(),
        } as any;

        reconciliationService = {
            validarDenominacionesValidas: jest.fn(),
            calcularTotalDenominaciones: jest.fn(),
        } as any;

        auditService = {
            registrarEvento: jest.fn(),
        } as any;

        service = new CashShiftChangesService(
            supabaseService as any,
            movementsService as any,
            reconciliationService as any,
            auditService as any,
        );
    });

    it('should start a shift change freezing the session and creating a record', async () => {
        // Sesión abierta y no congelada
        supabaseService.__data.sesiones_caja = {
            id: sesionId,
            estado: 'ABIERTA',
            congelada: false,
            usuario_id: usuarioSalienteId,
            tenant_id: tenantId,
        };

        // Sin cambios en proceso
        supabaseService.__data.cambios_turno = [];

        // Saldo actual
        (movementsService.calcularSaldoActual as jest.Mock).mockResolvedValue(150);

        const cambio = await service.iniciarCambioTurno(
            sesionId,
            usuarioSalienteId,
            usuarioEntranteId,
            tenantId,
        );

        expect(movementsService.calcularSaldoActual).toHaveBeenCalledWith(
            sesionId,
            tenantId,
        );

        expect(cambio.estado).toBe(EstadoCambioTurno.EN_PROCESO);
        expect(cambio.saldo_sistema).toBe(150);

        // La sesión debe quedar congelada
        expect(supabaseService.__data.sesiones_caja.congelada).toBe(true);

        // Audit log
        expect(auditService.registrarEvento).toHaveBeenCalledWith(
            CashAuditEvent.CAMBIO_TURNO_INICIADO,
            tenantId,
            usuarioSalienteId,
            sesionId,
            expect.objectContaining({
                parametros: expect.objectContaining({
                    usuario_entrante: usuarioEntranteId,
                    saldo_sistema: 150,
                }),
                resultado: 'INICIADO',
            }),
        );
    });

    it('should complete a shift change, register movement and unfreeze session', async () => {
        const cambioId = 'cambio-1';

        // Cambio en proceso
        supabaseService.__data.cambios_turno = [
            {
                id: cambioId,
                sesion_caja_id: sesionId,
                usuario_saliente_id: usuarioSalienteId,
                usuario_entrante_id: usuarioEntranteId,
                saldo_sistema: 150,
                estado: EstadoCambioTurno.EN_PROCESO,
                tenant_id: tenantId,
            },
        ];

        // Sesión congelada y asignada al saliente
        supabaseService.__data.sesiones_caja = {
            id: sesionId,
            estado: 'ABIERTA',
            congelada: true,
            usuario_id: usuarioSalienteId,
            cajero_id: usuarioSalienteId,
            tenant_id: tenantId,
        };

        // Tolerancia de diferencia
        supabaseService.__data.configuracion_caja = {
            tolerancia_diferencia_cierre: 20,
        };

        // Denominaciones válidas y matching con saldo contado
        (reconciliationService.validarDenominacionesValidas as jest.Mock).mockReturnValue({
            valido: true,
            errores: [],
        });

        const denominaciones: any = { detalle: 'mock' };
        const saldoContado = 155;

        (reconciliationService.calcularTotalDenominaciones as jest.Mock).mockReturnValue(
            saldoContado,
        );

        const firmas: FirmasDigitales = {
            saliente: 'firma-saliente',
            entrante: 'firma-entrante',
        };

        const result = await service.completarCambioTurno(
            cambioId,
            saldoContado,
            denominaciones as any,
            'foto-base64',
            firmas,
            tenantId,
        );

        // Estado del cambio
        expect(result.estado).toBe(EstadoCambioTurno.COMPLETADO);
        expect(result.saldo_contado).toBe(saldoContado);

        // Movimiento por diferencia (155 - 150 = 5)
        expect(movementsService.registrarMovimiento).toHaveBeenCalledWith(
            sesionId,
            TipoMovimiento.CAMBIO_TURNO,
            5,
            expect.objectContaining({
                usuario_id: usuarioSalienteId,
                referencia_documento: cambioId,
            }),
            tenantId,
        );

        // Sesión pasa al usuario entrante y se descongela
        expect(supabaseService.__data.sesiones_caja.usuario_id).toBe(usuarioEntranteId);
        expect(supabaseService.__data.sesiones_caja.cajero_id).toBe(usuarioEntranteId);
        expect(supabaseService.__data.sesiones_caja.congelada).toBe(false);

        // Audit de completado
        expect(auditService.registrarEvento).toHaveBeenCalledWith(
            CashAuditEvent.CAMBIO_TURNO_COMPLETADO,
            tenantId,
            usuarioEntranteId,
            sesionId,
            expect.objectContaining({
                parametros: expect.objectContaining({
                    cambio_turno_id: cambioId,
                    diferencia: 5,
                    saldo_sistema: 150,
                    saldo_contado: saldoContado,
                }),
                resultado: 'COMPLETADO',
            }),
        );
    });

    it('should cancel a shift change and unfreeze session', async () => {
        const cambioId = 'cambio-2';

        supabaseService.__data.cambios_turno = [
            {
                id: cambioId,
                sesion_caja_id: sesionId,
                estado: EstadoCambioTurno.EN_PROCESO,
                tenant_id: tenantId,
            },
        ];

        supabaseService.__data.sesiones_caja = {
            id: sesionId,
            estado: 'ABIERTA',
            congelada: true,
            tenant_id: tenantId,
        };

        const result = await service.cancelarCambioTurno(
            cambioId,
            'Prueba de cancelación',
            usuarioSalienteId,
            tenantId,
        );

        expect(result.estado).toBe(EstadoCambioTurno.CANCELADO);
        expect(supabaseService.__data.sesiones_caja.congelada).toBe(false);
    });

    it('should calculate user statistics based on shift changes', async () => {
        supabaseService.__data.cambios_turno = [
            {
                diferencia: 10,
                estado: EstadoCambioTurno.COMPLETADO,
                timestamp_inicio: '2024-01-03T10:00:00Z',
                timestamp_fin: '2024-01-03T12:00:00Z',
                usuario_saliente_id: 'user-1',
                usuario_entrante_id: 'user-2',
                tenant_id: tenantId,
            },
            {
                diferencia: -5,
                estado: EstadoCambioTurno.COMPLETADO,
                timestamp_inicio: '2024-01-02T10:00:00Z',
                timestamp_fin: '2024-01-02T12:00:00Z',
                usuario_saliente_id: 'user-2',
                usuario_entrante_id: 'user-1',
                tenant_id: tenantId,
            },
            {
                diferencia: 0.02,
                estado: EstadoCambioTurno.COMPLETADO,
                timestamp_inicio: '2024-01-01T10:00:00Z',
                timestamp_fin: '2024-01-01T12:00:00Z',
                usuario_saliente_id: 'user-1',
                usuario_entrante_id: 'user-3',
                tenant_id: tenantId,
            },
        ];

        const stats = await service.obtenerEstadisticasUsuario('user-1', tenantId, 10);

        expect(stats.total_cambios).toBe(3);
        // promedio: (10 + (-5) + 0.02) / 3
        expect(stats.diferencia_promedio).toBeCloseTo((10 - 5 + 0.02) / 3, 5);
        expect(stats.sobrantes).toBe(2); // 10 y 0.02 > 0
        expect(stats.faltantes).toBe(1); // -5
        expect(stats.cuadrados).toBe(0); // ninguno con |diferencia| < 0.01
    });
});
