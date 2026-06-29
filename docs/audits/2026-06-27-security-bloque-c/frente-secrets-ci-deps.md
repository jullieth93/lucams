# Frente 5 — Secrets / CI/CD / Dependencias

Auditoría contra `docs/SECURITY.md` (§ Manejo de secretos, § Dependency scanning, § CI/CD security) + `docs/OPERATIONS.md` (§ rotación, env vars). Evidencia con file:line. `gh` no está autenticado → branch protection no verificable desde aquí (marcado `[pendiente verificación]`).

## Resumen ejecutivo

Estado sólido en lo fundamental: **cero secretos hardcodeados**, `.env*` correctamente ignorado, gitleaks en CI + config custom, todos los `NEXT_PUBLIC_*` son legítimamente públicos. Lo que falta es **hardening del pipeline pre-launch**: no hay `pnpm audit`, no hay license check, no hay E2E en CI, no hay Dependabot/Renovate, no hay pre-commit hook local (solo el step de CI), y branch protection no está confirmada. Nada de esto es P0 estricto salvo la combinación audit+branch-protection.

## Inventario de controles

| # | Control (spec SECURITY.md) | Estado | Evidencia |
|---|---|---|---|
| 1 | `.env*` gitignored, solo `.env.example` versionado | ✅ | `.gitignore:8-13` (`.env`, `.env.*`, con allowlist de `*.example`) |
| 2 | Sin secretos hardcodeados en código | ✅ | grep `(sk_live\|sk-ant-\|prv_prod_\|re_…\|password=…)` sobre `app/lib/components` → 0 hits |
| 3 | Sin secretos en `NEXT_PUBLIC_*` | ✅ | 8 vars públicas, todas designed-public: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `TURNSTILE_SITE_KEY`, `WA_NUMBER`, `SITE_URL`, `BUILD_VERSION`, `GIT_SHA`, `MAINTENANCE_MODE` |
| 4 | gitleaks en CI (escaneo repo completo en cada PR) | ✅ | `.github/workflows/ci.yml:90-102` job `secrets-scan` con `fetch-depth: 0` |
| 5 | gitleaks config custom (Supabase/Wompi/Anthropic/Resend) | ✅ | `.gitleaks.toml:14-39` reglas + `useDefault`; allowlist para `.env.example`/docs |
| 6 | typecheck en CI | ✅ | `ci.yml:54-55` `pnpm -r typecheck` |
| 7 | lint en CI | ✅ | `ci.yml:57-58` |
| 8 | build en CI | ✅ | `ci.yml:60-61` |
| 9 | unit tests (Vitest) en CI | ✅ | `ci.yml:63-88` job `unit-tests` |
| 10 | format check (Prettier) en CI | ✅ | `ci.yml:104-126` |
| 11 | `pnpm install --frozen-lockfile` | ✅ | `ci.yml:49` (lockfile versionado, integridad verificada) |
| 12 | `GITHUB_TOKEN` permisos mínimos | 🟡 | No hay `permissions:` declarado en `ci.yml` → usa default del repo. Spec pide `contents: read` explícito (`SECURITY.md:778-779`) |
| 13 | E2E (Playwright) en CI | ❌ | `playwright.config.ts` + `tests/e2e/smoke.spec.ts` existen, pero CI NO los corre (`grep e2e ci.yml` → NONE). Spec lo lista como step (`SECURITY.md:789`) |
| 14 | `pnpm audit --audit-level=high` en CI | ❌ | No existe en `ci.yml`. Spec lo exige (`SECURITY.md:759,790`; `OPERATIONS`/dep-scan) |
| 15 | License check (GPL/AGPL allowlist) | ❌ | No existe. Spec lo exige (`SECURITY.md:762,792`) |
| 16 | Dependabot / Renovate | ❌ | No hay `.github/dependabot.yml` ni `renovate.json`. Spec lo exige (`SECURITY.md:760`) |
| 17 | Pre-commit hook gitleaks (local, husky) | ❌ | Sin `.husky/`, sin `simple-git-hooks`, sin `prepare` script, `.git/hooks/` vacío. Spec pide pre-commit (`SECURITY.md:210`) — solo existe el step de CI |
| 18 | Política de rotación documentada | ✅ | `OPERATIONS.md:323-331` tabla por secreto + IRP-001 runbook (`SECURITY.md:944-969`) |
| 19 | Branch protection en `main` (PR req, reviews, status checks, no force-push) | 🟡 `[pendiente verificación]` | `gh` no autenticado; no verificable desde FS. Spec lo exige (`SECURITY.md:780`) |
| 20 | Signed commits en `main` | 🟡 `[pendiente verificación]` | No verificable desde FS (`SECURITY.md:781`) |
| 21 | Lighthouse CI sobre preview | ❌ | No en CI (`SECURITY.md:793`). P2, no bloqueante |

## Hallazgos priorizados (lo que falta)

### P1 — recomendados antes de launch

**H1 · `pnpm audit` ausente en CI** (#14) — severidad P1, esfuerzo **S**, **AUTÓNOMO**
Sin este gate, una dependencia con CVE alto/crítico entra a producción sin alerta. Fix: nuevo job en `ci.yml`:
```yaml
  dep-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: "11.0.9" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high
```
Nota: no corrí `pnpm audit` en esta sesión (no está cableado y puede tardar/tocar red). El estado real de CVEs queda **`[pendiente verificación]`** hasta que el job exista o se corra una vez manualmente.

**H2 · Sin Dependabot/Renovate** (#16) — P1, esfuerzo **S**, **AUTÓNOMO**
Sin automatización de updates, los parches de seguridad dependen de revisión manual (`SECURITY.md:766-769`). Fix mínimo: `.github/dependabot.yml` con ecosystem `npm` (pnpm) semanal + `github-actions`. Renovate da mejor agrupación pero requiere instalar la GitHub App (**NECESITA-LUCY** para autorizar la app). Dependabot es 100% autónomo.

**H3 · `permissions:` no declarado en CI** (#12) — P1, esfuerzo **S**, **AUTÓNOMO**
Agregar al top de `ci.yml`: `permissions:\n  contents: read`. El job gitleaks ya usa `GITHUB_TOKEN`; con read-only basta. Cierra el mandato de permisos mínimos.

**H4 · E2E no corre en CI** (#13) — P1, esfuerzo **M**, **AUTÓNOMO**
El smoke spec existe pero nunca se ejecuta en PR. Requiere `PLAYWRIGHT_BASE_URL` apuntando a un Vercel preview (el propio comentario del spec lo dice). Cableado típico: job que espera el deploy preview de Vercel y corre `pnpm --filter web test:e2e`. Es seguridad indirecta (regresiones en flujos auth/checkout). No bloqueante si los unit tests cubren lo crítico.

### P2 — post-launch aceptable

**H5 · License check ausente** (#15) — P2, esfuerzo **S**, **AUTÓNOMO**
`license-checker`/`license-checker-rseidelsohn` en un job que falle ante GPL/AGPL. Riesgo bajo (proyecto propietario, `license: UNLICENSED` en `package.json`), pero la spec lo pide.

**H6 · Sin pre-commit hook local (husky)** (#17) — P2, esfuerzo **S**, **AUTÓNOMO**
gitleaks ya corre en CI y GitHub Push Protection es la red real (validada en incidente 2026-05-09). El pre-commit es defensa-en-profundidad temprana. Fix: husky + `gitleaks protect --staged` en `pre-commit`. Bajo impacto porque las capas posteriores ya atrapan el leak.

**H7 · Lighthouse CI ausente** (#21) — P2/P3, performance/SEO, no seguridad core.

### Verificación humana requerida

**ACCIÓN HUMANA REQUERIDA (Lucy / owner del repo `jullieth93/lucams`):** confirmar en GitHub → Settings → Branches que `main` (y `develop`) tienen branch protection: PR obligatorio, ≥1 review, status checks `quality`/`unit-tests`/`secrets-scan`/`format-check` requeridos, y bloqueo de force-push (#19). También confirmar si se requieren signed commits (#20). No pude verificarlo: `gh` no está autenticado en esta VM. Si la protección no está activa, es **P0 efectivo** — sin ella todos los gates de CI son evadibles con un push directo a `main`.

## Notas de honestidad

- **CVEs reales de dependencias: `[pendiente verificación]`** — no ejecuté `pnpm audit` (no cableado; podría tardar). Recomiendo correrlo una vez al añadir H1.
- **Branch/signed-commit protection: `[pendiente verificación]`** — requiere acceso autenticado a GitHub.
- Lo verificado por código es fiable: secretos, gitignore, gitleaks config, jobs de CI, NEXT_PUBLIC, rotación documentada.

Archivos relevantes:
- `/home/ansible/workspaces/lucams_shop/.github/workflows/ci.yml`
- `/home/ansible/workspaces/lucams_shop/.gitleaks.toml`
- `/home/ansible/workspaces/lucams_shop/.gitignore`
- `/home/ansible/workspaces/lucams_shop/docs/OPERATIONS.md` (§ rotación, líneas 315-331)
- `/home/ansible/workspaces/lucams_shop/docs/SECURITY.md` (§ secrets 175-248, § dep-scan 754-769, § CI/CD 773-793)
- `/home/ansible/workspaces/lucams_shop/apps/web/playwright.config.ts` + `apps/web/tests/e2e/smoke.spec.ts` (E2E existe, no cableado en CI)