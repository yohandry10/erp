# Readiness POS para impresion SUNAT - 2026-06-17

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_forense`.
>
> Leer tambien: `docs/auditoria_impresion_cpe_facturas_2026-05.md`, `docs/manuals/modules/VENTAS_POS_FISCAL.md`, `docs/audits/2026-06-17-sunat-secondary-sol-evidence.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha: 2026-06-17

## Conclusion

El POS queda preparado a nivel de codigo para imprimir:

- **Representacion impresa fiscal CPE** cuando la venta ya tiene `cpe_id` y el backend puede devolver QR SUNAT + valor resumen/hash.
- **Comprobante interno de caja** cuando la venta esta registrada pero el CPE aun esta pendiente; no se presenta como representacion fiscal valida.

Esto corrige el hueco detectado: el POS ya tenia ticket termico 80 mm, pero no garantizaba que una factura/boleta impresa desde caja incluyera QR SUNAT y valor resumen cuando correspondia.

No se declara certificacion productiva absoluta: sigue pendiente smoke con impresora/navegador real y las dependencias fiscales externas vigentes del contribuyente (certificado correcto del RUC, CDR productivo controlado, GRE REST si aplica).

## Criterio SUNAT verificado

Fuentes oficiales revisadas:

- SUNAT Orientacion - efectos de ser emisor electronico: exige que la representacion impresa o digital incluya valor resumen/codigo de barras y, desde 2018, codigo QR. URL: `https://orientacion.sunat.gob.pe/01-efectos-de-ser-emisor-electronico`
- SUNAT Anexo C RS 113-2018: define el contenido del QR para representacion impresa: RUC emisor, tipo de documento, serie, numero, IGV, total, fecha, tipo y numero de documento del receptor, y valor resumen, separados por `|`. URL: `https://www.sunat.gob.pe/legislacion/superin/2018/anexoC-113-2018.pdf`
- SUNAT CPE - boleta: la boleta electronica puede otorgarse por representacion impresa o por medio electronico. URL: `https://cpe.sunat.gob.pe/tipos_de_comprobantes/boleta`
- SUNAT sistemas del contribuyente: para comprobantes desde sistemas del contribuyente se contempla representacion impresa/electronica y consulta posterior del comprobante. URL: `https://cpe.sunat.gob.pe/noticias/comprobantes-desde-los-sistemas-del-contribuyente`
- SUNAT RS 141-2017 Anexo 1 - "Ticket POS": corresponde al esquema SEE-CF/PSE-CF para ticket POS de pago, no a la representacion impresa de la factura/boleta CPE emitida por este ERP. URL: `https://www.sunat.gob.pe/legislacion/superin/2017/anexo1-141-2017.pdf`
- SUNAT Reglamento de Comprobantes de Pago, Capitulo III, y orientacion de boleta/preguntas frecuentes: la boleta mayor a S/ 700 debe consignar identificacion del adquirente o usuario. Ese umbral no convierte por si solo la venta en una GRE automatica. URLs: `https://www.sunat.gob.pe/legislacion/comprob/regla/capituloIII.pdf`, `https://orientacion.sunat.gob.pe/01-preguntas-frecuentes-comprobantes-de-pago`, `https://orientacion.sunat.gob.pe/03-boleta-de-venta`

No se encontro en documentacion SUNAT oficial una medida obligatoria `80mm` o `58mm` para la representacion impresa CPE generada por sistemas del contribuyente. Por tanto:

- `80mm` queda como formato termico operativo recomendado por compatibilidad con impresoras POS comunes.
- `58mm` debe tratarse como variante operativa futura si se decide soportarla, no como requisito SUNAT.
- Lo obligatorio para SUNAT en esta parte es contenido fiscal, QR/valor resumen y consistencia con el CPE real.

## Cambios aplicados

- `apps/erp-api/src/modules/cpe/sunat-qr.util.ts`: helper unico para construir el contenido QR SUNAT con el orden oficial y generar PNG data URL.
- `apps/erp-api/src/modules/cpe/pdf-generator.service.ts`: el PDF A4 reutiliza el helper QR comun.
- `apps/erp-api/src/modules/cpe/cpe.service.ts`: `getCpeById` ahora filtra por `tenant_id` y devuelve `sunat_qr_content`, `sunat_qr_data_url` y `valor_resumen` para impresion/vista.
- `apps/web/components/pos/VentaExitosaModal.tsx`: si hay `cpe_id`, carga el CPE completo y el boton imprime CPE fiscal; si no hay CPE, imprime ticket interno pendiente.
- `apps/web/components/pos/TicketPrint.tsx`: imprime receptor, QR, valor resumen/hash, estado SUNAT y leyenda correcta; si no hay QR no afirma que sea representacion fiscal valida.
- `apps/web/components/modals/CpeViewModal.tsx`: la impresion termica desde vista CPE incluye QR SUNAT y valor resumen/hash.
- `apps/erp-api/src/modules/cpe/sunat-qr.util.spec.ts`: prueba el orden del contenido QR SUNAT y la prioridad de `valor_resumen`.
- `apps/web/lib/validations/boleta-validation.ts`, `apps/web/hooks/use-boleta-validation.ts` y `apps/web/components/ventas/BoletaGREWarning.tsx`: el aviso historico de "GRE por S/ 700" queda corregido a identificacion del adquirente/usuario. Se conservan aliases legacy para no romper imports, pero el flag `requiresGRE` queda `false` para esta regla.
- `apps/erp-api/src/modules/fiscal/sunat-fiscal.service.ts`: se elimina la advertencia falsa de factura menor a S/ 700 y se agrega validacion de RUC receptor en factura y datos del adquirente/usuario en boleta mayor a S/ 700.

## Verificacion

Ejecutado el 2026-06-17:

```powershell
pnpm --filter @erp-suite/erp-api run test -- sunat-qr.util.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api exec jest src/modules/fiscal/sunat-fiscal.service.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api run type-check
pnpm --filter @erp-suite/web run type-check
```

Resultado:

- Jest QR SUNAT: OK, 2/2 tests.
- Jest fiscal SUNAT focal: OK, 6/6 tests.
- Backend type-check: OK.
- Web type-check: OK.

## Riesgos residuales

- Falta smoke fisico con impresora termica real y navegador del cliente final.
- Si un CPE existe pero el QR no puede generarse, el POS imprime advertencia `CPE generado. QR SUNAT no disponible para impresion fiscal`, no representacion fiscal completa.
- Produccion real sigue bloqueada por los pendientes externos documentados en `docs/00_coordination/CURRENT_STATE.md` y `docs/audits/2026-06-17-sunat-secondary-sol-evidence.md`.
