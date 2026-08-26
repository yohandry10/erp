import { ValidationService } from './validation.service';
import { ColombiaValidationService } from './colombia-validation.service';
import { ApiPeruService } from './apiperu.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';

const pfxValido = (taxId: string, password: string): Buffer => {
  const pair = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = pair.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date();
  certificate.validity.notAfter = new Date();
  certificate.validity.notAfter.setFullYear(certificate.validity.notBefore.getFullYear() + 5);
  const attributes = [
    { name: 'commonName', value: `EMPRESA ${taxId}` },
    { type: '2.5.4.5', value: taxId },
  ];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(pair.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(pair.privateKey, [certificate], password, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
};

describe('ValidationService', () => {
  let service: ValidationService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let colombiaService: jest.Mocked<ColombiaValidationService>;
  let apiPeruService: jest.Mocked<ApiPeruService>;
  let configService: jest.Mocked<ConfigService>;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  beforeEach(() => {
    supabaseService = {
      getClient: jest.fn().mockReturnValue(mockSupabaseClient),
    } as any;

    colombiaService = {
      validateNIT: jest.fn(),
    } as any;

    apiPeruService = {
      lookupDni: jest.fn(),
    } as any;

    configService = {
      get: jest.fn((key: string) =>
        key === 'CERT_ENCRYPTION_KEY'
          ? 'clave-de-cifrado-validacion-32-chars'
          : undefined,
      ),
    } as any;

    service = new ValidationService(supabaseService, colombiaService, apiPeruService, configService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateCertificate', () => {
    const baseEmpresa = {
      ruc: '20123456786',
      pais: 'PE',
      certificado_pfx: null,
      certificado_password: null,
      certificado_expira_en: null,
      sunat_environment: 'homologacion',
      sunat_cert_expected_ruc: null,
      arca_cuit_representada: null,
      arca_environment: null,
    };

    it('valida el certificado sintético para una demo PE en homologación', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...baseEmpresa, is_demo: true },
        error: null,
      });

      const result = await service.validateCertificate('tenant-demo');

      expect(result.isValid).toBe(true);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringMatching(/certificado simulado/i)]),
      );
    });

    it('no habilita el certificado sintético para una demo en producción', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          ...baseEmpresa,
          is_demo: true,
          sunat_environment: 'produccion',
        },
        error: null,
      });

      const result = await service.validateCertificate('tenant-demo-produccion');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No se ha cargado un certificado digital válido');
    });

    it('mantiene bloqueada una cuenta real sin certificado', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ...baseEmpresa, is_demo: false },
        error: null,
      });

      const result = await service.validateCertificate('tenant-real');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No se ha cargado un certificado digital válido');
    });

    it('valida titularidad argentina con CUIT y ambiente ARCA', async () => {
      const cuit = '30710158229';
      const password = 'clave-ar';
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          ...baseEmpresa,
          pais: 'AR',
          ruc: cuit,
          arca_cuit_representada: cuit,
          arca_environment: 'produccion',
          sunat_environment: null,
          certificado_pfx: pfxValido(cuit, password),
          certificado_password: password,
        },
        error: null,
      });

      const result = await service.validateCertificate('tenant-ar');

      expect(result.isValid).toBe(true);
      expect(result.rucMatches).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('valida titularidad colombiana con NIT y ambiente DIAN', async () => {
      const nit = '900123456-8';
      const password = 'clave-co';
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          ...baseEmpresa,
          pais: 'CO',
          ruc: nit,
          dian_environment: 'PRODUCCION',
          sunat_environment: null,
          certificado_pfx: pfxValido(nit, password),
          certificado_password: password,
        },
        error: null,
      });

      const result = await service.validateCertificate('tenant-co');

      expect(result.isValid).toBe(true);
      expect(result.rucMatches).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validateTaxIdFormat (via validateRucConfiguration)', () => {
    const tenantId = 'tenant-123';

    it('debe validar RUC peruano de 11 dígitos correctamente', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ruc: '20123456789', razon_social: 'Test SAC', direccion_fiscal: 'Av Test 123', pais_id: 'pais-pe', paises: { codigo_iso: 'PE', nombre: 'Perú' } },
        error: null,
      });

      const result = await service.validateRucConfiguration(tenantId);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('debe rechazar RUC peruano con menos de 11 dígitos', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ruc: '2012345', razon_social: 'Test SAC', direccion_fiscal: 'Av Test 123', pais_id: 'pais-pe', paises: { codigo_iso: 'PE', nombre: 'Perú' } },
        error: null,
      });

      const result = await service.validateRucConfiguration(tenantId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('El RUC debe tener exactamente 11 dígitos numéricos');
    });

    it('debe validar NIT colombiano usando ColombiaValidationService', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ruc: '900123456-1', razon_social: 'Test SAS', direccion_fiscal: 'Calle 123', pais_id: 'pais-co', paises: { codigo_iso: 'CO', nombre: 'Colombia' } },
        error: null,
      });

      colombiaService.validateNIT.mockReturnValue({ isValid: true });

      const result = await service.validateRucConfiguration(tenantId);

      expect(colombiaService.validateNIT).toHaveBeenCalledWith('900123456-1');
      expect(result.isValid).toBe(true);
    });

    // Chile y México tenían prueba propia y rama propia en el validador, pero el
    // ERP opera para Perú, Argentina y Colombia: ningún contribuyente podía
    // llegar a ellas. El informe daba por buena una configuración de un país en
    // el que no se puede emitir, que es justo lo que este informe existe para
    // detectar.
    it('informa que Chile no es un país soportado en vez de validar su RUT', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ruc: '12345678-9', razon_social: 'Test SpA', direccion_fiscal: 'Av Chile 123', pais_id: 'pais-cl', paises: { codigo_iso: 'CL', nombre: 'Chile' } },
        error: null,
      });

      const result = await service.validateRucConfiguration(tenantId);

      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toContain('país soportado');
    });

    it('informa cuando la empresa no declara país', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ruc: '20123456789', razon_social: 'Test SAC', direccion_fiscal: 'Av Test 123', pais_id: null, paises: null },
        error: null,
      });

      const result = await service.validateRucConfiguration(tenantId);

      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toContain('país soportado');
    });

    it('valida el CUIT cuando la empresa es argentina', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ruc: '30500001735', razon_social: 'Test SA', direccion_fiscal: 'Av Corrientes 1', pais_id: 'pais-ar', paises: { codigo_iso: 'AR', nombre: 'Argentina' } },
        error: null,
      });

      const result = await service.validateRucConfiguration(tenantId);

      expect(result.isValid).toBe(true);
    });
    it('debe detectar campos faltantes', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { ruc: '', razon_social: '', direccion_fiscal: '', pais_id: 'pais-pe', paises: { codigo_iso: 'PE', nombre: 'Perú' } },
        error: null,
      });

      const result = await service.validateRucConfiguration(tenantId);

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('RUC');
      expect(result.missingFields).toContain('Razón Social');
      expect(result.missingFields).toContain('Dirección Fiscal');
    });
  });

  describe('validateDocumentBeforeEmission', () => {
    it('debe validar documento con datos correctos', async () => {
      const document = {
        serie: 'F001',
        correlativo: '12345',
        total: 1000,
        items: [{ descripcion: 'Item 1', cantidad: 1, precio: 1000 }],
      };

      const result = await service.validateDocumentBeforeEmission(document);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('debe rechazar serie con formato incorrecto', async () => {
      const document = {
        serie: 'F00', // Solo 3 caracteres
        correlativo: '12345',
        total: 1000,
        items: [],
      };

      const result = await service.validateDocumentBeforeEmission(document);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'DOC_003')).toBe(true);
    });

    it('debe rechazar correlativo con más de 8 dígitos', async () => {
      const document = {
        serie: 'F001',
        correlativo: '123456789', // 9 dígitos
        total: 1000,
        items: [],
      };

      const result = await service.validateDocumentBeforeEmission(document);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'DOC_004')).toBe(true);
    });

    it('debe rechazar monto total negativo', async () => {
      const document = {
        serie: 'F001',
        correlativo: '12345',
        total: -100,
        items: [],
      };

      const result = await service.validateDocumentBeforeEmission(document);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'DOC_002')).toBe(true);
    });

    it('debe agregar warning para documentos con más de 500 items', async () => {
      const items = Array(501).fill({ descripcion: 'Item', cantidad: 1, precio: 10 });
      const document = {
        serie: 'F001',
        correlativo: '12345',
        total: 5010,
        items,
      };

      const result = await service.validateDocumentBeforeEmission(document);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.code === 'DOC_WARN_001')).toBe(true);
    });

    it('debe rechazar documento que excede límite de items', async () => {
      const items = Array(1000).fill({ descripcion: 'Item', cantidad: 1, precio: 10 });
      const document = {
        serie: 'F001',
        correlativo: '12345',
        total: 10000,
        items,
      };

      const result = await service.validateDocumentBeforeEmission(document);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'DOC_001')).toBe(true);
    });
  });

  describe('lookupDni', () => {
    it('debe llamar a ApiPeruService para consulta de DNI', async () => {
      const mockResult = {
        dni: '12345678',
        nombres: 'Juan',
        apellidoPaterno: 'Pérez',
        apellidoMaterno: 'García',
        nombreCompleto: 'Juan Pérez García',
        codigoVerificacion: 'ABC123',
      };

      apiPeruService.lookupDni.mockResolvedValue(mockResult);

      const result = await service.lookupDni({ dni: '12345678' });

      expect(apiPeruService.lookupDni).toHaveBeenCalledWith('12345678');
      expect(result).toEqual(mockResult);
    });
  });

  describe('getValidationStatus', () => {
    it('debe retornar estado completo cuando todo es válido', async () => {
      // Mock validateCertificate
      jest.spyOn(service, 'validateCertificate').mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      // Mock validateRucConfiguration
      jest.spyOn(service, 'validateRucConfiguration').mockResolvedValue({
        isValid: true,
        missingFields: [],
        errors: [],
      });

      const result = await service.getValidationStatus('tenant-123');

      expect(result.overallStatus).toBe('complete');
    });

    it('debe retornar estado warning cuando hay advertencias de certificado', async () => {
      jest.spyOn(service, 'validateCertificate').mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: ['El certificado vencerá en 15 días'],
        daysUntilExpiration: 15,
      });

      jest.spyOn(service, 'validateRucConfiguration').mockResolvedValue({
        isValid: true,
        missingFields: [],
        errors: [],
      });

      const result = await service.getValidationStatus('tenant-123');

      expect(result.overallStatus).toBe('warning');
    });

    it('debe retornar estado incomplete cuando hay errores', async () => {
      jest.spyOn(service, 'validateCertificate').mockResolvedValue({
        isValid: false,
        errors: ['Certificado no encontrado'],
        warnings: [],
      });

      jest.spyOn(service, 'validateRucConfiguration').mockResolvedValue({
        isValid: true,
        missingFields: [],
        errors: [],
      });

      const result = await service.getValidationStatus('tenant-123');

      expect(result.overallStatus).toBe('incomplete');
    });
  });
});
