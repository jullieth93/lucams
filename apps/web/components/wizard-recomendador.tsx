"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import type { OcasionData, RecommendationResult } from "@/lib/catalog";
import {
  DESTINATARIOS,
  PERSONALIZATION,
  PRICE_RANGES,
  type WizardInitial,
} from "@/lib/recomendador-options";
import { LucamsLogo } from "@/components/lucams-logo";
import { ProductFromCatalogCard } from "./product-from-catalog-card";

export function WizardRecomendador({
  ocasiones,
  initial,
}: {
  ocasiones: OcasionData[];
  initial?: WizardInitial;
}) {
  const router = useRouter();

  // #3 — solo ocasiones con productos activos: una ocasión vacía (ej. Halloween) era
  // seleccionable y garantizaba "no encontramos match" — callejón sin salida.
  const availableOcasiones = ocasiones.filter((o) => o.productCount > 0);

  // #10 — estado sembrado desde la URL (deep-link / refresh) vía el prop `initial`.
  const [step, setStep] = useState(initial?.step ?? 1);
  const [ocasionSlugs, setOcasionSlugs] = useState<string[]>(initial?.ocasionSlugs ?? []);
  const [destinatario, setDestinatario] = useState<string | null>(initial?.destinatario ?? null);
  const [priceRange, setPriceRange] = useState<{ min: number; max: number } | null>(
    initial?.priceRange ?? null,
  );
  const [pers, setPers] = useState<string>(initial?.pers ?? "any");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RecommendationResult[] | null>(null);
  const [error, setError] = useState(false); // #17 — distinguir fallo del API de "sin resultados"

  // #6 — gestión de foco (WCAG 2.4.3): al cambiar de paso/vista, mover el foco al h2 visible.
  // Solo se monta un h2 a la vez, así que el ref siempre apunta al actual.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step, results, error]);

  // #10 — arma el query string desde las respuestas actuales (misma forma que consume la page).
  function buildParams(): URLSearchParams {
    const params = new URLSearchParams();
    for (const slug of ocasionSlugs) params.append("ocasion", slug);
    if (destinatario) params.set("destinatario", destinatario);
    if (priceRange) {
      params.set("precioMin", String(priceRange.min));
      params.set("precioMax", String(priceRange.max));
    }
    if (pers !== "any") params.set("personalizable", pers);
    return params;
  }

  // #10 — refleja respuestas + paso + vista en la URL con replace (sin ensuciar el history ni
  // saltar el scroll). Se salta el primer render: el estado inicial ya viene de la URL.
  const didFirstSync = useRef(false);
  useEffect(() => {
    if (!didFirstSync.current) {
      didFirstSync.current = true;
      return;
    }
    const params = buildParams();
    if (step !== 1) params.set("paso", String(step));
    if (results !== null) params.set("vista", "resultados");
    const qs = params.toString();
    router.replace(qs ? `/recomendador?${qs}` : "/recomendador", { scroll: false });
    // buildParams/router son estables para el objetivo; sincronizamos ante cambios de respuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ocasionSlugs, destinatario, priceRange, pers, results]);

  // #10 — si la URL trae vista=resultados, restaurar la vista de resultados una sola vez al montar.
  const didInitialFetch = useRef(false);
  useEffect(() => {
    if (didInitialFetch.current) return;
    didInitialFetch.current = true;
    if (initial?.view === "results") {
      void fetchResults();
    }
    // Solo al montar; fetchResults lee el estado sembrado desde `initial`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleOcasion(slug: string) {
    setOcasionSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  async function fetchResults() {
    setLoading(true);
    setResults(null);
    setError(false);
    const params = buildParams();
    params.set("limit", "12");

    try {
      const res = await fetch(`/api/catalog/recommend?${params.toString()}`);
      if (!res.ok) throw new Error(`recommend ${res.status}`);
      const json = await res.json();
      setResults(json.results ?? []);
    } catch {
      // #17 — fallo del API ≠ "sin resultados": mostramos un estado de error con reintento, no un
      // "No encontramos" que haría creer al cliente que no hay nada para él.
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep(1);
    setOcasionSlugs([]);
    setDestinatario(null);
    setPriceRange(null);
    setPers("any");
    setResults(null);
    setError(false);
  }

  // #7 — "Ajustar respuestas": conserva las 4 respuestas y vuelve al paso de presupuesto (el
  // filtro más impactante y el que menciona el consejo), sin obligar a re-responder todo.
  function adjustAnswers() {
    setResults(null);
    setError(false);
    setStep(3);
  }

  // ───────── Error del recomendador (#17) ─────────
  if (error) {
    return (
      <div role="alert" className="rounded-xl bg-white p-6 text-center shadow-sm">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-brand-purple-dark text-xl font-bold outline-none"
        >
          Algo falló al buscar
        </h2>
        <p className="text-brand-muted mx-auto mt-2 max-w-md text-sm">
          No pudimos traer tus recomendaciones. Revisa tu conexión e inténtalo de nuevo.
        </p>
        <button
          onClick={fetchResults}
          className="bg-brand-purple hover:bg-brand-purple-dark mt-5 rounded-full px-5 py-2 text-sm font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ───────── Resultados ─────────
  if (results !== null) {
    // #7 — sin match: estado vacío kawaii con salidas reales (ajustar / catálogo / reiniciar),
    // no solo "Reiniciar" (que borraba las 4 respuestas y contradecía el consejo de relajar).
    if (results.length === 0) {
      return (
        <div aria-live="polite" className="rounded-xl bg-white p-8 text-center shadow-sm">
          <LucamsLogo variant="mascot" size={96} className="mx-auto" />
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-brand-purple-dark mt-4 text-xl font-bold outline-none"
          >
            No encontramos un match exacto
          </h2>
          <p className="text-brand-muted mx-auto mt-2 max-w-md text-sm">
            Prueba relajar algún filtro (presupuesto o personalización) para ver más opciones.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={adjustAnswers}
              className="bg-brand-purple hover:bg-brand-purple-dark rounded-full px-5 py-2 text-sm font-semibold text-white"
            >
              Ajustar respuestas
            </button>
            <Link
              href="/productos"
              className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 rounded-full border bg-white px-5 py-2 text-sm font-semibold"
            >
              Ver todo el catálogo
            </Link>
            <button
              onClick={reset}
              className="text-brand-muted hover:text-brand-purple-dark inline-flex items-center gap-1 text-sm font-medium"
            >
              <RotateCcw className="h-4 w-4" /> Empezar de nuevo
            </button>
          </div>
        </div>
      );
    }

    return (
      <div aria-live="polite" className="space-y-6">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-brand-purple text-sm font-semibold">Tu match</p>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="text-brand-purple-dark mt-1 text-xl font-bold outline-none"
              >
                Encontramos {results.length} {results.length === 1 ? "producto" : "productos"} para
                ti
              </h2>
            </div>
            <button
              onClick={reset}
              className="text-brand-purple inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              <RotateCcw className="h-4 w-4" /> Reiniciar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r) => (
            <ProductFromCatalogCard key={r.slug} product={r} showReason />
          ))}
        </div>
      </div>
    );
  }

  // ───────── Wizard ─────────
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm md:p-8">
      {/* #6 — progreso semántico: anuncio vivo para lectores de pantalla + barras decorativas. */}
      <div role="group" aria-label="Progreso del recomendador">
        <p className="sr-only" aria-live="polite">
          Paso {step} de 4
        </p>
        <div className="mb-6 flex items-center gap-2" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-brand-purple" : "bg-slate-200"}`}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-brand-purple-dark mb-2 text-xl font-bold outline-none"
          >
            ¿Para qué ocasión es?
          </h2>
          {availableOcasiones.length === 0 ? (
            // #3 — caso borde: catálogo sin ocasiones con stock → no dejar un paso 1 muerto.
            <div className="border-brand-purple/15 bg-brand-purple/5 mt-2 rounded-xl border p-6 text-center">
              <p className="text-brand-purple-dark text-sm font-semibold">
                Aún no tenemos ocasiones con productos listos ✨
              </p>
              <p className="text-brand-muted mt-1 text-sm">
                Mientras tanto, echa un vistazo a todo el catálogo.
              </p>
              <Link
                href="/productos"
                className="bg-brand-purple hover:bg-brand-purple-dark mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold text-white"
              >
                Ver todo →
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-5 text-sm text-slate-600">Elige una o varias.</p>
              <div className="flex flex-wrap gap-2">
                {availableOcasiones.map((o) => {
                  const selected = ocasionSlugs.includes(o.slug);
                  return (
                    <button
                      key={o.slug}
                      onClick={() => toggleOcasion(o.slug)}
                      aria-pressed={selected}
                      className={`rounded-full px-4 py-2 text-sm transition-colors ${
                        selected
                          ? "bg-brand-purple text-white"
                          : "border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 border bg-white"
                      }`}
                    >
                      {selected && <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                      {o.name}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setStep(2)}
                disabled={ocasionSlugs.length === 0}
                className="bg-brand-purple mt-6 inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
              >
                Siguiente <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-brand-purple-dark mb-5 text-xl font-bold outline-none"
          >
            ¿Para quién?
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DESTINATARIOS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDestinatario(d.value)}
                aria-pressed={destinatario === d.value}
                className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  destinatario === d.value
                    ? "border-brand-purple bg-brand-purple/10 text-brand-purple-dark font-bold"
                    : "hover:border-brand-purple/40 border-slate-300 bg-white text-slate-700"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="border-brand-purple/30 text-brand-purple-dark rounded-full border bg-white px-6 py-2 text-sm font-medium"
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!destinatario}
              className="bg-brand-purple inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              Siguiente <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-brand-purple-dark mb-5 text-xl font-bold outline-none"
          >
            ¿Cuánto quieres gastar?
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {PRICE_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setPriceRange({ min: r.min, max: r.max })}
                aria-pressed={priceRange?.min === r.min && priceRange?.max === r.max}
                className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  priceRange?.min === r.min && priceRange?.max === r.max
                    ? "border-brand-purple bg-brand-purple/10 text-brand-purple-dark font-bold"
                    : "hover:border-brand-purple/40 border-slate-300 bg-white text-slate-700"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="border-brand-purple/30 text-brand-purple-dark rounded-full border bg-white px-6 py-2 text-sm font-medium"
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!priceRange}
              className="bg-brand-purple inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              Siguiente <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-brand-purple-dark mb-5 text-xl font-bold outline-none"
          >
            ¿Personalizable o listo?
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {PERSONALIZATION.map((p) => (
              <button
                key={p.value}
                onClick={() => setPers(p.value)}
                aria-pressed={pers === p.value}
                className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  pers === p.value
                    ? "border-brand-purple bg-brand-purple/10 text-brand-purple-dark font-bold"
                    : "hover:border-brand-purple/40 border-slate-300 bg-white text-slate-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep(3)}
              className="border-brand-purple/30 text-brand-purple-dark rounded-full border bg-white px-6 py-2 text-sm font-medium"
            >
              Atrás
            </button>
            <button
              onClick={fetchResults}
              disabled={loading}
              className="bg-brand-purple inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Ver recomendaciones
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
