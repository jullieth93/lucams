# Auditoría E3 — Storefront en móvil (375px)

**Fecha:** 2026-07-31 · **Fase:** E3 del roadmap CMS (`docs/CMS_ROADMAP.md`, Fase E — capa cliente).
**Método:** tour automatizado con Playwright (`apps/web/tests/e2e/mobile-storefront-audit.spec.ts`, viewport 375×812, sin auth). Por pantalla: screenshot full-page + medición objetiva de overflow horizontal (documento). Screenshots en `tmp/screenshots/e3/` (gitignored); resumen máquina en `summary.json`.

**Resultado:** el storefront está en buena forma móvil (se diseñó mobile-friendly). **1 solo defecto objetivo**, corregido en la misma fase y verificado con re-auditoría: **0/6 pantallas con overflow tras el fix**.

## Hallazgos

### H1 — PDP con overflow horizontal real (397px vs 375px) — CORREGIDO

- **Síntoma:** `/producto/[slug]` medía 397px de ancho de documento (22px de desborde).
- **Causa raíz:** el formulario «Avísame cuando vuelva» (`components/back-in-stock-button.tsx`): el input `flex-1` sin `min-w-0` no baja de su ancho intrínseco (`size=20` del UA) y empuja el botón «Avísame» fuera del viewport.
- **Fix:** `min-w-0` en el input (patrón canónico flex). Verificado con sonda de elementos desbordados (el botón sale de la lista) y re-auditoría: PDP 375/375.
- **Nota:** quedó un blob decorativo (`blur-3xl`, `-right-20`) que llega a 455px pero está recortado por un ancestro con `overflow-hidden` — no afecta el ancho del documento (confirmado en la re-auditoría).

### H2 — Sin más defectos objetivos ni visuales relevantes

- **Home:** hero con CTAs apilados, grilla de categorías 2-col, pasos, carruseles, CTA final y footer — todo apila correctamente.
- **Catálogo (`/productos`)** y **carrito:** apilado correcto, filtros accesibles.
- **Estudio:** la capa visible móvil funciona — modal de bienvenida (paso 1 de 3) centrado y legible, banner de cookies con botones completos, experiencia app-like de alto completo sin overflow. (Los gestos del canvas —pinch/zoom/drag— no los cubre una auditoría de screenshots: quedan para prueba interactiva, territorio de D4/E2E.)
- **Checkout:** con carrito vacío responde 404 (comportamiento esperado — el checkout exige items).

## Verificación

Re-auditoría post-fix: **0/6 pantallas con overflow** (home, catálogo, PDP, carrito, checkout, estudio). La spec queda como herramienta de regresión móvil del storefront (compañera de la de admin de E1).
