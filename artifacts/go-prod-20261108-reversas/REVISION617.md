# Recepción en divisa · corte local617

**NO_GO**. Sin merge, promoción, SQL remoto ni gasto nuevo. Fuente local posterior
a a359e4d, sobre historial limpio2961b2d5. PR153 aún conserva el candidato612
en este corte; no atribuirle estas validaciones.

D56: el cierre congela moneda de la OC, moneda contable del país, tasa decimal
exacta y referencia; la intención web conserva ese mismo cuerpo. La conversión
por línea se comparte con inventario y contabilidad. El writer original exige
claim real, fuente inmutable y asiento exacto; la reversa verifica el original.
No usa preferencia comercial, tasa actual ni tasa1 para una divisa. Las cuentas
deben existir y aceptar movimientos. Sin backfill ni reescritura de históricos.

Pruebas verificadas:

- API completa6101 pruebas/410 suites con coberturaUTC. TiposAPI/web, buildAPI y
  buildweb de producción pasan. LintAPI0errores/97avisos existentes.
- Cadena PostgreSQL16 nueva:613 migraciones hasta617,126 verificadores y67
  históricos. Primer intento falló la introspección589; se actualizó para
  inspeccionar el core privado sin retirar su control. Corrida final aprobada.
- DDL/verificador dentro deROLLBACK: físico, lote, servicio, sin stock y cero;
  origen incompleto, cambios de tasa/cuerpo, fuentes/ledgers inmutables, permisos,
  valor positivo que redondea a cero y suma fuera de precisión. Un caso rojo de
  suma1.25e12 motivó el rechazo22003 antes del cierre; no se contó como aprobado.
- Cuatro carreras PostgreSQL reales: mismo cierre, tasa distinta, permiso
  revocado mientras espera producto y dos sesiones sobre el mismo claim. Una
  snapshot, un evento y un asiento; revocado sin efectos.
- HTTP real con login/JWT/sesión/permisos/PostgREST y workersNode original/inverso:
  físico, servicio y sin stockUSD5.17→PEN19.13, reversa enlazada neto0 por cuenta,
  stock/cumplimiento0 y origen intacto. Cero completa sinGL. Respuesta perdida
  de anulación se recupera mediante recibo/resolución; no se reenvía a ciegas.
- Navegador: falta de tasa rechazada sin cambios en seis tablas; luego cierre
  de servicioUSD5.16→PEN19.09 y evento completed con un asiento balanceado y
  timestamp original conservado. Formulario en oscuro/escritorio y claro390px
  sin desborde. La interceptación de respuesta no coincidió con el request;
  este cierreUI es normal, no prueba una respuesta perdida desde el navegador.
- Contrato web22 casos nuevos y98 de reversa pasan. Los dos originalesFX rojos
  permanecen idénticos; replay/basis/reversa sin conversión demostrable se rechazan.

Las fuentes de las corridas completas se cotejaron antes del corte. Después sólo
se normalizaron CRLF→LF en archivos modificados; se conservaron huellas y la
equivalencia de contenido, sin presentar una nueva suite completa posterior.
La prueba civil de fechas admite el validador616 ya existente con roundtripUTC;
no se deshabilitó la guarda ni se cambió el reloj de negocio.

Los arneses privados conservaron fallos iniciales de expectativas y transporte.
Una comparación3.7/3.700000, una conexión perdida y un campo de resultado que
pisaba el UUID se corrigieron en los arneses sin volver a sembrar ni duplicar la
anulación; el resultado final se verificó por lecturasAPI/SQL.

D57 abierto: el navegador muestra órdenesUSD24.37 comoS/24.37 y el KPI mezcla
354PEN+73.11USD comoS/427.11. El código de presentación usa moneda de configuración
en lugar de la OC. Pendiente de corrección; no invalida el asiento617 cotejado.

Restan interfaz de transferencia, matriz recepción→factura→pagoFX, expiración
natural con formulario pendiente, restore/rollback de release, revisiónSAST/
CodeQL y gates operativos/fiscales. Publicación y Sentry autorizados con
presupuesto0 son trabajo posterior a este corte. Support4972573 sigue pendiente;
no se da por revocada la credencial histórica ni por purgadas sus referencias.
