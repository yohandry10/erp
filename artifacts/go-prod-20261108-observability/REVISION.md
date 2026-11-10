# Publicación, CodeQL y captura de errores

**NO_GO**. El repositorio es público por autorización expresa del propietario
mientras GitHubSupport4972573 retira referencias antiguas. Las93 ramas limpias
se conservaron; PR153 se actualizó por fast-forward2961b2d5→b20ee727, sin merge.
La purga y la revocación siguen sin prueba. La alerta de secreto1 permanece
abierta sobre el historial antiguo; secret scanning y protección de nuevos
pushes están activos. No hubo cambio de plan ni gasto nuevo.

[CodeQL42511475473](https://github.com/yohandry10/erp/actions/runs/42511475473)
terminó correctamente enJS/TS, además del audit. Analizó el merge14c6f7d9, con
el mismo árbol6ba4416f queb20ee727. Ambos análisis reportan la misma alerta108,
descartada el31oct como falso positivo: los IDs de empresa/usuario proceden de
la sesión, pero el pendiente validado conserva datos de negocio, no credenciales.
Se revisó de nuevo su recorrido; no se añadió una exclusión ni se cambió su
estado. No son cero hallazgos y no resuelve los resultados de main por adelantado.
Este análisis es anterior a la integraciónSentry de este corte.

El [E2E aislado42511475452](https://github.com/yohandry10/erp/actions/runs/42511475452)
pasa. [CI42511475454](https://github.com/yohandry10/erp/actions/runs/42511475454)
tiene siete jobs aprobados y falla la integración por un caso de navegador
inestable:70 pasan y1 pasa al reintento. El caso analítico pierde el destino antes
del POST, con Guardar deshabilitado. Se conserva la falla y su evidencia; no se
amplió el timeout, no se retiró el caso ni se relajó el gate de inestabilidad.
El build/audit posteriores quedaron omitidos. Se investigará su causa aparte.

Sentry usa la cuenta y proyectoNext existentes, planDeveloper con5.000errores
incluidos y sin tarjeta. Se instalaron SDK11.11.0 opcionales mediante variables
de entorno: sin DSN real ni token de administración en Git. API capturaHTTP5xx
y errores de proceso no manejados; conserva la terminación fatal de un rechazo
no manejado, comprobada con un proceso hijo y transporte en memoria. Next
captura errores del navegador y del ErrorBoundary existente y conecta el hook
de servidorNode. No acredita aún la captura real de este último ni del cliente
nativo, los jobs que manejan sus excepciones o una alarma/notificación operativa.

La política desactiva todas las categorías de `dataCollection`, logs, métricas,
spans, replay y propagación. El evento sólo conserva tipo, posición acotada del
fallo y mensaje genérico; retira solicitud, usuario, extras, breadcrumbs y
contexto de código. Se comparan las políticasAPI/web y el sobre real del SDK.
El servicio inferíaIP/geografía aunque no se enviaran: se activó la prevención
deIP y reglasRemove/Anything sobre `user` y `user.geo.*`. La regla específica
retira los valores geográficos. No se atribuye ese efecto a los eventos previos.

Pruebas del delta:

- API completa6111 pruebas/412 suites con coberturaUTC,1108 archivos y
  manifiestos intactos. TiposAPI/web, buildAPI y buildweb de producción pasan.
  Web924 fuentes intactas y metadatos generados restaurados. LintAPI0errores/
  97avisos existentes. Contrato documental de seis archivos aprobado.
- Nueve comprobaciones web de igualdad y privacidad; las regresionesAPI
  verifican eliminación de campos, límites, DSN y distinciónHTTP4xx/5xx.
- HTTP local con filtro global compilado y SDK real:400 no se envía,500 produce
  un evento. Sentry confirma recepción200; su JSON visible comprueba después
  ausencia de solicitud, extras, breadcrumbs,IP y valores geográficos.
- El navegador carga el build real mediante un proxy local que bloquea rutas de
  negocio e incorpora sólo un botón privado de prueba. El SDKNext captura su
  error no manejado; el JSON recibido pasa las mismas comprobaciones. Este botón
  no forma parte del producto. Tres ensayos por superficie, seis eventos en total,
  conservan la diferencia antes/después de los ajustes de privacidad.
- Audit productivo0avisos. Árbol completo conserva1bajo/5moderados,0altos/críticos;
  las regresiones de dependencias del gate existente pasan.

Sin uploads de sourcemaps ni telemetría de build. El proveedor informa falta de
fuente para los probes, una limitación de diagnóstico conservada: no se afirma
que exista simbolicación completa. La captura está probada en infraestructura
local; producción conserva su versión y configuración anteriores. El próximo
análisis debe comprobar la cabeza que incluya estos SDK.

Las huellas y pruebas resumidas están en[validacion.json](validacion.json). Las
dos líneas finales vacías retiradas después de las pruebas producen JavaScript
idéntico; las huellas anterior/posterior se conservan en esa validación. Las
credenciales locales, logs, JSON completos y capturas permanecen en el expediente
privado. No se ejecutó SQL remoto, operaciones de clientes ni promoción.
