"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { EmailInput } from "@/components/email-input";
import {
  recuperarPasswordAction,
  type RecuperarActionState,
} from "./actions";

export function RecuperarForm() {
  const [state, formAction, pending] = useActionState<
    RecuperarActionState | null,
    FormData
  >(recuperarPasswordAction, null);

  return (
    <Card className="shadow-xl border-brand-purple/10 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <CardHeader className="space-y-2">
        <CardTitle className="font-display text-2xl text-brand-purple-dark">
          Recupera tu contraseña
        </CardTitle>
        <CardDescription className="text-base">
          Te enviamos un correo con instrucciones para crear una nueva.
        </CardDescription>
      </CardHeader>

      {state?.success ? (
        <CardContent>
          <div
            role="status"
            className="rounded-md bg-success/10 px-4 py-3 text-sm border border-success/20"
            style={{ color: "var(--success)" }}
          >
            {state.success}
          </div>
          <p className="mt-4 text-sm text-center text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-brand-pink hover:text-brand-coral underline-offset-4 hover:underline"
            >
              Volver a iniciar sesión
            </Link>
          </p>
        </CardContent>
      ) : (
        <form action={formAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <EmailInput
                id="email"
                name="email"
                required
                placeholder="tu@email.com"
                disabled={pending}
                aria-invalid={Boolean(state?.fieldErrors?.email)}
              />
              {state?.fieldErrors?.email && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.email[0]}
                </p>
              )}
            </div>

            {state?.error && !state.fieldErrors && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {state.error}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-4 mt-4">
            <Button
              type="submit"
              className="w-full bg-brand-purple hover:bg-brand-purple-dark text-white font-semibold transition-all hover:shadow-md hover:-translate-y-px active:translate-y-px"
              disabled={pending}
            >
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <SpinnerIcon /> Enviando...
                </span>
              ) : (
                "Enviar instrucciones"
              )}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              <Link
                href="/login"
                className="font-medium text-brand-pink hover:text-brand-coral underline-offset-4 hover:underline"
              >
                Volver a iniciar sesión
              </Link>
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
