import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { GreService } from '../../gre/gre.service';
import { CreateGuiaRemisionDto } from '../../gre/gre.types';
import { PedidoVenta, PedidoDetalle } from './entities';

/**
 * GREIntegrationService
 * Servicio para integrar el módulo de Pedidos con el módulo GRE
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 22.1, 22.2, 22.3, 22.4, 22.5
 */
@Injectable()
export class GREIntegrationService {
  private readonly logger = new Logger(GREIntegrationService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly greService: GreService,
  ) {}

  /**
   * Verifica si se debe sugerir la generación de GRE según la configuración del tenant
   * Requirements: 11.1, 11.2, 22.1
   * 
   * @param pedido - Pedido de venta con detalles
   * @param tenantId - ID del tenant
   * @returns Objeto con información sobre si sugerir GRE y el tipo de sugerencia
   */
  async verificarSugerenciaGRE(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] },
    tenantId: string,
  ): Promise<{
    sugerir: boolean;
    obligatorio: boolean;
    automatico: boolean;
    motivo?: string;
  }> {
    this.logger.log(`Verificando sugerencia de GRE para pedido ${pedido.id}`);

    try {
      // Obtener configuración del tenant
      const config = await this.obtenerConfiguracionGRE(tenantId);
      if (config.pais && config.pais !== 'PE') {
        return { sugerir: false, obligatorio: false, automatico: false };
      }

      // Verificar si GRE es obligatorio (Requirement 11.3, 22.4)
      if (config.gre_obligatorio) {
        this.logger.log(`GRE obligatorio para tenant ${tenantId}`);
        return {
          sugerir: true,
          obligatorio: true,
          automatico: config.gre_automatico_habilitado,
          motivo: 'GRE obligatorio según configuración de la empresa',
        };
      }

      // Verificar si está habilitada la sugerencia automática (Requirement 11.2, 22.1)
      if (config.gre_automatico_habilitado) {
        const umbral = config.umbral_gre_automatico || 0;
        
        // Verificar si el total del pedido supera el umbral (Requirement 11.2, 22.2)
        if (pedido.total > umbral) {
          this.logger.log(
            `Total del pedido (${pedido.total}) supera el umbral (${umbral}), sugiriendo GRE`,
          );
          return {
            sugerir: true,
            obligatorio: false,
            automatico: true,
            motivo: `El monto total (S/ ${pedido.total.toFixed(2)}) supera el umbral configurado (S/ ${umbral.toFixed(2)})`,
          };
        }
      }

      // No se sugiere GRE
      this.logger.log(`No se sugiere GRE para pedido ${pedido.id}`);
      return {
        sugerir: false,
        obligatorio: false,
        automatico: false,
      };
    } catch (error) {
      this.logger.error(`Error verificando sugerencia de GRE para pedido ${pedido.id}:`, error);
      
      // En caso de error, no sugerir GRE para no bloquear el flujo
      return {
        sugerir: false,
        obligatorio: false,
        automatico: false,
      };
    }
  }

  /**
   * Prepara los datos de GRE precargados desde el pedido y factura
   * Requirements: 11.4, 11.5, 22.3, 22.5
   * 
   * @param pedido - Pedido de venta con detalles
   * @param facturaId - ID de la factura relacionada
   * @param tenantId - ID del tenant
   * @returns Datos precargados para crear la GRE
   */
  async prepararDatosGRE(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] },
    facturaId: string,
    tenantId: string,
  ): Promise<Partial<CreateGuiaRemisionDto> & { datosAdicionales: any }> {
    this.logger.log(`Preparando datos de GRE para pedido ${pedido.id} y factura ${facturaId}`);

    try {
      const config = await this.obtenerConfiguracionGRE(tenantId);
      if (config.pais && config.pais !== 'PE') {
        throw new BadRequestException(
          'La GRE es exclusiva de Perú; el tenant argentino utiliza documentación de traslado local fuera de SUNAT.',
        );
      }
      // Obtener datos del cliente (Requirement 22.3)
      const cliente = await this.obtenerCliente(pedido.cliente_id, tenantId);

      // Obtener configuración de la empresa para punto de partida (Requirement 22.3)
      const empresaConfig = await this.obtenerEmpresaConfig(tenantId);

      // Calcular peso total estimado (Requirement 22.5)
      const pesoTotal = this.calcularPesoEstimado(pedido.detalle, pedido.total);

      // Calcular número de bultos estimado (Requirement 22.5)
      const bultos = this.calcularBultosEstimados(pedido.detalle);

      // Preparar datos precargados (Requirements: 11.4, 11.5, 22.3, 22.5)
      const datosGRE: Partial<CreateGuiaRemisionDto> & { datosAdicionales: any } = {
        // Destinatario (cliente)
        destinatario: cliente.razon_social || cliente.nombre_comercial || 'Cliente',
        direccionDestino: cliente.direccion || 'Dirección por completar',

        // Fecha de traslado (mañana por defecto)
        fechaTraslado: this.calcularFechaTraslado(),

        // Modalidad de transporte (por defecto transporte público)
        modalidad: 'TRANSPORTE_PUBLICO',

        // Motivo de traslado (venta)
        motivo: 'VENTA',

        // Peso total estimado
        pesoTotal: pesoTotal,

        // Observaciones con referencia al pedido
        observaciones: `Traslado de mercadería para pedido ${pedido.numero}. ${pedido.detalle.length} producto(s).`,

        // CPE relacionado
        cpeRelacionado: facturaId,
        pedidoId: pedido.id,
        pedidoNumero: pedido.numero,
        idempotencyKey: `ventas.gre:${tenantId}:${facturaId}`,

        // Datos adicionales para precarga en el formulario
        datosAdicionales: {
          // Punto de partida (empresa)
          puntoPartida: {
            direccion: empresaConfig.direccion_fiscal || 'Dirección de la empresa',
            ubigeo: empresaConfig.ubigeo || null,
          },

          // Punto de llegada (cliente)
          puntoLlegada: {
            direccion: cliente.direccion || 'Dirección por completar',
            ubigeo: cliente.ubigeo || null,
          },

          // Información del cliente
          cliente: {
            id: cliente.id,
            documento_tipo: cliente.documento_tipo,
            documento_numero: cliente.numero_documento,
            razon_social: cliente.razon_social,
            direccion: cliente.direccion,
          },

          // Información del pedido
          pedido: {
            id: pedido.id,
            numero: pedido.numero,
            total: pedido.total,
            cantidad_items: pedido.detalle.length,
          },

          // Estimaciones
          estimaciones: {
            peso_kg: pesoTotal,
            bultos: bultos,
            metodo_calculo: 'Estimación automática basada en productos y valor',
          },

          // Sugerencias para el usuario
          sugerencias: {
            transportista: 'Completar con datos del transportista',
            placa: 'Completar con placa del vehículo (opcional para transporte público)',
            conductor: 'Completar con licencia del conductor (opcional para transporte público)',
          },
        },
      };

      this.logger.log(`Datos de GRE preparados exitosamente para pedido ${pedido.id}`);

      return datosGRE;
    } catch (error) {
      this.logger.error(`Error preparando datos de GRE para pedido ${pedido.id}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene la configuración de GRE del tenant
   * Requirements: 11.1, 11.2, 22.1
   */
  private async obtenerConfiguracionGRE(tenantId: string): Promise<{
    pais?: string;
    moneda?: string;
    gre_obligatorio: boolean;
    gre_automatico_habilitado: boolean;
    umbral_gre_automatico: number;
  }> {
    let config: any = null;
    let error: any = null;
    try {
      const result = await this.supabase.getClient()
        .from('empresa_config')
        .select('pais, moneda_defecto, gre_obligatorio, gre_automatico_habilitado, umbral_gre_automatico')
        .eq('tenant_id', tenantId)
        .single();
      config = result.data;
      error = result.error;
    } catch (queryError) {
      error = queryError;
    }

    if (error) {
      this.logger.warn(`No se pudo obtener configuración de GRE para tenant ${tenantId}, usando valores por defecto`);

      // Fail closed: sin configuración explícita no se sugiere GRE automática.
      return {
        gre_obligatorio: false,
        gre_automatico_habilitado: false,
        umbral_gre_automatico: 700.0,
      };
    }

    return {
      pais: String(config.pais || 'PE').toUpperCase(),
      moneda: String(config.moneda_defecto || 'PEN').toUpperCase(),
      gre_obligatorio: config.gre_obligatorio || false,
      gre_automatico_habilitado: config.gre_automatico_habilitado === true,
      umbral_gre_automatico: config.umbral_gre_automatico || 700.0,
    };
  }

  /**
   * Obtiene datos del cliente
   * Requirements: 22.3
   */
  private async obtenerCliente(clienteId: string, tenantId: string): Promise<any> {
    const { data: cliente, error } = await this.supabase.getClient()
      .from('clientes')
      .select('*')
      .eq('id', clienteId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !cliente) {
      this.logger.error(`Cliente ${clienteId} no encontrado`);
      throw new Error('Cliente no encontrado');
    }

    return cliente;
  }

  /**
   * Obtiene configuración de la empresa
   * Requirements: 22.3
   */
  private async obtenerEmpresaConfig(tenantId: string): Promise<any> {
    const { data: config, error } = await this.supabase.getClient()
      .from('empresa_config')
      .select('ruc, razon_social, direccion_fiscal, ubigeo')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !config) {
      this.logger.error(`Configuración de empresa no encontrada para tenant ${tenantId}`);
      throw new Error('Configuración de empresa no encontrada');
    }

    return config;
  }

  /**
   * Calcula el peso total estimado basado en los productos y el valor total
   * Requirements: 22.5
   * 
   * Método de estimación:
   * - Peso base: 1 kg por cada S/ 100 de valor
   * - Peso adicional: 0.5 kg por cada producto
   * - Peso mínimo: 1 kg
   */
  private calcularPesoEstimado(detalle: PedidoDetalle[], total: number): number {
    // Peso base según valor (1 kg por cada S/ 100)
    let pesoEstimado = total / 100;

    // Agregar peso por cantidad de productos (0.5 kg por producto)
    if (detalle.length > 0) {
      const cantidadTotal = detalle.reduce((sum, item) => sum + item.cantidad, 0);
      pesoEstimado += cantidadTotal * 0.5;
    }

    // Peso mínimo de 1 kg
    const pesoFinal = Math.max(Math.round(pesoEstimado * 100) / 100, 1);

    this.logger.log(`Peso estimado calculado: ${pesoFinal} kg (${detalle.length} productos, total S/ ${total})`);

    return pesoFinal;
  }

  /**
   * Calcula el número de bultos estimados basado en la cantidad de productos
   * Requirements: 22.5
   * 
   * Método de estimación:
   * - 1 bulto por cada 5 productos
   * - Mínimo 1 bulto
   */
  private calcularBultosEstimados(detalle: PedidoDetalle[]): number {
    const cantidadTotal = detalle.reduce((sum, item) => sum + item.cantidad, 0);
    
    // 1 bulto por cada 5 productos, mínimo 1
    const bultos = Math.max(Math.ceil(cantidadTotal / 5), 1);

    this.logger.log(`Bultos estimados: ${bultos} (${cantidadTotal} productos)`);

    return bultos;
  }

  /**
   * Calcula la fecha de traslado sugerida (mañana por defecto)
   * Requirements: 22.3
   */
  private calcularFechaTraslado(): string {
    const mañana = new Date();
    mañana.setDate(mañana.getDate() + 1);
    
    return mañana.toISOString();
  }
}
