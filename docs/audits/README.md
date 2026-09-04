# Auditorías

> **Consolidación 2026-09-03 (mandato de Lucy):** las auditorías históricas fechadas
> (mayo–agosto 2026: coherencia, mega-audit, reestructuras de catálogo, certificaciones de
> bloques, homologaciones e2e, sweeps de UX admin/storefront) se eliminaron del árbol — eran
> versiones de trabajo ya ejecutado. Su contenido sigue disponible en git history
> (`git log -- docs/audits`). Las lecciones permanentes viven en los docs canónicos
> (SECURITY, OPERATIONS, CONVENTIONS, DECISIONS, STATE).

## Vigente

- **`auditoria_seguridad_lucams.md`** — Auditoría OWASP Top 10 (2026-08-24), **remediada y
  homologada en LOCAL/STG/PRD (2026-08-29/30)**. Su §11 es el cierre hallazgo por hallazgo y
  la lista de acciones de operador. Es el formato de referencia para futuras auditorías de
  seguridad.
- Post-mortem de incidente activo: `docs/incidents/2026-05-09-secret-key-leak.md` (fuera de
  esta carpeta, enlazado desde SECURITY.md).

## Convención para auditorías futuras

Un archivo `YYYY-MM-DD-<slug>.md` con: alcance, hallazgos por severidad con evidencia
`archivo:línea`, verificación, y sección de cierre cuando se remedie. Cuando una auditoría
quede 100% cerrada y su contenido absorbido por los docs canónicos, se consolida (se elimina
el archivo; git conserva la historia).
