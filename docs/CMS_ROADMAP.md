# ROADMAP — Ecosistema CMS completo (CMS v2 → CMS total)

**Estado:** propuesta formalizada 2026-07-30 · Base ya construida: CMS v2 (HANDOFF.md del mismo día)
**Propósito:** que el 100% del contenido visible del sitio sea administrable por una persona NO técnica desde `/admin/contenido`, con modularidad a futuro (listas, imágenes, banners, roles, preview) sin rehacer el modelo.

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

### A2 — Drop de tablas legacy

- Pre-requisito: A1 OK + ≥3 días de producción estable.
- Migración `drop_cms_legacy` (drop tables + enums legacy).
- Borrar `packages/db/scripts/seed-cms.mjs`, `seed-cms-ruta-a.mjs` y target `seed-cms` del Makefile; quitar comentarios DEPRECATED del schema; ajustar `verify-cms-v2-parity.mjs` (ya no aplica → borrar o convertir en chequeo de integridad v2: campos publicados sin versión = 0).
- Grep final: 0 referencias a `cmsBlock`/`siteSetting` en código.
- **Verificación:** suite completa verde + migración aplicada en dev y producción.

### A3 — Nightly con Supabase staging (CI rojo actual #14)

- Crear proyecto Supabase de staging (hoy dev y producción comparten proyecto — riesgo ya documentado en audits).
- Configurar secrets `STAGING_DATABASE_URL`, `STAGING_DIRECT_URL`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON`, `STAGING_SUPABASE_SERVICE` en GitHub.
- Sin migración (infra). **Verificación:** Nightly verde corriendo rls-matrix + E2E admin/MFA.

---

## FASE B — Cobertura total del contenido

> Objetivo: ningún texto visible quemado en código. Ordenado por impacto para Lucy.

### B1 — Copy del `/estudio` (el hueco grande que queda)

- Todo el copy del editor de personalización vive hardcodeado en componentes **client** (`app/estudio/**`) — el patrón ya aplicado en header sirve: resolver textos en server, pasar por props tipadas.
- Inventario primero: listar TODOS los literales visibles del Estudio (tooltips, botones, empty states, errores, ayudas).
- Site map: página `estudio` con secciones por pantalla/paso (`lienzo`, `plantillas`, `subida-fotos`, `exportar`…). Sin migración DB (campos vía site map + `migrate-cms-v2`).
- Esfuerzo **L** (es la superficie de copy más grande del sitio).
- **Verificación:** grep de literales en `app/estudio/**` reducido a identificadores técnicos; typecheck + tests.

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

### B6 — Banners/promos administrables en home

- Con B4 + B5: campo lista `home.banners` (items `{ imagen: IMAGE, titulo: TEXT, enlace: URL, activo: BOOLEAN }`) + sección en home que itera (hoy no existe; la categoría MARKETING ya existe en el enum legacy de categorías por compat).
- Sección nueva en el site map (`inicio/banners`) + componente storefront nuevo.
- Esfuerzo **M** (con B4/B5 hechas). Dependencias: B4, B5.

---

## FASE C — Experiencia de edición

### C1 — Preview en vivo junto al editor

- Editor de página con panel lateral: iframe de la página pública (`CmsPage.path`) que se recarga tras publicar. Sin cambios de DB.
- Paso 2 (después, opcional): edición in-place — el código ya referencia el endpoint planeado `/api/admin/cms/by-key/[key]` (sub-bloque K): overlay en el storefront visible solo para admins logueados (banner "modo edición", click en texto → salta al editor del campo).
- Esfuerzo **M** (iframe) / **L** (in-place).

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

### C4 — Utilidades del admin de contenido

- Mover campo entre secciones, duplicar campo, renombrar secciones/páginas desde admin (hoy el service ya tiene `updateCmsPage`/`updateCmsSection`; falta la UI).
- Vista "Solo borradores" (todos los cambios sin publicar del sitio en una sola lista, con publicar-en-lote).
- Esfuerzo **S-M** cada una. Sin migración.

---

## FASE D — Gobierno y calidad continua

### D1 — Auditoría de cobertura de contenido (anti-regresión)

- Script `packages/db/scripts/audit-content-coverage.mjs`: escanea el JSX de `app/**` y `components/**` buscando literales en español visibles para el usuario que no pasen por `CmsText`/`getSettingValue`/props CMS → reporte con % de cobertura por página.
- Gate opcional en CI: falla si la cobertura baja del umbral actual (ratchet, mismo patrón que coverage).
- Esfuerzo **M**.

### D2 — Observabilidad del CMS

- Card en `/admin/metricas`: campos totales, borradores sin publicar > 7 días, campos nunca editados desde su seed (candidatos a revisar), última invalidación de caché.
- Sin migración (queries sobre el modelo). Esfuerzo **S-M**.

### D3 — Documentación estructural

- `docs/ARCHITECTURE.md`: sección del modelo CMS v2 (hoy no existe).
- `docs/CONVENTIONS.md`: "cómo agregar un campo CMS" (site map → migrate-cms-v2 → consumo con fallback → invalidar caché).
- `docs/DECISIONS.md`: ADR del modelo v2 + ADR de B3 (iconos en Category, no en CMS) + ADR de B4 (listas como items + JSON serializado en body por compat).
- Esfuerzo **S**.

### D4 — E2E del flujo de edición

- Playwright (con staging de A3): login admin → editar campo de Inicio → publicar → ver el cambio en `/` → revertir versión.
- Esfuerzo **M**. Dependencia: A3.

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
