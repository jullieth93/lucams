# Auditorías históricas

Cada auditoría queda registrada como markdown propio con fecha + slug:
`YYYY-MM-DD-<slug>.md`.

## Tipos

- `*-coherencia.md` — coherencia entre docs (verificación cruzada)
- `*-productive-readiness.md` — gap analysis pre-launch
- `*-accessibility.md` — axe-core + screen reader smoke
- `*-performance.md` — Lighthouse + Web Vitals analysis
- `*-cross-browser.md` — bugs por browser/device
- `*-load.md` — k6 results + p95/p99/throughput
- `*-security.md` — pentest manual + npm audit + gitleaks
- `*-seo.md` — Google Search Console + Rich Results test
- `*-deliverability.md` — mail-tester + DKIM/SPF/DMARC
- `*-dr-drill.md` — backup restore drill timing
- `*-qa-<flujo>.md` — bloqueantes encontrados durante QA checklist

## Plantilla mínima

```markdown
# Auditoría: <título>

**Fecha**: YYYY-MM-DD
**Responsable**: Lucy + Claude
**Tipo**: accessibility | performance | cross-browser | load | security | ...
**Versión del sitio auditada**: commit SHA o git tag

## Hallazgos

### Críticos (bloqueantes)
- ...

### Warnings (no bloqueantes, mejoras post-launch)
- ...

### Notas / observaciones
- ...

## Acciones tomadas

- [x] Fix commit `abc1234`
- [ ] Issue para post-launch: ...

## Decisión

- GO / NO-GO / Re-auditar después de fix
```
