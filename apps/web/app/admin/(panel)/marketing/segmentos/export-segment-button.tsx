"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { MfaReauthModal } from "@/components/admin/mfa-reauth";
import type { CrmSegmentKey } from "@/features/crm/segments-service";

function parseFilename(disposition: string | null, segment: CrmSegmentKey): string {
  const fallback = `segmento-${segment}-${new Date().toISOString().slice(0, 10)}.csv`;
  if (!disposition) return fallback;
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? fallback;
}

export function ExportSegmentCsvButton({
  segment,
  disabled,
}: {
  segment: CrmSegmentKey;
  disabled?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runExport() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(
        `/admin/marketing/segmentos/export?segment=${encodeURIComponent(segment)}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      if (res.status === 403) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          reauthRequired?: boolean;
        } | null;
        if (body?.reauthRequired) {
          setNeedsReauth(true);
          return;
        }
        setError(body?.error ?? "No tienes permisos para exportar este segmento.");
        return;
      }
      if (!res.ok) {
        setError("No pudimos generar el archivo CSV. Intenta de nuevo.");
        return;
      }

      const blob = await res.blob();
      const filename = parseFilename(res.headers.get("Content-Disposition"), segment);
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
        disabled={downloading || disabled}
        className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {downloading ? "Exportando…" : "Exportar CSV (opt-in Ley 1581)"}
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
