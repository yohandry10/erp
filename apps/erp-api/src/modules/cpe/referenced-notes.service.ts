import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CpeCertificateService } from './cpe-certificate.service';
import { CpeService } from './cpe.service';
import { CpeXmlBuilder } from './cpe-xml.builder';
import { CrearNotaReferenciadaDto } from './dto/referenced-note.dto';

@Injectable()
export class ReferencedNotesService {
  private readonly logger = new Logger(ReferencedNotesService.name);
  private readonly certificateService: CpeCertificateService;
  private readonly xmlBuilder = new CpeXmlBuilder();

  constructor(
    private readonly supabaseService: SupabaseService,
    configService: ConfigService,
    private readonly cpeService: CpeService,
  ) {
    this.certificateService = new CpeCertificateService(supabaseService, configService);
  }

  private requireActor(actorId?: string): string {
    const actor = String(actorId ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor)) {
      throw new BadRequestException('La operación de nota requiere un actor autenticado del tenant');
    }
    return actor;
  }

  private requireKey(value?: string): string {
    const key = String(value ?? '').trim().toLowerCase();
    if (key.length < 8 || key.length > 200) {
      throw new BadRequestException('Idempotency-Key es obligatorio y debe tener entre 8 y 200 caracteres');
    }
    return key;
  }

  private throwRpc(error: any, action: string): never {
    const message = String(error?.message ?? error ?? `No se pudo ${action}`);
    if (/DIAN_REFERENCED_NOTE_CANCELLATION_MUST_EQUAL_REMAINING_BALANCE/i.test(message)) {
      throw new BadRequestException(
        'La anulación DIAN debe cubrir exactamente el saldo total restante y copiar sus líneas reales; no se admite anulación parcial.',
      );
    }
    if (/DIAN_REFERENCED_NOTE_(LINE_SELECTION_REQUIRED|SOURCE_LINE_NOT_FOUND)/i.test(message)) {
      throw new BadRequestException(
        'El motivo DIAN exige líneas origen verificables con cantidad, base e impuesto exactos.',
      );
    }
    if (/DIAN_REFERENCED_NOTE_(LINE_BALANCE_EXCEEDED|LINE_TAX_MISMATCH|LINE_AMOUNT_MISMATCH|LINE_QUANTITY_INVALID|SOURCE_LINE_BALANCE_(?:CORRUPT|UNVERIFIABLE))/i.test(message)
      || /REFERENCED_NOTE_FINAL_ALLOCATION_INVALID/i.test(message)) {
      throw new BadRequestException(
        'Una línea ya no coincide con su saldo fiscal, cantidad o impuesto. Recargue el comprobante y vuelva a seleccionar las líneas.',
      );
    }
    if (/DIAN_REFERENCED_NOTE_GLOBAL_PRORATION_CONFIRMATION_REQUIRED/i.test(message)) {
      throw new BadRequestException(
        'Este motivo global sólo puede emitirse después de confirmar explícitamente el prorrateo fiscal.',
      );
    }
    if (/DIAN_REFERENCED_NOTE_REASON_EXACT_REPRESENTATION_UNSUPPORTED/i.test(message)) {
      throw new BadRequestException(
        'El motivo elegido no tiene una representación fiscal exacta disponible; la nota fue bloqueada sin crear datos parciales.',
      );
    }
    if (error?.code === '23505' || /CONFLICT|DIFFERENT|REUSED|ALREADY/i.test(message)) {
      throw new ConflictException(message);
    }
    throw new BadRequestException(message);
  }

  async listarOrigenes(tenantId: string, search?: string) {
    const client = this.supabaseService.getClient();
    const { data: tenantConfig, error: tenantConfigError } = await client
      .from('empresa_config')
      .select('pais,is_demo')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (tenantConfigError) this.throwRpc(tenantConfigError, 'leer el contexto fiscal del tenant');
    const isColombia = String((tenantConfig as any)?.pais ?? '').trim().toUpperCase() === 'CO';
    // Una demo colombiana no posee aceptación DIAN real. No exponemos CPE
    // simulados como origen aunque un seed histórico los haya dejado ACEPTADO.
    if (isColombia && (tenantConfig as any)?.is_demo === true) return [];

    let cpeQuery = client
      .from('cpe')
      .select('id,documento_id,tipo_documento,serie,numero,fecha_emision,cliente_id,documento_receptor,razon_social_receptor,moneda,total_venta,total,estado,sunat_status')
      .eq('tenant_id', tenantId)
      .in('tipo_documento', isColombia ? ['01'] : ['01', '03'])
      .eq('estado', 'ACEPTADO')
      .eq('estado_sunat', 'ACEPTADO')
      .eq('sunat_status', 'ACCEPTED')
      .not('cdr_sunat', 'is', null)
      .neq('cdr_sunat', '')
      .order('fecha_emision', { ascending: false })
      .limit(100);
    if (isColombia) {
      cpeQuery = cpeQuery
        .eq('simulated_origin', false)
        .contains('fiscal_authority_evidence', {
          status: 'ACCEPTED',
          authority: 'DIAN',
          country_code: 'CO',
        });
    }

    const term = String(search ?? '').trim();
    if (term) {
      const escaped = term.replace(/[%_,]/g, '');
      cpeQuery = cpeQuery.or(
        `serie.ilike.%${escaped}%,numero.ilike.%${escaped}%,documento_receptor.ilike.%${escaped}%,razon_social_receptor.ilike.%${escaped}%`,
      );
    }
    const { data: cpes, error: cpeError } = await cpeQuery;
    if (cpeError) this.throwRpc(cpeError, 'listar comprobantes elegibles');
    const documentoIds = [...new Set((cpes ?? []).map((row: any) => row.documento_id).filter(Boolean))];
    if (documentoIds.length === 0) return [];

    const { data: documentos, error: documentosError } = await client
      .from('documentos')
      .select('id,tipo_documento,serie,numero,fecha_emision,cliente_id,receptor_numero_doc,receptor_razon_social,receptor_nombre,moneda,subtotal,impuesto_igv,impuesto_isc,total,estado')
      .eq('tenant_id', tenantId)
      .in('id', documentoIds);
    if (documentosError) this.throwRpc(documentosError, 'hidratar comprobantes elegibles');
    const { data: sourceLines, error: sourceLinesError } = await client
      .from('documento_detalles')
      .select('id,documento_id,orden,producto_id,codigo_producto,descripcion,unidad_medida,cantidad,valor_venta,impuesto_igv,impuesto_isc,total_item,metadata')
      .eq('tenant_id', tenantId)
      .in('documento_id', documentoIds)
      .order('orden', { ascending: true });
    if (sourceLinesError) this.throwRpc(sourceLinesError, 'leer las líneas de los comprobantes elegibles');

    const { data: creditNotes, error: creditNotesError } = await client
      .from('documentos')
      .select('id,documento_origen_id,estado')
      .eq('tenant_id', tenantId)
      .eq('tipo_documento', 'NOTA_CREDITO')
      .in('documento_origen_id', documentoIds)
      .not('estado', 'in', '(RECHAZADO,ANULADO)');
    if (creditNotesError) this.throwRpc(creditNotesError, 'leer las notas que reservan saldo');

    const creditNoteIds = (creditNotes ?? []).map((row: any) => row.id).filter(Boolean);
    let creditedLines: any[] = [];
    if (creditNoteIds.length > 0) {
      const { data, error } = await client
        .from('documento_detalles')
        .select('documento_id,cantidad,valor_venta,impuesto_igv,impuesto_isc,total_item,metadata')
        .eq('tenant_id', tenantId)
        .in('documento_id', creditNoteIds);
      if (error) this.throwRpc(error, 'calcular el saldo fiscal por línea');
      creditedLines = data ?? [];
    }

    const consumedByLine = new Map<string, {
      cantidad: number;
      base: number;
      impuesto: number;
      total: number;
    }>();
    for (const line of creditedLines) {
      const sourceLineId = String(line?.metadata?.source_document_line_id ?? '').trim();
      if (!sourceLineId) continue;
      const current = consumedByLine.get(sourceLineId) ?? {
        cantidad: 0, base: 0, impuesto: 0, total: 0,
      };
      // Devolución/anulación consumen unidades. Un descuento o ajuste de precio
      // consume saldo monetario, pero no inventa que la mercadería desapareció.
      if (['1', '2'].includes(String(line?.metadata?.codigo_motivo ?? ''))) {
        current.cantidad += Number(line.cantidad ?? 0);
      }
      current.base += Number(line.valor_venta ?? 0);
      current.impuesto += Number(line.impuesto_igv ?? 0) + Number(line.impuesto_isc ?? 0);
      current.total += Number(line.total_item ?? 0);
      consumedByLine.set(sourceLineId, current);
    }

    const linesByDocument = new Map<string, any[]>();
    for (const line of sourceLines ?? []) {
      const consumed = consumedByLine.get(String(line.id)) ?? {
        cantidad: 0, base: 0, impuesto: 0, total: 0,
      };
      const originalTax = Number(line.impuesto_igv ?? 0) + Number(line.impuesto_isc ?? 0);
      const fiscalLine = {
        id: line.id,
        orden: Number(line.orden ?? 0),
        producto_id: line.producto_id,
        codigo_producto: line.codigo_producto,
        descripcion: line.descripcion,
        unidad_medida: line.unidad_medida,
        afectacion_igv: line.metadata?.afectacion_igv ?? null,
        cantidad: Number(line.cantidad ?? 0),
        base: Number(line.valor_venta ?? 0),
        impuesto: originalTax,
        total: Number(line.total_item ?? 0),
        saldo_cantidad: Math.max(0, Number((Number(line.cantidad ?? 0) - consumed.cantidad).toFixed(6))),
        saldo_base: Math.max(0, Number((Number(line.valor_venta ?? 0) - consumed.base).toFixed(2))),
        saldo_impuesto: Math.max(0, Number((originalTax - consumed.impuesto).toFixed(2))),
        saldo_total: Math.max(0, Number((Number(line.total_item ?? 0) - consumed.total).toFixed(2))),
      };
      const existing = linesByDocument.get(String(line.documento_id)) ?? [];
      existing.push(fiscalLine);
      linesByDocument.set(String(line.documento_id), existing);
    }

    const byId = new Map((documentos ?? []).map((row: any) => [row.id, row]));
    return (cpes ?? [])
      .map((cpe: any) => {
        const document = byId.get(cpe.documento_id) as any;
        const lineas = linesByDocument.get(String(cpe.documento_id)) ?? [];
        return {
          ...document,
          lineas,
          saldo_total: Number(lineas.reduce(
            (sum: number, line: any) => sum + Number(line.saldo_total ?? 0), 0,
          ).toFixed(2)),
          cpe,
        };
      })
      .filter((row: any) => row.id);
  }

  async crear(
    dto: CrearNotaReferenciadaDto,
    tenantId: string,
    actorId: string | undefined,
    idempotencyKey?: string,
  ) {
    const actor = this.requireActor(actorId);
    const key = this.requireKey(idempotencyKey);
    const isDianNote = ['91', '92'].includes(dto.tipo_documento);
    if (isDianNote) {
      const { data: tenantConfig, error: tenantConfigError } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('pais,is_demo')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (tenantConfigError) {
        this.throwRpc(tenantConfigError, 'leer el contexto fiscal del tenant');
      }
      if (String((tenantConfig as any)?.pais ?? '').trim().toUpperCase() !== 'CO') {
        throw new BadRequestException('Las notas DIAN 91/92 requieren un tenant Colombia');
      }
      if ((tenantConfig as any)?.is_demo === true) {
        throw new BadRequestException(
          'Para emitir NC/ND DIAN necesitas una factura electrónica aceptada por DIAN del mismo contribuyente; la demo no fabrica aceptación fiscal.',
        );
      }
      const lineas = dto.lineas ?? [];
      const requiresLines = (dto.tipo_documento === '91' && ['1', '4'].includes(dto.codigo_motivo))
        || (dto.tipo_documento === '92' && ['1', '2', '4'].includes(dto.codigo_motivo));
      const globalProration = (dto.tipo_documento === '91' && dto.codigo_motivo === '3')
        || (dto.tipo_documento === '92' && dto.codigo_motivo === '3');
      if (dto.tipo_documento === '91' && dto.codigo_motivo === '5') {
        throw new BadRequestException(
          'El motivo DIAN “Otros” no se puede representar de forma fiscalmente exacta en este flujo. Seleccione devolución, anulación, descuento o ajuste de precio.',
        );
      }
      if (requiresLines && lineas.length === 0) {
        throw new BadRequestException(
          'Este motivo DIAN exige seleccionar al menos una línea origen con cantidad, base e impuesto exactos.',
        );
      }
      if (requiresLines && dto.prorrateo_global === true) {
        throw new BadRequestException('Un ajuste por línea no admite prorrateo global.');
      }
      if (requiresLines && Math.abs(
        lineas.reduce((sum, line) => sum + Number(line.total), 0) - Number(dto.monto_total),
      ) > 0.01) {
        throw new BadRequestException(
          'El importe total de la nota DIAN debe coincidir exactamente con la suma de sus líneas seleccionadas.',
        );
      }
      if (globalProration && (dto.prorrateo_global !== true || lineas.length > 0)) {
        throw new BadRequestException(
          'Este motivo global exige confirmar el prorrateo explícito y no admite líneas manuales.',
        );
      }
      if (dto.tipo_documento === '91' && dto.codigo_motivo === '2'
        && (lineas.length > 0 || dto.prorrateo_global === true)) {
        throw new BadRequestException(
          'La anulación DIAN copia las líneas reales y debe cubrir exactamente el saldo total restante; no admite líneas manuales ni prorrateo.',
        );
      }
      const seen = new Set<string>();
      for (const line of lineas) {
        if (seen.has(line.source_document_line_id)) {
          throw new BadRequestException('Cada línea origen puede aparecer una sola vez en la nota DIAN.');
        }
        seen.add(line.source_document_line_id);
        if (Math.abs(Number(line.total) - Number(line.base) - Number(line.impuesto)) > 0.01) {
          throw new BadRequestException(
            'El total de cada línea DIAN debe ser exactamente base más impuesto.',
          );
        }
      }
    }
    const rpcPayload: Record<string, unknown> = {
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_documento_origen_id: dto.documento_origen_id,
      p_tipo_documento: dto.tipo_documento,
      p_codigo_motivo: dto.codigo_motivo,
      p_motivo: dto.motivo,
      p_monto_total: dto.monto_total,
      p_idempotency_key: key,
    };
    if (isDianNote) {
      rpcPayload.p_lineas = dto.lineas ?? [];
      rpcPayload.p_prorrateo_global = dto.prorrateo_global === true;
    }
    const { data, error } = await this.supabaseService.getClient().rpc(
      'crear_nota_referenciada_tx',
      rpcPayload,
    );
    if (error) this.throwRpc(error, 'crear la nota referenciada');
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.financial_effect_status !== 'PENDING_FISCAL_ACCEPTANCE') {
      throw new BadRequestException(
        'La creación de la nota no confirmó su neutralidad financiera',
      );
    }
    return result;
  }

  async firmar(
    cpeId: string,
    tenantId: string,
    actorId: string | undefined,
    idempotencyKey?: string,
  ) {
    const actor = this.requireActor(actorId);
    const key = this.requireKey(idempotencyKey);
    const client = this.supabaseService.getClient();
    const { data: cpe, error: cpeError } = await client
      .from('cpe')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', cpeId)
      .in('tipo_documento', ['07', '08', '91', '92'])
      .maybeSingle();
    if (cpeError) this.throwRpc(cpeError, 'leer la nota');
    if (!cpe) throw new NotFoundException('La nota no existe en este tenant');

    let items: any[] = Array.isArray((cpe as any).items) ? (cpe as any).items : [];
    if ((cpe as any).documento_id) {
      const { data: detalles, error: detallesError } = await client
        .from('documento_detalles')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('documento_id', (cpe as any).documento_id)
        .order('orden', { ascending: true });
      if (detallesError) this.throwRpc(detallesError, 'leer las líneas de la nota');
      if ((detalles ?? []).length > 0) {
        items = (detalles ?? []).map((item: any) => ({
          producto_id: item.producto_id,
          codigo: item.codigo_producto,
          descripcion: item.descripcion,
          unidad_medida: item.unidad_medida,
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario),
          valor_venta: Number(item.valor_venta),
          impuesto_igv: Number(item.impuesto_igv),
          impuesto_isc: Number(item.impuesto_isc),
          total: Number(item.total_item),
          afectacion_igv: item.metadata?.afectacion_igv,
        }));
      }
    }
    if (items.length === 0) {
      throw new BadRequestException('La nota no tiene líneas congeladas para generar XML');
    }

    const persistedType = String((cpe as any).tipo_documento);
    const isDianNote = ['91', '92'].includes(persistedType);
    const persistedReason = String(
      persistedType === '91'
        ? (cpe as any).tipo_nota_credito ?? (cpe as any).metadata?.codigo_motivo ?? ''
        : persistedType === '92'
          ? (cpe as any).tipo_nota_debito ?? (cpe as any).metadata?.codigo_motivo ?? ''
          : '',
    ).trim();
    let signedXml: string;
    let signatureHash: string;
    if (isDianNote) {
      signedXml = await this.cpeService.firmarNotaDianReferenciada(
        { ...(cpe as any), items },
        tenantId,
      );
      signatureHash = createHash('sha256').update(signedXml, 'utf8').digest('hex');
    } else {
      const dto: any = {
        tipo_documento: persistedType,
        serie: String((cpe as any).serie),
        numero: String((cpe as any).numero),
        ruc_emisor: String((cpe as any).ruc_emisor ?? ''),
        razon_social_emisor: String((cpe as any).razon_social_emisor ?? ''),
        tipo_documento_receptor: String((cpe as any).tipo_documento_receptor ?? ''),
        documento_receptor: String((cpe as any).documento_receptor ?? ''),
        razon_social_receptor: String((cpe as any).razon_social_receptor ?? ''),
        direccion_receptor: String((cpe as any).direccion_receptor ?? ''),
        moneda: String((cpe as any).moneda ?? 'PEN'),
        total_gravadas: Number((cpe as any).total_gravadas ?? 0),
        total_exoneradas: Number((cpe as any).total_exoneradas ?? 0),
        total_inafectas: Number((cpe as any).total_inafectas ?? 0),
        total_exportacion: Number((cpe as any).total_exportacion ?? 0),
        total_igv: Number((cpe as any).total_igv ?? 0),
        total_venta: Number((cpe as any).total_venta ?? (cpe as any).total ?? 0),
        fecha_emision: (cpe as any).fecha_emision,
        items,
        documento_referencia_tipo: (cpe as any).documento_referencia_tipo,
        documento_referencia_serie: (cpe as any).documento_referencia_serie,
        documento_referencia_numero: (cpe as any).documento_referencia_numero,
        tipo_nota_credito: persistedType === '07'
          ? persistedReason || (cpe as any).tipo_nota_credito
          : (cpe as any).tipo_nota_credito,
        tipo_nota_debito: persistedType === '08'
          ? (cpe as any).tipo_nota_debito ?? (cpe as any).metadata?.codigo_motivo
          : (cpe as any).tipo_nota_debito,
        motivo_nota: (cpe as any).motivo_nota,
      };
      const xml = this.xmlBuilder.generateXmlContent(dto);
      const signer = await this.certificateService.getXmlSigner(tenantId);
      signedXml = signer.signXml(xml);
      if (!signer.validateSignature(signedXml)) {
        throw new BadRequestException('La firma XML de la nota no pudo validarse');
      }
      signatureHash = signer.generateHash(signedXml);
    }
    const xmlSha256 = createHash('sha256').update(signedXml, 'utf8').digest('hex');

    const { data, error } = await client.rpc('firmar_nota_referenciada_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actor,
      p_cpe_id: cpeId,
      p_xml_firmado: signedXml,
      p_hash_firma: signatureHash,
      p_xml_sha256: xmlSha256,
      p_idempotency_key: key,
    });
    if (error) this.throwRpc(error, 'firmar la nota');
    const result = Array.isArray(data) ? data[0] : data;
    this.logger.log(
      `Nota ${cpeId} (${isDianNote ? 'DIAN' : 'SUNAT'}) firmada para tenant ${tenantId}; envío fiscal continúa separado`,
    );
    return result;
  }
}
