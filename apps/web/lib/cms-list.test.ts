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
import { getCmsBlock, getCmsList, getSettingValue } from "./cms";

const findMany = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { cmsField: { findMany } } }));
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
  findMany.mockResolvedValue([
    {
      key: "footer.legal.links",
      kind: "BLOCK",
      label: "Enlaces legales",
      helpText: null,
      type: "JSON",
      category: "FOOTER",
      isPublished: true,
      updatedAt: new Date("2026-07-30T00:00:00Z"),
      publishedVersion: { title: null, body, version: 3 },
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCmsList & snapshot CMS", () => {
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

  it("hidrata updatedAt como instancia real de Date incluso tras serialización JSON", async () => {
    findMany.mockResolvedValue([
      {
        key: "home.hero.badge",
        kind: "BLOCK",
        label: "Badge",
        helpText: null,
        type: "TEXT",
        category: "HOME",
        isPublished: true,
        updatedAt: "2026-11-02T12:00:00.000Z" as unknown as Date,
        publishedVersion: { title: "Badge", body: "Hecho a mano", version: 1 },
      },
      {
        key: "CONTACT_EMAIL",
        kind: "SETTING",
        label: "Email",
        helpText: null,
        type: "EMAIL",
        category: "CONTACT",
        isPublished: true,
        updatedAt: new Date("2026-11-02T12:00:00.000Z"),
        publishedVersion: { title: null, body: "hola@lucamsshop.com", version: 1 },
      },
    ]);
    const block = await getCmsBlock("home.hero.badge");
    expect(block?.body).toBe("Hecho a mano");
    expect(block?.updatedAt).toBeInstanceOf(Date);
    expect(await getSettingValue("CONTACT_EMAIL", "fallback@x.co")).toBe("hola@lucamsshop.com");
  });

  it("cae al fallback si el campo no existe o no está publicado", async () => {
    findMany.mockResolvedValue([]);
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
    findMany.mockRejectedValue(new Error("db down"));
    expect(await getCmsList("footer.legal.links", validateLink, FALLBACK)).toEqual(FALLBACK);
  });
});
