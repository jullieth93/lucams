# PROMPT MAESTRO — Certificación 100% Producción: lucams_shop / rama catalogo-whatsapp

## CONTEXTO
E-commerce colombiano "Lucams Shop" — productos magnéticos personalizados
(fotoimanes, calendarios, separadores, juegos de aprendizaje). Monorepo pnpm:
- apps/web: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind,
  Konva (editor canvas), Three.js (vistas 3D), sharp@0.34.4 (render producción).
- packages/db: Prisma 6 + PostgreSQL en Supabase (Auth, Storage, RLS).
- Infra: Vercel (lucamsshop.com), Supabase (DB/auth/storage), Resend (emails),
  Cloudflare Turnstile (anti-bot). pnpm 11, Node >=22.

La rama `catalogo-whatsapp` es la versión PRODUCTIVA SIN transaccionalidad:
SIN pagos en línea (Wompi), SIN integración de envíos (Aveonline), SIN chatbot.
El pedido se cierra por WhatsApp (+57 320 887 3826). Pago contraentrega (COD)
configurable por admin. Catálogo real: 4 categorías, 8 productos.

OBJETIVO: catalogo-whatsapp en estado 100% producción = todos los flujos
funcionan + cero bugs visibles + métricas duras (Lighthouse ≥90, 0 errores de
consola, accesibilidad AA, monitoreo activo).

## FASE 1 — CAPA CLIENTE
Certificar CADA flujo end-to-end en desktop (1280×800) y móvil (390×844):

1. Home: hero, 4 categorías reales (Fotoimanes, Calendarios, Separadores,
   Juegos), reseñas sin etiqueta demo, how-it-works ("Llega a tus manos",
   "Te llega en máx. 3 días"), "Pago contraentrega disponible" SOLO si COD
   está activo en admin (modular).
2. Catálogo (/productos, /productos/[categoria]/[subcategoria]): filtros,
   orden, cards con precio/descuento, mega-menú sin desborde, cantidad de
   categorías controlada en pantalla.
3. PDP (/producto/[slug]): variantes, precios por variante, CTA a estudio,
   copy sin mencionar transportadoras específicas — decir "coordinamos el
   envío contigo por WhatsApp" (Aveonline multi-transportadora es operativo
   interno, no promesa de integración en esta rama).
4. Estudio (/estudio/[slug]) — los 8 productos:
   - Polaroid Clásica e Instagram: con/sin borde REAL (sin borde = foto cubre
     toda la tarjeta, chrome Instagram encima), fondo blanco/negro, textos
     editables, SIN "Hace 2 días" ni contadores de comentarios.
   - Cuadrados: tamaños reales 6.5×6.5cm y 7.5×10cm, marco blanco/negro.
   - Tiras: pieza continua (no fotos separadas), tira de 3 o 4 fotos en variantes.
   - Separadores: 2 caras (frente/reverso sin repetir), doblez por el lado
     angosto, abierto mide 12cm (6+6), tamaños 4×4.2cm y 6×2cm.
   - Calendario 12 tarjetas, Nombre Personalizado, Pack Vocales (idioma/tema
     modular: animales, frutas, profesiones), Abecedario.
   - Cantidad: selector +/− voluntario con precio unitario correcto (sin duplicar).
   - Zoom: rueda en desktop, pellizco funcional en móvil, SIN slider de zoom
     invadiendo botones (centrar/ajustar/quitar).
   - Modal de edición unificado con tabs (Foto/Texto); cualquier clic en foto
     o botón abre ese mismo modal.
   - Upload con consentimiento Ley 1581; guía de calidad (~900px mínimo, 300 DPI).
5. 3D ("Ver en tu espacio"): nevera/mural/repisa/regalo sin desborde; vista
   Polaroid SOLO en productos polaroid; tiras como pieza completa; separadores
   con doblez real; calendarios con ganchos realistas.
6. Cotización → WhatsApp: mensaje bien formado (productos, variantes,
   cantidades, total, datos cliente). Sin checkout de pago.
7. Cuenta: registro/login (Supabase Auth + Turnstile), mis pedidos, perfil,
   favoritos, recuperar contraseña por email (Resend).
8. Header: logo Lucams en la barra de búsqueda, un solo link "Catálogo" con
   desglose de categorías (sin "Tienda" redundante), "¿Te ayudamos a elegir?"
   con botón Volver.
9. Footer: WhatsApp 57 320 887 3826, Facebook https://www.facebook.com/lucamsshop,
   listas cortas, datos de contacto correctos en TODO el ecosistema.
10. /ayuda: contenido coherente con persona natural SIN facturación DIAN
    (quitar promesas de factura electrónica), tiempos máx 3 días, COD modular.

## FASE 2 — CAPA ADMIN (admin NO técnico)
1. Productos: CRUD completo, activar/desactivar (ocultar corazones y circulares
   SIN borrarlos), precios por variante, imágenes, orden.
2. Categorías: CRUD, activar/desactivar, orden, sin desborde en menús/footer.
3. Plantillas: lista SIN basura, vista previa fiel (la previa = lo que el
   cliente obtiene al personalizar, no una imagen inventada), botón "probar
   plantilla" desde el admin.
4. Pedidos/cotizaciones: lista, detalle, estados, contacto WhatsApp del
   cliente, descarga de arte de producción (PNG 300 DPI listo para imprimir).
5. Configuración: toggle COD (reflejado modular en TODO el front), datos de
   contacto, redes sociales, textos modulares. El nombre del titular
   (persona natural) NO aparece directo en el front; solo donde la ley lo exija.
   Días: producción 2 + entrega 1 (máx 3 en todo el sitio).
6. Reseñas: gestión completa, sin etiqueta "demo".
7. Toda acción admin persiste en Supabase y se refleja en el front sin caché zombie.

## FASE 3 — CABLEADO E INTEGRACIONES
1. Vercel: Production Branch = catalogo-whatsapp; env vars completas en
   Production (NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_WA_NUMBER, DATABASE_URL,
   DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
   SUPABASE_SECRET_KEY, RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO,
   NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, CSRF_SECRET);
   build limpio; 0 errores 500 en logs.
2. Supabase: RLS activo verificado en tablas sensibles (orders, quotes, users);
   buckets públicos solo lo necesario; sin datos de prueba activos (solo las
   4 categorías y 8 productos reales).
3. Resend: dominio verificado y TODOS los flujos funcionan: confirmación de
   cotización, aviso de pedido nuevo al admin, recuperar contraseña,
   contacto/ayuda, newsletter + unsubscribe.
4. Turnstile: activo en login/registro/contacto/cotización; sin falsos
   negativos en móvil.
5. Barrido total: 0 links muertos, 0 CTAs huérfanos, 0 textos placeholder,
   0 archivos basura cableados al front.
6. Flujo de impresión transparente: cliente cotiza → admin recibe archivos de
   impresión correctos (300 DPI) → cliente recibe confirmación clara.

## FASE 4 — SEGURIDAD
1. Sin secrets en repo (gitleaks limpio); .env.* gitignored y fuera del build.
2. RLS: usuario solo lee/escribe lo suyo; admin solo con rol admin (probar bypass).
3. CSRF activo, rate limiting en endpoints públicos, validación Zod en todo
   input, sanitizado de uploads (tipo/tamaño/HEIC), headers de seguridad.
4. Consentimiento Ley 1581 en upload de fotos; privacidad y términos enlazados.

## FASE 5 — MÉTRICAS DURAS Y VALIDACIÓN
1. Lighthouse (mobile + desktop) ≥90 en Performance, Accessibility, Best
   Practices y SEO en: home, /productos, 1 PDP, 1 estudio.
2. 0 errores de consola y 0 warnings críticos en esas mismas páginas.
3. Accesibilidad AA: foco visible, labels, contraste, navegación por teclado
   en el estudio.
4. Tests: pnpm test verde, typecheck verde, e2e Playwright (home, catálogo,
   PDP, estudio×8, cotización WhatsApp, admin core) verdes.
5. Monitoreo: configurar UptimeRobot (o similar) sobre /status con alerta por
   email; Vercel logs sin errores por 24h.
6. sitemap.xml y robots.txt correctos; OG/Twitter cards con imagen real.

## FASE 6 — CERTIFICACIÓN FINAL
Checklist firmado ítem a ítem con evidencia (capturas desktop+móvil, reportes
Lighthouse, salida de tests, logs de Vercel, conteos de DB). Solo se declara
100% producción cuando TODO está ✅. Cada hallazgo se corrige y se re-certifica
el ítem; no se aceptan "errores conocidos".

## RESTRICCIONES DURAS
- PROHIBIDO exponer UI de pagos en línea, integración de envíos o chatbot.
- CTA de cierre siempre WhatsApp con el número correcto.
- Tiempos comunicados: producción 2 días hábiles + 1 entrega (máx 3).
- Cambios mínimos y revisables; nada de refactors oportunistas.
- Trabajar en la rama catalogo-whatsapp; develop queda para la futura
  transaccionalidad (Wompi/Aveonline); production/master es el cierre final.
