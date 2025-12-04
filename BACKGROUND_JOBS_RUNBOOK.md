BACKGROUND JOBS - RUNBOOK
=========================

1) Líder único
- Producción/API principal: `apps/erp-api/.env` tiene `BACKGROUND_JOBS_LEADER=true`. Esta es la instancia líder.
- Staging/otras instancias: `apps/erp-api/.env.staging` quedó en `BACKGROUND_JOBS_LEADER=false`. Si alguna instancia usa ese .env apuntando a la misma BD, no agenda cron.
- Workers u otros servicios: dejar `BACKGROUND_JOBS_LEADER=false` (los workers no deben agendar cron; solo ejecutar lo que reciban).

2) Flags opcionales
- `BACKGROUND_JOBS_INVENTARIO_ENABLED=false`
- `BACKGROUND_JOBS_ASISTENCIAS_ENABLED=false`
Mantener en false salvo que se requiera habilitarlos.

3) Cuándo se ejecuta el job SIRE
- Programado mensualmente el día 1 a las 09:00 (hora del servidor). Hoy es 2025-12-04, así que el siguiente ciclo será el 2026-01-01 a las 09:00. Cada mes se reprograma automáticamente.

4) Verificación anti-duplicados SIRE
- Antes de generar, el código revisa `integration_logs` y si ya hay un `SUCCESS` del job `sire` en el periodo, lo omite.
- Para auditar después del próximo ciclo (2026-01-01 09:00), correr en Supabase SQL:
```
select tenant_id, operacion, status, date_trunc('month', timestamp) as periodo, count(*) as ejecuciones
from integration_logs
where servicio='BACKGROUND_JOBS' and operacion='sire'
group by tenant_id, operacion, status, date_trunc('month', timestamp)
order by periodo desc, tenant_id;
```
- Esperado: 1 `SUCCESS` por tenant y periodo. Si aumenta en más de 1, revisar que no haya otra instancia con `BACKGROUND_JOBS_LEADER=true`.

5) Qué hacer si hay duplicados
- Confirmar flags en todas las instancias que apunten a la misma BD: solo una con `BACKGROUND_JOBS_LEADER=true`, el resto `false`.
- Revisar si se desplegó otra instancia usando `.env` con el flag en true por error.
- Con el dedupe activo, aunque se dispare más de una vez, solo se generará una vez por periodo; el resto se omite.
