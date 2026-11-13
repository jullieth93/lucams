// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CouponForm } from "./coupon-form";

afterEach(() => cleanup());

describe("CouponForm", () => {
  it("usa las fechas por defecto calculadas por el Server Component", () => {
    render(
      <TooltipProvider>
        <CouponForm
          mode="create"
          action={vi.fn(async () => null)}
          categories={[]}
          products={[]}
          defaultValidFrom="2026-01-31"
          defaultValidTo="2026-02-28"
        />
      </TooltipProvider>,
    );

    expect(screen.getByLabelText(/Válido desde/)).toHaveValue("2026-01-31");
    expect(screen.getByLabelText(/Válido hasta/)).toHaveValue("2026-02-28");
  });
});
