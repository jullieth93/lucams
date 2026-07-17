import { describe, expect, it } from "vitest";
import {
  CITIES,
  DEPARTMENTS,
  cityToAveonlineFormat,
  getCitiesByDeptCode,
  getCityByCode,
  getCityByDeptAndName,
  getDepartmentByCode,
  getDepartmentByName,
  getDepartments,
  isCityValid,
  type DaneCity,
  type DaneDepartment,
} from "./dane-divipola";

// ───────────────────────────────────────────────────────────────────────────
// getDepartments()
// ───────────────────────────────────────────────────────────────────────────

describe("getDepartments", () => {
  it("devuelve la lista completa de departamentos (32 + Bogotá D.C.)", () => {
    const depts = getDepartments();
    // El catálogo incluye los 32 departamentos DANE + Bogotá D.C. como entrada
    // propia (Distrito Capital), por eso son 33 entradas y no 32.
    expect(depts).toHaveLength(33);
  });

  it("devuelve la misma referencia que el array exportado DEPARTMENTS", () => {
    expect(getDepartments()).toBe(DEPARTMENTS);
  });

  it("incluye Bogotá D.C. con código 11", () => {
    const bogota = getDepartments().find((d) => d.code === "11");
    expect(bogota).toEqual<DaneDepartment>({
      code: "11",
      name: "Bogotá D.C.",
      zipPrefix: "11",
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// getDepartmentByCode()
// ───────────────────────────────────────────────────────────────────────────

describe("getDepartmentByCode", () => {
  it("encuentra Antioquia por código '05'", () => {
    expect(getDepartmentByCode("05")).toEqual<DaneDepartment>({
      code: "05",
      name: "Antioquia",
      zipPrefix: "05",
    });
  });

  it("encuentra Valle del Cauca por código '76'", () => {
    expect(getDepartmentByCode("76")?.name).toBe("Valle del Cauca");
  });

  it("devuelve null para un código que no existe", () => {
    expect(getDepartmentByCode("00")).toBeNull();
  });

  it("devuelve null para string vacío", () => {
    expect(getDepartmentByCode("")).toBeNull();
  });

  it("es sensible al formato: '5' (sin cero a la izquierda) NO matchea '05'", () => {
    // Los códigos se almacenan con padding de 2 dígitos; "5" no normaliza a "05".
    expect(getDepartmentByCode("5")).toBeNull();
  });

  it("no matchea códigos con espacios ('05 ')", () => {
    expect(getDepartmentByCode("05 ")).toBeNull();
  });

  it("no matchea propiedades del prototipo (no inyecta '__proto__')", () => {
    expect(getDepartmentByCode("__proto__")).toBeNull();
    expect(getDepartmentByCode("constructor")).toBeNull();
    expect(getDepartmentByCode("toString")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// getDepartmentByName()
// ───────────────────────────────────────────────────────────────────────────

describe("getDepartmentByName", () => {
  it("encuentra 'Antioquia' por nombre exacto", () => {
    expect(getDepartmentByName("Antioquia")?.code).toBe("05");
  });

  it("es case-insensitive ('ANTIOQUIA', 'antioquia')", () => {
    expect(getDepartmentByName("ANTIOQUIA")?.code).toBe("05");
    expect(getDepartmentByName("antioquia")?.code).toBe("05");
  });

  it("ignora acentos ('Bogota D.C.' sin tilde matchea 'Bogotá D.C.')", () => {
    expect(getDepartmentByName("Bogota D.C.")?.code).toBe("11");
    expect(getDepartmentByName("BOGOTÁ D.C.")?.code).toBe("11");
  });

  it("ignora espacios en bordes (trim) — ' Boyacá ' matchea", () => {
    expect(getDepartmentByName("  Boyacá  ")?.code).toBe("15");
  });

  it("normaliza la ñ a n ('Narino' matchea 'Nariño')", () => {
    // normalize() hace NFD + strip de marcas combinantes; ñ se descompone en n + ~.
    expect(getDepartmentByName("Narino")?.code).toBe("52");
    expect(getDepartmentByName("Nariño")?.code).toBe("52");
  });

  it("encuentra 'Norte de Santander' (nombre con espacios internos)", () => {
    expect(getDepartmentByName("norte de santander")?.code).toBe("54");
  });

  it("encuentra 'La Guajira' (artículo incluido)", () => {
    expect(getDepartmentByName("la guajira")?.code).toBe("44");
  });

  it("devuelve null para un nombre inexistente", () => {
    expect(getDepartmentByName("Wakanda")).toBeNull();
  });

  it("devuelve null para string vacío", () => {
    expect(getDepartmentByName("")).toBeNull();
  });

  it("NO matchea nombre parcial ('Santander' no equivale a 'Norte de Santander')", () => {
    expect(getDepartmentByName("Santander")?.code).toBe("68");
    // Es lookup exacto normalizado, no substring.
    expect(getDepartmentByName("Norte")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// getCitiesByDeptCode()
// ───────────────────────────────────────────────────────────────────────────

describe("getCitiesByDeptCode", () => {
  it("devuelve las ciudades de Antioquia (depto 05)", () => {
    const cities = getCitiesByDeptCode("05");
    expect(cities.length).toBeGreaterThan(1);
    expect(cities.every((c) => c.deptCode === "05")).toBe(true);
    expect(cities.some((c) => c.name === "Medellín")).toBe(true);
  });

  it("Bogotá D.C. (depto 11) tiene exactamente una ciudad: Bogotá D.C.", () => {
    const cities = getCitiesByDeptCode("11");
    expect(cities).toHaveLength(1);
    expect(cities[0]?.code).toBe("11001");
    expect(cities[0]?.name).toBe("Bogotá D.C.");
  });

  it("devuelve array vacío para un código de depto inexistente", () => {
    expect(getCitiesByDeptCode("00")).toEqual([]);
  });

  it("devuelve array vacío para string vacío", () => {
    expect(getCitiesByDeptCode("")).toEqual([]);
  });

  it("devuelve las ciudades ordenadas alfabéticamente (locale 'es')", () => {
    const cities = getCitiesByDeptCode("25"); // Cundinamarca, muchas ciudades
    const names = cities.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "es"));
    expect(names).toEqual(sorted);
    // Cajicá va antes que Zipaquirá tras el orden alfabético.
    expect(names[0]).toBe("Cajicá");
  });

  it("no matchea propiedades del prototipo como código de depto", () => {
    expect(getCitiesByDeptCode("__proto__")).toEqual([]);
    expect(getCitiesByDeptCode("toString")).toEqual([]);
  });

  it("todas las ciudades retornadas pertenecen al depto consultado", () => {
    for (const dept of DEPARTMENTS) {
      const cities = getCitiesByDeptCode(dept.code);
      expect(cities.every((c) => c.deptCode === dept.code)).toBe(true);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// getCityByCode()
// ───────────────────────────────────────────────────────────────────────────

describe("getCityByCode", () => {
  it("encuentra Bogotá D.C. por código '11001'", () => {
    expect(getCityByCode("11001")).toEqual<DaneCity>({
      code: "11001",
      deptCode: "11",
      name: "Bogotá D.C.",
      zip: "110111",
    });
  });

  it("encuentra Medellín por código '05001'", () => {
    expect(getCityByCode("05001")?.name).toBe("Medellín");
  });

  it("encuentra una ciudad sin zip definido (Abejorral '05002')", () => {
    const city = getCityByCode("05002");
    expect(city?.name).toBe("Abejorral");
    expect(city?.zip).toBeUndefined();
  });

  it("devuelve null para un código inexistente", () => {
    expect(getCityByCode("99999")).toBeNull();
  });

  it("devuelve null para string vacío", () => {
    expect(getCityByCode("")).toBeNull();
  });

  it("es sensible al padding: '5001' (sin cero líder) NO matchea '05001'", () => {
    expect(getCityByCode("5001")).toBeNull();
  });

  it("no matchea propiedades del prototipo", () => {
    expect(getCityByCode("__proto__")).toBeNull();
    expect(getCityByCode("constructor")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// getCityByDeptAndName()
// ───────────────────────────────────────────────────────────────────────────

describe("getCityByDeptAndName", () => {
  it("encuentra Medellín en Antioquia (deptCode '05')", () => {
    expect(getCityByDeptAndName("05", "Medellín")?.code).toBe("05001");
  });

  it("es case-insensitive ('MEDELLIN' / 'medellín')", () => {
    expect(getCityByDeptAndName("05", "MEDELLIN")?.code).toBe("05001");
    expect(getCityByDeptAndName("05", "medellín")?.code).toBe("05001");
  });

  it("ignora acentos ('Itagui' matchea 'Itagüí')", () => {
    expect(getCityByDeptAndName("05", "Itagui")?.code).toBe("05360");
  });

  it("ignora espacios en bordes (trim)", () => {
    expect(getCityByDeptAndName("05", "  Bello  ")?.code).toBe("05088");
  });

  it("la misma ciudad debe consultarse con su depto correcto", () => {
    // 'Caldas' es a la vez un departamento (17) y un municipio de Antioquia (05).
    // El lookup exige deptCode, así que 'Caldas' solo aparece bajo el depto 05.
    expect(getCityByDeptAndName("05", "Caldas")?.code).toBe("05129");
    // No existe un municipio llamado 'Caldas' en el depto Caldas (17).
    expect(getCityByDeptAndName("17", "Caldas")).toBeNull();
  });

  it("'Nariño' como municipio vive en el depto Nariño (52)", () => {
    expect(getCityByDeptAndName("52", "Nariño")?.code).toBe("52480");
    expect(getCityByDeptAndName("52", "Narino")?.code).toBe("52480");
  });

  it("devuelve null si el nombre de ciudad existe pero en otro depto", () => {
    // Medellín existe (05) pero no en Atlántico (08).
    expect(getCityByDeptAndName("08", "Medellín")).toBeNull();
  });

  it("devuelve null para ciudad inexistente", () => {
    expect(getCityByDeptAndName("05", "Gotham")).toBeNull();
  });

  it("devuelve null para deptCode inexistente aunque la ciudad exista", () => {
    expect(getCityByDeptAndName("00", "Medellín")).toBeNull();
  });

  it("devuelve null para argumentos vacíos", () => {
    expect(getCityByDeptAndName("", "")).toBeNull();
    expect(getCityByDeptAndName("05", "")).toBeNull();
    expect(getCityByDeptAndName("", "Medellín")).toBeNull();
  });

  it("no es vulnerable a inyección via separador '|' del key interno", () => {
    // El key interno es `${normalize(name)}|${deptCode}`. Un atacante podría
    // intentar colar el separador para colisionar keys; debe seguir devolviendo null.
    expect(getCityByDeptAndName("05", "medellin|05")).toBeNull();
    expect(getCityByDeptAndName("medellin|05", "")).toBeNull();
  });

  it("no matchea propiedades del prototipo", () => {
    expect(getCityByDeptAndName("__proto__", "__proto__")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// isCityValid()
// ───────────────────────────────────────────────────────────────────────────

describe("isCityValid", () => {
  it("retorna true para una combinación válida depto/ciudad", () => {
    expect(isCityValid("05", "Medellín")).toBe(true);
    expect(isCityValid("11", "Bogotá D.C.")).toBe(true);
  });

  it("retorna true ignorando acentos y mayúsculas", () => {
    expect(isCityValid("05", "medellin")).toBe(true);
    expect(isCityValid("76", "CALI")).toBe(true);
  });

  it("retorna false si la ciudad no pertenece al depto", () => {
    expect(isCityValid("08", "Medellín")).toBe(false);
  });

  it("retorna false para ciudad inexistente", () => {
    expect(isCityValid("05", "Ciudad Falsa")).toBe(false);
  });

  it("retorna false para entradas vacías", () => {
    expect(isCityValid("", "")).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// cityToAveonlineFormat()
// ───────────────────────────────────────────────────────────────────────────

describe("cityToAveonlineFormat", () => {
  it("construye 'CIUDAD(DEPARTAMENTO)' en mayúsculas sin acentos", () => {
    expect(cityToAveonlineFormat("Bogotá D.C.", "Cundinamarca")).toBe("BOGOTA D.C.(CUNDINAMARCA)");
  });

  it("convierte ciudad y depto acentuados a mayúsculas sin tildes", () => {
    expect(cityToAveonlineFormat("Medellín", "Antioquia")).toBe("MEDELLIN(ANTIOQUIA)");
    expect(cityToAveonlineFormat("Itagüí", "Antioquia")).toBe("ITAGUI(ANTIOQUIA)");
  });

  it("convierte ñ a N (NFD + strip de marcas combinantes)", () => {
    expect(cityToAveonlineFormat("Nariño", "Nariño")).toBe("NARINO(NARINO)");
  });

  it("preserva espacios internos del nombre", () => {
    expect(cityToAveonlineFormat("Villa de Leyva", "Boyacá")).toBe("VILLA DE LEYVA(BOYACA)");
  });

  it("maneja entradas vacías sin lanzar excepción", () => {
    expect(cityToAveonlineFormat("", "")).toBe("()");
  });

  it("el output de una ciudad real del catálogo es round-trippeable a mayúsculas", () => {
    const city = getCityByCode("76001"); // Cali
    const dept = getDepartmentByCode("76"); // Valle del Cauca
    expect(cityToAveonlineFormat(city!.name, dept!.name)).toBe("CALI(VALLE DEL CAUCA)");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Consistencia / integridad del dataset
// ───────────────────────────────────────────────────────────────────────────

describe("integridad del catálogo DIVIPOLA", () => {
  it("todos los códigos de departamento son únicos", () => {
    const codes = DEPARTMENTS.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("todos los códigos de departamento tienen 2 dígitos", () => {
    expect(DEPARTMENTS.every((d) => /^[0-9]{2}$/.test(d.code))).toBe(true);
  });

  it("todos los códigos de ciudad son únicos", () => {
    const codes = CITIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("todos los códigos de ciudad tienen 5 dígitos", () => {
    expect(CITIES.every((c) => /^[0-9]{5}$/.test(c.code))).toBe(true);
  });

  it("el deptCode de cada ciudad coincide con los primeros 2 dígitos del code", () => {
    const mismatched = CITIES.filter((c) => c.code.slice(0, 2) !== c.deptCode);
    expect(mismatched).toEqual([]);
  });

  it("cada ciudad referencia un departamento existente", () => {
    const deptCodes = new Set(DEPARTMENTS.map((d) => d.code));
    const orphans = CITIES.filter((c) => !deptCodes.has(c.deptCode));
    expect(orphans).toEqual([]);
  });

  it("cada departamento tiene al menos una ciudad (capital incluida)", () => {
    const withoutCity = DEPARTMENTS.filter((d) => getCitiesByDeptCode(d.code).length === 0);
    expect(withoutCity).toEqual([]);
  });

  it("todo zip definido tiene formato de 6 dígitos", () => {
    const badZips = CITIES.filter((c) => c.zip && !/^[0-9]{6}$/.test(c.zip));
    expect(badZips).toEqual([]);
  });

  it("toda ciudad del catálogo es resoluble por su par (deptCode, name)", () => {
    // Garantiza que el index CITY_BY_DEPT_NAME cubre el 100% de CITIES y que
    // ninguna entrada quedó inalcanzable por colisión de keys normalizados.
    for (const city of CITIES) {
      const found = getCityByDeptAndName(city.deptCode, city.name);
      expect(found?.code).toBe(city.code);
    }
  });

  it("toda ciudad del catálogo es resoluble por su código", () => {
    for (const city of CITIES) {
      expect(getCityByCode(city.code)).toBe(city);
    }
  });

  it("todo departamento es resoluble por código y por nombre", () => {
    for (const dept of DEPARTMENTS) {
      expect(getDepartmentByCode(dept.code)).toBe(dept);
      expect(getDepartmentByName(dept.name)).toBe(dept);
    }
  });
});
