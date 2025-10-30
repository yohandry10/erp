# 🧪 Test E2E: Crear Orden de Compra Completa

## 🚀 Ejecución Rápida

```powershell
# Ejecutar el test
.\test-crear-oc-completa.ps1
```

## 📋 ¿Qué hace este test?

Este test automatizado valida el flujo completo de creación de una orden de compra:

1. **Step 1:** Llena información básica (proveedor, fechas, condiciones)
2. **Step 2:** Agrega 2 productos con cantidades y precios
3. **Step 3:** Revisa la información y crea la orden
4. **Verificación:** Confirma que la orden se creó exitosamente

## 📸 Screenshots

El test genera automáticamente 4 screenshots en `apps/web/tests/screenshots/`:

- `oc-step1-filled.png` - Formulario básico completado
- `oc-step2-products.png` - Productos agregados
- `oc-step3-review.png` - Revisión final
- `oc-created.png` - Orden creada

## ✅ Validaciones

El test verifica:

- ✅ Navegación correcta entre páginas
- ✅ Wizard de 3 pasos funcional
- ✅ Formularios con validación
- ✅ Cálculos automáticos de totales (Subtotal + IGV)
- ✅ Creación exitosa de la orden
- ✅ Manejo de casos sin datos (proveedores, productos)

## 🎯 Requisitos Previos

Para que el test funcione correctamente, asegúrate de tener:

1. **Proveedores activos** en el sistema
2. **Productos** disponibles en inventario
3. **Servidor de desarrollo** corriendo en `http://localhost:3001`

## 🔧 Otros Comandos

```bash
# Ver el test en modo UI (interactivo)
cd apps/web
pnpm test:e2e:ui --grep "Crear OC completa"

# Ver el navegador mientras se ejecuta
cd apps/web
pnpm test:e2e:headed --grep "Crear OC completa"

# Modo debug (paso a paso)
cd apps/web
pnpm test:e2e:debug --grep "Crear OC completa"

# Ejecutar todos los tests de órdenes de compra
cd apps/web
pnpm test:e2e --grep "Órdenes de Compra"
```

## 📊 Reporte

Después de ejecutar el test, puedes ver el reporte HTML en:

```
apps/web/playwright-report/index.html
```

## 📚 Documentación Completa

Para más detalles técnicos, consulta:

- **IMPLEMENTATION_CREAR_OC_COMPLETA_E2E.md** - Documentación técnica detallada
- **SUMMARY_CREAR_OC_COMPLETA_E2E.md** - Resumen ejecutivo con métricas

## 🐛 Troubleshooting

### El test falla con "No hay proveedores disponibles"
**Solución:** Crea al menos un proveedor activo en el sistema antes de ejecutar el test.

### El test falla con "No hay productos disponibles"
**Solución:** Crea al menos 2 productos en el inventario antes de ejecutar el test.

### El test falla con "Cannot find button Nueva Orden"
**Solución:** Verifica que el servidor de desarrollo esté corriendo en `http://localhost:3001`.

### Los screenshots no se generan
**Solución:** Verifica que existe el directorio `apps/web/tests/screenshots/`. Si no existe, créalo manualmente.

## 💡 Tips

- El test toma aproximadamente **30-45 segundos** en ejecutarse
- Los screenshots son útiles para documentación y debugging
- Puedes ejecutar el test en modo headed para ver qué está haciendo
- El test salta automáticamente si no hay datos necesarios (proveedores/productos)

## 🎉 ¡Listo!

El test está completamente funcional y listo para usar. Si tienes algún problema, revisa la documentación completa o los logs del test.

---

**Última actualización:** 2025-10-25  
**Versión:** 1.0.0  
**Estado:** ✅ Funcional
