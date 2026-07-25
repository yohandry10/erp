# Protocolo anti-duplicacion para agentes

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `protocolo_agente`.
>
> Leer tambien: `docs/00_coordination/DECISIONS.md`, `docs/DOC_NAVIGATION_MANIFEST.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha de actualizacion: 2026-06-04

Este documento existe para evitar el error recurrente de hacer auditorias repetidas, crear codigo que ya existe o revivir falsos positivos historicos.

## Regla obligatoria

Antes de analizar, auditar, codificar, crear migraciones o proponer cambios, el agente debe probar que el tema no esta ya resuelto, documentado o decidido.

No basta con buscar en codigo. Primero se busca en la documentacion canonica y en el mapa documental.

## Recibo obligatorio de lectura

La primera respuesta operativa de una sesion debe incluir una linea de recibo:

```text
Leido: START_HERE, CURRENT_STATE, FLOW_STATUS, AGENT_SYNC, ANTI_DUPLICATION_PROTOCOL, DECISIONS, DOC_NAVIGATION_MANIFEST.
Fuente de dominio: <documento fuente leido o pendiente de identificar>.
```

Si una respuesta propone un analisis sin mencionar `ANTI_DUPLICATION_PROTOCOL`, `DECISIONS` y `DOC_NAVIGATION_MANIFEST`, se considera incompleta. El agente debe detenerse, leer lo faltante y rehacer la propuesta.

## Plantilla obligatoria para propuestas de analisis

Toda propuesta de analisis debe iniciar con este bloque:

```text
RECIBO DE LECTURA
- Base leida: START_HERE, CURRENT_STATE, FLOW_STATUS, AGENT_SYNC, ANTI_DUPLICATION_PROTOCOL, DECISIONS, DOC_NAVIGATION_MANIFEST.
- Fuente de dominio leida: <archivo(s)>.
- Busqueda anti-duplicacion ejecutada: <rg usado o pendiente justificado>.
- Ya cerrado/no reanalizar: <puntos cerrados segun FLOW_STATUS/DECISIONS/CURRENT_STATE>.
- Analisis propuesto: <solo puntos no cerrados, externos, riesgos residuales o cambios solicitados>.
```

Una respuesta sin este bloque no cumple el protocolo. El agente debe corregirse antes de diagnosticar, planificar o modificar codigo.

## Criterio de invalidez

La respuesta se considera invalida si:

- dice "lei toda la doc" sin listar documentos;
- propone analisis de un flujo cerrado sin explicar por que se reabre;
- ignora una decision vigente de `DECISIONS.md`;
- usa una auditoria historica como fuente principal;
- no muestra busqueda anti-duplicacion;
- pasa directo a codigo sin ubicar fuente de dominio.

## Orden anti-duplicacion

1. Leer `docs/START_HERE.md`.
2. Leer `docs/00_coordination/CURRENT_STATE.md`.
3. Leer `docs/00_coordination/FLOW_STATUS.md`.
4. Leer `docs/00_coordination/AGENT_SYNC.md`.
5. Leer `docs/00_coordination/DECISIONS.md`.
6. Buscar el dominio en `docs/DOC_NAVIGATION_MANIFEST.md`.
7. Leer el documento fuente del dominio y sus `Leer tambien`.
8. Buscar con `rg` en docs por palabras clave del problema, endpoint, tabla, RPC, flujo, migracion o decision.
9. Solo despues buscar en codigo con `rg`.
10. Antes de cambiar codigo, verificar si existe una implementacion, test, migracion, RPC, helper o decision previa que ya cubra el caso.

## Preguntas que el agente debe responderse antes de tocar codigo

- ¿Este flujo aparece como cerrado, parcial o externo en `FLOW_STATUS.md`?
- ¿Hay una decision en `DECISIONS.md` que explique por que esta asi?
- ¿Hay una auditoria reciente que haya cerrado o reclasificado este hallazgo?
- ¿El documento que estoy leyendo es vigente o historico?
- ¿El supuesto fallo existe en codigo actual con archivo/linea?
- ¿Hay tests existentes que ya cubren el comportamiento?
- ¿Estoy creando una segunda forma de hacer algo que ya tiene una primitiva canonica?

## Busquedas minimas recomendadas

```powershell
# Estado y decisiones
rg -n "palabra_clave|modulo|endpoint|tabla|RPC|decision|pendiente|cerrado|deuda" docs/START_HERE.md docs/00_coordination docs/DOC_NAVIGATION_MANIFEST.md docs/README.md

# Auditorias y manuales vigentes
rg -n "palabra_clave|endpoint|tabla|RPC|permiso|tenant|offline|CPE|GRE|POS" docs -g "*.md"

# Codigo solo despues de ubicar la fuente documental
rg -n "nombreFuncion|endpoint|tabla|rpc|permiso|tenant_id|WorkerAuthGuard|CurrentTenant" apps supabase
```

## Regla de falsos positivos

Un hallazgo no se reporta como bug si no cumple los tres puntos:

1. Se verifico en codigo actual o migracion actual.
2. Tiene archivo/linea o SQL/objeto exacto.
3. No esta cerrado/reclasificado en `CURRENT_STATE.md`, `FLOW_STATUS.md`, `DECISIONS.md` o una auditoria vigente.

Si una herramienta externa reporta algo, se documenta como `pendiente de verificacion` hasta contrastarlo contra codigo.

## Regla de codigo existente

Antes de crear una nueva funcion, tabla, RPC, hook, servicio o flujo:

- buscar nombres equivalentes;
- buscar aliases legacy;
- buscar migraciones que ya hayan creado el contrato;
- buscar tests que indiquen el comportamiento esperado;
- confirmar en `DECISIONS.md` si ya se eligio una arquitectura.

Si existe una primitiva canonica, se reutiliza. Si se necesita reemplazarla, documentar por que la anterior no alcanza.

## Regla para auditorias

Las auditorias nuevas deben empezar con una seccion `Fuentes leidas` que liste:

- documentos canonicos leidos;
- documentos de dominio leidos;
- busquedas `rg` relevantes;
- archivos de codigo verificados.

No crear auditorias exhaustivas nuevas si ya existe una vigente para el dominio. En ese caso, actualizar la auditoria existente o crear un complemento fechado que diga exactamente que cambia.

## Regla de cierre

Si se confirma que algo ya estaba resuelto:

- no tocar codigo;
- documentar en la respuesta la evidencia;
- si el punto puede confundir a futuros agentes, agregarlo a `DECISIONS.md` o al documento fuente del dominio.

Si se corrige algo real:

- agregar test cuando sea razonable;
- actualizar el documento fuente o auditoria;
- actualizar `FLOW_STATUS.md` si cambia el estado de un flujo;
- actualizar `CURRENT_STATE.md` si cambia el estado global;
- actualizar `DECISIONS.md` si se tomo una decision que no debe rediscutirse.
