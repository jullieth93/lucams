// @vitest-environment jsdom
/*
 * Tests de componente — ShopMegaMenu (ramas complementarias al test de admin).
 *
 * Cubre: filtrado de categorías inactivas y cap de 8 en el menú, singular/plural
 * del conteo de productos, sub-categorías activas con "+N más" (>6) en desktop,
 * chips de ocasión desde DB (prop `ocasiones`, nombres reales, cap de 6 — antes
 * 6 slugs quemados con labels CMS, SEO-002), y el acordeón del drawer móvil
 * (expandir/colapsar, link de sub-categoría, cierre al navegar).
 *
 * Mismo setup que shop-mega-menu.test.tsx (ResizeObserver stub, portal Radix).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CategoryNode } from "@/lib/catalog";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { ShopMegaMenu, type MegaMenuOcasion, type MegaMenuTexts } from "./shop-mega-menu";

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = () => {};

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
  admin: "Panel admin",
  login: "Ingresar",
  signup: "Crear cuenta",
};

// Ocasiones como las entrega el server (listOcasiones → {slug, name}): 7 para
// ejercitar el cap de 6 chips del menú.
const OCASIONES: MegaMenuOcasion[] = Array.from({ length: 7 }, (_, i) => ({
  slug: `ocasion-${i}`,
  name: `Ocasión ${i}`,
}));

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

function child(over: Partial<CategoryNode> = {}): CategoryNode {
  return makeCategory({ children: [], productCount: 1, ...over });
}

async function openDrawer(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
}

/** Abre el menú desktop (Radix NavigationMenu monta su contenido al activar el trigger). */
async function openDesktopMenu(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Catálogo" }));
  // El contenido del menú (incl. el link "Ver todo") monta al activarse el trigger.
  await waitFor(() => expect(screen.getByText("Ver todo el catálogo →")).toBeInTheDocument());
}

describe("ShopMegaMenu — filtrado y caps del árbol", () => {
  it("categorías inactivas no aparecen en el menú", async () => {
    render(
      <ShopMegaMenu
        tree={[
          makeCategory({ slug: "activa", name: "Activa" }),
          makeCategory({ slug: "inactiva", name: "Inactiva", isActive: false }),
        ]}
        ocasiones={[]}
        isLoggedIn={false}
        isAdmin={false}
        texts={TEXTS}
      />,
    );
    await openDesktopMenu();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.queryByText("Inactiva")).not.toBeInTheDocument();
  });

  it("máximo 8 categorías: la 9ª queda detrás de 'Ver todo'", async () => {
    const tree = Array.from({ length: 10 }, (_, i) =>
      makeCategory({ slug: `cat-${i}`, name: `Categoría ${i}` }),
    );
    render(
      <ShopMegaMenu tree={tree} ocasiones={[]} isLoggedIn={false} isAdmin={false} texts={TEXTS} />,
    );
    await openDesktopMenu();
    // El menú desktop lista 8 (la 9ª/10ª no aparecen).
    const grid = screen.getByText("Categoría 0").closest("div.grid")!;
    expect(grid.querySelectorAll("a[href^='/productos?categoria=']")).toHaveLength(8);
    expect(screen.queryByText("Categoría 8")).not.toBeInTheDocument();
    expect(screen.getByText("Ver todo el catálogo →")).toBeInTheDocument();
  });

  it("singular '1 producto' vs plural 'N productos' (desktop y móvil)", async () => {
    render(
      <ShopMegaMenu
        tree={[
          makeCategory({ slug: "una", name: "Una", productCount: 1 }),
          makeCategory({ slug: "varias", name: "Varias", productCount: 5 }),
        ]}
        ocasiones={[]}
        isLoggedIn={false}
        isAdmin={false}
        texts={TEXTS}
      />,
    );
    await openDesktopMenu();
    expect(screen.getAllByText("1 producto").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5 productos").length).toBeGreaterThan(0);
    expect(screen.queryByText("1 productos")).not.toBeInTheDocument();
  });
});

describe("ShopMegaMenu — sub-categorías y ocasiones (desktop)", () => {
  it("hasta 6 sub-categorías activas listadas; con >6 aparece '+N más →'", async () => {
    const children = Array.from({ length: 8 }, (_, i) =>
      child({ slug: `sub-${i}`, name: `Sub ${i}` }),
    );
    render(
      <ShopMegaMenu
        tree={[makeCategory({ slug: "padre", name: "Padre", children })]}
        ocasiones={[]}
        isLoggedIn={false}
        isAdmin={false}
        texts={TEXTS}
      />,
    );
    await openDesktopMenu();
    expect(screen.getByText("Sub 5")).toBeInTheDocument();
    expect(screen.queryByText("Sub 6")).not.toBeInTheDocument();
    expect(screen.getByText("+2 más →")).toBeInTheDocument();
  });

  it("sub-categorías inactivas no se listan", async () => {
    render(
      <ShopMegaMenu
        tree={[
          makeCategory({
            slug: "padre",
            name: "Padre",
            children: [
              child({ slug: "on", name: "Activa" }),
              child({ slug: "off", name: "Inactiva", isActive: false }),
            ],
          }),
        ]}
        ocasiones={[]}
        isLoggedIn={false}
        isAdmin={false}
        texts={TEXTS}
      />,
    );
    await openDesktopMenu();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.queryByText("Inactiva")).not.toBeInTheDocument();
  });

  it("chips de ocasión: nombres reales de la prop (DB), href /ocasion/<slug> y cap de 6", async () => {
    render(
      <ShopMegaMenu
        tree={[makeCategory()]}
        ocasiones={OCASIONES}
        isLoggedIn={false}
        isAdmin={false}
        texts={TEXTS}
      />,
    );
    // Desktop: con 7 ocasiones solo entran 6 chips.
    await openDesktopMenu();
    expect(screen.getByRole("link", { name: "Ocasión 0" })).toHaveAttribute(
      "href",
      "/ocasion/ocasion-0",
    );
    expect(screen.getByText("Ocasión 5")).toBeInTheDocument();
    expect(screen.queryByText("Ocasión 6")).not.toBeInTheDocument();

    // Móvil (drawer): el mismo cap aplica.
    await openDrawer();
    expect(screen.getAllByText("Ocasión 5").length).toBe(2);
    expect(screen.queryByText("Ocasión 6")).not.toBeInTheDocument();
  });

  it("sin ocasiones activas la sección 'Por ocasión' no se muestra", async () => {
    render(
      <ShopMegaMenu
        tree={[makeCategory()]}
        ocasiones={[]}
        isLoggedIn={false}
        isAdmin={false}
        texts={TEXTS}
      />,
    );
    await openDesktopMenu();
    expect(screen.queryByText("Por ocasión")).not.toBeInTheDocument();
  });
});

describe("ShopMegaMenu — drawer móvil (acordeón y sección de cuenta)", () => {
  it("acordeón: expandir lista sub-categorías y colapsar de nuevo", async () => {
    render(
      <ShopMegaMenu
        tree={[
          makeCategory({
            children: [child({ slug: "s1", name: "Sub uno" })],
          }),
        ]}
        ocasiones={[]}
        isLoggedIn={false}
        isAdmin={false}
        texts={TEXTS}
      />,
    );
    await openDrawer();

    // Colapsado: la sub no está visible.
    expect(screen.queryByText("Sub uno")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", {
      name: "Expandir sub-categorías de Foto imanes",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const sub = screen.getByRole("link", { name: /Sub uno/ });
    expect(sub).toHaveAttribute("href", "/productos/foto-imanes/s1");

    fireEvent.click(toggle);
    expect(screen.queryByText("Sub uno")).not.toBeInTheDocument();
  });

  it("categoría sin sub-categorías activas NO tiene botón de expandir", async () => {
    render(
      <ShopMegaMenu
        tree={[makeCategory({ children: [] })]}
        ocasiones={[]}
        isLoggedIn={false}
        isAdmin={false}
        texts={TEXTS}
      />,
    );
    await openDrawer();
    expect(
      screen.queryByRole("button", { name: /Expandir sub-categorías/ }),
    ).not.toBeInTheDocument();
  });

  it("click en sub-categoría del acordeón cierra el drawer", async () => {
    render(
      <ShopMegaMenu
        tree={[makeCategory({ children: [child({ slug: "s1", name: "Sub uno" })] })]}
        ocasiones={[]}
        isLoggedIn={false}
        isAdmin={false}
        texts={TEXTS}
      />,
    );
    await openDrawer();
    fireEvent.click(screen.getByRole("button", { name: /Expandir sub-categorías/ }));
    fireEvent.click(screen.getByRole("link", { name: /Sub uno/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("logueado: link de cuenta va a /mi-cuenta; NO hay login ni registro", async () => {
    render(<ShopMegaMenu tree={[]} ocasiones={[]} isLoggedIn isAdmin={false} texts={TEXTS} />);
    await openDrawer();
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/mi-cuenta");
    expect(screen.queryByRole("link", { name: "Ingresar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Crear cuenta" })).not.toBeInTheDocument();
  });

  it("invitado: link de cuenta va a /login y además hay registro; ambos cierran el drawer", async () => {
    render(
      <ShopMegaMenu tree={[]} ocasiones={[]} isLoggedIn={false} isAdmin={false} texts={TEXTS} />,
    );
    await openDrawer();
    const login = screen.getByRole("link", { name: "Ingresar" });
    expect(login).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/registro");

    fireEvent.click(login);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Centro de ayuda y Contacto siempre visibles en la sección de cuenta", async () => {
    render(
      <ShopMegaMenu tree={[]} ocasiones={[]} isLoggedIn={false} isAdmin={false} texts={TEXTS} />,
    );
    await openDrawer();
    expect(screen.getByRole("link", { name: "Centro de ayuda" })).toHaveAttribute("href", "/ayuda");
    expect(screen.getByRole("link", { name: "Contacto" })).toHaveAttribute("href", "/contacto");
  });
});
