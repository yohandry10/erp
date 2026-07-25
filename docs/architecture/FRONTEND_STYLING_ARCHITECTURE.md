# Arquitectura de estilos frontend

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `arquitectura_frontend`.
>
> Leer tambien: `docs/audits/2026-07-15-ui-accounting-security-closure.md`, `docs/audits/2026-07-15-dependency-and-large-file-cleanup.md`.
<!-- DOC-NAV:END -->

Fecha de actualizacion: 2026-07-16.

## Decision vigente

El frontend usa **Tailwind CSS 3.4 + shadcn/ui (Radix)**. No se migra a Tailwind 4 dentro de este cierre porque seria una migracion independiente con cambios de compilacion y configuracion.

El CSS global no se elimina por completo. Su alcance permitido queda limitado a directivas Tailwind, tokens y base del documento. Las pantallas y componentes usan utilidades Tailwind, tokens semanticos y primitivas shadcn; no existen hojas de compatibilidad para clases heredadas de dashboard ni para corregir colores literales.

## Propiedad de archivos

| Archivo | Responsabilidad | Regla |
|---|---|---|
| `apps/web/app/globals.css` | Directivas Tailwind, tokens shadcn, contrato dark/light y base del documento | No agregar estilos de paginas ni modales |
| `apps/web/components/ui/*` | Primitivas shadcn/Radix y variantes del design system | Camino por defecto para Dialog, AlertDialog, Button, Input, Select, Card y Table |
| `apps/web/hooks/use-dashboard-theme.ts` | Estado, persistencia y sincronizacion del tema en `<html>` | Clave unica `erp-dashboard-theme`; valores validos `dark` y `light` |
| `apps/web/components.json` | Contrato de shadcn CLI y aliases | Mantener CSS variables y aliases `@/components/ui`, `@/lib/utils` |
| `scripts/migrations/migrate-*.mjs` | Codemods repetibles de clases legacy, colores semanticos, texto adaptativo y escalas Tailwind | Deben permanecer idempotentes: dry-run con cero archivos al terminar |
| `scripts/audit-frontend-styles.mjs` | Gate que impide reintroducir las capas y clases heredadas | Toda reaparicion de CSS compatible o clase legacy es critica |

## Contrato de tema

- El atributo canonico es `html[data-erp-theme="dark|light"]`.
- Tailwind usa `darkMode: ['selector', '[data-erp-theme="dark"]']`.
- Los portales Radix leen tokens desde `<html>`; no dependen de un contenedor de pagina.
- `DialogContent`, `AlertDialogContent`, cards, inputs y tablas deben usar `bg-background`/`bg-card`, `text-foreground`/`text-card-foreground` y `border-border`.
- No usar `bg-white` para una superficie funcional dentro del dashboard. Si una superficie debe ser clara por requerimiento (por ejemplo, impresion), debe estar aislada y justificada.
- El hook limpia `data-erp-theme` al salir del dashboard, pero conserva la preferencia en almacenamiento local.

## Reglas para codigo nuevo

1. Buscar primero una primitiva en `components/ui`.
2. Componer con Tailwind y tokens semanticos.
3. Usar `cn()`/CVA para variantes; no concatenar CSS global nuevo.
4. Dialogos: Radix `Dialog` o `AlertDialog`; nunca overlays manuales con `position: fixed`.
5. Botones: `Button`; variantes disponibles `default`, `destructive`, `success`, `warning`, `outline`, `secondary`, `ghost` y `link`.
6. CSS dedicado solo cuando una interaccion compleja no sea legible con utilidades. Debe quedar junto al componente o en una capa compartida con propietario explicito.
7. No agregar `!important`.
8. No ejecutar codemods masivos sin type-check, build y prueba renderizada por lote.

## Gates obligatorios

```powershell
pnpm test:ui-styles
pnpm --filter @erp-suite/web type-check
pnpm --filter @erp-suite/web build
pnpm --filter @erp-suite/web exec playwright test tests/e2e/theme-contract.spec.ts --config=playwright.theme.config.ts
```

`theme-contract.spec.ts` valida login movil, persistencia y limpieza del tema, Dialog, rutas representativas de Documentos, Ventas, Compras, RRHH, CPE, POS y Contabilidad, y ausencia de superficies grandes con neutral claro en dark o neutral oscuro en light.

## Cierre de la migracion 2026-07-16

- `globals.css`: **2546 -> 193 lineas**; el aumento final respecto del corte intermedio corresponde a base semantica para controles nativos.
- `!important`: **102 -> 0**.
- Clases legacy de dashboard detectadas por el gate: **0**.
- Clases literales neutrales cubiertas antes por el puente: **0**.
- Utilidades numericas de texto/radio no compilables (`text-3`, `rounded-2`, etc.): **1343 -> 0**.
- `dashboard-primitives.css` y `theme-compat.css`: **eliminados**; `layout.tsx` ya no los importa.
- Los cuatro codemods de migracion terminan en dry-run con **0 archivos por cambiar**.
- Dialogos de confirmacion, prompt, compras, conciliacion, planillas y caja migrados a shadcn/Radix.
- Build Next: 111/111 paginas generadas.
- Playwright de contrato: 2/2 en ambos temas.
- Smoke renderizado adicional: 14 combinaciones ruta/tema, 8 capturas, 0 superficies incompatibles, 0 `pageerror` y 0 errores de consola; evidencia en `artifacts/ui-theme-migration/report.json`.

Los colores funcionales (estados, graficas, impresion o integraciones) pueden seguir usando valores explicitos cuando sean parte del contrato visual, pero nunca deben emplearse para superficies neutrales adaptativas. El gate distingue esa deuda visual general de los dos bloqueadores de tema, que deben permanecer en cero.
