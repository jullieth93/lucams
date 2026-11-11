// @vitest-environment jsdom

/*
 * VersionHistory — historial visual de campos LISTA (owner 2026-11-11): las
 * versiones de un campo lista (ej. home.banners) muestran tarjetas con
 * miniatura + etiquetas («Título», «Enlace», «Activo»), nunca el JSON crudo.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/app/admin/(panel)/contenido/actions", () => ({
  publishCmsFieldAction: vi.fn(),
}));

import { VersionHistory } from "./version-history";

afterEach(() => cleanup());

const BANNER_SCHEMA = [
  { name: "imagen", type: "IMAGE", label: "Imagen (de la mediateca)" },
  { name: "titulo", type: "TEXT", label: "Título" },
  { name: "enlace", type: "URL", label: "Enlace (ruta o URL)" },
  { name: "activo", type: "BOOLEAN", label: "Activo (Sí/No)" },
];

const VERSION_BODY = JSON.stringify([
  {
    imagen: "media-1",
    titulo: "Vive la Navidad Lucams",
    enlace: "/producto/bola-navidena-personalizada",
    activo: "true",
  },
]);

function version(over?: Record<string, unknown>) {
  return {
    id: "v1",
    version: 1,
    title: null,
    body: VERSION_BODY,
    publishedAt: new Date("2026-11-11T12:00:00-05:00"),
    publishAt: null,
    createdAt: new Date("2026-11-11T12:00:00-05:00"),
    createdBy: null,
    ...over,
  };
}

describe("VersionHistory — campos LISTA en visual", () => {
  it("muestra tarjetas con etiquetas del schema y miniatura, nunca JSON crudo", () => {
    render(
      <VersionHistory
        fieldId="f1"
        versions={[version()]}
        currentPublishedVersionId="v1"
        listSchema={BANNER_SCHEMA}
        mediaById={{ "media-1": { url: "https://cdn.test/banner.webp", alt: "Banner" } }}
      />,
    );
    expect(screen.getByText("Vive la Navidad Lucams")).toBeInTheDocument();
    expect(screen.getByText("/producto/bola-navidena-personalizada")).toBeInTheDocument();
    expect(screen.getByText("Sí")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Banner" })).toHaveAttribute(
      "src",
      "https://cdn.test/banner.webp",
    );
    expect(screen.queryByText(/"imagen"/)).not.toBeInTheDocument();
  });

  it("lista vacía → nota legible (no se muestra en el sitio)", () => {
    render(
      <VersionHistory
        fieldId="f1"
        versions={[version({ body: "[]" })]}
        currentPublishedVersionId="v1"
        listSchema={BANNER_SCHEMA}
      />,
    );
    expect(screen.getByText(/Lista vacía/)).toBeInTheDocument();
  });

  it("sin listSchema conserva la vista de texto de siempre", () => {
    render(
      <VersionHistory
        fieldId="f1"
        versions={[version({ body: "# Título\nContenido del bloque" })]}
        currentPublishedVersionId="v1"
      />,
    );
    expect(screen.getByText(/Contenido del bloque/)).toBeInTheDocument();
  });

  it("JSON inválido en una versión → nota de contenido no legible", () => {
    render(
      <VersionHistory
        fieldId="f1"
        versions={[version({ body: "{roto" })]}
        currentPublishedVersionId="v1"
        listSchema={BANNER_SCHEMA}
      />,
    );
    expect(screen.getByText(/no legible como lista/)).toBeInTheDocument();
  });
});
