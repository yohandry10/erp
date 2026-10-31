# suministro · F01, tercer incremento: pedidos y adjuntos

Feature local separada de la matriz de aceptación. Las migraciones 570–573 y
el runtime que exige 573 siguen sin promoverse a PROD. No hubo escrituras remotas.

## Comportamiento implementado

- Vínculo de un pedido pendiente completo al contrato. Cada línea se asigna a
  una programación del mismo contrato con producto y precio de OC coincidentes.
  Cliente y moneda deben coincidir. Los vínculos vigentes no exceden la cantidad
  programada; las líneas repetidas también se suman dentro de la transacción.
- Selección por snapshot: cambios del pedido entre consulta y confirmación
  devuelven conflicto. Consultas exigen contratos.ver y pedidos.ver; gestionar
  vínculos exige además contratos.gestionar y pedidos.editar. Ambos recursos
  deben pertenecer a la empresa del actor activo.
- Protección SQL de líneas, identidad y totales del pedido vinculado y de la
  programación con pedidos vigentes. Un pedido pendiente sin ejecución puede
  desvincularse con motivo. Un pedido confirmado no vuelve a pendiente para
  eludir la protección. Movimientos de líneas entre pedidos protegen ambos padres.
- Confirmación, reservas, despacho y cancelación continúan con los writers
  operativos existentes. Cancelar libera asignación contractual y conserva su
  vínculo histórico. Los contadores de despacho/facturación se leen del pedido;
  no se generan movimientos de inventario adicionales al vincular.
- Navegación en ambos sentidos: contrato → pedido → contrato/OC/programación.
- Adjuntos para contrato, OC o adenda en bucket privado supply-contract-files.
  Formatos PDF, DOCX sin macros, PNG y JPG hasta 10 MiB. Se validan extensión,
  contenido, tamaño y nombre, incluidas tildes de formularios multipart.
- Reserva durable → subida sin sobrescritura → confirmación. Una respuesta
  perdida se recupera con el mismo archivo/clave; un objeto ya presente exige
  verificar SHA-256. Archivos pendientes no figuran como disponibles.
- Descarga autenticada mediante enlace de 60 segundos que fuerza descarga con
  nombre. Retirar con motivo conserva el objeto/historial y bloquea nuevos
  enlaces; los ya emitidos vencen normalmente. No hay borrado físico.

## Cambios y límites de migración

572 añade tablas privadas de vínculos y líneas, RPCs service_role y triggers de
integridad en pedidos/programaciones. No tiene backfill de ventas. Los locks
compartidos siguen el orden pedido → contrato; la revisión contractual sólo
bloquea contrato y no toma locks de pedidos.

573 añade metadatos privados e índice por empresa/clave y configura el bucket
con política restrictiva para anon/authenticated. El archivo reside en Storage;
la base confirma su existencia y el servicio valida sus bytes. Las diez tablas
F01 tienen RLS forzado y carecen de acceso directo para roles de aplicación.

Rollback operativo: retirar la superficie conservando compromisos, documentos
privados e historial. No borrar vínculos ni reactivar órdenes silenciosamente.
El servicio de respaldo, retención y exportación integral sigue en F09.

## Evidencia

- API: 93 pruebas en seis suites aprobadas; api-final.log. Incluye pedidos
  existentes, permisos, validación de mapeo y archivos, rutas privadas, replay,
  contenido diferente, caída de Storage y preservación de nombres españoles.
- Navegador: cinco recorridos aprobados; browser-confirmed.log. Escritorio claro
  y móvil oscuro, recorrido bidireccional, respuesta perdida de vínculo y de
  adjunto, recuperación con idéntica intención, retiro y descarga privada.
- Concurrencia: 12 escenarios reales aprobados; concurrency.json. Cantidades,
  adendas/versiones, modificación/anulación, vinculación/edición/anulación y
  reservas/confirmaciones concurrentes de un único archivo.
- Storage oficial real en infraestructura efímera: cuatro escenarios aprobados;
  storage-real.json. Bytes exactos, denegación pública/anónima, recuperación tras
  respuesta perdida y tras objeto pendiente, retiro conservando evidencia.
- Reconstrucción PostgreSQL 16 Docker: 569 migraciones hasta 573, 82 verificadores
  y 67 históricos aprobaron en fresh-sql-final.log antes del endurecimiento final
  de origen y no retorno a pendiente. La repetición SQL final se documenta por
  separado; los intentos fallidos se conservan y no acreditan cierre.
- API compila. Web compila en web-build-no-cache.log; el primer intento agotó el
  disco (web-build.log). El ensayo sin caché restaura next.config.js exactamente
  y no cambia código publicado. Conserva advertencias existentes de Edge/ESLint.
- 1033 controles con etiqueta programática, política offline, detector UI sin
  hallazgos y contrato de seis documentos aprobados. La UI se inspeccionó en
  escritorio y móvil; capturas en browser-confirmed/.

## Pendiente fuera de esta entrega

Aceptación física de entregas, PECOSAS, inventario por lote, conciliación monetaria
por contrato, facturación contractual parcial, alertas/penalidades, Power BI,
FOX y continuidad/implantación corresponden a F02–F10. Los contadores operativos
no acreditan conformidad ni saldos cobrados. Los adjuntos no constituyen firma,
aprobación legal ni análisis antivirus.

Antes de promover: OPERATIONS, rango/prefijos vigentes, preflight PROD, respaldo,
ensayo de preservación local, permisos/RLS/locks y despliegue coordinado.
