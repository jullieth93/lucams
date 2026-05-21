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
  { code: "05002", deptCode: "05", name: "Abejorral" },
  { code: "05021", deptCode: "05", name: "Alejandría" },
  { code: "05030", deptCode: "05", name: "Amagá" },
  { code: "05045", deptCode: "05", name: "Apartadó", zip: "057840" },
  { code: "05079", deptCode: "05", name: "Barbosa", zip: "051030" },
  { code: "05088", deptCode: "05", name: "Bello", zip: "051050" },
  { code: "05129", deptCode: "05", name: "Caldas", zip: "055410" },
  { code: "05154", deptCode: "05", name: "Caucasia" },
  { code: "05172", deptCode: "05", name: "Chigorodó" },
  { code: "05212", deptCode: "05", name: "Copacabana", zip: "051050" },
  { code: "05266", deptCode: "05", name: "Envigado", zip: "055420" },
  { code: "05308", deptCode: "05", name: "Girardota" },
  { code: "05360", deptCode: "05", name: "Itagüí", zip: "055410" },
  { code: "05380", deptCode: "05", name: "La Estrella", zip: "055460" },
  { code: "05440", deptCode: "05", name: "Marinilla" },
  { code: "05615", deptCode: "05", name: "Rionegro", zip: "054040" },
  { code: "05631", deptCode: "05", name: "Sabaneta", zip: "055450" },
  { code: "05656", deptCode: "05", name: "Santuario" },
  { code: "05837", deptCode: "05", name: "Turbo" },

  // Atlántico (08)
  { code: "08001", deptCode: "08", name: "Barranquilla", zip: "080001" },
  { code: "08137", deptCode: "08", name: "Galapa" },
  { code: "08296", deptCode: "08", name: "Malambo" },
  { code: "08433", deptCode: "08", name: "Puerto Colombia" },
  { code: "08758", deptCode: "08", name: "Soledad", zip: "083002" },

  // Bolívar (13)
  { code: "13001", deptCode: "13", name: "Cartagena", zip: "130001" },
  { code: "13433", deptCode: "13", name: "Magangué" },
  { code: "13836", deptCode: "13", name: "Turbaco" },

  // Boyacá (15)
  { code: "15001", deptCode: "15", name: "Tunja", zip: "150001" },
  { code: "15238", deptCode: "15", name: "Duitama" },
  { code: "15759", deptCode: "15", name: "Sogamoso" },
  { code: "15176", deptCode: "15", name: "Chiquinquirá" },
  { code: "15407", deptCode: "15", name: "Villa de Leyva" },
  { code: "15469", deptCode: "15", name: "Moniquirá" },
  { code: "15224", deptCode: "15", name: "Cubará" },

  // Caldas (17)
  { code: "17001", deptCode: "17", name: "Manizales", zip: "170001" },
  { code: "17013", deptCode: "17", name: "La Dorada" },
  { code: "17541", deptCode: "17", name: "Pensilvania" },
  { code: "17616", deptCode: "17", name: "Riosucio" },
  { code: "17873", deptCode: "17", name: "Villamaría" },

  // Caquetá (18)
  { code: "18001", deptCode: "18", name: "Florencia", zip: "180001" },
  { code: "18753", deptCode: "18", name: "San Vicente del Caguán" },

  // Cauca (19)
  { code: "19001", deptCode: "19", name: "Popayán", zip: "190001" },
  { code: "19318", deptCode: "19", name: "Guapi" },
  { code: "19392", deptCode: "19", name: "La Vega" },
  { code: "19473", deptCode: "19", name: "Morales" },
  { code: "19548", deptCode: "19", name: "Piendamó" },
  { code: "19698", deptCode: "19", name: "Santander de Quilichao" },

  // Cesar (20)
  { code: "20001", deptCode: "20", name: "Valledupar", zip: "200001" },
  { code: "20011", deptCode: "20", name: "Aguachica" },
  { code: "20060", deptCode: "20", name: "Bosconia" },
  { code: "20443", deptCode: "20", name: "Manaure" },

  // Córdoba (23)
  { code: "23001", deptCode: "23", name: "Montería", zip: "230001" },
  { code: "23068", deptCode: "23", name: "Ayapel" },
  { code: "23162", deptCode: "23", name: "Cereté" },
  { code: "23417", deptCode: "23", name: "Lorica" },
  { code: "23555", deptCode: "23", name: "Planeta Rica" },
  { code: "23660", deptCode: "23", name: "Sahagún" },
  { code: "23807", deptCode: "23", name: "Tierralta" },

  // Cundinamarca (25) — Sabana metropolitana de Bogotá
  { code: "25175", deptCode: "25", name: "Chía", zip: "250001" },
  { code: "25126", deptCode: "25", name: "Cajicá", zip: "250240" },
  { code: "25214", deptCode: "25", name: "Cota" },
  { code: "25269", deptCode: "25", name: "Facatativá", zip: "253001" },
  { code: "25286", deptCode: "25", name: "Funza", zip: "253031" },
  { code: "25307", deptCode: "25", name: "Girardot" },
  { code: "25377", deptCode: "25", name: "La Calera" },
  { code: "25430", deptCode: "25", name: "Madrid", zip: "253041" },
  { code: "25473", deptCode: "25", name: "Mosquera", zip: "250040" },
  { code: "25754", deptCode: "25", name: "Soacha", zip: "250051" },
  { code: "25758", deptCode: "25", name: "Sopó", zip: "250291" },
  { code: "25817", deptCode: "25", name: "Tocancipá", zip: "251017" },
  { code: "25899", deptCode: "25", name: "Zipaquirá", zip: "250251" },
  { code: "25154", deptCode: "25", name: "Cogua" },
  { code: "25148", deptCode: "25", name: "Cáqueza" },
  { code: "25245", deptCode: "25", name: "El Rosal" },
  { code: "25295", deptCode: "25", name: "Gachancipá" },
  { code: "25320", deptCode: "25", name: "Guaduas" },
  { code: "25438", deptCode: "25", name: "Medina" },
  { code: "25785", deptCode: "25", name: "Tabio" },
  { code: "25799", deptCode: "25", name: "Tenjo" },
  { code: "25862", deptCode: "25", name: "Villeta" },

  // Chocó (27)
  { code: "27001", deptCode: "27", name: "Quibdó", zip: "270001" },
  { code: "27361", deptCode: "27", name: "Istmina" },

  // Huila (41)
  { code: "41001", deptCode: "41", name: "Neiva", zip: "410001" },
  { code: "41132", deptCode: "41", name: "Campoalegre" },
  { code: "41396", deptCode: "41", name: "La Plata" },
  { code: "41524", deptCode: "41", name: "Palermo" },
  { code: "41615", deptCode: "41", name: "Rivera" },
  { code: "41770", deptCode: "41", name: "Suaza" },
  { code: "41799", deptCode: "41", name: "Tello" },

  // La Guajira (44)
  { code: "44001", deptCode: "44", name: "Riohacha", zip: "440001" },
  { code: "44430", deptCode: "44", name: "Maicao" },
  { code: "44855", deptCode: "44", name: "Uribia" },

  // Magdalena (47)
  { code: "47001", deptCode: "47", name: "Santa Marta", zip: "470001" },
  { code: "47189", deptCode: "47", name: "Ciénaga" },
  { code: "47245", deptCode: "47", name: "El Banco" },
  { code: "47551", deptCode: "47", name: "Plato" },
  { code: "47707", deptCode: "47", name: "Santa Ana" },

  // Meta (50)
  { code: "50001", deptCode: "50", name: "Villavicencio", zip: "500001" },
  { code: "50006", deptCode: "50", name: "Acacías" },
  { code: "50313", deptCode: "50", name: "Granada" },
  { code: "50573", deptCode: "50", name: "Puerto López" },

  // Nariño (52)
  { code: "52001", deptCode: "52", name: "Pasto", zip: "520001" },
  { code: "52083", deptCode: "52", name: "Buesaco" },
  { code: "52240", deptCode: "52", name: "Chachagüí" },
  { code: "52356", deptCode: "52", name: "Ipiales" },
  { code: "52480", deptCode: "52", name: "Nariño" },
  { code: "52835", deptCode: "52", name: "Tumaco" },

  // Norte de Santander (54)
  { code: "54001", deptCode: "54", name: "Cúcuta", zip: "540001" },
  { code: "54223", deptCode: "54", name: "Chinácota" },
  { code: "54405", deptCode: "54", name: "Los Patios" },
  { code: "54498", deptCode: "54", name: "Ocaña" },
  { code: "54518", deptCode: "54", name: "Pamplona" },
  { code: "54820", deptCode: "54", name: "Toledo" },
  { code: "54874", deptCode: "54", name: "Villa del Rosario" },

  // Quindío (63)
  { code: "63001", deptCode: "63", name: "Armenia", zip: "630001" },
  { code: "63190", deptCode: "63", name: "Circasia" },
  { code: "63272", deptCode: "63", name: "Filandia" },
  { code: "63401", deptCode: "63", name: "La Tebaida" },
  { code: "63548", deptCode: "63", name: "Pijao" },
  { code: "63594", deptCode: "63", name: "Quimbaya" },
  { code: "63690", deptCode: "63", name: "Salento" },

  // Risaralda (66)
  { code: "66001", deptCode: "66", name: "Pereira", zip: "660001" },
  { code: "66170", deptCode: "66", name: "Dosquebradas" },
  { code: "66318", deptCode: "66", name: "La Virginia" },
  { code: "66682", deptCode: "66", name: "Santa Rosa de Cabal" },

  // Santander (68)
  { code: "68001", deptCode: "68", name: "Bucaramanga", zip: "680001" },
  { code: "68077", deptCode: "68", name: "Barrancabermeja" },
  { code: "68276", deptCode: "68", name: "Floridablanca", zip: "681001" },
  { code: "68307", deptCode: "68", name: "Girón", zip: "681011" },
  { code: "68547", deptCode: "68", name: "Piedecuesta", zip: "681021" },
  { code: "68679", deptCode: "68", name: "San Gil" },
  { code: "68861", deptCode: "68", name: "Vélez" },

  // Sucre (70)
  { code: "70001", deptCode: "70", name: "Sincelejo", zip: "700001" },
  { code: "70215", deptCode: "70", name: "Corozal" },
  { code: "70678", deptCode: "70", name: "San Marcos" },

  // Tolima (73)
  { code: "73001", deptCode: "73", name: "Ibagué", zip: "730001" },
  { code: "73411", deptCode: "73", name: "Lérida" },
  { code: "73443", deptCode: "73", name: "Mariquita" },
  { code: "73483", deptCode: "73", name: "Natagaima" },
  { code: "73504", deptCode: "73", name: "Ortega" },
  { code: "73671", deptCode: "73", name: "Saldaña" },
  { code: "73861", deptCode: "73", name: "Venadillo" },

  // Valle del Cauca (76)
  { code: "76001", deptCode: "76", name: "Cali", zip: "760001" },
  { code: "76109", deptCode: "76", name: "Buenaventura" },
  { code: "76111", deptCode: "76", name: "Buga" },
  { code: "76130", deptCode: "76", name: "Cartago" },
  { code: "76233", deptCode: "76", name: "Dagua" },
  { code: "76364", deptCode: "76", name: "Jamundí", zip: "763561" },
  { code: "76520", deptCode: "76", name: "Palmira", zip: "763531" },
  { code: "76834", deptCode: "76", name: "Tuluá" },
  { code: "76845", deptCode: "76", name: "Yumbo", zip: "760801" },
  { code: "76563", deptCode: "76", name: "Pradera" },
  { code: "76892", deptCode: "76", name: "Yotoco" },

  // Arauca (81)
  { code: "81001", deptCode: "81", name: "Arauca", zip: "810001" },
  { code: "81591", deptCode: "81", name: "Saravena" },
  { code: "81736", deptCode: "81", name: "Tame" },

  // Casanare (85)
  { code: "85001", deptCode: "85", name: "Yopal", zip: "850001" },
  { code: "85162", deptCode: "85", name: "Aguazul" },
  { code: "85410", deptCode: "85", name: "Tauramena" },

  // Putumayo (86)
  { code: "86001", deptCode: "86", name: "Mocoa", zip: "860001" },
  { code: "86571", deptCode: "86", name: "Puerto Asís" },
  { code: "86749", deptCode: "86", name: "Sibundoy" },

  // San Andrés y Providencia (88)
  { code: "88001", deptCode: "88", name: "San Andrés", zip: "880001" },
  { code: "88564", deptCode: "88", name: "Providencia" },

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
