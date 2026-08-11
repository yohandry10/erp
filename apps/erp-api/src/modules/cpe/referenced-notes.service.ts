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
    if (error?.code === '23505' || /CONFLICT|DIFFERENT|REUSED|ALREADY/i.test(message)) {
      throw new ConflictException(message);
    }
    throw new BadRequestException(message);
  }

  async listarOrigenes(tenantId: string, search?: string) {
    const client = this.supabaseService.getClient();
    let cpeQuery = client
      .from('cpe')
      .select('id,documento_id,tipo_documento,serie,numero,fecha_emision,cliente_id,documento_receptor,razon_social_receptor,moneda,total_venta,total,estado,sunat_status')
      .eq('tenant_id', tenantId)
      .in('tipo_documento', ['01', '03'])
      .in('estado', ['FIRMADO', 'ENVIADO', 'ACEPTADO'])
      .is('nota_credito_id', null)
      .order('fecha_emision', { ascending: false })
      .limit(100);

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
    const byId = new Map((documentos ?? []).map((row: any) => [row.id, row]));
    return (cpes ?? [])
      .map((cpe: any) => ({ ...byId.get(cpe.documento_id), cpe }))
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
    const { data, error } = await this.supabaseService.getClient().rpc(
      'crear_nota_referenciada_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: actor,
        p_documento_origen_id: dto.documento_origen_id,
        p_tipo_documento: dto.tipo_documento,
        p_codigo_motivo: dto.codigo_motivo,
        p_motivo: dto.motivo,
        p_monto_total: dto.monto_total,
        p_idempotency_key: key,
      },
    );
    if (error) this.throwRpc(error, 'crear la nota referenciada');
    return Array.isArray(data) ? data[0] : data;
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
      .in('tipo_documento', ['07', '08'])
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

    const dto: any = {
      tipo_documento: String((cpe as any).tipo_documento),
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
      tipo_nota_credito: (cpe as any).tipo_nota_credito,
      tipo_nota_debito: (cpe as any).tipo_nota_debito ?? (cpe as any).metadata?.codigo_motivo,
      motivo_nota: (cpe as any).motivo_nota,
    };
    const xml = this.xmlBuilder.generateXmlContent(dto);
    const signer = await this.certificateService.getXmlSigner(tenantId);
    const signedXml = signer.signXml(xml);
    if (!signer.validateSignature(signedXml)) {
      throw new BadRequestException('La firma XML de la nota no pudo validarse');
    }
    const signatureHash = signer.generateHash(signedXml);
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
    this.logger.log(`Nota ${cpeId} firmada para tenant ${tenantId}; envío fiscal continúa separado`);
    return result;
  }
}
