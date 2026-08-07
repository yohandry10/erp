# AGENTS.md

- Responde en español por defecto.
- Usa `rg` para buscar archivos o texto.
- No reviertas cambios existentes que no hayas hecho.
- No ejecutes acciones destructivas fuera del alcance solicitado.

## Lectura mínima

Antes de analizar o modificar:

1. `docs/README.md`
2. `docs/CURRENT_STATE.md`
3. Sólo uno de estos documentos, según la tarea:
   - `docs/ARCHITECTURE.md`
   - `docs/MODULES.md`
   - `docs/OPERATIONS.md`
   - `docs/RELEASE.md`

No leas toda la documentación por defecto.

## Antes de codificar

1. Identifica el dominio y revisa su documento canónico.
2. Busca con `rg` si el punto ya está cerrado o implementado.
3. Contrasta documentos con código, migraciones y pruebas actuales.
4. Preserva decisiones vigentes salvo evidencia nueva.
5. Actualiza únicamente el documento canónico afectado.

Código y migraciones verificados prevalecen sobre documentación.

## Contrato PROD-only

- PROD: `wypnbcptofqdmoynlonq`. Es el único proyecto remoto autorizado.
- DEV `hbueraexcbowpfnjlppi` está retirado y debe ser rechazado por runtime,
  scripts y CI; no se usa para desarrollo, QA ni demos.
- Antes de operar PROD, leer `docs/OPERATIONS.md` y ejecutar
  `scripts/db-environment-preflight.ps1 -Environment PROD`.
- El runtime usa `.env.production` o secretos inyectados; `.env.local` y `.env`
  no son fuentes operativas.
- Las pruebas con escritura usan dobles o infraestructura local efímera; nunca
  se redirigen a PROD.
- Todo borrado PROD exige autorización explícita, respaldo, transacción y
  evidencia posterior.

## Base de datos

Antes de aplicar migraciones:

- comprobar prefijos duplicados en `supabase/migrations`;
- revisar el rango vigente en `docs/CURRENT_STATE.md`;
- ejecutar el preflight;
- verificar RLS, permisos, locks, backfill y rollback.

Antes de borrar o reconstruir una base, consultar los artefactos de
`artifacts/db-forensics/` enumerados en `docs/OPERATIONS.md`. Son evidencia
histórica y deben contrastarse con código y migraciones actuales.

## Documentación

`docs/` tiene un máximo contractual de seis archivos:

- `README.md`
- `CURRENT_STATE.md`
- `ARCHITECTURE.md`
- `MODULES.md`
- `OPERATIONS.md`
- `RELEASE.md`

No crear subdirectorios, auditorías, handoffs, manifiestos, bitácoras ni
artefactos dentro de `docs/`.

- Estado vigente: `CURRENT_STATE.md`.
- Decisiones técnicas: `ARCHITECTURE.md`.
- Flujos funcionales: `MODULES.md`.
- Configuración y DB: `OPERATIONS.md`.
- Producción y migración: `RELEASE.md`.
- Evidencia técnica: `artifacts/`.
- Historia: Git.

## Seguridad operativa

- No expongas secretos en comandos, logs o documentación.
- No ejecutes SQL suelto contra PROD.
- No mezcles demos o seeds sintéticos con PROD.
- No uses reportes históricos como verdad sin verificar código actual.
- Conserva cambios ajenos y evita operaciones Git destructivas.
