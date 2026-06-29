"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
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
import { EmailInput } from "@/components/email-input";
import { PasswordInput } from "@/components/password-input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { signupAction, type SignupActionState } from "./actions";

export function RegistroForm() {
  const [state, formAction, pending] = useActionState<SignupActionState | null, FormData>(
    signupAction,
    null,
  );
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const passwordsMatch = !passwordConfirm || password === passwordConfirm;

  return (
    <Card className="border-brand-purple/10 animate-in fade-in slide-in-from-bottom-3 shadow-xl duration-500">
      <CardHeader className="space-y-2">
        <CardTitle className="font-display text-brand-purple-dark text-2xl">
          Crea tu cuenta Lucams
        </CardTitle>
        <CardDescription className="text-base">
          Empieza a personalizar imanes únicos en minutos.
        </CardDescription>
        <p className="text-muted-foreground pt-1 text-sm">
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="text-brand-pink hover:text-brand-coral font-medium underline-offset-4 hover:underline"
          >
            Inicia sesión
          </Link>
        </p>
      </CardHeader>

      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nombre</Label>
              <Input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                required
                placeholder="María"
                disabled={pending}
                aria-invalid={Boolean(state?.fieldErrors?.firstName)}
              />
              {state?.fieldErrors?.firstName && (
                <p className="text-destructive text-sm">{state.fieldErrors.firstName[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="flex items-center gap-1">
                Apellido
                <span className="text-muted-foreground text-xs">(opcional)</span>
              </Label>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                placeholder="Pérez"
                disabled={pending}
                aria-invalid={Boolean(state?.fieldErrors?.lastName)}
              />
              {state?.fieldErrors?.lastName && (
                <p className="text-destructive text-sm">{state.fieldErrors.lastName[0]}</p>
              )}
            </div>
          </div>

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

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={pending}
              value={password}
              onValueChange={setPassword}
              showStrength
              aria-invalid={Boolean(state?.fieldErrors?.password)}
            />
            {state?.fieldErrors?.password && (
              <p className="text-destructive text-sm">{state.fieldErrors.password[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="passwordConfirm">Confirmar contraseña</Label>
            <PasswordInput
              id="passwordConfirm"
              name="passwordConfirm"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={pending}
              value={passwordConfirm}
              onValueChange={setPasswordConfirm}
              aria-invalid={Boolean(state?.fieldErrors?.passwordConfirm) || !passwordsMatch}
            />
            {!passwordsMatch && (
              <p className="text-destructive text-sm">Las contraseñas no coinciden.</p>
            )}
            {state?.fieldErrors?.passwordConfirm && passwordsMatch && (
              <p className="text-destructive text-sm">{state.fieldErrors.passwordConfirm[0]}</p>
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

          <p className="text-muted-foreground text-xs">
            Al crear tu cuenta aceptas nuestros{" "}
            <Link href="/terminos" className="text-brand-pink underline-offset-4 hover:underline">
              términos
            </Link>{" "}
            y la{" "}
            <Link href="/privacidad" className="text-brand-pink underline-offset-4 hover:underline">
              política de privacidad
            </Link>{" "}
            (Ley 1581 Habeas Data).
          </p>
          <TurnstileWidget />
        </CardContent>

        <CardFooter className="mt-4 flex flex-col gap-4">
          <Button
            type="submit"
            className="bg-brand-purple hover:bg-brand-purple-dark w-full font-semibold text-white transition-all hover:-translate-y-px hover:shadow-md active:translate-y-px"
            disabled={pending || !passwordsMatch}
          >
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <SpinnerIcon /> Creando...
              </span>
            ) : (
              "Crear cuenta"
            )}
          </Button>
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
