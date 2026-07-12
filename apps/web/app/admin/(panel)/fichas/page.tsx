/*
 * ADR-057 — Admin de "Sets de fichas": Lucy sube una ilustración kawaii por letra.
 * El editor de nombre las usa; si falta una, cae a placeholder. Un set por idioma.
 */

import type { Metadata } from "next";
import { listLetterSets, getLetterSet, ALPHABET } from "@/features/personalization/letter-tiles";
import { LetterGrid } from "./letter-grid";

export const metadata: Metadata = { title: "Fichas del abecedario" };
export const dynamic = "force-dynamic";

export default async function FichasAdminPage() {
  const sets = await listLetterSets();
  const detailed = (await Promise.all(sets.map((s) => getLetterSet(s.id)))).filter(
    (s): s is NonNullable<typeof s> => Boolean(s),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-brand-purple-dark font-display text-2xl">Fichas del abecedario</h1>
        <p className="text-brand-muted mt-1 text-sm">
          La biblioteca de dibujos de cada letra (A de Avión, B de Boca…). Son diseños tuyos, no algo que el
          cliente crea. Alimentan el editor de “Nombre Personalizado” (arma la palabra con estas fichas) y
          los productos Abecedario Completo / Pack Vocales. Si falta una letra, se muestra un marcador
          temporal. Recomendado: PNG con fondo transparente, cuadrado.
        </p>
      </header>

      {detailed.length === 0 ? (
        <div className="border-brand-purple/15 rounded-xl border border-dashed bg-white p-8 text-center">
          <p className="text-brand-purple-dark font-semibold">Aún no hay sets</p>
          <p className="text-brand-muted mt-1 text-sm">
            Corre <code className="bg-brand-cream rounded px-1">make seed-letter-sets</code> para crear los
            sets Español e Inglés.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {detailed.map((set) => {
            const alphabet = ALPHABET[set.language] ?? ALPHABET.en;
            const byChar: Record<string, { imageUrl: string; label: string | null }> = {};
            for (const t of set.tiles) byChar[t.char.toUpperCase()] = { imageUrl: t.imageUrl, label: t.label };
            const done = alphabet.filter((c) => byChar[c]).length;
            const pct = Math.round((done / alphabet.length) * 100);
            return (
              <section
                key={set.id}
                className="border-brand-purple/12 rounded-2xl border bg-white p-5 shadow-sm"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-brand-purple-dark text-lg font-semibold">{set.name}</h2>
                    <p className="text-brand-muted text-xs">
                      {set.language === "es" ? "Español · incluye Ñ" : "Inglés"} ·{" "}
                      {done === alphabet.length ? "🟢 completo" : "🟡 en progreso"}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-brand-purple-dark font-display text-lg font-bold">
                      {done}/{alphabet.length}
                    </div>
                    <div className="bg-brand-cream mt-1 h-1.5 w-28 overflow-hidden rounded-full">
                      <div className="bg-brand-turquoise h-full rounded-full" style={{ width: `${pct}%` }} />
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
