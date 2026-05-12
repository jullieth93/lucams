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
import { PasswordInput } from "@/components/password-input";
import { loginAction, type LoginActionState } from "./actions";

export function LoginForm({
  initialError,
  initialSuccess,
}: {
  initialError?: string;
  initialSuccess?: string;
}) {
  const [state, formAction, pending] = useActionState<LoginActionState | null, FormData>(
    loginAction,
    null,
  );

  return (
    <Card className="border-brand-purple/10 animate-in fade-in slide-in-from-bottom-3 shadow-xl duration-500">
      <CardHeader className="space-y-2">
        <CardTitle className="font-display text-brand-purple-dark text-2xl">
          Bienvenida de vuelta
        </CardTitle>
        <CardDescription className="text-base">
          Entra a tu cuenta para seguir personalizando tus imanes.
        </CardDescription>
      </CardHeader>

      {initialSuccess && !state && (
        <div className="mx-6 mb-2">
          <div
            role="status"
            className="bg-success/10 border-success/20 rounded-md border px-3 py-2 text-sm"
            style={{ color: "var(--success)" }}
          >
            {initialSuccess}
          </div>
        </div>
      )}

      {initialError && !state && (
        <div className="mx-6 mb-2">
          <div
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {initialError}
          </div>
        </div>
      )}

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
              aria-describedby={state?.fieldErrors?.email ? "email-error" : undefined}
            />
            {state?.fieldErrors?.email && (
              <p id="email-error" className="text-destructive text-sm">
                {state.fieldErrors.email[0]}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <Link
                href="/recuperar-password"
                className="text-brand-pink hover:text-brand-coral text-sm font-medium underline-offset-4 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={pending}
              aria-invalid={Boolean(state?.fieldErrors?.password)}
            />
            {state?.fieldErrors?.password && (
              <p className="text-destructive text-sm">{state.fieldErrors.password[0]}</p>
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
                <SpinnerIcon /> Entrando...
              </span>
            ) : (
              "Iniciar sesión"
            )}
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            ¿Aún no tienes cuenta?{" "}
            <Link
              href="/registro"
              className="text-brand-pink hover:text-brand-coral font-medium underline-offset-4 hover:underline"
            >
              Crear cuenta
            </Link>
          </p>
        </CardFooter>
      </form>
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
