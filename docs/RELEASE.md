# Release, producción y migración

## Principio

El código release candidate no equivale a producción autorizada. Un go-live
requiere entorno correcto, migraciones promovidas, secretos reales, dependencias
externas y smoke controlado.

## Gate de release

Debe cumplirse:

- Worktree y commit identificados.
- Type-check, build y pruebas relevantes en verde.
- Sin migraciones duplicadas ni pendientes desconocidas.
- Preflight PROD satisfactorio; el proyecto DEV retirado debe ser rechazado.
- Respaldo productivo disponible y probado.
- RLS, RBAC y aislamiento tenant validados.
- CPE y contabilidad cuadran en los escenarios aplicables.
- Inventario y caja cuadran después de ventas/anulaciones.
- Secretos productivos instalados fuera del repositorio.
- Plan de rollback aprobado.

Estado actual y pendientes: `docs/CURRENT_STATE.md`.

## Promoción de migraciones

1. Identificar exactamente el rango pendiente.
2. Ensayar el SQL dentro de una transacción con `ROLLBACK` o en infraestructura
   local efímera; nunca redirigirlo al DEV retirado.
3. Auditar SQL, duración, locks, backfills y rollback.
4. Ejecutar preflight PROD usando `.env.production` o secretos inyectados.
5. Crear respaldo verificable y registrar referencia.
6. Aplicar migraciones en orden.
7. Ejecutar validadores de entorno, seguridad, contabilidad, inventario y
   tesorería.
8. Comparar conteos y revisar logs.
9. Detener y revertir ante cualquier diferencia no explicada.

El estado remoto vigente está verificado hasta `411`; cualquier rango posterior
vuelve a comenzar por preflight, respaldo y ensayo transaccional.

## Go-live

Orden recomendado:

1. Congelar cambios y registrar commit/tag.
2. Confirmar dominio, TLS, CORS, cookies y URLs públicas.
3. Instalar secretos de API, Supabase, Redis, correo y fiscal.
4. Verificar certificado y RUC productivo.
5. Configurar SOL y GRE REST si corresponde.
6. Promover DB mediante el procedimiento anterior.
7. Desplegar API, worker y Web/Tauri.
8. Verificar health, logs, colas y observabilidad.
9. Crear o migrar el tenant real.
10. Ejecutar smoke mínimo autorizado:
    - login y RBAC;
    - catálogo y cliente;
    - compra/recepción;
    - stock por almacén;
    - venta/POS y pago;
    - CPE controlado;
    - caja y asiento;
    - reportes y auditoría.
11. Validar impresora y operación desde el `.exe` si aplica.
12. Registrar resultados y decisión de continuar.

No usar datos sintéticos en PROD para “probar rápido”.

## SUNAT

Antes de un envío productivo:

- `SUNAT_ENVIRONMENT=produccion`.
- SOL correcto para el RUC.
- PFX vigente y autorizado.
- El certificado contiene el RUC esperado o existe excepción explícita,
  justificada y aprobada.
- Endpoint y transporte corresponden al flujo.
- GRE REST tiene `client_id/client_secret` cuando aplica.
- Clock, correlativos, series y numeración están verificados.
- El preflight confirma que no se usó producción durante simulaciones.

Factura, boleta, notas, RA y RC cuentan con prueba beta. GRE SOAP beta no es un
gate satisfactorio mientras continúe el rechazo `2112`.

## Migración de clientes

Orden de carga:

1. Tenant, empresa, usuarios y permisos.
2. Catálogos fiscales y configuración.
3. Clientes y proveedores.
4. Productos, almacenes y stock inicial.
5. Cuentas bancarias y saldos.
6. CxC y CxP abiertas.
7. Plan de cuentas, períodos y saldos contables.
8. Documentos históricos necesarios para trazabilidad.

Reglas:

- Plantillas CSV se validan antes de escribir.
- Cada fila lleva clave externa estable e idempotency key.
- Stock inicial exige `almacen_id`.
- Totales por módulo deben cuadrar contra el sistema origen.
- Una falla detiene el lote o queda registrada de forma reanudable.
- El rollback se prueba localmente o en una transacción revertida antes de usar
  datos reales; DEV no es un destino permitido.

## Rollback

Preparar antes del despliegue:

- versión anterior de aplicaciones;
- respaldo/restauración DB;
- compatibilidad entre código anterior y esquema nuevo;
- estrategia para jobs y mensajes en vuelo;
- responsables y criterio de abortar.

Si una migración no es reversible, el rollback debe ser roll-forward con script
correctivo probado. Nunca improvisarlo sobre PROD.

## Bloqueantes actuales

- Certificado productivo compatible con el RUC.
- Credenciales GRE REST si el cliente usa guías.
- Secretos finales y smoke productivo autorizado.
- Prueba física de impresión y cliente desktop.
- Validación legal externa de PLAME/T-Registro.
- Decisión de producto sobre venta rápida.

## Evidencia y cierre

La evidencia cruda se guarda en `artifacts/`, no en `docs/`. El cierre de release
actualiza únicamente:

- `docs/CURRENT_STATE.md` con resultado y pendientes;
- este documento si cambia el procedimiento estable;
- código, pruebas y migraciones que demuestren el cambio.
