import { ServiceUnavailableException } from '@nestjs/common';
import {
  ACTIVE_COUNTRY_MESSAGE,
  ActiveCountryProfile,
  getActiveCountryByCode,
  getActiveCountryById,
} from '../paises/initial-country';

/**
 * De qué país es un contribuyente, para poder emitir en su nombre.
 *
 * Esta pregunta tenía cuatro respuestas —`fiscal-adapter`, `cpe-helper`,
 * `pdf-generator` y `proveedores`— y las cuatro contestaban Perú cuando no lo
 * sabían: sin fila en `empresa_config`, con `pais_id` vacío, o ante un error de
 * lectura. El país decide el documento de identidad (RUC, CUIT o NIT), la
 * autoridad (SUNAT, ARCA o DIAN), el impuesto (IGV 18 %, IVA 21 %, IVA 19 %),
 * la moneda y el formato del comprobante. Contestar Perú por omisión emite un
 * documento argentino con reglas peruanas y lo emite con buen aspecto, que es
 * la peor forma de equivocarse en algo que va firmado a una administración.
 *
 * Aquí se contesta una sola vez y se falla cerrada. El perfil sale de
 * `ACTIVE_COUNTRY_PROFILES`, que ya era la fuente canónica de los tres países.
 */
export async function perfilPaisDelTenant(
  cliente: { from: (tabla: string) => any },
  tenantId: string,
): Promise<ActiveCountryProfile> {
  const { data, error } = await cliente
    .from('empresa_config')
    .select('pais_id, pais')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    throw new ServiceUnavailableException(
      `No se pudo determinar el país del contribuyente: ${error.message}`,
    );
  }

  const fila = data as { pais_id?: unknown; pais?: unknown } | null;
  // `pais_id` manda; `pais` es el respaldo para las filas que sólo tienen el ISO.
  const perfil = getActiveCountryById(fila?.pais_id) ?? getActiveCountryByCode(fila?.pais);

  if (!perfil) {
    throw new ServiceUnavailableException(
      `La empresa no tiene configurado un país soportado. ${ACTIVE_COUNTRY_MESSAGE}`,
    );
  }

  return perfil;
}
