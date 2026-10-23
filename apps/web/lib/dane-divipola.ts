/*
 * DANE Divipola — División Político Administrativa de Colombia.
 *
 * Catálogo curado de los 32 departamentos + las ciudades/municipios
 * que cubren ~95% del volumen e-commerce típico (capitales + ciudades
 * principales + suburbios de áreas metropolitanas).
 *
 * Fuente: códigos DANE Divipola 2024 (https://geoportal.dane.gov.co).
 * Ver `docs/data/dane-divipola-source.md` para procedencia y notas.
 *
 * Códigos postales (zip): dataset oficial "Códigos Postales Nacionales" del
 * MinTIC en datos.gov.co (id ixig-z8b5), mapeado por código DANE municipal
 * (2026-10-22 — cobertura completa del catálogo). Cuando un municipio tiene
 * varios CP se usa el principal: el menor de tipo "Urbano".
 *
 * Formato esperado por Aveonline (PHP API legacy):
 *   "CIUDAD(DEPARTAMENTO)" en mayúsculas, ej. "BOGOTA D.C.(CUNDINAMARCA)"
 * `cityToAveonlineFormat()` lo construye correctamente.
 *
 * Para ciudades fuera de la lista: el cliente verá un mensaje "Tu ciudad
 * no aparece — contactanos por WhatsApp" en lugar de un input libre.
 *
 * Cuando se agregue una ciudad nueva: append acá + commit. No requiere
 * migración ni admin UI por ahora (catálogo cambia ~1 vez/año).
 */

export type DaneDepartment = {
  code: string; // 2 dígitos, ej. "11" Bogotá / "05" Antioquia
  name: string; // "Cundinamarca", "Antioquia", "Bogotá D.C." (capitalizado)
  zipPrefix: string; // 2-3 dígitos para autocompletado de CP
};

export type DaneCity = {
  code: string; // 5 dígitos completo, ej. "11001" Bogotá
  deptCode: string; // primeros 2 dígitos
  name: string; // "Medellín", "Bogotá D.C.", capitalizado normal
  // Código postal del municipio (cuando es único). Si una ciudad tiene
  // varios códigos (Bogotá tiene 110xxx por localidad), usamos el principal.
  zip?: string;
};

export const DEPARTMENTS: DaneDepartment[] = [
  { code: "05", name: "Antioquia", zipPrefix: "05" },
  { code: "08", name: "Atlántico", zipPrefix: "08" },
  { code: "11", name: "Bogotá D.C.", zipPrefix: "11" },
  { code: "13", name: "Bolívar", zipPrefix: "13" },
  { code: "15", name: "Boyacá", zipPrefix: "15" },
  { code: "17", name: "Caldas", zipPrefix: "17" },
  { code: "18", name: "Caquetá", zipPrefix: "18" },
  { code: "19", name: "Cauca", zipPrefix: "19" },
  { code: "20", name: "Cesar", zipPrefix: "20" },
  { code: "23", name: "Córdoba", zipPrefix: "23" },
  { code: "25", name: "Cundinamarca", zipPrefix: "25" },
  { code: "27", name: "Chocó", zipPrefix: "27" },
  { code: "41", name: "Huila", zipPrefix: "41" },
  { code: "44", name: "La Guajira", zipPrefix: "44" },
  { code: "47", name: "Magdalena", zipPrefix: "47" },
  { code: "50", name: "Meta", zipPrefix: "50" },
  { code: "52", name: "Nariño", zipPrefix: "52" },
  { code: "54", name: "Norte de Santander", zipPrefix: "54" },
  { code: "63", name: "Quindío", zipPrefix: "63" },
  { code: "66", name: "Risaralda", zipPrefix: "66" },
  { code: "68", name: "Santander", zipPrefix: "68" },
  { code: "70", name: "Sucre", zipPrefix: "70" },
  { code: "73", name: "Tolima", zipPrefix: "73" },
  { code: "76", name: "Valle del Cauca", zipPrefix: "76" },
  { code: "81", name: "Arauca", zipPrefix: "81" },
  { code: "85", name: "Casanare", zipPrefix: "85" },
  { code: "86", name: "Putumayo", zipPrefix: "86" },
  { code: "88", name: "San Andrés y Providencia", zipPrefix: "88" },
  { code: "91", name: "Amazonas", zipPrefix: "91" },
  { code: "94", name: "Guainía", zipPrefix: "94" },
  { code: "95", name: "Guaviare", zipPrefix: "95" },
  { code: "97", name: "Vaupés", zipPrefix: "97" },
  { code: "99", name: "Vichada", zipPrefix: "99" },
];

// Top ~180 ciudades — capitales + áreas metropolitanas + ciudades secundarias
// que concentran ~95% del volumen e-commerce nacional. Ordenadas alfa
// dentro de cada departamento para que el dropdown sea predecible.
export const CITIES: DaneCity[] = [
  // Bogotá D.C. (depto 11)
  { code: "11001", deptCode: "11", name: "Bogotá D.C.", zip: "110111" },

  // Antioquia (05)
  { code: "05001", deptCode: "05", name: "Medellín", zip: "050001" },
  { code: "05002", deptCode: "05", name: "Abejorral", zip: "055030" },
  { code: "05021", deptCode: "05", name: "Alejandría", zip: "053820" },
  { code: "05030", deptCode: "05", name: "Amagá", zip: "055840" },
  { code: "05045", deptCode: "05", name: "Apartadó", zip: "057840" },
  { code: "05079", deptCode: "05", name: "Barbosa", zip: "051030" },
  { code: "05088", deptCode: "05", name: "Bello", zip: "051050" },
  { code: "05129", deptCode: "05", name: "Caldas", zip: "055410" },
  { code: "05154", deptCode: "05", name: "Caucasia", zip: "052410" },
  { code: "05172", deptCode: "05", name: "Chigorodó", zip: "057410" },
  { code: "05212", deptCode: "05", name: "Copacabana", zip: "051050" },
  { code: "05266", deptCode: "05", name: "Envigado", zip: "055420" },
  { code: "05308", deptCode: "05", name: "Girardota", zip: "051030" },
  { code: "05360", deptCode: "05", name: "Itagüí", zip: "055410" },
  { code: "05380", deptCode: "05", name: "La Estrella", zip: "055460" },
  { code: "05440", deptCode: "05", name: "Marinilla", zip: "054020" },
  { code: "05615", deptCode: "05", name: "Rionegro", zip: "054040" },
  { code: "05631", deptCode: "05", name: "Sabaneta", zip: "055450" },
  { code: "05656", deptCode: "05", name: "Santuario", zip: "051070" },
  { code: "05837", deptCode: "05", name: "Turbo", zip: "057860" },

  // Atlántico (08)
  { code: "08001", deptCode: "08", name: "Barranquilla", zip: "080001" },
  { code: "08137", deptCode: "08", name: "Galapa", zip: "084040" },
  { code: "08296", deptCode: "08", name: "Malambo", zip: "082001" },
  { code: "08433", deptCode: "08", name: "Puerto Colombia", zip: "083020" },
  { code: "08758", deptCode: "08", name: "Soledad", zip: "083002" },

  // Bolívar (13)
  { code: "13001", deptCode: "13", name: "Cartagena", zip: "130001" },
  { code: "13433", deptCode: "13", name: "Magangué", zip: "131040" },
  { code: "13836", deptCode: "13", name: "Turbaco", zip: "131001" },

  // Boyacá (15)
  { code: "15001", deptCode: "15", name: "Tunja", zip: "150001" },
  { code: "15238", deptCode: "15", name: "Duitama", zip: "150461" },
  { code: "15759", deptCode: "15", name: "Sogamoso", zip: "152210" },
  { code: "15176", deptCode: "15", name: "Chiquinquirá", zip: "154640" },
  { code: "15407", deptCode: "15", name: "Villa de Leyva", zip: "154001" },
  { code: "15469", deptCode: "15", name: "Moniquirá", zip: "154260" },
  { code: "15224", deptCode: "15", name: "Cubará", zip: "154060" },

  // Caldas (17)
  { code: "17001", deptCode: "17", name: "Manizales", zip: "170001" },
  { code: "17013", deptCode: "17", name: "La Dorada", zip: "172020" },
  { code: "17541", deptCode: "17", name: "Pensilvania", zip: "173060" },
  { code: "17616", deptCode: "17", name: "Riosucio", zip: "177060" },
  { code: "17873", deptCode: "17", name: "Villamaría", zip: "176001" },

  // Caquetá (18)
  { code: "18001", deptCode: "18", name: "Florencia", zip: "180001" },
  { code: "18753", deptCode: "18", name: "San Vicente del Caguán", zip: "182010" },

  // Cauca (19)
  { code: "19001", deptCode: "19", name: "Popayán", zip: "190001" },
  { code: "19318", deptCode: "19", name: "Guapi", zip: "196001" },
  { code: "19392", deptCode: "19", name: "La Vega", zip: "194001" },
  { code: "19473", deptCode: "19", name: "Morales", zip: "190550" },
  { code: "19548", deptCode: "19", name: "Piendamó", zip: "190530" },
  { code: "19698", deptCode: "19", name: "Santander de Quilichao", zip: "191030" },

  // Cesar (20)
  { code: "20001", deptCode: "20", name: "Valledupar", zip: "200001" },
  { code: "20011", deptCode: "20", name: "Aguachica", zip: "205010" },
  { code: "20060", deptCode: "20", name: "Bosconia", zip: "201020" },
  { code: "20443", deptCode: "20", name: "Manaure", zip: "202001" },

  // Córdoba (23)
  { code: "23001", deptCode: "23", name: "Montería", zip: "230001" },
  { code: "23068", deptCode: "23", name: "Ayapel", zip: "233530" },
  { code: "23162", deptCode: "23", name: "Cereté", zip: "230550" },
  { code: "23417", deptCode: "23", name: "Lorica", zip: "231020" },
  { code: "23555", deptCode: "23", name: "Planeta Rica", zip: "233040" },
  { code: "23660", deptCode: "23", name: "Sahagún", zip: "232540" },
  { code: "23807", deptCode: "23", name: "Tierralta", zip: "234501" },

  // Cundinamarca (25) — Sabana metropolitana de Bogotá
  { code: "25175", deptCode: "25", name: "Chía", zip: "250001" },
  { code: "25126", deptCode: "25", name: "Cajicá", zip: "250240" },
  { code: "25214", deptCode: "25", name: "Cota", zip: "250010" },
  { code: "25269", deptCode: "25", name: "Facatativá", zip: "253001" },
  { code: "25286", deptCode: "25", name: "Funza", zip: "253031" },
  { code: "25307", deptCode: "25", name: "Girardot", zip: "252431" },
  { code: "25377", deptCode: "25", name: "La Calera", zip: "251201" },
  { code: "25430", deptCode: "25", name: "Madrid", zip: "253041" },
  { code: "25473", deptCode: "25", name: "Mosquera", zip: "250040" },
  { code: "25754", deptCode: "25", name: "Soacha", zip: "250051" },
  { code: "25758", deptCode: "25", name: "Sopó", zip: "250291" },
  { code: "25817", deptCode: "25", name: "Tocancipá", zip: "251017" },
  { code: "25899", deptCode: "25", name: "Zipaquirá", zip: "250251" },
  { code: "25154", deptCode: "25", name: "Cogua", zip: "250420" },
  { code: "25148", deptCode: "25", name: "Cáqueza", zip: "253460" },
  { code: "25245", deptCode: "25", name: "El Rosal", zip: "252630" },
  { code: "25295", deptCode: "25", name: "Gachancipá", zip: "251020" },
  { code: "25320", deptCode: "25", name: "Guaduas", zip: "253440" },
  { code: "25438", deptCode: "25", name: "Medina", zip: "251420" },
  { code: "25785", deptCode: "25", name: "Tabio", zip: "250230" },
  { code: "25799", deptCode: "25", name: "Tenjo", zip: "250201" },
  { code: "25862", deptCode: "25", name: "Villeta", zip: "253650" },

  // Chocó (27)
  { code: "27001", deptCode: "27", name: "Quibdó", zip: "270001" },
  { code: "27361", deptCode: "27", name: "Istmina", zip: "274010" },

  // Huila (41)
  { code: "41001", deptCode: "41", name: "Neiva", zip: "410001" },
  { code: "41132", deptCode: "41", name: "Campoalegre", zip: "413020" },
  { code: "41396", deptCode: "41", name: "La Plata", zip: "415060" },
  { code: "41524", deptCode: "41", name: "Palermo", zip: "412001" },
  { code: "41615", deptCode: "41", name: "Rivera", zip: "413001" },
  { code: "41770", deptCode: "41", name: "Suaza", zip: "416080" },
  { code: "41799", deptCode: "41", name: "Tello", zip: "411040" },

  // La Guajira (44)
  { code: "44001", deptCode: "44", name: "Riohacha", zip: "440001" },
  { code: "44430", deptCode: "44", name: "Maicao", zip: "442001" },
  { code: "44855", deptCode: "44", name: "Uribia", zip: "445020" },

  // Magdalena (47)
  { code: "47001", deptCode: "47", name: "Santa Marta", zip: "470001" },
  { code: "47189", deptCode: "47", name: "Ciénaga", zip: "478001" },
  { code: "47245", deptCode: "47", name: "El Banco", zip: "473040" },
  { code: "47551", deptCode: "47", name: "Plato", zip: "477050" },
  { code: "47707", deptCode: "47", name: "Santa Ana", zip: "474020" },

  // Meta (50)
  { code: "50001", deptCode: "50", name: "Villavicencio", zip: "500001" },
  { code: "50006", deptCode: "50", name: "Acacías", zip: "507001" },
  { code: "50313", deptCode: "50", name: "Granada", zip: "504001" },
  { code: "50573", deptCode: "50", name: "Puerto López", zip: "502001" },

  // Nariño (52)
  { code: "52001", deptCode: "52", name: "Pasto", zip: "520001" },
  { code: "52083", deptCode: "52", name: "Buesaco", zip: "521080" },
  { code: "52240", deptCode: "52", name: "Chachagüí", zip: "522001" },
  { code: "52356", deptCode: "52", name: "Ipiales", zip: "524060" },
  { code: "52480", deptCode: "52", name: "Nariño", zip: "522020" },
  { code: "52835", deptCode: "52", name: "Tumaco", zip: "528501" },

  // Norte de Santander (54)
  { code: "54001", deptCode: "54", name: "Cúcuta", zip: "540001" },
  { code: "54223", deptCode: "54", name: "Chinácota", zip: "544520" },
  { code: "54405", deptCode: "54", name: "Los Patios", zip: "541010" },
  { code: "54498", deptCode: "54", name: "Ocaña", zip: "546551" },
  { code: "54518", deptCode: "54", name: "Pamplona", zip: "543050" },
  { code: "54820", deptCode: "54", name: "Toledo", zip: "542030" },
  { code: "54874", deptCode: "54", name: "Villa del Rosario", zip: "541030" },

  // Quindío (63)
  { code: "63001", deptCode: "63", name: "Armenia", zip: "630001" },
  { code: "63190", deptCode: "63", name: "Circasia", zip: "631001" },
  { code: "63272", deptCode: "63", name: "Filandia", zip: "634001" },
  { code: "63401", deptCode: "63", name: "La Tebaida", zip: "633020" },
  { code: "63548", deptCode: "63", name: "Pijao", zip: "632060" },
  { code: "63594", deptCode: "63", name: "Quimbaya", zip: "634020" },
  { code: "63690", deptCode: "63", name: "Salento", zip: "631020" },

  // Risaralda (66)
  { code: "66001", deptCode: "66", name: "Pereira", zip: "660001" },
  { code: "66170", deptCode: "66", name: "Dosquebradas", zip: "661001" },
  { code: "66318", deptCode: "66", name: "La Virginia", zip: "664010" },
  { code: "66682", deptCode: "66", name: "Santa Rosa de Cabal", zip: "661020" },

  // Santander (68)
  { code: "68001", deptCode: "68", name: "Bucaramanga", zip: "680001" },
  { code: "68077", deptCode: "68", name: "Barrancabermeja", zip: "684511" },
  { code: "68276", deptCode: "68", name: "Floridablanca", zip: "681001" },
  { code: "68307", deptCode: "68", name: "Girón", zip: "681011" },
  { code: "68547", deptCode: "68", name: "Piedecuesta", zip: "681021" },
  { code: "68679", deptCode: "68", name: "San Gil", zip: "684031" },
  { code: "68861", deptCode: "68", name: "Vélez", zip: "685561" },

  // Sucre (70)
  { code: "70001", deptCode: "70", name: "Sincelejo", zip: "700001" },
  { code: "70215", deptCode: "70", name: "Corozal", zip: "705030" },
  { code: "70678", deptCode: "70", name: "San Marcos", zip: "703010" },

  // Tolima (73)
  { code: "73001", deptCode: "73", name: "Ibagué", zip: "730001" },
  { code: "73411", deptCode: "73", name: "Lérida", zip: "731040" },
  { code: "73443", deptCode: "73", name: "Mariquita", zip: "732020" },
  { code: "73483", deptCode: "73", name: "Natagaima", zip: "735001" },
  { code: "73504", deptCode: "73", name: "Ortega", zip: "735501" },
  { code: "73671", deptCode: "73", name: "Saldaña", zip: "733570" },
  { code: "73861", deptCode: "73", name: "Venadillo", zip: "730580" },

  // Valle del Cauca (76)
  { code: "76001", deptCode: "76", name: "Cali", zip: "760001" },
  { code: "76109", deptCode: "76", name: "Buenaventura", zip: "764501" },
  { code: "76111", deptCode: "76", name: "Buga", zip: "763041" },
  { code: "76130", deptCode: "76", name: "Cartago", zip: "763570" },
  { code: "76233", deptCode: "76", name: "Dagua", zip: "760520" },
  { code: "76364", deptCode: "76", name: "Jamundí", zip: "763561" },
  { code: "76520", deptCode: "76", name: "Palmira", zip: "763531" },
  { code: "76834", deptCode: "76", name: "Tuluá", zip: "763021" },
  { code: "76845", deptCode: "76", name: "Yumbo", zip: "760801" },
  { code: "76563", deptCode: "76", name: "Pradera", zip: "763550" },
  { code: "76892", deptCode: "76", name: "Yotoco", zip: "760501" },

  // Arauca (81)
  { code: "81001", deptCode: "81", name: "Arauca", zip: "810001" },
  { code: "81591", deptCode: "81", name: "Saravena", zip: "813010" },
  { code: "81736", deptCode: "81", name: "Tame", zip: "815010" },

  // Casanare (85)
  { code: "85001", deptCode: "85", name: "Yopal", zip: "850001" },
  { code: "85162", deptCode: "85", name: "Aguazul", zip: "855010" },
  { code: "85410", deptCode: "85", name: "Tauramena", zip: "854030" },

  // Putumayo (86)
  { code: "86001", deptCode: "86", name: "Mocoa", zip: "860001" },
  { code: "86571", deptCode: "86", name: "Puerto Asís", zip: "863001" },
  { code: "86749", deptCode: "86", name: "Sibundoy", zip: "861020" },

  // San Andrés y Providencia (88)
  { code: "88001", deptCode: "88", name: "San Andrés", zip: "880001" },
  { code: "88564", deptCode: "88", name: "Providencia", zip: "880020" },

  // Amazonas (91)
  { code: "91001", deptCode: "91", name: "Leticia", zip: "910001" },

  // Guainía (94)
  { code: "94001", deptCode: "94", name: "Inírida", zip: "940001" },

  // Guaviare (95)
  { code: "95001", deptCode: "95", name: "San José del Guaviare", zip: "950001" },

  // Vaupés (97)
  { code: "97001", deptCode: "97", name: "Mitú", zip: "970001" },

  // Vichada (99)
  { code: "99001", deptCode: "99", name: "Puerto Carreño", zip: "990001" },
];

// Index para lookups O(1).
const DEPT_BY_CODE = new Map(DEPARTMENTS.map((d) => [d.code, d]));
const DEPT_BY_NAME = new Map(DEPARTMENTS.map((d) => [normalize(d.name), d]));
const CITIES_BY_DEPT = new Map<string, DaneCity[]>();
for (const c of CITIES) {
  const arr = CITIES_BY_DEPT.get(c.deptCode) ?? [];
  arr.push(c);
  CITIES_BY_DEPT.set(c.deptCode, arr);
}
// Ordenar cada lista alfabéticamente
for (const arr of CITIES_BY_DEPT.values()) {
  arr.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

const CITY_BY_CODE = new Map(CITIES.map((c) => [c.code, c]));
const CITY_BY_DEPT_NAME = new Map<string, DaneCity>();
for (const c of CITIES) {
  const dept = DEPT_BY_CODE.get(c.deptCode);
  if (dept) CITY_BY_DEPT_NAME.set(`${normalize(c.name)}|${dept.code}`, c);
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// ─── API pública ───

export function getDepartments(): DaneDepartment[] {
  return DEPARTMENTS;
}

export function getDepartmentByCode(code: string): DaneDepartment | null {
  return DEPT_BY_CODE.get(code) ?? null;
}

export function getDepartmentByName(name: string): DaneDepartment | null {
  return DEPT_BY_NAME.get(normalize(name)) ?? null;
}

export function getCitiesByDeptCode(deptCode: string): DaneCity[] {
  return CITIES_BY_DEPT.get(deptCode) ?? [];
}

export function getCityByCode(code: string): DaneCity | null {
  return CITY_BY_CODE.get(code) ?? null;
}

export function getCityByDeptAndName(deptCode: string, cityName: string): DaneCity | null {
  return CITY_BY_DEPT_NAME.get(`${normalize(cityName)}|${deptCode}`) ?? null;
}

/**
 * Convierte ciudad + depto al formato que Aveonline espera en sus APIs:
 *   "CIUDAD(DEPARTAMENTO)" en mayúsculas.
 * Ej. cityToAveonlineFormat("Bogotá D.C.", "Cundinamarca")
 *     → "BOGOTA D.C.(CUNDINAMARCA)"
 */
export function cityToAveonlineFormat(cityName: string, deptName: string): string {
  return `${cityName.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}(${deptName
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")})`;
}

export function isCityValid(deptCode: string, cityName: string): boolean {
  return getCityByDeptAndName(deptCode, cityName) !== null;
}
