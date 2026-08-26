import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FiscalServiceAbstract } from '../../shared/integration/fiscal-service.abstract';
import { 
  FiscalConfig, 
  FiscalResponse, 
  DocumentoElectronico, 
  ValidacionDocumento,
  ConsultaEstado,
  LibroContableFiscal 
} from '../../shared/integration/fiscal.interfaces';
import { DianXmlBuilderService } from './colombia/dian-xml-builder.service';
import { DianSignerService } from './colombia/dian-signer.service';
import { DianApiClientService, DianConfig } from './colombia/dian-api-client.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { decryptBuffer, decryptText } from '../../shared/utils/secure-config.utils';
import { fechaHoyEnPais, zonaHorariaDePais } from '../../shared/utils/fecha-peru.util';

@Injectable()
export class DianFiscalService extends FiscalServiceAbstract {
  private dianConfig: DianConfig;
  private defaultConfig: FiscalConfig;
  private defaultDianConfig: DianConfig;
  private currentCertificateBuffer?: Buffer;

  constructor(
    private readonly configService: ConfigService,
    private readonly xmlBuilder: DianXmlBuilderService,
    private readonly signer: DianSignerService,
    private readonly apiClient: DianApiClientService,
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService
  ) {
    const config: FiscalConfig = {
      url: configService.get('DIAN_URL') || 'https://vpfe-hab.dian.gov.co',
      usuario: configService.get('DIAN_USUARIO') || '',
      password: configService.get('DIAN_PASSWORD') || '',
      empresaId: configService.get('EMPRESA_NIT') || '',
      certificatePath: configService.get('DIAN_CERTIFICATE_PATH') || '/certificates/dian.p12',
      certificatePassword: configService.get('DIAN_CERTIFICATE_PASSWORD') || '',
      environment: configService.get('DIAN_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion',
      pais: 'CO'
    };
    
    super(config);
    this.defaultConfig = { ...config };

    // Configurar cliente DIAN
    this.dianConfig = {
      url: config.url,
      environment: config.environment === 'produccion' ? 'produccion' : 'habilitacion',
      nit: config.empresaId,
      softwareId: configService.get('DIAN_SOFTWARE_ID') || '',
      softwarePin: configService.get('DIAN_SOFTWARE_PIN') || '',
      testSetId: configService.get('DIAN_TEST_SET_ID')
    };
    this.defaultDianConfig = { ...this.dianConfig };

    this.apiClient.configurar(this.dianConfig);
  }

  async enviarDocumento(documento: DocumentoElectronico): Promise<FiscalResponse> {
    try {
      await this.loadTenantConfig();
      this.logOperation('Enviando documento a DIAN', { 
        tipo: documento.tipoDocumento, 
        numero: `${documento.serie}-${documento.numero}` 
      });

      // 1. Generar XML según tipo de documento
      const xmlContent = await this.generarXML(documento);
      
      // 2. Firmar XML con certificado digital
      const xmlSigned = await this.firmarXML(xmlContent);
      
      // 3. Generar ApplicationResponse (AttachedDocument)
      const attachedDocument = this.generarAttachedDocument(documento);
      
      // 4. Enviar a DIAN
      const dianResponse = await this.apiClient.enviarDocumento(
        xmlSigned,
        attachedDocument,
        this.dianConfig
      );

      if (dianResponse.success) {
        this.logSuccess('Documento aceptado por DIAN', { 
          cufe: dianResponse.cufe,
          documento: `${documento.serie}-${documento.numero}` 
        });

        return {
          success: true,
          codigoRespuesta: dianResponse.statusCode,
          descripcionRespuesta: dianResponse.statusDescription,
          cdr: dianResponse.xmlResponse,
          hash: dianResponse.cufe,
          metadata: {
            cufe: dianResponse.cufe,
            qrCode: dianResponse.qrCode
          }
        };
      } else {
        this.logError('Documento rechazado por DIAN', dianResponse.errors);
        return {
          success: false,
          codigoRespuesta: dianResponse.statusCode,
          descripcionRespuesta: dianResponse.statusDescription,
          errores: dianResponse.errors
        };
      }
    } catch (error) {
      this.logError('enviarDocumento', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico: ${error.message}`,
        errores: [error.message]
      };
    }
  }

  async consultarEstado(consulta: ConsultaEstado): Promise<FiscalResponse> {
    try {
      await this.loadTenantConfig();
      this.logOperation('Consultando estado en DIAN', consulta);
      
      // Consultar por CUFE (hash del documento)
      const cufe = consulta.hash || consulta.numeroDocumento;
      
      if (!cufe) {
        return {
          success: false,
          codigoRespuesta: '99',
          descripcionRespuesta: 'CUFE no proporcionado para consulta'
        };
      }

      const dianResponse = await this.apiClient.consultarEstado(cufe, this.dianConfig);

      return {
        success: dianResponse.success,
        codigoRespuesta: dianResponse.estado === 'ACEPTADO' ? '00' : '99',
        descripcionRespuesta: dianResponse.descripcion,
        metadata: {
          estado: dianResponse.estado,
          cufe: dianResponse.cufe,
          fechaProcesamiento: dianResponse.fechaProcesamiento
        }
      };
    } catch (error) {
      this.logError('consultarEstado', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error consultando estado: ${error.message}`
      };
    }
  }

  async validarDocumento(documento: DocumentoElectronico): Promise<ValidacionDocumento> {
    await this.loadTenantConfig();
    const errores: string[] = [];
    const advertencias: string[] = [];

    // Validaciones específicas de DIAN Colombia
    if (!documento.emisor.numeroDocumento || !/^\d{9,10}$/.test(documento.emisor.numeroDocumento)) {
      errores.push('NIT del emisor debe tener 9 o 10 dígitos');
    }

    if (documento.moneda !== 'COP' && documento.moneda !== 'USD') {
      errores.push('Moneda debe ser COP o USD');
    }

    // Validación de rangos autorizados por DIAN
    if (documento.tipoDocumento === '01' && !this.validarRangoAutorizado(documento.serie, documento.numero)) {
      errores.push('Número de factura fuera del rango autorizado por DIAN');
    }

    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      numeroDocumento: `${documento.serie}-${documento.numero}`,
      tipoDocumento: documento.tipoDocumento
    };
  }

  async generarXML(documento: DocumentoElectronico): Promise<string> {
    // Delegar generación de XML al servicio especializado
    switch (documento.tipoDocumento) {
      case '01': // Factura de Venta
        return await this.xmlBuilder.generarFacturaElectronica(documento);
      
      case '91': // Nota Crédito
        return await this.xmlBuilder.generarNotaCredito(documento);
      
      case '92': // Nota Débito
        return await this.xmlBuilder.generarNotaDebito(documento);
      
      default:
        throw new Error(`Tipo de documento no soportado: ${documento.tipoDocumento}`);
    }
  }

  async firmarXML(xmlContent: string): Promise<string> {
    if (!this.currentCertificateBuffer) {
      await this.loadTenantConfig();
    }

    // Delegar firma digital al servicio especializado
    return await this.signer.firmarXML(xmlContent, {
      certificatePath: this.config.certificatePath,
      certificateBuffer: this.currentCertificateBuffer,
      certificatePassword: this.config.certificatePassword,
      signatureId: 'xmldsig-dian-signature'
    });
  }

  async enviarLibroContable(libro: LibroContableFiscal): Promise<FiscalResponse> {
    this.logOperation('Libro contable DIAN no soportado', {
      periodo: libro.periodo,
      tipo: libro.tipoLibro,
    });
    return {
      success: false,
      codigoRespuesta: 'NO_SOPORTADO',
      descripcionRespuesta: 'DIAN no expone este flujo como envío genérico de libro contable.',
      errores: ['Operación no implementada: no se simuló una aceptación DIAN.'],
    };
  }

  // ========== MÉTODOS PRIVADOS ==========

  private generarAttachedDocument(documento: DocumentoElectronico): string {
    // Generar ApplicationResponse (documento adjunto requerido por DIAN).
    // La fecha y la hora van en horario de Bogotá: en UTC, un documento adjuntado
    // pasadas las 19:00 salía fechado al día siguiente ante la DIAN.
    return `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2">
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>1</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ID>${documento.serie}${documento.numero}</cbc:ID>
  <cbc:IssueDate>${fechaHoyEnPais('CO')}</cbc:IssueDate>
  <cbc:IssueTime>${new Date().toLocaleTimeString('en-GB', { timeZone: zonaHorariaDePais('CO'), hour12: false })}</cbc:IssueTime>
</ApplicationResponse>`;
  }

  private async validarRangoAutorizado(serie: string, numero: string): Promise<boolean> {
    try {
      const numeroInt = parseInt(numero, 10);
      const resultado = await this.apiClient.validarNumeracion(serie, numeroInt, this.dianConfig);
      return resultado.valido;
    } catch (error) {
      this.logger.warn(`No se pudo validar rango autorizado: ${error.message}`);
      return false; // Fallar cerrado: no asumir autorización ante una caída externa.
    }
  }

  /**
   * Obtiene rangos de numeración autorizados por DIAN
   */
  async obtenerRangosAutorizados(): Promise<any[]> {
    try {
      await this.loadTenantConfig();
      const resultado = await this.apiClient.consultarRangosAutorizados(this.dianConfig);
      return resultado.rangos;
    } catch (error) {
      this.logger.error('Error obteniendo rangos autorizados:', error);
      return [];
    }
  }

  async probarConfiguracion(tenantIdOverride?: string): Promise<any> {
    await this.loadTenantConfig(tenantIdOverride);
    const tenantId = tenantIdOverride || this.tenantContext.getTenantId();
    if (!tenantId) {
      return { ready: false, mode: 'NO_TENANT', missing: ['tenant_id'] };
    }

    const { data } = await this.supabase.getClient()
      .from('empresa_config')
      .select('pais,pais_id,is_demo,dian_activo,dian_environment,dian_usuario,dian_password,dian_software_id,dian_software_pin,dian_test_set_id,dian_resolucion_numero,dian_resolucion_prefijo,certificado_pfx,certificado_password')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const row = data as any;
    if (!row) return { ready: false, mode: 'MISSING_CONFIG', missing: ['empresa_config'] };
    if (String(row.pais || '').toUpperCase() !== 'CO' && Number(row.pais_id) !== 2) {
      return { ready: false, mode: 'WRONG_COUNTRY', missing: ['tenant_colombia'] };
    }
    if (row.is_demo === true) {
      return {
        ready: false,
        mode: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
        transportReachable: false,
        credentialsValidated: false,
        message:
          'La demo Colombia no abre conexiones a DIAN ni valida endpoints externos. Convierte la cuenta a real para probar el transporte.',
      };
    }

    const required: Record<string, unknown> = {
      usuario: row.dian_usuario,
      password: row.dian_password,
      softwareId: row.dian_software_id,
      softwarePin: row.dian_software_pin,
      resolucion: row.dian_resolucion_numero,
      prefijo: row.dian_resolucion_prefijo,
      certificado: row.certificado_pfx,
      certificadoPassword: row.certificado_password,
    };
    if (String(row.dian_environment || '').toUpperCase() !== 'PRODUCCION') {
      required.testSetId = row.dian_test_set_id;
    }
    const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length) {
      await this.persistirPrueba('INCOMPLETA', { missing }, tenantId);
      return { ready: false, mode: 'REAL', missing, transportReachable: false };
    }

    const connectivity = await this.apiClient.probarConectividad(this.dianConfig);
    const ready = connectivity.reachable === true;
    await this.persistirPrueba(ready ? 'TRANSPORTE_OK' : 'ERROR', connectivity, tenantId);
    return {
      ready,
      mode: 'REAL',
      transportReachable: connectivity.reachable,
      credentialsPresent: true,
      credentialsValidated: false,
      environment: this.dianConfig.environment,
      message: ready
        ? 'Servicio DIAN accesible. Las credenciales se validan durante el set de pruebas/homologación.'
        : connectivity.message,
    };
  }

  private async persistirPrueba(estado: string, detalle: any, tenantIdOverride?: string): Promise<void> {
    const tenantId = tenantIdOverride || this.tenantContext.getTenantId();
    if (!tenantId) return;
    await this.supabase.getClient().from('empresa_config').update({
      dian_ultima_prueba_at: new Date().toISOString(),
      dian_ultima_prueba_estado: estado,
      dian_ultima_prueba_detalle: detalle,
    }).eq('tenant_id', tenantId);
  }

  private async loadTenantConfig(tenantIdOverride?: string): Promise<void> {
    const tenantId = tenantIdOverride || this.tenantContext.getTenantId();
    if (!tenantId) {
      this.config = { ...this.defaultConfig };
      this.dianConfig = { ...this.defaultDianConfig };
      this.currentCertificateBuffer = undefined;
      return;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('empresa_config')
      .select([
        'ruc',
        'pais',
        'certificado_pfx',
        'certificado_password',
        'dian_activo',
        'dian_url',
        'dian_usuario',
        'dian_password',
        'dian_software_id',
        'dian_software_pin',
        'dian_test_set_id',
        'dian_environment',
      ].join(','))
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`No se pudo cargar config DIAN para tenant ${tenantId}: ${error.message}`);
    }

    const typedData = data as any;
    if (!typedData) {
      this.config = { ...this.defaultConfig };
      this.dianConfig = { ...this.defaultDianConfig };
      this.currentCertificateBuffer = undefined;
      return;
    }

    const envRaw = (typedData.dian_environment || 'HOMOLOGACION').toString().toUpperCase();
    const fiscalEnvironment = envRaw === 'PRODUCCION' ? 'produccion' : 'homologacion';
    const apiEnvironment = envRaw === 'PRODUCCION' ? 'produccion' : 'habilitacion';

    this.config = {
      ...this.defaultConfig,
      url: typedData.dian_url || this.defaultConfig.url,
      usuario: typedData.dian_usuario || this.defaultConfig.usuario,
      password: typedData.dian_password
        ? decryptText(this.configService, typedData.dian_password)
        : this.defaultConfig.password,
      empresaId: typedData.ruc || this.defaultConfig.empresaId,
      certificatePassword: typedData.certificado_password
        ? decryptText(this.configService, typedData.certificado_password)
        : this.defaultConfig.certificatePassword,
      environment: fiscalEnvironment,
      pais: 'CO',
    };

    this.dianConfig = {
      ...this.defaultDianConfig,
      url: typedData.dian_url || this.defaultDianConfig.url,
      environment: apiEnvironment,
      nit: typedData.ruc || this.defaultDianConfig.nit,
      softwareId: typedData.dian_software_id || this.defaultDianConfig.softwareId,
      softwarePin: typedData.dian_software_pin
        ? decryptText(this.configService, typedData.dian_software_pin)
        : this.defaultDianConfig.softwarePin,
      testSetId: typedData.dian_test_set_id || this.defaultDianConfig.testSetId,
    };

    this.apiClient.configurar(this.dianConfig);
    this.currentCertificateBuffer = decryptBuffer(this.configService, typedData.certificado_pfx) || undefined;
  }
}
