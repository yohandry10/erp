import {
    CashFraudDetectionService,
    SeveridadAnomalia,
} from './cash-fraud-detection.service';
import { CashMovementsService } from './cash-movements.service';

// ---- Supabase mock helper ----
const createSupabaseMock = () => {
    const mockData: any = {
        sesiones_caja: {},
        movimientos_caja: [],
        caja_audit_log: [],
    };

    const buildQuery = (table: string) => {
        const chain: any = {
            select: jest.fn(() => chain),
            eq: jest.fn(() => chain),
            neq: jest.fn(() => chain),
            or: jest.fn(() => chain),
            order: jest.fn(() => chain),
            gte: jest.fn(() => chain),
            lte: jest.fn(() => chain),
            lt: jest.fn(() => chain),
            limit: jest.fn(() => chain),

            single: jest.fn(async () => ({
                data: mockData[table] ?? null,
                error: null,
            })),

            maybeSingle: jest.fn(async () => ({
                data: mockData[table] ?? null,
                error: null,
            })),

            update: jest.fn(async (data: any) => {
                if (Array.isArray(mockData[table])) {
                    mockData[table].push(data);
                } else if (mockData[table]) {
                    Object.assign(mockData[table], data);
                } else {
                    mockData[table] = data;
                }
                return { data: mockData[table], error: null };
            }),

            insert: jest.fn(async (data: any | any[]) => {
                const rows = Array.isArray(data) ? data : [data];
                if (!Array.isArray(mockData[table])) {
                    mockData[table] = [];
                }
                mockData[table].push(...rows);
                return { data: rows, error: null };
            }),

            then: (resolve: any) =>
                resolve({ data: mockData[table] ?? [], error: null }),
        };

        return chain;
    };

    const client = {
        from: jest.fn((table: string) => buildQuery(table)),
        rpc: jest.fn(),
    };

    return {
        getClient: jest.fn(() => client),
        __client: client,
        __data: mockData,
    };
};

describe('CashFraudDetectionService', () => {
    let supabaseService: ReturnType<typeof createSupabaseMock>;
    let movementsService: jest.Mocked<Partial<CashMovementsService>>;
    let fraudService: CashFraudDetectionService;

    const mockSesionId = 'sesion-123';
    const mockTenantId = 'tenant-123';

    beforeEach(() => {
        jest.clearAllMocks();

        supabaseService = createSupabaseMock();

        movementsService = {
            contarMovimientosPorTipo: jest.fn(),
            detectarGapsSecuencia: jest.fn(),
            obtenerMovimientos: jest.fn(),
            recalcularSaldoEsperado: jest.fn(),
            obtenerUltimoMovimiento: jest.fn(),
        };

        fraudService = new CashFraudDetectionService(
            supabaseService as any,
            movementsService as any,
        );
    });

    it('should detect excessive manual adjustments as a HIGH severity anomaly', async () => {
        movementsService.contarMovimientosPorTipo!.mockResolvedValue(5);

        const result = await (fraudService as any).detectarAjustesExcesivos(
            mockSesionId,
            mockTenantId,
        );

        expect(movementsService.contarMovimientosPorTipo).toHaveBeenCalledWith(
            mockSesionId,
            expect.anything(), // TipoMovimiento.AJUSTE
            mockTenantId,
        );

        expect(result).not.toBeNull();
        expect(result.tipo).toBe('AJUSTES_EXCESIVOS');
        expect(result.severidad).toBe(SeveridadAnomalia.ALTA);
        expect(result.descripcion).toContain('5');
    });

    it('should return null when manual adjustments are within allowed limit', async () => {
        movementsService.contarMovimientosPorTipo!.mockResolvedValue(2);

        const result = await (fraudService as any).detectarAjustesExcesivos(
            mockSesionId,
            mockTenantId,
        );

        expect(result).toBeNull();
    });

    it('should detect sequence gaps as CRITICAL anomaly', async () => {
        movementsService.detectarGapsSecuencia!.mockResolvedValue([2, 4, 7]);

        const result = await (fraudService as any).detectarGapsSecuencia(
            mockSesionId,
            mockTenantId,
        );

        expect(movementsService.detectarGapsSecuencia).toHaveBeenCalledWith(
            mockSesionId,
            mockTenantId,
        );

        expect(result).not.toBeNull();
        expect(result.tipo).toBe('GAPS_SECUENCIA');
        expect(result.severidad).toBe(SeveridadAnomalia.CRITICA);
        expect(result.detalles.gaps).toEqual([2, 4, 7]);
    });

    it('should detect mathematical mismatch between calculated and registered balance', async () => {
        // IMPORTANT: mockeamos el método del propio servicio, no el de Movements
        const spy = jest
            .spyOn(fraudService, 'recalcularSaldoEsperado')
            .mockResolvedValue({
                valido: false,
                saldo_calculado: 200,
                saldo_registrado: 150,
                diferencia: 50,
            });

        const result = await (fraudService as any).detectarDescuadreMatematico(
            mockSesionId,
            mockTenantId,
        );

        expect(spy).toHaveBeenCalledWith(mockSesionId, mockTenantId);

        expect(result).not.toBeNull();
        expect(result.tipo).toBe('DESCUADRE_MATEMATICO');
        expect(result.severidad).toBe(SeveridadAnomalia.CRITICA);
        expect(result.detalles.saldo_calculado).toBe(200);
        expect(result.detalles.saldo_registrado).toBe(150);
        expect(result.detalles.diferencia).toBe(50);
    });

    it('should return null when calculated and registered balance match', async () => {
        const spy = jest
            .spyOn(fraudService, 'recalcularSaldoEsperado')
            .mockResolvedValue({
                valido: true,
                saldo_calculado: 100,
                saldo_registrado: 100,
                diferencia: 0,
            });

        const result = await (fraudService as any).detectarDescuadreMatematico(
            mockSesionId,
            mockTenantId,
        );

        expect(spy).toHaveBeenCalledWith(mockSesionId, mockTenantId);
        expect(result).toBeNull();
    });

    it('should detect abnormally short shift duration', async () => {
        const apertura = new Date('2024-01-01T10:00:00Z');
        const cierre = new Date('2024-01-01T11:00:00Z');

        supabaseService.__data.sesiones_caja = {
            hora_apertura: apertura.toISOString(),
            hora_cierre: cierre.toISOString(),
            estado: 'CERRADA',
        };

        const result = await (fraudService as any).detectarDuracionAnormal(
            mockSesionId,
            mockTenantId,
        );

        expect(result).not.toBeNull();
        expect(result.tipo).toBe('TURNO_MUY_CORTO');
        expect(result.severidad).toBe(SeveridadAnomalia.MEDIA);
        expect(result.detalles.minimo_esperado).toBe(2);
    });

    it('should detect large adjustments/withdrawals near closing time', async () => {
        const cierre = new Date('2024-01-01T12:00:00Z');
        supabaseService.__data.sesiones_caja = {
            hora_cierre: cierre.toISOString(),
            estado: 'CERRADA',
        };

        movementsService.obtenerMovimientos!.mockResolvedValue([
            {
                secuencia: 1,
                tipo_movimiento: 'VENTA',
                monto: 50,
                timestamp: new Date('2024-01-01T09:00:00Z').toISOString(),
            },
            {
                secuencia: 2,
                tipo_movimiento: 'RETIRO',
                monto: -150,
                timestamp: new Date('2024-01-01T11:30:00Z').toISOString(),
            },
        ] as any);

        const result = await (fraudService as any).detectarMovimientosSospechosos(
            mockSesionId,
            mockTenantId,
        );

        expect(movementsService.obtenerMovimientos).toHaveBeenCalledWith(
            mockSesionId,
            mockTenantId,
        );
        expect(result).not.toBeNull();
        expect(result.tipo).toBe('MOVIMIENTOS_PRE_CIERRE');
        expect(result.severidad).toBe(SeveridadAnomalia.ALTA);
        expect(result.detalles.movimientos).toHaveLength(1);
        expect(result.detalles.movimientos[0].monto).toBe(-150);
    });

    it('should calculate risk score based on anomaly severities', async () => {
        jest.spyOn(fraudService, 'detectarAnomalias').mockResolvedValue([
            {
                tipo: 'A',
                severidad: SeveridadAnomalia.CRITICA,
                descripcion: '',
                detalles: {},
                timestamp: new Date().toISOString(),
            },
            {
                tipo: 'B',
                severidad: SeveridadAnomalia.ALTA,
                descripcion: '',
                detalles: {},
                timestamp: new Date().toISOString(),
            },
            {
                tipo: 'C',
                severidad: SeveridadAnomalia.MEDIA,
                descripcion: '',
                detalles: {},
                timestamp: new Date().toISOString(),
            },
            {
                tipo: 'D',
                severidad: SeveridadAnomalia.BAJA,
                descripcion: '',
                detalles: {},
                timestamp: new Date().toISOString(),
            },
        ]);

        const score = await fraudService.calcularScoreRiesgo(
            mockSesionId,
            mockTenantId,
        );

        expect(score).toBe(85); // 40 + 25 + 15 + 5
    });

    it('should generate user risk report combining pattern and session scores', async () => {
        const patronMock = {
            sobrantes: 2,
            faltantes: 1,
            total_sesiones: 3,
            diferencia_promedio: 10,
            diferencia_maxima: 25,
        };

        jest.spyOn(fraudService, 'analizarPatronDiferencias').mockResolvedValue(
            patronMock as any,
        );

        supabaseService.__data.sesiones_caja = [
            { id: 's1', hora_apertura: '2024-01-01T10:00:00Z', diferencia: 0 },
            { id: 's2', hora_apertura: '2024-01-02T10:00:00Z', diferencia: 5 },
        ];

        jest.spyOn(fraudService, 'calcularScoreRiesgo').mockImplementation(
            async (sesionId: string) => {
                if (sesionId === 's1') return 20;
                if (sesionId === 's2') return 40;
                return 0;
            },
        );

        const report = await fraudService.generarReporteRiesgoUsuario(
            'user-123',
            mockTenantId,
        );

        expect(report.usuario_id).toBe('user-123');
        expect(report.patron_diferencias).toEqual(patronMock);
        expect(report.score_riesgo_promedio).toBe(30); // (20 + 40) / 2
        expect(report.nivel_riesgo).toBe('MEDIO');
        expect(report.sesiones_analizadas).toBe(2);
    });
});
