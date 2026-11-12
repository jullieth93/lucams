/*
 * ADR-057 — Tab "Fichas del abecedario" dentro de /admin/disenos (2026-09-15; antes
 * era la página /admin/fichas). Lucy sube una ilustración kawaii por letra. El editor
 * de nombre las usa; si falta una, cae a placeholder. Un set por idioma.
 * El guard MANAGER_UP lo hace la página padre (./page.tsx) y las actions
 * (./fichas-actions.ts) — mismo set en ambos.
 */

import { listLetterSets, getLetterSet, ALPHABET } from "@/features/personalization/letter-tiles";
// Fase 3 · 3.7 (agente admin): botón "Vista previa" por set — el componente
// vive fuera de este módulo (components/admin/letter-set-preview.tsx).
import { LetterSetPreviewButton } from "@/components/admin/letter-set-preview";
import { CountUp } from "@/components/admin/count-up";
import { LetterGrid } from "./letter-grid";
import { CreateSetForm } from "./create-set-form";

export async function FichasSection() {
  const sets = await listLetterSets();
  const detailed = (await Promise.all(sets.map((s) => getLetterSet(s.id)))).filter(
    (s): s is NonNullable<typeof s> => Boolean(s),
  );

  const summary = detailed.reduce(
    (acc, set) => {
      const alphabet = ALPHABET[set.language] ?? ALPHABET.en;
      const chars = new Set(set.tiles.map((t) => t.char.toUpperCase()));
      const done = alphabet.filter((c) => chars.has(c)).length;
      acc.totalExpected += alphabet.length;
      acc.totalUploaded += done;
      if (done === alphabet.length) acc.completeSets += 1;
      return acc;
    },
    { totalExpected: 0, totalUploaded: 0, completeSets: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="border-brand-purple/10 flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-brand-purple-dark font-display text-base font-semibold">
            Estilos del abecedario
          </h2>
          <p className="text-brand-muted mt-1 max-w-3xl text-xs leading-relaxed sm:text-sm">
            Cada <strong>estilo</strong> es un abecedario ilustrado completo con un tema (Animales,
            Navidad, Dinos…). Alimentan «Nombre Personalizado», «Abecedario Completo» y «Pack
            Vocales». Si falta una letra, se muestra un marcador temporal. Recomendado: PNG con
            fondo transparente, <strong>vertical</strong> (como el imán físico).
          </p>
        </div>
        {detailed.length > 0 && (
          <div className="border-brand-purple/12 bg-brand-purple/[0.03] flex shrink-0 items-center gap-4 rounded-xl border px-4 py-2.5">
            <div>
              <p className="text-brand-muted text-[11px] font-medium">Estilos completos</p>
              <p className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
                <CountUp value={summary.completeSets} />/{detailed.length}
              </p>
            </div>
            <div className="bg-brand-purple/10 h-8 w-px" />
            <div>
              <p className="text-brand-muted text-[11px] font-medium">Fichas cargadas</p>
              <p className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
                <CountUp value={summary.totalUploaded} />/{summary.totalExpected}
              </p>
            </div>
          </div>
        )}
      </div>

      <div>
        <CreateSetForm />
      </div>

      {detailed.length === 0 ? (
        <div className="border-brand-purple/10 rounded-xl border-2 border-dashed bg-white p-8 text-center">
          <p className="text-brand-purple-dark font-display font-semibold">Aún no hay sets</p>
          <p className="text-brand-muted mt-1 text-sm">
            Corre <code className="bg-brand-cream rounded px-1">make seed-letter-sets</code> para
            crear los sets Español e Inglés.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {detailed.map((set) => {
            const alphabet = ALPHABET[set.language] ?? ALPHABET.en;
            const byChar: Record<string, { imageUrl: string; label: string | null }> = {};
            for (const t of set.tiles)
              byChar[t.char.toUpperCase()] = { imageUrl: t.imageUrl, label: t.label };
            const done = alphabet.filter((c) => byChar[c]).length;
            const pct = Math.round((done / alphabet.length) * 100);
            return (
              <section
                key={set.id}
                className="border-brand-purple/10 rounded-xl border bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="border-brand-purple/10 mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3.5">
                  <div>
                    <h3 className="font-display text-brand-purple-dark text-base font-semibold">
                      {set.name}
                    </h3>
                    <p className="text-brand-muted mt-0.5 text-xs">
                      {set.language === "es" ? "Español · incluye Ñ" : "Inglés"} ·{" "}
                      {done === alphabet.length ? "🟢 Completo" : "🟡 En progreso"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Fase 3 · 3.7 — preview del set compuesto (render real del Estudio). */}
                    <LetterSetPreviewButton setName={set.name} alphabet={alphabet} tiles={byChar} />
                    <div className="text-right">
                      <div className="text-brand-purple-dark font-display text-base font-bold tabular-nums">
                        {done}/{alphabet.length}
                      </div>
                      <div className="bg-brand-cream mt-1 h-1.5 w-24 overflow-hidden rounded-full sm:w-28">
                        <div
                          className="admin-bar-grow-x bg-brand-turquoise h-full rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <LetterGrid setId={set.id} alphabet={alphabet} tiles={byChar} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
