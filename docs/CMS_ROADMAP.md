# ROADMAP — Ecosistema CMS completo (CMS v2 → CMS total)

**Estado:** en ejecución · Base construida: CMS v2 (2026-07-30 — ver ADR-082/083/084 en DECISIONS.md)
**Propósito:** que el 100% del contenido visible del sitio sea administrable por una persona NO técnica desde `/admin/contenido`, con modularidad a futuro (listas, imágenes, banners, roles, preview) sin rehacer el modelo.

**Progreso (se actualiza con cada fase):**

- ✅ **C2** rol CMS_EDITOR — commit `06a8384`
- ✅ **B4** campos de lista sin JSON (CmsListItem) — commit `05fac56`
- ✅ **B2** páginas transaccionales (94 campos) — commit `0e9b52b`
- ✅ **B3** iconos/gradientes de categoría en `Category` — commit `73bbbfc`
- ✅ **B1** copy del /estudio (363 campos) — commit `ce90423`
- ✅ **B5** campos de imagen (type IMAGE) + mediateca — commit `e8d4dad`
- ✅ **B6** banners/promos administrables en home — commit `b7ed459`
- ✅ **C1** preview en vivo junto al editor — commit `87bda56`
- ✅ **C3** publicación programada — commit `14481a7`
- ✅ **C4** utilidades del admin de contenido — commit `6c04bde`
- ✅ **D1** auditoría de cobertura de contenido — commit `4a6d242`
- ✅ **D3** documentación estructural — commit `c7ca6d5`
- ✅ **E1** auditoría móvil del admin — commit `39f7e77`
- ✅ **E2** fixes móviles admin — commit `82b0248`
- ✅ **E3** auditoría + fixes móviles storefront — commit `0bf3868`
- ✅ **A1** verificación en producción (release + smoke) — smoke `release-check-a1`
- ✅ **A3** nightly con Supabase local en CI — corrida `30655283758`
- ✅ **D4** E2E del flujo de edición — corrida `30655678412`
- ✅ **A2** drop de tablas legacy — commit `c436195` (+ respaldo JSON)
- ✅ **B7** copy de autenticación al CMS (58 campos) — commit `b83c2e7`
- ✅ **B9** copy del área de cliente al CMS (118 campos) — commit `e5a4441`
- ✅ **B8** copy del checkout al CMS (160 campos) — commit `c153352`
- ✅ **E4** tablas del admin como tarjetas en móvil — commit `70cfed0`
- ✅ **C1 paso 2** modo edición in-place en el storefront — commit `ce38b8c`
- ✅ **Gestos del canvas del Estudio** verificados interactivamente — commit `406051a`
- ✅ **D2** observabilidad del CMS en `/admin/metricas` — commit `b4e7b92` · **roadmap original 20/20**

**Base sobre la que se parte (ya en producción, commit `bd1e427`):**

- Modelo `CmsPage → CmsSection → CmsField → CmsFieldVersion` (17 páginas, 33 secciones, 176 campos).
- Admin por páginas con edición inline, editor Markdown/JSON, historial de versiones con revert.
- Capa de lectura compatible (`lib/cms.ts`) con cache tag `cms` e invalidación desde el admin.
- Site map declarativo (`packages/db/scripts/cms-site-map.mjs`) + migrador idempotente (`make migrate-cms-v2`) + verificador de paridad.
- Tablas legacy `CmsBlock`/`CmsBlockVersion`/`SiteSetting` vivas como respaldo (DEPRECATED).

**Convenciones de este documento:** cada tarea indica los cambios de DB/migración que implica (o "sin migración"), archivos clave, dependencias y verificación. Estimaciones: **S** < medio día · **M** 1-2 días · **L** 3-5 días (trabajo asistido por agente como el de CMS v2).

---

## Modelo de datos objetivo (visión final)

```
CmsPage ─┬─ CmsSection ─┬─ CmsField ───── CmsFieldVersion (append-only, + publishAt en C3)
         │              │
         │              ├─ CmsListItem (B4: items de campos lista; position + subcampos JSON tipados)
         │              │
         │              └─ (fields type IMAGE apuntan a) ── CmsMedia (B5: asset en Storage + metadata)
         │
         └─ orden/título editables desde admin (C4)

AdminUser.role + CMS_EDITOR (C2: edita contenido, nada más)
Tablas legacy (CmsBlock/CmsBlockVersion/SiteSetting): DROP en A2
```

### Migraciones previstas (en orden de aplicación)

| #   | Nombre                                                | Fase     | Contenido                                                                                                                  |
| --- | ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0   | `20260730120000_add_cms_v2`                           | ✅ hecha | Modelo base + RLS                                                                                                          |
| 1   | `drop_cms_legacy`                                     | A2       | Drop `CmsBlock`, `CmsBlockVersion`, `SiteSetting` + enums `BlockFormat`, `BlockCategory`, `SettingType`, `SettingCategory` |
| 2   | `add_cms_list_items`                                  | B4       | Tabla `CmsListItem` + índice por `(fieldId, position)` + RLS                                                               |
| 3   | `alter_cms_field_type_add_image` + bucket `cms-media` | B5       | `ALTER TYPE "CmsFieldType" ADD VALUE 'IMAGE'` + tabla `CmsMedia` + bucket Storage + policies + RLS                         |
| 4   | `add_admin_role_cms_editor`                           | C2       | `ALTER TYPE "AdminRole" ADD VALUE 'CMS_EDITOR'` + matriz RBAC                                                              |
| 5   | `add_cms_publish_at`                                  | C3       | `CmsFieldVersion.publishAt TIMESTAMP` + índice parcial + job pg_cron                                                       |

---

## FASE A — Consolidación (sin deuda detrás)

> Objetivo: cerrar el ciclo de CMS v2 sin cabos sueltos. Todo es S.

### A1 — Verificación en producción

- Smoke manual: editar un texto de Inicio desde `/admin/contenido` → publicar → ver en `/`.
- Invalidar caché CMS (botón del índice) si no se hizo tras el deploy.
- Verificar emails transaccionales (usan `email.*` y settings) y /legal/*.
- Sin migración. **Verificación:** checklist firmado en HANDOFF.

> **✅ RESULTADO — certificado 2026-07-31 (release `6e86f94..3ec7f06` a `production`, 487 archivos).** Deploy verificado en vivo por señales del código nuevo: `X-Frame-Options: SAMEORIGIN` (C1), `/api/cron/cms-publish-scheduled` → 401 (C3 existe y exige secreto), `/admin/contenido/mediateca` → 307 a login (B5), home 200. Smoke **automatizado con Playwright contra el sitio en vivo** (`tests/e2e/release-check-a1.spec.ts`, queda como herramienta de verificación para futuros releases; admin temporal creado/borrado vía service role — el proyecto Supabase es compartido): **(1)** home + `/legal/privacidad` 200 con el texto original visible ✓ **(2)** caché CMS invalidado desde `/admin/contenido` ✓ **(3)** editar `home.categories.cta-all` → Guardar → Publicar → **la variante se ve en la home pública** → revertir → **la home vuelve al original** ✓ **(4)** dashboard admin a 375px sin overflow en prod (fix E2 verificado en vivo) ✓ — 4/4 en 31.7s. **Residual manual (no automatizable sin generar correos/pedidos reales):** disparar un email transaccional real (los templates `email.*` ya se verificaron contra la misma DB compartida en dev); se recomienda un pedido de prueba en la próxima ventana operativa.

### A2 — Drop de tablas legacy

- Pre-requisito: A1 OK + ≥3 días de producción estable.
- Migración `drop_cms_legacy` (drop tables + enums legacy).
- Borrar `packages/db/scripts/seed-cms.mjs`, `seed-cms-ruta-a.mjs` y target `seed-cms` del Makefile; quitar comentarios DEPRECATED del schema; ajustar `verify-cms-v2-parity.mjs` (ya no aplica → borrar o convertir en chequeo de integridad v2: campos publicados sin versión = 0).
- Grep final: 0 referencias a `cmsBlock`/`siteSetting` en código.
- **Verificación:** suite completa verde + migración aplicada en dev y producción.

> **✅ RESULTADO — certificado 2026-07-31, commit `c436195`.** Ventana acortada por decisión de la dueña (A1 certificado el mismo día, tablas inertes) con mitigación: **respaldo JSON completo previo** (330 filas: 116 CmsBlock + 172 CmsBlockVersion + 42 SiteSetting en `tmp/backups/cms-legacy-20260731.json`, fuera del repo). Migración `20260731130000_drop_cms_legacy` aplicada en la DB compartida (la FK circular `CmsBlock.publishedVersionId → CmsBlockVersion` exigió soltar la constraint antes del drop; la corrida fallida se resolvió con `migrate resolve --rolled-back`) y **verificada: 0 tablas y 0 enums legacy** (`BlockFormat`/`BlockCategory`/`SettingType`/`SettingCategory`). **Limpieza:** 13 scripts one-off que usaban el cliente legacy borrados (los 2 del roadmap + 11 históricos ya ejecutados) + target `seed-cms` del Makefile + comentarios/modelos del schema; `verify-cms-v2-parity.mjs` → **`verify-cms-v2-integrity.mjs`** (publicados sin versión / IMAGE apuntando a asset inexistente / LISTA con JSON inválido → **0 anomalías**: 637 campos publicados, 2 LISTA); migrador reescrito como puro upsert del site map (su uso vigente) y verificado (21 páginas/50 secciones, 0 campos sin versión); `prisma.cmsBlock`/`siteSetting` → **0 usos del cliente en código** (grep final: solo menciones en comentarios históricos). Tests ajustados: cleanup de `checkout/service.integration.test.ts` (39/39 ✓) y lectura `cod_enabled` de `audit-admin.spec.ts` → CmsField. **Evidencia:** suite 2721/2722 ✓ (el único fallo fue contención mía — migrador + focal + build en paralelo contra el pooler; los 2 archivos focales re-corridos limpios: cart 52/52 ✓, checkout 39/39 ✓) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.

### A3 — Nightly con Supabase staging (CI rojo actual #14)

- Crear proyecto Supabase de staging (hoy dev y producción comparten proyecto — riesgo ya documentado en audits).
- Configurar secrets `STAGING_DATABASE_URL`, `STAGING_DIRECT_URL`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON`, `STAGING_SUPABASE_SERVICE` en GitHub.
- Sin migración (infra). **Verificación:** Nightly verde corriendo rls-matrix + E2E admin/MFA.

> **✅ RESULTADO — certificado 2026-07-31, corrida verde `30655283758` (decisión del usuario: Supabase LOCAL en GitHub Actions, no proyecto externo).** El Nightly ahora levanta el stack completo de Supabase **en el propio runner** (`supabase start` desde `.github/ci/localstack` — workdir pelado para que el boot no auto-aplique migraciones) y aplica todo en orden: extensiones (pg_trgm/unaccent) → `prisma migrate deploy` → SQL de `supabase/migrations` con rol `supabase_admin` (el event trigger 014 exige superuser) → seeds de catálogo + CMS. **Ya no hacen falta secrets `STAGING_*` ni proyecto externo:** cada corrida es efímera, aislada y reproducible — el riesgo "dev/prod comparten proyecto" queda fuera de CI. Cobertura real activada: **rls-matrix de comportamiento** (57/57 tras codificar la postura de grants de prod en la migración `00000000000022_revoke_anon_table_grants.sql` — antes vivía solo en la DB de prod sin versión en el repo — y hacer la fixture AdminUser autónoma), **E2E admin-login + admin-mfa + estudio + cms-editing-flow (D4)** contra GoTrue local, y los tests de storage. **Exclusiones documentadas** (env `NIGHTLY_LOCALSTACK` en `vitest.config.ts`): `finalize-server-render` y `letter-tiles`, que exigen el universo de datos de la DB compartida de dev (diseños clonables con assets, letter sets — no reproducible con un seed; corren en local contra esa DB; hacerlas stack-agnostic queda como trabajo aparte). **Cadena de diagnóstico (10 corridas):** config path del workdir, typo en DIRECT_URL, pg_trgm ausente, event trigger sin privilegios, keys vacías por parseo de `supabase status`, CLI viejo por default y rate limit de `latest` (fijado a `2.111.0`), y la pieza final: **la CSP `connect-src` bloqueaba el auth del browser contra `http://localhost:54321`** — `AuthRetryableFetchError` descubierto instrumentando la spec (consola del browser); fix general: `connect-src` ahora deriva el origen de `NEXT_PUBLIC_SUPABASE_URL` (sirve para cualquier stack futuro, no solo el nightly). **Evidencia:** corrida `30655283758` ambos jobs verdes · spec admin-mfa pasa 2/2 local contra hosted (dev y prod build) · `security-headers` 16/16 con test nuevo del origen dinámico.

---

## FASE B — Cobertura total del contenido

> Objetivo: ningún texto visible quemado en código. Ordenado por impacto para Lucy.

### B1 — Copy del `/estudio` (el hueco grande que queda)

- Todo el copy del editor de personalización vive hardcodeado en componentes **client** (`app/estudio/**`) — el patrón ya aplicado en header sirve: resolver textos en server, pasar por props tipadas.
- Inventario primero: listar TODOS los literales visibles del Estudio (tooltips, botones, empty states, errores, ayudas).
- Site map: página `estudio` con secciones por pantalla/paso (`lienzo`, `plantillas`, `subida-fotos`, `exportar`…). Sin migración DB (campos vía site map + `migrate-cms-v2`).
- Esfuerzo **L** (es la superficie de copy más grande del sitio).
- **Verificación:** grep de literales en `app/estudio/**` reducido a identificadores técnicos; typecheck + tests.

> **✅ RESULTADO — certificado 2026-07-30, commit `ce90423`.** Página `estudio` en `/admin/contenido` con **11 secciones y 363 campos** (+3 `seo.page.estudio.*`): todo el copy visible y los nombres audibles (aria-label/alt/sr-only) del Estudio son administrables. En vez de props tipadas (habría tocado decenas de firmas), la resolución es **UNA query por prefijo `estudio.*`** en server (`getStudioTexts`, cache tag `cms`) inyectada al árbol client con `<StudioTextsProvider>`; cada componente lee `useStudioTexts()` sin cambiar props. Placeholders (`{n}`, `{producto}`, `{pieza}`, `{letra}`…) interpolados en runtime (`fillStudioText`/`splitStudioText`, conservando `<strong>`/`<span>` en JSX). **Exclusión deliberada** (dato de diseño, no copy editorial — mismo criterio del ADR de B3): paletas `NAME_TILE_THEMES`, nombres de color de swatches, moods de tipografías, objetos del comparador de tamaños y descripciones de presets de filtro (quedan como respaldo de datos; la UI lee `estudio.texto.filtro-*`). **Evidencia:** auditoría de literales en `app/estudio/**` limpia (0 strings visibles fuera del CMS) · migración idempotente aplicada + verificación DB: 363/363 publicados, 0 sin versión · `tsc` ✓ · `eslint --max-warnings 0` ✓ · `prettier` ✓ · vitest **2691 passed / 2 skipped / 0 failed** (164 archivos) · `next build` ✓.

### B2 — Páginas transaccionales restantes

- `/pedido/[token]`, `/rastrear`, `/unsubscribe`, `/checkout/gracias`, textos sueltos de `/mi-cuenta` (ya cubiertos parcialmente), `/status` residual.
- Site map: páginas `pedido`, `rastrear`, `transaccionales` según corresponda. Sin migración DB.
- Esfuerzo **M**. Dependencia: ninguna.

### B3 — Iconos/gradientes de categorías administrables

- Hoy: `CATEGORY_STYLES` e `ICONS` quemados por slug (`category-grid.tsx`, `shop-mega-menu.tsx`); una categoría nueva exige tocar código.
- **Decisión de dominio (documentar como ADR):** el icono/gradiente es dato de CATÁLOGO, no contenido editorial → columnas nuevas en `Category` (`icon String?`, `gradient String?`) + edición desde `/admin/categorias` (picker de icono lucide + gradiente de la paleta brand). NO va en el CMS.
- Migración: `add_category_visuals` (2 columnas; datos por defecto = estilos actuales por slug).
- Lectura: `listStorefrontCategories` devuelve los campos; fallback al mapa hardcodeado por slug.
- Esfuerzo **M**.

### B4 — Campos de lista (adiós al JSON crudo) — pieza estructural

- Problema: `footer.legal.links` se edita como JSON — inaceptable para no-técnicos. Y viene más: FAQs, pasos "así de fácil", banners (B6), links de columnas del footer.
- **Migración `add_cms_list_items`:** tabla `CmsListItem { id, fieldId → CmsField (Cascade), position Int, values Jsonb, createdAt/updatedAt }` + RLS deny-by-default + índice `(fieldId, position)`.
- Convención: un `CmsField` con `type: JSON` puede tener items; `values` sigue un mini-schema por campo declarado en el site map (ej. `footer.legal.links` → `[{ label: TEXT, href: URL }]`).
- **Admin:** UI de lista en el editor de campo: filas con inputs por subcampo, agregar/quitar, reordenar (↑↓ o drag), guardar = nueva versión publicada con el array serializado (compat: `body` del CmsField sigue siendo el JSON — la lectura pública NO cambia).
- **Migración de datos:** convertir `footer.legal.links` (JSON actual) a items; FAQs: evaluar migrar `faq.*` a una lista con `{pregunta, respuesta}` (decidir en ejecución; no obligatorio).
- **Lectura:** el helper actual de parse seguro se mueve a `lib/cms.ts` como `getCmsList(key, fallback)` tipado.
- Esfuerzo **L**. Dependencia: ninguna (pero B6 la usa).

### B5 — Campos de imagen (`type: IMAGE`) + mediateca mínima

- Hoy no hay forma de cambiar una imagen del sitio sin deploy (hero, banners, og-images estáticas).
- **Migración `alter_cms_field_type_add_image`:** `ALTER TYPE "CmsFieldType" ADD VALUE 'IMAGE'` + tabla `CmsMedia { id, bucket, path, alt, width, height, bytes, mime, createdBy, createdAt }` + RLS.
- **Storage:** bucket Supabase `cms-media` (público, límites de tamaño/tipo en policies; mismo patrón que buckets existentes — ver migraciones 005/006).
- **Admin:** uploader en el editor de campo (drag & drop, preview, alt obligatorio por a11y), y mediateca simple (lista de assets subidos con reutilizar).
- **Lectura:** `getCmsImage(key)` → `{ url, alt, width, height }` (URL firmada pública del bucket); fallback = asset actual del repo.
- Esfuerzo **L**. Dependencia: A3 recomendada (probar uploads contra staging, no contra prod compartido).

> **✅ RESULTADO — certificado 2026-07-31, commit `e8d4dad`.** Campos `type: IMAGE` en el CMS v2: el `body` del campo guarda el `CmsMedia.id` y la lectura pública resuelve `{ url, alt, width, height }` con `getCmsImage(key)` en `lib/cms.ts` (mismo cache tag `cms`; devuelve `null` ante campo faltante/sin publicar/asset borrado o cualquier error → fallback = asset del repo, regla de oro intacta). **Mediateca mínima:** bucket público `cms-media` (5 MB, jpg/png/webp/avif, URL pública inmutable con UUID, cache 1 año) + tabla `CmsMedia` con RLS deny-by-default y policies de escritura solo-admin (`is_active_admin()`, mismo patrón que product-images de la 005). **Pipeline de subida** (`lib/cms-media.ts`, mismo estándar que `uploadProductImage`): alt OBLIGATORIO (WCAG 1.1.1), MIME real por magic bytes (anti-polyglot: un .html renombrado no entra), dimensiones reales con sharp endurecido (`sharp-safe`) y borrado con guarda de uso — rechaza si lo usa el borrador de un campo o cualquier versión del historial (revertir nunca rompe una imagen publicada). **Admin:** uploader con preview en el editor del campo IMAGE (subir o reutilizar de la biblioteca), página `/admin/contenido/mediateca` (miniaturas, alt editable inline, dimensiones/peso, conteo de uso por campo, borrado protegido con confirmación), accesible también para el rol CMS_EDITOR (nav + actions con `ADMIN_ROLE_SETS.CONTENT`). **Sin campos IMAGE sembrados todavía** (0 en DB): la capacidad queda lista — primer uso previsto = B6 (banners) o creación directa desde el admin. **Fix anexo:** timeout de `clone-design-for-edit.integration.test.ts` a 30s (latencia del pooler pgbouncer; el caso READY→DRAFT toma ~7s — calibración de infraestructura, sin cambio de aserciones). **Evidencia:** migración `20260730160000_alter_cms_field_type_add_image` + storage `00000000000020_storage_cms_media.sql` aplicadas en dev y verificadas por query (enum `CmsFieldType` incluye `IMAGE` · `CmsMedia.rowsecurity=true` · bucket con límites de tamaño/MIME + 3 policies `cms_media_admin_*`) · `tsc` ✓ · `eslint --max-warnings 0` ✓ · `prettier` ✓ · vitest **2709 passed / 2 skipped / 0 failed** (166 archivos; +16 unit del pipeline `cms-media`, +3 integración `getCmsImage`: SETTING publicado resuelve, BLOCK sin publicar → null, asset fantasma → null) · `next build` ✓.

### B6 — Banners/promos administrables en home

- Con B4 + B5: campo lista `home.banners` (items `{ imagen: IMAGE, titulo: TEXT, enlace: URL, activo: BOOLEAN }`) + sección en home que itera (hoy no existe; la categoría MARKETING ya existe en el enum legacy de categorías por compat).
- Sección nueva en el site map (`inicio/banners`) + componente storefront nuevo.
- Esfuerzo **M** (con B4/B5 hechas). Dependencias: B4, B5.

> **✅ RESULTADO — certificado 2026-07-31, commit `b7ed459`.** Campo lista `home.banners` (sección `banners` de la página `inicio`, kind BLOCK con flujo borrador→publicar) con subcampos `imagen` (IMAGE — id de la mediateca), `titulo`, `enlace` y `activo` (BOOLEAN, select Sí/No); creado vía site map + `migrate-cms-v2` y publicado con body `[]` — **la home de hoy no cambia hasta que Lucy agregue el primer banner** (regla de oro). **Editor de listas extendido** (B4): subcampos IMAGE renderizan el control de la mediateca (subir/elegir, B5) y BOOLEAN un select Sí/No (default "true" en filas nuevas). **Reader** `getCmsBanners(key)` en `lib/cms.ts` (cache tag `cms`): parsea la lista publicada, filtra `activo ≠ "false"`, resuelve los assets en batch (misma derivación de URL pública que `getCmsImage`), DESCARTA items con asset borrado (un banner roto no tumba la franja) y devuelve `[]` ante cualquier fallo → la sección no se renderiza. **Storefront:** `<HomeBanners>` tras el hero — tira horizontal con scroll-snap (sin librería de carrusel; con 1 banner ocupa el ancho completo), `next/image` con dimensiones reales y título en overlay. **Refuerzo de seguridad de datos detectado en ejecución:** la guarda de borrado de la mediateca (B5) comparaba `body = id` y NO veía los ids embebidos en el JSON de campos lista — ahora `deleteCmsMedia` y `getCmsMediaUsage` usan `contains` (un cuid de 25 chars no aparece en prosa por accidente; el mensaje lista las keys). **Evidencia:** migración aplicada y verificada por query (`home.banners` publicado en sección `banners`/`inicio`, metadata listSchema intacta, paridad del migrador OK) · integración `features/cms/service.integration.test.ts` **44/44** ✓ (+4 B6: resolución de activos/filtro inactivos/descarte fantasmas, sin publicar → [], JSON inválido → [], guarda de borrado con id embebido + mapa de uso) · unit `cms-media` 15/15 ✓ · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.

### B7 — Copy de autenticación al CMS (agregada 2026-07-31, backlog post-roadmap)

- Las pantallas de acceso (`/login`, `/registro`, `/recuperar-password`, `/confirmar-codigo`, `/restablecer-password` + marco común) tenían 49 literales quemados en componentes client (medidos por el auditor D1). Moverlos al CMS con el patrón B1: site map → resolver en server → props tipadas con fallback exacto.
- Esfuerzo **S-M**. Dependencia: ninguna.

> **✅ RESULTADO — certificado 2026-07-31, commit `b83c2e7`.** Página `auth` en `/admin/contenido` con **6 secciones y 58 campos** (layout, login, registro, recuperar, confirmar, restablecer): todo el copy visible de las pantallas de acceso es administrable. Resolución con el patrón B1: `getAuthTexts()` (`app/(auth)/auth-texts.server.ts`) hace **UNA query por prefijo `auth.*`** (cache tag `cms`, guard E469) y sobreescribe `DEFAULT_AUTH_TEXTS` campo a campo — los defaults son el copy exacto pre-CMS (regla de oro). Cada `page.tsx` (server) resuelve y pasa props tipadas al formulario client; las interpolaciones (`{email}`, `{nombre}`) se reemplazan server-side. El texto legal del checkbox de autorización (Ley 1581) quedó como campo MARKDOWN `auth.registro.consent` (enlaces a términos/privacidad preservados con react-markdown + sanitize client-side). La medición del auditor D1 sube al regenerar el baseline: los 49 literales de `app/(auth)` salen del stock de copy quemado. **Evidencia:** migración verificada por query (58/58 campos publicados, página `auth` con sus 6 secciones, 0 sin versión) · integración `getAuthTexts` contra los campos reales (estructura completa, placeholders intactos) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.

### B8 — Copy del checkout al CMS (agregada 2026-07-31, backlog post-roadmap)

- El flujo de compra (marco, stepper, resumen del pedido, formulario de datos, cotización de 1 paso, selección de envío, pago y legales en el punto de venta) tenía ~127 literales quemados (medidos por el auditor D1). Mismo patrón B7/B9: secciones nuevas en la página `checkout` del site map → `getCheckoutTexts()` por prefijo → props tipadas con fallback exacto.
- Esfuerzo **M**. Dependencia: ninguna (usa la página `checkout` ya existente).

> **✅ RESULTADO — certificado 2026-07-31, commit `c153352`.** La página `checkout` del CMS crece con **8 secciones nuevas y 160 campos** (`checkout.*`): marco (header/footer del layout), pasos del stepper, resumen del pedido, datos (contacto, dirección urbana/rural con ayudas y nombres audibles aria, direcciones guardadas, facturación y consentimiento Ley 1581 en MARKDOWN), cotización de 1 paso (modo catálogo), envío (loading, errores, lista con nota MARKDOWN), pago (revisión + cupón) y métodos de pago (Wompi/contraentrega + términos y bloque legal de retracto/garantía). Resolución: `getCheckoutTexts()` (`app/checkout/checkout-texts.server.ts`, patrón B7 — una query por prefijo `checkout.*`, defaults exactos pre-CMS, guard E469, structuredClone); las páginas server resuelven y pasan props tipadas a los componentes client. **Evidencia:** migración verificada por query (187 campos `checkout.*` publicados, 0 sin versión; 929 BLOCK totales) · integración `getCheckoutTexts` contra los campos reales (estructura completa: consent, legales, arias) · QuoteForm 5/5 ✓ · auditoría D1: `app/checkout` 100% cubierto (4 aria-labels detectados en ejecución y sembrados como `checkout.datos.*-aria`) · baseline ratchet regenerado (umbral 20.16% → 36.77%, 479 → 208 huecos fijados) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.

### B9 — Copy del área de cliente (`/mi-cuenta`) al CMS (agregada 2026-07-31, backlog post-roadmap)

- El área de cliente (navegación, perfil, pedidos y detalle, retracto/garantía, direcciones, diseños, favoritos, reseñas, seguridad, eliminación de cuenta) tenía ~96 literales quemados (medidos por el auditor D1). Mismo patrón B7: ampliar la página `mi-cuenta` del site map → `getAccountTexts()` por prefijo → props con fallback.
- Esfuerzo **M**. Dependencia: ninguna (usa la página `mi-cuenta` ya existente).

> **✅ RESULTADO — certificado 2026-07-31, commit `e5a4441`.** La página `mi-cuenta` del CMS crece con **12 secciones nuevas y 118 campos** (`account.*`): navegación (7 pestañas + logout + aria + back-links), perfil, pedidos (lista), pedido (detalle: banner COD, stepper, cancelación, totales, dirección, envío, CTA reseña), retracto y garantía (incl. nota legal en MARKDOWN), direcciones (CRUD completo + aviso de formato viejo), diseños (compartir/archivar), favoritos, reseñas (badges + borrar), seguridad y eliminación de cuenta (advertencias legales en MARKDOWN, palabra de confirmación con nota de que cambiarla exige tocar la acción). Resolución: `getAccountTexts()` (`app/mi-cuenta/account-texts.server.ts`, patrón B7 — una query por prefijo, defaults exactos, guard E469). Interpolaciones server-side: `{email}` en perfil, `{n}` en conteos, `{total}` en el banner COD, `{estado}` en cancelación, `{fecha}` en garantía, `{palabra}` en la confirmación de borrado (con split que conserva el estilo original). **Evidencia:** migración verificada por query · integración `getAccountTexts` contra los campos reales · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.

---

## FASE C — Experiencia de edición

### C1 — Preview en vivo junto al editor

- Editor de página con panel lateral: iframe de la página pública (`CmsPage.path`) que se recarga tras publicar. Sin cambios de DB.
- Paso 2 (después, opcional): edición in-place — el código ya referencia el endpoint planeado `/api/admin/cms/by-key/[key]` (sub-bloque K): overlay en el storefront visible solo para admins logueados (banner "modo edición", click en texto → salta al editor del campo).
- Esfuerzo **M** (iframe) / **L** (in-place).

> **✅ RESULTADO — certificado 2026-07-31, commit `87bda56`.** Vista previa en vivo en el editor de página (`/admin/contenido/paginas/[slug]`): cuando la CmsPage tiene ruta pública, el editor queda a la izquierda y un panel con el **iframe de la página pública** a la derecha (sticky en `xl`, apilado debajo en pantallas menores), con recarga manual, abrir-en-pestaña y mostrar/ocultar. **Recarga automática tras guardar/publicar:** la señal es el max `updatedAt` de los campos de la página — toda Server Action que guarda/publica/despublica toca ese timestamp, re-renderiza la página admin y el iframe se recarga solo (el caché `cms` ya quedó invalidado por la action, así que la preview trae el contenido fresco). La preview muestra lo PUBLICADO (un borrador se ve al publicar — indicado en el panel). **Cambio de postura de framing (deliberado):** `X-Frame-Options: DENY → SAMEORIGIN` + `frame-ancestors 'self'` nuevo en la CSP — el admin y el storefront comparten origen, así que la preview funciona mientras el framing EXTERNO (clickjacking) sigue bloqueado en las dos capas; documentado en `lib/security-headers.ts`. El paso 2 (edición in-place con overlay en el storefront) queda como trabajo futuro opcional — no hace parte de esta certificación. **Evidencia:** unit `security-headers` 15/15 ✓ (expectativa SAMEORIGIN + `frame-ancestors 'self'` en prod y dev) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.
>
> **✅ RESULTADO paso 2 — certificado 2026-08-01, commit `ce38b8c`.** Modo edición in-place en el storefront: el botón «Editar en el sitio» del índice de contenido siembra la cookie `lucams_cms_edit` (8h, httpOnly, solo tras el guard de contenido) y abre la portada; con la cookie activa `<CmsText>`/`<CmsMarkdown>` (171 usos, toda la superficie Ruta A) anotan su salida con `data-cms-key` y el root layout monta el `<CmsEditOverlay>`: banner fijo arriba + click delegation en captura — cualquier texto CMS clickeado abre su editor vía la puerta `/admin/contenido/campos/por-key/[key]` (redirige al editor real por id). Sin cookie todo se renderiza exactamente como antes (regla de oro). **Hallazgo de verificación y decisión de diseño:** el prender/apagar NO usa Server Action + `redirect()` — el Router Cache del cliente seguía sirviendo la página con el estado viejo del modo (bug reproducido en la spec: cookie ya borrada y la página aún anotada); prender y salir van por un route handler MPA (`POST /api/admin/cms/edit-mode` → 303 → carga completa, HTML fresco garantizado), enable con guard de rol de contenido + auditoría, disable sin guard (limpia la cookie propia). El overlay quedó ARRIBA (z-9500): abajo colisionaba con el banner de cookies (z-9000, interceptaba el click de «Salir»). **Evidencia:** spec E2E local `tests/e2e/cms-edit-mode.spec.ts` verde (41.5s — admin temporal: prender → banner + `data-cms-key` en el hero → click en el título → editor del campo → Salir → banner y anotaciones fuera) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.

### C2 — Rol CMS_EDITOR ( segregación real de acceso )

- Hoy TODO el contenido es SUPERADMIN-only: Lucy necesita el rol máximo para editar textos — innecesario y riesgoso.
- **Migración `add_admin_role_cms_editor`:** `ALTER TYPE "AdminRole" ADD VALUE 'CMS_EDITOR'`.
- RBAC (`lib/admin-rbac.ts`): `ROUTE_ROLES["/admin/contenido"] = SUPER | CMS_EDITOR`; el guard de actions acepta ambos; el menú filtra todo lo demás para ese rol (solo ve Contenido).
- `/admin/usuarios`: permitir asignar el rol.
- Esfuerzo **M**. Dependencia: ninguna. (Nombre tentativo; alinear con convención de roles existente SUPERADMIN/MANAGER/FULFILLMENT.)

### C3 — Publicación programada

- **Migración `add_cms_publish_at`:** `CmsFieldVersion.publishAt TIMESTAMP?` + índice parcial `WHERE "publishAt" IS NOT NULL`.
- Job pg_cron (mismo patrón que jobs existentes, migración SQL de supabase/migrations): cada 5 min publica versiones con `publishAt <= now()` llamando un endpoint interno firmado (`x-cron-secret`).
- Admin: date-picker "Publicar el…" en el editor de campo (útil para campañas/navidad).
- Esfuerzo **M**. Dependencia: ninguna.

> **✅ RESULTADO — certificado 2026-07-31, commit `14481a7`.** Publicación programada completa: `CmsFieldVersion.publishAt` (migración `20260731120000_add_cms_publish_at` con índice PARCIAL — Prisma no los expresa, vive solo en el SQL y va documentado en el schema) + job pg_cron `lucams-cms-publish-scheduled` cada 5 min (migración `00000000000021_pgcron_cms_publish.sql`, mismo patrón que 015/016: secretos en Vault, header `x-cron-secret`, guardado e idempotente) que llama al endpoint firmado `GET /api/cron/cms-publish-scheduled` — publica las versiones vencidas, invalida el tag `cms` (`revalidateTag("cms", "max")` — Next 16 exige perfil), heartbeat + ErrorLog como los demás crons. **Service:** `scheduleCmsFieldPublish` (una sola programación vigente por campo — programar limpia las demás; exige ≥1 min en el futuro; rechaza versiones ya publicadas), `unscheduleCmsFieldPublish` y `publishScheduledCmsFields` (idempotente; devuelve las keys publicadas). **Admin:** date-picker «Programar» junto al botón Publicar del editor de campo — la hora elegida es **hora de Colombia** (UTC-5 fijo, documentado; el input se convierte a UTC en la action), badge «Sale el …» con opción de quitar la programación, badge «Programada» en el historial de versiones y noticias `?scheduled/unscheduled`. **Evidencia:** migraciones aplicadas y verificadas por query (columna `publishAt`, índice parcial `WHERE publishAt IS NOT NULL`, job agendado `*/5 * * * *` en `cron.job`) · integración **51/51** ✓ (+4 C3: una sola vigente, rechazos, unschedule, publishScheduled publica vencidas/salta futuras/idempotente con round-trip `getCmsBlock`) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓ · CI verde (run 30614061591).

### C4 — Utilidades del admin de contenido

- Mover campo entre secciones, duplicar campo, renombrar secciones/páginas desde admin (hoy el service ya tiene `updateCmsPage`/`updateCmsSection`; falta la UI).
- Vista "Solo borradores" (todos los cambios sin publicar del sitio en una sola lista, con publicar-en-lote).
- Esfuerzo **S-M** cada una. Sin migración.

> **✅ RESULTADO — certificado 2026-07-31, commit `6c04bde`.** Las 4 utilidades, sin cambios de DB: **(1) Vista «Solo borradores»** (`/admin/contenido/borradores`): todos los campos con cambios sin publicar o nunca publicados (`listCmsDraftFields`), con publicar individual y «Publicar todo» en lote (`publishAllCmsDraftsAction` — publica la última versión de cada uno, una sola auditoría `cms.field.publish_all` + un solo `updateTag("cms")`); enlace con conteo desde el índice de contenido. **(2) Renombrar páginas/secciones:** formularios SERVER sin JS (`<details>/<summary>` nativo — `PageRenameForm` como tarjeta al inicio del editor de página, `SectionRenameForm` como lápiz junto a cada título de sección) sobre `updateCmsPage`/`updateCmsSection` (ya existían) con zod + auditoría. **(3) Mover campo a otra sección** (`moveCmsFieldToSection`): tarjeta en el editor del campo con select agrupado por página (`listCmsPageSections` ligero); no toca contenido ni publicación (no invalida `cms`). **(4) Duplicar campo** (`duplicateCmsField`): copia tipo/metadata (listSchema incluido) e items de lista, y nace como **borrador sin publicar** — duplicar nunca cambia el sitio vivo; valida key (formato + unicidad) y redirige al editor de la copia. **Evidencia:** integración **51/51** ✓ (+3 C4: bandeja de borradores incluye/excluye correcto, mover + validación de destino + no-op, duplicar con items y versión borrador + validaciones de key) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓ · ruta agregada al inventario E2E admin.

---

## FASE D — Gobierno y calidad continua

### D1 — Auditoría de cobertura de contenido (anti-regresión)

- Script `packages/db/scripts/audit-content-coverage.mjs`: escanea el JSX de `app/**` y `components/**` buscando literales en español visibles para el usuario que no pasen por `CmsText`/`getSettingValue`/props CMS → reporte con % de cobertura por página.
- Gate opcional en CI: falla si la cobertura baja del umbral actual (ratchet, mismo patrón que coverage).
- Esfuerzo **M**.

> **✅ RESULTADO — certificado 2026-07-31, commit `4a6d242`.** Auditor con **AST de TypeScript** (no regex): recorre `app/**` y `components/**` del storefront (excluye admin/api/internal/ui/tests) y recolecta texto JSX + atributos visibles (`placeholder`/`title`/`aria-label`/`alt`); clasifica como CUBIERTO el `fallback` de `CmsText`/`CmsMarkdown`/`CmsSetting`, los argumentos de resolvedores (`getSettingValue`, `getCmsList`, `getCmsBanners`, `getCmsImage`, `getStudioTexts`, `getPageSeo`, `fillStudioText`, `splitStudioText`) y los defaults `studio-texts*` (B1). Heurística de español: tildes/¿¡, stopwords y vocabulario UI. Reporte con % por área + global. **Ratchet doble** vía baseline commiteado (`content-coverage-baseline.json`): falla si aparece UN literal nuevo no cubierto o si el % global baja del umbral. **Medición inicial: 121/600 = 20.16% global** — los 479 sin cubrir son huecos reales conocidos (auth, checkout, mi-cuenta, PDP, 3D views del estudio: fuera del alcance CMS de las fases B); el valor del gate es congelarlos y que ninguna página nueva meta copy quemado. Gate en el job `quality` de CI tras el lint; target `make audit-content` para el reporte local. **Evidencia:** `--check` exit 0 con baseline y **exit 1 con violación sembrada** (probe `ratchet-probe-tmp.tsx`, detecta literal nuevo + caída del %; verificado local) · CI verde con el gate activo (run 30630783542, job Typecheck+Lint+Build) · `prettier` ✓. Alcance documentado en el script: copy JSX visible; no metadata SEO estática ni mensajes de .ts. **Post-fix (mismo día, commit `b385fde`):** el fingerprint del ratchet era `archivo:línea :: texto` y cualquier edición que desplazara líneas marcaba literales ya fijados como "nuevos" — CI rojo real al día siguiente (run 30635214822, 3 falsos positivos en `back-in-stock-button.tsx` tras el fix E3 que movió 3 líneas). Fingerprint corregido a `archivo :: texto` con semántica de multiconjunto (duplicados cuentan); baseline regenerado; gate re-verificado en ambos sentidos.

### D2 — Observabilidad del CMS

- Card en `/admin/metricas`: campos totales, borradores sin publicar > 7 días, campos nunca editados desde su seed (candidatos a revisar), última invalidación de caché.
- Sin migración (queries sobre el modelo). Esfuerzo **S-M**.

> **✅ RESULTADO — certificado 2026-08-01, commit `b4e7b92`.** Sección «Contenido del sitio (CMS)» en `/admin/metricas` (ruta SUPERADMIN-only: no listada en `ROUTE_ROLES` → cae a SUPER; los enlaces a `/admin/contenido` son seguros para ese rol): 4 KPIs calculados en vivo con `getCmsObservabilityStats()` (`features/cms/service.ts`, sin migración — queries sobre el modelo + auditoría, agregado en vuelo como las métricas de ventas). **Campos administrables** (vivos, no archivados) · **Cambios sin publicar** (misma regla `cmsFieldHasDraft`; trend de alerta cuando alguno supera `CMS_STALE_DRAFT_DAYS = 7` días, medido por el `createdAt` de la última versión) · **Sin editar desde su carga inicial** (UNA sola versión con `createdBy` NULL: toda edición crea versión append-only y toda creación manual deja autor — definición validada con sonda contra la DB: 854/854 campos del seed local cumplen ambas condiciones) · **Última invalidación manual de caché** (última acción `cms.cache.refresh` del `AdminActionLog` — el dato operativo del runbook post-deploy; las ediciones desde el admin invalidan solas con `updateTag`). Enlaces directos a «Páginas del sitio» y «Cambios sin publicar». **Evidencia:** integración **56/56** ✓ (+2 D2: totales/borradores/viejos/sin-editar como **deltas sobre la baseline** — independientes del estado de la DB — y round-trip de `lastCacheRefresh` con limpieza exacta por id) contra el stack Supabase LOCAL · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · CI verde (run `30685588461`, 7/7 jobs). Con D2 el **roadmap ORIGINAL queda 100% certificado (20/20 fases A1–E3)**.

### D3 — Documentación estructural

- `docs/ARCHITECTURE.md`: sección del modelo CMS v2 (hoy no existe).
- `docs/CONVENTIONS.md`: "cómo agregar un campo CMS" (site map → migrate-cms-v2 → consumo con fallback → invalidar caché).
- `docs/DECISIONS.md`: ADR del modelo v2 + ADR de B3 (iconos en Category, no en CMS) + ADR de B4 (listas como items + JSON serializado en body por compat).
- Esfuerzo **S**.

> **✅ RESULTADO — certificado 2026-07-31, commit `c7ca6d5`.** Los 3 entregables escritos con el estado real del roadmap (incluye B5/B6/C1-C4/D1, no solo la foto original de v2): **ARCHITECTURE.md** — sección nueva «CMS v2 — contenido administrable» junto al modelo de datos: diagrama de las 4 tablas + CmsListItem/CmsMedia/publishAt, site map declarativo, API de lectura con regla de oro, superficie admin completa, referencias a los ADR. **CONVENTIONS.md** — ítem 21 «CMS — agregar un campo de contenido administrable»: el flujo de 4 pasos (site map → `make migrate-cms-v2` → consumo con fallback → invalidar caché) + reglas asociadas (regla de oro, ratchet de cobertura con instrucciones de regeneración del baseline, listas B4, imágenes B5, publicación programada C3). **DECISIONS.md** — ADR-082 (modelo CMS v2 con key histórica estable), ADR-083 (icono/gradiente de categoría: dato de catálogo, no CMS — con el criterio reutilizable «qué dice el sitio vs cómo se ve la entidad»), ADR-084 (listas: items de edición tipados + JSON serializado como body público por compat). **Evidencia:** `prettier` ✓ en los 3 documentos · TOC de CONVENTIONS actualizado · ADRs numerados en secuencia (último era ADR-081).

### D4 — E2E del flujo de edición

- Playwright (con staging de A3): login admin → editar campo de Inicio → publicar → ver el cambio en `/` → revertir versión.
- Esfuerzo **M**. Dependencia: A3.

> **✅ RESULTADO — certificado 2026-07-31, corrida verde `30655678412` (A3 resuelta con Supabase local en CI).** Spec `tests/e2e/cms-editing-flow.spec.ts` corriendo en el Nightly contra el stack local: login admin (usuario temporal creado/borrado vía service role) → edición inline de `home.categories.cta-all` en el editor de página → Guardar borrador → Publicar → **el texto nuevo se ve en `/`** → revertir desde el historial de versiones del editor de campo ("Volver a esta") → **`/` vuelve al texto original**. El flujo completo de edición queda gateado de forma continua (nightly 06:00 UTC + on-demand). Compañera de `release-check-a1.spec.ts` (mismo flujo pero contra producción, usada para el smoke A1 del release). **Evidencia:** corrida `30655678412` ambos jobs verdes con la spec incluida en el filtro del Nightly.

---

## FASE E — Experiencia móvil (agregada por pedido del usuario, 2026-07-30)

> Hallazgo del usuario: "la versión móvil para capa cliente y capa admin está poco eficiente, sobre todo capa admin". El admin se diseñó desktop-first; Lucy opera desde el celular con frecuencia.

### E1 — Auditoría móvil admin (alta prioridad)

- Recorrido con viewport móvil (375px) por las pantallas admin críticas: contenido (índice, editor de página, editor de campo, editor de lista), pedidos, cotizaciones, productos, dashboard.
- Inventario de problemas: tablas con scroll horizontal, formularios que no apilan, botones/toolbars que desbordan, modales que no caben, sidebar que tapa contenido.
- Esfuerzo **S** (auditoría con screenshots por pantalla).

> **✅ RESULTADO — certificado 2026-07-31, commit `39f7e77`.** Tour automatizado con Playwright (`tests/e2e/mobile-admin-audit.spec.ts`, queda como herramienta de regresión visual para E2): viewport 375×812, admin temporal creado/borrado por la propia spec, screenshot full-page + medición objetiva por pantalla (9 pantallas: dashboard, índice contenido, editor de página, editor de lista, mediateca, borradores, pedidos, cotizaciones, productos). **Hallazgo dominante (P0):** el shell móvil está roto — la topbar móvil es hija de un contenedor `flex` en fila (`admin-shell.tsx`) y renderiza como **columna vertical que se come ~60% del ancho**, dejando ~147px útiles de 375px en TODAS las pantallas (el drawer hamburguesa ya existe; solo está roto el layout que lo contiene — la topbar debería ser barra superior fija). **P1:** las tablas (pedidos, productos, cotizaciones) muestran solo la primera columna cortada sin indicación; en borradores el botón Publicar individual queda cortado (solo se puede «Publicar todo»). **P2:** sin breadcrumb/contexto en móvil (el topbar desktop se oculta sin reemplazo). **P3/P4/P5 (buenas noticias):** los editores de contenido (índice, página, lista, mediateca), el dashboard y los filtros **ya apilan correctamente** — con el shell arreglado quedan usables; la vista previa C1 apila debajo como se diseñó. Inventario completo con evidencia por screenshot en la auditoría E1 (2026-07-31 — auditorías históricas consolidadas fuera del repo; spec `tests/e2e/mobile-admin-audit.spec.ts` queda como herramienta de regresión). Orden propuesto para E2: shell (P0+P2) → tablas→tarjetas (P1) → barrido fino re-corriendo la spec.

### E2 — Fixes móviles admin

- Admin shell: navegación colapsable/hamburguesa en móvil (hoy sidebar permanente).
- Tablas admin → tarjetas apiladas en móvil (patrón responsive del repo si existe) o scroll horizontal controlado con indicación visual.
- Formularios de contenido: campos y acciones apilados, botones de ancho completo, teclado correcto por tipo (email/url/tel ya da el tipo de input — verificar).
- Editor de campo/lista usable en móvil (preview apilado debajo del editor).
- Esfuerzo **L**.

> **✅ RESULTADO — certificado 2026-07-31, commit `82b0248`.** Fixes de los hallazgos P0-P3 de E1, verificados **re-corriendo la misma spec de auditoría** (antes/después en `tmp/screenshots/e1-antes/` vs `tmp/screenshots/e1/`): **(P0+P2) Shell** — la causa raíz era UNA clase: el contenedor raíz de `admin-shell.tsx` era `flex` (fila) siempre, así que la topbar móvil renderizaba como columna comiéndose ~60% del ancho; ahora `flex-col lg:flex-row` y la topbar queda **barra superior fija** con logo, **sección actual** (`labelForPath` — antes no había contexto en móvil) y hamburguesa (el drawer ya existía). Ancho útil: ~147px → 375px en todo el admin; el editor de página pasa de 11.941px a 7.035px de alto. **(P1) Tablas** — `AdminTable` ya tenía scroll horizontal (`overflow-x-auto` + `minWidth`) pero nada lo indicaba: ahora degradado de borde derecho + pista «Desliza para ver más columnas →`, solo `< sm`. Con eso pedidos/cotizaciones/productos/borradores son usables en móvil (Publicar individual de borradores accesible con el scroll). **(P3)** la edición inline, filtros y formularios de contenido quedaron usables sin cambios extra al recuperar el ancho (verificado visual: input + Guardar completos). **Pendiente deliberado documentado:** tablas como tarjetas apiladas (salto de comodidad, M por pantalla) — el scroll con pista es el piso usable. Esfuerzo real **S** (una clase de layout + affordance de tabla): la auditoría E1 pagó exactamente lo prometido. **Evidencia:** re-auditoría Playwright 9/9 pantallas ✅ con verificación visual de las 4 críticas (dashboard, índice, editor, pedidos) · `tsc`✓ ·`eslint`✓ ·`prettier`✓ ·`next build` ✓.

### E3 — Auditoría + fixes móviles storefront (capa cliente)

- Recorrido móvil por home, PDP, carrito, checkout, estudio (el Estudio en móvil es crítico: canvas + gestures).
- Fixes de los hallazgos principales.
- Esfuerzo **M-L** según hallazgos de la auditoría.

> **✅ RESULTADO — certificado 2026-07-31, commit `0bf3868`.** Tour Playwright a 375×812 por 6 pantallas del cliente (home, catálogo, PDP, carrito, checkout, estudio) con medición objetiva de overflow + revisión visual (auditoría E3, 2026-07-31 — auditorías históricas consolidadas fuera del repo; spec `tests/e2e/mobile-storefront-audit.spec.ts` queda como regresión móvil del storefront, compañera de la de admin de E1). **El storefront está en buena forma móvil**: un solo defecto objetivo — la PDP desbordaba 22px (397 vs 375) por el formulario «Avísame cuando vuelva» (input `flex-1` sin `min-w-0` empujaba el botón fuera del viewport); fix canónico `min-w-0`, verificado con sonda de elementos desbordados y **re-auditoría: 0/6 pantallas con overflow**. Revisión visual: home (hero, grilla, carruseles, footer), catálogo, carrito y Estudio (modal de bienvenida + banner cookies, experiencia app-like) apilan y se leen correctamente; `/checkout` con carrito vacío responde 404 (esperado — exige items). **Fuera de alcance, documentado:** gestos del canvas del Estudio (pinch/zoom/drag) — no los cubre una auditoría de screenshots; van a prueba interactiva (territorio D4). Esfuerzo real **S** (un hallazgo, una clase). **Evidencia:** re-auditoría 0/6 ✓ · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.

### E4 — Tablas del admin como tarjetas en móvil (agregada 2026-08-01, backlog punto 5)

- El pendiente deliberado de E2: las ~25 tablas del panel (todas pasan por `AdminTable`) eran usables en móvil solo con scroll horizontal + pista. Convertir cada fila en una tarjeta apilada con rótulos por columna, sin reescribir las 25 páginas.
- Esfuerzo **S-M** (un solo punto de palanca: el componente compartido).

> **✅ RESULTADO — certificado 2026-08-01, commit `70cfed0`.** Las ~25 tablas del admin se ven como **tarjetas apiladas** en móvil (<640px) con UNA sola intervención en el componente compartido: `<AdminTableAutoCards>` (cliente, montado por `AdminTable`) lee los encabezados del `<thead>`, etiqueta cada `<td>` con `data-label` y activa `.admin-cards-on` en el wrapper — el CSS de `globals.css` convierte tabla→bloques, cada fila en tarjeta con borde brand y cada celda en «rótulo: valor» (`td::before { content: attr(data-label) }`). Filas con celdas ≠ columnas (colspan de empty-states) quedan a ancho completo sin rótulo; un MutationObserver re-etiqueta tras navegación RSC (ordenar/filtrar). **Degradación sin JS intacta:** sin hidratar no se activa nada y queda el scroll + pista «Desliza…» de E2 (piso usable). **Evidencia:** test de componente 4/4 ✓ (etiquetado, colspan, re-etiquetado por observer, sin-thead no activa) · spec de auditoría móvil E1 re-corrida: **0/9 pantallas con overflow** + verificación visual de las tarjetas en pedidos/productos (rótulo a la izquierda, valor/badge a la derecha) · `tsc` ✓ · `eslint` ✓ · `prettier` ✓ · `next build` ✓.

---

## Cómo retomar este trabajo (desde esta u otra sesión)

**Si reanudas ESTA sesión** (`kimi --continue`, `kimi --session`, o `/sessions` dentro del TUI): el objetivo (goal) y la lista de tareas siguen vivos — basta decir "continúa" o `/goal resume`.

**Si abres una sesión NUEVA**: el goal no se transfiere (vive en la sesión), pero el estado completo del trabajo está en el repo. Pega este prompt de arranque:

> Retoma la ejecución del ecosistema CMS de este repo (si es lo que te toca). El plan y el progreso por fases con evidencias están en ESTE documento; el estado operativo del PROYECTO completo y el arranque para sesiones nuevas están en `docs/STATE.md` (resumen actual + bitácora). El roadmap CMS y el backlog del punto 5 están **completos y certificados**; `git status` debe estar limpio — si hay trabajo sin commitear, verifícalo (tsc/lint/tests) y commiétalo antes de seguir. Disciplina por fase: implementación → tsc + lint + prettier + tests focal → commit atómico en español → push a develop → vigilar CI verde → certificar acá.

**Estado del working tree al 2026-08-01:** limpio — **ROADMAP ORIGINAL COMPLETO: 20/20 fases certificadas** — A1 (release + smoke en prod) · A2 (drop legacy con respaldo JSON) · A3 (Nightly contra Supabase local en CI) · B1–B6 (cobertura de contenido: estudio, transaccionales, iconos, listas, imágenes, banners) · C1–C4 (preview **con edición in-place**, rol editor, publicación programada, utilidades) · D1 (ratchet de cobertura en CI) · D2 (observabilidad del CMS en `/admin/metricas` — `b4e7b92`) · D3 (documentación) · D4 (E2E del flujo de edición) · E1–E4 (móvil). **Backlog del punto 5 COMPLETO**: huecos de copy D1 como fases B7/B8/B9 (auth, checkout, mi-cuenta — commits `b83c2e7`, `c153352`, `e5a4441`), tablas admin→tarjetas móvil como E4 (`70cfed0`), C1 paso 2 — modo edición in-place (`ce38b8c`) y gestos del canvas del Estudio verificados interactivamente (`406051a`). **Separación dev/prod ejecutada en local**: stack Supabase podman espejo nube (`make db-local-*`, commit `c18fd71` + `ee6a655`; Studio :54323, Mailpit :54324; flip de `.env.local` activo con respaldo en `.env.local.nube-backup`). Recordar: el smoke post-release queda como `release-check-a1.spec.ts` reutilizable (PLAYWRIGHT_BASE_URL apuntando a prod).

---

## Secuencia recomendada y dependencias

```
A1 → A2 → A3 (consolidación, todo S)
    │
    ├─→ B3 (iconos categoría)        [S/M, independiente]
    ├─→ B2 (transaccionales)         [M, independiente]
    ├─→ B4 (listas) ─→ B6 (banners)  [L → M]
    │        ↑
    ├─→ B5 (imágenes) ───────────────┘  (B6 usa B4+B5; A3 recomendada para B5)
    ├─→ B1 (/estudio)                [L, independiente — la más larga]
    │
    ├─→ C2 (rol editor)              [M, independiente — alto valor de seguridad]
    ├─→ C1 (preview)                 [M]
    ├─→ C3 (publicación programada)  [M]
    └─→ C4 (utilidades admin)        [S-M]
    │
    └─→ D1–D4 (gobierno, en cualquier momento tras A)
```

**Sugerencia de orden de ejecución por valor:** A (todo) → **C2** (deja de darle el rol máximo a quien edita textos) → **B4** (elimina el JSON crudo, desbloquea B6) → **B1** (el hueco más visible) → **B5+B6** (imágenes/banners) → resto.

## Riesgos transversales

- **Prod compartido con dev (A3):** toda fase que toque Storage/RLS (B5) debería esperar staging o hacerse con doble verificación.
- **Compat de lectura:** como en CMS v2, toda lectura nueva (`getCmsList`, `getCmsImage`) nace con fallback al valor actual en código — cero downtime por definición.
- **Migraciones a mano:** recordar que `migrate dev` no funciona contra Supabase (shadow DB + pg_trgm); las migraciones se escriben a mano y se aplican con `migrate deploy` (patrón ya usado en `add_cms_v2`).
- **Caché:** todo script que escriba contenido directo en DB requiere invalidar el tag `cms` desde el admin (runbook en OPERATIONS.md).
