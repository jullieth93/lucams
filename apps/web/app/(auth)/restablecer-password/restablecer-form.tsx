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
import {
  restablecerPasswordAction,
  type RestablecerActionState,
} from "./actions";

export function RestablecerForm() {
  const [state, formAction, pending] = useActionState<
    RestablecerActionState | null,
    FormData
  >(restablecerPasswordAction, null);

  return (
    <Card className="shadow-xl border-brand-purple/10">
      <CardHeader className="space-y-2">
        <CardTitle className="font-display text-2xl text-brand-purple-dark">
          Establece tu nueva contraseña
        </CardTitle>
        <CardDescription className="text-base">
          Elige una contraseña segura. Después podrás iniciar sesión con ella.
        </CardDescription>
      </CardHeader>

      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nueva contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={Boolean(state?.fieldErrors?.password)}
            />
            <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
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
            className="w-full bg-brand-purple hover:bg-brand-purple-dark text-white font-semibold"
            disabled={pending}
          >
            {pending ? "Guardando..." : "Guardar contraseña"}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-brand-pink hover:text-brand-coral underline-offset-4 hover:underline"
            >
              Cancelar y volver a iniciar sesión
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
