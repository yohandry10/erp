import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { decryptText } from '../../shared/utils/secure-config.utils';

const PROD_PROJECT_REF = 'wypnbcptofqdmoynlonq';
const SIRE_SCOPE = 'https://api-sire.sunat.gob.pe';
const SIRE_BASE_URL = 'https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros';
const SIRE_AUTH_BASE_URL = 'https://api-seguridad.sunat.gob.pe/v1/clientessol';
const REQUEST_TIMEOUT_MS = 30_000;

export type SireLibro = 'REG_VEN' | 'REG_COM';

interface SireCredentials {
  ruc: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
}

export interface SireAceptacionResult {
  ticket: string;
  httpStatus: number;
  responseSummary: Record<string, unknown>;
}

export interface SireTicketResult {
  ticket: string;
  codigoEstado: string | null;
  descripcionEstado: string;
  terminado: boolean;
  conErrores: boolean;
  httpStatus: number;
  responseSummary: Record<string, unknown>;
}

@Injectable()
export class SireApiClientService {
  private readonly logger = new Logger(SireApiClientService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  async aceptarPropuesta(
    tenantId: string,
    libro: SireLibro,
    periodo: string,
  ): Promise<SireAceptacionResult> {
    const credentials = await this.getCredentials(tenantId);
    const token = await this.getAccessToken(credentials);
    const endpoint = libro === 'REG_VEN'
      ? `${SIRE_BASE_URL}/rvie/propuesta/web/propuesta/${periodo}/aceptapropuesta`
      : `${SIRE_BASE_URL}/rce/propuesta/web/registroslibros/${periodo}/aceptarpropuesta`;
    const response = await this.requestJson(endpoint, {
      method: 'POST',
      headers: this.authHeaders(token),
    });
    const ticket = this.readString(response.body, ['numTicket', 'ticket']);

    if (!ticket || !/^[A-Za-z0-9-]{6,40}$/.test(ticket)) {
      throw new BadRequestException({
        code: 'SIRE_TICKET_INVALIDO',
        message: 'SUNAT no devolvió un número de ticket SIRE válido',
      });
    }

    return {
      ticket,
      httpStatus: response.status,
      responseSummary: this.sanitizeResponse(response.body),
    };
  }

  async consultarTicket(
    tenantId: string,
    libro: SireLibro,
    periodo: string,
    ticket: string,
  ): Promise<SireTicketResult> {
    const credentials = await this.getCredentials(tenantId);
    const token = await this.getAccessToken(credentials);
    const codLibro = libro === 'REG_VEN' ? '140000' : '080000';
    const params = new URLSearchParams({
      perIni: periodo,
      perFin: periodo,
      page: '1',
      perPage: '20',
      numTicket: ticket,
      codLibro,
      codOrigenEnvio: '2',
    });
    const endpoint = `${SIRE_BASE_URL}/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets?${params}`;
    const response = await this.requestJson(endpoint, {
      method: 'GET',
      headers: this.authHeaders(token),
    });
    const registro = this.findTicketRecord(response.body, ticket);
    if (!registro) {
      throw new BadRequestException({
        code: 'SIRE_TICKET_NO_ENCONTRADO',
        message: 'SUNAT no devolvió el ticket solicitado para el período y libro indicados',
      });
    }

    const detalle = this.asRecord(registro.detalleTicket);
    const codigoEstado = this.readString(
      { ...registro, ...detalle },
      ['codEstadoEnvio', 'codEstadoProceso'],
    );
    const descripcionEstado = this.readString(
      { ...registro, ...detalle },
      ['desEstadoEnvio', 'desEstadoProceso'],
    ) || 'Estado no informado por SUNAT';
    const normalizedDescription = descripcionEstado.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const terminado = codigoEstado === '06' || normalizedDescription === 'TERMINADO';
    const conErrores = codigoEstado === '03' || /ERROR|RECHAZ/.test(normalizedDescription);

    return {
      ticket,
      codigoEstado,
      descripcionEstado,
      terminado,
      conErrores,
      httpStatus: response.status,
      responseSummary: this.sanitizeResponse(response.body),
    };
  }

  private async getCredentials(tenantId: string): Promise<SireCredentials> {
    const expectedRef = this.configService.get<string>('EXPECTED_SUPABASE_PROJECT_REF');
    if (expectedRef !== PROD_PROJECT_REF) {
      throw new BadRequestException({
        code: 'SIRE_PROD_ONLY',
        message: 'La aceptación real SIRE está bloqueada fuera de la base PROD autorizada',
      });
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('ruc,pais,is_demo,sire_activo,sunat_environment,sunat_username,sunat_password,sunat_gre_client_id,sunat_gre_client_secret')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data) {
      throw new BadRequestException('No se encontró la configuración fiscal del tenant');
    }
    if (String(data.pais || '').toUpperCase() !== 'PE') {
      throw new BadRequestException('SIRE sólo está disponible para empresas de Perú');
    }
    if (data.is_demo === true) {
      throw new BadRequestException('Una empresa demo no puede aceptar propuestas reales en SIRE');
    }
    if (data.sire_activo !== true) {
      throw new BadRequestException('SIRE no está habilitado en la configuración de la empresa');
    }
    if (String(data.sunat_environment || '').toLowerCase() !== 'produccion') {
      throw new BadRequestException('SIRE real requiere ambiente SUNAT producción');
    }

    const ruc = String(data.ruc || '').replace(/\D/g, '');
    const rawUsername = String(data.sunat_username || '').trim().toUpperCase();
    const password = decryptText(this.configService, data.sunat_password);
    const clientId = String(data.sunat_gre_client_id || '').trim();
    const clientSecret = decryptText(this.configService, data.sunat_gre_client_secret);
    if (!/^\d{11}$/.test(ruc) || !rawUsername || !password || !clientId || !clientSecret) {
      throw new BadRequestException({
        code: 'SIRE_CREDENCIALES_INCOMPLETAS',
        message: 'Completa RUC, usuario/clave SOL secundaria y credenciales API SUNAT para usar SIRE',
      });
    }

    return {
      ruc,
      username: rawUsername.startsWith(ruc) ? rawUsername : `${ruc}${rawUsername}`,
      password,
      clientId,
      clientSecret,
    };
  }

  private async getAccessToken(credentials: SireCredentials): Promise<string> {
    const authUrl = `${SIRE_AUTH_BASE_URL}/${encodeURIComponent(credentials.clientId)}/oauth2/token/`;
    const body = new URLSearchParams({
      grant_type: 'password',
      scope: SIRE_SCOPE,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      username: credentials.username,
      password: credentials.password,
    });
    const response = await this.requestJson(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const token = this.readString(response.body, ['access_token']);
    if (!token) {
      throw new BadRequestException({
        code: 'SIRE_AUTH_SIN_TOKEN',
        message: 'SUNAT no devolvió un token de acceso SIRE',
      });
    }
    return token;
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  private async requestJson(
    url: string,
    init: RequestInit,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const raw = await response.text();
      let parsed: Record<string, unknown> = {};
      if (raw.trim()) {
        try {
          parsed = this.asRecord(JSON.parse(raw));
        } catch {
          parsed = { message: raw.slice(0, 500) };
        }
      }
      if (!response.ok) {
        const message = this.readString(parsed, ['msg', 'message', 'error_description'])
          || `SUNAT respondió HTTP ${response.status}`;
        this.logger.warn(`Solicitud SIRE rechazada con HTTP ${response.status}`);
        throw new BadRequestException({
          code: this.readString(parsed, ['cod', 'code']) || 'SIRE_HTTP_ERROR',
          message,
          httpStatus: response.status,
        });
      }
      return { status: response.status, body: parsed };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const timedOut = error instanceof Error && error.name === 'AbortError';
      throw new BadRequestException({
        code: timedOut ? 'SIRE_TIMEOUT' : 'SIRE_NETWORK_ERROR',
        message: timedOut
          ? 'SUNAT no respondió dentro del tiempo permitido'
          : 'No se pudo conectar con el servicio SIRE de SUNAT',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private findTicketRecord(body: Record<string, unknown>, ticket: string): Record<string, unknown> | null {
    const candidates = [body.registros, this.asRecord(body.data).registros, body.data]
      .flatMap((value) => Array.isArray(value) ? value : [])
      .map((value) => this.asRecord(value));
    return candidates.find((record) => {
      const detalle = this.asRecord(record.detalleTicket);
      return this.readString(record, ['numTicket']) === ticket
        || this.readString(detalle, ['numTicket']) === ticket;
    }) || null;
  }

  private sanitizeResponse(value: unknown): Record<string, unknown> {
    const redact = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.slice(0, 25).map(redact);
      if (!input || typeof input !== 'object') {
        return typeof input === 'string' ? input.slice(0, 1_000) : input;
      }
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .filter(([key]) => !/token|secret|password|authorization/i.test(key))
          .map(([key, nested]) => [key, redact(nested)]),
      );
    };
    return this.asRecord(redact(value));
  }

  private readString(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return null;
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, any>
      : {};
  }
}
