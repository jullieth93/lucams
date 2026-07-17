"use client";

/*
 * ADR-057 (2026-07-12) — Selector de ESTILO (tema/ocasión) del abecedario. Compartido por el
 * editor de Nombre y el de Set de letras. "Solo letra" (Default, id=null) siempre está: la letra
 * pintada sin ilustración. Cada estilo ilustrado (Animales, Navidad…) es un LetterTileSet con
 * fichas. Al elegir, las fichas del preview cambian a ese tema → WYSIWYG (así se imprime).
 */

/** Emoji del chip derivado del nombre del estilo (sin campo extra en DB). */
function styleEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("navidad") || n.includes("christmas") || n.includes("navide")) return "🎄";
  if (n.includes("animal")) return "🐾";
  if (n.includes("dino")) return "🦕";
  if (n.includes("espacio") || n.includes("space") || n.includes("astro")) return "🚀";
  if (n.includes("flor") || n.includes("flower") || n.includes("jardín")) return "🌸";
  if (n.includes("mar") || n.includes("océano") || n.includes("ocean")) return "🐠";
  if (n.includes("fruta") || n.includes("fruit")) return "🍓";
  if (n.includes("halloween") || n.includes("terror")) return "🎃";
  return "🎨";
}

export function LetterStylePicker({
  styles,
  selectedId,
  onSelect,
}: {
  styles: { id: string; name: string }[];
  /** null = "Solo letra" (Default). */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  // Si no hay estilos ilustrados subidos, no mostramos el selector (solo existe "Solo letra").
  if (styles.length === 0) return null;

  const options: { id: string | null; label: string; emoji: string }[] = [
    { id: null, label: "Solo letra", emoji: "✏️" },
    // Nombre corto para el chip: el set seed es "Kawaii Animales · Español" → "Kawaii Animales".
    ...styles.map((s) => ({
      id: s.id,
      label: s.name.split("·")[0].trim() || s.name,
      emoji: styleEmoji(s.name),
    })),
  ];

  return (
    <div>
      <p className="text-brand-purple-dark mb-2 text-sm font-semibold">
        Elige el estilo
        <span className="text-brand-muted ml-2 text-xs font-normal">
          · el dibujo de cada ficha 🎨
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.id === selectedId;
          return (
            <button
              key={o.id ?? "default"}
              type="button"
              onClick={() => onSelect(o.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? "border-brand-purple text-brand-purple-dark bg-brand-purple/5"
                  : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/40"
              }`}
            >
              <span aria-hidden="true">{o.emoji}</span>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
