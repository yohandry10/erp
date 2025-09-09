"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CpeService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../../shared/supabase/supabase.service");
const dtos_1 = require("@erp-suite/dtos");
const crypto_1 = require("@erp-suite/crypto");
const config_1 = require("@nestjs/config");
const event_bus_service_1 = require("../../shared/events/event-bus.service");
const ose_service_1 = require("../ose/ose.service");
let CpeService = class CpeService {
    constructor(supabaseService, configService, eventBus, oseService) {
        this.supabaseService = supabaseService;
        this.configService = configService;
        this.eventBus = eventBus;
        this.oseService = oseService;
        this.xmlSigner = new crypto_1.XmlSigner({
            pfxPath: this.configService.get('PFX_PATH') || '/tmp/demo.pfx',
            pfxPassword: this.configService.get('PFX_PASS') || 'demo123',
        });
    }
    async create(createFacturaDto, tenantId) {
        try {
            const xmlContent = this.generateXmlContent(createFacturaDto);
            const signedXml = this.xmlSigner.signXml(xmlContent);
            const hash = this.xmlSigner.generateHash(signedXml);
            const cpeData = {
                tenant_id: tenantId,
                tipo_documento: createFacturaDto.tipo_documento,
                serie: createFacturaDto.serie,
                numero: createFacturaDto.numero,
                ruc_emisor: createFacturaDto.ruc_emisor,
                razon_social_emisor: createFacturaDto.razon_social_emisor,
                tipo_documento_receptor: createFacturaDto.tipo_documento_receptor,
                documento_receptor: createFacturaDto.documento_receptor,
                razon_social_receptor: createFacturaDto.razon_social_receptor,
                direccion_receptor: createFacturaDto.direccion_receptor,
                moneda: createFacturaDto.moneda,
                total_gravadas: createFacturaDto.total_gravadas,
                total_igv: createFacturaDto.total_igv,
                total_venta: createFacturaDto.total_venta,
                items: createFacturaDto.items,
                estado: 'FIRMADO',
                hash: hash,
                xml_firmado: signedXml,
            };
            const { data, error } = await this.supabaseService.insert('cpe', cpeData);
            if (error) {
                console.error('Database error:', error);
                throw new common_1.BadRequestException('Error creating CPE: ' + error.message);
            }
            if (!data) {
                throw new common_1.BadRequestException('No data returned from database insert');
            }
            const createdCpe = Array.isArray(data) ? data[0] : data;
            await this.prepareXmlForSunat(createdCpe.id, xmlContent);
            console.log('🚀 Iniciando envío automático a SUNAT...');
            try {
                await this.sendToOse(createdCpe.id, xmlContent, `${createFacturaDto.serie}-${createFacturaDto.numero}`);
                console.log('✅ CPE enviado automáticamente a SUNAT');
                await this.supabaseService.getClient()
                    .from('cpe')
                    .update({
                    estado: 'ENVIADO',
                    fecha_envio: new Date().toISOString(),
                    envio_automatico: true
                })
                    .eq('id', createdCpe.id);
            }
            catch (envioError) {
                console.error('⚠️ Error en envío automático, quedará pendiente para reenvío:', envioError);
                await this.supabaseService.getClient()
                    .from('cpe')
                    .update({
                    estado: 'PENDIENTE_ENVIO',
                    error_envio: envioError.message,
                    fecha_ultimo_intento: new Date().toISOString()
                })
                    .eq('id', createdCpe.id);
                console.log('📨 Programando reintento automático en 5 minutos...');
                this.eventBus.emit('cpe.retry_envio', {
                    cpeId: createdCpe.id,
                    intentoAnterior: 1,
                    proximoIntento: new Date(Date.now() + 5 * 60 * 1000).toISOString()
                }, 'cpe');
            }
            const requiereTransporte = this.evaluarSiRequiereTransporte(createFacturaDto);
            const cpeId = createdCpe.id;
            this.eventBus.emitComprobanteCreadoEvent({
                cpeId: cpeId,
                tipoDocumento: createFacturaDto.tipo_documento,
                serie: createFacturaDto.serie,
                numero: createFacturaDto.numero,
                clienteId: createFacturaDto.documento_receptor,
                total: createFacturaDto.total_venta,
                esCredito: false,
                ventaId: undefined,
                requiereTransporte: requiereTransporte
            });
            if (requiereTransporte) {
                console.log(`🚚 [CPE] CPE ${cpeId} requiere transporte (Total: S/ ${createFacturaDto.total_venta}), emitiendo evento...`);
                const eventData = {
                    cpeId: cpeId,
                    clienteId: createFacturaDto.documento_receptor,
                    total: createFacturaDto.total_venta,
                    productos: createFacturaDto.items || []
                };
                console.log(`🚚 [CPE] Datos del evento a emitir:`, eventData);
                this.eventBus.emit('cpe.requiere_transporte', eventData, 'cpe');
                console.log(`✅ [CPE] Evento cpe.requiere_transporte emitido para CPE ${cpeId}`);
            }
            else {
                console.log(`ℹ️ [CPE] CPE ${cpeId} no requiere transporte (Total: S/ ${createFacturaDto.total_venta})`);
            }
            return this.mapToDto(createdCpe);
        }
        catch (error) {
            console.error('Error in CpeService.create:', error);
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('Error creating CPE');
        }
    }
    async findAll(paginationDto, tenantId) {
        try {
            const { page, limit, offset } = paginationDto;
            const { count } = await this.supabaseService
                .getClient()
                .from('cpe')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId);
            const { data, error } = await this.supabaseService
                .getClient()
                .from('cpe')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) {
                throw new common_1.BadRequestException('Error fetching CPEs: ' + error.message);
            }
            const cpes = data.map(cpe => this.mapToDto(cpe));
            return new dtos_1.PaginatedResponseDto(cpes, count || 0, page, limit);
        }
        catch (error) {
            console.error('Error in CpeService.findAll:', error);
            throw new common_1.BadRequestException('Error fetching CPEs');
        }
    }
    async findOne(id, tenantId) {
        try {
            const { data, error } = await this.supabaseService
                .getClient()
                .from('cpe')
                .select('*')
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .single();
            if (error || !data) {
                throw new common_1.NotFoundException('CPE not found');
            }
            return this.mapToDto(data);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            throw new common_1.BadRequestException('Error fetching CPE');
        }
    }
    async getCpeById(id, tenantId) {
        try {
            console.log(`📄 Obteniendo CPE con ID: ${id}`);
            const { data: cpeData, error } = await this.supabaseService.getClient()
                .from('cpe')
                .select('*')
                .eq('id', id)
                .single();
            if (error || !cpeData) {
                console.error('❌ CPE no encontrado:', error);
                throw new Error('CPE no encontrado');
            }
            console.log('✅ CPE encontrado para vista:', cpeData);
            return cpeData;
        }
        catch (error) {
            console.error('❌ Error obteniendo CPE:', error);
            throw new Error(`Error obteniendo CPE: ${error.message}`);
        }
    }
    async generatePdf(id, tenantId) {
        try {
            console.log(`📄 Buscando CPE con ID: ${id} y tenant: ${tenantId}`);
            const { data: cpeData, error } = await this.supabaseService.getClient()
                .from('cpe')
                .select('*')
                .eq('id', id)
                .single();
            if (error || !cpeData) {
                console.error('❌ CPE no encontrado:', error);
                throw new Error('CPE no encontrado');
            }
            console.log('✅ CPE encontrado:', cpeData);
            const pdfContent = this.generateSimplePdfContentFromData(cpeData);
            return Buffer.from(pdfContent, 'utf-8');
        }
        catch (error) {
            console.error('❌ Error generando PDF:', error);
            throw new Error(`Error generando PDF: ${error.message}`);
        }
    }
    async getSignedXml(id, tenantId) {
        const cpe = await this.findOne(id, tenantId);
        if (!cpe.xml_firmado) {
            throw new common_1.BadRequestException('XML not available for this CPE');
        }
        return cpe.xml_firmado;
    }
    async resendToOse(id, tenantId) {
        const cpe = await this.findOne(id, tenantId);
        const fileName = `${cpe.ruc_emisor}-${cpe.tipo_documento}-${cpe.serie}-${cpe.numero}`;
        await this.sendToOse(id, cpe.xml_firmado, fileName);
        return { message: 'CPE resent to OSE successfully' };
    }
    async sendToOseManual(id, xmlFirmado, fileName) {
        console.log(`🚀 [CPE] Enviando manualmente CPE ${id} a SUNAT...`);
        await this.sendToOse(id, xmlFirmado, fileName);
    }
    async checkOseStatus(id, tenantId) {
        const cpe = await this.findOne(id, tenantId);
        const response = await this.oseService.consultarEstadoCpe(cpe.ruc_emisor, cpe.tipo_documento, cpe.serie, cpe.numero.toString());
        if (response.success) {
            await this.supabaseService.update('cpe', {
                estado: 'ACEPTADO',
                cdr_sunat: response.cdr || 'CDR_RECEIVED',
                updated_at: new Date().toISOString(),
            }, { id: cpe.id });
        }
        return {
            id: cpe.id,
            estado: response.success ? 'ACEPTADO' : cpe.estado,
            codigoSunat: response.codigoRespuesta,
            descripcionSunat: response.descripcionRespuesta,
            timestamp: new Date(),
        };
    }
    async prepareXmlForSunat(cpeId, xmlContent) {
        try {
            console.log(`📄 [CPE] Preparando XML para CPE ${cpeId}...`);
            console.log('📜 [CPE] Certificado: DEMO MODE ACTIVO');
            const xmlSigned = this.xmlSigner.signXml(xmlContent);
            const hash = this.xmlSigner.generateHash(xmlSigned);
            const isValid = this.xmlSigner.validateSignature(xmlSigned);
            if (!isValid) {
                console.warn('⚠️ [CPE] La firma generada no pasó la validación');
            }
            console.log('🔧 [CPE] Actualizando estado a: FIRMADO');
            await this.supabaseService.update('cpe', {
                estado: 'FIRMADO',
                hash: hash,
                xml_firmado: xmlSigned,
                updated_at: new Date().toISOString(),
            }, { id: cpeId });
            console.log(`✅ [CPE] XML firmado para CPE ${cpeId}`);
            console.log(`📊 [CPE] Hash: ${hash}`);
            console.log(`📊 [CPE] Firma válida: ${isValid ? '✅' : '⚠️'}`);
            console.log(`📊 [CPE] Modo certificado: DEMO`);
        }
        catch (error) {
            console.error(`❌ [CPE] Error preparando XML para CPE ${cpeId}:`, error);
            await this.supabaseService.update('cpe', {
                estado: 'RECHAZADO',
                error_message: `Error preparando XML: ${error.message}`,
                updated_at: new Date().toISOString(),
            }, { id: cpeId });
        }
    }
    async sendToOse(cpeId, xmlContent, fileName) {
        try {
            console.log(`📤 [CPE] Enviando CPE ${cpeId} a SUNAT...`);
            await this.supabaseService.update('cpe', {
                estado: 'ENVIADO',
                updated_at: new Date().toISOString(),
            }, { id: cpeId });
            if (!xmlContent || !fileName) {
                const { data: cpeData, error } = await this.supabaseService.getClient()
                    .from('cpe')
                    .select('xml_firmado, ruc_emisor, tipo_documento, serie, numero')
                    .eq('id', cpeId)
                    .single();
                if (error || !cpeData) {
                    throw new Error('No se pudo obtener el XML del CPE');
                }
                xmlContent = cpeData.xml_firmado;
                fileName = `${cpeData.ruc_emisor}-${cpeData.tipo_documento}-${cpeData.serie}-${cpeData.numero}`;
            }
            const response = await this.oseService.enviarCpe(xmlContent, fileName);
            if (response.success) {
                console.log(`✅ [CPE] CPE ${cpeId} enviado exitosamente a SUNAT`);
                await this.supabaseService.update('cpe', {
                    estado: 'ACEPTADO',
                    cdr_sunat: response.cdr || 'CDR_RECEIVED',
                    hash: response.hashCPE || null,
                    numero_comprobante_sunat: response.numeroComprobante,
                    updated_at: new Date().toISOString(),
                }, { id: cpeId });
            }
            else {
                console.error(`❌ [CPE] Error enviando CPE ${cpeId}: ${response.descripcionRespuesta}`);
                await this.supabaseService.update('cpe', {
                    estado: 'RECHAZADO',
                    error_message: `${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
                    updated_at: new Date().toISOString(),
                }, { id: cpeId });
            }
        }
        catch (error) {
            console.error(`❌ [CPE] Error técnico enviando CPE ${cpeId}:`, error);
            await this.supabaseService.update('cpe', {
                estado: 'RECHAZADO',
                error_message: `Error técnico: ${error.message}`,
                updated_at: new Date().toISOString(),
            }, { id: cpeId });
        }
    }
    generateXmlContent(factura) {
        return `<?xml version="1.0" encoding="UTF-8"?>
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
  <cbc:ID>${factura.serie}-${factura.numero}</cbc:ID>
  <cbc:IssueDate>${new Date().toISOString().split('T')[0]}</cbc:IssueDate>
  <cbc:InvoiceTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${factura.tipo_documento}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listName="Currency" listAgencyName="United Nations Economic Commission for Europe">${factura.moneda}</cbc:DocumentCurrencyCode>

  <!-- Supplier Party -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${factura.ruc_emisor}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${factura.razon_social_emisor}]]></cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- Customer Party -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${factura.tipo_documento_receptor}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${factura.documento_receptor}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${factura.razon_social_receptor}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    }
  </cac:AccountingCustomerParty>

  <!-- Tax Total -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${factura.moneda}">${factura.total_igv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${factura.moneda}">${factura.total_gravadas.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${factura.moneda}">${factura.total_igv.toFixed(2)}</cbc:TaxAmount>
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

  <!-- Legal Monetary Total -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${factura.moneda}">${factura.total_gravadas.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${factura.moneda}">${factura.total_venta.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${factura.moneda}">${factura.total_venta.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- Invoice Lines -->
  ${factura.items.map((item, index) => `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${item.unidad}">${item.cantidad}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${factura.moneda}">${item.valor_venta.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description><![CDATA[${item.descripcion}]]></cbc:Description>
      <cac:SellersItemIdentification>
        <cbc:ID>${item.codigo}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${factura.moneda}">${item.precio_unitario.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
  `).join('')}

</Invoice>`;
    }
    generateSimplePdfContent(cpe) {
        return `
FACTURA ELECTRÓNICA
===================

Serie: ${cpe.serie}
Número: ${cpe.numero}
Fecha: ${new Date().toLocaleDateString()}

EMISOR:
${cpe.razon_social_emisor}
RUC: ${cpe.ruc_emisor}

RECEPTOR:
${cpe.razon_social_receptor}
${cpe.tipo_documento_receptor}: ${cpe.documento_receptor}

DETALLE:
${cpe.items.map(item => `${item.descripcion} - Cant: ${item.cantidad} - Precio: ${item.precio_unitario}`).join('\n')}

TOTALES:
Subtotal: ${cpe.total_gravadas}
IGV: ${cpe.total_igv}
Total: ${cpe.total_venta}

Estado: ${cpe.estado}
Hash: ${cpe.hash}

---
Documento generado por ERP Suite
`;
    }
    generateSimplePdfContentFromData(cpeData) {
        const items = Array.isArray(cpeData.items) ? cpeData.items : [];
        return `
COMPROBANTE ELECTRÓNICO
======================

Serie: ${cpeData.serie || 'N/A'}
Número: ${cpeData.numero || 'N/A'}
Fecha: ${cpeData.created_at ? new Date(cpeData.created_at).toLocaleDateString() : new Date().toLocaleDateString()}

EMISOR:
${cpeData.razon_social_emisor || 'ERP KAME'}
RUC: ${cpeData.ruc_emisor || '12345678901'}

RECEPTOR:
${cpeData.razon_social_receptor || 'Cliente General'}
Documento: ${cpeData.documento_receptor || 'Sin documento'}

DETALLE:
${items.length > 0 ? items.map((item, index) => `${index + 1}. ${item.nombre_producto || item.descripcion || 'Producto'} - Cant: ${item.cantidad || 1} - Precio: S/${item.precio_unitario || 0}`).join('\n') : 'No hay items disponibles'}

TOTALES:
Subtotal: S/${parseFloat(cpeData.total_gravadas || 0).toFixed(2)}
IGV: S/${parseFloat(cpeData.total_igv || 0).toFixed(2)}
Total: S/${parseFloat(cpeData.total_venta || 0).toFixed(2)}

Estado: ${cpeData.estado || 'EMITIDO'}
Hash: ${cpeData.hash || 'N/A'}

---
Documento generado por ERP KAME
${new Date().toLocaleString()}
`;
    }
    evaluarSiRequiereTransporte(createFacturaDto) {
        if (createFacturaDto.total_venta > 1000) {
            return true;
        }
        if (createFacturaDto.total_venta > 500) {
            return true;
        }
        return false;
    }
    mapToDto(cpeData) {
        return {
            id: cpeData.id,
            tipo_documento: cpeData.tipo_documento,
            serie: cpeData.serie,
            numero: cpeData.numero,
            ruc_emisor: cpeData.ruc_emisor,
            razon_social_emisor: cpeData.razon_social_emisor,
            tipo_documento_receptor: cpeData.tipo_documento_receptor,
            documento_receptor: cpeData.documento_receptor,
            razon_social_receptor: cpeData.razon_social_receptor,
            direccion_receptor: cpeData.direccion_receptor,
            moneda: cpeData.moneda,
            items: cpeData.items,
            total_gravadas: parseFloat(cpeData.total_gravadas),
            total_igv: parseFloat(cpeData.total_igv),
            total_venta: parseFloat(cpeData.total_venta),
            estado: cpeData.estado,
            hash: cpeData.hash,
            xml_firmado: cpeData.xml_firmado,
            cdr_sunat: cpeData.cdr_sunat,
            error_message: cpeData.error_message,
            tenant_id: cpeData.tenant_id,
            created_at: new Date(cpeData.created_at),
            updated_at: new Date(cpeData.updated_at),
        };
    }
    async getComprobantesFromDatabase(filters = {}, tenantId) {
        try {
            console.log('📄 Consultando tabla CPE en Supabase...', filters, 'tenantId:', tenantId);
            const client = this.supabaseService.getClient();
            if (!client) {
                console.error('❌ Cliente de Supabase no disponible');
                return {
                    success: false,
                    message: 'Cliente de Supabase no configurado',
                    data: []
                };
            }
            console.log('🔍 Verificando tabla CPE...');
            let countQuery = client
                .from('cpe')
                .select('id', { count: 'exact', head: true });
            if (tenantId) {
                countQuery = countQuery.eq('tenant_id', tenantId);
            }
            const { count: totalCount, error: countError } = await countQuery;
            console.log('📊 Total registros en tabla CPE para tenant:', totalCount);
            if (countError) {
                console.error('❌ Error contando registros CPE:', countError);
            }
            let query = client
                .from('cpe')
                .select('*')
                .order('created_at', { ascending: false });
            if (tenantId) {
                query = query.eq('tenant_id', tenantId);
            }
            if (filters.tipoComprobante) {
                query = query.eq('tipo_documento', filters.tipoComprobante);
            }
            if (filters.estado) {
                query = query.eq('estado', filters.estado);
            }
            if (filters.fechaDesde) {
                query = query.gte('created_at', filters.fechaDesde);
            }
            if (filters.fechaHasta) {
                query = query.lte('created_at', filters.fechaHasta);
            }
            if (filters.cliente) {
                query = query.ilike('razon_social_receptor', `%${filters.cliente}%`);
            }
            query = query.limit(50);
            const { data: cpeData, error } = await query;
            if (error) {
                console.error('❌ Error consultando CPE:', error);
                console.error('📊 Detalles completos del error:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                });
                throw error;
            }
            console.log(`📊 Datos CPE encontrados:`, cpeData?.length || 0);
            console.log(`📊 Primera fila CPE (si existe):`, cpeData?.[0] || 'Sin datos');
            console.log(`📊 Datos completos CPE:`, cpeData);
            const comprobantesFormateados = (cpeData || []).map(cpe => ({
                id: cpe.id,
                tipoComprobante: this.getTipoComprobanteText(cpe.tipo_documento),
                serie: cpe.serie,
                numero: cpe.numero,
                fechaEmision: cpe.created_at ? new Date(cpe.created_at).toISOString().split('T')[0] : '',
                cliente: cpe.razon_social_receptor || 'Cliente General',
                clienteRuc: cpe.documento_receptor || '',
                total: parseFloat(cpe.total_venta || 0),
                moneda: cpe.moneda || 'PEN',
                estado: cpe.estado || 'BORRADOR',
                estadoSunat: cpe.estado,
                observaciones: cpe.error_message || '',
                fechaCreacion: cpe.created_at
            }));
            console.log(`✅ Se formatearon ${comprobantesFormateados.length} comprobantes`);
            return {
                success: true,
                data: comprobantesFormateados,
                message: `Se encontraron ${comprobantesFormateados.length} comprobantes`
            };
        }
        catch (error) {
            console.error('❌ Error general en getComprobantesFromDatabase:', error);
            return {
                success: false,
                data: [],
                message: `Error consultando comprobantes: ${error.message}`,
                error: error.message
            };
        }
    }
    getTipoComprobanteText(tipo) {
        switch (tipo) {
            case '01':
                return 'Factura';
            case '03':
                return 'Boleta';
            case '07':
                return 'Nota Crédito';
            case '08':
                return 'Nota Débito';
            case 'TICKET':
                return 'Ticket';
            default:
                return tipo || 'Desconocido';
        }
    }
    async getStatsFromDatabase(tenantId) {
        try {
            console.log('📊 Calculando estadísticas CPE desde BD para tenant:', tenantId);
            const client = this.supabaseService.getClient();
            if (!client) {
                throw new Error('Cliente de Supabase no disponible');
            }
            const hoy = new Date().toISOString().split('T')[0];
            const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            let queryHoy = client
                .from('cpe')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', `${hoy}T00:00:00Z`)
                .lte('created_at', `${hoy}T23:59:59Z`);
            if (tenantId) {
                queryHoy = queryHoy.eq('tenant_id', tenantId);
            }
            const { count: cpeHoy } = await queryHoy;
            let queryMes = client
                .from('cpe')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', inicioMes);
            if (tenantId) {
                queryMes = queryMes.eq('tenant_id', tenantId);
            }
            const { count: cpeMes } = await queryMes;
            let queryMonto = client
                .from('cpe')
                .select('total_venta')
                .gte('created_at', inicioMes);
            if (tenantId) {
                queryMonto = queryMonto.eq('tenant_id', tenantId);
            }
            const { data: montoData } = await queryMonto;
            const montoFacturado = (montoData || []).reduce((sum, cpe) => sum + parseFloat(cpe.total_venta || 0), 0);
            let queryRechazados = client
                .from('cpe')
                .select('id', { count: 'exact', head: true })
                .eq('estado', 'RECHAZADO');
            if (tenantId) {
                queryRechazados = queryRechazados.eq('tenant_id', tenantId);
            }
            const { count: rechazados } = await queryRechazados;
            const stats = {
                cpeEmitidosHoy: cpeHoy || 0,
                cpeDelMes: cpeMes || 0,
                montoFacturado: Math.round(montoFacturado * 100) / 100,
                rechazados: rechazados || 0
            };
            console.log('✅ Estadísticas calculadas:', stats);
            return {
                success: true,
                data: stats
            };
        }
        catch (error) {
            console.error('❌ Error calculando estadísticas:', error);
            return {
                success: false,
                data: {
                    cpeEmitidosHoy: 0,
                    cpeDelMes: 0,
                    montoFacturado: 0,
                    rechazados: 0
                },
                error: error.message
            };
        }
    }
};
exports.CpeService = CpeService;
exports.CpeService = CpeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        config_1.ConfigService,
        event_bus_service_1.EventBusService,
        ose_service_1.OseService])
], CpeService);
