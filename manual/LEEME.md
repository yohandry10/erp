# Documentación de producto del ERP

Versión del producto: `ba9493a2`, esquema 590. Empiece por [publicado/MANUAL_DEL_PRODUCTO.html](publicado/MANUAL_DEL_PRODUCTO.html) o su [PDF](publicado/MANUAL_DEL_PRODUCTO.pdf).

| Área | Para quién | Dónde |
|---|---|---|
| A. Manual funcional | Quien necesita saber cómo funciona cada módulo | [MANUAL_DEL_PRODUCTO.md](MANUAL_DEL_PRODUCTO.md), [DETALLE_DE_PROCEDIMIENTOS.md](DETALLE_DE_PROCEDIMIENTOS.md) |
| B. Guías por rol | Quien opera el sistema | [GUIAS_POR_ROL.md](GUIAS_POR_ROL.md), [INVENTARIO_DE_PANTALLAS.md](INVENTARIO_DE_PANTALLAS.md) |
| C. Procesos entre módulos | Responsables de área | [PROCESOS_EMPRESARIALES.md](PROCESOS_EMPRESARIALES.md) |
| D. Técnica y operación | Soporte y desarrollo | [GUIA_TECNICA_Y_OPERATIVA.md](GUIA_TECNICA_Y_OPERATIVA.md), [REFERENCIA_API_Y_PERMISOS.md](REFERENCIA_API_Y_PERMISOS.md), `docs/` |
| E. Certificación | Auditoría interna | `artifacts/producto/ERP_DOCUMENTACION_COMPLETA_20261030.zip` |

Qué está cubierto y qué no: [EVALUACION_DE_PRODUCTO.md](EVALUACION_DE_PRODUCTO.md). **Esta documentación todavía no está terminada.**

## Mantenerla

```bash
node scripts/manual/generar-referencias.mjs
node scripts/manual/verificar-manual.mjs
python scripts/manual/publicar_html.py
node scripts/manual/publicar-pdf.mjs
```

`pnpm check-manual` falla si una pantalla nueva no tiene capítulo, si se cita una pantalla o un permiso que no existe, o si el texto vuelve a hablar de pruebas internas. El inventario y la referencia del API se generan: no se editan a mano. Este directorio está fuera de `docs/`, que tiene un máximo contractual de seis archivos.
