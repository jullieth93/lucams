"use client";

import { Shield } from "lucide-react";
import { useActionState } from "react";
import { EmailInput } from "@/components/email-input";
import { PasswordInput } from "@/components/password-input";
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
import { adminLoginAction, type AdminLoginActionState } from "./actions";

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState<AdminLoginActionState | null, FormData>(
    adminLoginAction,
    null,
  );

  return (
    <Card className="w-full max-w-md border-slate-200 shadow-md">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2 text-slate-500">
          <Shield className="h-4 w-4" strokeWidth={2} />
          <span className="text-xs font-medium tracking-wider uppercase">Acceso restringido</span>
        </div>
        <CardTitle className="text-2xl font-bold text-slate-900">Panel administrativo</CardTitle>
        <CardDescription className="text-slate-600">
          Solo personal autorizado de Lucams_shop.
        </CardDescription>
      </CardHeader>

      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-700">
              Correo electrónico
            </Label>
            <EmailInput
              id="email"
              name="email"
              required
              placeholder="admin@..."
              disabled={pending}
              aria-invalid={Boolean(state?.fieldErrors?.email)}
            />
            {state?.fieldErrors?.email && (
              <p className="text-sm text-red-600">{state.fieldErrors.email[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-700">
              Contraseña
            </Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={pending}
              aria-invalid={Boolean(state?.fieldErrors?.password)}
            />
            {state?.fieldErrors?.password && (
              <p className="text-sm text-red-600">{state.fieldErrors.password[0]}</p>
            )}
          </div>

          {state?.error && !state.fieldErrors && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {state.error}
            </div>
          )}
        </CardContent>

        <CardFooter className="mt-2 flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full bg-slate-900 font-semibold text-white hover:bg-slate-800"
            disabled={pending}
          >
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <SpinnerIcon /> Verificando...
              </span>
            ) : (
              "Iniciar sesión"
            )}
          </Button>
          <p className="text-center text-xs leading-relaxed text-slate-500">
            ¿Cliente buscando tu cuenta?{" "}
            <a
              href="/login"
              className="font-medium text-slate-700 underline-offset-4 hover:underline"
            >
              Ingresar a tu cuenta
            </a>
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
