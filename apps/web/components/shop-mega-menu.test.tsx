// @vitest-environment jsdom
/*
 * Test de componente — ShopMegaMenu (mega-menú del header + drawer móvil).
 *
 * Mismo estilo/setup que global-search.test.tsx: queries ACCESIBLES,
 * cleanup manual (globals:false) y mocks de las deps de Next.
 *
 * Foco (2026-09-07): el chip "Panel admin" del header es `hidden sm:inline-flex`,
 * así que en móvil no había forma de entrar al admin. El drawer (Radix Sheet)
 * recibe `isAdmin` y, cuando es true, muestra el link "Panel admin" como primer
 * ítem de la sección "Tu cuenta".
 *
 * El drawer monta su contenido en un PORTAL (document.body) → las queries van
 * por screen, no por el container del render. El trigger del menú móvil es el
 * botón con aria-label "Abrir menú". El Sheet usa ResizeObserver, ausente en
 * jsdom → stub global como en global-search.test.tsx.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CategoryNode } from "@/lib/catalog";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// Import DESPUÉS de los vi.mock (hoisted igual, pero deja clara la intención).
import { ShopMegaMenu, type MegaMenuTexts } from "./shop-mega-menu";

// Radix Sheet (Dialog) usa ResizeObserver, ausente en jsdom → sin este stub
// el primer render tira "ResizeObserver is not defined".
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = () => {};

// vitest.config usa globals:false → sin cleanup manual los portals de Radix
// se acumulan en document.body entre tests.
afterEach(() => {
  cleanup();
  push.mockReset();
});

const TEXTS: MegaMenuTexts = {
  catalog: "Catálogo",
  helpCta: "¿Te ayudamos a elegir?",
  helpChip: "¿Te ayudamos?",
  occasionsTitle: "Por ocasión",
  viewAll: "Ver todo el catálogo →",
  viewAllMobile: "Ver todo el catálogo",
  accountTitle: "Tu cuenta",
  accountMobile: "Mi cuenta",
  login: "Ingresar",
  signup: "Crear cuenta",
  occasions: {},
};

function makeCategory(over: Partial<CategoryNode> = {}): CategoryNode {
  return {
    slug: "foto-imanes",
    name: "Foto imanes",
    description: null,
    richDescription: null,
    useCase: null,
    image: null,
    icon: null,
    gradient: null,
    order: 1,
    isActive: true,
    defaultSort: null,
    visibleFilters: [],
    featuredProductSlug: null,
    productCount: 3,
    children: [],
    ...over,
  };
}

/** Abre el drawer móvil por el botón hamburguesa (aria-label "Abrir menú"). */
async function openDrawer(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
  // El Sheet monta su contenido en un portal tras abrirse.
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
}

describe("ShopMegaMenu — acceso admin en el drawer móvil (2026-09-07)", () => {
  it("con isAdmin=true el drawer muestra el link 'Panel admin' a /admin/dashboard", async () => {
    render(<ShopMegaMenu tree={[makeCategory()]} isLoggedIn isAdmin texts={TEXTS} />);
    await openDrawer();

    const link = screen.getByRole("link", { name: "Panel admin" });
    expect(link).toHaveAttribute("href", "/admin/dashboard");
    // Primer ítem de la sección "Tu cuenta" (el <p> es hijo directo del
    // contenedor de la sección; dentro de él, el primer link del bloque).
    const section = screen.getByText("Tu cuenta").parentElement!;
    expect(section.querySelector("a")?.textContent).toBe("Panel admin");
  });

  it("con isAdmin=false NO aparece el link 'Panel admin'", async () => {
    render(
      <ShopMegaMenu tree={[makeCategory()]} isLoggedIn={false} isAdmin={false} texts={TEXTS} />,
    );
    await openDrawer();

    expect(screen.queryByRole("link", { name: "Panel admin" })).not.toBeInTheDocument();
  });

  it("click en 'Panel admin' cierra el drawer (onClick → setMobileOpen(false))", async () => {
    render(<ShopMegaMenu tree={[makeCategory()]} isLoggedIn isAdmin texts={TEXTS} />);
    await openDrawer();

    fireEvent.click(screen.getByRole("link", { name: "Panel admin" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
