"use client";

/*
 * Formulario de respuesta del hilo del ticket (`/admin/soporte/[id]`) con
 * Copiloto ARM Human-in-the-Loop (`Fase 12 · S26`):
 *   - Un solo clic en «Sugerir borrador» consulta contexto real del pedido y plazos
 *     legales de Colombia sin enviar PII a terceros.
 *   - El borrador NUNCA se envía solo: rellena el `<textarea>` para que el agente
 *     lo revise, ajuste y confirme explícitamente.
 */

import { useActionState, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { replyTicketAction, suggestSupportReplyAction } from "../actions";

type St = { error?: string; success?: string } | null;

export function ReplyForm({ ticketId, disabled }: { ticketId: string; disabled: boolean }) {
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [aiAssisted, setAiAssisted] = useState(false);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotMeta, setCopilotMeta] = useState<{
    reasoningSummary: string;
    source: "gemini" | "smart_template";
  } | null>(null);
  const [copilotError, setCopilotError] = useState<string | null>(null);

  const [st, run, pending] = useActionState<St, FormData>(async (prev, fd) => {
    const res = await replyTicketAction(prev, fd);
    if (res?.success) {
      setBody("");
      setIsInternal(false);
      setAiAssisted(false);
      setCopilotMeta(null);
      setCopilotError(null);
    }
    return res;
  }, null);

  async function handleSuggestDraft() {
    setCopilotLoading(true);
    setCopilotError(null);
    try {
      const res = await suggestSupportReplyAction(ticketId);
      if (!res.ok) {
        setCopilotError(res.error);
        return;
      }
      setBody(res.draftBody);
      setIsInternal(false);
      setAiAssisted(true);
      setCopilotMeta({
        reasoningSummary: res.reasoningSummary,
        source: res.source,
      });
    } catch {
      setCopilotError("No pudimos conectar con el copiloto. Intenta de nuevo.");
    } finally {
      setCopilotLoading(false);
    }
  }

  if (disabled) {
    return (
      <p className="text-brand-muted mt-2 text-sm">
        El ticket está cerrado — reábrelo si necesitas responder algo más.
      </p>
    );
  }

  return (
    <form action={run} className="mt-3 space-y-3">
      <input type="hidden" name="id" value={ticketId} />
      <input type="hidden" name="aiAssisted" value={aiAssisted ? "1" : "0"} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">
          {isInternal
            ? "Modo nota interna (visible solo para el equipo)"
            : "Respuesta al cliente (se enviará por correo y quedará en su cuenta)"}
        </span>
        <button
          type="button"
          onClick={() => void handleSuggestDraft()}
          disabled={copilotLoading || pending}
          className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-[#FFF8F0] px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {copilotLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="text-brand-magenta h-3.5 w-3.5" />
          )}
          {copilotLoading ? "Analizando caso…" : "Sugerir borrador con copiloto"}
        </button>
      </div>

      {copilotMeta ? (
        <div className="rounded-lg border border-purple-200 bg-purple-50/70 px-3 py-2 text-xs text-purple-950">
          <p className="font-semibold">
            Borrador sugerido (
            {copilotMeta.source === "gemini" ? "IA Gemini sin PII" : "Plantilla inteligente"}) — aún
            NO enviado
          </p>
          <p className="mt-0.5 text-purple-900/85">
            {copilotMeta.reasoningSummary} Revísalo y edítalo libremente antes de enviarlo.
          </p>
        </div>
      ) : null}

      {copilotError ? <p className="text-xs text-rose-700">{copilotError}</p> : null}

      <textarea
        name="body"
        required
        minLength={2}
        maxLength={2000}
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Escribe la respuesta para el cliente…"
        className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-lg border bg-white px-3 py-2.5 text-sm leading-relaxed focus:ring-2 focus:outline-none"
      />

      <label className="text-brand-purple-dark/80 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          name="internal"
          checked={isInternal}
          onChange={(e) => setIsInternal(e.target.checked)}
          className="accent-brand-purple h-4 w-4"
        />
        Nota interna (no se envía al cliente ni se muestra en su cuenta)
      </label>

      {st && (st.success || st.error) && (
        <p className={`text-xs ${st.success ? "text-emerald-700" : "text-rose-700"}`}>
          {st.success ?? st.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand-purple hover:bg-brand-purple-dark min-h-10 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-60"
      >
        {pending
          ? "Enviando…"
          : isInternal
            ? "Guardar nota interna"
            : "Enviar respuesta al cliente"}
      </button>
    </form>
  );
}
