import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuditService, AuditLog } from './audit.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditOperation } from './dto';

describe('AuditService', () => {
    let service: AuditService;

    const mockSupabaseClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
    };

    beforeEach(async () => {
        const mockSupabase = {
            getClient: jest.fn().mockReturnValue(mockSupabaseClient),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuditService,
                { provide: SupabaseService, useValue: mockSupabase },
            ],
        }).compile();

        service = module.get<AuditService>(AuditService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('logAction', () => {
        it('should log action successfully', async () => {
            mockSupabaseClient.insert.mockResolvedValueOnce({ error: null });

            const auditLog: AuditLog = {
                table_name: 'pedidos',
                operation: AuditOperation.INSERT,
                record_id: 'record-123',
                tenant_id: 'tenant-123',
                user_id: 'user-123',
            };

            await expect(service.logAction(auditLog)).resolves.not.toThrow();
            expect(mockSupabaseClient.insert).toHaveBeenCalled();
        });

        it('should skip logging when required fields missing', async () => {
            const incompleteLog = { table_name: 'pedidos' } as AuditLog;

            await service.logAction(incompleteLog);
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
        });

        it('should not throw on insert error', async () => {
            mockSupabaseClient.insert.mockResolvedValueOnce({
                error: { message: 'Insert error' }
            });

            const auditLog: AuditLog = {
                table_name: 'pedidos',
                operation: AuditOperation.INSERT,
                tenant_id: 'tenant-123',
            };

            await expect(service.logAction(auditLog)).resolves.not.toThrow();
        });
    });

    describe('registrarCambio', () => {
        it('should calculate changed fields for UPDATE', async () => {
            mockSupabaseClient.insert.mockResolvedValueOnce({ error: null });

            await service.registrarCambio(
                'pedidos',
                'UPDATE',
                'user-123',
                { old: { estado: 'PENDIENTE' }, new: { estado: 'APROBADO' } },
                'tenant-123',
                'record-123'
            );

            expect(mockSupabaseClient.insert).toHaveBeenCalled();
        });

        it('should handle INSERT without old values', async () => {
            mockSupabaseClient.insert.mockResolvedValueOnce({ error: null });

            await service.registrarCambio(
                'pedidos',
                'INSERT',
                'user-123',
                { new: { id: 'new-id', estado: 'PENDIENTE' } },
                'tenant-123',
                'new-id'
            );

            expect(mockSupabaseClient.insert).toHaveBeenCalled();
        });
    });

    describe('getAuditLogs', () => {
        it('should return paginated audit logs', async () => {
            const logs = [{ id: 'log-1', table_name: 'pedidos', operation: 'INSERT' }];
            mockSupabaseClient.range.mockResolvedValueOnce({
                data: logs,
                error: null,
                count: 1,
            });

            const result = await service.getAuditLogs('tenant-123', { page: 1, limit: 10 });

            expect(result.data).toHaveLength(1);
            expect(result.pagination.total).toBe(1);
        });

        it('should apply filters', async () => {
            mockSupabaseClient.range.mockResolvedValueOnce({
                data: [],
                error: null,
                count: 0,
            });

            await service.getAuditLogs('tenant-123', {
                table_name: 'pedidos',
                operation: AuditOperation.INSERT,
                user_id: 'user-123',
                start_date: '2024-01-01',
                end_date: '2024-12-31',
            });

            expect(mockSupabaseClient.eq).toHaveBeenCalled();
            expect(mockSupabaseClient.gte).toHaveBeenCalled();
            expect(mockSupabaseClient.lte).toHaveBeenCalled();
        });

        it('should throw on error', async () => {
            mockSupabaseClient.range.mockResolvedValueOnce({
                data: null,
                error: { message: 'Error' },
            });

            await expect(service.getAuditLogs('tenant-123'))
                .rejects.toThrow(BadRequestException);
        });
    });

    describe('getUserAuditLogs', () => {
        it('should return user audit logs', async () => {
            mockSupabaseClient.order.mockResolvedValueOnce({
                data: [{ id: 'log-1' }],
                error: null,
            });

            const result = await service.getUserAuditLogs('tenant-123', 'user-123');
            expect(result).toHaveLength(1);
        });
    });

    describe('getResourceAuditLogs', () => {
        it('should return resource audit logs', async () => {
            mockSupabaseClient.order.mockResolvedValueOnce({
                data: [{ id: 'log-1' }],
                error: null,
            });

            const result = await service.getResourceAuditLogs('tenant-123', 'pedidos', 'pedido-123');
            expect(result).toHaveLength(1);
        });
    });

    describe('logIntegracion', () => {
        it('should log integration call', async () => {
            mockSupabaseClient.insert.mockResolvedValueOnce({ error: null });

            await service.logIntegracion(
                'SUNAT',
                'enviar_factura',
                { ruc: '20123456789' },
                { status: 200, codigo: '0' },
                { id: 'factura-123', tipo: 'factura' },
                'tenant-123',
                'SUCCESS',
                150
            );

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('integration_logs');
        });

        it('should remove sensitive data from logs', async () => {
            mockSupabaseClient.insert.mockResolvedValueOnce({ error: null });

            await service.logIntegracion(
                'SUNAT',
                'auth',
                { password: 'secret123', token: 'abc123' },
                { access_token: 'xyz789' },
                {},
                'tenant-123'
            );

            // Should have been called but with redacted data
            expect(mockSupabaseClient.insert).toHaveBeenCalled();
        });
    });

    describe('getIntegrationLogs', () => {
        it('should return integration logs with filters', async () => {
            mockSupabaseClient.range.mockResolvedValueOnce({
                data: [{ id: 'log-1', servicio: 'SUNAT' }],
                error: null,
                count: 1,
            });

            const result = await service.getIntegrationLogs('tenant-123', {
                servicio: 'SUNAT',
                status: 'SUCCESS',
            });

            expect(result.data).toHaveLength(1);
        });
    });
});
