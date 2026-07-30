/*
 * getCmsList — lectura tipada de campos LISTA (CMS v2, roadmap B4): parsea el
 * body JSON del campo publicado, valida item por item con `validate` y cae al
 * fallback ante CUALQUIER problema (campo ausente o sin publicar, JSON
 * inválido, array vacío, un solo item que no pase la validación, o error de
 * base de datos). REGLA DE ORO del CMS: el sitio nunca se rompe por contenido
 * mal editado.
 *
 * Unit con prisma mockeado (patrón de features/consent/service.test.ts):
 * unstable_cache se reemplaza por identidad para ejecutar la función cruda
 * (sin caché de Next).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCmsList } from "./cms";

const findFirst = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { cmsField: { findFirst } } }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

type Link = { label: string; href: string };

const FALLBACK: Link[] = [{ label: "Fallback", href: "/fallback" }];

// Misma validación que usa site-footer.tsx para los enlaces legales.
const validateLink = (v: unknown): Link | null => {
  if (typeof v !== "object" || v === null) return null;
  const l = v as Link;
  return typeof l.label === "string" && typeof l.href === "string" ? l : null;
};

function mockPublishedBody(body: string) {
  findFirst.mockResolvedValue({
    key: "footer.legal.links",
    label: "Enlaces legales",
    helpText: null,
    type: "JSON",
    category: "FOOTER",
    updatedAt: new Date("2026-07-30T00:00:00Z"),
    publishedVersion: { title: null, body, version: 3 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCmsList", () => {
  it("devuelve los items tipados cuando el body es un array válido", async () => {
    mockPublishedBody(
      JSON.stringify([
        { label: "Aviso de Privacidad", href: "/legal/privacidad" },
        { label: "Términos y Condiciones", href: "/legal/terminos" },
      ]),
    );
    const links = await getCmsList("footer.legal.links", validateLink, FALLBACK);
    expect(links).toEqual([
      { label: "Aviso de Privacidad", href: "/legal/privacidad" },
      { label: "Términos y Condiciones", href: "/legal/terminos" },
    ]);
  });

  it("cae al fallback si el campo no existe o no está publicado", async () => {
    findFirst.mockResolvedValue(null);
    expect(await getCmsList("footer.legal.links", validateLink, FALLBACK)).toEqual(FALLBACK);
  });

  it("cae al fallback si el body no es JSON válido", async () => {
    mockPublishedBody("[{roto");
    expect(await getCmsList("footer.legal.links", validateLink, FALLBACK)).toEqual(FALLBACK);
  });

  it("cae al fallback si el JSON no es un array", async () => {
    mockPublishedBody('{"label":"A","href":"/a"}');
    expect(await getCmsList("footer.legal.links", validateLink, FALLBACK)).toEqual(FALLBACK);
  });

  it("cae al fallback si el array viene vacío", async () => {
    mockPublishedBody("[]");
    expect(await getCmsList("footer.legal.links", validateLink, FALLBACK)).toEqual(FALLBACK);
  });

  it("cae al fallback si UN SOLO item no pasa la validación", async () => {
    mockPublishedBody(JSON.stringify([{ label: "Bien", href: "/bien" }, { label: "Sin href" }]));
    expect(await getCmsList("footer.legal.links", validateLink, FALLBACK)).toEqual(FALLBACK);
  });

  it("cae al fallback si la base de datos falla", async () => {
    findFirst.mockRejectedValue(new Error("db down"));
    expect(await getCmsList("footer.legal.links", validateLink, FALLBACK)).toEqual(FALLBACK);
  });
});
