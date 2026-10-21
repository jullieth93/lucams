/*
 * Tests de parseStructuredAddress — la zona de entrega genérica (envío propio
 * Lucams): se conserva SOLO si la ciudad está en el catálogo de zonas
 * (lib/lucams-zones.ts) y el id es válido para ESA ciudad; en cualquier otro
 * caso se descarta en silencio (anti-tamper).
 */

import { describe, expect, it } from "vitest";
import { parseStructuredAddress } from "./parse-address";

/** FormData mínima válida de dirección urbana en Bogotá (con tipo de destino,
 *  obligatorio en capturas nuevas desde 2026-10). */
function urbanForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("deptCode", "11");
  fd.set("cityCode", "11001");
  fd.set("addressKind", "urban");
  fd.set("viaType", "Calle");
  fd.set("viaNumber", "100");
  fd.set("cruceNumber", "15-20");
  fd.set("destinationType", "casa");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

/** FormData mínima válida de dirección rural. */
function ruralForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("deptCode", "11");
  fd.set("cityCode", "11001");
  fd.set("addressKind", "rural");
  fd.set("vereda", "El Roble");
  fd.set("referencia", "a 200m del puente, casa azul portón negro");
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

  it("sin zona → undefined (opcional en el schema; la obligatoriedad la decide saveDatosAction)", () => {
    const res = parseStructuredAddress(urbanForm());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.localityId).toBeUndefined();
  });
});

describe("parseStructuredAddress — barrio (neighborhood)", () => {
  it("conserva el barrio (trim) en cualquier ciudad", () => {
    const res = parseStructuredAddress(urbanForm({ neighborhood: "  Cedritos  " }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.neighborhood).toBe("Cedritos");
  });

  it("vacío → undefined (opcional)", () => {
    const res = parseStructuredAddress(urbanForm({ neighborhood: "   " }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.neighborhood).toBeUndefined();
  });

  it("rechaza un barrio de más de 100 caracteres", () => {
    const res = parseStructuredAddress(urbanForm({ neighborhood: "x".repeat(101) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors.neighborhood).toBeDefined();
  });
});

/*
 * Tipo de destino (2026-10, anti-devoluciones): obligatorio en toda captura
 * urbana nueva (el form lo pide y acá se re-valida anti-tamper); los campos
 * estructurados se leen del FormData y la obligatoriedad por tipo la aplica
 * el superRefine del schema (mismo mensaje en cliente y server).
 */
describe("parseStructuredAddress — tipo de destino (destinationType)", () => {
  it("urbana sin destinationType → error pidiendo elegir el tipo", () => {
    const fd = urbanForm();
    fd.delete("destinationType");
    const res = parseStructuredAddress(fd);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors.destinationType?.[0]).toContain("tipo de destino");
  });

  it("destinationType inválido (tamper) → rechazado por el schema", () => {
    const res = parseStructuredAddress(urbanForm({ destinationType: "mordor" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors.destinationType).toBeDefined();
  });

  it("edificio sin apartamento → error específico en apartment", () => {
    const res = parseStructuredAddress(urbanForm({ destinationType: "edificio" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors.apartment?.[0]).toContain("Falta el número de apartamento");
  });

  it("conjunto_torres completo parsea con torre + apartamento + conjunto + referencia", () => {
    const res = parseStructuredAddress(
      urbanForm({
        destinationType: "conjunto_torres",
        tower: "B",
        apartment: "401",
        complexName: "Conjunto Lucams",
        referencePoint: "portería norte",
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.data.kind === "urban") {
      expect(res.data.destinationType).toBe("conjunto_torres");
      expect(res.data.tower).toBe("B");
      expect(res.data.apartment).toBe("401");
      expect(res.data.complexName).toBe("Conjunto Lucams");
      expect(res.data.referencePoint).toBe("portería norte");
    }
  });

  it("los campos de destino vacíos quedan undefined (no strings vacíos)", () => {
    const res = parseStructuredAddress(urbanForm({ apartment: "   ", tower: "" }));
    expect(res.ok).toBe(true);
    if (res.ok && res.data.kind === "urban") {
      expect(res.data.apartment).toBeUndefined();
      expect(res.data.tower).toBeUndefined();
    }
  });
});

describe("parseStructuredAddress — rural: teléfono alternativo en la zona", () => {
  it("altPhone con formato visible se normaliza a 10 dígitos", () => {
    const res = parseStructuredAddress(ruralForm({ altPhone: "300 123 4567" }));
    expect(res.ok).toBe(true);
    if (res.ok && res.data.kind === "rural") expect(res.data.altPhone).toBe("3001234567");
  });

  it("altPhone inválido → error específico", () => {
    const res = parseStructuredAddress(ruralForm({ altPhone: "12345" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors.altPhone?.[0]).toContain("móvil colombiano");
  });

  it("referencia rural de menos de 20 caracteres se rechaza (guía reforzada)", () => {
    const res = parseStructuredAddress(ruralForm({ referencia: "casa azul" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors.referencia?.[0]).toContain("mínimo 20 caracteres");
  });

  it("rural no exige destinationType", () => {
    const res = parseStructuredAddress(ruralForm());
    expect(res.ok).toBe(true);
  });
});
