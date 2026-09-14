/*
 * Qué hay que fabricar, exactamente, para una línea de una cotización o un pedido.
 *
 * Lucy, 2026-07-25: «es muy importante cómo le va a llegar al admin para fabricación, que cubriría
 * todo: el producto, su personalización, colores, etc. Es el producto final y lo que el cliente
 * desea recibir explícito.»
 *
 * El PNG de imprenta NO se explica solo. Hay decisiones del cliente y hechos del producto que no
 * están horneados en la imagen y que, si no se escriben, se producen mal. Los casos verificados
 * contra la base de datos real:
 *
 *   · `abecedario-completo` sube UN solo PNG que contiene las 27 fichas dibujadas juntas. Contar
 *     archivos diría "1 pieza"; la verdad es "1 lámina para recortar en 27 fichas".
 *   · `tiras-magneticas-fotos` sube TRES PNG que son segmentos de UNA tira continua de 6.5×20 cm.
 *     Contar archivos diría "3 imanes". Serían tres piezas donde va una.
 *   · `separadores-libros` puede llegar de dos formas FÍSICAMENTE distintas y visualmente idénticas:
 *     la tira desplegada (se dobla por el centro) o las dos caras sueltas (se pegan espalda con
 *     espalda). Depende de si `composeFaceStrips` alcanzó a componerlas, que es best-effort.
 *   · 33 variantes del catálogo llevan `magnet: false` — la ficha no lleva imán y el armado cambia.
 *   · La medida de corte sale de la VARIANTE, no de `physicalSpecs`: en `abecedario-completo` las
 *     especificaciones dicen 7×10 cm (el empaque) y la variante dice 5×7 (la ficha).
 *   · El año del calendario sale de `Design.metadata`, no del producto: hay diseños de 2026 sobre un
 *     producto cuyo schema dice 2027. Leer el del producto imprimiría el año equivocado.
 *
 * Módulo PURO a propósito (sin `server-only`, sin Prisma, sin next/*): lo consumen la pantalla y el
 * paquete descargable, y si la lógica viviera en cualquiera de los dos acabarían divergiendo — que
 * es justo como se producen los errores caros.
 */

import { frameColorById, isStripTemplate } from "./frame-palette";
import { designUnitPriceMultiplier, letterSetUnitCount } from "./design-units";

/**
 * Qué es físicamente lo que sale de la impresora. Es una unión discriminada porque cada caso lleva
 * un paso de armado distinto y confundirlos arruina la pieza.
 *
 * Multi-unidad (2026-09-09): el diseño puede contener N UNIDADES (2 tiras, 2
 * calendarios, 2 sets de fichas) — cada caso declara las unidades para que el
 * armado las separe por pieza física y no las mezcle.
 */
export type FormatoFisico =
  | { tipo: "lamina-fichas"; fichas: number; laminas?: number }
  | { tipo: "tira-continua"; segmentos: number; tiras?: number }
  | { tipo: "tira-desplegada"; tiras: number }
  | { tipo: "caras-sueltas"; unidades: number }
  | {
      tipo: "piezas-sueltas";
      piezas: number;
      unidades?: { count: number; singular: string; plural: string; piezasPorUnidad: number };
    };

export type DatoDeFicha = { etiqueta: string; valor: string; color?: string };

export type ProductionSpec = {
  /** Unidades físicas que hay que entregar: cantidad de la línea × piezas del pack. */
  unidadesFisicas: number;
  /** Cuántas veces hay que imprimir el juego completo de archivos. */
  copias: number;
  formatoFisico: FormatoFisico;
  /** Frase en español llano de qué es cada archivo y qué hacer con él. */
  queEsCadaArchivo: string;
  /** Pasos de armado, en orden. */
  pasosArmado: string[];
  /** Medidas, materiales, acabados: lo que hay que verificar antes de cortar. */
  especificaciones: DatoDeFicha[];
  /** Decisiones del CLIENTE que hay que respetar (colores, textos, año). */
  personalizacion: DatoDeFicha[];
};

type Entrada = {
  personalizationKind: string | null;
  /** `personalizationSchema` del producto. */
  productSchema: Record<string, unknown> | null;
  /** `attributes` de la variante — manda sobre el producto. */
  variantAttrs: Record<string, unknown> | null;
  physicalSpecs: Record<string, unknown> | null;
  canvasData: Record<string, unknown> | null;
  designMetadata: Record<string, unknown> | null;
  productionUrls: string[];
  /** Cantidad pedida en la línea. */
  lineQty: number;
};

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const MATERIALES: Record<string, string> = {
  PET: "PET laminado",
  PET_MATTE: "PET laminado mate",
  PET_GLOSS: "PET laminado brillante",
  PAPER: "Papel",
  VINYL: "Vinilo",
};
const EMPAQUES: Record<string, string> = {
  STANDARD_BAG: "Bolsa estándar",
  GIFT_BOX: "Caja de regalo",
  ENVELOPE: "Sobre",
};
const IMANES: Record<string, string> = {
  FRIDGE: "Imán de nevera",
  FLEXIBLE: "Imán flexible",
};

/** Qué es lo que sale de la impresora, y por tanto qué hay que hacer con ello. */
function resolverFormato(e: Entrada): FormatoFisico {
  const letters = e.designMetadata?.letters;
  if (Array.isArray(letters) && letters.length > 0) {
    // El editor de nombre/abecedario dibuja TODAS las fichas en un solo canvas y sube un PNG.
    // Multi-unidad (2026-09-09): con N sets el cliente sube N láminas (una por set).
    const laminas = letterSetUnitCount(e.designMetadata);
    return { tipo: "lamina-fichas", fichas: letters.length, ...(laminas > 1 ? { laminas } : {}) };
  }

  const unitTemplate = (e.canvasData?.unitTemplate ?? {}) as Record<string, unknown>;
  const grid = (e.canvasData?.gridLayout ?? {}) as Record<string, unknown>;
  const esTira =
    isStripTemplate(unitTemplate as { gridCols?: unknown; gridGap?: unknown }) ||
    (grid.cols === 1 && grid.gap === 0);
  if (esTira && e.productionUrls.length > 0) {
    // Multi-unidad (2026-09-09): el diseño declara cuántas fotos lleva CADA tira
    // (unitSlots) → los archivos se agrupan en tiras independientes (2 tiras de
    // 3 segmentos ≠ 6 segmentos de una tira).
    const unitSlots =
      typeof e.canvasData?.unitSlots === "number" && e.canvasData.unitSlots >= 1
        ? e.canvasData.unitSlots
        : null;
    const tiras =
      unitSlots !== null && e.productionUrls.length > unitSlots
        ? Math.round(e.productionUrls.length / unitSlots)
        : 1;
    return {
      tipo: "tira-continua",
      segmentos: e.productionUrls.length,
      ...(tiras > 1 ? { tiras } : {}),
    };
  }

  const facesPerUnit = n(e.productSchema?.facesPerUnit) ?? 1;
  if (facesPerUnit === 2) {
    // `composeFaceStrips` es best-effort: si falló, subió las caras sueltas y NO escribió metadata.
    // Los dos casos se ven igual en el PNG y se arman al revés.
    const compuestas = e.designMetadata?.faceStrips;
    if (compuestas && typeof compuestas === "object") {
      return { tipo: "tira-desplegada", tiras: e.productionUrls.length };
    }
    return { tipo: "caras-sueltas", unidades: Math.ceil(e.productionUrls.length / 2) };
  }

  // Multi-unidad (2026-09-09): piezas sueltas que forman SETS (calendario ×2 =
  // 2 calendarios de 12 páginas). unitCount/unitSlots declarados en el diseño.
  const unitCount =
    typeof e.canvasData?.unitCount === "number" && e.canvasData.unitCount > 1
      ? e.canvasData.unitCount
      : null;
  const unitSlots =
    typeof e.canvasData?.unitSlots === "number" && e.canvasData.unitSlots >= 1
      ? e.canvasData.unitSlots
      : null;
  if (unitCount !== null && unitSlots !== null) {
    const esCalendario = e.personalizationKind === "CALENDAR_PHOTO_MONTH";
    return {
      tipo: "piezas-sueltas",
      piezas: e.productionUrls.length,
      unidades: {
        count: unitCount,
        singular: esCalendario ? "calendario" : "unidad",
        plural: esCalendario ? "calendarios" : "unidades",
        piezasPorUnidad: unitSlots,
      },
    };
  }

  return { tipo: "piezas-sueltas", piezas: e.productionUrls.length };
}

function describirFormato(
  f: FormatoFisico,
  llevaImán: boolean,
): {
  frase: string;
  pasos: string[];
} {
  const pegarImán = llevaImán
    ? ["Pega el imán en el respaldo de cada pieza."]
    : ["⚠️ Esta variante va SIN imán: no le pegues imán."];

  switch (f.tipo) {
    case "lamina-fichas": {
      const laminas = f.laminas ?? 1;
      return {
        frase:
          laminas > 1
            ? `${laminas} láminas (una por set), cada una con las ${f.fichas} fichas dibujadas juntas. NO son piezas: hay que recortarlas.`
            : `1 lámina con las ${f.fichas} fichas dibujadas juntas. NO es una pieza: hay que recortarla.`,
        pasos: [
          laminas > 1
            ? `Imprime las ${laminas} láminas completas, tal cual, sin recortarlas en el computador.`
            : `Imprime la lámina completa, tal cual, sin recortarla en el computador.`,
          `Recorta las ${f.fichas} fichas de cada lámina siguiendo la separación entre ellas (${laminas > 1 ? `${laminas} × ${f.fichas} en total` : `${f.fichas} en total`}).`,
          ...pegarImán,
        ],
      };
    }
    case "tira-continua": {
      const tiras = f.tiras ?? 1;
      const porTira = tiras > 1 ? Math.round(f.segmentos / tiras) : f.segmentos;
      return {
        frase:
          tiras > 1
            ? `${f.segmentos} archivos que son SEGMENTOS de ${tiras} tiras (${porTira} por tira). No son ${f.segmentos} piezas ni una sola tira.`
            : `${f.segmentos} archivos que son SEGMENTOS de UNA sola tira. No son ${f.segmentos} piezas.`,
        pasos: [
          `Imprime los ${f.segmentos} segmentos.`,
          tiras > 1
            ? `Únelos a tope, en orden, ${porTira} por tira: forman ${tiras} tiras completas. Sin separación entre segmentos.`
            : `Únelos a tope, en orden, para formar la tira completa. Sin separación entre ellos.`,
          ...pegarImán,
        ],
      };
    }
    case "tira-desplegada":
      return {
        frase: `${f.tiras} tira(s) DESPLEGADA(S): cada archivo trae las dos caras lado a lado.`,
        pasos: [
          "Imprime cada tira completa.",
          "Dobla por el centro, dejando las dos caras hacia afuera.",
          ...pegarImán,
        ],
      };
    case "caras-sueltas":
      return {
        frase: `⚠️ Caras SUELTAS: ${f.unidades} unidad(es), cada una con su cara A y su cara B en archivos separados.`,
        pasos: [
          "Imprime todas las caras.",
          "Pega cada par espalda con espalda (cara A contra cara B de la misma unidad).",
          ...pegarImán,
        ],
      };
    case "piezas-sueltas": {
      if (f.unidades && f.unidades.count > 1) {
        const u = f.unidades;
        return {
          frase: `${f.piezas} archivos que forman ${u.count} ${u.plural} de ${u.piezasPorUnidad} piezas cada uno. No son ${f.piezas} piezas sueltas.`,
          pasos: [
            `Imprime los ${f.piezas} archivos.`,
            `Agrúpalos en ${u.count} ${u.plural}: cada uno lleva sus ${u.piezasPorUnidad} piezas en orden.`,
            ...pegarImán,
          ],
        };
      }
      return {
        frase: `${f.piezas} pieza(s), una por archivo.`,
        pasos: [
          `Imprime las ${f.piezas} piezas.`,
          "Recorta cada una por su contorno.",
          ...pegarImán,
        ],
      };
    }
  }
}

/** Todo lo que hay que saber para fabricar una línea, calculado en un solo sitio. */
export function resolveProductionSpec(e: Entrada): ProductionSpec {
  const attrs = e.variantAttrs ?? {};
  const specs = e.physicalSpecs ?? {};

  // Multiplicador de pack: "Set Notas Magnéticas ×2" son 8 imanes, no 2. 101 variantes lo traen y
  // hasta hoy no lo leía nadie.
  const piezasPorPack = n(attrs.quantity) ?? 1;
  // Multi-unidad (2026-09-09): el DISEÑO puede contener N unidades cuando la variante
  // cubre UNA (tiras, calendarios, sets de letras ×N). Mismo multiplicador que el
  // precio en el carrito (design-units.ts) — imprenta debe fabricar TODAS las
  // unidades de la línea. Packs (polaroid/separadores) → 1: la variante ya es el pack.
  const designUnits =
    designUnitPriceMultiplier(e.canvasData, n(e.productSchema?.facesPerUnit) ?? 1) *
    letterSetUnitCount(e.designMetadata);
  const unidadesFisicas = e.lineQty * piezasPorPack * designUnits;

  // `magnet: false` existe en 33 variantes (los sets de letras y el nombre se venden en las dos
  // versiones). Por defecto SÍ lleva: es lo que vende la tienda.
  const llevaImán = attrs.magnet !== false;

  const formato = resolverFormato(e);
  const { frase, pasos } = describirFormato(formato, llevaImán);

  const especificaciones: DatoDeFicha[] = [];
  // La medida sale de la VARIANTE. `physicalSpecs` describe el EMPAQUE y engaña: el abecedario dice
  // 7×10 cm ahí mientras cada ficha mide 5×7.
  const medida = s(attrs.sizeCm) ?? s(e.productSchema?.sizeCm);
  if (medida) especificaciones.push({ etiqueta: "Medida de corte", valor: `${medida} cm` });
  if (piezasPorPack > 1) {
    especificaciones.push({ etiqueta: "Piezas por pack", valor: String(piezasPorPack) });
  }
  const radio = n(e.productSchema?.cornerRadiusPx);
  if (radio && radio > 0) {
    especificaciones.push({ etiqueta: "Esquinas", valor: "Redondeadas (troquel)" });
  }
  const material = s(specs.material);
  if (material) {
    especificaciones.push({ etiqueta: "Material", valor: MATERIALES[material] ?? material });
  }
  const grosor = n(specs.thicknessMm);
  if (grosor) especificaciones.push({ etiqueta: "Grosor", valor: `${grosor} mm` });
  especificaciones.push({
    etiqueta: "Imán",
    valor: llevaImán
      ? (IMANES[String(specs.magnetType)] ?? "Sí lleva imán")
      : "SIN imán (esta variante no lo lleva)",
  });
  const empaque = s(specs.packaging);
  if (empaque) {
    especificaciones.push({ etiqueta: "Empaque", valor: EMPAQUES[empaque] ?? empaque });
  }
  const incluye = specs.includes;
  if (Array.isArray(incluye) && incluye.length > 0) {
    especificaciones.push({ etiqueta: "Va dentro", valor: incluye.filter(s).join(" · ") });
  }

  const personalizacion: DatoDeFicha[] = [];
  // Multi-unidad (2026-09-09) — el diseño contiene N unidades y TODAS se fabrican
  // (tiras ×2, calendarios ×2, sets ×2). La ficha lo dice explícito: del PNG solo
  // no se deduce que son varias piezas independientes.
  if (designUnits > 1) {
    personalizacion.push({
      etiqueta: "Unidades del diseño",
      valor: `${designUnits} unidades distintas — fabricar TODAS (ver «Qué es cada archivo»)`,
    });
  }
  // El color del marco lo eligió el CLIENTE en el Estudio; la variante trae un `frameStyle` que solo
  // es el valor inicial. Imprimir el de la variante da un color equivocado en el control de calidad.
  const border = s(e.canvasData?.borderColor);
  if (border) {
    const c = frameColorById(border) ?? { label: border, hex: border };
    personalizacion.push({ etiqueta: "Color del marco", valor: c.label, color: c.hex });
  } else if (e.canvasData && "borderColor" in e.canvasData) {
    personalizacion.push({
      etiqueta: "Marco",
      valor: "Sin marco — la foto va a sangre, corta a ras",
    });
  }
  // El año vive en el DISEÑO. El del producto puede ser otro.
  const anio = n(e.designMetadata?.calendarYear);
  if (anio) personalizacion.push({ etiqueta: "Año del calendario", valor: String(anio) });

  const letters = e.designMetadata?.letters;
  if (Array.isArray(letters) && letters.length > 0) {
    personalizacion.push({ etiqueta: "Texto", valor: letters.join(" ") });
  }
  const colors = e.designMetadata?.colors;
  if (Array.isArray(colors) && colors.length > 0 && Array.isArray(letters)) {
    // Un abecedario lleva 27 colores: verificarlos a ojo es imposible sin la lista.
    personalizacion.push({
      etiqueta: "Color por ficha",
      valor: letters
        .map((l, i) => `${String(l)}=${String(colors[i] ?? colors[0] ?? "?")}`)
        .join("  "),
    });
  }
  const estilo = s(e.designMetadata?.styleSetId);
  if (estilo) personalizacion.push({ etiqueta: "Estilo ilustrado", valor: estilo });

  // Lucy 2026-09-05 — opción de diseño "Sin borde" de los sets de letras; Lucy 2026-09-09 —
  // la misma opción en las tiras de nombre. El PNG la refleja, pero la ficha debe decirla
  // explícita: sin borde la lámina se recorta por el contorno de cada ficha, no por el marco
  // de color. Default retrocompatible: metadata sin la clave = con borde (lo histórico), así
  // que solo se anota el caso distinto.
  if (
    (e.designMetadata?.surface === "letterset" || e.designMetadata?.surface === "name") &&
    e.designMetadata.withBorder === false
  ) {
    personalizacion.push({ etiqueta: "Borde", valor: "Sin borde — recortar a ras del contorno" });
  }

  // Textos que escribió el cliente: hay que cotejarlos con lo impreso (tildes incluidas).
  const slots = e.canvasData?.slots;
  if (Array.isArray(slots)) {
    const textos = slots
      .map((sl, i) => {
        const t = sl && typeof sl === "object" ? (sl as Record<string, unknown>) : {};
        const v = s(t.textOverride);
        return v ? `${i + 1}: "${v}"` : null;
      })
      .filter((x): x is string => !!x);
    if (textos.length > 0) {
      personalizacion.push({ etiqueta: "Textos del cliente", valor: textos.join("  ·  ") });
    }
  }

  return {
    unidadesFisicas,
    copias: e.lineQty,
    formatoFisico: formato,
    queEsCadaArchivo: frase,
    pasosArmado: pasos,
    especificaciones,
    personalizacion,
  };
}
