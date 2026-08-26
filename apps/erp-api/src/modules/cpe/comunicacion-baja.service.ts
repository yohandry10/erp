import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SigningOptions, XmlSigner } from '@erp-suite/crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { assertExternalFiscalTransportAllowed } from '../../shared/utils/fiscal-transport-guard';
import { decryptBuffer, decryptText } from '../../shared/utils/secure-config.utils';
import {
  canUseRuntimeDemoCertificate,
  loadRuntimeDemoCertificate,
} from '../../shared/utils/demo-certificate.utils';
import { OseService, SunatResponse } from '../ose/ose.service';
import {
  CrearComunicacionBajaDto,
  CrearResumenDiarioDto,
} from './dto/resumen-fiscal.dto';

type TipoResumenFiscal = 'RA' | 'RC';
type ResultadoFiscal = 'TICKET' | 'ACEPTADO' | 'PENDIENTE' | 'RETRY' | 'RECHAZADO';

/** RA/RC con creación, firma, envío, ticket y retry durables mediante 461. */
@Injectable()
export class ComunicacionBajaService {
  private readonly logger = new Logger(ComunicacionBajaService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly oseService: OseService,
    private readonly configService: ConfigService,
  ) {}

  private requireActorId(userId?: string): string {
    const actor = String(userId ?? '').trim();
    if (!actor) throw new BadRequestException('RA/RC requiere un actor autenticado');
    return actor;
  }

  private async rpc(name: string, args: Record<string, unknown>): Promise<any> {
    const { data, error } = await this.supabaseService.getClient().rpc(name, args);
    if (error) {
      const message = String(error.message ?? 'Error transaccional de resumen fiscal');
      if (error.code === '23505' || message.includes('IDEMPOTENCY')) {
        throw new ConflictException(message);
      }
      if (error.code === 'P0002' || message.includes('NOT_FOUND')) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
    return Array.isArray(data) ? data[0] : data;
  }

  private async getCpes(ids: string[], tenantId: string): Promise<any[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('cpe')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', ids);
    if (error) throw new BadRequestException(`No se pudieron leer los CPE del lote: ${error.message}`);
    if ((data?.length ?? 0) !== ids.length) {
      throw new BadRequestException('El lote contiene CPE inexistentes o ajenos al tenant');
    }
    const byId = new Map((data ?? []).map((cpe) => [String(cpe.id), cpe]));
    return ids.map((id) => byId.get(id));
  }

  private normalizeTipoResumen(tipo?: string): TipoResumenFiscal {
    const normalized = String(tipo ?? '').trim().toUpperCase();
    if (normalized !== 'RA' && normalized !== 'RC') {
      throw new BadRequestException('El tipo de lote fiscal debe ser RA o RC');
    }
    return normalized;
  }

  /**
   * Proyección de trabajo para la pantalla: sólo CPE que 448 ya revirtió de
   * forma comercial y que no están reservados en otro lote activo. La RPC de
   * creación vuelve a validar y bloquear; esta lectura no sustituye ese lock.
   */
  async listarCpeBajaElegibles(
    tipo: string | undefined,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    this.requireActorId(userId);
    const normalized = this.normalizeTipoResumen(tipo);
    const client = this.supabaseService.getClient();
    const tipoDocumento = normalized === 'RA' ? '01' : '03';
    const batchTable = normalized === 'RA' ? 'comunicaciones_baja' : 'resumenes_diarios';

    const { data: cpes, error: cpesError } = await client
      .from('cpe')
      .select('id,tipo_documento,serie,numero,fecha_emision,razon_social_receptor,documento_receptor,total_venta,total,moneda,documento_id,estado,estado_sunat,metadata')
      .eq('tenant_id', tenantId)
      .eq('tipo_documento', tipoDocumento)
      .eq('estado', 'ANULADO')
      .eq('estado_sunat', 'ANULADO')
      .order('fecha_emision', { ascending: false })
      .limit(200);
    if (cpesError) {
      throw new BadRequestException(`No se pudieron listar los CPE elegibles: ${cpesError.message}`);
    }

    const commerciallyReversed = (cpes ?? []).filter((cpe: any) =>
      cpe?.metadata?.commercial_reversal_handled === true
      && String(cpe?.metadata?.cancellation_finalization_key ?? '').trim() !== '',
    );
    if (commerciallyReversed.length === 0) {
      return { success: true, data: [] };
    }

    const { data: activeBatches, error: batchesError } = await client
      .from(batchTable)
      .select('comprobantes_ids,estado')
      .eq('tenant_id', tenantId)
      .in('estado', ['PENDIENTE', 'GENERADO', 'ENVIADO', 'ACEPTADO']);
    if (batchesError) {
      throw new BadRequestException(`No se pudieron validar los lotes activos: ${batchesError.message}`);
    }
    const reservedIds = new Set(
      (activeBatches ?? []).flatMap((batch: any) =>
        Array.isArray(batch.comprobantes_ids) ? batch.comprobantes_ids.map(String) : [],
      ),
    );

    return {
      success: true,
      data: commerciallyReversed
        .filter((cpe: any) => !reservedIds.has(String(cpe.id)))
        .map((cpe: any) => ({
          id: cpe.id,
          tipo: normalized,
          tipoDocumento: cpe.tipo_documento,
          serie: cpe.serie,
          numero: cpe.numero,
          fechaEmision: cpe.fecha_emision,
          receptor: cpe.razon_social_receptor,
          receptorDocumento: cpe.documento_receptor,
          total: Number(cpe.total_venta ?? cpe.total ?? 0),
          moneda: cpe.moneda ?? 'PEN',
          documentoId: cpe.documento_id,
          reversaComercialConfirmada: true,
        })),
    };
  }

  async listarLotesFiscales(
    tipo: string | undefined,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    this.requireActorId(userId);
    const normalized = this.normalizeTipoResumen(tipo);
    const table = normalized === 'RA' ? 'comunicaciones_baja' : 'resumenes_diarios';
    const { data, error } = await this.supabaseService
      .getClient()
      .from(table)
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new BadRequestException(`No se pudieron listar los lotes ${normalized}: ${error.message}`);
    return {
      success: true,
      data: (data ?? []).map((lote: any) => ({ ...lote, tipo: normalized })),
    };
  }

  async crearComunicacionBaja(
    dto: CrearComunicacionBajaDto,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    const actor = this.requireActorId(userId);
    const reserved = await this.rpc('crear_comunicacion_baja_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_comprobantes_ids: dto.comprobantesIds,
      p_motivo: dto.motivoBaja,
      p_fecha_comunicacion: dto.fechaComunicacion ?? null,
      p_idempotency_key: dto.idempotencyKey,
    });
    const lote = reserved.lote;
    if (String(lote.estado).toUpperCase() !== 'PENDIENTE') {
      return { success: true, data: lote, idempotent: true };
    }

    const cpes = await this.getCpes(lote.comprobantes_ids, tenantId);
    const xml = await this.generarXmlComunicacionBaja(
      lote,
      cpes,
      String(lote.motivo_baja ?? dto.motivoBaja),
      tenantId,
    );
    const signed = await this.firmarXml(xml, tenantId);
    const generated = await this.rpc('marcar_resumen_fiscal_generado_tx', {
      p_tipo: 'RA',
      p_lote_id: lote.id,
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_xml_generado: xml,
      p_xml_firmado: signed,
      p_hash_xml: this.generarHash(signed),
      p_idempotency_key: dto.idempotencyKey,
    });
    return {
      success: true,
      data: generated.lote,
      idempotent: reserved.idempotent === true || generated.idempotent === true,
    };
  }

  async crearResumenDiario(
    dto: CrearResumenDiarioDto,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    const actor = this.requireActorId(userId);
    const reserved = await this.rpc('crear_resumen_diario_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_comprobantes_ids: dto.comprobantesIds,
      p_fecha_referencia: dto.fechaReferencia,
      p_idempotency_key: dto.idempotencyKey,
    });
    const lote = reserved.lote;
    if (String(lote.estado).toUpperCase() !== 'PENDIENTE') {
      return { success: true, data: lote, idempotent: true };
    }

    const cpes = await this.getCpes(lote.comprobantes_ids, tenantId);
    const xml = await this.generarXmlResumenDiario(lote, cpes, tenantId);
    const signed = await this.firmarXml(xml, tenantId);
    const generated = await this.rpc('marcar_resumen_fiscal_generado_tx', {
      p_tipo: 'RC',
      p_lote_id: lote.id,
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_xml_generado: xml,
      p_xml_firmado: signed,
      p_hash_xml: this.generarHash(signed),
      p_idempotency_key: dto.idempotencyKey,
    });
    return {
      success: true,
      data: generated.lote,
      idempotent: reserved.idempotent === true || generated.idempotent === true,
    };
  }

  async enviarComunicacionBaja(
    comunicacionId: string,
    tenantId: string,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<any> {
    return this.enviarLote(
      'RA',
      comunicacionId,
      tenantId,
      this.requireActorId(userId),
      idempotencyKey ?? `ra-send:${comunicacionId}`,
    );
  }

  async enviarResumenDiario(
    resumenId: string,
    tenantId: string,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<any> {
    return this.enviarLote(
      'RC',
      resumenId,
      tenantId,
      this.requireActorId(userId),
      idempotencyKey ?? `rc-send:${resumenId}`,
    );
  }

  private async enviarLote(
    tipo: TipoResumenFiscal,
    loteId: string,
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
  ): Promise<any> {
    await assertExternalFiscalTransportAllowed(this.supabaseService, tenantId);
    const prepared = await this.rpc('preparar_envio_resumen_fiscal_tx', {
      p_tipo: tipo,
      p_lote_id: loteId,
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: idempotencyKey,
    });
    if (!prepared.should_send) {
      return {
        success: true,
        data: prepared.lote,
        ticket: prepared.lote.ticket_sunat ?? undefined,
        idempotent: true,
      };
    }

    const lote = prepared.lote;
    const numero = tipo === 'RA' ? lote.numero_comunicacion : lote.numero_resumen;
    let response: SunatResponse;
    try {
      const fileName = await this.buildSunatSummaryFileName(tenantId, numero);
      response = await this.oseService.enviarResumen(lote.xml_firmado, fileName, { tenantId });
    } catch (error) {
      await this.finalizarLote(
        tipo,
        loteId,
        tenantId,
        actorId,
        prepared.send_token,
        'RETRY',
        {
          success: false,
          codigoRespuesta: 'TRANSPORT_EXCEPTION',
          descripcionRespuesta: error instanceof Error ? error.message : 'Error de transporte fiscal',
        },
      );
      throw error;
    }

    const resultado: ResultadoFiscal = response.success
      ? response.ticket ? 'TICKET' : 'ACEPTADO'
      : this.isNonDefinitiveSunatResponse(response) ? 'RETRY' : 'RECHAZADO';
    // La persistencia del outcome no es transporte. Si esta RPC falla, el lease
    // queda durable para reconciliación; jamás se reescribe como RETRY.
    const finalized = await this.finalizarLote(
      tipo,
      loteId,
      tenantId,
      actorId,
      prepared.send_token,
      resultado,
      response,
    );
    return {
      success: response.success,
      data: finalized.lote,
      ticket: response.ticket,
      retryable: resultado === 'RETRY',
      message: response.descripcionRespuesta,
    };
  }

  async consultarEstadoComunicacion(
    comunicacionId: string,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    return this.consultarLote('RA', comunicacionId, tenantId, this.requireActorId(userId));
  }

  async consultarEstadoResumen(
    resumenId: string,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    return this.consultarLote('RC', resumenId, tenantId, this.requireActorId(userId));
  }

  private async consultarLote(
    tipo: TipoResumenFiscal,
    loteId: string,
    tenantId: string,
    actorId: string,
  ): Promise<any> {
    await assertExternalFiscalTransportAllowed(this.supabaseService, tenantId);
    const lote = await this.getLote(tipo, loteId, tenantId);
    if (String(lote.estado).toUpperCase() === 'ACEPTADO') {
      return { success: true, data: lote, estado: lote.estado };
    }
    if (!lote.ticket_sunat) {
      throw new BadRequestException('El lote todavía no tiene ticket fiscal');
    }
    if (!lote.envio_token) {
      throw new ConflictException('El lote no tiene token durable de envío; debe reenviarse con 461');
    }
    const response = await this.oseService.consultarTicket(lote.ticket_sunat, { tenantId });
    const resultado: ResultadoFiscal = response.success
      ? 'ACEPTADO'
      : this.isNonDefinitiveSunatResponse(response) ? 'PENDIENTE' : 'RECHAZADO';
    const finalized = await this.finalizarLote(
      tipo,
      loteId,
      tenantId,
      actorId,
      lote.envio_token,
      resultado,
      response,
    );
    return {
      success: response.success,
      data: finalized.lote,
      estado: finalized.lote.estado,
      retryable: resultado === 'PENDIENTE',
      message: response.descripcionRespuesta,
    };
  }

  private async getLote(tipo: TipoResumenFiscal, loteId: string, tenantId: string): Promise<any> {
    const table = tipo === 'RA' ? 'comunicaciones_baja' : 'resumenes_diarios';
    const { data, error } = await this.supabaseService
      .getClient()
      .from(table)
      .select('*')
      .eq('id', loteId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new BadRequestException(`No se pudo consultar el lote: ${error.message}`);
    if (!data) throw new NotFoundException('Lote fiscal no encontrado');
    return data;
  }

  private finalizarLote(
    tipo: TipoResumenFiscal,
    loteId: string,
    tenantId: string,
    actorId: string,
    sendToken: string,
    resultado: ResultadoFiscal,
    response: SunatResponse,
  ): Promise<any> {
    return this.rpc('finalizar_envio_resumen_fiscal_tx', {
      p_tipo: tipo,
      p_lote_id: loteId,
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_envio_token: sendToken,
      p_resultado: resultado,
      p_ticket: response.ticket ?? null,
      p_codigo: response.codigoRespuesta ?? null,
      p_descripcion: response.descripcionRespuesta ?? null,
      p_cdr: response.cdr ?? null,
      p_next_retry_at: resultado === 'RETRY'
        ? new Date(Date.now() + 5 * 60_000).toISOString()
        : null,
    });
  }

  private async generarXmlComunicacionBaja(
    comunicacion: any,
    comprobantes: any[],
    motivo: string,
    tenantId: string,
  ): Promise<string> {
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
    <ext:UBLExtension><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension>
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

  private async generarXmlResumenDiario(
    resumen: any,
    comprobantes: any[],
    tenantId: string,
  ): Promise<string> {
    const empresa = await this.getEmpresaFiscalInfo(tenantId);
    const lines = comprobantes.map((cpe, index) => this.buildSummaryDocumentLineXml(cpe, index)).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<SummaryDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1"
                  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
                  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
                  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
                  xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  <ext:UBLExtensions>
    <ext:UBLExtension><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension>
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
    const total = this.toNumber(cpe.total_venta ?? cpe.total, 0);
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
    <cac:Status><cbc:ConditionCode>${this.escapeXmlText(String(cpe.tipo_operacion_resumen ?? cpe.tipo_operacion ?? '3'))}</cbc:ConditionCode></cac:Status>
    <sac:TotalAmount currencyID="${moneda}">${this.formatAmount(total)}</sac:TotalAmount>
${billingPayments}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${this.formatAmount(igv)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="${moneda}">${this.formatAmount(igv)}</cbc:TaxAmount>
        <cac:TaxCategory><cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT">1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme></cac:TaxCategory>
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
      <cac:PartyIdentification><cbc:ID>${this.escapeXmlText(empresa.ruc)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${this.wrapCdata(empresa.razonSocial)}</cbc:Name></cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#SignatureSP</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment>
  </cac:Signature>`;
  }

  private buildAccountingSupplierPartyXml(empresa: { ruc: string; razonSocial: string }): string {
    return `<cac:AccountingSupplierParty>
    <cbc:CustomerAssignedAccountID>${this.escapeXmlText(empresa.ruc)}</cbc:CustomerAssignedAccountID>
    <cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>
    <cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>${this.wrapCdata(empresa.razonSocial)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party>
  </cac:AccountingSupplierParty>`;
  }

  private async buildSunatSummaryFileName(tenantId: string, summaryId: string): Promise<string> {
    const empresa = await this.getEmpresaFiscalInfo(tenantId);
    const cleanSummaryId = String(summaryId || '').trim();
    return cleanSummaryId.startsWith(`${empresa.ruc}-`)
      ? cleanSummaryId
      : `${empresa.ruc}-${cleanSummaryId}`;
  }

  private async getEmpresaFiscalInfo(tenantId: string): Promise<{ ruc: string; razonSocial: string }> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('ruc, razon_social')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(`No se pudo leer la configuración fiscal: ${error.message}`);
    }
    const ruc = String(data?.ruc ?? '').replace(/\D/g, '');
    const razonSocial = String(data?.razon_social ?? '').trim();
    if (!/^\d{11}$/.test(ruc) || !razonSocial) {
      throw new BadRequestException('RA/RC requiere RUC y razón social reales en empresa_config');
    }
    return { ruc, razonSocial };
  }

  private isNonDefinitiveSunatResponse(
    response: Pick<SunatResponse, 'codigoRespuesta' | 'descripcionRespuesta'>,
  ): boolean {
    const code = String(response.codigoRespuesta ?? '').trim().toUpperCase();
    const description = String(response.descripcionRespuesta ?? '').toLowerCase();
    if (['98', '99', '97', 'CB_OPEN', '0127'].includes(code)) return true;
    return [
      'timeout', 'connection', 'network', 'temporal', 'temporalmente',
      'servicio no disponible', 'unavailable', 'invalid xml', 'incomplete markup',
      'el ticket no existe', 'respuesta de sunat no reconocida', 'error técnico', 'error tecnico',
    ].some((keyword) => description.includes(keyword));
  }

  private formatCorrelativoSunat(value: any): string {
    const raw = String(value ?? '').trim();
    return raw ? raw.replace(/^0+(?=\d)/, '') : '0';
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
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private wrapCdata(value: any): string {
    return `<![CDATA[${String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
  }

  private async firmarXml(xml: string, tenantId: string): Promise<string> {
    const signer = await this.getXmlSigner(tenantId);
    const signedXml = signer.signXml(xml);
    if (!signer.validateSignature(signedXml)) {
      throw new BadRequestException('La firma XML de RA/RC no pudo validarse; el lote no fue congelado');
    }
    return signedXml;
  }

  private async getXmlSigner(tenantId: string): Promise<XmlSigner> {
    const { data: empresa, error } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('ruc, pais, is_demo, certificado_pfx, certificado_password, sunat_environment, sunat_cert_expected_ruc, sunat_cert_ruc_mismatch_confirmed')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new BadRequestException(`No se pudo leer el certificado del tenant: ${error.message}`);
    if (!empresa) {
      throw new BadRequestException('No existe configuración fiscal para el tenant');
    }
    let pfxBuffer = empresa?.certificado_pfx
      ? decryptBuffer(this.configService, empresa.certificado_pfx) || empresa.certificado_pfx
      : null;
    let pfxPassword = empresa?.certificado_password
      ? decryptText(this.configService, empresa.certificado_password) || ''
      : '';

    if (!pfxBuffer && canUseRuntimeDemoCertificate(empresa)) {
      const demoCertificate = loadRuntimeDemoCertificate(this.configService);
      pfxBuffer = demoCertificate.pfxBuffer;
      pfxPassword = demoCertificate.pfxPassword;
      this.logger.warn(
        `Usando certificado fiscal simulado para firmar RA/RC del tenant demo ${tenantId}`,
      );
    }

    if (!pfxBuffer) {
      throw new BadRequestException(
        'No hay certificado fiscal del cliente configurado para firmar RA/RC',
      );
    }
    return new XmlSigner({
      pfxBuffer,
      pfxPassword,
      ...this.getCertificateRucGuardOptions(empresa),
    });
  }

  private getCertificateRucGuardOptions(empresa: any): Partial<SigningOptions> {
    const environment = String(empresa?.sunat_environment ?? '').trim().toLowerCase();
    if (environment !== 'homologacion' && environment !== 'produccion') {
      throw new BadRequestException(
        'El ambiente SUNAT del tenant debe ser homologacion o produccion.',
      );
    }
    const ruc = String(empresa?.ruc ?? '').trim();
    if (!/^\d{11}$/.test(ruc)) {
      throw new BadRequestException(
        'El tenant debe configurar su propio RUC antes de firmar RA/RC.',
      );
    }
    const mismatchConfirmed = empresa.sunat_cert_ruc_mismatch_confirmed === true;
    return {
      expectedRuc: empresa.sunat_cert_expected_ruc || ruc,
      enforceRucInCertificate: environment === 'produccion',
      allowRucMismatchWithConfirmation: mismatchConfirmed,
      // RA/RC nunca sustituye silenciosamente el PFX cargado por el cliente.
      // QA simula el transporte, pero la firma sigue usando material del tenant.
      allowDemoFallback: false,
    };
  }

  private generarHash(xml: string): string {
    return require('crypto').createHash('sha256').update(xml).digest('hex');
  }
}
