"use client";

import { Mail } from "lucide-react";
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
import {
  resendCodeAction,
  verifyOtpAction,
  type ResendCodeActionState,
  type VerifyOtpActionState,
} from "./actions";

export function ConfirmarForm({
  email,
  firstName,
}: {
  email: string;
  firstName?: string;
}) {
  const [verifyState, verifyAction, verifying] = useActionState<
    VerifyOtpActionState | null,
    FormData
  >(verifyOtpAction, null);
  const [resendState, resendAction, resending] = useActionState<
    ResendCodeActionState | null,
    FormData
  >(resendCodeAction, null);
  const [token, setToken] = useState("");

  return (
    <Card className="shadow-xl border-brand-purple/10 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <CardHeader className="space-y-2 text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-cream text-brand-purple motion-safe:[animation:var(--animate-float)] motion-safe:[animation-duration:2.5s]"
        >
          <Mail className="h-8 w-8" strokeWidth={1.75} />
        </span>
        <CardTitle className="font-display text-2xl text-brand-purple-dark">
          {firstName ? `Listo, ${firstName}` : "Revisa tu correo"}
        </CardTitle>
        <CardDescription className="text-base">
          Te enviamos un código a{" "}
          <span className="font-medium text-brand-purple-dark">{email}</span>.
          Escríbelo aquí para activar tu cuenta.
        </CardDescription>
      </CardHeader>

      <form action={verifyAction}>
        <input type="hidden" name="email" value={email} />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token" className="text-center block">
              Código de confirmación
            </Label>
            <Input
              id="token"
              name="token"
              type="text"
              inputMode="numeric"
              pattern="\d{6,10}"
              maxLength={10}
              autoComplete="one-time-code"
              required
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
              placeholder="00000000"
              className="text-center text-2xl font-mono tracking-[0.4em] h-14"
              disabled={verifying}
              aria-invalid={Boolean(verifyState?.fieldErrors?.token)}
            />
            <p className="text-xs text-muted-foreground text-center">
              ¿No llegó? Revisa la carpeta de spam o solicita uno nuevo abajo.
            </p>
            {verifyState?.fieldErrors?.token && (
              <p className="text-sm text-destructive text-center">
                {verifyState.fieldErrors.token[0]}
              </p>
            )}
          </div>

          {verifyState?.error && !verifyState.fieldErrors && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {verifyState.error}
            </div>
          )}

          {resendState?.success && (
            <div
              role="status"
              className="rounded-md bg-success/10 px-3 py-2 text-sm border border-success/20"
              style={{ color: "var(--success)" }}
            >
              {resendState.success}
            </div>
          )}

          {resendState?.error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {resendState.error}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3 mt-4">
          <Button
            type="submit"
            className="w-full bg-brand-purple hover:bg-brand-purple-dark text-white font-semibold transition-all hover:shadow-md hover:-translate-y-px active:translate-y-px"
            disabled={verifying || token.length < 6}
          >
            {verifying ? (
              <span className="inline-flex items-center gap-2">
                <SpinnerIcon /> Confirmando...
              </span>
            ) : (
              "Activar mi cuenta"
            )}
          </Button>
        </CardFooter>
      </form>

      <form action={resendAction} className="px-6 pb-6 -mt-1">
        <input type="hidden" name="email" value={email} />
        <Button
          type="submit"
          variant="ghost"
          className="w-full text-sm text-brand-purple-dark hover:bg-brand-cream"
          disabled={resending}
        >
          {resending ? "Enviando..." : "Enviar otro código"}
        </Button>
      </form>

      <p className="px-6 pb-6 -mt-2 text-sm text-center text-muted-foreground">
        ¿Email equivocado?{" "}
        <Link
          href="/registro"
          className="font-medium text-brand-pink hover:text-brand-coral underline-offset-4 hover:underline"
        >
          Volver al registro
        </Link>
      </p>
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
