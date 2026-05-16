"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Mail, Phone, Globe, Hash, Edit3, Loader2 } from "lucide-react";
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
  BOOLEAN: Hash,
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

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">{setting.label}</span>
        </div>
        <p className="font-mono text-[10px] text-slate-400">{setting.key}</p>
        {setting.description && (
          <p className="mt-1 text-xs text-slate-500">{setting.description}</p>
        )}
      </div>

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
            className="font-mono text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || value === setting.value}
            className="bg-slate-900 text-white hover:bg-slate-800"
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
            className="text-slate-700"
          >
            Cancelar
          </Button>
        </form>
      ) : (
        <div className="flex w-full max-w-md items-center justify-end gap-2">
          <code className="truncate rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-700">
            {setting.value}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="text-slate-700 hover:bg-slate-100"
          >
            <Edit3 className="mr-1 h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      )}
    </li>
  );
}
