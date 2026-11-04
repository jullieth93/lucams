"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function FunnelProductSelect({
  selectedProductSlug,
  products,
  baseParamsString,
}: {
  selectedProductSlug: string;
  products: ReadonlyArray<{ slug: string; name: string }>;
  baseParamsString: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label="Filtrar embudo por producto"
        value={selectedProductSlug}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          const params = new URLSearchParams(baseParamsString);
          if (!next || next === "all") {
            params.delete("producto");
          } else {
            params.set("producto", next);
          }
          const qs = params.toString();
          startTransition(() => {
            router.push(qs ? `/admin/metricas?${qs}` : "/admin/metricas", { scroll: false });
          });
        }}
        className="border-brand-purple/20 text-brand-purple-dark focus:border-brand-purple focus:ring-brand-purple/25 min-h-10 rounded-full border bg-white px-3.5 py-1.5 pr-8 text-xs font-semibold shadow-xs transition outline-none focus:ring-2 disabled:opacity-60"
      >
        <option value="all">Todos los productos</option>
        {products.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
      {isPending && (
        <Loader2
          aria-hidden
          className="text-brand-purple pointer-events-none absolute right-2.5 h-3.5 w-3.5 animate-spin"
        />
      )}
    </div>
  );
}
