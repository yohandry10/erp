import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { RmaService } from './rma.service';

describe('RmaService - guards de aplicación 456', () => {
  const build = async (rpc: jest.Mock) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RmaService,
        { provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } },
      ],
    }).compile();
    return module.get(RmaService);
  };

  it('rechaza actor ausente antes de tocar la base', async () => {
    const rpc = jest.fn();
    const service = await build(rpc);
    expect(() =>
      service.aprobar('tenant-1', null, 'rma-1', { aprobar: true }, 'rma:approve:1'),
    ).toThrow(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('exige Idempotency-Key explícita en todos los writes', async () => {
    const rpc = jest.fn();
    const service = await build(rpc);
    expect(() =>
      service.recepcionar(
        'tenant-1',
        'actor-1',
        'rma-1',
        { items: [{ rma_item_id: 'f5af8a29-81bb-4793-a486-101781e82c2b', cantidad_recibida: 1 }] },
      ),
    ).toThrow(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['42501', ForbiddenException],
    ['23505', ConflictException],
    ['40001', ConflictException],
  ])('mapea SQLSTATE %s a la excepción HTTP esperada', async (code, expected) => {
    const service = await build(
      jest.fn().mockResolvedValue({ data: null, error: { code, message: 'fallo controlado' } }),
    );
    await expect(
      service.aprobar(
        'tenant-1',
        'actor-1',
        'rma-1',
        { aprobar: true },
        'rma:approve:001',
      ),
    ).rejects.toBeInstanceOf(expected as any);
  });
});
