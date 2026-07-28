# Certificación Fase A — Rama `catalogo-whatsapp` (2026-07-28)

**Veredicto: CERTIFICADA.** La rama queda 100% funcional en modo catálogo (sin transaccionalidad online), capa cliente y capa admin, tras la corrección de todos los hallazgos bloqueantes encontrados en la auditoría.

Método: análisis estático exhaustivo (mapa de cableado en 3 zonas con subagentes), suite completa automatizada, e2e/visual con Chromium/Playwright contra producción y build local, pruebas de seguridad en vivo, prueba de carga k6, y saneamiento de la base de datos compartida. Nada quedó en suposición: cada hallazgo se reprodujo y cada corrección se verificó.

---

## 1. Baseline automatizado

| Check | Resultado |
|---|---|
| Vitest (unit + integración) | **2609/2609 verdes** (161/162 archivos; 1 skip = aveonline.live, materia de Fase B) |
| Typecheck (`tsc --noEmit`) | OK |
| ESLint (`--max-warnings 0`) | OK (0 warnings; se eliminaron los 2 históricos: `book-view-3d.tsx`, spec ola19) |
| `next build` | OK |
| Teardown global vitest | auto-limpia al final de cada corrida (ver §6) |

## 2. Mapa de cableado (admin + storefront)

Las 3 zonas auditadas (Ventas/Servicio, Catálogo/Canales/Finanzas, Contenido/Análisis/Config + páginas públicas) encontraron: **ningún módulo en placeholder involuntario** (todos tienen `page.tsx` propio; Mercado Libre y Bot WhatsApp son placeholders deliberados con badge), y estos defectos — **todos corregidos** en `15702af`:

| Hallazgo | Severidad | Corrección |
|---|---|---|
| `disenos`: tags UI≠server — subir separadores siempre fallaba; cara B inalcanzable; página huérfana | **Roto** | Tags dinámicos desde productos con `galleryTag` (fuente única); `needsFaceB` desde `facesPerUnit` |
| RBAC: reclamos/mensajes/disenos/fichas/plantillas fuera de `ROUTE_ROLES` (SUPERADMIN-only vs actions MANAGER_UP) | Desfase | Matriz alineada a MANAGER_UP |
| `updateRedirectAction` huérfana (sin UI) | Código muerto | Form de edición inline por fila |
| `/admin/canales` → 404 | Roto menor | Redirect a `canales/tienda` |
| Finanzas/Conciliación/Bloqueos/Integraciones/Mayorista accesibles por URL en modo catálogo | Gate faltante | Redirect a dashboard en `isCatalogMode()` + nav filtra mayorista (sin consumidor en storefront — Etapa 2) |
| `metricas`: KPIs de pedidos en 0 permanente en catálogo | Ruido | Sección Order oculta en catálogo; se conserva cotizaciones |
| `cupones`: copy prometía aplicación en carrito (imposible hoy) | Copy engañoso | Aviso "se activan con pagos en línea (Etapa 2)" |
| `/status`: comentarios y entrada Wompi desactualizados | Menor | Mode-aware + fallback :4000 |
| `integraciones`: campo `docs` sin renderizar | Menor | Link "Ver detalle" |

Sin dependencias rotas en ningún módulo: todos los guards de admin + audit log + revalidación presentes; los services de negocio tienen tests de integración reales.

## 3. E2E y certificación visual (Chromium/Playwright)

| Suite | Target | Resultado |
|---|---|---|
| smoke (9 tests: home, catálogo, ayuda, contacto, legal, status, api/health, sitemap, robots) | producción | 9/9 |
| a11y + axe (WCAG 2.1 A/AA, 9+ páginas incl. Estudio) | producción | **0 violaciones** |
| admin (login, auditoría 7 áreas con capturas, shots 8 módulos) | producción | 10/10 |
| compra (carrito → checkout datos) | producción + local | 4/4 (spec corregido: selectores mode-aware `fullName`/`customerName`) |
| estudio | producción | 3/3 |
| catalog-visual-shots (flujo cotización completo con 8 capturas) | local | **Pasa** (era 3 fallos de spec: email y checkbox Ley 1581 requeridos, Turnstile bypass) |
| pdp-shots | producción | OK |

Capturas revisadas visualmente: confirmación de cotización (COT-*) con CTA WhatsApp, detalle admin de cotización con foto de producto y envío con destino, nav reagrupado en vivo.

Los 2 "fallos" iniciales contra producción (productos efímeros invisibles) se explicaron y no eran bug de app: la Data Cache (TTL 300s/1h) oculta productos creados vía Prisma directo; el flujo real con productos del catálogo funciona (prueba irrefutable: 8 cotizaciones reales de un cliente en producción).

## 4. Seguridad (verificado en vivo)

- **Headers**: CSP estricta con nonce, HSTS preload 2 años, `X-Frame-Options: DENY`, `nosniff`, referrer-policy, permissions-policy.
- **Auth**: `/admin/*` sin sesión → 307 a `/admin/login`; RBAC por rol en páginas y actions.
- **Rate limiting**: `/api/catalog/products` corta a 403 tras ~17 hits rápidos; cotizaciones 5/IP/día + 3/teléfono/día (código).
- **Webhook Wompi** (código, Fase B): firma HMAC, anti-replay ±5 min, environment-match, idempotencia.

## 5. Carga y performance

- **k6 50 VUs (build local single-node)**: **0% errores** en 494 requests (home/productos/search/PDP/CMS/carrito). Latencia degradada bajo saturación single-node (escenario no representativo: Vercel auto-escala por request; la VM además corre el toolchain de dev).
- **Producción real** (medido desde Colombia): home 1.28s, /productos 0.97s, PDP 1.43s, /carrito 0.80s.

## 6. Saneamiento de datos (BD compartida)

| Entidad | Basura removida | Estado final real |
|---|---|---|
| Productos / categorías / ocasiones | 10 / 5 / 40 (soft) + 33 variantes | 11 / 4 / 16 |
| Pedidos de test (SAGA/CODREC/ITESTCUST/RTR) | 129 soft + 9 ledger COD | 4 pedidos reales (LCM-2026-*) |
| Clientes de test | 37 + 17 (dos tandas) | 2 reales |
| Cupones / reseñas / cotizaciones de test | 18 + 44 / 1 / 5 | solo reales (8 cotizaciones de un lead real) |
| Retractos / diseños de test | 16 / 38 | 0 |
| Plantillas del Estudio archivadas | **48** (hard; FKs SetNull) | 18 vivas (2–3 por producto) |

**Causa raíz eliminada**: el teardown global de vitest ahora también purga la basura transaccional de tests (regex run-id 15+ dígitos, inocuo contra data real) — la basura no vuelve a acumularse en corridas locales (quedó verificado en corridas posteriores: "Transaccional: 0/0/…"). La solución estructural (Supabase test/staging separado) queda diferida por decisión del equipo.

## 7. UX Admin (decisión: módulos intactos, navegación organizada)

- **Ventas** (día a día): Cotizaciones, Pedidos, Clientes, Reseñas.
- **Servicio al cliente** (grupo nuevo, colapsado): Soporte, Moderación, Retractos, Garantías, Reclamos — sin fusionar flujos legales (retracto Ley 1480, garantía legal, SAC conservan sus pantallas y procesos).
- Moderación NO era redundante con Cotizaciones (es revisión de contenido de diseños antes de imprimir); se mantiene visible (fue adaptada a catálogo con fuente cotizaciones).
- Productos: vista por defecto = vivos; papelera por filtro explícito.
- Cotización: foto real del producto + envío "A confirmar por WhatsApp · {ciudad, depto}".
- Banner de cookies ya no tapa el panel.

## 8. Observaciones y pendientes conocidos

- **8 cotizaciones reales de "Cristian" (hasta $12.8M COP) intactas** — leads de negocio, verificar/contactar.
- Dependabot: limitado a minor/patch + ignore de majors (PRs de majors como Prisma 7 se evalúan manualmente).
- k6 single-node local no es representativo de Vercel; si se quiere un SLO formal, correr k6 contra un preview aislado.
- El spec `catalog-visual-shots` requiere Turnstile en bypass (llaves vacías) — documentado en su header.

**Commits de la fase**: `44291fd` (sharp), `1229537` (teardown), `de57e8a` (updateTag), `c2d0f4f` (test fichas), `9c5d04e`+`3cf4b13` (dependabot), `15702af` (este paquete de correcciones).
