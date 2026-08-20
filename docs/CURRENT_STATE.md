# Estado actual del ERP

Actualizado: 2026-08-17.

Este archivo contiene únicamente el estado vigente. El historial de auditorías y
decisiones anteriores se consulta en Git. Si este resumen contradice código o
migraciones verificados, prevalece la implementación actual.

## Resumen ejecutivo

- **PROD está en `498`.** El 2026-08-20 se promovieron `497` y `498`, ambas de
  sólo funciones —sin DDL de tabla ni migración de datos—, tras pasar el gate
  completo en un cluster efímero (495 migraciones, verificadores `497` y `498`
  en verde). Se respaldó la definición previa de
  `app.hydrate_demo_business_sample_tx` antes de reemplazarla. El historial se
  selló a mano en `supabase_migrations.schema_migrations`, que psql no toca, y
  `outbox_runtime_health_492` devuelve `ready: true` con `schema_version 498`.
  Comprobado sobre una demo nueva: la venta POS nace con `documento_id`,
  `accounting_event_id` y `atomic_result`, que es lo que `cerrar_caja_tx` exige,
  y la planilla nace en `borrador` sin líneas escritas a mano.
- **La cola de dead-letter de PROD se estaba envenenando sola.** La migración 464
  emite `demo.lista` y `configuracion.wizard.completado` como constancia, y nunca
  hubo suscriptor: el worker falla cerrado ante un evento sin handler, así que
  cada demo creada y cada wizard completado dejaba un `dead_letter` permanente.
  Había doce y crecían. No era sólo ruido: `outbox_runtime_health_492` deja de
  reportar `ready` al pasar de cien, de modo que la cola habría acabado bloqueando
  el readiness por eventos que funcionaban bien, mientras tapaba los fallos de
  verdad. Se resuelve con un registro explícito de eventos sin suscriptor
  (`eventos-sin-suscriptor.ts`): esos se dan por procesados sin despachar y todo
  lo demás sigue fallando cerrado. **Tras el despliegue** conviene reencolar los
  doce que ya están en `dead_letter` para que se cierren; antes de desplegar
  volverían a caer.
- **El guardián de fechas UTC estaba inerte y tapaba diez sitios.** Sólo miraba
  `.split('T')[0]`, y al ampliarlo a `.slice(0, 10)` y `.slice(0, 7)` resultó que
  `git grep` usa expresión básica: los paréntesis y la barra eran literales, la
  alternancia no casaba con nada y el guardián pasaba en verde sin comprobar nada.
  Con `-E` aparecieron diez ficheros nunca vistos. Seis eran defectos reales, no
  cosméticos: la **fecha del asiento contable del cierre de caja**, la de
  conciliación de partidas, la de las plantillas recurrentes —que además alimenta
  el UUID determinista del período—, el **período con el que RRHH elige la
  normativa vigente** (UIT, RMV, tasas AFP) y el que valida la RMV de un contrato,
  y el planificador de plantillas, que corre a las 02:00 UTC —21:00 de Lima del día
  anterior— y disparaba las plantillas un día antes con fecha futura. Todos pasan
  ya por la zona del contribuyente; el planificador filtra por el calendario de
  cada tenant. Queda anotado y sin resolver el caso de ARCA: el QR y el XML leen
  `fechaEmision` en UTC y coinciden entre sí, pero una emisión nocturna en
  Argentina quedaría fechada al día siguiente. No afecta hoy —ningún contribuyente
  tiene `arca_activo` y no hay tenants AR— y al homologar habrá que decidir si ese
  campo es el instante o el día fiscal.
- **Barrido de integridad sobre PROD el 2026-08-20**, sólo lectura: 170 asientos
  contables, todos cuadrados y con detalle; el invariante de stock
  (`productos.stock_actual` = suma de `producto_existencias`) se cumple en todos
  los productos; ningún `empresa_config` sin `pais_id`; ningún evento de outbox
  atascado en `processing`. Quedan cinco CPE en `FIRMADO` sin aceptación, de hace
  once a catorce días, todos de tenants QA y demo (`LLAMA PE QA SAC`,
  `DEMO COMERCIAL S.A.C.`): son restos de pruebas contra beta, no de un
  contribuyente real.
- **La GRE automática completaba de su cosecha campos que declara SUNAT.** El peso
  bruto salía del importe de la venta («1 kg por cada S/ 100») y la fecha de
  traslado era «mañana» sobre el reloj UTC; ninguno procede de un dato real, y
  `productos` ni siquiera tiene columna de peso. El camino legado, además, no
  validaba nada y componía el destinatario como `Cliente <uuid>`. Estaba latente:
  de las treinta guías emitidas ninguna salió por ahí y el único contribuyente con
  la creación automática activa es una demo, pero se dispara en cuanto la habilite
  alguien real. Ahora los dos caminos pasan por `assertAutoGreSaleDataValida`, que
  exige peso y fecha además del destinatario y remite al flujo manual cuando
  faltan; el estimador de peso se retira.
- **Falta desplegar el runtime.** La rama `fix/qa-bloqueadores-criticos` no está
  publicada y Render sirve todavía el código anterior, así
  que el cierre de caja de la demo sigue fallando con el precheck viejo («ventas
  sin comprobante electrónico»). La base ya está lista para ese despliegue.
- El 2026-08-17 se creó un respaldo nuevo de PROD `490`, se aplicaron y
  registraron `491..496` en orden y
  el postcheck remoto confirmó esquema requerido `496`, Redis listo y outbox sin
  filas claimable, processing, failed ni dead-letter. Render sirve el commit
  `85f35175eaa6d51d4a0d19afe65930481a9c29c4`; `/api/health/version` ya acredita
  ese SHA, aunque `buildDate` continúa `unknown`.
- El alcance operativo activo es Perú (`PE`, `pais_id=1`, `PEN`, SUNAT),
  Argentina (`AR`, `pais_id=5`, `ARS`, ARCA) y Colombia (`CO`, `pais_id=2`,
  `COP`, DIAN).
- PROD `wypnbcptofqdmoynlonq` es el único proyecto remoto operativo. El antiguo
  DEV está retirado y bloqueado por runtime, scripts y CI.
- El cierre local más reciente del backend reporta 199/199 suites y 1711/1711
  pruebas, type-check API/Web y lint sin errores. Una reconstrucción limpia en
  PostgreSQL 16 aplicó 493 migraciones `000..496`, ejecutó `verify491..496` y
  confirmó el readiness pasivo con esquema requerido `496`. El 2026-08-13 se
  generó además un respaldo nuevo de PROD `490`, se restauró en PostgreSQL 17
  local y el upgrade realista `490→496`, sus seis verificadores y readiness
  `496` pasaron sin escribir en PROD.
- El PR [#79](https://github.com/yohandry10/erp/pull/79) fue fusionado a `main`
  el 2026-08-17 en `85f3517`. Sobre ese SHA pasaron PostgreSQL 16 y contratos
  SQL, lint, type-check, tests, build, Playwright aislado, auditoría de
  seguridad, CodeQL y NPM Audit. Render desplegó
  `dep-da1i4su417fc73ai2rlg` y Vercel dejó `READY` el deployment productivo
  `dpl_GDNtR83fFAQhoqNwnyxK5Aqgmv9W`; `/`, `/login` y `/demo` responden 200 en
  `https://erp-web-zeta-neon.vercel.app`.
- El cierre Web del 2026-08-13 reporta type-check limpio, build Next 131/131 y
  un perfil Playwright aislado de 16/16 pruebas: autenticación, maestro de
  inventario, gate fiscal de NC/ND, monitor outbox contable con `failed` y
  `dead_letter`, Kardex con unidades mixtas/fecha del tenant, liquidación sólo
  por transferencia y edición de productos legacy sin asumir NIU. El cierre
  previo del 2026-08-07 reportó build Next 124/124
  rutas; 73 rutas se verificaron en escritorio y móvil (146 casos) y el
  recorrido visible de demos nuevas PE/AR/CO no presentó errores de consola.
  La inspección autenticada posterior en PROD confirmó los flujos Perú de
  contabilidad, PLE 3.17, impuestos, SIRE, RRHH/PLAME, POS, compras, inventario
  y finanzas; el menú financiero expone CxC, CxP, bancos, tesorería,
  conciliación y reportes según permiso, sin trazas de objetos operativos en la
  consola del navegador.
- El smoke productivo autorizado del 2026-08-11 creó demos temporales mediante
  el endpoint público y verificó, sin transmitir a SUNAT, el selector de cinco
  rubros, rol personalizado tenant-scoped, CPE `01/03/07/08`, GRE, SIRE, POS
  con ticket canjeable, listas por vendedor/producto/marca, comisiones,
  consolidado de hasta diez ventas, aging CxC y kardex valorizado. La imagen de
  producto se subió por la API real a `product-images`, devolvió URL pública
  legible y se retiró mediante el writer idempotente; el producto quedó sin URL.
  La conversión mostró las ofertas 3 meses, 6+3 y 12+6, sin crear un pago
  ficticio ni habilitar fiscalmente al demo.
- Los cálculos de nómina PE/AR/CO conservan cobertura automatizada sin depender
  de una base remota. Las pruebas con escritura no se ejecutan en PROD.
- Factura `01` y boleta `03` cuentan con evidencia aceptada en SUNAT beta; RA y
  RC conservan evidencia de ticket/consulta. El soporte `07/08` existe y está
  probado localmente, pero no se encontró un artefacto crudo versionado que
  demuestre una aceptación beta de ambas notas; no se afirma esa homologación.
- Inventario usa un único ledger físico por almacén.
- Desktop/Tauri está implementado como cliente offline-first con SQLite y outbox
  por tenant.

## Entornos

| Entorno | Proyecto Supabase      | Estado                                     |
| ------- | ---------------------- | ------------------------------------------ |
| PROD    | `wypnbcptofqdmoynlonq` | Único destino remoto; datos reales         |
| DEV     | retirado               | Bloqueado; no se usa para desarrollo ni QA |

Reglas vigentes:

- Nunca ejecutar QA ni seeds sintéticos ad hoc en PROD. La demo pública es una
  función productiva: sólo puede crearse por su endpoint versionado y para una
  verificación explícita del flujo de cliente.
- El runtime usa `.env.production` o secretos inyectados; no carga `.env.local`
  ni `.env`.
- QA con escritura usa dobles o infraestructura local efímera; nunca PROD.
- Toda operación DB comienza con `scripts/db-environment-preflight.ps1`.
- Todo borrado en PROD exige autorización explícita, respaldo, transacción y
  evidencia posterior.

La migración `346__deployment_environment_boundary.sql` está aplicada en PROD.
La purga de datos demo del 2026-07-14 se completó; PROD alberga actualmente los
tenants operativos y ninguna dependencia del proyecto DEV retirado.

## Migraciones

- `000..346`: baseline y hardening presentes según el esquema verificado en
  PROD, que conserva `000..002` como baseline consolidado.
- `347..382`: sus relaciones, columnas, constraints e índices están presentes
  en PROD. No deben reaplicarse a ciegas: el contraste de catálogos del
  2026-08-07 encontró deriva previa en 13 definiciones de funciones y dos
  políticas ajenas al cierre contable, que requiere reconciliación separada.
- `383..394`: aplicadas y registradas en PROD. La promoción productiva del
  2026-08-07 tuvo preflight satisfactorio, respaldo PostgreSQL 17 verificable,
  ensayo transaccional con `ROLLBACK` y aplicación oficial sin seeds ni roles.
- `395`: aplicada y registrada en PROD el 2026-08-07, después de preflight,
  respaldo PostgreSQL 17 verificable y ensayo integral con `ROLLBACK`. Añade
  activación SIRE opt-in por tenant, ticket/estado SUNAT y bitácora RLS; la
  validación posterior confirmó cero activaciones automáticas y cero operaciones.
- `396`: aplicada y registrada en PROD el 2026-08-07 después de preflight,
  respaldo PostgreSQL 17 verificable y ensayo transaccional con `ROLLBACK`.
  Añade borradores mensuales versionados de IGV/Renta Perú, fuentes auditables
  y registro de constancia externa; la validación confirmó cero declaraciones
  creadas por la migración.
- `397`: aplicada y registrada en PROD el 2026-08-07 después de preflight,
  respaldo PostgreSQL 17 verificable y ensayo con `ROLLBACK`. Añade conciliación
  anual FV 710/ITAN versionada y corrige el momento en que una constancia
  anterior pasa a `RECTIFICADA`; la validación confirmó cero declaraciones.
- `398`: aplicada y registrada en PROD el 2026-08-07 después de preflight,
  respaldo PostgreSQL 17 verificable y ensayo con `ROLLBACK`. Añade fichas
  laborales SUNAT y paquetes versionados PLAME/T-Registro con fuentes PVS,
  huellas, ticket y CIR; la validación confirmó RLS/FORCE en ambas tablas y
  cero fichas o presentaciones creadas por la migración.
- `399`: aplicada y registrada en PROD el 2026-08-07 después de preflight,
  respaldo PostgreSQL 17 verificable y ensayo con `ROLLBACK`. Evita reenviar
  altas T-Registro sin cambios: ticket, CIR y huella por trabajador se confirman
  en la misma transacción; la validación confirmó cero datos creados.
- `400`: aplicada y registrada en PROD el 2026-08-07 después de preflight,
  respaldo PostgreSQL 17 verificable y ensayo con `ROLLBACK`. Separa la
  constancia PLAME del ticket/CIR de T-Registro y sólo exige estos últimos cuando
  el paquete contiene novedades registrales; la validación confirmó la nueva
  firma transaccional, la columna CIR y cero datos creados.
- `401..411`: aplicadas y registradas en PROD el 2026-08-07 con preflight,
  respaldos verificables, ensayo transaccional y verificadores posteriores.
  Cierran RBAC de CONTADOR para PLAME y lectura operativa de proveedores,
  normalizan el estado `APROBADA`, publican los puentes RPC tributarios,
  hacen atómica e idempotente la generación/reagenda de plantillas y completan
  las cuentas PCGE usadas por diferidos. `410` deja el seeder canónico listo
  para tenants existentes y futuros; la verificación cubrió 32 de 32 roles
  CONTADOR sin otorgar permisos de mutación.
- `411`: agrega la RPC backend-only del Balance de Comprobación PLE 3.17. La
  agregación tenant-scoped ocurre en PostgreSQL para no truncar movimientos por
  el límite de PostgREST; sólo toma asientos confirmados y separa apertura,
  movimientos y cierre. El ensayo se revirtió, la función quedó como
  `SECURITY INVOKER`, `anon/authenticated` no pueden ejecutarla y el tenant de
  verificación devolvió 15 cuentas PCGE.
- `412..433`: aplicadas y registradas en PROD el 2026-08-07 después de preflight,
  respaldo PostgreSQL 17 restaurado en infraestructura local efímera y ensayo
  íntegro sobre una copia de PROD. Cierran la hidratación transaccional de demos,
  conversión demo→real, teléfono de clientes, costo de ventas POS/pedidos,
  planilla y liquidación atómicas, cuenta PCGE 4699, asientos/CxP/pagos con
  outbox e idempotencia y la firma única de `create_demo_tenant`. La `433`
  restaura además el contrato exacto de nombres requerido por PostgREST
  (`p_nombre`, `p_dias_duracion`, `p_pais_codigo`), recarga su caché de esquema
  y rechaza la sobrecarga histórica de dos argumentos. El verificador
  posterior confirmó 21 versiones, 29/29 demos consultables, cero asientos
  confirmados descuadrados, cero roles `ADMIN_DEMO` en cuentas reales, cero
  teléfonos inválidos y cero tenants sin 4699. Los RPC `SECURITY DEFINER` que
  aceptan `tenant_id` quedaron limitados a `service_role`.
- `434..490`: aplicadas y registradas en PROD el 2026-08-11 tras preflight,
  respaldo completo verificable, restauración PostgreSQL 17 y ensayo de la
  cadena en infraestructura local. El rango fuerza RLS/ACL y `SECURITY DEFINER`
  service-only, normaliza `pgcrypto`, locks y validadores runtime, y mueve los
  writers de ventas, compras, recepción, inventario, POS/caja, facturación,
  bancos, tesorería, RRHH, administración, configuración, importaciones y
  contabilidad a fronteras SQL atómicas con actor, huella e idempotencia.
  También incorpora CPE/GRE/SIRE durables, RMA y reembolsos/reversas, imágenes
  de producto, listas de precios/comisiones/consolidados, ticket POS canjeable,
  aging CxC y kardex multimoneda, cierres contables residuales y el contrato
  comercial/RBAC del demo. El postcheck remoto confirmó 57 versiones, bucket
  `product-images` con cuatro políticas, RPC RBAC service-only, 40 demos con
  `users.manage` y cero permisos globales restringidos en `ADMIN_DEMO`.
- La cadena completa `434..490` tiene verificadores transaccionales verdes.
  Una reconstrucción limpia desde cero aplicó el rango íntegro; la API pasó
  193 suites/1.673 pruebas con cobertura y los typechecks API/Web. Las carreras reales
  de recepción, RMA, caja, RRHH, CPE y canje POS confirmaron un solo efecto por
  intención. Esta evidencia local no autoriza ni sustituye la promoción PROD.
- `491..496` están aplicadas y registradas en PROD desde el 2026-08-17:
  tolerancia POS a
  `pagos=null`; outbox single-writer, claims y readiness pasivo; concurrencia de
  diez usuarios/cajas y techo RBAC del demo; efecto financiero de NC/ND sólo
  después de aceptación+CDR; permisos/maker-checker y tesorería real de RR. HH.;
  límite de diez fuentes comerciales y Kardex con apertura, saldo corrido,
  fecha local y unidades no mezclables. La reconstrucción limpia `000..496`,
  sus seis verificadores y el gate de esquema `496` pasaron en PostgreSQL 16.
  También pasó el ensayo `490→496` sobre un respaldo restaurado de PROD en
  PostgreSQL 17: conservó 55 tenants, el backfill laboral procesó cero filas
  ambiguas y readiness terminó listo en esquema `496`. La evidencia está en
  `artifacts/qa-10-questions/prod-490-to-496-rehearsal-20260813.json`. La
  promoción real conservó 55 tenants, procesó cero filas ambiguas del backfill
  laboral y terminó con readiness remoto listo en esquema `496`; su evidencia
  operativa está en
  `artifacts/qa-10-questions/prod-491-496-promotion-20260817.json`.
- `497` está validada sólo localmente y **no** promovida a PROD. Corrige el
  bloqueador por el que la sesión de caja de la demo peruana no podía cerrarse
  nunca: `app.hydrate_demo_business_sample_tx` creaba la venta POS con un INSERT
  directo sobre `ventas_pos`, sin `accounting_event_id`, `atomic_result` ni
  `documento_id`, y con `cpe_pendiente` puesto sobre un ticket interno `T001`
  puro. Eso hacía fallar `cerrar_caja_tx` con `CASH_CLOSE_HAS_PENDING_CPE` y
  después con `CASH_CLOSE_HAS_INCOMPLETE_POS_SALE`, y contradecía el invariante
  de `MODULES.md` según el cual un ticket interno puro no bloquea el cierre.
  Ahora el seed llama a `public.pos_registrar_venta_atomic_tx` con
  `emitir_cpe = false` y se eliminan las escrituras que duplicaba a mano
  (detalle, pagos, dos movimientos de inventario, movimiento de caja y el UPDATE
  de la sesión): queda una sola forma de crear una venta POS en todo el sistema.
  La migración no toca el esquema de `supervisor_pins`; sólo añade las RPC
  `registrar_pin_supervisor_tx` y `verificar_pin_supervisor_tx` sobre el modelo
  que ya existía desde `185`/`186`, porque el backend aceptaba como válido
  cualquier código de seis dígitos. La reconstrucción limpia `000..497` con sus
  siete verificadores pasó en PostgreSQL 16, y el ensayo de aceptación creó un
  tenant demo por su RPC productiva y cerró su caja (`estado=CERRADA`,
  `diferencia=0.00`).
- Los importes de la venta POS demo cambian con esa corrección: el seed los
  escribía como 53.39 / 9.61 / 63 tratando el precio de catálogo como IGV
  incluido, mientras el motor de precios lo trata como neto. Derivados del
  catálogo pasan a subtotal 63.00, IGV 11.34 y total 74.34, con la caja demo en
  174.34. Ningún test ni verificador dependía de los valores anteriores.
- El runtime exige el esquema de la última migración (`render.yaml`,
  `env.schema.ts` y `app.controller.ts`). Como en promociones anteriores, la
  base debe alcanzarlo antes de desplegar el runtime nuevo.
- La retención de quinta categoría de Perú se reescribió según el artículo 40 del
  Reglamento de la LIR (sin migración; el historial se deriva de los datos que ya
  existen). El motor anterior tomaba el ingreso del mes, lo multiplicaba por doce,
  restaba 7 UIT y dividía siempre entre doce. Eso fallaba de dos maneras: en un mes
  con gratificación la proyección anual se duplicaba —con sueldo 3 200 retenía
  349.65 en julio donde correspondían 34.38— y, al no descontar lo ya retenido ni
  cambiar el divisor, el total del ejercicio nunca cuadraba con el impuesto anual.
  Ahora la regla vive aislada en `renta-quinta-peru.util.ts`, se proyecta la renta
  con las gratificaciones del ejercicio sin contarlas dos veces, se descuenta el
  acumulado leído del concepto `105` de periodos anteriores y se aplica el divisor
  del mes (12/12/12/9/8/8/8/5/4/4/4, diciembre regulariza el saldo). El cálculo
  peruano exige ahora el periodo `YYYY-MM`: sin él falla cerrado en vez de retener
  cero, que sería una retención omitida.
- Efecto operativo del cambio anterior: cambia el neto mensual de todo trabajador
  cuya renta proyectada supere las 7 UIT. Deja de haber picos en julio y diciembre
  y aparece una retención estable el resto del año; el total del ejercicio pasa a
  coincidir con el impuesto anual. No cubre las rentas de un empleador anterior
  (certificado de rentas y retenciones), que sigue pendiente.
- El régimen pensionario peruano dejó de suponerse. Las dos rutas de planilla
  discrepaban ante la misma entrada: `calcularEmpleado` caía a `|| 'AFP'` y
  descontaba cerca del 13 % a un trabajador cuyo régimen nunca se declaró, mientras
  `calcularEmpleadoPersonalizado` rechazaba ese mismo dato. Ahora ambas fallan
  cerrado, `validarContratoPeru` exige AFP u ONP en contratos laborales, y una
  afiliación AFP debe declarar administradora y tipo de comisión en vez de caer a
  Integra/FLUJO en silencio. El frontend ya enviaba el régimen, así que el alta de
  contratos no cambia. Las tasas del motor (10 % + 1,55 % + 1,37 % = 12,92 %) ya
  eran correctas; queda pendiente el catálogo por AFP, que hoy usa las de Integra
  para las cuatro administradoras.
- `498` está validada sólo localmente y **no** promovida a PROD. La planilla de la
  demo traía los importes escritos a mano y el del trabajador con contrato AFP
  estaba mal: 416 sobre 3 200 es el 13 % de la ONP, no el 12,92 % de una AFP. Es el
  mismo patrón que cerró la `497` con la venta POS —dato derivado escrito a mano en
  vez de producido por el motor—, y reaparece solo cada vez que cambia una tasa o
  una regla. Como no existe un writer SQL de planilla al que delegar, la planilla
  demo pasa a nacer en borrador y sin líneas por empleado: el usuario pulsa
  «Calcular» y ve lo que produce el motor real. El readiness sólo exige que la
  planilla exista.
- El runtime exige ahora esquema `498`.
- La configuración fiscal dejó de fallar abierta. `TaxCalculatorService` devolvía
  Perú 18 %/PEN ante cualquier fallo —error de consulta, país sin resolver, fila
  ausente o tasa inválida—, de modo que un tenant colombiano facturaba al 18 % en
  vez del 19 % y uno argentino al 18 % en vez del 21 %, sin señal alguna. La
  validación de tasa inválida ni siquiera llegaba al llamador: la atrapaba su
  propio `catch`. Además la lectura de `empresa_config` descartaba el error y caía
  a `pais_id = 1`, y como esa tabla no tiene índice único por tenant, una fila
  duplicada bastaba para volver peruano a cualquiera. Ahora todo eso lanza. El
  endpoint `configuracion-fiscal` también tenía su propio fallback a 18 %/PEN con
  `success: true`, que afirmaba una tasa falsa con la confianza de un dato real;
  ahora responde 503. El redondeo pasó de punto flotante a Decimal.js:
  `round(1.005)` daba 1 y ahora da 1.01.
- Consecuencia operativa: un tenant sin país o sin configuración fiscal resoluble
  ya no puede cobrar, en vez de cobrar mal. Es lo que fija el README —«operaciones
  fiscales y financieras fallan cerrado»—: un cobro detenido se nota y se corrige;
  un impuesto mal calculado se declara. El catálogo global cubre PE, CO, CL, MX y
  AR, así que un tenant correctamente dado de alta resuelve.
- Un timeout del cliente dejó de confundirse con estar sin conexión. `use-api`
  aborta a los 12 s (30 s en el POS) y `offline-store` trataba ese aborto como
  desconexión: encolaba la escritura y devolvía 202 con `success: true`. Pero un
  timeout significa que el servidor pudo haberla procesado y sólo se perdió la
  respuesta, así que reenviarla arriesgaba un duplicado —una venta, un pago o un
  CPE cobrados dos veces— y encima el llamador creía que había terminado bien. El
  propio `use-api` documenta que no reintenta escrituras por ese motivo; la cola lo
  contradecía por debajo. Ahora un `AbortError` se propaga y sólo se encola cuando
  la petición no llegó a salir. Alcanza a los ~130 puntos de escritura del
  dashboard, que pasan todos por ese cliente.
- El POS tampoco da por cobrada una respuesta encolada. Sólo miraba
  `success === true` e ignoraba el `queued: true` que ya venía en el cuerpo, de
  modo que ante una caída de red marcaba PAGADA, limpiaba el carrito y mostraba un
  número de ticket inexistente en el servidor. Ahora avisa que la venta quedó
  pendiente de sincronizar y no la confirma.
- La venta POS dejó de poder duplicarse por un reintento del cajero. El backend
  deduplica una venta POS **sólo** por la clave de idempotencia del cliente —el
  índice único y `pos_reintento_comercial_469` se apoyan únicamente en ella; el
  `request_fingerprint` sirve para rechazar una clave reusada con otro payload, no
  para detectar el mismo payload bajo otra clave—, y el POS la borraba justo en el
  `catch`, cuando un fallo de red o un timeout hacen más probable que el servidor
  sí haya procesado la venta. Además la leía del estado de React en el mismo tick
  en que la escribía, así que la clave guardada nunca era la enviada. Ahora vive en
  un ref, atada a una huella de la intención (`apps/web/lib/pos-idempotencia.ts`):
  se reutiliza mientras el carrito, el cliente y los pagos no cambien, se renueva
  si cambian —evitando `POS_IDEMPOTENCY_PAYLOAD_MISMATCH`— y se descarta sólo al
  confirmarse la venta. Cambio de frontend; sin migración.
- Las fechas de negocio calculadas en Node dejaron de resolverse en UTC. La
  migración 370 arregló esto del lado de la base con `app.hoy_tenant`, pero esa
  función vive en el esquema `app` y PostgREST no la alcanza, así que la
  aplicación seguía contradiciendo a la base sobre qué día era. El efecto que
  documenta la propia 370: pasadas las 19:00 de Lima el sistema ya cree estar en
  la fecha siguiente. Se corrigieron los sitios donde la fecha decide o se
  persiste —marca de asistencia, filtro de CxC vencidas, ventana de movimientos de
  inventario, cierre diario de ventas, métricas del dashboard, estadística de CPE
  del día, rango por defecto de reportes de centro de costo, fecha de emisión de
  respaldo del CPE y el `IssueDate` del AttachedDocument de DIAN—. La tabla de
  zonas horarias de `fecha-peru.util.ts` espeja exactamente `app.zona_horaria_pais`
  y una prueba lo comprueba, para que no vuelvan a divergir.
- Quedan cuatro usos de fecha UTC, todos justificados y cubiertos por un guardián
  automatizado (`fecha-utc-guard.spec.ts`): dos nombres de archivo exportado, un
  respaldo inalcanzable de planillas y `accounting-entries.service.ts`, que no está
  inyectado en ningún módulo y debería retirarse.
- El recargo nocturno y el trabajo en dominical o festivo de Colombia dejaron de
  perderse. La pantalla de cálculo los capturaba en campos editables y los sumaba
  al neto que mostraba, pero no viajaban al backend: el DTO no los declaraba y, con
  `forbidNonWhitelisted` activo, enviarlos habría devuelto 400. El motor los
  liquidaba en cero y el trabajador aprobaba un neto que no era el que cobraba. El
  motor colombiano siempre supo calcularlos —35 % y 90 % sobre la hora ordinaria de
  210 horas mensuales, las mismas tasas que usa el preview—; lo que faltaba era el
  transporte. No requiere migración: los valores viajan por la petición de cálculo.
- Analytics: el aging de cuentas por cobrar sólo clasificaba las vencidas, así que
  una cartera sana salía entera en cero mientras el total mostraba saldo —de ahí la
  contradicción de ver cifras de deuda junto a «sin saldos pendientes»—. Ahora
  existe el tramo «Por vencer» y la suma de los tramos iguala el total. El caché
  del panel usaba una clave global de `localStorage`: al cerrar una empresa y
  entrar a otra en la misma pestaña se pintaban las cifras de la anterior hasta que
  llegaba la respuesta nueva. La clave lleva ahora el tenant y el snapshot antiguo
  se retira.
- Los indicadores de liquidez y rentabilidad de Analytics **no** se corrigieron: su
  fórmula no es contable —liquidez se calcula como ventas del mes más CxC entre
  CxP, que no es la razón corriente, y rentabilidad ignora el costo de ventas, por
  eso marca cerca de 100 %—. Quedan rotulados en pantalla como estimación no
  contable, con el detalle en el propio aviso, hasta que se defina el criterio.
- Se cerraron las cinco rutas que llevaban a 404 sin crear pantallas nuevas: «Ver
  recepciones» de una orden apunta al listado de recepciones y el pago masivo a la
  página de tesorería, que sí existen. Se retiraron los botones «Editar» de orden
  de compra y de cotización en borrador, porque no hay pantalla de edición y
  ofrecerlos era prometer algo inexistente; la página de detalle conserva aprobar,
  enviar y cancelar. También se retiró «Detalle» de CxC: además de apuntar a una
  ruta inexistente, era el único botón de esa fila sin `ProtectedComponent`, así que
  reapuntarlo al historial habría abierto una vía sin permiso `finanzas.cxc.read` al
  mismo dato que el botón «Historial» sí protege.
- Esos botones volvieron, ahora contra los writers que ya existían. Los tres
  documentos tienen modal de edición de cabecera limitado a lo que aceptan
  `actualizar_orden_compra_tx`, `actualizar_cotizacion_compra_tx` y
  `actualizar_planilla_borrador_tx_495`: payload parcial, sin tocar el detalle y
  sólo en borrador. Cambiar líneas sigue exigiendo el formulario de alta. El
  detalle de CxC no se repone: el drawer «Historial», protegido por
  `finanzas.cxc.read`, ya muestra ese dato.
- «Editar planilla» no era un stub visible: la función existía y ningún botón la
  llamaba, así que el aviso de «en desarrollo» nunca llegó a mostrarse. «Exportar
  órdenes» ya baja un CSV con los filtros aplicados.
- Los errores del writer se muestran dentro del modal y no en un toast detrás de
  él: `useApi` devuelve `null` por defecto y sólo notifica por toast, así que los
  modales de edición usan `throwOnError`. Comprobado con el rechazo por período
  de planilla duplicado.
- Las fechas de calendario se pintaban un día antes. `new Date("2026-08-19")` se
  interpreta como medianoche UTC y en Lima retrocede al día previo; estaba en 30
  puntos de 27 archivos. Se resuelven con `parseDateLocal`, y `test:fechas`
  impide que el patrón vuelva.
- Los 59 `@Body()` sin DTO están cerrados: 27 declaraban `any` y 32 un tipo
  estructural en línea, que TypeScript borra al compilar. En ambos casos el
  `ValidationPipe` global no tenía esquema y el body entraba sin comprobar.
  Cada DTO se construyó contra las dos puntas —la lista blanca del servicio o
  del writer y el payload real de la pantalla— porque con `forbidNonWhitelisted`
  un campo legítimo sin declarar convierte un alta que funciona en un 400. Eso
  destapó tres que la pantalla envía y el writer descartaba (`experiencia_años`
  con eñe, `estado_civil`, y cuatro campos que viajan como arreglos por ser
  `jsonb`). `body-tipado.guard.spec` impide que reaparezca cualquiera de las dos
  formas.
- Los verificadores de web (`test:offline`, `test:onboarding`, los dos de POS,
  `test:fechas` y `test:etiquetas`) ya se ejecutan en CI. Existían en `package.json` desde hacía tiempo pero
  ningún workflow los corría, así que no protegían de nada. Van antes de instalar
  Chromium, para que fallen rápido.
- El caché de configuración fiscal se invalida junto con el resto del tenant.
  `invalidateTenantCache` existía sin que nadie lo llamara: cambiar la tasa o el
  país de un contribuyente tardaba hasta cinco minutos en surtir efecto, y por cada
  instancia del API.
- La contraseña del aprobador de la demo se genera con `randomInt` y no con
  `Math.random`, que no es criptográfico y cuyo estado interno se reconstruye a
  partir de unas pocas salidas. Es una credencial de acceso real.
- El **Bloqueador 2 «CPE invisible» no se reproduce** y queda descartado. Se
  verificó el 2026-08-19 sobre una demo peruana creada por el endpoint productivo:
  `GET /api/cpe/comprobantes` respondió `200` con `success: true`, un comprobante y
  `meta.total = 1`, y el módulo lo listó junto con sus indicadores. Antes se habían
  descartado contra base limpia las seis causas plausibles (fila ausente,
  `activo=false`, permiso inexistente, permiso no concedido, ruta mal construida y
  filtros del listado). La hipótesis que queda es un fallo transitorio de lectura
  tragado en silencio por el cliente, que es justo lo que cierra el arreglo del
  timeout: una lectura fallida ya no puede confundirse con una respuesta vacía.
- Esa misma sesión dejó dos defectos comprobados en producción, ambos ya
  corregidos en esta rama. El listado de CPE derivaba la fecha del comprobante con
  `toISOString()`: a las 20:15 de Lima mostraba la factura demo fechada
  `2026-08-20`, es decir con fecha futura y en el periodo tributario equivocado.
  Y `deudas-clientes` devolvía el gráfico de antigüedad en `[0,0,0,0]` mientras el
  total por cobrar era `179.80`, porque la única cuenta estaba vigente y ningún
  tramo la recogía.
- El barrido de fechas se amplió a la variante `new Date(valor).toISOString()`, que
  convierte un `timestamptz` ya guardado y lo presenta en UTC. El guardián
  automatizado cubre ahora ambas formas.
- Se retiraron tres servicios de `shared/integration/` que no estaban inyectados en
  ningún módulo: `accounting-entries` (con un IGV `1.18` cableado, roto para AR y
  CO, y siete fechas UTC), `accounting-reports` y `dashboard-integration` (con
  dieciocho rangos por fecha en UTC). Eran instanciados por Nest y nunca usados;
  su única consecuencia real era contaminar cada auditoría.
- Se retiró el job de inventario cíclico automático. Fabricaba el conteo físico
  con `Math.random()` sobre el stock del sistema, calculaba la «diferencia» contra
  ese número inventado y la publicaba con `requiereAjuste`. Un conteo físico no se
  calcula, se cuenta. Nadie escuchaba el evento y el flag estaba apagado, así que
  no cambia nada operativo; lo que se elimina es la posibilidad de corromper el
  inventario si alguien lo encendía.
- La proyección de flujo de caja dejó de añadir ruido aleatorio sobre el promedio
  histórico: la misma proyección cambiaba en cada recarga y dos personas mirando la
  pantalla a la vez veían cifras distintas. La incertidumbre ya la expresan los
  escenarios optimista y pesimista, que son bandas explícitas.
- Los únicos `Math.random()` que quedan en el API son el *jitter* de reintento de
  contabilidad y de SUNAT, que es su uso correcto.
- Los indicadores de Analytics pasan a la definición contable estándar. Liquidez
  es la razón corriente —activo corriente (bancos + cuentas por cobrar +
  inventario valorizado) entre pasivo corriente— en vez de
  `(ventas del mes + CxC) / CxP`, que no es un ratio de liquidez y contaba dos
  veces las ventas a crédito. Rentabilidad es el margen neto: descuenta el costo
  de ventas además de los gastos, con lo que deja de marcar cerca de 100 % y darlo
  por bueno. El costo se calcula por ítem vendido contra el costo actual del
  producto; es una aproximación, no un costeo por capas, y así se rotula.
- Las tasas AFP dejan de caer a las de Integra. Las publica la SBS, cambian por
  trimestre y difieren entre las cuatro administradoras, así que el alta de un
  contrato AFP exige declarar comisión y prima. El frontend ya las enviaba
  diferenciadas por AFP (Hábitat 1,47 %, Integra 1,55 %, Prima 1,60 %, Profuturo
  1,69 %); era el backend el que las descartaba, de modo que un afiliado a Prima,
  Profuturo o Hábitat se liquidaba con la comisión de Integra. No se cablea un
  catálogo de tasas en el código: quedaría obsoleto en el próximo cambio de la SBS.
- Antes de aplicar migraciones, comprobar que no existan prefijos duplicados.
- Las migraciones son la fuente de verdad; los inventarios forenses son evidencia
  auxiliar y viven en `artifacts/db-forensics/`.

Cambios recientes principales:

- `347..352`: inventario single-ledger, almacén de caja POS y writers únicos.
- `353`: alineación de clientes y CxC.
- `354` y `357`: secuencia fiscal única y resincronización de contadores.
- `355`: permisos ADMIN normales separados de ADMIN demo.
- `356` y `358`: IGV según afectación tributaria en CPE, ventas y POS.
- `359..360`: tipificación e integridad de medios de pago.
- `361`: depósitos semestrales de CTS.
- `362`: segregación de aprobación de compras configurable por tenant.
- `363`: localización Argentina, catálogos ARCA/IVA, configuración WSAA/WSFE y
  demos PE/AR contextualizadas.
- `364`: normativa laboral argentina versionada, configuración RRHH por tenant,
  CUIL/CCT/categoría/modalidad/obra social/ART, moneda de planilla y readiness
  legal-operativo.
- `365`: activación integral de Colombia, parámetros RRHH 2026, configuración
  PILA/nómina electrónica, catálogos DIAN y demo de tres países.
- `366`: tipos documentales RRHH por país y reparación de cédulas colombianas
  que habían sido normalizadas como `OTRO`.
- `367`: normativa laboral colombiana 2026 versionada (jornada, recargos, UVT y
  tope IBC).
- `368`: frontera demo→real colombiana: fixtures completos en demo, limpieza
  fail-closed de credenciales sintéticas al convertir y onboarding DIAN/PILA.
- `369`: QA demo Colombia: escala monetaria COP, catálogo PUC visible y
  equivalencias internas ocultas para los generadores contables históricos.
- `370..382`: fecha local por tenant, bases fiscales por afectación, kardex,
  conversión y prueba por transferencia, RBAC canónico e inventario/producto
  atómico.
- `383..388`: ciclo de vida del asiento, multi-moneda, plantillas recurrentes,
  activos fijos, conciliación de partidas, distribución analítica y diferidos.
- `389..392`: atomicidad e idempotencia de escrituras contables, conciliación,
  distribución, devengos, depreciaciones, bajas y transiciones de borrador.
- `393..394`: consolidación multiempresa con aceptación, tasas tipificadas,
  ajustes sin alterar libros, mapeo de cuentas y reportes configurables seguros.
- `396`: IGV/Renta mensual Perú para NRUS, RER, RMT y General, con cálculo
  server-side, advertencias, versionado y constancia SUNAT externa.
- `397`: Renta Anual/ITAN Perú para RMT y General, conciliación manual
  sustentable, bloqueo por ejercicio abierto/descuadre y constancia externa.
- `398`: planilla electrónica Perú con papeles de trabajo PLAME, fuentes
  T-Registro E04/E05/E11/E17 bloqueadas ante datos incompletos, versionado y
  evidencia externa de PVS/SOL.
- `399`: detección de novedades T-Registro por huella aceptada; una ficha sin
  cambios no vuelve a proponerse y cualquier cambio reactiva la fuente PVS.
- `400`: evidencia PLAME y evidencia T-Registro independientes, preservadas en
  una sola transacción con las huellas de los trabajadores aceptados.
- `401..411`: paridad operativa del rol CONTADOR, RPC transaccionales de Perú,
  PCGE para diferidos y recurrencia contable reprogramable.
- `412..424`: demos empresariales coherentes y conversión a cuenta real sin
  estado parcial; backfills limitados a tenants aún marcados como demo.
- `425..490`: escrituras críticas de planilla, liquidación, asientos, factura
  proveedor y pago bancario en una sola transacción, con outbox e idempotencia;
  además de los cierres comerciales, fiscales, logísticos, financieros,
  administrativos y contables descritos arriba. El rango completo está
  promovido en PROD; la evidencia local y el respaldo restaurable conservan el
  ensayo coordinado previo.
- `491..496`: hardening posterior validado sólo localmente. La promoción debe
  detenerse si el preflight del backfill `490→492` encuentra un evento laboral
  sin snapshot contable inequívoco; el runtime nuevo exige esquema `496` y no
  debe desplegarse antes que la base.

## Flujos cerrados técnicamente

- Auth, sesión HttpOnly, RBAC, RLS y aislamiento tenant.
- Catálogos, clientes, proveedores y configuración empresarial.
- Ventas, cotizaciones, pedidos, POS, caja y pagos.
- CPE `01/03/07/08`, RA y RC en beta.
- Argentina: CUIT, ARS, IVA `0/10,5/21/27`, Facturas A/B/C/E/M y notas
  WSFEv1, punto de venta, CAE/QR y autenticación WSAA implementados.
- Colombia: NIT con dígito de verificación, COP, IVA 19 %, factura electrónica
  DIAN y documento soporte de pago de nómina configurables. La demo comprueba
  el WSDL oficial sin transmitir; la emisión real falla cerrado mientras no
  exista transporte SOAP WS-Security/XAdES homologado con credenciales reales.
- Compras, recepción, inventario, reservas, logística y kardex.
- Finanzas, CxC, CxP, bancos y conciliación. Contabilidad cubre las siete fases
  auditadas: ciclo de vida, multi-moneda, recurrentes, activos, partidas
  abiertas, analítica/diferidos y consolidación/reportes configurables.
- Los TXT PLE de Diario y Mayor sólo incluyen asientos `CONFIRMADO`. El Balance
  de Comprobación usa la estructura oficial 3.17 (`031700`), fecha de cierre y
  19 campos; 3.1 queda reservado al Estado de Situación Financiera. Todo TXT
  debe pasar por el validador PVS antes de adquirir valor legal.
- RRHH con despacho normativo por país: Perú conserva AFP/ONP, EsSalud, quinta
  categoría, gratificaciones, CTS y vacaciones; Argentina usa SIPA, INSSJP,
  obra social, contribuciones patronales, ART, SAC, vacaciones LCT,
  Ganancias configurable y liquidación final argentina; Colombia usa salud,
  pensión, ARL, caja de compensación, parafiscales, auxilio de transporte,
  horas extra/recargo nocturno, prima, cesantías, intereses, vacaciones,
  liquidación final y nómina electrónica.
- Planilla electrónica Perú prepara papeles de trabajo PLAME de quinta y cuarta
  categoría, usa jornada verificada por asistencia o captura manual explícita y
  genera fuentes `RP_<RUC>.ide/.tra/.per/.est` sólo ante novedades T-Registro.
  Nunca marca PLAME presentado sin constancia SUNAT ni acepta una novedad
  T-Registro sin ticket y CIR. PVS y SOL siguen siendo los validadores/canales
  oficiales externos.
- Tema dark/light, shell responsive, Analytics y navegación por roles.
- Offline desktop: SQLite local, outbox durable y caché por tenant.

“Cerrado técnicamente” significa que el código y las pruebas controladas pasan; no
reemplaza homologación legal, credenciales finales, hardware físico ni smoke
productivo autorizado.

## Decisiones e invariantes vigentes

- `producto_existencias` es la fuente física de stock por almacén.
- `aplicar_movimiento_inventario_tx` es el writer canónico de movimientos.
- POS deriva `almacen_id` de la caja de la sesión.
- Series fiscales `Bxxx/Fxxx` comparten una sola secuencia por tenant; `Txxx` es
  ticket interno.
- Recepciones y reservas usan RPC transaccionales e idempotentes.
- CPE y GRE fallan cerrado ante firma, credenciales o respuesta inválidas.
- SIRE real sólo puede ejecutarse cuando `EXPECTED_SUPABASE_PROJECT_REF` apunta
  a PROD. Un ticket queda pendiente y sólo el estado SUNAT `06 Terminado` se
  presenta como propuesta aceptada; la generación final del libro sigue en SOL.
- El adaptador fiscal se resuelve por país: SUNAT para PE, ARCA WSAA/WSFEv1
  para AR y DIAN para CO; el modo demo colombiano es explícitamente simulado y
  el caché de contexto web incluye `tenant_id`.
- SUNAT producción exige que el certificado contenga el RUC esperado, salvo una
  excepción explícita y documentada.
- Web usa cookie HttpOnly; no se guardan JWT ni contraseñas en Web Storage.
- Tauri protege secretos locales con DPAPI y la outbox no guarda headers
  sensibles.
- El frontend usa Tailwind 3.4, shadcn/Radix y tokens semánticos.
- `ADMIN_DEMO` puede crear usuarios y roles operativos dentro de su propio
  tenant para probar el sistema. `users.manage` no es delegable a roles custom,
  los permisos globales permanecen prohibidos y ningún writer alterno puede
  asignar `ADMIN_DEMO` sin la autorización administrativa real del actor.

## Cobertura de la auditoría de QA

Mapa de qué se ha revisado y con qué profundidad, para no repetir análisis en
sesiones posteriores. «A fondo» significa leer el código del módulo buscando
fallos de lógica; «barrido» significa que lo cruzó una comprobación de patrón
pero nadie lo leyó.

### Barridos transversales (cubren TODO el repositorio)

Ya ejecutados y con guardián que impide la regresión:

- Fechas resueltas en UTC: `fecha-utc-guard.spec` (backend) y `test:fechas` (web).
- `@Body()` sin DTO, en sus dos formas: `body-tipado.guard.spec`.
- Controles de formulario sin etiqueta: `test:etiquetas`.
- `Math.random` en decisiones, código muerto no inyectado, type-check de
  `scripts/`, idempotencia y offline de POS.

Un barrido **no sustituye** a leer el módulo: los defectos más caros de esta
auditoría —quinta categoría, tasas AFP por administradora, saldo teórico del
arqueo, peso inventado en la GRE— aparecieron leyendo, no barriendo.

### Auditados a fondo

`rrhh` · `cajas` · `cpe` · `pos` · `gre` · `compras` · `configuracion` ·
`analytics` · `usuarios` · `demo` · `permissions` · `auth` · `tenants` ·
y las utilidades compartidas (tax-calculator, fechas, outbox, event-bus, caché,
jobs en segundo plano).

### Tocados sólo de refilón

Aparecen en el historial pero **no fueron revisados**: `contabilidad` (sólo el
DTO de período y las fechas de asiento), `finanzas` (sólo el DTO de análisis de
crédito), `ventas` (dos DTOs y una fecha), `inventario`, `fiscal`, `migration`,
`sire` (sólo la ventana de estadísticas).

### Auditados a fondo en la segunda vuelta (cerrados, no repetir)

- `retenciones`: limpio. Valida `monto` contra `base × tasa` y lo rechaza si no
  cuadra, exige que el tercero corresponda al origen, usa Decimal en todo el
  cálculo y escribe por RPC atómica con actor e idempotencia. El controlador pide
  `finanzas.read`/`finanzas.write` y toma el tenant del JWT.
- `ose`: limpio. El éxito exige código `0` en el CDR de SUNAT, no un HTTP 200; el
  cortacircuitos devuelve `success: false` explícito y ningún `catch` finge
  aceptación. La rama que sí devuelve éxito directo es la del ticket, donde la
  aceptación se resuelve después al consultarlo.
- `validations`: los tres `catch` devuelven `isValid: false`, es decir fallan
  cerrado. **Pero el dígito de verificación del NIT colombiano estaba mal**: los
  pesos de la DIAN se aplicaban en orden inverso, con lo que el dígito de más a la
  derecha pesaba 71 en vez de 3. Comprobado contra cuatro NIT reales y públicos
  (Bancolombia, Ecopetrol, DIAN, Claro): acertaba uno de cuatro por casualidad.
  Rechazaba NIT válidos. Corregido y fijado con esos mismos cuatro. Sin efecto
  hoy: no hay ningún contribuyente con país CO.

  Había **dos copias** de esa fórmula con el mismo error, y la que de verdad se
  usa —alta de proveedor y configuración del contribuyente— era la de
  `paises/initial-country`. Ahora hay una sola implementación exportada y la
  prueba comprueba las dos puertas de entrada, que es lo que impide que vuelvan a
  divergir.

- `paises`: los `catch` degradan bien —caché del catálogo o `false` al validar— y
  las tasas de `initial-country` sólo siembran la configuración de un tenant nuevo.
  Pero el barrido de esas tasas destapó **un tercer respaldo peruano silencioso**,
  en `cpe/fiscal-adapter`, que yo había dado por auditado: sin fila de país o sin
  configuración fiscal devolvía la identidad peruana entera —código PE, IGV, 18 %
  y soles— para el país que fuese. Ahora se detiene. Hoy no dispara, porque
  `configuracion_fiscal` tiene fila para los cinco países.

  Al escribir la prueba apareció además un hueco del propio arreglo: `Number(null)`
  es 0, así que una tasa ausente pasaba como 0 % válido. Se rechaza explícitamente.

  Lección para la lista de arriba: **«auditado a fondo» no significa exhaustivo.**
  De los tres respaldos peruanos, dos se quitaron en la primera vuelta y el tercero
  apareció por un camino lateral, buscando otra cosa.

### Pendientes de auditar a fondo

Catorce módulos, en orden de riesgo decreciente:

1. `retenciones` — cálculo tributario, la familia donde ya salieron errores.
2. `ose` — transporte a SUNAT.
3. `documentos` · `validations` · `paises`.
4. `notifications` · `audit` · `security` · `sunat-retry`.
5. `dashboard` · `reports` · `import-export` · `metrics` · `help`.

### Resultado de la frontera de seguridad (cerrado, no repetir)

`permissions`, `auth` y `tenants` están leídos y **no tienen agujero explotable**.
El guard falla cerrado, valida el tenant dos veces —en el rol y en el permiso— y
rechaza usuarios inactivos; la caché de permisos está desactivada
(`CACHE_TTL = 0`), así que no puede servir permisos revocados. Se comprobó contra
producción con el token de una demo: listar tenants, leer otro tenant y sus
usuarios devuelven 403, y el endpoint de `system.debug` está restringido. La vía
de escalada por crear un rol llamado `ADMIN` no funciona: la RPC exige
`users.manage` mediante filas reales de permiso.

Queda una fragilidad conocida, sin explotación hoy: `checkUserPermission` concede
todo a cualquier rol llamado exactamente `ADMIN`, de modo que **revocar un permiso
a ese rol no surte efecto**. No cambia nada ahora mismo porque ADMIN tiene 256 de
256 permisos en los 55 tenants reales; sólo difieren siete demos, cuyos usuarios
usan `ADMIN_DEMO`.

## Pendientes reales

### Antes de completar el go-live

- Reconciliar el historial consolidado de `003..382` y la deriva previa de 13
  funciones y dos políticas antes de usar un `db push --include-all` sobre todo
  el directorio. La contabilidad `383..394` ya está promovida.
- Confirmar que no existan colisiones históricas fiscales antes de resincronizar
  series.
- Completar secretos productivos y ejecutar smoke controlado.
- La promoción coordinada `491..496`, API/worker y Web ya terminó. Queda añadir
  un medio de pago y aprobar el cambio de la instancia Render `free→starter`
  (USD 7/mes) para evitar que los workers internos se duerman; Render no permite
  aplicarlo sin tarjeta. El Blueprint ya apunta a `main`, pero no debe
  sincronizarse con el plan pagado sin esa aprobación financiera.
- La migración `395` ya está aplicada. Falta que cada contribuyente cargue sus
  credenciales API SUNAT y active SIRE explícitamente antes de una aceptación
  controlada RVIE/RCE; no hay smoke real posible sin consentimiento y datos de
  su período.
- Confirmar que el PFX está autorizado para el RUC productivo o reemplazarlo.
- Configurar credenciales GRE REST si el contribuyente emitirá guías.
- Para un contribuyente argentino real, cargar su certificado X.509 autorizado,
  habilitar el punto de venta en ARCA y completar homologación antes de activar
  `arca_activo` o usar producción.
- Antes de liquidar nómina argentina real, confirmar por empleador el CCT,
  categoría, modalidad registral, obra social, ART y alícuota, sindicato,
  contribución patronal y parámetros de Ganancias/LSD/F.931. La demo usa datos
  sintéticos y no transmite declaraciones.
- Para una empresa colombiana real, configurar software, PIN, certificado,
  resolución/prefijo y set de pruebas DIAN, implementar/homologar el transporte
  SOAP WS-Security/XAdES y superar el set oficial antes de transmitir. En RRHH
  se deben confirmar EPS, fondo de pensiones, ARL y clase de riesgo, caja de
  compensación, exoneraciones, retenciones y operador PILA. PILA admite portal
  de operador o API privada HTTPS del operador; no se presupone una API pública
  universal. La demo no transmite nómina electrónica ni planillas PILA.
- Validar impresora física, `.exe` Tauri y carga final.

### Producto y riesgo residual

- `modo_venta_rapida` se retiró de la interfaz. El interruptor «Venta rápida»
  del POS no cambiaba nada: ni la pantalla, ni el servicio, ni el writer lo
  leían. Un control visible que no hace nada es peor que no tenerlo, y darle
  comportamiento real habría sido inventar producto —¿omite el cliente?, ¿el
  modal de cobro?— con consecuencias fiscales. El campo sigue declarado en el
  DTO, aceptado y descartado, porque los binarios de escritorio ya distribuidos
  lo envían y `forbidNonWhitelisted` convertiría esa venta en un 400.
- Las etiquetas de formulario están cerradas: los 957 controles de `apps/web`
  tienen etiqueta programática y `test:etiquetas` lo verifica en CI. El
  pendiente anterior era inmedible («ambiguas restantes»), así que se sustituyó
  por un criterio objetivo: `id` + `<label htmlFor>`, `aria-label`,
  `aria-labelledby` o una `<label>` que envuelva. Un `placeholder` no cuenta:
  desaparece justo cuando el usuario escribe. Partía de 342 controles sin
  nombre; el texto nunca se inventó, sale de la etiqueta, la cabecera o el
  campo que el propio control ya declaraba.
- Ejecutar PVS con datos reales de cada empleador, corregir su reporte y cargar
  en SOL el ZIP generado por PVS antes de considerar presentada una planilla;
  el ERP ya prepara/versiona las fuentes, pero no suplanta esa validación legal.
- GRE SOAP beta continúa rechazando con `2112`; la ruta prevista es GRE REST.
- **La paridad con Odoo 19 queda fuera de alcance** y sale de esta lista. No es
  un requisito: «Odoo» no aparece en ninguna otra parte de la documentación, y
  mantener funcionalidades de meses junto a «cargar el certificado PFX» hacía
  que la lista mintiera sobre qué bloquea de verdad. Ninguna de las piezas es un
  defecto: todas tienen hoy un camino manual que funciona —conciliación bancaria
  con importación CSV, plantillas y marcado de partidas; consolidación con
  grupos, mapeos, tasas y eliminaciones declaradas a mano—. Lo que falta es la
  capa automática encima: modelos de emparejamiento, importación masiva de
  mapeos, eliminaciones intercompañía automáticas, variantes avanzadas del motor
  de reportes y amortización no lineal con prorrata. Multilibros es la única
  ausencia estructural y es una decisión de diseño, no un olvido. Si alguna se
  quiere, entra como alta de producto con su propio alcance.

## Jerarquía de verdad

1. Código y migraciones actuales; estado remoto verificado hasta `498` en PROD.
2. Este archivo.
3. El documento de dominio correspondiente.
4. Evidencia técnica versionada en `artifacts/`.
5. Historial de Git.
