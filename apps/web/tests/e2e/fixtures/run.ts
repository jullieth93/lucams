/*
 * RUN id obligatorio por corrida (PROMPT_E2E_HOMOLOGACION §5.1):
 *   RUN = e2e-<tag>-<Date.now()>
 *
 * TODA entidad creada por un spec debe llevar el RUN en slug/email/nombre.
 * El timestamp de 13 dígitos cumple el patrón que el teardown global del repo
 * (vitest-global-teardown.ts) reconoce como basura de test:
 *   - catálogo: slug ~ [0-9]{13,}
 *   - transaccional: number/email ~ [0-9]{15,} (tag+digits suelen dar 15+)
 * Para emails de cliente/cotización preferir el dominio `.test` (data-factory
 * lo aplica): también entra en la red por `email ILIKE '%.test'`.
 */
export function newRunId(tag: string): string {
  const slug = tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `e2e-${slug}-${Date.now()}`;
}
