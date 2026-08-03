import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CpeDeliveryService } from './cpe-delivery.service';
import { CpeXmlBuilder } from './cpe-xml.builder';

/** Mantiene consistente el CPE con el documento operativo de facturación. */
export class CpeOperationalDocumentService {
  private readonly logger = new Logger(CpeOperationalDocumentService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    private readonly deliveryService: CpeDeliveryService,
    private readonly xmlBuilder: CpeXmlBuilder,
  ) {}

  private normalizeTipoDocumentoSunat(tipo: string | null | undefined, throwOnUnknown = true): string {
    return this.xmlBuilder.normalizeTipoDocumentoSunat(tipo, throwOnUnknown);
  }

  private getEmpresaEmisorInfo(tenantId: string) {
    return this.deliveryService.getEmpresaEmisorInfo(tenantId);
  }

  private pickFirstNonEmpty(values: Array<string | null | undefined>, fallback = ''): string {
    return this.deliveryService.pickFirstNonEmpty(values, fallback);
  }

mapCpeEstadoADocumento(cpeEstado?: string | null): string {
    const estado = String(cpeEstado ?? '').toUpperCase();
    switch (estado) {
      case 'ACEPTADO':
        return 'ACEPTADO';
      case 'RECHAZADO':
        return 'RECHAZADO';
      case 'ANULADO':
        return 'ANULADO';
      case 'ENVIADO':
      case 'ENVIADO_SUNAT':
        return 'ENVIADO_SUNAT';
      default:
        // FIRMADO / GENERADO / PENDIENTE: el comprobante ya existe, no es borrador.
        return 'EMITIDO';
    }
  }

private getDocumentoKeyFromCpe(cpeRecord: any) {
    const tipoDocumentoSunat = this.normalizeTipoDocumentoSunat(cpeRecord.tipo_documento);
    if (!['01', '03'].includes(tipoDocumentoSunat)) {
      throw new BadRequestException(
        `No se puede crear documento operativo directo para tipo CPE ${tipoDocumentoSunat}`,
      );
    }
    const tipoDocumento = tipoDocumentoSunat === '03' ? 'BOLETA' : 'FACTURA';
    const numero =
      cpeRecord.numero != null
        ? String(cpeRecord.numero).padStart(8, '0')
        : '';

    if (!cpeRecord.serie || !numero) {
      throw new BadRequestException('El CPE requiere serie y número para crear el documento operativo');
    }

    return {
      tipoDocumento,
      serie: String(cpeRecord.serie).trim().toUpperCase(),
      numero,
    };
  }

private assertDocumentoOperativoCoincideConCpe(documento: any, cpeRecord: any): void {
    const totalDocumentoCents = Math.round(Number(documento?.total ?? 0) * 100);
    const totalCpeCents = Math.round(Number(cpeRecord?.total_venta ?? 0) * 100);
    const receptorDocumento = String(
      documento?.receptor_numero_doc ??
      documento?.receptor_documento ??
      '',
    ).trim();
    const receptorCpe = String(cpeRecord?.documento_receptor ?? '').trim();

    if (Math.abs(totalDocumentoCents - totalCpeCents) > 1 || (receptorDocumento && receptorCpe && receptorDocumento !== receptorCpe)) {
      throw new BadRequestException(
        `Conflicto de numeración CPE ${cpeRecord.serie}-${String(cpeRecord.numero).padStart(8, '0')}: ` +
          'ya existe un documento operativo con total o receptor distinto',
      );
    }
  }

private async findDocumentoOperativoParaCpe(client: any, tenantId: string, cpeRecord: any): Promise<string | null> {
    const key = this.getDocumentoKeyFromCpe(cpeRecord);
    const { data, error } = await client
      .from('documentos')
      .select('id,total,receptor_numero_doc,receptor_documento')
      .eq('tenant_id', tenantId)
      .eq('tipo_documento', key.tipoDocumento)
      .eq('serie', key.serie)
      .eq('numero', key.numero)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`No se pudo consultar documento operativo del CPE: ${error.message}`);
    }

    if (data?.id) {
      this.assertDocumentoOperativoCoincideConCpe(data, cpeRecord);
    }

    return data?.id ?? null;
  }

private async vincularDocumentoCpe(client: any, cpeId: string, documentoId: string): Promise<void> {
    const { error } = await client
      .from('cpe')
      .update({ documento_id: documentoId })
      .eq('id', cpeId);

    if (error) {
      throw new BadRequestException(`No se pudo vincular CPE con documento operativo: ${error.message}`);
    }
  }

async ensureDocumentoParaCpe(cpeRecord: any, tenantId: string): Promise<string | null> {
    if (!cpeRecord?.id) {
      return null;
    }

    if (cpeRecord.documento_id) {
      return cpeRecord.documento_id;
    }

    const client = this.supabaseService.getClient();

    try {
      const documentoExistente = await this.findDocumentoOperativoParaCpe(client, tenantId, cpeRecord);
      if (documentoExistente) {
        await this.vincularDocumentoCpe(client, cpeRecord.id, documentoExistente);
        return documentoExistente;
      }

      const emisorInfo = await this.getEmpresaEmisorInfo(tenantId);
      const safeEmisorRuc = this.pickFirstNonEmpty(
        [cpeRecord.ruc_emisor, emisorInfo.ruc, this.configService.get<string>('EMPRESA_RUC')],
        '20000000000',
      );
      const safeEmisorRazon = this.pickFirstNonEmpty(
        [cpeRecord.razon_social_emisor, emisorInfo.razonSocial],
        'EMISOR',
      );
      const safeEmisorDireccion = this.pickFirstNonEmpty(
        [cpeRecord.direccion_emisor, emisorInfo.direccion],
        'DIRECCION NO DEFINIDA',
      );
      const documentoKey = this.getDocumentoKeyFromCpe(cpeRecord);

      const documentoOperativo = {
        tenant_id: tenantId,
        tipo_documento: documentoKey.tipoDocumento,
        serie: documentoKey.serie,
        numero: documentoKey.numero,
        fecha_emision: cpeRecord.fecha_emision ?? new Date().toISOString(),
        fecha_vencimiento: cpeRecord.fecha_vencimiento ?? cpeRecord.fecha_emision ?? null,
        emisor_ruc: safeEmisorRuc,
        emisor_razon_social: safeEmisorRazon,
        emisor_direccion: safeEmisorDireccion,
        receptor_tipo_doc: cpeRecord.tipo_documento_receptor ?? 'RUC',
        receptor_numero_doc: cpeRecord.documento_receptor ?? '00000000000',
        receptor_razon_social: cpeRecord.razon_social_receptor ?? 'CLIENTE',
        receptor_direccion: cpeRecord.direccion_receptor ?? null,
        moneda: cpeRecord.moneda ?? 'PEN',
        tipo_cambio: 1,
        subtotal: cpeRecord.total_gravadas ?? 0,
        impuesto_igv: cpeRecord.total_igv ?? 0,
        total: cpeRecord.total_venta ?? 0,
        // Sin las bases por afectación el documento perdía lo exonerado y lo
        // inafecto: subtotal + IGV no llegaba al total y el Registro de Ventas
        // se quedaba sin las columnas que SUNAT pide separadas.
        total_gravadas: cpeRecord.total_gravadas ?? 0,
        total_exoneradas: cpeRecord.total_exoneradas ?? 0,
        total_inafectas: cpeRecord.total_inafectas ?? 0,
        total_exportacion: cpeRecord.total_exportacion ?? 0,
        // El documento operativo nace desde un CPE ya generado: reflejar su estado
        // real. Dejarlo en BORRADOR mostraba la misma factura como "Borrador" en
        // Documentos y "FIRMADO" en CPE.
        estado: this.mapCpeEstadoADocumento(cpeRecord.estado),
        observaciones: `Documento generado automáticamente desde CPE ${cpeRecord.serie}-${cpeRecord.numero}`,
        created_at: cpeRecord.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: documentoInsertado, error: insertError } = await client
        .from('documentos')
        .insert(documentoOperativo)
        .select('id')
        .single();

      if (insertError) {
        if ((insertError as any)?.code === '23505') {
          const documentoCreadoPorOtroProceso = await this.findDocumentoOperativoParaCpe(client, tenantId, cpeRecord);
          if (documentoCreadoPorOtroProceso) {
            await this.vincularDocumentoCpe(client, cpeRecord.id, documentoCreadoPorOtroProceso);
            return documentoCreadoPorOtroProceso;
          }
        }

        throw new BadRequestException(`No se pudo crear documento operativo para CPE: ${insertError.message}`);
      }

      const documentoId = documentoInsertado?.id ?? null;

      if (documentoId) {
        await this.vincularDocumentoCpe(client, cpeRecord.id, documentoId);
      }

      return documentoId;
    } catch (documentError) {
      this.logger.error(
        `❌ [CPE] Error creando documento operativo para CPE ${cpeRecord.id}:`,
        documentError,
      );
      throw documentError;
    }
  }
}
