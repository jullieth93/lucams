import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases de Tailwind condicionalmente y resuelve conflictos.
 *
 * Patrón estándar de shadcn/ui. Úsalo en cualquier componente para componer
 * clases con seguridad de tipos y sin conflictos (ej. `bg-brand-purple` sobre
 * `bg-white` se resuelve a `bg-brand-purple`).
 *
 * @example
 * <div className={cn("bg-white p-4", isActive && "bg-brand-purple text-white")} />
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
