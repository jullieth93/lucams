# Homologación E2E de flujos — LOCAL / STG / PRD (2026-08-06)

> Ejecución del PROMPT MAESTRO de certificación E2E (`docs/PROMPT_E2E_HOMOLOGACION.md`).
> Regla aplicada: CERO suposiciones — toda fila de la matriz tiene evidencia
> (screenshot, response, query o log) referenciada. Lo que no se ejecutó queda
> marcado PENDIENTE, nunca asumido.

## 1. Qué se entregó en esta sesión

1. **Mapa conceptual revisado** contra el repo real (sección 2).
2. **`apps/web/playwright.config.ts` reescrito**: projects `desktop-chrome`
   (1280×800) + `mobile-chrome` (390×844), ambiente explícito `E2E_ENV`,
   bypass Vercel condicional en `extraHTTPHeaders`, evidencia
   (trace retain-on-failure / screenshot on-failure / video on-first-retry /
   reporter json en CI), `globalSetup`/`globalTeardown`.
3. **POM + fixtures**: `tests/e2e/pages/{home,catalogo,pdp,estudio,carrito,
   cotizacion,admin-login,admin-dashboard,admin-cotizaciones,admin-contenido,
   admin-notificaciones}.ts` y `tests/e2e/fixtures/{run,data-factory,db,
   storage,auth}.ts` + `_setup/{env,global.setup,global.teardown}.ts`.
4. **Spec de integración admin→cliente** `homolog-admin-cms.spec.ts`
   ejecutado en LOCAL y STG (matriz en sección 4).
5. **Esta matriz** con evidencia y hallazgos (secciones 4-6).

## 2. Mapa conceptual — plan revisado contra el repo real

Verificado el 2026-08-06 directamente contra código/DB/ambientes (no desde el
prompt):

- **Config previa**: 1 project `chromium`, sin mobile, sin storageState, bypass
  inyectado por-spec (`preview-cert`). El gate CI y el nightly fijaban
  `--project=chromium` → ambos workflows actualizados a `--project=desktop-chrome`.
- **Specs existentes**: 37; helpers solo `_helpers/{axe-scan,totp}.ts`. No había
  POM ni fixtures ni global.setup.
- **Auth admin**: el admin real (`r.julliethhr@gmail.com`) tiene MFA TOTP
  enrolado en LOCAL/PRD (secret no disponible para automatización; STG por
  enrolar). El repo ya resolvía esto con **admins efímeros vía service role**
  (release-check-a1, cms-editing-flow, admin-mfa, catalog-mode) → se adoptó ese
  patrón en el `global.setup` (mismo camino de UI, borrado garantizado en
  teardown). El reto MFA real lo cubre `admin-mfa.spec.ts`.
- **CMS**: el storefront lee `publishedVersion.body` (join), no `CmsField.body`
  (que es el borrador) — `lib/cms.ts` + `features/cms/service.ts`. El spec lee
  el original desde la DB del ambiente (cero hardcoding, a diferencia de
  release-check-a1 que lo tiene quemado).
- **Limpieza**: `vitest-global-teardown.ts` purga por patrones (13+/15+ dígitos,
  `test-`/`itest`, `%.test`); `env-guard.mjs` bloquea PRD y remotos desconocidos,
  permite localhost + STG (ref `mjbdiqdkykhsixvqlrrp`). Setup/teardown E2E la
  reusan; `E2E_AUTH=1` en PRD hace throw.
- **Sin faker en deps** → generadores deterministas propios (no se agregaron
  dependencias). Bucket real de uploads: `customer-uploads` (sharp 0.34.4 ya
  era dep).

## 3. Ambientes verificados (2026-08-06, evidencia directa)

| Ambiente | App | DB | Verificación |
| -------- | --- | -- | ------------ |
| LOCAL | `http://localhost:4000` → 200 | Supabase podman (up 10h) | `/api/health/db` → `{"status":"ok"}` |
| STG | preview develop → 200 con bypass | `lucams-stg` | `/api/health/db` → 200 con bypass |
| PRD | `https://lucamsshop.com` | prod | solo lectura (env-guard) |

Campo CMS `home.categories.cta-all` antes de la corrida: MISMO id
(`cms6w6zzm002kjyimgioq74i2`) y MISMO body publicado ("Ver todas las categorías
y productos →") en LOCAL y STG (queries del 2026-08-06).

## 4. Matriz de homologación flujo × ambiente

Corridas canónicas del 2026-08-06 con el código final. Evidencia por fila en
`apps/web/tmp/e2e-homologacion/` (gitignored) y salidas de los runners.

| Flujo | LOCAL | STG | PRD |
| ----- | ----- | --- | --- |
| **admin→cliente CMS** `home.categories.cta-all` (editar→publicar→cliente ve→revertir→original) — desktop 1280×800 | ✅ 9/9 pasos, 1er intento | ✅ 9/9 pasos, 1er intento | ⛔ no corre (mutación prohibida; skip forzado en el spec) |
| **admin→cliente CMS** — mobile 390×844 | ✅ 9/9 pasos, 1er intento | ✅ 9/9 pasos, 1er intento | ⛔ idem |
| **smoke storefront** (home, /productos, /ayuda, /contacto, legal, /status, health, sitemap, robots) — desktop | ✅ 9/9 | ✅ 9/9 | ✅ 9/9 (read-only) |
| **smoke storefront** — mobile | ✅ 9/9 | ✅ 9/9 | ◻️ no corrido (read-only innecesario duplicado) |
| **flujo cotización Etapa 1** (home→catálogo→PDP→carrito→CTA WhatsApp→form + validación de vacíos) — `catalog-mode.spec` | ✅ 2/2 | ✅ 2/2 | ⛔ crea datos efímeros |
| **panel admin /admin/cotizaciones** (login + lista + filtros) — `catalog-mode.spec` | ✅ 2/2 | ✅ 2/2 | ⛔ crea admin efímero |
| **paridad de datos** (query directa a la DB del ambiente) | 612 productos / 572 categorías / 772 variantes / 115 ocasiones / 981 campos CMS / 50 migraciones | **idéntico a LOCAL** | homologado el 2026-08-05 (19 tablas idénticas, bitácora STATE) |

Evidencia canónica del flujo admin→cliente (JSON con pasos, valores de DB y
screenshots del CTA visible):

- LOCAL: `results-local-desktop-chrome-e2e-cms-1785989076993.json`,
  `results-local-mobile-chrome-e2e-cms-1785989101556.json` (+ shots `1-baseline`
  / `2-variant` / `3-original`).
- STG: `results-stg-desktop-chrome-e2e-cms-1785989214506.json`,
  `results-stg-mobile-chrome-e2e-cms-1785989243580.json` (+ shots).
- Estado post-corrida verificado por query: `publishedBody` = texto original en
  AMBOS ambientes; 0 usuarios efímeros residuales; 0 productos/categorías de
  test creados hoy.

## 5. Hallazgos

**H1 — (harness, corregido) `fill()` no despierta React tras navegación SPA al
editor CMS.** El input inline de `/admin/contenido` (`field-row.tsx`) habilita
Guardar solo con `isDirty`; tras SPA-nav a una página ya montada en la sesión,
el evento sintético de `fill()` no siempre llega al `onChange` de React 19 →
botón disabled permanente. Reproducido con specs de diagnóstico desechables
(diag3/diag5): **el tipeo real sí funciona siempre → NO es bug de la app** (un
admin humano no la padece); es artefacto del harness. Fix en el POM
(`pages/admin-contenido.ts`): reload duro al entrar al editor + interacción por
teclado real (click → select-all → borrar → `pressSequentially`) con
`toPass(fill→valor→habilitado)`. Tras el fix: 4/4 corridas deterministas
(LOCAL+STG × desktop+mobile, 1er intento).

**H2 — (proceso, corregido en el diseño) baseline con CMS viejo por caché del
servidor.** La primera versión del spec leía la baseline sin invalidar la caché
`unstable_cache("cms")` del servidor → veía la variante de una corrida anterior.
Fix: paso `admin-cache-refresh` al inicio (patrón ya documentado en
release-check-a1). La reversión garantizada (afterAll por DB + red del
global.teardown) quedó demostrada en las corridas fallidas: la DB nunca quedó
con la variante publicada.

**H3 — (entorno local, documentado) `.next/dev/types/validator.ts` se corrompe
intermitentemente** (escritura no atómica de Turbopack dev) y rompe
`pnpm typecheck` con errores de sintaxis en archivo generado. No aplica a CI
(build limpio) ni indica problema de código. Workaround: borrar el archivo y
re-correr. Candidato a exclusión en tsconfig si se vuelve frecuente.

**H4 — (limpieza, cerrado) huérfanos de la corrida matada por timeout.** El
primer run de homologación murió por timeout de shell (300s) sin correr el
global.teardown → quedaron el admin y el cliente efímeros de ESE setup en
LOCAL. Borrados a mano (verificado: 0 residuales; los 46 productos/categorías
`e2e-*` que quedan en LOCAL y STG son soft-deleted HISTÓRICOS de sesiones
previas — 0 creados hoy — invisibles en el storefront y cubiertos por la red
de limpieza del repo).

**Sin hallazgos de homologación de flujo**: todos los flujos ejecutados se
comportan idéntico en LOCAL y STG; las únicas diferencias observadas son las
intencionales de §3 del prompt (dev server Turbopack vs build Vercel, latencia,
bypass header).

## 6. Cómo reproducir

```bash
# LOCAL (stack podman + app en :4000, ver make local-up):
cd apps/web && E2E_ENV=local E2E_AUTH=1 pnpm exec playwright test homolog-admin-cms

# STG (preview develop con bypass — lo toma de .env.stg):
cd apps/web && E2E_ENV=stg E2E_AUTH=1 pnpm exec playwright test homolog-admin-cms

# Smoke read-only en PRD (sin E2E_AUTH — nunca muta):
cd apps/web && E2E_ENV=prd pnpm exec playwright test smoke --project=desktop-chrome
```

Artefactos por corrida (gitignored): `apps/web/tmp/e2e-homologacion/`
(JSON `results-<env>-<project>-<run>.json` con pasos/valores DB + screenshots).
Los storageState viven solo en `apps/web/tests/e2e/.auth/<env>/` (gitignored)
y los usuarios efímeros se borran en el teardown global.
