# Coordinacion Codex / Opus

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `estado_vivo`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha de creacion: 2026-05-24

Este archivo define como deben coordinarse Codex, Opus y cualquier agente que actualice `memory.md`.

## Regla principal

La primera lectura compartida es `docs/START_HERE.md`. La fuente canonica de estado vivo vive en esta carpeta:

1. `docs/START_HERE.md`
2. `docs/00_coordination/CURRENT_STATE.md`
3. `docs/00_coordination/FLOW_STATUS.md`
4. `docs/00_coordination/AGENT_SYNC.md`

`memory.md` puede existir como memoria operativa de Opus, pero no debe contradecir estos archivos. Si Opus descubre algo nuevo y lo escribe en `memory.md`, tambien debe reflejar el cambio en `CURRENT_STATE.md` o `FLOW_STATUS.md` cuando afecte estado, migraciones, pendientes o flujo.

## Regla de cierre de tarea

Antes de dar una tarea por terminada, Codex y Opus deben revisar si el trabajo cambia cualquiera de estos puntos:

- estado global del ERP;
- estado de un flujo funcional;
- migraciones existentes, nuevas, renumeradas o aplicadas;
- pendientes reales de produccion;
- riesgos cerrados, reabiertos o reclasificados;
- rutas de documentacion o fuentes canonicas;
- evidencia de validacion nueva.

Si cambia algo de esa lista, actualizar antes de la respuesta final:

1. `docs/00_coordination/CURRENT_STATE.md`
2. `docs/00_coordination/FLOW_STATUS.md`
3. el documento fuente del flujo o auditoria correspondiente
4. `docs/DOC_NAVIGATION_MANIFEST.md` si cambia la ubicacion, rol o vigencia de documentos
5. `docs/README.md` solo si cambia la navegacion documental de alto nivel

Si la tarea no cambia estado ni flujo, dejar estos archivos intactos.

## Protocolo al iniciar sesion

1. Ejecutar `git status --short`.
2. Leer `docs/START_HERE.md`.
3. Leer `docs/00_coordination/CURRENT_STATE.md`.
4. Leer `docs/00_coordination/FLOW_STATUS.md`.
5. Leer `docs/00_coordination/AGENT_SYNC.md`.
6. Leer `docs/DOC_NAVIGATION_MANIFEST.md` si la tarea toca documentacion, auditorias o seleccion de fuentes.
7. Verificar prefijos duplicados en `supabase/migrations` antes de tocar BD.
8. Si existe `memory.md`, leerlo despues de los documentos canonicos y contrastarlo contra esta carpeta.

## Responsabilidad de cada archivo

| Archivo | Responsable logico | Que contiene |
|---|---|---|
| `START_HERE.md` | Codex + Opus | Primera lectura: resumen ejecutivo, orden de lectura, jerarquia de verdad y rutas por tarea |
| `CURRENT_STATE.md` | Codex + Opus | Estado vivo, migraciones vigentes, pendientes reales, protocolo de nueva sesion |
| `FLOW_STATUS.md` | Codex + Opus | Estado por flujo funcional, documentos fuente, migraciones clave |
| `AGENT_SYNC.md` | Codex + Opus | Reglas de coordinacion y contrato de memoria |
| `memory.md` | Opus, si lo usa | Notas operativas de sesion, pero no fuente final si contradice coordinacion |
| Auditorias en `docs/` | Quien cierre el flujo | Evidencia detallada por dominio |
| `docs/archive/` | Codex + Opus | Historicos preservados; no son verdad vigente sin contraste |

## Regla para cambios de estado

Actualizar estos archivos cuando ocurra cualquiera de estos casos:

- Se agrega, renumera, elimina o aplica una migracion.
- Se cierra o reabre un riesgo de flujo.
- Se cambia la decision de produccion/readiness.
- Se ejecuta validacion real en remoto o con credenciales productivas.
- Se descubre que una auditoria/manual esta obsoleto.

Orden recomendado:

1. Actualizar documento fuente detallado o auditoria.
2. Actualizar `FLOW_STATUS.md` si cambia un flujo.
3. Actualizar `CURRENT_STATE.md` si cambia el estado global, migraciones o pendientes.
4. Actualizar `docs/START_HERE.md` si cambia el resumen ejecutivo, jerarquia o rutas de lectura.
5. Actualizar `docs/DOC_NAVIGATION_MANIFEST.md` si cambia la ubicacion, rol o vigencia de documentos.
6. Actualizar `docs/README.md` solo si cambia la navegacion o aparece una fuente canonica nueva.
7. Si Opus mantiene `memory.md`, sincronizar una nota corta apuntando a los archivos canonicos.

## Mensaje corto para Opus

Leer siempre primero:

```text
docs/START_HERE.md
docs/00_coordination/CURRENT_STATE.md
docs/00_coordination/FLOW_STATUS.md
docs/00_coordination/AGENT_SYNC.md
```

Si actualizas `memory.md`, no lo uses como unica verdad. Cualquier cambio de estado, migracion, flujo cerrado/reabierto o pendiente real debe quedar tambien en `CURRENT_STATE.md` o `FLOW_STATUS.md`. No mover ni reescribir auditorias/manuales sin actualizar `docs/DOC_NAVIGATION_MANIFEST.md` y los enlaces de alto nivel desde `docs/README.md`.
