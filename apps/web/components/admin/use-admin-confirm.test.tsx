// @vitest-environment jsdom
/*
 * Test de componente — useAdminConfirm + ConfirmAction (ADR-192): el diálogo
 * de confirmación de marca que reemplazó window.confirm/prompt nativos en el
 * panel admin.
 *
 * Cubre: confirmar/cancelar resuelven la promesa, requireTyped exige escribir
 * la palabra, y ConfirmAction solo envía el form tras confirmar.
 */

import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

import { useAdminConfirm } from "./use-admin-confirm";
import { ConfirmAction } from "./confirm-action";

afterEach(cleanup);

function Harness({
  onResult,
  requireTyped,
}: {
  onResult: (ok: boolean) => void;
  requireTyped?: string;
}) {
  const { confirm, confirmDialog } = useAdminConfirm();
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          onResult(await confirm("¿Borrar definitivamente?", { requireTyped }));
        }}
      >
        Lanzar
      </button>
      {confirmDialog}
    </>
  );
}

describe("useAdminConfirm", () => {
  it("confirmar resuelve true y cancelar resuelve false", async () => {
    const results: boolean[] = [];
    render(<Harness onResult={(ok) => results.push(ok)} />);

    fireEvent.click(screen.getByRole("button", { name: "Lanzar" }));
    expect(await screen.findByText("¿Borrar definitivamente?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(results).toEqual([true]));

    fireEvent.click(screen.getByRole("button", { name: "Lanzar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(results).toEqual([true, false]));
  });

  it("requireTyped: el botón queda deshabilitado hasta escribir la palabra", async () => {
    const results: boolean[] = [];
    render(<Harness onResult={(ok) => results.push(ok)} requireTyped="ELIMINAR" />);

    fireEvent.click(screen.getByRole("button", { name: "Lanzar" }));
    const confirmBtn = await screen.findByRole("button", { name: "Confirmar" });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "eliminar" } }); // case-insensitive
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(results).toEqual([true]));
  });
});

describe("ConfirmAction", () => {
  it("cancelar NO envía el form; confirmar sí (una sola vez)", async () => {
    const action = vi.fn();
    render(
      <ConfirmAction action={action} message="¿Archivar?">
        <button type="submit">Archivar</button>
      </ConfirmAction>,
    );

    // Cancelar → no submit.
    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText("¿Archivar?")).not.toBeInTheDocument());
    expect(action).not.toHaveBeenCalled();

    // Confirmar → requestSubmit dispara el action con el FormData.
    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });
});
