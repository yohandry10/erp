import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { CacheInvalidationService } from '../shared/cache/cache-invalidation.service';
import { TaxCalculatorService } from '../shared/utils/tax-calculator';
import { EventBusService } from '../shared/events/event-bus.service';
import { CpeService } from './cpe/cpe.service';
import { CxcService } from './finanzas/cxc/cxc.service';
import { PedidoVenta, PedidoDetalle } from './ventas/pedidos/entities';
import { DocumentoFiscal, DocumentoDetalleFiscal } from './documentos/interfaces/documento-fiscal.interface';

interface DocumentoDesdePedidoResult {
  documento: DocumentoFiscal;
  cpe?: any;
  cuentaPorCobrar?: any;
}

@Injectable()
export class DocumentosService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly taxCalculator: TaxCalculatorService,
    private readonly eventBus: EventBusService,
    private readonly cpeService: CpeService,
    private readonly cxcService: CxcService,
  ) {}

  private requireTenantId(tenantId?: string): string {
    if (!tenantId) {
      throw new BadRequestException('tenantId requerido para operación de documentos');
    }
    return tenantId;
  }

  // ========== ESTADÍSTICAS ==========
  async getStats(tenantId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      console.log('📊 Calculando estadísticas documentos para tenant:', tenant);
      
      // Primero, intentar una consulta simple para verificar conectividad
      const { data: testData, error: testError } = await this.supabaseService
        .getClient()
        .from('documentos')
        .select('id')
        .eq('tenant_id', tenant)
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
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant);

      const { count: totalDocumentos, error: errorTotal } = await queryTotal;
      
      if (errorTotal) {
        console.error('❌ Error contando documentos:', errorTotal);
        throw new Error(`Error contando documentos: ${errorTotal.message}`);
      }

      // Contar por tipo de documento
      const tiposConteo = await Promise.all([
        this.contarPorTipo('FACTURA', tenant),
        this.contarPorTipo('BOLETA', tenant),
        this.contarPorTipo('NOTA_CREDITO', tenant),
        this.contarPorTipo('CONTRATO', tenant)
      ]);

      // Contar pendientes de envío
      let queryPendientes = this.supabaseService
        .getClient()
        .from('documentos')
        .select('*', { count: 'exact', head: true })
        .in('estado', ['BORRADOR', 'EMITIDO'])
        .eq('tenant_id', tenant);

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
    } catch (error) {
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

  private async contarPorTipo(tipo: string, tenantId: string): Promise<number> {
    try {
      const tenant = this.requireTenantId(tenantId);
      let query = this.supabaseService
        .getClient()
        .from('documentos')
        .select('*', { count: 'exact', head: true })
        .eq('tipo_documento', tipo)
        .eq('tenant_id', tenant);

      const { count, error } = await query;
      
      if (error) {
        console.error(`❌ Error contando documentos tipo ${tipo}:`, error);
        return 0;
      }

      console.log(`📊 Documentos tipo ${tipo}: ${count || 0}`);
      return count || 0;
    } catch (error) {
      console.error(`❌ Error en contarPorTipo para ${tipo}:`, error);
      return 0;
    }
  }

  // ========== GESTIÓN DE DOCUMENTOS ==========
  async getDocumentos(filters: any, tenantId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      console.log('📄 Consultando documentos para tenant:', tenant, 'filters:', filters);
      
      let query = this.supabaseService
        .getClient()
        .from('documentos')
        .select(`
          *,
          documento_detalles(*)
        `)
        .eq('tenant_id', tenant)
        .order('created_at', { ascending: false });

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
        throw new BadRequestException('Error fetching documentos: ' + error.message);
      }

      console.log(`📊 Se encontraron ${data?.length || 0} documentos`);

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      console.error('❌ Error getting documentos:', error);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  async getDocumento(id: string, tenantId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      console.log('📄 Obteniendo documento:', id);
      
      let query = this.supabaseService
        .getClient()
        .from('documentos')
        .select(`
          *,
          documento_detalles(*),
          documento_archivos(*)
        `)
        .eq('id', id)
        .eq('tenant_id', tenant);

      const { data: documento, error } = await query.single();

      if (error || !documento) {
        throw new NotFoundException('Documento no encontrado');
      }

      return {
        success: true,
        data: documento,
      };
    } catch (error) {
      console.error('❌ Error getting documento:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Error al obtener el documento');
    }
  }

  async crearDocumento(documentoData: any, tenantId?: string, userId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      console.log('📝 Creando nuevo documento:', documentoData.tipo_documento);

      // Validar datos requeridos
      if (!documentoData.tipo_documento || !documentoData.receptor_numero_doc || !documentoData.total) {
        throw new BadRequestException('Datos requeridos: tipo_documento, receptor_numero_doc, total');
      }

      // Obtener siguiente número de serie
      const siguienteNumero = await this.obtenerSiguienteNumero(
        documentoData.tipo_documento, 
        documentoData.serie || this.getSerieDefault(documentoData.tipo_documento),
        tenant
      );

      // Obtener datos de la empresa
      const empresaConfig = await this.obtenerConfigEmpresa(tenant);

      const nuevoDocumento = {
        tenant_id: tenant,
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
        throw new BadRequestException('Error creating documento: ' + error.message);
      }

      // Crear detalles si existen
      if (documentoData.detalles && Array.isArray(documentoData.detalles)) {
        await this.crearDetallesDocumento(documento.id, documentoData.detalles, tenant);
      }

      // Registrar auditoría
      await this.registrarAuditoria(documento.id, 'CREADO', userId, 'Documento creado', tenant);

      console.log('✅ Documento creado exitosamente:', documento.id);

      // Invalidar cache del dashboard automáticamente
      try {
        await this.cacheInvalidation.onDocumentoCreated(tenant);
      } catch (error) {
        console.warn('⚠️ No se pudo invalidar cache después de crear documento:', error);
      }

      return {
        success: true,
        data: documento,
        message: 'Documento creado correctamente',
      };
    } catch (error) {
      console.error('❌ Error creating documento:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al crear el documento');
    }
  }

  async crearDocumentoDesdePedido(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] },
    tipoDoc: '01' | '03',
    tenantId: string,
    userId?: string,
  ): Promise<DocumentoDesdePedidoResult> {
    if (!pedido) {
      throw new BadRequestException('El pedido es requerido para generar el documento');
    }

    if (!pedido.detalle || pedido.detalle.length === 0) {
      throw new BadRequestException('El pedido no tiene detalle para generar un documento fiscal');
    }

    try {
      const client = this.supabaseService.getClient();
      const cliente = await this.obtenerClienteFiscalData(pedido.cliente_id, tenantId);
      const empresa = await this.obtenerEmpresaFiscalConfig(tenantId);
      const serieActiva = await this.obtenerSerieActiva(tipoDoc, tenantId);
      const numeroDocumento = await this.incrementarNumeroSerie(serieActiva, tenantId);

      const baseSubtotal =
        pedido.subtotal != null
          ? Number(pedido.subtotal)
          : this.calcularSubtotalDesdeDetalle(pedido.detalle);

      const impuestos = await this.taxCalculator.calcularImpuestos({
        subtotal: baseSubtotal,
        tenantId,
        moneda: empresa.moneda,
      });

      const fechaEmision = new Date();
      const fechaVencimiento = this.sumarDias(
        fechaEmision,
        empresa.dias_vencimiento_factura ?? 30,
      );

      const documentoPayload = {
        tenant_id: tenantId,
        tipo_documento: tipoDoc,
        serie: serieActiva.serie,
        numero: numeroDocumento,
        fecha_emision: fechaEmision.toISOString(),
        fecha_vencimiento: fechaVencimiento.toISOString(),
        pedido_id: pedido.id,
        cliente_id: pedido.cliente_id,
        subtotal: impuestos.subtotal,
        impuesto_igv: impuestos.igv,
        total: impuestos.total,
        moneda: empresa.moneda || impuestos.moneda || 'PEN',
        estado: 'EMITIDO',
        created_by: userId ?? null,
      };

      const { data: documentoInsertado, error: documentoError } = await client
        .from('documentos')
        .insert(documentoPayload)
        .select()
        .single();

      if (documentoError || !documentoInsertado) {
        console.error('❌ Error creando documento desde pedido:', documentoError);
        throw new BadRequestException('No se pudo crear el documento fiscal');
      }

      const detallesFiscal = this.prepararDetallesDesdePedido(
        pedido.detalle,
        impuestos.tasaIgv ?? 0,
      );

      const detallesParaInsertar = detallesFiscal.map((detalle) => ({
        codigo_producto: detalle.codigo_producto,
        descripcion: detalle.descripcion,
        unidad_medida: detalle.unidad_medida ?? 'NIU',
        cantidad: detalle.cantidad,
        precio_unitario: detalle.precio_unitario,
        descuento_unitario: 0,
        valor_venta: detalle.valor_venta,
        impuesto_igv: detalle.impuesto_igv,
        impuesto_isc: 0,
        total_item: detalle.total_item,
      }));

      await this.crearDetallesDocumento(documentoInsertado.id, detallesParaInsertar, tenantId);
      await this.registrarAuditoria(
        documentoInsertado.id,
        'CREADO',
        userId ?? null,
        'Documento generado desde pedido',
        tenantId,
      );

      if (tenantId) {
        try {
          await this.cacheInvalidation.onDocumentoCreated(tenantId);
        } catch (cacheError) {
          console.warn('⚠️ No se pudo invalidar cache después de generar documento:', cacheError);
        }
      }

      const documentoFiscal: DocumentoFiscal = {
        ...documentoInsertado,
        pais_id: empresa.pais_id ?? null,
        detalles: detallesFiscal,
        cliente: {
          id: cliente.id,
          documento_tipo: cliente.documento_tipo,
          documento_numero: cliente.numero_documento,
          razon_social: cliente.razon_social,
          direccion: cliente.direccion,
          email: cliente.email,
        },
        emisor: {
          ruc: empresa.ruc,
          razon_social: empresa.razon_social,
          direccion: empresa.direccion_fiscal,
        },
      };

      let cpeGenerado: any = null;
      let cuentaPorCobrar: any = null;

      try {
        cpeGenerado = await this.cpeService.crearCPEDesdeDocumento(documentoFiscal, tenantId);
      } catch (cpeError) {
        console.error('❌ Error generando CPE desde documento:', cpeError);
        throw new BadRequestException('No se pudo generar el CPE asociado al documento');
      }

      try {
        cuentaPorCobrar = await this.cxcService.crearCxCDesdeDocumento(documentoFiscal, tenantId);
      } catch (cxcError) {
        console.error('❌ Error generando CxC desde documento:', cxcError);
        throw new BadRequestException('No se pudo generar la cuenta por cobrar del documento');
      }

      await this.eventBus.emitDocumentoFiscalGenerado({
        eventId: uuidv4(),
        tenantId,
        documentoId: documentoFiscal.id,
        pedidoId: pedido.id,
        tipoDocumento: tipoDoc,
        serie: documentoFiscal.serie,
        numero: documentoFiscal.numero,
        subtotal: documentoFiscal.subtotal,
        impuesto: documentoFiscal.impuesto_igv,
        total: documentoFiscal.total,
        moneda: documentoFiscal.moneda,
        fechaEmision: documentoFiscal.fecha_emision,
        paisId: documentoFiscal.pais_id ?? empresa.pais_id ?? 1,
      });

      return {
        documento: documentoFiscal,
        cpe: cpeGenerado,
        cuentaPorCobrar,
      };
    } catch (error) {
      console.error('❌ Error creando documento desde pedido:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al generar el documento desde el pedido');
    }
  }

  private async crearDetallesDocumento(documentoId: string, detalles: any[], tenantId: string) {
    const tenant = this.requireTenantId(tenantId);
    const detallesConId = detalles.map((detalle, index) => ({
      documento_id: documentoId,
      tenant_id: tenant,
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
      throw new BadRequestException('Error creando detalles del documento');
    }
  }

  private prepararDetallesDesdePedido(
    detallePedido: PedidoDetalle[],
    tasaIgv: number,
  ): DocumentoDetalleFiscal[] {
    return detallePedido.map((item) => {
      const cantidad = Number(item.cantidad ?? 0);
      const precioUnitario = Number(item.precio_unitario ?? 0);
      const valorBase =
        item.subtotal != null ? Number(item.subtotal) : this.roundValue(cantidad * precioUnitario);
      const igv = this.roundValue(valorBase * tasaIgv);
      return {
        producto_id: item.producto_id ?? null,
        codigo_producto: item.producto_id ?? null,
        descripcion: item.descripcion,
        unidad_medida: 'NIU',
        cantidad,
        precio_unitario: precioUnitario,
        valor_venta: valorBase,
        impuesto_igv: igv,
        total_item: this.roundValue(valorBase + igv),
      };
    });
  }

  private roundValue(value: number, precision = 2): number {
    const multiplier = Math.pow(10, precision);
    return Math.round((Number(value) + Number.EPSILON) * multiplier) / multiplier;
  }

  private sumarDias(fecha: Date, dias: number): Date {
    const nuevaFecha = new Date(fecha);
    nuevaFecha.setDate(nuevaFecha.getDate() + dias);
    return nuevaFecha;
  }

  private async obtenerClienteFiscalData(clienteId: string, tenantId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clientes')
      .select('id, documento_tipo, numero_documento, razon_social, direccion, email')
      .eq('tenant_id', tenantId)
      .eq('id', clienteId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundException('Cliente no encontrado para generar documento');
    }

    return data;
  }

  private async obtenerEmpresaFiscalConfig(tenantId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select(
        'ruc, razon_social, direccion_fiscal, pais_id, moneda_defecto, dias_vencimiento_factura',
      )
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('Error obteniendo configuración fiscal de empresa:', error);
    }

    return {
      ruc: data?.ruc || '00000000000',
      razon_social: data?.razon_social || 'EMPRESA',
      direccion_fiscal: data?.direccion_fiscal || 'DIRECCIÓN NO DEFINIDA',
      pais_id: data?.pais_id || 1,
      moneda: data?.moneda_defecto || 'PEN',
      dias_vencimiento_factura: data?.dias_vencimiento_factura || 30,
    };
  }

  private async obtenerSerieActiva(tipoDoc: string, tenantId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('documento_series')
      .select('id, serie, tipo_documento, correlativo_actual, correlativo_maximo')
      .eq('tenant_id', tenantId)
      .eq('tipo_documento', tipoDoc)
      .eq('activo', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      throw new BadRequestException(
        `No hay series activas para el tipo de documento ${tipoDoc} en el tenant`,
      );
    }

    return data;
  }

  private async incrementarNumeroSerie(
    serie: { tipo_documento: string; serie: string },
    tenantId: string,
  ): Promise<string> {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .rpc('obtener_siguiente_numero_documento', {
          p_tenant_id: tenantId,
          p_tipo_documento: serie.tipo_documento,
          p_serie: serie.serie,
        });

      if (error) {
        throw error;
      }

      if (data) {
        return data as string;
      }
    } catch (rpcError) {
      console.warn('⚠️ Error usando obtener_siguiente_numero_documento, usando fallback:', rpcError);
    }

    return this.obtenerSiguienteNumero(serie.tipo_documento, serie.serie, tenantId);
  }

  private calcularSubtotalDesdeDetalle(detalle: PedidoDetalle[]): number {
    return detalle.reduce((sum, item) => {
      const cantidad = Number(item.cantidad ?? 0);
      const precio = Number(item.precio_unitario ?? 0);
      return sum + cantidad * precio;
    }, 0);
  }

  // ========== FACTURACIÓN ELECTRÓNICA ==========
  async generarXML(id: string, tenantId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      console.log('🔧 Generando XML para documento:', id);

      const documento = await this.getDocumento(id, tenant);
      if (!documento.success) {
        throw new NotFoundException('Documento no encontrado');
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
          throw new BadRequestException('Tipo de documento no soportado para XML');
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
        .eq('id', id)
        .eq('tenant_id', tenant);

      if (error) {
        throw new BadRequestException('Error actualizando documento con XML');
      }

      // Registrar auditoría
      await this.registrarAuditoria(id, 'XML_GENERADO', null, 'XML generado exitosamente', tenant);

      return {
        success: true,
        data: {
          xml_content: xmlContent,
          codigo_hash: codigoHash,
        },
        message: 'XML generado correctamente',
      };
    } catch (error) {
      console.error('❌ Error generando XML:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Error al generar el XML');
    }
  }

  async enviarSUNAT(id: string, tenantId?: string, userId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      console.log('📡 Enviando documento a SUNAT:', id);

      const documento = await this.getDocumento(id, tenant);
      if (!documento.success) {
        throw new NotFoundException('Documento no encontrado');
      }

      const doc = documento.data;

      if (doc.estado !== 'EMITIDO') {
        throw new BadRequestException('El documento debe estar emitido para enviarse a SUNAT');
      }

      if (!doc.xml_content) {
        throw new BadRequestException('El documento debe tener XML generado');
      }

      const { data: cpe, error: cpeError } = await this.supabaseService
        .getClient()
        .from('cpe')
        .select('id')
        .eq('documento_id', id)
        .eq('tenant_id', tenant)
        .maybeSingle();

      if (cpeError) {
        throw new BadRequestException(`No se pudo buscar el CPE asociado: ${cpeError.message}`);
      }

      if (!cpe?.id) {
        throw new BadRequestException('El envio SUNAT legacy esta deshabilitado. Cree/envie el CPE asociado desde el modulo CPE.');
      }

      await this.cpeService.resendToOse(cpe.id, tenant);

      // Actualizar estado del documento
      const { error } = await this.supabaseService
        .getClient()
        .from('documentos')
        .update({
          estado: 'ENVIADO_SUNAT',
          estado_sunat: 'ENVIADO_DESDE_CPE',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', tenant);

      if (error) {
        throw new BadRequestException('Error actualizando estado del documento');
      }

      // Registrar auditoría
      await this.registrarAuditoria(
        id, 
        'ENVIADO_SUNAT', 
        userId, 
        `Enviado a autoridad fiscal desde CPE ${cpe.id}`,
        tenant
      );

      return {
        success: true,
        data: {
          cpe_id: cpe.id,
        },
        message: 'Documento enviado a autoridad fiscal desde CPE asociado',
      };
    } catch (error) {
      console.error('❌ Error enviando a SUNAT:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Error al enviar el documento a SUNAT');
    }
  }

  // ========== VALIDACIONES ==========
  async validarRUC(ruc: string) {
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

      const errorRuc = this.validarRucLocal(ruc);
      if (errorRuc) {
        return {
          success: false,
          data: null,
          error: errorRuc,
        };
      }

      return {
        success: true,
        data: {
          ruc,
          validado_formato: true,
          consulta_sunat: false,
          fuente: 'VALIDACION_LOCAL',
        },
        message: 'RUC válido por formato y dígito verificador; no se consultó el padrón SUNAT',
      };
    } catch (error) {
      console.error('❌ Error validando RUC:', error);
      return {
        success: false,
        data: null,
        error: error.message,
      };
    }
  }

  async validarDocumento(documentoData: any) {
    try {
      console.log('✅ Validando documento antes de envío');

      const errores = [];

      // Validaciones obligatorias
      if (!documentoData.tipo_documento) errores.push('Tipo de documento es requerido');
      if (!documentoData.receptor_numero_doc) errores.push('Número de documento del receptor es requerido');
      if (!documentoData.receptor_razon_social) errores.push('Razón social del receptor es requerida');
      if (!documentoData.total || documentoData.total <= 0) errores.push('Total debe ser mayor a 0');

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
          if (!detalle.descripcion) errores.push(`Detalle ${index + 1}: Descripción es requerida`);
          if (!detalle.cantidad || detalle.cantidad <= 0) errores.push(`Detalle ${index + 1}: Cantidad debe ser mayor a 0`);
          if (!detalle.precio_unitario || detalle.precio_unitario <= 0) errores.push(`Detalle ${index + 1}: Precio unitario debe ser mayor a 0`);
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
    } catch (error) {
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
  private getSerieDefault(tipoDocumento: string): string {
    const series = {
      'FACTURA': 'F001',
      'BOLETA': 'B001',
      'NOTA_CREDITO': 'FC01',
      'NOTA_DEBITO': 'FD01',
      'CONTRATO': 'C001',
    };
    return series[tipoDocumento] || 'DOC1';
  }

  private async obtenerSiguienteNumero(tipoDocumento: string, serie: string, tenantId: string): Promise<string> {
    const tenant = this.requireTenantId(tenantId);
    try {
      // Usar la función SQL optimizada con lock para concurrencia
      const { data, error } = await this.supabaseService
        .getClient()
        .rpc('obtener_siguiente_numero_serie', {
          p_tenant_id: tenant,
          p_tipo_documento: tipoDocumento,
          p_serie: serie
        });
      
      if (error) {
        console.error('❌ Error obteniendo siguiente número:', error);
        // Fallback al método manual si falla la función
        return await this.obtenerSiguienteNumeroManual(tipoDocumento, serie, tenant);
      }
      
      return data || '00000001';
    } catch (error) {
      console.error('❌ Error en obtenerSiguienteNumero:', error);
      // Fallback al método manual
      return await this.obtenerSiguienteNumeroManual(tipoDocumento, serie, tenant);
    }
  }

  // Método de respaldo en caso de que la función SQL no esté disponible
  private async obtenerSiguienteNumeroManual(tipoDocumento: string, serie: string, tenantId: string): Promise<string> {
    console.log('⚠️ Usando método manual para obtener número de serie');
    
    // Obtener configuración de serie
    let query = this.supabaseService
      .getClient()
      .from('documento_series')
      .select('correlativo_actual')
      .eq('tipo_documento', tipoDocumento)
      .eq('serie', serie)
      .eq('tenant_id', tenantId);

    const { data: serieConfig } = await query.single();

    const siguienteCorrelativo = (serieConfig?.correlativo_actual || 0) + 1;

    // Actualizar correlativo
    await this.supabaseService
      .getClient()
      .from('documento_series')
      .upsert({
        tenant_id: tenantId,
        tipo_documento: tipoDocumento,
        serie: serie,
        correlativo_actual: siguienteCorrelativo,
        activo: true
      }, {
        onConflict: 'tenant_id,tipo_documento,serie'
      });

    return siguienteCorrelativo.toString().padStart(8, '0');
  }

  private async obtenerConfigEmpresa(tenantId: string) {
    const tenant = this.requireTenantId(tenantId);
    let query = this.supabaseService
      .getClient()
      .from('fe_configuracion')
      .select('*')
      .eq('tenant_id', tenant);

    const { data } = await query.single();
    return data || {
      ruc: '20123456789',
      razon_social: 'EMPRESA DEMO SAC',
      direccion_fiscal: 'AV. DEMO 123, LIMA',
    };
  }

  private generarXMLFactura(documento: any): string {
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

  private generarXMLBoleta(documento: any): string {
    // Similar al XML de factura pero con diferencias específicas para boletas
    return this.generarXMLFactura(documento).replace('Invoice', 'Invoice');
  }

  private generarXMLNotaCredito(documento: any): string {
    return this.generarXMLFactura(documento).replace('Invoice', 'CreditNote');
  }

  private generarXMLNotaDebito(documento: any): string {
    return this.generarXMLFactura(documento).replace('Invoice', 'DebitNote');
  }

  private generarHashXML(xmlContent: string): string {
    return require('crypto').createHash('sha256').update(xmlContent, 'utf8').digest('hex');
  }

  private validarRucLocal(ruc: string): string | null {
    const prefijo = ruc.substring(0, 2);
    if (!['10', '15', '17', '20'].includes(prefijo)) {
      return `Prefijo de RUC inválido: ${prefijo}`;
    }
    const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const digitos = ruc.split('').map(Number);
    const suma = factores.reduce((acc, factor, index) => acc + factor * digitos[index], 0);
    const resto = 11 - (suma % 11);
    const digitoVerificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;
    return digitoVerificador === digitos[10]
      ? null
      : 'RUC inválido: dígito verificador no coincide';
  }

  private async registrarAuditoria(documentoId: string, accion: string, usuarioId?: string, detalles?: string, tenantId?: string) {
    const tenant = this.requireTenantId(tenantId);
    await this.supabaseService
      .getClient()
      .from('documento_auditoria')
      .insert({
        documento_id: documentoId,
        tenant_id: tenant,
        accion: accion,
        usuario_id: usuarioId,
        detalles_cambio: detalles,
        timestamp: new Date().toISOString(),
      });
  }

  // ========== MÉTODOS ADICIONALES ==========
  async getSeries(tenantId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      let query = this.supabaseService
        .getClient()
        .from('documento_series')
        .select('*')
        .eq('activo', true)
        .eq('tenant_id', tenant);

      const { data, error } = await query;

      if (error) {
        throw new BadRequestException('Error obteniendo series: ' + error.message);
      }

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      console.error('❌ Error getting series:', error);
      return {
        success: false,
        data: [],
        error: error.message,
      };
    }
  }

  async crearSerie(serieData: any, tenantId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      const nuevaSerie = {
        tenant_id: tenant,
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
        throw new BadRequestException('Error creando serie: ' + error.message);
      }

      return {
        success: true,
        data: data,
        message: 'Serie creada correctamente',
      };
    } catch (error) {
      console.error('❌ Error creating serie:', error);
      return {
        success: false,
        data: null,
        error: error.message,
      };
    }
  }

  async getAuditoria(documentoId: string, tenantId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      let query = this.supabaseService
        .getClient()
        .from('documento_auditoria')
        .select('*')
        .eq('documento_id', documentoId)
        .eq('tenant_id', tenant)
        .order('timestamp', { ascending: false });

      const { data, error } = await query;

      if (error) {
        throw new BadRequestException('Error obteniendo auditoría: ' + error.message);
      }

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      console.error('❌ Error getting auditoria:', error);
      return {
        success: false,
        data: [],
        error: error.message,
      };
    }
  }

  async actualizarDocumento(id: string, documentoData: any, tenantId?: string, userId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      // Verificar que el documento existe y se puede modificar
      const documento = await this.getDocumento(id, tenant);
      if (!documento.success) {
        throw new NotFoundException('Documento no encontrado');
      }

      if (documento.data.estado === 'ENVIADO_SUNAT') {
        throw new BadRequestException('No se puede modificar un documento ya enviado a SUNAT');
      }

      const { error } = await this.supabaseService
        .getClient()
        .from('documentos')
        .update({
          ...documentoData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', tenant);

      if (error) {
        throw new BadRequestException('Error actualizando documento: ' + error.message);
      }

      // Registrar auditoría
      await this.registrarAuditoria(id, 'MODIFICADO', userId, 'Documento actualizado', tenant);

      return {
        success: true,
        data: { id },
        message: 'Documento actualizado correctamente',
      };
    } catch (error) {
      console.error('❌ Error updating documento:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al actualizar el documento');
    }
  }

  async anularDocumento(id: string, motivo: string, tenantId?: string, userId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      const motivoNormalizado = String(motivo || '').trim();
      if (!motivoNormalizado) {
        throw new BadRequestException('El motivo de anulación es obligatorio');
      }
      const documento = await this.getDocumento(id, tenant);
      if (!documento.success) {
        throw new NotFoundException('Documento no encontrado');
      }

      if (documento.data.estado === 'ANULADO') {
        throw new BadRequestException('El documento ya está anulado');
      }

      const cpe = await this.resolveCpeVinculado(documento.data, tenant);
      if (cpe?.id) {
        // Un documento fiscal emitido se anula únicamente mediante el agregado
        // CPE, que genera la nota de crédito y ejecuta los reversos contables,
        // de CxC, inventario, caja y venta. Nunca adelantar el estado local.
        return this.cpeService.anularComprobante(cpe.id, motivoNormalizado, tenant, userId);
      }

      const tipoDocumento = String(documento.data.tipo_documento || '').toUpperCase();
      const estadoDocumento = String(documento.data.estado || '').toUpperCase();
      const esFiscal = ['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO'].includes(tipoDocumento);
      if (esFiscal && estadoDocumento !== 'BORRADOR') {
        throw new ConflictException(
          'No se puede anular el documento fiscal porque no tiene un CPE vinculado. Revise la trazabilidad fiscal antes de continuar.',
        );
      }

      const { error } = await this.supabaseService
        .getClient()
        .from('documentos')
        .update({
          estado: 'ANULADO',
          motivo_anulacion: motivoNormalizado,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', tenant);

      if (error) {
        throw new BadRequestException('Error anulando documento: ' + error.message);
      }

      // Registrar auditoría
      await this.registrarAuditoria(id, 'ANULADO', userId, `Documento anulado: ${motivoNormalizado}`, tenant);

      return {
        success: true,
        data: { id },
        message: 'Documento anulado correctamente',
      };
    } catch (error) {
      console.error('❌ Error anulando documento:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new BadRequestException('Error al anular el documento');
    }
  }

  private async resolveCpeVinculado(documento: any, tenantId: string): Promise<{ id: string } | null> {
    const client = this.supabaseService.getClient();
    const { data: directo, error: directoError } = await client
      .from('cpe')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('documento_id', documento.id)
      .maybeSingle();

    if (directoError && directoError.code !== 'PGRST116') {
      throw new BadRequestException(`No se pudo resolver el CPE vinculado: ${directoError.message}`);
    }
    if (directo?.id) return directo;

    const numero = Number(documento.numero);
    if (!documento.serie || !Number.isFinite(numero)) return null;

    const { data: candidatos, error: candidatosError } = await client
      .from('cpe')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('serie', documento.serie)
      .eq('numero', numero)
      .limit(2);

    if (candidatosError) {
      throw new BadRequestException(`No se pudo resolver el CPE por numeración fiscal: ${candidatosError.message}`);
    }
    if ((candidatos?.length ?? 0) > 1) {
      throw new ConflictException(
        `La numeración ${documento.serie}-${documento.numero} está vinculada a más de un CPE.`,
      );
    }

    return candidatos?.[0] ?? null;
  }

  async generarPDF(id: string, tenantId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      const documento = await this.getDocumento(id, tenant);
      if (!documento.success) {
        throw new NotFoundException('Documento no encontrado');
      }

      const { data: cpe, error: cpeError } = await this.supabaseService
        .getClient()
        .from('cpe')
        .select('id')
        .eq('documento_id', id)
        .eq('tenant_id', tenant)
        .maybeSingle();

      if (cpeError) {
        throw new BadRequestException(`No se pudo buscar el CPE asociado: ${cpeError.message}`);
      }

      if (!cpe?.id) {
        throw new BadRequestException('El PDF legacy esta deshabilitado. Genere primero el CPE asociado y use /api/cpe/comprobantes/:id/pdf.');
      }

      // Registrar auditoría
      await this.registrarAuditoria(id, 'DESCARGADO', null, `PDF CPE solicitado: ${cpe.id}`, tenant);

      return {
        success: true,
        data: {
          cpe_id: cpe.id,
          pdf_endpoint: `/api/cpe/comprobantes/${cpe.id}/pdf`,
        },
        message: 'Use el endpoint PDF del CPE asociado',
      };
    } catch (error) {
      console.error('❌ Error generando PDF:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Error al generar el PDF');
    }
  }

  async descargarXML(id: string, tenantId?: string) {
    try {
      const tenant = this.requireTenantId(tenantId);
      const documento = await this.getDocumento(id, tenant);
      if (!documento.success) {
        throw new NotFoundException('Documento no encontrado');
      }

      if (!documento.data.xml_content) {
        throw new BadRequestException('El documento no tiene XML generado');
      }

      // Registrar auditoría
      await this.registrarAuditoria(id, 'DESCARGADO', null, 'XML descargado', tenant);

      return {
        success: true,
        data: documento.data.xml_content,
        message: 'XML descargado correctamente',
      };
    } catch (error) {
      console.error('❌ Error descargando XML:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al descargar el XML');
    }
  }
} 
