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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentosService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../shared/supabase/supabase.service");
let DocumentosService = class DocumentosService {
    constructor(supabaseService) {
        this.supabaseService = supabaseService;
    }
    // ========== ESTADÍSTICAS ==========
    async getStats(tenantId) {
        try {
            console.log('📊 Calculando estadísticas documentos para tenant:', tenantId);
            // Primero, intentar una consulta simple para verificar conectividad
            const { data: testData, error: testError } = await this.supabaseService
                .getClient()
                .from('documentos')
                .select('id')
                .limit(1);
            if (testError) {
                console.error('❌ Error de conectividad con tabla documentos:', testError);
                throw new Error(`Error de base de datos: ${testError.message}`);
            }
            console.log('✅ Conexión con tabla documentos OK, registros encontrados:', testData?.length || 0);
            // Contar total de documentos
            let queryTotal = this.supabaseService
                .getClient()
                .from('documentos')
                .select('*', { count: 'exact', head: true });
            if (tenantId) {
                console.log('🔍 Filtrando por tenant_id:', tenantId);
                queryTotal = queryTotal.eq('tenant_id', tenantId);
            }
            const { count: totalDocumentos, error: errorTotal } = await queryTotal;
            if (errorTotal) {
                console.error('❌ Error contando documentos:', errorTotal);
                throw new Error(`Error contando documentos: ${errorTotal.message}`);
            }
            // Contar por tipo de documento
            const tiposConteo = await Promise.all([
                this.contarPorTipo('FACTURA', tenantId),
                this.contarPorTipo('BOLETA', tenantId),
                this.contarPorTipo('NOTA_CREDITO', tenantId),
                this.contarPorTipo('CONTRATO', tenantId)
            ]);
            // Contar pendientes de envío
            let queryPendientes = this.supabaseService
                .getClient()
                .from('documentos')
                .select('*', { count: 'exact', head: true })
                .in('estado', ['BORRADOR', 'EMITIDO']);
            if (tenantId) {
                queryPendientes = queryPendientes.eq('tenant_id', tenantId);
            }
            const { count: pendientesEnvio } = await queryPendientes;
            const stats = {
                totalDocumentos: totalDocumentos || 0,
                facturas: tiposConteo[0],
                boletas: tiposConteo[1],
                notasCredito: tiposConteo[2],
                contratos: tiposConteo[3],
                pendientesEnvio: pendientesEnvio || 0,
            };
            console.log('✅ Estadísticas documentos calculadas:', stats);
            return {
                success: true,
                data: stats,
            };
        }
        catch (error) {
            console.error('❌ Error getting documentos stats:', error);
            return {
                success: false,
                data: {
                    totalDocumentos: 0,
                    facturas: 0,
                    boletas: 0,
                    notasCredito: 0,
                    contratos: 0,
                    pendientesEnvio: 0,
                },
                error: error.message
            };
        }
    }
    async contarPorTipo(tipo, tenantId) {
        try {
            let query = this.supabaseService
                .getClient()
                .from('documentos')
                .select('*', { count: 'exact', head: true })
                .eq('tipo_documento', tipo);
            if (tenantId) {
                query = query.eq('tenant_id', tenantId);
            }
            const { count, error } = await query;
            if (error) {
                console.error(`❌ Error contando documentos tipo ${tipo}:`, error);
                return 0;
            }
            console.log(`📊 Documentos tipo ${tipo}: ${count || 0}`);
            return count || 0;
        }
        catch (error) {
            console.error(`❌ Error en contarPorTipo para ${tipo}:`, error);
            return 0;
        }
    }
    // ========== GESTIÓN DE DOCUMENTOS ==========
    async getDocumentos(filters, tenantId) {
        try {
            console.log('📄 Consultando documentos para tenant:', tenantId, 'filters:', filters);
            let query = this.supabaseService
                .getClient()
                .from('documentos')
                .select(`
          *,
          documento_detalles(*)
        `)
                .order('created_at', { ascending: false });
            // Filter by tenant
            if (tenantId) {
                query = query.eq('tenant_id', tenantId);
            }
            // Apply filters
            if (filters.tipo_documento) {
                query = query.eq('tipo_documento', filters.tipo_documento);
            }
            if (filters.estado) {
                query = query.eq('estado', filters.estado);
            }
            if (filters.fecha_desde) {
                query = query.gte('fecha_emision', filters.fecha_desde);
            }
            if (filters.fecha_hasta) {
                query = query.lte('fecha_emision', filters.fecha_hasta);
            }
            if (filters.receptor_numero_doc) {
                query = query.ilike('receptor_numero_doc', `%${filters.receptor_numero_doc}%`);
            }
            if (filters.serie) {
                query = query.eq('serie', filters.serie);
            }
            const { data, error } = await query;
            if (error) {
                console.error('❌ Error fetching documentos:', error);
                throw new common_1.BadRequestException('Error fetching documentos: ' + error.message);
            }
            console.log(`📊 Se encontraron ${data?.length || 0} documentos`);
            return {
                success: true,
                data: data || [],
            };
        }
        catch (error) {
            console.error('❌ Error getting documentos:', error);
            return {
                success: false,
                data: [],
                error: error.message
            };
        }
    }
    async getDocumento(id, tenantId) {
        try {
            console.log('📄 Obteniendo documento:', id);
            let query = this.supabaseService
                .getClient()
                .from('documentos')
                .select(`
          *,
          documento_detalles(*),
          documento_archivos(*)
        `)
                .eq('id', id);
            if (tenantId) {
                query = query.eq('tenant_id', tenantId);
            }
            const { data: documento, error } = await query.single();
            if (error || !documento) {
                throw new common_1.NotFoundException('Documento no encontrado');
            }
            return {
                success: true,
                data: documento,
            };
        }
        catch (error) {
            console.error('❌ Error getting documento:', error);
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            throw new common_1.BadRequestException('Error al obtener el documento');
        }
    }
    async crearDocumento(documentoData, tenantId, userId) {
        try {
            console.log('📝 Creando nuevo documento:', documentoData.tipo_documento);
            // Validar datos requeridos
            if (!documentoData.tipo_documento || !documentoData.receptor_numero_doc || !documentoData.total) {
                throw new common_1.BadRequestException('Datos requeridos: tipo_documento, receptor_numero_doc, total');
            }
            // Obtener siguiente número de serie
            const siguienteNumero = await this.obtenerSiguienteNumero(documentoData.tipo_documento, documentoData.serie || this.getSerieDefault(documentoData.tipo_documento), tenantId);
            // Obtener datos de la empresa
            const empresaConfig = await this.obtenerConfigEmpresa(tenantId);
            const nuevoDocumento = {
                tenant_id: tenantId || '550e8400-e29b-41d4-a716-446655440000',
                tipo_documento: documentoData.tipo_documento,
                serie: documentoData.serie || this.getSerieDefault(documentoData.tipo_documento),
                numero: siguienteNumero,
                fecha_emision: documentoData.fecha_emision || new Date().toISOString(),
                fecha_vencimiento: documentoData.fecha_vencimiento,
                // Datos del emisor (empresa)
                emisor_ruc: empresaConfig.ruc || '20123456789',
                emisor_razon_social: empresaConfig.razon_social || 'EMPRESA DEMO SAC',
                emisor_direccion: empresaConfig.direccion_fiscal || 'AV. DEMO 123',
                // Datos del receptor
                receptor_tipo_doc: documentoData.receptor_tipo_doc || 'RUC',
                receptor_numero_doc: documentoData.receptor_numero_doc,
                receptor_razon_social: documentoData.receptor_razon_social || 'CLIENTE DEMO',
                receptor_direccion: documentoData.receptor_direccion,
                receptor_email: documentoData.receptor_email,
                // Montos
                moneda: documentoData.moneda || 'PEN',
                tipo_cambio: documentoData.tipo_cambio || 1.0000,
                subtotal: documentoData.subtotal || 0.00,
                descuentos: documentoData.descuentos || 0.00,
                impuesto_igv: documentoData.impuesto_igv || 0.00,
                impuesto_isc: documentoData.impuesto_isc || 0.00,
                otros_impuestos: documentoData.otros_impuestos || 0.00,
                total: documentoData.total,
                // Estado inicial
                estado: 'BORRADOR',
                observaciones: documentoData.observaciones,
                // Auditoría
                created_by: userId,
            };
            console.log('💾 Insertando nuevo documento:', nuevoDocumento);
            const { data: documento, error } = await this.supabaseService
                .getClient()
                .from('documentos')
                .insert(nuevoDocumento)
                .select()
                .single();
            if (error) {
                console.error('❌ Error creating documento:', error);
                throw new common_1.BadRequestException('Error creating documento: ' + error.message);
            }
            // Crear detalles si existen
            if (documentoData.detalles && Array.isArray(documentoData.detalles)) {
                await this.crearDetallesDocumento(documento.id, documentoData.detalles, tenantId);
            }
            // Registrar auditoría
            await this.registrarAuditoria(documento.id, 'CREADO', userId, 'Documento creado', tenantId);
            console.log('✅ Documento creado exitosamente:', documento.id);
            return {
                success: true,
                data: documento,
                message: 'Documento creado correctamente',
            };
        }
        catch (error) {
            console.error('❌ Error creating documento:', error);
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('Error al crear el documento');
        }
    }
    async crearDetallesDocumento(documentoId, detalles, tenantId) {
        const detallesConId = detalles.map((detalle, index) => ({
            documento_id: documentoId,
            tenant_id: tenantId || '550e8400-e29b-41d4-a716-446655440000',
            orden: index + 1,
            codigo_producto: detalle.codigo_producto,
            descripcion: detalle.descripcion,
            unidad_medida: detalle.unidad_medida || 'NIU',
            cantidad: detalle.cantidad,
            precio_unitario: detalle.precio_unitario,
            descuento_unitario: detalle.descuento_unitario || 0,
            valor_venta: detalle.valor_venta,
            impuesto_igv: detalle.impuesto_igv || 0,
            impuesto_isc: detalle.impuesto_isc || 0,
            total_item: detalle.total_item,
        }));
        const { error } = await this.supabaseService
            .getClient()
            .from('documento_detalles')
            .insert(detallesConId);
        if (error) {
            console.error('❌ Error creando detalles:', error);
            throw new common_1.BadRequestException('Error creando detalles del documento');
        }
    }
    // ========== FACTURACIÓN ELECTRÓNICA ==========
    async generarXML(id, tenantId) {
        try {
            console.log('🔧 Generando XML para documento:', id);
            const documento = await this.getDocumento(id, tenantId);
            if (!documento.success) {
                throw new common_1.NotFoundException('Documento no encontrado');
            }
            const doc = documento.data;
            // Generar XML según tipo de documento
            let xmlContent = '';
            switch (doc.tipo_documento) {
                case 'FACTURA':
                    xmlContent = this.generarXMLFactura(doc);
                    break;
                case 'BOLETA':
                    xmlContent = this.generarXMLBoleta(doc);
                    break;
                case 'NOTA_CREDITO':
                    xmlContent = this.generarXMLNotaCredito(doc);
                    break;
                case 'NOTA_DEBITO':
                    xmlContent = this.generarXMLNotaDebito(doc);
                    break;
                default:
                    throw new common_1.BadRequestException('Tipo de documento no soportado para XML');
            }
            // Generar hash del XML
            const codigoHash = this.generarHashXML(xmlContent);
            // Actualizar documento con XML generado
            const { error } = await this.supabaseService
                .getClient()
                .from('documentos')
                .update({
                xml_content: xmlContent,
                codigo_hash: codigoHash,
                estado: 'EMITIDO',
                updated_at: new Date().toISOString(),
            })
                .eq('id', id);
            if (error) {
                throw new common_1.BadRequestException('Error actualizando documento con XML');
            }
            // Registrar auditoría
            await this.registrarAuditoria(id, 'XML_GENERADO', null, 'XML generado exitosamente', tenantId);
            return {
                success: true,
                data: {
                    xml_content: xmlContent,
                    codigo_hash: codigoHash,
                },
                message: 'XML generado correctamente',
            };
        }
        catch (error) {
            console.error('❌ Error generando XML:', error);
            if (error instanceof common_1.NotFoundException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('Error al generar el XML');
        }
    }
    async enviarSUNAT(id, tenantId, userId) {
        try {
            console.log('📡 Enviando documento a SUNAT:', id);
            const documento = await this.getDocumento(id, tenantId);
            if (!documento.success) {
                throw new common_1.NotFoundException('Documento no encontrado');
            }
            const doc = documento.data;
            if (doc.estado !== 'EMITIDO') {
                throw new common_1.BadRequestException('El documento debe estar emitido para enviarse a SUNAT');
            }
            if (!doc.xml_content) {
                throw new common_1.BadRequestException('El documento debe tener XML generado');
            }
            // Simular envío a SUNAT (en producción aquí iría la integración real)
            const resultadoEnvio = await this.simularEnvioSUNAT(doc);
            // Actualizar estado del documento
            const { error } = await this.supabaseService
                .getClient()
                .from('documentos')
                .update({
                estado: resultadoEnvio.success ? 'ENVIADO_SUNAT' : 'RECHAZADO',
                estado_sunat: resultadoEnvio.codigoRespuesta,
                cdr_content: resultadoEnvio.cdr,
                updated_at: new Date().toISOString(),
            })
                .eq('id', id);
            if (error) {
                throw new common_1.BadRequestException('Error actualizando estado del documento');
            }
            // Registrar auditoría
            await this.registrarAuditoria(id, 'ENVIADO_SUNAT', userId, `Enviado a SUNAT: ${resultadoEnvio.codigoRespuesta}`, tenantId);
            return {
                success: resultadoEnvio.success,
                data: {
                    codigo_respuesta: resultadoEnvio.codigoRespuesta,
                    mensaje: resultadoEnvio.mensaje,
                    cdr: resultadoEnvio.cdr,
                },
                message: resultadoEnvio.mensaje,
            };
        }
        catch (error) {
            console.error('❌ Error enviando a SUNAT:', error);
            if (error instanceof common_1.NotFoundException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('Error al enviar el documento a SUNAT');
        }
    }
    // ========== VALIDACIONES ==========
    async validarRUC(ruc) {
        try {
            console.log('🔍 Validando RUC:', ruc);
            // Validación básica de formato
            if (!ruc || ruc.length !== 11 || !/^\d+$/.test(ruc)) {
                return {
                    success: false,
                    data: null,
                    error: 'RUC debe tener 11 dígitos numéricos',
                };
            }
            // Simular consulta a SUNAT (en producción aquí iría la integración real)
            const datosRUC = await this.consultarRUCSUNAT(ruc);
            return {
                success: true,
                data: datosRUC,
                message: 'RUC validado correctamente',
            };
        }
        catch (error) {
            console.error('❌ Error validando RUC:', error);
            return {
                success: false,
                data: null,
                error: error.message,
            };
        }
    }
    async validarDocumento(documentoData) {
        try {
            console.log('✅ Validando documento antes de envío');
            const errores = [];
            // Validaciones obligatorias
            if (!documentoData.tipo_documento)
                errores.push('Tipo de documento es requerido');
            if (!documentoData.receptor_numero_doc)
                errores.push('Número de documento del receptor es requerido');
            if (!documentoData.receptor_razon_social)
                errores.push('Razón social del receptor es requerida');
            if (!documentoData.total || documentoData.total <= 0)
                errores.push('Total debe ser mayor a 0');
            // Validaciones específicas por tipo
            if (documentoData.tipo_documento === 'FACTURA' && documentoData.receptor_numero_doc.length !== 11) {
                errores.push('Las facturas requieren RUC del cliente (11 dígitos)');
            }
            if (documentoData.tipo_documento === 'BOLETA' && documentoData.total > 700) {
                errores.push('Boletas mayores a S/ 700 requieren documento de identidad del cliente');
            }
            // Validar detalles si existen
            if (documentoData.detalles && Array.isArray(documentoData.detalles)) {
                documentoData.detalles.forEach((detalle, index) => {
                    if (!detalle.descripcion)
                        errores.push(`Detalle ${index + 1}: Descripción es requerida`);
                    if (!detalle.cantidad || detalle.cantidad <= 0)
                        errores.push(`Detalle ${index + 1}: Cantidad debe ser mayor a 0`);
                    if (!detalle.precio_unitario || detalle.precio_unitario <= 0)
                        errores.push(`Detalle ${index + 1}: Precio unitario debe ser mayor a 0`);
                });
            }
            return {
                success: errores.length === 0,
                data: {
                    valido: errores.length === 0,
                    errores: errores,
                },
                message: errores.length === 0 ? 'Documento válido' : `Se encontraron ${errores.length} errores`,
            };
        }
        catch (error) {
            console.error('❌ Error validando documento:', error);
            return {
                success: false,
                data: {
                    valido: false,
                    errores: ['Error interno de validación'],
                },
                error: error.message,
            };
        }
    }
    // ========== MÉTODOS AUXILIARES ==========
    getSerieDefault(tipoDocumento) {
        const series = {
            'FACTURA': 'F001',
            'BOLETA': 'B001',
            'NOTA_CREDITO': 'FC01',
            'NOTA_DEBITO': 'FD01',
            'CONTRATO': 'C001',
        };
        return series[tipoDocumento] || 'DOC1';
    }
    async obtenerSiguienteNumero(tipoDocumento, serie, tenantId) {
        // Obtener configuración de serie
        let query = this.supabaseService
            .getClient()
            .from('documento_series')
            .select('correlativo_actual')
            .eq('tipo_documento', tipoDocumento)
            .eq('serie', serie);
        if (tenantId) {
            query = query.eq('tenant_id', tenantId);
        }
        const { data: serieConfig } = await query.single();
        const siguienteCorrelativo = (serieConfig?.correlativo_actual || 0) + 1;
        // Actualizar correlativo
        await this.supabaseService
            .getClient()
            .from('documento_series')
            .upsert({
            tenant_id: tenantId || '550e8400-e29b-41d4-a716-446655440000',
            tipo_documento: tipoDocumento,
            serie: serie,
            correlativo_actual: siguienteCorrelativo,
        });
        return siguienteCorrelativo.toString().padStart(8, '0');
    }
    async obtenerConfigEmpresa(tenantId) {
        let query = this.supabaseService
            .getClient()
            .from('fe_configuracion')
            .select('*');
        if (tenantId) {
            query = query.eq('tenant_id', tenantId);
        }
        const { data } = await query.single();
        return data || {
            ruc: '20123456789',
            razon_social: 'EMPRESA DEMO SAC',
            direccion_fiscal: 'AV. DEMO 123, LIMA',
        };
    }
    generarXMLFactura(documento) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${documento.serie}-${documento.numero}</cbc:ID>
  <cbc:IssueDate>${documento.fecha_emision.slice(0, 10)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode listID="0101">${documento.tipo_documento === 'FACTURA' ? '01' : '03'}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${documento.moneda}</cbc:DocumentCurrencyCode>
  
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${documento.emisor_ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${documento.emisor_razon_social}]]></cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${documento.receptor_tipo_doc === 'RUC' ? '6' : '1'}">${documento.receptor_numero_doc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${documento.receptor_razon_social}]]></cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${documento.moneda}">${documento.subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${documento.moneda}">${documento.total}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${documento.moneda}">${documento.total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
    }
    generarXMLBoleta(documento) {
        // Similar al XML de factura pero con diferencias específicas para boletas
        return this.generarXMLFactura(documento).replace('Invoice', 'Invoice');
    }
    generarXMLNotaCredito(documento) {
        return this.generarXMLFactura(documento).replace('Invoice', 'CreditNote');
    }
    generarXMLNotaDebito(documento) {
        return this.generarXMLFactura(documento).replace('Invoice', 'DebitNote');
    }
    generarHashXML(xmlContent) {
        // En producción aquí iría el hash SHA-256 real
        return `SHA256_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    async simularEnvioSUNAT(documento) {
        // Simular tiempo de respuesta
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Simular respuesta de SUNAT (90% éxito)
        const exito = Math.random() > 0.1;
        if (exito) {
            return {
                success: true,
                codigoRespuesta: '0',
                mensaje: 'Comprobante recibido correctamente',
                cdr: `CDR_${documento.serie}_${documento.numero}_${Date.now()}`,
            };
        }
        else {
            return {
                success: false,
                codigoRespuesta: '2324',
                mensaje: 'Error en la estructura del comprobante',
                cdr: null,
            };
        }
    }
    async consultarRUCSUNAT(ruc) {
        // Simular consulta a SUNAT
        await new Promise(resolve => setTimeout(resolve, 500));
        // Datos simulados
        return {
            ruc: ruc,
            razon_social: `EMPRESA DEMO ${ruc.slice(-3)} S.A.C.`,
            estado: 'ACTIVO',
            condicion: 'HABIDO',
            direccion: 'AV. EJEMPLO 123, LIMA, LIMA, LIMA',
            ubigeo: '150101',
        };
    }
    async registrarAuditoria(documentoId, accion, usuarioId, detalles, tenantId) {
        await this.supabaseService
            .getClient()
            .from('documento_auditoria')
            .insert({
            documento_id: documentoId,
            tenant_id: tenantId || '550e8400-e29b-41d4-a716-446655440000',
            accion: accion,
            usuario_id: usuarioId,
            detalles_cambio: detalles,
            timestamp: new Date().toISOString(),
        });
    }
    // ========== MÉTODOS ADICIONALES ==========
    async getSeries(tenantId) {
        try {
            let query = this.supabaseService
                .getClient()
                .from('documento_series')
                .select('*')
                .eq('activo', true);
            if (tenantId) {
                query = query.eq('tenant_id', tenantId);
            }
            const { data, error } = await query;
            if (error) {
                throw new common_1.BadRequestException('Error obteniendo series: ' + error.message);
            }
            return {
                success: true,
                data: data || [],
            };
        }
        catch (error) {
            console.error('❌ Error getting series:', error);
            return {
                success: false,
                data: [],
                error: error.message,
            };
        }
    }
    async crearSerie(serieData, tenantId) {
        try {
            const nuevaSerie = {
                tenant_id: tenantId || '550e8400-e29b-41d4-a716-446655440000',
                tipo_documento: serieData.tipo_documento,
                serie: serieData.serie,
                correlativo_actual: 0,
                correlativo_maximo: serieData.correlativo_maximo || 99999999,
                activo: true,
            };
            const { data, error } = await this.supabaseService
                .getClient()
                .from('documento_series')
                .insert(nuevaSerie)
                .select()
                .single();
            if (error) {
                throw new common_1.BadRequestException('Error creando serie: ' + error.message);
            }
            return {
                success: true,
                data: data,
                message: 'Serie creada correctamente',
            };
        }
        catch (error) {
            console.error('❌ Error creating serie:', error);
            return {
                success: false,
                data: null,
                error: error.message,
            };
        }
    }
    async getAuditoria(documentoId, tenantId) {
        try {
            let query = this.supabaseService
                .getClient()
                .from('documento_auditoria')
                .select('*')
                .eq('documento_id', documentoId)
                .order('timestamp', { ascending: false });
            if (tenantId) {
                query = query.eq('tenant_id', tenantId);
            }
            const { data, error } = await query;
            if (error) {
                throw new common_1.BadRequestException('Error obteniendo auditoría: ' + error.message);
            }
            return {
                success: true,
                data: data || [],
            };
        }
        catch (error) {
            console.error('❌ Error getting auditoria:', error);
            return {
                success: false,
                data: [],
                error: error.message,
            };
        }
    }
    async actualizarDocumento(id, documentoData, tenantId, userId) {
        try {
            // Verificar que el documento existe y se puede modificar
            const documento = await this.getDocumento(id, tenantId);
            if (!documento.success) {
                throw new common_1.NotFoundException('Documento no encontrado');
            }
            if (documento.data.estado === 'ENVIADO_SUNAT') {
                throw new common_1.BadRequestException('No se puede modificar un documento ya enviado a SUNAT');
            }
            const { error } = await this.supabaseService
                .getClient()
                .from('documentos')
                .update({
                ...documentoData,
                updated_at: new Date().toISOString(),
            })
                .eq('id', id);
            if (error) {
                throw new common_1.BadRequestException('Error actualizando documento: ' + error.message);
            }
            // Registrar auditoría
            await this.registrarAuditoria(id, 'MODIFICADO', userId, 'Documento actualizado', tenantId);
            return {
                success: true,
                data: { id },
                message: 'Documento actualizado correctamente',
            };
        }
        catch (error) {
            console.error('❌ Error updating documento:', error);
            if (error instanceof common_1.NotFoundException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('Error al actualizar el documento');
        }
    }
    async anularDocumento(id, motivo, tenantId, userId) {
        try {
            const documento = await this.getDocumento(id, tenantId);
            if (!documento.success) {
                throw new common_1.NotFoundException('Documento no encontrado');
            }
            if (documento.data.estado === 'ANULADO') {
                throw new common_1.BadRequestException('El documento ya está anulado');
            }
            const { error } = await this.supabaseService
                .getClient()
                .from('documentos')
                .update({
                estado: 'ANULADO',
                motivo_anulacion: motivo,
                updated_at: new Date().toISOString(),
            })
                .eq('id', id);
            if (error) {
                throw new common_1.BadRequestException('Error anulando documento: ' + error.message);
            }
            // Registrar auditoría
            await this.registrarAuditoria(id, 'ANULADO', userId, `Documento anulado: ${motivo}`, tenantId);
            return {
                success: true,
                data: { id },
                message: 'Documento anulado correctamente',
            };
        }
        catch (error) {
            console.error('❌ Error anulando documento:', error);
            if (error instanceof common_1.NotFoundException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('Error al anular el documento');
        }
    }
    async generarPDF(id, tenantId) {
        try {
            const documento = await this.getDocumento(id, tenantId);
            if (!documento.success) {
                throw new common_1.NotFoundException('Documento no encontrado');
            }
            // En producción aquí iría la generación real del PDF
            const pdfContent = this.generarPDFContent(documento.data);
            // Registrar auditoría
            await this.registrarAuditoria(id, 'DESCARGADO', null, 'PDF descargado', tenantId);
            return {
                success: true,
                data: pdfContent,
                message: 'PDF generado correctamente',
            };
        }
        catch (error) {
            console.error('❌ Error generando PDF:', error);
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            throw new common_1.BadRequestException('Error al generar el PDF');
        }
    }
    async descargarXML(id, tenantId) {
        try {
            const documento = await this.getDocumento(id, tenantId);
            if (!documento.success) {
                throw new common_1.NotFoundException('Documento no encontrado');
            }
            if (!documento.data.xml_content) {
                throw new common_1.BadRequestException('El documento no tiene XML generado');
            }
            // Registrar auditoría
            await this.registrarAuditoria(id, 'DESCARGADO', null, 'XML descargado', tenantId);
            return {
                success: true,
                data: documento.data.xml_content,
                message: 'XML descargado correctamente',
            };
        }
        catch (error) {
            console.error('❌ Error descargando XML:', error);
            if (error instanceof common_1.NotFoundException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('Error al descargar el XML');
        }
    }
    generarPDFContent(documento) {
        // Simulación de contenido PDF (en producción sería un buffer PDF real)
        return `PDF Content for Document ${documento.serie}-${documento.numero}
Fecha: ${documento.fecha_emision}
Cliente: ${documento.receptor_razon_social}
Total: ${documento.moneda} ${documento.total}

[This would be actual PDF binary content in production]`;
    }
};
exports.DocumentosService = DocumentosService;
exports.DocumentosService = DocumentosService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], DocumentosService);
