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
import { signupAction, type SignupActionState } from "./actions";

export function RegistroForm() {
  const [state, formAction, pending] = useActionState<
    SignupActionState | null,
    FormData
  >(signupAction, null);

  return (
    <Card className="shadow-xl border-brand-purple/10">
      <CardHeader className="space-y-2">
        <CardTitle className="font-display text-2xl text-brand-purple-dark">
          Crea tu cuenta Lucams
        </CardTitle>
        <CardDescription className="text-base">
          Empieza a personalizar imanes únicos en minutos.
        </CardDescription>
      </CardHeader>

      {state?.success ? (
        <CardContent>
          <div
            role="status"
            className="rounded-md bg-success/10 px-4 py-3 text-sm text-success-foreground border border-success/20"
            style={{ color: "var(--success)" }}
          >
            {state.success}
          </div>
          <p className="mt-4 text-sm text-center text-muted-foreground">
            ¿Ya confirmaste?{" "}
            <Link
              href="/login"
              className="font-medium text-brand-pink hover:text-brand-coral underline-offset-4 hover:underline"
            >
              Inicia sesión
            </Link>
          </p>
        </CardContent>
      ) : (
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
                  aria-invalid={Boolean(state?.fieldErrors?.firstName)}
                />
                {state?.fieldErrors?.firstName && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.firstName[0]}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="flex items-center gap-1">
                  Apellido
                  <span className="text-xs text-muted-foreground">
                    (opcional)
                  </span>
                </Label>
                <Input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Pérez"
                  aria-invalid={Boolean(state?.fieldErrors?.lastName)}
                />
                {state?.fieldErrors?.lastName && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.lastName[0]}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="tu@email.com"
                aria-invalid={Boolean(state?.fieldErrors?.email)}
              />
              {state?.fieldErrors?.email && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.email[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                aria-invalid={Boolean(state?.fieldErrors?.password)}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 8 caracteres.
              </p>
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

            <p className="text-xs text-muted-foreground">
              Al crear tu cuenta aceptas nuestros{" "}
              <Link
                href="/terminos"
                className="text-brand-pink hover:underline underline-offset-4"
              >
                términos
              </Link>{" "}
              y la{" "}
              <Link
                href="/privacidad"
                className="text-brand-pink hover:underline underline-offset-4"
              >
                política de privacidad
              </Link>{" "}
              (Ley 1581 Habeas Data).
            </p>
          </CardContent>

          <CardFooter className="flex flex-col gap-4 mt-4">
            <Button
              type="submit"
              className="w-full bg-brand-purple hover:bg-brand-purple-dark text-white font-semibold"
              disabled={pending}
            >
              {pending ? "Creando..." : "Crear cuenta"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link
                href="/login"
                className="font-medium text-brand-pink hover:text-brand-coral underline-offset-4 hover:underline"
              >
                Iniciar sesión
              </Link>
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
