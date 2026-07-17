/*
 * Stepper visual del checkout — muestra progreso entre 1.Datos / 2.Envío / 3.Pago.
 * Server component, no requiere interactividad.
 */

import { Check } from "lucide-react";

type Step = { num: 1 | 2 | 3; label: string };

const STEPS: Step[] = [
  { num: 1, label: "Datos" },
  { num: 2, label: "Envío" },
  { num: 3, label: "Pago" },
];

export function CheckoutStepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Progreso del checkout" className="mx-auto mb-8 max-w-3xl">
      <ol className="flex items-center justify-between gap-2">
        {STEPS.map((step, idx) => {
          const isCompleted = step.num < current;
          const isCurrent = step.num === current;
          return (
            <li key={step.num} className="flex flex-1 items-center">
              <div className="flex flex-1 items-center gap-3">
                <span
                  className={
                    "inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ring-4 transition-colors " +
                    (isCompleted
                      ? "bg-emerald-500 text-white ring-emerald-100"
                      : isCurrent
                        ? "bg-gradient-brand ring-brand-purple/20 text-white"
                        : "text-brand-muted ring-brand-purple/10 bg-white")
                  }
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step.num}
                </span>
                <span
                  className={
                    "text-sm font-semibold whitespace-nowrap transition-colors " +
                    (isCompleted || isCurrent ? "text-brand-purple-dark" : "text-brand-muted")
                  }
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <span
                  className={
                    "mx-2 h-px flex-1 transition-colors sm:mx-4 " +
                    (isCompleted ? "bg-emerald-300" : "bg-brand-purple/15")
                  }
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
