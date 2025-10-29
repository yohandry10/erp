import { Test, TestingModule } from '@nestjs/testing';
import { ConciliacionService } from './conciliacion.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CsvParserService } from './csv-parser.service';

describe('ConciliacionService - Unit Tests', () => {
  let service: ConciliacionService;

  const mockSupabaseClient = {
    from: jest.fn(),
  };

  const mockSupabaseService = {
    getClient: jest.fn(() => mockSupabaseClient),
  };

  const mockCsvParserService = {
    parsearExtractoBancario: jest.fn(),
    listarPlantillas: jest.fn(),
    registrarPlantilla: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConciliacionService,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
        {
          provide: CsvParserService,
          useValue: mockCsvParserService,
        },
      ],
    }).compile();

    service = module.get<ConciliacionService>(ConciliacionService);

    jest.clearAllMocks();
  });

  describe('round2 helper method', () => {
    it('debe redondear correctamente a 2 decimales', () => {
      const service_any = service as any;
      
      expect(service_any.round2(10.123)).toBe(10.12);
      expect(service_any.round2(10.126)).toBe(10.13);
      expect(service_any.round2(10.125)).toBe(10.13);
      expect(service_any.round2(10)).toBe(10);
      expect(service_any.round2(10.1)).toBe(10.1);
      expect(service_any.round2(0)).toBe(0);
      expect(service_any.round2(-5.456)).toBe(-5.46);
    });
  });

  describe('listarPlantillasCsv', () => {
    it('debe listar plantillas CSV disponibles', async () => {
      const mockPlantillas = [
        { codigo: 'BCP', nombre: 'Banco de Crédito del Perú' },
        { codigo: 'BBVA', nombre: 'BBVA Continental' },
        { codigo: 'INTERBANK', nombre: 'Interbank' },
      ];

      mockCsvParserService.listarPlantillas.mockReturnValue(mockPlantillas);

      const resultado = await service.listarPlantillasCsv();

      expect(resultado.success).toBe(true);
      expect(resultado.data).toHaveLength(3);
      expect(resultado.data[0].codigo).toBe('BCP');
      expect(resultado.data[1].codigo).toBe('BBVA');
      expect(mockCsvParserService.listarPlantillas).toHaveBeenCalled();
    });

    it('debe retornar array vacío si no hay plantillas', async () => {
      mockCsvParserService.listarPlantillas.mockReturnValue([]);

      const resultado = await service.listarPlantillasCsv();

      expect(resultado.success).toBe(true);
      expect(resultado.data).toHaveLength(0);
    });
  });

  describe('registrarPlantillaCsv', () => {
    it('debe registrar una nueva plantilla CSV correctamente', async () => {
      const mockPlantilla = {
        codigo: 'INTERBANK',
        nombre: 'Interbank',
        descripcion: 'Plantilla para Interbank',
        tieneEncabezado: true,
        separador: ',',
        formatoFecha: 'DD/MM/YYYY',
        columnas: {
          fecha: 0,
          descripcion: 1,
          cargo: 2,
          abono: 3,
        },
        usaCargoAbonoSeparado: true,
        simbolosMoneda: ['S/', 'PEN'],
        separadorDecimal: '.',
        separadorMiles: ',',
      };

      mockCsvParserService.registrarPlantilla.mockImplementation(() => {});

      const resultado = await service.registrarPlantillaCsv(mockPlantilla);

      expect(resultado.success).toBe(true);
      expect(resultado.data.plantilla.codigo).toBe('INTERBANK');
      expect(resultado.data.plantilla.nombre).toBe('Interbank');
      expect(mockCsvParserService.registrarPlantilla).toHaveBeenCalledWith(
        expect.objectContaining({
          codigo: 'INTERBANK',
          nombre: 'Interbank',
        })
      );
    });

    it('debe convertir el código a mayúsculas', async () => {
      const mockPlantilla = {
        codigo: 'scotiabank',
        nombre: 'Scotiabank',
      };

      mockCsvParserService.registrarPlantilla.mockImplementation(() => {});

      const resultado = await service.registrarPlantillaCsv(mockPlantilla);

      expect(resultado.success).toBe(true);
      expect(resultado.data.plantilla.codigo).toBe('SCOTIABANK');
    });

    it('debe manejar errores al registrar plantilla', async () => {
      mockCsvParserService.registrarPlantilla.mockImplementation(() => {
        throw new Error('Error al registrar');
      });

      await expect(
        service.registrarPlantillaCsv({
          codigo: 'TEST',
          nombre: 'Test',
        }),
      ).rejects.toThrow();
    });
  });

  describe('Service instantiation', () => {
    it('debe crear una instancia del servicio correctamente', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(ConciliacionService);
    });

    it('debe tener todos los métodos públicos definidos', () => {
      expect(service.listarConciliaciones).toBeDefined();
      expect(service.obtenerConciliacion).toBeDefined();
      expect(service.crearConciliacion).toBeDefined();
      expect(service.importarCsv).toBeDefined();
      expect(service.matchAutomatico).toBeDefined();
      expect(service.marcarItem).toBeDefined();
      expect(service.obtenerDiferencias).toBeDefined();
      expect(service.cerrarConciliacion).toBeDefined();
      expect(service.listarPlantillasCsv).toBeDefined();
      expect(service.registrarPlantillaCsv).toBeDefined();
    });
  });
});
