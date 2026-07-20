"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAveonlineWebhookAction } from "./actions";

export function WebhookRegistrationForm({
  defaultBaseUrl,
  disabled,
}: {
  defaultBaseUrl: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(registerAveonlineWebhookAction, null);

  return (
    <form action={action} className="space-y-2">
      <label className="text-brand-purple-dark/70 block text-xs font-semibold">
        URL base pública (sin trailing slash)
      </label>
      <div className="flex gap-2">
        <Input
          name="baseUrl"
          type="url"
          defaultValue={defaultBaseUrl}
          placeholder="https://lucamsshop.com"
          required
          disabled={disabled}
          className="flex-1 font-mono text-xs"
        />
        <Button
          type="submit"
          disabled={pending || disabled}
          className="bg-brand-purple text-white hover:brightness-110"
        >
          {pending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-1 h-3.5 w-3.5" />
          )}
          Registrar
        </Button>
      </div>
      <p className="text-brand-muted text-[10px]">
        Aveonline va a recibir:{" "}
        <code>{`{baseUrl}/api/webhooks/aveonline?secret=<AVEONLINE_WEBHOOK_SECRET>`}</code>
      </p>
      {state?.ok && (
        <div className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">{state.ok}</div>
      )}
      {state?.error && (
        <div className="rounded-md bg-rose-50 p-2 text-xs text-rose-800">{state.error}</div>
      )}
    </form>
  );
}
