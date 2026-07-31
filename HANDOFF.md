# HANDOFF — CMS v2: modelo Página → Sección → Campo + Admin reconstruido

**Reconstrucción del CMS y de la capa Admin de contenido**, ejecutada el **2026-07-30** sobre `develop`. Motivación (pedido del usuario): "para alguien no técnico el contenido que se administra desde el ADMIN es insuficiente — la Página Principal no está centralizada (faltan, por ejemplo, las redes sociales) — y la capa Admin debe reconstruirse con una segregación de contenido por sitios/páginas". Todo lo aquí escrito tiene evidencia de ejecución real (salidas de scripts, tests, build).

**Punto de restauración registrado ANTES de tocar nada** (pedido explícito del usuario: "documentate en el punto estable commit que estás ahora por si acaso"): tag git **`pre-cms-v2`** sobre `dddfc26` (`docs: HANDOFF post-script 5 — completion textos + reformulación admin contenido`), working tree limpio. Rollback: `git reset --hard pre-cms-v2`. Las tablas viejas (`CmsBlock`, `CmsBlockVersion`, `SiteSetting`) **siguen vivas en BD** como respaldo de datos — no se tocaron.

---

## 1. Qué se construyó

### Modelo de datos nuevo (el usuario eligió "Nuevo modelo de datos CMS")

`CmsPage → CmsSection → CmsField → CmsFieldVersion` (`packages/db/prisma/schema.prisma`, migración `20260730120000_add_cms_v2`, escrita a mano porque `migrate dev` no puede levantar shadow DB en Supabase por la extensión `pg_trgm` de una migración vieja — mismo motivo documentado en `docs/STATE.md`):

- **`CmsPage`**: una por sitio/página (`inicio`, `header`, `footer`, `contacto`, `ayuda`, `checkout`, `producto`, `carrito`, `mi-cuenta`, `legales`, `emails`, `errores`, `mantenimiento`, `seo`, `cotizacion`, `global` = ajustes del sitio, `otros`).
- **`CmsSection`**: zonas dentro de la página (hero, redes-sociales, whatsapp…).
- **`CmsField`**: **unifica** los viejos `CmsBlock` (`kind: BLOCK`, prosa con publicación explícita) y `SiteSetting` (`kind: SETTING`, valor atómico que publica al guardar). `key` global única = **misma key histórica** (`home.hero.title`, `CONTACT_EMAIL`…), `type` (TEXT/TEXTAREA/MARKDOWN/HTML/JSON/EMAIL/URL/NUMBER/PHONE/COLOR/BOOLEAN), `label` + `helpText` para no-técnicos.
- **`CmsFieldVersion`**: append-only, espejo del versionado viejo (historial + revert + auditoría legal).
- RLS deny-by-default en las 4 tablas (`supabase/migrations/00000000000018_rls_cms_v2.sql`, aplicada vía `prisma db execute`).

### Migración de datos con paridad verificada

- `packages/db/scripts/cms-site-map.mjs` — **site map declarativo**: la estructura página → sección + reglas de asignación (prefijos de key para bloques, categorías legacy para settings) + campos NUEVOS inline. Es el corazón de la reorganización.
- `packages/db/scripts/migrate-cms-v2.mjs` (`make migrate-cms-v2`) — idempotente: migra bloques (con TODAS sus versiones), settings (v1 publicada) y upserta campos nuevos del mapa. **Nunca pisa** body/publicación de campos existentes (seguro re-ejecutar tras ediciones del admin).
- `packages/db/scripts/verify-cms-v2-parity.mjs` — verificación de paridad viejo↔nuevo. **Resultado: 83 bloques + 42 settings, todo el contenido publicado coincide.**
- Estado final BD (query real): **17 páginas, 33 secciones, 176 campos, 222 versiones, 0 sin publicar** (125 migrados + 51 nuevos de las brechas).

### Capa de lectura compatible (0 cambios en consumidores)

`apps/web/lib/cms.ts` re-escrito por dentro sobre el modelo nuevo conservando **firma exacta** de `getCmsBlock`, `getCmsBlocksByCategory`, `getSiteSetting`, `getSettingValue`, `getAllSiteSettings`, `getSettingsByCategory`, `getAllCmsBlocks`, `searchCmsBlocks` e `isPublicSettingKey` (filtro de claves sensibles `PICKUP_*`/`BUSINESS_NIT` intacto). Mismo cache tag `"cms"` (1h) e invalidación por `updateTag("cms")`. Los ~63 archivos consumidores no se tocaron; la red de seguridad fue la suite completa (abajo).

### Admin reconstruido por páginas

- `/admin/contenido` — índice de páginas: tarjetas con icono, conteo de campos, badge "N sin publicar", link "Ver página ↗"; buscador global (key/label/ayuda/contenido); botón "Actualizar caché de contenido".
- `/admin/contenido/paginas/[slug]` — editor de página: secciones como cards; campos simples editables **inline** con control según tipo (text/email/url/tel/number/color, textarea, select Sí/No para booleanos); campos ricos con preview + enlace al editor completo; "Agregar campo" por sección.
- `/admin/contenido/campos/[id]` — editor completo: MarkdownEditor con preview para MARKDOWN/HTML, textarea mono con validación suave para JSON, historial de versiones con "Volver a esta", Publicar/Despublicar (solo BLOCK)/Archivar.
- Server actions nuevas (`contenido/actions.ts`) con el patrón de siempre: `requireAdminAction({ roles: SUPER })` + Zod + `recordAdminAction` + `updateTag("cms")`.
- Redirects legacy: `/admin/contenido/bloques*` → `/admin/contenido`; `/admin/contenido/configuracion` → `/admin/contenido/paginas/global`; `/admin/email-templates` → `/admin/contenido/paginas/emails`. Menú actualizado ("Páginas del sitio", "Ajustes del sitio"); RBAC sin cambios (deny-by-default → SUPERADMIN).
- `service.ts` + `schemas.ts` de `features/cms` re-escritos (semántica: BLOCK guarda borrador; SETTING guarda y publica; los settings no se pueden despublicar).

### Brechas de contenido cerradas (51 campos nuevos)

- **WhatsApp una sola fuente**: `getWhatsAppNumber()` (ahora async) lee el campo `WA_NUMBER` (CMS manda; env `NEXT_PUBLIC_WA_NUMBER` queda como fallback). Antes había dos fuentes (env para web, setting para emails). `WA_MSG_QUOTE` también sembrado (solo existía como fallback en código).
- **Redes sociales**: `SOCIAL_FACEBOOK_URL` (nuevo), toggles `SOCIAL_*_ENABLED` para mostrar/ocultar cada red en el footer; **JSON-LD `sameAs`** de la home ahora se construye desde los settings (antes Instagram quemado en `app/page.tsx`).
- **Home**: CTAs sueltos (`home.categories.cta-all`, `home.featured.cta-all`, `home.reviews.empty-note`, `home.cta.whatsapp-label`, `home.cta.catalog-label`) y URLs destino del hero (`home.hero.cta-*.href`).
- **Footer**: 8 links legales en campo JSON `footer.legal.links` (parse seguro con fallback), CTAs de ayuda/contacto/rastreo, línea ciudad+SIC desde `APP_NAME`/`BUSINESS_LOCATION` (antes huérfano)/`GOVT_SIC_URL`.
- **Header/mega-menú**: todo el copy (`header.menu.*` incl. labels de las 6 ocasiones, chip de ayuda y variantes móviles) resuelto en server y pasado por props al client component.
- **Contacto**: títulos de tarjetas, CTA WhatsApp y bloque "¿Preguntas comunes?" (markdown).
- **Ayuda**: el fallback hardcodeado ya no lleva emails literales — interpola `CONTACT_EMAIL`.
- **Cotización** (`/cotizacion/[token]`): de 0% a 100% CMS (`quote.confirmation.*` con placeholders `{nombre}`/`{ciudad}` + `generateMetadata` dinámico).

**Regla de oro aplicada en todo**: cada `fallback` es el texto exacto que estaba hardcodeado — si la DB cae, el sitio se ve idéntico a hoy.

Backlog documentado (roadmap `docs/CMS_ROADMAP.md`, en ejecución): ya cerrados el copy del `/estudio` (**B1**, commit `ce90423` — 363 campos `estudio.*`), los iconos/gradientes de categorías (**B3**, commit `73bbbfc` — dominio Category, no CMS), los campos de imagen con mediateca (**B5**, commit `e8d4dad` — type `IMAGE` con `body` = `CmsMedia.id`, bucket público `cms-media` con RLS/policies, pipeline con alt obligatorio + anti-polyglot, admin uploader + `/admin/contenido/mediateca`, reader `getCmsImage` con fallback), los banners de portada (**B6**, commit `b7ed459` — campo lista `home.banners` con imagen de la mediateca, reader `getCmsBanners`, sección `<HomeBanners>` tras el hero, editor de listas con subcampos IMAGE/BOOLEAN, guarda de borrado por `contains`) y la vista previa en vivo del editor (**C1**, commit `87bda56` — iframe de la página pública que se recarga al guardar/publicar; `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'`), la publicación programada (**C3**, commit `14481a7` — `CmsFieldVersion.publishAt` + job pg_cron `lucams-cms-publish-scheduled` cada 5 min vía endpoint firmado `/api/cron/cms-publish-scheduled`; date-picker «Programar» en hora de Colombia en el editor de campo) y las utilidades del admin (**C4**, commit `6c04bde` — vista «Solo borradores» con publicar en lote, renombrar páginas/secciones, mover campos entre secciones, duplicar campos como borrador), la auditoría de cobertura de contenido (**D1**, commit `4a6d242` — scanner AST `audit-content-coverage.mjs` + baseline ratchet con gate en CI: falla si aparece copy nuevo en español fuera del CMS; medición inicial 20.16% global, 479 huecos conocidos congelados) y la documentación estructural (**D3**, commit `c7ca6d5` — modelo CMS v2 en ARCHITECTURE.md, guía «agregar un campo CMS» en CONVENTIONS.md, ADR-082/083/084 en DECISIONS.md). **Fases ejecutables completadas**; quedan solo las bloqueadas por acceso externo (A1/A2/A3, D4). Drop de tablas viejas: diferido a post-verificación en producción (fase A2, bloqueada).

---

## 2. Evidencias de conclusión (datos reales)

- **Migración de datos**: `Estructura: 17 páginas, 33 secciones OK · Bloques: 83 leídos, 83 creados, 129 versiones copiadas · Settings: 42/42 · Paridad OK · 0 anomalías · 0 keys en "otros"`. Tras los campos nuevos: `destino 126 BLOCK + 50 SETTING`, y corrida final `3 creados`.
- **Paridad viejo↔nuevo**: `verify-cms-v2-parity.mjs` → `Bloques comparados: 83 · Settings comparados: 42 · OK — todo el contenido publicado coincide`.
- **Tests de integración del service v2** (nuevos, 24): create BLOCK/SETTING, drafts, publish/revert, unpublish (SETTING rechaza), soft-delete, navegación por páginas, búsqueda, metadatos — **24/24 verdes** contra la DB real.
- **Suite completa vitest**: **162 archivos, 2627 passed / 2 skipped**, 0 residuos en teardown (baseline pre-cambio: 2631 passed; la diferencia son los tests del service viejo reemplazados por los 24 nuevos + ajustes de wa.test.ts).
- **Gates**: `tsc --noEmit` ✓ · `eslint --max-warnings 0` ✓ · `prettier --check` ✓ en todos los archivos tocados · `prisma format` ✓ · **`next build` ✓** (valida límites server/client de los componentes CMS).
- **Tests focales de brechas**: `lib/wa.test.ts` + `features/quotes/service.test.ts` 62/62 ✓ · `tests/a11y-contrast.test.ts` 13/13 ✓ · `lib/admin-nav.test.ts` 11/11 ✓.

### Pendiente operativo (hacerlo al desplegar)

1. **Invalidar el caché CMS** tras el deploy: `/admin/contenido` → "Actualizar caché de contenido" (los scripts de migración escriben directo en DB; el tag `cms` se invalida solo desde una Server Action — ver `docs/OPERATIONS.md`).
2. Smoke manual en el admin: editar un texto de Inicio → publicar → ver el cambio en `/`.
3. En una iteración posterior (con verificación en producción encima): drop de `CmsBlock`/`CmsBlockVersion`/`SiteSetting` y borrado de `seed-cms*.mjs` (ya marcados DEPRECATED).

### Commits EJECUTADOS (push `dddfc26..6cdba03` a `develop`)

1. `782233e feat(db): modelo CMS v2 (CmsPage/CmsSection/CmsField/CmsFieldVersion) + RLS + migración de datos con paridad`
2. `56b5d37 refactor(cms): lib/cms.ts + features/cms sobre modelo v2 (API pública idéntica)`
3. `ff7d0f4 feat(admin): contenido por páginas — índice, editor inline y editor de campo con versiones`
4. `e62561a feat(cms): cerrar brechas de contenido — WA fuente única, redes sociales, home, footer, header, contacto, cotización`
5. `3fcad9c fix(ci): gitleaks allowlist falso positivo faq.* — CI rojo desde run 30499078411`
6. `6cdba03 docs: HANDOFF CMS v2 + OPERATIONS apunta al nuevo índice de contenido`

**Fix CI anexo (hallado al validar los runs rojos desde #598):** los push a develop
fallaban desde 2026-07-29 23:18 en el job Gitleaks — la regla `generic-api-key`
marcaba los slugs `faq.*` de `seed-cms-ruta-a.mjs` como secretos (falso positivo).
Allowlist agregado en `.gitleaks.toml` (verificado local con gitleaks 8.30.1: el
rango exacto de los runs fallidos escanea limpio). Además `lib/cms-tokens.test.ts`
llegó sin formatear en un commit anterior y rompía el job Prettier — formateado en
el commit docs de este bloque. CI del push: gitleaks ✓, typecheck+lint+build ✓,
vitest ✓, E2E ✓, Lighthouse ✓.

---

## 3. Archivos

### Creados (16)

- `packages/db/prisma/migrations/20260730120000_add_cms_v2/migration.sql`
- `supabase/migrations/00000000000018_rls_cms_v2.sql`
- `packages/db/scripts/{cms-site-map.mjs, migrate-cms-v2.mjs, verify-cms-v2-parity.mjs}`
- `apps/web/app/admin/(panel)/contenido/page-icons.ts`
- `apps/web/app/admin/(panel)/contenido/paginas/[slug]/{page.tsx, field-row.tsx, create-field-form.tsx}`
- `apps/web/app/admin/(panel)/contenido/campos/[id]/{page.tsx, field-editor-form.tsx, version-history.tsx}`

### Eliminados (5) — admin viejo sin uso

`contenido/bloques/blocks-browser.tsx`, `bloques/nuevo/create-block-form.tsx`, `bloques/[id]/{block-editor-form.tsx, version-history.tsx}`, `contenido/configuracion/setting-row.tsx`.

### Modificados (principales)

`schema.prisma` · `lib/cms.ts` · `features/cms/{service.ts, schemas.ts, service.integration.test.ts}` · `contenido/actions.ts` + páginas contenido (índice/redirects) · `lib/admin-nav.ts` (+test) · `dashboard/page.tsx` · `email-templates/page.tsx` · `app/page.tsx` · `components/home/hero.tsx` · `components/{site-footer, site-header, shop-mega-menu}.tsx` · `app/{contacto, ayuda, cotizacion/[token]}/page.tsx` · `lib/wa.ts` (+test) · `app/admin/(panel)/integraciones/page.tsx` · `features/{checkout/service.ts, shipping/aveonline.ts}` (mensajes a rutas nuevas) · `Makefile` · `docs/OPERATIONS.md` · `tests/e2e/admin-inventory.spec.ts`.

---

## 4. Cómo se usa (para Lucy y para devs)

- **Editar contenido**: `/admin/contenido` → elige la página → edita inline (los cambios simples aplican al guardar; los textos largos tienen Publicar/Despublicar e historial).
- **Agregar un campo nuevo al CMS (dev)**: declararlo en `packages/db/scripts/cms-site-map.mjs` (sección correspondiente, con label + helpText + body por defecto) → `make migrate-cms-v2` → consumirlo con `<CmsText>` / `getSettingValue` (fallback = texto actual) → invalidar caché desde el admin.
- **Agregar una página/sección entera**: mismo archivo (`SITE_MAP.pages`), el migrador la crea; el admin la muestra sola en el índice.
