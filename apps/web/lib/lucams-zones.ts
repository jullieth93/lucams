/*
 * Zonas de entrega del envío propio "Envío Lucam's" — catálogo POR CIUDAD
 * (multi-ciudad modular: hoy solo Bogotá; agregar una ciudad = añadir una
 * entrada a LUCAMS_ZONE_CITIES, sin tocar código).
 *
 * Cada ciudad soportada declara: cityCode DANE (divipola, lib/dane-divipola.ts),
 * nombre visible, la ETIQUETA del tipo de zona ("Localidad" en Bogotá,
 * "Comuna" en Medellín) y sus zonas. El `id` de zona es un slug kebab-case
 * estable: viaja en Address.structured.localityId, en Order.shippingAddress
 * (campos localityId/localityName — nombre histórico; representan la "zona"
 * genérica de entrega) y en la setting LUCAMS_SHIPPING_ZONES.
 *
 * Client-safe (data plana, sin server-only): lo importa el form de checkout
 * (select de zona), la UI admin y los services server-side.
 */

export type LucamsZone = {
  id: string;
  name: string;
};

export type LucamsZoneCity = {
  /** cityCode DANE (5 dígitos), ej. "11001" Bogotá. */
  cityCode: string;
  /** Nombre visible de la ciudad. */
  cityName: string;
  /** Etiqueta del tipo de zona para UI ("Localidad", "Comuna"). */
  zoneLabel: string;
  zones: LucamsZone[];
};

export const LUCAMS_ZONE_CITIES: LucamsZoneCity[] = [
  {
    cityCode: "11001",
    cityName: "Bogotá D.C.",
    zoneLabel: "Localidad",
    // Las 20 localidades oficiales de Bogotá (19 urbanas + Sumapáz rural).
    zones: [
      { id: "usaquen", name: "Usaquén" },
      { id: "chapinero", name: "Chapinero" },
      { id: "santa-fe", name: "Santa Fe" },
      { id: "san-cristobal", name: "San Cristóbal" },
      { id: "usme", name: "Usme" },
      { id: "tunjuelito", name: "Tunjuelito" },
      { id: "bosa", name: "Bosa" },
      { id: "kennedy", name: "Kennedy" },
      { id: "fontibon", name: "Fontibón" },
      { id: "engativa", name: "Engativá" },
      { id: "suba", name: "Suba" },
      { id: "barrios-unidos", name: "Barrios Unidos" },
      { id: "teusaquillo", name: "Teusaquillo" },
      { id: "los-martires", name: "Los Mártires" },
      { id: "antonio-narino", name: "Antonio Nariño" },
      { id: "puente-aranda", name: "Puente Aranda" },
      { id: "la-candelaria", name: "La Candelaria" },
      { id: "rafael-uribe-uribe", name: "Rafael Uribe Uribe" },
      { id: "ciudad-bolivar", name: "Ciudad Bolívar" },
      { id: "sumapaz", name: "Sumapáz" },
    ],
  },
  // Ejemplo de expansión (Medellín, comunas) — activar cuando el envío propio
  // llegue a Medellín: descomentar y listo (admin/checkout/cotización se
  // adaptan solos; las comunas oficiales son 16 + 5 corregimientos).
  // {
  //   cityCode: "05001",
  //   cityName: "Medellín",
  //   zoneLabel: "Comuna",
  //   zones: [
  //     { id: "popular", name: "Popular (Comuna 1)" },
  //     { id: "santa-cruz", name: "Santa Cruz (Comuna 2)" },
  //     { id: "laureles-estadio", name: "Laureles-Estadio (Comuna 11)" },
  //     { id: "el-poblado", name: "El Poblado (Comuna 14)" },
  //     // … resto de comunas
  //   ],
  // },
];

const BY_CITY_CODE = new Map(LUCAMS_ZONE_CITIES.map((c) => [c.cityCode, c]));

/** Ciudad del catálogo por su cityCode DANE; null si el envío propio no la cubre. */
export function getZoneCityByCode(cityCode: string | null | undefined): LucamsZoneCity | null {
  if (!cityCode) return null;
  return BY_CITY_CODE.get(cityCode) ?? null;
}

/** Zona válida (id + nombre display) dentro de una ciudad del catálogo. */
export function getZone(
  cityCode: string | null | undefined,
  zoneId: string | null | undefined,
): LucamsZone | null {
  const city = getZoneCityByCode(cityCode);
  if (!city || !zoneId) return null;
  return city.zones.find((z) => z.id === zoneId) ?? null;
}

export function isValidZone(
  cityCode: string | null | undefined,
  zoneId: string | null | undefined,
): boolean {
  return getZone(cityCode, zoneId) !== null;
}
