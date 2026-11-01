# Estado actual del ERP

Actualizado: 2026-11-01. Una página: si algo no cabe aquí, va a su documento de dominio.

## Dónde está

- **Producción:** base en la migración 590; API y web en `ba9493a2`. Promoción del 31-oct-2026
  en una transacción. **NO reaplicar 570–590.**
- **Última verificación en PROD:** sólo lectura (commit, esquema, Redis, login, CORS). No
  recorre flujos con sesión.
- **Único remoto autorizado:** `wypnbcptofqdmoynlonq`. No hay DEV, QA ni demos remotos.
- **¿Se puede entregar a un cliente real?** No todavía: ver "Bloquea la entrega".

## Migraciones

| Rango | Estado |
| --- | --- |
| `000..346` | Baseline presente en PROD |
| `347..382` | Presentes, con deriva previa en 13 funciones y 2 políticas: **no** usar `db push --include-all` sin reconciliar |
| `383..569` | Aplicadas y registradas |
| `570..582` | Suministro, lotes y migración desde otro sistema: aplicadas |
| `583..590` | Correcciones Perú del candidato, que las numeraba 570–577: aplicadas |

| `591..593` | Anon sin escritura, lectura de avisos por usuario y contraseña propia. Ver la nota de promoción |

Próxima libre: `594`. Comprobar prefijos duplicados antes de añadir una.

**Promoción 591–593:** DB-first. El API que exige 593 no se fusiona sin aplicarlas antes en PROD.
Ensayadas sobre el respaldo real (`artifacts/promocion-ensayo-591-593-20261101082811/informe.json`).

## Qué se probó

Expediente de la versión: `artifacts/expediente-590/EXPEDIENTE.md`. Resumen:

- **Aceptación:** 988 requisitos y 19.598 criterios sobre el candidato `b54f16be`, anterior a la
  integración, con 153 repetidos en la última ronda. **No se repitió sobre `ba9493a2`.**
- **Versión integrada:** cadena SQL desde cero, CI integral (71 pruebas de navegador,
  106 módulos, restauración de 298 tablas) y ensayo sobre el respaldo real de PROD.
- **Debilidad conocida:** no se puede afirmar qué requisitos protege la CI (defecto A-12).

## Bloquea la entrega a un cliente

- SUNAT, SOL y SIRE reales, con credenciales y PFX de ese contribuyente. Guías por GRE REST.
- Extracto real: perfilar, mapear, ensayo con cero errores y conciliación; medir su duración,
  que corre en una transacción con `SUPABASE_LONG_FETCH_TIMEOUT_MS` (10 min por defecto).
- Instalador Windows firmado; impresora física y prueba de carga.
- RPO, RTO y retención acordados; programar el respaldo de Storage. Restaurar la base lleva unos
  10 s en local con 216.000 filas; falta medir el RTO completo, con proyecto nuevo y secretos.
- Correo productivo en Render (`SMTP_*` o SendGrid, y `FRONTEND_URL`): sin él, la recuperación de
  contraseña responde 503 y las alertas no salen. Por comprobar en Render.
- Power BI: actualización programada real.
- Piloto con usuarios, aceptación firmada y anexos comerciales.
- Render `free→starter` (USD 7/mes) para que los workers no se duerman: requiere medio de pago y
  aprobación. Por comprobar en Render.

## Por país, al activar un contribuyente

- **Perú:** PVS con datos reales y carga en SOL. Validación legal de PLAME y T-Registro.
- **Argentina:** certificado X.509, punto de venta y homologación ARCA; CCT, ART y parámetros de
  nómina por empleador.
- **Colombia:** PFX, Software ID/PIN, TestSet, resolución y constancia `HABILITADO`; RADIAN y PILA
  aparte. Sin aceptación real todavía.

Detalle: `docs/RELEASE.md`.

## Decisiones pendientes

Defectos abiertos y severidad: `artifacts/expediente-590/DEFECTOS.md`. Los que piden decisión
de producto: `rrhh.access` único (A-03). Los 7 eventos en `cola_muerta` son residuos sin riesgo (A-05).

## Advertencias operativas

- `autoDeployTrigger: checksPass` no garantiza que Render espere a toda la CI: promover el
  esquema **antes** de fusionar.
- La CI integral falla en las primeras 5 horas UTC de cada mes (A-10): relanzar después de las
  00:05 de Lima.
- La evidencia cruda de pruebas no está en Git: `EXPEDIENTE.md`, sección "Custodia".

## Dónde está lo demás

| Busco | Documento |
| --- | --- |
| Decisiones técnicas e invariantes | `docs/ARCHITECTURE.md` |
| Flujos funcionales | `docs/MODULES.md` |
| Configuración, comandos, BD | `docs/OPERATIONS.md` |
| Promoción, go-live, rollback | `docs/RELEASE.md` |
| Manual de usuario y qué le falta | `manual/` y `manual/EVALUACION_DE_PRODUCTO.md` |
| Historia de cortes, auditorías y migraciones | `artifacts/expediente-590/ESTADO_HASTA_590.md` |

Si esto contradice el código o las migraciones, prevalecen el código y las migraciones.
