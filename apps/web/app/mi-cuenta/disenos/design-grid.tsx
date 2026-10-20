"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Share2,
  Archive,
  ExternalLink,
  Loader2,
  Palette,
  Pencil,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/brand";
import { toast } from "sonner";
import { buildPublicShareUrl } from "@/lib/public-url";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  shareDesignAction,
  archiveDesignAction,
  revokeShareAction,
  deleteDraftDesignAction,
  emptyDraftsAction,
} from "./actions";
import type { AccountTexts } from "../account-texts";

export type DesignCardData = {
  id: string;
  previewUrl: string;
  productName: string;
  productSlug: string;
  /** Hay un link /d/<token> activo (F-11: solo el hash vive en DB). */
  hasShareToken: boolean;
  used: boolean;
  inCart?: boolean;
  /** Fase 2 · item 2.4 (2026-10-07) — borrador vigente: sin acciones de
   *  compartir; la tarjeta ofrece «Seguir editando» al Estudio. 2026-10-13 —
   *  en los borradores `previewUrl` trae la MINIATURA del auto-save
   *  (Design.draftPreviewUrl) cuando existe, "" si aún no se genera. */
  draft?: boolean;
};

/**
 * 2026-10-13 — umbral de la sección «Borradores»: con más de este número la
 * sección arranca CERRADA (solo el encabezado con el contador), para que una
 * proliferación histórica de borradores no empuje los diseños listos fuera de
 * pantalla. Con pocos arranca abierta (el cliente los ve y los retoma).
 */
const DRAFTS_OPEN_BY_DEFAULT_MAX = 3;

/**
 * 2026-10-20 — confirmación destructiva como Dialog REAL (reemplaza el confirm
 * inline "Sí/No" en texto xs, casi invisible y fácil de tocar por accidente).
 * Lo usan los tres caminos destructivos del grid: archivar diseño, eliminar
 * borrador y «Vaciar borradores». Radix Dialog ya trae foco atrapado, cierre
 * por ESC/backdrop y aria-modal. El botón destructivo es rose sólido (misma
 * familia que el rose-600 de los confirms viejos) y bloquea doble submit con
 * `pending`.
 */
function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-brand-purple-dark font-display text-lg font-bold">
            {title}
          </DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={pending}
            onClick={onConfirm}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DesignGrid({
  designs,
  texts,
}: {
  designs: DesignCardData[];
  texts: AccountTexts["designs"];
}) {
  // 2026-10-13 — los borradores van en su propia sección colapsable DEBAJO de
  // los listos/pedidos (protagonismo a lo accionable: compartir/pedir otra vez).
  const ready = designs.filter((d) => !d.draft);
  const drafts = designs.filter((d) => d.draft);
  return (
    <div className="space-y-6">
      {ready.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {ready.map((d) => (
            <DesignCard key={d.id} design={d} texts={texts} />
          ))}
        </ul>
      )}
      {drafts.length > 0 && <DraftsSection drafts={drafts} texts={texts} />}
    </div>
  );
}

/**
 * 2026-10-13 — sección «Borradores»: colapsable (cerrada por defecto cuando hay
 * muchos — DRAFTS_OPEN_BY_DEFAULT_MAX — con contador "N borradores"), con
 * eliminación individual por tarjeta y «Vaciar borradores» (ambas con diálogo
 * destructivo de confirmación — 2026-10-20, mismo patrón que el archivado).
 */
function DraftsSection({
  drafts,
  texts,
}: {
  drafts: DesignCardData[];
  texts: AccountTexts["designs"];
}) {
  const [open, setOpen] = useState(drafts.length <= DRAFTS_OPEN_BY_DEFAULT_MAX);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const visible = drafts.filter((d) => !deletedIds.has(d.id));
  if (visible.length === 0) return null;

  const countText = (
    visible.length === 1 ? texts.draftsCountSingle : texts.draftsCountMany
  ).replace("{n}", String(visible.length));

  function handleEmpty() {
    startTransition(async () => {
      const r = await emptyDraftsAction();
      if (r.ok) {
        setDeletedIds(new Set(drafts.map((d) => d.id)));
        setConfirmEmpty(false);
        toast.success("Borradores eliminados.");
      } else {
        toast.error("No pudimos vaciar tus borradores. Intenta de nuevo.");
      }
    });
  }

  return (
    <section aria-label={texts.draftsSection}>
      <div className="border-brand-purple/15 flex flex-wrap items-center gap-2 rounded-2xl border bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-brand-purple-dark inline-flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold"
        >
          <ChevronDown
            className={`h-4 w-4 flex-shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <span className="truncate">
            {texts.draftsSection} · {countText}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setConfirmEmpty(true)}
          className="text-brand-muted inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium hover:text-rose-600"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {texts.draftsEmpty}
        </button>
      </div>
      <ConfirmDestructiveDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title={texts.draftsEmptyConfirm}
        body={texts.draftsEmptyBody}
        confirmLabel={texts.draftsEmptyYes}
        cancelLabel={texts.cancel}
        pending={pending}
        onConfirm={handleEmpty}
      />
      {open && (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {visible.map((d) => (
            <DraftDesignCard
              key={d.id}
              design={d}
              texts={texts}
              onDeleted={(id) => setDeletedIds((prev) => new Set(prev).add(id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Fase 2 · item 2.4 (2026-10-07) — tarjeta de un BORRADOR vigente: badge
 * «Borrador» y CTA «Seguir editando» que reabre el Estudio con ?designId=
 * (el recover flow del server valida ownership y estado). Sin compartir ni
 * archivar: compartir exige READY y archivar borradores no está soportado por
 * la action.
 *
 * 2026-10-13 — miniatura real del borrador cuando el auto-save del Estudio ya
 * la subió (Design.draftPreviewUrl, mapeada a `previewUrl` por la página);
 * sin miniatura (borradores viejos o sin foto todavía) se conserva el
 * placeholder de marca. Misma fecha: botón «Eliminar» — 2026-10-20 con diálogo
 * destructivo en vez del confirm inline (deleteDraftDesignAction borra
 * registro + assets de Storage) — antes el único retiro era la purga de
 * retención a los 90 d idle.
 */
function DraftDesignCard({
  design,
  texts,
  onDeleted,
}: {
  design: DesignCardData;
  texts: AccountTexts["designs"];
  onDeleted: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const r = await deleteDraftDesignAction(design.id);
      if (r.ok) {
        onDeleted(design.id);
        toast.success("Borrador eliminado.");
      } else {
        toast.error("No pudimos eliminar el borrador. Intenta de nuevo.");
      }
    });
  }

  return (
    <li className="border-brand-purple/12 overflow-hidden rounded-2xl border border-dashed bg-white shadow-sm">
      {design.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura de Supabase (public bucket)
        <img
          src={design.previewUrl}
          alt={`Borrador de ${design.productName}`}
          loading="lazy"
          className="bg-brand-cream aspect-square w-full object-cover"
        />
      ) : (
        <div
          className="bg-brand-cream flex aspect-square w-full flex-col items-center justify-center gap-2"
          aria-hidden
        >
          <Palette className="text-brand-purple/50 h-8 w-8" />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-2">
          <p className="text-brand-purple-dark min-w-0 flex-1 truncate text-sm font-semibold">
            {design.productName}
          </p>
          <span className="bg-brand-purple/10 text-brand-purple-dark flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">
            {texts.draftBadge}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Link
            href={`/estudio/${design.productSlug}?designId=${design.id}`}
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {texts.draftResume}
          </Link>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={texts.draftDelete}
            className="text-brand-muted ml-auto inline-flex items-center rounded-full p-1.5 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ConfirmDestructiveDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={texts.draftDeleteConfirm}
        body={texts.draftDeleteBody}
        confirmLabel={texts.draftDeleteYes}
        cancelLabel={texts.cancel}
        pending={pending}
        onConfirm={handleDelete}
      />
    </li>
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
          {design.used ? (
            <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              {texts.used}
            </span>
          ) : design.inCart ? (
            <span className="bg-brand-purple/10 text-brand-purple flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">
              {texts.inCartBadge}
            </span>
          ) : (
            <span className="bg-brand-yellow/25 text-brand-purple-dark flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">
              {texts.readyBadge}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {/* 2026-10-13 — «Editar» un diseño listo: abre el Estudio con
              ?designId=; el recover clona READY→DRAFT (el original queda
              intacto) y al finalizar el clon queda listo de nuevo. Si el diseño
              venía del carrito, la línea se reemplaza en sitio; desde aquí se
              agrega como línea nueva al confirmar. */}
          <Link
            href={`/estudio/${design.productSlug}?designId=${design.id}`}
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {texts.edit}
          </Link>
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
            <WhatsAppIcon className="h-3.5 w-3.5" />
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

          <button
            type="button"
            onClick={() => setConfirmArchive(true)}
            aria-label={texts.archiveAria}
            className="text-brand-muted ml-auto inline-flex items-center rounded-full p-1.5 hover:text-rose-600"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ConfirmDestructiveDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={texts.archiveConfirm}
        body={texts.archiveBody}
        confirmLabel={texts.archiveYes}
        cancelLabel={texts.cancel}
        pending={pending}
        onConfirm={handleArchive}
      />
    </li>
  );
}
