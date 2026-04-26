import { Injectable, Logger } from '@nestjs/common';
import { ConsultaEstado, DocumentoElectronico, FiscalResponse } from '../../shared/integration/fiscal.interfaces';

export type OseAuthTipo = 'BASIC' | 'BEARER' | 'API_KEY' | 'NONE';

export interface OseApiConfig {
  url: string;
  statusUrl?: string | null;
  authTipo: OseAuthTipo;
  username?: string | null;
  password?: string | null;
  apiKey?: string | null;
  apiHeader?: string | null;
  bearerToken?: string | null;
}

@Injectable()
export class OseApiFiscalService {
  private readonly logger = new Logger(OseApiFiscalService.name);

  async enviarDocumento(documento: DocumentoElectronico, config: OseApiConfig): Promise<FiscalResponse> {
    if (!config?.url) {
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: 'URL de OSE API no configurada',
      };
    }

    const payload = {
      documento,
      xmlContent: documento.xmlContent ?? null,
    };

    return this.callOseApi(config.url, payload, config);
  }

  async consultarEstado(consulta: ConsultaEstado, config: OseApiConfig): Promise<FiscalResponse> {
    const url = config?.statusUrl || config?.url;
    if (!url) {
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: 'URL de estado OSE no configurada',
      };
    }

    return this.callOseApi(url, consulta, config);
  }

  private async callOseApi(url: string, payload: any, config: OseApiConfig): Promise<FiscalResponse> {
    try {
      const headers = this.buildHeaders(config);
      headers['Content-Type'] = 'application/json';

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await this.safeJson(response);
      return this.normalizeResponse(response.ok, data);
    } catch (error) {
      this.logger.error('Error llamando OSE API:', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error tecnico OSE API: ${error.message}`,
      };
    }
  }

  private buildHeaders(config: OseApiConfig): Record<string, string> {
    const headers: Record<string, string> = {};
    const authTipo = (config.authTipo || 'NONE').toUpperCase();

    if (authTipo === 'BASIC' && config.username && config.password) {
      const token = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      headers.Authorization = `Basic ${token}`;
    }

    if (authTipo === 'BEARER' && config.bearerToken) {
      headers.Authorization = `Bearer ${config.bearerToken}`;
    }

    if (authTipo === 'API_KEY' && config.apiKey) {
      const headerName = config.apiHeader || 'x-api-key';
      headers[headerName] = config.apiKey;
    }

    return headers;
  }

  private normalizeResponse(ok: boolean, data: any): FiscalResponse {
    const success = typeof data?.success === 'boolean' ? data.success : ok;
    const codigoRespuesta =
      data?.codigoRespuesta ??
      data?.codigo ??
      data?.code ??
      (success ? '0' : '99');
    const descripcionRespuesta =
      data?.descripcionRespuesta ??
      data?.message ??
      data?.mensaje ??
      (success ? 'Operacion exitosa' : 'Error en OSE API');

    return {
      success,
      codigoRespuesta: String(codigoRespuesta),
      descripcionRespuesta: String(descripcionRespuesta),
      cdr: data?.cdr ?? data?.cdrBase64 ?? data?.cdr_xml,
      hash: data?.hash ?? data?.hashDocumento ?? data?.hash_cpe,
      numeroComprobante: data?.numeroComprobante ?? data?.numero ?? data?.numero_ticket,
      metadata: data,
    };
  }

  private async safeJson(response: any): Promise<any> {
    try {
      return await response.json();
    } catch {
      return { raw: await response.text().catch(() => '') };
    }
  }
}
