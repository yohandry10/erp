# Estado actual del ERP

Actualizado: 2026-08-08.

Este archivo contiene únicamente el estado vigente. El historial de auditorías y
decisiones anteriores se consulta en Git. Si este resumen contradice código o
migraciones verificados, prevalece la implementación actual.

## Resumen ejecutivo

- El código core está en estado **release candidate**.
- El alcance operativo activo es Perú (`PE`, `pais_id=1`, `PEN`, SUNAT),
  Argentina (`AR`, `pais_id=5`, `ARS`, ARCA) y Colombia (`CO`, `pais_id=2`,
  `COP`, DIAN).
- PROD `wypnbcptofqdmoynlonq` es el único proyecto remoto operativo. El antiguo
  DEV está retirado y bloqueado por runtime, scripts y CI.
- El cierre más reciente del backend reporta 170/170 suites y 1591/1591 pruebas.
- El cierre Web del 2026-08-07 reporta type-check limpio y build Next 124/124
  rutas; 73 rutas se verificaron en escritorio y móvil (146 casos) y el
  recorrido visible de demos nuevas PE/AR/CO no presentó errores de consola.
  La inspección autenticada posterior en PROD confirmó los flujos Perú de
  contabilidad, PLE 3.17, impuestos, SIRE, RRHH/PLAME, POS, compras, inventario
  y finanzas; el menú financiero expone CxC, CxP, bancos, tesorería,
  conciliación y reportes según permiso, sin trazas de objetos operativos en la
  consola del navegador.
- Los cálculos de nómina PE/AR/CO conservan cobertura automatizada sin depender
  de una base remota. Las pruebas con escritura no se ejecutan en PROD.
- Factura `01`, boleta `03`, nota de crédito `07`, nota de débito `08`, RA y RC
  cuentan con evidencia aceptada en SUNAT beta.
- Inventario usa un único ledger físico por almacén.
- Desktop/Tauri está implementado como cliente offline-first con SQLite y outbox
  por tenant.

## Entornos

| Entorno | Proyecto Supabase      | Estado                                      |
| ------- | ---------------------- | ------------------------------------------- |
| PROD    | `wypnbcptofqdmoynlonq` | Único destino remoto; datos reales          |
| DEV     | retirado               | Bloqueado; no se usa para desarrollo ni QA  |

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
- `434..487`: creadas y verificadas únicamente en PostgreSQL 16 local efímero;
  no están aplicadas en PROD. El rango fuerza RLS/ACL y `SECURITY DEFINER`
  service-only, normaliza `pgcrypto`, locks y validadores runtime, y mueve los
  writers de ventas, compras, recepción, inventario, POS/caja, facturación,
  bancos, tesorería, RRHH, administración, configuración, importaciones y
  contabilidad a fronteras SQL atómicas con actor, huella e idempotencia.
  También incorpora CPE/GRE/SIRE durables, RMA y reembolsos/reversas, imágenes
  de producto, listas de precios/comisiones/consolidados, ticket POS canjeable,
  aging CxC y kardex multimoneda, así como cierres contables residuales.
- La cadena completa `434..487` suma 54 verificadores transaccionales verdes.
  Una reconstrucción limpia desde cero aplicó 481 migraciones hasta `487`; la
  API pasó 191 suites/1.659 pruebas y los typechecks API/Web. Las carreras reales
  de recepción, RMA, caja, RRHH, CPE y canje POS confirmaron un solo efecto por
  intención. Esta evidencia local no autoriza ni sustituye la promoción PROD.
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
- `425..487`: escrituras críticas de planilla, liquidación, asientos, factura
  proveedor y pago bancario en una sola transacción, con outbox e idempotencia;
  además de los cierres comerciales, fiscales, logísticos, financieros,
  administrativos y contables descritos arriba. Sólo `425..433` están
  promovidas; `434..487` conservan evidencia local y requieren despliegue
  coordinado.

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
- ADMIN de un tenant normal recibe permisos activos completos; un demo conserva
  restricciones sensibles.

## Pendientes reales

### Antes de PROD

- Promover y verificar las migraciones `434..487` como una cadena coordinada con
  el procedimiento PROD-only, respaldo y postchecks sólo lectura. No aplicar
  fragmentos aislados: el rango cambia firmas RPC, ACL, writers, outbox y UI en
  conjunto. Hasta entonces PROD continúa en `433` y no dispone de estos cierres.
- Reconciliar el historial consolidado de `003..382` y la deriva previa de 13
  funciones y dos políticas antes de usar un `db push --include-all` sobre todo
  el directorio. La contabilidad `383..394` ya está promovida.
- Confirmar que no existan colisiones históricas fiscales antes de resincronizar
  series.
- Completar secretos productivos y ejecutar smoke controlado.
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

- Decidir si `modo_venta_rapida` tendrá comportamiento real o se retirará.
- Convertir la anulación fiscal completa en una única transacción; actualmente
  encadena mutaciones con validaciones previas.
- Resolver etiquetas de formulario ambiguas restantes sin codemod automático.
- Ejecutar PVS con datos reales de cada empleador, corregir su reporte y cargar
  en SOL el ZIP generado por PVS antes de considerar presentada una planilla;
  el ERP ya prepara/versiona las fuentes, pero no suplanta esa validación legal.
- GRE SOAP beta continúa rechazando con `2112`; la ruta prevista es GRE REST.
- La paridad contable con Odoo 19 no es total: quedan fuera la sincronización
  bancaria automática y sus modelos de matching, importación masiva de mapeos
  de consolidación, multilibros, eliminaciones intercompañía automáticas,
  variantes/columnas/agrupaciones avanzadas del motor de reportes y métodos de
  activo no lineales con prorrata. Son ampliaciones de producto, no condiciones
  ocultas del alcance implementado.

## Jerarquía de verdad

1. Código y migraciones actuales; estado remoto verificado hasta `433` en PROD
   y `434..487` verificadas sólo en infraestructura local efímera.
2. Este archivo.
3. El documento de dominio correspondiente.
4. Evidencia técnica versionada en `artifacts/`.
5. Historial de Git.
