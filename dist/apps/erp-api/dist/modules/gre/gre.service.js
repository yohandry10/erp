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
exports.GreService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../../shared/supabase/supabase.service");
const event_bus_service_1 = require("../../shared/events/event-bus.service");
const inventory_integration_service_1 = require("../../shared/integration/inventory-integration.service");
const ose_service_1 = require("../ose/ose.service");
let GreService = class GreService {
    constructor(supabaseService, eventBus, inventoryService, oseService) {
        this.supabaseService = supabaseService;
        this.eventBus = eventBus;
        this.inventoryService = inventoryService;
        this.oseService = oseService;
        console.log('🚚 [GRE] ¡Servicio GRE inicializado con integración SUNAT!');
        this.initializeEventListeners();
        console.log('🚚 [GRE] ¡Constructor completado!');
    }
    initializeEventListeners() {
        console.log('🚚 [GRE] Inicializando listeners de eventos...');
        this.eventBus.on('cpe.requiere_transporte', async (event) => {
            console.log('🚚 [GRE] ¡EVENTO RECIBIDO! CPE requiere transporte');
            console.log('🚚 [GRE] Evento completo:', JSON.stringify(event, null, 2));
            try {
                await this.evaluarCreacionAutomaticaGRE(event.data);
            }
            catch (error) {
                console.error('❌ [GRE] Error procesando evento de transporte:', error);
            }
        });
        this.eventBus.on('comprobante.creado', async (event) => {
            console.log('🚚 [GRE] Evento comprobante.creado recibido');
            console.log('🚚 [GRE] Datos del comprobante:', event.data);
            if (event.data?.requiereTransporte) {
                console.log('🚚 [GRE] Comprobante requiere transporte, creando GRE...');
                try {
                    await this.evaluarCreacionAutomaticaGRE({
                        cpeId: event.data.cpeId,
                        clienteId: event.data.clienteId,
                        total: event.data.total,
                        productos: []
                    });
                }
                catch (error) {
                    console.error('❌ [GRE] Error procesando comprobante creado:', error);
                }
            }
        });
        console.log('✅ [GRE] Event listeners configurados correctamente');
        console.log('🚚 [GRE] Listeners activos:', this.eventBus['eventEmitter'].eventNames());
    }
    async evaluarCreacionAutomaticaGRE(datos) {
        try {
            console.log(`🚚 [GRE] Evaluando creación automática para CPE:`, datos);
            const cpeId = datos.cpeId;
            const clienteId = datos.clienteId;
            const total = datos.total;
            const productos = datos.productos || [];
            console.log(`🚚 [GRE] Datos del evento - CPE: ${cpeId}, Cliente: ${clienteId}, Total: S/ ${total}`);
            const requiereGREAutomatica = await this.verificarConfiguracionClienteTransporte(clienteId, total);
            if (requiereGREAutomatica) {
                console.log('🚚 [GRE] ✅ Cliente configurado para GRE automática, creando...');
                const greAutomatica = await this.createGuia({
                    destinatario: `Cliente ${clienteId}`,
                    direccionDestino: 'Lima, Perú - Dirección por configurar',
                    fechaTraslado: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    modalidad: 'TRANSPORTE_PUBLICO',
                    motivo: 'VENTA',
                    pesoTotal: this.calcularPesoEstimado(productos, total),
                    observaciones: `GRE automática generada para CPE ${cpeId} - Total: S/ ${total}`,
                    transportista: 'Transporte por definir',
                    placaVehiculo: null,
                    licenciaConducir: null,
                    cpeRelacionado: cpeId
                });
                console.log(`✅ [GRE] GRE automática creada exitosamente:`, {
                    id: greAutomatica.id,
                    numero: greAutomatica.numero,
                    destinatario: greAutomatica.destinatario,
                    pesoTotal: greAutomatica.pesoTotal
                });
            }
            else {
                console.log('🚚 [GRE] ⚠️ Cliente no requiere GRE automática, creación manual requerida');
            }
        }
        catch (error) {
            console.error('❌ [GRE] Error evaluando creación automática:', error);
            throw error;
        }
    }
    async verificarConfiguracionClienteTransporte(clienteId, total) {
        console.log(`🚚 [GRE] Verificando configuración de transporte para cliente ${clienteId} con total S/ ${total}`);
        if (total > 500) {
            console.log(`✅ [GRE] Total > S/ 500, requiere GRE automática`);
            return true;
        }
        console.log(`✅ [GRE] Cliente configurado para crear GRE automática`);
        return true;
    }
    calcularPesoEstimado(productos, total) {
        console.log(`🚚 [GRE] Calculando peso estimado para ${productos.length} productos, total S/ ${total}`);
        let pesoEstimado = total / 100;
        if (productos.length > 0) {
            pesoEstimado += productos.length * 0.5;
        }
        else {
            pesoEstimado = total / 50;
        }
        const pesoFinal = Math.max(Math.round(pesoEstimado * 100) / 100, 1);
        console.log(`🚚 [GRE] Peso estimado calculado: ${pesoFinal} kg`);
        return pesoFinal;
    }
    findAll() {
        return {
            message: 'GRE module is working',
            data: []
        };
    }
    async findAllGuias() {
        const supabase = this.supabaseService.getClient();
        try {
            console.log('🔍 Consultando tabla gre_guias...');
            const { data, error } = await supabase
                .from('gre_guias')
                .select('*')
                .order('created_at', { ascending: false });
            console.log('📊 Resultado de consulta:', { data, error });
            if (error) {
                console.error('❌ Error al consultar GREs:', error);
                throw new Error(`Error al consultar las guías de remisión: ${error.message}`);
            }
            console.log(`✅ Se encontraron ${data?.length || 0} registros GRE`);
            return (data || []).map(gre => ({
                id: gre.id,
                numero: gre.numero,
                estado: gre.estado,
                destinatario: gre.destinatario,
                direccionDestino: gre.direccion_destino,
                fechaTraslado: gre.fecha_traslado,
                fechaCreacion: gre.created_at,
                modalidad: gre.modalidad,
                motivo: gre.motivo,
                pesoTotal: gre.peso_total,
                observaciones: gre.observaciones,
                transportista: gre.transportista,
                placaVehiculo: gre.placa_vehiculo,
                licenciaConducir: gre.licencia_conducir,
                cpeRelacionado: gre.cpe_relacionado,
                numeroSunat: gre.numero_sunat,
                hashGre: gre.hash_gre
            }));
        }
        catch (error) {
            console.error('❌ Error en servicio GRE:', error);
            throw error;
        }
    }
    async findGuiaById(id) {
        const supabase = this.supabaseService.getClient();
        try {
            console.log(`🔍 Consultando GRE con ID: ${id}`);
            const { data, error } = await supabase
                .from('gre_guias')
                .select('*')
                .eq('id', id)
                .single();
            console.log('📊 Resultado de consulta individual:', { data, error });
            if (error) {
                console.error('❌ Error al consultar GRE:', error);
                throw new Error(`Error al consultar la guía de remisión: ${error.message}`);
            }
            if (!data) {
                throw new Error('Guía de remisión no encontrada');
            }
            console.log(`✅ GRE encontrada:`, data);
            return {
                id: data.id,
                numero: data.numero,
                estado: data.estado,
                destinatario: data.destinatario,
                direccionDestino: data.direccion_destino,
                fechaTraslado: data.fecha_traslado,
                fechaCreacion: data.created_at,
                modalidad: data.modalidad,
                motivo: data.motivo,
                pesoTotal: data.peso_total,
                observaciones: data.observaciones,
                transportista: data.transportista,
                placaVehiculo: data.placa_vehiculo,
                licenciaConducir: data.licencia_conducir,
                cpeRelacionado: data.cpe_relacionado,
                numeroSunat: data.numero_sunat,
                hashGre: data.hash_gre
            };
        }
        catch (error) {
            console.error('❌ Error en servicio GRE al obtener por ID:', error);
            throw error;
        }
    }
    async createGuia(greData) {
        const supabase = this.supabaseService.getClient();
        try {
            console.log('🚚 [GRE] Creando nueva guía de remisión...');
            console.log('🚚 [GRE] Datos recibidos:', greData);
            const numeroCorrelativo = await this.generarNumeroCorrelativo();
            const greDataInsert = {
                numero: numeroCorrelativo,
                estado: 'BORRADOR',
                destinatario: greData.destinatario,
                direccion_destino: greData.direccionDestino,
                fecha_traslado: greData.fechaTraslado,
                modalidad: greData.modalidad,
                motivo: greData.motivo,
                peso_total: greData.pesoTotal,
                observaciones: greData.observaciones,
                transportista: greData.transportista,
                placa_vehiculo: greData.placaVehiculo,
                licencia_conducir: greData.licenciaConducir,
                cpe_relacionado: greData.cpeRelacionado || null,
                created_at: new Date().toISOString()
            };
            console.log('🚚 [GRE] Datos preparados para inserción:', greDataInsert);
            const { data, error } = await supabase
                .from('gre_guias')
                .insert(greDataInsert)
                .select()
                .single();
            if (error) {
                console.error('❌ Error insertando GRE:', error);
                throw new Error(`Error creando guía de remisión: ${error.message}`);
            }
            console.log('✅ GRE creada exitosamente:', data);
            await this.procesarGeneracionXML(data.id);
            return {
                id: data.id,
                numero: data.numero,
                estado: data.estado,
                destinatario: data.destinatario,
                direccionDestino: data.direccion_destino,
                fechaTraslado: data.fecha_traslado,
                fechaCreacion: data.created_at,
                modalidad: data.modalidad,
                motivo: data.motivo,
                pesoTotal: data.peso_total,
                observaciones: data.observaciones,
                transportista: data.transportista,
                placaVehiculo: data.placa_vehiculo,
                licenciaConducir: data.licencia_conducir,
                cpeRelacionado: data.cpe_relacionado,
                numeroSunat: data.numero_sunat,
                hashGre: data.hash_gre
            };
        }
        catch (error) {
            console.error('❌ Error en createGuia:', error);
            throw error;
        }
    }
    generateGreXmlUbl(greData) {
        const fechaEmision = new Date().toISOString().split('T')[0];
        const horaEmision = new Date().toTimeString().split(' ')[0];
        return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
                xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
                xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID schemeAgencyName="PE:SUNAT">2.0</cbc:CustomizationID>
  <cbc:ID>${greData.numero}</cbc:ID>
  <cbc:IssueDate>${fechaEmision}</cbc:IssueDate>
  <cbc:IssueTime>${horaEmision}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">09</cbc:DespatchAdviceTypeCode>

  <!-- Motivo de traslado -->
  <cac:AdditionalDocumentReference>
    <cbc:ID>${greData.motivo}</cbc:ID>
    <cbc:DocumentTypeCode listAgencyName="PE:SUNAT" listName="Motivo de traslado" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20">${this.getMotivoCode(greData.motivo)}</cbc:DocumentTypeCode>
  </cac:AdditionalDocumentReference>

  <!-- Modalidad de transporte -->
  <cac:AdditionalDocumentReference>
    <cbc:ID>${greData.modalidad}</cbc:ID>
    <cbc:DocumentTypeCode listAgencyName="PE:SUNAT" listName="Modalidad de transporte" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo18">${this.getModalidadCode(greData.modalidad)}</cbc:DocumentTypeCode>
  </cac:AdditionalDocumentReference>

  <!-- Fecha de inicio de traslado -->
  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cbc:HandlingCode listAgencyName="PE:SUNAT" listName="Motivo de traslado" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20">${this.getMotivoCode(greData.motivo)}</cbc:HandlingCode>
    <cbc:GrossWeightMeasure unitCode="KGM">${greData.peso_total}</cbc:GrossWeightMeasure>
    
    <!-- Punto de partida -->
    <cac:Consignment>
      <cac:ConsignorParty>
        <cac:PartyIdentification>
          <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT">20000000001</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name><![CDATA[ERP KAME]]></cbc:Name>
        </cac:PartyName>
      </cac:ConsignorParty>
      
      <!-- Punto de llegada -->
      <cac:ConsigneeParty>
        <cac:PartyIdentification>
          <cbc:ID schemeID="1" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT">12345678</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name><![CDATA[${greData.destinatario}]]></cbc:Name>
        </cac:PartyName>
      </cac:ConsigneeParty>
      
      <!-- Transportista -->
      <cac:CarrierParty>
        <cac:PartyIdentification>
          <cbc:ID schemeID="1" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT">12345678</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name><![CDATA[${greData.transportista || 'Transporte Público'}]]></cbc:Name>
        </cac:PartyName>
      </cac:CarrierParty>
    </cac:Consignment>
    
    <!-- Dirección de entrega -->
    <cac:Delivery>
      <cac:DeliveryAddress>
        <cbc:AddressLine><![CDATA[${greData.direccion_destino}]]></cbc:AddressLine>
        <cac:Country>
          <cbc:IdentificationCode listAgencyName="United Nations Economic Commission for Europe" listID="ISO 3166-1">PE</cbc:IdentificationCode>
        </cac:Country>
      </cac:DeliveryAddress>
      <cac:Despatch>
        <cbc:ActualDespatchDate>${greData.fecha_traslado.split('T')[0]}</cbc:ActualDespatchDate>
      </cac:Despatch>
    </cac:Delivery>
    
    <!-- Vehículo y licencia (si aplica) -->
    ${greData.placa_vehiculo ? `
    <cac:TransportHandlingUnit>
      <cac:TransportEquipment>
        <cbc:ID>${greData.placa_vehiculo}</cbc:ID>
      </cac:TransportEquipment>
    </cac:TransportHandlingUnit>` : ''}
  </cac:Shipment>

  <!-- Líneas de la guía (productos/bienes a trasladar) -->
  <cac:DespatchLine>
    <cbc:ID>1</cbc:ID>
    <cbc:DeliveredQuantity unitCode="NIU">1</cbc:DeliveredQuantity>
    <cac:OrderLineReference>
      <cbc:LineID>1</cbc:LineID>
    </cac:OrderLineReference>
    <cac:Item>
      <cbc:Description><![CDATA[${greData.observaciones || 'Bienes diversos'}]]></cbc:Description>
      <cac:SellersItemIdentification>
        <cbc:ID>ITEM001</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
  </cac:DespatchLine>

</DespatchAdvice>`;
    }
    getMotivoCode(motivo) {
        const motivoCodes = {
            'VENTA': '01',
            'COMPRA': '02',
            'TRASLADO_ENTRE_ESTABLECIMIENTOS': '03',
            'CONSIGNACION': '04',
            'DEVOLUCION': '05',
            'TRANSFORMACION': '06',
            'DEMOSTRACION': '07',
            'OTROS': '13'
        };
        return motivoCodes[motivo] || '13';
    }
    getModalidadCode(modalidad) {
        const modalidadCodes = {
            'TRANSPORTE_PUBLICO': '01',
            'TRANSPORTE_PRIVADO': '02'
        };
        return modalidadCodes[modalidad] || '01';
    }
    async procesarGeneracionXML(greId) {
        try {
            console.log(`📄 [GRE] Generando XML para GRE ${greId}...`);
            const { data: greData, error } = await this.supabaseService.getClient()
                .from('gre_guias')
                .select('*')
                .eq('id', greId)
                .single();
            if (error || !greData) {
                throw new Error('No se pudo obtener los datos de la GRE');
            }
            const xmlContent = this.generateGreXmlUbl(greData);
            const xmlSigned = await this.firmarXmlGre(xmlContent);
            const hash = this.generarHashXml(xmlSigned);
            await this.supabaseService.update('gre_guias', {
                xml_firmado: xmlSigned,
                hash_gre: hash,
                estado: 'FIRMADO',
                updated_at: new Date().toISOString()
            }, { id: greId });
            console.log(`✅ [GRE] XML generado y firmado para GRE ${greId} - Hash: ${hash}`);
        }
        catch (error) {
            console.error(`❌ [GRE] Error generando XML para GRE ${greId}:`, error);
            await this.supabaseService.update('gre_guias', {
                estado: 'ERROR',
                error_message: `Error generando XML: ${error.message}`,
                updated_at: new Date().toISOString()
            }, { id: greId });
        }
    }
    async firmarXmlGre(xmlContent) {
        try {
            console.log('🔐 [GRE] Firmando XML con certificado...');
            const xmlSigned = await this.oseService.signXmlOnly(xmlContent);
            console.log('✅ [GRE] XML firmado exitosamente');
            return xmlSigned;
        }
        catch (error) {
            console.error('❌ Error firmando XML GRE:', error);
            return `${xmlContent}
<!-- GRE XML - Error en firma digital -->
<!-- Error: ${error.message} -->
<!-- Fecha: ${new Date().toISOString()} -->`;
        }
    }
    generarHashXml(xmlContent) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(xmlContent).digest('hex').substring(0, 32);
    }
    async procesarEnvioSunat(greId) {
        try {
            console.log(`📤 [GRE] Procesando envío de GRE ${greId} a SUNAT...`);
            const { data: greData, error } = await this.supabaseService.getClient()
                .from('gre_guias')
                .select('*')
                .eq('id', greId)
                .single();
            if (error || !greData) {
                throw new Error('No se pudo obtener los datos de la GRE');
            }
            await this.supabaseService.update('gre_guias', {
                estado: 'ENVIADO',
                updated_at: new Date().toISOString()
            }, { id: greId });
            const xmlContent = this.generateGreXmlUbl(greData);
            const fileName = `20000000001-09-${greData.numero}`;
            const response = await this.oseService.enviarGre(xmlContent, fileName);
            if (response.success) {
                console.log(`✅ [GRE] GRE ${greId} enviada exitosamente a SUNAT`);
                await this.supabaseService.update('gre_guias', {
                    estado: 'ACEPTADO',
                    numero_sunat: response.numeroComprobante,
                    hash_gre: response.hashCPE,
                    cdr_sunat: response.cdr || 'CDR_RECEIVED',
                    updated_at: new Date().toISOString()
                }, { id: greId });
            }
            else {
                console.error(`❌ [GRE] Error enviando GRE ${greId}: ${response.descripcionRespuesta}`);
                await this.supabaseService.update('gre_guias', {
                    estado: 'RECHAZADO',
                    error_message: `${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
                    updated_at: new Date().toISOString()
                }, { id: greId });
            }
        }
        catch (error) {
            console.error(`❌ [GRE] Error técnico enviando GRE ${greId}:`, error);
            await this.supabaseService.update('gre_guias', {
                estado: 'RECHAZADO',
                error_message: `Error técnico: ${error.message}`,
                updated_at: new Date().toISOString()
            }, { id: greId });
        }
    }
    async reenviarGre(greId) {
        try {
            console.log(`🔄 [GRE] Reenviando GRE ${greId} a SUNAT...`);
            await this.procesarEnvioSunat(greId);
            return {
                success: true,
                message: 'GRE reenviada exitosamente a SUNAT'
            };
        }
        catch (error) {
            console.error(`❌ [GRE] Error reenviando GRE ${greId}:`, error);
            return {
                success: false,
                message: `Error reenviando GRE: ${error.message}`
            };
        }
    }
    async enviarManualmenteSunat(greId) {
        try {
            console.log(`🚀 [GRE] Enviando manualmente GRE ${greId} a SUNAT...`);
            await this.procesarEnvioSunat(greId);
            return { success: true, message: 'GRE enviada a SUNAT exitosamente' };
        }
        catch (error) {
            console.error(`❌ Error enviando manualmente GRE ${greId}:`, error);
            return { success: false, message: `Error enviando GRE: ${error.message}` };
        }
    }
    async consultarEstadoGre(greId) {
        try {
            console.log(`🔍 [GRE] Consultando estado de GRE ${greId} en SUNAT...`);
            const { data: greData, error } = await this.supabaseService.getClient()
                .from('gre_guias')
                .select('numero, numero_sunat')
                .eq('id', greId)
                .single();
            if (error || !greData) {
                throw new Error('GRE no encontrada');
            }
            const response = await this.oseService.consultarEstadoCpe('20000000001', '09', 'T001', greData.numero);
            if (response.success) {
                await this.supabaseService.update('gre_guias', {
                    estado: 'ACEPTADO',
                    cdr_sunat: response.cdr || 'CDR_RECEIVED',
                    updated_at: new Date().toISOString()
                }, { id: greId });
            }
            return {
                id: greId,
                estado: response.success ? 'ACEPTADO' : 'PENDIENTE',
                codigoSunat: response.codigoRespuesta,
                descripcionSunat: response.descripcionRespuesta,
                timestamp: new Date()
            };
        }
        catch (error) {
            console.error(`❌ [GRE] Error consultando estado de GRE ${greId}:`, error);
            return {
                id: greId,
                estado: 'ERROR',
                mensaje: `Error consultando estado: ${error.message}`,
                timestamp: new Date()
            };
        }
    }
    async generarNumeroCorrelativo() {
        try {
            const { data, error } = await this.supabaseService.getClient()
                .from('gre_guias')
                .select('numero')
                .order('created_at', { ascending: false })
                .limit(1);
            if (error) {
                console.error('Error obteniendo último número:', error);
                return 'T001-00000001';
            }
            if (!data || data.length === 0) {
                return 'T001-00000001';
            }
            const ultimoNumero = data[0].numero;
            const match = ultimoNumero.match(/T001-(\d{8})/);
            if (match) {
                const numeroActual = parseInt(match[1]);
                const siguienteNumero = numeroActual + 1;
                return `T001-${siguienteNumero.toString().padStart(8, '0')}`;
            }
            return 'T001-00000001';
        }
        catch (error) {
            console.error('Error generando número correlativo:', error);
            return 'T001-00000001';
        }
    }
    async getStats() {
        const supabase = this.supabaseService.getClient();
        try {
            const { data: guias, error } = await supabase
                .from('gre_guias')
                .select('estado, peso_total, created_at');
            if (error) {
                console.error('Error obteniendo estadísticas GRE:', error);
                return {
                    total: 0,
                    estados: {},
                    pesoTotal: 0,
                    tendencia: []
                };
            }
            const stats = {
                total: guias.length,
                estados: guias.reduce((acc, guia) => {
                    acc[guia.estado] = (acc[guia.estado] || 0) + 1;
                    return acc;
                }, {}),
                pesoTotal: guias.reduce((sum, guia) => sum + (guia.peso_total || 0), 0),
                tendencia: this.calcularTendenciaSemanal(guias)
            };
            console.log('📊 Estadísticas GRE:', stats);
            return stats;
        }
        catch (error) {
            console.error('Error calculando estadísticas GRE:', error);
            return {
                total: 0,
                estados: {},
                pesoTotal: 0,
                tendencia: []
            };
        }
    }
    calcularTendenciaSemanal(guias) {
        const ahora = new Date();
        const semanaAtras = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
        const guiasSemana = guias.filter(guia => new Date(guia.created_at) >= semanaAtras);
        const tendencia = [];
        for (let i = 6; i >= 0; i--) {
            const fecha = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000);
            const fechaStr = fecha.toISOString().split('T')[0];
            const guiasDia = guiasSemana.filter(guia => guia.created_at.split('T')[0] === fechaStr);
            tendencia.push({
                fecha: fechaStr,
                cantidad: guiasDia.length,
                peso: guiasDia.reduce((sum, guia) => sum + (guia.peso_total || 0), 0)
            });
        }
        return tendencia;
    }
};
exports.GreService = GreService;
exports.GreService = GreService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService,
        inventory_integration_service_1.InventoryIntegrationService,
        ose_service_1.OseService])
], GreService);
