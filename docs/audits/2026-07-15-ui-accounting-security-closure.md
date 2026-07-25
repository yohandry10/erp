# Cierre UI, integraciones contables y seguridad local

Fecha: 2026-07-15

## Alcance y entorno

Se verificaron los hallazgos atribuidos a Claude contra el codigo actual y se cerraron las regresiones observadas en UI, Analytics, Demo/Auth, CPE, Contabilidad, Compras, Inventario, CxP y POS. Todas las escrituras funcionales se ejecutaron exclusivamente en DEV `hbueraexcbowpfnjlppi` mediante tenants sinteticos creados por `/api/demo/create`.

No se opero, consulto, migro ni modifico PROD `wypnbcptofqdmoynlonq` durante este cierre. La separacion y purga previa de datos demo en PROD sigue documentada en `docs/audits/2026-07-14-prod-demo-data-cleanup.md`.

## Verificacion de los hallazgos externos

| Afirmacion | Resultado verificado |
|---|---|
| El tema oscuro no se aplicaba al elemento `html` | Falso en el codigo vigente: el layout ya sincronizaba `data-erp-theme` en contenedor y `html` |
| Existia un `filter: invert(1)` global como causa principal | No reproducido ni localizado como causa vigente |
| Habia superficies blancas y texto de bajo contraste en dark | Cierto: quedaban colores literales y componentes sin tokens semanticos en pantallas de Ventas, Compras, Finanzas y reportes |
| Podian persistirse JWT/credenciales en Web Storage | Historicamente cierto y cerrado el 2026-07-14; el smoke actual confirma ausencia de JWT, Bearer, password, secret y API key |
| El demo generado no quedaba completamente operativo | Cierto: habia resolucion fragil del PFX compilado, carrera almacen/productos, JWT sin sesion revocable y serializacion `Buffer` incompatible con `bytea` |
| CPE/CxC podia quedar sin trazabilidad exacta hacia el asiento | Cierto: `factura.emitida` no era canonico en el EventBus y el primer outbox sustituia el UUID fiscal |

## Cierres aplicados

- Tema dark/light alineado con tokens semanticos en modales, formularios, tablas, tarjetas y reportes señalados por las capturas.
- Analytics usa fechas aplicadas estables al exportar CSV y bloquea controles hasta terminar hidratacion.
- Demo resuelve el PFX tanto desde fuente como desde `dist`, crea el almacen antes de existencias, emite sesiones revocables mediante `AuthService` y cifra certificado/clave.
- Certificados se escriben a Postgres como `\\x<hex>`; el lector recupera tambien el formato Node Buffer JSON legado.
- `factura.emitida` es evento canonico: conserva el mismo `eventId` en CPE, outbox y `asientos_contables.source_event_id`.
- Se mantienen los cierres de los seis defectos funcionales: evento contable idempotente, existencias demo, CxP desde OC a credito, worker CPE para tenant demo, estado CPE `FIRMADO`, y Analytics monetario por categoria.
- Los controladores de Compras quedaron sin wrappers `catch` que solo relanzaban, eliminando los errores efectivos de ESLint sin cambiar comportamiento.

## Evidencia ejecutada

- Smoke visual/seguridad `scripts/qa/ui_theme_storage_smoke.py`: 18 combinaciones (9 rutas por dark/light), 0 rutas fallidas, 0 `pageerror`, 0 errores de consola y 0 hallazgos de storage. Reporte: `artifacts/ui-theme-smoke/report.json`.

### Addendum de arquitectura visual 2026-07-16

- Las clases globales legacy del dashboard y los neutrales literales cubiertos por compatibilidad se migraron a Tailwind/tokens semanticos.
- `apps/web/styles/dashboard-primitives.css` y `apps/web/styles/theme-compat.css` fueron eliminados; el gate impide reintroducirlos.
- Revalidacion: build 111/111, Playwright de contrato 2/2 y smoke adicional de 14 combinaciones ruta/tema con 0 superficies incompatibles, 0 `pageerror` y 0 errores de consola. Evidencia: `artifacts/ui-theme-migration/report.json`.
- Analytics E2E: 2/2 pruebas pasan (datos reales por tenant/fecha y CSV descargable con metricas reales).
- CPE E2E: 1/1 pasa; cubre CPE directo, CxC, asiento unico con detalle, anulacion/nota de credito, reenvio, PDF, boleta POS e idempotencia.
- Verticales DEV: 3/3 pasan en 7.2 min:
  - Compras: OC, aprobacion segregada, recepcion, inventario, Kardex, CxP, SIRE y devolucion.
  - Contabilidad: operaciones economicas, asientos, libros y periodos coherentes.
  - POS: ticket, pagos, stock, Kardex, CPE/cola, caja y asiento.
- API Jest: 118 suites y 1085 pruebas pasan.
- Typecheck API/web: OK.
- Lint API: 0 errores (208 warnings historicos); lint web: 0 errores y 1 warning historico en `useWizard.ts`.
- Build API y build web: OK.
- Gate UI/CSS: 0 criticos.
- Codificacion: 607 archivos, 0 problemas.

## Riesgo residual y significado de readiness

Este cierre demuestra coherencia tecnica y funcional en DEV; no equivale a certificacion legal, fiscal ni operacion productiva. Permanecen externos los secretos productivos finales, certificado autorizado para el RUC real, GRE REST/SUNAT segun alcance, PLE/PLAME/SIRE con datos reales y smoke productivo controlado autorizado.
