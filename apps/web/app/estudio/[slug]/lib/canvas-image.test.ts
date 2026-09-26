/*
 * Test del helper de carga de imágenes para canvas (2026-09-25 — bug STG:
 * fichas de letras solo-letra en 3D por exigencia de CORS del bucket).
 * La parte pura (canvasSafeImageSrc) decide la URL: remota → optimizador de
 * Next (mismo origen); data:/blob:/relativa → directa.
 */

import { describe, expect, it } from "vitest";
import { canvasSafeImageSrc } from "./canvas-image";

describe("canvasSafeImageSrc", () => {
  it("URL https remota → pasa por el optimizador de Next (mismo origen, anti-CORS)", () => {
    const url = "https://bucket.example.com/product-images/set/a b.png";
    expect(canvasSafeImageSrc(url)).toBe(`/_next/image?url=${encodeURIComponent(url)}&w=640&q=80`);
  });

  it("data: y blob: van directas (no hay origen remoto que proxear)", () => {
    expect(canvasSafeImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(canvasSafeImageSrc("blob:https://app.example/uuid")).toBe(
      "blob:https://app.example/uuid",
    );
  });

  it("relativas van directas (ya son mismo origen)", () => {
    expect(canvasSafeImageSrc("/templates/sep-mag-2x6.svg")).toBe("/templates/sep-mag-2x6.svg");
  });

  it("el ancho de la imagen optimizada es parametrizable", () => {
    expect(canvasSafeImageSrc("https://x.co/a.png", 300)).toContain("&w=300&");
  });
});
