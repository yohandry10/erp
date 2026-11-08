# Reversas enlazadas · corte local 616

Estado: **NO_GO**. No hay merge, SQL remoto, despliegue ni gasto nuevo.
La rama parte del historial limpio2961b2d5; el PR153 publicado conserva612.

613 conserva el traslado original y confirma dos movimientos exactamente opuestos.
614 serializa la factura de proveedor con el estado final de la recepción.
615 anula recepción, cumplimientoOC e inventario en un solo commit y deja el
evento inverso para el worker contable.616 recupera el recibo propio o cierra
la clave original para impedir una petición tardía.

La interfaz de recepción guarda primero la intención por empresa/usuario/origen,
exige motivo, fecha y confirmación expresa, y archiva/relee el resultado antes
de retirar el pendiente. Consultar no repite la escritura. La cola genérica de
web y escritorio rechaza estas acciones y conserva las antiguas para revisión.

Validación de este corte:

- API completa:6066 pruebas/408 suites con cobertura, arrancando enUTC. La primera
  corrida con zona ambiente falló dos expectativas del arnés de caja; el control
  aislado y la suite completa enUTC pasan sin cambiar ese test ni el producto.
- Cadena nueva PostgreSQL16:612 migraciones hasta616,125 verificadores y67
  históricos. No equivale a promover una base operativa.
- Diecinueve carrerasSQL:7transferencia,9recepción/contabilidad y3recuperación.
- HTTP real con login,JWT,sesión,permisos yPostgREST: creación/reversa/recuperación
  de transferencia, cierre de clave y rechazo del writer tardío; una respuesta
  de recepción perdida después del commit se recupera sin reenviarlo.
- WorkersNode originales e inversos reales: bienes y serviciosPEN con un asiento
  y su inverso enlazado, neto0; costo0 completa ambos eventos sin asiento ficticio.
- Navegador: tres recepciones propias, rechazo por período cerrado, recarga,
  resolución y nueva intención; stock y cumplimiento0, originales intactos,
  un contraevento y un contraasiento por recepción. Tema claro/oscuro y viewport
  móvil390px con375px de contenido comprobados; emulación retirada al terminar.
- Contrato web98 comprobaciones;48 pruebasRust; tipos y buildsAPI/web pasan.
  LintAPI:0errores/97avisos existentes. La interfaz nueva no añade avisos.
- Las21 tablas verificadas del stack conservado siguen idénticas, sin613–616.

La evidencia resumida y las huellas de la copia probada están en
[validacion616.json](validacion616.json). Son bytes del worktree; Git puede
normalizar finales de línea. El controlador se normalizó aLF tras la suite;
se comprobó la igualdad de contenido y se repitieron sus37 casosHTTP.

Pendiente: interfaz de transferencia e intención durable, matrizFX, expiración
natural con formulario pendiente, ensayo de restore/rollback, revisión completa
SAST/CodeQL y demás gatesA–J/operativos. Las pruebas usan datos locales propios;
no acreditan aceptación fiscal ni producción.

La limpieza de93ramas ya se aplicó y verificó. GitHubSupport4972573 sigue abierto
sin respuesta ni purga probada; repositorio privado yCodeQL pendiente.
