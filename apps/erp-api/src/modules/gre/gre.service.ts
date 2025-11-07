import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateGuiaRemisionDto, GuiaRemisionResponseDto } from './gre.types';
import { EventBusService } from '../../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';
import { OseService } from '../ose/ose.service';
import { ValidationService } from '../validations/validation.service';

@Injectable()
export class GreService {
  private readonly logger = new Logger(GreService.name);
  private readonly sunatStatuses = {
    NOT_SENT: 'NOT_SENT',
    READY: 'READY',
    SENDING: 'SENDING',
    ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED',
    ERROR: 'ERROR',
  } as const;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly inventoryService: InventoryIntegrationService,
    private readonly oseService: OseService,
    private readonly validationService: ValidationService,
  ) {
    console.log('🚚 [GRE] ¡Servicio GRE inicializado con integración SUNAT!');
    this.initializeEventListeners();
    console.log('🚚 [GRE] ¡Constructor completado!');
  }

  private initializeEventListeners() {
    console.log('🚚 [GRE] Inicializando listeners de eventos...');
    
    // Listener for sale.completed event - main trigger for auto GRE
    this.eventBus.on('sale.completed', async (event) => {
      // Don't block sale completion - run async
      setImmediate(async () => {
        try {
          console.log('🚚 [GRE] Sale completed event received:', event.data?.saleId);
          
          const saleData = event.data;
          if (!saleData || !saleData.tenantId || !saleData.saleId) {
            console.warn('⚠️ [GRE] Invalid sale data in event, skipping auto GRE');
            return;
          }

          // Evaluate if auto GRE should be created
          const shouldCreate = await this.evaluateAutoGRECreation({
            tenantId: saleData.tenantId,
            saleId: saleData.saleId,
            total: saleData.total || 0,
            cpeId: saleData.cpeId,
          });

          if (shouldCreate) {
            console.log(`🚚 [GRE] Creating automatic GRE for sale ${saleData.saleId}`);
            
            const gre = await this.createAutoGREFromSale(saleData.saleId, {
              tenantId: saleData.tenantId,
              cpeId: saleData.cpeId,
              clienteId: saleData.clienteId,
              clienteNombre: saleData.clienteNombre,
              clienteDireccion: saleData.clienteDireccion,
              total: saleData.total,
              productos: saleData.productos,
            });

            console.log(`✅ [GRE] Automatic GRE created: ${gre.numero} for sale ${saleData.saleId}`);

            // Emit event for GRE creation
            this.eventBus.emit('gre.auto_created', {
              greId: gre.id,
              greNumero: gre.numero,
              saleId: saleData.saleId,
              tenantId: saleData.tenantId,
              timestamp: new Date().toISOString(),
            });
          } else {
            console.log(`🚚 [GRE] Sale ${saleData.saleId} does not meet auto GRE criteria`);
          }
        } catch (error) {
          console.error('❌ [GRE] Error in sale.completed listener:', error);
          
          // Emit error event for notification
          this.eventBus.emit('gre.creation_failed', {
            saleId: event.data?.saleId,
            tenantId: event.data?.tenantId,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      });
    });
    
    // Legacy listener for backward compatibility
    this.eventBus.on('cpe.requiere_transporte', async (event) => {
      setImmediate(async () => {
        try {
          console.log('🚚 [GRE] CPE requires transport event received (legacy)');
          await this.evaluarCreacionAutomaticaGRE(event.data);
        } catch (error) {
          console.error('❌ [GRE] Error processing transport event:', error);
        }
      });
    });

    // Legacy listener for comprobante.creado
    this.eventBus.on('comprobante.creado', async (event) => {
      setImmediate(async () => {
        try {
          console.log('🚚 [GRE] Comprobante created event received (legacy)');
          
          if (event.data?.requiereTransporte) {
            await this.evaluarCreacionAutomaticaGRE({
              cpeId: event.data.cpeId,
              clienteId: event.data.clienteId,
              total: event.data.total,
              productos: []
            });
          }
        } catch (error) {
          console.error('❌ [GRE] Error processing comprobante.creado:', error);
        }
      });
    });

    console.log('✅ [GRE] Event listeners configured successfully');
    console.log('🚚 [GRE] Active listeners:', this.eventBus['eventEmitter'].eventNames());
  }

  async evaluarCreacionAutomaticaGRE(datos: any): Promise<void> {
    try {
      console.log(`🚚 [GRE] Evaluando creación automática para CPE:`, datos);
      
      const cpeId = datos.cpeId;
      const clienteId = datos.clienteId;
      const total = datos.total;
      const productos = datos.productos || [];
      let tenantId = datos.tenantId || datos.tenant_id; // Obtener tenantId de los datos
      
      if (!tenantId) {
        this.logger.warn('⚠️ [GRE] No se proporcionó tenantId en evaluarCreacionAutomaticaGRE, intentando obtenerlo del CPE...');
        // Intentar obtener tenantId del CPE si está disponible
        if (cpeId) {
          const { data: cpeData } = await this.supabaseService.getClient()
            .from('comprobantes_electronicos')
            .select('tenant_id')
            .eq('id', cpeId)
            .maybeSingle();
          
          if (cpeData?.tenant_id) {
            tenantId = cpeData.tenant_id;
            this.logger.log(`✅ [GRE] TenantId obtenido del CPE: ${tenantId}`);
          }
        }
        
        if (!tenantId) {
          this.logger.error('❌ [GRE] No se pudo obtener tenantId para crear GRE automática');
          throw new Error('No se pudo determinar el tenantId para crear la GRE');
        }
      }
      
      console.log(`🚚 [GRE] Datos del evento - CPE: ${cpeId}, Cliente: ${clienteId}, Total: S/ ${total}, Tenant: ${tenantId}`);
      
      // Buscar si el cliente tiene configuración de transporte automático
      const requiereGREAutomatica = await this.verificarConfiguracionClienteTransporte(clienteId, total);
      
      if (requiereGREAutomatica) {
        console.log('🚚 [GRE] ✅ Cliente configurado para GRE automática, creando...');
        
        // Crear GRE automática con datos básicos (con validación de certificado)
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
        }, tenantId);
        
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

  async findAllGuias(tenantId: string): Promise<GuiaRemisionResponseDto[]> {
    const supabase = this.supabaseService.getClient();
    
    try {
      console.log(`🔍 Consultando tabla gre_guias para tenant ${tenantId}...`);
      
      const { data, error } = await supabase
        .from('gre_guias')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      console.log('📊 Resultado de consulta:', { data, error });

      if (error) {
        console.error('❌ Error al consultar GREs:', error);
        throw new Error(`Error al consultar las guías de remisión: ${error.message}`);
      }

      console.log(`✅ Se encontraron ${data?.length || 0} registros GRE`);

      return (data || []).map(gre => this.mapGreRecordToResponse(gre));
    } catch (error) {
      console.error('❌ Error en servicio GRE:', error);
      throw error;
    }
  }

  async findGuiaById(id: string, tenantId: string): Promise<GuiaRemisionResponseDto> {
    const supabase = this.supabaseService.getClient();
    
    try {
      console.log(`🔍 Consultando GRE con ID: ${id} para tenant ${tenantId}`);
      
      const { data, error } = await supabase
        .from('gre_guias')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
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

      return this.mapGreRecordToResponse(data);
    } catch (error) {
      console.error('❌ Error en servicio GRE al obtener por ID:', error);
      throw error;
    }
  }

  async createGuia(greData: CreateGuiaRemisionDto, tenantId: string): Promise<GuiaRemisionResponseDto> {
    const supabase = this.supabaseService.getClient();

    try {
      this.logger.log(`🚚 [GRE] Creando nueva guía de remisión para tenant: ${tenantId}`);
      console.log('🚚 [GRE] Datos recibidos:', greData);

      // VALIDACIÓN: GRE es exclusivo de Perú
      const { data: empresaConfig } = await supabase
        .from('empresa_config')
        .select('pais_id')
        .eq('tenant_id', tenantId)
        .single();

      if (empresaConfig?.pais_id) {
        const { data: pais } = await supabase
          .from('paises')
          .select('codigo_iso, nombre')
          .eq('id', empresaConfig.pais_id)
          .single();

        if (pais && pais.codigo_iso !== 'PE') {
          this.logger.error(`❌ [GRE] Intento de crear GRE para país ${pais.nombre} (${pais.codigo_iso}). GRE solo disponible para Perú.`);
          throw new BadRequestException({
            message: `Las Guías de Remisión Electrónicas (GRE) solo están disponibles para empresas peruanas. Su empresa está configurada para ${pais.nombre}.`,
            code: 'GRE_NOT_AVAILABLE_FOR_COUNTRY',
            country: pais.nombre,
          });
        }
      }

      const eventId = randomUUID();
      const idempotencyKey = this.resolveGreIdempotencyKey(greData, tenantId);

      const { data: existingGre, error: existingGreError } = await supabase
        .from('gre_guias')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingGreError && existingGreError.code && existingGreError.code !== 'PGRST116') {
        this.logger.error(
          `❌ [GRE] Error verificando idempotencia (${idempotencyKey}): ${existingGreError.message}`,
        );
        throw new BadRequestException('No se pudo validar idempotencia al crear la GRE');
      }

      if (existingGre) {
        this.logger.warn(
          `♻️ [GRE] Solicitud idempotente detectada (${idempotencyKey}), retornando GRE existente ${existingGre.id}`,
        );
        return this.mapGreRecordToResponse(existingGre);
      }

      // HARDENING E2: Validar certificado antes de generar GRE
      this.logger.log(`🔐 [GRE] Validando certificado digital antes de generar GRE...`);
      const certificateValidation = await this.validationService.validateCertificate(tenantId);

      if (!certificateValidation.isValid) {
        this.logger.error(`❌ [GRE] Validación de certificado fallida: ${certificateValidation.errors.join(', ')}`);
        throw new BadRequestException({
          message: 'No se puede generar la GRE: Certificado digital inválido',
          errors: certificateValidation.errors,
          code: 'CERT_VALIDATION_FAILED',
        });
      }

      if (certificateValidation.warnings.length > 0) {
        this.logger.warn(`⚠️ [GRE] Advertencias de certificado: ${certificateValidation.warnings.join(', ')}`);
      }

      this.logger.log(`✅ [GRE] Certificado validado exitosamente antes de generar GRE`);

      const numeroCorrelativo = await this.generarNumeroCorrelativo(tenantId);
      const { serie, correlativo } = this.extractSerieYCorrelativo(numeroCorrelativo);
      const datosAdicionales = this.buildGreAdditionalData(greData);
      const timestamp = new Date().toISOString();

      const greDataInsert: Record<string, any> = {
        numero: numeroCorrelativo,
        serie,
        correlativo,
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
        tenant_id: tenantId,
        created_at: timestamp,
        idempotency_key: idempotencyKey,
        event_id: eventId,
        sunat_status: this.sunatStatuses.NOT_SENT,
      };

      if (datosAdicionales) {
        greDataInsert.datos_adicionales = datosAdicionales;
      }

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

      if (greData.pedidoId) {
        await this.registrarRelacionPedidoGre({
          pedidoId: greData.pedidoId,
          greId: data.id,
          greNumero: data.numero,
          greEstado: data.estado ?? 'BORRADOR',
          tenantIdHint: greData.tenantId,
          notas: greData.observaciones ?? null,
          despachos: greData.despachosAsociados,
        });
      }

      const xmlPreparation = await this.procesarGeneracionXML(data.id, tenantId);
      const sunatStatusForEvent = xmlPreparation.success ? this.sunatStatuses.READY : this.sunatStatuses.ERROR;

      let greRecord = data;
      try {
        const { data: refreshedGre, error: refreshError } = await supabase
          .from('gre_guias')
          .select('*')
          .eq('id', data.id)
          .maybeSingle();

        if (!refreshError && refreshedGre) {
          greRecord = refreshedGre;
        } else {
          greRecord = {
            ...data,
            sunat_status: sunatStatusForEvent,
            hash_gre: xmlPreparation.hash ?? data.hash_gre,
          };
        }
      } catch (refreshError) {
        this.logger.warn(`⚠️ [GRE] No se pudo refrescar GRE ${data.id} después de la inserción:`, refreshError);
        greRecord = {
          ...data,
          sunat_status: sunatStatusForEvent,
          hash_gre: xmlPreparation.hash ?? data.hash_gre,
        };
      }

      await this.eventBus.emitGuiaRemisionCreada({
        eventId,
        tenantId,
        idempotencyKey,
        greId: greRecord.id,
        tipoDocumento: '09',
        serie: greRecord.serie ?? serie,
        numero: Number(greRecord.correlativo ?? correlativo) || correlativo,
        numeroCompleto: greRecord.numero ?? numeroCorrelativo,
        transportistaId: greRecord.transportista ?? greData.transportista ?? undefined,
        vehiculoId: greRecord.placa_vehiculo ?? greData.placaVehiculo ?? undefined,
        ruta: greRecord.direccion_destino ?? greData.direccionDestino,
        peso: Number(greRecord.peso_total ?? greData.pesoTotal) || greData.pesoTotal,
        cpeRelacionado: greRecord.cpe_relacionado ?? greData.cpeRelacionado ?? undefined,
        ventaRelacionada: greRecord.venta_id ?? undefined,
        fechaTraslado: greRecord.fecha_traslado ?? greData.fechaTraslado,
        destinatario: greRecord.destinatario ?? greData.destinatario,
        direccionDestino: greRecord.direccion_destino ?? greData.direccionDestino,
        sunatStatus: greRecord.sunat_status ?? sunatStatusForEvent,
        hashGre: greRecord.hash_gre ?? xmlPreparation.hash ?? undefined,
        notasSalida: greData.despachosAsociados ?? [],
      });

      return this.mapGreRecordToResponse(greRecord);
    } catch (error) {
      console.error('❌ Error en createGuia:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error?.message || 'Error creando guía de remisión');
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

  private async registrarRelacionPedidoGre(params: {
    pedidoId: string;
    greId: string;
    greNumero: string;
    greEstado: string;
    tenantIdHint?: string;
    notas?: string | null;
    despachos?: string[] | undefined;
  }): Promise<void> {
    const client = this.supabaseService.getClient();

    try {
      const { data: pedido, error: pedidoError } = await client
        .from('pedidos_venta')
        .select('tenant_id, numero')
        .eq('id', params.pedidoId)
        .single();

      if (pedidoError || !pedido) {
        console.warn(
          `⚠️ [GRE] No se pudo vincular GRE ${params.greId} con pedido ${params.pedidoId}: ${
            pedidoError?.message ?? 'pedido no encontrado'
          }`,
        );
        return;
      }

      const tenantId = pedido.tenant_id ?? params.tenantIdHint;
      if (!tenantId) {
        console.warn(
          `⚠️ [GRE] Tenant desconocido al vincular GRE ${params.greId} con pedido ${params.pedidoId}`,
        );
        return;
      }

      const relacion = {
        tenant_id: tenantId,
        pedido_id: params.pedidoId,
        gre_id: params.greId,
        estado: params.greEstado ?? 'BORRADOR',
        notas: params.notas ?? null,
        creado_en: new Date().toISOString(),
      };

      const { error: linkError } = await client.from('pedido_gres').insert(relacion);
      if (linkError) {
        console.error(
          `❌ [GRE] Error registrando relación pedido-gre (${params.pedidoId} -> ${params.greId}): ${linkError.message}`,
        );
      }

      const { error: pedidoUpdate } = await client
        .from('pedidos_venta')
        .update({
          gre_id: params.greId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.pedidoId)
        .eq('tenant_id', tenantId);

      if (pedidoUpdate) {
        console.warn(
          `⚠️ [GRE] No se pudo actualizar pedidos_venta.gre_id para ${params.pedidoId}: ${pedidoUpdate.message}`,
        );
      }
    } catch (error) {
      console.error(
        `❌ [GRE] Error inesperado al vincular GRE ${params.greId} con pedido ${params.pedidoId}`,
        error as Error,
      );
    }
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
   * 
   * HARDENING E2: Valida certificado antes de firmar el XML
   */
  private async procesarGeneracionXML(
    greId: string,
    tenantId?: string,
  ): Promise<{ success: boolean; hash?: string }> {
    try {
      this.logger.log(`📄 [GRE] Generando XML para GRE ${greId}...`);
      
      // Obtener datos de la GRE
      const query = this.supabaseService.getClient()
        .from('gre_guias')
        .select('*')
        .eq('id', greId);

      if (tenantId) {
        query.eq('tenant_id', tenantId);
      }

      const { data: greData, error } = await query.single();

      if (error || !greData) {
        throw new Error('No se pudo obtener los datos de la GRE');
      }

      // HARDENING E2: Validar certificado antes de firmar XML (si se proporciona tenantId)
      if (tenantId) {
        this.logger.log(`🔐 [GRE] Validando certificado antes de firmar XML para GRE ${greId}...`);
        const certificateValidation = await this.validationService.validateCertificate(tenantId);
        
        if (!certificateValidation.isValid) {
          this.logger.error(`❌ [GRE] Validación de certificado fallida antes de firmar: ${certificateValidation.errors.join(', ')}`);
          
          // Marcar GRE como ERROR sin intentar firmar
          await this.supabaseService.update(
            'gre_guias',
            { 
              estado: 'ERROR',
              error_message: `Error validando certificado antes de firmar: ${certificateValidation.errors.join(', ')}`,
              updated_at: new Date().toISOString()
            },
            { id: greId }
          );
          
          throw new BadRequestException({
            message: 'No se puede firmar la GRE: Certificado digital inválido',
            errors: certificateValidation.errors,
            code: 'CERT_VALIDATION_FAILED',
          });
        }

        if (certificateValidation.warnings.length > 0) {
          this.logger.warn(`⚠️ [GRE] Advertencias de certificado: ${certificateValidation.warnings.join(', ')}`);
        }

        this.logger.log(`✅ [GRE] Certificado validado exitosamente antes de firmar XML`);
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
          sunat_status: this.sunatStatuses.READY,
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );

      this.logger.log(`✅ [GRE] XML generado y firmado para GRE ${greId} - Hash: ${hash}`);
      return { success: true, hash };
    } catch (error) {
      this.logger.error(`❌ [GRE] Error generando XML para GRE ${greId}:`, error);
      
      // Marcar como ERROR
      await this.supabaseService.update(
        'gre_guias',
        { 
          estado: 'ERROR',
          error_message: `Error generando XML: ${error.message}`,
          sunat_status: this.sunatStatuses.ERROR,
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      return { success: false };
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
   * 🔴 CRÍTICO FIX: Determina si un error de SUNAT es técnico (reintentable) o de validación (no reintentable)
   */
  private isTechnicalError(codigoRespuesta: string, descripcionRespuesta: string): boolean {
    // Códigos de error técnicos de SUNAT que se pueden reintentar
    const technicalErrorCodes = ['99', '98', '97']; // Errores técnicos genéricos
    
    // Si el código indica error técnico
    if (technicalErrorCodes.includes(codigoRespuesta)) {
      return true;
    }

    // Si el mensaje indica error técnico de red/conexión
    const errorMessage = descripcionRespuesta?.toLowerCase() || '';
    const technicalKeywords = [
      'timeout',
      'connection',
      'network',
      'técnico',
      'servicio no disponible',
      'temporalmente',
      'unavailable',
    ];

    return technicalKeywords.some(keyword => errorMessage.includes(keyword));
  }

  /**
   * Reintentar envío de GRE (método público para SunatRetryService)
   */
  async retryProcesarEnvioSunat(greId: string, tenantId?: string): Promise<void> {
    return this.procesarEnvioSunat(greId, tenantId);
  }

  /**
   * Procesar envío de GRE a SUNAT (método preparado para activar después)
   */
  private async procesarEnvioSunat(greId: string, tenantId?: string): Promise<void> {
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
          sunat_status: this.sunatStatuses.SENDING,
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
            sunat_status: this.sunatStatuses.ACCEPTED,
            numero_sunat: response.numeroComprobante,
            hash_gre: response.hashCPE,
            cdr_sunat: response.cdr || 'CDR_RECEIVED',
            updated_at: new Date().toISOString()
          },
          { id: greId }
        );
      } else {
        console.error(`❌ [GRE] Error enviando GRE ${greId}: ${response.descripcionRespuesta}`);
        
        // 🔴 CRÍTICO FIX: Determinar si es error técnico recuperable o error de validación
        const isTechnicalError = this.isTechnicalError(response.codigoRespuesta, response.descripcionRespuesta);
        
        // Marcar como RECHAZADO
        await this.supabaseService.update(
          'gre_guias',
          {
            estado: 'RECHAZADO',
            sunat_status: isTechnicalError ? this.sunatStatuses.ERROR : this.sunatStatuses.REJECTED,
            error_message: `${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
            retry_count: isTechnicalError ? 0 : null, // Solo reintentar errores técnicos
            next_retry_at: null,
            updated_at: new Date().toISOString()
          },
          { id: greId }
        );
      }

    } catch (error) {
      console.error(`❌ [GRE] Error técnico enviando GRE ${greId}:`, error);
      
      // 🔴 CRÍTICO FIX: Marcar como RECHAZADO con información de reintento
      const retryCount = 0; // Primera vez que falla
      await this.supabaseService.update(
        'gre_guias',
        {
          estado: 'RECHAZADO',
          sunat_status: this.sunatStatuses.ERROR,
          error_message: `Error técnico: ${error.message}`,
          retry_count: retryCount,
          next_retry_at: null, // El servicio de reintentos lo programará
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );
    }
  }

  /**
   * Reenviar GRE a SUNAT
   */
  async reenviarGre(greId: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔄 [GRE] Reenviando GRE ${greId} a SUNAT...`);
      
      await this.procesarEnvioSunat(greId, tenantId);
      
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
  async enviarManualmenteSunat(greId: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🚀 [GRE] Enviando manualmente GRE ${greId} a SUNAT...`);
      await this.procesarEnvioSunat(greId, tenantId);
      return { success: true, message: 'GRE enviada a SUNAT exitosamente' };
    } catch (error) {
      console.error(`❌ Error enviando manualmente GRE ${greId}:`, error);
      return { success: false, message: `Error enviando GRE: ${error.message}` };
    }
  }

  /**
   * Consultar estado de GRE en SUNAT
   */
  async consultarEstadoGre(greId: string, tenantId: string): Promise<any> {
    try {
      console.log(`🔍 [GRE] Consultando estado de GRE ${greId} en SUNAT...`);
      
      // Obtener datos de la GRE
      const { data: greData, error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .select('numero, numero_sunat')
        .eq('id', greId)
        .eq('tenant_id', tenantId)
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
            sunat_status: this.sunatStatuses.ACCEPTED,
            cdr_sunat: response.cdr || 'CDR_RECEIVED',
            updated_at: new Date().toISOString()
          },
          { id: greId }
        );
      } else {
        await this.supabaseService.update(
          'gre_guias',
          {
            sunat_status: this.sunatStatuses.REJECTED,
            error_message: `${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
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
      await this.supabaseService.update(
        'gre_guias',
        {
          sunat_status: this.sunatStatuses.ERROR,
          error_message: `Error consultando estado: ${error.message}`,
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );
      return {
        id: greId,
        estado: 'ERROR',
        mensaje: `Error consultando estado: ${error.message}`,
        timestamp: new Date()
      };
    }
  }

  private async generarNumeroCorrelativo(tenantId: string): Promise<string> {
    try {
      // Obtener el último número usado
      const { data, error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .select('serie, correlativo')
        .eq('tenant_id', tenantId)
        .order('correlativo', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error obteniendo último número:', error);
        return 'T001-00000001'; // Número inicial si hay error
      }

      if (!data || data.length === 0) {
        return 'T001-00000001'; // Primer número
      }

      const serie = data[0].serie || 'T001';
      const correlativoActual = Number(data[0].correlativo || 0);
      const siguienteNumero = correlativoActual + 1 || 1;
      return `${serie}-${siguienteNumero.toString().padStart(8, '0')}`;
    } catch (error) {
      console.error('Error generando número correlativo:', error);
      return 'T001-00000001';
    }
  }

  private extractSerieYCorrelativo(numeroCompleto: string): { serie: string; correlativo: number } {
    const [serieRaw, correlativoRaw] = (numeroCompleto || '').split('-');
    const serie = serieRaw && serieRaw.trim().length > 0 ? serieRaw.trim().toUpperCase() : 'T001';
    const correlativoNumber = Number(correlativoRaw ?? '0');
    const correlativo = Number.isFinite(correlativoNumber) && correlativoNumber > 0 ? correlativoNumber : 0;
    return { serie, correlativo };
  }

  private resolveGreIdempotencyKey(dto: CreateGuiaRemisionDto, tenantId: string): string {
    const provided = dto.idempotencyKey?.trim();
    if (provided) {
      return provided;
    }

    if (dto.cpeRelacionado) {
      return `${tenantId}:cpe:${dto.cpeRelacionado}`;
    }

    if (dto.pedidoId) {
      return `${tenantId}:pedido:${dto.pedidoId}`;
    }

    if (dto.pedidoNumero) {
      return `${tenantId}:pedido-numero:${dto.pedidoNumero}`;
    }

    return [
      tenantId,
      dto.destinatario ?? 'destinatario',
      dto.fechaTraslado ?? new Date().toISOString(),
      dto.motivo ?? 'OTROS',
    ].join(':');
  }

  private buildGreAdditionalData(dto: CreateGuiaRemisionDto): Record<string, any> | null {
    const extras: Record<string, any> = {
      ...(dto.datosAdicionales || {}),
    };

    if (dto.despachosAsociados?.length) {
      extras.notasSalida = Array.from(new Set(dto.despachosAsociados));
    }

    if (dto.pedidoNumero) {
      extras.pedidoNumero = dto.pedidoNumero;
    }

    return Object.keys(extras).length > 0 ? extras : null;
  }

  private mapGreRecordToResponse(record: any): GuiaRemisionResponseDto {
    return {
      id: record.id,
      numero: record.numero,
      estado: record.estado,
      destinatario: record.destinatario,
      direccionDestino: record.direccion_destino,
      fechaTraslado: record.fecha_traslado,
      fechaCreacion: record.created_at,
      modalidad: record.modalidad,
      motivo: record.motivo,
      pesoTotal: record.peso_total,
      observaciones: record.observaciones,
      transportista: record.transportista,
      placaVehiculo: record.placa_vehiculo,
      licenciaConducir: record.licencia_conducir,
      cpeRelacionado: record.cpe_relacionado,
      numeroSunat: record.numero_sunat,
      hashGre: record.hash_gre,
      sunatStatus: record.sunat_status,
      idempotencyKey: record.idempotency_key,
      eventId: record.event_id,
    };
  }

  async getStats(tenantId: string) {
    const supabase = this.supabaseService.getClient();
    
    try {
      // Estadísticas básicas de GRE
      const { data: guias, error } = await supabase
        .from('gre_guias')
        .select('estado, peso_total, created_at')
        .eq('tenant_id', tenantId);

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

  /**
   * Evaluate if automatic GRE creation should be triggered
   * Requirements: 2.1, 2.2
   */
  async evaluateAutoGRECreation(saleData: {
    tenantId: string;
    saleId: string;
    total: number;
    cpeId?: string;
  }): Promise<boolean> {
    try {
      console.log(`🚚 [GRE] Evaluating auto GRE creation for sale ${saleData.saleId}, total: S/ ${saleData.total}`);

      // Get GRE threshold configuration for tenant
      const thresholdConfig = await this.getGREThresholdConfig(saleData.tenantId);

      // Check if auto GRE is enabled
      if (!thresholdConfig.greAutomaticoHabilitado) {
        console.log(`🚚 [GRE] Auto GRE is disabled for tenant ${saleData.tenantId}`);
        return false;
      }

      // Check if sale amount exceeds threshold
      const shouldCreate = saleData.total >= thresholdConfig.umbralGREAutomatico;

      console.log(
        `🚚 [GRE] Sale total S/ ${saleData.total} ${shouldCreate ? 'EXCEEDS' : 'BELOW'} threshold S/ ${thresholdConfig.umbralGREAutomatico}`
      );

      return shouldCreate;
    } catch (error) {
      console.error(`❌ [GRE] Error evaluating auto GRE creation:`, error);
      return false;
    }
  }

  /**
   * Create automatic GRE from sale data
   * Requirements: 2.1, 2.2, 2.3
   */
  async createAutoGREFromSale(
    saleId: string,
    saleData: {
      tenantId: string;
      cpeId: string;
      clienteId: string;
      clienteNombre?: string;
      clienteDireccion?: string;
      total: number;
      productos?: any[];
    }
  ): Promise<GuiaRemisionResponseDto> {
    try {
      console.log(`🚚 [GRE] Creating automatic GRE for sale ${saleId}`);

      // Calculate estimated weight
      const pesoEstimado = this.calcularPesoEstimado(saleData.productos || [], saleData.total);

      // Prepare GRE data
      const greData: CreateGuiaRemisionDto = {
        destinatario: saleData.clienteNombre || `Cliente ${saleData.clienteId}`,
        direccionDestino: saleData.clienteDireccion || 'Lima, Perú - Dirección por configurar',
        fechaTraslado: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        modalidad: 'TRANSPORTE_PUBLICO',
        motivo: 'VENTA',
        pesoTotal: pesoEstimado,
        observaciones: `GRE automática - Venta ${saleId} - Total: S/ ${saleData.total}`,
        transportista: 'Transporte por definir',
        placaVehiculo: null,
        licenciaConducir: null,
        cpeRelacionado: saleData.cpeId,
        idempotencyKey: `sale:${saleData.tenantId}:${saleId}`,
        datosAdicionales: {
          origen: 'VENTA_AUTOMATICA',
          ventaId: saleId,
        },
      };

      // Create GRE (with certificate validation)
      const gre = await this.createGuia(greData, saleData.tenantId);

      // Update GRE to mark as automatic and link to sale
      await this.supabaseService.getClient()
        .from('gre_guias')
        .update({
          es_automatica: true,
          venta_id: saleId,
          motivo_creacion: 'AUTO_THRESHOLD',
        })
        .eq('id', gre.id);

      // Link GRE with inventory movement
      await this.linkGREWithInventory(gre.id, saleId, saleData.tenantId, {
        productos: saleData.productos,
        total: saleData.total,
      });

      console.log(`✅ [GRE] Automatic GRE created successfully: ${gre.numero} for sale ${saleId}`);

      return gre;
    } catch (error) {
      console.error(`❌ [GRE] Error creating automatic GRE for sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Link GRE with inventory movement
   * Requirements: 2.3, 2.6
   */
  async linkGREToInventoryMovement(greId: string, movementId: string): Promise<void> {
    try {
      console.log(`🚚 [GRE] Linking GRE ${greId} to inventory movement ${movementId}`);

      const { error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .update({
          movimiento_inventario_id: movementId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', greId);

      if (error) {
        console.error(`❌ [GRE] Error linking GRE to inventory movement:`, error);
        throw error;
      }

      console.log(`✅ [GRE] GRE ${greId} linked to inventory movement ${movementId}`);
    } catch (error) {
      console.error(`❌ [GRE] Error linking GRE to inventory movement:`, error);
      throw error;
    }
  }

  /**
   * Get GRE threshold configuration for tenant
   * Requirements: 2.1, 2.2, 2.6
   */
  async getGREThresholdConfig(tenantId: string): Promise<{
    umbralGREAutomatico: number;
    greAutomaticoHabilitado: boolean;
  }> {
    try {
      console.log(`🚚 [GRE] Getting GRE threshold config for tenant ${tenantId}`);

      const { data, error } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select('umbral_gre_automatico, gre_automatico_habilitado')
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        console.warn(`⚠️ [GRE] Error getting GRE config, using defaults:`, error);
        return {
          umbralGREAutomatico: 700.0,
          greAutomaticoHabilitado: true,
        };
      }

      return {
        umbralGREAutomatico: data?.umbral_gre_automatico || 700.0,
        greAutomaticoHabilitado: data?.gre_automatico_habilitado !== false,
      };
    } catch (error) {
      console.error(`❌ [GRE] Error getting GRE threshold config:`, error);
      // Return defaults on error
      return {
        umbralGREAutomatico: 700.0,
        greAutomaticoHabilitado: true,
      };
    }
  }

  /**
   * Find or create inventory movement for a sale
   * Requirements: 2.3, 2.6
   */
  async findOrCreateInventoryMovement(
    saleId: string,
    tenantId: string,
    saleData?: {
      productos?: any[];
      total?: number;
    }
  ): Promise<string | null> {
    try {
      console.log(`🚚 [GRE] Finding or creating inventory movement for sale ${saleId}`);

      // First, try to find existing inventory movement for this sale
      const { data: existingMovement, error: findError } = await this.supabaseService.getClient()
        .from('stock_movimientos')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('referencia', `Venta ${saleId}`)
        .limit(1)
        .single();

      if (existingMovement && !findError) {
        console.log(`✅ [GRE] Found existing inventory movement: ${existingMovement.id}`);
        return existingMovement.id;
      }

      // If no existing movement found, create one using the inventory service
      if (saleData?.productos && saleData.productos.length > 0) {
        console.log(`🚚 [GRE] Creating inventory movements for ${saleData.productos.length} products`);

        // Create movements for each product in the sale
        const movementIds: string[] = [];
        
        for (const producto of saleData.productos) {
          try {
            const movementId = await this.inventoryService.realizarMovimientoStock(
              {
                productoId: producto.productoId || producto.id,
                tipoMovimiento: 'SALIDA',
                cantidad: producto.cantidad || 1,
                stockAnterior: 0, // Will be calculated by the service
                stockNuevo: 0, // Will be calculated by the service
                motivo: `Venta ${saleId}`,
                precioUnitario: producto.precio || 0,
                valorTotal: producto.total || 0,
                usuarioId: 'system',
                referencia: `Venta ${saleId}`,
                ventaId: saleId,
              },
              tenantId
            );

            if (movementId) {
              movementIds.push(movementId);
            }
          } catch (error) {
            console.error(`❌ [GRE] Error creating movement for product ${producto.productoId}:`, error);
          }
        }

        if (movementIds.length > 0) {
          console.log(`✅ [GRE] Created ${movementIds.length} inventory movements`);
          // Return the first movement ID as reference
          return movementIds[0];
        }
      }

      console.warn(`⚠️ [GRE] No inventory movement found or created for sale ${saleId}`);
      return null;
    } catch (error) {
      console.error(`❌ [GRE] Error finding/creating inventory movement:`, error);
      return null;
    }
  }

  /**
   * Link GRE with inventory movement and update GRE record
   * Requirements: 2.3, 2.6
   */
  async linkGREWithInventory(
    greId: string,
    saleId: string,
    tenantId: string,
    saleData?: {
      productos?: any[];
      total?: number;
    }
  ): Promise<void> {
    try {
      console.log(`🚚 [GRE] Linking GRE ${greId} with inventory for sale ${saleId}`);

      // Find or create inventory movement
      const movementId = await this.findOrCreateInventoryMovement(saleId, tenantId, saleData);

      if (movementId) {
        // Link GRE to inventory movement
        await this.linkGREToInventoryMovement(greId, movementId);
        console.log(`✅ [GRE] GRE ${greId} linked to inventory movement ${movementId}`);
      } else {
        console.warn(`⚠️ [GRE] Could not link GRE ${greId} to inventory - no movement found/created`);
      }
    } catch (error) {
      console.error(`❌ [GRE] Error linking GRE with inventory:`, error);
      // Don't throw - this is not critical for GRE creation
    }
  }
}
