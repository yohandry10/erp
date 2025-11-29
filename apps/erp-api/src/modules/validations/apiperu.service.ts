import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';

interface ApiPeruDniResponse {
  success: boolean;
  data?: {
    numero?: string;
    nombre_completo?: string;
    nombres?: string;
    apellido_paterno?: string;
    apellido_materno?: string;
    codigo_verificacion?: string;
  };
  message?: string;
}

@Injectable()
export class ApiPeruService {
  private readonly logger = new Logger(ApiPeruService.name);
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor() {
    this.baseUrl = process.env.APIPERU_BASE_URL || 'https://apiperu.dev';
    this.token = process.env.APIPERU_TOKEN;
  }

  async lookupDni(dni: string) {
    if (!this.token) {
      throw new Error('APIPERU_TOKEN no configurado');
    }
    if (!dni || dni.length !== 8) {
      throw new Error('DNI inválido: se requieren 8 dígitos');
    }

    try {
      const resp = await axios.post<ApiPeruDniResponse>(
        `${this.baseUrl}/api/dni`,
        { dni },
        {
          timeout: 15000,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
          },
        },
      );

      const payload = resp.data;
      if (!payload?.success || !payload.data) {
        throw new Error(payload?.message || 'Consulta DNI no exitosa');
      }

      return {
        dni: payload.data.numero || dni,
        nombres: payload.data.nombres || '',
        apellidoPaterno: payload.data.apellido_paterno || '',
        apellidoMaterno: payload.data.apellido_materno || '',
        nombreCompleto: payload.data.nombre_completo || '',
        codigoVerificacion: payload.data.codigo_verificacion || '',
      };
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Error consultando DNI';
      this.logger.warn(`APIPeru DNI lookup failed for ${dni}: ${msg}`);
      throw new Error(msg);
    }
  }
}
