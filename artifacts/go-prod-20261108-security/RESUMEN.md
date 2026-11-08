# Correcciones locales D54/D55

**NO_GO de producción.** Continúa el PR153 en borrador, sobre candidato612;
sin merge, promoción, migraciones remotas ni gasto nuevo. El presupuesto es0.

D54 corrige la interpolación HTML de la confirmación de cambio de contraseña:
nombre, IP, nombre de app y soporte se escapan; los enlaces pasan por el
validador existente. Se conservan destinatario, asunto y texto plano. Cuatro
regresiones fallaron antes y pasan después. La composición MIME con el servicio
compilado y Nodemailer real pasa usando transporte en memoria: no se envía
correo ni se cambia contraseña.

D55 adopta versiones oficiales corregidas: Nodemailer10.1.4, fast-uri4.2.3 y
qs6.16.1. Las regresiones reproducen el comportamiento anterior y verifican las
copias instaladas desde el gate de audit existente. No se omiten avisos ni se
reducen umbrales. Fuentes: [destinatario Nodemailer](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8),
[esquema URI](https://github.com/advisories/GHSA-w74x-v6f9-j3xg),
[serialización qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).

Validación sobre fuentes sin cambios durante cada ejecución:

- API completa con cobertura:5848pruebas/402suites; tipos, compilación y lint pasan.
- Build web de producción pasa;913fuentes intactas y dos metadatos generados restaurados.
- Audit de producción:0avisos. Audit completo:1bajo/5moderados,0altos/críticos;
  siguen avisos de postcss-selector-parser, deepmerge, glob y minimatch en herramientas.
  No equivale a un árbol completo libre de avisos.
- SemgrepCE1.184.0 sin red, cuenta ni métricas:1549archivos/189reglas,
  211coincidencias,0errores; exit1 por hallazgos. Los tres errores de parseo JSX
  se resolvieron escapando ampersands, con JavaScript emitido idéntico y títulos
  verificados por navegador en la demo propia. Las coincidencias por regla/ruta
  permanecen iguales al padre3ad; la alerta heurística del correo corregido
  sigue visible. No se suprime ni se presenta como revisión integral aprobada.
- Navegador CUA: acceso con la demo conservada, candidatos, pagos y P&L cargan;
  tres títulos correctos. Sin mutaciones financieras ni nueva aceptación fiscal.
- Base local recuperada desde su volumen existente, con esquema612 y muestras
  conservadas; sin inicialización, restauración ni reaplicación de migraciones.

El escaneo D54 anterior quedó interrumpido por la detención de Docker y no se
cuenta aprobado. Esta nueva ejecución usa copia congelada, imagen fijada y
huellas de código/reglas. Los resultados sobre dependencias anteriores se
conservan separados y no se suman a la suite actual.

GitHub Actions no inició los jobs del padre3ad por facturación/minutos.
CodeQL sigue sin disponibilidad para el repositorio privado personal. No se
contratan planes, traslada el repositorio, cambia su privacidad ni deshabilitan
checks. Las verificaciones locales aportan evidencia, sin reemplazar esos gates.

Siguen abiertos la revisión completa de seguridad, aceptación A–J, reversas de
recepción/transferencia, recuperación de formulario tras expiración natural,
AFP2026-11 y gates operativos/fiscales/piloto. Las89ejecuciones/18hallazgos/
10bloqueos históricos no se recertifican. No se autoriza entrega a clientes.

Huellas y alcance: [validacion.json](validacion.json). Los artefactos completos
están conservados en el worktree histórico de UAT, en
`artifacts/go-prod-20261107-611/`; no contienen credenciales en este resumen.
