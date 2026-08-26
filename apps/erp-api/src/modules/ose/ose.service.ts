import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XmlSigner } from '@erp-suite/crypto';
import { createHash } from 'crypto';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { CircuitBreakerService, CircuitBreakerOpenError, CircuitStats } from '../../shared/resilience/circuit-breaker.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { decryptBuffer, decryptText } from '../../shared/utils/secure-config.utils';
import {
  canUseRuntimeDemoCertificate,
  loadRuntimeDemoCertificate,
} from '../../shared/utils/demo-certificate.utils';

export interface OseConfig {
  url: string;
  cpeUrl?: string;
  greUrl?: string;
  summaryUrl?: string;
  queryUrl?: string;
  greTransport?: 'soap' | 'rest';
  greRestBaseUrl?: string;
  greRestAuthUrl?: string;
  greRestClientId?: string;
  greRestClientSecret?: string;
  usuario: string;
  password: string;
  ruc: string;
  certificatePath: string;
  certificatePassword: string;
  environment: 'homologacion' | 'produccion';
  isDemoTenant?: boolean;
}

export interface SunatResponse {
  success: boolean;
  codigoRespuesta: string;
  descripcionRespuesta: string;
  cdr?: string;
  observaciones?: string[];
  numeroComprobante?: string;
  hashCPE?: string;
  ticket?: string;
}

interface ParsedCdrMetadata {
  codigoRespuesta: string;
  descripcionRespuesta: string;
  observaciones: string[];
}

export interface SunatRuntimeOptions {
  tenantId: string;
}

export interface OseTenantConfigurationStatus {
  configuracion: {
    applicable: boolean;
    environment: string;
    url: string;
    ruc: string;
    certificateExists: boolean;
    usuario: string;
    password: string;
    isDemoTenant: boolean;
    connectivityStatus: 'NO_PROBADO';
    transportStatus: 'BLOQUEADO_DEMO' | 'CONFIGURADO_NO_PROBADO';
  };
  verificacion: {
    valid: boolean;
    errors: string[];
    connectivityStatus: 'NO_PROBADO';
  };
}

interface OseRuntime {
  config: OseConfig;
  signer: XmlSigner;
}

// Q33: Nombres de circuitos para servicios SUNAT
const CIRCUIT_SUNAT_CPE = 'SUNAT_CPE';
const CIRCUIT_SUNAT_GRE = 'SUNAT_GRE';
const CIRCUIT_SUNAT_QUERY = 'SUNAT_QUERY';

type SunatEndpointKind = 'cpe' | 'gre' | 'summary' | 'query';

const SUNAT_ENDPOINTS: Record<'homologacion' | 'produccion', Record<SunatEndpointKind, string>> = {
  homologacion: {
    cpe: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    gre: 'https://e-beta.sunat.gob.pe/ol-ti-itemision-guia-gem-beta/billService',
    summary: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    query: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  },
  produccion: {
    cpe: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
    gre: 'https://e-guiaremision.sunat.gob.pe/ol-ti-itemision-guia-gem/billService',
    summary: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
    query: 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService',
  },
};

@Injectable()
export class OseService implements OnModuleInit {
  private readonly logger = new Logger(OseService.name);
  // Opcional: en produccion no existe firmador global, firma el del tenant.
  private xmlSigner?: XmlSigner;
  private oseConfig: OseConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
    @Optional() private readonly supabaseService?: SupabaseService,
  ) {
    this.initializeOseConfig();
    this.initializeXmlSigner();
  }

  /**
   * Q33: Inicializar circuit breakers para servicios SUNAT
   */
  onModuleInit() {
    // Circuit breaker para envío de CPE (facturas/boletas)
    this.circuitBreaker.registerCircuit(CIRCUIT_SUNAT_CPE, {
      failureThreshold: 5,    // 5 fallos consecutivos para abrir
      successThreshold: 2,    // 2 éxitos para cerrar
      timeout: 60000,         // 1 minuto antes de probar de nuevo
    });

    // Circuit breaker para envío de GRE (guías de remisión)
    this.circuitBreaker.registerCircuit(CIRCUIT_SUNAT_GRE, {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
    });

    // Circuit breaker para consultas de estado
    this.circuitBreaker.registerCircuit(CIRCUIT_SUNAT_QUERY, {
      failureThreshold: 3,    // Más sensible para consultas
      successThreshold: 1,
      timeout: 30000,         // 30 segundos
    });

    this.logger.log('✅ Circuit breakers inicializados para servicios SUNAT');
  }

  private initializeOseConfig() {
    const environment = this.configService.get('SUNAT_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion';

    this.oseConfig = {
      url: this.getConfigValue('SUNAT_CPE_URL', 'OSE_URL') || SUNAT_ENDPOINTS[environment].cpe,
      cpeUrl: this.getConfigValue('SUNAT_CPE_URL'),
      greUrl: this.getConfigValue('SUNAT_GRE_URL'),
      summaryUrl: this.getConfigValue('SUNAT_SUMMARY_URL'),
      queryUrl: this.getConfigValue('SUNAT_QUERY_URL'),
      greTransport: this.getGreTransport(),
      greRestBaseUrl: this.getConfigValue('SUNAT_GRE_REST_BASE_URL') || 'https://api-cpe.sunat.gob.pe/v1',
      greRestAuthUrl: this.getConfigValue('SUNAT_GRE_AUTH_URL'),
      greRestClientId: this.getConfigValue('SUNAT_GRE_CLIENT_ID', 'SUNAT_API_CLIENT_ID'),
      greRestClientSecret: this.getConfigValue('SUNAT_GRE_CLIENT_SECRET', 'SUNAT_API_CLIENT_SECRET'),
      usuario: this.getConfigValue('SUNAT_USERNAME', 'OSE_USUARIO', 'OSE_USERNAME') || '',
      password: this.getConfigValue('SUNAT_PASSWORD', 'OSE_PASSWORD') || '',
      ruc: this.configService.get('EMPRESA_RUC') || '',
      certificatePath: this.getConfigValue('CERTIFICATE_PATH', 'PFX_PATH') || '/certificates/certificado.pfx',
      certificatePassword: this.getConfigValue('CERTIFICATE_PASSWORD', 'PFX_PASS') || '',
      environment,
    };

    this.logger.log(`🔧 OSE configurado para: ${this.oseConfig.environment}`);
    this.logger.log(`🔧 URL OSE: ${this.oseConfig.url}`);
    this.logger.log(`🔧 RUC Empresa: ${this.oseConfig.ruc}`);
  }

  private getConfigValue(...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.configService.get<string>(key);
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private getGreTransport(): 'soap' | 'rest' {
    const configured = this.getConfigValue('SUNAT_GRE_TRANSPORT')?.toLowerCase();
    return configured === 'rest' ? 'rest' : 'soap';
  }

  private initializeXmlSigner() {
    const requireRealCertificate = this.oseConfig.environment === 'produccion'
      || this.configService.get<string | boolean>('REQUIRE_REAL_FISCAL_CERTIFICATE') === true
      || this.configService.get<string | boolean>('REQUIRE_REAL_FISCAL_CERTIFICATE') === 'true';
    // El certificado demo se genera aqui mismo, autofirmado. En un servidor de
    // produccion eso significaria firmar comprobantes de un cliente con un
    // certificado inventado y que el cliente no se enterara. La decision no
    // puede depender de SUNAT_ENVIRONMENT —que por defecto es homologacion, y
    // una cuenta real recien creada empieza ahi— sino de si esto es produccion.
    const enProduccion = this.configService.get<string>('NODE_ENV') === 'production';
    const resolvedCertificatePath = this.resolveCertificatePath(this.oseConfig.certificatePath);

    try {
      if (resolvedCertificatePath) {
        this.xmlSigner = new XmlSigner({
          pfxPath: resolvedCertificatePath,
          pfxPassword: this.oseConfig.certificatePassword,
          // Ni en produccion ni cuando se exige certificado real: una clave mal
          // puesta o un PFX corrupto no pueden terminar en una firma demo.
          allowDemoFallback: !requireRealCertificate && !enProduccion,
          expectedRuc: this.configService.get<string>('SUNAT_CERT_EXPECTED_RUC') || this.oseConfig.ruc,
          enforceRucInCertificate: this.oseConfig.environment === 'produccion',
          allowRucMismatchWithConfirmation: this.isCertificateRucMismatchConfirmed(),
        });
        this.logger.log('✅ Certificado digital real cargado exitosamente');
      } else {
        if (requireRealCertificate) {
          throw new Error(`Certificado fiscal requerido no encontrado: ${this.oseConfig.certificatePath}`);
        }
        if (enProduccion) {
          // Sin certificado global no se arranca en modo demo: se arranca sin
          // firmador. Cada tenant trae el suyo y quien intente enviar sin el
          // recibe un error, no una firma falsa.
          this.logger.warn(
            'Sin certificado fiscal global: la firma queda a cargo del certificado de cada tenant.',
          );
          return;
        }
        this.logger.warn('⚠️ Certificado no encontrado, usando modo DEMO para testing');
        // Usar modo demo con la flag correcta
        this.xmlSigner = new XmlSigner({
          useDemoMode: true
        });
        this.logger.log('✅ XmlSigner inicializado en modo DEMO');
      }
    } catch (error) {
      this.logger.error('❌ Error inicializando certificado:', error);
      if (requireRealCertificate || enProduccion) {
        throw error;
      }
      // Fallback a modo demo si hay cualquier error
      this.logger.warn('🔧 Iniciando en modo DEMO como fallback...');
      this.xmlSigner = new XmlSigner({
        useDemoMode: true
      });
    }
  }

  private isCertificateRucMismatchConfirmed(): boolean {
    return this.configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === true
      || this.configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === 'true';
  }

  private resolveCertificatePath(configuredPath: string): string | null {
    if (!configuredPath) {
      return null;
    }

    if (path.isAbsolute(configuredPath) && fs.existsSync(configuredPath)) {
      return configuredPath;
    }

    const candidates = [
      path.resolve(process.cwd(), configuredPath),
      path.resolve(process.cwd(), '..', '..', configuredPath),
      path.resolve(__dirname, '..', '..', '..', configuredPath),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  private async resolveRuntime(options?: SunatRuntimeOptions): Promise<OseRuntime> {
    if (!options?.tenantId) {
      return { config: this.oseConfig, signer: this.xmlSigner };
    }

    if (!this.supabaseService) {
      throw new Error(
        `No se puede resolver SUNAT para el tenant ${options.tenantId}: empresa_config no está disponible`,
      );
    }

    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select([
          'ruc',
          'pais',
          'is_demo',
          'certificado_pfx',
          'certificado_password',
          'sunat_environment',
          'sunat_username',
          'sunat_password',
          'sunat_cpe_url',
          'sunat_summary_url',
          'sunat_query_url',
          'sunat_gre_url',
          'sunat_gre_transport',
          'sunat_gre_rest_base_url',
          'sunat_gre_auth_url',
          'sunat_gre_client_id',
          'sunat_gre_client_secret',
          'sunat_cert_expected_ruc',
          'sunat_cert_ruc_mismatch_confirmed',
        ].join(','))
        .eq('tenant_id', options.tenantId)
        .maybeSingle();

      if (error) {
        throw new Error(`No se pudo leer configuracion SUNAT del tenant ${options.tenantId}: ${error.message}`);
      }

      const typedData = data as any;
      if (!typedData) {
        throw new Error(`No existe empresa_config SUNAT para tenant ${options.tenantId}`);
      }

      const country = String(typedData.pais ?? '').trim().toUpperCase();
      if (country !== 'PE') {
        throw new Error(
          `El runtime SUNAT del tenant ${options.tenantId} requiere pais PE explícito`,
        );
      }

      const rawEnvironment = String(typedData.sunat_environment ?? '').trim().toLowerCase();
      if (rawEnvironment !== 'homologacion' && rawEnvironment !== 'produccion') {
        throw new Error(
          `Ambiente SUNAT inválido para tenant ${options.tenantId}: configure homologacion o produccion`,
        );
      }
      const environment = rawEnvironment as 'homologacion' | 'produccion';
      const isDemoTenant =
        typedData.is_demo === true && country === 'PE' && environment === 'homologacion';
      if (typedData.is_demo === true && !isDemoTenant) {
        throw new Error(
          `El tenant demo ${options.tenantId} sólo puede simular SUNAT como demo PE en homologación`,
        );
      }
      const ruc = String(typedData.ruc ?? '').trim();
      if (!/^\d{11}$/.test(ruc)) {
        throw new Error(`RUC SUNAT inválido o ausente para tenant ${options.tenantId}`);
      }
      const usuario = this.normalizeSunatUsername(typedData.sunat_username, ruc);
      const password = typedData.sunat_password
        ? decryptText(this.configService, typedData.sunat_password)
        : '';

      const tenantCpeUrl = String(typedData.sunat_cpe_url ?? '').trim() || undefined;
      const tenantSummaryUrl = String(typedData.sunat_summary_url ?? '').trim() || undefined;
      const tenantQueryUrl = String(typedData.sunat_query_url ?? '').trim() || undefined;
      const tenantGreUrl = String(typedData.sunat_gre_url ?? '').trim() || undefined;
      const tenantGreRestBaseUrl =
        String(typedData.sunat_gre_rest_base_url ?? '').trim() ||
        'https://api-cpe.sunat.gob.pe/v1';
      const tenantGreRestAuthUrl =
        String(typedData.sunat_gre_auth_url ?? '').trim() || undefined;

      const config: OseConfig = {
        isDemoTenant,
        environment,
        ruc,
        usuario,
        password,
        url: tenantCpeUrl || SUNAT_ENDPOINTS[environment].cpe,
        cpeUrl: tenantCpeUrl,
        summaryUrl: tenantSummaryUrl || tenantCpeUrl,
        queryUrl: tenantQueryUrl,
        greUrl: tenantGreUrl,
        greTransport: String(typedData.sunat_gre_transport || 'soap').toLowerCase() === 'rest' ? 'rest' : 'soap',
        greRestBaseUrl: tenantGreRestBaseUrl,
        greRestAuthUrl: tenantGreRestAuthUrl,
        greRestClientId: String(typedData.sunat_gre_client_id ?? '').trim() || undefined,
        greRestClientSecret: typedData.sunat_gre_client_secret
          ? decryptText(this.configService, typedData.sunat_gre_client_secret)
          : undefined,
        certificatePath: '',
        certificatePassword: typedData.certificado_password
          ? decryptText(this.configService, typedData.certificado_password)
          : '',
      };

      let certificateBuffer = typedData.certificado_pfx
        ? decryptBuffer(this.configService, typedData.certificado_pfx)
        : null;
      let certificatePassword = config.certificatePassword;

      if (!certificateBuffer && canUseRuntimeDemoCertificate(typedData)) {
        const demoCertificate = loadRuntimeDemoCertificate(this.configService);
        certificateBuffer = demoCertificate.pfxBuffer;
        certificatePassword = demoCertificate.pfxPassword;
        this.logger.warn(
          `Usando certificado fiscal simulado en runtime SUNAT para el tenant demo ${options.tenantId}`,
        );
      }

      if (!certificateBuffer) {
        throw new Error(`Certificado digital no configurado para tenant ${options.tenantId}`);
      }

      const signer = new XmlSigner({
        pfxBuffer: certificateBuffer,
        pfxPassword: certificatePassword,
        allowDemoFallback: false,
        expectedRuc: typedData.sunat_cert_expected_ruc || ruc,
        enforceRucInCertificate: environment === 'produccion',
        allowRucMismatchWithConfirmation: typedData.sunat_cert_ruc_mismatch_confirmed === true,
      });

      return { config, signer };
    } catch (error) {
      this.logger.error(
        `No se pudo resolver runtime SUNAT del tenant ${options.tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Toda operación con tráfico externo debe resolver configuración y secretos
   * desde el tenant autenticado. El runtime global sólo se conserva para firma
   * local/offline en herramientas que no transportan documentos.
   */
  private async resolveTransportRuntime(
    options?: SunatRuntimeOptions,
  ): Promise<OseRuntime> {
    const tenantId = String(options?.tenantId ?? '').trim();
    if (!tenantId) {
      throw new Error(
        'tenantId es obligatorio para toda transmisión o consulta externa SUNAT/OSE',
      );
    }
    if (!this.supabaseService) {
      throw new Error(
        `No se puede transportar para el tenant ${tenantId}: empresa_config no está disponible`,
      );
    }

    return this.resolveRuntime({ tenantId });
  }

  private normalizeSunatUsername(username: string | undefined, ruc: string): string {
    const cleanUsername = String(username || '').trim().toUpperCase();
    if (!cleanUsername || !ruc || cleanUsername.startsWith(ruc)) {
      return cleanUsername;
    }
    return `${ruc}${cleanUsername}`;
  }

  /**
   * Enviar CPE (Factura/Boleta) a SUNAT
   * Q33: Protegido con Circuit Breaker
   */
  async enviarCpe(xmlUnsigned: string, fileName: string, options?: SunatRuntimeOptions): Promise<SunatResponse> {
    try {
      this.logger.log(`📤 Enviando CPE a SUNAT: ${fileName}`);

      const runtime = await this.resolveTransportRuntime(options);
      const { xmlSigned, hash } = this.prepareXmlForSend(xmlUnsigned, runtime.signer);

      if (runtime.config.isDemoTenant) {
        return {
          success: false,
          codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
          descripcionRespuesta: 'El CPE demo puede generarse y firmarse, pero no se transmite ni se marca como aceptado por SUNAT.',
          observaciones: ['No se realizó ninguna transmisión ni se fabricó un CDR.'],
          numeroComprobante: fileName,
          hashCPE: hash,
        };
      }

      this.assertSunatConfigured(runtime.config);

      // 2. Comprimir el XML
      const zipBuffer = await this.compressXml(xmlSigned, fileName);

      // 3. Q33: Enviar a SUNAT con Circuit Breaker
      const response = await this.circuitBreaker.execute<SunatResponse>(
        CIRCUIT_SUNAT_CPE,
        () => this.sendBillToSunat(zipBuffer, fileName, 'cpe', runtime.config),
        // Fallback: retornar error controlado si el circuito está abierto
        () => ({
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: 'Servicio SUNAT temporalmente no disponible. El documento será enviado automáticamente cuando el servicio se recupere.',
        }),
      );

      // 4. Procesar respuesta
      if (response.success) {
        this.logger.log(`✅ CPE enviado exitosamente: ${fileName}`);
        return {
          success: true,
          codigoRespuesta: response.codigoRespuesta,
          descripcionRespuesta: response.descripcionRespuesta,
          cdr: response.cdr || undefined,
          observaciones: response.observaciones,
          numeroComprobante: fileName,
          hashCPE: hash
        };
      } else {
        this.logger.error(`❌ Error enviando CPE: ${response.descripcionRespuesta}`);
        return response;
      }

    } catch (error) {
      // Q33: Manejar error de circuit breaker abierto
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.warn(`⚡ Circuit breaker abierto para SUNAT CPE: ${error.message}`);
        return {
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: error.message,
        };
      }

      this.logger.error('❌ Error en envío CPE:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico: ${error.message}`
      };
    }
  }

  /**
   * Enviar GRE (Guía de Remisión) a SUNAT
   * Q33: Protegido con Circuit Breaker
   */
  async enviarGre(xmlUnsigned: string, fileName: string, options?: SunatRuntimeOptions): Promise<SunatResponse> {
    try {
      this.logger.log(`🚚 Enviando GRE a SUNAT: ${fileName}`);

      const runtime = await this.resolveTransportRuntime(options);
      const { xmlSigned, hash } = this.prepareXmlForSend(xmlUnsigned, runtime.signer);

      if (runtime.config.isDemoTenant) {
        return {
          success: false,
          codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
          descripcionRespuesta: 'La GRE demo puede generarse y firmarse, pero no se transmite ni se marca como aceptada por SUNAT.',
          observaciones: ['No se realizó ninguna transmisión ni se fabricó un CDR.'],
          numeroComprobante: fileName,
          hashCPE: hash,
        };
      }

      this.assertSunatConfigured(runtime.config);
      if (
        runtime.config.greTransport === 'rest' &&
        (!runtime.config.greRestClientId || !runtime.config.greRestClientSecret)
      ) {
        throw new Error(
          'Credenciales API GRE no configuradas para el tenant: client_id y client_secret son obligatorios',
        );
      }

      // 2. Comprimir el XML
      const zipBuffer = await this.compressXml(xmlSigned, fileName);

      // 3. Q33: Enviar a SUNAT con Circuit Breaker
      const response = await this.circuitBreaker.execute<SunatResponse>(
        CIRCUIT_SUNAT_GRE,
        () => runtime.config.greTransport === 'rest'
          ? this.sendGreToSunatRest(zipBuffer, fileName, runtime.config)
          : this.sendBillToSunat(zipBuffer, fileName, 'gre', runtime.config),
        () => ({
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: 'Servicio SUNAT GRE temporalmente no disponible. La guía será enviada automáticamente cuando el servicio se recupere.',
        }),
      );

      // 4. Procesar respuesta
      if (response.success) {
        this.logger.log(`✅ GRE enviada exitosamente: ${fileName}`);
        return {
          success: true,
          codigoRespuesta: response.codigoRespuesta,
          descripcionRespuesta: response.descripcionRespuesta,
          cdr: response.cdr || undefined,
          observaciones: response.observaciones,
          numeroComprobante: fileName,
          hashCPE: hash
        };
      } else {
        this.logger.error(`❌ Error enviando GRE: ${response.descripcionRespuesta}`);
        return response;
      }

    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.warn(`⚡ Circuit breaker abierto para SUNAT GRE: ${error.message}`);
        return {
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: error.message,
        };
      }

      this.logger.error('❌ Error en envío GRE:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico: ${error.message}`
      };
    }
  }

  /**
   * Enviar resumen SUNAT: resumen diario, comunicación de baja o reversión.
   * SUNAT devuelve un ticket que debe consultarse luego con getStatus.
   */
  async enviarResumen(xmlUnsigned: string, fileName: string, options?: SunatRuntimeOptions): Promise<SunatResponse> {
    try {
      this.logger.log(`📤 Enviando resumen SUNAT: ${fileName}`);

      const runtime = await this.resolveTransportRuntime(options);
      const { xmlSigned, hash } = this.prepareXmlForSend(xmlUnsigned, runtime.signer);

      if (runtime.config.isDemoTenant) {
        return {
          success: false,
          codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
          descripcionRespuesta: 'El resumen demo puede generarse y firmarse, pero no se transmite ni recibe ticket SUNAT.',
          observaciones: ['No se realizó ninguna transmisión ni se fabricó un ticket.'],
          numeroComprobante: fileName,
          hashCPE: hash,
        };
      }
      this.assertSunatConfigured(runtime.config);
      const zipBuffer = await this.compressXml(xmlSigned, fileName);

      const response = await this.circuitBreaker.execute<SunatResponse>(
        CIRCUIT_SUNAT_CPE,
        () => this.sendSummaryToSunat(zipBuffer, fileName, runtime.config),
        () => ({
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: 'Servicio SUNAT temporalmente no disponible. El resumen será consultado cuando el servicio se recupere.',
        }),
      );

      if (response.success) {
        return {
          ...response,
          numeroComprobante: fileName,
          hashCPE: hash,
        };
      }

      return response;
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        return {
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: error.message,
        };
      }

      this.logger.error('❌ Error en envío de resumen SUNAT:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico: ${error.message}`,
      };
    }
  }

  /**
   * Consultar estado de CPE en SUNAT
   * Q33: Protegido con Circuit Breaker
   */
  async consultarEstadoCpe(
    ruc: string,
    tipoDocumento: string,
    serie: string,
    numero: string,
    options?: SunatRuntimeOptions,
  ): Promise<SunatResponse> {
    try {
      this.logger.log(`🔍 Consultando estado CPE: ${ruc}-${tipoDocumento}-${serie}-${numero}`);
      const runtime = await this.resolveTransportRuntime(options);

      if (runtime.config.isDemoTenant) {
        const reference = `${ruc}-${tipoDocumento}-${serie}-${numero}`;
        return {
          success: false,
          codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
          descripcionRespuesta: 'Una demo no consulta ni fabrica estados de aceptación SUNAT.',
          observaciones: ['No se consultó ningún servicio de SUNAT.'],
          numeroComprobante: reference,
        };
      }

      this.assertSunatConfigured(runtime.config);

      // Q33: Consultar con Circuit Breaker
      const response = await this.circuitBreaker.execute(
        CIRCUIT_SUNAT_QUERY,
        () => this.queryStatusInSunat(ruc, tipoDocumento, serie, numero, runtime.config),
        () => ({
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: 'Servicio de consulta SUNAT temporalmente no disponible. Intente más tarde.',
        }),
      );
      
      return response;
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.warn(`⚡ Circuit breaker abierto para consulta SUNAT: ${error.message}`);
        return {
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: error.message,
        };
      }

      this.logger.error('❌ Error consultando estado CPE:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error consultando estado: ${error.message}`
      };
    }
  }

  async consultarTicket(ticket: string, options?: SunatRuntimeOptions): Promise<SunatResponse> {
    try {
      if (!ticket?.trim()) {
        throw new Error('Ticket SUNAT requerido para consultar estado');
      }

      const cleanTicket = ticket.trim();
      this.logger.log(`🔍 Consultando ticket SUNAT: ${cleanTicket}`);
      const runtime = await this.resolveTransportRuntime(options);

      if (runtime.config.isDemoTenant) {
        return {
          success: false,
          codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
          descripcionRespuesta: 'Una demo no consulta ni fabrica tickets SUNAT.',
          observaciones: ['No se consultó ningún servicio de SUNAT.'],
          ticket: cleanTicket,
        };
      }

      this.assertSunatConfigured(runtime.config);

      return this.circuitBreaker.execute<SunatResponse>(
        CIRCUIT_SUNAT_QUERY,
        () => this.queryTicketInSunat(cleanTicket, runtime.config),
        () => ({
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: 'Servicio de consulta SUNAT temporalmente no disponible. Intente más tarde.',
          ticket: cleanTicket,
        }),
      );
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        return {
          success: false,
          codigoRespuesta: 'CB_OPEN',
          descripcionRespuesta: error.message,
          ticket,
        };
      }

      this.logger.error('❌ Error consultando ticket SUNAT:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error consultando ticket: ${error.message}`,
        ticket,
      };
    }
  }

  private prepareXmlForSend(xml: string, signer: XmlSigner = this.xmlSigner): { xmlSigned: string; hash: string } {
    // En produccion no hay firmador global: si nadie paso el del tenant, se
    // corta aqui. Firmar con cualquier otra cosa seria emitir a nombre ajeno.
    if (!signer) {
      throw new Error(
        'No hay certificado para firmar: cargue el certificado digital del contribuyente antes de enviar.',
      );
    }
    const xmlSigned = this.isSignedXml(xml) ? xml : signer.signXml(xml);
    return {
      xmlSigned,
      hash: signer.generateHash(xmlSigned),
    };
  }

  private isSignedXml(xml: string): boolean {
    return /<(?:\w+:)?Signature\b[^>]*(?:xmldsig|XMLDSig|Signature)/i.test(xml);
  }

  /**
   * Comprimir XML para envío a SUNAT
   */
  private async compressXml(xmlContent: string, fileName: string): Promise<Buffer> {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    
    // Agregar XML al ZIP
    zip.addFile(`${fileName}.xml`, Buffer.from(xmlContent, 'utf8'));
    
    return zip.toBuffer();
  }

  /**
   * Enviar CPE comprimido a SUNAT
   */
  private async sendBillToSunat(
    zipBuffer: Buffer,
    fileName: string,
    endpointKind: 'cpe' | 'gre',
    config: OseConfig,
  ): Promise<SunatResponse> {
    const postData = this.buildZipSoapRequest(zipBuffer, fileName, 'sendBill', config);
    return this.postSoap(endpointKind, 'urn:sendBill', postData, config);
  }

  private async sendGreToSunatRest(
    zipBuffer: Buffer,
    fileName: string,
    config: OseConfig,
  ): Promise<SunatResponse> {
    const token = await this.getGreRestAccessToken(config);
    const { ruc, tipo, serie, numero } = this.parseGreFileName(fileName);
    const baseUrl = (config.greRestBaseUrl || '').replace(/\/+$/, '');
    const url = `${baseUrl}/contribuyente/gem/comprobantes/${ruc}-${tipo}-${serie}-${numero}`;
    const zipBase64 = zipBuffer.toString('base64');
    const response = await this.postJson(url, {
      archivo: {
        nomArchivo: `${fileName}.zip`,
        arcGreZip: zipBase64,
        hashZip: createHash('sha256').update(zipBuffer).digest('hex').toUpperCase(),
      },
    }, {
      Authorization: `Bearer ${token}`,
    });

    return this.parseGreRestSendResponse(response);
  }

  async consultarTicketGre(ticket: string, options?: SunatRuntimeOptions): Promise<SunatResponse> {
    try {
      const runtime = await this.resolveTransportRuntime(options);
      if (runtime.config.isDemoTenant) {
        return {
          success: false,
          codigoRespuesta: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
          descripcionRespuesta: 'Una demo no consulta ni fabrica tickets GRE SUNAT.',
          observaciones: ['No se consultó ningún servicio de SUNAT.'],
          ticket,
        };
      }
      const token = await this.getGreRestAccessToken(runtime.config);
      const baseUrl = (runtime.config.greRestBaseUrl || '').replace(/\/+$/, '');
      const response = await this.getJson(`${baseUrl}/contribuyente/gem/comprobantes/envios/${encodeURIComponent(ticket)}`, {
        Authorization: `Bearer ${token}`,
      });
      return this.parseGreRestTicketResponse(response);
    } catch (error) {
      this.logger.error('❌ Error consultando ticket GRE REST:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico consultando GRE REST: ${error.message}`,
      };
    }
  }

  private async sendSummaryToSunat(
    zipBuffer: Buffer,
    fileName: string,
    config: OseConfig,
  ): Promise<SunatResponse> {
    const postData = this.buildZipSoapRequest(zipBuffer, fileName, 'sendSummary', config);
    return this.postSoap('summary', 'urn:sendSummary', postData, config);
  }

  private async getGreRestAccessToken(config: OseConfig): Promise<string> {
    if (!config.greRestClientId || !config.greRestClientSecret) {
      throw new Error('Credenciales API GRE no configuradas: SUNAT_GRE_CLIENT_ID y SUNAT_GRE_CLIENT_SECRET son obligatorias para SUNAT_GRE_TRANSPORT=rest');
    }

    this.assertSunatConfigured(config);

    const authUrl = config.greRestAuthUrl
      || `https://api-seguridad.sunat.gob.pe/v1/clientessol/${encodeURIComponent(config.greRestClientId)}/oauth2/token/`;
    const body = new URLSearchParams({
      grant_type: 'password',
      scope: 'https://api-cpe.sunat.gob.pe',
      client_id: config.greRestClientId,
      client_secret: config.greRestClientSecret,
      username: config.usuario,
      password: config.password,
    });
    const response = await this.requestText('POST', authUrl, body.toString(), {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const parsed = this.parseJsonResponse(response.body);
    const token = parsed?.access_token;

    if (!token) {
      throw new Error(`SUNAT API GRE no devolvió access_token (HTTP ${response.statusCode})`);
    }

    return token;
  }

  private parseGreFileName(fileName: string): { ruc: string; tipo: string; serie: string; numero: string } {
    const match = /^(\d{11})-(09|31)-([TV][A-Z0-9]{3})-(\d{1,8})$/i.exec(fileName);
    if (!match) {
      throw new Error(`Nombre GRE inválido para REST: ${fileName}`);
    }

    return {
      ruc: match[1],
      tipo: match[2],
      serie: match[3].toUpperCase(),
      numero: match[4],
    };
  }

  private parseGreRestSendResponse(response: unknown): SunatResponse {
    const payload = response as Record<string, any>;
    const ticket = payload?.numTicket || payload?.ticket || payload?.numeroTicket;

    if (ticket) {
      return {
        success: true,
        codigoRespuesta: '98',
        descripcionRespuesta: 'GRE REST recibida por SUNAT; ticket pendiente de consulta CDR',
        ticket: String(ticket),
      };
    }

    return this.parseGreRestErrorResponse(payload);
  }

  private parseGreRestTicketResponse(response: unknown): SunatResponse {
    const payload = response as Record<string, any>;
    const codigo = String(payload?.codRespuesta ?? payload?.codigoRespuesta ?? payload?.cod ?? '99');
    const cdr = payload?.arcCdr || payload?.cdr || payload?.archivoCdr;
    const descripcion = payload?.desRespuesta
      || payload?.descripcionRespuesta
      || payload?.msg
      || (codigo === '0' ? 'GRE aceptada por SUNAT' : codigo === '98' ? 'GRE en proceso' : 'GRE con error');

    return {
      success: codigo === '0',
      codigoRespuesta: codigo,
      descripcionRespuesta: String(descripcion),
      cdr: typeof cdr === 'string' ? cdr : undefined,
      observaciones: this.extractGreRestErrors(payload),
    };
  }

  private parseGreRestErrorResponse(payload: Record<string, any>): SunatResponse {
    const errors = this.extractGreRestErrors(payload);
    const codigo = String(payload?.cod || payload?.codigo || errors[0]?.split(':')[0] || '99');
    const descripcion = payload?.msg || payload?.message || errors.join('; ') || 'Respuesta GRE REST no reconocida';

    return {
      success: false,
      codigoRespuesta: codigo,
      descripcionRespuesta: String(descripcion),
      observaciones: errors.length ? errors : undefined,
    };
  }

  private extractGreRestErrors(payload: Record<string, any>): string[] {
    if (!Array.isArray(payload?.errors)) {
      return [];
    }

    return payload.errors
      .map((error: any) => {
        const code = error?.codError || error?.cod || error?.codigo;
        const message = error?.desError || error?.msg || error?.message;
        return [code, message].filter(Boolean).join(': ');
      })
      .filter(Boolean);
  }

  private async postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<unknown> {
    const response = await this.requestText('POST', url, JSON.stringify(body), {
      'Content-Type': 'application/json',
      ...headers,
    });
    return this.parseJsonResponse(response.body);
  }

  private async getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    const response = await this.requestText('GET', url, undefined, headers);
    return this.parseJsonResponse(response.body);
  }

  private parseJsonResponse(body: string): any {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(`Respuesta JSON inválida de SUNAT GRE REST: ${body.slice(0, 120)}`);
    }
  }

  private async requestText(
    method: 'GET' | 'POST',
    urlString: string,
    body?: string,
    headers: Record<string, string> = {},
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlString);
      const requestBody = body ? Buffer.from(body, 'utf8') : undefined;
      const req = https.request({
        hostname: url.hostname,
        port: Number(url.port || 443),
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          Accept: 'application/json',
          ...headers,
          ...(requestBody ? { 'Content-Length': requestBody.length } : {}),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if ((res.statusCode || 500) >= 400) {
            try {
              resolve({ statusCode: res.statusCode || 500, body: data });
            } catch (error) {
              reject(error);
            }
            return;
          }
          resolve({ statusCode: res.statusCode || 200, body: data });
        });
      });

      req.on('error', reject);
      if (requestBody) {
        req.write(requestBody);
      }
      req.end();
    });
  }

  private async postSoap(
    endpointKind: SunatEndpointKind,
    soapAction: string,
    postData: string,
    config: OseConfig,
  ): Promise<SunatResponse> {
    return new Promise((resolve, reject) => {
      try {
        this.assertSunatConfigured(config);
      } catch (error) {
        reject(error);
        return;
      }

      const endpoint = this.resolveSunatEndpoint(endpointKind, config);
      const headers: Record<string, string | number> = {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(postData),
        SOAPAction: soapAction,
      };
      const options: https.RequestOptions = {
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: endpoint.path,
        method: 'POST',
        headers,
      };

      if (this.shouldUseHttpBasicAuth(endpoint.hostname)) {
        options.auth = `${config.usuario}:${config.password}`;
      }

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            this.writeSoapDebugResponse(endpointKind, soapAction, res.statusCode, data);
            const response = this.parseSunatResponse(data, res.statusCode);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        this.logger.error(`❌ Error en petición HTTPS a SUNAT (${endpointKind}):`, error);
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  private writeSoapDebugResponse(
    endpointKind: SunatEndpointKind,
    soapAction: string,
    statusCode: number | undefined,
    responseBody: string,
  ): void {
    const debugDir = this.configService.get<string>('SUNAT_DEBUG_RAW_RESPONSES_DIR');
    if (!debugDir?.trim()) {
      return;
    }

    try {
      fs.mkdirSync(debugDir, { recursive: true });
      const safeAction = soapAction.replace(/[^a-z0-9_-]+/gi, '_');
      const fileName = `${Date.now()}-${endpointKind}-${safeAction}-http${statusCode || 'unknown'}.xml`;
      fs.writeFileSync(path.join(debugDir, fileName), responseBody, 'utf8');
    } catch (error) {
      this.logger.warn(
        `⚠️ No se pudo guardar respuesta SOAP debug SUNAT: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Construir petición SOAP para SUNAT
   */
  private buildZipSoapRequest(
    zipBuffer: Buffer,
    fileName: string,
    operation: 'sendBill' | 'sendSummary',
    config: OseConfig = this.oseConfig,
  ): string {
    const zipBase64 = zipBuffer.toString('base64');
    
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ser="http://service.sunat.gob.pe"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soap:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${config.usuario}</wsse:Username>
        <wsse:Password>${config.password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <ser:${operation}>
      <fileName>${fileName}.zip</fileName>
      <contentFile>${zipBase64}</contentFile>
    </ser:${operation}>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Parsear respuesta de SUNAT
   */
  private parseSunatResponse(soapResponse: string, httpStatusCode?: number): SunatResponse {
    try {
      if (httpStatusCode && httpStatusCode >= 400 && !/<(?:\w+:)?Envelope\b/i.test(soapResponse)) {
        return {
          success: false,
          codigoRespuesta: String(httpStatusCode),
          descripcionRespuesta: this.extractHtmlErrorMessage(soapResponse) || `HTTP ${httpStatusCode} recibido desde SUNAT`,
        };
      }

      const faultMatch = this.extractXmlTag(soapResponse, 'faultstring');
      if (faultMatch) {
        const faultCode = this.extractSunatFaultCode(faultMatch);
        return {
          success: false,
          codigoRespuesta: faultCode || '99',
          descripcionRespuesta: faultMatch || 'Error SOAP desconocido'
        };
      }

      const ticket = this.extractXmlTag(soapResponse, 'ticket');
      if (ticket) {
        return {
          success: true,
          codigoRespuesta: '0',
          descripcionRespuesta: 'Ticket SUNAT recibido',
          ticket,
        };
      }

      const applicationResponse = this.extractXmlTag(soapResponse, 'applicationResponse');
      const content = this.extractXmlTag(soapResponse, 'content');
      const cdr = applicationResponse || content;
      const statusCode = this.extractXmlTag(soapResponse, 'statusCode');
      const statusMessage = this.extractXmlTag(soapResponse, 'statusMessage');
      const parsedCdr = this.parseCdrMetadata(cdr);

      if (cdr && parsedCdr) {
        return {
          success: parsedCdr.codigoRespuesta === '0',
          codigoRespuesta: parsedCdr.codigoRespuesta,
          descripcionRespuesta: parsedCdr.descripcionRespuesta || statusMessage || 'CDR SUNAT recibido',
          cdr,
          observaciones: parsedCdr.observaciones,
        };
      }

      if (content && statusCode && (statusCode !== '0' || !this.looksLikeBase64(content))) {
        return {
          success: statusCode === '0',
          codigoRespuesta: statusCode,
          descripcionRespuesta: statusMessage || content || 'Respuesta de estado SUNAT recibida',
        };
      }

      if (applicationResponse || (content && this.looksLikeBase64(content))) {
        return {
          success: !statusCode || statusCode === '0',
          codigoRespuesta: statusCode || '0',
          descripcionRespuesta: statusMessage || 'CDR SUNAT recibido',
          cdr,
        };
      }

      if (statusCode || statusMessage) {
        const codigo = statusCode || '98';
        return {
          success: codigo === '0',
          codigoRespuesta: codigo,
          descripcionRespuesta: statusMessage || 'Respuesta de estado SUNAT recibida',
        };
      }

      return {
        success: false,
        codigoRespuesta: '98',
        descripcionRespuesta: 'Respuesta de SUNAT no reconocida'
      };

    } catch (error) {
      this.logger.error('❌ Error parseando respuesta SUNAT:', error);
      return {
        success: false,
        codigoRespuesta: '97',
        descripcionRespuesta: `Error parseando respuesta: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Consultar estado en SUNAT
   */
  private async queryStatusInSunat(
    ruc: string,
    tipoDocumento: string,
    serie: string,
    numero: string,
    config: OseConfig,
  ): Promise<SunatResponse> {
    const postData = this.buildStatusCdrRequest(ruc, tipoDocumento, serie, numero, config);
    return this.postSoap('query', 'urn:getStatusCdr', postData, config);
  }

  private async queryTicketInSunat(
    ticket: string,
    config: OseConfig,
  ): Promise<SunatResponse> {
    const postData = this.buildTicketStatusRequest(ticket, config);
    return this.postSoap('summary', 'urn:getStatus', postData, config);
  }

  private buildStatusCdrRequest(
    ruc: string,
    tipoDocumento: string,
    serie: string,
    numero: string,
    config: OseConfig = this.oseConfig,
  ): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:ser="http://service.sunat.gob.pe">
  ${this.buildSecurityHeader(config)}
  <soap:Body>
    <ser:getStatusCdr>
      <rucComprobante>${ruc}</rucComprobante>
      <tipoComprobante>${tipoDocumento}</tipoComprobante>
      <serieComprobante>${serie}</serieComprobante>
      <numeroComprobante>${numero}</numeroComprobante>
    </ser:getStatusCdr>
  </soap:Body>
</soap:Envelope>`;
  }

  private buildTicketStatusRequest(ticket: string, config: OseConfig = this.oseConfig): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:ser="http://service.sunat.gob.pe">
  ${this.buildSecurityHeader(config)}
  <soap:Body>
    <ser:getStatus>
      <ticket>${ticket}</ticket>
    </ser:getStatus>
  </soap:Body>
</soap:Envelope>`;
  }

  private buildSecurityHeader(config: OseConfig = this.oseConfig): string {
    return `<soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${config.usuario}</wsse:Username>
        <wsse:Password>${config.password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>`;
  }

  private extractSunatFaultCode(fault: string): string | null {
    return fault.match(/\b(?:Client|Server|soap-env:Server)\.\d+\b/i)?.[0]
      ?? fault.match(/^\s*(\d{3,5})\s*$/)?.[1]
      ?? null;
  }

  private parseCdrMetadata(cdrBase64?: string): ParsedCdrMetadata | null {
    if (!cdrBase64 || !this.looksLikeBase64(cdrBase64)) {
      return null;
    }

    try {
      const zip = Buffer.from(cdrBase64.replace(/\s/g, ''), 'base64');
      const xml = this.extractFirstXmlFromZip(zip);
      if (!xml) {
        return null;
      }

      const codigoRespuesta = this.extractXmlTag(xml, 'ResponseCode') || '';
      const descripcionRespuesta = this.extractXmlTag(xml, 'Description') || '';
      const observaciones = this.extractXmlTags(xml, 'Note');

      if (!codigoRespuesta && !descripcionRespuesta && observaciones.length === 0) {
        return null;
      }

      return {
        codigoRespuesta: codigoRespuesta || '0',
        descripcionRespuesta: descripcionRespuesta || 'CDR SUNAT recibido',
        observaciones,
      };
    } catch (error) {
      this.logger.warn(
        `⚠️ No se pudo decodificar metadata del CDR SUNAT: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private extractFirstXmlFromZip(zip: Buffer): string | null {
    let offset = 0;

    while (offset <= zip.length - 30) {
      if (zip.readUInt32LE(offset) !== 0x04034b50) {
        offset += 1;
        continue;
      }

      const flags = zip.readUInt16LE(offset + 6);
      const method = zip.readUInt16LE(offset + 8);
      const compressedSize = zip.readUInt32LE(offset + 18);
      const fileNameLength = zip.readUInt16LE(offset + 26);
      const extraLength = zip.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const dataStart = nameStart + fileNameLength + extraLength;

      if (dataStart > zip.length) {
        return null;
      }

      const fileName = zip.slice(nameStart, nameStart + fileNameLength).toString('utf8');

      if ((flags & 0x0008) !== 0 || compressedSize === 0) {
        offset = dataStart + 1;
        continue;
      }

      const dataEnd = dataStart + compressedSize;
      if (dataEnd > zip.length) {
        return null;
      }

      const compressed = zip.slice(dataStart, dataEnd);
      const content = method === 8
        ? zlib.inflateRawSync(compressed)
        : method === 0
          ? compressed
          : null;

      if (content && fileName.toLowerCase().endsWith('.xml')) {
        return content.toString('utf8');
      }

      offset = dataEnd;
    }

    return null;
  }

  private looksLikeBase64(value: string): boolean {
    const clean = value.replace(/\s/g, '');
    return clean.length >= 16 && clean.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(clean);
  }

  private assertSunatConfigured(config: OseConfig = this.oseConfig): void {
    if (!config.usuario) throw new Error('Usuario SUNAT/OSE no configurado');
    if (!config.password) throw new Error('Password SUNAT/OSE no configurado');
  }

  private resolveSunatEndpoint(kind: SunatEndpointKind, config: OseConfig = this.oseConfig): { hostname: string; port: number; path: string } {
    const defaultUrl = SUNAT_ENDPOINTS[config.environment][kind];
    const explicitUrl = this.getExplicitEndpointUrl(kind, config);
    const sourceUrl = explicitUrl || defaultUrl;
    const url = new URL(sourceUrl);
    const path = url.pathname && url.pathname !== '/' ? url.pathname : new URL(defaultUrl).pathname;

    return {
      hostname: url.hostname,
      port: Number(url.port || 443),
      path,
    };
  }

  private getExplicitEndpointUrl(kind: SunatEndpointKind, config: OseConfig = this.oseConfig): string | undefined {
    if (kind === 'cpe') return config.cpeUrl || config.url;
    if (kind === 'summary') return config.summaryUrl || config.cpeUrl || config.url;
    if (kind === 'gre') return config.greUrl;
    if (kind === 'query') return config.queryUrl;

    return undefined;
  }

  private shouldUseHttpBasicAuth(hostname: string): boolean {
    const normalizedHost = hostname.toLowerCase();
    return normalizedHost !== 'sunat.gob.pe' && !normalizedHost.endsWith('.sunat.gob.pe');
  }

  private extractXmlTag(xml: string, tag: string): string | null {
    const pattern = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i');
    return pattern.exec(xml)?.[1]?.trim() ?? null;
  }

  private extractXmlTags(xml: string, tag: string): string[] {
    const pattern = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'gi');
    return Array.from(xml.matchAll(pattern), (match) => match[1]?.trim()).filter(Boolean);
  }

  private extractHtmlErrorMessage(html: string): string | null {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.trim();
    return title || heading || null;
  }

  /**
   * Verificar configuración OSE
   */
  async getTenantConfigurationStatus(
    tenantId: string,
  ): Promise<OseTenantConfigurationStatus> {
    if (!tenantId || !this.supabaseService) {
      throw new Error('Tenant y acceso a empresa_config son obligatorios para consultar OSE');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select([
        'ruc',
        'pais',
        'is_demo',
        'certificado_pfx',
        'certificado_password',
        'sunat_environment',
        'sunat_username',
        'sunat_password',
        'sunat_cpe_url',
      ].join(','))
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo leer la configuración OSE del tenant: ${error.message}`);
    }
    if (!data) {
      throw new Error('No existe configuración OSE para este tenant');
    }

    const row = data as any;
    const country = String(row.pais || '').trim().toUpperCase();
    const environment = String(row.sunat_environment || '').trim().toLowerCase();
    const isDemoTenant = row.is_demo === true;
    const ruc = String(row.ruc || '').trim();
    const usuarioConfigured = Boolean(String(row.sunat_username || '').trim());
    const passwordConfigured = Boolean(row.sunat_password);
    const certificateExists = Boolean(row.certificado_pfx) || canUseRuntimeDemoCertificate(row);
    const configuredUrl = String(row.sunat_cpe_url || '').trim();
    const url = configuredUrl || (
      environment === 'produccion'
        ? SUNAT_ENDPOINTS.produccion.cpe
        : SUNAT_ENDPOINTS.homologacion.cpe
    );
    const errors: string[] = [];

    if (country !== 'PE') errors.push('OSE/SUNAT sólo aplica a empresas de Perú');
    if (!/^\d{11}$/.test(ruc)) errors.push('RUC peruano no configurado o inválido');
    if (!['homologacion', 'produccion'].includes(environment)) {
      errors.push('Ambiente SUNAT no configurado');
    }
    if (!usuarioConfigured) errors.push('Usuario SOL no configurado');
    if (!passwordConfigured) errors.push('Clave SOL no configurada');
    if (!certificateExists) errors.push('Certificado digital no configurado');

    return {
      configuracion: {
        applicable: country === 'PE',
        environment,
        url,
        ruc,
        certificateExists,
        usuario: usuarioConfigured ? '***configurado***' : 'no configurado',
        password: passwordConfigured ? '***configurado***' : 'no configurado',
        isDemoTenant,
        connectivityStatus: 'NO_PROBADO',
        transportStatus: isDemoTenant ? 'BLOQUEADO_DEMO' : 'CONFIGURADO_NO_PROBADO',
      },
      verificacion: {
        valid: errors.length === 0,
        errors,
        connectivityStatus: 'NO_PROBADO',
      },
    };
  }

  async verificarConfiguracion(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.oseConfig.url) errors.push('URL de OSE no configurada');
    if (!this.oseConfig.usuario) errors.push('Usuario OSE no configurado');
    if (!this.oseConfig.password) errors.push('Password OSE no configurado');
    if (!this.oseConfig.ruc) errors.push('RUC de empresa no configurado');
    if (!this.resolveCertificatePath(this.oseConfig.certificatePath)) errors.push('Certificado digital no encontrado');

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Obtener configuración actual (sin datos sensibles)
   */
  getConfiguracion() {
    return {
      environment: this.oseConfig.environment,
      url: this.oseConfig.url,
      ruc: this.oseConfig.ruc,
      certificateExists: !!this.resolveCertificatePath(this.oseConfig.certificatePath),
      usuario: this.oseConfig.usuario ? '***configurado***' : 'no configurado',
      password: this.oseConfig.password ? '***configurado***' : 'no configurado'
    };
  }

  /**
   * Q33: Obtener estado de los circuit breakers de SUNAT
   * Útil para monitoreo y dashboards de operaciones
   */
  getCircuitBreakerStatus(): { cpe: CircuitStats; gre: CircuitStats; query: CircuitStats } {
    return {
      cpe: this.circuitBreaker.getStats(CIRCUIT_SUNAT_CPE),
      gre: this.circuitBreaker.getStats(CIRCUIT_SUNAT_GRE),
      query: this.circuitBreaker.getStats(CIRCUIT_SUNAT_QUERY),
    };
  }

  /**
   * Q33: Forzar reset de un circuit breaker (para recuperación manual)
   */
  resetCircuitBreaker(circuit: 'cpe' | 'gre' | 'query'): void {
    const circuitName = {
      cpe: CIRCUIT_SUNAT_CPE,
      gre: CIRCUIT_SUNAT_GRE,
      query: CIRCUIT_SUNAT_QUERY,
    }[circuit];

    if (circuitName) {
      this.circuitBreaker.forceClose(circuitName);
      this.logger.log(`✅ Circuit breaker ${circuit} reseteado manualmente`);
    }
  }

  /**
   * Firmar XML únicamente (sin enviar a SUNAT)
   * Para testing y preparación offline
   */
  async signXmlOnly(xmlContent: string, options?: SunatRuntimeOptions): Promise<string> {
    try {
      console.log('🔐 [OSE] Firmando XML para testing...');
      const runtime = await this.resolveRuntime(options);
      
      // Usar el XmlSigner mejorado
      const xmlSigned = runtime.signer.signXml(xmlContent);
      const hash = runtime.signer.generateHash(xmlSigned);
      
      // Validar la firma
      const isValid = runtime.signer.validateSignature(xmlSigned);
      
      const certificateInfo = runtime.signer.getCertificateInfo?.();
      const certificateMode = certificateInfo?.demoMode ? 'demo' : 'real';

      // Log de información sin exponer rutas, contraseñas ni datos completos del certificado.
      console.log(`📜 [OSE] Info certificado: modo=${certificateMode}`);
      console.log(`📊 [OSE] Hash generado: ${hash}`);
      console.log(`📊 [OSE] Firma válida: ${isValid ? '✅' : '⚠️'}`);
      
      return xmlSigned;
    } catch (error) {
      console.error('❌ [OSE] Error firmando XML:', error);
      throw new Error(`Error firmando XML: ${error.message}`);
    }
  }
} 
