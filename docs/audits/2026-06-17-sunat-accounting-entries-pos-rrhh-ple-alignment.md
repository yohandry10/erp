# Alineacion SUNAT de asientos POS/RRHH/PLE - 2026-06-17

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_forense`.
>
> Leer tambien: `docs/auditoria_forense_contable_2026-05.md`, `docs/manuals/modules/FINANZAS_CONTABILIDAD.md`, `docs/manuals/modules/VENTAS_POS_FISCAL.md`, `docs/audits/2026-06-17-sunat-cpe-gre-xml-alignment.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Alcance

Se revisaron y corrigieron las rutas que generan o exponen asientos contables desde POS, RRHH, integraciones legacy, cierre anual, apertura por migracion y exportacion PLE. El objetivo fue evitar rechazos formales de PLE, duplicidad de planillas, correlativos manuales incompatibles con el trigger mensual y asientos con detalle descuadrado.

Esto no equivale a certificacion legal/productiva. Siguen siendo externos: validacion PLE real con el contribuyente, SIRE/PLAME/T-Registro reales segun regimen, y revision final del contador.

## Fuentes oficiales contrastadas

- SUNAT PLE, estructura 5.1/6.1: periodo `AAAAMM00`, correlativo con prefijo `A/M/C`, fechas `DD/MM/AAAA`, debe/haber positivos y excluyentes, y cuadre para estado `1`: `https://www.sunat.gob.pe/orientacion/amazon/ple/RS-169-2015-SUNAT-PLEver5.pdf`.
- SUNAT SIRE: RVIE/RCE se construye desde CPE y propuesta para IGV; estructuras de reemplazo publicadas por SUNAT: `https://cpe.sunat.gob.pe/node/139`, `https://cpe.sunat.gob.pe/estructura-de-archivos`.
- SUNAT IGV: tasa general 18% y metodo debito contra credito fiscal: `https://orientacion.sunat.gob.pe/3053-concepto-tasa-y-operaciones-gravadas-igv-empresas`, `https://orientacion.sunat.gob.pe/3111-06-credito-fiscal`.
- SUNAT Planilla Electronica: T-Registro y PLAME contienen ingresos, descuentos, dias/horas y conceptos tributarios/no tributarios: `https://emprender.sunat.gob.pe/principales-impuestos/planilla/planilla-electronica`.
- MEF PCGE: fuente oficial de documentos del Plan Contable General Empresarial: `https://www.mef.gob.pe/es/contabilidad-publica-sp-6700/388-documentacion/2501-plan-contable-general-empresarial`.

## Cambios aplicados

- `apps/erp-api/src/modules/contabilidad/services/ple-export.service.ts`: fechas PLE ahora salen `DD/MM/AAAA`; correlativo de linea ahora es `M000001`; fin de mes no depende de zona horaria.
- `apps/erp-api/src/modules/contabilidad.controller.ts`: Libro Diario usa solo `asientos_contables` canonico y ya no mezcla `asientos_contables_rrhh`; las cuentas se exponen desde `plan_cuentas.codigo/nombre`.
- `apps/erp-api/src/modules/contabilidad/services/asientos-generator.service.ts`: el generador principal ya no pre-reserva `numero_asiento`; la BD asigna secuencia/codigo. Planilla incluye aportes patronales reales: debe 621/627 contra haber 403/407/411.
- `apps/erp-api/src/modules/rrhh/planillas.service.ts`: aportes de planilla se calculan desde `total_aportes` real o suma por empleado, nunca desde descuentos; outbox usa el mismo `planillaId` como idempotencia; la cabecera ya no escribe `numero_asiento/codigo`.
- `apps/erp-api/src/modules/rrhh/rrhh-accounting-integration.service.ts`: ruta legacy exige tenant, usa totales reales, resuelve cuentas por UUID, agrega `source_event_id` y deja de escribir numeracion textual `PLAN-*`, `PAGO-*`, `LIQ-*`.
- `apps/erp-api/src/modules/cajas/services/cash-reports.service.ts`: asiento de cierre POS queda idempotente por sesion y numerado por BD; crea cuentas POS runtime si faltan.
- `apps/erp-api/src/shared/integration/accounting-entries.service.ts`: integracion legacy deja de hacer `MAX(numero_asiento)+1` y confia en el trigger; mantiene truncado e idempotencia por `source_event_id`.
- `apps/erp-api/src/modules/contabilidad/services/asientos.service.ts`: asientos manuales ya no reservan numeracion fuera de BD.
- `apps/erp-api/src/modules/contabilidad/services/periodos.service.ts`: cierre anual queda idempotente y balanceado en detalle con PCGE 89/59; ya no escribe `numero_asiento` textual.
- `apps/erp-api/src/modules/migration/importers/balance-apertura.importer.ts`: apertura por migracion usa `source_event_id/external_id` y numeracion de BD.
- `apps/erp-api/src/modules/contabilidad/services/plan-cuentas.service.ts`: fallback runtime cubre cuentas usadas por ventas/compras/RRHH/depreciacion.

## Verificacion ejecutada

- `npx tsc --noEmit --pretty false --project apps/erp-api/tsconfig.json` OK.
- `pnpm --filter @erp-suite/erp-api exec jest src/modules/contabilidad/services/periodos.service.spec.ts src/modules/contabilidad/services/asientos-generator.service.spec.ts src/modules/rrhh/rrhh-accounting-integration.service.spec.ts src/modules/cajas/services/cash-reports.service.spec.ts src/shared/integration/accounting-entries.service.spec.ts src/modules/contabilidad/services/ple-export.service.spec.ts --runInBand` OK: 6 suites, 65 tests.

## Riesgo residual

- PLE/SIRE/PLAME productivos requieren data real, regimen del contribuyente y validacion externa con SUNAT/contador.
- El flujo CPE/GRE productivo sigue bloqueado por certificado/credenciales segun `docs/audits/2026-06-17-sunat-secondary-sol-evidence.md` y `docs/audits/2026-06-17-sunat-cpe-gre-xml-alignment.md`.
- La estructura tecnica queda preparada; no declarar "100% produccion real" hasta completar los smokes externos controlados.
