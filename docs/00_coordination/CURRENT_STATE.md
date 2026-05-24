# Estado Actual del ERP

Fecha de actualizacion: 2026-05-24

Este documento es la entrada canonica para recuperar contexto al iniciar una sesion nueva. No reemplaza las auditorias, manuales ni reportes; solo indica que leer primero y cual es la linea vigente.

## Lectura obligatoria al iniciar

1. `docs/00_coordination/CURRENT_STATE.md`
2. `docs/00_coordination/FLOW_STATUS.md`
3. `docs/db_rebuild_status.md`
4. `docs/production-readiness/ERP_PRODUCTION_READINESS.md`
5. `docs/CODEX_HANDOFF_2026-05-24.md`

Si la sesion toca base de datos, tambien consultar los artefactos baseline listados en `AGENTS.md` antes de borrar, reconstruir o aplicar migraciones.

## Estado ejecutivo

- ERP validado tecnicamente en entorno local/sandbox; no declarar produccion real absoluta sin certificado SUNAT/OSE productivo, secretos productivos, email real si aplica y smoke externo autorizado.
- Readiness base: Gate 21/22 documentado al 2026-05-16 en `docs/production-readiness/ERP_PRODUCTION_READINESS.md`.
- Despues del corte de readiness existen auditorias forenses y migraciones posteriores. El head documental actual debe considerar `327..335`.
- El worktree contiene muchos cambios previos del usuario/de sesiones anteriores. No revertir ni stagear archivos por inercia.

## Migraciones vigentes

- Reconstruccion base documentada: `000..305`.
- Gates remotos/manuales aplicados el 2026-05-16: `312..326`.
- Auditorias y cierres posteriores en repo local: `327..335`.
- La colision local de prefijo `333__` fue resuelta:
  - `333__inventory_stock_reconciliation_hardening.sql`: inventario/logistica/costeo.
  - `334__treasury_cash_bank_forensic_closure.sql`: tesoreria/caja/bancos/CxC/CxP.
  - `335__descontar_stock_authoritative.sql`: ajuste autoritativo posterior de salida de stock.
- Antes de aplicar o reconstruir BD, verificar siempre que no existan prefijos duplicados en `supabase/migrations`.

Comando de verificacion de prefijos en PowerShell:

```powershell
Get-ChildItem -Path supabase\migrations -Filter *.sql |
  Group-Object { $_.Name.Substring(0,3) } |
  Where-Object { $_.Count -gt 1 } |
  Select-Object Name,Count,@{Name='Files';Expression={($_.Group.Name -join ', ')}}
```

## Fuentes canonicas por tema

| Tema | Fuente primaria | Notas |
|---|---|---|
| Estado actual y siguiente sesion | `docs/00_coordination/CURRENT_STATE.md` | Entrada obligatoria |
| Estado por flujo | `docs/00_coordination/FLOW_STATUS.md` | Matriz de cierre y pendientes |
| Reconstruccion BD base | `docs/db_rebuild_status.md` | Historico `000..305`; no usar solo para produccion |
| Readiness local/sandbox | `docs/production-readiness/ERP_PRODUCTION_READINESS.md` | Gate 21/22 y decision de no produccion real absoluta |
| Contabilidad/fiscal | `docs/auditoria_forense_contable_2026-05.md` | Cierre tecnico, legal externo pendiente |
| Inventario/logistica/costeo | `docs/auditoria_forense_inventario_logistica_costeo_2026-05.md` | Cierre `333` y ajuste `335` |
| Tesoreria/caja/bancos/CxC/CxP | `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md` | Cierre `334` |
| Operacion Supabase | `docs/ops/supabase-connection.md` | Aplicacion manual por `psql` y notas remotas |
| Seguridad/rutas | `docs/security/route-access-matrix.md` | Matriz vigente de autorizacion por endpoint |
| Docs historicas | `docs/DOCUMENTATION_QUARANTINE.md` y `x_doc/` | Consultar como contexto, no como verdad unica |

## Pendientes reales

- Cargar certificado digital SUNAT/OSE productivo y credenciales externas reales.
- Cargar secretos productivos finales y proveedor real de email si aplica.
- Ejecutar smoke fiscal externo con CPE/GRE/SIRE/PLE/PLAME segun alcance del contribuyente.
- Revalidar `327..335` con `psql --set=ON_ERROR_STOP=1` en una BD nueva/limpia antes de declararlo linea canonica para despliegues futuros.
- Mantener monitoreo de outbox, CPE sin asiento, SIRE/PLE vs mayor, pagos sujetos a bancarizacion y divergencias de inventario.
- Reconciliar 3 productos con `productos.stock_actual` distinto de `SUM(producto_existencias)` y backfill de metadata de costo en 14 salidas/devoluciones/ajustes pre-`333` (residual no critico; el RPC nuevo evita generar mas divergencias).

## Estado de aplicacion 327..335 en BD remota (verificado 2026-05-24)

Verificacion read-only via `psql --dbname="$POSTGRES_URL"` contra `wypnbcptofqdmoynlonq`: 28 artefactos clave (funciones, indices, tablas, vistas) presentes; `331__production_accounting_flow_hardening.sql` se detecto NO aplicada (faltaban `app.seed_operational_defaults_for_tenant` y `ux_conceptos_planilla_tenant_codigo`) y se aplico limpia el mismo dia.

| Migration | Estado | Notas |
|---|---|---|
| 327 | Aplicada | `pos_registrar_venta_full_tx` + idx idempotency |
| 328 | Aplicada | Uniques de sesiones de caja |
| 329 | Aplicada | `create_demo_tenant` con fix pgcrypto |
| 330 | Aplicada | RBAC demo admin + expiry idx |
| 331 | Aplicada 2026-05-24 | Faltaba en remoto; aplicada limpia (`BEGIN`..`COMMIT`, 0 errores; trigger fiscal `tenants`, 24 filas updated) |
| 332 | Aplicada | Tabla `normativa_peru_periodos` + validador compliance |
| 333 | Aplicada | Validador inventario + view de status |
| 334 | Aplicada | Tabla `financial_forensic_repair_log` + RPC `registrar_cxc_pago_tx` + `conciliar_movimientos_bancarios_tx` |
| 335 | Aplicada | `descontar_stock_y_liberar_reserva` con descuento autoritativo (verificado via `pg_get_functiondef`) |

Validadores runtime ejecutados post-`331`:

- `validar_accounting_production_compliance_runtime(NULL)`: **5/5 OK**.
- `validar_tesoreria_caja_bancos_runtime(NULL)`: **11/11 OK**.
- `validar_inventory_stock_reconciliation_runtime(NULL)`: **4/6 OK**; 2 residuales documentados como pendiente no critico arriba.

## Protocolo de nueva sesion

1. Ejecutar `git status --short`.
2. Leer `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`.
3. Verificar duplicados de prefijo en `supabase/migrations`.
4. Si se toca BD, leer baseline forense y plan de reconstruccion antes de cualquier cambio.
5. Si se toca inventario, revisar `333__inventory_stock_reconciliation_hardening.sql`, `335__descontar_stock_authoritative.sql` y la auditoria de inventario.
6. Si se toca tesoreria/caja/bancos/CxC/CxP, revisar `334__treasury_cash_bank_forensic_closure.sql` y el handoff.
7. Si se toca produccion/release, revisar readiness, production checklist y ops Supabase.
8. No usar manuales de modulo como estado final sin contrastar con auditorias de mayo 2026 y este archivo.

## Protocolo de cierre de tarea

Antes de responder como terminado:

1. Revisar si la tarea cambio estado global, estado de flujo, migraciones, riesgos, pendientes o navegacion documental.
2. Si hubo cambio, actualizar `docs/00_coordination/CURRENT_STATE.md` y/o `docs/00_coordination/FLOW_STATUS.md`.
3. Actualizar tambien el documento fuente del flujo afectado.
4. No tocar estos archivos si la tarea fue local y no cambia estado ni contexto compartido.
