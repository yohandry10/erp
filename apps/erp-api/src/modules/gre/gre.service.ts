import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateGuiaRemisionDto, GuiaRemisionResponseDto } from './gre.types';
import { EventBusService } from '../../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';

@Injectable()
export class GreService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly inventoryService: InventoryIntegrationService
  ) {
    console.log('🚚 [GRE] ¡Servicio GRE inicializado!');
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
          licenciaConducir: null
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
        licenciaConducir: gre.licencia_conducir
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
        licenciaConducir: data.licencia_conducir
      };
    } catch (error) {
      console.error('❌ Error en servicio GRE al obtener por ID:', error);
      throw error;
    }
  }

  async createGuia(greData: CreateGuiaRemisionDto): Promise<GuiaRemisionResponseDto> {
    const supabase = this.supabaseService.getClient();
    
    console.log('📦 Servicio: Creando GRE con datos:', greData);
    
    try {
      // Preparar datos para insertar
      const dataToInsert = {
        destinatario: greData.destinatario,
        direccion_destino: greData.direccionDestino,
        fecha_traslado: greData.fechaTraslado,
        modalidad: greData.modalidad,
        motivo: greData.motivo,
        peso_total: greData.pesoTotal,
        observaciones: greData.observaciones || null,
        transportista: greData.transportista || null,
        placa_vehiculo: greData.placaVehiculo || null,
        licencia_conducir: greData.licenciaConducir || null
        // No necesitamos estado ni created_at porque tienen valores por defecto en la BD
      };

      console.log('📦 Datos preparados para insertar:', dataToInsert);

      const { data, error } = await supabase
        .from('gre_guias')
        .insert(dataToInsert)
        .select()
        .single();

      if (error) {
        console.error('❌ Error en Supabase:', error);
        throw new Error(`Error al crear GRE: ${error.message}`);
      }

      if (!data) {
        throw new Error('No se recibieron datos de la guía creada');
      }

      console.log('✅ GRE creada en BD:', data);

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
        licenciaConducir: data.licencia_conducir
      };

    } catch (error) {
      console.error('❌ Error en createGuia:', error);
      throw error;
    }
  }

  async getStats() {
    const supabase = this.supabaseService.getClient();
    
    try {
      const { data, error } = await supabase
        .from('gre_guias')
        .select('estado');

      if (error) {
        console.error('Error al obtener estadísticas:', error);
        throw error;
      }

      const total = data?.length || 0;
      const pendientes = data?.filter(g => g.estado === 'PENDIENTE').length || 0;
      const emitidas = data?.filter(g => g.estado === 'EMITIDO').length || 0;
      const aceptadas = data?.filter(g => g.estado === 'ACEPTADO').length || 0;
      const enTransito = emitidas; // Consideramos EMITIDO como en tránsito
      const completados = aceptadas; // Consideramos ACEPTADO como completado

      return {
        greEmitidas: emitidas,
        totalGre: total,
        enTransito,
        completados
      };
    } catch (error) {
      console.error('Error en getStats:', error);
      return {
        greEmitidas: 0,
        totalGre: 0,
        enTransito: 0,
        completados: 0
      };
    }
  }
}