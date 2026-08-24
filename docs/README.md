# Documentación del ERP

Esta carpeta contiene exactamente seis documentos canónicos. No almacena
auditorías, resultados de pruebas, inventarios generados ni memoria de agentes.

## Lectura

Para cualquier tarea:

1. Leer este archivo.
2. Leer `CURRENT_STATE.md`.
3. Leer únicamente el documento del dominio que se va a modificar.

| Documento          | Cuándo leerlo                                            |
| ------------------ | -------------------------------------------------------- |
| `CURRENT_STATE.md` | Estado vigente, migraciones y pendientes reales          |
| `ARCHITECTURE.md`  | Arquitectura, seguridad, auth, datos, offline y frontend |
| `MODULES.md`       | Flujos funcionales y límites de módulos                  |
| `OPERATIONS.md`    | Configuración, comandos, DB, observabilidad y evidencia  |
| `RELEASE.md`       | Producción, promoción, go-live, rollback y migración     |

No es obligatorio leer los seis documentos.

## Jerarquía de verdad

1. Código, migraciones y pruebas actuales verificadas.
2. `CURRENT_STATE.md`.
3. El documento canónico del dominio.
4. Evidencia técnica en `artifacts/`.
5. Historial de Git.

Un informe histórico nunca prevalece sobre código actual.

## Antes de cambiar algo

1. Identificar el dominio.
2. Revisar `CURRENT_STATE.md`.
3. Buscar con `rg` en el documento de dominio.
4. Buscar después en código y migraciones.
5. Verificar que el trabajo no esté ya cerrado.
6. Modificar y probar.
7. Actualizar sólo el documento canónico afectado.

Ejemplos:

```powershell
rg -n "inventario|stock|almacen" docs/MODULES.md docs/CURRENT_STATE.md
rg -n "tenant|RLS|cookie|offline" docs/ARCHITECTURE.md
rg -n "preflight|migracion|backup" docs/OPERATIONS.md docs/RELEASE.md
```

## Contrato de mantenimiento

- `docs/` debe conservar un máximo de seis archivos.
- No crear subdirectorios dentro de `docs/`.
- No agregar documentos fechados, handoffs, planes ni auditorías.
- No guardar CSV, JSON, XML, PDF, logs o capturas en `docs/`.
- La evidencia reproducible vive en `artifacts/`.
- Los cambios históricos se consultan con `git log` y `git show`.
- `CURRENT_STATE.md` contiene sólo estado vigente; no es un changelog.
- Una decisión estable se documenta en el archivo del dominio correspondiente.
- Si un contenido no cabe claramente en uno de los seis documentos, no pertenece
  a la documentación canónica.

El contrato se verifica con:

```powershell
pnpm check-docs
```

## Bases de datos

- PROD: `wypnbcptofqdmoynlonq`, único proyecto remoto autorizado y sólo para
  datos reales.
- No hay ningún otro proyecto remoto: el runtime rechaza cualquier project ref
  que no sea el de PROD. Las pruebas usan dobles o infraestructura local
  efímera y nunca se redirigen a PROD.

Antes de operar una base, leer `OPERATIONS.md` y ejecutar
`scripts/db-environment-preflight.ps1 -Environment PROD`. El runtime no carga
`.env.local` ni `.env`.

## Historial y evidencia

La documentación retirada sigue recuperable:

```powershell
git log --all -- docs
git show <commit>:<ruta-anterior>
```

Los artefactos técnicos conservados se encuentran en:

- `artifacts/audit-evidence/`
- `artifacts/db-forensics/`
- `artifacts/load-tests/`
