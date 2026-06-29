import { describe, expect, it } from "vitest";
import {
  calculatePasswordStrength,
  type PasswordScore,
  type PasswordStrength,
} from "./password-strength";

/**
 * Tests para el heurístico custom de fuerza de contraseña.
 *
 * Reglas declaradas en el módulo (0-4):
 *   0 muy débil:  < 8 chars
 *   1 débil:      ≥ 8 chars sin variedad
 *   2 razonable:  ≥ 8 chars + 2 clases
 *   3 fuerte:     ≥ 10 chars + 3 clases, O ≥ 14 chars + 2 clases
 *   4 muy fuerte: ≥ 12 chars + 4 clases, O ≥ 16 chars + 3 clases
 * Penalizaciones (cada una -1, acumulables): repetición larga, secuencia común, término común.
 * Score acotado a [0,4].
 *
 * Los valores esperados se verificaron ejecutando la lógica real del módulo
 * (no son suposiciones — se trazó char por char).
 */

const LABELS: Record<PasswordScore, string> = {
  0: "Muy débil",
  1: "Débil",
  2: "Razonable",
  3: "Fuerte",
  4: "Muy fuerte",
};

const COLORS: Record<PasswordScore, string> = {
  0: "bg-error",
  1: "bg-warning",
  2: "bg-brand-yellow",
  3: "bg-brand-turquoise",
  4: "bg-success",
};

/** Helper: assert score y la coherencia label/color asociada. */
function expectScore(result: PasswordStrength, score: PasswordScore) {
  expect(result.score).toBe(score);
  expect(result.label).toBe(LABELS[score]);
  expect(result.color).toBe(COLORS[score]);
}

describe("calculatePasswordStrength — estructura del resultado", () => {
  it("siempre devuelve las 4 propiedades (score, label, color, suggestion)", () => {
    const r = calculatePasswordStrength("ZqWpLrVtNk!1");
    expect(r).toHaveProperty("score");
    expect(r).toHaveProperty("label");
    expect(r).toHaveProperty("color");
    expect(r).toHaveProperty("suggestion");
  });

  it("el score siempre está en el rango [0,4]", () => {
    const samples = ["", "a", "abc123", "Password123!", "ZqWpLrVtNkXyJb!1aaaa"];
    for (const s of samples) {
      const score = calculatePasswordStrength(s).score;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });

  it("label y color son coherentes con el score en todos los niveles", () => {
    // Una contraseña representativa por cada score alcanzable directamente.
    const byScore: Array<[string, PasswordScore]> = [
      ["short", 0],
      ["lmnopqrs", 1],
      ["Ab1!wxyz", 2],
      ["Abxywxyz12", 3],
      ["ZqWpLrVtNk!1", 4],
    ];
    for (const [pwd, score] of byScore) {
      expectScore(calculatePasswordStrength(pwd), score);
    }
  });
});

describe("calculatePasswordStrength — entrada vacía", () => {
  it("'' devuelve score 0 con suggestion vacía (caso especial)", () => {
    const r = calculatePasswordStrength("");
    expectScore(r, 0);
    expect(r.suggestion).toBe("");
  });

  it("una contraseña corta NO vacía devuelve la suggestion del nivel 0 (no vacía)", () => {
    const r = calculatePasswordStrength("abc");
    expectScore(r, 0);
    expect(r.suggestion).toBe("Muy corta — usa al menos 8 caracteres.");
  });
});

describe("calculatePasswordStrength — nivel 0 (muy débil, < 8 chars)", () => {
  it("clasifica 1 carácter como score 0", () => {
    expectScore(calculatePasswordStrength("x"), 0);
  });

  it("clasifica 7 chars como score 0 aunque tenga variedad (no llega al mínimo)", () => {
    // "Ab1!xyz" = 7 chars, 4 clases, pero length < 8 manda → raw 0.
    expectScore(calculatePasswordStrength("Ab1!xyz"), 0);
  });

  it("clasifica exactamente 7 dígitos como score 0", () => {
    expectScore(calculatePasswordStrength("1234567"), 0);
  });
});

describe("calculatePasswordStrength — nivel 1 (débil, ≥ 8 sin variedad)", () => {
  it("8 letras minúsculas sin secuencia ni repetición → score 1", () => {
    // "lmnopqrs": no contiene abc/123/etc, sin repeticiones.
    expectScore(calculatePasswordStrength("lmnopqrs"), 1);
  });

  it("solo dígitos largos sin secuencia → score 1", () => {
    // "8350629174" 10 dígitos, 1 clase → raw 1, sin penalización.
    expectScore(calculatePasswordStrength("8350629174"), 1);
  });
});

describe("calculatePasswordStrength — nivel 2 (razonable, ≥ 8 + 2 clases)", () => {
  it("8 chars con 4 clases → score 2 (longitud limita el tope)", () => {
    // "Ab1!wxyz": 8 chars, 4 clases. Necesita ≥10 para subir a 3.
    expectScore(calculatePasswordStrength("Ab1!wxyz"), 2);
  });

  it("8 chars con 2 clases (letras + dígitos) → score 2", () => {
    // "klmpxy12": 8 chars, minúsculas + dígitos, sin secuencias.
    expectScore(calculatePasswordStrength("klmpxy12"), 2);
  });

  it("12 chars con solo 2 clases → score 2 (no alcanza el umbral ≥14 para 3)", () => {
    // "MyZqWpLrVtNk": 12 chars, mayús+minús (2 clases). 13<14 → raw 2.
    expectScore(calculatePasswordStrength("MyZqWpLrVtNk"), 2);
  });
});

describe("calculatePasswordStrength — nivel 3 (fuerte)", () => {
  it("≥10 chars + 3 clases → score 3", () => {
    // "Abxywxyz12": 10 chars, mayús+minús+dígito (3 clases), sin penalización.
    expectScore(calculatePasswordStrength("Abxywxyz12"), 3);
  });

  it("≥14 chars + 2 clases → score 3 (rama de longitud)", () => {
    // "Abxywxywvutsr": 13 chars NO basta; usamos 14 mayús+minús.
    // "Mxbywxywvutsrk" = 14 chars, mayús+minús (2 clases).
    expectScore(calculatePasswordStrength("Mxbywxywvutsrk"), 3);
  });

  it("14 chars + 3 clases también cae en 3 (no en 4: faltan 16 o 4 clases con 12)", () => {
    // "MyZqWpLrVtNk12": 14 chars, 3 clases → raw 3.
    expectScore(calculatePasswordStrength("MyZqWpLrVtNk12"), 3);
  });
});

describe("calculatePasswordStrength — nivel 4 (muy fuerte)", () => {
  it("≥16 chars + 3 clases → score 4", () => {
    // "MyZqWpLrVtNkXy12": 16 chars, mayús+minús+dígito (3 clases).
    expectScore(calculatePasswordStrength("MyZqWpLrVtNkXy12"), 4);
  });

  it("≥12 chars + 4 clases → score 4", () => {
    // "ZqWpLrVtNk!1": 12 chars, mayús+minús+símbolo+dígito (4 clases), limpio.
    expectScore(calculatePasswordStrength("ZqWpLrVtNk!1"), 4);
  });

  it("16 chars + 4 clases limpios → score 4 con suggestion 'Inquebrantable'", () => {
    const r = calculatePasswordStrength("ZqWpLrVtNkXyJb!1");
    expectScore(r, 4);
    expect(r.suggestion).toBe("Inquebrantable. Bien hecho.");
  });
});

describe("calculatePasswordStrength — penalización por repetición larga", () => {
  it("4 caracteres iguales seguidos bajan 1 nivel", () => {
    // "ZqWpLrVtNk!1aaaa": sería 4 (16ch/4clases) pero 'aaaa' → 3.
    expectScore(calculatePasswordStrength("ZqWpLrVtNk!1aaaa"), 3);
  });

  it("8 espacios: 1 clase (símbolo) daría 1, pero la repetición lo baja a 0", () => {
    // /(.)\1{3,}/ matchea espacios repetidos.
    expectScore(calculatePasswordStrength("        "), 0);
  });

  it("3 caracteres iguales NO penalizan (umbral es 4 consecutivos)", () => {
    // "aaa" dentro de algo válido: "Wxyzaaa12bk" — 'aaa' son 3, no matchea \1{3,}.
    // 11 chars, 3 clases → raw 3, sin penalización por repetición.
    expectScore(calculatePasswordStrength("Wxyzaaa12bk"), 3);
  });
});

describe("calculatePasswordStrength — penalización por secuencia común", () => {
  it("contener '123' baja 1 nivel", () => {
    // "Abcd1234Wxyz!@#$" sería 4, pero contiene 'abc','123','234' → -1 (clamp).
    expectScore(calculatePasswordStrength("Abcd1234Wxyz!@#$"), 3);
  });

  it("contener 'qwerty' (case-insensitive) penaliza", () => {
    // "qwerty123456": 12 chars, 2 clases → raw 2; 'qwerty' y '123' → cae a 1.
    expectScore(calculatePasswordStrength("qwerty123456"), 1);
  });

  it("'QWERTY' en mayúsculas también penaliza (case-insensitive)", () => {
    // "QWERTYxywk!2": 12 chars, 4 clases → raw 4; 'qwerty' → 3.
    expectScore(calculatePasswordStrength("QWERTYxywk!2"), 3);
  });

  it("la secuencia 'abc' al inicio de letras hace que un password 'natural' baje", () => {
    // "abcdefgh": 8 letras → raw 1, pero 'abc' → 0.
    expectScore(calculatePasswordStrength("abcdefgh"), 0);
  });
});

describe("calculatePasswordStrength — penalización por término común", () => {
  it("'password' baja el nivel (case-insensitive)", () => {
    // "Password123!": 12 chars, 4 clases → raw 4; '123' (-1) + 'password' (-1) → 2.
    expectScore(calculatePasswordStrength("Password123!"), 2);
  });

  it("'lucams' (marca) penaliza", () => {
    // "Lucams2026Shop!": 15 chars, 4 clases → raw 4; 'lucams' → 3 (sin secuencia).
    expectScore(calculatePasswordStrength("Lucams2026Shop!"), 3);
  });

  it("'admin' penaliza (control limpio sin término sube a 4)", () => {
    // "AdminXywpk!28z": 14 chars, 4 clases → raw 4 (≥12 + 4 clases); 'admin' → 3.
    expectScore(calculatePasswordStrength("AdminXywpk!28z"), 3);
    // Control sin término común con la misma forma → 4. Demuestra que el -1 es por 'admin'.
    expectScore(calculatePasswordStrength("Mxbyqwkrvt!28z"), 4);
  });

  it("'contraseña' (con ñ) penaliza", () => {
    // "Contraseña12!": contiene 'contraseña'. 13 chars, 4 clases → raw 4; -1 → 3.
    expectScore(calculatePasswordStrength("Contraseña12!"), 3);
  });

  it("'contrasena' (sin ñ) también penaliza", () => {
    // "Contrasena12!": 13 chars, 4 clases → raw 4; 'contrasena' → 3.
    expectScore(calculatePasswordStrength("Contrasena12!"), 3);
  });
});

describe("calculatePasswordStrength — penalizaciones acumulables y clamp", () => {
  it("varias penalizaciones se acumulan pero nunca bajan de 0", () => {
    // "password123" : 'password' + '123' (+ '234'? no). raw: 11 chars, 2 clases → 2.
    // penalizaciones: 'password'(-1), '123'(-1) → 0. clamp en 0.
    expectScore(calculatePasswordStrength("password123"), 0);
  });

  it("un caso saturado de problemas se clampa a 0 (no negativo)", () => {
    // "admin12345" : 'admin'(-1), '123'(-1),'234'(-1),'345'(-1). raw 10ch/2clases→2.
    // 2 - 4 = -2 → clamp 0.
    const r = calculatePasswordStrength("admin12345");
    expectScore(r, 0);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

describe("calculatePasswordStrength — bordes de longitud exactos", () => {
  it("exactamente 8 chars cruza de 0 a 1 (umbral inferior)", () => {
    expectScore(calculatePasswordStrength("lmnopqrs"), 1); // 8 chars → ≥1
    expectScore(calculatePasswordStrength("lmnopqr"), 0); // 7 chars → 0
  });

  it("exactamente 10 chars con 3 clases alcanza 3 (umbral de la rama)", () => {
    expectScore(calculatePasswordStrength("Abxywxyz12"), 3); // 10 chars
    expectScore(calculatePasswordStrength("Abxywxy12"), 2); // 9 chars → solo 2
  });

  it("exactamente 12 chars con 4 clases alcanza 4 (umbral de la rama)", () => {
    expectScore(calculatePasswordStrength("ZqWpLrVtNk!1"), 4); // 12 chars
    expectScore(calculatePasswordStrength("ZqWpLrVtN!1"), 3); // 11 chars → 3
  });

  it("exactamente 16 chars con 3 clases alcanza 4 (umbral de la rama)", () => {
    expectScore(calculatePasswordStrength("MyZqWpLrVtNkXy12"), 4); // 16 chars
    expectScore(calculatePasswordStrength("MyZqWpLrVtNkX12"), 3); // 15 chars/3 clases → 3
  });
});

describe("calculatePasswordStrength — conteo de clases (variedad)", () => {
  it("símbolos no ASCII / unicode cuentan como clase 'símbolo'", () => {
    // "Wxypqklm😀!": el emoji y '!' son no-alfanuméricos.
    // 11 chars (emoji = 2 UTF-16 units), mayús+minús+símbolo (3 clases) → raw 3.
    expectScore(calculatePasswordStrength("Wxypqklm😀!"), 3);
  });

  it("acentos cuentan como símbolo (no [a-z] ni [A-Z])", () => {
    // "wxypqké123": 'é' es no-ASCII → clase símbolo. minús+símbolo+dígito = 3 clases.
    // 10 chars, 3 clases → raw 3. ('123' penaliza → 2)
    expectScore(calculatePasswordStrength("wxypqké123"), 2);
  });
});

describe("calculatePasswordStrength — el tipo PasswordScore es un literal válido", () => {
  it("score siempre es uno de los 5 valores enumerados", () => {
    const allowed: PasswordScore[] = [0, 1, 2, 3, 4];
    const samples = [
      "",
      "x",
      "lmnopqrs",
      "Ab1!wxyz",
      "Abxywxyz12",
      "ZqWpLrVtNk!1",
      "Password123!",
    ];
    for (const s of samples) {
      expect(allowed).toContain(calculatePasswordStrength(s).score);
    }
  });
});
