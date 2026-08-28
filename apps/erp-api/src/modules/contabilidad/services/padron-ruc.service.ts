import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Consulta el padrón de RUC de SUNAT y guarda lo consultado.
 *
 * ## Qué añade sobre lo que ya había
 *
 * Hasta ahora se validaba el **formato** del RUC y su dígito verificador. Eso
 * descarta un número mal tecleado y nada más. Lo que decide un contador es otra
 * cosa: si el contribuyente existe, si está de baja, y sobre todo si está
 * **HABIDO**. Una compra a un proveedor no habido arrastra problemas de crédito
 * fiscal, y hasta ahora el sistema no tenía forma de saberlo.
 *
 * ## Por qué una caché y no el padrón entero
 *
 * SUNAT publica el padrón completo en `padron_reducido_ruc.zip`: 391 MB al día,
 * unos once millones de filas. Traerlo entero sería pagar por once millones de
 * registros para consultar unos pocos miles, y descargarlo a diario en el
 * servidor. Aquí sólo entra el RUC que alguien consulta de verdad.
 *
 * ## Por qué no bloquea nunca
 *
 * Que la fuente esté caída, o que un RUC no aparezca, **no puede impedir
 * registrar un proveedor**. Todo devuelve `null` o el dato que haya en caché; el
 * aviso es información, no una barrera.
 */

export interface ContribuyenteDelPadron {
  ruc: string;
  razonSocial: string | null;
  estado: string | null;
  condicion: string | null;
  direccion: string | null;
  ubigeo: string | null;
  /** Cuándo se consultó a la fuente. Sirve para decir «dato de hace un mes». */
  consultadoEn: string;
  fuente: string;
  /** `true` si la respuesta salió de la caché y no de la fuente. */
  desdeCache: boolean;
}

/**
 * El estado y la condición de un contribuyente cambian muy de tarde en tarde, y
 * la consulta cuesta una llamada a un tercero. Un mes es un equilibrio
 * razonable: suficientemente fresco para avisar, suficientemente espaciado para
 * no depender de la fuente en cada pantalla.
 */
const DIAS_ANTES_DE_REFRESCAR = 30;

@Injectable()
export class PadronRucService {
  private readonly logger = new Logger(PadronRucService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Devuelve lo que SUNAT dice de ese RUC, de la caché si está fresco.
   *
   * `null` significa «no se pudo averiguar», nunca «no existe»: la diferencia
   * importa, porque de lo primero no se debe concluir nada sobre el proveedor.
   */
  async consultar(ruc: string, forzar = false): Promise<ContribuyenteDelPadron | null> {
    const numero = String(ruc || '').replace(/\D/g, '');
    if (!/^\d{11}$/.test(numero)) return null;

    if (!forzar) {
      const enCache = await this.leerDeCache(numero);
      if (enCache) return enCache;
    }

    const consultado = await this.consultarFuente(numero);
    if (!consultado) {
      // Si la fuente falla se devuelve lo que hubiera, aunque esté viejo: un
      // dato de hace dos meses vale más que ninguno para avisar de una baja.
      return this.leerDeCache(numero, true);
    }

    await this.guardar(consultado);
    return consultado;
  }

  private async leerDeCache(
    ruc: string,
    aunqueEsteViejo = false,
  ): Promise<ContribuyenteDelPadron | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from('padron_ruc')
      .select('ruc, razon_social, estado, condicion, direccion, ubigeo, fuente, consultado_en')
      .eq('ruc', ruc)
      .maybeSingle();

    if (error || !data) return null;

    const fila = data as any;
    if (!aunqueEsteViejo) {
      const edadDias =
        (Date.now() - new Date(fila.consultado_en).getTime()) / (1000 * 60 * 60 * 24);
      if (edadDias > DIAS_ANTES_DE_REFRESCAR) return null;
    }

    return {
      ruc: fila.ruc,
      razonSocial: fila.razon_social ?? null,
      estado: fila.estado ?? null,
      condicion: fila.condicion ?? null,
      direccion: fila.direccion ?? null,
      ubigeo: fila.ubigeo ?? null,
      consultadoEn: fila.consultado_en,
      fuente: fila.fuente,
      desdeCache: true,
    };
  }

  private async consultarFuente(ruc: string): Promise<ContribuyenteDelPadron | null> {
    const base = process.env.PADRON_RUC_API_URL || 'https://api.apis.net.pe/v1/ruc';
    const token = process.env.PADRON_RUC_API_TOKEN || process.env.TIPO_CAMBIO_API_TOKEN;

    try {
      const respuesta = await axios.get(base, {
        params: { numero: ruc },
        timeout: 10000,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        validateStatus: (status) => status === 200,
      });

      const d = respuesta.data ?? {};
      const razonSocial = String(d.nombre ?? d.razonSocial ?? '').trim();
      if (!razonSocial) return null;

      return {
        ruc,
        razonSocial,
        estado: this.normalizar(d.estado),
        condicion: this.normalizar(d.condicion),
        direccion: String(d.direccion ?? '').trim() || null,
        ubigeo: String(d.ubigeo ?? '').trim() || null,
        consultadoEn: new Date().toISOString(),
        fuente: 'apis.net.pe',
        desdeCache: false,
      };
    } catch (error: any) {
      const estado = error?.response?.status;
      this.logger.warn(
        `Padrón RUC ${ruc}: la fuente no respondió${estado ? ` (HTTP ${estado})` : ''}: ${error?.message}`,
      );
      return null;
    }
  }

  private normalizar(valor: unknown): string | null {
    const texto = String(valor ?? '').trim().toUpperCase();
    return texto || null;
  }

  private async guardar(dato: ContribuyenteDelPadron): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('padron_ruc')
      .upsert(
        {
          ruc: dato.ruc,
          razon_social: dato.razonSocial,
          estado: dato.estado,
          condicion: dato.condicion,
          direccion: dato.direccion,
          ubigeo: dato.ubigeo,
          fuente: dato.fuente,
          consultado_en: dato.consultadoEn,
        },
        { onConflict: 'ruc' },
      );

    if (error) {
      // No se propaga: no poder guardar en la caché no puede tumbar la consulta.
      this.logger.warn(`Padrón RUC ${dato.ruc}: no se pudo guardar en caché: ${error.message}`);
    }
  }
}
