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
- **`2026-09-11-coherencia-funcional-productiva.md`** — Auditoría 360° de coherencia funcional
  productiva (2026-09-11), **remediada el 2026-09-11/12**. Sus decisiones quedaron como ADR-090 a
  ADR-097 en DECISIONS.md y su parte operativa en el changelog 2026-09-12 de OPERATIONS.md
  (crons 9 HTTP + 1 SQL, migraciones 032/033 + 2 Prisma, saneamiento LOCAL/STG, split de seeds y
  env-guard fail-closed).
- **`2026-09-18-responsive-ux-estudios-admin.md`** — Auditoría UX responsive de toda la
  solución (validación del owner en móvil/tablet/desktop: plantilla de Estudio unificada con
  referencia Separadores→Magnéticos + admin en tablet + avisos Vercel INP/CSP), **remediada
  en 2 rondas y VALIDADA por el owner en STG el 2026-09-18**. Sus decisiones quedaron como
  **ADR-103/104** en DECISIONS.md y sus gates de overflow horizontal cableados en CI
  (storefront en PR, admin en nightly). Pendiente para su consolidación: liberación a PRD y
  verificación RUM de INP en Speed Insights tras el despliegue.
- Post-mortem de incidente activo: `docs/incidents/2026-05-09-secret-key-leak.md` (fuera de
  esta carpeta, enlazado desde SECURITY.md).

## Convención para auditorías futuras

Un archivo `YYYY-MM-DD-<slug>.md` con: alcance, hallazgos por severidad con evidencia
`archivo:línea`, verificación, y sección de cierre cuando se remedie. Cuando una auditoría
quede 100% cerrada y su contenido absorbido por los docs canónicos, se consolida (se elimina
el archivo; git conserva la historia).
