import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { CotizacionesCompraService } from './cotizaciones-compra.service';
import { CotizacionesCompraRepository } from '../repositories/cotizaciones-compra.repository';
import { OrdenesCompraService } from './ordenes-compra.service';
import { CreateCotizacionCompraDto } from '../dto/create-cotizacion-compra.dto';
import { UpdateCotizacionCompraDto } from '../dto/update-cotizacion-compra.dto';

describe('CotizacionesCompraService', () => {
  let service: CotizacionesCompraService;
  let repository: jest.Mocked<CotizacionesCompraRepository>;
  let ordenesService: jest.Mocked<OrdenesCompraService>;

  const mockCotizacion = {
    id: 'cotizacion-123',
    tenant_id: 'tenant-123',
    numero: 'COT-2024-001',
    proveedor_id: 'proveedor-123',
    fecha_cotizacion: '2024-10-24',
    fecha_vencimiento: '2024-11-23',
    validez_dias: 30,
    estado: 'BORRADOR',
    subtotal: 10000,
    igv: 1800,
    total: 11800,
    observaciones: 'Test',
    orden_compra_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    detalles: [
      {
        id: 'detalle-1',
        cotizacion_id: 'cotizacion-123',
        producto_id: 'producto-1',
        descripcion: 'Producto Test',
        cantidad: 10,
        precio_unitario: 1000,
        subtotal: 10000
      }
    ],
    proveedor: {
      id: 'proveedor-123',
      ruc: '20123456789',
      razon_social: 'Proveedor Test SAC',
      condiciones_pago: 'CREDITO',
      dias_credito: 30
    }
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByNumero: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      updateEstado: jest.fn(),
      updateEstadoConObservaciones: jest.fn(),
      marcarComoConvertida: jest.fn()
    };

    const mockOrdenesService = {
      create: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CotizacionesCompraService,
        {
          provide: CotizacionesCompraRepository,
          useValue: mockRepository
        },
        {
          provide: OrdenesCompraService,
          useValue: mockOrdenesService
        }
      ]
    }).compile();

    service = module.get<CotizacionesCompraService>(CotizacionesCompraService);
    repository = module.get(CotizacionesCompraRepository);
    ordenesService = module.get(OrdenesCompraService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const validDto: CreateCotizacionCompraDto = {
      numero: 'COT-2024-001',
      proveedor_id: 'proveedor-123',
      validez_dias: 30,
      detalles: [
        {
          producto_id: 'producto-1',
          descripcion: 'Producto Test',
          cantidad: 10,
          precio_unitario: 1000
        }
      ]
    };

    it('should create a cotizacion with valid data', async () => {
      repository.findByNumero.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockCotizacion);

      const result = await service.create(validDto, 'tenant-123');

      expect(result).toEqual(mockCotizacion);
      expect(repository.findByNumero).toHaveBeenCalledWith('COT-2024-001', 'tenant-123');
      expect(repository.create).toHaveBeenCalledWith(validDto, 'tenant-123', undefined);
    });

    it('should throw ConflictException when numero already exists', async () => {
      repository.findByNumero.mockResolvedValue(mockCotizacion);

      await expect(service.create(validDto, 'tenant-123'))
        .rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when no detalles provided', async () => {
      const invalidDto = { ...validDto, detalles: [] };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid cantidad', async () => {
      const invalidDto = {
        ...validDto,
        detalles: [{ ...validDto.detalles[0], cantidad: 0 }]
      };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative precio_unitario', async () => {
      const invalidDto = {
        ...validDto,
        detalles: [{ ...validDto.detalles[0], precio_unitario: -100 }]
      };

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid validez_dias', async () => {
      const invalidDto = { ...validDto, validez_dias: -5 };
      repository.findByNumero.mockResolvedValue(null);

      await expect(service.create(invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('findById', () => {
    it('should return a cotizacion by id', async () => {
      repository.findById.mockResolvedValue(mockCotizacion);

      const result = await service.findById('cotizacion-123', 'tenant-123');

      expect(result).toEqual(mockCotizacion);
      expect(repository.findById).toHaveBeenCalledWith('cotizacion-123', 'tenant-123');
    });

    it('should throw NotFoundException when cotizacion not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent', 'tenant-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all cotizaciones for a tenant', async () => {
      const mockResult = { data: [mockCotizacion], count: 1 };
      repository.findAll.mockResolvedValue(mockResult);

      const result = await service.findAll('tenant-123');

      expect(result).toEqual(mockResult);
      expect(repository.findAll).toHaveBeenCalledWith('tenant-123', undefined);
    });

    it('should apply filters when provided', async () => {
      const filters = { estado: 'APROBADA', proveedor_id: 'proveedor-123' };
      repository.findAll.mockResolvedValue({ data: [], count: 0 });

      await service.findAll('tenant-123', filters);

      expect(repository.findAll).toHaveBeenCalledWith('tenant-123', filters);
    });
  });

  describe('update', () => {
    const updateDto: UpdateCotizacionCompraDto = {
      observaciones: 'Updated observations'
    };

    it('should update a cotizacion in BORRADOR state', async () => {
      repository.findById.mockResolvedValue(mockCotizacion);
      repository.update.mockResolvedValue({ ...mockCotizacion, ...updateDto });

      const result = await service.update('cotizacion-123', updateDto, 'tenant-123');

      expect(result.observaciones).toBe(updateDto.observaciones);
      expect(repository.update).toHaveBeenCalledWith('cotizacion-123', updateDto, 'tenant-123', undefined);
    });

    it('should throw BadRequestException when updating non-BORRADOR cotizacion', async () => {
      repository.findById.mockResolvedValue({ ...mockCotizacion, estado: 'ENVIADA' });

      await expect(service.update('cotizacion-123', updateDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when updating to existing numero', async () => {
      const dtoWithNumero = { numero: 'COT-2024-002' };
      repository.findById.mockResolvedValue(mockCotizacion);
      repository.findByNumero.mockResolvedValue({ ...mockCotizacion, id: 'different-id' });

      await expect(service.update('cotizacion-123', dtoWithNumero, 'tenant-123'))
        .rejects.toThrow(ConflictException);
    });

    it('should allow updating to same numero', async () => {
      const dtoWithSameNumero = { numero: 'COT-2024-001' };
      repository.findById.mockResolvedValue(mockCotizacion);
      repository.findByNumero.mockResolvedValue(mockCotizacion);
      repository.update.mockResolvedValue(mockCotizacion);

      await service.update('cotizacion-123', dtoWithSameNumero, 'tenant-123');

      expect(repository.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException when updating with empty detalles', async () => {
      const invalidDto = { detalles: [] };
      repository.findById.mockResolvedValue(mockCotizacion);

      await expect(service.update('cotizacion-123', invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid validez_dias in update', async () => {
      const invalidDto = { validez_dias: -5 };
      repository.findById.mockResolvedValue(mockCotizacion);

      await expect(service.update('cotizacion-123', invalidDto, 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('enviar', () => {
    it('should send a cotizacion in BORRADOR state', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const cotizacionWithFutureDate = {
        ...mockCotizacion,
        fecha_vencimiento: futureDate.toISOString().split('T')[0]
      };
      
      repository.findById.mockResolvedValue(cotizacionWithFutureDate);
      repository.updateEstado.mockResolvedValue({ ...cotizacionWithFutureDate, estado: 'ENVIADA' });

      const result = await service.enviar('cotizacion-123', 'tenant-123');

      expect(result.estado).toBe('ENVIADA');
      expect(repository.updateEstado).toHaveBeenCalledWith('cotizacion-123', 'ENVIADA', 'tenant-123', undefined);
    });

    it('should throw BadRequestException when not in BORRADOR state', async () => {
      repository.findById.mockResolvedValue({ ...mockCotizacion, estado: 'ENVIADA' });

      await expect(service.enviar('cotizacion-123', 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no detalles', async () => {
      repository.findById.mockResolvedValue({ ...mockCotizacion, detalles: [] });

      await expect(service.enviar('cotizacion-123', 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when cotizacion is expired', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const expiredCotizacion = {
        ...mockCotizacion,
        fecha_vencimiento: pastDate.toISOString().split('T')[0]
      };
      
      repository.findById.mockResolvedValue(expiredCotizacion);

      await expect(service.enviar('cotizacion-123', 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('aprobar', () => {
    it('should approve a cotizacion in ENVIADA state', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const cotizacionEnviada = {
        ...mockCotizacion,
        estado: 'ENVIADA',
        fecha_vencimiento: futureDate.toISOString().split('T')[0]
      };
      
      repository.findById.mockResolvedValue(cotizacionEnviada);
      repository.updateEstado.mockResolvedValue({ ...cotizacionEnviada, estado: 'APROBADA' });

      const result = await service.aprobar('cotizacion-123', 'tenant-123');

      expect(result.estado).toBe('APROBADA');
      expect(repository.updateEstado).toHaveBeenCalledWith('cotizacion-123', 'APROBADA', 'tenant-123', undefined);
    });

    it('should throw BadRequestException when not in ENVIADA state', async () => {
      repository.findById.mockResolvedValue(mockCotizacion);

      await expect(service.aprobar('cotizacion-123', 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when cotizacion is expired', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const expiredCotizacion = {
        ...mockCotizacion,
        estado: 'ENVIADA',
        fecha_vencimiento: pastDate.toISOString().split('T')[0]
      };
      
      repository.findById.mockResolvedValue(expiredCotizacion);

      await expect(service.aprobar('cotizacion-123', 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('rechazar', () => {
    it('should reject a cotizacion in ENVIADA state', async () => {
      const cotizacionEnviada = { ...mockCotizacion, estado: 'ENVIADA' };
      repository.findById.mockResolvedValue(cotizacionEnviada);
      repository.updateEstadoConObservaciones.mockResolvedValue({ ...cotizacionEnviada, estado: 'RECHAZADA' });

      const result = await service.rechazar('cotizacion-123', 'tenant-123', 'Precio muy alto');

      expect(result.estado).toBe('RECHAZADA');
      expect(repository.updateEstadoConObservaciones).toHaveBeenCalled();
    });

    it('should throw BadRequestException when not in ENVIADA state', async () => {
      repository.findById.mockResolvedValue(mockCotizacion);

      await expect(service.rechazar('cotizacion-123', 'tenant-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should append motivo to existing observaciones', async () => {
      const cotizacionEnviada = {
        ...mockCotizacion,
        estado: 'ENVIADA',
        observaciones: 'Existing notes'
      };
      repository.findById.mockResolvedValue(cotizacionEnviada);
      repository.updateEstadoConObservaciones.mockResolvedValue({ ...cotizacionEnviada, estado: 'RECHAZADA' });

      await service.rechazar('cotizacion-123', 'tenant-123', 'Precio muy alto');

      expect(repository.updateEstadoConObservaciones).toHaveBeenCalledWith(
        'cotizacion-123',
        'RECHAZADA',
        expect.stringContaining('Existing notes'),
        'tenant-123',
        undefined
      );
    });
  });

  describe('convertirAOrdenCompra', () => {
    it('should convert APROBADA cotizacion to orden de compra', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const cotizacionAprobada = {
        ...mockCotizacion,
        estado: 'APROBADA',
        fecha_vencimiento: futureDate.toISOString().split('T')[0]
      };
      
      const mockOrdenCompra = {
        id: 'orden-123',
        numero: 'OC-2024-001',
        proveedor_id: 'proveedor-123'
      };

      repository.findById.mockResolvedValue(cotizacionAprobada);
      ordenesService.create.mockResolvedValue(mockOrdenCompra as any);
      repository.marcarComoConvertida.mockResolvedValue({ ...cotizacionAprobada, orden_compra_id: 'orden-123' });

      const result = await service.convertirAOrdenCompra('cotizacion-123', 'tenant-123', 'OC-2024-001');

      expect(result).toEqual(mockOrdenCompra);
      expect(ordenesService.create).toHaveBeenCalled();
      expect(repository.marcarComoConvertida).toHaveBeenCalledWith('cotizacion-123', 'orden-123', 'tenant-123');
    });

    it('should throw BadRequestException when not in APROBADA state', async () => {
      repository.findById.mockResolvedValue(mockCotizacion);

      await expect(service.convertirAOrdenCompra('cotizacion-123', 'tenant-123', 'OC-2024-001'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when already converted', async () => {
      const convertedCotizacion = {
        ...mockCotizacion,
        estado: 'APROBADA',
        orden_compra_id: 'orden-existing'
      };
      repository.findById.mockResolvedValue(convertedCotizacion);

      await expect(service.convertirAOrdenCompra('cotizacion-123', 'tenant-123', 'OC-2024-001'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when cotizacion is expired', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const expiredCotizacion = {
        ...mockCotizacion,
        estado: 'APROBADA',
        fecha_vencimiento: pastDate.toISOString().split('T')[0]
      };
      
      repository.findById.mockResolvedValue(expiredCotizacion);

      await expect(service.convertirAOrdenCompra('cotizacion-123', 'tenant-123', 'OC-2024-001'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no detalles', async () => {
      const cotizacionSinDetalles = {
        ...mockCotizacion,
        estado: 'APROBADA',
        detalles: []
      };
      repository.findById.mockResolvedValue(cotizacionSinDetalles);

      await expect(service.convertirAOrdenCompra('cotizacion-123', 'tenant-123', 'OC-2024-001'))
        .rejects.toThrow(BadRequestException);
    });
  });
});
