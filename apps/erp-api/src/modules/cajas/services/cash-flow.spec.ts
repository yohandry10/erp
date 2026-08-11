import { CashMovementsService, TipoMovimiento } from './cash-movements.service';
import { CashClosingService } from './cash-closing.service';
import { CashReconciliationService } from './cash-reconciliation.service';
import { CashReportsService } from './cash-reports.service';
import { CashAuthorizationService } from './cash-authorization.service';
import { CashAuditService } from './cash-audit.service';
import { BadRequestException } from '@nestjs/common';

// Mock Supabase Service
const createSupabaseMock = () => {
    const mockData: any = {
        sesiones_caja: {},
        movimientos_caja: [] as any[],
        configuracion_caja: {},
        ventas_pos: [] as any[],
        cambios_turno: null,
        retiros_caja: [] as any[],
    };

    const queryChains: Record<string, any> = {};

    const buildQuery = (table: string) => {
        if (queryChains[table]) {
            return queryChains[table];
        }

        let overrideResult: any = undefined;

        const chain: any = {
            select: jest.fn(() => chain),
            eq: jest.fn(() => chain),
            neq: jest.fn(() => chain),
            or: jest.fn(() => chain),
            order: jest.fn(() => chain),
            gte: jest.fn(() => chain),
            lte: jest.fn(() => chain),
            lt: jest.fn(() => chain),
            is: jest.fn(() => chain),
            limit: jest.fn(() => chain),

            single: jest.fn(async () => {
                if (overrideResult !== undefined) return overrideResult;
                return { data: mockData[table] ?? null, error: null };
            }),

            maybeSingle: jest.fn(async () => {
                if (overrideResult !== undefined) return overrideResult;
                return { data: mockData[table] ?? null, error: null };
            }),

            // IMPORTANTE: update devuelve chain para permitir .eq().select().single()
            update: jest.fn((data: any) => {
                if (mockData[table] === undefined || mockData[table] === null) {
                    mockData[table] = {};
                }

                if (Array.isArray(mockData[table])) {
                    // Si por alguna razón es array, añadimos un nuevo elemento
                    mockData[table].push(data);
                } else {
                    Object.assign(mockData[table], data);
                }

                return chain;
            }),

            // También insert devuelve chain (aunque ahora no encadenamos después)
            insert: jest.fn((data: any) => {
                if (!Array.isArray(mockData[table])) {
                    mockData[table] = [];
                }
                mockData[table].push(data);
                return chain;
            }),

            // Permite hacer: client.from(...).select().eq().mockResolvedValue(...)
            mockResolvedValue: (value: any) => {
                overrideResult = value;
                return chain;
            },

            // Para await directamente sobre la cadena (select/eq/order/etc)
            then: (resolve: any) => {
                const base =
                    overrideResult !== undefined
                        ? overrideResult
                        : { data: mockData[table] ?? [], error: null };
                return resolve(base);
            },
        };

        queryChains[table] = chain;
        return chain;
    };

    const client = {
        from: jest.fn((table: string) => buildQuery(table)),
        rpc: jest.fn(async (fn: string, params: any) => {
            if (fn === 'registrar_movimiento_caja') {
                const list = mockData.movimientos_caja as any[];
                const last = list.length > 0 ? list[list.length - 1] : null;

                const saldoAnterior = last?.saldo_nuevo ?? 0;
                const secuencia = (last?.secuencia ?? 0) + 1;

                const nuevoMovimiento = {
                    id: `mov-${secuencia}`,
                    sesion_caja_id: params.p_sesion_caja_id,
                    secuencia,
                    tipo_movimiento: params.p_tipo_movimiento,
                    monto: params.p_monto,
                    saldo_anterior: saldoAnterior,
                    saldo_nuevo: saldoAnterior + params.p_monto,
                    referencia_documento: params.p_referencia_documento ?? null,
                    referencia_tipo: params.p_referencia_tipo ?? null,
                    motivo: params.p_motivo ?? null,
                    usuario_id: params.p_usuario_id ?? null,
                    supervisor_id: params.p_supervisor_id ?? null,
                    ip_address: params.p_ip_address ?? null,
                    metadata: params.p_metadata ?? null,
                    tenant_id: params.p_tenant_id ?? 'tenant-123',
                    created_at: new Date().toISOString(),
                    timestamp: new Date().toISOString(),
                };

                list.push(nuevoMovimiento);

                return { data: nuevoMovimiento, error: null };
            }

            if (fn === 'validar_integridad_sesion') {
                return { data: { valido: true, errores: [] }, error: null };
            }

            if (fn === 'cerrar_caja_tx') {
                const contado = Number(params.p_payload?.monto_contado ?? 0);
                return {
                    data: {
                        sesion_id: params.p_sesion_id,
                        estado: 'CERRADA',
                        monto_esperado: 100,
                        monto_contado: contado,
                        diferencia: contado - 100,
                        hash_integridad: 'hash-cierre-451',
                        accounting_event_id: 'event-cierre-451',
                    },
                    error: null,
                };
            }

            return { data: null, error: null };
        }),
    };

    return {
        getClient: jest.fn(() => client),
        _mockData: mockData,
    };
};

describe('Cash Operations Flow Integration', () => {
    let movementsService: CashMovementsService;
    let closingService: CashClosingService;
    let reconciliationService: CashReconciliationService;
    let reportsService: CashReportsService;
    let authService: CashAuthorizationService;
    let auditService: CashAuditService;
    let supabaseService: any;

    const mockTenantId = 'tenant-123';
    const mockSesionId = 'sesion-123';
    const mockUserId = 'user-123';

    beforeEach(() => {
        supabaseService = createSupabaseMock();

        reconciliationService = new CashReconciliationService(supabaseService);
        movementsService = new CashMovementsService(supabaseService);

        reportsService = new CashReportsService(
            supabaseService,
            movementsService,
            reconciliationService,
        );

        // Auth service con comportamiento por defecto: NO requiere autorización extra
        authService = {
            validarDiferenciaCierre: jest.fn().mockResolvedValue({
                requiere_autorizacion: false,
                mensaje: 'OK',
            }),
        } as any;

        auditService = {
            registrarEvento: jest.fn(),
        } as any;

        closingService = new CashClosingService(
            supabaseService,
            movementsService,
            reconciliationService,
            authService,
            auditService,
        );
    });

    it('should validate denominations correctly', () => {
        const denom = {
            billetes: { '100': 1, '50': 2 }, // 200
            monedas: { '5': 4 }, // 20
        };
        const total = reconciliationService.calcularTotalDenominaciones(denom);
        expect(total).toBe(220);
    });

    it('bloquea el writer aislado que no puede acreditar contrapartida y outbox', async () => {
        await expect(movementsService.registrarMovimiento(
            mockSesionId,
            TipoMovimiento.RETIRO,
            -20,
            { referencia_documento: 'R001', usuario_id: mockUserId },
            mockTenantId,
        )).rejects.toThrow('flujo atómico de negocio');

        expect(supabaseService.getClient().rpc).not.toHaveBeenCalledWith(
            'registrar_movimiento_caja',
            expect.anything(),
        );
    });

    it('should validate closing with correct amount', async () => {
        const mockSession = {
            id: mockSesionId,
            monto_inicio: 100,
            estado: 'ABIERTA',
            tenant_id: mockTenantId,
        };

        const mockMovements = [{ secuencia: 1, monto: 50, tipo_movimiento: 'VENTA' }];

        const client = supabaseService.getClient();

        client
            .from('sesiones_caja')
            .select()
            .eq()
            .single.mockResolvedValue({ data: mockSession, error: null });

        jest.spyOn(movementsService, 'obtenerMovimientos').mockResolvedValue(
            mockMovements as any,
        );

        // Pre-cierre: sin pendientes
        client
            .from('ventas_pos')
            .select()
            .eq()
            .mockResolvedValue({ data: [], error: null });

        client
            .from('cambios_turno')
            .select()
            .eq()
            .maybeSingle.mockResolvedValue({ data: null, error: null });

        client
            .from('retiros_caja')
            .select()
            .eq()
            .mockResolvedValue({ data: [], error: null });

        jest.spyOn(movementsService, 'validarIntegridad').mockResolvedValue({
            valido: true,
            errores: [],
        });

        client
            .from('configuracion_caja')
            .select()
            .eq()
            .single.mockResolvedValue({
                data: { tolerancia_diferencia_cierre: 10 },
                error: null,
            });

        const validation = await closingService.validarPrecierre(
            mockSesionId,
            mockTenantId,
        );
        expect(validation.valido).toBe(true);

        const denominaciones = { billetes: { '100': 1 }, monedas: {} };

        await closingService.cerrarCaja(
            mockSesionId,
            {
                monto_contado: 100,
                denominaciones,
                notas: 'Cierre OK',
            },
            mockUserId,
            mockTenantId,
        );

        expect(client.rpc).toHaveBeenCalledWith('cerrar_caja_tx', {
            p_tenant_id: mockTenantId,
            p_sesion_id: mockSesionId,
            p_actor_id: mockUserId,
            p_payload: expect.objectContaining({
                monto_contado: 100,
                cierre_administrativo: false,
            }),
        });
        expect(client.from('sesiones_caja').update).not.toHaveBeenCalled();
    });

    it('should require supervisor if difference exceeds tolerance', async () => {
        const mockSession = {
            id: mockSesionId,
            monto_inicio: 100,
            estado: 'ABIERTA',
            tenant_id: mockTenantId,
        };

        const mockMovements: any[] = [];

        const client = supabaseService.getClient();

        client
            .from('sesiones_caja')
            .select()
            .eq()
            .single.mockResolvedValue({ data: mockSession, error: null });

        jest.spyOn(movementsService, 'obtenerMovimientos').mockResolvedValue(
            mockMovements,
        );

        client
            .from('ventas_pos')
            .select()
            .eq()
            .mockResolvedValue({ data: [], error: null });

        client
            .from('cambios_turno')
            .select()
            .eq()
            .maybeSingle.mockResolvedValue({ data: null, error: null });

        client
            .from('retiros_caja')
            .select()
            .eq()
            .mockResolvedValue({ data: [], error: null });

        jest.spyOn(movementsService, 'validarIntegridad').mockResolvedValue({
            valido: true,
            errores: [],
        });

        client
            .from('configuracion_caja')
            .select()
            .eq()
            .single.mockResolvedValue({
                data: { tolerancia_diferencia_cierre: 10 },
                error: null,
            });

        const denominaciones = {
            billetes: { '50': 1, '20': 1, '10': 1 },
            monedas: {},
        };

        // En este escenario SÍ queremos que la diferencia requiera autorización
        authService.validarDiferenciaCierre = jest.fn().mockResolvedValue({
            requiere_autorizacion: true,
            mensaje: 'Requiere supervisor',
        });

        await expect(
            closingService.cerrarCaja(
                mockSesionId,
                {
                    monto_contado: 80,
                    denominaciones,
                    notas: 'Falta dinero',
                },
                mockUserId,
                mockTenantId,
            ),
        ).rejects.toThrow(BadRequestException);
    });
});
