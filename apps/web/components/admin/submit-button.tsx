"use client";

/*
 * <SubmitButton> — botón submit que automáticamente se deshabilita +
 * muestra spinner mientras el form está pending (usa React 19
 * useFormStatus).
 *
 * Patrón: reemplaza al `<Button type="submit">` plano. Tiene que estar
 * DENTRO de un <form action={...}>, no funciona standalone.
 *
 * Uso:
 *   <form action={createCategoryAction}>
 *     <input name="name" />
 *     <SubmitButton label="Crear categoría" pendingLabel="Creando..." />
 *   </form>
 */

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SubmitButtonProps = {
  /** Label cuando el form NO está pending. */
  label: string;
  /** Label mientras pending. Default: agregar "…" al label. */
  pendingLabel?: string;
  /** Ícono opcional al inicio (lucide-react). */
  icon?: ReactNode;
  /** Variante del Button shadcn. Default: gradient brand. */
  variant?: "primary" | "secondary" | "danger" | "ghost";
  /** Size del Button shadcn. Default: "default". */
  size?: "default" | "sm" | "lg" | "icon";
  /** className extra. */
  className?: string;
  /** Si el form no debe enviarse (validación previa falla). */
  disabled?: boolean;
};

export function SubmitButton({
  label,
  pendingLabel,
  icon,
  variant = "primary",
  size = "default",
  className,
  disabled,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  const variantClasses: Record<NonNullable<SubmitButtonProps["variant"]>, string> = {
    primary: "bg-gradient-brand text-white shadow-md hover:brightness-110",
    secondary:
      "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 bg-white border",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    ghost: "text-brand-purple-dark hover:bg-brand-purple/8",
  };

  return (
    <Button
      type="submit"
      size={size}
      disabled={isDisabled}
      className={cn(
        "font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-70",
        variantClasses[variant],
        className,
      )}
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : icon ? (
        <span className="mr-1.5 inline-flex">{icon}</span>
      ) : null}
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </Button>
  );
}
