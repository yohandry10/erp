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

async ensureDocumentoParaCpe(cpeRecord: any, tenantId: string): Promise<string | null> {
    if (!cpeRecord?.id) {
      return null;
    }

    const client = this.supabaseService.getClient();
    const documentoExistente = cpeRecord.documento_id
      ? String(cpeRecord.documento_id)
      : await this.findDocumentoOperativoParaCpe(client, tenantId, cpeRecord);
    if (!documentoExistente) {
      throw new BadRequestException(
        'El CPE no tiene documento operativo; debe repararse mediante emitir_factura_cliente_tx, registrar_cpe_desktop_tx o finalizar_cpe_pos_tx',
      );
    }
    if (!cpeRecord.documento_id) {
      throw new BadRequestException(
        'El vínculo CPE/documento sólo puede escribirse dentro de la frontera transaccional fiscal',
      );
    }
    return documentoExistente;
  }
}
