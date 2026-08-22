"use strict";
/**
 * Idempotencia de la venta POS.
 *
 * El backend deduplica una venta POS **únicamente** por la clave que envía el
 * cliente: el índice único `ux_ventas_pos_tenant_idempotency_key_runtime` y
 * `app.pos_reintento_comercial_469` se apoyan sólo en ella, y el
 * `request_fingerprint` que guardan sirve para rechazar una clave reusada con otro
 * payload, nunca para detectar el mismo payload bajo otra clave. Es decir: no
 * existe deduplicación por contenido. Perder la clave entre dos intentos del
 * cajero significa registrar la venta dos veces.
 *
 * El POS la perdía de dos maneras. La borraba en el `catch`, justo cuando un fallo
 * de red o un timeout hacen más probable que el servidor sí haya procesado la
 * venta; y la leía del estado de React en el mismo tick en que la escribía, así
 * que la clave que quedaba guardada nunca era la que se había enviado.
 *
 * La regla vive aquí, aislada y sin dependencias, para poder verificarla.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.huellaIntencionVenta = huellaIntencionVenta;
exports.resolverIntencionVenta = resolverIntencionVenta;
const texto = (valor) => String(valor ?? '').trim();
const numero = (valor) => {
    const n = Number(valor ?? 0);
    return Number.isFinite(n) ? n : 0;
};
/**
 * Huella estable de la intención, con los mismos campos que el servidor incluye en
 * su `request_fingerprint`. Se ordenan los ítems y los pagos para que reordenar el
 * carrito no cuente como una intención distinta.
 */
function huellaIntencionVenta(intencion) {
    const items = (intencion.items ?? [])
        .map((item) => [
        texto(item.productoId),
        numero(item.cantidad),
        numero(item.precioUnitario),
        numero(item.descuentoMonto),
        numero(item.subtotal),
    ])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : numero(a[1]) - numero(b[1])));
    const pagos = intencion.pagos
        ? intencion.pagos
            .map((pago) => [texto(pago.metodoPagoId), numero(pago.monto), texto(pago.referencia)])
            .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : numero(a[1]) - numero(b[1])))
        : null;
    return JSON.stringify({
        cliente: texto(intencion.clienteId) || null,
        documento: texto(intencion.clienteDocumento) || null,
        comprobante: texto(intencion.tipoComprobante) || null,
        metodo: texto(intencion.metodoPagoId) || null,
        referencia: texto(intencion.referenciaPago) || null,
        descuento: [texto(intencion.descuentoGlobalTipo) || null, numero(intencion.descuentoGlobalValor)],
        items,
        pagos,
    });
}
/**
 * Decide la clave de idempotencia de este envío.
 *
 * Reutiliza la registrada cuando la intención no cambió —es lo que convierte el
 * reintento del cajero en idempotente— y genera una nueva cuando cambió, porque
 * reusarla con otro payload haría que el backend responda
 * `POS_IDEMPOTENCY_PAYLOAD_MISMATCH` y la caja quedaría atascada.
 *
 * Dos ventas idénticas consecutivas reciben claves distintas: el llamador descarta
 * la intención al confirmarse cada venta, así que la segunda entra sin registro
 * previo. Esto es deliberado; en comercio dos ventas iguales seguidas son normales
 * y deduplicarlas por contenido perdería una.
 */
function resolverIntencionVenta(registrada, intencion, generarClave) {
    const huella = huellaIntencionVenta(intencion);
    if (registrada && registrada.huella === huella && texto(registrada.clave)) {
        return registrada;
    }
    return { clave: generarClave(), huella };
}
