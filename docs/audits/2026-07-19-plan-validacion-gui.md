# Plan de validación GUI — Backlog auditoría v3 (Tandas 1-8 + Feedback)

> **Para:** Lucy. **Fecha:** 2026-07-19. **Qué es:** una lista para que revises **con tus propios ojos** en el navegador todo lo que se implementó del backlog de auditoría v3 (Tandas 4-8) y tus comentarios de UX (FB1-FB5). Muchos cambios ya los verifiqué con navegador headless (Chromium) y con `curl`, pero **tu criterio de marca/UX es el que manda** — por eso esto se enfoca en lo que conviene que confirmes tú.

## Cómo usar este plan

- **Dónde probar:** tu **preview de Vercel de `develop`** (o en local `http://localhost:4000` con `make up`). Todo lo de abajo está pusheado a `origin/develop`.
- **Cómo marcar:** pon `[x]` cuando lo confirmes; si algo se ve raro, anótalo debajo del ítem.
- **Prioridad:** 🔴 = revisar sí o sí (flujo de venta / cara al cliente). 🟡 = importante. 🟢 = detalle.
- **Móvil vs escritorio:** donde diga 📱 pruébalo en el celular (o con el navegador angosto), porque el comportamiento cambia.

---

## Bloque 1 — Recomendador (`/recomendador`) 🔴

El "ayúdame a elegir". Se reescribió casi completo (Tanda 8 A/B).

- [ ] 🔴 **El presupuesto ahora filtra de verdad.** Elige "Menos de $30k" y confirma que **no** aparece ningún producto cuyo "Desde" supere ese tope. Antes se colaban productos caros.
- [ ] 🟡 **Bucket "Más de $200k":** elige ese rango y confirma que aparecen productos con variantes caras (no debería quedar vacío por error).
- [ ] 🟡 **"Para quién" tiene sentido:** elige distintos destinatarios y mira la razón bajo cada card ("Ideal para tu pareja", "Ideal para la familia", etc.). Debe leerse natural en español, **no** "Ideal para mi" ni palabras sueltas.
- [ ] 🔴 **Ocasiones vacías ya no aparecen:** en el paso 1 solo deberían salir ocasiones que tengan productos. (Si vacías el catálogo de una ocasión desde el admin, esa ocasión debe desaparecer del wizard.)
- [ ] 🔴 📱 **Estado vacío bonito:** fuerza un "sin resultados" (ej. una ocasión + "Listo para enviar" si todos son personalizables). Debe salir la **mascota** + 3 botones: **Ajustar respuestas**, **Ver todo el catálogo**, **Empezar de nuevo**. "Ajustar respuestas" te devuelve al paso de presupuesto conservando lo que respondiste.
- [ ] 🟡 **Atajo al Estudio:** en los resultados, las cards personalizables deben tener un botón **"✨ Personalízalo"** que lleva directo a `/estudio/<producto>` (además del click normal que va a la ficha).
- [ ] 🟡 **La URL guarda tu progreso:** avanza unos pasos y mira que la barra de direcciones cambie (`?ocasion=…&paso=2`). **Refresca la página en los resultados** → deben reaparecer los mismos resultados, no volver al paso 1.
- [ ] 🟢 **Teclado / accesibilidad:** navega el wizard solo con Tab + Enter. El foco debe saltar al título de cada paso.

---

## Bloque 2 — Reseñas 🔴

### En la ficha de producto (`/producto/<algo>`)

- [ ] 🔴 **El promedio y el conteo son reales:** el número de estrellas y el "N reseñas" del encabezado deben coincidir con **todas** las reseñas aprobadas, no solo las visibles. Si hay más de 20, aparece "Mostrando las 20 más recientes de N".
- [ ] 🔴 **El formulario solo se muestra a quien puede publicar.** Con sesión iniciada:
  - Si **no** compraste el producto → mensaje "Solo puedes reseñar productos que compraste…", **sin** formulario.
  - Si **ya** dejaste reseña → "Ya dejaste tu reseña de este producto ✨", **sin** formulario.
  - Si compraste y no reseñaste → **sí** aparece el formulario.
- [ ] 🟡 **El comentario no se borra al fallar:** escribe una reseña, y si algo falla (ej. Turnstile expira), el texto que escribiste **debe seguir ahí** (antes se borraba).

### En el admin (`/admin/resenas` y ficha del producto → pestaña Reseñas)

- [ ] 🟡 **Filtrar por producto funciona:** desde la ficha de un producto en el admin, botón **"Ver todas en el moderador"** → debe abrir `/admin/resenas` **ya filtrado a ese producto** (con un aviso "Filtrando reseñas de <producto> · Quitar filtro"). El botón "Restaurar" de una archivada te lleva a la pestaña de archivadas.
- [ ] 🟢 **Ya no está el botón "Rechazar"** en el panel de la ficha (era un botón que no hacía nada). Para sacar una reseña spam usas **"Archivar"** (que sí es reversible).

---

## Bloque 3 — Compartir e instalar (SEO / OpenGraph / PWA) 🔴

- [ ] 🔴 **Compartir por WhatsApp muestra imagen linda:** pega el link de una **ocasión** (`/ocasion/cumpleanos`) o una **subcategoría** en un chat de WhatsApp contigo mismo. Debe salir una tarjeta con imagen (fondo crema + mapache + "Tus recuerdos en imán"), **no** un link pelado sin imagen. Igual con la home y una ficha de producto.
- [ ] 🟡 **El título de la pestaña no repite la marca:** abre `/ocasion/cumpleanos` y mira la pestaña del navegador → debe decir "Cumpleaños · Lucams_shop" (una sola vez), no "Lucams_shop · Cumpleaños · Lucams_shop".
- [ ] 🟢 📱 **Instalar como app (PWA):** en el celular, "Agregar a pantalla de inicio". El ícono debe verse nítido (no pixelado ni recortado) — el mapache dentro de un círculo lavanda.

> Nota técnica: el sitemap ahora incluye el recomendador, las ocasiones y las subcategorías; y las URLs canónicas usan una sola fuente. Eso es para Google, no hay nada visual que revisar ahí.

---

## Bloque 4 — Storefront (Tanda 5) 🔴

- [ ] 🔴 **Home:** el CTA principal dice "Personalizar el mío" y va al catálogo (`/productos?personalizable=1`), **no** a WhatsApp. Los productos agotados salen **al final** del carrusel de destacados. El chip "Pago contraentrega disponible" aparece solo si tienes la contraentrega activa.
- [ ] 🟡 📱 **Filtros:** el filtro de ocasión se mantiene al navegar; los rangos de precio salen en pesos formateados; 📱 el panel de filtros en móvil se cierra al aplicar y muestra "Ver N productos".
- [ ] 🟡 **Cards:** los agotados muestran el badge "Agotado" en gris; el conteo de "/ocasion" cuenta solo productos activos; 📱 el grid es de 2 columnas en móvil.
- [ ] 🔴 **Ficha (PDP):** aparece el **strip de confianza** (producción / envío / pago / garantía con enlaces legales). El selector de variantes se ve como botones que se marcan. El precio no se desborda.
- [ ] 🟡 **Contenido:** revisa que ningún producto tenga la foto placeholder inapropiada de antes (se reemplazó en 8 productos — conviene un ojo humano por si quedó alguna).
- [ ] 🟡 **Checkout (datos):** el copy está en español correcto (tuteo, sin Spanglish); "Bogotá D.C." no se duplica en la dirección.

---

## Bloque 5 — Estudio + tus comentarios de UX (Tanda 4 + FB) 🔴

- [ ] 🔴 **FB1 — Login visible:** 📱 en el celular, el ícono de cuenta (👤) debe estar visible en el header y llevarte a `/mi-cuenta` (o `/login` si no iniciaste sesión).
- [ ] 🔴 **FB2 — Salir del estudio:** dentro del Estudio debe haber una forma clara de volver atrás / salir.
- [ ] 🔴 **FB3 — Festivos en los calendarios:** en un producto de calendario, los días festivos colombianos deben salir marcados (color + nombre corto + leyenda). Revisa un par de meses conocidos (ej. 20 de julio, festivos que se mueven al lunes).
- [ ] 🔴 📱 **FB4 — Mover la foto con los dedos:** en móvil, tocar una foto en el estudio abre un **editor a pantalla completa** donde sí puedes hacer pan/zoom con los dedos sin que la página se mueva. En la grilla, el scroll normal debe funcionar (tap para abrir, no gesto atrapado).
- [ ] 🔴 **FB5 — Vistas 3D:** las 3 vistas 3D (nombre / libro / nevera) deben verse bien encuadradas y con mejor realismo (iluminación, reflejos). **Este es muy de criterio tuyo** — dime si el nivel de realismo te convence o quieres más.
- [ ] 🟡 **Copy del estudio:** onboarding y hints en tuteo (no "Eligís/Contanos"). En separadores, el texto dice "separador", no "imán".
- [ ] 🟢 **Editores:** el nombre no se corta al escribir; los swatches de color son accesibles (40px, con etiqueta por color).

---

## Bloque 6 — Cuenta, navegación y copy transaccional (Tanda 6) 🟡

- [ ] 🔴 **Contraentrega no dice "Pagado":** en un pedido contraentrega (guest y en `/mi-cuenta/pedidos`), el estado dice "Confirmado" y hay un aviso persistente "Pagas $X en efectivo…". Nunca "Pagado" antes de recibir.
- [ ] 🟡 **Transportadora legible:** en el seguimiento, el nombre de la transportadora sale en formato bonito (no en MAYÚSCULAS de código).
- [ ] 🟡 **Tiempos de entrega unificados** a "4-9 días hábiles" y el nombre "Fotoimanes".
- [ ] 🟡 **Deep-link tras login:** entra a `/mi-cuenta/pedidos/<numero>` sin sesión → te manda a login y **después del login te devuelve a esa misma página** (no a `/mi-cuenta` genérico).
- [ ] 🟢 **Cotizador de envío:** los tiempos dicen "…tras el despacho" y hay una nota de que antes se fabrica a mano (2-4 días).

---

## Bloque 7 — Admin (Tanda 7) 🟡

- [ ] 🟡 **Búsqueda de productos** en el admin no se corta a 8 resultados; el conteo y los filtros operan sobre el set completo.
- [ ] 🟡 **Reembolso contraentrega:** el copy dice que se devuelve por transferencia (no por Wompi).
- [ ] 🟢 **Pedidos:** los ítems muestran el **nombre del producto**, no el SKU; los estados en español.
- [ ] 🟢 **Accesibilidad:** contraste del 404 y tamaño de los controles del carrito (44px) revisados.

---

## Requiere tu criterio (no hay "correcto" único)

- [ ] **Realismo 3D (FB5):** ¿el nivel actual te gusta o quieres subirlo más?
- [ ] **Imagen de compartir (OG):** la imagen actual es generada (fondo crema + mapache + claim). Si tienes un arte propio de 1200×630 lo cambiamos.
- [ ] **Íconos PWA:** generados desde el logo actual (468px). Si tienes el logo en vectorial/mayor resolución, quedan más nítidos.

---

## Pendientes que dependen de una decisión tuya (no implementados a propósito)

Estos NO se hicieron porque necesitan que tú decidas primero:

1. **Textos legales (T&C "Quiénes somos", versión legal):** dependen de tu **figura jurídica** — ¿persona natural o S.A.S.? Con eso resembramos los textos legales.
2. **Métodos de pago (Daviplata):** confirmar si Daviplata está habilitado en tu cuenta Wompi para listarlo.
3. **Página pública de rastreo (`/rastrear`):** es una página nueva por construir (T6 #14). ¿La quieres?
4. **"Snapshot" del diseño en el pedido (pieza mayor #1):** guardar la miniatura del diseño personalizado dentro del pedido para producción. Es una pieza grande con su propia decisión técnica (ADR).

> Cuando me des estas 4 definiciones, cierro también esos frentes.
