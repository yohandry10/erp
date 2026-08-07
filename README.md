# ERP Suite

ERP multi-tenant para Perú con ventas, POS, CPE/GRE/SIRE, compras,
inventario, finanzas, contabilidad, RRHH y cliente desktop offline.

## Componentes

| Ruta           | Componente                         |
| -------------- | ---------------------------------- |
| `apps/web`     | Next.js 15 y Tauri                 |
| `apps/erp-api` | API NestJS                         |
| `apps/worker`  | Jobs y colas                       |
| `libs`         | DTO y criptografía compartida      |
| `supabase`     | PostgreSQL, migraciones, RLS y RPC |

## Inicio rápido

Requisitos: Node.js 18+, pnpm 9 y variables de entorno de DEV.

```powershell
pnpm install
pnpm dev
```

Comandos principales:

```powershell
pnpm type-check
pnpm build
pnpm test
pnpm lint
pnpm test:ui-styles
pnpm check-encoding
pnpm desktop:dev
pnpm desktop:build
```

## Entornos

| Entorno | Supabase               | Uso                    |
| ------- | ---------------------- | ---------------------- |
| DEV     | `hbueraexcbowpfnjlppi` | Desarrollo, QA y demos |
| PROD    | `wypnbcptofqdmoynlonq` | Sólo datos reales      |

No operar una base sin ejecutar primero:

```powershell
.\scripts\db-environment-preflight.ps1 -Target DEV
.\scripts\db-environment-preflight.ps1 -Target PROD
```

Usar únicamente el target autorizado. PROD nunca usa `.env.local`.

## Documentación

La documentación canónica está limitada a seis archivos:

- [Índice](docs/README.md)
- [Estado actual](docs/CURRENT_STATE.md)
- [Arquitectura y seguridad](docs/ARCHITECTURE.md)
- [Módulos y flujos](docs/MODULES.md)
- [Operación y base de datos](docs/OPERATIONS.md)
- [Release y producción](docs/RELEASE.md)

Para una tarea nueva se leen el índice, el estado actual y sólo el documento de
dominio aplicable.

## Estructura

```text
apps/
  erp-api/
  web/
  worker/
libs/
supabase/
  migrations/
scripts/
artifacts/
docs/
```

`artifacts/` contiene evidencia técnica e inventarios reproducibles; no es
documentación canónica. El historial documental anterior se conserva en Git.

## Seguridad

- Aislamiento por tenant y RLS.
- Sesión web mediante cookie HttpOnly.
- Secretos locales Tauri cifrados.
- Service role sólo en backend.
- Operaciones fiscales y financieras fallan cerrado.
- Datos sintéticos prohibidos en PROD.

Consulta [Arquitectura](docs/ARCHITECTURE.md) y
[Operación](docs/OPERATIONS.md) antes de cambiar auth, RLS o infraestructura.

## Estado

El código core se encuentra en estado release candidate. Los bloqueantes y el
rango de migraciones pendiente de PROD se mantienen únicamente en
[Estado actual](docs/CURRENT_STATE.md).
