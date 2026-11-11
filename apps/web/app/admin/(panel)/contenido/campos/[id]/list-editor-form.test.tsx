// @vitest-environment jsdom

/*
 * ListEditorForm — subcampo URL como desplegable de destinos del ambiente
 * (owner 2026-11-11): productos/categorías/páginas en optgroups; nunca texto
 * libre por defecto (una URL absoluta con host de desarrollo se coló en un
 * banner publicado). El escape «URL personalizada…» revela el input libre.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/admin/(panel)/contenido/actions", () => ({
  saveCmsFieldItemsAction: vi.fn(),
  uploadCmsMediaAction: vi.fn(),
}));
vi.mock("@/components/admin/use-admin-confirm", () => ({
  useAdminConfirm: () => ({ confirm: vi.fn(async () => true), confirmDialog: null }),
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { ListEditorForm } from "./list-editor-form";

afterEach(() => cleanup());

const FIELD = {
  id: "f1",
  key: "home.banners",
  kind: "BLOCK" as const,
  label: "Banners de la portada",
  helpText: null,
  isPublished: true,
  listSchema: [
    { name: "imagen", type: "IMAGE", label: "Imagen" },
    { name: "titulo", type: "TEXT", label: "Título" },
    { name: "enlace", type: "URL", label: "Enlace" },
    { name: "activo", type: "BOOLEAN", label: "Activo" },
  ],
  items: [{ imagen: "", titulo: "Navidad", enlace: "", activo: "true" }],
};

const LINK_OPTIONS = [
  {
    group: "Productos",
    options: [{ value: "/producto/bola-navidena-personalizada", label: "Bola Navideña" }],
  },
  { group: "Páginas del sitio", options: [{ value: "/productos", label: "Catálogo completo" }] },
];

describe("ListEditorForm — subcampo URL como desplegable", () => {
  it("muestra los destinos del ambiente agrupados, no un input libre", () => {
    render(
      <TooltipProvider>
        <ListEditorForm field={FIELD} linkOptions={LINK_OPTIONS} />
      </TooltipProvider>,
    );
    const select = screen.getByRole("combobox", { name: "Enlace" });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bola Navideña" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Catálogo completo" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "URL personalizada…" })).toBeInTheDocument();
  });

  it("«URL personalizada…» revela el input libre y «← Elegir de la lista» vuelve", () => {
    render(
      <TooltipProvider>
        <ListEditorForm field={FIELD} linkOptions={LINK_OPTIONS} />
      </TooltipProvider>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Enlace" }), {
      target: { value: "__custom__" },
    });
    expect(screen.getByPlaceholderText("/productos o https://…")).toBeInTheDocument();
    fireEvent.click(screen.getByText("← Elegir de la lista de destinos"));
    expect(screen.getByRole("combobox", { name: "Enlace" })).toBeInTheDocument();
  });

  it("un valor legado fuera de la lista arranca en modo personalizado (no se pierde)", () => {
    render(
      <TooltipProvider>
        <ListEditorForm
          field={{
            ...FIELD,
            items: [
              { imagen: "", titulo: "Viejo", enlace: "https://instagram.com/x", activo: "true" },
            ],
          }}
          linkOptions={LINK_OPTIONS}
        />
      </TooltipProvider>,
    );
    const input = screen.getByPlaceholderText("/productos o https://…");
    expect(input).toHaveValue("https://instagram.com/x");
  });

  it("sin linkOptions conserva el input de texto de siempre", () => {
    render(
      <TooltipProvider>
        <ListEditorForm field={FIELD} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("combobox", { name: "Enlace" })).not.toBeInTheDocument();
  });
});
