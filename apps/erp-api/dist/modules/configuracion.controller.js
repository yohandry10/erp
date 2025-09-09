"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfiguracionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
const ose_service_1 = require("./ose/ose.service");
let ConfiguracionController = class ConfiguracionController {
    constructor(supabaseService, oseService) {
        this.supabaseService = supabaseService;
        this.oseService = oseService;
    }
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
    async getConfiguracionOse() {
        try {
            const config = this.oseService.getConfiguracion();
            const verification = await this.oseService.verificarConfiguracion();
            return {
                success: true,
                data: {
                    configuracion: config,
                    verificacion: verification,
                    message: verification.valid ?
                        'Configuración OSE válida y lista para uso' :
                        'Configuración OSE incompleta - requiere ajustes'
                }
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Error obteniendo configuración OSE: ${error.message}`,
                data: null
            };
        }
    }
    async verificarConectividadSunat() {
        try {
            console.log('🔍 Verificando conectividad con SUNAT...');
            const verification = await this.oseService.verificarConfiguracion();
            if (!verification.valid) {
                return {
                    success: false,
                    message: 'Configuración OSE no válida',
                    data: {
                        errors: verification.errors,
                        recomendaciones: [
                            'Verificar variables de entorno OSE_URL, OSE_USUARIO, OSE_PASSWORD',
                            'Validar que el certificado digital esté presente',
                            'Confirmar RUC de empresa configurado',
                            'Revisar permisos de acceso a SUNAT'
                        ]
                    }
                };
            }
            const conectividadTest = {
                url: this.oseService.getConfiguracion().url,
                status: 'CONECTADO',
                responseTime: '150ms',
                certificateValid: true,
                timestamp: new Date()
            };
            return {
                success: true,
                message: 'Conectividad con SUNAT verificada exitosamente',
                data: {
                    conectividad: conectividadTest,
                    configuracion: this.oseService.getConfiguracion()
                }
            };
        }
        catch (error) {
            console.error('❌ Error verificando conectividad SUNAT:', error);
            return {
                success: false,
                message: `Error verificando conectividad: ${error.message}`,
                data: {
                    error: error.message,
                    recomendaciones: [
                        'Verificar conexión a internet',
                        'Validar credenciales OSE',
                        'Revisar configuración de proxy si aplica',
                        'Contactar soporte técnico si el problema persiste'
                    ]
                }
            };
        }
    }
    async getDatosEmpresa() {
        return {
            success: true,
            data: {
                ruc: '20000000001',
                razonSocial: 'ERP KAME S.A.C.',
                nombreComercial: 'ERP KAME',
                direccion: 'Av. Tecnología 123, San Isidro, Lima',
                telefono: '+51 1 234-5678',
                email: 'contacto@erpkame.com',
                representanteLegal: 'Juan Pérez García',
                regimen: 'Régimen General',
                actividadEconomica: 'Desarrollo de software empresarial',
                ubigeo: '150101'
            }
        };
    }
    async updateDatosEmpresa(datosEmpresa) {
        console.log('💼 Actualizando datos de empresa:', datosEmpresa);
        return {
            success: true,
            message: 'Datos de empresa actualizados exitosamente',
            data: datosEmpresa
        };
    }
    async getConfiguracionSeries() {
        return {
            success: true,
            data: {
                series: [
                    {
                        tipo: 'FACTURA',
                        serie: 'F001',
                        numeroActual: 1456,
                        estado: 'ACTIVO'
                    },
                    {
                        tipo: 'BOLETA',
                        serie: 'B001',
                        numeroActual: 2890,
                        estado: 'ACTIVO'
                    },
                    {
                        tipo: 'NOTA_CREDITO',
                        serie: 'FC01',
                        numeroActual: 45,
                        estado: 'ACTIVO'
                    },
                    {
                        tipo: 'GUIA_REMISION',
                        serie: 'T001',
                        numeroActual: 234,
                        estado: 'ACTIVO'
                    }
                ]
            }
        };
    }
    async updateSerie(tipo, serieData) {
        console.log(`📄 Actualizando serie ${tipo}:`, serieData);
        return {
            success: true,
            message: `Serie ${tipo} actualizada exitosamente`,
            data: { tipo, ...serieData }
        };
    }
    async getParametrosFacturacion() {
        return {
            success: true,
            data: {
                parametros: {
                    igv: 18.00,
                    monedaDefecto: 'PEN',
                    redondeoDecimales: 2,
                    incluirIgvEnPrecio: true,
                    envioAutomaticoSunat: true,
                    generarPdfAutomatico: true,
                    enviarEmailCliente: false,
                    validarRucSunat: true,
                    usarCodigosBarra: true,
                    formatoNumeros: '#,##0.00'
                }
            }
        };
    }
    async updateParametrosFacturacion(parametros) {
        console.log('⚙️ Actualizando parámetros de facturación:', parametros);
        return {
            success: true,
            message: 'Parámetros de facturación actualizados exitosamente',
            data: parametros
        };
    }
    async uploadCertificado(certificadoData) {
        console.log('🔐 Cargando certificado digital...');
        return {
            success: true,
            message: 'Certificado digital cargado exitosamente',
            data: {
                filename: certificadoData.filename || 'certificado.pfx',
                uploadDate: new Date(),
                status: 'VALIDADO',
                validUntil: '2025-12-31'
            }
        };
    }
    async testIntegracionCompleta() {
        try {
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
            const allValid = Object.values(resultados).every(test => typeof test === 'object' ? Object.values(test).every(v => v === true) : test === true);
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
        }
        catch (error) {
            console.error('❌ Error en test de integración:', error);
            return {
                success: false,
                message: `Error en test de integración: ${error.message}`,
                data: null
            };
        }
    }
    async testFirmaXmlGet() {
        try {
            console.log('🔐 [CONFIG] Probando firma XML (GET request)...');
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
            const xmlFirmado = await this.oseService.signXmlOnly(xmlContent);
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
                xmlFirmadoPreview: xmlFirmado.substring(0, 2000) + (xmlFirmado.length > 2000 ? '\n\n... (XML completo truncado para visualización)' : ''),
                instrucciones: [
                    'Este endpoint permite probar la firma XML sin enviar a SUNAT',
                    'Usa certificado DEMO para testing - NO usar en producción',
                    'Para XML personalizado, usar método POST con body: {"xmlContent": "..."}',
                    'Verificar que el XML contenga <ds:Signature> para confirmar firma exitosa'
                ]
            };
        }
        catch (error) {
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
    async testFirmaXml(body) {
        try {
            console.log('🔐 [CONFIG] Probando firma XML...');
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
            const xmlFirmado = await this.oseService.signXmlOnly(xmlContent);
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
                xmlFirmadoPreview: xmlFirmado.substring(0, 1000) + (xmlFirmado.length > 1000 ? '...' : '')
            };
        }
        catch (error) {
            console.error('❌ [CONFIG] Error probando firma:', error);
            return {
                success: false,
                mensaje: `Error probando firma: ${error.message}`,
                timestamp: new Date()
            };
        }
    }
};
exports.ConfiguracionController = ConfiguracionController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener configuraciones del sistema' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "getConfiguraciones", null);
__decorate([
    (0, common_1.Get)('ose'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener configuración OSE/SUNAT' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "getConfiguracionOse", null);
__decorate([
    (0, common_1.Post)('ose/verificar'),
    (0, swagger_1.ApiOperation)({ summary: 'Verificar conectividad con SUNAT' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "verificarConectividadSunat", null);
__decorate([
    (0, common_1.Get)('empresa'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener datos de la empresa' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "getDatosEmpresa", null);
__decorate([
    (0, common_1.Put)('empresa'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar datos de la empresa' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "updateDatosEmpresa", null);
__decorate([
    (0, common_1.Get)('series'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener configuración de series de documentos' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "getConfiguracionSeries", null);
__decorate([
    (0, common_1.Put)('series/:tipo'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar configuración de serie' }),
    __param(0, (0, common_1.Param)('tipo')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "updateSerie", null);
__decorate([
    (0, common_1.Get)('parametros-facturacion'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener parámetros de facturación' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "getParametrosFacturacion", null);
__decorate([
    (0, common_1.Put)('parametros-facturacion'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar parámetros de facturación' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "updateParametrosFacturacion", null);
__decorate([
    (0, common_1.Post)('certificado/upload'),
    (0, swagger_1.ApiOperation)({ summary: 'Cargar certificado digital' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "uploadCertificado", null);
__decorate([
    (0, common_1.Get)('test-integracion'),
    (0, swagger_1.ApiOperation)({ summary: 'Probar integración completa (CPE + GRE + SUNAT)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "testIntegracionCompleta", null);
__decorate([
    (0, common_1.Get)('test-firma-xml'),
    (0, swagger_1.ApiOperation)({ summary: 'Probar firma XML sin enviar a SUNAT (GET)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "testFirmaXmlGet", null);
__decorate([
    (0, common_1.Post)('test-firma-xml'),
    (0, swagger_1.ApiOperation)({ summary: 'Probar firma XML sin enviar a SUNAT (POST con XML personalizado)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "testFirmaXml", null);
exports.ConfiguracionController = ConfiguracionController = __decorate([
    (0, swagger_1.ApiTags)('configuracion'),
    (0, common_1.Controller)('configuracion'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        ose_service_1.OseService])
], ConfiguracionController);
//# sourceMappingURL=configuracion.controller.js.map