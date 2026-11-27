"use client";

/*
 * ADR-057 Fase B2 — Gestión de diseños prediseñados: subir imágenes por producto (tag) + archivar.
 * UX admin claro para Lucy (no-técnica): selector de producto, nombre, subir, preview, archivar.
 *
 * Fase 5 (2026-10-02) — selector "Aplica a": el diseño puede limitarse a UN
 * atributo de variante (ej. tamaño 2×6) persistiéndose como variantFilter Json
 * (subset de attributes; "" = "Todas las variantes"). Las tarjetas muestran
 * badge con el filtro ("2×6") o "Todas".
 *
 * Fase 5b (2026-10-02) — organización de la grilla: búsqueda por nombre, chips
 * por variante encima de cada sección ("Todas" + opciones del producto +
 * "Sin asignar", con contador) y asignación masiva del filtro a los diseños
 * sin asignar (resuelve los backfills sin SQL). El filtro de diseños existentes
 * se edita en la modal de detalle.
 *
 * B-5 (2026-10-02) — ciclo de vida sin borrar: toggle de visibilidad en la
 * tarjeta y la modal (pausados = atenuados + badge, fuera del Estudio),
 * reorden con flechas (swap de `order` con el adyacente del grupo visible:
 * mismo variantFilter del chip activo) y sección colapsable "Archivados" por
 * producto con Restaurar (vuelven pausados).
 *
 * Fase 3 · 3.6 (2026-10-07) — el viejo botón "Borrar" se renombra ARCHIVAR
 * (siempre fue soft-delete; el naming engañaba) y la sección Archivados gana
 * "Eliminar permanentemente" (purge: fila + archivos del bucket, irreversible,
 * con confirmación fuerte: escribir ELIMINAR — patrón de mi-cuenta/eliminar).
 *
 * Colapsable por producto (2026-10-05): cada sección es un <details>
 * CONTROLADO (estado openByTag) — un <details> no controlado pierde su estado
 * interno si el componente re-renderiza con otro árbol y React no ofrece
 * defaultOpen. Estado inicial: solo el primer producto expandido. Con búsqueda
 * activa se FUERZAN abiertas todas (si no, los resultados quedarían invisibles
 * tras secciones colapsadas). Se eligió colapsable sobre selector-de-un-producto
 * porque conserva el panorama completo (contadores en cada summary) y permite
 * comparar productos sin perder el contexto.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MfaReauthModal } from "@/components/admin/mfa-reauth";
import { useAdminConfirm } from "@/components/admin/use-admin-confirm";
import {
  Upload,
  Trash2,
  Loader2,
  ArrowUpDown,
  Search,
  Layers,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Archive,
  ArchiveRestore,
  ExternalLink,
  Package,
} from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import {
  describeVariantFilter,
  normalizeVariantFilter,
  sameVariantFilter,
  type VariantFilterOption,
} from "@/features/personalization/design-gallery-filter";
import {
  uploadGalleryImageAction,
  archiveGalleryImageAction,
  purgeGalleryImageAction,
  updateGalleryVariantFilterAction,
  bulkAssignVariantFilterAction,
  toggleGalleryImageActiveAction,
  restoreGalleryImageAction,
  reorderGalleryImageAction,
} from "./actions";
import { GalleryDetailModal } from "./gallery-detail-modal";
import {
  compressImageForUpload,
  shrinkFilesToFitCombinedBudget,
  shrinkToFitUploadBudget,
  UPLOAD_PAYLOAD_BUDGET_BYTES,
} from "@/lib/client-image-compress";

type Item = {
  id: string;
  tag: string;
  name: string;
  imageUrl: string;
  imageUrlB?: string | null;
  /** Fase 5 — filtro por atributo de variante (null = todas). */
  variantFilter?: Record<string, string | number | boolean> | null;
  isActive: boolean;
  order: number;
  /** B-5 — soft-delete (serializado desde el server); los archivados van a su sección. */
  deletedAt?: string | Date | null;
};

// Llega del server (page.tsx): productos activos que resuelven un tag de
// galería (galleryTag explícito o slug — misma fuente que valida el upload,
// nada hardcodeado). variantFilterOptions alimenta el selector "Aplica a".
type TagOption = {
  tag: string;
  label: string;
  isActive: boolean;
  needsFaceB: boolean;
  variantFilterOptions: VariantFilterOption[];
  productId?: string | null;
  productSlug?: string | null;
};

function formatPreview(src: string | null | undefined) {
  if (!src) return null;
  if (src.startsWith("http")) return src;
  return src;
}

/**
 * Vista previa del corte de la tira (modo "una sola imagen"): parte la imagen
 * a la mitad vertical en un canvas del navegador — mitad inferior = cara A
 * (derecha), mitad superior = cara B rotada 180° (normalizada). Con swap=true
 * se intercambian (para diseños que vienen al revés). Mismo corte que hace el
 * server con sharp (gallery-strip.ts): lo que ves es lo que se guarda.
 */
function computeStripPreview(
  img: HTMLImageElement,
  swap: boolean,
): { faceA: string; faceB: string } | null {
  const w = img.naturalWidth;
  const fullH = img.naturalHeight;
  if (w <= 0 || fullH <= 0) return null;
  const h = Math.floor(fullH / 2);
  const render = (sourceTop: number, rotate: boolean): string | null => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    if (rotate) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-w / 2, -h / 2);
    }
    ctx.drawImage(img, 0, sourceTop, w, h, 0, 0, w, h);
    return c.toDataURL("image/png");
  };
  const bottom = render(fullH - h, false); // cara A tal cual
  const topRotated = render(0, true); // cara B normalizada
  if (!bottom || !topRotated) return null;
  return swap ? { faceA: topRotated, faceB: bottom } : { faceA: bottom, faceB: topRotated };
}

/**
 * Fase 5b — chips de la grilla: "all" (todo el producto), "unassigned"
 * (variantFilter null = "Todas las variantes") o el JSON de una opción del
 * selector "Aplica a". El emparejamiento es por igualdad de filtro normalizado
 * (sameVariantFilter), no por orden de claves del Json.
 */
function matchesChip(it: Item, chip: string): boolean {
  if (chip === "all") return true;
  const filter = normalizeVariantFilter(it.variantFilter);
  if (chip === "unassigned") return filter === null;
  try {
    return sameVariantFilter(filter, JSON.parse(chip));
  } catch {
    return false;
  }
}

type ChipCounts = { all: number; unassigned: number; byOption: Map<string, number> };

function chipCounts(items: Item[], options: VariantFilterOption[]): ChipCounts {
  const byOption = new Map<string, number>(options.map((o) => [JSON.stringify(o.filter), 0]));
  let unassigned = 0;
  for (const it of items) {
    const filter = normalizeVariantFilter(it.variantFilter);
    if (!filter) {
      unassigned += 1;
      continue;
    }
    for (const o of options) {
      if (sameVariantFilter(filter, o.filter)) {
        byOption.set(JSON.stringify(o.filter), (byOption.get(JSON.stringify(o.filter)) ?? 0) + 1);
        break;
      }
    }
  }
  return { all: items.length, unassigned, byOption };
}

export function GalleryManager({
  items,
  tagOptions,
  canAccessCatalog = false,
}: {
  items: Item[];
  tagOptions: TagOption[];
  canAccessCatalog?: boolean;
}) {
  const [tag, setTag] = useState(tagOptions[0]?.tag ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileARef = useRef<HTMLInputElement>(null);
  const fileBRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLInputElement>(null);
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  // Modo "una sola imagen (ambas caras)": tira vertical formato doblez.
  const [uploadMode, setUploadMode] = useState<"faces" | "strip">("faces");
  const [stripFile, setStripFile] = useState<File | null>(null);
  const [swapFaces, setSwapFaces] = useState(false);
  const [stripPreview, setStripPreview] = useState<{ faceA: string; faceB: string } | null>(null);
  // Paquete A (2026-10-02) — detalle del prediseñado (click en la tarjeta):
  // caras A/B lado a lado + ficha (producto, orden, estado) + archivar.
  const [detail, setDetail] = useState<Item | null>(null);
  // Fase 5 — filtro "Aplica a": JSON.stringify del variantFilter elegido;
  // "" = "Todas las variantes" (null en DB).
  const [variantFilterJson, setVariantFilterJson] = useState("");
  // Fase 5b — organización de la grilla: búsqueda por nombre, chip de variante
  // por sección ("all" | "unassigned" | JSON del filtro) y elección del bulk.
  const [query, setQuery] = useState("");
  const [chipByTag, setChipByTag] = useState<Record<string, string>>({});
  const [bulkChoiceByTag, setBulkChoiceByTag] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [reauthPurgeTarget, setReauthPurgeTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const { confirm, confirmDialog } = useAdminConfirm();
  // Colapsable por producto (2026-10-05): override explícito por tag; sin
  // override, abierto solo el primer producto. Con búsqueda, todo abierto.
  const [openByTag, setOpenByTag] = useState<Record<string, boolean>>({});

  const needsFaceB = tagOptions.find((t) => t.tag === tag)?.needsFaceB ?? false;
  // Opciones "Aplica a" del producto elegido ([] = no varía por atributos
  // filtrables → solo aplica a todas las variantes).
  const variantFilterOptions = tagOptions.find((t) => t.tag === tag)?.variantFilterOptions ?? [];
  // El modo tira solo aplica a productos de 2 caras; si el producto elegido no
  // los tiene, forzamos el flujo por caras.
  const effectiveMode = needsFaceB ? uploadMode : "faces";

  useEffect(() => {
    if (!stripFile) return;
    const url = URL.createObjectURL(stripFile);
    const img = new Image();
    img.onload = () => setStripPreview(computeStripPreview(img, swapFaces));
    img.onerror = () => setStripPreview(null);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [stripFile, swapFaces]);

  function resetForm() {
    setName("");
    setFileA(null);
    setFileB(null);
    setStripFile(null);
    setSwapFaces(false);
    setStripPreview(null);
    if (fileARef.current) fileARef.current.value = "";
    if (fileBRef.current) fileBRef.current.value = "";
    if (stripRef.current) stripRef.current.value = "";
    setError(null);
  }

  function onUpload() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Ponle un nombre al diseño (2–60 caracteres).");
      return;
    }
    if (effectiveMode === "strip" && !stripFile) {
      setError("Selecciona la tira con las dos caras.");
      return;
    }
    if (effectiveMode !== "strip" && !fileA) {
      setError("Selecciona la imagen principal (cara A).");
      return;
    }
    startTransition(async () => {
      // Auditoría 2026-11-08 — Vercel corta el body de la Server Action en
      // ~4.5 MB y el master print-grade admite entradas de hasta 15 MB: se
      // normaliza en el navegador al MISMO spec del servidor (WebP q0.90,
      // borde largo ≤4000 px por cara; la tira doble-altura ≤8000 px) y si
      // aun así no cabe se reduce en escalera sin bajar de q0.68. Con las DOS
      // caras en el mismo request, el presupuesto es COMBINADO (A+B+overhead ≤
      // 4 MB — shrinkFilesToFitCombinedBudget). El servidor re-valida y
      // re-codifica igual que antes (uploadGalleryMasterImage) — esto solo
      // evita el 413.
      const strip = effectiveMode === "strip";
      const spec = { maxEdgePx: strip ? 8000 : 4000, quality: 0.9 };
      const shrinkOpts = { maxEdgePx: spec.maxEdgePx, qualities: [0.9, 0.82, 0.75, 0.68] };
      const prepare = async (f: File): Promise<File | null> => {
        const compressed = await compressImageForUpload(f, spec);
        if (compressed.size <= UPLOAD_PAYLOAD_BUDGET_BYTES) return compressed;
        return shrinkToFitUploadBudget(compressed, shrinkOpts);
      };
      const tooBig =
        "es demasiado grande y este navegador no pudo comprimirla. Exporta el diseño como WebP o JPG de máximo 4000 px por cara e inténtalo de nuevo.";
      const preparedA = await prepare(strip ? stripFile! : fileA!);
      if (!preparedA) {
        setError(`La imagen ${strip ? "de la tira " : "principal "}${tooBig}`);
        return;
      }
      let preparedB: File | null = null;
      if (!strip && needsFaceB && fileB) {
        preparedB = await prepare(fileB);
        if (!preparedB) {
          setError(`La imagen de la cara B ${tooBig}`);
          return;
        }
      }
      // El techo de la plataforma aplica al REQUEST COMPLETO (campos + A + B),
      // no a cada cara: si juntas superan el presupuesto, ambas se reducen en
      // proporción a su peso antes de enviar (nada sale si no caben).
      let finalA = preparedA;
      let finalB = preparedB;
      if (preparedB) {
        const pair = await shrinkFilesToFitCombinedBudget([preparedA, preparedB], {
          // Los campos del form (tag/nombre/filtro) y el overhead multipart.
          budgetBytes: UPLOAD_PAYLOAD_BUDGET_BYTES - 128 * 1024,
          maxEdgePx: spec.maxEdgePx,
          qualities: [0.9, 0.82, 0.75, 0.68],
        });
        if (!pair) {
          setError(
            "Las dos caras juntas son demasiado grandes y este navegador no pudo comprimirlas lo suficiente. Exporta los diseños como WebP o JPG de máximo 4000 px por cara e inténtalo de nuevo.",
          );
          return;
        }
        [finalA, finalB] = pair as [File, File];
      }
      const fd = new FormData();
      fd.set("tag", tag);
      fd.set("name", name.trim());
      // Fase 5 — "Aplica a": "" = todas las variantes (sin clave en el FormData).
      if (variantFilterJson) fd.set("variantFilter", variantFilterJson);
      if (strip) {
        fd.set("mode", "strip");
        fd.set("file", finalA);
        if (swapFaces) fd.set("swapFaces", "1");
      } else {
        fd.set("file", finalA);
        if (finalB) fd.set("fileB", finalB);
      }
      const res = await uploadGalleryImageAction(fd);
      if (res.error) setError(res.error);
      else resetForm();
    });
  }

  /**
   * 3.6 (2026-10-07) — ARCHIVAR (antes "Borrar"): soft-delete restaurable.
   * Confirmación ligera de marca (es reversible desde la sección Archivados).
   */
  async function onArchive(id: string, name: string) {
    setError(null);
    if (
      !(await confirm(
        `¿Archivar «${name}»? Sale del Estudio y pasa a la sección Archivados; puedes restaurarlo después.`,
      ))
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await archiveGalleryImageAction(fd);
      if (res.error) setError(res.error);
    });
  }

  function executePurge(id: string, targetName: string) {
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await purgeGalleryImageAction(fd);
      if (res.reauthRequired) {
        setReauthPurgeTarget({ id, name: targetName });
      } else if (res.error) {
        setError(res.error);
      } else {
        setNotice(`«${targetName}» se eliminó permanentemente.`);
      }
    });
  }

  /**
   * 3.6 — ELIMINAR PERMANENTEMENTE (solo desde Archivados): purga la fila y los
   * archivos del servidor. IRREVERSIBLE → confirmación FUERTE (escribir
   * ELIMINAR) + MFA step-up reciente (D2).
   */
  async function onPurge(id: string, targetName: string) {
    setError(null);
    setNotice(null);
    const ok = await confirm(
      `«${targetName}» y sus archivos se borrarán del servidor para siempre (no se puede restaurar).`,
      { requireTyped: "ELIMINAR", confirmLabel: "Eliminar definitivamente" },
    );
    if (!ok) return;
    executePurge(id, targetName);
  }

  /** B-5 — pausar/reactivar sin borrar. `active` explícito: toggles
   * concurrentes no se pisan. Refleja el cambio en el detalle abierto. */
  async function onToggleActive(id: string, nextActive: boolean): Promise<string | null> {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("active", nextActive ? "1" : "0");
    const res = await toggleGalleryImageActiveAction(fd);
    if (res.error) return res.error;
    setDetail((d) => (d && d.id === id ? { ...d, isActive: nextActive } : d));
    return null;
  }

  /** B-5 — restaurar un archivado: vuelve pausado, al final del orden del tag. */
  function onRestore(id: string) {
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await restoreGalleryImageAction(fd);
      if (res.error) setError(res.error);
      else setNotice("Diseño restaurado: vuelve pausado, revísalo y reactívalo cuando quieras.");
    });
  }

  /** B-5 — reorden: swap de `order` con el adyacente del grupo visible. */
  function onMove(id: string, direction: "up" | "down") {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("direction", direction);
    startTransition(async () => {
      const res = await reorderGalleryImageAction(fd);
      if (res.error) setError(res.error);
    });
  }

  /** Fase 5b — persiste el "Aplica a" desde la modal; refleja el cambio en el
   * detalle abierto sin esperar el refetch de revalidatePath. */
  async function onSaveVariantFilter(id: string, filterJson: string): Promise<string | null> {
    const fd = new FormData();
    fd.set("id", id);
    if (filterJson) fd.set("variantFilter", filterJson);
    const res = await updateGalleryVariantFilterAction(fd);
    if (res.error) return res.error;
    setDetail((d) =>
      d && d.id === id
        ? {
            ...d,
            variantFilter: filterJson ? (JSON.parse(filterJson) as Item["variantFilter"]) : null,
          }
        : d,
    );
    return null;
  }

  /** Fase 5b — asignación masiva: todos los diseños sin filtro del tag pasan
   * a la variante elegida (confirmada con el conteo exacto). */
  function onBulkAssign(group: TagOption, unassignedCount: number) {
    const filterJson = bulkChoiceByTag[group.tag] ?? "";
    if (!filterJson) return;
    const label =
      group.variantFilterOptions.find((o) => JSON.stringify(o.filter) === filterJson)?.label ??
      filterJson;
    void (async () => {
      if (
        !(await confirm(
          `Se asignará «${label}» a ${unassignedCount} diseño${unassignedCount === 1 ? "" : "s"} sin asignar de ${group.label}. ¿Continuar?`,
        ))
      ) {
        return;
      }
      setNotice(null);
      setError(null);
      const fd = new FormData();
      fd.set("tag", group.tag);
      fd.set("variantFilter", filterJson);
      startTransition(async () => {
        const res = await bulkAssignVariantFilterAction(fd);
        if (res.error) setError(res.error);
        else {
          setNotice(`${res.count ?? 0} diseños de ${group.label} ahora aplican a «${label}».`);
          setBulkChoiceByTag((m) => ({ ...m, [group.tag]: "" }));
        }
      });
    })();
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("es");

  // B-5 — la grilla principal muestra solo los NO archivados; los soft-deleted
  // van a la sección colapsable "Archivados" de cada producto.
  const visibleItems = items.filter((i) => !i.deletedAt);

  const byTag = tagOptions.map((t) => {
    const searched = normalizedQuery
      ? visibleItems.filter(
          (i) => i.tag === t.tag && i.name.toLocaleLowerCase("es").includes(normalizedQuery),
        )
      : visibleItems.filter((i) => i.tag === t.tag);
    const chip = chipByTag[t.tag] ?? "all";
    return {
      ...t,
      // Contadores por chip sobre el resultado de la búsqueda (lo que ves).
      counts: chipCounts(searched, t.variantFilterOptions),
      items: searched.filter((i) => matchesChip(i, chip)),
      archived: items.filter((i) => i.tag === t.tag && i.deletedAt),
    };
  });

  // Sin productos con galleryTag declarado no hay dónde colgar los diseños:
  // el upload fallaría siempre, así que mejor explicarlo que mostrar un form roto.
  if (tagOptions.length === 0) {
    return (
      <div className="border-brand-purple/10 rounded-xl border-2 border-dashed bg-white px-6 py-10 text-center">
        <p className="text-brand-purple-dark font-display text-base font-semibold">
          Sin productos con galería prediseñada activa
        </p>
        <p className="text-brand-muted mx-auto mt-1 max-w-md text-sm">
          Ningún producto declara <code>galleryTag</code> en su configuración de personalización
          todavía. Decláralo en la ficha del producto para habilitar la carga de diseños.
        </p>
      </div>
    );
  }

  const fieldCls =
    "border-brand-purple/15 focus-visible:border-brand-purple focus-visible:ring-brand-purple/20 mt-1 block h-9 w-full min-w-0 rounded-md border bg-white px-3 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none";

  return (
    <div className="space-y-5">
      {/* Subir */}
      <div className="border-brand-purple/10 space-y-4 rounded-xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-brand-purple-dark font-display text-base font-semibold">
              Subir diseño prediseñado
            </h2>
            <p className="text-brand-muted mt-0.5 text-xs">
              Se optimiza automáticamente como master de imprenta y miniatura con marca de agua para
              el Estudio.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-brand-purple-dark min-w-0 text-xs font-semibold">
            Producto
            <select
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
                setFileB(null);
                // Fase 5 — el filtro "Aplica a" es por producto: al cambiar de
                // producto vuelve a "Todas las variantes".
                setVariantFilterJson("");
                if (fileBRef.current) fileBRef.current.value = "";
              }}
              className={fieldCls}
            >
              {tagOptions.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-brand-purple-dark min-w-0 text-xs font-semibold">
            Nombre del diseño
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Ej: Flores acuarela"
              className={fieldCls}
            />
          </label>
          {/* Fase 5 — "Aplica a": limita el diseño a un atributo de variante
              (ej. tamaño 2×6). Solo si el producto varía por algún atributo
              filtrable; si no, todo diseño aplica a todas las variantes. */}
          {variantFilterOptions.length > 0 && (
            <label className="text-brand-purple-dark min-w-0 text-xs font-semibold sm:col-span-2 lg:col-span-1">
              Aplica a
              <select
                value={variantFilterJson}
                onChange={(e) => setVariantFilterJson(e.target.value)}
                className={fieldCls}
              >
                <option value="">Todas las variantes</option>
                {variantFilterOptions.map((o) => (
                  <option key={JSON.stringify(o.filter)} value={JSON.stringify(o.filter)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {needsFaceB && (
          <div>
            <p className="text-brand-purple-dark mb-1.5 text-xs font-semibold">¿Cómo lo subes?</p>
            <div
              role="radiogroup"
              aria-label="Modo de subida"
              className="grid gap-2.5 sm:grid-cols-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={uploadMode === "faces"}
                onClick={() => setUploadMode("faces")}
                className={
                  "rounded-lg border p-3 text-left transition-all " +
                  (uploadMode === "faces"
                    ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-1"
                    : "border-brand-purple/15 hover:bg-brand-purple/[0.02] bg-white")
                }
              >
                <div className="text-brand-purple-dark text-xs font-semibold">Por caras</div>
                <div className="text-brand-muted mt-0.5 text-xs">
                  Una imagen para la cara A y otra para la cara B (opcional).
                </div>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={uploadMode === "strip"}
                onClick={() => setUploadMode("strip")}
                className={
                  "rounded-lg border p-3 text-left transition-all " +
                  (uploadMode === "strip"
                    ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-1"
                    : "border-brand-purple/15 hover:bg-brand-purple/[0.02] bg-white")
                }
              >
                <div className="text-brand-purple-dark text-xs font-semibold">
                  Una sola imagen (ambas caras)
                </div>
                <div className="text-brand-muted mt-0.5 text-xs">
                  Tira vertical de imprenta: cara A abajo (derecha) y cara B arriba (cabeza abajo).
                </div>
              </button>
            </div>
          </div>
        )}

        {effectiveMode === "strip" ? (
          <div className="border-brand-purple/15 bg-brand-cream/35 rounded-xl border border-dashed p-3.5">
            <p className="text-brand-purple-dark mb-2 text-xs font-semibold">
              Tira con las dos caras
            </p>
            <button
              type="button"
              onClick={() => stripRef.current?.click()}
              disabled={pending}
              className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex h-9 w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-md border bg-white px-3.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-60 sm:w-auto"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Upload className="text-brand-purple h-4 w-4 shrink-0" />
              )}
              <span className="truncate">
                {stripFile ? `Cambiar: ${stripFile.name}` : "Seleccionar tira"}
              </span>
            </button>
            <input
              ref={stripRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                setStripPreview(null);
                setStripFile(e.target.files?.[0] ?? null);
                setSwapFaces(false);
              }}
            />
            {stripFile && !stripPreview && (
              <p className="mt-2 text-xs text-amber-700">
                No pudimos previsualizar el corte en el navegador; si la proporción no cuadra con el
                producto, el servidor la rechazará con el motivo.
              </p>
            )}
            {stripPreview && (
              <div className="mt-3">
                <p className="text-brand-muted mb-2 text-xs">
                  Así quedará el corte (las dos caras ya derechas, como las verá el Estudio):
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element -- preview local del corte */}
                    <img
                      src={stripPreview.faceA}
                      alt="Cara A resultante"
                      className="border-brand-purple/10 max-h-56 w-full rounded-lg border bg-white object-contain"
                    />
                    <figcaption className="text-brand-purple-dark mt-1 text-center text-xs font-semibold">
                      Cara A (frente)
                    </figcaption>
                  </figure>
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element -- preview local del corte */}
                    <img
                      src={stripPreview.faceB}
                      alt="Cara B resultante"
                      className="border-brand-purple/10 max-h-56 w-full rounded-lg border bg-white object-contain"
                    />
                    <figcaption className="text-brand-purple-dark mt-1 text-center text-xs font-semibold">
                      Cara B (respaldo)
                    </figcaption>
                  </figure>
                </div>
                <button
                  type="button"
                  onClick={() => setSwapFaces((s) => !s)}
                  disabled={pending}
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 mt-3 inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-60"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  Intercambiar caras{swapFaces ? " (intercambiadas)" : ""}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={`grid gap-3 ${needsFaceB ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
            {/* Cara A */}
            <div className="border-brand-purple/15 bg-brand-cream/35 min-w-0 rounded-xl border border-dashed p-3.5">
              <p className="text-brand-purple-dark mb-2 text-xs font-semibold">Cara A (frente)</p>
              <button
                type="button"
                onClick={() => fileARef.current?.click()}
                disabled={pending}
                className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex h-9 w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-md border bg-white px-3.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-60 sm:w-auto"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Upload className="text-brand-purple h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {fileA ? `Cambiar: ${fileA.name}` : "Seleccionar imagen A"}
                </span>
              </button>
              <input
                ref={fileARef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setFileA(e.target.files?.[0] ?? null)}
              />
              {fileA && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={URL.createObjectURL(fileA)}
                  alt="Preview A"
                  className="border-brand-purple/10 mt-3 aspect-video max-h-48 w-full rounded-lg border bg-white object-contain"
                />
              )}
            </div>

            {/* Cara B */}
            {needsFaceB && (
              <div className="border-brand-purple/15 bg-brand-cream/35 min-w-0 rounded-xl border border-dashed p-3.5">
                <p className="text-brand-purple-dark mb-2 text-xs font-semibold">
                  Cara B (respaldo)
                </p>
                <button
                  type="button"
                  onClick={() => fileBRef.current?.click()}
                  disabled={pending}
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex h-9 w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-md border bg-white px-3.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-60 sm:w-auto"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <Upload className="text-brand-purple h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">
                    {fileB ? `Cambiar: ${fileB.name}` : "Seleccionar imagen B (opcional)"}
                  </span>
                </button>
                <input
                  ref={fileBRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => setFileB(e.target.files?.[0] ?? null)}
                />
                {fileB && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={URL.createObjectURL(fileB)}
                    alt="Preview B"
                    className="border-brand-purple/10 mt-3 aspect-video max-h-48 w-full rounded-lg border bg-white object-contain"
                  />
                )}
              </div>
            )}
          </div>
        )}

        <div className="border-brand-purple/10 flex flex-col gap-3 border-t pt-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-brand-muted max-w-2xl text-xs">
            Recomendado: imagen en la proporción del producto. En productos dúplex sin cara B, el
            respaldo se imprime con la marca de agua de Lucams. Con «Una sola imagen» la tira debe
            ser vertical (cara A abajo y cara B arriba cabeza abajo).
          </p>
          <button
            type="button"
            onClick={onUpload}
            disabled={pending || (effectiveMode === "strip" ? !stripFile : !fileA)}
            className="bg-gradient-brand inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-60 sm:w-auto"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Guardar diseño
          </button>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {/* Barra de búsqueda y avisos */}
      <div className="border-brand-purple/10 flex flex-col gap-2.5 rounded-xl border bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm" aria-label="Buscar diseño">
          <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar diseño por nombre…"
            className="border-brand-purple/15 focus-visible:border-brand-purple focus-visible:ring-brand-purple/20 block h-9 w-full rounded-md border bg-white py-1.5 pr-3 pl-9 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {query.trim() !== "" && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-brand-purple hover:text-brand-purple-dark font-semibold hover:underline"
            >
              Limpiar búsqueda
            </button>
          )}
          <span className="text-brand-muted">
            {byTag.length} {byTag.length === 1 ? "producto" : "productos"} con galería
          </span>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800"
        >
          🟢 {notice}
        </div>
      )}

      {byTag.map((group, groupIndex) => {
        const chip = chipByTag[group.tag] ?? "all";
        const showChips = group.variantFilterOptions.length > 0;
        const bulkChoice = bulkChoiceByTag[group.tag] ?? "";
        // Colapsable controlado: con búsqueda activa la sección se fuerza
        // abierta (los resultados no pueden quedar escondidos).
        const isOpen = normalizedQuery ? true : (openByTag[group.tag] ?? groupIndex === 0);
        const toggleOpen = () => setOpenByTag((m) => ({ ...m, [group.tag]: !isOpen }));
        return (
          <section key={group.tag}>
            <details
              open={isOpen}
              className="border-brand-purple/10 overflow-hidden rounded-xl border bg-white shadow-sm"
            >
              {/* preventDefault + estado controlado: el toggle nativo del
                  summary desincronizaría openByTag. */}
              <summary
                onClick={(e) => {
                  e.preventDefault();
                  toggleOpen();
                }}
                className="hover:bg-brand-purple/[0.02] flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3.5 transition-colors select-none sm:px-5 [&::-webkit-details-marker]:hidden"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <ChevronDown
                    className={`text-brand-purple h-4 w-4 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                  />
                  <span className="font-display text-brand-purple-dark text-base font-semibold">
                    {group.label}
                  </span>
                  <span className="bg-brand-purple/10 text-brand-purple-dark rounded-md px-2 py-0.5 text-xs font-medium tabular-nums">
                    {group.counts.all} {group.counts.all === 1 ? "diseño" : "diseños"}
                  </span>
                  {group.archived.length > 0 && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums">
                      {group.archived.length} archivado{group.archived.length === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <span
                  className="flex flex-wrap items-center gap-3 text-xs font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canAccessCatalog && group.productId && (
                    <Link
                      href={`/admin/productos/${group.productId}`}
                      className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 font-semibold hover:underline"
                    >
                      <Package className="h-3.5 w-3.5" />
                      Producto
                    </Link>
                  )}
                  {group.isActive && group.productSlug && (
                    <Link
                      href={`/estudio/${group.productSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-muted hover:text-brand-purple-dark inline-flex items-center gap-1 hover:underline"
                    >
                      Estudio
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </span>
              </summary>

              <div className="border-brand-purple/10 space-y-4 border-t px-4 py-4 sm:px-5">
                {/* Fase 5b — chips por variante con contador. Solo si el producto
                  varía por un atributo filtrable (si no, todo diseño es "Todas"). */}
                {showChips && (
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Filtrar por variante"
                  >
                    {[
                      { key: "all", label: "Todas", count: group.counts.all },
                      ...group.variantFilterOptions.map((o) => ({
                        key: JSON.stringify(o.filter),
                        label: o.label,
                        count: group.counts.byOption.get(JSON.stringify(o.filter)) ?? 0,
                      })),
                      { key: "unassigned", label: "Sin asignar", count: group.counts.unassigned },
                    ].map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setChipByTag((m) => ({ ...m, [group.tag]: c.key }))}
                        aria-pressed={chip === c.key}
                        className={
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors " +
                          (chip === c.key
                            ? "border-brand-purple bg-brand-purple text-white shadow-xs"
                            : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/5 bg-white")
                        }
                      >
                        <span>{c.label}</span>
                        <span
                          className={
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums " +
                            (chip === c.key
                              ? "bg-white/20 text-white"
                              : "bg-brand-purple/10 text-brand-purple-dark")
                          }
                        >
                          {c.count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Fase 5b — asignación masiva: solo si hay diseños sin asignar y
                  el producto tiene opciones de filtro. */}
                {showChips && group.counts.unassigned > 0 && (
                  <div className="border-brand-turquoise/35 bg-brand-turquoise/10 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <span className="text-brand-purple-dark inline-flex items-center gap-1.5 text-xs font-semibold">
                      <Layers className="h-4 w-4 shrink-0" />
                      {group.counts.unassigned} sin asignar:
                    </span>
                    <select
                      value={bulkChoice}
                      onChange={(e) =>
                        setBulkChoiceByTag((m) => ({ ...m, [group.tag]: e.target.value }))
                      }
                      aria-label={`Variante a asignar en ${group.label}`}
                      className="border-brand-purple/20 h-8 w-full min-w-0 rounded-md border bg-white px-2.5 text-xs shadow-xs outline-none sm:w-auto sm:max-w-xs"
                    >
                      <option value="">Elegir variante…</option>
                      {group.variantFilterOptions.map((o) => (
                        <option key={JSON.stringify(o.filter)} value={JSON.stringify(o.filter)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onBulkAssign(group, group.counts.unassigned)}
                      disabled={pending || !bulkChoice}
                      className="bg-brand-purple hover:bg-brand-purple-dark inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold text-white transition-colors disabled:opacity-60 sm:w-auto"
                    >
                      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Asignar a todos los sin asignar
                    </button>
                  </div>
                )}

                {group.items.length === 0 ? (
                  <p className="text-brand-muted py-2 text-sm italic">
                    {group.counts.all === 0
                      ? normalizedQuery
                        ? "Ningún diseño coincide con la búsqueda."
                        : "Aún no hay diseños. Sube el primero arriba."
                      : "No hay diseños con este filtro."}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {group.items.map((it, idx) => {
                      const previewB = formatPreview(it.imageUrlB);
                      // B-5 — las flechas reordenan dentro del grupo del chip activo
                      // (mismo variantFilter). Con chip "Todas" en productos con
                      // variantes el grupo visible mezcla filtros → se deshabilitan;
                      // con búsqueda activa la lista no refleja la adyacencia real.
                      const reorderable =
                        (group.variantFilterOptions.length === 0 || chip !== "all") &&
                        !normalizedQuery;
                      return (
                        <div
                          key={it.id}
                          className="border-brand-purple/10 group hover:shadow-brand-purple/10 flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                        >
                          {/* Paquete A — click en la imagen abre el detalle (caras
                          A/B lado a lado + ficha). */}
                          <button
                            type="button"
                            onClick={() => setDetail(it)}
                            aria-label={`Ver detalle de ${it.name}`}
                            aria-haspopup="dialog"
                            className="bg-brand-cream/40 focus-visible:ring-brand-purple/40 relative block aspect-square w-full overflow-hidden focus-visible:ring-2 focus-visible:outline-none"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público */}
                            <img
                              src={it.imageUrl}
                              alt={it.name}
                              className={
                                "h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04] " +
                                (it.isActive ? "" : "opacity-55 grayscale")
                              }
                            />
                            {previewB && (
                              <span className="text-brand-purple-dark absolute top-2 left-2 rounded-md bg-white/92 px-1.5 py-0.5 text-[10px] font-semibold shadow-xs">
                                A/B
                              </span>
                            )}
                            {!it.isActive && (
                              <span className="absolute top-2 right-2 rounded-md bg-amber-50/95 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 shadow-xs ring-1 ring-amber-200/80">
                                Pausada
                              </span>
                            )}
                          </button>

                          <div className="flex flex-1 flex-col justify-between p-2.5">
                            <div className="min-w-0">
                              <Hint content={it.name}>
                                <p className="text-brand-purple-dark truncate text-xs font-semibold">
                                  {it.name}
                                </p>
                              </Hint>
                              <span
                                className={
                                  "mt-1 inline-block max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium " +
                                  (it.variantFilter
                                    ? "bg-brand-turquoise/15 text-cyan-800"
                                    : "bg-brand-purple/6 text-brand-muted")
                                }
                              >
                                {describeVariantFilter(it.variantFilter)}
                              </span>
                            </div>

                            {/* Acciones limpias en pie de tarjeta (visibilidad + reorden + archivar) */}
                            <div className="border-brand-purple/10 mt-2 flex items-center justify-between gap-1 border-t pt-1.5">
                              <div className="inline-flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    startTransition(async () => {
                                      const err = await onToggleActive(it.id, !it.isActive);
                                      if (err) setError(err);
                                    })
                                  }
                                  disabled={pending}
                                  aria-label={
                                    it.isActive
                                      ? `Pausar ${it.name} en el Estudio`
                                      : `Reactivar ${it.name} en el Estudio`
                                  }
                                  aria-pressed={it.isActive}
                                  title={it.isActive ? "Visible en el Estudio" : "Pausada"}
                                  className="text-brand-purple-dark hover:bg-brand-purple/10 rounded-md p-1.5 transition-colors disabled:opacity-50"
                                >
                                  {it.isActive ? (
                                    <Eye className="h-3.5 w-3.5" />
                                  ) : (
                                    <EyeOff className="h-3.5 w-3.5 text-amber-700" />
                                  )}
                                </button>
                                {reorderable && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => onMove(it.id, "up")}
                                      disabled={pending || idx === 0}
                                      aria-label={`Subir ${it.name}`}
                                      className="text-brand-purple-dark hover:bg-brand-purple/10 rounded-md p-1 transition-colors disabled:opacity-30"
                                    >
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onMove(it.id, "down")}
                                      disabled={pending || idx === group.items.length - 1}
                                      aria-label={`Bajar ${it.name}`}
                                      className="text-brand-purple-dark hover:bg-brand-purple/10 rounded-md p-1 transition-colors disabled:opacity-30"
                                    >
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => onArchive(it.id, it.name)}
                                disabled={pending}
                                aria-label={`Archivar ${it.name}`}
                                title="Archivar (sale del Estudio, restaurable)"
                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* B-5 — archivados (soft-deleted) del producto: sección colapsable
                  con Restaurar y Eliminar permanente (sin overflow en móvil). */}
                {group.archived.length > 0 && (
                  <details className="border-brand-purple/12 rounded-xl border bg-slate-50/70 p-3">
                    <summary className="text-brand-purple-dark flex cursor-pointer items-center justify-between gap-2 text-xs font-semibold select-none">
                      <span>Archivados ({group.archived.length})</span>
                      <span className="text-brand-muted text-[11px] font-normal">
                        Restaurables o purgables con MFA
                      </span>
                    </summary>
                    <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                      {group.archived.map((it) => (
                        <div
                          key={it.id}
                          className="border-brand-purple/10 flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white shadow-xs"
                        >
                          <div className="aspect-square w-full overflow-hidden bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público */}
                            <img
                              src={it.imageUrl}
                              alt={it.name}
                              className="h-full w-full object-cover opacity-80 grayscale"
                            />
                          </div>
                          <div className="px-2.5 pt-2">
                            <Hint content={it.name}>
                              <p className="text-brand-purple-dark truncate text-xs font-semibold">
                                {it.name}
                              </p>
                            </Hint>
                          </div>
                          <div className="border-brand-purple/10 mt-2 grid grid-cols-1 gap-1 border-t p-2 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => onRestore(it.id)}
                              disabled={pending}
                              aria-label={`Restaurar ${it.name}`}
                              className="border-brand-purple/15 text-brand-purple hover:bg-brand-purple/8 inline-flex w-full min-w-0 items-center justify-center gap-1 rounded-md border bg-white px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
                            >
                              <ArchiveRestore className="h-3 w-3 shrink-0" />
                              <span className="truncate">Restaurar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onPurge(it.id, it.name)}
                              disabled={pending}
                              aria-label={`Eliminar permanentemente ${it.name}`}
                              title="Eliminar permanentemente (irreversible)"
                              className="inline-flex w-full min-w-0 items-center justify-center gap-1 rounded-md border border-rose-200/80 bg-rose-50/50 px-2 py-1.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100/70 disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">Eliminar</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </details>
          </section>
        );
      })}

      {/* Paquete A — detalle del prediseñado: caras A/B, ficha y archivar.
          Fase 5b — también edita el "Aplica a" (variantFilter). */}
      <GalleryDetailModal
        item={detail}
        productLabel={
          detail ? (tagOptions.find((t) => t.tag === detail.tag)?.label ?? detail.tag) : ""
        }
        variantFilterOptions={
          detail ? (tagOptions.find((t) => t.tag === detail.tag)?.variantFilterOptions ?? []) : []
        }
        pending={pending}
        onClose={() => setDetail(null)}
        onDelete={(id) => {
          const name = detail?.name ?? "";
          setDetail(null);
          onArchive(id, name);
        }}
        onSaveVariantFilter={onSaveVariantFilter}
        onToggleActive={onToggleActive}
      />
      {confirmDialog}
      {reauthPurgeTarget && (
        <MfaReauthModal
          onVerified={() => {
            const target = reauthPurgeTarget;
            setReauthPurgeTarget(null);
            executePurge(target.id, target.name);
          }}
          onCancel={() => setReauthPurgeTarget(null)}
        />
      )}
    </div>
  );
}
