# Estado actual del ERP

Actualizado: 2026-11-08. Una página: si algo no cabe aquí, va a su documento de dominio.

## Dónde está

- **Candidato para revisión:** rama `codex/go-prod-candidate-20261106`,
  [PR153 en borrador](https://github.com/yohandry10/erp/pull/153), candidato617
  publicado enb20ee727. Correcciones locales613–617 verificadas; sin merge ni
  promoción. **NO_GO**. CodeQL42511475473 yE2E42511475452 pasan. CI42511475454
  falla por un caso inestable de reparto analítico:70 pasan y1 pasa al reintento;
  no se acepta como verde. Sus otros siete jobs pasan; build/audit dependientes
  quedan omitidos. La captura muestra destino vacío y Guardar deshabilitado
  después de seleccionar; pendiente de corregir y repetir, sin ampliar timeout.
  Las corridas anteriores3ad no arrancaron por facturación/minutos de Actions, según sus
  anotaciones. Presupuesto0; no se relajan gates ni se reintentan sin un cambio.
  El E2E808 pasó149casos, pero su integración falló en replayRRHH y un selector
  de factura. Corregidos en610/2030; aceptación dirigida local5/5. La suite completa
  sobre611 pasa5843pruebas/402suites; tipos, buildAPI, lint y buildweb pasan.
  Tres fallos Windows/Nextdev de banco/caja/aprobaciones se reproducen también
  en808: no basta para atribuirlos al entorno. La aceptación manual en build de
  producción y demo propia conserva nombre bancario y nombre/descripción de caja
  tras recargar, con diez tablas financieras intactas. No recertifica esos E2E.
  En aprobaciones se comprobó403 al creador, aprobación segregada y conflicto
  tardío. Este último daba503 sin SELECT del historial;612 lo concede sólo al
  backend y retira el GRANT de los fixtures. El reintento UI da409,
  explica el motivo y actualiza la bandeja. Cadena nueva608migraciones hasta612,
  121verificadores y67históricos pasa; deltaAPI61264pruebas/4suites sin sumar
  a la suite611. Build finalweb/API, tipos, lint y contrato documental pasan.
- **Seguridad:** D46 valida PII/base64/secretos sin recifrar datos; D47 usa fechas
  civiles por país; D51 rechaza propiedades heredadas en el mapaPLE. D50 escapa
  campos textuales de boleta con ocho regresiones; su prueba HTTP adicional sin
  fixture de pagos no se cuenta aprobada. HelpersPII legacy requieren revisión.
  CodeQL requiere hacer público este repositorio personal para usarlo sin coste.
  El usuario autorizó ese cambio y la limpieza:93 ramas reescritas y verificadas;
  PR153 sigue en borrador sobre2961b2d5. Support4972573 enviado y abierto para
  retirar referencias/cachés antiguas conservando conversaciones. El propietario
  autorizó hacerlo público mientras Support sigue pendiente: visibilidadPUBLIC
  verificada. Sin purga ni revocación probadas; alerta de secreto1 sigue abierta
  sobre referencias antiguas. Secret scanning/protección de nuevos pushes activos.
  Presupuesto nuevo0 y límiteActions0 conservados. CodeQL sobre el árbolb20ee727 pasa
  enJS/TS: una misma alerta108 ya descartada el31oct como falso positivo por IDs
  de sesión, revisada de nuevo sin almacenar credenciales; no son cero hallazgos.
  Los resultados anteriores de main no se dan por resueltos mediante este PR.
  Sentry11.11.0 preparado y probado localmente: API completa6111/412 con coberturaUTC,
  tipos/buildAPI/web, política de privacidad y auditPROD0 pasan. Captura real de
  HTTP5xx y navegador recibida en cuentaDeveloper existente sin tarjeta/gasto;
  IP y geografía retiradas para eventos nuevos mediante reglas del proyecto.
  Sin configuración/desplieguePROD ni prueba de alarma operativa. El CodeQL de
  b20ee727 es anterior a estos SDK y no se atribuye a su nuevo delta.
  D54 escapa HTML en la confirmación de contraseña; cuatro regresiones rojas
  pasan después del arreglo. D55 actualiza nodemailer10.1.4/fast-uri4.2.3/qs6.16.1
  con regresiones instaladas en el gate existente. AuditPROD sin avisos; árbol
  completo aún1bajo/5moderados,0altos/críticos. SuiteAPI del corteD55:5848/402 con
  cobertura, tipos/build/lint y buildweb pasan. MIME real en memoria sin envío;
  navegador confirma tres etiquetas con ampersand, sin operaciones financieras.
  SemgrepCE local sin cuenta/red/envío:1549archivos/211coincidencias/0errores;
  ejecución completa con exit1 por hallazgos, revisión incompleta. No son211
  vulnerabilidades confirmadas ni equivale aCodeQL. Tres avisos de parseo JSX
  resueltos sin cambiar JavaScript emitido. [Corte D54/D55](../artifacts/go-prod-20261108-security/RESUMEN.md).
  Los deltas D46/D47 y D51 pasan; las dos alertas heurísticas D48/D49 se mantienen
  visibles con revisión acotada D50, sin suprimirlas ni recertificar otros reportes.
- **Nueva aceptación local608:** sieteNC desdeUI conservanUSD0.07/PEN0.27 y
  deuda0. Otro circuitoUI con preparaciónAPI completa siete cobros, pago,
  NC, siete reembolsos y pago final: banco/crédito/deudas0 y21asientos únicos
  balanceados. D41 añade moneda y paginación comprobada al CSV bancario:
  30pruebas dirigidas, lectura real de16movimientos y descargasUI completas/
  filtradas idénticas al servidor pasan. D43 separa los agregados de Analytics
  por moneda: lectura real confirma179.80PEN y0.07USD, sin total179.87.
  32pruebasAPI dirigidas, UI yCSV cotejados conSQL pasan, con fallo/reintento seguro y
  ancho390px en ambos temas. Ratios con divisas quedan
  no disponibles hasta tener valuación común. La consulta de gastos denegada
  conserva sus permisos; no se fabrica KPI0. Endpoints avanzados legacy aún
  requieren revisión. SigueNO_GO por casos pendientes y gates de release.
- **Último corte público observado:** 5-nov, 06:29 UTC; API `8cb0b0d0`, esquema
  requerido/aplicado 593, DB y Redis listos. El SHA de la web no se verificó en esta ronda.
  La promoción 570–590 del 31-oct fue transaccional: **NO reaplicarla**.
- **Plan de revisión cerrado:** 89 ejecuciones acumuladas, 18 hallazgos de la ronda y
  10 escenarios bloqueados documentados; 55 puntos dispuestos. [Dictamen NO_GO](../artifacts/uat-go-final-20261105/DICTAMEN.md), sólo demos propias, sin certificación integral.
- **Objetivo posterior activo:** corregir hasta GO_PROD. La595 repara la fábrica demo
  canónica: numeración fiscal, detalle de cotización y apertura bancaria; regresión y rollback
  SQL locales pasan. El ciclo UI venta212.40→cobro40→NC53.10→cobro119.30 termina con deuda0,
  banco50159.30 y stock11.5. D19 corrige caché de dashboard tras NC; B09 explica período
  cerrado y libera el formulario sin efectos parciales. D20 aclara denegación CxP; D21
  concilia IGV por línea y D22 corrige tasa A4. Roles y Excel vacío pasan en UI.
  La596 corrige D25: dos devoluciones0.5+0.5 acreditan0.02+0.02, base0.03/IGV0.01;
  UI/API/SQL y concurrencia pasan para importes nativos. Cadena limpia596 aprobada.
  D26 omite detalles contables cero:84pruebas y concurrencia real pasan con un asiento
  por nota. Siete eventos originales quedan completados con un asiento cada uno,
  incluido el recuperado de cola muerta; replay no duplica efectos. El antiguo drenaje
  podía anunciar éxito con fallidos; ahora exige estado completed con processed_at.
  D27: la597 conserva los centavos convertidos acumulados y el saldo a favor;
  D28 convierte factura.emitida con el tipo congelado, sin reconvertir costo de stock.
  Factura API USD0.07→asientoPEN0.27; dos NC USD0.02→PEN0.15, un asiento por nota.
  Asiento histórico USD mal valorado se rechaza para nuevas NC, sin backfill.
  D29 traslada ajustes tributarios al asiento: USD0.06 de deuda→PEN0.23 y
  retenciónUSD0.01→PEN0.04; PEN y anticipo total pasan. Redondeo incompatible
  se rechaza400 antes de emitir.284pruebas dirigidas y build pasan; nueva imagen API.
  Navegador6nov recuperado hasta dashboard; sin nueva aceptación UI financiera.
  D30/la598 conservan el valor contable acumulado de cobros USD: siete pagos0.01
  cancelan0.07 sin residuo en clientes; concurrencia y factura aún pendiente de
  contabilizar pasan. Cobro total/parcial y devolución reales por API/SQL pasan,
  con saldo a favor y stock conciliados.308pruebas dirigidas; sin backfill.
  D31/la599 derivan la moneda contable del país y no de la preferencia comercial:
  preferenciaUSD en Perú conservaPEN; cobros y ciclo simple de proveedor pasan.
  D32/la600 conservan el valor bancario verificable cuando un pago agota el banco
  en divisa. Siete cobros y pago total, cotización variable y origen aún sin asiento
  pasan por API/SQL: clientes/proveedores/banco0. Cinco historias alteradas se
  rechazan sin efectos;408pruebas/17suites pasan. Sin aceptación universal de bancos.
  D33/la601 conservan el valor de origen acumulado de CxP. Dos pagos0.03+0.04,
  siete pagos concurrentes y origen aún en outbox dejan mayor42 y banco0 por API/SQL.
  Tasa variable y rechazoAPI400 de historia incompatible pasan sin efectos;
  rollback,409pruebas/17suites y cadena601 desde cero aprobados. Sin backfill.
  D34/la602 corrigen cuenta y consumo de efectivo en divisa: siete cobros y dos
  pagos dejan sesiónUSD0/mayor10111PEN0; POS de otra sesión conservaPEN74.34.
  Tasa variable, cobros concurrentes, eventos pendientes y rechazoAPI400 sin
  efectos pasan;434pruebas/18suites, rollback exacto y cadena602 aprobados.
  Sin backfill ni aceptación UI financiera/fiscal completa. Sigue NO_GO por
  casos A–J, históricos y gates de release.
  B.4/E.7 añaden rechazoAPI de sobre-recepción5.01/5, exceso dividido,0/−1 y
  cierre concurrente200/400 de dos borradores3/5: stock+3, evento/asiento1,
  replay sin duplicación. No acredita reversa ni nueva aceptación UI.
  El navegador603 volvió a dashboard y Actualizar conserva sesión/métricas;
  captura13:10Lima, sin nueva aceptación UI financiera.
  D35 detectó aplicación de créditoUSD0.07 con CxC nativa0/mayorPEN−0.01.
  La603 comparte valor acumulado con cobros/NC: seis circuitos, origen pendiente,
  concurrencia, tasa distinta y cobro antes/después pasan. Seis guardas y API400
  sin efectos; rollback exacto,239pruebas/8suites y cadena603 aprobados.
  D36/la604 consumen valor proporcional bancario y conservan liquidación/tasa;
  la reversa repone el valor original. Siete circuitos API/SQL, ocho guardas,
  API400 atómico,316pruebas/11suites, rollback exacto y cadena604 pasan.
  D37/la605 conservan cuenta operativa en eventos nuevos, valor proporcional de
  sesión y reversa exacta. Ocho circuitos API/SQL, ocho guardas, API400 atómico,
  276pruebas, tiposAPI, rollback exacto, imagenAPI y buildweb pasan. Cadena limpia:
  601migraciones/114verificadores. Respaldo299tablas/169516filas íntegro.
  D38/la606 comparten valor acumulado de crédito proveedor y CxP destino. Diez
  circuitos API/SQL, ocho guardas, tres rechazos del registro inmutable y API400
  atómico pasan. SuiteAPI5723pruebas/395suites, tipos, imagen, rollback exacto y
  cadena602migraciones/115verificadores aprobados.
  D39/la607 conservan la emisión acumulada desde factura y su reparto deuda/crédito:
  diez circuitos API/SQL, diez guardas y dos rechazos de cabecera inmutable pasan.
  USD0.07 en sieteNC conservaPEN0.27; el créditoUSD0.06/PEN0.23 se consume0.12+0.11.
  API400 atómico, rollback exacto y10000controles aritméticos pasan. Muestras intactas.
  D40/la608 admiten reembolsos enlazados a recibos457+606 verificables:
  seis circuitos, diez guardas, dos rechazos inmutables y API400 atómico pasan.
  Banco/crédito/deuda0; cadena604migraciones/117verificadores, tipos e imagen pasan.
  SuiteAPI5735/395suites, tipos, imagen, rollback y cadena603migraciones/116verificadores pasan.
  Respaldo299tablas/214416filas íntegro. Gates A–J/release continúan; sin promoción.
  Navegador604 crea demo y carga dashboard; uso local deshabilitado al retomar605;
  expiración natural de la sesión anterior observada, sin prueba de formulario pendiente.
  Control608: readiness503 por563eventos antiguos pendientes en
  el arnés con jobs deshabilitados;0fallidos/cola muerta. No se relajaron umbrales.
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
| `591..593` | Aplicadas según readiness del 5-nov; anon sin escritura, avisos por usuario y contraseña propia |
| `594` | Kardex: apertura antes de consumo con timestamp igual; verificada sólo en PostgreSQL local, sin promoción |
| `595` | Consistencia de nuevas demos: factura semilla reservada, cotización detallada y apertura bancaria; verificación/rollback locales, sin promoción |
| `596` | NC RMA por importes acumulados de cada línea: límites, cabecera consistente, helper privado; cadena limpia/rollback locales, sin promoción |
| `597` | NC RMA: conversión acumulada, saldo a favor y límite del asiento original; rollback/reaplicación, casos locales y cadena final pasan, sin promoción |
| `598` | CxC: valor contable acumulado compartido con RMA, snapshot asíncrono e historia verificable; rollback/reaplicación y circuitos locales pasan, sin promoción |
| `599` | Tesorería deriva moneda contable del país; preferencia comercial independiente. Nueve pares país/preferencia, rollback/reaplicación y cadena limpia pasan, sin promoción |
| `600` | Pago total en banco extranjero consume su valor contable demostrable, separado de liquidación. API/SQL, historia negativa y rollback pasan; aperturas no cero/mayores compartidos/otros escritores requieren revisión. Sin promoción |
| `601` | CxP: valor de origen acumulado, factura/snapshot y pagos previos verificables; rollback, cuatro circuitos bancarios y rama CxP de efectivo pasan. Cadena limpia aprobada. Sin promoción |
| `602` | Caja en divisa: valor verificable de la sesión al agotarse, sin consumir otras cajas; cuatro circuitos API/SQL y seis historias incompatibles pasan. Cuenta de cobro y reversa original verificadas; cadena limpia aprobada. Sin promoción |
| `603` | Aplicación de saldo a favor comparte valuación acumulada de CxC con cobros/NC. Seis circuitos API/SQL, seis guardas, rollback exacto y cadena limpia pasan. D36 del reembolso sigue abierto. Sin promoción |
| `604` | Reembolso bancario/reversa: siete circuitos y ocho guardas API/SQL, rollback exacto,316pruebas y cadena limpia pasan. D37 en caja sigue abierto. Sin promoción |
| `605` | Reembolso/reversa de caja: ocho circuitos, ocho guardas API/SQL, rollback exacto,276pruebas, tiposAPI, imagen/buildweb y cadena limpia pasan. Sin promoción |
| `606` | Crédito proveedor acumulado compartido con CxP: diez circuitos, ocho guardas, API400 atómico,5723pruebas, rollback y cadena limpia pasan. EmisiónNC cubierta por607. Sin promoción |
| `607` | EmisiónNC proveedor acumulada y consumo del valor asignado: diez circuitos, diez guardas, dos rechazos inmutables, API400 y rollback pasan.5735pruebas, tipos, imagen y cadena limpia pasan; continuidad bancaria cubierta por608. Sin promoción |
| `608` | Traza explícita de reembolso proveedor en banco extranjero. Rollback exacto, doble reaplicación,152pruebas dirigidas, tipos e imagen pasan. Seis circuitos API/SQL, diez guardas, dos rechazos inmutables, API400 y cadena604migraciones/117verificadores pasan. Sin promoción |
| `609` | Asistencia automática: wrapper sobre writer475, reloj civil PE/CO/AR y replay del recibo original bajo el mismo lock. Sin backfill ni cambio de ACL/RLS de tablas. Rollback, doble reaplicación, API concurrente y cadena605/118 pasan. Restauración local299tablas/234472filas conserva historia609, ACL/RLS/políticas y función; no acredita respaldoPROD ni RTO. Sin promoción |
| `610` | Ausencias sin cruce: trigger AFTER sobre `solicitudes` con lock por colaborador; al crear compara pendientes y aprobadas, al aprobar sólo aprobadas; rechazar no se bloquea y no revalida historia. Sustituye la prevalidación del API, que rompía el replay exacto del writer475 (409 en la integración de `808e4075`). Cadena 606/119 y 67 históricos, rollback, doble reaplicación y 5/5 altas concurrentes pasan en local. Sin promoción |
| `611` | Nuevas muestras PE: CPE01, coreFACTURA y borrador simulado explícito sin evidencia fiscal. Prueba roja sobre610, tres verificaciones, rollback exacto y doble reaplicación pasan; filas históricas, ACL/RLS/políticas y permisos de función intactos. Cadena limpia607/120 y67históricos aprobada. No permite NC desde borrador. Sin promoción |
| `612` | Lectura explícita del historial de aprobaciones para service_role: corrige503 en replay/conflicto tardío sin depender del proveedor ni del fixture. Prueba roja, tres verificaciones, rollback ACL exacto y doble reaplicación pasan; filas, demás permisos, RLS/políticas, owners y funciones intactos. UI vuelve a409. Cadena nueva608/121 y67históricos aprobada. Sin promoción |
| `613` | WIP local sobre historial limpio: reversa enlazada de transferencia, dos movimientos opuestos con costo/lotes originales, lectura decimal y resolución de clave. DDL/verificador enROLLBACK y18tablas intactas; servicio y cuatro rutasAPI conectados,37casosHTTP con autenticación/Supabase sustituidos y permisos/validación reales. Inventario/readiness/config532pruebas/21suites, tipos/build/lint pasan; lint97avisos/0errores. Copia local restaurada612+DDL613: siete carreras PostgreSQL reales pasan, incluido replay/abandono y revocación efectiva mientras espera; origen y valor congelado intactos. Sin HTTP contraDB real, UI, fresh/rollback de release ni reversa empresarial de recepción; no publicado ni promovido |
| `614` | WIP: factura y recepción comparten lock; una nueva factura ligada a recepción debe terminar con origen CERRADA al commit, con tenant/OC/proveedor/referencias coherentes. Sin backfill; pagos y updates del mismo vínculo conservan comportamiento. Respeta cierre diferido de la fábrica demo sin bypass. Prueba roja/verde con21tablas intactas, dos esperasSQL reales cierre/cancelación de borrador y rechazo deCOMMIT con origenBORRADOR/0facturas/0eventos huérfanos pasan.43pruebas config/readiness, tipos/build y plan de contratos pasan. No es reversa empresarial ni aceptación contable; sin publicación/promoción |

| `615` | WIP local: anulación de recepción, cumplimientoOC, stock/costo/lotes originales y outbox inverso atómicos. Worker con claim real crea un único contraasiento enlazado; costo0 probado sin asiento ficticio. SQL/rollback y nueve carreras reales pasan. Integración con JWT/permisos/PostgREST y ambos workersNode reales: físico/servicioPEN con neto0 y cero sinGL. Respuesta perdida tras commit recuperada sin reenviar. Sin promoción |
| `616` | WIP local: recibo ligado a actor/tenant/origen y resolución durable; tres carreras más verifican commit/abandono/revocación. UI conserva intención/archivo antes de retirar el pendiente; rechazo por período, recarga, resolución y nueva anulación verificados conSQL y worker.98pruebas del contrato web, colaJS y48Rust pasan. SuiteAPI completa6066/408 enUTC, tipos/buildAPI yweb pasan; lintAPI0errores/97avisos, sin avisos en la UI nueva. Cadena fresca612migraciones/125verificadores+67históricos aprobada.21tablas conservadas intactas. UI de transferencia, matrizFX y ensayo de restore/rollback aún pendientes; NO_GO |
| `617` | WIP local: cierre congela monedaOC, moneda contable del país, tasa decimal y referencia; worker con claim real valida el origen y registra valores base, sin reinterpretar historiaFX. Bien físico/servicio/sin stockUSD5.17→PEN19.13 y reversa exacta neto0; cero sinGL. Cuatro carreras reales y cierreUI USD5.16→PEN19.09 pasan. SuiteAPI6101/410 con coberturaUTC, tipos/build/lintAPI y buildweb pasan. Cadena nueva613migraciones/126verificadores+67históricos aprobada. Sin promoción; NO_GO |

Próxima libre: `618`. El binario WIP y el candidato publicado exigen617; el stack
histórico local conservado sigue612, PROD observado593. No arrancar el binario nuevo sobre
la base conservada sin completar su migración en infraestructura de pruebas propia.
Comprobar prefijos duplicados antes de añadir una.

**D56 corregido en el candidato local617:** nuevas recepcionesUSD exigen valuación
congelada; la contabilización original y la reversa verifican esa autoridad. Los
dos originales históricos sin evidenciaFX se conservan y se bloquean para nuevas
operaciones; no se inventa tasa1 ni se corrige su mayor por backfill. No acredita
la matriz completa recepción→factura→pago en divisa.
[Revisión617](../artifacts/go-prod-20261108-reversas/REVISION617.md).

**D57 abierto:** Compras mezcla importes nominales en el resumen mensual y rotula
órdenesUSD como soles. Observado en navegador con datos propios; pendiente de
corrección y aceptación. No cambia los valores617 ya comprobados enSQL.

**591–593:** el corte público del 5-nov exige y encuentra 593. El ensayo previo consta en
`artifacts/promocion-ensayo-591-593-20261101082811/informe.json`; no volver a promover por rutina.

## Qué se probó

Expediente de la versión: `artifacts/expediente-590/EXPEDIENTE.md`. Resumen:

- **Aceptación:** 988 requisitos y 19.598 criterios sobre el candidato `b54f16be`, anterior a la
  integración, con 153 repetidos en la última ronda. **No se repitió sobre `ba9493a2`.**
- **Versión integrada:** cadena SQL desde cero, CI integral (71 pruebas de navegador,
  106 módulos, restauración de 298 tablas) y ensayo sobre el respaldo real de PROD.
- **Debilidad conocida:** no se puede afirmar qué requisitos protege la CI (defecto A-12).
- **Alcance de GO_PROD:** preparación técnica del candidato local, no aceptación de toda
  versión posterior. Los hallazgos conservan origen no determinado sin contraste causal
  entre versiones; esto no impide corregirlos ni sustituye su aceptación posterior.

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

- **Catálogo único de consulta:** [defectos y seguimiento posterior](../artifacts/expediente-590/DEFECTOS.md).
  Conserva el corte 590 separado de D-01..D-17. Las quince correcciones y los dos ajustes
  móviles pasan la aceptación dirigida local en navegador, API y SQL; no recertifica todo el ERP.
  Candidato `codex/erp-uat-stabilization-20261105`, base `8aded64c`, esquema 594, sin publicación.
  266 pruebas API en 14 suites, tipos API/web y cadena SQL aprobados; respaldo/restauración
  de 299 tablas y 5.091 filas tras recuperar la corrida interrumpida; cero asientos descuadrados.
  [Delta de aceptación y estados](../artifacts/uat-new-defects-20261104/estabilizacion/SEGUIMIENTO.md)
  y [pasos y capturas UI](../artifacts/uat-new-defects-20261104/estabilizacion/ui-20261105/ACEPTACION-UI.md).
  Evidencia, pasos y cifras: [informe manual](../artifacts/uat-new-defects-20261104/INFORME.md);
  alcance por requisito: [matriz A–J](../artifacts/uat-new-defects-20261104/COBERTURA.md).
- **Diez arreglos locales anteriores:** `claude/uat-defectos-20261104` / `8aded64c`, sin
  despliegue acreditado; se excluyen de D-01..D-17. El cruce de ausencias pasa a la base
  en 610. El máximo AFP 2026-11 ausente sigue bloqueando planilla; no se cambió normativa.
- **Pendientes conocidos:** el código del CPE de nuevas muestras se corrige en611;
  siguen como borrador sin evidencia y no son origen elegible para una NC fiscal.
  El rechazo `REFERENCED_NOTE_SOURCE_CPE_INVALID` conserva su guarda y explicación;
  cotización sin detalles confirmada; omisión bancaria al cambiar país confirmada sólo en
  código (flujo no ejecutable); normativa demo restringida intencionalmente. De los eventos
  globales sólo se observó un agregado de 15: los 7 clasificados históricamente no clasifican
  los 15 actuales. Desglose por evento/tenant bloqueado, sin SQL remoto.
- **Decisión vigente: NO_GO de producto.** La consulta con ChatGPT quedó respondida y el
  navegador permitió completar los 17 escenarios corregidos. B-08/B-09 se repitieron por
  UI/API/SQL local sin efectos parciales; sus veredictos originales permanecen congelados.
  El plan original termina con [matriz de 55 puntos y bloqueos](../artifacts/uat-go-final-20261105/COBERTURA.md).
  Reentrada demo desde sesión previa pasa una vez; D-18 corrige perfiles tardíos entre sesiones
  con regresión determinista incluida en CI y tipos web aprobados. No se demuestra que causara
  el bucle anterior ni se repiten los 17 recorridos después del cambio compartido de auth.
  Ese corte cerró con factura F001 bloqueada y navegador desactivado; su evidencia se conserva.
  La ronda posterior595 reabre esos casos: venta completa, roles, redondeo0.07 y Excel vacío
  ya ejecutados. El caso negativo de redondeo conserva su muestra defectuosa F001-00000003;
  la muestra nueva F001-00000004 concilia cabecera, líneas, XML/PDF y asiento15.57/15.57,
  con margen−15.44 y sin aceptación SUNAT simulada. No hay backfill de documentos anteriores.
  Estado y límites posteriores: [seguimiento GO_PROD](../artifacts/go-prod-20261105/SEGUIMIENTO.md).
  El [dictamen actualizado](../artifacts/go-prod-20261105/DICTAMEN.md) conserva NO_GO y
  enlaza el delta de55puntos y las huellas del candidato sin commit nuevo.
  Sin promoción productiva; PR153 sólo en borrador. Reversas, planilla AFP y gates externos siguen pendientes.

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
