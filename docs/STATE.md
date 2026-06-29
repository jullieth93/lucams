# Estado del proyecto — Lucams_shop

> **Cómo leer este archivo.** Es el índice narrativo del proyecto. La fuente de verdad de cada dominio sigue siendo el `.md` correspondiente (ROADMAP, ARCHITECTURE, DECISIONS, etc.) — STATE.md te dice **dónde estás parado** y **qué pasó en la última sesión** sin tener que leer todo.
>
> **Cómo se mantiene.** Al cerrar cualquier sesión con cambios, Claude Code actualiza:
>
> 1. El bloque **Resumen actual** (un párrafo, siempre arriba).
> 2. La sección **Última sesión** (qué se hizo en esta iteración).
> 3. El bloque **Próximo paso** (qué viene cuando se reanude).
> 4. Una entrada nueva en **Bitácora** (append-only, más reciente arriba).

---

## Resumen actual

**Checkout/pagos CERTIFICADO + Compliance Bloque B cerrado (2026-06-27).** El flujo de
checkout (Wompi + Aveonline + saga POST-PAID) pasó por una **certificación adversarial
multi-agente** que encontró y cerró un P0 bloqueante (índice unique de InventoryLog sin
variantId rompía toda orden multi-ítem, reproducido contra DB) + 4 fixes pre-launch + 5
post-launch + un P1 de doble-guía concurrente hallado en la verificación. Garantías ahora
en el código: idempotencia física del ledger (índice parcial `(orderId, reason, variantId)`
+ manejo P2002), claim atómico de guía (`Order.shipmentClaimedAt`), clearCart dentro de la
tx PAID, email de confirmación idempotente/recuperable (`confirmationSentAt`),
VOIDED→REFUNDED con revert de stock, retry de colisión de `Order.number`, unique parcial de
`Order.cartId`, anti-replay + env-match en webhook, reconciliación visible
(`needsReconciliation` + banner en /admin/pedidos). **48 tests de orders (integración DB
real) verdes.** **Bloque B compliance:** `/unsubscribe` (Ley 1581), textos legales reales
(privacidad/términos/devoluciones/subprocesadores Aveonline), retracto verificado contra
Ley 2439/2024 (reembolso 15 días calendario), voseo→tuteo en emails. **Admin restructurado
(Opción C):** /admin/inventario, sub-nav del producto (Editar/Versiones/Reseñas), bulk
actions, sidebar reagrupado. **Pulido UX admin "amigable" (2026-06-27):** auditoría
multi-agente de ~18 comentarios de Lucy → 3 bugs cerrados (precio opción en pesos, orden
categorías determinista, sidebar sticky) + sprint "Admin amigable" + sub-categorías +
flechas reorden + precio base auto-derivado + ordenar por clic en columnas + **fotos por
opción (D1: migración `ProductVariant.images` + uploader admin + galería reactiva en el
PDP)**. Los 6 bloques del feedback cerrados (7 commits). **Próximo: P0-004 verificar
dominio Resend (ACCIÓN HUMANA DNS) → Bloque C
(Seguridad: RBAC/Turnstile/RLS).** Detalle de fases intermedias (catálogo, carrito,
checkout, admin UX) en el historial git + bitácora abajo.

---

## Última sesión — 2026-06-27 (Barrido UX/UI integral — 2da tanda de feedback de Lucy)

**Origen:** Lucy dio una 2da tanda de comentarios (productos, opciones, generales) + el
mandato "recorre TODO el ecosistema UX/UI, no des por hecho, ajusta y certifica". Auditoría
multi-agente de 6 frentes → `docs/audits/2026-06-27-ux-sweep/`. Decisiones: D1 precio tachado
por opción = SÍ (migrar); atributos forma/acabado/proporción = quitar del form; nombre opción
= libre + sugerencia; módulos técnicos = dejar pero simplificar.

**Hechos por commit (7):**

- `a1b87bc` **Globales:** cursor "manito" (1 regla global en globals.css `@layer base`) ·
  voseo→tuteo (~38 strings, "Diseñá"→"Diseña" etc.) · sin jerga dev en UI ("make seed-…",
  "/api/coupons/public").
- `48bfcb5` **Productos:** ordenar por Código (sku) y Categoría además de Producto/Precio
  (service + whitelist + SortableHeader) · paginación « Primera/Última » + "ir a página N"
  (form GET con filtros hidden) + clamp de page fuera de rango.
- `7b10158` **Opciones:** form de edición FUERA de la tabla (era `<tr colSpan>` bajo el
  thead — el "error de UI" que vio Lucy) · atributos a lenguaje llano (4 campos; forma/
  acabado/proporción ocultos preservados) · nombre con sugerencia en vivo · precio con "$"+COP.
- `e2ba896` **Precio tachado por opción (D1):** `ProductVariant.compareAtPrice`
  (migración 20260627150000, manual + backfill que evita descuento negativo) · form de opción
  con el campo · PDP usa el tachado de la opción elegida (reactivo) · cards leen
  `product.compareAtPrice` denormalizado = promo de la opción más barata (syncProductBasePrice).
- `b4c8063` **Loading (G2):** `<Button loading>` + primitive `<PendingSubmitButton>` ·
  propagado a "Añadir al carrito" (anti doble-clic), ProductQuickActions, toggle+flechas de
  categorías. El `<SubmitButton>` queda de patrón para el resto.
- `6244436` **Módulos:** cupones Tipo en español · finanzas sin jerga de fases · roles con
  diccionario único (`lib/admin-roles`) — antes el sidebar usaba valores de enum inexistentes.

**Pendiente (backlog de pulido, no bloqueante):** propagar el spinner a los ~50 botones
restantes (reseñas/usuarios/redirects/ocasiones server-component forms); D4 "simplificar lo
técnico" en Auditoría/Redirects/Integraciones; pulidos menores (dashboard KPI "Pedidos del
mes", inventario "↳ misma familia", ocasiones "2/5/10"). Todo con typecheck+build+smoke verde.

**Prueba GUI pendiente (Lucy):** ordenar productos por Código/Categoría + "ir a página";
editar opción (form solo, precio $, sugerencia de nombre, precio tachado); tienda con promo
por opción; cursor manito + spinners; cupones/finanzas/roles en español.

---

## Última sesión previa — 2026-06-27 (Pulido UX admin "amigable" — feedback de Lucy)

**Origen:** Lucy dio un batch de ~18 comentarios sobre el panel admin con la premisa "el
admin es importante PERO debe ser simple y amigable para mí (no soy técnica)", y pidió
aterrizarlos "a la realidad del desarrollo, tanto admin como front cliente".

**Auditoría:** workflow multi-agente (6 clusters verificados contra el código real)
→ `docs/audits/2026-06-27-admin-ux-feedback/` (00-PLAN.md + 6 clusters). Veredicto:
3 bugs reales, ~11 mejoras, 5 decisiones. Decisiones de Lucy: fotos por opción = SÍ todo
el catálogo; reordenar categorías = flechas ↑/↓; sub-categorías = SÍ; precio base = auto.

**Hechos por commit:**

- `b9aa66a` **3 bugs:** precio de opción guardaba CENTAVOS crudos (escribir "5000" → $50);
  ahora en pesos como el producto (display /100, guardar ×100). Orden de categorías sin
  desempate → menú del cliente indeterminado; ahora `[{order},{name}]` en `lib/catalog.ts`.
  Sidebar no sticky → `lg:sticky lg:top-0 lg:h-screen`.
- `d06047e` **Sprint "Admin amigable":** "Descripción corta"→"Descripción"; bot/SEO/desc
  larga colapsados (`CollapsibleDetails`, nota "Google ya funciona solo"); stock fuera del
  form full de opción (updateVariant no lo pisa); resumen de stock → desglose por opción;
  cupones con form colapsable + Cancelar; widget cupones honesto + badge "🏪 General";
  foto de portada explícita + botón "Hacer portada".
- `892343b` **Categorías D2+D3:** sub-categorías (parentId, selector "categoría madre",
  validación 1 nivel, listado en árbol indentado, badge "N sub") + reordenar con flechas
  ↑/↓ (`moveCategory` re-secuencia el grupo, robusto ante orders duplicados); fuera el
  campo manual "número de orden" (auto-asignado).
- `dd638fd` **D4 precio base auto:** `syncProductBasePrice` (= precio mínimo de las
  opciones activas) corre tras crear/editar/borrar opción; campo escondido en Avanzado.
- `0a105ba` **D6 ordenar por clic:** primitive `<SortableHeader>` (RSC, sin JS cliente) +
  migrados productos/inventario/cupones/categorías; dropdown "Ordenar por" solo en mobile.
- `8b46680` **D1 fotos por opción:** `ProductVariant.images String[]` (migración manual
  20260627090000 aplicada con `db execute` + `migrate resolve` — el shadow DB de migrate dev
  falla por pg_trgm, y db push quería dropear `rate_limit_buckets` por drift). Uploader por
  opción en admin (`variant-images.tsx` + `image-actions.ts`, herencia explicada). PDP:
  galería = fotos de la opción si tiene, si no las del producto; `key={variantId}` reinicia
  al cambiar. **OJO drift preexistente:** `rate_limit_buckets` está en la DB pero NO en el
  schema Prisma — NO usar `prisma db push` (lo dropearía); usar migraciones manuales.

**Prueba GUI pendiente (Lucy, navegador):** precio opción en pesos, desglose stock, Detalles
limpio, "Hacer portada", crear sub-categoría + flechas, ordenar por clic en encabezados,
sidebar fijo, Cancelar en cupones.

---

## Última sesión — 2026-05-11 (Fase 2 — Catálogo admin + storefront público + carrito anon)

**Origen:** Fase 1.b admin testeada 4/4, Lucy autorizó continuar a Fase 2. Esta sesión cubre todo el bloque catálogo + carrito hasta dejar el flow guest "ver → agregar → ver carrito → ajustar qty" funcionando end-to-end, listo para el siguiente paso (checkout Wompi en Fase 3).

**Hechos por commit:**

**1) Admin CRUD productos (commit `d9fab6b`):**

- `features/products/{schemas,service}.ts` separados (patrón CONVENTIONS). Schema Zod estricto: slug kebab-case, SKU `[A-Z0-9-]+`, basePrice/compareAtPrice/cost como `z.number().int().nonnegative()` (centavos COP, mandato CLAUDE.md). `ProductValidationError` clase con field tipado.
- `app/admin/productos/page.tsx`: listado paginado 20/page con búsqueda fuzzy en name/sku/slug. Sin paginación de cursor todavía (offset basta < 1k productos).
- `app/admin/productos/nuevo/page.tsx` + `[id]/page.tsx`: forms create/edit con shared `product-form.tsx`. PriceField muestra pesos al usuario, persiste centavos via hidden input + Math.round. Auto-slug desde name (slugify con NFD). Checkbox helpers, sección SEO opcional, botón "Archivar" en edit (soft-delete vía `deletedAt`).
- `actions.ts`: create/update/delete con `getCurrentAdmin()` defensivo + revalidatePath + redirect con flag (`?created=1`, `?deleted=1`).

**2) Admin CRUD categorías (commit `8714985`):**

- `features/categories/{schemas,service}.ts`. `softDeleteCategory` bloqueado si hay productos asociados (anti-orphan: el producto requiere categoryId NOT NULL).
- `app/admin/categorias/page.tsx`: tabla simple (categorías < 20) + form inline `create-category-form.tsx`. Edit-inline diferido (no es bloqueante todavía).
- Dashboard admin gana cards "Categorías" + "Productos" como "Disponible" (antes "Próximamente").

**3) Seed catálogo demo (commit `d31f037`):**

- `packages/db/scripts/seed-products.mjs`: 4 categorías (`fotoimanes`, `recorditos-eventos`, `organizate-bonito`, `calendarios`) + 8 productos (3 featured con compareAtPrice para mostrar descuentos). Idempotente: `upsert by slug`. Precios en centavos COP. SKUs estructurados (`FI-POL-G-6`, `EVT-BS-KIT`, etc).
- Makefile: `make seed-products` (en /home/ansible/workspaces/lucams-shop-local/Makefile).

**4) Storefront público (commit `c77e641`):**

- `features/products/public-service.ts` separado de admin: enforza `deletedAt:null + isActive:true` en product Y category. Tres funciones: `listStorefrontCategories`, `listStorefrontProducts({categorySlug?, featured?, limit?})`, `getStorefrontProductBySlug`. Anti-leak: nada de archivados aparece al público.
- `app/productos/page.tsx`: grid 2/3/4 cols responsive, category chips con counts, empty state kawaii con CTA.
- `app/producto/[slug]/page.tsx`: galería placeholder (gradient kawaii cuando no hay imágenes), breadcrumb, badge "Personalizable" + descuento -X%, WhatsApp deep-link con mensaje pre-armado contextual (`Hola Lucams 👋 Quiero saber más sobre "<name>" (SKU X)`), generateMetadata dinámico con seoTitle/seoDescription fallback.
- `components/product-card.tsx`: reutilizable. Hover scale, badges absolute corners.
- `lib/format.ts`: `formatCOP(centavos)` shared (`Intl.NumberFormat('es-CO', {currency:'COP'})`). Removido duplicate inline de admin.
- Home gana CTA "Ver catálogo →". Header gana link "Tienda".

**5) Carrito anon end-to-end (commit `7bfc879`):**

- **Schema-side:** `features/products/service.ts createProduct` ahora crea variant "Default" (`sku-DEFAULT`) en la misma transacción Prisma. CartItem y OrderItem requieren variantId; sin variantes admin reales todavía, el default es el path mínimo para comprar. `seed-products.mjs` backfilea variants default por producto existente (idempotente).
- **`lib/cart-session.ts`:** cookie `cart_session` con UUID v4 server-generated. HttpOnly, SameSite=Lax, Secure(prod), 30 días. **No HMAC-firmada:** 122 bits de entropía es suficiente para data efímera sin PII; documentado el trade-off en el archivo.
- **`features/cart/service.ts`:** `getCartDetail` / `getCartItemCount` / `addProductToCart` / `updateCartItemQty` / `removeCartItem` / `mergeAnonCartIntoCustomer`. Pricing snapshot al agregar (`variant.price ?? product.basePrice`). Items con producto archivado se filtran en read (el admin que archive un producto efectivamente lo saca de carritos en vuelo). MAX_QTY_PER_ITEM=99.
- **Merge inteligente al login/signup:**
  - Anon vacío + customer sin cart → noop.
  - Anon con items + customer sin cart → re-asignar anon a customer (mismo sessionId).
  - Ambos existen → fold del anon en customer cart sumando qty por variantId; **hard-delete del anon** post-merge (Cart no tiene valor de auditoría y `sessionId @unique` no respeta `deletedAt`).
  - Cookie se rota al sessionId del customer cart si era distinto.
  - Errores de merge se loggean (`cart.merge_fail`) pero NO bloquean auth.
- **`/carrito` page:** lista con qty controls (+/−), remove forms, sidebar con subtotal/total/items count, CTA checkout disabled "(próximamente)". Empty state.
- **`/producto/[slug]`:** botón "Añadir al carrito" wired al server action. Banner ✨ "Agregado" cuando vuelve con `?added=1` + link "Ver carrito →".
- **Header:** ShoppingBag icon con badge pink mostrando cartCount (cap 99+).

**Validaciones técnicas:**

- `make typecheck` OK
- `make lint` OK
- Smoke tests curl: `/productos`, `/producto/<slug>`, `/producto/no-existe` (404), `/productos?categoria=fotoimanes` (filter), `/carrito` — todos 200 con contenido esperado.

**Pendiente prueba visual por Lucy (anon + login flow + merge):**

- Anon: agregar al carrito → counter sube → ver carrito → cambiar qty → remover.
- Login con cart anon poblado → merge funcionando.
- Logout → cookie persiste, cart sigue visible (comportamiento e-commerce estándar).

**Decisiones tomadas en sesión (cocreación):**

- **Cart storage:** Postgres + sessionId cookie (vs cookie pura o Redis). Justificación: enables abandoned cart recovery emails posterior, server-authoritative, sin dependencias externas. Aliné con mandato #11 CLAUDE.md.
- **Merge policy:** suma inteligente por variantId (vs reemplaza / descarta). Mejor UX: "no perdiste nada".
- **Cookie sin firmar:** discutible; mitigado por (a) UUID alta entropía + (b) cart sin PII ni precio autoritativo. TODO: revisar si más adelante guardamos customDesign con datos personales.
- **Default variant pattern:** sin schema migration. Cada producto tiene su "Default" 1:1 hasta que existan variantes admin reales. Cuando lleguen, se reemplazan o expanden.

**Pendiente próximo turno (Fase 2 cierre + Fase 3):**

- Imágenes de productos: upload via Supabase Storage en admin form + render real en cards/detail/cart. Hasta entonces gradient kawaii como placeholder.
- Admin de variantes reales (multi-variant products).
- Estudio de personalización en vivo (react-konva) — diferenciador #1.
- Phase 3: checkout Wompi (PaymentProvider adapter + saga de pago + Venndelo logística + DIAN factura).

---

## Sesión anterior — 2026-05-11 (Fase 1.b — Admin flow + roles unificados)

**Origen:** Cerrada Fase 1.a customer, Lucy autorizó la combinación A+B (admin mínimo primero, después catálogo). Este turno implementa el admin completo.

**Hechos (commits `1b9b2c9` + `eae7740`):**

1. **`lib/auth.ts` extiende con `getCurrentAdmin()`** análogo a `getCurrentCustomer()`. Retorna AdminUser si está activo (`isActive=true, deletedAt=null`).

2. **Layout admin sobrio** (`app/admin/layout.tsx`) — slate-50 bg, `robots: noindex`, sin kawaii. Diferenciado del flow customer.

3. **`/admin/login` con server action propia** (`app/admin/login/{page,login-form,actions}.tsx`):
   - Validación Zod + rate-limit doble IP+email (estricto: 5/15min prod, vs 15/15min cliente).
   - Verifica `signInWithPassword` + AdminUser activo.
   - **Anti-enumeration:** si email+password OK pero NO admin → `signOut()` + mismo error "Credenciales incorrectas" que credenciales mal.

4. **`/admin/dashboard` con métricas** (`app/admin/dashboard/page.tsx`):
   - 4 cards (Customers / Orders / Products / Pending reviews) via `Promise.all` de `prisma.count`.
   - 3 cards "Próximamente · Fase 2/4" como placeholders de futuros CRUDs.
   - Header con email + role + botón "Ir al sitio" + logout.

5. **Gate en `proxy.ts`** (Edge-safe): `/admin/*` excepto `/admin/login` requiere sesión Supabase. La verificación AdminUser activa la hacen las pages con `getCurrentAdmin()` (Prisma no corre en Edge).

6. **`SiteHeader` muestra chip "Panel admin"** cuando el current user es admin. Solo desktop (`sm:inline-flex`).

7. **`packages/db/scripts/seed-admin.mjs`** — script idempotente. `EMAIL=x@y.com make seed-admin` promueve a SUPERADMIN un auth.user existente. Reactivación + actualización si ya existe.

8. **`packages/db/scripts/seed-test-customer.mjs`** — para testing de "user no-admin". Usa `supabase.auth.admin.createUser` con `email_confirm=true` → bypasea sandbox de Resend. Default: `test+cliente@example.com / TestCliente2026!`.

9. **Documentación de Fase 1.b en ROADMAP:** ⏸️ → 🟡 EN CURSO → ✅ (auth completo).

**Verificación end-to-end por Lucy (4/4 pruebas pasaron):**

- ✅ Prueba A: Login cliente + chip "Panel admin" en header + acceso a `/admin/dashboard` sin re-login (cookie persiste, una sola sesión multi-rol)
- ✅ Prueba B: Logout → `/admin/dashboard` redirect a `/admin/login` → login → dashboard
- ✅ Prueba C: `/admin/login` con `test+cliente@example.com` → "Credenciales incorrectas" (anti-enumeration validado)
- ✅ Prueba D: Login normal con test customer → home cliente OK + NO chip admin + intento `/admin/dashboard` → redirige a `/admin/login`

**Modelo de roles validado:**

- 1 `auth.users` row + 1 cookie sesión = 1 identidad de auth
- N tablas de rol (Customer, AdminUser) apuntan al mismo `supabaseUserId`
- Cada page pregunta por la fila de rol que necesita
- `/login` y `/admin/login` usan la MISMA sesión pero rutean según rol verificado

**Pendiente próximo turno (Fase 2):**

- Admin CRUD productos (sin esto, storefront no tiene qué mostrar)
- Storefront público `/productos` + `/producto/[slug]`
- Carrito anon vía sessionId cookie (ADR-031 guest-first)
- Categorías CRUD
- Upload imágenes Supabase Storage

---

## Última sesión — 2026-05-11 (Hardening + UX polish + cierre Fase 1 customer auth)

**Origen:** Lucy validó visualmente el flujo y empezamos a probarlo end-to-end. Durante el testing surgieron varios issues + ideas de mejora. Se cocrearon como un solo arco temático: **completar y endurecer el flow de auth customer hasta dejarlo listo para tráfico real**.

**Hechos por dominio:**

**1) Templates de email + flujo OTP:**

- Migración de Reset password de link a OTP (commit `9ef96cd`) — mismo patrón que signup, evita bug de Gmail prefetch que consume tokens.
- Reescritura de `/restablecer-password`: ahora recibe email + OTP + nueva password en una sola action (`verifyOtp` + `updateUser` + `signOut global` atómicos).
- 3 templates HTML kawaii pegados en Supabase Dashboard: Confirm signup, Reset password, Password changed. Layout tabla anidada con inline CSS (estándar email cross-client), logo desde URL absoluta Vercel, paleta brand-purple/pink/cream.
- Tracking de estado de los 13 templates Supabase Auth en nuevo `docs/EMAIL_TEMPLATES.md` (✅ personalizados / ⚠️ default / descarte por flow no implementado).

**2) Seguridad — 4 mejoras propuestas y aceptadas por Lucy (commit `88791a2`):**

- **Pwned Passwords check** (`lib/pwned-passwords.ts`): SHA-1 prefijo de 5 chars → HaveIBeenPwned API gratis con k-anonymity. Bloquea registro/reset si la contraseña aparece en breaches conocidos. Fail-open si HIBP cae. Smoke-test: `password123` detectada con 2.25M de breaches.
- **signOut global al cambiar password** (`scope: 'global'`): invalida todas las refresh tokens del user en otros devices. Si alguien robó la contraseña, cambiarla lo echa de TODO.
- **Rate-limit doble IP + email** (`lib/rate-limit-keys.ts`): email se hashea con SHA-256 truncado (no aparece en claro en buckets). Cubre botnet (muchas IPs ↔ 1 email) Y atacante con muchos emails desde 1 IP. Cabled en signup/login/reset-password/verify-recovery.
- **Eventos `security.*` estructurados** en logger pino (login.success/fail, pwned.signup_block/reset_block/api_fail, password.reset_success con flag globalSignOut).
- Lucy preguntó por **anti-reutilización de últimas N contraseñas**. Análisis honesto: alto costo operacional (PasswordHistory paralela + bcrypt.compare) vs beneficio marginal vs Pwned Passwords. Decidido NO implementar y se documentó la decisión en `docs/SECURITY.md`.

**3) UX hardening:**

- **Confirm password en `/restablecer-password`** (paridad con signup, Zod `.refine()` + validación inline cliente).
- **`<EmailInput>` component** (`apps/web/components/email-input.tsx`): dropdown de 8 dominios populares cuando user tipea `lucy@gma...`, validación HTML5 pattern más estricta que el default `type="email"` (requiere TLD 2-24 chars), animación fade-in slide-from-top. Cabled en /registro, /login, /recuperar-password. Lucy verificó visualmente en web + móvil.
- **EmailInput justificación:** mejora UX sin reemplazar Zod server-side. Server valida independientemente.

**4) Brand assets reales:**

- Lucy subió `apps/web/public/brand/lucams-logo.png` (468×468 RGBA, 256KB en repo → ~5KB WebP servido al browser via Next.js Image optimizer).
- BrandMark unificado: usa el mismo `lucams-logo.png` en TODOS los headers + hero. Tamaños 56px (storefront/mi-cuenta), 72px (auth pages), 180px (hero home).
- Decisión cocreada con Lucy: descartado el mascot-only crop después de probarlo — un solo asset es más simple de mantener.
- `<RaccoonFace />` SVG kawaii custom queda como **fallback defensivo** del `<LucamsLogo />` (se renderea solo si el archivo PNG no carga).

**5) Bugs y fixes encontrados durante testing:**

- **Trigger SQL sync auth.users → Customer descartado** (commit `c62174b`): la Supabase Auth API HTTP falla con 500 cuando hay cualquier trigger custom en auth.users que toque schema public. Documentado todo en `supabase/migrations/00000000000004_sync_auth_users_delete.sql` (comentario largo con TODAS las cosas que probamos sin éxito) — historia para que nadie pierda tiempo intentando lo mismo. Reemplazo: `FORCE=1 make seed-clean` script (`packages/db/scripts/seed-clean.mjs`) hace cleanup explícito Customer + AdminUser + auth.users.
- **CSP `upgrade-insecure-requests` en dev** rompía estilos en http://192.168.20.180:3000 (LAN IP no tiene HTTPS). Fix: gate en `IS_PROD_DEPLOY` (commit `b264c79`). Estilos solo se rompen en `http` cuando es dev/preview, en producción Vercel sigue con HSTS.
- **Chrome/Linux sin Noto Color Emoji** renderea emojis como "ND GLYPH". Fix: reemplazar todos los emojis renderizados al cliente por SVG inline o lucide-react icons (commits `13fde9d`, `ddf58f9`). Emojis solo en comentarios de código.
- **Next.js 16 bloquea HMR desde IP LAN** por safety. Fix: `allowedDevOrigins: ['192.168.20.180','localhost','127.0.0.1']` en `next.config.ts` (commit `93f5ee8`).
- **OTP 8 dígitos vs form maxLength=6**: form muy estricto bloqueaba escribir el código completo. Fix: maxLength=10 + pattern `\d{6,10}` + Zod regex idem (commit `1157ff0`).
- **Rate-limit email demasiado estricto durante pre-launch** (3/h colaba a Lucy testeando). Fix: bajar email bucket a igualar el de IP (commit `88ae83e`). Anotado TODO para apretar al lanzar real.

**6) Verificación end-to-end por Lucy:**

- ✅ Signup con Pwned check, OTP de email, confirmación de cuenta, redirect a home con header logged-in.
- ✅ Login con email autocomplete dropdown, caps lock alert, password toggle.
- ✅ Logout, vuelta a anónimo.
- ✅ Recuperar password → email con OTP kawaii → restablecer-password con OTP + nueva password + confirm.
- ✅ Reentrar con nueva password tras signOut global.
- ✅ Visual en Chrome + Firefox + móvil 375px — todos OK.

**Pendientes administrativos cerrados en este turno:**

- STATE.md actualizado.
- ROADMAP.md: marcar Fase 1.a customer-side como completa.
- Optimización PNG: descartada — Next.js Image optimizer ya entrega 5KB WebP en lugar del PNG raw de 256KB (verificado con curl).

**Próximo bloque (acordado con Lucy via AskUserQuestion):**

- **Fase 1.b admin flow mínimo** (`/admin/login` + `/admin/dashboard` + gate `proxy.ts` para `/admin/*` + seed primer AdminUser via SQL).
- Después: **Fase 2 catálogo público + carrito anon** (guest-first per ADR-031: listing de productos, página de producto, carrito vía sessionId cookie, integración con stock realtime).

---

## Última sesión — 2026-05-10 (flujo cliente AUTH COMPLETO — callback, reset, logout, mi-cuenta, header)

**Origen:** Lucy aprobó visualmente el batch anterior y preguntó "¿este login es para admins o cómo va a funcionar?". Eso disparó decisión arquitectónica formalizada en **ADR-030: URLs separadas para cliente (`/login`) vs admin (`/admin/login`)**. Confirmó vía AskUserQuestion: (a) completar primero flujo cliente, (b) URLs separadas. Procedí en autónomo a cerrar el flujo cliente completo.

**Hechos (commit `5bdd81d`):**

1. **`lib/auth.ts`** — helpers server-side:
   - `getCurrentUser()`: `supabase.auth.getUser()` (no `getSession()` para authz — Supabase docs explicit).
   - `getCurrentCustomer()`: join con tabla `Customer` vía Prisma `findFirst` (no `findUnique` porque combina `supabaseUserId` + `deletedAt: null`). Devuelve null si no hay sesión o no hay Customer row o soft-deleted.

2. **`/auth/callback`** route handler — URL a la que apuntan los emails de Supabase (signup confirmation, password recovery). Lee `?code`, llama `exchangeCodeForSession` (escribe cookies vía el adapter), redirige según `?type`: `recovery` → `/restablecer-password`, otro → `/`. Errors → `/login?error=link-invalido|link-expirado`.

3. **`/restablecer-password`** — página protegida (redirect si no hay sesión temporal del recovery flow). Form con un único password field (min 8). Action: `supabase.auth.updateUser({password})` + `signOut()` para forzar re-login limpio. Redirect `/login?reset=ok` con banner success.

4. **`/auth/logout`** — server action que llama `signOut()` y redirige a `/`. Usable desde cualquier `<form action={logoutAction}>`. Logs `auth.logout.success`.

5. **`/mi-cuenta`** — página protegida (redirect a `/login?next=/mi-cuenta` si no hay sesión Customer). Muestra perfil: nombre, email, teléfono, puntos Lucams, código de referido. Lista secciones pendientes (órdenes, direcciones, etc.). Botón "Cerrar sesión" en header propio.

6. **`SiteHeader` (`components/site-header.tsx`)** — Server Component async. Logged-out: links a `/login` + button primary a `/registro`. Logged-in: "Hola, {firstName}" + botón logout. Integrado en `/` (home).

7. **`/login` page** — reescrita como async para leer `searchParams` (Next 16 async). Mapea `?error=link-invalido|link-expirado` y `?reset=ok` a banners (rojo / verde) que se muestran arriba del form. `LoginForm` acepta `initialError`/`initialSuccess` props.

**Verificaciones:**

- typecheck + build ✓ — 10 rutas (`/`, `/_not-found`, `/api/health`, `/api/health/db`, `/auth/callback`, `/login`, `/mi-cuenta`, `/recuperar-password`, `/registro`, `/restablecer-password`) + Proxy middleware.
- Local: rutas públicas 200, protected → 307 con redirect correcto.
- Producción Vercel: mismas verificaciones, todo OK.

**ADR-030 — Separación URLs cliente vs admin (`docs/DECISIONS.md`):**

- Decisión: URLs separadas (no login único con role-check).
- Razones: superficie de ataque, UX clara, branding distinto, authorization granular, no risk de admin self-registration.
- Trade-off: pequeña duplicación de código aceptable; se puede extraer `<AuthCard>` compartido si crece.

**ACCIONES HUMANAS pendientes para que Auth funcione real:**

1. **Supabase Dashboard → Authentication → URL Configuration:**
   - Site URL: `https://lucams-shop.vercel.app`
   - Additional Redirect URLs: `https://lucams-shop.vercel.app/**`, `http://localhost:3000/**`
2. **Prueba GUI end-to-end** del flujo completo (signup real + email confirm + login + mi-cuenta + logout + forgot + reset).
3. (Opcional) Customizar Email Templates en Supabase Dashboard, o migrar a Resend SMTP en próxima fase.

**Próximos bloques Fase 1:**

- **Admin flow** — `/admin/login` (sin registro público) + `/admin/dashboard` + gate `proxy.ts` para `/admin/*` + seed primer AdminUser via Supabase + Prisma manual. **Sin GUI shadcn kawaii — usar layout más sobrio/utilitario para admin** per ADR-030.
- Email template customization Resend SMTP.
- Customer profile editing (cambiar nombre, teléfono, contraseña).
- Right to deletion Ley 1581 art. 8 (soft delete Customer + `supabaseService.auth.admin.deleteUser`).
- Audit middleware Prisma `$extends` para auto-fill `createdBy`/`updatedBy`.

---

## Última sesión — 2026-05-10 (Auth flow básico — primera UI visible Lucams)

**Origen:** Lucy pidió continuar con el enfoque de magneticas.cl como referencia funcional. Implementé Auth flow básico (login/registro/recuperar-password) con identidad Lucams REAL (no shadcn genérico).

**Hechos:**

1. **Estudio competitivo:** WebFetch a magneticas.cl. Patrones detectados (`/account/login`, `/account/register`): email + contraseña sin social login ni "remember me", links a forgot-password + register, tono cálido emocional, layout centered card, identidad minimalista blanca.

2. **shadcn components instalados** vía `pnpm dlx shadcn add`: button, card, input, label (style `radix-nova`).

3. **`app/(auth)/layout.tsx`** (commit `ca1d73e`) — layout dedicado para auth. Gradiente `brand-cream → white → brand-purple/10`, wordmark "Lucams + shop" en Fredoka con colores brand, footer con link a WhatsApp `+57 320 887 3826`. **Opuesto al minimalismo blanco de magneticas** — fondo cálido kawaii.

4. **`/login`** — Card con título "Bienvenida de vuelta" en Fredoka brand-purple-dark + Input email/password + button primary brand-purple + links a /recuperar-password (text-brand-pink) y /registro. Server action `loginAction` valida con Zod, rate-limit `login:<ip>` 5/15min, llama `supabase.auth.signInWithPassword`. Error genérico al cliente (no enumera cuentas) + log estructurado con código.

5. **`/registro`** — Card con título "Crea tu cuenta Lucams" + grid 2-cols nombre/apellido + email + password (min 8) + texto de consentimiento Ley 1581. Server action `signupAction` con saga: (a) Zod, (b) rate-limit `signup:<ip>` 3/hora, (c) `supabase.auth.signUp`, (d) `prisma.customer.create` con `supabaseUserId` + `referralCode` (`LCS-<8hex>`) + audit `createdBy=userId`. Compensación en falla (4): `supabaseService.auth.admin.deleteUser` para no dejar huérfanos. Muestra "Te enviamos un correo para confirmar" inline si Supabase devuelve `session: null`; si confirmación está apagada, redirect a `/`.

6. **`/recuperar-password`** — Card con email field. Server action `recuperarPasswordAction` con rate-limit `reset-password:<ip>` 3/hora. **SIEMPRE devuelve success genérico** independiente de si el email existe (mitigación de account enumeration). Llama `supabase.auth.resetPasswordForEmail`.

7. **Patrón React 19 `useActionState`** en los 3 form components para mostrar errores inline + estado pending sin redirect roundtrip. `aria-invalid` + `aria-describedby` para a11y básica.

8. **Eventos de logger estructurados:**
   - `auth.login.{success,fail,rate_limited}`
   - `auth.signup.{success,auth_fail,customer_create_fail,rollback_fail,rate_limited}`
   - `auth.reset.{sent,fail,rate_limited}`

**Verificaciones:**

- typecheck + build ✓ (7 rutas: home, login, registro, recuperar-password, /api/health, /api/health/db, \_not-found + Proxy).
- Local: HTTP 200 en `/login`, `/registro`, `/recuperar-password`. HTML inspection confirma headings, buttons, links, wordmark.
- Producción Vercel `ca1d73e`: las 6 URLs públicas en HTTP 200.

**⚠️ ACCIONES HUMANAS PENDIENTES para que Auth funcione end-to-end:**

1. **Supabase Dashboard → Authentication → URL Configuration:**
   - Site URL: `https://lucams-shop.vercel.app`
   - Additional Redirect URLs: `https://lucams-shop.vercel.app/**`, `http://localhost:3000/**`

2. **Email Templates** (opcional pero importante para identidad): Authentication → Email Templates. Por default Supabase manda emails en inglés genéricos. Customizar para español + tono Lucams, O esperar a integración Resend (próxima fase).

3. **Prueba visual del flujo** en navegador (ver bloque GUI suggested abajo).

**🔍 PRUEBA VISUAL pendiente** — el flujo es la primera UI visible de Lucams. Hay que validar visualmente que el branding queda Lucams (kawaii) y no genérico shadcn.

**Pendiente Fase 1 (próximos bloques):**

- **Audit middleware** Prisma `$extends` para auto-fill `createdBy`/`updatedBy` desde sesión actual.
- **Reset-password callback** — la página que recibe el link del email y permite establecer nueva contraseña (`/establecer-password` o similar).
- **Logout** — server action que llama `supabase.auth.signOut()`.
- **Customer profile page** (`/mi-cuenta`) — magneticas pattern.
- **Header logged-in vs logged-out** — depende de helper `lib/auth.ts` (función `getCurrentUser()` server-side).
- **Email confirmation callback** — Supabase emails apuntan a una URL que debemos implementar para hacer `exchangeCodeForSession`.
- **Email templates Resend SMTP** — sustituir los defaults de Supabase para tener brand consistente.

---

## Última sesión — 2026-05-10 (datalayer completo: 20 modelos + migración + RLS + rate-limit)

**Origen:** Lucy autorizó "procede con todo" tras el cierre del datalayer foundation. Ejecuté schema completo + migración + RLS + rate-limit en una pasada autónoma.

**Hechos:**

1. **Schema expansion** (commit `e572ebf`) — `packages/db/prisma/schema.prisma` extendido de 5 a **20 modelos** + 5 enums (AdminRole, OrderStatus, PaymentMethod, CouponType, WebhookSource). Modelos añadidos: AdminUser, InventoryLog, Cart, CartItem, Order, OrderItem, Coupon, Review, AbandonedCart, LoyaltyTxn, Referral, BlogPost, WebhookEvent, StockReservation, AdminActionLog. Audit fields uniformes en mutables; append-only logs solo con createdAt. Foreign-key cascade rules explícitas por modelo per `docs/CONVENTIONS.md` (Cascade/SetNull/Restrict según semántica). Indexes en `(deletedAt)` + columnas de lookup.

2. **dotenv-cli** (commit `e572ebf`) — añadido como devDep en `packages/db/`. Scripts `db:migrate`/`db:push`/`db:studio` envueltos con `dotenv -e ../../.env.local --` porque Prisma solo lee `.env` por defecto. `postinstall: prisma generate` sigue sin envolverlo porque no necesita DB.

3. **Migración inicial aplicada** (commit `e572ebf`) — `pnpm --filter @lucams/db db:migrate --name init` ejecutó contra Supabase (aws-1-us-east-2.pooler.supabase.com, schema `public`). Migración guardada en `packages/db/prisma/migrations/20260510203116_init/`. Las 20 tablas existen ahora en la DB de producción.

4. **RLS policies** (commit `e572ebf`) — `supabase/migrations/00000000000002_rls_policies.sql` aplicado via `prisma db execute --file ...`:
   - `ENABLE ROW LEVEL SECURITY` en las 20 tablas Prisma.
   - **Catálogo público:** Category/Product/ProductVariant/Review (approved)/BlogPost (published) → SELECT abierto a `anon`+`authenticated` con filtros de visibilidad (`isActive`/`isApproved`/`isPublished`+`deletedAt IS NULL`).
   - **Customer-owned (via `auth.uid()::text = Customer.supabaseUserId`):** Customer (SELECT/UPDATE), Address (ALL), Cart+CartItem (ALL para carros con customer; anon carts vía service_role), Order+OrderItem (SELECT), LoyaltyTxn (SELECT), Review (INSERT propio → moderación).
   - **Deny-by-default (RLS sin policies):** AdminUser, InventoryLog, Coupon, AbandonedCart, Referral, WebhookEvent, StockReservation, AdminActionLog. Solo `service_role` los toca (bypasea RLS).
   - SQL idempotente: cada CREATE POLICY precedido por DROP POLICY IF EXISTS.

5. **Rate limit Postgres** (commit `002eff1`, ADR-016):
   - `supabase/migrations/00000000000003_rate_limit.sql`: tabla `rate_limit_buckets` (snake_case, no-Prisma) + función SQL `rate_limit_check(key, limit, window_seconds)` con `INSERT...ON CONFLICT` atómico que increment + reset por ventana. RLS habilitada deny-by-default; solo service_role accede.
   - `apps/web/lib/rate-limit.ts`: wrapper `rateLimit(key, limit, windowSeconds)` via `prisma.$queryRaw`. `import 'server-only'`. Fail-open si la función no devuelve filas (defensa).
   - **Smoke test end-to-end verificado:** 3 calls con limit=3 → `allowed: true` (count 1/2/3); 4ta call → `allowed: false` (count 4); reset_at consistente; cleanup OK.

**Verificación final producción Vercel:**

- home → 200
- `/api/health` → version `002eff1d...` (último commit)
- `/api/health/db` → 338ms latencyMs (mejoró desde 452ms — Prisma client warm cache)
- Schema migrado, RLS activo, rate-limit funcional, todos los endpoints verificados.

**Decisiones técnicas tomadas en el camino:**

- Audit fields solo en mutables (skip en append-only logs como InventoryLog/LoyaltyTxn/etc.).
- Carts anónimos NO via RLS — pasan por service_role en server-side. Más simple y seguro.
- Rate-limit fail-open por defecto si SQL devuelve no-rows (mejor permitir que bloquear sin razón).
- Cleanup automático de buckets via pg_cron diferido hasta que pg_cron esté activado en Supabase.

**Bloque GUI evitado intencionalmente:** Auth flow (login/register) requiere componentes shadcn + pruebas visuales en navegador. Lo dejé para próximo turno cuando Lucy pueda validarlo. Este turno fue 100% backend → ninguna prueba GUI necesaria.

**Pendiente Fase 1 (próximos bloques):**

- **Audit fields middleware** — Prisma `$extends` que auto-llena `createdBy`/`updatedBy` desde la sesión Supabase actual (lee del cookie store del request).
- **Auth flow** (NEEDS GUI) — `/login` + `/register` con shadcn UI + Supabase Auth + server actions. Incluye rate-limit en endpoints de auth.
- **Webhook handler genérico** con idempotencia via tabla `WebhookEvent` (cuando se conecten Wompi/Venndelo en Fase 4/5).
- **pg_cron jobs** (cuando se active la extensión): cleanup rate_limit_buckets + cart-recovery emails + stock reservation expiry.

---

## Última sesión — 2026-05-10 (datalayer foundation: packages/db + /api/health/db)

**Origen:** Lucy pidió continuar autónomo + dos reglas nuevas: "marcar acciones que requieren humano" (ya guardada en sesión previa) + "recordar pruebas GUI cuando aplique".

**Hechos:**

1. **`packages/db/`** creado como workspace package `@lucams/db` (commit `e9d25d8`):
   - `prisma/schema.prisma` con los 5 modelos CORE: `Customer`, `Address`, `Category`, `Product`, `ProductVariant`. Audit fields uniformes por modelo (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`, `deletedBy`) per `docs/CONVENTIONS.md`. Foreign-key cascade rules explícitas (Customer.referredBy → SetNull, Address.customer → Cascade, Category.parent → Restrict, Product.category → Restrict, ProductVariant.product → Cascade). Indexes en `(deletedAt)` y columnas de lookup.
   - `src/index.ts` con `PrismaClient` singleton + global cache (sobrevive HMR de Next sin fugar conexiones).
   - `postinstall: prisma generate` en package.json — clave para que el client se regenere en Vercel build.
   - **Bug resuelto:** quité `output` custom del generator. Con un output custom, `apps/web` no resolvía `@prisma/client` por pnpm hoisting. Dejándolo al default, Prisma lo genera en `node_modules/.pnpm/...` y todos los workspaces lo ven.
   - Aprobé build scripts de `prisma`, `@prisma/client`, `@prisma/engines` en `pnpm-workspace.yaml`.

2. **`apps/web/lib/db.ts`** re-exporta `prisma` + tipos desde `@lucams/db`. `import 'server-only'` enforced — Prisma jamás runtime cliente.

3. **`apps/web/app/api/health/db/route.ts`** — Postgres connectivity probe. Ejecuta `prisma.$queryRaw\`SELECT 1\``, devuelve `{status, check, latencyMs, timestamp}`. On error: log estructurado (`event: 'health.db.fail'`) + RFC 7807 `InternalError`500 vía`problemResponse`. `force-dynamic`+`runtime: 'nodejs'`.

**Verificaciones:**

- Local: `/api/health/db` 200 con latencyMs 1800-4400ms (Bogotá→Supabase US).
- Producción Vercel: 452ms — confirma que postinstall hook ejecutó `prisma generate` en build y que `DATABASE_URL` + `SUPABASE_SECRET_KEY` en Vercel env vars están bien configurados.
- typecheck + build pasaron en ambos contextos. Build output ahora muestra 5 rutas (`/`, `/_not-found`, `/api/health`, `/api/health/db`, + Proxy middleware).

**Memoria nueva guardada:**

- `feedback_gui_test_reminder.md` — Cuando un cambio toque UI/UX (storefront, branding, emails, studio canvas), recordar a Lucy probar visualmente en navegador. Backend puro (lib/\*, API JSON, infra) no requiere recordatorio. Este turno fue 100% backend → ninguna prueba GUI necesaria.

**Pendiente Fase 1 (siguiente bloque):**

- Resto de modelos Prisma de `docs/ARCHITECTURE.md`: `Cart`, `CartItem`, `Order`, `OrderItem`, `Coupon`, `Review`, `InventoryLog`, `AdminUser`, `AbandonedCart`, `LoyaltyTxn`, `Referral`, `BlogPost`, `WebhookEvent`, `StockReservation`, `AdminActionLog`.
- `supabase/migrations/*.sql` para RLS policies (Prisma no las maneja).
- Audit fields middleware (auto-fill `createdBy`/`updatedBy` desde sesión).
- `prisma migrate dev` para crear las tablas en Supabase y commitear la migration generada.
- `lib/rate-limit.ts` Postgres-based (ADR-016).
- Auth flow básico (`/login`, `/register` con Supabase Auth).

---

## Última sesión — 2026-05-10 (capa transversal Fase 1: errors + logger + Supabase + proxy)

**Origen:** después de cerrar el deploy de Vercel, Lucy pidió continuar Fase 1 en autonomía. Implementé en una pasada todas las utilidades transversales que el resto del código va a usar.

**Hechos:**

1. **`lib/errors.ts`** (commit `b09477c`) — RFC 7807 Problem Details. `AppError` base + 8 subclases (`Validation`, `NotFound`, `Unauthorized`, `Forbidden`, `Conflict`, `Unprocessable`, `TooManyRequests`, `InternalError`). `problemResponse()` convierte error → `Response` con `application/problem+json`. Adaptado a Zod v4: usa `z.flattenError()` (la API `error.flatten()` v3 está deprecada).

2. **`lib/request-id.ts`** (commit `b09477c`) — UUID v4 propagado vía `AsyncLocalStorage` (Node API). `withRequestId(id, fn)` envuelve handlers, `getRequestId()` lee desde cualquier código aguas abajo sin pasar el ID explícito.

3. **`lib/logger.ts`** (commit `b09477c`) — `pino` con redact paths cubriendo secretos por patrón (`*Key`, `*Secret`, `*Token`), headers sensibles (`auth`, `cookie`), y PII directa (`email`, `phone`, `password`). JSON crudo en producción (Vercel logs lo parsea), `pino-pretty` en dev.

4. **`lib/supabase/{browser,server,service}.ts`** (commit `039ab76`) — 3 clientes con privilegios distintos:
   - `browser.ts`: `createBrowserClient` con publishable key → rol Postgres `anon` con RLS.
   - `server.ts`: `createServerClient` con publishable key + adapter `getAll/setAll` para cookies (Next.js 16 `await cookies()`). Try/catch silencioso en setAll porque Server Components no pueden mutar cookies — proxy.ts maneja refresh.
   - `service.ts`: secret key → rol `service_role`, bypassa RLS, `import 'server-only'` enforce. Reservado para webhooks, jobs, admin scripts.

5. **`proxy.ts`** (commit `779deae`) — middleware Next 16 (renombrado de `middleware.ts`, edge runtime no soportado). Cuatro responsabilidades en orden:
   - Generar `X-Request-Id` (UUID v4), exponerlo en response — incluso en 403.
   - Refrescar sesión Supabase con `getAll/setAll` adapter + `getUser()` trigger.
   - CORS allowlist para `/api/*`: lucamsshop.co + www + `*.vercel.app` previews + (dev) localhost. Origen no permitido → 403.
   - Security headers: HSTS (2y), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera/mic/geo denegados), X-DNS-Prefetch-Control on, Content-Security-Policy completa (Wompi/Cloudflare/Supabase/Venndelo/Anthropic en allowlists; nonces diferidos).

**Verificaciones:**

- `pnpm --filter web typecheck` ✓ y `build` ✓ en cada commit (4 rutas, 0 warnings, build con `ƒ Proxy (Middleware)` confirmado).
- Local: `curl -I http://localhost:3000/` muestra 7 headers de seguridad + X-Request-Id. CORS bloquea `Origin: https://evil.com` → 403 con X-Request-Id presente.
- Producción Vercel: deploys exitosos `b09477c → 039ab76 → 779deae`. Headers de seguridad confirmados con `curl -I https://lucams-shop.vercel.app/`.

**Decisiones técnicas en el camino (sin necesidad de ADR):**

- Zod v4 (`z.flattenError`) sobre v3 (`err.flatten()`).
- `pino-pretty` solo en dev vía `transport.target` con guard `isDev`.
- Errores de dominio (`payment-declined`, `shipping-unavailable`, `webhook-signature-invalid`) diferidos a sus features (no en `lib/errors.ts` genérico).
- `proxy.ts` matcher excluye `_next/static`, `_next/image`, fonts, imágenes — no necesitan headers/cookies.
- Bug encontrado al escribir comments JSDoc: `*/` literal (en `app/api/*/route.ts`) cierra el block comment. Corregido reformulando.

**Memoria nueva guardada:**

- `feedback_flag_human_required.md` — cuando una tarea requiera acción humana (UI dashboards, cuentas, rotación, pagos), prefijar con `**ACCIÓN HUMANA REQUERIDA:**` y separarlo del análisis técnico. Razón: en sesiones previas Lucy se quedó esperando sin saber si yo trabajaba o si ella tenía que hacer algo.

**Pendiente Fase 1:** `packages/db` (Prisma schema + audit fields + RLS policies) → `lib/rate-limit.ts` (Postgres-based, ADR-016) → `/api/health/db` (healthcheck Postgres) → posiblemente auth flow básico.

---

## Última sesión — 2026-05-10 (debug + fix de Vercel deploy productivo)

**Origen:** después de cerrar el scaffolding local, push a Vercel devolvía HTTP 404 en home y `/api/health` durante 2.5+ minutos. Build aparecía como "Deployment Failed".

**Diagnóstico contra doc oficial Vercel (actualizada 2026-03-17):**

1. **Auditoría de config Vercel UI:** Root Directory = `apps/web` ✓, "Include files outside" = Enabled ✓, Node 24.x ✓. **Pero Framework Preset = "Other"** (debió ser Next.js).
2. **Auditoría de `vercel.json`:** estaba en `/vercel.json` (repo root). La doc dice _"This file should be created in your project's root directory"_ — y "project's root directory" en Vercel = el Root Directory configurado, NO el repo root. **Por eso Vercel ignoraba el archivo entero** y `framework: "nextjs"` no aplicaba.
3. **Webhook GitHub→Vercel funcionaba**, los pushes sí disparaban deploys (verificado con `git ls-remote` y `91eea18` apareciendo en lista). El problema NO era de tracking de branch.

**Fix aplicado (commit `62a83ae`):**

- `git mv vercel.json apps/web/vercel.json`
- Simplificado a solo `{"$schema": ..., "framework": "nextjs"}`
- Removido `outputDirectory` (auto-derivado cuando framework=nextjs) y `ignoreCommand` (paths se romperían con la nueva ubicación; "Skip deployments unaffected" del UI lo cubre).

**Resultado:**

- Build exitoso en 25s. `Detected Next.js version: 16.2.6` confirmado en log.
- Producción: `https://lucams-shop.vercel.app/` → HTTP 200, `/api/health` → JSON con `version: "62a83aea..."`, `environment: "production"`.
- Build cache creado para acelerar próximos deploys.
- Decisión registrada como **ADR-027** en `docs/DECISIONS.md`.

**Lección clave para futuro:** En monorepos Vercel con Root Directory configurado, **`vercel.json` vive en el Root Directory**, no en el repo root. La frase "project's root directory" en la doc es ambigua y confunde.

---

## Última sesión — 2026-05-09 (segunda iteración: productive readiness)

**Origen:** el usuario reframea — "lo de la primera sesión es el piso, no el techo. Para productivo falta más". Lanza segunda auditoría completa.

**Hechos:**

1. **Verificaciones contra fuentes oficiales** (mandato #9):
   - DIAN facturación electrónica: Resolución 165/2023, sanciones 1% ingresos / 950 UVT ([DIAN — Obligados](https://www.dian.gov.co/impuestos/sociedades/Paginas/obligadosfacturar.aspx)).
   - Ley 1480 art. 47: 5 días hábiles retracto, 15 días reembolso, **exclusión por personalización** ([Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306)).
   - RFC 7807 Problem Details: schema y campos verificados ([RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807)).
   - STRIDE: definiciones textuales de las 6 categorías ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)).
   - Tailwind v4 `@theme` directive: sintaxis confirmada ([tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme)).

2. **Auditoría productive readiness:** 43 hallazgos clasificados en 9 bloqueantes + 21 importantes + 13 nice-to-have. Documento en [`docs/audits/2026-05-09-productive-readiness-audit.md`](audits/2026-05-09-productive-readiness-audit.md).

3. **4 documentos nuevos creados:**
   - **[`docs/CONVENTIONS.md`](CONVENTIONS.md)** — patrones FE+BE+DB, naming, error format RFC 7807, capa de servicio, **saga pattern**, idempotency keys, migration strategy expand-then-contract, indexing, soft delete + audit fields, FK cascade, retention, resiliencia (timeouts/retry/circuit breaker), logging con request ID.
   - **[`docs/OBSERVABILITY.md`](OBSERVABILITY.md)** — SLOs cuantitativos, SLIs, error budgets, dashboards, alertas accionables, postmortem process, métricas custom.
   - **[`docs/COMPLIANCE.md`](COMPLIANCE.md)** — Ley 1581 con tabla `Consent` versionada, Ley 1480 (retracto art. 47 con `RetractRequest` schema, garantía art. 7-15, reversión pago art. 51), DIAN facturación electrónica con `InvoiceProvider` interface, IVA y retenciones, subprocesadores, calendario de cumplimiento.
   - **[`docs/TESTING.md`](TESTING.md)** — pirámide, mock vs real, tests RLS automatizados, E2E con Playwright, visual regression, accesibilidad automatizada, performance/load (k6), smoke tests post-deploy, coverage targets.

4. **5 documentos expandidos:**
   - **`SECURITY.md`** — STRIDE aplicado a 4 flujos críticos (registro/login, checkout, estudio, jobs), IRP con runbooks por escenario (4 IRPs concretos), clasificación de datos formal, cookie consent banner con código de implementación.
   - **`ARCHITECTURE.md`** — sección "Patrones cross-cutting" referenciando CONVENTIONS + nota sobre audit fields auto-aplicados.
   - **`INTEGRATIONS.md`** — Sección 7 DIAN provider (`InvoiceProvider` interface + flujo emisión + notas crédito) + Sección 8 Resiliencia compartida (tabla timeouts/retries/circuit breakers por integración) + Sección 9 Background jobs renumerada.
   - **`OPERATIONS.md`** — DevOps strategy (branching trunk-based, releases CD + canary, environments, feature flags con comparación de proveedores) + DR (RPO/RTO + procedimiento + drills cuatrimestrales con calendario).
   - **`ROADMAP.md`** — tareas distribuidas en cada fase con subsecciones "productive readiness audit": Fase 1 (patrones cross-cutting + observabilidad), Fase 2 (estados UI + visual regression), Fase 3 (security upload), Fase 4 (saga + retracto + cookie banner + idempotency), Fase 5 (feature flags + email lifecycle), Fase 6 (audit log admin + MFA + garantía), Fase 7 (DIAN + threat model + pen test + DR drill + IRP).

5. **Decisiones nuevas a tomar (ADRs futuros):**
   - ADR-025: proveedor DIAN (Alegra / Siigo / Facture) — antes de Fase 7.
   - ADR-026: proveedor de feature flags (sugerencia: GrowthBook cloud Free) — antes de Fase 5.
   - ADR-027: necesidad de staging environment — re-evaluar post-lanzamiento.

---

## Última sesión — 2026-05-09 (primera iteración: coherencia + endurecimiento productivo)

**Alcance:** carga de contexto inicial + auditoría de coherencia + endurecimiento productivo de toda la documentación.

**Hechos:**

1. **Auditoría de coherencia** completa de los 7 documentos del proyecto. 21 hallazgos detectados, registrados en [`docs/audits/2026-05-09-coherence-audit.md`](audits/2026-05-09-coherence-audit.md). H5 retirado tras verificación contra Wompi docs.
2. **Verificación contra fuentes oficiales** de las afirmaciones técnicas críticas:
   - Wompi: `2.65% + $700 + IVA` confirmado ([wompi.com/es/co/planes-tarifas](https://wompi.com/es/co/planes-tarifas/)).
   - Tarjeta sandbox `4242 4242 4242 4242` confirmada ([docs.wompi.co](https://docs.wompi.co/en/docs/colombia/datos-de-prueba-en-sandbox/)).
   - shadcn/ui soporta Tailwind v4 + React 19 en producción ([ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4)).
   - Vercel KV deprecado desde dic-2024, migrado a Upstash ([vercel.com/docs/redis](https://vercel.com/docs/redis)).
   - Upstash Free: 500K cmd/mes + 256 MB ([upstash.com/pricing](https://upstash.com/pricing)).
   - Supabase Queues = pgmq, durable, exactly-once ([supabase.com/docs/guides/queues](https://supabase.com/docs/guides/queues)).
3. **6 decisiones nuevas cerradas** (ADRs 014–019):
   - **ADR-014** — Reserva de stock al `PENDING_PAYMENT` con TTL 15 min + descuento al `PAID`.
   - **ADR-015** — Tailwind v4 + React 19 (alineado con default oficial de shadcn/ui).
   - **ADR-016** — Rate-limit y cache en Postgres + `pg_cron`, sin proveedor externo. Migrar solo si p95 > 50 ms.
   - **ADR-017** — Background jobs en Supabase Queues (`pgmq`) + `pg_cron`, no Vercel Cron.
   - **ADR-018** — Mandato "argumentación obligatoria, sin suposiciones".
   - **ADR-019** — Traceability inter-sesión vía `docs/STATE.md` y `docs/audits/`.
4. **Documentos creados:**
   - `docs/STATE.md` (este archivo).
   - `docs/SECURITY.md` (fuente única de seguridad: RLS, CORS, headers, rate limit, RBAC, validación, secrets, CSP, TTLs, file upload, audit logs).
   - `docs/audits/2026-05-09-coherence-audit.md` (auditoría inicial).
   - `.gitignore` exhaustivo en raíz del repo.
   - `.env.example` con todas las variables placeholder.
5. **Documentos actualizados:**
   - `CLAUDE.md` — estado, monorepo en mandato #3, mandatos #9 (argumentación), #10 (VM dedicada), #11 (background jobs en Supabase), #12 (seguridad por defecto). Lectura mínima incluye STATE.md y SECURITY.md.
   - `ROADMAP.md` — Fase 0a marcada completa con fecha; Fase 0b/1 actualizadas (sin Upstash, con `pgmq` + `pg_cron`, healthchecks, Turnstile).
   - `PLAN.md` — comisión Wompi completa, política stock, dedupe pendientes, sustitución Vercel KV/Upstash, sección background jobs.
   - `ARCHITECTURE.md` — snippet Tailwind v4 CSS-first, sección Storage buckets, sección Extensiones Postgres, workers consumidores de pgmq.
   - `INTEGRATIONS.md` — `VENNDELO_ORIGIN_CITY` declarado, sección Background jobs (pgmq+pg_cron), referencias Vercel KV eliminadas.
   - `OPERATIONS.md` — comisión Wompi completa, política stock, runbook con consumers pgmq, vars Turnstile, sección Entorno de desarrollo (VM dedicada símil Vercel local).
   - `BRANDING.md` — snippet Tailwind v4, dedupe pendientes.
   - `README.md` — monorepo mencionado en stack.
   - `DECISIONS.md` — 6 ADRs nuevos (014–019).

---

## Próximo paso

**Fase 2 cierre + arranque Fase 3 — Catálogo completo (con imágenes + variantes) y checkout.**

Inmediato (cierre Fase 2):

1. **Prueba visual completa por Lucy** del flow guest end-to-end:
   - Anon: producto → add → counter sube → /carrito → cambiar qty → remover.
   - Login con cart anon poblado → merge funcionando.
2. **Imágenes de productos vía Supabase Storage:**
   - Bucket público `product-images` con RLS de write para `AdminUser`.
   - Upload en `app/admin/productos/[id]/page.tsx` (file input multi).
   - Render real en cards/detail/cart (reemplazar gradient placeholder).
3. **Admin de variantes reales** (multi-variant products) — el "Default" pattern es bridge, no destino final.
4. **Estudio de personalización en vivo** (react-konva) — diferenciador #1, central a la propuesta de valor.

Después (Fase 3 — checkout):

1. PaymentProvider adapter (Wompi primero, MercadoPago a futuro per CLAUDE.md mandato #4).
2. Saga de checkout: reserva stock → crear Order → tokenizar pago Wompi → confirmar → crear envío Venndelo → DIAN factura electrónica (Fase 7).
3. Address forms (Customer.addresses), shipping quote, contraentrega flag, coupon redemption.

**Cuentas creadas just-in-time durante fases posteriores:**

- Cloudflare (DNS + Turnstile + R2) → durante Fase 1 (Turnstile en signup) y Fase 7 (DNS + R2 al lanzar productivo).
- Anthropic API key → durante Fase 3 (Estudio de IA con Claude).
- Venndelo sandbox → durante Fase 4 (checkout con cotización).
- Wompi sandbox → durante Fase 4 (en gestión externa de la operadora).

**Cola de verificación pendiente** (mandato #9):

✅ **Verificadas el 2026-05-09** (registradas con cita en `OPERATIONS.md § Verificación de tiers Free`):

- Vercel Hobby: 60s function timeout · 100GB bandwidth · 1M invocations · 4 CPU-hrs · 1h log retention · **ToS prohíbe uso comercial** (cita textual).
- Supabase Free: 500 MB DB · 1 GB storage · 50k MAU · 500k Edge Function invocations · 5 GB egress · pausa a 1 semana · 2 proyectos máx.
- Resend Free: 3k/mes · 100/día · 1 dominio custom · 30 días retención.
- Anthropic: Sonnet 4.6 = $3/MTok input + $15/MTok output, 1M context, 64k max output.
- Cloudflare R2 Free: 10 GB · 1M Class A ops · 10M Class B ops · egress gratis.
- Cloudflare Turnstile Free: 1M siteverify/mes/sitio · 20 widgets/cuenta.

✅ **Cerrado el 2026-05-09 (sesión 7):**

- `pgmq`, `pg_cron`, `pgcrypto`, `pg_stat_statements` habilitados sin error en proyecto Supabase Free `zxkucphbsfygakgxcnik`. Validan ADR-016 (rate-limit/cache en Postgres + pg_cron) y ADR-017 (background jobs en pgmq).

🟡 **Pendiente todavía (consultas dirigidas al crear cuentas o tomar ADRs):**

- TTL configurable de access/refresh tokens en Supabase Auth Free → `supabase.com/docs/guides/auth/sessions` (revisar al implementar Auth en Fase 1).
- Política de password configurable en plan Free → `supabase.com/docs/guides/auth/password-security` (Fase 1).
- Coordinadora 1.100+ destinos vía Venndelo → confirmar al crear cuenta sandbox Venndelo (Fase 0b).
- Costos y APIs de Alegra/Siigo/Facture → para ADR-025 (antes de Fase 7).
- RNBD ante SIC: ¿obligatorio para nuestro volumen? → consulta legal cuando contratemos abogado (ADR-020, antes de Fase 7).
- UVT 2026 valor exacto en COP (impacta tope sanciones DIAN) → `dian.gov.co` cuando se redacten T&C.

---

## Bitácora (append-only, más reciente arriba)

### 2026-06-27 — Certificación Bloque A (checkout/pagos) + Bloque B (compliance)

> Nota: entre 2026-05-11 y esta fecha hubo varias sesiones (imágenes producto,
> checkout Wompi, integración Aveonline, admin UX redesign, restructuración
> Catálogo "Opción C") que NO quedaron registradas en bitácora; su detalle está
> en el historial git. Esta entrada cubre la sesión de certificación + compliance.

- **Certificación adversarial de Bloque A (saga/pagos)** con workflow multi-agente
  (6 atacantes + verificación de cada hallazgo). Veredicto inicial 🔴 NO APTO: un
  **P0 reproducido contra la DB** — el índice unique `InventoryLog(orderId, reason)`
  sin `variantId` hacía fallar el 2º INSERT de toda orden multi-ítem → P2002 →
  rollback → Order atascada PENDING_PAYMENT pese a Wompi APPROVED. Reportes en
  `docs/audits/2026-06-26-certify-bloque-a/`.
- **Pre-launch (commit 900a0e0):** índice corregido a `(orderId, reason, variantId)`
  + manejo P2002 (`StockAlreadyAppliedError`); `/gracias` no miente (ramifica por
  order.status); `Order.needsReconciliation` visible en /admin/pedidos; unique
  parcial `Order.cartId` + catch P2002; env-match del webhook desde `WOMPI_ENV`.
  + regression tests (integración DB real).
- **Post-launch + P1 (commit siguiente):** persistir trackingNumber + **claim
  atómico `Order.shipmentClaimedAt`** (cierra el P1 de doble-guía concurrente que
  la verificación adversarial encontró); clearCart dentro de la tx PAID; email
  idempotente/recuperable (`confirmationSentAt`); VOIDED→REFUNDED con revert +
  retry TOCTOU; retry colisión `Order.number`. **48 tests verdes.** Verificación en
  `docs/audits/2026-06-26-certify-bloque-a/01-VERIFY-POSTLAUNCH.md`.
- **Bloque B compliance:** `/unsubscribe?email=&token=` (Ley 1581, token SHA-256
  verificado timing-safe, registra Consent revocación + Resend unsubscribed);
  textos legales reales en privacidad/términos/devoluciones/subprocesadores
  (Aveonline, no Venndelo); **retracto verificado contra Ley 2439/2024** (mandato
  #9 — el retracto sigue 5 días hábiles; el cambio es reembolso e-commerce a 15
  días calendario); voseo→tuteo en email templates. 55 tests verdes.
- **Docs:** COMPLIANCE.md cita Ley 2439/2024; SECURITY.md actualizado (webhooks
  Wompi+Aveonline, anti-replay, env-match, claim de guía); memoria
  `reference_retracto_ley_2439_2024`.
- **Pendiente:** P0-004 verificar dominio `mail.lucamsshop.co` en Resend (ACCIÓN
  HUMANA — DNS SPF/DKIM/DMARC). Siguiente bloque sugerido: C (Seguridad).

### 2026-05-11 — Fase 2: catálogo admin + storefront público + carrito anon

Sesión larga que cubrió todo el bloque catálogo + carrito hasta dejar el flow guest "ver → agregar → carrito → ajustar qty" operativo. Commits: `d9fab6b` (admin productos CRUD) → `8714985` (admin categorías) → `d31f037` (seed demo 4×8) → `c77e641` (storefront público) → `7bfc879` (carrito anon + merge).

Decisiones cocreadas con Lucy:

- **Cart en Postgres** + sessionId cookie (vs cookie pura o Redis). Habilita abandoned-cart emails posterior, server-authoritative, alineado con mandato #11 CLAUDE.md.
- **Merge inteligente** al login (suma qty por variantId, vs reemplazo). UX no destructiva.
- **Cookie sin firmar HMAC** — UUID server-generated de 122 bits + ausencia de PII en cart hacen suficiente la entropía. Documentado en `lib/cart-session.ts` para revisar si se almacena `customDesign` con datos sensibles.
- **Default variant pattern** sin schema migration: cada producto auto-crea variant "Default" en createProduct para satisfacer `CartItem.variantId` required. Bridge hasta variantes admin reales.

Detalles arquitectura:

- `features/products/public-service.ts` separado de `service.ts` admin — enforza `deletedAt:null + isActive:true` en product Y category. El admin service queda libre para surfacear archivados en `/admin`.
- `features/cart/service.ts` con merge transaccional + hard-delete del anon (sessionId @unique no respeta deletedAt). Items con producto archivado se filtran en `getCartDetail` (admin que archive efectivamente saca el item de carritos en vuelo).
- `lib/format.ts` shared (eliminada duplicación en admin/productos/page.tsx).

Pendiente prueba visual end-to-end por Lucy + imágenes Storage + variantes admin reales.

### 2026-05-09 — Fix deploy Vercel: Root Directory + simplificación vercel.json (sesión 12)

**Síntoma:** después de pushear el commit `a025589` (que agregaba `/api/health`), el deploy de Vercel seguía respondiendo HTTP 404 con `x-vercel-error: NOT_FOUND` en `lucams-shop.vercel.app/`.

**Diagnóstico** (gracias al build log que la operadora extrajo del dashboard):

```
23:29:58.579 Warning: Could not identify Next.js version, ensure it is defined as a project dependency.
23:29:58.593 Error: No Next.js version detected. Make sure your package.json has "next" in either "dependencies" or "devDependencies". Also check your Root Directory setting matches the directory of your package.json file.
```

El log mostró que Vercel SÍ ejecutó nuestro `installCommand` (`pnpm install --frozen-lockfile` desde root, 12.3s OK con las 667 deps). Pero después intentó detectar Next.js leyendo el `package.json` del **Root Directory** (que estaba en `./` por default, importado antes de tener `apps/web/`). El `package.json` del workspace root NO contiene `next` — `next` vive en `apps/web/package.json`. Resultado: error y deploy fallido.

**Aprendizaje crítico:** declarar `framework: "nextjs"` en `vercel.json` **NO supera** esa validación. Vercel valida `next` en el `package.json` del Root Directory **antes** de leer `vercel.json` para framework override. La solución canónica para monorepos es **Root Directory = `apps/web`** en Vercel UI.

**Acciones:**

1. **Operadora cambió Root Directory a `apps/web`** en Vercel UI (Settings → General → Root Directory). Disparó re-deploy automático.
2. **Claude simplificó `vercel.json` del repo** a solo `ignoreCommand`. Eliminados `framework`, `buildCommand`, `installCommand`, `outputDirectory` — Vercel los auto-detecta correctamente cuando Root Directory apunta a `apps/web/`. El `ignoreCommand` se queda porque se ejecuta desde la raíz del repo (no del Root Directory) y necesitamos paths relativos al repo entero para skip-docs-only.
3. **`OPERATIONS.md` actualizado:** sección "vercel.json del repo" reescrita para reflejar la versión minimal + nueva subsección "Configuración requerida en Vercel UI" listando Root Directory y otros settings auto-detect. Nota explicativa del aprendizaje incluida.

**Validación pendiente:** próximo push debe disparar deploy que sirva la home Lucams en HTTP 200 + `/api/health` con JSON correcto.

### 2026-05-09 — Operadora actualiza .env.local + state dir movido a workspaces (sesión 11)

**Hechos:**

1. **Operadora reemplazó `[YOUR-PASSWORD]` en `.env.local`.** Verificado por `make env-check`: las 6 vars críticas ahora están loaded sin placeholder (`DATABASE_URL` 124 chars, `DIRECT_URL` 109 chars). Esto desbloquea Prisma para Fase 1 schema.

2. **State dir movido de `/tmp/lucams-shop-local/` a `/home/ansible/workspaces/lucams-shop-local/`.** Razón de la operadora: `/tmp/` se puede borrar por antigüedad o reboot de la VM, perdiendo histórico de logs entre sesiones. La nueva ubicación es:
   - Paralela al repo (no adentro) → no contamina el árbol git ni requiere gitignore.
   - Persistente entre reinicios → histórico de logs accesible para debug "qué pasó hace 3 días".
   - Coherente con la convención del workspace de la operadora (todo en `/home/ansible/workspaces/`).

3. **`STATE_DIR ?= /home/ansible/workspaces/lucams-shop-local`** ahora es el default del Makefile. Smoke test post-move verde: `make help`, `env-check`, `health` desde la nueva ubicación funcionan idénticamente.

4. **OPERATIONS.md y STATE.md** actualizados — todas las menciones a `/tmp/lucams-shop-local/` reemplazadas por la nueva ruta.

### 2026-05-09 — Compatibilidad local↔Vercel + Makefile orquestador (sesión 10)

**Operadora pidió:** (1) validar que el entorno local sea compatible con Vercel dado que la VM es ambiente de desarrollo; (2) crear un `Makefile` + sistema de logs en `/home/ansible/workspaces/lucams-shop-local/` siguiendo el patrón de `/tmp/commerce-ops-local/`.

**Hechos:**

1. **Vercel CLI 53.3.1 instalado** globalmente (`sudo npm install -g vercel`). No se hizo `vercel link` interactivo — la operadora puede hacerlo después si quiere `vercel pull`. Para validación documental no fue necesario.

2. **Hallazgo crítico de paridad:** Vercel está deployando desde la raíz del repo (donde el `package.json` es del workspace, no de Next.js) → todos los deploys post-push devuelven HTTP 404 con `x-vercel-error: NOT_FOUND`. **Solución implementada:** `vercel.json` en la raíz del repo declarando explícitamente:
   - `framework: "nextjs"` (forzar)
   - `buildCommand: "pnpm --filter web build"`
   - `installCommand: "pnpm install --frozen-lockfile"`
   - `outputDirectory: "apps/web/.next"`
   - `ignoreCommand` que skipea deploy cuando solo cambian docs

3. **Makefile creado en `/home/ansible/workspaces/lucams-shop-local/Makefile`** con comandos espejo del runtime de Vercel:
   - **Stack:** `make up`, `down`, `restart`, `status`, `logs SERVICE=web`, `clean`.
   - **Quality gates:** `make build`, `typecheck`, `lint`, `format`.
   - **Validación local↔cloud:** `make env-check` (lista vars sin exponer valores, detecta placeholders), `make health` (healthchecks Supabase Auth + REST + web local), `make vercel-parity` (reproduce el build EXACTO de Vercel).
   - Patrón heredado del otro proyecto: `nohup` + PID files + log redirection + healthcheck por `kill -0`.
   - Make instalado en la VM con `sudo dnf install -y make`.

4. **Smoke test del Makefile completo verde:** `up`, `status` (RUNNING + PID), `health` (3/3 checks 200), `down`, `vercel-parity` (build limpio, BUILD_ID generado), `env-check` (detecta correctamente vars cargadas vs placeholders).

5. **Hallazgo CRÍTICO descubierto por `make env-check`:** en `.env.local` los campos `DATABASE_URL` y `DIRECT_URL` **siguen con `[YOUR-PASSWORD]` literal** — la operadora copió las connection strings de Supabase Dashboard pero no reemplazó el placeholder con la database password real. **No bloquea hoy** (el código actual no toca DB) **pero bloqueará Fase 1 schema** cuando Prisma intente conectar. **Acción de la operadora**: reemplazar `[YOUR-PASSWORD]` en ambas líneas de `.env.local` con la password generada al crear el proyecto Supabase.

6. **Gap pendiente para Vercel** (no bloqueante para deploy actual del Hello World, sí para Fase 1 con Supabase):
   - Las env vars del proyecto NO están en Vercel UI todavía. Antes del próximo deploy con código que use Supabase, la operadora debe ir a Vercel Dashboard → Settings → Environment Variables y copiar las 11 variables de `.env.local` para los 3 entornos (Production, Preview, Development), marcando como Encrypted las que son secretas.

**Documentación añadida:**

- `OPERATIONS.md` § "Compatibilidad local ↔ Vercel" — matriz de paridad + lista de env vars a sincronizar + descripción del `vercel.json`.
- `OPERATIONS.md` § "Entorno local con Make (símil-Vercel)" — comandos disponibles, convenciones, cuándo usarlo.

### 2026-05-09 — Fase 1 scaffolding inicial (sesión 9)

**Modo autonomía:** la operadora pidió que actuara con más autonomía dentro de los permisos `Bash(*)` de la VM dedicada (mandato #10). Procedí con bloques digeribles + commits frecuentes + pausa solo en decisiones destructivas.

**Hechos:**

- **Tooling instalado:** Node.js 22.22.2 (NodeSource RPM en Oracle Linux 9.7) + pnpm 11.0.9 (vía corepack) + npm 10.9.7.
- **Monorepo inicializado:** `pnpm-workspace.yaml` con `apps/*` y `packages/*`. `package.json` root con scripts compartidos (`dev`, `build`, `lint`, `typecheck`, `format`). `engines` y `packageManager` declarados.
- **`apps/web` creado:** `pnpm create next-app@latest --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --turbopack`. Llegó **Next.js 16.2.6** (no 15.x como decían los docs originales — actualizamos).
- **Hallazgo crítico:** Next.js 16 trae breaking changes vs 15. La advertencia oficial `apps/web/AGENTS.md` lo señala explícitamente: _"This is NOT the Next.js you know."_ Leí `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` y documenté los cambios que afectan nuestra arquitectura (saga, middleware, async APIs, themeColor, revalidateTag, images config) en **ADR-024**.
- **shadcn/ui v4 instalado:** `pnpm dlx shadcn@latest init --defaults --no-monorepo --base radix`. Style `radix-nova` (la evolución del antiguo "new-york" — actualizamos ADR-021 para reflejar el nombre real). Dependencias: `class-variance-authority`, `clsx`, `lucide-react`, `radix-ui`, `tailwind-merge`, `tw-animate-css`.
- **Branding aplicado en código:**
  - `lib/utils.ts` con `cn()` helper.
  - `app/globals.css` reemplazado: `@theme inline` con paleta brand Lucams (morado/turquesa/coral/rosa/amarillo/cream) + tokens semánticos shadcn mapeados a la paleta + `--font-display: Fredoka` y `--font-body: Inter` + radii kawaii (12px) + estilos base con `prefers-reduced-motion`.
  - `app/layout.tsx`: `lang="es-CO"`, fuentes vía `next/font/google` con `display: swap`, metadata + viewport export separados (Next 16 breaking change), título y descripción Lucams.
  - `app/page.tsx`: home placeholder con mascota mapache 🦝, paleta brand visible, propuesta de valor, link a Instagram. Reemplaza la default Next welcome.
  - Assets default removidos (`next.svg`, `vercel.svg`, etc.).
- **Quality gates pasando:**
  - Typecheck: ✅ sin errores.
  - Lint (ESLint flat config): ✅ sin errores.
  - Build de producción: ✅ 4.6s con Turbopack, 4 páginas estáticas pre-renderizadas, **sin warnings** tras mover `themeColor` a `viewport` export.
  - Dev server: arranca en ~500ms con Turbopack default.
- **Prettier:** instalado en root con `prettier-plugin-tailwindcss`. `.prettierrc.json` y `.prettierignore` configurados. Scripts `format` y `format:check` ya estaban en root `package.json`.
- **pnpm build approvals:** `sharp` (next/image), `unrs-resolver` (tailwind/eslint), `msw` (testing) aprobados explícitamente vía `pnpm-workspace.yaml` `allowBuilds`.

**Documentación actualizada:**

- ADR-024 nuevo en `DECISIONS.md` documentando Next.js 16 + breaking changes que adoptamos.
- ARCHITECTURE.md: tabla de versiones actualizada (Next.js 15.x → 16.x).
- CLAUDE.md mandato #3: stack actualizado con Next.js 16 + style `radix-nova` + advertencia sobre breaking changes.

**Lo que NO hicimos en este bloque (Fase 1 continúa):**

- Prisma + `packages/db` schema (siguiente).
- RLS policies + tests automáticos.
- Auth Supabase (registro, login, recuperación).
- Patrones cross-cutting (`lib/errors.ts`, `lib/rate-limit.ts`, `lib/cache.ts`, `lib/queue.ts`, `lib/logger.ts`, `lib/idempotency.ts`, `lib/circuit-breaker.ts`, etc. per CONVENTIONS.md).
- Healthchecks `/api/health/*`.
- Header + Footer + WhatsApp FAB.
- CI GitHub Actions (typecheck + lint + tests + secret scanning).
- Cloudflare + Turnstile (cuenta a crear cuando lleguemos a signup form).

### 2026-05-09 — Cierre Fase 0b con re-scope (sesión 8)

**Decisión de la operadora:** cerrar Fase 0b con las 4 cuentas críticas (GitHub, Supabase, Vercel, Resend) y diferir Cloudflare/Anthropic/Venndelo a sus fases respectivas. Razón pragmática: ninguna de las 4 postergadas bloquea Fase 1, y mantener cuentas "frías" no usadas suma surface area sin beneficio.

**Lo creado y validado en esta tanda:**

- **Vercel Hobby** (`lucams-shop.vercel.app`): conectado a GitHub `jullieth93/lucams`, primer deploy exitoso con HTTP 404 esperado (no hay código aún), webhook GitHub→Vercel funcionando.
- **Resend Free**: API key con scope "Sending access" (least privilege), validada con `restricted_api_key` error code (confirma key válida + scoped). Dominio default `resend.dev`.

**Incidente de seguridad #2 durante esta tanda:** al diagnosticar un 401 de Resend (que era esperado por el scope, no por key inválida), Claude usó `cat -A .env.local` con regex de redacción `[A-Za-z0-9]+` que NO incluía underscore. La key real quedó parcialmente visible en transcript. Resuelto: rotación + revocación + actualización de memoria con anti-patrones específicos (no usar `cat`, no combinar prefix+suffix, no redacciones parciales).

**Documentación actualizada:**

- `ROADMAP.md` Fase 0b marcada 🟢 con re-scope explícito documentado.
- `STATE.md` resumen actual y próximo paso ahora apuntan a Fase 1.
- `feedback_never_read_env_files.md` ampliada con sección "Anti-patrones específicos" (cat, regex incompletas, prefix+suffix combinados).

### 2026-05-09 — Setup proyecto Supabase + extensiones + connection test (sesión 7)

**Hechos:**

- Proyecto Supabase creado: `zxkucphbsfygakgxcnik.supabase.co`, region `sa-east-1` (São Paulo), Postgres standard (NO OrioleDB Alpha), GitHub linked a `jullieth93/lucams`, Auto-RLS ON, Auto-expose tables OFF, Data API ON.
- Las 5 vars de Supabase copiadas a `.env.local` (ignorado por git): URL + Publishable + Secret + DATABASE_URL pooled (6543) + DIRECT_URL direct (5432).
- 4 extensiones habilitadas vía dashboard: `pgmq`, `pg_cron`, `pgcrypto`, `pg_stat_statements`. **Cierra el último pendiente práctico de la cola de verificación.** Confirma que ADR-016 y ADR-017 son ejecutables en plan Free.
- Connection test ejecutado sin exponer credenciales (`set -a; source .env.local; set +a; curl`). Resultados:
  - Auth health, Auth settings, Storage list: HTTP 200 con publishable key.
  - REST root con secret key: HTTP 200.
  - **Hallazgo nuevo:** REST root `/rest/v1/` con publishable da HTTP 401 con mensaje _"Only secret API keys can be used for this endpoint"_ — comportamiento nuevo del sistema publishable/secret. La introspección OpenAPI del schema ahora requiere secret. Es **mejor postura de seguridad** (la publishable no puede leak schema completo). Documentado en `INTEGRATIONS.md` § Supabase.

**Bug en `.env.example` corregido:** `EMAIL_FROM=Lucams_shop <onboarding@resend.dev>` rompía bash `source` por los `<`/`>`. Corregido a `EMAIL_FROM="Lucams_shop <onboarding@resend.dev>"` (con quotes) en `.env.example` y `.env.local`.

**Var rename:** `DIRECT_DATABASE_URL` → `DIRECT_URL` (convención oficial Supabase+Prisma per [supabase.com/docs/guides/database/prisma](https://supabase.com/docs/guides/database/prisma)). Aplicado a `.env.example`, `.env.local` (vía `sed`, sin leer contenido para no exponer secretos), `docs/OPERATIONS.md`, `docs/INTEGRATIONS.md`, `docs/ARCHITECTURE.md`.

**⚠️ Incidente de seguridad — leak de secret key:**

- Mientras hacía un Edit a `.env.local`, la herramienta Edit exigió Read previo. Al hacer `Read .env.local`, la `SUPABASE_SECRET_KEY` real (`sb_secret_REDACTED`) entró a mi contexto y por lo tanto al transcript del chat.
- Severidad real: P0 según runbook IRP-001. Severidad práctica: baja (DB vacía, dev environment, no producción).
- Operadora decidió no rotar inmediatamente — queda como **deuda crítica obligatoria antes de cerrar la sesión**.
- Aprendizaje guardado en memory `feedback_never_read_env_files.md`: **nunca usar Read/Edit/Write sobre `.env*`**. Solo `sed` via Bash, que modifica in-place sin exponer contenido. Inspeccionar nombres de vars con `grep`/`cut`. Cargar valores en subshell con `set -a; source; set +a` para que vivan en el subprocess y no en mi contexto.

### 2026-05-09 — Migración a publishable/secret keys de Supabase (sesión 6)

**Hallazgo del operador (Lucy):** al copiar credenciales del dashboard Supabase a `.env.local`, observó que las API keys ya no se llaman `anon` y `service_role` sino **Publishable** y **Secret**.

**Verificación contra docs oficiales** ([supabase.com/docs/guides/api/api-keys](https://supabase.com/docs/guides/api/api-keys), [Supabase Discussion #29260](https://github.com/orgs/supabase/discussions/29260)):

- Las legacy `anon`/`service_role` (formato JWT) están siendo reemplazadas por `sb_publishable_*` y `sb_secret_*` (token strings con prefijo).
- Cita textual crítica: _"Projects restored from 1st November 2025 will no longer be restored with the legacy API keys. **New projects no longer have anon and service_role available for use.**"_
- Nuestro proyecto se creó hoy (2026-05-09) → solo tiene las nuevas keys.
- Mapeo de seguridad idéntico: publishable → rol Postgres `anon`, secret → rol Postgres `service_role`. Drop-in replacement.
- Ventaja del nuevo sistema: múltiples secret keys revocables (rotación sin downtime).

**Cambios aplicados:**

- `.env.example` y `.env.local`: `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY` (editado por el operador).
- `docs/OPERATIONS.md`: bloque env vars + política de rotación actualizada.
- `docs/SECURITY.md`: inventario de claves, runbook IRP-001 (con nuevo paso "revocar la key vieja explícitamente"), threat model, clasificación de datos.
- `docs/INTEGRATIONS.md`: nota explicativa al inicio de la sección Supabase con cita oficial; bloque env vars; snippets de `lib/supabase/{browser,server,service}.ts`.
- `docs/ARCHITECTURE.md`: comentarios en estructura de carpetas; sección RLS aclarando equivalencia publishable→`anon`, secret→`service_role`.
- `docs/PLAN.md`: 2 menciones puntuales en sección de seguridad y reglas.

**Decisión operativa:** Las menciones a "rol `anon`" y "rol `service_role`" en docs (cuando refieren al rol Postgres y no al nombre de la key) **se mantienen** — los roles no cambiaron, solo cambió el formato de las API keys que activan cada rol.

### 2026-05-09 — Verificaciones de tiers Free (sesión 5)

Cola de verificación pendiente cerrada para los 6 servicios externos críticos. Resultados documentados en `OPERATIONS.md § Verificación de tiers Free contra docs oficiales` con cita y URL por cada cifra.

**Hallazgo crítico:** Vercel Hobby ToS **prohíbe explícitamente uso comercial** — _"You shall only use the Services under a Hobby plan for your personal or non-commercial use."_ Implica que el upgrade a Vercel Pro al primer pago real es **obligación contractual**, no preferencia de capacidad. Ya estaba planeado en Fase 7; queda confirmado como bloqueante.

**Resumen de cifras clave verificadas:**

- Vercel Hobby: 60s function timeout, 100 GB bandwidth, 1M invocations, 1h log retention, ToS no comercial.
- Supabase Free: 500 MB DB + 1 GB storage + 50k MAU + 500k Edge Function invocations + pausa a 1 semana + 2 proyectos máx.
- Resend Free: 3k/mes + 100/día + 1 dominio + 30 días retención.
- Anthropic Sonnet 4.6: $3 input / $15 output por MTok, 1M context, 64k max output. Costo estimado por sugerencia IA: ~$0.006 USD.
- Cloudflare R2 Free: 10 GB + 1M Class A + 10M Class B + **egress gratis**.
- Cloudflare Turnstile Free: 1M siteverify/mes/sitio + 20 widgets/cuenta.

**Único pendiente práctico:** confirmar `pgmq` y `pg_cron` disponibles en Supabase Free al crear el proyecto real (Fase 0b). Si estuvieran restringidos, replanteamos ADR-017.

### 2026-05-09 — Cierre de ADRs pendientes (sesión 4) + commit inicial

**ADRs cerrados con input del usuario:**

- **ADR-020 — Estrategia legal:** Lucams redacta plantillas con base en COMPLIANCE.md + abogado colombiano especialista en consumo/comercio digital revisa antes de Fase 7. Costo estimado ~$300–600 USD, 2–4 semanas. Bloqueante para lanzamiento.
- **ADR-021 — Tipografías:** **Fredoka** (display) + **Inter** (body). Ambas Google Fonts, vía `next/font/google` con `display: swap`. Definidas en `globals.css` `@theme` desde Fase 1.
- **ADR-026 — Feature flags:** tabla `FeatureFlag` en Postgres + helper `lib/feature-flags.ts` con cache 60s. Sin vendor externo (mismo principio que ADR-016). Criterios de migración futura a GrowthBook documentados.

**Commit hygiene:**

- Configurado `git config --local user.name "Lucy Hurtado" --local user.email "r.julliethhr@gmail.com"`.
- `.claude/` agregado a `.gitignore` (settings.json es personal, no se comparte).
- Branch `develop` se mantiene como rama de trabajo. Se renombra a `main` al crear el repo en GitHub (Fase 0b).
- **Commit `9a2c826`** ejecutado: 21 files, 8.854 inserciones, 8 borrados. Conventional Commits style. Sin Co-Authored-By per preferencia del operador.

**Estado de ADRs:**

- 22 ADRs cerrados (001 a 021, 026).
- 6 ADRs todavía abiertos: 022 (monitoreo errores, Fase 7), 023 (Redis trigger, futuro), 024 (OpenTelemetry, futuro), 025 (DIAN provider, antes de Fase 7), 027 (staging, post-lanzamiento), 028 (GrowthBook trigger, futuro).

### 2026-05-09 — Análisis competitivo + catálogo seed (sesión 3)

Reconocimiento real de magneticas.cl ejecutado: home + sitemap.xml + 6 categorías (packs fotos, recuerdos, calendarios, organización, publicitarios, juegos, decoración, coleccionables) + FAQ + política de devolución. Creados [`docs/CATALOG_SEED.md`](CATALOG_SEED.md) (37 productos paritarios + 6 productos NUEVOS exclusivos Lucams + 11 descartados con motivo legal/cultural) y [`docs/COMPETITIVE_ANALYSIS.md`](COMPETITIVE_ANALYSIS.md) (visión general del competidor, lo que copiamos, lo que mejoramos, riesgos legales detectados, gaps de UX). Categorías Lucams definidas (8): foto-imanes, recorditos-eventos, organizate, calendarios, pequenes, decora-espacio, regalos-corazon, mayorista. Política firme: **no replicar productos con marcas registradas no licenciadas** (Snoopy/Disney/Harry Potter/Coca-Cola/Spotify/Bad Bunny/Katy Perry/Hannah Montana — descartados con motivo en el doc).

### 2026-05-09 — Auditoría productive readiness (sesión 2)

Tras feedback del usuario reframeando "esto no es ambicioso, es el piso para productivo", se ejecutó segunda auditoría con 43 hallazgos. Creados 4 docs nuevos (CONVENTIONS, OBSERVABILITY, COMPLIANCE, TESTING). Expandidos 5 docs existentes (SECURITY con STRIDE+IRP, ARCHITECTURE referenciando convenciones, INTEGRATIONS con DIAN+resiliencia, OPERATIONS con DevOps+DR, ROADMAP con tareas por fase). Compliance colombiano operativizado (Ley 1581 con tabla `Consent`, Ley 1480 con `RetractRequest` y exclusión por personalización, DIAN con `InvoiceProvider` adapter). Threat model STRIDE por flujo crítico. IRP con 4 runbooks concretos. SLOs cuantitativos definidos. DR drills cuatrimestrales programados.

### 2026-05-09 — Endurecimiento productivo + auditoría inicial

**Sesión completa con tres bloques:**

1. **Carga de contexto** (lectura completa de los 7 docs + README + CLAUDE.md).
2. **Auditoría de coherencia** (21 hallazgos, 6 ADRs nuevos, fuentes verificadas con WebFetch).
3. **Endurecimiento productivo:**
   - Creación de `docs/SECURITY.md` con cobertura completa (autenticación, autorización, RLS, CORS, headers, rate limit, secrets, validación, RBAC, CSP, CSRF, TTLs, file upload, audit logs, PII/Habeas Data, dependency scanning, webhook security).
   - `.gitignore` y `.env.example` listos.
   - Sección "Entorno de desarrollo" en OPERATIONS.md con setup local símil-Vercel (logs, env, Supabase local, healthchecks).

**Salida:** documentación lista para arrancar Fase 0b sin sorpresas.

### 2026-05-09 — Creación inicial de la documentación (Fase 0a)

Antes de esta sesión, ya existían los 7 docs base + CLAUDE.md + README.md. Estado al inicio de la sesión actual: documentos completos pero con inconsistencias internas, referencias obsoletas a tecnologías y suposiciones técnicas sin verificar.
