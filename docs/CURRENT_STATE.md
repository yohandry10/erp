# Estado actual del ERP

Actualizado: 2026-08-25.

Este archivo contiene únicamente el estado vigente. El historial de auditorías y
decisiones anteriores se consulta en Git. Si este resumen contradice código o
migraciones verificados, prevalece la implementación actual.

## Resumen ejecutivo

- **Un recorrido por pantalla, haciendo lo que hace un contador, encontró tres
  cosas que ninguna prueba veía** porque todas estaban del lado del uso, no del
  cálculo. Las tres van corregidas en `512`, `513` y `514`, y las tres nacieron
  del mismo descuido: dar por bueno un mecanismo sin comprobar que se pueda
  usar.

  La más grave: **ninguna de las 67 cuentas bancarias de producción podía
  registrar un movimiento**. La semilla las creaba sin cuenta contable asociada
  y `assert_postable_account_457` la exige, así que el flujo más cotidiano de
  tesorería fallaba con `BANK_LEDGER_ACCOUNT_NOT_POSTABLE_IN_TENANT`. Detrás
  había otra causa: la cuenta corriente operativa (`1041`) no estaba en el
  catálogo de cuentas autocreables. La `514` corrige el catálogo, la semilla y
  las filas escritas, y su verificador **registra un movimiento de verdad** en
  vez de conformarse con que la columna no sea nula.

  La segunda: **132 de los 134 proveedores no se podían editar**. La semilla
  escribía `condiciones_pago = 'CREDITO'`, que no es ninguno de los valores
  admitidos, y el formulario se negaba a guardar con un error en inglés sobre un
  enum. Alcanzaba a 66 contribuyentes, los que ve quien está probando el
  sistema. Lo corrige la `513`, derivando la condición de los días de crédito
  que la propia semilla ya traía.

  La tercera: **la suspensión de retenciones de cuarta no se podía anotar**. La
  `508` había puesto la columna y el disparador, pero la función de
  actualización de proveedores lleva lista explícita de columnas y el campo se
  ignoraba en silencio. Lo corrige la `512`.

  Y de la misma revisión salió lo que faltaba en las pantallas: el destino del
  crédito fiscal y la detracción ahora se informan al registrar la factura del
  proveedor —antes la prorrata usaba siempre `GRAVADAS` porque no había forma de
  decir otra cosa—, y la estimación de cobranza dudosa tiene botón en los
  periodos abiertos.

- **Las claves ajenas duplicadas rompían PostgREST, y arreglarlas rompió
  producción.** Había 45 pares de tablas con la misma clave ajena declarada dos
  veces. PostgREST no resuelve un embed cuando hay más de una relación entre dos
  tablas: respondía `PGRST201`, y por eso **no se podía crear una devolución**
  —`/ventas/rma/candidatos` no listaba pedidos—. La `515` retira 23, sólo las
  que se comportan igual; las de `tenant_id` se dejan intactas a propósito,
  porque ahí una dice `CASCADE` y otra `NO ACTION` y quitar una cambiaría qué
  ocurre al borrar un contribuyente.

  Al retirarlas se rompió el listado de recepciones en caliente. La causa vale
  más que el arreglo: **hay consultas que nombran la restricción** para
  desambiguar el embed (`ordenes_compra!recepciones_orden_id_fkey_runtime`), y
  siete nombraban justo la retirada. Ese nombre es una dependencia contra el
  esquema escondida dentro de una cadena de texto: no la ve el compilador. Se
  buscaron las consultas que fallaban *por* ambigüedad y no las que dependían
  *del nombre*. La `516` renombra la superviviente al nombre que el código pide
  y deja dos guardianes: el verificador `516` comprueba contra la base que
  existan los 35 nombres que el código nombra —con control positivo—, y
  `nombres-clave-ajena.spec.ts` regenera esa lista desde el código para que no se
  quede vieja.

- **El verificador `462` fallaba por sorteo.** Tomaba «el primer permiso por
  `id`», que es un uuid aleatorio, y si caía sobre uno restringido para tenants
  de demo se ponía rojo sin que nada estuviera roto: medido sobre los 70
  contribuyentes de producción, fallaba en 6. Ahora elige excluyendo los
  restringidos (0 de 70). No se pierde cobertura: el `493`, el `501` y el techo
  RBAC comprueban la restricción por código, no al azar.

- **Catorce funciones de escritura llevaban meses inalcanzables desde el API, y
  todos sus verificadores pasaban en verde.** El envoltorio público se declaró
  con los tipos y sin los nombres de parámetro. PostgREST sólo sabe llamar por
  nombre —es como lo hace supabase-js— así que respondía `PGRST202: Could not
  find the function ... in the schema cache`. Los verificadores no lo veían
  porque llaman desde SQL con argumentos posicionales, donde funciona
  perfectamente: **el contrato que se comprobaba no era el que usa el producto**.

  Estaba caído registrar o desactivar un tipo de cambio, crear un centro de
  costo, abrir un periodo, crear/editar/anular un documento manual, crear una
  serie, el resumen diario y la comunicación de baja de SUNAT con sus tres
  funciones de envío, consignaciones, consolidación, presupuestos y el borrado
  de una distribución analítica. Lo corrige la `517`, recreándolas con los
  nombres que el código ya enviaba.

  El verificador `517` no las llama: mira el catálogo, y exige que ninguna
  función pública `SECURITY DEFINER` se quede sin nombres. Con control positivo,
  porque una comprobación de este tipo pasa en verde con demasiada facilidad.

- **PROD está en `517`.** La `510` puso el mecanismo de tasas de detracción
  —catálogo de códigos SPOT con tasa y vigencia, `codigo_detraccion` en la cuenta
  por pagar, y un contraste que **compara sin imponer**, porque hay operaciones
  con reglas especiales y el contador tiene que poder apartarse a sabiendas, pero
  no sin enterarse— y la `511` **carga el catálogo**: 35 códigos leídos de los
  apéndices publicados en `orientacion.sunat.gob.pe`, con anexo, tasa e importe
  mínimo. El `044` queda fuera porque figura como no vigente y ponerle cualquier
  tasa sería inventarla. Ya no hay nada pendiente para el contador aquí; lo que
  sigue siendo suyo es revisar la carga cuando SUNAT publique una resolución
  nueva.

  Cargar el catálogo destapó dos defectos que con la tabla vacía no se veían: el
  contraste no miraba el **importe mínimo**, así que una compra de 590 soles
  —que no lleva detracción— habría salido señalada por no declarar una que no le
  toca; y los códigos no se normalizaban a tres dígitos, de modo que un `37`
  tecleado sin el cero no lo encontraba nadie. Los dos van corregidos en la
  `511`.

- **PROD estuvo en `509`.** Continuación de la auditoría contable, por puntos y con
  verificador comprobado en rojo en cada uno. La `507` añade la **prorrata del
  crédito fiscal** con los tres destinos del artículo 23 y coeficiente de doce
  meses; su defecto es `GRAVADAS`, o sea el comportamiento previo, y el
  verificador vigila que nadie lo cambie —hacerlo subiría el IGV a pagar de todo
  el que no usa prorrata sin que nadie toque una declaración—. La `508` calcula
  la **retención de cuarta categoría** sobre recibos por honorarios y la anota en
  `libro_retenciones`, que es de donde la planilla electrónica lee el T-Registro
  de cuarta y donde **nadie escribía nunca**: esa sección salía siempre vacía. La
  `509` añade la **estimación de cobranza dudosa** (Dr 68 / Cr 19) con el detalle
  documento a documento que exige el Libro de Inventarios y Balances, criterio de
  antigüedad como parámetro y sin duplicar en una segunda pasada.
  Fuera de migración se corrigió el **catálogo de cuentas autocreables**: a 36 de
  68 contribuyentes les faltaba la `4699` que exige el asiento de recepción de
  mercadería, y a 32 la `629`; lo que impide que vuelva a quedarse corto es una
  prueba que lee del propio generador los códigos que pide, y que encontró además
  la `421` y la `422`.

- **PROD estuvo en `506`.** Una auditoría contra el trabajo real de un contador
  peruano encontró que la regla de qué documentos forman cada registro fiscal
  estaba escrita **tres veces y ninguna completa**: el Registro de Ventas
  filtraba por tipo pero no restaba las notas de crédito, el de Compras restaba
  pero no filtraba, y la determinación mensual de IGV no hacía ninguna de las
  dos. Medido sobre producción: para el mes en curso el libro daba S/ 1 566,05 y
  la declaración S/ 1 570,55. La regla vive ahora una sola vez en
  `documento-fiscal.rules.ts`. Además el **flujo de efectivo no devolvía la
  depreciación** —el operativo salía subestimado en la depreciación del mes y no
  aparecía en ninguna otra sección— y ahora, además de devolverla, compara contra
  la variación real de caja y expone el descuadre en vez de callarlo. Y el
  **saldo a favor del IGV** ya no se reteclea: se arrastra del mes anterior. La
  `506` retira `detalle_retenciones_categoria`, una tabla del esqueleto 002 sin un
  solo uso en código ni en migraciones y sin filas en producción; su verificador
  comprueba también que las dos tablas de retenciones que **sí** están vivas
  siguen ahí, porque se parecen mucho en el nombre.

- **PROD estuvo en `505`.** Promovidas el 2026-08-24 las tres migraciones de
  sucursales (`503`, `504` y `505`) tras un ensayo con la forma real de los datos
  de producción; `outbox_runtime_health_492` devuelve `ready: true` con
  `schema_version 505` y los tres verificadores pasan **contra PROD** sin dejar
  residuo. Barrido posterior: outbox sin pendientes ni cola muerta, cero
  productos descuadrados y cero asientos descuadrados.

- **La `505` cierra las dos obligaciones peruanas que quedaban abiertas.** Con varias sucursales,
  mover mercaderia de un local a otro deja de ser un apunte interno: para SUNAT
  es un **traslado entre establecimientos** y exige guia de remision con motivo
  04. El motivo estaba mapeado en `gre.service.ts` desde antes y nadie lo
  disparaba, porque hasta la 503 no habia establecimientos entre los que
  trasladar. `transferir_inventario_tx` no puede emitir la guia --necesita
  transportista, fechas y pesos que no viajan en su payload-- asi que hace lo que
  si le toca: detecta que los dos almacenes son de sucursales distintas, deja
  constancia con los dos codigos y el motivo 04 en el resultado y en la metadata
  de ambos movimientos, y **bloquea** el traslado si el contribuyente marco GRE
  obligatorio y no se referencia guia. Se reutiliza ese interruptor en vez de
  inventar otro porque ya significa exactamente eso.
  La segunda es la **planilla**: `rrhh_peru_fichas_laborales.establecimiento_codigo`
  existia desde la 398 con `DEFAULT '0000'` y, sin sucursales, nadie lo cambiaba
  nunca — toda la planilla de todos los locales se declaraba en la casa matriz.
  Se arregla en la raiz y no en el generador del PLAME: el empleado pertenece a
  una sucursal y el codigo de la ficha **se deriva** de ella en cada escritura,
  igual que en la 504. Quien necesite cambiarlo cambia la sucursal del empleado,
  que es la afirmacion que de verdad se quiere hacer.
  **El ensayo contra la forma real de producción encontró un defecto que la cadena
  limpia no podía ver.** PROD tenía ya 58 filas `Sede Lima`, una por
  contribuyente, sembradas por el alta de demo; sobre una base vacía ese caso no
  existe. La primera versión de la 503 les creaba una casa matriz **al lado** y
  degradaba la sede real a anexo, con lo que cada contribuyente habría acabado con
  dos locales donde tenía uno y sus almacenes y cajas colgando del recién creado.
  Ahora se promueve la sede más antigua a `0000` y sólo se crea una nueva para
  quien no tenía ninguna; el verificador 503 lo comprueba explícitamente. Aplicado:
  58 promovidas más 10 creadas = 68 sucursales para 68 contribuyentes, ni una
  duplicada.
  El verificador 505 comprueba las cuatro: el traslado entre anexos se marca, el
  traslado dentro de un local **no** se marca --sin esa mitad, una funcion que
  marcara siempre pasaria--, GRE obligatorio lo bloquea sin guia, y la ficha sale
  con el codigo del anexo aunque se le escriba `0000` a mano. Comprobado en rojo
  en tres escenarios. Cadena limpia de 502 migraciones hasta la 505 con 15
  verificadores de regresion.
  Ademas hay **informe por establecimiento** (`GET /sucursales/resumen`): ventas
  de POS, tickets, comprobantes y cajas abiertas por local, agrupando por
  `sucursal_id` sin cruzar cajas con almacenes, y filtrado por el alcance del
  usuario como todo lo demas.

- **La `504` hace que la operación herede su establecimiento, y añade el alcance
  por usuario.** La 503
  dejó modelada la estructura --series, almacenes, cajas-- pero las tablas donde
  ocurre la operación seguían sin saber dónde pasaron las cosas, así que no había
  stock por local ni informe de ventas por sucursal: sólo un modelo sobre el que
  no se podía preguntar nada. La decisión de fondo es **derivar, no duplicar**: la
  venta de POS toma su sucursal de la caja de su sesión, la sesión de su caja, el
  movimiento de inventario de su almacén y el comprobante de su serie. Se guarda
  el valor --para no pagar dos saltos en cada informe-- y un trigger lo deriva en
  cada escritura y **rechaza** el que contradiga a su ancla, que es el mismo
  patrón con el que `trg_enforce_product_stock_is_derived_350` protege el stock:
  un valor derivado que se puede escribir a mano deja de ser derivado el día que
  alguien lo escribe. `producto_existencias` se queda sin columna a propósito --el
  stock ya está por almacén-- y el stock por local se consulta en la vista
  `stock_por_sucursal`, declarada `security_invoker` para que no cruce la frontera
  entre contribuyentes.
  **El alcance del usuario se aplica en un solo sitio.** Hay más de ochenta puntos
  de consulta sobre tablas con `sucursal_id`, y un filtro repetido ochenta veces
  es un filtro que alguien olvidará --sin que se note, porque la consulta sigue
  devolviendo datos, sólo que de más locales de los que tocan--. Se resuelve una
  vez por petición en `TenantContextInterceptor` y lo aplica el cliente que
  devuelve `SupabaseService.getClient()`, sobre `select`, `update` y `delete`;
  el alta no se filtra porque la sucursal de una fila nueva la decide la base. Un
  usuario sin asignaciones --hoy, todos-- no paga ningún filtro. Si la resolución
  del alcance falla, la petición continúa sin restringir y se registra el error:
  fallar cerrado dejaría el ERP entero sin datos por una tabla que la mayoría de
  contribuyentes no usa, y la frontera que importa --el contribuyente-- no se toca
  aquí. La lista de tablas que el API filtra vive en `sucursal-scope.ts` y **la
  mantiene honesta el verificador 504**, que la compara con las relaciones que de
  verdad llevan la columna y falla nombrando el fichero que hay que actualizar;
  comprobado en rojo creando una tabla con `sucursal_id` fuera de la lista.

- **La `503` convierte la sucursal en un establecimiento anexo del RUC.** `public.sucursales`
  existía desde el esqueleto 002 y nunca se alteró: cero endpoints, cero
  pantallas, cero políticas RLS que la nombraran, y las columnas `sucursal_id`
  de `ventas`, `cajas` y los precios/stock por sucursal sólo las rellenaba el
  importador masivo pegando un UUID en una columna de CSV. Era una etiqueta de
  migración de datos, no una entidad. El diseño lo fija SUNAT y no la
  imaginación: el establecimiento tiene un código de cuatro dígitos de la ficha
  RUC, `0000` es la casa matriz, y **las series de comprobante se asignan por
  establecimiento** —esa es la pieza que hace encajar el resto, porque el CPE ya
  emitía `cbc:AddressTypeCode` y lo tenía fijado a `'0000'` por no tener de
  dónde sacarlo—. **La contabilidad no se parte por sucursal a propósito**: los
  libros electrónicos son por RUC; el resultado por local sale de
  `centros_costo`, que ya llega a `detalle_asientos`, y quien necesite
  contabilidad realmente separada necesita otro RUC, que aquí es otro tenant con
  su grupo de consolidación. Dos decisiones que conviene no deshacer sin leer la
  cabecera de la migración: **sin asignación explícita un usuario ve todas las
  sucursales** —así aplicar la 503 no le quita el acceso a nadie— y **todo lo
  histórico se atribuye a la casa matriz**, que es el único establecimiento que
  existía. La frontera entre contribuyentes es una **clave foránea compuesta**
  `(tenant_id, sucursal_id)` y no un trigger de validación como los de 156 y 162:
  un trigger se desactiva con un ALTER TABLE, la compuesta la sostiene el motor.
  El relleno histórico no bastaba —los caminos de alta seguían insertando filas
  sin establecimiento, y el verificador lo cazó— así que un trigger declara la
  regla una vez: lo que no dice su establecimiento pertenece a la casa matriz.
  El **verificador 503** comprueba en rojo los cinco escenarios: sin el trigger
  de casa matriz, sin la clave foránea compuesta, con el alcance de usuario
  invertido, con `sucursal_id` apareciendo en la contabilidad y con un rol
  operativo recibiendo el alta de establecimientos. Cadena limpia de 500
  migraciones hasta la 503 en PostgreSQL 16, 13 verificadores de regresión y 67
  históricos en verde.

- **PROD está en `502`: un solo modelo de permisos.** El RBAC vivía por duplicado
  —`permisos`/`rol_permisos`, el canónico que consultan los guards y sobre el que
  están escritas todas las exclusiones, y `permissions`/`role_permissions`, un
  modelo legado que nadie leía— con **seis triggers** sincronizándolos en ambos
  sentidos. No era cosmético: auditar el desbordamiento de ADMIN_DEMO obligó a
  instrumentar las dos tablas porque ver una fila en la legada no distinguía el
  origen del reflejo. Un sistema de permisos con dos tablas espejo es uno en el que
  cualquier comprobación de seguridad puede estar mirando la mitad equivocada.
  Comprobado antes de retirarlo: conteos idénticos (16 896 y 59 809), espejo exacto
  fila a fila en las cuatro direcciones, cero `.from('permissions')` en todo el
  TypeScript, y las cuatro funciones que parecían escribirlo eran falsos positivos
  —`role_permissions_seeded` es un parámetro de salida—. Las tablas se retiraron con
  `DROP TABLE` **sin CASCADE** a propósito, para que una dependencia sin localizar
  rompiera en el clúster efímero en vez de caer en silencio. Aplicada el 2026-08-23
  con respaldo previo en `app.respaldo_502_permissions` y
  `app.respaldo_502_role_permissions` —copias íntegras que pueden retirarse cuando
  se den por innecesarias—. Después: modelo canónico intacto en 16 896 y 59 809,
  cero triggers de sincronización, `ready: true` con `schema_version 502`, y el alta
  de un tenant demo produce los mismos once roles con los mismos conteos que con el
  espejo puesto. **Lo que impide que vuelva** es el verificador 502, escrito como
  invariante y no como lista de dos nombres: falla si reaparece una tabla con
  `role_id`+`permission_id`, una tabla de permisos con `codigo`+`modulo`+`accion`, un
  trigger de sincronización sobre el modelo canónico o una función que nombre el par
  legado. Comprobado rojo en los cuatro escenarios. Fusionado en `27ab71d9` (PR #84)
  con CI 22/22 en verde.
- **PROD estuvo en `501`.** El 2026-08-22 se promovió, cerrando el desbordamiento que
  entregaba a `ADMIN_DEMO` el catálogo completo de permisos —incluidos
  `tenants.manage`, `system.debug` y las dos lecturas de auditoría— desde la rama
  sin filtrar de `app.sembrar_permisos_rrhh_financiero_495`, que corre en un trigger
  sobre `public.roles`. Se retiraron **264 filas** (66 roles × 4), quedaron cero,
  el espejo legado quedó también a cero, los 66 conservan `users.manage` y ADMIN
  sigue con mediana 256. `outbox_runtime_health_492` devuelve `ready: true` con
  `schema_version 501`. **Con ello el verificador 490 vuelve a pasar** tras estar
  enumerado como obsoleto: la compuerta corre 67 verificadores históricos y enumera
  6. Fusionado en `e10dfc4d` (PR #83) con CI 22/22 en verde.
- **PROD estuvo en `500`.** El 2026-08-21 se promovieron la `499` —fijar `pg_temp` en el
  `search_path` de diez writers `SECURITY DEFINER`— y la `500` —quitar el `DEFAULT 'PEN'`
  de las 34 columnas `moneda` del esquema y hacer que `pos_registrar_venta_tx` fije la
  moneda del contribuyente, porque no la declaraba y toda venta de POS tomaba
  soles—. Las dos pasaron el gate completo en un clúster efímero antes de
  aplicarse, con sus verificadores comprobados en rojo. `outbox_runtime_health_492`
  devolvía `ready: true` con `schema_version 500`.
- **El API desplegado.** Los PR #82 y #83 estan fusionados en `main` con CI en
  verde; no se ha podido confirmar el SHA que Render tiene arriba porque no
  reporta despliegues a GitHub y la URL publica del servicio no esta en el
  repositorio.

- **PROD estuvo en `498`.** El 2026-08-20 se promovieron `497` y `498`, ambas de
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
  **Apareció un undécimo el 2026-08-22**, y no por el guardián sino porque la suite
  se puso roja al cruzar la medianoche UTC: `getStats` del módulo GRE comparaba
  `created_at.slice(0, 10)` —día UTC— contra `fechaHoyDelTenant` —día del
  contribuyente—, así que «GRE emitidas hoy» caía a cero durante las últimas cinco
  horas de cada jornada peruana, y `calcularTendenciaSemanal` etiquetaba los cubos
  con el día UTC. Las dos pasan ya por `fechaHoyEnPais`. El test que lo cubría sólo
  fallaba según la hora a la que se ejecutara, así que se añadió uno que fija el
  reloj en las 00:30 UTC —19:30 de Lima— y se comprobó rojo sin el arreglo.
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
  Aquello era cierto en esa fecha: el desbordamiento lo introdujo la `495`, posterior,
  y lo cierra la `501`.
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
- `497..517`: aplicadas y registradas en PROD. Cubren el respaldo peruano del
  esquema (`500`), las sucursales como establecimiento anexo y su herencia en
  las operaciones (`503..505`), y la auditoría contable por puntos —prorrata del
  crédito fiscal (`507`), retención de cuarta categoría (`508`), estimación de
  cobranza dudosa (`509`) y tasas de detracción con su carga (`510`, `511`)—.
  Cada una con su verificador comprobado en rojo antes de aplicarse.
  `REQUIRED_DATABASE_SCHEMA_VERSION` vale `511` en `render.yaml` y en
  `.github/workflows/ci.yml`; los dos tienen que moverse a la vez.

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

- **Hay tablas que el rol del API no puede escribir directamente, y es
  deliberado.** `centros_costo`, `periodos_contables`, `tipos_cambio`,
  `financial_master_operations`, `outbox_events` y las de operaciones atómicas
  tienen el `INSERT/UPDATE/DELETE` revocado a `service_role` (migraciones `477`,
  `482` y siguientes): la única entrada es la función `SECURITY DEFINER`, que
  registra la operación, la hace idempotente y comprueba el autor. Un
  `permission denied` sobre una de ellas **no es un privilegio olvidado**: es el
  contrato funcionando. La respuesta correcta es llamar a la RPC, nunca ampliar
  el `GRANT`.
- **El autor de un maestro contable tiene que ser un usuario activo del propio
  contribuyente.** Lo exige `assert_financial_master_actor_477`, que rechaza
  nulos y centinelas. Un proceso desatendido no puede inventarse un autor: tiene
  que resolver una persona real —el contador, y si no lo hay el administrador— o
  no escribir.
- **Una función pública que el API llame tiene que declarar sus parámetros con
  nombre.** PostgREST no sabe llamar posicionalmente. Un verificador que la
  pruebe desde SQL no detecta el fallo, porque desde SQL sí funciona.
- **Nombrar una clave ajena en un `select` de PostgREST es una dependencia contra
  el esquema.** `tabla!nombre_de_la_restriccion(...)` deja de funcionar si esa
  restricción se renombra o se retira, y como vive dentro de una cadena de texto
  no la ve el compilador ni el tipado. Los 35 nombres en uso están vigilados por
  el verificador `516` y por `nombres-clave-ajena.spec.ts`; al añadir uno nuevo
  hay que sumarlo a la lista o la prueba falla.
- **Una cuenta bancaria sin `cuenta_contable_id` no puede registrar movimientos.**
  Lo exige `assert_postable_account_457`, y la cuenta tiene que ser una corriente
  operativa (`1041`, o `104` donde exista): la `1042` es la de detracciones y
  lleva su propio saldo. El alta por API ya lo pide obligatorio; lo que fallaba
  era la siembra.
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

> **Cuidado con los «hoy no dispara» de este documento.** Varias notas de abajo
> se apoyan en datos de los tenants de producción —que ningún usuario esté en
> dos tenants, que todos tengan `moneda_defecto`, que ADMIN tenga los 256
> permisos—. Salvo el superadministrador, esos tenants son **desechables**: son
> demos y pruebas, no clientes. Esa evidencia no dice que un fallo sea inocuo,
> dice que todavía no hay nadie a quien pueda dañar. Los fallos abiertos que
> encontró esta auditoría no están latentes: están **sin estrenar**.

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

- `documentos`: limpio. Sus quince rutas declaran permiso y toman el tenant del
  JWT.
- **Autorización de rutas, barrido de todo el API (cerrado).** De las **687 rutas**,
  **683 declaran guard**. Las cuatro restantes sólo exigen sesión y es correcto:
  dos leen el contexto de configuración del propio tenant y dos son el buscador de
  ayuda. `JwtAuthGuard` y `PermissionGuard` están registrados como `APP_GUARD`, así
  que ninguna ruta queda sin autenticar. Lo fija `rutas-con-guard.spec`, con esas
  cuatro enumeradas: una ruta nueva sin autorización rompe la prueba.

  Medir esto bien costó tres intentos: los decoradores de una ruta pueden estar una
  decena de líneas por debajo, y la primera ventana daba **90 rutas sin permiso**
  cuando eran **4**. Actuar sobre aquel número habría significado «arreglar»
  ochenta y seis rutas correctas.
- `audit`: la vista unificada junta la tabla de auditoría con cuatro fuentes más y
  cada una iba en su `try`; al fallar avisaba por consola y seguía, devolviendo una
  respuesta con la misma forma que una traza completa. Quien audita no podía
  distinguir «no hubo intentos de login» de «no se pudieron leer». Se sigue
  devolviendo lo que sí carga, pero el hueco viaja declarado en `fuentes_fallidas`.

- `notifications`: `getUserRoleIds` recibía el tenant y **no lo usaba**, así que
  los roles de un tenant decidían el acceso a las notificaciones de otro. Hoy no
  ocurre —ningún usuario pertenece a dos tenants en producción— pero es un camino
  soportado: el `TenantSwitcher` del frontend existe justo para eso. Corregido.
- `security`: sus doce consultas al registro de violaciones RLS no filtran por
  tenant, y **es correcto**: el controlador lleva `SuperAdminGuard` a nivel de
  clase y por ruta, más `security.audit.read`. Es un panel de plataforma.
- `sunat-retry`: limpio. Sólo reintenta documentos en `ERROR` —falla técnica— y
  nunca `RECHAZADO`, que es el rechazo fiscal; con tope de cinco intentos, ventana
  de antigüedad y veinte por ciclo. Los reintentos automáticos están desactivados
  salvo que se encienda `SUNAT_AUTO_RETRY_ENABLED`.
- `dashboard`, `reports`, `import-export`, `metrics`, `help`: limpios de las clases
  conocidas —sin `catch` permisivo, sin datos fabricados, sin fechas en UTC salvo
  el nombre de un fichero exportado que ya está justificado— y con el tenant
  tomado del JWT.

- **Respaldos a soles en caminos que escriben.** El mismo patrón de los tres
  respaldos peruanos aparecía con la moneda: `|| 'PEN'` al emitir un comprobante,
  al crear una cotización y al dar de alta una cuenta bancaria. Ninguno dispara hoy
  —los 62 tenants tienen `moneda_defecto`— pero un contribuyente argentino sin ese
  campo habría emitido en soles. Los tres se detienen ahora y piden configurarla.
  Los `|| 'PEN'` que quedan en tesorería son de agrupación en un resumen, no se
  escriben.
- **Una dirección inventada dentro del comprobante.** `direccion_receptor` caía a
  la cadena «DIRECCIÓN NO REGISTRADA», que viajaba a SUNAT como si fuese el
  domicilio del cliente. El campo es opcional en el propio contrato, así que ahora
  va vacío cuando no se conoce. Hay 177 clientes sin dirección, pero ningún
  comprobante emitido llegó a llevar el marcador.

  Al corregirlo fallaron dos pruebas de CPE cuyas fixtures no declaraban moneda:
  se apoyaban en el respaldo sin decirlo. Ahora la declaran.

- **Dinero redondeado con coma flotante en cuatro sitios.** `Math.round(v*100)/100`
  no redondea bien la mitad: el producto intermedio se queda por debajo y 3 % de
  5.50 da 0.16 en lugar de 0.17. Estaba en la validación de retenciones, en los
  saldos de bancos, en la conciliación y en el cálculo de renta anual e ITAN.
  Todos pasan a Decimal, que es lo que ya usan `TaxCalculatorService` y
  `RetencionesService`.

  El de retenciones merece el matiz: **no estaba provocando rechazos**, porque la
  comprobación tolera `> 0.01` y la diferencia es exactamente un céntimo. Pero eso
  significaba que la tolerancia absorbía nuestra propia aritmética en vez de las
  diferencias de redondeo de quien envía el dato. Con las dos partes en Decimal,
  la tolerancia vuelve a medir lo que dice medir.

### Los seis últimos (contabilidad, finanzas, ventas, inventario, fiscal, migration)

Son 49 000 líneas, el triple de los dieciocho anteriores. Se auditaron por clases
de defecto confirmadas en este código, leyendo cada coincidencia, más las
invariantes comprobadas contra los datos de producción, que valen más que leer:

- **Aislamiento entre tenants, comprobado en los datos.** Ningún `detalle_asientos`
  pertenece a un tenant distinto del de su cabecera, y ninguna cuenta por cobrar a
  uno distinto del de su cliente. Los asientos cuadran y el invariante de stock se
  cumple en todos los productos.
- **Aislamiento entre contribuyentes, barrido completo y cerrado.** De las **31**
  consultas sin `tenant_id` sobre tablas que lo tienen, **29 son legítimas** y **2**
  no lo eran. Las legítimas caen en tres grupos: derivadas (el id ya viene de un
  `select` acotado al tenant), anteriores al tenant (el login no lo tiene todavía,
  por eso `auth_login_attempts` se cuenta por correo y no por IP) y transversales a
  propósito (catálogos globales y el panel de seguridad, tras `SuperAdminGuard`).
  Las dos reales estaban en `calcularMontoRecepcionParcial`, que leía
  `orden_compra_detalles` y `recepcion_items` **sin usar el `tenantId` que el propio
  evento traía**: un `ordenId` equivocado tomaba los precios de otra empresa en
  silencio. Corregidas. Lo fija `filtro-tenant.guard.spec`, verificado en rojo.

  Esto importa más de lo que parece: el API habla con Postgres como `service_role`,
  que **se salta RLS**. Las políticas de la base no protegen nada del lado de la
  aplicación; el filtro de la consulta es la única frontera.

  Medirlo bien costó tres intentos y conviene no repetirlos. La lista de tablas
  tiene que salir del **esquema real**, no de las migraciones:
  `002__domain_tables_skeleton.sql` le pone `tenant_id` a sus 168 tablas y las
  migraciones de normalización luego se lo quitan a los catálogos, de modo que medir
  sobre migraciones daba 242 tablas y **cero hallazgos**. Y la ventana tiene que ser
  ancha por los dos lados: en un `insert` el `tenant_id` va en el objeto, **arriba**
  del `.from`; en un `select` anidado el filtro queda veinte líneas **abajo**.
  El fichero `tablas-con-tenant-id.json` guarda las 267 tablas y lleva la consulta
  para regenerarlo.
- Sin `catch` permisivos y sin datos fabricados en los seis.

Lo que sí apareció está en los commits: los respaldos a soles en tres caminos que
escriben, la dirección inventada en el comprobante y el dinero redondeado con coma
flotante en cuatro sitios.

### Tercera vuelta: el país por descarte (cerrado, no repetir)

El barrido de respaldos peruanos que empezó en `tax-calculator` y siguió en
`fiscal-adapter` tenía más alcance del que parecía. La pregunta «¿de qué país es
este contribuyente?» tenía **cuatro respuestas independientes** —`fiscal-adapter`,
`cpe-helper`, `pdf-generator` y `proveedores`— y las cuatro contestaban Perú
cuando no lo sabían: sin fila en `empresa_config`, con `pais_id` vacío, o ante un
error de lectura. `fiscal-adapter` además **cacheaba** esa respuesta, así que un
fallo momentáneo de lectura dejaba al contribuyente convertido en peruano durante
toda la vida del proceso.

El país decide el documento de identidad (RUC, CUIT o NIT), la autoridad (SUNAT,
ARCA o DIAN), el impuesto (IGV 18 %, IVA 21 %, IVA 19 %), la moneda y el formato
del comprobante. Equivocarse produce un documento con **buen aspecto** y reglas de
otro país, que es la peor forma de fallar en algo que va firmado a una
administración tributaria.

Ahora hay una sola respuesta, `perfilPaisDelTenant`, que falla cerrada y sale de
`ACTIVE_COUNTRY_PROFILES`, que ya era la fuente canónica. Lo fija
`pais-del-tenant.spec`. Junto a eso:

- **Tres compuertas de país fallaban abiertas** por `|| 'PE'`: tributos anuales,
  tributos mensuales y la exportación PLE dejaban pasar a una empresa sin país
  configurado. El repositorio ya tenía el patrón correcto (`|| ''`) en
  `planilla-electronica-peru`, `sire-api-client`, `arca-fiscal` y `dian-fiscal`.
- **La compuerta de la GRE no llegaba a cerrarse nunca.** Era `config.pais &&
  config.pais !== 'PE'`, pero `obtenerConfiguracionGRE` sellaba `'PE'` cuando no
  había país, así que la condición nunca era cierta.
- **Las tablas de autoridad fiscal estaban repetidas cuatro veces y derivaron.**
  Tres se habían quedado **sin Argentina** mientras listaban Chile, México y
  Ecuador, que no son países soportados: un comprobante argentino imprimía
  «Autoridad Fiscal» en lugar de ARCA.
- `validateTaxIdFormat` daba por bueno **cualquier documento no vacío** para un
  país desconocido, y tenía ramas para Chile y México inalcanzables.
- `cpe-registration` comprobaba el CUIT de un argentino con el algoritmo del RUC
  peruano si `empresa_config` no declaraba país.

Tres pruebas fallaron al cerrar esto porque **se apoyaban en el valor por defecto**
en vez de declarar el país. Es el mismo síntoma que ya apareció con la moneda: una
fixture que no declara algo y aprueba está midiendo el respaldo, no el código.

### ARCA: la fecha del comprobante (cerrado)

`cpe.fecha_emision` es `timestamptz` y `CbteFch` se armaba con los *getters* UTC.
En Argentina (UTC−3) una factura emitida entre las 00:00 y las 03:00 salía fechada
**al día siguiente**, y ARCA compara `CbteFch` contra su propia fecha. El QR
llevaba el mismo desfase, así que ni siquiera se contradecían entre sí.

La duda que quedaba anotada —si `fechaEmision` es el instante o el día fiscal— la
contesta la especificación, no el producto: `CbteFch` es una **fecha de
calendario**. Se usa `fechaHoyEnPais`, que ya existía y cubre Argentina, y se
retira la excepción del guardián de fechas UTC, que ahora tiene nueve.

### Los writers atómicos, el worker y las librerías (cerrado, no repetir)

La capa que la auditoría del API nunca había leído: **286 funciones `_tx`, 284 con**
**`SECURITY DEFINER`**, es decir que corren con privilegios del propietario y se
saltan RLS. Importa porque el API habla como `service_role`: las políticas de la
base no protegen nada, y estas funciones son la última frontera.

Lo que está bien, medido para no volver a medirlo:

- **289 sentencias de escritura** sobre tablas con `tenant_id`: 231 lo filtran en la
  propia sentencia, 46 lo derivan de una lectura previa ya acotada, **ninguna sin**
  **comprobar**. Exentas sólo login/sesión (anteriores al tenant) y la fontanería del
  outbox (autorizada por *claim token*).
- **375 lecturas**: 353 filtran por tenant directamente, el resto derivan de una fila
  ya acotada.
- **216 INSERT** escriben `tenant_id` y **ninguno** lo toma de un payload JSON.
- **Cero** funciones sin `SET search_path` y **cero** `EXECUTE`: los dos vectores
  clásicos de `SECURITY DEFINER` no existen aquí.
- **154 writers reciben un actor**; 104 lo validan contra el tenant con
  `assert_*_actor_*` o `actor_comercial_valido_469`. Los 43 restantes sólo lo estampan
  en columnas de auditoría, y el actor siempre sale del JWT en la capa API: es
  profundidad de defensa, no un agujero vivo.
- **`libs/dtos`**: 224 clases llegan por `@Body()` y **ninguna** propiedad sin
  validador.
- **`libs/crypto`**: los caminos de firma fallan cerrados. Una cuenta real usa
  exclusivamente el certificado y la clave de su tenant; nunca hereda
  `PFX_PATH`/`PFX_PASS` del proceso ni sustituye material corrupto.
  `CertificateOwnershipError` no se traga. Sólo una demo PE con
  `sunat_environment=homologacion` y sin configuración parcial carga de forma
  explícita el PFX sintético del runtime, validado y con
  `allowDemoFallback=false`, únicamente para generar y firmar: envío, consulta,
  ticket, aceptación y CDR permanecen bloqueados y no se inventan.
- **Worker**: acuña un JWT de cinco minutos por tenant con su propio secreto; las
  rutas worker son `@Public()` y las cubre `WorkerAuthGuard`, que compara el tenant
  del token contra el solicitado. La ruta de emisión exige además un `actor_id` UUID.

Lo que no estaba bien:

- **Migración 499**: diez writers de contabilidad e inventario fijaban `search_path`
  sin nombrar `pg_temp`, y Postgres entonces busca el esquema temporal **el primero**
  para resolver nombres de tabla. Aplicada y verificada en producción. El verificador
  exige la propiedad a **todas** las `_tx`, no sólo a esas diez.
- **Consolidación**: `obtenerGrupo` se conformaba con cualquier fila de membresía, así
  que una empresa que había **rechazado** la invitación seguía viendo el RUC y la
  razón social del resto del grupo indefinidamente.
- **Mi propio guardián de rutas contaba `@Public()` como autorización**, que es lo
  contrario de lo que significa. Tapaba **ocho** rutas públicas: el webhook de Stripe,
  dos de métricas y cinco de observabilidad. Las ocho resultaron bien protegidas —por
  firma del cuerpo crudo o por `METRICS_TOKEN` comprobado en el método, que falla
  cerrado en producción— pero eso hay que verlo, no suponerlo. Ahora están enumeradas.
- **`jwt.verify` sin algoritmos fijados** en `WorkerAuthGuard`. jsonwebtoken 9 ya
  restringe a HMAC con secreto de cadena, así que hoy no cambia nada; deja de ser
  cierto en cuanto el secreto pase a ser una clave.
- **La caché de react-query sobrevivía al cambio de empresa.** Sólo una de las ocho
  claves lleva el tenant, así que un superadministrador que cambiaba de empresa seguía
  viendo RRHH, usuarios y la configuración de impuestos de la anterior. El API no
  entrega nada de más; el problema es decidir sobre las cifras equivocadas.

Cómo medirlo, que costó tres intentos: las definiciones hay que sacarlas del esquema
vivo y de **los dos** esquemas, `public` y `app` —80 funciones de `public` son
envoltorios de una línea que delegan en `app`, y medir sólo `public` produjo catorce
hallazgos falsos—. Y en este entorno **las barras invertidas de una cadena se**
**colapsan**, así que `new RegExp('\b'+x)` acaba buscando un carácter de retroceso en
vez de un límite de palabra: hay que construirlas con `String.fromCharCode(92)` o usar
literales. Cada detector lleva un control con una función verificada a mano; si no la
clasifica bien, aborta en vez de devolver hallazgos.

### apps/web (cerrado por clases de defecto)

Son **115 019 líneas** en 487 ficheros, no las 25 651 de una medición anterior mal
filtrada. No están leídas línea a línea; están barridas por las clases de defecto que
este código ha demostrado tener, leyendo cada coincidencia.

Lo que salió mal:

- **Crear una GRE desde un pedido devolvía 400.** `GreModal` mandaba `tenantId` en el
  cuerpo y `CreateGuiaRemisionDto` no lo declara: con `forbidNonWhitelisted` el pipe
  rechazaba la petición entera. En pantalla salía «property tenantId should not
  exist»: correcto, pero en inglés y sin pista de que el arreglo estaba en el
  cliente.

  **La raíz no era ese campo, era que nada comprobaba el contrato.** `test:contrato`
  resuelve cada llamada de escritura de la web contra la ruta del API, saca el DTO de
  su `@Body()` siguiendo `extends`, y comprueba que ninguna clave enviada falte en
  él. Compara 17 llamadas e imprime cuántas quedan fuera —3 con payload no resoluble,
  7 sin ruta emparejable, 6 sin DTO— para que nadie confunda «verde» con «revisado».

  Construirlo destapó **dos DTOs señuelo**: `libs/dtos/src/gre/guia-remision.dto.ts`,
  obsoleto y sin importadores mientras el controlador usa `gre.types.ts`; y
  `ProductModal.tsx`, sin importadores, que mandaba doce campos en camelCase a un DTO
  snake_case. Los dos borrados: el próximo que fuera a tocar el contrato editaba el
  fichero equivocado.
- **El céntimo.** `Math.round(importe * factor * 100) / 100` no es redondeo a
  céntimos: 1,25 al 18 % debe dar 0,23 y daba 0,22. Son 2 524 importes equivocados
  sobre 1,2 millones con las tres tasas. El servidor calcula con Decimal y es quien
  fija los importes, así que nunca se emitió un comprobante mal; lo que se hacía era
  enseñar un total distinto del que se iba a emitir. `multiplicarMoneda` no sale de
  los enteros. Lo fija `test:dinero`, que ejecuta la aritmética real contra una
  referencia entera exacta.
- **El POS presentaba como peruano a un contribuyente sin resolver**: SUNAT, RUC, S/
  e IGV (18 %) por defecto, y encima incoherente consigo mismo, porque `impuestoRate`
  vale 0 hasta que resuelve y el ticket habría cobrado 0 bajo una etiqueta que decía
  18 %. Ya no se inventa nada y no se puede cobrar sin país resuelto.
- **`use-fiscal-config.ts` fabricaba la identidad fiscal peruana entera** en dos
  ramas, sin ningún consumidor. Borrado.
- **Tres acciones fallaban en silencio**: aprobar una planilla (`catch {}`), extender
  la demo, y el informe de diferencias de la conciliación bancaria, que vacío es
  indistinguible de «no hay diferencias».
- La caché de react-query sobrevivía al cambio de empresa (ya cerrado antes).

Barridos limpios, para no repetirlos: cero `eval` y cero `innerHTML`; los dos
`dangerouslySetInnerHTML` interpolan tipos unión, no datos de usuario; los
`NEXT_PUBLIC_*` son todos legítimos —la clave anónima de Supabase está pensada para
ser pública—; los `Math.random` son respaldos de clave de idempotencia; y los
«Sin nombre» de los listados son marcadores honestos, no datos inventados dentro de
un documento.

Lo que **no** está hecho: leer los módulos grandes de negocio uno a uno
—contabilidad (11 007 líneas), modales (9 050), ventas (8 678), finanzas (7 345)—
buscando fallos de lógica propios de cada flujo, que es lo que en el API destapó los
defectos más caros. Los barridos no sustituyen a eso.

### El respaldo peruano estaba también en el esquema (migración 500)

Toda la auditoría fue retirando el «Perú por defecto» del código: el adaptador
fiscal, el calculador de impuestos, la emisión de comprobantes, la GRE, el POS, los
hooks de la web. Faltaba una capa: **34 columnas `moneda` del esquema llevaban**
**`DEFAULT 'PEN'`**.

Y una la usaba. `pos_registrar_venta_tx` —el writer que registra cada venta del
POS— inserta en `ventas_pos` **sin declarar la moneda**, en sus dos sobrecargas. Es
decir que toda venta de POS se registraba en soles, fuese cual fuese el país del
contribuyente. Las 60 ventas de producción son de contribuyentes peruanos, así que
la moneda coincide por casualidad; la primera venta argentina o colombiana habría
quedado en soles.

La 500 arregla el writer —resuelve la moneda de `empresa_config` y falla cerrado si
no está—, quita el defecto de las 34 columnas y hace obligatoria la moneda donde el
importe es el dato. El orden importa: primero el writer, después el defecto; al
revés, entre una sentencia y la siguiente una venta se queda sin moneda.

El verificador recorre las **62** columnas `moneda` del esquema, no sólo las tocadas.

**Aplicada en producción**: `schema_version` 500, verificador en verde contra PROD
y `ready: true` tanto con 499 —el API que corre— como con 500.

### El respaldo peruano en la web (cerrado)

138 apariciones de «Perú por defecto» en `apps/web`, clasificadas una a una. Las que
eran defecto de verdad:

- **`lib/pdf-export.ts` fijaba `currency: 'PEN'`** en un `formatCurrency` que usan 43
  sitios del fichero: el PDF del balance de comprobación, del estado de resultados y
  del balance general de una empresa argentina salía en soles. Un PDF pesa más que
  una pantalla: se guarda, se manda y se firma.
- La liquidación de RRHH y `ventas/comercial` etiquetaban importes en soles.
- `CpeModal` mandaba `moneda: country.moneda || 'PEN'` en el estado inicial del
  comprobante, y con el país sin resolver `country.moneda` es cadena vacía.

Los ~130 restantes **no se tocan, y conviene saber por qué**: son de presentación y
sólo disparan mientras el país carga, o son `'es-PE'` como *locale*, que en es-PE,
es-AR y es-CO da el mismo separador de miles y el mismo formato de fecha. Los dos
«currency: 'PEN'» que quedan son las pantallas de tributos peruanos, que el API ya
restringe a Perú.

Y trece multiplicaciones de dinero sin redondear a céntimos en formularios de
compras, ventas y POS. El servidor recalcula, así que no emitieron nada mal; lo que
hacían era enseñar un total distinto del que se iba a registrar. Ya no queda ninguna
en la web y `test:dinero` lo mantiene así.

### Contabilidad: el cuadre y el periodo (cerrado)

- **El cuadre era exacto abajo y tolerante arriba.** Los writers exigen
  `v_total_debe <> v_total_haber`; encima, dos comprobaciones usaban `> 0.01`, que deja
  pasar un descuadre de **exactamente un céntimo**: la verificación de asientos del
  listener y la compuerta del generador, justo antes de llamar al writer que lo
  rechaza. En los informes la tolerancia absorbía nuestra propia aritmética —sumar
  `number` deriva ~1e-13—, el mismo defecto ya corregido en retenciones. Todo pasa a
  Decimal y a comparación exacta. Y `cuentas_con_saldo` contaba con `> 0.01`, que deja
  fuera una cuenta con exactamente un céntimo.
- **El periodo se resolvía en la zona del servidor.** `validarPeriodoAbierto` usaba
  `getFullYear()/getMonth()` sobre un `timestamptz`, con el servidor en UTC. Un
  comprobante de las 19:30 de Lima cae en el día siguiente y, la noche del 31, en el
  mes siguiente: el asiento se valida contra el periodo equivocado. En producción 23
  de los 179 asientos ya tienen un día distinto en UTC que en Lima; ninguno cruza mes,
  y eso es suerte. Se respeta la distinción de `parseDateLocal`: una fecha a
  medianoche UTC exacta es una fecha de calendario y no se convierte.
- **Las bases por afectación del POS no sumaban la venta.** Cada tramo redondeaba por
  su cuenta: 33,33 + 33,33 + 33,34 con un 10 % de descuento daban 90,01 sobre una
  venta de 90,00. El residuo va ahora al tramo mayor.
- **`CpeViewModal` mostraba un importe recalculado** en la tabla mientras el HTML
  impreso usaba el del documento. El mismo modal enseñaba dos cifras del mismo
  comprobante emitido.

### Los módulos de negocio de la web, uno a uno (cerrado)

Lo que quedaba pendiente en la revisión anterior. Cerrado por flujos, no por
barridos:

- **Escrituras que fallaban en silencio: 14, diez reales.** Todas con la misma
  forma —el refresco de la pantalla vive dentro del `try`, así que al fallar nada
  cambia y el usuario da la acción por hecha—. Las que cuestan: **asignar y quitar
  roles** (una decisión de autorización), **renovar y finalizar un contrato**,
  **marcar asistencia** y **abrir caja**. Las cuatro restantes se revisaron y son
  correctas: los dos caminos de `use-permission` fallan **cerrados**.
- **RRHH**: las tasas AFP por administradora del formulario coinciden con las del
  servidor, y el importe sale de la tasa guardada en el contrato, no del
  formulario. No es un defecto.
- **Wizard**: limpio. Clave de idempotencia en cada escritura, manejo de
  `!response.ok` y detección de encolado offline.
- **Inventario**: `productos` tiene `stock` y `stock_actual`, y dos formularios leen
  columnas distintas. No divergen: los 374 productos coinciden y el único writer
  que las toca actualiza las dos. Redundante, no roto.
- **Finanzas**: los writers validan que la moneda del pago coincida con la del
  documento y con la de la cuenta bancaria, y fallan cerrados.
- **Pantallas de dinero**: ninguna permite doble envío; todas tienen estado en
  vuelo o botón deshabilitado.
- **Divisiones sin proteger el cero**: ninguna.

### Invariantes de producción tras la 500

Comprobadas después de aplicar la migración: `schema_version` 500, outbox sin
pendientes y sin cola muerta, cero asientos descuadrados, cero `detalle_asientos`
cruzados de contribuyente, cero cuentas por cobrar cruzadas, cero filas de dinero
sin moneda.

### Los verificadores SQL (auditados)

La capa de la que depende creer todo lo demás. Hallazgo principal: **de los 86
verificadores del repositorio, sólo corrían 10.**

La causa es que `SQL_VERIFY_FLOOR = 491` hacía dos trabajos y sólo uno era suyo:

- **Legítimo**: exigir que toda migración nueva traiga verificador. Empieza en 491
  porque ahí arrancó la práctica —417 de las 497 migraciones no tienen uno—, así que
  el suelo **no se puede bajar**.
- **No legítimo**: como la selección parte de las *migraciones*, ningún verificador
  por debajo del suelo llegaba a ejecutarse. 76 quedaban muertos.

Se ejecutaron los 76 contra una base recién migrada: **66 pasaban**. Es decir, 66
protecciones escritas, mantenidas y silenciosamente inactivas. Ahora corren en una
segunda pasada, y los 7 que no pasan están enumerados en el propio script con el
motivo —fixtures anteriores a una migración que endureció el flujo, privilegios de
una firma que cambió, un sembrado que ya no siembra—.

Tres hallazgos más, encontrados al hacerlo:

- **La base de CI no replicaba el historial de producción.** La compuerta sellaba
  `name` con el nombre completo del fichero; producción y el CLI de Supabase lo
  sellan sin el prefijo numérico. Cuatro verificadores que comprueban el nombre
  fallaban aquí y pasaban allí. Corregido: tres de los cuatro pasan ya.
- **`verify_outbox_integrity.sql` nunca se había ejecutado.** `discover()` sólo
  reconoce ficheros `NNN__nombre.sql`, y éste no lleva número porque no le
  corresponde ninguna migración. Comprueba seis invariantes de las que depende todo
  el sistema de eventos —columnas del outbox, índice único de idempotencia, claves
  duplicadas, RLS habilitado y forzado, política presente y las RPC runtime—. Pasa.
  Ahora está conectado.
- Los otros dos sin número, `verify_anon_access` y `verify_grants_matrix`, **no
  afirman nada**: cero `RAISE`, son inventarios de privilegios. Correcto que no estén
  en la compuerta; el problema es que tampoco los mira nadie.

**Sobre los permisos de `anon`, que casi reporto como agujero y no lo es.** El
verificador 437 —uno de los que no corrían— señala que las funciones
`validar_*_runtime` tienen `EXECUTE` para `anon`, y en producción 86 de 89 lo tienen.
La clave anónima va dentro del paquete de la web, así que la llamada se acepta. Pero
no es explotable: corren como INVOKER y `anon` choca con las vistas de dentro
—comprobado con una llamada anónima real contra PROD: `permission denied for view`
`v_rls_tenant_tables_audit`—, y **hay cero funciones `SECURITY DEFINER` en `public`**
**alcanzables por `anon`**. Es descuido de configuración, no una vulnerabilidad.

**Lo que destapó el verificador 490, que tampoco corría.** Exige que un
`ADMIN_DEMO` no tenga `tenants.manage`, `system.debug`, `security.audit.read` ni
`documentos.audit.read`. En producción, **los 66 roles ADMIN_DEMO tienen los 256**
**permisos del catálogo**, los cinco sensibles incluidos.

Alcance real, medido y no supuesto:

- **La frontera entre contribuyentes aguanta.** Las 55 rutas que exigen un permiso
  sensible se revisaron una a una: las que piden `tenants.manage` llevan **todas**
  `SuperAdminGuard` encima. Ya se había comprobado antes con un token de demo real
  contra PROD: listar tenants y leer otro devuelven 403.
- 36 de esas 55 no llevan SuperAdminGuard, y ahí el permiso es la puerta. Lo que un
  demo alcanza por esa vía son diagnósticos y lecturas de auditoría **de su propio**
  **tenant**: probar la conexión, probar la firma XML sin enviar a SUNAT, y leer su
  traza. Nada de otro contribuyente.
- `users.manage` es **deliberado**: la migración 493 es posterior al verificador y lo
  concede a propósito —«los ADMIN/ADMIN_DEMO canónicos conservan la capacidad de
  administrar su tenant»—. El 490 lo exige también, así que en ese punto las dos
  fuentes coinciden y no había nada que decidir.

**Cerrado por la migración 501, y la raíz no estaba donde parecía.** No era dato
heredado: un tenant demo creado en base limpia sale igual, así que era un defecto
vivo. `ensure_demo_admin_rbac_for_tenant` excluye esos permisos correctamente y aun
así el rol acababa con los 256. El granter es otro —`app.sembrar_permisos_rrhh_`
`financiero_495`—, cuyo tercer INSERT reparte paquetes por nombre de rol en tres
ramas: las de CONTADOR y FINANZAS filtran por código, la de administración no, de
modo que el JOIN con `permisos` entregaba el catálogo entero del tenant. Y corre
desde un trigger sobre `public.roles`, es decir en el instante en que
`ensure_demo_admin_rbac_for_tenant` inserta el rol ADMIN_DEMO, pisando sus
exclusiones tres líneas antes de que se ejecuten. Por eso volver a llamarla no
arreglaba nada, y por eso su DELETE defensivo apunta a ADMIN: es el parche que
alguien puso para el mismo desbordamiento sin advertir que ADMIN_DEMO compartía rama.

Se localizó grabando la pila de llamadas con `GET DIAGNOSTICS PG_CONTEXT` en un
trigger temporal sobre `rol_permisos` durante un alta de demo, después de descartar
uno a uno los candidatos leyendo código. La 501 acota esa rama a los once permisos
que la propia función siembra y retira lo ya concedido. Medido sobre base limpia
creando un tenant demo con cada versión: ADMIN 251 → **251**, ADMIN_DEMO 256 → **252**
—pierde exactamente los cuatro—, los otros nueve roles idénticos y `users.manage`
intacto. El verificador 501 cubre las dos mitades, el dato sembrado y el camino de
alta, y además el espejo legado `role_permissions`. **El 490 ya pasa** y salió de la
lista de obsoletos: la compuerta corre 67 verificadores históricos y enumera 6.

**Sobre `verify_anon_access` y el 437**, ya cerrado más arriba: descuido de
configuración, no vulnerabilidad.

Coste: la compuerta pasa de ~10 verificadores a ~65 y tarda unos diez minutos.

### Las pruebas e2e (auditadas)

Mismo patrón que los verificadores SQL: **de las 29 e2e, CI ejecuta 7.** Las otras
22 —unas 10 000 líneas— no corren.

Aquí la causa **sí es legítima**: necesitan el API levantado con base y
credenciales reales, y el job de Playwright sólo levanta la web contra
`127.0.0.1:3001`. No es un olvido, es que no caben en ese entorno. Pero el efecto
es el mismo: lo que afirman no lo comprueba nadie, y ya derivó.

`superadmin-tenant-rbac-rls.spec.ts` fija los permisos por rol: ADMIN 195,
CONTADOR 64, VENDEDOR 51. En producción son **251–256, 99 y 56**.

Fijar un número es un contrato malo: crece solo cada vez que se añade un permiso
ordinario, y entonces la prueba estorba y se acaba apagando. Lo estable es el
**techo**, y ése se comprobó contra producción y **aguanta**: de los cinco permisos
sensibles, los tres que dan poder —`tenants.manage`, `users.manage`, `system.debug`—
no los alcanza ningún rol operativo. Los otros dos son lecturas de auditoría y las
llevan AUDITOR, CONTADOR, FINANZAS y GERENCIA, que es para lo que existen.

Ese invariante se saca de la e2e muerta y pasa a `verify_rbac_ceiling.sql`, que sí
corre en cada compuerta: crea un contribuyente, comprueba que se sembraron roles
—control de que está midiendo algo— y exige que ninguno operativo alcance los tres.
Deliberadamente **no dice nada sobre ADMIN_DEMO**, porque ahí hay una decisión de
producto pendiente y no le toca resolverla a una comprobación.

**Lo que sigue sin cubrirse**: las 22 e2e como tales. Cubrirlas exigiría levantar el
API con una base sembrada en CI, que es una decisión de infraestructura, no un
arreglo. Queda dicho para que nadie las cuente como red de seguridad.

### Sobre los guardianes de esta auditoría

Tres de los detectores que escribí daban verde con el fallo delante, y los tres los
cazó un control, no yo:

- El de rutas contaba `@Public()` como autorización, que es lo contrario de lo que
  significa.
- El de writers medía sólo el esquema `public`, y 80 de esas funciones son
  envoltorios de una línea que delegan en `app`.
- El de payloads miraba 15 líneas hacia delante y la llamada estaba 17 más abajo; su
  control era **más fácil que el caso real**, que es la forma exacta de no probar
  nada.

De ahí dos reglas para quien siga: **un guardián que no se ha visto en rojo no está
verificado**, y **el control tiene que reproducir la forma y la distancia del caso
real**. Además, en este entorno las barras invertidas dentro de una cadena se
colapsan al escribir un fichero, así que `new RegExp('\\b' + x)` acaba buscando un
carácter de retroceso; hay que componerlas con `String.fromCharCode(92)` o usar
literales de expresión regular.
### Ninguno pendiente

La auditoría cubre los 36 módulos del API. Lo que queda son ampliaciones de
producto y los pendientes operativos que dependen de credenciales o de terceros,
ambos listados más abajo.
### Resultado de la frontera de seguridad (cerrado, no repetir)

`permissions`, `auth` y `tenants` están leídos y **no tienen agujero explotable**.
El guard falla cerrado, valida el tenant dos veces —en el rol y en el permiso— y
rechaza usuarios inactivos; la caché de permisos está desactivada
(`CACHE_TTL = 0`), así que no puede servir permisos revocados. Se comprobó contra
producción con el token de una demo: listar tenants, leer otro tenant y sus
usuarios devuelven 403, y el endpoint de `system.debug` está restringido. La vía
de escalada por crear un rol llamado `ADMIN` no funciona: la RPC exige
`users.manage` mediante filas reales de permiso.

**Cerrado:** `checkUserPermission` y `PermissionGuard` concedían todo a cualquier
rol llamado exactamente `ADMIN`, con lo que revocar un permiso a ese rol no
surtía efecto y bastaba con renombrar un rol para saltarse la lista. Ambos atajos
fueron retirados y sólo `SUPER_ADMIN` conserva bypass. No concedían nada que las
filas de `rol_permisos` no concedan ya: los 42 usuarios con rol ADMIN están en
tenants donde tiene los 256 permisos, así que ninguno perdió acceso.

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
