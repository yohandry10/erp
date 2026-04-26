import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { OseService } from '../ose/ose.service';
import { XmlSigner } from '@erp-suite/crypto';
import { ConfigService } from '@nestjs/config';

export interface ComunicacionBajaDto {
  comprobantesIds: string[];
  motivoBaja: string;
  fechaComunicacion?: string;
}

export interface ResumenDiarioDto {
  fechaReferencia: string; // Fecha de las boletas
  comprobantesIds: string[];
}

@Injectable()
export class ComunicacionBajaService {
  private readonly logger = new Logger(ComunicacionBajaService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly oseService: OseService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Crear comunicación de baja (RA-) para facturas
   * NOTA: Comunicación de Baja es específica de SUNAT Perú
   */
  async crearComunicacionBaja(
    dto: ComunicacionBajaDto,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    const client = this.supabaseService.getClient();

    try {
      this.logger.log(`📄 [RA] Creando comunicación de baja para ${dto.comprobantesIds.length} comprobantes`);

      // VALIDACIÓN: Comunicación de Baja es exclusiva de Perú (SUNAT)
      const { data: empresaConfig } = await client
        .from('empresa_config')
        .select('pais_id')
        .eq('tenant_id', tenantId)
        .single();

      if (empresaConfig?.pais_id) {
        const { data: pais } = await client
          .from('paises')
          .select('codigo_iso, nombre')
          .eq('id', empresaConfig.pais_id)
          .single();

        if (pais && pais.codigo_iso !== 'PE') {
          this.logger.error(`❌ [RA] Intento de crear Comunicación de Baja para país ${pais.nombre} (${pais.codigo_iso})`);
          throw new BadRequestException({
            message: `La Comunicación de Baja (RA-) es exclusiva de SUNAT Perú. Su empresa está configurada para ${pais.nombre}. Para anular documentos en ${pais.nombre}, use Notas de Crédito.`,
            code: 'COMUNICACION_BAJA_NOT_AVAILABLE',
            country: pais.nombre,
            alternative: 'Usar Nota de Crédito para anular documentos',
          });
        }
      }

      // 1. Validar que todos los comprobantes existan y sean facturas
      const { data: comprobantes, error: cpeError } = await client
        .from('cpe')
        .select('*')
        .in('id', dto.comprobantesIds)
        .eq('tenant_id', tenantId);

      if (cpeError || !comprobantes || comprobantes.length === 0) {
        throw new BadRequestException('No se encontraron los comprobantes especificados');
      }

      // Validar que sean facturas (tipo 01)
      const noFacturas = comprobantes.filter(c => c.tipo_documento !== '01');
      if (noFacturas.length > 0) {
        throw new BadRequestException(
          'Solo se pueden dar de baja facturas (tipo 01). Use resumen diario para boletas.',
        );
      }

      // 2. Generar número de comunicación
      const fechaComunicacion = dto.fechaComunicacion || new Date().toISOString().split('T')[0];
      const numeroComunicacion = await this.generarNumeroComunicacion(tenantId, fechaComunicacion);

      // 3. Crear registro de comunicación de baja
      const { data: comunicacion, error: insertError } = await client
        .from('comunicaciones_baja')
        .insert({
          tenant_id: tenantId,
          numero_comunicacion: numeroComunicacion,
          fecha_generacion: new Date().toISOString().split('T')[0],
          fecha_comunicacion: fechaComunicacion,
          comprobantes_ids: dto.comprobantesIds,
          cantidad_comprobantes: dto.comprobantesIds.length,
          estado: 'PENDIENTE',
          generado_por: userId,
        })
        .select()
        .single();

      if (insertError) {
        throw new BadRequestException(`Error creando comunicación de baja: ${insertError.message}`);
      }

      // 4. Crear detalle de comprobantes
      const detalles = comprobantes.map(cpe => ({
        comunicacion_id: comunicacion.id,
        cpe_id: cpe.id,
        tipo_documento: cpe.tipo_documento,
        serie: cpe.serie,
        numero: cpe.numero,
        motivo_baja: dto.motivoBaja,
      }));

      await client.from('detalle_comunicacion_baja').insert(detalles);

      // 5. Generar XML
      const xmlGenerado = await this.generarXmlComunicacionBaja(comunicacion, comprobantes, dto.motivoBaja, tenantId);

      // 6. Firmar XML
      const xmlFirmado = await this.firmarXml(xmlGenerado, tenantId);
      const hash = this.generarHash(xmlFirmado);

      // 7. Actualizar con XML firmado
      await client
        .from('comunicaciones_baja')
        .update({
          xml_generado: xmlGenerado,
          xml_firmado: xmlFirmado,
          hash_xml: hash,
          estado: 'GENERADO',
        })
        .eq('id', comunicacion.id);

      this.logger.log(`✅ [RA] Comunicación de baja ${numeroComunicacion} creada exitosamente`);

      return {
        success: true,
        data: {
          id: comunicacion.id,
          numero: numeroComunicacion,
          estado: 'GENERADO',
          cantidad_comprobantes: dto.comprobantesIds.length,
        },
      };
    } catch (error) {
      this.logger.error(`❌ [RA] Error creando comunicación de baja:`, error);
      throw error;
    }
  }

  /**
   * Enviar comunicación de baja a SUNAT
   */
  async enviarComunicacionBaja(comunicacionId: string, tenantId: string, userId?: string): Promise<any> {
    const client = this.supabaseService.getClient();

    try {
      this.logger.log(`📤 [RA] Enviando comunicación de baja ${comunicacionId} a SUNAT`);

      // 1. Obtener comunicación
      const { data: comunicacion, error } = await client
        .from('comunicaciones_baja')
        .select('*')
        .eq('id', comunicacionId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !comunicacion) {
        throw new BadRequestException('Comunicación de baja no encontrada');
      }

      if (comunicacion.estado !== 'GENERADO') {
        throw new BadRequestException(`La comunicación debe estar en estado GENERADO. Estado actual: ${comunicacion.estado}`);
      }

      // 2. Actualizar estado a ENVIADO
      await client
        .from('comunicaciones_baja')
        .update({
          estado: 'ENVIADO',
          fecha_envio: new Date().toISOString(),
          enviado_por: userId,
        })
        .eq('id', comunicacionId);

      // 3. Enviar a SUNAT
      const fileName = `${comunicacion.numero_comunicacion}`;
      const response = await this.oseService.enviarCpe(comunicacion.xml_firmado, fileName);

      // 4. Procesar respuesta
      if (response.success) {
        // Si retorna ticket, guardar para consulta posterior
        if (response.ticket) {
          await client
            .from('comunicaciones_baja')
            .update({
              ticket_sunat: response.ticket,
              codigo_respuesta: response.codigoRespuesta,
              descripcion_respuesta: response.descripcionRespuesta,
            })
            .eq('id', comunicacionId);

          this.logger.log(`✅ [RA] Comunicación enviada. Ticket: ${response.ticket}`);

          return {
            success: true,
            message: 'Comunicación de baja enviada. Use el ticket para consultar el estado.',
            ticket: response.ticket,
          };
        } else {
          // Respuesta inmediata
          await client
            .from('comunicaciones_baja')
            .update({
              estado: 'ACEPTADO',
              codigo_respuesta: response.codigoRespuesta,
              descripcion_respuesta: response.descripcionRespuesta,
              cdr_sunat: response.cdr,
              fecha_respuesta: new Date().toISOString(),
            })
            .eq('id', comunicacionId);

          // Actualizar estado de comprobantes
          await this.actualizarEstadoComprobantes(comunicacion.comprobantes_ids, 'ANULADO', tenantId);

          this.logger.log(`✅ [RA] Comunicación aceptada por SUNAT`);

          return {
            success: true,
            message: 'Comunicación de baja aceptada por SUNAT',
          };
        }
      } else {
        // Error de SUNAT
        await client
          .from('comunicaciones_baja')
          .update({
            estado: 'RECHAZADO',
            codigo_respuesta: response.codigoRespuesta,
            descripcion_respuesta: response.descripcionRespuesta,
            fecha_respuesta: new Date().toISOString(),
          })
          .eq('id', comunicacionId);

        throw new BadRequestException(`SUNAT rechazó la comunicación: ${response.descripcionRespuesta}`);
      }
    } catch (error) {
      this.logger.error(`❌ [RA] Error enviando comunicación de baja:`, error);
      throw error;
    }
  }

  /**
   * Consultar estado de comunicación de baja con ticket
   */
  async consultarEstadoComunicacion(comunicacionId: string, tenantId: string): Promise<any> {
    const client = this.supabaseService.getClient();

    try {
      // 1. Obtener comunicación
      const { data: comunicacion, error } = await client
        .from('comunicaciones_baja')
        .select('*')
        .eq('id', comunicacionId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !comunicacion) {
        throw new BadRequestException('Comunicación de baja no encontrada');
      }

      if (!comunicacion.ticket_sunat) {
        throw new BadRequestException('Esta comunicación no tiene ticket de SUNAT');
      }

      this.logger.log(`🔍 [RA] Consultando estado con ticket: ${comunicacion.ticket_sunat}`);

      // 2. Consultar en SUNAT
      const response = await this.oseService.consultarTicket(comunicacion.ticket_sunat);

      // 3. Actualizar estado según respuesta
      if (response.success) {
        await client
          .from('comunicaciones_baja')
          .update({
            estado: 'ACEPTADO',
            codigo_respuesta: response.codigoRespuesta,
            descripcion_respuesta: response.descripcionRespuesta,
            cdr_sunat: response.cdr,
            fecha_respuesta: new Date().toISOString(),
          })
          .eq('id', comunicacionId);

        // Actualizar estado de comprobantes
        await this.actualizarEstadoComprobantes(comunicacion.comprobantes_ids, 'ANULADO', tenantId);

        return {
          success: true,
          estado: 'ACEPTADO',
          message: 'Comunicación de baja aceptada por SUNAT',
        };
      } else {
        await client
          .from('comunicaciones_baja')
          .update({
            estado: 'RECHAZADO',
            codigo_respuesta: response.codigoRespuesta,
            descripcion_respuesta: response.descripcionRespuesta,
            fecha_respuesta: new Date().toISOString(),
          })
          .eq('id', comunicacionId);

        return {
          success: false,
          estado: 'RECHAZADO',
          message: response.descripcionRespuesta,
        };
      }
    } catch (error) {
      this.logger.error(`❌ [RA] Error consultando estado:`, error);
      throw error;
    }
  }

  /**
   * Crear resumen diario (RC-) para boletas
   * NOTA: Resumen Diario es específico de SUNAT Perú
   */
  async crearResumenDiario(dto: ResumenDiarioDto, tenantId: string, userId?: string): Promise<any> {
    const client = this.supabaseService.getClient();

    try {
      this.logger.log(`📄 [RC] Creando resumen diario para ${dto.comprobantesIds.length} boletas`);

      // VALIDACIÓN: Resumen Diario es exclusivo de Perú (SUNAT)
      const { data: empresaConfig } = await client
        .from('empresa_config')
        .select('pais_id')
        .eq('tenant_id', tenantId)
        .single();

      if (empresaConfig?.pais_id) {
        const { data: pais } = await client
          .from('paises')
          .select('codigo_iso, nombre')
          .eq('id', empresaConfig.pais_id)
          .single();

        if (pais && pais.codigo_iso !== 'PE') {
          this.logger.error(`❌ [RC] Intento de crear Resumen Diario para país ${pais.nombre} (${pais.codigo_iso})`);
          throw new BadRequestException({
            message: `El Resumen Diario (RC-) es exclusivo de SUNAT Perú. Su empresa está configurada para ${pais.nombre}. En ${pais.nombre}, las boletas se envían individualmente a DIAN.`,
            code: 'RESUMEN_DIARIO_NOT_AVAILABLE',
            country: pais.nombre,
            alternative: 'Enviar cada boleta individualmente',
          });
        }
      }

      // 1. Validar que todos los comprobantes existan y sean boletas
      const { data: comprobantes, error: cpeError } = await client
        .from('cpe')
        .select('*')
        .in('id', dto.comprobantesIds)
        .eq('tenant_id', tenantId);

      if (cpeError || !comprobantes || comprobantes.length === 0) {
        throw new BadRequestException('No se encontraron los comprobantes especificados');
      }

      // Validar que sean boletas (tipo 03)
      const noBoletas = comprobantes.filter(c => c.tipo_documento !== '03');
      if (noBoletas.length > 0) {
        throw new BadRequestException(
          'Solo se pueden incluir boletas (tipo 03) en resumen diario. Use comunicación de baja para facturas.',
        );
      }

      // 2. Calcular totales
      const totales = comprobantes.reduce(
        (acc, cpe) => ({
          gravadas: acc.gravadas + (cpe.total_gravadas || 0),
          exoneradas: acc.exoneradas + (cpe.total_exoneradas || 0),
          inafectas: acc.inafectas + (cpe.total_inafectas || 0),
          igv: acc.igv + (cpe.total_igv || 0),
          total: acc.total + (cpe.total_venta || 0),
        }),
        { gravadas: 0, exoneradas: 0, inafectas: 0, igv: 0, total: 0 },
      );

      // 3. Generar número de resumen
      const fechaGeneracion = new Date().toISOString().split('T')[0];
      const numeroResumen = await this.generarNumeroResumen(tenantId, fechaGeneracion);

      // 4. Crear registro de resumen diario
      const { data: resumen, error: insertError } = await client
        .from('resumenes_diarios')
        .insert({
          tenant_id: tenantId,
          numero_resumen: numeroResumen,
          fecha_generacion: fechaGeneracion,
          fecha_referencia: dto.fechaReferencia,
          comprobantes_ids: dto.comprobantesIds,
          cantidad_comprobantes: dto.comprobantesIds.length,
          total_gravadas: totales.gravadas,
          total_exoneradas: totales.exoneradas,
          total_inafectas: totales.inafectas,
          total_igv: totales.igv,
          total_general: totales.total,
          estado: 'PENDIENTE',
          generado_por: userId,
        })
        .select()
        .single();

      if (insertError) {
        throw new BadRequestException(`Error creando resumen diario: ${insertError.message}`);
      }

      // 5. Crear detalle de comprobantes
      const detalles = comprobantes.map(cpe => ({
        resumen_id: resumen.id,
        cpe_id: cpe.id,
        tipo_documento: cpe.tipo_documento,
        serie: cpe.serie,
        numero: cpe.numero,
        tipo_operacion: '3', // 3 = Anular
        total_gravadas: cpe.total_gravadas || 0,
        total_exoneradas: cpe.total_exoneradas || 0,
        total_inafectas: cpe.total_inafectas || 0,
        total_igv: cpe.total_igv || 0,
        total: cpe.total_venta || 0,
      }));

      await client.from('detalle_resumen_diario').insert(detalles);

      // 6. Generar XML
      const xmlGenerado = await this.generarXmlResumenDiario(resumen, comprobantes, tenantId);

      // 7. Firmar XML
      const xmlFirmado = await this.firmarXml(xmlGenerado, tenantId);
      const hash = this.generarHash(xmlFirmado);

      // 8. Actualizar con XML firmado
      await client
        .from('resumenes_diarios')
        .update({
          xml_generado: xmlGenerado,
          xml_firmado: xmlFirmado,
          hash_xml: hash,
          estado: 'GENERADO',
        })
        .eq('id', resumen.id);

      this.logger.log(`✅ [RC] Resumen diario ${numeroResumen} creado exitosamente`);

      return {
        success: true,
        data: {
          id: resumen.id,
          numero: numeroResumen,
          estado: 'GENERADO',
          cantidad_comprobantes: dto.comprobantesIds.length,
          total: totales.total,
        },
      };
    } catch (error) {
      this.logger.error(`❌ [RC] Error creando resumen diario:`, error);
      throw error;
    }
  }

  // Métodos privados auxiliares

  private async generarNumeroComunicacion(tenantId: string, fecha: string): Promise<string> {
    const { data } = await this.supabaseService.getClient().rpc('generar_numero_comunicacion_baja', {
      p_tenant_id: tenantId,
      p_fecha: fecha,
    });
    return data;
  }

  private async generarNumeroResumen(tenantId: string, fecha: string): Promise<string> {
    const { data } = await this.supabaseService.getClient().rpc('generar_numero_resumen_diario', {
      p_tenant_id: tenantId,
      p_fecha: fecha,
    });
    return data;
  }

  private async generarXmlComunicacionBaja(comunicacion: any, comprobantes: any[], motivo: string, tenantId: string): Promise<string> {
    // Implementar generación de XML según formato SUNAT para RA-
    // Por ahora retornamos un XML básico
    return `<?xml version="1.0" encoding="UTF-8"?>
<VoidedDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1">
  <ID>${comunicacion.numero_comunicacion}</ID>
  <IssueDate>${comunicacion.fecha_generacion}</IssueDate>
  <ReferenceDate>${comunicacion.fecha_comunicacion}</ReferenceDate>
  <!-- Detalles de comprobantes -->
</VoidedDocuments>`;
  }

  private async generarXmlResumenDiario(resumen: any, comprobantes: any[], tenantId: string): Promise<string> {
    // Implementar generación de XML según formato SUNAT para RC-
    return `<?xml version="1.0" encoding="UTF-8"?>
<SummaryDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1">
  <ID>${resumen.numero_resumen}</ID>
  <IssueDate>${resumen.fecha_generacion}</IssueDate>
  <ReferenceDate>${resumen.fecha_referencia}</ReferenceDate>
  <!-- Detalles de comprobantes -->
</SummaryDocuments>`;
  }

  private async firmarXml(xml: string, tenantId: string): Promise<string> {
    // Reutilizar lógica de firma de CPE
    const xmlSigner = await this.getXmlSigner(tenantId);
    return xmlSigner.signXml(xml);
  }

  private async getXmlSigner(tenantId: string): Promise<XmlSigner> {
    const { data: empresa } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('certificado_pfx, certificado_password')
      .eq('tenant_id', tenantId)
      .single();

    if (empresa && empresa.certificado_pfx) {
      return new XmlSigner({
        pfxBuffer: empresa.certificado_pfx,
        pfxPassword: empresa.certificado_password || '',
      });
    }

    return new XmlSigner({
      pfxPath: this.configService.get('PFX_PATH') || '/tmp/demo.pfx',
      pfxPassword: this.configService.get('PFX_PASS') || 'demo123',
    });
  }

  private generarHash(xml: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(xml).digest('hex');
  }

  private async actualizarEstadoComprobantes(ids: string[], estado: string, tenantId: string): Promise<void> {
    await this.supabaseService
      .getClient()
      .from('cpe')
      .update({ estado, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('tenant_id', tenantId);
  }
}
