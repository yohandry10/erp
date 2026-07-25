# Informe QA UI - 2026-07-20

## Entorno y alcance

- Entorno: DEV (`hbueraexcbowpfnjlppi`), validado con `db-environment-preflight.ps1`.
- PROD no fue consultado ni modificado.
- Navegador: Codex In-app Browser.
- Viewports: escritorio `1183x1224` y movil `390x844`.
- Temas: oscuro y claro.
- API: `live=200`, `ready=200`; Redis local ausente, API ejecutada en fallback in-memory para QA.
- Flujo: login, creacion de tenant demo DEV, wizard y navegacion autenticada sin operaciones fiscales/contables mutantes.

## Resultado

Los siete hallazgos iniciales y los ocho defectos adicionales cerrables de la segunda pasada quedaron corregidos y verificados en DEV. El contrato automatizado de tema cubre ahora contraste, persistencia, superficies, cabecera responsive, selects shadcn, diálogos y navegación de reportes; el build de producción y el type-check web concluyeron correctamente. Se conserva un inventario explícito de overlays manuales heredados para migración incremental, sin afirmar que todo el ERP ya usa `Dialog`. PROD no fue consultado ni modificado.

# Plan

Corregir los siete hallazgos QA sin reintroducir CSS de compatibilidad: usar tokens semanticos, primitivas shadcn y composicion responsive. Cada tarea se marca terminada solo despues de pasar gates estaticos y verificacion renderizada en dark/light y escritorio/movil.

## Scope
- In: QA-UI-001..007, controles globales `Online`/sincronizacion/notificaciones/tema, banner demo, pruebas de regresion y nuevas capturas.
- Out: cambios funcionales fiscales/contables, escrituras PROD, rediseño de marca completo o migracion Tailwind 4.

## Action items
- [x] QA-UI-001: reemplazar texto neutral `text-white`/cyan fijo por tokens adaptativos en las rutas afectadas y ampliar el contrato E2E para medir contraste de texto.
- [x] QA-UI-002: recomponer banner demo y cluster global (`Online`, sincronizacion, notificaciones, tema y conversion) sin posicionamiento conflictivo en escritorio ni movil.
- [x] QA-UI-003: migrar filtros de Conciliacion Bancaria a `Label` + `Select` shadcn con alturas, foco y espaciado del sistema.
- [x] QA-UI-004: convertir la navegacion de Reportes de Ventas en un patron responsive legible, sin scrollbar nativo crudo ni opciones ocultas.
- [x] QA-UI-005: invalidar/refrescar metricas al completar una demo y confirmar que Dashboard/POS coinciden desde la primera entrada.
- [x] QA-UI-006: impedir que Recharts monte `ResponsiveContainer` antes de disponer de dimensiones validas.
- [x] QA-UI-007: sustituir emojis decorativos de Planillas por iconos Lucide coherentes y accesibles.
- [x] Ejecutar `test:ui-styles`, type-check, build, `theme-contract.spec.ts` y QA visual dark/light en escritorio y `390x844`.
- [x] Renovar capturas, registrar archivos modificados/resultados y marcar este plan completo.

### Segunda pasada profunda

- [x] QA-UI-008: sustituir los cinco overlays manuales de Cajas por `CashDialogFrame` sobre Radix/shadcn, con scroll interno, título/descripción accesibles y límites de `100dvh`.
- [x] QA-UI-009: migrar el alta de Candidatos y `VacanteModal` a `Dialog`, grids responsive y controles semánticos; verificar el flujo a `390x844`.
- [x] QA-UI-010: reemplazar las franjas blancas y selects nativos de Candidatos, Contratos y Pagos por cards y `Select` shadcn responsive.
- [x] QA-UI-011: reparar el botón muerto `Nuevo Contrato` mediante un formulario operativo alineado al contrato real del API; no se envió el formulario durante QA.
- [x] QA-UI-012: eliminar `darkMode = true` en Contabilidad/Estados y corregir la carrera entre instancias de `useDashboardTheme`; el tema ahora persiste entre módulos y se sincroniza por evento/storage.
- [x] QA-UI-013: elevar la jerarquía común de `Dialog`, `AlertDialog`, contenido de `Select` y botón de cierre para evitar que la barra global o headers sticky intercepten clics.
- [x] QA-UI-014: corregir contraste semántico en Cajas, Presupuestos, Contabilidad y loader POS; ajustar `primary-foreground` oscuro y `muted-foreground` claro.
- [x] QA-UI-016: eliminar el estado mixto al cambiar tema o módulo. `useDashboardTheme` usa un store externo síncrono, el cambio de tokens es atómico durante dos frames y los skeletons de Sidebar/Contratos usan superficies semánticas legibles.
- [x] Ampliar `theme-contract.spec.ts` con las rutas nuevas y verificaciones móviles de filtros/diálogos; corregir el caso real detectado en `Registro de Compras` y el cierre interceptado del diálogo.
- [ ] QA-UI-015: migrar por vertical los overlays manuales heredados restantes. El barrido estático actual devuelve 14 archivos; cuatro son infraestructura intencional (`dialog`, `alert-dialog`, sidebar y onboarding), mientras los candidatos funcionales se enumeran abajo. No bloquea este cierre y no se migró en masa para evitar regresiones funcionales.

## Riesgo residual controlado

Overlays manuales que deben migrarse de forma incremental, con prueba funcional por vertical:

- Finanzas: `dashboard/finanzas/conciliacion/[id]/ClientPage.tsx`.
- RRHH: `dashboard/rrhh/planillas/page.tsx`.
- Fiscal/documentos: `CpeViewModal.tsx`, `DocumentoModal.tsx`.
- POS/ventas: `VentaExitosaModal.tsx`, `ClienteQuickCreate.tsx`; el overlay de presentación de `dashboard/pos/page.tsx` debe conservarse como modo de pantalla completa, no tratarse automáticamente como modal.
- Superadmin: `CrearTenantModal.tsx`, `DemoTenantModal.tsx`, `ViewTenantModal.tsx`.

Ninguno de estos overlays se rompió en las rutas inspeccionadas. Se evita una conversión masiva sin pruebas de cada flujo porque varios contienen operaciones mutantes. Se preservan todos los cambios existentes del worktree y no se realiza ninguna operación PROD.

## Correcciones aplicadas

- Contraste: títulos, KPIs, descripciones, estados vacíos y tablas de Documentos, CPE, GRE, SIRE, Órdenes de Compra, CxC, CxP y Bancos usan `text-foreground`, `text-muted-foreground`, `bg-card` y variantes semánticas.
- Cabecera global: el cluster fijo fue reemplazado por una utility bar en flujo normal. Menú móvil, Online/sincronización, notificaciones, tema y banner demo mantienen separación, foco y áreas táctiles de 40-46 px.
- Banner demo: CTA principal legible, jerarquía compacta, estados normal/advertencia/expirado y cierre accesible con Lucide.
- Conciliación Bancaria: filtros y formulario migrados a `Label`, `Select`, `Input` y primitives Radix/shadcn.
- Reportes de Ventas: tabs convertidos en grid responsive con roles ARIA, selección visible y 10 opciones accesibles sin scroll horizontal.
- Demo/dashboard: invalidación de cache por tenant al finalizar el seed y primera lectura confirmada con inventario `5` y valor `S/ 4,670.50`.
- Recharts: contenedores con `minWidth=0`, altura mínima concreta y padres `min-w-0`; la consola final no registró warnings de dimensiones.
- Planillas: iconos principales, estados, acciones, vacío y modal migrados de emojis a Lucide; modal normalizado a tokens semánticos.
- Tema global: el atributo canónico se aplica antes del paint sólo a Dashboard/Superadmin/Conversión y se limpia en rutas públicas, como exige la arquitectura vigente.
- Cajas: apertura, cierre, ingreso/egreso, retiro y cambio de turno comparten un marco Radix responsive; el CTA de apertura ya es legible en tema claro.
- RRHH: Candidatos, Contratos y Pagos abandonaron las franjas blancas fijas; el alta de Contrato dejó de ser un botón sin implementación.
- Capas: `Dialog`/`AlertDialog` operan por encima de la utility bar y sus `Select` portaled; el cierre conserva clic incluso con encabezados sticky.
- Contabilidad: se eliminó el tema oscuro forzado, se corrigió la tarjeta activa `Registro de Compras` y Presupuestos usa superficies semánticas.
- Contraste global: los botones primarios oscuros usan foreground navy AA y el texto secundario claro elevó su contraste.
- Transiciones: el shell y la página ya no se pintan con temas distintos al cambiar de módulo; se eliminó el flash blanco causado por `transition-all` y el CTA del banner demo mantiene fondo blanco/texto azul sobre el gradiente en ambos temas.

## Validación de cierre

- `pnpm test:ui-styles`: PASS; `critical: []`, `compatibilityNeutralClasses: 0`, `important: 0`.
- `pnpm --filter @erp-suite/web type-check`: PASS.
- `pnpm --filter @erp-suite/erp-api type-check`: PASS.
- `pnpm --filter @erp-suite/erp-api exec jest src/modules/demo/demo.service.spec.ts --runInBand`: PASS, 2/2.
- `theme-contract.spec.ts`: PASS final, 2/2 en 2.7 min (login móvil y contrato autenticado completo), incluyendo la comprobación del primer frame después del cambio de tema. Durante el proceso detectó y permitió corregir tres regresiones reales.
- Candidatos en `390x844`: el crash transitorio `Element type is invalid` observado durante la recarga en caliente no se reproduce con el árbol de módulos final; el contrato espera el CTA `Nuevo Candidato`, abre el diálogo y comprueba que queda íntegramente dentro del viewport. El smoke global ahora falla explícitamente ante `Algo salió mal`, `Element type is invalid` o `Check the render method`, evitando falsos positivos por textos como `CandidatosPage`.
- `pnpm --filter @erp-suite/web build`: PASS; 111 páginas estáticas generadas. Las tres dependencias innecesarias de hooks en Cajas y la referencia inestable de `empleados` en RRHH fueron corregidas; el build final queda sin warnings de lint/hooks.
- QA navegador integrado: cero overflow global, cero solapamiento móvil, cero warnings/errores nuevos en consola y cero warnings de Recharts.
- Transición reproducida desde RRHH a Contratos y desde Contratos a Contabilidad/Cajas: shell, sidebar, loader y contenido conservaron el mismo tema; consola final `[]` para niveles warn/error.
- `git diff --check` global: no utilizable como gate de esta pasada por espacios finales/CRLF ya presentes en cientos de líneas del worktree compartido; no se hizo una normalización masiva que pudiera ocultar o mezclar cambios ajenos.

## Evidencia posterior a la corrección

- `documentos-fixed-dark.png`
- `documentos-fixed-light.png`
- `documentos-fixed-mobile-light.png`
- `conciliacion-fixed-light.png`
- `ventas-reportes-fixed-light.png`
- `planillas-fixed-light-loaded.png`
- `dashboard-fixed-light.png`
- `deep-cajas-light-fixed.png`
- `deep-cajas-dialog-mobile-fixed.png`
- `deep-candidato-modal-mobile-layer-fixed.png`
- `deep-contrato-modal-mobile-fixed.png`
- `deep-contabilidad-light-fixed.png`
- `deep-estados-light-fixed.png`
- `deep-presupuestos-dark-fixed.png`

## Hallazgos

### QA-UI-001 - P0 - Texto blanco invisible en tema claro

En tema claro varios encabezados y KPIs usan `text-white` sobre tarjetas blancas. El contenido existe en el DOM, pero visualmente desaparece.

Confirmado en:

- `/dashboard/documentos/`
- `/dashboard/cpe/`
- `/dashboard/gre/`
- `/dashboard/sire/`
- `/dashboard/compras/ordenes/`
- `/dashboard/finanzas/cxp/`
- `/dashboard/finanzas/cxc/`
- `/dashboard/finanzas/bancos/`

El patron estatico aparece en 9 paginas de dashboard. En CPE, el `h1` y los valores de KPI computan `color: rgb(255, 255, 255)` sobre el fondo claro `rgb(248, 250, 252)`.

Evidencia: `documentos-light.png`, `cpe-light.png`, `documentos-mobile-light.png`.

### QA-UI-002 - P0 - Barra superior inutilizable en movil

A `390x844`, el boton de menu, estado online, sincronizacion, notificaciones, tema y banner demo se superponen. El CTA `Convertir a cuenta real` queda cortado y el cierre del banner invade el cluster global.

Tambien hay solapamiento parcial en escritorio (`1183px`) entre el banner demo y el cluster fijo de estado/tema.

Raiz localizada en la combinacion de:

- `components/demo/DemoBanner.tsx`: banner flex con `md:pr-64`.
- controles globales con posicion fija en `components/layout/sidebar.tsx` y `components/ui/dashboard-theme-toggle.tsx`.

Evidencia: `dashboard-mobile-light.png`, `ventas-reportes-mobile-light.png`, `documentos-dark-settled.png`.

### QA-UI-003 - P1 - Selects sin sistema visual en Conciliacion Bancaria

Los filtros `Estado` y `Cuenta Bancaria` renderizan controles nativos sin clases ni componente shadcn, con etiquetas pegadas al control y contraste/espaciado inconsistente en ambos temas.

Raiz: `app/dashboard/finanzas/conciliacion/page.tsx`, selects nativos sin clases en el bloque de filtros.

Evidencia: `finanzas-conciliacion-dark.png`, `finanzas-conciliacion-light.png`.

### QA-UI-004 - P1 - Navegacion de reportes fuerza scroll horizontal

`/dashboard/ventas/reportes/` desborda las pestañas hasta aproximadamente `1940px` dentro de un viewport de `1183px`. El usuario debe usar una barra horizontal poco visible para alcanzar Top Clientes, Lead Time, Pipeline, Fill-rate, Aging y SUNAT KPIs.

Evidencia: `ventas-reportes-dark-settled.png`, `ventas-reportes-light.png`.

### QA-UI-005 - P2 - Dashboard inicialmente obsoleto tras crear demo

La primera entrada mostro inventario `0`, mientras POS ya exponia 5 productos con stock. Tras recargar, `/api/dashboard/stats/` devolvio `totalInventario: 5` y el dashboard se corrigio. Es una inconsistencia transitoria de cache/refresco posterior al onboarding demo.

Evidencia: `dashboard-dark.png`, `dashboard-light-settled.png`, `pos-dark.png`.

### QA-UI-006 - P2 - Advertencias recurrentes de Recharts

La consola registra repetidamente contenedores con `width(-1)` y `height(-1)` al montar/transicionar el dashboard. No genero una pantalla rota durante este barrido, pero indica medicion invalida y riesgo de graficos ausentes/flaky.

### QA-UI-007 - P3 - Lenguaje visual inconsistente en Planillas

Planillas utiliza emojis como iconos principales (bolsa, cohete) mientras el resto del ERP usa Lucide/shadcn. No bloquea el flujo, pero rompe consistencia profesional.

Evidencia: `rrhh-planillas-dark.png`.

### QA-UI-017 - P0 - Crash transitorio de React durante la migración de Candidatos

En una recarga en caliente mientras `CandidatosPage` y el diálogo compartido estaban siendo modificados, el navegador recibió un componente `undefined` y el `ErrorBoundary` mostró `Element type is invalid`. La captura corresponde a un estado intermedio de edición: los imports/exports finales de Lucide, `Dialog`, `Select`, `CandidatoFormulario` y `VacanteModal` están definidos y el flujo móvil final se valida abriendo el diálogo.

Además de cerrar el estado final, se endureció `full-ui-smoke.spec.ts`: antes el patrón de título `/Candidatos/i` podía coincidir accidentalmente con el texto técnico `CandidatosPage`; ahora cualquier pantalla de error de React falla el smoke antes de aceptar el título.

## Comprobaciones positivas

- Login y creacion de demo DEV completaron correctamente una vez disponible la API.
- API `live` y `ready` respondieron 200.
- Sin errores GET 4xx/5xx en las rutas auditadas.
- Tema oscuro no mostro superficies blancas accidentales en las rutas revisadas.
- Documentos, Analytics, Asientos, Recepciones, Planillas, CPE, POS y Conciliacion abandonaron sus loaders y mostraron estados finales.
- El viewport movil no genero scroll horizontal global; el sidebar cerrado queda fuera de pantalla de forma intencional.

## Rutas auditadas

`/dashboard/`, `/dashboard/wizard/`, `/dashboard/documentos/`, `/dashboard/ventas/reportes/`, `/dashboard/analytics/`, `/dashboard/contabilidad/`, `/dashboard/contabilidad/estados/`, `/dashboard/contabilidad/presupuestos/`, `/dashboard/contabilidad/asientos/`, `/dashboard/compras/recepciones/`, `/dashboard/rrhh/`, `/dashboard/rrhh/candidatos/`, `/dashboard/rrhh/contratos/`, `/dashboard/rrhh/pagos/`, `/dashboard/rrhh/planillas/`, `/dashboard/cajas/`, `/dashboard/cpe/`, `/dashboard/pos/`, `/dashboard/finanzas/conciliacion/`, `/dashboard/gre/`, `/dashboard/sire/`, `/dashboard/compras/ordenes/`, `/dashboard/finanzas/cxp/`, `/dashboard/finanzas/cxc/`, `/dashboard/finanzas/bancos/`.
