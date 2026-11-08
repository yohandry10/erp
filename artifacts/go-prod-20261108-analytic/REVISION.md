# D58 · respuestas fuera de orden en distribución analítica

Estado: corrección local y aceptación dirigida de navegador aprobadas; CI de esta corrección pendiente.
No cambia el esquema617 ni confirma asientos. NO_GO global.

El CI42511475454 sobre b20ee727 conserva70 casos de navegador aprobados y1
inestable. El caso de reparto no emitióPOST: después de elegir un destino, la
captura muestra «Seleccionar» y Guardar deshabilitado. Pasó al reintento; el gate
lo rechazó correctamente. No se amplía su timeout ni se exceptúa el caso.

Una reproducción con el componenteTSX real, React18 y DOM en memoria fuerza
dos lecturas y resuelve primero la nueva. Sobre f0066851, la respuesta antigua
borra el destino elegido. También se reproducen errores tardíos que pintan otra
línea. Esto prueba el defecto; no reconstruye el orden exacto de peticiones del
ensayo original, que no tenía esa traza.

La corrección asocia las respuestas con su línea, getter y generación. Inicializa
las filas dentro de la lectura actual antes de mostrar el editor y retira el
efecto que las reiniciaba después de pintar. Los errores de lectura actuales
bloquean el formulario con consulta repetible; los errores de escritura conservan
la selección actual. Una respuesta de otra línea no pinta errores ni la bloquea.

Ocho casos ejecutan el componente real: selección/reenvío original, cambio de
línea, rechazo antiguo, error y recuperación de lectura, fallo de guardado,
fallo tardío de guardado/borrado y cambio de eje. Antes pasan2 y fallan6; después
pasan8. No usan navegador, red ni base de datos. Se incorporan al job de pruebas
existente. No sustituyen el ensayo integrado real.

CodeQL42516304582 yE2E42516304655 pasan sobre f0066851, anterior a este delta.
El merge9b4ff745eb26025cea62643eb011eb7f6bbb1702 y esa cabeza comparten el árbol
6a1b797b9f2d57735b38a79759491f9011b2c050. Los análisisJS/TS2122445829/2122444138
reportan la misma alerta108 descartada el31oct como falso positivo; sin cambio
de estado ni supresión nueva. Los resultados antiguos de main conservan su alcance.

Tipos y ESLint del componente sin errores ni avisos. Dos builds de producción
aprobados; el segundo contiene el ajuste de limpieza de efecto sin aviso nuevo.
Conserva925 archivos fuente/manifiestos y restaura metadatos generados. AuditPROD
sin avisos; árbol completo1bajo/5moderados,0altos/críticos, como antes del delta.

Desde el navegador integrado se entra con un actor sintético propio y se guarda
100 % en una línea de un borrador local12.34/12.34. Tras recargar y abrir de nuevo,
el destino permanece. Se elimina sólo el reparto. SQL confirma1 imputación por
12.34 después de guardar y0 al eliminar, con las dos filas de detalle idénticas
y el asiento aún BORRADOR. No hubo confirmación ni operaciones remotas.

Límites del arnés: el puerto3133 fue rechazado por el control de forwarded-host
delAPI; se sirvió el mismo build en el origen3129 permitido. Se renovó el proceso
local cuyo JWT de servicio había vencido a las dos horas, conservandoDB y REST.
La comprobación de disponibilidad sigue503 por4 eventos de pruebas pendientes
envejecidos; esquema617, permisos y base están válidos. La aceptación del reparto
es acotada y no se presenta como una comprobación de disponibilidad de release.
Se preservan esos eventos, los intentos fallidos y sus logs; no se cambia el gate.
