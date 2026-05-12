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
import { recuperarPasswordAction, type RecuperarActionState } from "./actions";

export function RecuperarForm() {
  const [state, formAction, pending] = useActionState<RecuperarActionState | null, FormData>(
    recuperarPasswordAction,
    null,
  );

  return (
    <Card className="border-brand-purple/10 animate-in fade-in slide-in-from-bottom-3 shadow-xl duration-500">
      <CardHeader className="space-y-2">
        <CardTitle className="font-display text-brand-purple-dark text-2xl">
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
            className="bg-success/10 border-success/20 rounded-md border px-4 py-3 text-sm"
            style={{ color: "var(--success)" }}
          >
            {state.success}
          </div>
          <p className="text-muted-foreground mt-4 text-center text-sm">
            <Link
              href="/login"
              className="text-brand-pink hover:text-brand-coral font-medium underline-offset-4 hover:underline"
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
                <p className="text-destructive text-sm">{state.fieldErrors.email[0]}</p>
              )}
            </div>

            {state?.error && !state.fieldErrors && (
              <div
                role="alert"
                className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
              >
                {state.error}
              </div>
            )}
          </CardContent>

          <CardFooter className="mt-4 flex flex-col gap-4">
            <Button
              type="submit"
              className="bg-brand-purple hover:bg-brand-purple-dark w-full font-semibold text-white transition-all hover:-translate-y-px hover:shadow-md active:translate-y-px"
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
            <p className="text-muted-foreground text-center text-sm">
              <Link
                href="/login"
                className="text-brand-pink hover:text-brand-coral font-medium underline-offset-4 hover:underline"
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
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
