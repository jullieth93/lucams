"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { restablecerPasswordAction, type RestablecerActionState } from "./actions";
import type { AuthTexts } from "../auth-texts";

export function RestablecerForm({
  texts,
  email,
}: {
  /** Textos de la pantalla (roadmap B7 — con {email} ya interpolado). */
  texts: AuthTexts["restablecer"];
  email: string;
}) {
  const [state, formAction, pending] = useActionState<RestablecerActionState | null, FormData>(
    restablecerPasswordAction,
    null,
  );
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [token, setToken] = useState("");

  const passwordsMatch = !passwordConfirm || password === passwordConfirm;

  return (
    <Card className="border-brand-purple/10 animate-in fade-in slide-in-from-bottom-3 shadow-xl duration-500">
      <CardHeader className="space-y-2 text-center">
        <span
          aria-hidden="true"
          className="bg-brand-cream text-brand-purple mx-auto flex h-16 w-16 items-center justify-center rounded-full motion-safe:[animation:var(--animate-float)] motion-safe:[animation-duration:2.5s]"
        >
          <KeyRound className="h-8 w-8" strokeWidth={1.75} />
        </span>
        <CardTitle className="font-display text-brand-purple-dark text-2xl">
          {texts.title}
        </CardTitle>
        <CardDescription className="text-base">{texts.subtitle}</CardDescription>
      </CardHeader>

      <form action={formAction}>
        <input type="hidden" name="email" value={email} />

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token" className="block text-center">
              {texts.codeLabel}
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
              className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
              disabled={pending}
              aria-invalid={Boolean(state?.fieldErrors?.token)}
            />
            {state?.fieldErrors?.token && (
              <p className="text-destructive text-center text-sm">{state.fieldErrors.token[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{texts.passwordLabel}</Label>
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
            <p className="text-muted-foreground text-xs">{texts.passwordHint}</p>
            {state?.fieldErrors?.password && (
              <p className="text-destructive text-sm">{state.fieldErrors.password[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="passwordConfirm">{texts.confirmLabel}</Label>
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
            {!passwordsMatch && <p className="text-destructive text-sm">{texts.mismatch}</p>}
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
        </CardContent>

        <CardFooter className="mt-4 flex flex-col gap-4">
          <Button
            type="submit"
            className="bg-brand-purple hover:bg-brand-purple-dark w-full font-semibold text-white transition-all hover:-translate-y-px hover:shadow-md active:translate-y-px"
            disabled={pending || token.length < 6 || password.length < 8 || !passwordsMatch}
          >
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <SpinnerIcon /> {texts.pending}
              </span>
            ) : (
              texts.submit
            )}
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            {texts.noCode}{" "}
            <Link
              href="/recuperar-password"
              className="text-brand-pink-ink hover:text-brand-coral-ink font-medium underline-offset-4 hover:underline"
            >
              {texts.resendCta}
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
