# AGENTS.md — Contexto para agentes (cualquier herramienta)

> Entrada canónica para agentes que no leen `CLAUDE.md` (Codex, Antigravity, Cursor, etc.).
> **El contexto completo y los mandatos no negociables viven en [`CLAUDE.md`](CLAUDE.md) — léelo antes de tocar nada.** Este archivo fija las reglas que más cuesta violar.

## Lo esencial

1. **Divulgación progresiva de 3 niveles (ahorro de contexto):** lee primero [`docs/STATE.md`](docs/STATE.md) (~6 KB) y luego **únicamente** el documento de [`docs/domains/`](docs/README.md) o [`docs/integrations/`](docs/integrations/README.md) de tu tarea según el mapa en [`docs/README.md`](docs/README.md). Nunca cargues el repo entero.
2. **Stack fijo:** Next.js **16** + TS strict + Tailwind v4 + shadcn/ui, monorepo pnpm (`apps/web` + `packages/db`), Supabase, Vercel. Next 16 tiene breaking changes — lee [`apps/web/AGENTS.md`](apps/web/AGENTS.md) y `node_modules/next/dist/docs/` antes de escribir código de framework.
3. **`tmp/` es scratch local gitignored** (auditorías, artifacts, tooling en `tmp/bin`): no lo explores, no lo leas y no tomes nada ahí como fuente de verdad. Al cerrar una auditoría: `make clean-tmp`.
4. **Nada temporal se versiona** (reportes, screenshots, dumps, scripts one-shot). Los archivos de `docs/` son **documentos VIVOS**: se actualizan en el sitio, prohibido apilar bitácoras fechadas (política en [`CLAUDE.md`](CLAUDE.md)).
5. **Precios en centavos COP (`Int`), nunca floats.** Marca siempre **«Lucams»** / **«Lucams Shop»** (prohibido el apóstrofo o el guion bajo en prosa/UI — `ADR-138`). UI en español (`es-CO`, **tuteo** estricto; el voseo rompe CI); código y commits en inglés; docs en español. Commits convencionales (`feat:`, `fix:`, `docs:`…).
6. **Validaciones antes de entregar:** `make check && pnpm test` (+ `pnpm build` si tocas build/rutas). En auth, pagos, órdenes, RLS, Wompi y Aveonline: exactitud y seguridad > cualquier atajo.
7. **No instales dependencias ni crees archivos de proyecto** sin aprobación explícita. Ramas protegidas: `develop` (STG) y `production` (PRD); nunca hagas push directo a ellas.
