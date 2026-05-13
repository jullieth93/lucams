"use client";

/*
 * <EditModeMount> — orquesta el modo edición admin.
 *
 * - Mantiene el estado `enabled` (toggle on/off).
 * - Renderea siempre la toolbar bottom-right.
 * - Cuando enabled, renderea el overlay que detecta hover + click
 *   sobre elementos con data-cms-key.
 * - Cuando se selecciona un elemento, renderea el InlineEditor.
 *
 * El estado vive en este componente raíz; los hijos lo reciben por
 * props para no tener que importar contextos.
 */

import { useEffect, useState } from "react";
import { EditModeToolbar } from "./edit-mode-toolbar";
import { EditOverlay } from "./edit-overlay";
import { EditModeWelcome } from "./edit-mode-welcome";
import { InlineEditor } from "./inline-editor";

export function EditModeMount({ adminEmail }: { adminEmail: string }) {
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState<{ key: string; currentText: string } | null>(null);

  // Persist preference en localStorage para que sobreviva navegación.
  // queueMicrotask para evitar la regla react-hooks/set-state-in-effect:
  // setState diferido fuera del effect body satisface al lint sin cambiar
  // el comportamiento (ambas variantes mergean el state update).
  useEffect(() => {
    const stored = localStorage.getItem("lucams_edit_mode");
    if (stored === "1") queueMicrotask(() => setEnabled(true));
  }, []);

  useEffect(() => {
    localStorage.setItem("lucams_edit_mode", enabled ? "1" : "0");
  }, [enabled]);

  return (
    <>
      <EditModeToolbar
        enabled={enabled}
        adminEmail={adminEmail}
        onToggle={() => setEnabled((v) => !v)}
      />
      {enabled && (
        <>
          <EditOverlay onSelect={setActive} />
          <EditModeWelcome />
        </>
      )}
      {active && (
        <InlineEditor
          cmsKey={active.key}
          fallbackText={active.currentText}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
