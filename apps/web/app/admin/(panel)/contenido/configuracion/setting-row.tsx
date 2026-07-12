"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Mail, Phone, Globe, Hash, Edit3, Loader2, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateSiteSettingAction,
  type SiteSettingActionState,
} from "@/app/admin/(panel)/contenido/actions";

type Setting = {
  id: string;
  key: string;
  value: string;
  valueType: "TEXT" | "EMAIL" | "URL" | "NUMBER" | "PHONE" | "COLOR" | "BOOLEAN";
  label: string;
  description: string | null;
};

const TYPE_ICON: Record<Setting["valueType"], typeof Mail> = {
  TEXT: Hash,
  EMAIL: Mail,
  URL: Globe,
  NUMBER: Hash,
  PHONE: Phone,
  COLOR: Hash,
  BOOLEAN: ToggleRight,
};

const TYPE_INPUT: Record<Setting["valueType"], string> = {
  TEXT: "text",
  EMAIL: "email",
  URL: "url",
  NUMBER: "number",
  PHONE: "tel",
  COLOR: "color",
  BOOLEAN: "text",
};

export function SettingRow({ setting }: { setting: Setting }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(setting.value);
  const [state, formAction, pending] = useActionState<SiteSettingActionState | null, FormData>(
    updateSiteSettingAction,
    null,
  );
  const Icon = TYPE_ICON[setting.valueType];

  useEffect(() => {
    if (state?.ok) {
      toast.success(`${setting.label} actualizado ✓`);
      // setEditing fuera del cuerpo síncrono — queueMicrotask satisface
      // react-hooks/set-state-in-effect (defer no-cascading).
      queueMicrotask(() => setEditing(false));
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, setting.label]);

  const labelBlock = (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <Icon className="text-brand-muted h-3.5 w-3.5" />
        <span className="text-brand-purple-dark text-sm font-semibold">{setting.label}</span>
      </div>
      <p className="text-brand-muted font-mono text-[10px]">{setting.key}</p>
      {setting.description && <p className="text-brand-muted mt-1 text-xs">{setting.description}</p>}
    </div>
  );

  // BOOLEAN: toggle directo (activar/desactivar con un clic) en vez de escribir texto.
  if (setting.valueType === "BOOLEAN") {
    const isOn = setting.value === "true";
    return (
      <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        {labelBlock}
        <form action={formAction} className="flex items-center gap-3">
          <input type="hidden" name="id" value={setting.id} />
          <input type="hidden" name="value" value={isOn ? "false" : "true"} />
          <span
            className={`text-xs font-semibold ${isOn ? "text-emerald-700" : "text-brand-muted"}`}
          >
            {isOn ? "Activo" : "Inactivo"}
          </span>
          <button
            type="submit"
            role="switch"
            aria-checked={isOn}
            aria-label={`${isOn ? "Desactivar" : "Activar"} ${setting.label}`}
            disabled={pending}
            className={`focus-visible:ring-brand-purple/40 relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50 ${
              isOn ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                isOn ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          {pending && <Loader2 className="text-brand-muted h-3.5 w-3.5 animate-spin" />}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      {labelBlock}

      {editing ? (
        <form action={formAction} className="flex w-full max-w-md items-center gap-2">
          <input type="hidden" name="id" value={setting.id} />
          <Input
            name="value"
            type={TYPE_INPUT[setting.valueType]}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            autoFocus
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 font-mono text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || value === setting.value}
            className="bg-gradient-brand text-white hover:brightness-110"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue(setting.value);
              setEditing(false);
            }}
            disabled={pending}
            className="text-brand-purple-dark hover:bg-brand-purple/8"
          >
            Cancelar
          </Button>
        </form>
      ) : (
        <div className="flex w-full max-w-md items-center justify-end gap-2">
          <code className="bg-brand-purple/8 text-brand-purple-dark truncate rounded-md px-2 py-1 font-mono text-sm">
            {setting.value}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="text-brand-purple-dark hover:bg-brand-purple/8"
          >
            <Edit3 className="mr-1 h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      )}
    </li>
  );
}
