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
  needsFaceB: boolean;
  variantFilterOptions: VariantFilterOption[];
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

export function GalleryManager({ items, tagOptions }: { items: Item[]; tagOptions: TagOption[] }) {
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
    const fd = new FormData();
    fd.set("tag", tag);
    fd.set("name", name.trim());
    // Fase 5 — "Aplica a": "" = todas las variantes (sin clave en el FormData).
    if (variantFilterJson) fd.set("variantFilter", variantFilterJson);
    if (effectiveMode === "strip") {
      if (!stripFile) {
        setError("Selecciona la tira con las dos caras.");
        return;
      }
      fd.set("mode", "strip");
      fd.set("file", stripFile);
      if (swapFaces) fd.set("swapFaces", "1");
    } else {
      if (!fileA) {
        setError("Selecciona la imagen principal (cara A).");
        return;
      }
      fd.set("file", fileA);
      if (needsFaceB && fileB) fd.set("fileB", fileB);
    }
    startTransition(async () => {
      const res = await uploadGalleryImageAction(fd);
      if (res.error) setError(res.error);
      else resetForm();
    });
  }

  /**
   * 3.6 (2026-10-07) — ARCHIVAR (antes "Borrar"): soft-delete restaurable.
   * Confirmación ligera (es reversible desde la sección Archivados).
   */
  function onArchive(id: string, name: string) {
    setError(null);
    if (
      !window.confirm(
        `¿Archivar «${name}»? Sale del Estudio y pasa a la sección Archivados; puedes restaurarlo después.`,
      )
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

  /**
   * 3.6 — ELIMINAR PERMANENTEMENTE (solo desde Archivados): purga la fila y los
   * archivos del servidor. IRREVERSIBLE → confirmación FUERTE: escribir la
   * palabra ELIMINAR (mismo patrón destructivo de mi-cuenta/eliminar).
   */
  function onPurge(id: string, name: string) {
    setError(null);
    setNotice(null);
    const typed = window.prompt(
      `Esta acción es IRREVERSIBLE: «${name}» y sus archivos se borrarán del servidor para siempre (no se puede restaurar).\n\nEscribe ELIMINAR para confirmar:`,
    );
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== "ELIMINAR") {
      setError("Eliminación cancelada: debes escribir ELIMINAR para confirmar.");
      return;
    }
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await purgeGalleryImageAction(fd);
      if (res.error) setError(res.error);
      else setNotice(`«${name}» se eliminó permanentemente.`);
    });
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
    if (
      !window.confirm(
        `Se asignará «${label}» a ${unassignedCount} diseño${unassignedCount === 1 ? "" : "s"} sin asignar de ${group.label}. ¿Continuar?`,
      )
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
      <p className="text-brand-muted text-sm italic">
        Ningún producto activo declara <code>galleryTag</code> en su schema de personalización
        todavía. Decláralo en el producto (ej. separadores) para habilitar la subida de diseños.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Subir */}
      <div className="border-brand-purple/20 space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-brand-purple-dark font-semibold">Subir un diseño prediseñado</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-brand-purple-dark text-sm font-semibold">
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
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            >
              {tagOptions.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-brand-purple-dark text-sm font-semibold">
            Nombre del diseño
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Ej: Flores acuarela"
              className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
            />
          </label>
          {/* Fase 5 — "Aplica a": limita el diseño a un atributo de variante
              (ej. tamaño 2×6). Solo si el producto varía por algún atributo
              filtrable; si no, todo diseño aplica a todas las variantes. */}
          {variantFilterOptions.length > 0 && (
            <label className="text-brand-purple-dark text-sm font-semibold">
              Aplica a
              <select
                value={variantFilterJson}
                onChange={(e) => setVariantFilterJson(e.target.value)}
                className="border-brand-purple/25 mt-1 block w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
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
            <p className="text-brand-purple-dark mb-2 text-sm font-semibold">¿Cómo lo subes?</p>
            <div
              role="radiogroup"
              aria-label="Modo de subida"
              className="grid gap-2 sm:grid-cols-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={uploadMode === "faces"}
                onClick={() => setUploadMode("faces")}
                className={
                  "rounded-xl border-2 p-3 text-left transition-all " +
                  (uploadMode === "faces"
                    ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                    : "border-brand-purple/15 hover:border-brand-purple/30")
                }
              >
                <div className="text-brand-purple-dark text-sm font-semibold">Por caras</div>
                <div className="text-brand-muted text-xs">
                  Una imagen para la cara A y otra para la cara B (opcional).
                </div>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={uploadMode === "strip"}
                onClick={() => setUploadMode("strip")}
                className={
                  "rounded-xl border-2 p-3 text-left transition-all " +
                  (uploadMode === "strip"
                    ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                    : "border-brand-purple/15 hover:border-brand-purple/30")
                }
              >
                <div className="text-brand-purple-dark text-sm font-semibold">
                  Una sola imagen (ambas caras)
                </div>
                <div className="text-brand-muted text-xs">
                  Tira vertical de imprenta: cara A abajo (derecha) y cara B arriba (cabeza abajo).
                </div>
              </button>
            </div>
          </div>
        )}

        {effectiveMode === "strip" ? (
          <div className="bg-brand-purple/5 rounded-xl p-3">
            <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
              Tira con las dos caras
            </p>
            <button
              type="button"
              onClick={() => stripRef.current?.click()}
              disabled={pending}
              className="bg-brand-purple hover:bg-brand-purple-dark inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {stripFile ? `Cambiar: ${stripFile.name}` : "Seleccionar tira"}
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
                      className="max-h-56 w-full rounded-lg bg-white object-contain"
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
                      className="max-h-56 w-full rounded-lg bg-white object-contain"
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
                  className="border-brand-purple text-brand-purple hover:bg-brand-purple/10 mt-3 inline-flex items-center gap-2 rounded-xl border-2 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  Intercambiar caras{swapFaces ? " (intercambiadas)" : ""}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Cara A */}
            <div className="bg-brand-purple/5 rounded-xl p-3">
              <p className="text-brand-purple-dark mb-2 text-sm font-semibold">Cara A (frente)</p>
              <button
                type="button"
                onClick={() => fileARef.current?.click()}
                disabled={pending}
                className="bg-brand-purple hover:bg-brand-purple-dark inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {fileA ? `Cambiar: ${fileA.name}` : "Seleccionar imagen A"}
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
                  className="mt-3 aspect-video w-full rounded-lg object-contain"
                />
              )}
            </div>

            {/* Cara B */}
            {needsFaceB && (
              <div className="bg-brand-purple/5 rounded-xl p-3">
                <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
                  Cara B (respaldo)
                </p>
                <button
                  type="button"
                  onClick={() => fileBRef.current?.click()}
                  disabled={pending}
                  className="border-brand-purple text-brand-purple hover:bg-brand-purple/10 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {fileB ? `Cambiar: ${fileB.name}` : "Seleccionar imagen B (opcional)"}
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
                    className="mt-3 aspect-video w-full rounded-lg object-contain"
                  />
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onUpload}
          disabled={pending || (effectiveMode === "strip" ? !stripFile : !fileA)}
          className="bg-brand-purple-dark hover:bg-brand-purple inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Guardar diseño
        </button>

        <p className="text-brand-muted text-xs">
          Recomendado: imagen en la proporción del producto. Para separadores puedes subir también
          la cara B; si no, el respaldo se imprime en blanco. Con «Una sola imagen» la tira debe ser
          vertical: cara A abajo y cara B arriba cabeza abajo (formato doblez de imprenta).
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {/* Listado por producto */}
      <div className="space-y-2">
        <label className="text-brand-purple-dark block text-sm font-semibold">
          Buscar diseño
          <span className="relative mt-1 block sm:max-w-xs">
            <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre del diseño…"
              className="border-brand-purple/25 block w-full rounded-xl border-2 py-2 pr-3 pl-9 text-sm outline-none"
            />
          </span>
        </label>
        {notice && <p className="text-sm font-semibold text-emerald-700">{notice}</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
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
              className="border-brand-purple/10 rounded-2xl border bg-white/40 px-4 py-3"
            >
              {/* preventDefault + estado controlado: el toggle nativo del
                  summary desincronizaría openByTag. */}
              <summary
                onClick={(e) => {
                  e.preventDefault();
                  toggleOpen();
                }}
                className="text-brand-purple-dark mb-3 flex cursor-pointer items-center gap-2 text-lg font-semibold select-none"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                />
                <span>{group.label}</span>
                <span className="text-brand-muted text-xs font-semibold">
                  · {group.counts.all} {group.counts.all === 1 ? "diseño" : "diseños"}
                  {group.archived.length > 0 &&
                    ` · ${group.archived.length} archivado${group.archived.length === 1 ? "" : "s"}`}
                </span>
              </summary>

              {/* Fase 5b — chips por variante con contador. Solo si el producto
                varía por un atributo filtrable (si no, todo diseño es "Todas"). */}
              {showChips && (
                <div
                  className="mb-3 flex flex-wrap gap-1.5"
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
                        "inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-xs font-semibold transition-colors " +
                        (chip === c.key
                          ? "border-brand-purple bg-brand-purple text-white"
                          : "border-brand-purple/20 text-brand-purple-dark hover:border-brand-purple/40 bg-white")
                      }
                    >
                      {c.label}
                      <span
                        className={
                          "rounded-full px-1.5 text-[10px] tabular-nums " +
                          (chip === c.key ? "bg-white/25" : "bg-brand-purple/10")
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
                <div className="border-brand-turquoise/40 bg-brand-turquoise/10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
                  <Layers className="text-brand-purple-dark h-4 w-4 shrink-0" />
                  <span className="text-brand-purple-dark text-xs font-semibold">
                    {group.counts.unassigned} sin asignar:
                  </span>
                  <select
                    value={bulkChoice}
                    onChange={(e) =>
                      setBulkChoiceByTag((m) => ({ ...m, [group.tag]: e.target.value }))
                    }
                    aria-label={`Variante a asignar en ${group.label}`}
                    className="border-brand-purple/25 rounded-lg border-2 bg-white px-2 py-1 text-xs outline-none"
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
                    className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Asignar a todos los sin asignar
                  </button>
                </div>
              )}

              {group.items.length === 0 ? (
                <p className="text-brand-muted text-sm italic">
                  {group.counts.all === 0
                    ? normalizedQuery
                      ? "Ningún diseño coincide con la búsqueda."
                      : "Aún no hay diseños. Sube el primero arriba."
                    : "No hay diseños con este filtro."}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
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
                        className="border-brand-purple/12 relative rounded-xl border bg-white p-2 shadow-sm"
                      >
                        {/* Paquete A — click en la tarjeta abre el detalle (caras
                        A/B lado a lado + ficha). El archivar sigue aparte. */}
                        <button
                          type="button"
                          onClick={() => setDetail(it)}
                          aria-label={`Ver detalle de ${it.name}`}
                          aria-haspopup="dialog"
                          className="focus:ring-brand-turquoise block w-full rounded-lg focus:ring-2 focus:outline-none"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público */}
                          <img
                            src={it.imageUrl}
                            alt={it.name}
                            className={
                              "aspect-square w-full rounded-lg object-cover " +
                              (it.isActive ? "" : "opacity-50 grayscale")
                            }
                          />
                        </button>
                        {previewB && (
                          <span className="text-brand-purple-dark absolute top-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold shadow">
                            A/B
                          </span>
                        )}
                        {/* B-5 — pausados: atenuados + badge; NO aparecen en el Estudio. */}
                        {!it.isActive && (
                          <span className="absolute top-2 right-9 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-amber-700 shadow">
                            Pausada
                          </span>
                        )}
                        <Hint content={it.name}>
                          <p className="text-brand-purple-dark mt-1 truncate text-xs font-semibold">
                            {it.name}
                          </p>
                        </Hint>
                        {/* Fase 5 — badge del filtro por variante ("2×6") o "Todas". */}
                        <span
                          className={
                            "mt-0.5 inline-block rounded-full px-1.5 py-px text-[10px] font-semibold " +
                            (it.variantFilter
                              ? "bg-brand-turquoise/15 text-brand-purple-dark"
                              : "bg-brand-purple/5 text-brand-muted")
                          }
                        >
                          {describeVariantFilter(it.variantFilter)}
                        </span>
                        {/* B-5 — acciones de la tarjeta: visibilidad + reorden. */}
                        <div className="mt-1 flex items-center justify-between gap-1">
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
                            className="text-brand-purple-dark hover:bg-brand-purple/10 rounded-md p-1 disabled:opacity-50"
                          >
                            {it.isActive ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5 text-amber-700" />
                            )}
                          </button>
                          {reorderable && (
                            <span className="inline-flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => onMove(it.id, "up")}
                                disabled={pending || idx === 0}
                                aria-label={`Subir ${it.name}`}
                                className="text-brand-purple-dark hover:bg-brand-purple/10 rounded-md p-1 disabled:opacity-30"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onMove(it.id, "down")}
                                disabled={pending || idx === group.items.length - 1}
                                aria-label={`Bajar ${it.name}`}
                                className="text-brand-purple-dark hover:bg-brand-purple/10 rounded-md p-1 disabled:opacity-30"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          )}
                        </div>
                        {/* 3.6 — ARCHIVAR (antes "Borrar"): soft-delete, va a
                            la sección Archivados de abajo (restaurable). */}
                        <button
                          type="button"
                          onClick={() => onArchive(it.id, it.name)}
                          disabled={pending}
                          aria-label={`Archivar ${it.name}`}
                          title="Archivar (sale del Estudio, restaurable)"
                          className="absolute top-1 right-1 rounded-full bg-white/90 p-1.5 text-rose-600 shadow hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* B-5 — archivados (soft-deleted) del producto: sección colapsable
                con Restaurar (vuelven pausados, al final del orden). */}
              {group.archived.length > 0 && (
                <details className="border-brand-purple/15 mt-3 rounded-xl border bg-white/60 px-3 py-2">
                  <summary className="text-brand-purple-dark cursor-pointer text-xs font-semibold">
                    Archivados ({group.archived.length})
                  </summary>
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6 md:grid-cols-8">
                    {group.archived.map((it) => (
                      <div
                        key={it.id}
                        className="border-brand-purple/12 relative rounded-lg border bg-white p-1.5 opacity-75"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público */}
                        <img
                          src={it.imageUrl}
                          alt={it.name}
                          className="aspect-square w-full rounded-md object-cover grayscale"
                        />
                        <Hint content={it.name}>
                          <p className="text-brand-purple-dark mt-1 truncate text-[10px] font-semibold">
                            {it.name}
                          </p>
                        </Hint>
                        <div className="mt-0.5 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onRestore(it.id)}
                            disabled={pending}
                            aria-label={`Restaurar ${it.name}`}
                            className="text-brand-purple hover:bg-brand-purple/10 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-semibold disabled:opacity-50"
                          >
                            <ArchiveRestore className="h-3 w-3" />
                            Restaurar
                          </button>
                          {/* 3.6 — eliminación PERMANENTE (fila + archivos);
                              confirmación fuerte: escribir ELIMINAR. */}
                          <button
                            type="button"
                            onClick={() => onPurge(it.id, it.name)}
                            disabled={pending}
                            aria-label={`Eliminar permanentemente ${it.name}`}
                            title="Eliminar permanentemente (irreversible)"
                            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
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
    </div>
  );
}
