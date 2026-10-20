# AGENTS.md — Contexto para agentes (cualquier herramienta)

> Entrada canónica para agentes que no leen `CLAUDE.md` (Codex, etc.).
> **El contexto completo y los mandatos no negociables viven en [`CLAUDE.md`](CLAUDE.md) — léelo antes de tocar nada.** Este archivo solo fija las reglas que más cuesta violar.

## Lo esencial

1. **Lee primero `docs/STATE.md`** (estado actual) y luego solo el doc del dominio de tu tarea — el mapa está en [`docs/README.md`](docs/README.md). No cargues el repo entero en contexto.
2. **Stack fijo:** Next.js **16** + TS strict + Tailwind v4 + shadcn/ui, monorepo pnpm (`apps/web` + `packages/db`), Supabase, Vercel. Next 16 tiene breaking changes vs tu training data — lee `apps/web/AGENTS.md` y la doc en `node_modules/next/dist/docs/` antes de escribir código de framework.
3. **`tmp/` es scratch local gitignored** (auditorías, artifacts, tooling en `tmp/bin`): no lo explores, no lo leas, no tomes nada ahí como fuente de verdad. Al cerrar una auditoría: `make clean-tmp`.
4. **Nada temporal se versiona** (reportes, screenshots, dumps). Los docs de `docs/` son documentos VIVOS: se actualizan en el sitio, prohibido apilar bitácoras fechadas (política completa en CLAUDE.md).
5. **Precios en centavos COP (Int), nunca floats.** UI en español (Colombia); código y commits en inglés; docs en español. Commits convencionales (`feat:`, `fix:`, `docs:`…).
6. **Validaciones antes de entregar:** `pnpm lint && pnpm typecheck && pnpm test` (+ `pnpm build` si tocas build/rutas). En auth, pagos, órdenes, RLS, Wompi, Aveonline: correctness y seguridad > cualquier reducción.
7. **No instales dependencias ni crees archivos de proyecto** sin aprobación explícita.
