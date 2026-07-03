"use client";

/*
 * <MarkdownEditor> — Editor markdown con toolbar visual prominente.
 *
 * Feedback Lucy 2026-05-16 + 2026-05-20: el toolbar tiene que ser MUY
 * visible (no botones diminutos) y agrupado por función. Lucy NO escribe
 * markdown a mano — usa los botones igual que en GitHub/Reddit/StackOverflow.
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
  wrap: (selected: string) => { before: string; after: string; placeholder?: string };
};

type ToolbarGroup = {
  name: string;
  buttons: ToolbarButton[];
};

const TOOLBAR_GROUPS: ToolbarGroup[] = [
  {
    name: "Formato",
    buttons: [
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
    ],
  },
  {
    name: "Títulos",
    buttons: [
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
    ],
  },
  {
    name: "Listas",
    buttons: [
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
    ],
  },
  {
    name: "Insertar",
    buttons: [
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
        label: "Línea separadora",
        wrap: () => ({ before: "\n---\n", after: "", placeholder: "" }),
      },
    ],
  },
];

// Map de atajos teclado → (groupIndex, buttonIndex)
const SHORTCUTS: Record<string, [number, number]> = {
  b: [0, 0],
  i: [0, 1],
  k: [3, 0],
};

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
    const target = SHORTCUTS[key];
    if (target) {
      e.preventDefault();
      const [gi, bi] = target;
      applyWrap(TOOLBAR_GROUPS[gi].buttons[bi].wrap);
    }
  }

  return (
    <div className="border-brand-purple/20 overflow-hidden rounded-lg border bg-white shadow-sm">
      {/* Toolbar — botones grandes agrupados por función */}
      <div className="border-brand-purple/10 from-brand-purple/8 to-brand-pink/5 flex flex-wrap items-center gap-1 border-b bg-gradient-to-r px-2 py-1.5">
        {TOOLBAR_GROUPS.map((group, gi) => (
          <div key={group.name} className="flex items-center gap-0.5">
            {gi > 0 && <span className="bg-brand-purple/15 mx-1 h-5 w-px" aria-hidden="true" />}
            {group.buttons.map((btn, bi) => {
              const Icon = btn.icon;
              return (
                <button
                  key={bi}
                  type="button"
                  onClick={() => applyWrap(btn.wrap)}
                  title={btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
                  aria-label={btn.label}
                  className="text-brand-purple-dark/80 hover:bg-brand-purple/15 hover:text-brand-purple-dark active:bg-brand-purple/25 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors"
                >
                  <Icon className="h-4 w-4" strokeWidth={2.5} />
                </button>
              );
            })}
          </div>
        ))}
        <div className="text-brand-muted ml-auto hidden text-[11px] font-medium sm:block">
          💡 Selecciona texto y dale a un botón
        </div>
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
        className="text-brand-purple-dark/90 placeholder:text-brand-purple-dark/35 block w-full resize-y border-0 px-4 py-3 font-mono text-sm leading-relaxed focus:ring-0 focus:outline-none"
      />
    </div>
  );
}
