"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
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
import type { AuthTexts } from "../auth-texts";

export function RegistroForm({
  texts,
  initialReferralCode,
}: {
  texts: AuthTexts["registro"];
  /** Referidos v1: prefill del código desde ?ref= (link de compartir). */
  initialReferralCode?: string;
}) {
  const [state, formAction, pending] = useActionState<SignupActionState | null, FormData>(
    signupAction,
    null,
  );
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  // Autorización de tratamiento (Ley 1581) — acto afirmativo, obligatorio antes de crear la cuenta.
  const [dataConsent, setDataConsent] = useState(false);

  const passwordsMatch = !passwordConfirm || password === passwordConfirm;

  return (
    <Card className="border-brand-purple/10 animate-in fade-in slide-in-from-bottom-3 shadow-xl duration-500">
      <CardHeader className="space-y-2">
        <CardTitle className="font-display text-brand-purple-dark text-2xl">
          {texts.title}
        </CardTitle>
        <CardDescription className="text-base">{texts.subtitle}</CardDescription>
        <p className="text-muted-foreground pt-1 text-sm">
          {texts.hasAccount}{" "}
          <Link
            href="/login"
            className="text-brand-pink-ink hover:text-brand-coral-ink font-medium underline-offset-4 hover:underline"
          >
            {texts.loginCta}
          </Link>
        </p>
      </CardHeader>

      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">{texts.firstNameLabel}</Label>
              <Input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                required
                placeholder={texts.firstNamePlaceholder}
                disabled={pending}
                aria-invalid={Boolean(state?.fieldErrors?.firstName)}
              />
              {state?.fieldErrors?.firstName && (
                <p className="text-destructive text-sm">{state.fieldErrors.firstName[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="flex items-center gap-1">
                {texts.lastNameLabel}
                <span className="text-muted-foreground text-xs">{texts.lastNameOptional}</span>
              </Label>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                placeholder={texts.lastNamePlaceholder}
                disabled={pending}
                aria-invalid={Boolean(state?.fieldErrors?.lastName)}
              />
              {state?.fieldErrors?.lastName && (
                <p className="text-destructive text-sm">{state.fieldErrors.lastName[0]}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{texts.emailLabel}</Label>
            <EmailInput
              id="email"
              name="email"
              required
              placeholder={texts.emailPlaceholder}
              disabled={pending}
              aria-invalid={Boolean(state?.fieldErrors?.email)}
            />
            {state?.fieldErrors?.email && (
              <p className="text-destructive text-sm">{state.fieldErrors.email[0]}</p>
            )}
          </div>

          {/* Referidos v1 — código opcional (prefill desde ?ref=). */}
          <div className="space-y-2">
            <Label htmlFor="referralCode" className="flex items-center gap-1">
              {texts.referralLabel}
              <span className="text-muted-foreground text-xs">{texts.referralOptional}</span>
            </Label>
            <Input
              id="referralCode"
              name="referralCode"
              type="text"
              inputMode="text"
              autoComplete="off"
              defaultValue={initialReferralCode}
              placeholder={texts.referralPlaceholder}
              disabled={pending}
              aria-invalid={Boolean(state?.fieldErrors?.referralCode)}
            />
            <p className="text-muted-foreground text-xs">
              {texts.referralHint.replace("{percent}", "10")}
            </p>
            {state?.fieldErrors?.referralCode && (
              <p className="text-destructive text-sm">{state.fieldErrors.referralCode[0]}</p>
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

          {/* Ley 1581 art. 9: la autorización debe ser expresa y verificable, no inferida de un
              aviso pasivo. El texto de la casilla es administrable desde el CMS (roadmap B7,
              campo auth.registro.consent en markdown — links y negrita preservados). */}
          <label className="flex items-start gap-3 text-xs">
            <input
              type="checkbox"
              name="dataConsent"
              required
              checked={dataConsent}
              onChange={(e) => setDataConsent(e.target.checked)}
              aria-invalid={state?.fieldErrors?.dataConsent ? true : undefined}
              className="accent-brand-purple mt-0.5 h-4 w-4 flex-shrink-0"
            />
            <span className="text-muted-foreground [&_a]:text-brand-pink-ink leading-relaxed [&_a]:underline [&_a]:underline-offset-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {texts.consent}
              </ReactMarkdown>
            </span>
          </label>
          {state?.fieldErrors?.dataConsent && (
            <p className="text-xs text-rose-600">{state.fieldErrors.dataConsent[0]}</p>
          )}
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
                <SpinnerIcon /> {texts.pending}
              </span>
            ) : (
              texts.submit
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
