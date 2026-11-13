"use client";

import { useState } from "react";
import { Download, FileCheck2, Loader2 } from "lucide-react";
import { MfaReauthModal } from "@/components/admin/mfa-reauth";
import { formatIsoDateCO } from "@/lib/datetime";
import type { NewsletterExportScope } from "@/features/newsletter/admin-service";

function parseFilename(disposition: string | null, scope: NewsletterExportScope): string {
  const stamp = formatIsoDateCO(new Date());
  const fallback =
    scope === "audit_ledger"
      ? `suscriptores-ledger-sic-${stamp}.csv`
      : `suscriptores-newsletter-${stamp}.csv`;
  if (!disposition) return fallback;
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? fallback;
}

export function ExportSubscribersCsvButton({
  canExportAuditLedger = false,
}: {
  canExportAuditLedger?: boolean;
}) {
  const [downloadingScope, setDownloadingScope] = useState<NewsletterExportScope | null>(null);
  const [pendingReauthScope, setPendingReauthScope] = useState<NewsletterExportScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runExport(scope: NewsletterExportScope) {
    setDownloadingScope(scope);
    setError(null);
    try {
      const url =
        scope === "audit_ledger"
          ? "/admin/marketing/suscriptores/export?scope=audit_ledger"
          : "/admin/marketing/suscriptores/export";
      const res = await fetch(url, {
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
          setPendingReauthScope(scope);
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
      const filename = parseFilename(res.headers.get("Content-Disposition"), scope);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError("Error de red al descargar el CSV.");
    } finally {
      setDownloadingScope(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void runExport("active_commercial")}
          disabled={downloadingScope !== null}
          className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-10 items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {downloadingScope === "active_commercial" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {downloadingScope === "active_commercial" ? "Exportando…" : "Exportar activos (Ley 1581)"}
        </button>

        {canExportAuditLedger && (
          <button
            type="button"
            onClick={() => void runExport("audit_ledger")}
            disabled={downloadingScope !== null}
            title="Descarga el libro histórico completo (incluye bajas, rebotes y cuentas internas) para prueba legal ante la SIC."
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
          >
            {downloadingScope === "audit_ledger" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileCheck2 className="h-3.5 w-3.5" />
            )}
            {downloadingScope === "audit_ledger" ? "Generando…" : "Ledger SIC (histórico)"}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {pendingReauthScope && (
        <MfaReauthModal
          onVerified={() => {
            const next = pendingReauthScope;
            setPendingReauthScope(null);
            void runExport(next);
          }}
          onCancel={() => setPendingReauthScope(null)}
        />
      )}
    </div>
  );
}
