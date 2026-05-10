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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { loginAction, type LoginActionState } from "./actions";

export function LoginForm({
  initialError,
  initialSuccess,
}: {
  initialError?: string;
  initialSuccess?: string;
}) {
  const [state, formAction, pending] = useActionState<
    LoginActionState | null,
    FormData
  >(loginAction, null);

  return (
    <Card className="shadow-xl border-brand-purple/10 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <CardHeader className="space-y-2">
        <CardTitle className="font-display text-2xl text-brand-purple-dark">
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
            className="rounded-md bg-success/10 px-3 py-2 text-sm border border-success/20"
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
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {initialError}
          </div>
        </div>
      )}

      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="tu@email.com"
              disabled={pending}
              aria-invalid={Boolean(state?.fieldErrors?.email)}
              aria-describedby={
                state?.fieldErrors?.email ? "email-error" : undefined
              }
            />
            {state?.fieldErrors?.email && (
              <p id="email-error" className="text-sm text-destructive">
                {state.fieldErrors.email[0]}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <Link
                href="/recuperar-password"
                className="text-sm font-medium text-brand-pink hover:text-brand-coral underline-offset-4 hover:underline"
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
              <p className="text-sm text-destructive">
                {state.fieldErrors.password[0]}
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
                <SpinnerIcon /> Entrando...
              </span>
            ) : (
              "Iniciar sesión"
            )}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            ¿Aún no tienes cuenta?{" "}
            <Link
              href="/registro"
              className="font-medium text-brand-pink hover:text-brand-coral underline-offset-4 hover:underline"
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
