// @vitest-environment jsdom

/*
 * Test de componente — DesignGrid (/mi-cuenta/disenos), 2026-10-13:
 *  1. La tarjeta DRAFT muestra la miniatura real del borrador cuando el
 *     auto-save del Estudio ya la subió (previewUrl mapeado desde
 *     Design.draftPreviewUrl); sin miniatura conserva el placeholder de marca.
 *  2. La tarjeta READY tiene CTA «Editar» → /estudio/<slug>?designId=<id>
 *     (el recover clona READY→DRAFT) y badge «Listo» para la distinción
 *     Borrador/Listo; un diseño ya pedido muestra «Ya pedido» en su lugar.
 *
 * Las Server Actions del grid están mockeadas (no se ejercitan acá) y los
 * textos caen a DEFAULT_ACCOUNT_TEXTS (patrón de studio-simple-header.test).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const deleteDraftDesignAction = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const emptyDraftsAction = vi.hoisted(() => vi.fn(async () => ({ ok: true, deleted: 0 })));

vi.mock("./actions", () => ({
  shareDesignAction: vi.fn(),
  archiveDesignAction: vi.fn(),
  revokeShareAction: vi.fn(),
  deleteDraftDesignAction,
  emptyDraftsAction,
}));

import { DesignGrid, type DesignCardData } from "./design-grid";
import { DEFAULT_ACCOUNT_TEXTS } from "../account-texts";

afterEach(() => cleanup());

const texts = DEFAULT_ACCOUNT_TEXTS.designs;

function design(over: Partial<DesignCardData>): DesignCardData {
  return {
    id: "d1",
    previewUrl: "https://cdn.test/design-previews/d1/preview.webp",
    productName: "Fotoimanes cuadrados",
    productSlug: "fotoimanes-cuadrados",
    hasShareToken: false,
    used: false,
    ...over,
  };
}

describe("DesignGrid — borradores y listos (2026-10-13)", () => {
  it("DRAFT con miniatura: muestra la imagen real, el badge Borrador y «Seguir editando»", () => {
    render(
      <DesignGrid
        designs={[
          design({
            draft: true,
            previewUrl: "https://cdn.test/design-previews/d1/draft-preview.webp",
          }),
        ]}
        texts={texts}
      />,
    );
    const img = screen.getByRole("img", { name: /borrador de fotoimanes cuadrados/i });
    expect(img).toHaveAttribute("src", "https://cdn.test/design-previews/d1/draft-preview.webp");
    expect(screen.getByText(texts.draftBadge)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: new RegExp(texts.draftResume) });
    expect(cta).toHaveAttribute("href", "/estudio/fotoimanes-cuadrados?designId=d1");
  });

  it("DRAFT sin miniatura todavía: placeholder de marca (sin img), sin romper la tarjeta", () => {
    render(<DesignGrid designs={[design({ draft: true, previewUrl: "" })]} texts={texts} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(texts.draftBadge)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(texts.draftResume) })).toBeInTheDocument();
  });

  it("READY: badge «Listo» y CTA «Editar» al Estudio con ?designId=", () => {
    render(<DesignGrid designs={[design({})]} texts={texts} />);
    expect(screen.getByText(texts.readyBadge)).toBeInTheDocument();
    const edit = screen.getByRole("link", { name: new RegExp(texts.edit) });
    expect(edit).toHaveAttribute("href", "/estudio/fotoimanes-cuadrados?designId=d1");
    // Y conserva su preview final.
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.test/design-previews/d1/preview.webp",
    );
  });

  it("USED_IN_ORDER: badge «Ya pedido» (no «Listo») y el CTA «Editar» sigue disponible", () => {
    render(<DesignGrid designs={[design({ used: true })]} texts={texts} />);
    expect(screen.getByText(texts.used)).toBeInTheDocument();
    expect(screen.queryByText(texts.readyBadge)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(texts.edit) })).toBeInTheDocument();
  });
});

describe("DesignGrid — sección «Borradores» (2026-10-13)", () => {
  function drafts(n: number): DesignCardData[] {
    return Array.from({ length: n }, (_, i) =>
      design({ id: `draft-${i + 1}`, draft: true, previewUrl: "" }),
    );
  }

  it("los borradores van DEBAJO de los listos, en su propia sección con contador", () => {
    render(<DesignGrid designs={[design({ id: "listo-1" }), ...drafts(2)]} texts={texts} />);
    // Contador "2 borradores" en el encabezado de la sección.
    expect(screen.getByText(/2 borradores/)).toBeInTheDocument();
    // Con pocos (≤3) la sección arranca ABIERTA: las tarjetas se ven.
    expect(screen.getAllByRole("link", { name: new RegExp(texts.draftResume) })).toHaveLength(2);
    // El diseño listo conserva su grid y su badge.
    expect(screen.getByText(texts.readyBadge)).toBeInTheDocument();
  });

  it("con más de 3 borradores la sección arranca CERRADA y se expande al tocar el encabezado", () => {
    render(<DesignGrid designs={drafts(5)} texts={texts} />);
    expect(screen.getByText(/5 borradores/)).toBeInTheDocument();
    // Cerrada: ninguna tarjeta visible todavía.
    expect(screen.queryByRole("link", { name: new RegExp(texts.draftResume) })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(texts.draftsSection) }));

    expect(screen.getAllByRole("link", { name: new RegExp(texts.draftResume) })).toHaveLength(5);
  });

  it("eliminar individual: pide confirmación y llama deleteDraftDesignAction con el id", async () => {
    deleteDraftDesignAction.mockClear();
    render(<DesignGrid designs={drafts(2)} texts={texts} />);

    const deleteButtons = screen.getAllByRole("button", { name: texts.draftDelete });
    fireEvent.click(deleteButtons[0]!);
    // Aún no llama la action: primero la confirmación inline.
    expect(deleteDraftDesignAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: texts.yes }));

    await waitFor(() => expect(deleteDraftDesignAction).toHaveBeenCalledWith("draft-1"));
    // La tarjeta sale de la lista y el contador baja a 1.
    await waitFor(() => expect(screen.getByText(/1 borrador$/)).toBeInTheDocument());
    expect(screen.getAllByRole("link", { name: new RegExp(texts.draftResume) })).toHaveLength(1);
  });

  it("«Vaciar borradores»: pide confirmación, llama emptyDraftsAction y retira la sección", async () => {
    emptyDraftsAction.mockClear();
    emptyDraftsAction.mockResolvedValue({ ok: true, deleted: 2 });
    render(<DesignGrid designs={drafts(2)} texts={texts} />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(texts.draftsEmpty) }));
    expect(emptyDraftsAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: texts.yes }));

    await waitFor(() => expect(emptyDraftsAction).toHaveBeenCalled());
    // Sección vacía → desaparece completa.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: new RegExp(texts.draftsSection) })).toBeNull(),
    );
  });
});
