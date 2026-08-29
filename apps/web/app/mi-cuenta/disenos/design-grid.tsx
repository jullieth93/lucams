"use client";

import { useState, useTransition } from "react";
import { Share2, Archive, ExternalLink, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buildPublicShareUrl } from "@/lib/public-url";
import { shareDesignAction, archiveDesignAction, revokeShareAction } from "./actions";
import type { AccountTexts } from "../account-texts";

export type DesignCardData = {
  id: string;
  previewUrl: string;
  productName: string;
  productSlug: string;
  /** Hay un link /d/<token> activo (F-11: solo el hash vive en DB). */
  hasShareToken: boolean;
  used: boolean;
};

export function DesignGrid({
  designs,
  texts,
}: {
  designs: DesignCardData[];
  texts: AccountTexts["designs"];
}) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {designs.map((d) => (
        <DesignCard key={d.id} design={d} texts={texts} />
      ))}
    </ul>
  );
}

function DesignCard({ design, texts }: { design: DesignCardData; texts: AccountTexts["designs"] }) {
  const [pending, startTransition] = useTransition();
  // F-11 — el token plano solo existe en memoria tras (re)generarlo: al cargar la
  // página con un link ya emitido NO lo conocemos (en DB solo hay hash) y pedirlo
  // rota el link viejo.
  const [token, setToken] = useState<string | null>(null);
  const [shared, setShared] = useState(design.hasShareToken);
  const [archived, setArchived] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (archived) return null;

  /** Genera (o rota, si ya había link) el token en el server y devuelve la URL pública. */
  async function ensureUrl(): Promise<string | null> {
    let t = token;
    if (!t) {
      const r = await shareDesignAction(design.id);
      if (!r.ok || !r.token) return null;
      t = r.token;
      setToken(t);
      if (shared) {
        toast("Generamos un link nuevo: el anterior ya no funciona.");
      }
      setShared(true);
    }
    return buildPublicShareUrl(`/d/${t}`);
  }

  function handleCopy() {
    startTransition(async () => {
      const url = await ensureUrl();
      if (!url) {
        toast.error("No pudimos generar el link. Intenta de nuevo.");
        return;
      }
      // El toast debe reflejar el resultado REAL: writeText rechaza cuando el documento
      // perdió el foco o el navegador niega el portapapeles. Si falla, mostramos el link
      // para copiarlo a mano en vez de mentir con "copiado".
      try {
        if (!navigator.clipboard) throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado ✨ Ya puedes compartirlo.");
      } catch {
        toast("Copia tu link para compartirlo:", { description: url, duration: 10000 });
      }
    });
  }

  function handleWhatsApp() {
    // Abrimos la ventana SINCRÓNICAMENTE dentro del gesto: en el primer compartir,
    // ensureUrl() hace un round-trip al server y iOS Safari no preserva la activación
    // tras ese await → el popup se bloquearía. Abrimos en blanco ya y navegamos al
    // resolver el token (sin "noopener" para conservar la referencia; anulamos opener).
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
    startTransition(async () => {
      const url = await ensureUrl();
      if (!url) {
        win?.close();
        toast.error("No pudimos generar el link. Intenta de nuevo.");
        return;
      }
      const text = encodeURIComponent(`Mira el diseño que hice en Lucams 🦝✨ ${url}`);
      const waUrl = `https://wa.me/?text=${text}`;
      if (win && !win.closed) win.location.href = waUrl;
      else window.open(waUrl, "_blank", "noopener");
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const r = await archiveDesignAction(design.id);
      if (r.ok) {
        setArchived(true);
        toast.success("Diseño archivado.");
      } else {
        toast.error("No pudimos archivar el diseño.");
      }
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const r = await revokeShareAction(design.id);
      if (r.ok) {
        setToken(null);
        setShared(false);
        toast.success("Dejaste de compartir. El link anterior ya no funciona.");
      } else {
        toast.error("No pudimos revocar el link.");
      }
    });
  }

  return (
    <li className="border-brand-purple/12 overflow-hidden rounded-2xl border bg-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element -- preview de Supabase (public bucket) */}
      <img
        src={design.previewUrl}
        alt={`Diseño de ${design.productName}`}
        loading="lazy"
        className="bg-brand-cream aspect-square w-full object-cover"
      />
      <div className="p-3">
        <div className="flex items-center gap-2">
          <p className="text-brand-purple-dark min-w-0 flex-1 truncate text-sm font-semibold">
            {design.productName}
          </p>
          {design.used && (
            <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              {texts.used}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            disabled={pending}
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Share2 className="h-3.5 w-3.5" />
            )}
            {texts.share}
          </button>
          <button
            type="button"
            onClick={handleWhatsApp}
            disabled={pending}
            aria-label={texts.shareWa}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
          {(token || shared) && (
            <>
              {token && (
                <a
                  href={`/d/${token}`}
                  target="_blank"
                  rel="noopener"
                  className="text-brand-purple-dark hover:bg-brand-purple/8 border-brand-purple/20 inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-semibold"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {texts.view}
                </a>
              )}
              {/* #17 — dejar de compartir sin archivar: revoca el link /d/<token> y conserva el diseño. */}
              <button
                type="button"
                onClick={handleRevoke}
                disabled={pending}
                className="text-brand-muted hover:text-brand-purple-dark inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium disabled:opacity-60"
              >
                {texts.revoke}
              </button>
            </>
          )}

          {confirmArchive ? (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs">
              <span className="text-brand-muted">{texts.archiveConfirm}</span>
              <button
                type="button"
                onClick={handleArchive}
                disabled={pending}
                className="font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-60"
              >
                {texts.yes}
              </button>
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="text-brand-muted"
              >
                {texts.no}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              aria-label={texts.archiveAria}
              className="text-brand-muted ml-auto inline-flex items-center rounded-full p-1.5 hover:text-rose-600"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
