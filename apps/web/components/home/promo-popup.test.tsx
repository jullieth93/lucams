// @vitest-environment jsdom

/*
 * PromoPopup — ventana emergente de banners/promos de la portada (owner
 * 2026-11-11: antes franja inline). Se abre UNA vez por sesión del navegador
 * (sessionStorage), solo con banners activos; con varios, pager ‹ › + dots.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PromoPopup } from "./promo-popup";
import type { CmsBannerItem } from "@/lib/cms";

afterEach(() => cleanup());

/** Abre el popup: monta y adelanta el delay de apertura (400 ms tras el paint). */
async function renderAndOpen(items: CmsBannerItem[]) {
  vi.useFakeTimers();
  render(<PromoPopup items={items} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  vi.useRealTimers();
}

function banner(n: number): CmsBannerItem {
  return {
    url: `https://cdn.test/banner-${n}.webp`,
    alt: `Banner ${n}`,
    width: 1200,
    height: 600,
    titulo: `Promo ${n}`,
    enlace: `/productos?promo=${n}`,
  };
}

describe("PromoPopup — ventana emergente de la portada", () => {
  beforeEach(() => sessionStorage.clear());

  it("sin banners activos no monta nada", () => {
    render(<PromoPopup items={[]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("con banners y sesión limpia: se abre solo con la imagen enlazada", async () => {
    await renderAndOpen([banner(1)]);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/productos?promo=1");
    expect(screen.getByRole("img", { name: "Banner 1" })).toBeInTheDocument();
    // Un solo banner: sin pager.
    expect(screen.queryByRole("button", { name: "Banner siguiente" })).not.toBeInTheDocument();
  });

  it("ya vista en la sesión (sessionStorage): no se abre", async () => {
    sessionStorage.setItem("lucams-promo-popup-v1", "1");
    await renderAndOpen([banner(1)]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cerrar marca la sesión como vista", async () => {
    await renderAndOpen([banner(1)]);
    await screen.findByRole("dialog");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(sessionStorage.getItem("lucams-promo-popup-v1")).toBe("1");
  });

  it("con varios banners: el pager rota y muestra el activo", async () => {
    await renderAndOpen([banner(1), banner(2)]);
    await screen.findByRole("dialog");
    expect(screen.getByRole("img", { name: "Banner 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Banner siguiente" }));
    expect(screen.getByRole("img", { name: "Banner 2" })).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/productos?promo=2");
    // Wrap-around hacia atrás desde el último → vuelve al primero.
    fireEvent.click(screen.getByRole("button", { name: "Banner anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Banner anterior" }));
    expect(screen.getByRole("img", { name: "Banner 2" })).toBeInTheDocument();
  });
});
