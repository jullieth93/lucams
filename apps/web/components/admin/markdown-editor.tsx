"use client";

/*
 * <MarkdownEditor> — Editor markdown con toolbar custom (sin deps externos).
 *
 * Feedback Lucy 2026-05-16: el editor de bloques CMS necesitaba toolbar
 * (negrita, cursiva, listas, links, headings) en vez de textarea raw.
 *
 * Implementación liviana sin TipTap/Lexical: insertamos sintaxis markdown
 * en la posición del cursor del textarea. Mantiene el storage como markdown
 * puro (consistente con schemas existentes), preview live ya vive en el
 * componente padre.
 *
 * Bindings de teclado: Ctrl/Cmd+B (negrita), Ctrl/Cmd+I (cursiva), Ctrl/Cmd+K (link).
 */

import { useRef, useState, useEffect } from "react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link as LinkIcon,
  Quote,
  Code,
  Minus,
} from "lucide-react";

type ToolbarButton = {
  icon: typeof Bold;
  label: string;
  shortcut?: string;
  /**
   * Cómo transforma la selección. Recibe el texto seleccionado, retorna
   * { before, after, placeholder } — el wrapper inserta `before + (sel || placeholder) + after`.
   */
  wrap: (selected: string) => { before: string; after: string; placeholder?: string };
};

const TOOLBAR: ToolbarButton[] = [
  {
    icon: Bold,
    label: "Negrita",
    shortcut: "Ctrl+B",
    wrap: () => ({ before: "**", after: "**", placeholder: "texto en negrita" }),
  },
  {
    icon: Italic,
    label: "Cursiva",
    shortcut: "Ctrl+I",
    wrap: () => ({ before: "*", after: "*", placeholder: "texto en cursiva" }),
  },
  {
    icon: Heading1,
    label: "Título grande",
    wrap: () => ({ before: "# ", after: "", placeholder: "Título" }),
  },
  {
    icon: Heading2,
    label: "Subtítulo",
    wrap: () => ({ before: "## ", after: "", placeholder: "Subtítulo" }),
  },
  {
    icon: List,
    label: "Lista con puntos",
    wrap: (sel) => {
      if (sel.includes("\n")) {
        const lines = sel.split("\n").map((l) => (l.trim() ? `- ${l}` : l));
        return { before: lines.join("\n"), after: "", placeholder: "" };
      }
      return { before: "- ", after: "", placeholder: "item de lista" };
    },
  },
  {
    icon: ListOrdered,
    label: "Lista numerada",
    wrap: (sel) => {
      if (sel.includes("\n")) {
        const lines = sel.split("\n").map((l, i) => (l.trim() ? `${i + 1}. ${l}` : l));
        return { before: lines.join("\n"), after: "", placeholder: "" };
      }
      return { before: "1. ", after: "", placeholder: "item numerado" };
    },
  },
  {
    icon: LinkIcon,
    label: "Enlace",
    shortcut: "Ctrl+K",
    wrap: (sel) => ({
      before: "[",
      after: "](https://)",
      placeholder: sel || "texto del enlace",
    }),
  },
  {
    icon: Quote,
    label: "Cita",
    wrap: () => ({ before: "> ", after: "", placeholder: "Texto destacado" }),
  },
  {
    icon: Code,
    label: "Código",
    wrap: () => ({ before: "`", after: "`", placeholder: "código" }),
  },
  {
    icon: Minus,
    label: "Separador horizontal",
    wrap: () => ({ before: "\n---\n", after: "", placeholder: "" }),
  },
];

type Props = {
  id?: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  /** Callback opcional para sincronizar preview live. */
  onChange?: (value: string) => void;
};

export function MarkdownEditor({
  id,
  name,
  defaultValue = "",
  rows = 14,
  placeholder,
  required,
  maxLength,
  onChange,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    onChange?.(value);
  }, [value, onChange]);

  function applyWrap(wrap: ToolbarButton["wrap"]) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const { before, after, placeholder: ph } = wrap(selected);

    const inner = selected || ph || "";
    const replacement = `${before}${inner}${after}`;
    const newValue = value.slice(0, start) + replacement + value.slice(end);
    setValue(newValue);

    // Restore cursor: si insertamos placeholder, lo dejamos seleccionado para que se sobreescriba.
    requestAnimationFrame(() => {
      ta.focus();
      if (selected) {
        const cursorPos = start + replacement.length;
        ta.setSelectionRange(cursorPos, cursorPos);
      } else {
        const phStart = start + before.length;
        ta.setSelectionRange(phStart, phStart + inner.length);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      applyWrap(TOOLBAR[0].wrap);
    } else if (key === "i") {
      e.preventDefault();
      applyWrap(TOOLBAR[1].wrap);
    } else if (key === "k") {
      e.preventDefault();
      applyWrap(TOOLBAR[6].wrap);
    }
  }

  return (
    <div className="border-brand-purple/15 overflow-hidden rounded-md border bg-white">
      {/* Toolbar */}
      <div className="border-brand-purple/10 bg-brand-purple/5 flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        {TOOLBAR.map((btn, i) => {
          const Icon = btn.icon;
          return (
            <button
              key={i}
              type="button"
              onClick={() => applyWrap(btn.wrap)}
              title={btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
              aria-label={btn.label}
              className="text-brand-purple-dark/70 hover:bg-brand-purple/15 hover:text-brand-purple inline-flex h-7 w-7 items-center justify-center rounded transition-colors"
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={rows}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="block w-full resize-y border-0 px-3 py-2.5 font-mono text-sm focus:ring-0 focus:outline-none"
      />
    </div>
  );
}
