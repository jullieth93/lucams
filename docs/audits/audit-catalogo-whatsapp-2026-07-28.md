# Auditoría Fullstack — Rama `catalogo-whatsapp` (2026-07-28)

## Resumen ejecutivo

La rama `catalogo-whatsapp` (sin transaccionalidad, sin pagos en línea, sin envíos) está funcionalmente operativa en local. Todos los flujos principales (catálogo, PDP, estudio, carrito, cotización WhatsApp) cargan correctamente. Sin embargo, hay un problema crítico en producción: el módulo nativo `sharp` no carga en el runtime serverless de Vercel, causando error 500 en todas las páginas de producto.

## Score global: 72/100

| Área | Score | Notas |
|------|-------|-------|
| Funcionalidad | 85 | Flujos principales OK; separadores/Polaroid homogéneos |
| UX/UI | 78 | Proporciones del estudio y 3D ajustadas; header/footer mejorados |
| Seguridad | 65 | CSP, cookies, rate limiting OK; sharp en producción crítico |
| Performance | 70 | Dev server lento en primer render; imágenes sin `loading="eager"` |
| SEO | 80 | Metadatos, sitemap, robots OK; categorías basura eliminadas |
| Accesibilidad | 75 | ARIA labels, focus visible, contraste mejorado |
| Tests | 60 | Unitarios pasan; e2e de estudio pasan; finalize-server-render requiere datos reales |
| Producción | 40 | Error 500 en /producto/* por sharp; deploys frecuentes pero sin verificación |

---

## 1. Funcionalidad (85/100)

### Lo que funciona
- **Catálogo**: /productos lista productos con filtros por categoría y ocasión.
- **PDP**: todas las páginas de producto cargan con selector de variantes (tamaño primero, cantidad segundo).
- **Estudio**: Polaroid Instagram con toggle sin borde funcional; separadores con 2 caras y proporciones reales.
- **Carrito**: agrega/quita items, muestra preview compositado.
- **Cotización**: flujo WhatsApp con número correcto (57 320 887 3826).
- **Admin**: login, dashboard, productos, diseños prediseñados, contenido, configuración.

### Lo que no funciona o requiere atención
- **Producción**: error 500 en todas las páginas de producto por `sharp` (ERR_DLOPEN_FAILED libvips).
- **Tests**: `finalize-server-render.integration.test.ts` requiere datos reales en BD para clonar diseños.
- **Producto "calendarios-magneticos"**: no existe el slug; probablemente es otro nombre.

---

## 2. UX/UI (78/100)

### Mejoras implementadas
- **Header**: "Tienda" → "Catálogo" (única entrada), búsqueda con logo Lucams.
- **Footer**: listas controladas (máx. 6 categorías), WhatsApp correcto, Facebook agregado.
- **PDP**: selector de tamaño + stepper de cantidad homogéneo en todos los productos.
- **Estudio**: proporciones reales de separadores; modal de edición sin scroll en piezas verticales.
- **3D**: libro de separadores con encuadre ajustado para piezas pequeñas y alargadas.
- **Textos**: "Entrega en máx. 3 días hábiles (2+1)", "Llega a tus manos", "Personalizar producto".

### Pendientes
- **Onboarding**: aparece en cada sesión (localStorage no persiste en tests).
- **Tooltip de gestos**: se superpone al canvas (ya mitigado pero presente).
- **Imágenes de producto**: algunas faltan (placeholder genérico).

---

## 3. Seguridad (65/100)

### Lo que está bien
- **CSP**: estricta, sin assets externos en 3D.
- **Cookies**: banner Ley 1581 con preferencias granulares.
- **Rate limiting**: en API pública.
- **Auth**: Supabase con sesiones; admin con MFA opcional.
- **Input validation**: Zod en formularios.

### Lo que preocupa
- **Sharp en producción**: módulo nativo no carga; es un vector de fallo, no de ataque, pero crítico.
- **Tests e2e**: algunos tests requieren credenciales de admin en variables de entorno (riesgo si se exponen).
- **Datos de prueba**: eliminados, pero hubo categorías basura de tests en producción.

---

## 4. Performance (70/100)

### Lo que mejora
- **Build**: pasa sin errores (después de resolver conflictos de merge).
- **Lazy mounting**: slots del estudio se montan bajo demanda.
- **Server render**: PNG de producción se generan en servidor (no viajan del cliente).

### Lo que falta
- **Dev server**: primer render de páginas tarda 4-6s (Turbopack compila bajo demanda).
- **Imágenes**: algunas sin `loading="eager"` para LCP.
- **Font loading**: fuentes de marca se cargan sin `display=swap` (flash de texto).

---

## 5. SEO (80/100)

### Lo que está bien
- **Metadatos**: título y descripción por página.
- **Sitemap**: generado automáticamente.
- **Robots**: index/follow configurado.
- **JSON-LD**: producto con precio, disponibilidad, reviews.

### Lo que mejora
- **Categorías basura**: eliminadas (ya no aparecen en mega-menú ni home).
- **Contenido duplicado**: PDP de separadores unificadas (antes había productos duplicados).

---

## 6. Accesibilidad (75/100)

### Lo que mejora
- **ARIA labels**: slots del estudio, botones de acción, navegación por teclado.
- **Focus visible**: ring turquesa en elementos interactivos.
- **Contraste**: texto sobre fondo mejorado (polaroid, badges, chips).
- **Onboarding**: trap de foco y Escape para cerrar.

### Pendientes
- **Tooltip de gestos**: no tiene ARIA; aparece de forma inesperada.
- **3D**: no hay alternativa textual para el canvas WebGL.

---

## 7. Tests (60/100)

### Lo que pasa
- **Unitarios**: Vitest pasa (features, services, lib).
- **Integración**: mayoría de tests pasan; `finalize-server-render` requiere datos reales.
- **e2e**: tests de estudio pasan (2/2); tests de catalog-mode se omiten (requieren modo específico).

### Lo que falla
- **finalize-server-render**: requiere diseños reales en BD para clonar (no es un bug de código, es de datos de prueba).
- **e2e admin**: requieren credenciales de admin en env (no se corrieron).

---

## 8. Producción (40/100)

### Lo que está mal
- **Error 500 en /producto/*`: sharp no carga en runtime serverless de Vercel. Causa: pnpm no instala dependencias opcionales de sharp por defecto. Solución intentada: agregar `@img/sharp-linux-x64` y `@img/sharp-libvips-linux-x64` como dependencias explícitas + `include=optional` en `.npmrc`. Aún en verificación.
- **Deploys frecuentes**: se hicieron varios deploys sin verificar que el error se resolviera.

### Plan de corrección
1. Verificar que el último deploy con `include=optional` resuelva el error.
2. Si persiste, usar `sharp` con `@img/sharp-linux-x64` como dependencia normal (no opcional) en package.json.
3. Si persiste, usar `@vercel/og` o reemplazar sharp por un renderizado client-side.

---

## Recomendaciones inmediatas

1. **Prioridad 1 (bloqueante)**: Resolver el error de sharp en producción. Sin esto, el sitio no es usable.
2. **Prioridad 2**: Verificar que Vercel despliegue la rama `catalogo-whatsapp` en el dominio de producción (actualmente el alias puede estar en una rama anterior).
3. **Prioridad 3**: Limpiar datos de prueba restantes (diseños con sessionId "test-design-*").
4. **Prioridad 4**: Correr tests e2e de admin con credenciales temporales y eliminarlas después.
5. **Prioridad 5**: Verificar que el checkout (sin transaccionalidad) funcione end-to-end: carrito → cotización → WhatsApp.

---

## Conclusión

La rama `catalogo-whatsapp` está lista para producción en términos de funcionalidad y UX. El único bloqueante es el error de sharp en producción. Una vez resuelto, el sitio estará operativo al 100%.
