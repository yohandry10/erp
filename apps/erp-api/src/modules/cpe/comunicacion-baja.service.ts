import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { OseService } from '../ose/ose.service';
import { SigningOptions, XmlSigner } from '@erp-suite/crypto';
import { ConfigService } from '@nestjs/config';
import { decryptBuffer, decryptText } from '../../shared/utils/secure-config.utils';

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

      // 3. Enviar a SUNAT con sendSummary: RA/RC no se envian con sendBill.
      const fileName = await this.buildSunatSummaryFileName(tenantId, comunicacion.numero_comunicacion);
      const response = await this.oseService.enviarResumen(comunicacion.xml_firmado, fileName, { tenantId });

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
        if (this.isNonDefinitiveSunatResponse(response)) {
          await client
            .from('comunicaciones_baja')
            .update({
              estado: 'GENERADO',
              codigo_respuesta: response.codigoRespuesta,
              descripcion_respuesta: response.descripcionRespuesta,
              fecha_respuesta: new Date().toISOString(),
            })
            .eq('id', comunicacionId);

          throw new BadRequestException(`SUNAT no confirmó la comunicación: ${response.descripcionRespuesta}`);
        }

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
      const response = await this.oseService.consultarTicket(comunicacion.ticket_sunat, { tenantId });

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
        if (this.isNonDefinitiveSunatResponse(response)) {
          await client
            .from('comunicaciones_baja')
            .update({
              codigo_respuesta: response.codigoRespuesta,
              descripcion_respuesta: response.descripcionRespuesta,
              fecha_respuesta: new Date().toISOString(),
            })
            .eq('id', comunicacionId);

          return {
            success: false,
            estado: comunicacion.estado || 'ENVIADO',
            message: `Consulta SUNAT no concluyente: ${response.descripcionRespuesta}`,
          };
        }

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
   * Enviar resumen diario a SUNAT.
   */
  async enviarResumenDiario(resumenId: string, tenantId: string, userId?: string): Promise<any> {
    const client = this.supabaseService.getClient();

    try {
      this.logger.log(`📤 [RC] Enviando resumen diario ${resumenId} a SUNAT`);

      const { data: resumen, error } = await client
        .from('resumenes_diarios')
        .select('*')
        .eq('id', resumenId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !resumen) {
        throw new BadRequestException('Resumen diario no encontrado');
      }

      if (resumen.estado !== 'GENERADO') {
        throw new BadRequestException(`El resumen debe estar en estado GENERADO. Estado actual: ${resumen.estado}`);
      }

      await client
        .from('resumenes_diarios')
        .update({
          estado: 'ENVIADO',
          fecha_envio: new Date().toISOString(),
          enviado_por: userId,
        })
        .eq('id', resumenId);

      const fileName = await this.buildSunatSummaryFileName(tenantId, resumen.numero_resumen);
      const response = await this.oseService.enviarResumen(resumen.xml_firmado, fileName, { tenantId });

      if (response.success) {
        if (response.ticket) {
          await client
            .from('resumenes_diarios')
            .update({
              ticket_sunat: response.ticket,
              codigo_respuesta: response.codigoRespuesta,
              descripcion_respuesta: response.descripcionRespuesta,
            })
            .eq('id', resumenId);

          return {
            success: true,
            message: 'Resumen diario enviado. Use el ticket para consultar el estado.',
            ticket: response.ticket,
          };
        }

        await client
          .from('resumenes_diarios')
          .update({
            estado: 'ACEPTADO',
            codigo_respuesta: response.codigoRespuesta,
            descripcion_respuesta: response.descripcionRespuesta,
            cdr_sunat: response.cdr,
            fecha_respuesta: new Date().toISOString(),
          })
          .eq('id', resumenId);

        await this.actualizarEstadoComprobantes(resumen.comprobantes_ids, 'ANULADO', tenantId);

        return {
          success: true,
          message: 'Resumen diario aceptado por SUNAT',
        };
      }

      if (this.isNonDefinitiveSunatResponse(response)) {
        await client
          .from('resumenes_diarios')
          .update({
            estado: 'GENERADO',
            codigo_respuesta: response.codigoRespuesta,
            descripcion_respuesta: response.descripcionRespuesta,
            fecha_respuesta: new Date().toISOString(),
          })
          .eq('id', resumenId);

        throw new BadRequestException(`SUNAT no confirmó el resumen diario: ${response.descripcionRespuesta}`);
      }

      await client
        .from('resumenes_diarios')
        .update({
          estado: 'RECHAZADO',
          codigo_respuesta: response.codigoRespuesta,
          descripcion_respuesta: response.descripcionRespuesta,
          fecha_respuesta: new Date().toISOString(),
        })
        .eq('id', resumenId);

      throw new BadRequestException(`SUNAT rechazó el resumen diario: ${response.descripcionRespuesta}`);
    } catch (error) {
      this.logger.error(`❌ [RC] Error enviando resumen diario:`, error);
      throw error;
    }
  }

  /**
   * Consultar estado de resumen diario con ticket.
   */
  async consultarEstadoResumen(resumenId: string, tenantId: string): Promise<any> {
    const client = this.supabaseService.getClient();

    try {
      const { data: resumen, error } = await client
        .from('resumenes_diarios')
        .select('*')
        .eq('id', resumenId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !resumen) {
        throw new BadRequestException('Resumen diario no encontrado');
      }

      if (!resumen.ticket_sunat) {
        throw new BadRequestException('Este resumen diario no tiene ticket de SUNAT');
      }

      const response = await this.oseService.consultarTicket(resumen.ticket_sunat, { tenantId });

      if (response.success) {
        await client
          .from('resumenes_diarios')
          .update({
            estado: 'ACEPTADO',
            codigo_respuesta: response.codigoRespuesta,
            descripcion_respuesta: response.descripcionRespuesta,
            cdr_sunat: response.cdr,
            fecha_respuesta: new Date().toISOString(),
          })
          .eq('id', resumenId);

        await this.actualizarEstadoComprobantes(resumen.comprobantes_ids, 'ANULADO', tenantId);

        return {
          success: true,
          estado: 'ACEPTADO',
          message: 'Resumen diario aceptado por SUNAT',
        };
      }

      if (this.isNonDefinitiveSunatResponse(response)) {
        await client
          .from('resumenes_diarios')
          .update({
            codigo_respuesta: response.codigoRespuesta,
            descripcion_respuesta: response.descripcionRespuesta,
            fecha_respuesta: new Date().toISOString(),
          })
          .eq('id', resumenId);

        return {
          success: false,
          estado: resumen.estado || 'ENVIADO',
          message: `Consulta SUNAT no concluyente: ${response.descripcionRespuesta}`,
        };
      }

      await client
        .from('resumenes_diarios')
        .update({
          estado: 'RECHAZADO',
          codigo_respuesta: response.codigoRespuesta,
          descripcion_respuesta: response.descripcionRespuesta,
          fecha_respuesta: new Date().toISOString(),
        })
        .eq('id', resumenId);

      return {
        success: false,
        estado: 'RECHAZADO',
        message: response.descripcionRespuesta,
      };
    } catch (error) {
      this.logger.error(`❌ [RC] Error consultando estado de resumen diario:`, error);
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
    const empresa = await this.getEmpresaFiscalInfo(tenantId);
    const lines = comprobantes
      .map((cpe, index) => `  <sac:VoidedDocumentsLine>
    <cbc:LineID>${index + 1}</cbc:LineID>
    <cbc:DocumentTypeCode>${this.escapeXmlText(cpe.tipo_documento || '01')}</cbc:DocumentTypeCode>
    <sac:DocumentSerialID>${this.escapeXmlText(cpe.serie)}</sac:DocumentSerialID>
    <sac:DocumentNumberID>${this.escapeXmlText(this.formatCorrelativoSunat(cpe.numero))}</sac:DocumentNumberID>
    <sac:VoidReasonDescription>${this.wrapCdata(this.limitText(motivo, 100))}</sac:VoidReasonDescription>
  </sac:VoidedDocumentsLine>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<VoidedDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1"
                 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
                 xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
                 xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
                 xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.0</cbc:CustomizationID>
  <cbc:ID>${this.escapeXmlText(comunicacion.numero_comunicacion)}</cbc:ID>
  <cbc:ReferenceDate>${this.escapeXmlText(comunicacion.fecha_comunicacion)}</cbc:ReferenceDate>
  <cbc:IssueDate>${this.escapeXmlText(comunicacion.fecha_generacion)}</cbc:IssueDate>
  ${this.buildSignatureXml(empresa)}
  ${this.buildAccountingSupplierPartyXml(empresa)}
${lines}
</VoidedDocuments>`;
  }

  private async generarXmlResumenDiario(resumen: any, comprobantes: any[], tenantId: string): Promise<string> {
    const empresa = await this.getEmpresaFiscalInfo(tenantId);
    const lines = comprobantes
      .map((cpe, index) => this.buildSummaryDocumentLineXml(cpe, index))
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<SummaryDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1"
                  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
                  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
                  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
                  xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.1</cbc:CustomizationID>
  <cbc:ID>${this.escapeXmlText(resumen.numero_resumen)}</cbc:ID>
  <cbc:ReferenceDate>${this.escapeXmlText(resumen.fecha_referencia)}</cbc:ReferenceDate>
  <cbc:IssueDate>${this.escapeXmlText(resumen.fecha_generacion)}</cbc:IssueDate>
  ${this.buildSignatureXml(empresa)}
  ${this.buildAccountingSupplierPartyXml(empresa)}
${lines}
</SummaryDocuments>`;
  }

  private buildSummaryDocumentLineXml(cpe: any, index: number): string {
    const moneda = this.escapeXmlText(cpe.moneda || 'PEN');
    const gravadas = this.toNumber(cpe.total_gravadas, 0);
    const exoneradas = this.toNumber(cpe.total_exoneradas, 0);
    const inafectas = this.toNumber(cpe.total_inafectas, 0);
    const igv = this.toNumber(cpe.total_igv, 0);
    const total = this.toNumber(cpe.total_venta, 0);
    const billingPayments = [
      gravadas > 0 ? this.buildBillingPaymentXml(moneda, gravadas, '01') : '',
      exoneradas > 0 ? this.buildBillingPaymentXml(moneda, exoneradas, '02') : '',
      inafectas > 0 ? this.buildBillingPaymentXml(moneda, inafectas, '03') : '',
    ].filter(Boolean).join('\n');

    return `  <sac:SummaryDocumentsLine>
    <cbc:LineID>${index + 1}</cbc:LineID>
    <cbc:DocumentTypeCode>${this.escapeXmlText(cpe.tipo_documento || '03')}</cbc:DocumentTypeCode>
    <cbc:ID>${this.escapeXmlText(cpe.serie)}-${this.escapeXmlText(this.formatCorrelativoSunat(cpe.numero))}</cbc:ID>
    <cac:AccountingCustomerParty>
      <cbc:CustomerAssignedAccountID>${this.escapeXmlText(cpe.documento_receptor || '00000000')}</cbc:CustomerAssignedAccountID>
      <cbc:AdditionalAccountID>${this.escapeXmlText(cpe.tipo_documento_receptor || '1')}</cbc:AdditionalAccountID>
    </cac:AccountingCustomerParty>
    <cac:Status>
      <cbc:ConditionCode>${this.escapeXmlText(String(cpe.tipo_operacion_resumen ?? cpe.tipo_operacion ?? '3'))}</cbc:ConditionCode>
    </cac:Status>
    <sac:TotalAmount currencyID="${moneda}">${this.formatAmount(total)}</sac:TotalAmount>
${billingPayments}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${this.formatAmount(igv)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="${moneda}">${this.formatAmount(igv)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID schemeID="UN/ECE 5153" schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT">1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
  </sac:SummaryDocumentsLine>`;
  }

  private buildBillingPaymentXml(moneda: string, amount: number, instructionId: string): string {
    return `    <sac:BillingPayment>
      <cbc:PaidAmount currencyID="${moneda}">${this.formatAmount(amount)}</cbc:PaidAmount>
      <cbc:InstructionID>${instructionId}</cbc:InstructionID>
    </sac:BillingPayment>`;
  }

  private buildSignatureXml(empresa: { ruc: string; razonSocial: string }): string {
    return `<cac:Signature>
    <cbc:ID>IDSignSP</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${this.escapeXmlText(empresa.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.wrapCdata(empresa.razonSocial)}</cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureSP</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>`;
  }

  private buildAccountingSupplierPartyXml(empresa: { ruc: string; razonSocial: string }): string {
    return `<cac:AccountingSupplierParty>
    <cbc:CustomerAssignedAccountID>${this.escapeXmlText(empresa.ruc)}</cbc:CustomerAssignedAccountID>
    <cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.wrapCdata(empresa.razonSocial)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
  }

  private async buildSunatSummaryFileName(tenantId: string, summaryId: string): Promise<string> {
    const empresa = await this.getEmpresaFiscalInfo(tenantId);
    const cleanSummaryId = String(summaryId || '').trim();
    return cleanSummaryId.startsWith(`${empresa.ruc}-`) ? cleanSummaryId : `${empresa.ruc}-${cleanSummaryId}`;
  }

  private async getEmpresaFiscalInfo(tenantId: string): Promise<{ ruc: string; razonSocial: string }> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('ruc, razon_social')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`No se pudo leer la configuracion fiscal de la empresa: ${error.message}`);
    }

    const ruc = String(data?.ruc ?? this.configService.get<string>('EMPRESA_RUC') ?? '').replace(/\D/g, '');
    const razonSocial = String(data?.razon_social ?? this.configService.get<string>('EMPRESA_RAZON_SOCIAL') ?? '').trim();

    if (!/^\d{11}$/.test(ruc) || !razonSocial) {
      throw new BadRequestException('RA/RC requiere RUC y razon social reales en empresa_config');
    }

    return { ruc, razonSocial };
  }

  private isNonDefinitiveSunatResponse(response: { codigoRespuesta?: string; descripcionRespuesta?: string }): boolean {
    const code = String(response.codigoRespuesta ?? '').trim().toUpperCase();
    const description = String(response.descripcionRespuesta ?? '').toLowerCase();

    if (['98', '99', '97', 'CB_OPEN', '0127'].includes(code)) {
      return true;
    }

    return [
      'timeout',
      'connection',
      'network',
      'temporal',
      'temporalmente',
      'servicio no disponible',
      'unavailable',
      'convert http produced invalid xml',
      'incomplete markup',
      'el ticket no existe',
      'respuesta de sunat no reconocida',
      'error técnico',
      'error tecnico',
    ].some((keyword) => description.includes(keyword));
  }

  private formatCorrelativoSunat(value: any): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '0';
    return raw.replace(/^0+(?=\d)/, '');
  }

  private toNumber(value: any, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  private formatAmount(value: any): string {
    return this.toNumber(value, 0).toFixed(2);
  }

  private limitText(value: any, maxLength: number): string {
    return String(value ?? '').trim().slice(0, maxLength);
  }

  private escapeXmlText(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private wrapCdata(value: any): string {
    return `<![CDATA[${String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
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
      .select('ruc, certificado_pfx, certificado_password, sunat_environment, sunat_cert_expected_ruc, sunat_cert_ruc_mismatch_confirmed')
      .eq('tenant_id', tenantId)
      .single();
    if (empresa && empresa.certificado_pfx) {
      return new XmlSigner({
        pfxBuffer: decryptBuffer(this.configService, empresa.certificado_pfx) || empresa.certificado_pfx,
        pfxPassword: decryptText(this.configService, empresa.certificado_password) || '',
        ...this.getCertificateRucGuardOptions(empresa),
      });
    }

    const pfxPath = this.configService.get<string>('PFX_PATH');
    const pfxPassword = this.configService.get<string>('PFX_PASS');

    if (!pfxPath || !pfxPassword) {
      throw new BadRequestException(
        `No hay configuración de certificado fiscal para el tenant ${tenantId}. Configure PFX_PATH y PFX_PASS para fallback global o cargue el certificado del tenant.`,
      );
    }

    return new XmlSigner({
      pfxPath,
      pfxPassword,
      ...this.getCertificateRucGuardOptions(),
    });
  }

  private getCertificateRucGuardOptions(empresa?: any): Partial<SigningOptions> {
    const sunatEnvironment = empresa?.sunat_environment || this.configService.get<string>('SUNAT_ENVIRONMENT', 'homologacion');
    const mismatchConfirmed =
      empresa?.sunat_cert_ruc_mismatch_confirmed === true ||
      this.configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === true ||
      this.configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === 'true';

    return {
      expectedRuc:
        empresa?.sunat_cert_expected_ruc ||
        empresa?.ruc ||
        this.configService.get<string>('SUNAT_CERT_EXPECTED_RUC') ||
        this.configService.get<string>('EMPRESA_RUC'),
      enforceRucInCertificate: sunatEnvironment === 'produccion',
      allowRucMismatchWithConfirmation: mismatchConfirmed,
      // Misma regla que en la emisión: en producción una baja no puede salir
      // firmada con un certificado de demostración.
      allowDemoFallback: sunatEnvironment !== 'produccion',
    };
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
