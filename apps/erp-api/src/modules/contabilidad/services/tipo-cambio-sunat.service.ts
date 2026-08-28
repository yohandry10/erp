import axios from 'axios';
import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Importa el tipo de cambio oficial y lo deja en `tipos_cambio`.
 *
 * ## Qué tipo de cambio, y de dónde
 *
 * No existe un tipo de cambio propio de SUNAT: SUNAT publica el que determina la
 * SBS. Y hacen falta los dos lados, no uno:
 *
 *   - **compra** para las partidas de activo,
 *   - **venta** para las de pasivo y para el IGV, que usa el promedio ponderado
 *     venta de la fecha en que nace la obligación.
 *
 * ## Por qué se contrasta en vez de creer a una fuente
 *
 * La SBS publica en una página ASPX, no en un servicio JSON, así que hay que
 * pasar por terceros. Al comparar dos de ellos para el 20 de agosto de 2026
 * salió esto:
 *
 *     apis.net.pe    compra 3.355   venta 3.361
 *     e-api.net.pe   compra 3.647   venta 3.651
 *
 * El 19 cerró en 3.356 y el 21 en 3.355, así que el segundo estaba sirviendo un
 * dato corrupto: un salto de casi treinta céntimos para un solo día y vuelta
 * atrás. Un tipo de cambio equivocado no rompe nada visible —los asientos
 * cuadran igual— y arrastra el error a la diferencia de cambio, al IGV de las
 * compras en dólares y al balance.
 *
 * Por eso esta importación **desconfía por diseño**: consulta la fuente
 * primaria, y antes de guardar comprueba que el valor no se aparte más de lo
 * razonable del último conocido. Lo que no pasa el contraste no se guarda: se
 * registra como incidencia y el contador lo teclea a mano si sabe que es
 * correcto. Guardar en silencio un valor dudoso es lo único que no se puede
 * hacer con este dato.
 */

export interface CotizacionImportada {
  fecha: string;
  compra: number;
  venta: number;
  fuente: string;
}

export interface ResultadoImportacion {
  fecha: string;
  guardado: boolean;
  motivo?: string;
  cotizacion?: CotizacionImportada;
}

/** Series del BCRP: tipo de cambio del sistema bancario SBS, que es el que rige. */
const SERIE_BCRP_COMPRA = 'PD04639PD';
const SERIE_BCRP_VENTA = 'PD04640PD';

/** Un salto mayor que este frente al último conocido no se guarda sin revisar. */
const DESVIACION_MAXIMA_POR_DEFECTO = 0.05;


@Injectable()
export class TipoCambioSunatService {
  private readonly logger = new Logger(TipoCambioSunatService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private get desviacionMaxima(): number {
    const configurada = Number(process.env.TIPO_CAMBIO_DESVIACION_MAXIMA);
    return Number.isFinite(configurada) && configurada > 0
      ? configurada
      : DESVIACION_MAXIMA_POR_DEFECTO;
  }

  /**
   * Fuente primaria: el BCRP.
   *
   * Publica una API abierta y documentada, sin autenticacion ni captcha, con la
   * serie **del sistema bancario SBS**, que es exactamente la que SUNAT
   * republica y la que manda para el IGV y la renta. Es la fuente mas cercana al
   * original a la que se puede llegar por un canal oficial: SUNAT no tiene API
   * de tipo de cambio, y lo unico que hay es el endpoint interno de su pagina de
   * consulta, que exige simular un navegador y mandar un token de captcha
   * falso. Eso no entra en un ERP.
   *
   * Se comprobo que importa: para el 20 de agosto de 2026 el BCRP da compra
   * 3.351, y el proveedor que usabamos daba 3.355, que es el **interbancario**,
   * no el del sistema bancario. Estaba mezclando series en el lado de la compra.
   */
  private async consultarBcrp(fecha: string): Promise<CotizacionImportada | null> {
    const base =
      process.env.TIPO_CAMBIO_BCRP_URL ||
      'https://estadisticas.bcrp.gob.pe/estadisticas/series/api';

    const leerSerie = async (serie: string): Promise<number | null> => {
      const respuesta = await axios.get(`${base}/${serie}/json/${fecha}/${fecha}`, {
        timeout: 10000,
        headers: { Accept: 'application/json' },
        validateStatus: (status) => status === 200,
      });
      const bruto = respuesta.data?.periods?.[0]?.values?.[0];
      const valor = Number(bruto);
      // Un dia sin publicacion --fin de semana o feriado-- devuelve 'n.d.'.
      return Number.isFinite(valor) && valor > 0 ? valor : null;
    };

    try {
      const [compra, venta] = await Promise.all([
        leerSerie(SERIE_BCRP_COMPRA),
        leerSerie(SERIE_BCRP_VENTA),
      ]);
      if (compra === null || venta === null) return null;

      return { fecha, compra, venta, fuente: 'bcrp' };
    } catch (error: any) {
      const estado = error?.response?.status;
      this.logger.warn(
        `Tipo de cambio ${fecha}: el BCRP no respondio${estado ? ` (HTTP ${estado})` : ''}: ${error?.message}`,
      );
      return null;
    }
  }

  /**
   * Fuente primaria. Devuelve `null` --y no lanza-- ante cualquier problema:
   * que el proveedor esté caído no puede impedir que se registre una compra.
   */
  private async consultarApisNetPe(fecha: string): Promise<CotizacionImportada | null> {
    const base = process.env.TIPO_CAMBIO_API_URL || 'https://api.apis.net.pe/v1/tipo-cambio-sunat';
    const token = process.env.TIPO_CAMBIO_API_TOKEN;

    try {
      const respuesta = await axios.get(base, {
        params: { fecha },
        timeout: 10000,
        headers: {
          Accept: 'application/json',
          // Sin token la fuente limita a un par de consultas seguidas y responde
          // 429. Con token no, y por eso el relleno de un rango lo necesita.
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        validateStatus: (status) => status === 200,
      });

      const compra = Number(respuesta.data?.compra);
      const venta = Number(respuesta.data?.venta);
      if (!Number.isFinite(compra) || !Number.isFinite(venta) || compra <= 0 || venta <= 0) {
        return null;
      }

      return { fecha, compra, venta, fuente: 'apis.net.pe' };
    } catch (error: any) {
      const estado = error?.response?.status;
      this.logger.warn(
        `Tipo de cambio ${fecha}: la fuente no respondió${estado ? ` (HTTP ${estado})` : ''}: ${error?.message}`,
      );
      return null;
    }
  }

  /**
   * Último tipo de cambio conocido antes de la fecha, contra el que se contrasta.
   */
  private async ultimoConocido(
    tenantId: string,
    fecha: string,
  ): Promise<{ compra: number; venta: number; fecha: string } | null> {
    const { data } = await this.supabase
      .getClient()
      .from('tipos_cambio')
      .select('fecha, compra, venta')
      .eq('tenant_id', tenantId)
      .eq('moneda_origen', 'USD')
      .eq('moneda_destino', 'PEN')
      .lt('fecha', fecha)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    return {
      fecha: String((data as any).fecha),
      compra: Number((data as any).compra),
      venta: Number((data as any).venta),
    };
  }

  /**
   * El contraste. Devuelve el motivo del rechazo, o `null` si el valor es
   * plausible.
   */
  private motivoDeRechazo(
    cotizacion: CotizacionImportada,
    referencia: { compra: number; venta: number; fecha: string } | null,
  ): string | null {
    if (!referencia || !(referencia.venta > 0)) {
      // Sin referencia previa no hay contra qué contrastar. Se acepta: es el
      // primer dato del contribuyente y rechazarlo dejaría el sistema sin
      // ninguno para siempre.
      return null;
    }

    const desvioVenta = Math.abs(cotizacion.venta - referencia.venta) / referencia.venta;
    const desvioCompra = Math.abs(cotizacion.compra - referencia.compra) / referencia.compra;
    const desvio = Math.max(desvioVenta, desvioCompra);

    if (desvio > this.desviacionMaxima) {
      return (
        `la cotización ${cotizacion.compra}/${cotizacion.venta} se aparta un ` +
        `${(desvio * 100).toFixed(2)}% de la del ${referencia.fecha} ` +
        `(${referencia.compra}/${referencia.venta}), por encima del ` +
        `${(this.desviacionMaxima * 100).toFixed(2)}% admitido`
      );
    }

    return null;
  }

  /**
   * Importa la cotización de una fecha para un contribuyente.
   *
   * No pisa un tipo de cambio ya registrado: si existe una fila para esa fecha,
   * se respeta. Un tipo de cambio tecleado por el contador es una decisión suya,
   * y puede haberlo puesto porque conocía el correcto.
   *
   * `actorId` no tiene valor por defecto a propósito: la base exige que sea un
   * usuario activo del contribuyente --lo comprueba
   * `assert_financial_master_actor_477`-- y rechaza cualquier centinela. Quien
   * llame tiene que decidir a nombre de quién se importa.
   */
  async importarFecha(
    tenantId: string,
    fecha: string,
    actorId: string,
  ): Promise<ResultadoImportacion> {
    const cliente = this.supabase.getClient();

    const { data: existente } = await cliente
      .from('tipos_cambio')
      .select('id, fuente')
      .eq('tenant_id', tenantId)
      .eq('moneda_origen', 'USD')
      .eq('moneda_destino', 'PEN')
      .eq('fecha', fecha)
      .maybeSingle();

    if (existente) {
      return { fecha, guardado: false, motivo: 'ya existe una cotización para esa fecha' };
    }

    // El BCRP primero, y el proveedor de siempre solo si aquel no responde.
    const cotizacion =
      (await this.consultarBcrp(fecha)) ?? (await this.consultarApisNetPe(fecha));
    if (!cotizacion) {
      return { fecha, guardado: false, motivo: 'la fuente no devolvió una cotización utilizable' };
    }

    const referencia = await this.ultimoConocido(tenantId, fecha);
    const rechazo = this.motivoDeRechazo(cotizacion, referencia);
    if (rechazo) {
      this.logger.error(`Tipo de cambio ${fecha} rechazado: ${rechazo}`);
      return { fecha, guardado: false, motivo: rechazo, cotizacion };
    }

    // `tipos_cambio` no admite escritura directa a proposito: la 482 le revoca el
    // INSERT al rol del API y deja como unica puerta esta funcion, que ademas
    // registra la operacion y la hace idempotente. Escribir por fuera no es que
    // este mal visto, es que el motor lo rechaza.
    const payload = {
      moneda_origen: 'USD',
      moneda_destino: 'PEN',
      fecha,
      compra: cotizacion.compra,
      venta: cotizacion.venta,
      fuente: cotizacion.fuente,
    };
    // La clave lleva dentro el contenido y el autor. Si se reintenta lo mismo,
    // la funcion devuelve lo ya hecho; si cambia algo, es otra operacion y no un
    // conflicto de idempotencia.
    const clave = `fx-import:${createHash('sha256')
      .update(JSON.stringify({ tenantId, actorId, payload }))
      .digest('hex')
      .slice(0, 40)}`;

    const { error } = await cliente.rpc('gestionar_maestro_contable_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_entity: 'FX',
      p_action: 'CREATE',
      p_record_id: null,
      p_payload: payload,
      p_idempotency_key: clave,
    });

    if (error) {
      return { fecha, guardado: false, motivo: `no se pudo guardar: ${error.message}`, cotizacion };
    }

    return { fecha, guardado: true, cotizacion };
  }

  /**
   * Rellena un rango de fechas. Secuencial y con pausa a propósito: sin token la
   * fuente responde 429 a la segunda consulta seguida.
   */
  async importarRango(
    tenantId: string,
    desde: string,
    hasta: string,
    actorId: string,
    pausaMs = 1200,
  ): Promise<ResultadoImportacion[]> {
    const resultados: ResultadoImportacion[] = [];
    const inicio = new Date(`${desde}T00:00:00Z`);
    const fin = new Date(`${hasta}T00:00:00Z`);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || inicio > fin) {
      throw new Error('Rango de fechas inválido');
    }

    for (let dia = new Date(inicio); dia <= fin; dia.setUTCDate(dia.getUTCDate() + 1)) {
      const fecha = dia.toISOString().slice(0, 10);
      resultados.push(await this.importarFecha(tenantId, fecha, actorId));
      if (pausaMs > 0) {
        await new Promise((resolver) => setTimeout(resolver, pausaMs));
      }
    }

    return resultados;
  }
}
