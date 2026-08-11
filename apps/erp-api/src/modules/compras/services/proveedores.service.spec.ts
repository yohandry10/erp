import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';
import { ProveedoresRepository } from '../repositories/proveedores.repository';
import { CondicionesPago, CreateProveedorDto } from '../dto/create-proveedor.dto';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('ProveedoresService - contrato maestro atómico 459', () => {
  let service: ProveedoresService;
  let repository: jest.Mocked<ProveedoresRepository>;
  let client: any;
  let countryCode: 'PE' | 'AR' | 'CO';

  const proveedor = {
    id: 'proveedor-1',
    tenant_id: 'tenant-1',
    ruc: '20100070970',
    razon_social: 'Proveedor Demo SAC',
    email: 'proveedor@demo.test',
    activo: true,
  };

  const validDto: CreateProveedorDto = {
    ruc: '20100070970',
    razon_social: 'Proveedor Demo SAC',
    email: 'proveedor@demo.test',
    condiciones_pago: CondicionesPago.CONTADO,
    limite_credito: 1000,
    dias_credito: 30,
  };

  beforeEach(async () => {
    countryCode = 'PE';
    client = {
      rpc: jest.fn(),
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockImplementation(async () => ({
        data: { pais: countryCode },
        error: null,
      })),
    };
    const repositoryMock = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByRuc: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProveedoresService,
        { provide: ProveedoresRepository, useValue: repositoryMock },
        {
          provide: SupabaseService,
          useValue: { getClient: jest.fn(() => client) },
        },
      ],
    }).compile();

    service = module.get(ProveedoresService);
    repository = module.get(ProveedoresRepository);
  });

  afterEach(() => jest.clearAllMocks());

  it('mantiene las lecturas tenant-scoped en el repositorio', async () => {
    repository.findAll.mockResolvedValue([proveedor] as any);
    repository.findById.mockResolvedValue(proveedor as any);
    repository.findByRuc.mockResolvedValue(proveedor as any);

    await expect(service.findAll('tenant-1', { activo: true })).resolves.toEqual([proveedor]);
    await expect(service.findById('proveedor-1', 'tenant-1')).resolves.toEqual(proveedor);
    await expect(service.findByRuc('20100070970', 'tenant-1')).resolves.toEqual(proveedor);

    expect(repository.findAll).toHaveBeenCalledWith('tenant-1', { activo: true });
    expect(repository.findById).toHaveBeenCalledWith('proveedor-1', 'tenant-1');
    expect(repository.findByRuc).toHaveBeenCalledWith('20100070970', 'tenant-1');
  });

  it('rechaza una lectura inexistente', async () => {
    repository.findById.mockResolvedValue(null as any);
    await expect(service.findById('missing', 'tenant-1')).rejects.toThrow(NotFoundException);
  });

  it('crea mediante una única RPC con actor, tenant y payload validado', async () => {
    client.rpc.mockResolvedValue({ data: { ...proveedor, idempotent: false }, error: null });

    await expect(service.create(validDto, 'tenant-1', 'user-1')).resolves.toMatchObject(proveedor);

    expect(client.rpc).toHaveBeenCalledWith('crear_proveedor_maestro_tx', {
      p_tenant_id: 'tenant-1',
      p_actor_id: 'user-1',
      p_proveedor: { ...validDto, documento_tipo: 'RUC' },
    });
    expect(repository.findByRuc).not.toHaveBeenCalled();
  });

  it('exige actor para crear', async () => {
    await expect(service.create(validDto, 'tenant-1')).rejects.toThrow(BadRequestException);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('normaliza y valida NIT colombiano antes de la RPC', async () => {
    countryCode = 'CO';
    client.rpc.mockResolvedValue({ data: { ...proveedor, ruc: '900123456-8' }, error: null });

    await service.create({ ...validDto, ruc: '9001234568' }, 'tenant-1', 'user-1');

    expect(client.rpc).toHaveBeenCalledWith(
      'crear_proveedor_maestro_tx',
      expect.objectContaining({
        p_proveedor: expect.objectContaining({
          ruc: '900123456-8',
          documento_tipo: 'NIT',
        }),
      }),
    );
  });

  it.each([
    [{ ...validDto, ruc: '123' }, 'identidad fiscal inválida'],
    [{ ...validDto, email: 'sin-arroba' }, 'email inválido'],
    [{ ...validDto, limite_credito: -1 }, 'crédito negativo'],
  ])('rechaza %s antes de escribir (%s)', async (dto) => {
    await expect(service.create(dto as CreateProveedorDto, 'tenant-1', 'user-1'))
      .rejects.toThrow(BadRequestException);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('actualiza mediante una única RPC sin writer fragmentado', async () => {
    client.rpc.mockResolvedValue({ data: { ...proveedor, razon_social: 'Editado SAC' }, error: null });

    const result = await service.update(
      'proveedor-1',
      { razon_social: 'Editado SAC', email: 'editado@demo.test' },
      'tenant-1',
      'user-1',
    );

    expect(result.razon_social).toBe('Editado SAC');
    expect(client.rpc).toHaveBeenCalledWith('actualizar_proveedor_maestro_tx', {
      p_proveedor_id: 'proveedor-1',
      p_tenant_id: 'tenant-1',
      p_actor_id: 'user-1',
      p_cambios: { razon_social: 'Editado SAC', email: 'editado@demo.test' },
    });
  });

  it('mapea colisión de identidad a ConflictException', async () => {
    client.rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'COMMERCIAL_SUPPLIER_IDENTITY_CONFLICT' },
    });

    await expect(service.update(
      'proveedor-1',
      { razon_social: 'Editado SAC' },
      'tenant-1',
      'user-1',
    )).rejects.toThrow(ConflictException);
  });

  it('mapea ausencia tenant-scoped a NotFoundException', async () => {
    client.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0002', message: 'COMMERCIAL_SUPPLIER_NOT_FOUND' },
    });

    await expect(service.update(
      'missing',
      { razon_social: 'Editado SAC' },
      'tenant-1',
      'user-1',
    )).rejects.toThrow(NotFoundException);
  });

  it('desactiva de forma idempotente mediante RPC y conserva el registro', async () => {
    client.rpc.mockResolvedValue({
      data: { ...proveedor, activo: false, idempotent: false },
      error: null,
    });

    const result = await service.softDelete('proveedor-1', 'tenant-1', 'user-1');

    expect(result.activo).toBe(false);
    expect(client.rpc).toHaveBeenCalledWith('desactivar_proveedor_maestro_tx', {
      p_proveedor_id: 'proveedor-1',
      p_tenant_id: 'tenant-1',
      p_actor_id: 'user-1',
    });
  });

  it('exige actor para editar y desactivar', async () => {
    await expect(service.update('proveedor-1', {}, 'tenant-1')).rejects.toThrow(BadRequestException);
    await expect(service.softDelete('proveedor-1', 'tenant-1')).rejects.toThrow(BadRequestException);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
