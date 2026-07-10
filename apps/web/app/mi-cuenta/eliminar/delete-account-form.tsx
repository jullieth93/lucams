"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { deleteAccountAction, type DeleteAccountState } from "./actions";

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState<DeleteAccountState | null, FormData>(
    deleteAccountAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="confirm">
          Escribe <span className="font-mono font-bold">ELIMINAR</span> para confirmar
        </Label>
        <Input
          id="confirm"
          name="confirm"
          required
          autoComplete="off"
          placeholder="ELIMINAR"
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Tu contraseña</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="current-password"
          disabled={pending}
        />
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-rose-600 font-semibold text-white hover:bg-rose-700"
      >
        {pending ? "Eliminando..." : "Eliminar mi cuenta permanentemente"}
      </Button>
    </form>
  );
}
