# D56 · recepción en divisa sin valuación congelada

Estado del corte original: abierto, **NO_GO**. Código reproducido: a5a1dfc; sólo infraestructura y
fixtures propios. No hubo SQL remoto ni cambios de tasas/normativa global.

Una OCUSD con dos cantidades0.5+0.75 a4.13 genera subtotal parcial5.17. Para
servicios y bienes sin stock, el cierre genera el evento original conmonedaUSD,
sin tipo de cambio. El workerNode real termina ambos eventos encompleted y
crea un asientoCONFIRMADO5.17/5.17, sin metadatos de conversión. No existe evidencia
que permita interpretar esos importes como moneda contable del tenantPE.

La variante física se rechaza al cerrar conINVENTORY_VALUATION_REQUIRED. Ese
control funciona y debe conservarse. El primer arnés encontró ese rechazo y
revirtió íntegramente su preparación; la reproducción siguiente aisló los otros
dos tipos, con operaciones y asientos preservados como evidencia.

`handleRecepcionRegistrada` pasa subtotal/clasificaciones al generador sin moneda
ni valuación. `generarAsientoRecepcion` registra esos números directamente.
Un contraasiento exactamente opuesto puede neutralizar el mayor y aun así no
probar la conversión correcta del original.

La corrección debe exigir evidencia de origen, moneda contable del país y
conversión congelada, conservar clasificación y centavos, y rechazar el envío
incompleto sin reconocer un asiento. No debe tomar una tasa actual como si fuese
la original, fabricar una tasa1 ni alterar estos asientos históricos. Restan el
contrato de captura para divisas y sus pruebas; no se considera corregido.

La reproducción cuantitativa está en[reproduccion-d56.json](reproduccion-d56.json).

Actualización617: corregido para nuevas operaciones en el candidato local. La
captura durable de cierre y el writer contable con claim real comparten moneda,
tasa y centavos verificables; los dos originales defectuosos se preservan sin
backfill y rechazan replay/reversa que intenten reinterpretarlos. El registro
anterior describe la reproducción original, no el comportamiento corregido.
Ver [pruebas y límites617](REVISION617.md). El dictamen global sigue **NO_GO**.
