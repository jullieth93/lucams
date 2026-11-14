"use client";

import { useState } from "react";
import { Loader2, Lock, Send, ShieldCheck } from "lucide-react";
import { useMfaReauthAction } from "@/components/admin/mfa-reauth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAveonlineWebhookAction, type WebhookActionState } from "./actions";

export function WebhookRegistrationForm({
  defaultBaseUrl,
  allowedOrigins,
  isOriginLocked,
  disabled,
}: {
  defaultBaseUrl: string;
  allowedOrigins: string[];
  isOriginLocked: boolean;
  disabled: boolean;
}) {
  const [state, action, pending, reauthModal] = useMfaReauthAction<WebhookActionState>(
    registerAveonlineWebhookAction,
  );
  const [selectedOrigin, setSelectedOrigin] = useState(defaultBaseUrl);

  const previewTarget = `${(selectedOrigin || defaultBaseUrl).replace(/\/+$/, "")}/api/webhooks/aveonline`;

  return (
    <>
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="aveonline-base-url"
            className="text-brand-purple-dark/80 block text-xs font-semibold"
          >
            Dominio público HTTPS de destino
          </label>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200/80">
            <ShieldCheck className="h-3 w-3" />
            Protegido con confirmación 2FA
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {isOriginLocked && allowedOrigins.length > 1 ? (
            <select
              id="aveonline-base-url"
              name="baseUrl"
              value={selectedOrigin}
              onChange={(e) => setSelectedOrigin(e.target.value)}
              disabled={disabled || pending}
              className="border-brand-purple/20 text-brand-purple-dark h-9 flex-1 rounded-md border bg-slate-50 px-3 font-mono text-xs"
            >
              {allowedOrigins.map((origin) => (
                <option key={origin} value={origin}>
                  {origin}
                </option>
              ))}
            </select>
          ) : isOriginLocked ? (
            <div className="border-brand-purple/15 flex h-9 flex-1 items-center gap-2 rounded-md border bg-slate-50 px-3 font-mono text-xs text-slate-700">
              <Lock className="text-brand-purple h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{defaultBaseUrl}</span>
              <input type="hidden" name="baseUrl" value={defaultBaseUrl} />
            </div>
          ) : (
            <Input
              id="aveonline-base-url"
              name="baseUrl"
              type="url"
              value={selectedOrigin}
              onChange={(e) => setSelectedOrigin(e.target.value)}
              placeholder="https://tu-tunel.ngrok-free.app"
              required
              disabled={disabled || pending}
              className="flex-1 font-mono text-xs"
            />
          )}

          <Button
            type="submit"
            disabled={pending || disabled}
            className="bg-brand-purple text-white hover:brightness-110"
          >
            {pending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            Registrar webhook
          </Button>
        </div>

        <div className="border-brand-purple/10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600">
          <span>
            Endpoint efectivo:{" "}
            <code className="text-brand-purple-dark font-mono font-semibold">{previewTarget}</code>
          </span>
          {isOriginLocked ? (
            <span className="text-brand-muted">
              Origen fijado al dominio oficial de este entorno (anti-exfiltración)
            </span>
          ) : (
            <span className="text-amber-700">
              Modo desarrollo local: se permite túnel HTTPS temporal (ngrok)
            </span>
          )}
        </div>

        {state?.ok && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-800">
            {state.ok}
          </div>
        )}
        {state?.error && !state?.reauthRequired && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-800">
            {state.error}
          </div>
        )}
      </form>
      {reauthModal}
    </>
  );
}
