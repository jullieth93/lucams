"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteReviewAction } from "./actions";

export function DeleteReviewButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="text-brand-muted">¿Eliminar?</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => deleteReviewAction(id).then(() => {}))}
          className="font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
        >
          Sí
        </button>
        <button type="button" onClick={() => setConfirm(false)} className="text-brand-muted">
          No
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      className="text-brand-muted inline-flex items-center gap-1 text-xs font-medium hover:text-rose-600"
    >
      <Trash2 className="h-3.5 w-3.5" /> Eliminar
    </button>
  );
}
