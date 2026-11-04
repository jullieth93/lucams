"use client";

/*
 * Tablero interactivo de la Bandeja Operativa `/admin/hoy` (`Fase 11 · S23`).
 */

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  DollarSign,
  LifeBuoy,
  Printer,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AdminBadge, AdminCard } from "@/components/admin-page";
import { updateCrmTaskStatusAction, type CrmActionState } from "@/features/crm/actions";
import type { TodayInboxItem, TodayQueueCategory } from "@/features/crm/today-inbox-service";

type FilterKey = "ALL" | "MINE" | "URGENT" | TodayQueueCategory;

const CATEGORY_META: Record<
  TodayQueueCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  TASK: { label: "Tareas", icon: ClipboardList },
  CARE_SLA: { label: "Posventa y SLA", icon: LifeBuoy },
  WORKSHOP: { label: "Taller y Pedidos", icon: Printer },
  FINANCE: { label: "Finanzas COD", icon: DollarSign },
  RECOVERY: { label: "Recuperación", icon: TrendingUp },
};

const shortDateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

type Props = {
  items: TodayInboxItem[];
  counts: {
    total: number;
    assignedToMe: number;
    overdueOrCritical: number;
    byCategory: Record<TodayQueueCategory, number>;
  };
};

export function TodayInboxBoard({ items, counts }: Props) {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [query, setQuery] = useState("");

  const pills = useMemo(() => {
    const base: Array<{ key: FilterKey; label: string; count: number }> = [
      { key: "ALL", label: "Todo hoy", count: counts.total },
      { key: "MINE", label: "Asignado a mí", count: counts.assignedToMe },
      { key: "URGENT", label: "Vencido / Urgente", count: counts.overdueOrCritical },
    ];
    const cats: TodayQueueCategory[] = ["CARE_SLA", "TASK", "WORKSHOP", "FINANCE", "RECOVERY"];
    for (const cat of cats) {
      if (counts.byCategory[cat] > 0) {
        base.push({
          key: cat,
          label: CATEGORY_META[cat].label,
          count: counts.byCategory[cat],
        });
      }
    }
    return base;
  }, [counts]);

  const filteredItems = useMemo(() => {
    const cleanQ = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "MINE" && !item.assignedToMe) return false;
      if (filter === "URGENT" && !item.isOverdue && item.severity !== "CRITICAL") return false;
      if (
        filter !== "ALL" &&
        filter !== "MINE" &&
        filter !== "URGENT" &&
        item.category !== filter
      ) {
        return false;
      }
      if (cleanQ) {
        const haystack = `${item.title} ${item.subtitle} ${item.badgeLabel}`.toLowerCase();
        if (!haystack.includes(cleanQ)) return false;
      }
      return true;
    });
  }, [items, filter, query]);

  return (
    <div className="space-y-4">
      {/* Barra interactiva de filtros + buscador instantáneo */}
      <AdminCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="tablist"
            aria-label="Filtros de la Bandeja Hoy"
            className="flex flex-wrap items-center gap-1.5"
          >
            {pills.map((pill) => {
              const active = filter === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(pill.key)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "border-brand-purple bg-brand-purple text-white shadow-xs"
                      : "border-brand-purple/15 text-brand-purple-dark hover:bg-brand-purple/10 bg-[#FFF8F0]/60"
                  }`}
                >
                  <span>{pill.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                      active
                        ? "bg-white/20 text-white"
                        : pill.key === "URGENT" && pill.count > 0
                          ? "bg-rose-100 text-rose-800"
                          : "bg-brand-purple/15 text-brand-purple-dark"
                    }`}
                  >
                    {pill.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar por pedido, cliente o tarea..."
              aria-label="Filtrar pendientes de hoy"
              className="border-brand-purple/20 text-brand-purple-dark focus:border-brand-purple min-h-10 w-full rounded-xl border bg-white pr-3 pl-9 text-xs focus:outline-none"
            />
          </div>
        </div>
      </AdminCard>

      {/* Lista accionable o estado de bandeja en cero */}
      {filteredItems.length === 0 ? (
        <AdminCard className="border-emerald-500/25 bg-gradient-to-br from-emerald-50/70 via-white to-[#FFF8F0] p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-brand-purple-dark font-display mt-3 text-lg font-bold">
            {items.length === 0
              ? "¡Todo al día en tu bandeja operativa!"
              : "No hay pendientes para este filtro"}
          </h2>
          <p className="text-brand-muted mx-auto mt-1 max-w-md text-sm">
            {items.length === 0
              ? "No tienes alertas críticas de SLA, tareas vencidas ni bloqueos operativos pendientes por resolver en este momento."
              : "Prueba cambiando el filtro superior o limpiando el texto de búsqueda."}
          </p>
        </AdminCard>
      ) : (
        <ul className="space-y-2.5">
          {filteredItems.map((item) => (
            <TodayRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TodayRow({ item }: { item: TodayInboxItem }) {
  const [, submitTaskDone, isPending] = useActionState<CrmActionState, FormData>(
    updateCrmTaskStatusAction,
    null,
  );

  const CatIcon = CATEGORY_META[item.category].icon;
  const dueDate = item.dueAtIso ? new Date(item.dueAtIso) : null;

  return (
    <li
      className={`rounded-2xl border bg-white p-4 shadow-xs transition-colors ${
        item.severity === "CRITICAL"
          ? "border-rose-300 bg-gradient-to-r from-rose-50/40 to-white"
          : item.severity === "HIGH"
            ? "border-amber-300/80"
            : "border-brand-purple/15"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-brand-purple/10 text-brand-purple-dark inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold">
              <CatIcon className="h-3.5 w-3.5" />
              {CATEGORY_META[item.category].label}
            </span>
            <AdminBadge tone={item.badgeTone}>{item.badgeLabel}</AdminBadge>
            {item.assignedToMe && <AdminBadge tone="turquoise">Asignado a mí</AdminBadge>}
            {item.severity === "CRITICAL" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Atención inmediata
              </span>
            )}
          </div>

          <h3 className="text-brand-purple-dark mt-1.5 text-sm font-bold">{item.title}</h3>
          <p className="text-brand-muted mt-0.5 text-xs">{item.subtitle}</p>

          {dueDate && !Number.isNaN(dueDate.getTime()) && (
            <p
              className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
                item.isOverdue ? "font-semibold text-rose-700" : "text-brand-muted"
              }`}
            >
              <Clock className="h-3 w-3" />
              {item.isOverdue
                ? `Plazo vencido (${shortDateFmt.format(dueDate)})`
                : `Plazo objetivo: ${shortDateFmt.format(dueDate)}`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {item.completableTaskId && (
            <form action={submitTaskDone}>
              <input type="hidden" name="taskId" value={item.completableTaskId} />
              <input type="hidden" name="status" value="DONE" />
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isPending ? "Guardando..." : "Completar"}
              </button>
            </form>
          )}

          <Link
            href={item.actionHref}
            className="bg-brand-purple inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-all hover:brightness-110"
          >
            {item.actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </li>
  );
}
