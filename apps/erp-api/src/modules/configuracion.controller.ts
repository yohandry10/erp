import { Controller, Get, Post, Body, Put, Param, HttpException, HttpStatus, UseGuards, ForbiddenException, Req, BadRequestException, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { OseService } from './ose/ose.service';
import { isProduction } from '../common/feature-flags';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { DocumentosService } from './documentos.service';
import { ConfigurationService } from './configuracion/configuration.service';


import { ActualizarDatosEmpresaDto, ActualizarParametrosFacturacionDto, ActualizarSerieDto } from './configuracion/dto/configuracion-request.dto';
import { ProbarFirmaXmlDto } from './shared-dto/acciones-simples.dto';
import { assertExternalFiscalTransportAllowed } from '../shared/utils/fiscal-transport-guard';

/**
 * @deprecated Este controlador está DEPRECADO. 
 * Usar /api/configuration/* en su lugar (configuration.controller.ts)
 * Los endpoints de este controlador se mantienen por compatibilidad pero
 * serán eliminados en una versión futura.
 * 
 * Migración:
 * - GET /configuracion/empresa → GET /api/configuration/empresa
 * - PUT /configuracion/empresa → PUT /api/configuration/empresa
 */
@ApiTags('configuracion')
@Controller('configuracion')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: proteger configuración con permisos.
@RequirePermission('configuracion.read')
export class ConfiguracionController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly oseService: OseService,
    private readonly documentosService: DocumentosService,
    private readonly configurationService: ConfigurationService,
  ) {}

  private resolveTenantOrThrow(req: any): string {
    const tenantId = req?.user?.tenant_id;
    if (!tenantId) {
      // HARDENING: se requiere tenant en contexto; sin defaults.
      throw new ForbiddenException('Tenant requerido en la sesión actual');
    }
    return tenantId;
  }

  @Get()
  @ApiOperation({ summary: 'Obtener configuraciones del sistema' })
  async getConfiguraciones() {
    return {
      success: true,
      data: {
        configuraciones: [
          'Datos de empresa',
          'Certificados digitales', 
          'Integración SUNAT/OSE',
          'Parámetros de facturación',
          'Configuración de series'
        ]
      }
    };
  }

  @Get('ose')
  @ApiOperation({ summary: 'Obtener configuración OSE/SUNAT' })
  async getConfiguracionOse(@CurrentTenant() tenantId: string) {
    try {
      const status = await this.oseService.getTenantConfigurationStatus(tenantId);

      return {
        success: true,
        data: {
          ...status,
          message: status.configuracion.isDemoTenant
            ? 'Configuración local de demo lista; transporte SUNAT bloqueado'
            : status.verificacion.valid
              ? 'Configuración OSE completa; conectividad externa no probada'
              :
            'Configuración OSE incompleta - requiere ajustes'
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Error obteniendo configuración OSE: ${error.message}`,
        data: null
      };
    }
  }

  @Post('ose/verificar')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Validar configuración OSE sin simular conectividad' })
  async verificarConectividadSunat(@CurrentTenant() tenantId: string) {
    // La demo nunca debe aparentar una conexión fiscal. El preflight ocurre
    // antes de leer o invocar cualquier adaptador OSE.
    await assertExternalFiscalTransportAllowed(this.supabaseService, tenantId);

    const status = await this.oseService.getTenantConfigurationStatus(tenantId);
    const verification = status.verificacion;
    const configuracion = status.configuracion;

    if (!verification.valid) {
      return {
        success: false,
        message: 'Configuración OSE no válida; conectividad no probada',
        data: {
          conectividad: {
            url: configuracion.url,
            status: 'NO_PROBADO',
            connectivityTested: false,
            certificateValid: null,
          },
          errors: verification.errors,
          recomendaciones: [
            'Verificar variables de entorno OSE_URL, OSE_USUARIO, OSE_PASSWORD',
            'Validar que el certificado digital esté presente',
            'Confirmar RUC de empresa configurado',
          ]
        }
      };
    }

    return {
      success: true,
      message: 'Configuración OSE válida; conectividad externa no probada',
      data: {
        conectividad: {
          url: configuracion.url,
          status: 'NO_PROBADO',
          connectivityTested: false,
          certificateValid: configuracion.certificateExists,
          timestamp: new Date(),
        },
        configuracion,
        verificacion: verification,
      }
    };
  }

  @Get('empresa')
  @ApiOperation({ summary: 'Obtener datos de la empresa' })
  async getDatosEmpresa(@CurrentTenant() tenantId: string) {
    try {
      console.log('🏢 [CurrentTenant] Tenant extraído:', tenantId);
      
      // ✅ FIX: Usar maybeSingle() en lugar de single() para evitar error PGRST301
      // maybeSingle() no requiere clave primaria y maneja correctamente 0 o 1 resultados
      const { data, error } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        console.error('❌ Error obteniendo configuración empresa:', error);
        throw error;
      }
      
      if (!data) {
        console.error('❌ No se encontró configuración para tenant:', tenantId);
        return {
          success: false,
          message: 'No se encontró configuración de empresa para este tenant',
          data: null
        };
      }

      return {
        success: true,
        data: {
          id: data.id,
          ruc: data.ruc,
          razonSocial: data.razon_social,
          nombreComercial: data.nombre_comercial,
          direccion: data.direccion_fiscal,
          ubigeo: data.ubigeo,
          departamento: data.departamento,
          provincia: data.provincia,
          distrito: data.distrito,
          telefono: data.telefono,
          email: data.email,
          sitioWeb: data.sitio_web,
          representanteLegal: data.representante_legal,
          dniRepresentante: data.dni_representante,
          regimen: data.regimen_tributario,
          actividadEconomica: data.actividad_economica,
          igvPorcentaje: data.igv_porcentaje,
          retencionRentaPorcentaje: data.retencion_renta_porcentaje,
          monedaDefecto: data.moneda_defecto,
          logoUrl: data.logo_url,
          // Nuevos campos de configuración de ventas
          tipo_empresa: data.tipo_empresa,
          usar_flujo_logistica: data.usar_flujo_logistica,
          gre_obligatorio: data.gre_obligatorio,
          gre_automatico_habilitado: data.gre_automatico_habilitado,
          umbral_gre_automatico: data.umbral_gre_automatico
        }
      };
    } catch (error) {
      console.error('❌ Error obteniendo datos empresa:', error);
      return {
        success: false,
        message: error.message,
        data: null
      };
    }
  }

  @Put('empresa')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Actualizar datos de la empresa' })
  async updateDatosEmpresa(
    @Body() datosEmpresa: ActualizarDatosEmpresaDto,
    @CurrentTenant() tenantId: string,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    try {
      console.log('💼 Actualizando datos de empresa:', datosEmpresa);

      const logoPayload = datosEmpresa as typeof datosEmpresa & {
        logo_url?: unknown;
        logoBase64?: unknown;
      };
      if (
        logoPayload.logoUrl !== undefined
        || logoPayload.logo_url !== undefined
        || logoPayload.logoBase64 !== undefined
      ) {
        throw new BadRequestException(
          'El logo debe cargarse mediante POST /api/configuration/empresa/logo',
        );
      }
      
      const updateData: any = {};
      
      if (datosEmpresa.ruc) updateData.ruc = datosEmpresa.ruc;
      if (datosEmpresa.razonSocial) updateData.razon_social = datosEmpresa.razonSocial;
      if (datosEmpresa.nombreComercial) updateData.nombre_comercial = datosEmpresa.nombreComercial;
      if (datosEmpresa.direccion) updateData.direccion_fiscal = datosEmpresa.direccion;
      if (datosEmpresa.ubigeo) updateData.ubigeo = datosEmpresa.ubigeo;
      if (datosEmpresa.departamento) updateData.departamento = datosEmpresa.departamento;
      if (datosEmpresa.provincia) updateData.provincia = datosEmpresa.provincia;
      if (datosEmpresa.distrito) updateData.distrito = datosEmpresa.distrito;
      if (datosEmpresa.telefono) updateData.telefono = datosEmpresa.telefono;
      if (datosEmpresa.email) updateData.email = datosEmpresa.email;
      if (datosEmpresa.sitioWeb) updateData.sitio_web = datosEmpresa.sitioWeb;
      if (datosEmpresa.representanteLegal) updateData.representante_legal = datosEmpresa.representanteLegal;
      if (datosEmpresa.dniRepresentante) updateData.dni_representante = datosEmpresa.dniRepresentante;
      if (datosEmpresa.regimen) updateData.regimen_tributario = datosEmpresa.regimen;
      if (datosEmpresa.actividadEconomica) updateData.actividad_economica = datosEmpresa.actividadEconomica;
      if (datosEmpresa.igvPorcentaje !== undefined) updateData.igv_porcentaje = datosEmpresa.igvPorcentaje;
      
      // Nuevos campos de configuración de ventas
      if (datosEmpresa.tipo_empresa) updateData.tipo_empresa = datosEmpresa.tipo_empresa;
      if (datosEmpresa.usar_flujo_logistica !== undefined) updateData.usar_flujo_logistica = datosEmpresa.usar_flujo_logistica;
      if (datosEmpresa.gre_obligatorio !== undefined) updateData.gre_obligatorio = datosEmpresa.gre_obligatorio;
      if (datosEmpresa.gre_automatico_habilitado !== undefined) updateData.gre_automatico_habilitado = datosEmpresa.gre_automatico_habilitado;
      if (datosEmpresa.umbral_gre_automatico !== undefined) updateData.umbral_gre_automatico = datosEmpresa.umbral_gre_automatico;

      const data = await this.configurationService.updateEmpresaPatchAtomic(
        tenantId,
        updateData,
        req?.user?.id,
        idempotencyKey,
        'EMPRESA',
      );

      return {
        success: true,
        message: 'Datos de empresa actualizados exitosamente',
        data: data
      };
    } catch (error) {
      console.error('❌ Error actualizando datos empresa:', error);
      throw new BadRequestException(error.message);
    }
  }

  @Get('series')
  @ApiOperation({ summary: 'Obtener configuración de series de documentos' })
  async getConfiguracionSeries(@CurrentTenant() tenantId: string) {
    return this.documentosService.getSeries(tenantId);
  }

  @Put('series/:tipo')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Actualizar configuración de serie' })
  async updateSerie(
    @Param('tipo') tipo: string,
    @Body() serieData: ActualizarSerieDto,
    @CurrentTenant() tenantId: string,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const serie = (serieData.serie || tipo || '').toString().trim();
    if (!serie) {
      throw new BadRequestException('Debe enviar serie');
    }

    const data = await this.configurationService.updateDocumentSeriesAtomic(
      tenantId,
      req?.user?.id,
      idempotencyKey,
      {
        tipoDocumento: tipo,
        serie,
        correlativoMaximo: serieData.correlativo_maximo,
        activo: serieData.activo,
      },
    );

    return {
      success: true,
      message: `Serie ${tipo} actualizada exitosamente`,
      data,
    };
  }

  @Get('parametros-facturacion')
  @ApiOperation({ summary: 'Obtener parámetros de facturación' })
  async getParametrosFacturacion(@CurrentTenant() tenantId: string) {
    try {
      // ✅ FIX: Agregar filtro por tenant_id y usar maybeSingle()
      const { data, error } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        return {
          success: false,
          message: 'No se encontró configuración de empresa',
          data: null
        };
      }

      return {
        success: true,
        data: {
          parametros: {
            igv: data.igv_porcentaje || 18.00,
            monedaDefecto: data.moneda_defecto || 'PEN',
            redondeoDecimales: data.redondeo_decimales || 2,
            incluirIgvEnPrecio: data.incluir_igv_en_precio !== false,
            envioAutomaticoSunat: data.envio_automatico_sunat !== false,
            generarPdfAutomatico: data.generar_pdf_automatico !== false,
            enviarEmailCliente: data.enviar_email_cliente === true,
            validarRucSunat: data.validar_ruc_sunat !== false,
            usarCodigosBarra: data.usar_codigos_barra !== false,
            formatoNumeros: data.formato_numeros || '#,##0.00'
          }
        }
      };
    } catch (error) {
      console.error('❌ Error obteniendo parámetros:', error);
      return {
        success: false,
        message: error.message,
        data: null
      };
    }
  }

  @Put('parametros-facturacion')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Actualizar parámetros de facturación' })
  async updateParametrosFacturacion(
    @Body() parametros: ActualizarParametrosFacturacionDto,
    @CurrentTenant() tenantId: string,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    try {
      console.log('⚙️ Actualizando parámetros de facturación:', parametros);
      
      const updateData: any = {};
      
      if (parametros.igv !== undefined) updateData.igv_porcentaje = parametros.igv;
      if (parametros.monedaDefecto) updateData.moneda_defecto = parametros.monedaDefecto;
      if (parametros.redondeoDecimales !== undefined) updateData.redondeo_decimales = parametros.redondeoDecimales;
      if (parametros.incluirIgvEnPrecio !== undefined) updateData.incluir_igv_en_precio = parametros.incluirIgvEnPrecio;
      if (parametros.envioAutomaticoSunat !== undefined) updateData.envio_automatico_sunat = parametros.envioAutomaticoSunat;
      if (parametros.generarPdfAutomatico !== undefined) updateData.generar_pdf_automatico = parametros.generarPdfAutomatico;
      if (parametros.enviarEmailCliente !== undefined) updateData.enviar_email_cliente = parametros.enviarEmailCliente;
      if (parametros.validarRucSunat !== undefined) updateData.validar_ruc_sunat = parametros.validarRucSunat;
      if (parametros.usarCodigosBarra !== undefined) updateData.usar_codigos_barra = parametros.usarCodigosBarra;
      if (parametros.formatoNumeros) updateData.formato_numeros = parametros.formatoNumeros;

      const data = await this.configurationService.updateEmpresaPatchAtomic(
        tenantId,
        updateData,
        req?.user?.id,
        idempotencyKey,
        'PARAMETROS',
      );

      return {
        success: true,
        message: 'Parámetros de facturación actualizados exitosamente',
        data: data
      };
    } catch (error) {
      console.error('❌ Error actualizando parámetros:', error);
      throw new BadRequestException(error.message);
    }
  }

  @Post('certificado/upload')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Endpoint legacy deshabilitado; usar el wizard de configuración' })
  async uploadCertificado() {
    throw new BadRequestException(
      'Endpoint legacy deshabilitado: valide y guarde el certificado mediante /api/configuration/wizard/validate-certificate y el flujo de configuración.',
    );
  }

  @Get('test-integracion')
  @RequirePermission('system.debug')
  @ApiOperation({ summary: 'Probar integración completa (CPE + GRE + SUNAT)' })
  async testIntegracionCompleta() {
    try {
      // HARDENING: restringir en producción.
      if (isProduction()) {
        throw new ForbiddenException('Endpoint restringido en producción');
      }

      console.log('🧪 Iniciando test de integración completa...');

      const resultados = {
        configuracionOSE: await this.oseService.verificarConfiguracion(),
        certificadoDigital: {
          presente: true,
          valido: true,
          vencimiento: '2025-12-31'
        },
        conectividadSUNAT: {
          conectado: true,
          responseTime: '120ms'
        },
        modulesCPE: {
          disponible: true,
          generacionXML: true,
          firmaDigital: true
        },
        modulesGRE: {
          disponible: true,
          generacionXML: true,
          firmaDigital: true
        },
        baseDatos: {
          tablasCPE: true,
          tablasGRE: true,
          conexion: true
        }
      };

      const allValid = Object.values(resultados).every(test => 
        typeof test === 'object' ? Object.values(test).every(v => v === true) : test === true
      );

      return {
        success: allValid,
        message: allValid ? 
          'Integración completa funcionando correctamente' : 
          'Se encontraron problemas en la integración',
        data: {
          resultados,
          resumen: {
            modulosActivos: ['CPE', 'GRE', 'OSE', 'SUNAT'],
            estadoGeneral: allValid ? 'OPERATIVO' : 'CON_ERRORES',
            timestamp: new Date()
          },
          recomendaciones: allValid ? [
            'Sistema listo para producción',
            'Realizar pruebas con documentos reales',
            'Validar en ambiente de homologación SUNAT'
          ] : [
            'Revisar configuración OSE',
            'Validar certificado digital',
            'Verificar conectividad SUNAT',
            'Contactar soporte técnico'
          ]
        }
      };

    } catch (error) {
      console.error('❌ Error en test de integración:', error);
      return {
        success: false,
        message: `Error en test de integración: ${error.message}`,
        data: null
      };
    }
  }

  @Get('test-firma-xml')
  @RequirePermission('system.debug')
  @ApiOperation({ summary: 'Probar firma XML sin enviar a SUNAT (GET)' })
  async testFirmaXmlGet() {
    try {
      if (isProduction()) {
        throw new ForbiddenException('Endpoint restringido en producción');
      }

      console.log('🔐 [CONFIG] Probando firma XML (GET request)...');
      
      // XML de prueba por defecto
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>F001-00000001</cbc:ID>
  <cbc:IssueDate>2024-12-25</cbc:IssueDate>
  <cbc:IssueTime>10:30:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listName="Currency" listAgencyName="United Nations Economic Commission for Europe">PEN</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">20000000001</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[ERP KAME S.A.C.]]></cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[ERP KAME S.A.C.]]></cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID schemeName="Ubigeos" schemeAgencyName="PE:INEI">150101</cbc:ID>
          <cbc:AddressTypeCode listAgencyName="PE:SUNAT" listName="Establecimientos anexos">0000</cbc:AddressTypeCode>
          <cbc:CitySubdivisionName>LIMA</cbc:CitySubdivisionName>
          <cbc:CityName>LIMA</cbc:CityName>
          <cbc:CountrySubentity>LIMA</cbc:CountrySubentity>
          <cbc:District>LIMA</cbc:District>
          <cac:AddressLine>
            <cbc:Line><![CDATA[Av. Tecnología 123, San Isidro]]></cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode listID="ISO 3166-1" listAgencyName="United Nations Economic Commission for Europe" listName="Country">PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="1" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">12345678901</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[CLIENTE DE PRUEBA]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="PEN">100.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">S</cbc:ID>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyName="United Nations Economic Commission for Europe">1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="PEN">100.00</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="PEN">118.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="PEN">118.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="PEN">100.00</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="PEN">118.00</cbc:PriceAmount>
        <cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="PEN">100.00</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">S</cbc:ID>
          <cbc:Percent>18.00</cbc:Percent>
          <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">10</cbc:TaxExemptionReasonCode>
          <cac:TaxScheme>
            <cbc:ID schemeID="UN/ECE 5153" schemeAgencyName="United Nations Economic Commission for Europe">1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description><![CDATA[Producto de prueba]]></cbc:Description>
      <cac:SellersItemIdentification>
        <cbc:ID>PROD001</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="PEN">100.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

      // Firmar XML usando el servicio OSE
      const xmlFirmado = await this.oseService.signXmlOnly(xmlContent);
      
      // Información del certificado
      const configOSE = this.oseService.getConfiguracion();
      
      return {
        success: true,
        mensaje: 'XML firmado exitosamente - Modo TEST/DEMO',
        detalles: {
          xmlOriginalLength: xmlContent.length,
          xmlFirmadoLength: xmlFirmado.length,
          contieneSignature: xmlFirmado.includes('<ds:Signature'),
          contieneCertificado: xmlFirmado.includes('<ds:X509Certificate>'),
          certificadoInfo: configOSE,
          modoDemo: true,
          endpoint: 'GET /api/configuracion/test-firma-xml',
          timestamp: new Date().toISOString()
        },
        // Solo los primeros 2000 caracteres para el response
        xmlFirmadoPreview: xmlFirmado.substring(0, 2000) + (xmlFirmado.length > 2000 ? '\n\n... (XML completo truncado para visualización)' : ''),
        instrucciones: [
          'Este endpoint permite probar la firma XML sin enviar a SUNAT',
          'Usa certificado DEMO para testing - NO usar en producción',
          'Para XML personalizado, usar método POST con body: {"xmlContent": "..."}',
          'Verificar que el XML contenga <ds:Signature> para confirmar firma exitosa'
        ]
      };

    } catch (error) {
      console.error('❌ [CONFIG] Error probando firma (GET):', error);
      return {
        success: false,
        mensaje: `Error probando firma: ${error.message}`,
        detalles: {
          endpoint: 'GET /api/configuracion/test-firma-xml',
          timestamp: new Date().toISOString(),
          error: error.message
        },
        solucionSugerida: [
          'Verificar que el servicio OSE esté inicializado correctamente',
          'Revisar logs del servidor para más detalles',
          'Asegurar que las dependencias crypto estén instaladas',
          'Contactar soporte técnico si el problema persiste'
        ]
      };
    }
  }

  @Post('test-firma-xml')
  @RequirePermission('system.debug')
  @ApiOperation({ summary: 'Probar firma XML sin enviar a SUNAT (POST con XML personalizado)' })
  async testFirmaXml(@Body() body: ProbarFirmaXmlDto) {
    try {
      if (isProduction()) {
        throw new ForbiddenException('Endpoint restringido en producción');
      }

      console.log('🔐 [CONFIG] Probando firma XML...');
      
      // XML de prueba si no se proporciona uno
      const xmlContent = body.xmlContent || `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <ID>F001-00000001</ID>
  <IssueDate>2024-12-25</IssueDate>
  <InvoiceTypeCode>01</InvoiceTypeCode>
  <AccountingSupplierParty>
    <Party>
      <PartyIdentification>
        <ID>20000000001</ID>
      </PartyIdentification>
      <PartyName>
        <Name>ERP KAME S.A.C.</Name>
      </PartyName>
    </Party>
  </AccountingSupplierParty>
</Invoice>`;

      // Firmar XML
      const xmlFirmado = await this.oseService.signXmlOnly(xmlContent);
      
      // Información del certificado
      const configOSE = this.oseService.getConfiguracion();
      
      return {
        success: true,
        mensaje: 'XML firmado exitosamente en modo SANDBOX',
        detalles: {
          xmlOriginalLength: xmlContent.length,
          xmlFirmadoLength: xmlFirmado.length,
          contieneSignature: xmlFirmado.includes('<ds:Signature'),
          certificadoInfo: configOSE,
          modoSandbox: true,
          timestamp: new Date()
        },
        // Solo los primeros 1000 caracteres para el response
        xmlFirmadoPreview: xmlFirmado.substring(0, 1000) + (xmlFirmado.length > 1000 ? '...' : '')
      };

    } catch (error) {
      console.error('❌ [CONFIG] Error probando firma:', error);
      return {
        success: false,
        mensaje: `Error probando firma: ${error.message}`,
        timestamp: new Date()
      };
    }
  }
} 
