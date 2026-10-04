# Aceptación funcional Perú por módulo — 03/10/2026

No hay aceptación integral de lanzamiento. Los casos se vinculan a operaciones concretas en la matriz API; navegación y controles visibles describen la oferta y no demuestran ejecución. Sólo Analytics excluido; reportes operativos, contables y tributarios incluidos.

Último cierre completo: #139, 0fe3881e/esquema 569: contabilidad con 7 defectos corregidos (cuentas PE conciliables, conciliación reintentable, lecturas 503, período 400), checks completos, 569 promovida una vez, main 37223140493 (422 HTTP, 32 UI) y runtime verificado al tercer intento. Usuarios, finanzas, RRHH y documentos: 11 defectos corregidos en rama, sin migración. Anterior: #138, 624ca0b2/esquema 568: compras con 7 defectos corregidos. Anterior: #137, 0d6df0ee/esquema 567: ventas con 10 defectos corregidos. Anterior: #136, 4f946dfb/esquema 566: caja con 20 defectos corregidos, 28 checks, 566 promovida una vez, main 37162507679/E2E/seguridad y runtime verificado tras dos timeouts de 20 s por arranque en frío. Anterior: #135, 8d717bcf/esquema 565: 28 checks, CI 342 API/31 UI sin reintentos, SQL fresco, barridos, restore; main 37152767852, E2E y seguridad aprobados; runtime exacto verificado tras un primer timeout de 20 s. #134 (9e301e2a/564) no cerró main: dos OOM de Next dev. Histórico: #133, 19fa239d/esquema 563. #134 promovió 564 una vez; sus CI de fuente c0f055eb pasaron 316 API/30 UI y su main no cerró por OOM. La 565 se ensayó con rollback y preservación de 42 tablas antes de su promoción única. Render: plan efectivo y continuidad sin confirmar. No hubo datos sintéticos de negocio en PROD.

| Dominio de código | Contratos declarados | HTTP observado | Operaciones con casos funcionales | Aceptación completa |
|---|---:|---:|---:|---|
| audit-logs | 5 | 4 | 0 | Pendiente |
| auth | 11 | 5 | 1 | Pendiente |
| cajas | 28 | 28 | 28 | Pendiente |
| compras | 43 | 40 | 40 | Pendiente |
| configuracion | 13 | 4 | 4 | Pendiente |
| configuracion-fiscal | 1 | 0 | 0 | Pendiente |
| configuration | 16 | 8 | 7 | Pendiente |
| contabilidad | 124 | 98 | 41 | Pendiente |
| cpe | 43 | 13 | 13 | Pendiente |
| dashboard | 3 | 0 | 0 | Pendiente |
| demo | 8 | 1 | 0 | Pendiente |
| documentos | 15 | 1 | 0 | Pendiente |
| finanzas | 49 | 23 | 21 | Pendiente |
| gre | 17 | 16 | 16 | Pendiente |
| help | 2 | 0 | 0 | Pendiente |
| import-export | 5 | 0 | 0 | Pendiente |
| infraestructura | 7 | 0 | 0 | Pendiente |
| inventario | 36 | 24 | 20 | Pendiente |
| metrics | 2 | 0 | 0 | Pendiente |
| migration | 12 | 11 | 4 | Pendiente |
| notifications | 7 | 0 | 0 | Pendiente |
| observability | 5 | 0 | 0 | Pendiente |
| paises | 7 | 0 | 0 | Pendiente |
| permissions | 1 | 0 | 0 | Pendiente |
| pos | 17 | 16 | 15 | Pendiente |
| reports | 3 | 0 | 0 | Pendiente |
| retenciones | 8 | 7 | 7 | Pendiente |
| roles | 9 | 5 | 4 | Pendiente |
| rrhh | 78 | 36 | 31 | Pendiente |
| security | 9 | 0 | 0 | Pendiente |
| sire | 7 | 5 | 0 | Pendiente |
| sucursales | 8 | 8 | 7 | Pendiente |
| tenants | 11 | 2 | 1 | Pendiente |
| users | 13 | 5 | 5 | Pendiente |
| usuarios | 10 | 0 | 0 | Pendiente |
| usuarios-sistema | 10 | 0 | 0 | Pendiente |
| validations | 5 | 0 | 0 | Pendiente |
| ventas | 68 | 61 | 51 | Pendiente |
| webhooks | 1 | 0 | 0 | Pendiente |

Los 11 contratos específicos de Argentina/Colombia identificados en el artefacto de aplicabilidad se conservan como variantes de país; los otros 706 tampoco equivalen automáticamente a oferta comercial Perú, porque incluyen infraestructura y administración. El JSON conserva los pendientes de las 717 operaciones y los enlaces realmente renderizados para ADMIN Perú.

## Comprobaciones que requieren acceso externo

- Plan contratado de Render: acceso administrativo; no se autoriza contratar servicios.
- Aceptación/acuse SUNAT y hardware físico: entorno y accesos del futuro cliente. El onboarding técnico se prueba con empresas y certificado desechables locales; no se solicita un emisor real.

## Evidencia

- `peru-integrated-local-gre-20261003`: ensayo real API/UI/DB y restore; 22 casos API y tres recorridos GRE.
- `peru-storage-ci-37139151230`: API/UI/DB/blobs locales; proveedor remoto sin aceptación por inferencia.
- `peru-integrated-main-37152767852`: main exacto de #135, 342 HTTP/31 UI y restore.
- `peru-integrated-main-37218136805`: main exacto de #138, 409 HTTP/32 UI y restore.
- `peru-integrated-main-37223140493`: main exacto de #139, 422 HTTP/32 UI y restore.
- `peru-cash-canonical-local-20261003` y `peru-cash-operation-matrix-20261003.json`: caja canónica local y sus 28 operaciones.
- `peru-operation-acceptance-cases-20260930.json`: qué se probó y variantes pendientes.
- `peru-functional-defects-20260930.json`: reproducción, corrección y estado de cada defecto.
- `peru-api-operation-matrix-20260930.json` y `peru-ui-operation-matrix-20261002.json`: operaciones y controles trazables.
