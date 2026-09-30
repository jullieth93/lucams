/*
 * Test del mapa de logos de transportadoras (lib/carrier-logos.ts).
 *
 * Cubre:
 *   1. Normalización slug/nombre (case, tildes, espacios) + aliases cortos.
 *   2. Null para carriers sin logo (el caller muestra el ícono Truck).
 *   3. TODOS los `src` del mapa existen en disco bajo public/ con el nombre
 *      exacto — un typo en el path rompería el logo en runtime sin que
 *      typecheck/lint lo noten.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { carrierLogo } from "./carrier-logos";

describe("carrierLogo", () => {
  it("mapea los slugs que genera el provider Aveonline", () => {
    // aveonline.ts: nombreTransportadora.toLowerCase().replace(/\s+/g, "-")
    expect(carrierLogo("servientrega")?.src).toBe("/carriers/servientrega.svg");
    expect(carrierLogo("coordinadora-mercantil")?.src).toBe(
      "/carriers/coordinadora-mercantil.svg",
    );
    expect(carrierLogo("interrapidisimo")?.src).toBe("/carriers/interrapidisimo.svg");
    expect(carrierLogo("envia")?.src).toBe("/carriers/envia.png");
    expect(carrierLogo("tcc-sa")?.src).toBe("/carriers/tcc-sa.svg");
    expect(carrierLogo("deprisa")?.src).toBe("/carriers/deprisa.svg");
    expect(carrierLogo("99minutos")?.src).toBe("/carriers/99minutos.svg");
    expect(carrierLogo("go-envios")?.src).toBe("/carriers/go-envios.svg");
    expect(carrierLogo("lucams")?.src).toBe("/brand/lucams-mascot.png");
  });

  it("normaliza nombres crudos de Aveonline (admin usa el `text` tal cual)", () => {
    expect(carrierLogo("SERVIENTREGA")?.src).toBe("/carriers/servientrega.svg");
    expect(carrierLogo("COORDINADORA MERCANTIL")?.src).toBe(
      "/carriers/coordinadora-mercantil.svg",
    );
    expect(carrierLogo("TCC SA")?.src).toBe("/carriers/tcc-sa.svg");
    expect(carrierLogo("Envía")?.src).toBe("/carriers/envia.png");
  });

  it("resuelve los aliases cortos (la guía puede volver con el nombre corto)", () => {
    expect(carrierLogo("coordinadora")?.src).toBe("/carriers/coordinadora-mercantil.svg");
    expect(carrierLogo("tcc")?.src).toBe("/carriers/tcc-sa.svg");
  });

  it("devuelve null para transportadoras sin logo o valores vacíos", () => {
    expect(carrierLogo("dhl-express")).toBeNull();
    expect(carrierLogo("")).toBeNull();
    expect(carrierLogo(null)).toBeNull();
    expect(carrierLogo(undefined)).toBeNull();
  });

  it("todos los src del mapa existen en disco bajo public/", () => {
    const publicDir = path.resolve(__dirname, "../public");
    const srcs = [
      "servientrega",
      "coordinadora-mercantil",
      "interrapidisimo",
      "envia",
      "tcc-sa",
      "deprisa",
      "99minutos",
      "go-envios",
      "lucams",
    ].map((slug) => carrierLogo(slug)!.src);
    for (const src of new Set(srcs)) {
      expect(existsSync(path.join(publicDir, src)), `falta public${src}`).toBe(true);
    }
  });
});
