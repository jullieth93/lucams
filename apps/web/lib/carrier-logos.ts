/*
 * Logo por transportadora (checkout step 2 + /admin/envios).
 *
 * Los slugs Aveonline los genera el provider como
 * `nombreTransportadora.toLowerCase().replace(/\s+/g, "-")`
 * (features/shipping/aveonline.ts): "SERVIENTREGA" → "servientrega",
 * "COORDINADORA MERCANTIL" → "coordinadora-mercantil", "TCC SA" → "tcc-sa".
 * El envío propio usa el slug fijo "lucams" (LUCAMS_CARRIER).
 *
 * Marcas de terceros: los logos se usan SOLO para identificar el servicio
 * que el cliente está eligiendo (uso nominativo — no implica respaldo ni
 * afiliación). Servientrega, Coordinadora, Interrapidísimo, Envía y TCC son
 * los logos oficiales descargados de los sitios públicos de cada empresa;
 * Deprisa, 99minutos y Go Envíos llevan un monograma propio v1 (iniciales
 * sobre su color de marca). Para reemplazar un monograma por el logo oficial
 * basta soltar el archivo en `public/carriers/` con el nombre del slug y
 * actualizar `src`/`width`/`height` acá — sin tocar los componentes.
 *
 * Client-safe: data plana, sin imports de servidor.
 */

export type CarrierLogo = {
  src: string;
  alt: string;
  /** Dimensiones intrínsecas del asset — definen el aspect-ratio al
   *  renderizar con altura fija y ancho automático (sin distorsión). */
  width: number;
  height: number;
};

const CARRIER_LOGOS: Record<string, CarrierLogo> = {
  lucams: {
    src: "/brand/lucams-mascot.png",
    alt: "Logo de Lucam's",
    width: 370,
    height: 355,
  },
  servientrega: {
    src: "/carriers/servientrega.svg",
    alt: "Logo de Servientrega",
    width: 219,
    height: 37,
  },
  "coordinadora-mercantil": {
    src: "/carriers/coordinadora-mercantil.svg",
    alt: "Logo de Coordinadora Mercantil",
    width: 244,
    height: 80,
  },
  // Alias: la guía generada puede volver con el nombre corto (createShipment).
  coordinadora: {
    src: "/carriers/coordinadora-mercantil.svg",
    alt: "Logo de Coordinadora Mercantil",
    width: 244,
    height: 80,
  },
  interrapidisimo: {
    src: "/carriers/interrapidisimo.svg",
    alt: "Logo de Interrapidísimo",
    width: 48,
    height: 48,
  },
  envia: {
    src: "/carriers/envia.png",
    alt: "Logo de Envía",
    width: 425,
    height: 86,
  },
  "tcc-sa": {
    src: "/carriers/tcc-sa.svg",
    alt: "Logo de TCC",
    width: 170,
    height: 99,
  },
  // Alias: la guía generada puede volver como "tcc" (createShipment).
  tcc: {
    src: "/carriers/tcc-sa.svg",
    alt: "Logo de TCC",
    width: 170,
    height: 99,
  },
  deprisa: {
    src: "/carriers/deprisa.svg",
    alt: "Logo de Deprisa",
    width: 48,
    height: 48,
  },
  "99minutos": {
    src: "/carriers/99minutos.svg",
    alt: "Logo de 99minutos",
    width: 48,
    height: 48,
  },
  "go-envios": {
    src: "/carriers/go-envios.svg",
    alt: "Logo de Go Envíos",
    width: 48,
    height: 48,
  },
};

/**
 * Logo de una transportadora a partir de su slug ("tcc-sa") o de su nombre
 * crudo de Aveonline ("TCC SA", "Envía", "COORDINADORA MERCANTIL S.A.S.") —
 * se normaliza igual que el provider (lowercase, espacios→guiones) más tildes,
 * puntuación y sufijos societarios (S.A.S./S.A./Ltda) al final del nombre.
 * Null si no hay logo: el caller muestra el ícono genérico de camión como
 * fallback con formatCarrierName().
 */
export function carrierLogo(carrierOrName: string | null | undefined): CarrierLogo | null {
  if (!carrierOrName) return null;
  return CARRIER_LOGOS[normalizeCarrierKey(carrierOrName)] ?? null;
}

// Sufijos societarios que Aveonline a veces adjunta al nombre comercial
// ("TCC S.A.S.", "Coordinadora Mercantil SA") — no hacen parte de la marca.
const CORPORATE_SUFFIX_TOKENS = new Set(["sa", "sas", "ltda"]);

function normalizeCarrierKey(carrierOrName: string): string {
  const cleaned = carrierOrName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Sin puntos ni comas: "S.A.S." y "SAS" terminan en el mismo token.
    .replace(/[.,]/g, "")
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && CORPORATE_SUFFIX_TOKENS.has(tokens[tokens.length - 1]!)) {
    tokens.pop();
  }
  return tokens.join("-");
}

// Conectores que quedan en minúscula al formatear title case (salvo al inicio).
const LOWERCASE_NAME_TOKENS = new Set(["de", "del", "la", "las", "los", "y", "e"]);

/**
 * Nombre de presentación para transportadoras SIN logo en el mapa: el crudo de
 * Aveonline llega en MAYÚSCULAS ("COORDINADORA MERCANTIL") y se ve agresivo en
 * la lista — se reformatea a title case. Solo se tocan los tokens
 * completamente en mayúsculas de 4+ letras (siglas cortas como "TCC" y tokens
 * ya en mixed case se respetan tal cual).
 */
export function formatCarrierName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((token, index) => {
      if (index > 0 && LOWERCASE_NAME_TOKENS.has(token.toLowerCase())) return token.toLowerCase();
      if (token.length <= 3 || !/\p{Lu}/u.test(token) || /\p{Ll}/u.test(token)) return token;
      return token.charAt(0) + token.slice(1).toLowerCase();
    })
    .join(" ");
}
