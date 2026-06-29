import { describe, expect, it } from "vitest";
import {
  type DocumentType,
  DOCUMENT_TYPE_LABELS,
  calculateNitDV,
  capitalizeName,
  formatPhone,
  getDocumentHelp,
  stripPhone,
  validateDocument,
  validateName,
  validatePhone,
  validateZip,
} from "./colombia-validators";

// Validadores Colombia: cédula, NIT (+ dígito de verificación DIAN),
// celular, nombre, código postal. Suite verifica el comportamiento REAL,
// no el ideal — incluye dos comportamientos latentes documentados abajo.

describe("DOCUMENT_TYPE_LABELS", () => {
  it("expone los cinco tipos con etiqueta humana en español", () => {
    expect(DOCUMENT_TYPE_LABELS).toEqual({
      CC: "Cédula de ciudadanía",
      CE: "Cédula de extranjería",
      NIT: "NIT (empresa)",
      PP: "Pasaporte",
      TI: "Tarjeta de identidad",
    });
  });
});

describe("getDocumentHelp", () => {
  it("devuelve texto de ayuda para cada tipo conocido", () => {
    const types: DocumentType[] = ["CC", "CE", "NIT", "PP", "TI"];
    for (const t of types) {
      expect(getDocumentHelp(t)).toMatch(/\S/);
    }
  });

  it("CC menciona '6 a 10 dígitos'", () => {
    expect(getDocumentHelp("CC")).toContain("6 a 10 dígitos");
  });

  it("NIT menciona dígito de verificación", () => {
    expect(getDocumentHelp("NIT")).toContain("dígito verificación");
  });
});

describe("validateDocument — CC (cédula de ciudadanía)", () => {
  it("acepta 6 dígitos (mínimo)", () => {
    expect(validateDocument("CC", "123456")).toBe(true);
  });

  it("acepta 10 dígitos (máximo)", () => {
    expect(validateDocument("CC", "1234567890")).toBe(true);
  });

  it("rechaza 5 dígitos (por debajo del mínimo)", () => {
    expect(validateDocument("CC", "12345")).toBe(false);
  });

  it("rechaza 11 dígitos (por encima del máximo)", () => {
    expect(validateDocument("CC", "12345678901")).toBe(false);
  });

  it("recorta espacios alrededor antes de validar", () => {
    expect(validateDocument("CC", " 123456 ")).toBe(true);
  });

  it("rechaza valor con letras", () => {
    expect(validateDocument("CC", "12345a")).toBe(false);
  });

  it("rechaza puntos de miles (debe ir limpio)", () => {
    expect(validateDocument("CC", "1.234.567")).toBe(false);
  });

  it("rechaza string vacío", () => {
    expect(validateDocument("CC", "")).toBe(false);
  });

  it("rechaza solo espacios", () => {
    expect(validateDocument("CC", "   ")).toBe(false);
  });
});

describe("validateDocument — CE (cédula de extranjería)", () => {
  it("acepta 6 dígitos", () => {
    expect(validateDocument("CE", "123456")).toBe(true);
  });

  it("acepta 7 dígitos (máximo)", () => {
    expect(validateDocument("CE", "1234567")).toBe(true);
  });

  it("rechaza 8 dígitos", () => {
    expect(validateDocument("CE", "12345678")).toBe(false);
  });

  it("rechaza 5 dígitos", () => {
    expect(validateDocument("CE", "12345")).toBe(false);
  });
});

describe("validateDocument — NIT", () => {
  it("acepta 9 dígitos sin DV", () => {
    expect(validateDocument("NIT", "900123456")).toBe(true);
  });

  it("acepta 9 dígitos + guión + DV", () => {
    expect(validateDocument("NIT", "900123456-7")).toBe(true);
  });

  it("acepta 10 dígitos sin guión (DV pegado)", () => {
    // El regex /^\d{9}-?\d?$/ trata el guión como opcional.
    expect(validateDocument("NIT", "9001234567")).toBe(true);
  });

  it("acepta 9 dígitos con guión final pero sin DV", () => {
    // Comportamiento real: el DV es opcional incluso tras el guión.
    expect(validateDocument("NIT", "900123456-")).toBe(true);
  });

  it("rechaza 8 dígitos (corto)", () => {
    expect(validateDocument("NIT", "12345678")).toBe(false);
  });

  it("rechaza 11 dígitos", () => {
    expect(validateDocument("NIT", "12345678901")).toBe(false);
  });

  it("rechaza letras en el NIT", () => {
    expect(validateDocument("NIT", "90012345A")).toBe(false);
  });
});

describe("validateDocument — PP (pasaporte)", () => {
  it("acepta alfanumérico de 6 (mínimo)", () => {
    expect(validateDocument("PP", "AB1234")).toBe(true);
  });

  it("acepta alfanumérico de 12 (máximo)", () => {
    expect(validateDocument("PP", "AB1234567890")).toBe(true);
  });

  it("acepta minúsculas (regex case-insensitive)", () => {
    expect(validateDocument("PP", "ab123456")).toBe(true);
  });

  it("rechaza 5 caracteres (corto)", () => {
    expect(validateDocument("PP", "AB123")).toBe(false);
  });

  it("rechaza 13 caracteres (largo)", () => {
    expect(validateDocument("PP", "AB12345678901")).toBe(false);
  });

  it("rechaza símbolos no alfanuméricos", () => {
    expect(validateDocument("PP", "AB-1234")).toBe(false);
  });
});

describe("validateDocument — TI (tarjeta de identidad)", () => {
  it("acepta 8 dígitos (mínimo)", () => {
    expect(validateDocument("TI", "12345678")).toBe(true);
  });

  it("acepta 11 dígitos (máximo)", () => {
    expect(validateDocument("TI", "12345678901")).toBe(true);
  });

  it("rechaza 7 dígitos (corto)", () => {
    expect(validateDocument("TI", "1234567")).toBe(false);
  });

  it("rechaza 12 dígitos (largo)", () => {
    expect(validateDocument("TI", "123456789012")).toBe(false);
  });
});

describe("validateDocument — seguridad / robustez", () => {
  it("no se deja engañar por inyección de saltos de línea (regex anclado ^$)", () => {
    // \d{6,10} con anclas ^$ no debe matchear líneas múltiples.
    expect(validateDocument("CC", "123456\n999999999999")).toBe(false);
  });

  it("rechaza payload alfanumérico largo en CC", () => {
    expect(validateDocument("CC", "<script>123</script>")).toBe(false);
  });
});

describe("calculateNitDV — algoritmo módulo 11 DIAN", () => {
  it("calcula DV correcto de un NIT real (830122566 → 1, Google Colombia)", () => {
    expect(calculateNitDV("830122566")).toBe("1");
  });

  it("calcula DV de 890903407 → 9", () => {
    expect(calculateNitDV("890903407")).toBe("9");
  });

  it("calcula DV de 800197268 → 4", () => {
    expect(calculateNitDV("800197268")).toBe("4");
  });

  it("calcula DV de 900123456 → 8", () => {
    expect(calculateNitDV("900123456")).toBe("8");
  });

  it("devuelve un único dígito de '0' a '9'", () => {
    const dv = calculateNitDV("900373115");
    expect(dv).toMatch(/^\d$/);
    expect(dv).toBe("3");
  });

  it("ignora puntos de miles al calcular (900.123.456 = 900123456)", () => {
    expect(calculateNitDV("900.123.456")).toBe("8");
  });

  it("devuelve '' si hay menos de 9 dígitos", () => {
    expect(calculateNitDV("12345678")).toBe("");
  });

  it("devuelve '' para string vacío", () => {
    expect(calculateNitDV("")).toBe("");
  });

  it("limpia caracteres no numéricos antes de medir longitud", () => {
    // "9001234" + basura no-dígito = solo 7 dígitos → ''
    expect(calculateNitDV("9001234-abc")).toBe("");
  });

  // ── Comportamiento LATENTE documentado (ver bugsFound) ──
  it("CAVEAT: con un NIT ya con DV (9001234567, 10 dígitos) recalcula sobre 10 dígitos, NO el DV real", () => {
    // calculateNitDV no separa el DV existente: toma TODOS los dígitos.
    // Pasarle un NIT ya verificado produce un DV incorrecto ('0', no '8').
    expect(calculateNitDV("9001234567")).toBe("0");
  });

  it("CAVEAT: '900123456-7' (con DV pegado tras strip) calcula sobre los mismos 10 dígitos → '0'", () => {
    // El guión se elimina y el DV '7' se cuenta como dígito más → resultado != '8'.
    // Mismo input efectivo que '9001234567'.
    expect(calculateNitDV("900123456-7")).toBe("0");
  });

  it("un input de 10 dígitos distinto (1234567890) produce '2'", () => {
    // Confirma que el algoritmo sí depende de los 10 dígitos, no es constante.
    expect(calculateNitDV("1234567890")).toBe("2");
  });
});

describe("validatePhone — celular colombiano", () => {
  it("acepta celular válido de 10 dígitos que empieza en 3", () => {
    expect(validatePhone("3208873826")).toBe(true);
  });

  it("acepta celular con espacios de formato (los limpia)", () => {
    expect(validatePhone("320 887 3826")).toBe(true);
  });

  it("acepta celular con guiones de formato", () => {
    expect(validatePhone("320-887-3826")).toBe(true);
  });

  it("rechaza fijo que empieza en 6 (Bogotá)", () => {
    expect(validatePhone("6011234567")).toBe(false);
  });

  it("rechaza 9 dígitos (corto)", () => {
    expect(validatePhone("320887382")).toBe(false);
  });

  it("rechaza 11 dígitos (largo)", () => {
    expect(validatePhone("32088738261")).toBe(false);
  });

  it("rechaza string vacío", () => {
    expect(validatePhone("")).toBe(false);
  });

  it("rechaza solo letras", () => {
    expect(validatePhone("abcdefghij")).toBe(false);
  });

  // ── Indicativo país +57: se tolera (Lucy 2026-06-29) ──
  it("tolera el indicativo internacional +57 (lo normaliza a 10 dígitos)", () => {
    expect(validatePhone("+57 320 887 3826")).toBe(true);
    expect(validatePhone("573208873826")).toBe(true);
  });
  it("sigue rechazando 12 dígitos que NO empiezan en 57", () => {
    expect(validatePhone("103208873826")).toBe(false);
  });
});

describe("formatPhone — auto-formato visual cada 3 dígitos", () => {
  it("formatea 10 dígitos como '320 887 3826'", () => {
    expect(formatPhone("3208873826")).toBe("320 887 3826");
  });

  it("deja 1-3 dígitos sin espacios", () => {
    expect(formatPhone("32")).toBe("32");
    expect(formatPhone("320")).toBe("320");
  });

  it("inserta un espacio con 4-6 dígitos", () => {
    expect(formatPhone("32088")).toBe("320 88");
    expect(formatPhone("320887")).toBe("320 887");
  });

  it("inserta dos espacios con 7-10 dígitos", () => {
    expect(formatPhone("3208873")).toBe("320 887 3");
  });

  it("trunca a 10 dígitos cuando hay más", () => {
    expect(formatPhone("320887382699")).toBe("320 887 3826");
  });

  it("ignora letras intercaladas y mantiene solo dígitos", () => {
    expect(formatPhone("abc320def887ghi3826")).toBe("320 887 3826");
  });

  it("devuelve '' para entrada vacía", () => {
    expect(formatPhone("")).toBe("");
  });

  it("devuelve '' cuando no hay ningún dígito", () => {
    expect(formatPhone("---")).toBe("");
  });
});

describe("stripPhone — normaliza a dígitos crudos", () => {
  it("quita espacios de formato", () => {
    expect(stripPhone("320 887 3826")).toBe("3208873826");
  });

  it("quita guiones y paréntesis", () => {
    expect(stripPhone("(320) 887-3826")).toBe("3208873826");
  });

  it("trunca a 10 dígitos", () => {
    expect(stripPhone("32088738269999")).toBe("3208873826");
  });

  it("devuelve '' para entrada sin dígitos", () => {
    expect(stripPhone("abc")).toBe("");
  });

  // ── Indicativo país +57: se normaliza (Lucy 2026-06-29) ──
  it("normaliza el indicativo +57 a los 10 dígitos locales", () => {
    // '+57 320 887 3826' → '573208873826' (12, empieza en 57) → '3208873826'.
    expect(stripPhone("+57 320 887 3826")).toBe("3208873826");
    expect(stripPhone("573208873826")).toBe("3208873826");
  });
});

describe("validateName", () => {
  it("acepta nombre simple", () => {
    expect(validateName("Lucy")).toBe(true);
  });

  it("acepta nombre con espacios", () => {
    expect(validateName("Lucy Hurtado")).toBe(true);
  });

  it("acepta acentos españoles y ñ", () => {
    expect(validateName("José Ñandú")).toBe(true);
  });

  it("acepta apóstrofo (D'Angelo)", () => {
    expect(validateName("D'Angelo")).toBe(true);
  });

  it("acepta guión (Garcia-Lopez)", () => {
    expect(validateName("Garcia-Lopez")).toBe(true);
  });

  it("acepta punto (Dr. House)", () => {
    expect(validateName("Dr. House")).toBe(true);
  });

  it("rechaza un solo carácter (mínimo 2)", () => {
    expect(validateName("A")).toBe(false);
  });

  it("rechaza nombre con dígitos", () => {
    expect(validateName("O123")).toBe(false);
    expect(validateName("Ana2")).toBe(false);
  });

  it("rechaza string vacío", () => {
    expect(validateName("")).toBe(false);
  });

  it("rechaza solo espacios", () => {
    expect(validateName("   ")).toBe(false);
  });

  it("recorta espacios alrededor antes de medir longitud (' Jo ' es válido)", () => {
    expect(validateName("  Jo  ")).toBe(true);
  });

  it("acepta tab como separador (cuenta como \\s)", () => {
    expect(validateName("Ana\tMaria")).toBe(true);
  });

  it("rechaza símbolos no permitidos (@, números, /)", () => {
    expect(validateName("a@b")).toBe(false);
    expect(validateName("Ana/Maria")).toBe(false);
  });
});

describe("capitalizeName — title case con preposiciones cortas", () => {
  it("capitaliza nombre simple", () => {
    expect(capitalizeName("maria")).toBe("Maria");
  });

  it("respeta preposiciones intermedias en minúscula", () => {
    expect(capitalizeName("lucy del pilar hurtado")).toBe("Lucy del Pilar Hurtado");
  });

  it("capitaliza la primera palabra incluso si es preposición", () => {
    expect(capitalizeName("DE LA CRUZ")).toBe("De la Cruz");
  });

  it("mantiene la conjunción 'y' en minúscula en posición intermedia", () => {
    expect(capitalizeName("tom y jerry")).toBe("Tom y Jerry");
  });

  it("colapsa espacios múltiples a uno solo", () => {
    expect(capitalizeName("  juan   pablo  ")).toBe("Juan Pablo");
  });

  it("normaliza MAYÚSCULAS a title case", () => {
    expect(capitalizeName("JUAN PABLO")).toBe("Juan Pablo");
  });

  it("devuelve '' para entrada vacía", () => {
    expect(capitalizeName("")).toBe("");
  });

  it("usa reglas de mayúscula del español (locale 'es')", () => {
    // toLocaleUpperCase('es') sobre la primera letra.
    expect(capitalizeName("ñoño")).toBe("Ñoño");
  });
});

describe("validateZip — código postal colombiano (6 dígitos)", () => {
  it("acepta exactamente 6 dígitos", () => {
    expect(validateZip("110111")).toBe(true);
  });

  it("recorta espacios alrededor", () => {
    expect(validateZip(" 110111 ")).toBe(true);
  });

  it("rechaza 5 dígitos", () => {
    expect(validateZip("11011")).toBe(false);
  });

  it("rechaza 7 dígitos", () => {
    expect(validateZip("1101110")).toBe(false);
  });

  it("rechaza letras", () => {
    expect(validateZip("11011a")).toBe(false);
  });

  it("rechaza string vacío", () => {
    expect(validateZip("")).toBe(false);
  });
});
