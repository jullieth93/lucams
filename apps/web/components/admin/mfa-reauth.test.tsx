// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReauthForm, useMfaReauthAction } from "./mfa-reauth";

const verifyAdminMfaReauthAction = vi.hoisted(() => vi.fn(async () => ({ success: true })));

vi.mock("@/app/admin/(panel)/seguridad/actions", () => ({ verifyAdminMfaReauthAction }));
vi.mock("@/components/admin/use-admin-confirm", () => ({
  useAdminConfirm: () => ({ confirm: vi.fn(async () => true), confirmDialog: null }),
}));

type State = { error?: string; ok?: boolean; reauthRequired?: boolean };

function StateForm({
  action,
}: {
  action: (prev: State | null, formData: FormData) => Promise<State>;
}) {
  const [state, formAction, pending, modal] = useMfaReauthAction<State>(action);
  return (
    <>
      <form action={formAction}>
        <input name="value" defaultValue="Contenido preservado" />
        <button type="submit" disabled={pending}>
          Guardar
        </button>
      </form>
      {state?.ok && <p>Guardado correctamente</p>}
      {modal}
    </>
  );
}

async function completeTotp() {
  fireEvent.change(await screen.findByLabelText(/código de tu app/i), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: /confirmar y continuar/i }));
}

beforeEach(() => {
  verifyAdminMfaReauthAction.mockClear();
});

afterEach(() => cleanup());

describe("reautenticación MFA compartida", () => {
  it("useMfaReauthAction abre el modal y reintenta con el mismo FormData", async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({ error: "MFA requerido", reauthRequired: true })
      .mockResolvedValueOnce({ ok: true });
    render(<StateForm action={action} />);

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await completeTotp();

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    const firstData = action.mock.calls[0]?.[1] as FormData;
    const retryData = action.mock.calls[1]?.[1] as FormData;
    expect(retryData.get("value")).toBe("Contenido preservado");
    expect(firstData.get("value")).toBe(retryData.get("value"));
    expect(verifyAdminMfaReauthAction).toHaveBeenCalledOnce();
    expect(await screen.findByText("Guardado correctamente")).toBeInTheDocument();
  });

  it("ReauthForm soporta acciones con redirect y no reenvía al cancelar", async () => {
    const action = vi.fn().mockResolvedValueOnce({ reauthRequired: true });
    render(
      <ReauthForm action={action}>
        <input type="hidden" name="fieldId" value="field-1" />
        <button type="submit">Publicar</button>
      </ReauthForm>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(action).toHaveBeenCalledTimes(1);
    expect(verifyAdminMfaReauthAction).not.toHaveBeenCalled();
  });

  it("ReauthForm reintenta una acción void tras verificar TOTP", async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({ reauthRequired: true })
      .mockResolvedValueOnce(undefined);
    render(
      <ReauthForm action={action}>
        <input type="hidden" name="ids" value="cart-1" />
        <button type="submit">Enviar lote</button>
      </ReauthForm>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enviar lote" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await completeTotp();

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    const retryData = action.mock.calls[1]?.[0] as FormData;
    expect(retryData.get("ids")).toBe("cart-1");
    expect(verifyAdminMfaReauthAction).toHaveBeenCalledOnce();
  });
});
