# Punto de restauración — inicio de certificación multiagente (2026-07-29)

Registrado ANTES de tocar cualquier archivo, por instrucción explícita del usuario.

- Rama: `develop`
- Commit tip (punto estable): `bc1e41b7c05ec787ac2dfa2a0d58d62abb2cc369`
  (`docs: HANDOFF — go-live develop-sandbox en producción + rollback`)
- Working tree: limpio (0 archivos modificados) al inicio de la sesión.
- Restaurar con: `git checkout develop && git reset --hard bc1e41b7c05ec787ac2dfa2a0d58d62abb2cc369`
  (⚠️ `git reset --hard` descarta cambios sin commitear; usar solo como rollback deliberado)

---

## Re-certificación (misma fecha, segunda pasada)

Registrado ANTES de tocar cualquier archivo de la segunda pasada, por instrucción explícita del usuario ("documentate en el punto estable commit, que estas ahora por si acaso").

- Rama: `develop`
- Commit tip (punto estable): `019f6fe` — `docs: HANDOFF certificación transaccional multiagente develop 2026-07-29 + punto de restauración`
- Working tree: limpio (0 archivos modificados) al inicio de la segunda pasada; remoto `origin/develop` al día.
- Restaurar con: `git checkout develop && git reset --hard 019f6fe`
  (⚠️ mismo aviso: descarta cambios sin commitear; usar solo como rollback deliberado)

---

## Ruta A — extensión del CMS in-house (misma fecha, tercera pasada)

Registrado ANTES de tocar cualquier archivo de la Ruta A (FAQ/emails/microcopy/SEO → CMS), por instrucción explícita del usuario.

- Rama: `develop`
- Commit tip (punto estable): `19f0e0f` — `docs: HANDOFF lección caché CMS en Vercel + invalidación vía admin-efímero`
- Working tree: limpio (0 archivos modificados); `origin/develop` al día; producción Vercel ● Ready.
- Restaurar código con: `git checkout develop && git reset --hard 19f0e0f`
  (⚠️ descarta cambios sin commitear; usar solo como rollback deliberado)

### Factores de rollback específicos de esta fase

1. **Sin migración de schema**: la fase NO crea tablas ni columnas — las categorías `FAQ`, `EMAIL`, `SUPPORT`, `MAINTENANCE`, `MARKETING` ya existen en el enum `BlockCategory` (schema.prisma:129-140). No hay `migrate deploy` que revertir.
2. **Filas de contenido nuevas** (bloques `help.*`, `checkout.*`, `seo.*`, `email.*` y settings nuevos si los hubiere): son **aditivas e inertes en rollback** — el código mantiene fallbacks hardcoded para cada clave; al revertir el código, las filas quedan sin lector y no afectan el render. Si se quiere borrarlas de todas formas: `DELETE FROM "CmsBlockVersion" WHERE "blockId" IN (SELECT id FROM "CmsBlock" WHERE key LIKE 'help.%' OR key LIKE 'checkout.%' OR key LIKE 'seo.page.%' OR key LIKE 'email.%'); DELETE FROM "CmsBlock" WHERE key LIKE 'help.%' OR key LIKE 'checkout.%' OR key LIKE 'seo.page.%' OR key LIKE 'email.%';` (+ invalidar tag `cms` desde /admin/contenido/bloques).
3. **Contenido existente modificado**: ninguno — esta fase solo AGREGA bloques/settings nuevos; no edita los 72 bloques ni 41 settings actuales.
4. **BD compartida con producción**: todo cambio de contenido se verifica vía API pública y render; invalidación de caché con el botón del admin (lección documentada en HANDOFF).
