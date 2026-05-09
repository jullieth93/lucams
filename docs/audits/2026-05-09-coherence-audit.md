# Auditoría de coherencia — documentación Lucams_shop (Fase 0a)

> **Origen del archivo.** Este documento se redactó originalmente dentro del flujo de "plan mode" de Claude Code en `~/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md`. Conforme al [ADR-012](../DECISIONS.md) ("documentación dentro del repo, no en `~/.claude/plans/`"), se movió al repositorio en `docs/audits/2026-05-09-coherence-audit.md` y el archivo global se borró. Las auditorías futuras viven en esta misma carpeta con formato `YYYY-MM-DD-<slug>.md`.

## Context

El usuario pidió cargar contexto completo y luego hacer una **auditoría de coherencia** de los 7 documentos del proyecto antes de pasar a la Fase 0b. La intención es detectar contradicciones, inconsistencias, gaps y referencias obsoletas que puedan generar problemas al implementar — corregirlos ahora cuesta minutos; corregirlos durante Fase 4 (cuando una contradicción Wompi/checkout se materialice) cuesta horas.

Documentos auditados:
- `CLAUDE.md`
- `README.md`
- `docs/PLAN.md`
- `docs/BRANDING.md`
- `docs/ARCHITECTURE.md`
- `docs/INTEGRATIONS.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`
- `docs/OPERATIONS.md`

Resultado: **21 hallazgos** (H5 retirado tras verificación; H19-H21 sumados durante la sesión), organizados por severidad.

---

## 🔴 Críticos (afectan implementación o ya están desfasados)

### H1. ROADMAP.md Fase 0a marca como pendientes archivos que ya existen
- [docs/ROADMAP.md:34-37](docs/ROADMAP.md#L34-L37) lista como `[ ]`:
  - `Escribir docs/ROADMAP.md (este archivo)` ← se lista a sí mismo como pendiente
  - `Escribir docs/DECISIONS.md`
  - `Escribir docs/OPERATIONS.md`
  - `Borrar /home/ansible/.claude/plans/dime-cual-es-la-inherited-hopcroft.md`
- Los tres `.md` ya existen. El archivo a borrar **tampoco existe** (directorio vacío, verificado).
- **Fix:** marcar los cuatro como `[x]` y actualizar el estado de la fase a 🟢 Completada (con sello de fecha 2026-05-09).

### H2. CLAUDE.md dice "Fase 0a en curso" pero está completada de facto
- [CLAUDE.md "Estado actual"](CLAUDE.md) afirma "Fase 0a en curso. Solo se está generando documentación. **No hay código aún.**"
- Si H1 se cierra, este texto debe actualizarse a algo como: "Fase 0a completada. Esperando autorización para Fase 0b. Sigue sin haber código."
- **Fix:** sincronizar con ROADMAP tras cerrar H1.

### H3. Comisión Wompi: dato $700 COP fijo solo aparece en OPERATIONS — VERIFICADO
- [docs/PLAN.md:46](docs/PLAN.md#L46): "2.65%+IVA por trx"
- [docs/DECISIONS.md ADR-004](docs/DECISIONS.md): "~2.65% vs ~3.49%"
- [docs/OPERATIONS.md:329](docs/OPERATIONS.md#L329): **"2.65% + $700 + IVA"** ← correcto.
- **Verificación:** [Wompi — Planes y Tarifas](https://wompi.com/es/co/planes-tarifas/) confirma estructura **2.65% + $700 + IVA** para plan Avanzado tarjeta crédito en frecuencia mensual. Frecuencia semanal sube a 2.75%, diaria a 2.85% + $800. Adicional ([soporte Wompi — cobros adicionales](https://soporte.wompi.co/hc/es-419/articles/360042471394)): retenciones gubernamentales 1.5% renta + 0.2% ICA + 15% IVA-retención sobre la comisión.
- **Fix:** unificar en PLAN.md y DECISIONS.md la cifra completa `2.65% + $700 + IVA` y mencionar las retenciones como nota al pie en DECISIONS para que el modelo de pricing sea realista.

### H4. Tailwind 4 declarado pero snippets son sintaxis Tailwind 3 — RECOMENDACIÓN INVERTIDA tras verificar
- [docs/ARCHITECTURE.md:137](docs/ARCHITECTURE.md#L137): "Tailwind CSS 4.x"
- [docs/ARCHITECTURE.md:36-57](docs/ARCHITECTURE.md#L36-L57) y [docs/BRANDING.md:36-57](docs/BRANDING.md#L36-L57): snippets con `tailwind.config.ts` + `theme.extend.colors` → **sintaxis Tailwind 3**.
- **Verificación:** [shadcn/ui — Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4) confirma: *"It's here! Tailwind v4 and React 19. Ready for you to try out. You can start using it today."* Proyectos nuevos arrancan v4 + React 19 por defecto. v3 sigue funcionando para apps existentes (no breaking).
- Caveats reales de migrar/arrancar en v4 documentados oficialmente:
  - `tailwindcss-animate` deprecado a favor de `tw-animate-css`.
  - Componente `toast` deprecado a favor de `sonner`.
  - Style por defecto pasa de `default` a `new-york`.
- **Recomendación corregida:** **arrancar en Tailwind v4 + React 19**, dado que es el default oficial de shadcn/ui hoy y fuimos consistentes con "no es MVP, productivo desde día 1". El fix entonces es:
  1. Mantener "Tailwind 4.x" en ARCHITECTURE.md.
  2. **Reescribir los snippets a sintaxis v4** (CSS-first con directiva `@theme` en `globals.css`, sin `tailwind.config.ts` para temas).
  3. ADR nuevo registrando: la elección de v4, los caveats (`tw-animate-css`, `sonner`, style `new-york`) y la fecha de verificación de la fuente.
- **Errata:** mi recomendación previa de "bajar a v3 por madurez" estaba basada en información obsoleta. Corregida tras verificar la doc oficial de shadcn/ui en mayo 2026.

---

## 🟡 Importantes (gaps o inconsistencias menores que conviene resolver antes de codear)

### ~~H5. Tarjeta de prueba Wompi~~ — FALSO POSITIVO (verificado contra docs oficiales)
- ROADMAP.md cita `4242 4242 4242 4242` como tarjeta sandbox aprobada.
- **Verificación:** [docs.wompi.co — Test Data for Sandbox](https://docs.wompi.co/en/docs/colombia/datos-de-prueba-en-sandbox/) cita textual: *"for card payments, you should enter 4242 4242 4242 4242 for an approved transaction (APPROVED)"*. Es la tarjeta canónica de Wompi.
- **No requiere fix.** Hallazgo retirado.

### H6. Política de stock contradictoria entre ROADMAP y OPERATIONS
- [docs/ROADMAP.md Fase 4](docs/ROADMAP.md): "Stock se descuenta solo cuando la orden pasa a `PAID`."
- [docs/OPERATIONS.md "Prevención sobreventa"](docs/OPERATIONS.md): "Reservar stock al pasar a `PENDING_PAYMENT` (no esperar a `PAID`). TTL de 15 min en la reserva."
- Son dos modelos distintos: descuento al PAID vs reserva al PENDING_PAYMENT con TTL. El segundo es más robusto contra sobreventa pero más complejo.
- **Fix:** decidir cuál se implementa, documentarlo como ADR-014 (o el siguiente disponible), y unificar en ambos docs. Sugiero el modelo **reserva al PENDING + descuento al PAID**, con `InventoryLog` por ambas transiciones.

### H7. Storage buckets detallados en INTEGRATIONS pero no en ARCHITECTURE
- [docs/INTEGRATIONS.md sección Storage](docs/INTEGRATIONS.md): `products` (público), `customer-uploads` (privado, URL firmada 1h), `production-assets` (privado, role FULFILLMENT).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) solo menciona "Storage (firmadas)" genérico.
- **Fix:** agregar subsección "Storage" en ARCHITECTURE referenciando los tres buckets (o agregar nota "ver INTEGRATIONS.md para buckets" para no duplicar).

### H8. Variable `VENNDELO_ORIGIN_CITY` se usa en INTEGRATIONS pero no se declara ahí
- [docs/INTEGRATIONS.md:165](docs/INTEGRATIONS.md#L165): `origin: process.env.VENNDELO_ORIGIN_CITY` en el snippet de quote.
- [docs/INTEGRATIONS.md:136-140](docs/INTEGRATIONS.md#L136-L140) (bloque de vars de Venndelo): no la incluye.
- [docs/OPERATIONS.md:40](docs/OPERATIONS.md#L40): sí la declara: `VENNDELO_ORIGIN_CITY=Bogotá`.
- **Fix:** agregar la línea al bloque de vars de Venndelo en INTEGRATIONS para que sea autocontenido.

### H9. Healthchecks en OPERATIONS sin tarea correspondiente en ROADMAP
- [docs/OPERATIONS.md:294-301](docs/OPERATIONS.md#L294-L301) define `/api/health`, `/api/health/wompi`, `/api/health/venndelo`.
- ROADMAP no los menciona en ninguna fase.
- **Fix:** agregar tarea "Implementar healthchecks (`/api/health/*`)" a Fase 1 (junto a `/api/wompi/webhook`, etc.) o a Fase 7 (auditoría de seguridad).

### H10. Cron jobs de Vercel sin documentación operativa
- [docs/ROADMAP.md Fase 5](docs/ROADMAP.md): "Cron Vercel a 1h y 24h" para recuperación de carrito.
- OPERATIONS no documenta cómo se configura `vercel.json` con `crons`, ni los endpoints `/api/cron/*`.
- ARCHITECTURE no incluye una ruta `app/api/cron/...`.
- **Fix:** agregar sección "Cron jobs" en OPERATIONS (con la ruta del array `crons` de `vercel.json` y endpoints esperados) y reflejarlo en la estructura de carpetas de ARCHITECTURE.

### H11. Cuenta Cloudflare R2 mencionada para backups pero no en Fase 0b
- [docs/PLAN.md L235 / docs/OPERATIONS.md L289](docs/OPERATIONS.md): "export semanal a R2" como backup adicional en producción.
- [docs/ROADMAP.md Fase 0b](docs/ROADMAP.md): no lista la cuenta de Cloudflare R2 (solo Cloudflare DNS Free, que es distinto).
- **Fix:** agregar tarea "Activar R2 en Cloudflare (Free tier)" a Fase 0b o moverlo a Fase 7.

---

## 🟢 Menores (mejoran consistencia pero no bloquean)

### H12. Listas de pendientes del usuario duplicadas y desincronizadas
- [docs/PLAN.md "Pendientes del usuario"](docs/PLAN.md): 4 items (logo, tagline, tipografías, decisión legal).
- [docs/BRANDING.md "Pendientes de branding"](docs/BRANDING.md): 5 items (logo, variantes mascota, tipografías, tagline, foto equipo).
- **Fix:** centralizar en un solo lugar. Sugiero dejar la lista exhaustiva en BRANDING (todo lo de imagen) y que PLAN.md solo tenga "Ver pendientes en BRANDING + decisión legal".

### H13. Monorepo no mencionado en CLAUDE.md ni README.md
- ARCHITECTURE.md detalla monorepo con pnpm workspaces.
- [CLAUDE.md "Mandatos no negociables" #3](CLAUDE.md): solo dice "Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui".
- [README.md "Stack"](README.md): no menciona pnpm ni monorepo.
- **Fix:** agregar 1 línea a CLAUDE.md y a README.md mencionando "monorepo pnpm con `apps/web` + `packages/db` + `packages/ui`".

### H14. Rate limit + cache: sin proveedor externo, todo en Postgres
- [docs/PLAN.md](docs/PLAN.md): "Vercel KV o Upstash Free" para rate limiting → texto stale.
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md): "Vercel KV (cuando se active)" para cache de quotes y AI → texto stale.
- **Verificación realizada:** Upstash Free es 500.000 cmd/mes (no 10k/día como dije). Vercel KV está deprecado (ver H20). Postgres puede cumplir ambas funciones en nuestra escala con latencia tolerable (~30 ms vs <1 ms en Redis), **lo recomienda la propia doc de Supabase como opción válida**.
- **Decisión cerrada:** todo en Postgres.
  - **Rate limit:** tabla `rate_limit_buckets(key, count, window_start)` con UPSERT atómico en middleware (~10-30 ms por chequeo).
  - **Cache:** tabla `cache_entries(key UNIQUE, value JSONB, expires_at)` con limpieza periódica vía `pg_cron`.
  - **Cuándo migrar a Redis externo:** si p95 de rate-limit-check supera 50 ms, o si volumen excede tolerancia. Decisión medible, no preventiva.
- **Fix:**
  1. Reescribir secciones de PLAN.md y INTEGRATIONS.md que mencionan "Vercel KV" / "Upstash" → "Postgres + pg_cron".
  2. ADR-016 documenta la elección con criterios cuantitativos para la migración futura.
  3. ROADMAP.md Fase 1: agregar tareas "Implementar `lib/rate-limit.ts` y `lib/cache.ts` sobre Postgres" + "Habilitar extensión `pg_cron` en Supabase".
  4. ROADMAP.md Fase 0b: **NO** se crea cuenta Upstash.

### H15. CAPTCHA Turnstile sin variables ni cuenta
- [docs/ROADMAP.md Fase 7](docs/ROADMAP.md): "CAPTCHA Turnstile en checkout y registro".
- OPERATIONS no lista `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.
- Fase 0b ya pide cuenta Cloudflare → Turnstile va incluido pero no es obvio que se active ahí.
- **Fix:** nota en Fase 0b "habilitar Turnstile dentro de la cuenta Cloudflare" + agregar las dos vars a OPERATIONS.

---

## 🟡 Importantes (nuevos, surgen de tu mensaje sobre la VM)

### H16. El entorno de desarrollo no está documentado (VM dedicada con sudo)
- La VM tiene usuario con `sudo`, es 100% dedicada al proyecto, persistencia local, instalación libre — **ningún doc lo refleja**. Esto afecta decisiones reales:
  - Sin necesidad de venvs / contenedores para dev: pnpm, Node 22 LTS, Postgres CLI, supabase CLI, gh, etc., se instalan globalmente sin riesgo.
  - Backups locales (volúmenes, scripts) son viables sin coordinar con un host compartido.
  - Permite levantar Postgres/Redis locales como fallback si Supabase Free se pausa.
- **Fix:**
  1. Sección nueva **"Entorno de desarrollo"** en `docs/OPERATIONS.md` con: ruta del repo, usuario sudo, comando para instalar pnpm/node, política de persistencia local.
  2. Línea en `CLAUDE.md` bajo "Mandatos no negociables" o en una sección nueva "Entorno": *"VM dedicada con sudo. Instalación global permitida. No usar venvs Python ni contenedores en dev salvo necesidad explícita."*
  3. Esto cierra de raíz futuras sesiones que pierdan tiempo proponiendo Docker dev / venvs.

### H17. Falta un mecanismo único de traceability inter-sesión
- Hoy hay tres logs paralelos sin convergencia:
  - `ROADMAP.md` checkboxes (estado de fases)
  - `DECISIONS.md` (ADRs cronológicos)
  - `OPERATIONS.md` "Changelog operativo" (cambios infra)
- **Gap:** no hay un único archivo que responda *"¿qué hizo Claude/yo en la última sesión y en qué estamos parados ahora?"* La pregunta del usuario *"que CLAUDE siempre sepa en que va"* requiere esto.
- **Propuesta — crear `docs/STATE.md`:**
  ```markdown
  # Estado del proyecto — Lucams_shop

  ## Resumen actual (siempre 1 párrafo arriba)
  Fase 0a completada. Documentación auditada. Pendiente Fase 0b.

  ## Última sesión (YYYY-MM-DD)
  - Auditoría de coherencia: 21 hallazgos, fixes aplicados.
  - ADRs nuevos: 014 política stock, 015 Tailwind v4, 016 rate-limit Postgres, 017 pgmq+pg_cron, 018 sin-suposiciones, 019 traceability STATE.md.

  ## Próximo paso
  Iniciar Fase 0b — crear cuentas externas en Free.

  ## Bitácora (append-only, más reciente arriba)
  ### 2026-05-09 — Auditoría
  - …
  ### 2026-05-09 — Creación inicial de docs
  - …
  ```
- **Protocolo:**
  1. `CLAUDE.md` "Lectura mínima al iniciar sesión" pasa a incluir `docs/STATE.md` (junto a `ROADMAP.md`).
  2. Regla nueva: al cerrar cualquier turno con cambios, Claude actualiza el bloque **Resumen actual** + **Última sesión** + agrega entrada en **Bitácora**.
  3. ROADMAP, DECISIONS y OPERATIONS-changelog **siguen** siendo fuente de verdad para sus dominios; STATE.md es el "índice narrativo" que apunta a ellos.
- **Alternativa más liviana:** simplemente convertir la sección "Estado actual" de `CLAUDE.md` en un bloque más rico con "última sesión / próximo paso", sin archivo nuevo. Funciona pero ensucia CLAUDE.md (que se carga en cada sesión y debe ser corto).
- **Recomendación experta:** crear `docs/STATE.md`. Es 1 archivo nuevo, costo bajo, beneficio alto y se alinea con la regla de "fuente de verdad dentro del repo" (ADR-012).

---

## Archivos que se editan

Solo modificaciones en `.md` (alcance Fase 0a). Sin código.

| Archivo | Hallazgos que toca | Tipo de cambio |
|---|---|---|
| `docs/ROADMAP.md` | H1, H9, H10, H11, H14, H15, H21 | Marcar tareas Fase 0a, **NO agregar Upstash**, agregar Turnstile + healthchecks + extensiones Postgres + consumers pgmq |
| `CLAUDE.md` | H2, H13, H16, H17, H19 | Estado fase, monorepo, mandato VM, lectura STATE.md, mandato #9 "argumentación obligatoria" |
| `docs/PLAN.md` | H3, H6, H12, H14, H20, H21 | Comisión Wompi completa, política stock, dedupe pendientes, quitar mención Vercel KV/Upstash, agregar pgmq + pg_cron |
| `docs/DECISIONS.md` | H4, H6, H14, H21 (4 ADRs nuevos) | ADR-014 política stock, ADR-015 Tailwind v4, ADR-016 rate-limit/cache en Postgres (no Redis externo), ADR-017 pgmq + pg_cron sobre Vercel Cron |
| `docs/ARCHITECTURE.md` | H4, H7, H10, H21 | Snippet Tailwind v4 (CSS-first), sección Storage buckets, **quitar `app/api/cron/*`**, agregar extensiones Postgres habilitadas (`pgmq`, `pg_cron`) y workers |
| `docs/BRANDING.md` | H4, H12 | Snippet Tailwind v4, dedupe pendientes |
| `docs/INTEGRATIONS.md` | H8, H14, H20, H21 | Agregar `VENNDELO_ORIGIN_CITY`, quitar "Vercel KV" y "Upstash", agregar sección "Background jobs" (pgmq + pg_cron) |
| `docs/OPERATIONS.md` | H3, H6, H10, H15, H16, H21 | Comisión Wompi completa, política stock, runbook con consumers pgmq, Turnstile vars, sección Entorno de desarrollo |
| `docs/STATE.md` | H17 | **Archivo nuevo** — running log de sesiones |
| `docs/audits/2026-05-09-coherence-audit.md` | H18 | **Archivo nuevo** (mover este plan al repo) |
| `README.md` | H13 | Mencionar monorepo |
| `/home/ansible/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md` | H18 | **Borrar** tras mover al repo |

---

## Cola de verificación pendiente (a completar antes de fases siguientes)

Aplicando H19 (mandato sin suposiciones), antes de iniciar la Fase 0b debo verificar contra docs oficiales — y citar fuente con fecha — las siguientes afirmaciones que hoy están en PLAN.md y OPERATIONS.md sin cita:

| Afirmación | Doc actual | Acción antes de Fase 0b |
|---|---|---|
| Vercel Hobby: function timeout 60s, 100 GB bandwidth/mes, ToS no comercial | PLAN.md "Limitaciones" | Verificar en `vercel.com/docs/limits` y `vercel.com/legal/terms` |
| Supabase Free: 500 MB DB, 1 GB storage, 50k MAU, pausa 1 semana sin actividad | PLAN.md + INTEGRATIONS.md | Verificar en `supabase.com/pricing` |
| Resend Free: 3k emails/mes, 100/día, solo `resend.dev` | PLAN.md + INTEGRATIONS.md | Verificar en `resend.com/pricing` |
| Coordinadora cubre 1.100+ destinos con COD vía Venndelo | DECISIONS.md ADR-005 + PLAN.md | Verificar en `venndelo.com` o doc API |
| Tarifas finales Wompi en frecuencia mensual al cerrar comercio | PLAN.md / DECISIONS.md (ADR-004) | Confirmar en panel Wompi cuando se cree la cuenta |
| Costo Anthropic Sonnet 4.6 ($3/MTok in, $15/MTok out) | INTEGRATIONS.md | Verificar en `anthropic.com/pricing` |
| Sintaxis exacta de Tailwind v4 CSS-first (`@theme` directive) | ARCHITECTURE.md / BRANDING.md (snippets nuevos) | Verificar en `tailwindcss.com/docs` antes de escribir snippets v4 |
| Comportamiento de `pgmq` (visibility timeout, retries, max attempts) en plan Free de Supabase | INTEGRATIONS.md / ARCHITECTURE.md (sección Background jobs) | Verificar en `supabase.com/docs/guides/queues` antes de Fase 1 |

Esta cola se documenta en STATE.md como "trabajo pendiente". Ningún número de estos docs se da por cerrado hasta que se cite la fuente con fecha.

---

## Verificación end-to-end

Tras aplicar fixes, confirmar:

1. **ROADMAP.md** muestra Fase 0a 🟢 Completada con todos los `[x]`.
2. **CLAUDE.md** "Estado actual" coincide con ROADMAP, menciona monorepo y VM dedicada.
3. **Comisión Wompi** aparece idéntica en PLAN, DECISIONS, OPERATIONS.
4. **Política de stock**: un solo modelo descrito en ROADMAP + OPERATIONS + ADR.
5. **Variables de entorno**: `OPERATIONS.md` y `INTEGRATIONS.md` declaran el mismo set (diff sin discrepancias).
6. **Versión Tailwind**: ADR explica la elección y los snippets son consistentes con la versión declarada.
7. **`/home/ansible/.claude/plans/`** vacío y la tarea de borrado marcada.
8. **DECISIONS.md** tiene los nuevos ADRs (Tailwind, política stock, rate limit) numerados secuencialmente.
9. **README.md** y **CLAUDE.md** mencionan monorepo.
10. **`docs/STATE.md` existe** con la primera entrada de bitácora ("creación + auditoría 2026-05-09") y el resumen actual apuntando a Fase 0b como próximo paso.
11. **`CLAUDE.md` "Lectura mínima al iniciar sesión"** incluye `docs/STATE.md`.
12. **`OPERATIONS.md` "Entorno de desarrollo"** documenta VM dedicada, sudo, política de instalación global.
13. **Sin menciones de "Vercel KV" ni "Upstash"** en ningún `.md` del proyecto (todo migrado a Postgres + pg_cron + pgmq).
14. **Sin menciones de "Vercel Cron"** en jobs de background (ahora pgmq + pg_cron).
15. **CLAUDE.md mandato #9** ("argumentación obligatoria") presente y todas las afirmaciones técnicas nuevas tienen cita inline.

Sin código a correr en esta fase. Verificación = lectura cruzada manual + grep básico:
```bash
grep -n "2.65" docs/*.md                                  # Comisión Wompi consistente
grep -rni "tailwind" docs/ CLAUDE.md README.md            # Versión Tailwind unificada (debe decir "v4" + sintaxis CSS-first)
grep -n "VENNDELO_ORIGIN_CITY" docs/*.md                  # Variable presente en INTEGRATIONS y OPERATIONS
grep -rni "vercel kv\|upstash\|vercel cron" docs/         # Debe NO arrojar matches (aparte de notas históricas en DECISIONS)
grep -rni "pgmq\|pg_cron" docs/                           # Debe aparecer en ARCHITECTURE, INTEGRATIONS, ROADMAP, DECISIONS
test -f docs/STATE.md && echo "STATE.md existe"
test -d docs/audits && echo "carpeta audits/ existe"
test ! -f /home/ansible/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md && echo "plan global borrado"
```

---

## Decisiones cerradas con tu input

| # | Tema | Decisión |
|---|---|---|
| H4 | Tailwind 3 vs 4 | ✅ **Tailwind v4 + React 19** — alineado con default oficial de shadcn/ui (verificado: https://ui.shadcn.com/docs/tailwind-v4 a 2026-05-09). Snippets se reescriben a sintaxis CSS-first. Caveats aceptados: `tw-animate-css`, `sonner`, style `new-york`. |
| H6 | Política de stock | ✅ **Reserva al `PENDING_PAYMENT` con TTL 15 min + descuento al `PAID`** — transacción atómica con `SELECT FOR UPDATE` |
| H17 | Traceability | ✅ **Crear `docs/STATE.md`** con [Estado actual / Última sesión / Próximo paso / Bitácora] |
| H14 | Rate limit / cache KV | ✅ **Sin proveedor externo — todo en Postgres + `pg_cron`**. Tabla `rate_limit_buckets` para rate limit, tabla `cache_entries` para cache de respuestas IA/quotes, `pg_cron` para limpieza de expirados. Migrar a Redis externo solo si p95 >50 ms o si volumen lo justifica (ADR-016). |
| H21 | Jobs async (background) | ✅ **Supabase Queues (pgmq) + `pg_cron`** en vez de Vercel Cron. Recuperación carrito, reconciliación órdenes y cleanup viven en Supabase con retries durables. ADR-017. |

---

## 🔴 Crítico — H19. Mandato meta: nada de suposiciones, todo argumentado contra documentación oficial

- **Origen:** indicación explícita del usuario en esta sesión: *"todo debe estar argumentado y no es suposiciones, es decir, todo debe estar basada siempre en la documentacion de la tecnologias correspondientes, y nunca suposiciones"*.
- **Implicación:** cualquier afirmación técnica (cifras, comportamientos, defaults, límites de tier, sintaxis) en docs o en respuestas debe citar la fuente oficial. Si no puedo citar, marco la afirmación como "pendiente de verificar" en lugar de aseverarla.
- **Esta misma auditoría** ya tenía dos afirmaciones erróneas por suposición (H4 sugería Tailwind v3 por "madurez de shadcn"; H5 marcaba la tarjeta `4242` como "de Stripe"). La regla nace porque ya nos pasó.
- **Fix:**
  1. Agregar a `CLAUDE.md` bajo "Mandatos no negociables" (numerar como #9): *"**Argumentación obligatoria.** Toda afirmación técnica (cifras, sintaxis, comportamientos, límites de tier, defaults) debe citar la fuente oficial de la tecnología correspondiente. Si la doc oficial no se puede consultar en el momento, marcar como `[pendiente verificación]` en el doc y no aseverar."*
  2. Cuando una afirmación se verifica, agregar referencia inline a la doc en el mismo párrafo (formato: `(verificado: <URL> a YYYY-MM-DD)` para que el dato tenga fecha de validez).
  3. Cuando una doc oficial cambia y nuestra afirmación queda desactualizada, se trata como bug → fix → ADR si la decisión cambia.

---

## 🟡 H20. Vercel KV está deprecado desde diciembre 2024 (contexto, ya cubierto por H14)

- [Vercel — Redis on Vercel](https://vercel.com/docs/redis) cita textual: *"Vercel KV is no longer available. If you had an existing Vercel KV store, we automatically moved it to Upstash Redis in December 2024."*
- Esto invalida toda mención de "Vercel KV" en PLAN.md/INTEGRATIONS.md como producto independiente.
- **Ya resuelto por la decisión de H14** (todo en Postgres). El fix sigue: borrar las menciones de "Vercel KV" de PLAN.md e INTEGRATIONS.md y dejar solo la decisión Postgres + pg_cron.

---

## 🔴 Crítico — H21. Jobs async: Supabase Queues (pgmq) + pg_cron sobre Vercel Cron

- [docs/ROADMAP.md Fase 5](docs/ROADMAP.md): "Cron Vercel a 1h y 24h" para recuperación de carrito.
- [docs/OPERATIONS.md "Prevención"](docs/OPERATIONS.md): "Cron diario que verifique órdenes en `PENDING_PAYMENT` con > 1h"; "Cron de reconciliación: órdenes `PAID` sin `venndeloShipmentId`".
- ARCHITECTURE.md no incluye `pgmq` ni `pg_cron` como extensiones del schema.
- **Verificación:** [Supabase Docs — Queues / pgmq](https://supabase.com/docs/guides/queues) confirma *"Postgres-native durable Message Queue system with guaranteed delivery"* con **exactly-once delivery** y archivado.
- **Decisión cerrada:** background jobs en `pgmq` + `pg_cron`, no en Vercel Cron.
- **Razones:**
  - Coherente con la línea "todo en Supabase" (mandato CLAUDE.md #3).
  - Retries durables out-of-the-box (Vercel Cron es fire-and-forget).
  - Dashboard nativo en Supabase para observar la cola.
  - Sumamos 0 vendors nuevos.
- **Fix:**
  1. PLAN.md: agregar mención a `pgmq` + `pg_cron` en "Marketing engine" y "Reglas".
  2. ARCHITECTURE.md:
     - Sección "Extensiones de Postgres habilitadas": `pgmq`, `pg_cron`, eventualmente `pg_net`.
     - Diagrama: agregar caja "Workers" alimentada por pgmq.
     - Quitar el ejemplo de `app/api/cron/...` y reemplazar por "Edge Functions consumidoras de pgmq".
  3. INTEGRATIONS.md: nueva sección "Background jobs" detallando productores y consumidores.
  4. ROADMAP.md:
     - Fase 1: agregar "Habilitar extensiones `pgmq` y `pg_cron` en Supabase".
     - Fase 5: cambiar "Cron Vercel a 1h y 24h" por "`pg_cron` enqueue + Edge Function consumer (pgmq) a 1h y 24h".
     - Fase 4: agregar "Edge Function consumer para creación de envíos Venndelo (idempotente)".
  5. OPERATIONS.md: actualizar runbook ("crons" → "consumers de pgmq") + agregar "Cómo ver la cola".
  6. DECISIONS.md: ADR-017 documentando la elección pgmq + pg_cron.

---

## H18 — Plan file fuera del repo (incumple ADR-012)

- El archivo de este plan vive en `/home/ansible/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md` porque **plan mode lo crea ahí automáticamente** y solo permite editarlo en esa ruta durante la sesión.
- [ADR-012](docs/DECISIONS.md) prohíbe documentación fuera del repo.
- **Fix al salir de plan mode (mismo turno donde aplico todos los demás fixes):**
  1. Crear carpeta `docs/audits/`.
  2. Mover el contenido del plan a `docs/audits/2026-05-09-coherence-audit.md` con un breve preámbulo "Esta auditoría se realizó en plan mode, ahora vive en el repo".
  3. Borrar `/home/ansible/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md`.
  4. Agregar entrada en `docs/STATE.md` apuntando a la auditoría.
- **Política para futuras auditorías:** todas viven en `docs/audits/YYYY-MM-DD-<slug>.md`. Si una sale de plan mode, se mueve al repo en el mismo turno.
