"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { MfaReauthModal } from "@/components/admin/mfa-reauth";

function parseFilename(disposition: string | null): string {
  if (!disposition) {
    return `suscriptores-newsletter-${new Date().toISOString().slice(0, 10)}.csv`;
  }
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? `suscriptores-newsletter-${new Date().toISOString().slice(0, 10)}.csv`;
}

export function ExportSubscribersCsvButton() {
  const [downloading, setDownloading] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runExport() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/admin/marketing/suscriptores/export", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 403) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          reauthRequired?: boolean;
        } | null;
        if (body?.reauthRequired) {
          setNeedsReauth(true);
          return;
        }
        setError(body?.error ?? "No tienes permisos para exportar este listado.");
        return;
      }
      if (!res.ok) {
        setError("No pudimos generar el archivo CSV. Intenta de nuevo.");
        return;
      }

      const blob = await res.blob();
      const filename = parseFilename(res.headers.get("Content-Disposition"));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Error de red al descargar el CSV.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void runExport()}
        disabled={downloading}
        className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-9 items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {downloading ? "Exportando…" : "Exportar CSV"}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {needsReauth && (
        <MfaReauthModal
          onVerified={() => {
            setNeedsReauth(false);
            void runExport();
          }}
          onCancel={() => setNeedsReauth(false)}
        />
      )}
    </div>
  );
}

