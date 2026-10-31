/*
 * LUC-SEC-007 (auditoría 2026-10-30) — lectura acotada de bodies.
 *
 * Hasta hoy los webhooks (Wompi/Aveonline/Resend) y los sumideros públicos
 * (vitals, log-error, heartbeats, save-canvas beacon, edit-mode CMS) llamaban
 * req.text()/request.json()/request.formData() SIN techo de aplicación: la
 * firma de un webhook exige el body crudo, pero NO exige aceptarlo ilimitado
 * — un body gigante se leía y parseaba entero antes de cualquier rechazo.
 *
 * readBodyWithLimit:
 *   - rechaza temprano un Content-Length declarado por encima del máximo
 *     (413), SIN confiar solo en él (puede mentir hacia abajo);
 *   - lee el stream y aborta al sobrepasar el presupuesto real (413);
 *   - el límite es por RUTA y pequeño (el límite de plataforma queda como
 *     segunda capa, no como la única).
 */

import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readBodyWithLimit } from "@/lib/read-body-with-limit";

function reqWithStream(chunks: string[], contentLength?: number): Request {
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  // Request con stream requiere duplex en undici; en vitest (Node) el ctor lo acepta.
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
    body: stream,
    // @ts-expect-error — duplex requerido por undici para streams
    duplex: "half",
  });
}

describe("readBodyWithLimit", () => {
  it("body dentro del presupuesto → lo devuelve íntegro", async () => {
    const req = reqWithStream(['{"ok":', "true}"], 11);
    await expect(readBodyWithLimit(req, 1024)).resolves.toBe('{"ok":true}');
  });

  it("Content-Length declarado por ENCIMA del máximo → 413 sin leer el stream", async () => {
    const req = reqWithStream(["x".repeat(5000)], 5000);
    await expect(readBodyWithLimit(req, 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("Content-Length MENTIROSO (declara poco, el stream es mayor) → 413 al sobrepasar el presupuesto real", async () => {
    const req = reqWithStream(["x".repeat(900), "y".repeat(900)], 100); // declara 100, envía 1800
    await expect(readBodyWithLimit(req, 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("sin Content-Length (chunked) y stream bajo el presupuesto → OK", async () => {
    const req = reqWithStream(["a".repeat(500), "b".repeat(400)]);
    await expect(readBodyWithLimit(req, 1024)).resolves.toBe("a".repeat(500) + "b".repeat(400));
  });

  it("justo EN el límite → OK; un byte más → 413", async () => {
    await expect(readBodyWithLimit(reqWithStream(["x".repeat(1024)]), 1024)).resolves.toHaveLength(
      1024,
    );
    await expect(readBodyWithLimit(reqWithStream(["x".repeat(1025)]), 1024)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    );
  });

  it("el error conoce su status HTTP (413) para que la ruta responda sin mapear strings", async () => {
    const req = reqWithStream(["x".repeat(9000)], 9000);
    const err = await readBodyWithLimit(req, 1024).catch((e) => e);
    expect(err).toBeInstanceOf(BodyTooLargeError);
    expect(err.status).toBe(413);
  });
});
