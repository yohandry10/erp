import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';
import { ProveedoresRepository } from '../repositories/proveedores.repository';
import { CreateProveedorDto, CondicionesPago } from '../dto/create-proveedor.dto';
import { UpdateProveedorDto } from '../dto/update-proveedor.dto';
import { AuditService } from '../../audit/audit.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('ProveedoresService', () => {
  let service: ProveedoresService;
  let repository: jest.Mocked<ProveedoresRepository>;
  let countryCode: 'PE' | 'AR' | 'CO';

  const mockProveedor = {
    id: 'test-id-123',
    tenant_id: 'tenant-123',
    ruc: '20100070970',
    razon_social: 'Test Company SAC',
    nombre_comercial: 'Test Company',
    direccion: 'Av. Test 123',
    telefono: '987654321',
    email: 'contacto@testcompany.com',
    contacto: 'Juan Perez',
    condiciones_pago: 'CONTADO',
    limite_credito: 10000,
    dias_credito: 30,
    estado: 'ACTIVO',
    activo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  beforeEach(async () => {
    countryCode = 'PE';
    const mockRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByRuc: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProveedoresService,
        {
          provide: ProveedoresRepository,
          useValue: mockRepository
        },
        {
          provide: AuditService,
          useValue: {
            registrarCambio: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            getClient: () => ({
              from: () => ({
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { pais: countryCode }, error: null }),
                  }),
                }),
              }),
            }),
          },
        },
      ]
    }).compile();

    service = module.get<ProveedoresService>(ProveedoresService);
    repository = module.get(ProveedoresRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all proveedores for a tenant', async () => {
      const proveedores = [mockProveedor];
      repository.findAll.mockResolvedValue(proveedores);

      const result = await service.findAll('tenant-123');

      expect(result).toEqual(proveedores);
      expect(repository.findAll).toHaveBeenCalledWith('tenant-123', undefined);
    });

    it('should apply filters when provided', async () => {
      const filters = { activo: true, search: 'Test' };
      repository.findAll.mockResolvedValue([mockProveedor]);

      await service.findAll('tenant-123', filters);

      expect(repository.findAll).toHaveBeenCalledWith('tenant-123', filters);
    });
  });

  describe('findById', () => {
    it('should return a proveedor by id', async () => {
      repository.findById.mockResolvedValue(mockProveedor);

      const result = await service.findById('test-id-123', 'tenant-123');

      expect(result).toEqual(mockProveedor);
      expect(repository.findById).toHaveBeenCalledWith('test-id-123', 'tenant-123');
    });

    it('should throw NotFoundException when proveedor not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent', 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('findByRuc', () => {
    it('should return a proveedor by RUC', async () => {
      repository.findByRuc.mockResolvedValue(mockProveedor);

      const result = await service.findByRuc('20100070970', 'tenant-123');

      expect(result).toEqual(mockProveedor);
      expect(repository.findByRuc).toHaveBeenCalledWith('20100070970', 'tenant-123');
    });
  });

  describe('create', () => {
    const validDto: CreateProveedorDto = {
      ruc: '20100070970',
      razon_social: 'Test Company SAC',
      email: 'contacto@testcompany.com',
      condiciones_pago: CondicionesPago.CONTADO,
      limite_credito: 10000,
      dias_credito: 30
    };

    it('should create a proveedor with valid data', async () => {
      repository.findByRuc.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockProveedor);

      const result = await service.create(validDto, 'tenant-123');

      expect(result).toEqual(mockProveedor);
      expect(repository.findByRuc).toHaveBeenCalledWith('20100070970', 'tenant-123');
      expect(repository.create).toHaveBeenCalledWith(validDto, 'tenant-123', undefined);
    });

    it('should throw ConflictException when RUC already exists', async () => {
      repository.findByRuc.mockResolvedValue(mockProveedor);

      await expect(service.create(validDto, 'tenant-123'))
        .rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for invalid RUC (not numeric)', async () => {
      const invalidDto = { ...validDto, ruc: '2012345678A' };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid RUC length', async () => {
      const invalidDto = { ...validDto, ruc: '123456' };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should accept valid Peru RUC (11 digits)', async () => {
      repository.findByRuc.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockProveedor);

      await service.create(validDto, 'tenant-123');

      expect(repository.create).toHaveBeenCalled();
    });

    it('should reject an incomplete tax identifier', async () => {
      const colombiaDto = { ...validDto, ruc: '123456789' };
      repository.findByRuc.mockResolvedValue(null);

      await expect(service.create(colombiaDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should validate and persist a Colombia NIT with verification digit', async () => {
      countryCode = 'CO';
      repository.findByRuc.mockResolvedValue(null);
      repository.create.mockImplementation(async (dto: any) => ({ ...mockProveedor, ...dto }));

      const result = await service.create({ ...validDto, ruc: '9001234568' }, 'tenant-123');

      expect(repository.findByRuc).toHaveBeenCalledWith('900123456-8', 'tenant-123');
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ruc: '900123456-8' }),
        'tenant-123',
        undefined,
      );
      expect(result.ruc).toBe('900123456-8');
    });

    it('should throw BadRequestException for invalid email', async () => {
      const invalidDto = { ...validDto, email: 'invalid-email' };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative limite_credito', async () => {
      const invalidDto = { ...validDto, limite_credito: -1000 };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should accept zero limite_credito', async () => {
      const dtoWithZero = { ...validDto, limite_credito: 0 };
      repository.findByRuc.mockResolvedValue(null);
      repository.create.mockResolvedValue({ ...mockProveedor, limite_credito: 0 });

      await service.create(dtoWithZero, 'tenant-123');

      expect(repository.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateDto: UpdateProveedorDto = {
      razon_social: 'Updated Company SAC',
      email: 'updated@testcompany.com'
    };

    it('should update a proveedor', async () => {
      repository.findById.mockResolvedValue(mockProveedor);
      repository.update.mockResolvedValue({ ...mockProveedor, ...updateDto });

      const result = await service.update('test-id-123', updateDto, 'tenant-123');

      expect(result.razon_social).toBe(updateDto.razon_social);
      expect(repository.findById).toHaveBeenCalledWith('test-id-123', 'tenant-123');
      expect(repository.update).toHaveBeenCalledWith('test-id-123', updateDto, 'tenant-123');
    });

    it('should throw NotFoundException when proveedor not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('non-existent', updateDto, 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('should validate RUC when updating', async () => {
      const invalidDto = { ruc: '123' };
      repository.findById.mockResolvedValue(mockProveedor);

      await expect(service.update('test-id-123', invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when updating to existing RUC', async () => {
      const dtoWithRuc = { ruc: '20987654326' };
      repository.findById.mockResolvedValue(mockProveedor);
      repository.findByRuc.mockResolvedValue({ ...mockProveedor, id: 'different-id' });

      await expect(service.update('test-id-123', dtoWithRuc, 'tenant-123'))
        .rejects.toThrow(ConflictException);
    });

    it('should allow updating to same RUC', async () => {
      const dtoWithSameRuc = { ruc: '20100070970' };
      repository.findById.mockResolvedValue(mockProveedor);
      repository.findByRuc.mockResolvedValue(mockProveedor);
      repository.update.mockResolvedValue(mockProveedor);

      await service.update('test-id-123', dtoWithSameRuc, 'tenant-123');

      expect(repository.update).toHaveBeenCalled();
    });

    it('should validate email when updating', async () => {
      const invalidDto = { email: 'invalid-email' };
      repository.findById.mockResolvedValue(mockProveedor);

      await expect(service.update('test-id-123', invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should validate limite_credito when updating', async () => {
      const invalidDto = { limite_credito: -500 };
      repository.findById.mockResolvedValue(mockProveedor);

      await expect(service.update('test-id-123', invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('softDelete', () => {
    it('should soft delete a proveedor', async () => {
      repository.findById.mockResolvedValue(mockProveedor);
      repository.softDelete.mockResolvedValue({ ...mockProveedor, activo: false });

      const result = await service.softDelete('test-id-123', 'tenant-123');

      expect(result.activo).toBe(false);
      expect(repository.findById).toHaveBeenCalledWith('test-id-123', 'tenant-123');
      expect(repository.softDelete).toHaveBeenCalledWith('test-id-123', 'tenant-123');
    });

    it('should throw NotFoundException when proveedor not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.softDelete('non-existent', 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('Email validation', () => {
    it('should accept valid email formats', async () => {
      const validEmails = [
        'test@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user_name@sub.example.com'
      ];

      repository.findByRuc.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockProveedor);

      for (const email of validEmails) {
        const dto: CreateProveedorDto = {
          ruc: '20100070970',
          razon_social: 'Test',
          email,
          condiciones_pago: CondicionesPago.CONTADO,
          limite_credito: 0,
          dias_credito: 0
        };

        await expect(service.create(dto, 'tenant-123')).resolves.toBeDefined();
      }
    });

    it('should reject invalid email formats', async () => {
      const invalidEmails = [
        'invalid',
        'invalid@',
        '@example.com',
        'invalid@example',
        'invalid @example.com',
        ''
      ];

      for (const email of invalidEmails) {
        const dto: CreateProveedorDto = {
          ruc: '20100070970',
          razon_social: 'Test',
          email,
          condiciones_pago: CondicionesPago.CONTADO,
          limite_credito: 0,
          dias_credito: 0
        };

        await expect(service.create(dto, 'tenant-123'))
          .rejects.toThrow(BadRequestException);
      }
    });
  });

  describe('RUC validation', () => {
    it('should accept valid RUC formats', async () => {
      const validRucs = [
        '20100070970', // Peru (11 digits)
      ];

      repository.findByRuc.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockProveedor);

      for (const ruc of validRucs) {
        const dto: CreateProveedorDto = {
          ruc,
          razon_social: 'Test',
          email: 'test@example.com',
          condiciones_pago: CondicionesPago.CONTADO,
          limite_credito: 0,
          dias_credito: 0
        };

        await expect(service.create(dto, 'tenant-123')).resolves.toBeDefined();
      }
    });

    it('should reject invalid RUC formats', async () => {
      const invalidRucs = [
        '123',           // Too short
        '123456789',     // Colombia NIT length is roadmap, not active
        '12345678901234', // Too long
        '2012345678A',   // Contains letters
        '201234567 89',  // Contains spaces
        ''               // Empty
      ];

      for (const ruc of invalidRucs) {
        const dto: CreateProveedorDto = {
          ruc,
          razon_social: 'Test',
          email: 'test@example.com',
          condiciones_pago: CondicionesPago.CONTADO,
          limite_credito: 0,
          dias_credito: 0
        };

        await expect(service.create(dto, 'tenant-123'))
          .rejects.toThrow(BadRequestException);
      }
    });
  });
});
