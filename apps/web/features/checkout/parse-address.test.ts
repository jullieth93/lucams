/*
 * Tests de parseStructuredAddress — la zona de entrega genérica (envío propio
 * Lucam's): se conserva SOLO si la ciudad está en el catálogo de zonas
 * (lib/lucams-zones.ts) y el id es válido para ESA ciudad; en cualquier otro
 * caso se descarta en silencio (anti-tamper).
 */

import { describe, expect, it } from "vitest";
import { parseStructuredAddress } from "./parse-address";

/** FormData mínima válida de dirección urbana en Bogotá. */
function urbanForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("deptCode", "11");
  fd.set("cityCode", "11001");
  fd.set("addressKind", "urban");
  fd.set("viaType", "Calle");
  fd.set("viaNumber", "100");
  fd.set("cruceNumber", "15-20");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

describe("parseStructuredAddress — zona de entrega (localityId)", () => {
  it("conserva una zona válida de la ciudad (Bogotá → localidad)", () => {
    const res = parseStructuredAddress(urbanForm({ localityId: "chapinero" }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.localityId).toBe("chapinero");
  });

  it("descarta un id que no es zona del catálogo", () => {
    const res = parseStructuredAddress(urbanForm({ localityId: "mordor" }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.localityId).toBeUndefined();
  });

  it("descarta la zona si la ciudad no está en el catálogo (Medellín aún no)", () => {
    const res = parseStructuredAddress(
      urbanForm({ deptCode: "05", cityCode: "05001", localityId: "chapinero" }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.localityId).toBeUndefined();
  });

  it("sin zona → undefined (opcional; la obligatoriedad la decide saveDatosAction)", () => {
    const res = parseStructuredAddress(urbanForm());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.localityId).toBeUndefined();
  });
});
