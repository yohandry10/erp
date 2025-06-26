import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateGuiaRemisionDto, GuiaRemisionResponseDto } from './gre.types';
import { EventBusService } from '../../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';
import { OseService } from '../ose/ose.service';

@Injectable()
export class GreService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly inventoryService: InventoryIntegrationService,
    private readonly oseService: OseService
  ) {
    console.log('🚚 [GRE] ¡Servicio GRE inicializado con integración SUNAT!');
    this.initializeEventListeners();
    console.log('🚚 [GRE] ¡Constructor completado!');
  }

  private initializeEventListeners() {
    console.log('🚚 [GRE] Inicializando listeners de eventos...');
    
    // Listener principal para eventos de transporte
    this.eventBus.on('cpe.requiere_transporte', async (event) => {
      console.log('🚚 [GRE] ¡EVENTO RECIBIDO! CPE requiere transporte');
      console.log('🚚 [GRE] Evento completo:', JSON.stringify(event, null, 2));
      try {
        await this.evaluarCreacionAutomaticaGRE(event.data);
      } catch (error) {
        console.error('❌ [GRE] Error procesando evento de transporte:', error);
      }
    });

    // También escuchar eventos de comprobante creado como respaldo
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
        } catch (error) {
          console.error('❌ [GRE] Error procesando comprobante creado:', error);
        }
      }
    });

    console.log('✅ [GRE] Event listeners configurados correctamente');
    console.log('🚚 [GRE] Listeners activos:', this.eventBus['eventEmitter'].eventNames());
  }

  async evaluarCreacionAutomaticaGRE(datos: any): Promise<void> {
    try {
      console.log(`🚚 [GRE] Evaluando creación automática para CPE:`, datos);
      
      const cpeId = datos.cpeId;
      const clienteId = datos.clienteId;
      const total = datos.total;
      const productos = datos.productos || [];
      
      console.log(`🚚 [GRE] Datos del evento - CPE: ${cpeId}, Cliente: ${clienteId}, Total: S/ ${total}`);
      
      // Buscar si el cliente tiene configuración de transporte automático
      const requiereGREAutomatica = await this.verificarConfiguracionClienteTransporte(clienteId, total);
      
      if (requiereGREAutomatica) {
        console.log('🚚 [GRE] ✅ Cliente configurado para GRE automática, creando...');
        
        // Crear GRE automática con datos básicos
        const greAutomatica = await this.createGuia({
          destinatario: `Cliente ${clienteId}`,
          direccionDestino: 'Lima, Perú - Dirección por configurar',
          fechaTraslado: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Mañana
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
      } else {
        console.log('🚚 [GRE] ⚠️ Cliente no requiere GRE automática, creación manual requerida');
      }
    } catch (error) {
      console.error('❌ [GRE] Error evaluando creación automática:', error);
      throw error;
    }
  }

  private async verificarConfiguracionClienteTransporte(clienteId: string, total: number): Promise<boolean> {
    console.log(`🚚 [GRE] Verificando configuración de transporte para cliente ${clienteId} con total S/ ${total}`);
    
    // Reglas automáticas para crear GRE:
    // 1. Ventas > S/ 500 siempre requieren GRE
    if (total > 500) {
      console.log(`✅ [GRE] Total > S/ 500, requiere GRE automática`);
      return true;
    }
    
    // 2. Por ahora, todas las ventas que lleguen aquí requieren GRE
    // En el futuro, esto se puede configurar por cliente en la base de datos
    console.log(`✅ [GRE] Cliente configurado para crear GRE automática`);
    return true;
  }

  private calcularPesoEstimado(productos: any[], total: number): number {
    console.log(`🚚 [GRE] Calculando peso estimado para ${productos.length} productos, total S/ ${total}`);
    
    // Peso estimado básico: 1kg por cada S/ 100 de valor, más peso base de productos
    let pesoEstimado = total / 100; // 1kg por cada S/ 100
    
    // Si hay productos, agregar peso base
    if (productos.length > 0) {
      pesoEstimado += productos.length * 0.5; // 500g por producto
    } else {
      // Si no hay detalle de productos, usar peso base según total
      pesoEstimado = total / 50; // 1kg por cada S/ 50 cuando no hay detalle
    }
    
    const pesoFinal = Math.max(Math.round(pesoEstimado * 100) / 100, 1); // Mínimo 1kg, redondear a 2 decimales
    console.log(`🚚 [GRE] Peso estimado calculado: ${pesoFinal} kg`);
    
    return pesoFinal;
  }

  findAll() {
    // Mock data for now
    return {
      message: 'GRE module is working',
      data: []
    };
  }

  async findAllGuias(): Promise<GuiaRemisionResponseDto[]> {
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

      // Mapear datos de BD a respuesta
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
    } catch (error) {
      console.error('❌ Error en servicio GRE:', error);
      throw error;
    }
  }

  async findGuiaById(id: string): Promise<GuiaRemisionResponseDto> {
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

      // Mapear datos de BD a respuesta
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
    } catch (error) {
      console.error('❌ Error en servicio GRE al obtener por ID:', error);
      throw error;
    }
  }

  async createGuia(greData: CreateGuiaRemisionDto): Promise<GuiaRemisionResponseDto> {
    const supabase = this.supabaseService.getClient();
    
    try {
      console.log('🚚 [GRE] Creando nueva guía de remisión...');
      console.log('🚚 [GRE] Datos recibidos:', greData);

      // Generar número correlativo
      const numeroCorrelativo = await this.generarNumeroCorrelativo();
      
      // Preparar datos para inserción
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

      // Insertar en base de datos
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

      // Generar XML UBL y firma (sin enviar a SUNAT todavía)
      await this.procesarGeneracionXML(data.id);

      // Mapear respuesta
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
    } catch (error) {
      console.error('❌ Error en createGuia:', error);
      throw error;
    }
  }

  /**
   * Generar XML UBL para Guía de Remisión Electrónica
   */
  private generateGreXmlUbl(greData: any): string {
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

  /**
   * Obtener código SUNAT para motivo de traslado
   */
  private getMotivoCode(motivo: string): string {
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

  /**
   * Obtener código SUNAT para modalidad de transporte
   */
  private getModalidadCode(modalidad: string): string {
    const modalidadCodes = {
      'TRANSPORTE_PUBLICO': '01',
      'TRANSPORTE_PRIVADO': '02'
    };
    return modalidadCodes[modalidad] || '01';
  }

  /**
   * Procesar generación de XML UBL y firma (sin enviar a SUNAT)
   * 
   * NOTA: El envío automático a SUNAT está DESACTIVADO por ahora.
   * Para enviar manualmente usar el endpoint: POST /api/gre/guias/:id/enviar-sunat
   */
  private async procesarGeneracionXML(greId: string): Promise<void> {
    try {
      console.log(`📄 [GRE] Generando XML para GRE ${greId}...`);
      
      // Obtener datos de la GRE
      const { data: greData, error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .select('*')
        .eq('id', greId)
        .single();

      if (error || !greData) {
        throw new Error('No se pudo obtener los datos de la GRE');
      }

      // Generar XML UBL
      const xmlContent = this.generateGreXmlUbl(greData);
      
      // Firmar el XML (sin enviar a SUNAT)
      const xmlSigned = await this.firmarXmlGre(xmlContent);
      const hash = this.generarHashXml(xmlSigned);

      // Guardar XML firmado en BD
      await this.supabaseService.update(
        'gre_guias',
        { 
          xml_firmado: xmlSigned,
          hash_gre: hash,
          estado: 'FIRMADO', // Estado que indica que está listo para SUNAT
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );

      console.log(`✅ [GRE] XML generado y firmado para GRE ${greId} - Hash: ${hash}`);

    } catch (error) {
      console.error(`❌ [GRE] Error generando XML para GRE ${greId}:`, error);
      
      // Marcar como ERROR
      await this.supabaseService.update(
        'gre_guias',
        { 
          estado: 'ERROR',
          error_message: `Error generando XML: ${error.message}`,
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );
    }
  }

  /**
   * Firmar XML usando el servicio OSE (sin enviar)
   */
  private async firmarXmlGre(xmlContent: string): Promise<string> {
    try {
      console.log('🔐 [GRE] Firmando XML con certificado...');
      
      // Usar el XmlSigner del OSE service para firmar realmente
      const xmlSigned = await this.oseService.signXmlOnly(xmlContent);
      
      console.log('✅ [GRE] XML firmado exitosamente');
      return xmlSigned;
    } catch (error) {
      console.error('❌ Error firmando XML GRE:', error);
      
      // Fallback: XML sin firmar pero marcado
      return `${xmlContent}
<!-- GRE XML - Error en firma digital -->
<!-- Error: ${error.message} -->
<!-- Fecha: ${new Date().toISOString()} -->`;
    }
  }

  /**
   * Generar hash del XML
   */
  private generarHashXml(xmlContent: string): string {
    // Generar un hash simple del XML (en producción usar crypto)
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(xmlContent).digest('hex').substring(0, 32);
  }

  /**
   * Procesar envío de GRE a SUNAT (método preparado para activar después)
   */
  private async procesarEnvioSunat(greId: string): Promise<void> {
    try {
      console.log(`📤 [GRE] Procesando envío de GRE ${greId} a SUNAT...`);
      
      // Obtener datos de la GRE
      const { data: greData, error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .select('*')
        .eq('id', greId)
        .single();

      if (error || !greData) {
        throw new Error('No se pudo obtener los datos de la GRE');
      }

      // Marcar como ENVIADO
      await this.supabaseService.update(
        'gre_guias',
        { 
          estado: 'ENVIADO',
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );

      // Generar XML UBL
      const xmlContent = this.generateGreXmlUbl(greData);
      const fileName = `20000000001-09-${greData.numero}`;

      // Enviar a SUNAT mediante OSE
      const response = await this.oseService.enviarGre(xmlContent, fileName);

      if (response.success) {
        console.log(`✅ [GRE] GRE ${greId} enviada exitosamente a SUNAT`);
        
        // Actualizar como ACEPTADO
        await this.supabaseService.update(
          'gre_guias',
          { 
            estado: 'ACEPTADO',
            numero_sunat: response.numeroComprobante,
            hash_gre: response.hashCPE,
            cdr_sunat: response.cdr || 'CDR_RECEIVED',
            updated_at: new Date().toISOString()
          },
          { id: greId }
        );
      } else {
        console.error(`❌ [GRE] Error enviando GRE ${greId}: ${response.descripcionRespuesta}`);
        
        // Marcar como RECHAZADO
        await this.supabaseService.update(
          'gre_guias',
          { 
            estado: 'RECHAZADO',
            error_message: `${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
            updated_at: new Date().toISOString()
          },
          { id: greId }
        );
      }

    } catch (error) {
      console.error(`❌ [GRE] Error técnico enviando GRE ${greId}:`, error);
      
      // Marcar como RECHAZADO por error técnico
      await this.supabaseService.update(
        'gre_guias',
        { 
          estado: 'RECHAZADO',
          error_message: `Error técnico: ${error.message}`,
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );
    }
  }

  /**
   * Reenviar GRE a SUNAT
   */
  async reenviarGre(greId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔄 [GRE] Reenviando GRE ${greId} a SUNAT...`);
      
      await this.procesarEnvioSunat(greId);
      
      return {
        success: true,
        message: 'GRE reenviada exitosamente a SUNAT'
      };
    } catch (error) {
      console.error(`❌ [GRE] Error reenviando GRE ${greId}:`, error);
      return {
        success: false,
        message: `Error reenviando GRE: ${error.message}`
      };
    }
  }

  /**
   * Enviar manualmente GRE firmada a SUNAT
   */
  async enviarManualmenteSunat(greId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🚀 [GRE] Enviando manualmente GRE ${greId} a SUNAT...`);
      await this.procesarEnvioSunat(greId);
      return { success: true, message: 'GRE enviada a SUNAT exitosamente' };
    } catch (error) {
      console.error(`❌ Error enviando manualmente GRE ${greId}:`, error);
      return { success: false, message: `Error enviando GRE: ${error.message}` };
    }
  }

  /**
   * Consultar estado de GRE en SUNAT
   */
  async consultarEstadoGre(greId: string): Promise<any> {
    try {
      console.log(`🔍 [GRE] Consultando estado de GRE ${greId} en SUNAT...`);
      
      // Obtener datos de la GRE
      const { data: greData, error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .select('numero, numero_sunat')
        .eq('id', greId)
        .single();

      if (error || !greData) {
        throw new Error('GRE no encontrada');
      }

      // Consultar en SUNAT (usando CPE como base ya que GRE usa similar estructura)
      const response = await this.oseService.consultarEstadoCpe(
        '20000000001', // RUC emisor
        '09', // Tipo documento GRE
        'T001', // Serie fija para GRE
        greData.numero
      );

      // Actualizar estado en BD si es necesario
      if (response.success) {
        await this.supabaseService.update(
          'gre_guias',
          { 
            estado: 'ACEPTADO',
            cdr_sunat: response.cdr || 'CDR_RECEIVED',
            updated_at: new Date().toISOString()
          },
          { id: greId }
        );
      }

      return {
        id: greId,
        estado: response.success ? 'ACEPTADO' : 'PENDIENTE',
        codigoSunat: response.codigoRespuesta,
        descripcionSunat: response.descripcionRespuesta,
        timestamp: new Date()
      };

    } catch (error) {
      console.error(`❌ [GRE] Error consultando estado de GRE ${greId}:`, error);
      return {
        id: greId,
        estado: 'ERROR',
        mensaje: `Error consultando estado: ${error.message}`,
        timestamp: new Date()
      };
    }
  }

  private async generarNumeroCorrelativo(): Promise<string> {
    try {
      // Obtener el último número usado
      const { data, error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .select('numero')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error obteniendo último número:', error);
        return 'T001-00000001'; // Número inicial si hay error
      }

      if (!data || data.length === 0) {
        return 'T001-00000001'; // Primer número
      }

      // Extraer número del último registro
      const ultimoNumero = data[0].numero;
      const match = ultimoNumero.match(/T001-(\d{8})/);
      
      if (match) {
        const numeroActual = parseInt(match[1]);
        const siguienteNumero = numeroActual + 1;
        return `T001-${siguienteNumero.toString().padStart(8, '0')}`;
      }

      return 'T001-00000001'; // Fallback
    } catch (error) {
      console.error('Error generando número correlativo:', error);
      return 'T001-00000001';
    }
  }

  async getStats() {
    const supabase = this.supabaseService.getClient();
    
    try {
      // Estadísticas básicas de GRE
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

      // Procesar estadísticas
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
    } catch (error) {
      console.error('Error calculando estadísticas GRE:', error);
      return {
        total: 0,
        estados: {},
        pesoTotal: 0,
        tendencia: []
      };
    }
  }

  private calcularTendenciaSemanal(guias: any[]): any[] {
    // Agrupar por semanas los últimos 7 días
    const ahora = new Date();
    const semanaAtras = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const guiasSemana = guias.filter(guia => 
      new Date(guia.created_at) >= semanaAtras
    );

    const tendencia = [];
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000);
      const fechaStr = fecha.toISOString().split('T')[0];
      
      const guiasDia = guiasSemana.filter(guia => 
        guia.created_at.split('T')[0] === fechaStr
      );

      tendencia.push({
        fecha: fechaStr,
        cantidad: guiasDia.length,
        peso: guiasDia.reduce((sum, guia) => sum + (guia.peso_total || 0), 0)
      });
    }

    return tendencia;
  }
}